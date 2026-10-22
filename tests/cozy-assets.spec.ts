import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('正式素材、三种安卓视口、长文本与安全区', async ({ page }) => {
  test.setTimeout(90_000);
  const measurements = [];
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const [width, height] of [[360,740], [393,852], [430,932]]) {
    await page.setViewportSize({width, height});
    await page.goto('/');
    await expect(page.locator('.empty-art')).toBeVisible();
    await page.locator('img').evaluateAll(imgs => Promise.all(imgs.map(img => (img as HTMLImageElement).decode())));
    await page.screenshot({path:`artifacts/cozy-empty-${width}x${height}.png`});
    for (const text of ['准备下周的设计稿', '整理一下房间', '看一本喜欢的书', '晚上做十分钟拉伸']) {
      await page.getByRole('button',{name:'新增待办',exact:true}).click();
      await page.getByRole('textbox',{name:'想做些什么？'}).fill(text);
      await page.getByRole('button',{name:'保存',exact:true}).click();
    }
    await page.reload();
    await expect(page.getByTestId('todo-card')).toHaveCount(4);
    await page.locator('img').evaluateAll(imgs => Promise.all(imgs.map(img => (img as HTMLImageElement).decode())));
    await page.locator('.phone').evaluate(el => Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
    const measurement = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight, scrollWidth: document.body.scrollWidth,
      images: [...document.images].map(i=>({src:i.getAttribute('src'), loaded:i.complete && i.naturalWidth>0, width:i.width,height:i.height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight})),
      buttons: [...document.querySelectorAll('.task-actions button,.date-section button,.fab,.bottom-nav button')].map(b=>{const r=b.getBoundingClientRect();return {label:b.getAttribute('aria-label')||b.textContent,w:r.width,h:r.height};}),
    }));
    measurements.push(measurement);
    expect(measurement.scrollWidth).toBe(width);
    expect(measurement.images.every(i=>i.loaded && !i.src?.includes('placeholder'))).toBe(true);
    for (const i of measurement.images.filter(i=>!i.src?.includes('bedroom_header'))) expect(Math.abs(i.width/i.height-i.naturalWidth/i.naturalHeight)).toBeLessThan(.08);
    for (const b of measurement.buttons) { expect(b.w).toBeGreaterThanOrEqual(44); expect(b.h).toBeGreaterThanOrEqual(44); }
    const fabBox = await page.locator('.fab').boundingBox();
    const listBox = await page.locator('.task-area').boundingBox();
    expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(fabBox!.y);
    await page.screenshot({path:`artifacts/cozy-todo-${width}x${height}.png`});
    await page.locator('.task-area').evaluate(e=>{e.scrollTop=e.scrollHeight;});
    await page.screenshot({path:`artifacts/cozy-scrolled-${width}x${height}.png`});
    await page.getByRole('button',{name:'新增待办',exact:true}).click();
    const longText = '这是需要正常换行的长待办内容'.repeat(8)+'\n'+'verylongunbrokentask'.repeat(12);
    await page.getByRole('textbox',{name:'想做些什么？'}).fill(longText);
    await page.getByRole('button',{name:'保存',exact:true}).click();
    const content = page.locator('.task-content').last();
    expect(await content.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await page.getByRole('button',{name:`删除：${longText}`,exact:true}).click();
    await page.getByRole('button',{name:'确认删除',exact:true}).click();
    // Synthetic bottom inset checks CSS reservation; device bars still require a real Android device.
    await page.addStyleTag({content:'.bottom-nav {height:calc(var(--nav-height) + 34px);padding-bottom:39px}.fab {bottom:calc(var(--nav-height) + 55px)}'});
    await expect(page.getByRole('button',{name:'纪念日',exact:true})).toBeInViewport();
    const nav = await page.locator('.bottom-nav').boundingBox();
    expect(nav!.y+nav!.height).toBeLessThanOrEqual(height);
    await page.screenshot({path:`artifacts/cozy-safe-area-${width}x${height}.png`});
    // Reset injected safe-area styles before the next viewport.
    await page.goto('about:blank');
    await page.goto('/');
    await expect(page.getByTestId('todo-card')).toHaveCount(4);
    // Delete fixture todos through the UI to preserve the application's normal data path.
    for (let remaining = 4; remaining > 0; remaining--) {
      await page.locator('.task-actions button').last().click();
      await page.getByRole('button',{name:'确认删除',exact:true}).click();
      await expect(page.getByTestId('todo-card')).toHaveCount(remaining - 1);
    }
  }
  expect(errors).toEqual([]);
  fs.writeFileSync('artifacts/cozy-viewport-measurements.json', JSON.stringify(measurements,null,2));
});
