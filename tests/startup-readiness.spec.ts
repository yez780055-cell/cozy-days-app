import { expect, test, type Page } from '@playwright/test';
import { mockShell, type Fixture } from '../tests-android/support/shell-fixture';

async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
}
async function state(page: Page) {
  return page.evaluate(() => {
    const { fixture, startupHarness } = window as unknown as { fixture: Fixture; startupHarness: { acknowledged: boolean } };
    return { calls: fixture.readyCalls, acknowledged: startupHarness.acknowledged };
  });
}
async function harness(page: Page, options: Parameters<typeof mockShell>[1] = {}) {
  await mockShell(page, { current: true, startupToken: 123, ...options }, false);
  await page.route('**/startup-harness', async route => {
    // Keep Vite's React refresh preamble while delaying the real app until after
    // the repository fault has been installed in this same module graph.
    const response = await page.request.get('/');
    const html = (await response.text()).replace(/<script type="module" src="\/src\/main\.tsx"><\/script>/, '');
    expect(html).not.toContain('src="/src/main.tsx"');
    await route.fulfill({ contentType: 'text/html', body: html.replace('</body>',
      '<div class="phone" id="test-surface"></div></body>') });
  });
  await page.goto('/startup-harness');
  await page.evaluate(async () => {
    const windowPath = '/src/native/window.ts', readinessPath = '/src/native/startupReadiness.ts', shellPath = '/src/native/shell.ts';
    const [{ prepareAndroidWindow }, { publishStartupSurface }, { androidPageReady }] = await Promise.all([
      import(windowPath), import(readinessPath), import(shellPath),
    ]);
    const control = { publishStartupSurface, preparing: prepareAndroidWindow(), acknowledged: false };
    Object.assign(window, { startupHarness: control });
    void androidPageReady.then(() => { control.acknowledged = true; });
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixture: Fixture }).fixture.safeAreaRequested)).toBe(true);
}
async function publish(page: Page) {
  await page.evaluate(() => {
    const control = (window as any).startupHarness;
    control.cleanup = control.publishStartupSurface(document.getElementById('test-surface'));
  });
}

test('an arbitrary phone, a revoked surface and a detached surface never confirm startup', async ({ page }) => {
  await harness(page);
  await frames(page);
  expect((await state(page)).calls).toEqual([]);
  await page.evaluate(() => {
    const control = (window as any).startupHarness;
    const cleanup = control.publishStartupSurface(document.getElementById('test-surface'));
    cleanup();
  });
  await frames(page);
  expect((await state(page)).calls).toEqual([]);
  await page.evaluate(() => {
    const control = (window as any).startupHarness;
    const element = document.getElementById('test-surface');
    control.publishStartupSurface(element);
    element?.remove();
  });
  await frames(page);
  expect((await state(page)).calls).toEqual([]);
  expect((await state(page)).acknowledged).toBe(false);
});

test('same-node StrictMode registrations ignore old cleanup and acknowledge exactly once', async ({ page }) => {
  await harness(page);
  await page.evaluate(() => {
    const control = (window as any).startupHarness;
    const element = document.getElementById('test-surface');
    const oldCleanup = control.publishStartupSurface(element);
    control.cleanup = control.publishStartupSurface(element);
    oldCleanup();
  });
  await expect.poll(async () => (await state(page)).acknowledged).toBe(true);
  expect((await state(page)).calls).toEqual([{ startupToken: 123, darkStatusIcons: expect.any(Boolean), darkNavigationIcons: expect.any(Boolean) }]);
  await page.evaluate(() => { const control = (window as any).startupHarness; control.cleanup(); });
  await publish(page);
  await frames(page);
  expect((await state(page)).calls).toHaveLength(1);
});

test('a committed surface survives delayed safe area and preserves token zero', async ({ page }) => {
  await harness(page, { holdSafeArea: true, startupToken: 0 });
  await publish(page);
  await frames(page);
  expect((await state(page)).calls).toEqual([]);
  await page.evaluate(async () => { (window as unknown as { fixture: Fixture }).fixture.releaseSafeArea(); await (window as any).startupHarness.preparing; });
  await expect.poll(async () => (await state(page)).acknowledged).toBe(true);
  expect((await state(page)).calls[0].startupToken).toBe(0);
});

