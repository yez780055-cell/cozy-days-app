import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const catalog: { file: string }[] = JSON.parse(fs.readFileSync('src/assets/ready-catalog.json', 'utf8').replace(/^\uFEFF/, ''));

for (const [width, height] of [[360, 740], [393, 852], [430, 932]]) {
  test(`Pages production: assets and interactions ${width}x${height}`, async ({ page, request, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await expect(page.locator('.empty-art')).toBeVisible();
    await expect(page.locator('.preview-toolbar')).toHaveCount(0);
    for (const asset of catalog) {
      const response = await request.get(new URL(`assets/cozy_days/${asset.file}`, baseURL!).href);
      expect(response.ok(), asset.file).toBe(true);
      expect(response.headers()['content-type']).toMatch(/^image\//);
    }
    await page.getByRole('button', { name: '新增待办', exact: true }).click();
    await page.getByRole('textbox', { name: '想做些什么？' }).fill('阅读一本新书');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    // Wait for the IndexedDB save and modal dismissal before testing a reload.
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByTestId('todo-card')).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId('todo-card')).toHaveCount(1);
    await page.getByRole('button', { name: '编辑：阅读一本新书', exact: true }).click();
    await page.getByRole('textbox', { name: '想做些什么？' }).fill('晚上做十分钟拉伸');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('checkbox', { name: '完成：晚上做十分钟拉伸', exact: true }).click();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '完成：晚上做十分钟拉伸', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '选择日期', exact: true }).click();
    await page.getByRole('button', { name: '回到今天', exact: true }).click();
    await page.locator('img').evaluateAll(imgs => Promise.all(imgs.map(img => (img as HTMLImageElement).decode())));
    expect(await page.locator('img').evaluateAll(imgs => imgs.every(img => !img.src.startsWith('data:') && img.naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.body.scrollWidth)).toBe(width);
    const background = await page.locator('.phone').evaluate(el => getComputedStyle(el).backgroundImage);
    expect(background).toContain('/cozy-days-app/');
    await expect(page.getByRole('button', { name: '新增待办', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: '纪念日', exact: true })).toBeInViewport();
    await page.screenshot({ path: `artifacts/pages-${width}x${height}.png` });
    for (const name of ['生理期', '纪念日', '待办']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    }
    await page.getByRole('button', { name: '删除：晚上做十分钟拉伸', exact: true }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(page.getByTestId('todo-card')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
