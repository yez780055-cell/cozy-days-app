import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const sizes = [[360, 740], [393, 852], [430, 932]] as const;
const screenshotDir = resolve('public/review/evidence/screenshots');
const videoDir = resolve('public/review/evidence/videos');
mkdirSync(screenshotDir, { recursive: true });
mkdirSync(videoDir, { recursive: true });

for (const [width, height] of sizes) {
  test(`review evidence: real todo interaction ${width}x${height}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      recordVideo: { dir: 'test-results/review-video-temp', size: { width, height } },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '新增待办', exact: true }).click();
    await page.getByRole('textbox', { name: '想做些什么？' }).fill(`验收演示：${width} × ${height} 的小计划`);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByTestId('todo-card')).toHaveCount(1);
    await page.screenshot({ path: resolve(screenshotDir, `${width}x${height}.png`), fullPage: false });
    await page.getByRole('button', { name: `编辑：验收演示：${width} × ${height} 的小计划`, exact: true }).click();
    await page.getByRole('textbox', { name: '想做些什么？' }).fill(`验收演示：${width} × ${height} · 已编辑`);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑：验收演示：' + `${width} × ${height} · 已编辑`, exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(resolve(videoDir, `${width}x${height}.webm`));
  });
}
