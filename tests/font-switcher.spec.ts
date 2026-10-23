import { expect, test } from '@playwright/test';

test('only the current font loads on startup and entering Settings does not preload other fonts', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', request => requested.push(request.url()));
  await page.goto('/');
  await expect(page.locator('.bottom-nav button')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Yozai"'))).toBe(true);
  await page.locator('.bottom-nav button').nth(0).dispatchEvent('contextmenu');
  await page.getByRole('menuitem', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: '字体设置' })).toBeVisible();
  expect(requested.some(url => /Xiaolai|GenSenRounded/i.test(url) && /\.(woff2|ttf|otf)(\?|$)/i.test(url)), requested.join('\n')).toBe(false);
});

test('the three navigation buttons switch pages on short press', async ({ page }) => {
  await page.goto('/');
  const nav = page.locator('.bottom-nav button');
  await expect(nav).toHaveCount(3);
  await nav.nth(1).click();
  await expect(page.getByRole('heading', { name: '生理期日历' })).toBeVisible();
  await nav.nth(2).click();
  await expect(page.getByRole('heading', { name: '纪念日' })).toBeVisible();
  await nav.nth(0).click();
  await expect(page.locator('.hero h1')).toBeVisible();
});

test('long-pressing each navigation button opens Settings menu without switching page', async ({ page }) => {
  await page.goto('/');
  const nav = page.locator('.bottom-nav button');
  for (let index = 0; index < 3; index++) {
    await page.mouse.move(0, 0);
    const button = nav.nth(index);
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    if (!box) throw new Error('Navigation button is not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByRole('menu', { name: '快捷菜单' })).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.bottom-nav button')).toHaveCount(3);
    await expect(page.locator('.hero h1')).toBeVisible();
    await page.getByRole('button', { name: '关闭快捷菜单' }).click();
  }
});

test('Settings opens from quick menu and returns to the previous module', async ({ page }) => {
  await page.goto('/');
  const nav = page.locator('.bottom-nav button');
  await nav.nth(1).click();
  const box = await nav.nth(1).boundingBox();
  if (!box) throw new Error('Navigation button is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.mouse.up();
  await page.getByRole('menuitem', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: '字体设置' })).toBeVisible();
  await page.getByRole('button', { name: '返回上一页' }).click();
  await expect(page.getByRole('heading', { name: '生理期日历' })).toBeVisible();
  await expect(page.locator('.bottom-nav button')).toHaveCount(3);
});

test('font switching loads before applying and persists through reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('.bottom-nav button').nth(0).dispatchEvent('contextmenu');
  await page.getByRole('menuitem', { name: '设置' }).click();
  const xiaolai = page.getByRole('radio', { name: '选择小赖字体' });
  await xiaolai.click();
  await expect(xiaolai).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Xiaolai"'))).toBe(true);
  await expect(page.getByTestId('font-preview')).toHaveCSS('font-family', /Xiaolai/);
  expect(await page.evaluate(() => localStorage.getItem('cozy-days.font-family'))).toBe('xiaolai');
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Xiaolai"'))).toBe(true);
  await expect(page.locator('html')).toHaveCSS('--app-font-family', /Xiaolai/);
  await page.locator('.bottom-nav button').nth(0).dispatchEvent('contextmenu');
  await page.getByRole('menuitem', { name: '设置' }).click();
  await expect(page.getByRole('radio', { name: '选择小赖字体' })).toHaveAttribute('aria-checked', 'true');
});

test('font load failure preserves the previous selection and allows retry', async ({ page }) => {
  await page.goto('/');
  await page.locator('.bottom-nav button').nth(0).dispatchEvent('contextmenu');
  await page.getByRole('menuitem', { name: '设置' }).click();
  const oldStack = await page.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--app-font-family'));
  const oldPreference = await page.evaluate(() => localStorage.getItem('cozy-days.font-family'));
  await page.route(/GenSenRounded2TW-Regular\.woff2/, route => route.abort());
  const gensen = page.getByRole('radio', { name: '选择源泉圆体' });
  await gensen.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(gensen).toHaveAttribute('aria-checked', 'false');
  expect(await page.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--app-font-family'))).toBe(oldStack);
  expect(await page.evaluate(() => localStorage.getItem('cozy-days.font-family'))).toBe(oldPreference);
  await page.unroute(/GenSenRounded2TW-Regular\.woff2/);
  await gensen.click();
  await expect(gensen).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cozy-days.font-family'))).toBe('gensen-rounded');
});
