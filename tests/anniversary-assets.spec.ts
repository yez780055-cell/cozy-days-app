import { chooseDate } from './anniversary-actions';
import { test, expect } from '@playwright/test';
test.use({timezoneId:'Asia/Shanghai'});

const viewports = [
  { width:360, height:740 },
  { width:393, height:852 },
  { width:430, height:932 },
];

for (const viewport of viewports) {
  test(`compact cream cover and preserved detail artwork at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-11-19T12:00:00+08:00'));
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
    await page.getByRole('button', { name:'新增纪念日', exact:true }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('纪念日名称').fill('相遇纪念');
    await chooseDate(form, '2023-05-20');
    await form.getByRole('button', { name:'保存纪念日', exact:true }).click();
    await expect(form).toHaveCount(0);
    const cover = page.locator('.ann-featured');
    expect((await cover.boundingBox())!.height).toBeLessThan(180);
    await expect(cover).toHaveCSS('border-top-width','4px');
    await expect(cover).toHaveCSS('border-radius','24px');
    await expect(cover.locator('.ann-featured-count strong')).toBeVisible();
    await expect(page.locator('.ann-ticket')).toHaveCSS('height','59px');
    await expect(cover.locator('img')).toHaveCount(0);
    await page.getByRole('button',{name:'查看详情：相遇纪念'}).click();
    const art = page.locator('.ann-detail .ann-art');
    await expect(art.locator('img')).toHaveAttribute('src',/cats_empty_state/);
    const size = (await art.boundingBox())!;
    expect(size.width / size.height).toBeCloseTo(4 / 3, 2);
  });
}

test('anniversary asset gallery checks reference fit and transparent edges on light and dark backgrounds', async ({ page }) => {
  await page.setViewportSize({ width:1100, height:860 });
  await page.goto('/review/anniversary-assets/index.html');
  await expect(page.getByRole('heading', { name:'纪念日素材验收图册' })).toBeVisible();
  await expect(page.locator('#gallery article')).toHaveCount(15);
  await expect(page.locator('#gallery .ready')).toHaveCount(6);
  await expect(page.locator('#gallery .meta > .redraw')).toHaveCount(9);
  await expect(page.locator('#gallery img')).toHaveCount(6);
  await expect(page.locator('#gallery img').evaluateAll(images => images.every(img => (img as HTMLImageElement).naturalWidth > 0))).resolves.toBe(true);
  await page.screenshot({ path:'artifacts/integration/m3/assets-light.png', fullPage:true });
  await page.getByRole('button', { name:'深色底' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-bg', 'dark');
  await page.screenshot({ path:'artifacts/integration/m3/assets-dark.png', fullPage:true });
});
