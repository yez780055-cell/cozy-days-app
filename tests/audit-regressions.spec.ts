import { test, expect } from '@playwright/test';

test('valid local dates save in UTC+14 while impossible dates are rejected', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'Pacific/Kiritimati' });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: '新增待办', exact: true }).click();
  await page.getByRole('textbox', { name: '想做些什么？' }).fill('跨时区计划');
  await page.getByLabel('归属日期', { exact: true }).fill('2026-02-30');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('有效日期');
  await page.getByLabel('归属日期', { exact: true }).fill('2026-02-28');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /^全部未完成/ }).click();
  await expect(page.getByRole('button', { name: '编辑：跨时区计划', exact: true })).toBeVisible();
  await context.close();
});

test('the saved current font can be retried after startup loading fails', async ({ page }) => {
  await page.route(/Yozai-.*\.woff2/, route => route.abort());
  await page.goto('/');
  await page.locator('.bottom-nav button').first().dispatchEvent('contextmenu');
  await page.getByRole('menuitem', { name: '设置' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute(/Yozai-.*\.woff2/);
  await page.getByRole('radio', { name: '选择悠哉字体' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Yozai"'))).toBe(true);
});
