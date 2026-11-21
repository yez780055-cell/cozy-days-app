import { expect, test, type Page } from '@playwright/test';

type Outcome = 'installed' | 'rolledBack';
type Fixture = {
  web: number; checks: boolean[]; prereleaseChecks: boolean[]; installs: number[];
  offers: boolean; checkError: boolean; manualError: boolean;
  update(stage: string, received?: number): void;
  fail(message: string): void;
};

async function mockShell(page: Page, options: { offline?: boolean; outcome?: Outcome; current?: boolean } = {}) {
  await page.addInitScript(({ offline, outcome, current }) => {
    if (offline) Object.defineProperty(navigator, 'onLine', { get: () => false });
    let offeredOutcome = outcome;
    let progress: ((value: unknown) => void) | undefined;
    let rejectInstall: ((error: Error) => void) | undefined;
    const bytes = 8 * 1024 * 1024;
    const fixture: Fixture = {
      web: 2, checks: [], prereleaseChecks: [], installs: [], offers: !current, checkError: false, manualError: false,
      update: (stage, received = 0) => progress?.({ stage, received, total: bytes }),
      fail: message => rejectInstall?.(new Error(message)),
    };
    Object.assign(window, {
      fixture, androidBridge: {},
      Capacitor: {
        PluginHeaders: [{ name: 'CozyAndroidShell', methods: [
          ...['getSafeArea', 'ready', 'updateInfo', 'checkOnlineUpdate', 'installOnlineUpdate', 'importUpdate', 'restoreBundled']
            .map(name => ({ name, rtype: 'promise' })),
          { name: 'addListener', rtype: 'callback' },
        ] }],
        async nativeCallback(_: string, method: string, _args: unknown, handler: (value: unknown) => void) {
          progress = method === 'addListener' ? handler : undefined;
          return 'fixture-listener';
        },
        async nativePromise(_: string, method: string, args: { retryFailed: boolean; prerelease: boolean; web: number }) {
          if (method === 'getSafeArea') return { top: 30, right: 0, bottom: 24, left: 0, startupToken: 0, keyboardVisible: false, keyboardViewportHeight: 0 };
          if (method === 'updateInfo') {
            const result = { shell: 4, web: fixture.web, outcome: offeredOutcome };
            offeredOutcome = undefined;
            return result;
          }
          if (method === 'checkOnlineUpdate') {
            fixture.checks.push(args.retryFailed);
            fixture.prereleaseChecks.push(args.prerelease);
            if (fixture.checkError) throw new Error('暂时无法连接更新源。');
            return { configured: true, release: fixture.offers ? { web: 3, bytes } : undefined };
          }
          if (method === 'installOnlineUpdate') {
            fixture.installs.push(args.web);
            return new Promise((_, reject) => { rejectInstall = reject; });
          }
          if (method === 'importUpdate') {
            if (fixture.manualError) throw new Error('更新未安装。');
            fixture.web = 3;
          }
          if (method === 'restoreBundled') fixture.web = 1;
        },
      },
    });
  }, options);
  await page.goto('/');
}

const settings = (page: Page) => page.getByRole('button', { name: '打开应用设置' }).click();
const start = (page: Page) => page.getByRole('button', { name: '立即更新' }).click();
const calls = (page: Page) => page.evaluate(() => (window as unknown as { fixture: Fixture }).fixture.installs);
const stage = (page: Page, name: string, received?: number) => page.evaluate(({ name, received }) =>
  (window as unknown as { fixture: Fixture }).fixture.update(name, received), { name, received });

test('startup checks once, supports later, and checks again in Settings', async ({ page }) => {
  await mockShell(page);
  await expect(page.getByRole('heading', { name: '发现新版本，是否立即更新？' })).toBeVisible();
  await page.getByRole('button', { name: '稍后更新' }).click();
  await settings(page);
  await expect(page.getByText('当前网页版本 2 · 外壳 4')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { fixture: Fixture }).fixture.offers = false; });
  await page.getByRole('button', { name: '检查更新' }).click();
  await expect(page.getByText('当前已是最新版本。')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { fixture: Fixture }).fixture.checks)).toEqual([false, true]);
});