for (const options of [{ omitStartupToken: true }, { startupToken: null }, { startupToken: -1 },
  { startupToken: 0.5 }, { startupToken: 2147483648 }, { safeAreaError: true }])
  test(`invalid startup bridge metadata does not confirm: ${JSON.stringify(options)}`, async ({ page }) => {
    await harness(page, options);
    await page.evaluate(() => (window as any).startupHarness.preparing);
    await publish(page); await frames(page);
    expect(await state(page)).toEqual({ calls: [], acknowledged: false });
  });

test('native ready rejection does not resolve the page-ready signal', async ({ page }) => {
  await harness(page, { readyError: true });
  await publish(page);
  await expect.poll(async () => (await state(page)).calls.length).toBe(1);
  await frames(page);
  expect((await state(page)).acknowledged).toBe(false);
});

test('quick navigation waits for startup reads and returning home uses fresh data', async ({ page }) => {
  await harness(page);
  await page.evaluate(async () => {
    const repoPath = '/src/data/database.ts'; const { todoRepository } = await import(repoPath);
    const original = todoRepository.all;
    let calls = 0;
    todoRepository.all = async () => {
      if (++calls === 1) {
        const initial = await original();
        return new Promise(resolve => { (window as any).startupHarness.releaseData = () => resolve(initial); });
      }
      return original();
    };
  });
  await page.addScriptTag({ type: 'module', url: '/src/main.tsx' });
  await expect(page.getByText('正在读取…', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: '待办', exact: true }).click();
  await expect(page.getByRole('button', { name: '新增待办', exact: true })).toBeVisible();
  await frames(page);
  expect((await state(page)).calls).toEqual([]);
  await page.evaluate(() => (window as any).startupHarness.releaseData());
  await expect.poll(async () => (await state(page)).acknowledged).toBe(true);
  await page.evaluate(async () => {
    const repoPath = '/src/data/database.ts'; const { todoRepository } = await import(repoPath);
    await todoRepository.add({ text: '返回首页才读取的新任务', date: new Date().toLocaleDateString('sv-SE'), completed: false, createdAt: Date.now() });
  });
  await page.getByRole('navigation').getByRole('button', { name: '首页', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: '今日待办进度' })).toHaveAttribute('max', '1');
  expect((await state(page)).calls).toHaveLength(1);
});

test('a failed first business read keeps trial protection active', async ({ page }) => {
  await harness(page);
  await page.evaluate(async () => {
    const repoPath = '/src/data/database.ts'; const { todoRepository } = await import(repoPath);
    todoRepository.all = async () => { throw new Error('Synthetic startup read failure'); };
  });
  await page.addScriptTag({ type: 'module', url: '/src/main.tsx' });
  await expect(page.getByRole('alert')).toContainText('数据读取失败');
  await frames(page);
  expect(await state(page)).toEqual({ calls: [], acknowledged: false });
});

test('a cloud refresh is not overwritten by a late initial home snapshot', async ({ page }) => {
  await harness(page);
  await page.evaluate(async () => {
    const path = '/src/data/database.ts'; const { todoRepository } = await import(path);
    const original = todoRepository.all;
    let calls = 0;
    todoRepository.all = async () => {
      if (++calls === 1) {
        const initial = await original();
        return new Promise(resolve => { (window as any).startupHarness.releaseData = () => resolve(initial); });
      }
      return original();
    };
  });
  await page.addScriptTag({ type: 'module', url: '/src/main.tsx' });
  await expect(page.getByText('正在读取…', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/data/database.ts'; const { todoRepository } = await import(path);
    await todoRepository.add({ text: '初读之后同步的新任务', date: new Date().toLocaleDateString('sv-SE'), completed: false, createdAt: Date.now() });
    window.dispatchEvent(new Event('cozy-days:cloud-records'));
  });
  await expect(page.getByRole('progressbar', { name: '今日待办进度' })).toHaveAttribute('max', '1');
  expect((await state(page)).calls).toEqual([]);
  await page.evaluate(() => (window as any).startupHarness.releaseData());
  await expect.poll(async () => (await state(page)).acknowledged).toBe(true);
  await expect(page.getByRole('progressbar', { name: '今日待办进度' })).toHaveAttribute('max', '1');
});
