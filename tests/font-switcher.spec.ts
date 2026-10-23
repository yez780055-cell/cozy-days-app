import { expect, test } from '@playwright/test';

test('new installs use locally loaded Yozai without downloading the other font files', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', request => requested.push(request.url()));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Yozai"'))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('cozy-days.font-family'))).toBeNull();
  expect(requested.some(url => /\.(woff2|ttf|otf)(\?|$)/i.test(url) && /Xiaolai|GenSenRounded/i.test(url)), requested.join('\n')).toBe(false);
});

test('font switching loads a local WOFF2, updates the app and persists after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const xiaolai = page.getByRole('radio', { name: '选择小赖字体' });
  await xiaolai.click();
  await expect(xiaolai).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Xiaolai"'))).toBe(true);
  await expect(page.getByTestId('font-preview')).toHaveCSS('font-family', /Xiaolai/);
  expect(await page.evaluate(() => localStorage.getItem('cozy-days.font-family'))).toBe('xiaolai');

  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('radio', { name: '选择小赖字体' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Xiaolai"'))).toBe(true);
});

test('GenSen Rounded and system default can both be selected', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const gensen = page.getByRole('radio', { name: '选择源泉圆体' });
  await gensen.click();
  await expect(gensen).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "GenSenRounded"'))).toBe(true);
  await expect(page.locator('html')).toHaveCSS('--app-font-family', /GenSenRounded/);

  await page.getByRole('radio', { name: '选择系统默认字体' }).click();
  await expect(page.getByRole('radio', { name: '选择系统默认字体' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveCSS('--app-font-family', /system-ui/);
  expect(await page.evaluate(() => localStorage.getItem('cozy-days.font-family'))).toBe('system');
});