test('stable is the default and prerelease requires a persistent opt-in', async ({ page }) => {
  await mockShell(page, { current: true });
  await settings(page);
  const toggle = page.getByRole('checkbox', { name: '接收预发布网页更新' });
  const channels = () => page.evaluate(() => (window as unknown as { fixture: Fixture }).fixture.prereleaseChecks);
  await expect.poll(channels).toEqual([false]);
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByRole('button', { name: '检查更新' }).click();
  await expect.poll(channels).toEqual([false, true]);
  await page.reload();
  await expect.poll(channels).toEqual([true]);
  await settings(page);
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.getByRole('button', { name: '检查更新' }).click();
  await expect.poll(channels).toEqual([true, false]);
});

test('the progress is byte-based, intermediate stages wait, and errors allow one retry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockShell(page);
  await start(page);
  await expect.poll(() => calls(page)).toEqual([3]);
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.android-update-cat')).toHaveCSS('animation-name', 'android-update-peek');
  const progress = dialog.getByRole('progressbar', { name: '网页包下载进度' });
  await stage(page, 'downloading', 3 * 1024 * 1024);
  await expect(progress).toHaveAttribute('value', `${3 * 1024 * 1024}`);
  await expect(dialog.getByText('37%', { exact: true })).toBeVisible();
  await expect(dialog.getByText('3.0 MB / 8.0 MB')).toBeVisible();
  await expect(dialog.getByRole('button')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('cozy-android-back')));
  await expect(dialog).toBeVisible();
  expect(await calls(page)).toEqual([3]);

  await stage(page, 'verifying');
  await expect(dialog.getByText('下载完成⁓需要校验文件喔')).toBeVisible();
  await expect(progress).toHaveCount(0);
  await stage(page, 'installing');
  await expect(dialog.getByText('马上！正在安装啦！')).toBeVisible();
  await expect(progress).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { fixture: Fixture }).fixture.fail('网页包签名与当前 APK 不匹配。'));
  await expect(page.getByRole('alert')).toHaveText('网页包签名与当前 APK 不匹配。');
  await page.getByRole('button', { name: '重试下载' }).click();
  await expect.poll(() => calls(page)).toEqual([3, 3]);
});

for (const width of [320, 430]) {
  test(`progress fits a ${width}px phone and respects reduced motion`, async ({ page }) => {
    await page.setViewportSize({ width, height: 680 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockShell(page);
    await start(page);
    await expect.poll(() => calls(page)).toEqual([3]);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cozy-safe-area', { detail: {
      top: 32, right: 6, bottom: 0, left: 4, keyboardVisible: true, keyboardViewportHeight: 250,
    } })));
    const card = page.getByRole('dialog');
    await expect(card.locator('.android-update-cat')).toHaveCSS('animation-name', 'none');
    await expect.poll(() => card.evaluate(element => {
      const box = element.getBoundingClientRect();
      return box.y >= 32 && box.bottom <= 250 && box.left >= 4 && box.right <= innerWidth - 6;
    })).toBe(true);
    await expect(card.getByRole('progressbar')).toBeInViewport();
  });
}

test('offline keeps local content and the manual import and restore entry points', async ({ page }) => {
  await mockShell(page, { offline: true });
  await expect(page.getByRole('navigation', { name: '应用模块' })).toBeVisible();
  await settings(page);
  await expect(page.getByText('当前离线，继续使用本地网页。')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { fixture: Fixture }).fixture.checks)).toEqual([]);
  await page.evaluate(() => { (window as unknown as { fixture: Fixture }).fixture.manualError = true; });
  await page.getByRole('button', { name: '导入网页更新' }).click();
  await expect(page.getByRole('alert')).toHaveText('更新未安装。');
  await expect(page.getByText('当前网页版本 2 · 外壳 4')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { fixture: Fixture }).fixture.manualError = false; });
  await page.getByRole('button', { name: '导入网页更新' }).click();
  await expect(page.getByText('当前网页版本 3 · 外壳 4')).toBeVisible();
  await page.getByRole('button', { name: '恢复内置网页' }).click();
  await expect(page.getByText('当前网页版本 1 · 外壳 4')).toBeVisible();
});

for (const [outcome, title] of [['installed', '更新完成！！！'], ['rolledBack', '新网页未能启动，已恢复稳定版本。']] as const) {
  test(`startup displays the native ${outcome} outcome`, async ({ page }) => {
    await mockShell(page, { outcome });
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('当前网页版本 2')).toBeVisible();
    if (outcome === 'rolledBack') {
      await page.getByRole('button', { name: '重新检查' }).click();
      await expect(page.getByRole('heading', { name: '发现新版本，是否立即更新？' })).toBeVisible();
    } else {
      await page.getByRole('button', { name: '关闭' }).click();
      await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
    }
  });
}
