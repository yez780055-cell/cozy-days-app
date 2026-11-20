import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const root = process.env.VITE_ANDROID_WEB_UPDATE_ROOT;
const feed = root && new URL('shell-3/latest.json', root.endsWith('/') ? root : `${root}/`).href;
const bytes = Buffer.from('synthetic signed-package fixture');
const hash = createHash('sha256').update(bytes).digest('hex');
const manifest = { schema: 1, shell: 3, web: 3, sha256: hash };
const downloadName = 'Cozy-Days-Web-3-3.cozyupdate';
const prompt = (page: Page) => page.getByRole('heading', { name: '发现新版本，是否立即更新？' });

async function mockShell(page: Page, offline = false) {
  await page.addInitScript(offline => {
    const calls: string[] = [];
    const fixture = { calls, web: 2, fail: false };
    if (offline) Object.defineProperty(navigator, 'onLine', { get: () => false });
    Object.assign(window, {
      updateFixture: fixture,
      androidBridge: {},
      Capacitor: {
        PluginHeaders: [{ name: 'CozyAndroidShell', methods: ['getSafeArea', 'ready', 'updateInfo', 'importUpdate', 'restoreBundled']
          .map(name => ({ name, rtype: 'promise' })) }],
        async nativePromise(_: string, method: string) {
          calls.push(method);
          if (method === 'getSafeArea') return { top: 27, right: 0, bottom: 24, left: 0, keyboardVisible: false, keyboardViewportHeight: 0 };
          if (method === 'updateInfo') return { shell: 3, web: fixture.web };
          if (method === 'importUpdate') {
            if (fixture.fail) throw new Error('更新未安装。');
            fixture.web = 3;
          }
          if (method === 'restoreBundled') fixture.web = 1;
        },
      },
    });
  }, offline);
}

const settings = (page: Page) => page.getByRole('button', { name: '打开应用设置' }).click();

test('startup compares revisions once, and later allows checking again in Settings', async ({ page }) => {
  test.skip(!feed, 'Build the Android web assets with VITE_ANDROID_WEB_UPDATE_ROOT.');
  await mockShell(page);
  let checks = 0;
  await page.route(feed!, route => {
    checks++;
    return route.fulfill({ json: { ...manifest, web: checks === 1 ? 2 : 3 }, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto('/');
  await settings(page);
  await expect(page.getByText('当前已是最新版本。')).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  expect(checks).toBe(1);
  await page.getByRole('button', { name: '检查更新' }).click();
  await expect(prompt(page)).toBeVisible();
  await page.getByRole('button', { name: '稍后更新' }).click();
  await expect(prompt(page)).toHaveCount(0);
  const download = page.getByRole('link', { name: /下载网页更新/ });
  await expect(download).toHaveAttribute('href', new URL(`web-3/download.html#${hash}`, feed!).href);
  expect(checks).toBe(2);

  // The Android WebView opens HTTPS links in the system browser and keeps this page alive.
  await download.evaluate(link => link.addEventListener('click', event => event.preventDefault(), { once: true }));
  await download.click();
  await page.getByRole('button', { name: '选择网页包' }).click();
  await expect(page.getByText('当前网页版本 3 · 外壳 3')).toBeVisible();
});

test('a release for another shell and an unreachable feed do not block the app', async ({ page }) => {
  test.skip(!feed, 'Build the Android web assets with VITE_ANDROID_WEB_UPDATE_ROOT.');
  await mockShell(page);
  await page.route(feed!, route => route.fulfill({ json: { ...manifest, shell: 4 }, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('/');
  await settings(page);
  await expect(page.getByText('暂时无法检查更新，请稍后重试。')).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  await page.unroute(feed!);
  await page.route(feed!, route => route.abort('connectionreset'));
  await page.getByRole('button', { name: '检查更新' }).click();
  await expect(page.getByText('暂时无法检查更新，请稍后重试。')).toBeVisible();
  await expect(page.getByRole('button', { name: '导入网页更新' })).toBeEnabled();
});

test('an offline launch keeps the local version and exposes the native manual fallback', async ({ page }) => {
  test.skip(!feed, 'Build the Android web assets with VITE_ANDROID_WEB_UPDATE_ROOT.');
  await mockShell(page, true);
  const requests: string[] = [];
  page.on('request', request => { if (request.url() === feed) requests.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: '应用模块' })).toBeVisible();
  await settings(page);
  await expect(page.getByText('当前离线，继续使用本地网页。')).toBeVisible();
  await expect(page.getByText('当前网页版本 2 · 外壳 3')).toBeVisible();
  expect(requests).toEqual([]);

  await page.evaluate(() => { (window as unknown as { updateFixture: { fail: boolean } }).updateFixture.fail = true; });
  await page.getByRole('button', { name: '导入网页更新' }).click();
  await expect(page.getByRole('alert')).toHaveText('更新未安装。');
  await expect(page.getByText('当前网页版本 2 · 外壳 3')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { updateFixture: { fail: boolean } }).updateFixture.fail = false; });
  await page.getByRole('button', { name: '导入网页更新' }).click();
  await expect(page.getByText('当前网页版本 3 · 外壳 3')).toBeVisible();
  await page.getByRole('button', { name: '恢复内置网页' }).click();
  await expect(page.getByText('当前网页版本 1 · 外壳 3')).toBeVisible();
});

test('immediate update downloads automatically and exposes only a verified file for saving', async ({ page }) => {
  test.skip(!feed, 'Build the Android web assets with VITE_ANDROID_WEB_UPDATE_ROOT.');
  await mockShell(page);
  await page.route(feed!, route => route.fulfill({ json: manifest, headers: { 'Access-Control-Allow-Origin': '*' } }));
  const html = readFileSync('scripts/android-web-download.html', 'utf8').replaceAll('__WEB_REVISION__', '3')
    .replaceAll('__PACKAGE_NAME__', downloadName).replace('__SHA256__', hash).replace('__PACKAGE_SIZE__', `${bytes.length}`);
  await page.route(new URL('web-3/download.html', feed!).href, route => route.fulfill({ contentType: 'text/html', body: html }));
  let attempts = 0;
  await page.route(new URL(`web-3/${downloadName}`, feed!).href, route => {
    attempts++;
    if (attempts === 1) return route.abort('connectionreset');
    if (attempts === 2) return route.fulfill({ body: bytes.subarray(0, -1) });
    if (attempts === 3) return route.fulfill({ body: Buffer.alloc(bytes.length) });
    return route.fulfill({ body: bytes });
  });
  await page.goto('/');
  await expect(prompt(page)).toBeVisible();
  await page.getByRole('link', { name: '立即更新' }).click();
  const retry = page.getByRole('button', { name: '重新下载' });
  const save = page.getByRole('link', { name: '保存网页包' });
  for (let i = 0; i < 3; i++) {
    await expect(retry).toBeVisible();
    await expect(save).toHaveCount(0);
    await retry.click();
  }
  await expect(page.getByRole('status')).toContainText('SHA-256 校验通过');
  const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
  expect(download.suggestedFilename()).toBe(downloadName);
  expect(readFileSync(await download.path())).toEqual(bytes);
});
