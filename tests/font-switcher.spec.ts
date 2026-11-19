import { expect, test, type Page } from '@playwright/test';

async function openAppearance(page: Page) {
  await page.locator('.home-settings').click();
  await page.getByRole('button', { name: /外观与字体/ }).click();
}

test('the default system stack loads without a font download', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', request => requested.push(request.url()));
  await page.goto('/');
  await expect(page.locator('html')).toHaveCSS('font-family', /PingFang SC/);
  await openAppearance(page);
  await expect(page.getByRole('radio', { name: '选择系统默认字体' })).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('cozy-days.font-family'))).toBeNull();
  expect(requested.filter(url => /\.(woff2|ttf|otf)(\?|$)/i.test(url))).toEqual([]);
});

test('an existing explicit font choice loads before settings is opened', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cozy-days.font-family', 'yozai'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveCSS('font-family', /Yozai/);
  await expect.poll(() => page.evaluate(() => [...document.fonts].some(font => font.family === 'Yozai' && font.status === 'loaded'))).toBe(true);
  await openAppearance(page);
  await expect(page.getByRole('radio', { name: '选择悠哉字体' })).toBeChecked();
});

test('font switching loads before applying and persists through reload', async ({ page }) => {
  await page.goto('/');
  await openAppearance(page);
  const xiaolai = page.getByRole('radio', { name: '选择小赖字体' });
  await xiaolai.click();
  await expect(xiaolai).toBeChecked();
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Xiaolai"'))).toBe(true);
  await expect(page.getByTestId('font-preview')).toHaveCSS('font-family', /Xiaolai/);
  expect(await page.evaluate(() => localStorage.getItem('cozy-days.font-family'))).toBe('xiaolai');
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Xiaolai"'))).toBe(true);
  await expect(page.locator('html')).toHaveCSS('--app-font-family', /Xiaolai/);
  await openAppearance(page);
  await expect(page.getByRole('radio', { name: '选择小赖字体' })).toBeChecked();
});

test('font load failure preserves the previous selection and allows retry', async ({ page }) => {
  await page.goto('/');
  await openAppearance(page);
  const oldStack = await page.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--app-font-family'));
  const oldPreference = await page.evaluate(() => localStorage.getItem('cozy-days.font-family'));
  await page.route(/GenSenRounded2TW-Regular\.woff2/, route => route.abort());
  const gensen = page.getByRole('radio', { name: '选择源泉圆体' });
  await gensen.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(gensen).not.toBeChecked();
  expect(await page.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--app-font-family'))).toBe(oldStack);
  expect(await page.evaluate(() => localStorage.getItem('cozy-days.font-family'))).toBe(oldPreference);
  await page.unroute(/GenSenRounded2TW-Regular\.woff2/);
  await gensen.click();
  await expect(gensen).toBeChecked();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cozy-days.font-family'))).toBe('gensen-rounded');
});
