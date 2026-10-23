import { test, expect, type Page, type Locator } from '@playwright/test';
import { taskAction } from './task-actions';

async function add(page: Page,text:string) {
  await page.getByRole('button',{name:'新增待办',exact:true}).click();
  await page.getByRole('textbox',{name:'想做些什么？'}).fill(text);
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
const card=(page:Page,text:string)=>page.getByTestId('todo-card').filter({has:page.getByRole('button',{name:`编辑：${text}`,exact:true})});
async function drag(page:Page,element:Locator,dx:number,release=true) {
  await element.scrollIntoViewIfNeeded();
  const r=(await element.boundingBox())!;
  const x=r.x+r.width*(dx<0?.75:.25),y=r.y+r.height*.5;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+dx,y,{steps:12});
  if(release) await page.mouse.up();
}
async function rows(page:Page) {
  return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
    const open=indexedDB.open('little-days');open.onerror=()=>reject(open.error);open.onsuccess=()=>{
      const db=open.result,tx=db.transaction('todos','readonly'),get=tx.objectStore('todos').getAll();
      tx.oncomplete=()=>{db.close();resolve(get.result);};tx.onerror=()=>reject(tx.error);
    };
  }));
}
async function undo(page:Page) { const count=await page.locator('.undo-toast').count();await page.getByRole('button',{name:'撤销',exact:true}).last().click();await expect(page.locator('.undo-toast')).toHaveCount(count-1); }

for(const [width,height] of [[360,740],[393,852],[430,932]]) {
  test(`滑动阈值、跟手与删除/完成/恢复撤销 ${width}x${height}`,async({page})=>{
    test.setTimeout(60_000);
    await page.setViewportSize({width,height});await page.goto('/');
    await add(page,'读一本喜欢的书');await add(page,'第二件小事');
    const first=card(page,'读一本喜欢的书'),shell=first.locator('..');
    const original=await rows(page),w=(await first.boundingBox())!.width;
    await expect(first.getByRole('checkbox')).toHaveCount(0);
    await drag(page,first,-40,false);
    await expect(shell).toHaveAttribute('data-offset','-40');
    expect(await shell.locator('.swipe-rail--delete').evaluate(el=>Number(getComputedStyle(el).opacity))).toBeGreaterThan(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.mouse.up();
    await expect(shell).toHaveAttribute('data-offset','0');
    await expect(first).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
    await drag(page,first,40);
    await expect(shell).toHaveAttribute('data-offset','0');
    await expect(first).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
    await drag(page,first,-100);
    await expect(shell).toHaveAttribute('data-offset','-80');
    await expect(first).toHaveCSS('transform','matrix(1, 0, 0, 1, -80, 0)');
    await page.screenshot({path:`artifacts/cozy-swipe-delete-reveal-${width}x${height}.png`});
    await page.getByRole('button',{name:'滑动删除：读一本喜欢的书',exact:true}).click();
    await expect(first).toHaveCount(0);
    await expect(page.locator('.undo-toast')).toContainText('哎呀点错了');
    await undo(page);await expect(first).toBeVisible();expect(await rows(page)).toEqual(original);
    await drag(page,first,-w*.62);
    await expect(first).toHaveCount(0);await undo(page);await expect(first).toBeVisible();
    // 50% exactly must not directly delete.
    await drag(page,first,-w*.5);
    await expect(shell).toHaveAttribute('data-offset','-80');
    expect((await rows(page)).length).toBe(2);
    // Begin on another card: the old snapped surface closes.
    await drag(page,card(page,'第二件小事'),-35);
    await expect(shell).toHaveAttribute('data-offset','0');
    await drag(page,first,w*.62);
    await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();
    expect((await rows(page))[0].completed).toBe(true);
    await undo(page);await expect(first).toBeVisible();expect((await rows(page))[0].completed).toBe(false);
    await drag(page,first,w*.62);
    await page.getByRole('button',{name:'已完成 1',exact:true}).click();
    await expect(first).toHaveClass(/task-card--done/);
    await drag(page,first,w*.62);
    await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toHaveCount(0);
    await expect(page.locator('.undo-toast').last()).toContainText('又放回小计划啦');
    expect((await rows(page))[0].completed).toBe(false);
    await undo(page);
    await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();
    expect((await rows(page))[0].completed).toBe(true);
    await page.reload();await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();
    expect((await rows(page)).map(r=>r.id)).toEqual(original.map(r=>r.id));
    expect(await page.evaluate(()=>document.body.scrollWidth)).toBe(width);
  });
}

test('退场时数据仍在，300ms 收缩与下方补位完成后才移除',async({page})=>{
  await page.setViewportSize({width:393,height:852});await page.goto('/');
  await add(page,'先删除的卡片');await add(page,'向上补位的卡片');
  const first=card(page,'先删除的卡片'),second=card(page,'向上补位的卡片');
  const before=(await second.boundingBox())!.y,w=(await first.boundingBox())!.width;
  await drag(page,first,-w*.65);
  await expect(first.locator('..')).toHaveAttribute('data-phase','exiting');
  expect(await page.getByTestId('todo-card').count()).toBe(2);
  expect((await rows(page)).length).toBe(2);
  await expect(first).toHaveCount(0);
  expect((await second.boundingBox())!.y).toBeLessThan(before-50);
  expect((await rows(page)).length).toBe(1);
});

test('完整快照撤销保留 ID/分类/日期/时间/收藏/贴纸与原始排序',async({page})=>{
  await page.goto('/');await add(page,'中间要保留所有字段');await add(page,'后面的小事');
  await page.getByRole('button',{name:'编辑：中间要保留所有字段',exact:true}).click();
  await page.getByRole('button',{name:'收藏这件小事',exact:true}).click();
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(card(page,'中间要保留所有字段').locator('.task-favorite')).toHaveCount(1);
  await expect(card(page,'后面的小事').locator('.task-favorite')).toHaveCount(0);
  // Existing optional fields are opaque to this UI and must survive an undo.
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const r=indexedDB.open('little-days');r.onsuccess=()=>{const db=r.result,tx=db.transaction('todos','readwrite'),store=tx.objectStore('todos'),get=store.get(1);
      get.onsuccess=()=>store.put({...get.result,category:'生活',time:'09:30',sortOrder:7});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
  }));
  await page.reload();await expect(card(page,'中间要保留所有字段')).toBeVisible();
  const original=await rows(page);
  await taskAction(page,'中间要保留所有字段','delete');await expect(card(page,'中间要保留所有字段')).toHaveCount(0);
  await undo(page);await expect(card(page,'中间要保留所有字段')).toBeVisible();
  expect(await rows(page)).toEqual(original);
  expect(await page.locator('.task-list .task-content > span').allTextContents()).toEqual(['中间要保留所有字段','后面的小事']);
  await taskAction(page,'中间要保留所有字段','complete');
  await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'已完成 1',exact:true}).click();
  await expect(card(page,'中间要保留所有字段').locator('.task-favorite')).toHaveCount(1);
  expect((await rows(page))[0]).toMatchObject({...original[0],completed:true});
  await page.getByRole('button',{name:'编辑：中间要保留所有字段',exact:true}).click();
  await page.getByRole('button',{name:'已收藏这件小事',exact:true}).click();await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();await page.reload();
  expect((await rows(page))[0].favorite).toBe(false);
});

