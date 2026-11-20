import { test, expect, type Page, type Locator } from '@playwright/test';
import { openTodos, taskAction } from './task-actions';

async function images(page:Page) {
  await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>(img as HTMLImageElement).decode())));
}
async function add(page:Page,text:string) {
  await page.getByRole('button',{name:'新增待办',exact:true}).click();
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
async function checkHomeScene(page: Page) {
  const scene = page.locator('.home-scene');
  for (const selector of ['.home-room', '.home-cats']) {
    const art = scene.locator(selector);
    await expect(art).toBeVisible();
    const bounds = await scene.boundingBox();
    const image = await art.boundingBox();
    expect(image!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(image!.x + image!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    expect(image!.y + image!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  }
  await page.getByRole('button', {name:'添加待办',exact:true}).click({trial:true});
}

for(const [width,height] of [[360,740],[393,852],[430,932]]) {
  test(`home illustrations: real layout, scrolling, swipes and safe area ${width}x${height}`,async({page}, testInfo)=>{
    test.setTimeout(90_000);
    await page.setViewportSize({width,height});await page.goto('/');
    await expect(page.getByText('今天还没有待办')).toBeVisible();
    await images(page);
    await checkHomeScene(page);
    await page.screenshot({path:testInfo.outputPath(`illustrations-empty-${width}x${height}.png`),fullPage:true});
    await openTodos(page);
    for(const text of ['准备明天的设计稿','喝够八杯水','整理房间','看一本喜欢的书','晚上做拉伸'])await add(page,text);
    await expect(page.getByTestId('todo-card')).toHaveCount(5);
    await page.screenshot({path:testInfo.outputPath(`illustrations-${width}x${height}.png`),fullPage:true});
    for(let i=0;i<7;i++)await add(page,`多任务滚动验证 ${i+1}`);
    const header=page.getByRole('heading',{name:'待办',exact:true});
    const original=(await header.boundingBox())!;
    const area=page.locator('.task-area');await area.hover();await page.mouse.wheel(0,650);
    await expect.poll(()=>area.evaluate(el=>el.scrollTop)).toBeGreaterThan(80);
    expect((await header.boundingBox())!.y).toBeCloseTo(original.y,1);
    await page.screenshot({path:testInfo.outputPath(`illustrations-scrolled-${width}x${height}.png`),fullPage:true});
    await area.evaluate(el=>el.scrollTop=0);
    const first=page.getByTestId('todo-card').filter({has:page.getByRole('button',{name:'编辑：准备明天的设计稿',exact:true})});
    await first.scrollIntoViewIfNeeded();
    await drag(page,first,-100);
    await expect(first.locator('..')).toHaveAttribute('data-offset','-80');
    await page.getByRole('button',{name:'滑动删除：准备明天的设计稿',exact:true}).click();
    await expect(first).toHaveCount(0);
    await page.getByRole('button',{name:'撤销',exact:true}).last().click();await expect(first).toBeVisible();
    await expect(page.locator('.undo-toast')).toHaveCount(0);
    await first.scrollIntoViewIfNeeded();
    await drag(page,first,220);
    await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'撤销',exact:true}).last().click();await expect(first).toBeVisible();
    await expect(page.locator('.undo-toast')).toHaveCount(0);
    await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
    await taskAction(page,'准备明天的设计稿','complete');await taskAction(page,'喝够八杯水','complete');await taskAction(page,'整理房间','delete');
    await expect(page.locator('.undo-toast')).toHaveCount(3);
    for(const toast of await page.locator('.undo-toast').all()){
      await toast.getByRole('button',{name:'撤销',exact:true}).click({trial:true});
    }
    await page.screenshot({path:testInfo.outputPath(`illustrations-undo-${width}x${height}.png`),fullPage:true});
    const nav=page.getByRole('navigation');
    const before=(await nav.boundingBox())!;
    await page.addStyleTag({content:':root { --safe-bottom: 34px; }'});
    await expect(nav).toHaveCSS('padding-bottom','34px');
    const after=(await nav.boundingBox())!;
    expect(after.height-before.height).toBeCloseTo(34,1);
    expect(after.y+after.height).toBeCloseTo(before.y+before.height,1);
    expect(await page.locator('.phone').evaluate(el=>el.scrollWidth)).toBe(width);
    await page.screenshot({path:testInfo.outputPath(`illustrations-safe-area-${width}x${height}.png`),fullPage:true});
    await page.getByRole('button',{name:'新增待办',exact:true}).click();await expect(page.getByRole('dialog',{name:'新建待办',exact:true})).toBeVisible();
  });
}
