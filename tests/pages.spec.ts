import { taskAction } from './task-actions';
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
    await taskAction(page,'晚上做十分钟拉伸','complete');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑：晚上做十分钟拉伸', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '选择日期', exact: true }).click();
    await page.getByRole('button', { name: '回到今天', exact: true }).click();
    await page.locator('img').evaluateAll(imgs => Promise.all(imgs.map(img => (img as HTMLImageElement).decode())));
    expect(await page.locator('img').evaluateAll(imgs => imgs.every(img => !img.src.startsWith('data:') && img.naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.body.scrollWidth)).toBe(width);
    const background = await page.locator('.phone').evaluate(el => getComputedStyle(el).backgroundImage);
    expect(background).toContain(new URL('assets/',baseURL!).pathname);
    await expect(page.getByRole('button', { name: '新增待办', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: '纪念日', exact: true })).toBeInViewport();
    await page.screenshot({ path: `artifacts/pages-${width}x${height}.png` });
    for (const name of ['生理期', '纪念日', '待办']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    }
    await taskAction(page,'晚上做十分钟拉伸','delete');
    await expect(page.getByTestId('todo-card')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('Pages static review route serves evidence, video controls, and build metadata', async ({ page, request, baseURL }) => {
  const reviewURL = new URL('review/', baseURL!).href;
  const response = await page.goto(reviewURL);
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: '小饱日常 在线验收' })).toBeVisible();
  await expect(page.getByRole('link', { name: /打开当前开发版本/ })).toHaveAttribute('href', '../');
  const resources = [
    ['review.css', /^text\/css/], ['review.js', /javascript/],
    ['build-info.json', /application\/json/],
    ['evidence/screenshots/360x740.png', /^image\/png/],
    ['evidence/screenshots/393x852.png', /^image\/png/],
    ['evidence/screenshots/430x932.png', /^image\/png/],
    ['evidence/reference/original-design.png', /^image\/png/],
    ['evidence/videos/360x740.webm', /^video\/webm/],
    ['evidence/videos/393x852.webm', /^video\/webm/],
    ['evidence/videos/430x932.webm', /^video\/webm/],
  ] as const;
  for (const [path, type] of resources) {
    const asset = await request.get(new URL(path, reviewURL).href);
    expect(asset.ok(), path).toBe(true);
    expect(asset.headers()['content-type'], path).toMatch(type);
  }
  await expect(page.locator('#screens img')).toHaveCount(3);
  await expect(page.locator('#controls img')).toHaveCount(18);
  const source=await request.get(new URL('evidence/source.json',reviewURL).href);expect(source.ok()).toBe(true);expect((await source.json()).sourceCommit).toMatch(/^[a-f0-9]{40}$/);
  for(const size of ['360x740','393x852','430x932'])for(const type of ['date','category','time','undo','completed','empty'])expect((await request.get(new URL('evidence/screenshots/'+type+'-'+size+'.png',reviewURL).href)).ok()).toBe(true);
  await expect(page.locator('#videos video[controls]')).toHaveCount(3);
});
