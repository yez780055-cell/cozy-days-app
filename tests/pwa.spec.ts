import { expect, test } from '@playwright/test';
import { taskAction } from './task-actions';

test('PWA is installable and can reopen and save todos offline', async ({ page, context, baseURL }) => {
  const addButton = page.getByRole('button', { name: '新增待办', exact: true });
  await page.goto('./');
  await expect(addButton).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');

  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
  const config = JSON.parse(manifest.data!);
  expect(config.display).toBe('standalone');
  for (const field of ['id', 'start_url', 'scope']) {
    expect(new URL(config[field], manifest.url).href).toBe(baseURL);
  }
  expect(manifest.parsed?.scope).toBe(baseURL);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // Playwright's isolated browser context cannot install an app on the host OS.
  expect(installabilityErrors.filter(error => error.errorId !== 'in-incognito')).toEqual([]);

  await context.setOffline(true);
  await page.close();
  const offlinePage = await context.newPage();
  const launch = await offlinePage.goto(baseURL!);
  expect(launch?.fromServiceWorker()).toBe(true);

  const text = '断网后重新打开添加的待办';
  await offlinePage.getByRole('button', { name: '新增待办', exact: true }).click();
  await offlinePage.getByRole('textbox', { name: '想做些什么？' }).fill(text);
  await offlinePage.getByRole('button', { name: '保存', exact: true }).click();
  const todo = offlinePage.getByRole('button', { name: `编辑：${text}`, exact: true });
  await expect(todo).toBeVisible();
  await offlinePage.reload();
  await expect(todo).toBeVisible();

  await taskAction(offlinePage, text, 'complete');
  const completed = offlinePage.getByRole('button', { name: '已完成 1', exact: true });
  await expect(completed).toBeVisible();
  await offlinePage.reload();
  await completed.click();
  await expect(todo).toBeVisible();

  await taskAction(offlinePage, text, 'delete');
  await expect(completed).toHaveCount(0);
  await offlinePage.reload();
  await expect(offlinePage.getByRole('button', { name: '新增待办', exact: true })).toBeVisible();
  await expect(completed).toHaveCount(0);
  await expect(todo).toHaveCount(0);
});