test('快速连续操作支持独立撤销，同一任务删除后撤销不重复创建',async({page})=>{
  await page.goto('/');await add(page,'甲');await add(page,'乙');await add(page,'丙');
  await taskAction(page,'甲','delete');await expect(card(page,'甲')).toHaveCount(0);
  await taskAction(page,'乙','complete');await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();
  await expect(page.locator('.undo-toast')).toHaveCount(2);await undo(page);await expect(card(page,'乙')).toBeVisible();
  expect((await rows(page)).map(r=>r.text)).toEqual(['乙','丙']);
  await taskAction(page,'乙','delete');await expect(card(page,'乙')).toHaveCount(0);await undo(page);await expect(card(page,'乙')).toBeVisible();
  const ids=(await rows(page)).map(r=>r.id);expect(ids).toEqual([2,3]);
  // Two overlapping gestures: operations persist in order and never share a target.
  const b=card(page,'乙'),c=card(page,'丙');
  await drag(page,b,-(await b.boundingBox())!.width*.65);
  await drag(page,c,(await c.boundingBox())!.width*.65);
  await expect(b).toHaveCount(0);await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();
  await undo(page);await expect(c).toBeVisible();
  expect((await rows(page)).map(r=>[r.id,r.completed])).toEqual([[3,false]]);
});

test('5秒读条、超时消失及导航卸载清理',async({page})=>{
  await page.clock.install();await page.goto('/');await add(page,'计时任务');
  await taskAction(page,'计时任务','delete');await expect(card(page,'计时任务')).toHaveCount(0);
  await expect(page.locator('.undo-progress i')).toHaveCSS('animation-duration','5s');
  await page.clock.fastForward(4000);await expect(page.getByRole('button',{name:'撤销',exact:true})).toBeEnabled();
  await page.clock.fastForward(1600);await expect(page.locator('.undo-toast')).toHaveCount(0);
  await add(page,'导航前的小事');await taskAction(page,'导航前的小事','complete');
  await expect(page.locator('.undo-toast')).toHaveCount(1);
  await page.getByRole('button',{name:'纪念日',exact:true}).click();await page.clock.fastForward(6000);
  await page.getByRole('button',{name:'待办',exact:true}).click();await expect(page.locator('.undo-toast')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();
});

test('真实浏览器触控：纵向滚动不操作，横向拖动不误开编辑',async({page})=>{
  test.setTimeout(60_000);await page.setViewportSize({width:393,height:852});await page.goto('/');
  for(let i=0;i<12;i++)await add(page,`滚动任务${i}`);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const r=(await page.locator('.task-area').boundingBox())!,x=r.x+r.width*.45,y=r.y+r.height-25;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+3,y:y-i*13}]});await page.waitForTimeout(16);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.locator('.task-area').evaluate(el=>el.scrollTop)).toBeGreaterThan(80);
  expect((await rows(page)).every(row=>!row.completed)).toBe(true);await expect(page.getByTestId('todo-card')).toHaveCount(12);await expect(page.locator('.undo-toast')).toHaveCount(0);
  await page.locator('.task-area').evaluate(el=>{el.scrollTop=0;});
  const b=(await card(page,'滚动任务0').boundingBox())!,sx=b.x+b.width*.7,sy=b.y+b.height*.5;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy}]});
  for(let i=1;i<=10;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx-i*10,y:sy}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(card(page,'滚动任务0').locator('..')).toHaveAttribute('data-offset','-80');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('减少动态效果仍可删除/完成/撤销且没有常驻任务复选框',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await add(page,'安静的小事');
  await expect(page.locator('.task-card .checkbox')).toHaveCount(0);
  const row=card(page,'安静的小事');await drag(page,row,(await row.boundingBox())!.width*.65);
  await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();await undo(page);await expect(row).toBeVisible();
  await taskAction(page,'安静的小事','delete');await expect(row).toHaveCount(0);await undo(page);await expect(row).toBeVisible();
});
