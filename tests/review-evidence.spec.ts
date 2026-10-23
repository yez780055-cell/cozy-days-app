import { taskAction } from './task-actions';
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sizes = [[360, 740], [393, 852], [430, 932]] as const;
const screenshotDir = resolve('public/review/evidence/screenshots');
const videoDir = resolve('public/review/evidence/videos');
mkdirSync(screenshotDir, { recursive: true });
mkdirSync(videoDir, { recursive: true });

test.afterAll(()=>{
  writeFileSync(resolve('public/review/evidence/source.json'),JSON.stringify({sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),capturedAt:new Date().toISOString(),sizes,tool:'Playwright Chromium',data:'isolated synthetic tasks'},null,2)+'\n');
});

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
    for(const text of ['准备明天的工作报告','午后读几页喜欢的书','晚上散步十分钟','整理桌面，给自己一点空间']) {
      await page.getByRole('button',{name:'新增待办',exact:true}).click();await page.getByRole('textbox',{name:'想做些什么？'}).fill(text);await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await page.screenshot({ path: resolve(screenshotDir, `${width}x${height}.png`), fullPage: false });
    await page.getByRole('button', { name: `编辑：验收演示：${width} × ${height} 的小计划`, exact: true }).click();
    await page.getByRole('button',{name:'收藏这件小事',exact:true}).click();
    await page.getByRole('button',{name:'选择归属日期'}).click();
    await page.screenshot({path:resolve(screenshotDir,`date-${width}x${height}.png`)});
    await page.getByRole('button',{name:'回到今天'}).click();
    await page.getByRole('button',{name:'所属分类',exact:true}).click();
    await page.screenshot({path:resolve(screenshotDir,`category-${width}x${height}.png`)});
    await page.getByRole('group',{name:'选择所属分类'}).getByRole('button',{name:'学习',exact:true}).click();
    await page.getByRole('button',{name:'选择时间',exact:true}).click();
    await page.screenshot({path:resolve(screenshotDir,`time-${width}x${height}.png`)});
    await page.getByRole('button',{name:'确定时间'}).click();
    await page.getByRole('textbox', { name: '想做些什么？' }).fill(`验收演示：${width} × ${height} · 已编辑`);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑：验收演示：' + `${width} × ${height} · 已编辑`, exact: true })).toBeVisible();
    await taskAction(page,'准备明天的工作报告','complete');
    await page.getByRole('button',{name:'已完成 1',exact:true}).click();
    const completedCard=page.getByRole('button',{name:'编辑：准备明天的工作报告',exact:true});
    await expect(completedCard).toHaveCSS('text-decoration-line','none');
    await page.screenshot({path:resolve(screenshotDir,'completed-'+width+'x'+height+'.png')});
    await taskAction(page,'准备明天的工作报告','restore');
    await taskAction(page,'准备明天的工作报告','delete');
    await taskAction(page,'午后读几页喜欢的书','complete');
    await taskAction(page,'晚上散步十分钟','delete');
    await expect(page.locator('.undo-toast')).toHaveCount(3);
    await page.screenshot({path:resolve(screenshotDir,`undo-${width}x${height}.png`)});
    for(const text of ['晚上散步十分钟','午后读几页喜欢的书','准备明天的工作报告'])await page.locator('.undo-toast').filter({has:page.locator('small',{hasText:text})}).getByRole('button',{name:'撤销',exact:true}).click();
    await expect(page.getByTestId('todo-card')).toHaveCount(5);
    expect(errors).toEqual([]);
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(resolve(videoDir, `${width}x${height}.webm`));
    const emptyContext=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
    const emptyPage=await emptyContext.newPage();await emptyPage.goto('/');
    await expect(emptyPage.locator('.empty-art')).toBeVisible();
    await expect(emptyPage.locator('.empty-state').getByRole('button',{name:'新增待办',exact:true})).toHaveCount(0);
    await expect(emptyPage.locator('.fab')).toBeVisible();
    await emptyPage.screenshot({path:resolve(screenshotDir,'empty-'+width+'x'+height+'.png')});
    await emptyContext.close();
  });
}
