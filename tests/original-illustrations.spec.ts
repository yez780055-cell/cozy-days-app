import { test, expect, type Page, type Locator } from '@playwright/test';
import { taskAction } from './task-actions';

const decorations='.original-plant,.original-cheer,.original-books,.original-peeking-cat';
async function images(page:Page) {
  await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>(img as HTMLImageElement).decode())));
}
async function add(page:Page,text:string) {
  await page.locator('.fab').click();
  await page.getByRole('textbox',{name:'想做些什么？'}).fill(text);
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function drag(page:Page,card:Locator,dx:number) {
  const box=(await card.boundingBox())!;
  const x=box.x+box.width*(dx<0?.8:.2),y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+dx,y,{steps:12});await page.mouse.up();
}
async function geometry(page:Page,width:number) {
  const metrics=await page.locator(decorations).evaluateAll(imgs=>imgs.map(el=>{
    const img=el as HTMLImageElement,r=img.getBoundingClientRect();
    return {cls:img.className,x:r.x,right:r.right,y:r.y,bottom:r.bottom,w:r.width,h:r.height,
      ratio:img.naturalWidth/img.naturalHeight,pointer:getComputedStyle(img).pointerEvents,
      hit:document.elementFromPoint(Math.min(innerWidth-1,r.x+r.width/2),r.y+r.height/2)===img};
  }));
  expect(metrics).toHaveLength(4);
  for(const item of metrics){expect(item.w/item.h).toBeCloseTo(item.ratio,2);expect(item.pointer).toBe('none');expect(item.hit).toBe(false);}
  expect(metrics[0].x).toBeCloseTo(0,1);expect(metrics[2].x).toBeCloseTo(0,1);
  expect(metrics[3].right).toBeCloseTo(width,1);
  const nav=(await page.locator('.bottom-nav').boundingBox())!;
  for(const i of [2,3])expect(metrics[i].bottom).toBeCloseTo(nav.y,1);
  const fab=(await page.locator('.fab').boundingBox())!;
  expect(fab.x+fab.width+5).toBeLessThan(metrics[3].x);
  expect(fab.y+fab.height).toBeLessThan(nav.y);
  expect(await page.locator('.fab').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  expect(await page.evaluate(()=>document.body.scrollWidth)).toBe(width);
  return metrics;
}
for(const [width,height] of [[360,740],[393,852],[430,932]]) {
  test(`original illustrations: real layout, scrolling, swipes and safe area ${width}x${height}`,async({page})=>{
    test.setTimeout(90_000);
    await page.setViewportSize({width,height});await page.goto('/');
    await expect(page.locator('.empty-art')).toBeVisible();await images(page);
    await geometry(page,width);
    await page.screenshot({path:`public/review/evidence/screenshots/illustrations-empty-${width}x${height}.png`,fullPage:true});
    for(const text of ['准备明天的设计稿','喝够八杯水','整理房间','看一本喜欢的书','晚上做拉伸'])await add(page,text);
    await images(page);await geometry(page,width);
    await page.screenshot({path:`public/review/evidence/screenshots/illustrations-${width}x${height}.png`,fullPage:true});
    for(let i=0;i<7;i++)await add(page,`多任务滚动验证 ${i+1}`);
    const original=(await page.locator('.original-bottom-decor').boundingBox())!;
    const area=page.locator('.task-area');await area.hover();await page.mouse.wheel(0,650);
    await expect.poll(()=>area.evaluate(el=>el.scrollTop)).toBeGreaterThan(80);
    expect((await page.locator('.original-bottom-decor').boundingBox())!.y).toBeCloseTo(original.y,1);
    await page.screenshot({path:`public/review/evidence/screenshots/illustrations-scrolled-${width}x${height}.png`,fullPage:true});
    await area.evaluate(el=>el.scrollTop=0);
    const first=page.getByTestId('todo-card').filter({has:page.getByRole('button',{name:'编辑：准备明天的设计稿',exact:true})});
    await drag(page,first,-100);
    await expect(first.locator('..')).toHaveAttribute('data-offset','-80');
    await page.getByRole('button',{name:'滑动删除：准备明天的设计稿',exact:true}).click();
    await expect(first).toHaveCount(0);
    await page.getByRole('button',{name:'撤销',exact:true}).last().click();await expect(first).toBeVisible();
    await drag(page,first,220);
    await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'撤销',exact:true}).last().click();await expect(first).toBeVisible();
    await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
    await taskAction(page,'准备明天的设计稿','complete');await taskAction(page,'喝够八杯水','complete');await taskAction(page,'整理房间','delete');
    await expect(page.locator('.undo-toast')).toHaveCount(3);
    const fab=(await page.locator('.fab').boundingBox())!;
    for(const toast of await page.locator('.undo-toast').all()){
      const b=(await toast.boundingBox())!;expect(b.x+b.width).toBeLessThan(fab.x);
      expect(await toast.getByRole('button',{name:'撤销',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    }
    await page.screenshot({path:`public/review/evidence/screenshots/illustrations-undo-${width}x${height}.png`,fullPage:true});
    // CSS env() override exercises real layout plumbing without touching browser or user data.
    await page.addStyleTag({content:'.bottom-nav{height:calc(var(--nav-height) + 34px);padding-bottom:39px}.original-bottom-decor{bottom:calc(var(--nav-height) + 34px)}.fab{bottom:calc(var(--nav-height) + 55px)}.undo-stack{bottom:calc(var(--nav-height) + 46px)}'});
    await geometry(page,width);
    await page.screenshot({path:`public/review/evidence/screenshots/illustrations-safe-area-${width}x${height}.png`,fullPage:true});
    await page.locator('.fab').click();await expect(page.getByRole('dialog',{name:'新建待办',exact:true})).toBeVisible();
  });
}
