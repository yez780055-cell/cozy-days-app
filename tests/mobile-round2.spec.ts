import {test,expect,type Page} from '@playwright/test';
import {taskAction} from './task-actions';
import {resolveDecoration} from '../src/features/todo/decorations';
const card=(page:Page,text:string)=>page.getByTestId('todo-card').filter({has:page.getByRole('button',{name:`编辑：${text}`,exact:true})});
async function add(page:Page,text:string){await page.getByRole('button',{name:'新增待办',exact:true}).click();await page.getByRole('textbox',{name:'想做些什么？'}).fill(text);await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);}
async function rows(page:Page){return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const r=indexedDB.open('little-days');r.onsuccess=()=>{const db=r.result,tx=db.transaction('todos'),q=tx.objectStore('todos').getAll();tx.oncomplete=()=>{db.close();resolve(q.result);};tx.onerror=()=>reject(tx.error);};}));}
const toast=(page:Page,text:string)=>page.locator('.undo-toast').filter({has:page.locator('small',{hasText:text})});

test('随机装饰排除星星，旧字段稳定修复且保留种子与配色',()=>{
  for(let seed=0;seed<200;seed++){
    const value=resolveDecoration('一件小事',{seed,stickerId:'star',illustrationId:'sparkle',theme:'sage'});
    expect(['star','sparkle']).not.toContain(value.stickerId);expect(['star','sparkle']).not.toContain(value.illustrationId);
    expect(value).toMatchObject({seed,theme:'sage'});expect(resolveDecoration('一件小事',value)).toEqual(value);
  }
});

test('连续混合操作逆序撤销恢复完整 ID、数据与排列位置',async({page})=>{
  await page.goto('/');for(const text of ['甲','乙','丙'])await add(page,text);const before=await rows(page);
  await taskAction(page,'甲','delete');await taskAction(page,'乙','complete');await taskAction(page,'丙','delete');
  await expect(page.locator('.undo-toast')).toHaveCount(3);
  for(const text of ['丙','乙','甲']){await toast(page,text).getByRole('button',{name:'撤销',exact:true}).click();await expect(card(page,text)).toBeVisible();}
  expect(await rows(page)).toEqual(before);expect(await page.locator('.task-list .task-content > span').allTextContents()).toEqual(['甲','乙','丙']);
});

for(const order of [[2,1,0],[0,2,1]])test(`同一任务完成、恢复、删除按 ${order.join('-')} 撤销`,async({page})=>{
  await page.goto('/');await add(page,'连续状态');const before=await rows(page);
  await taskAction(page,'连续状态','complete');await page.getByRole('button',{name:'已完成 1',exact:true}).click();await taskAction(page,'连续状态','restore');await taskAction(page,'连续状态','delete');
  await expect(page.locator('.undo-toast')).toHaveCount(3);
  const records=await page.locator('.undo-toast').all();
  for(const index of order){
    // Label and DOM position can change as earlier records disappear.
    const label=index===0?'完成一件小事啦':index===1?'又放回小计划啦':'哎呀点错了';
    await page.locator('.undo-toast').filter({hasText:label}).getByRole('button',{name:'撤销'}).click();
    if(index===0&&order[0]===0)expect(await rows(page)).toHaveLength(0);
  }
  expect(records).toHaveLength(3);expect(await rows(page)).toEqual(before);
});

test('每条记录独立五秒到期，撤销中间记录不重置其他倒计时',async({page})=>{
  await page.clock.install();await page.goto('/');for(const text of ['早','中','晚'])await add(page,text);
  await taskAction(page,'早','delete');await page.clock.fastForward(2200);
  await taskAction(page,'中','complete');await taskAction(page,'晚','delete');
  await toast(page,'中').getByRole('button',{name:'撤销'}).click();await expect(page.locator('.undo-toast')).toHaveCount(2);
  await page.clock.fastForward(2600);await expect(toast(page,'早')).toHaveCount(0);await expect(toast(page,'晚').getByRole('button',{name:'撤销'})).toBeEnabled();
  await page.clock.fastForward(3000);await expect(page.locator('.undo-toast')).toHaveCount(0);
});

test('预设分类可改名删除，删除生活及最后分类均无悬空引用',async({page})=>{
  await page.goto('/');await expect(page.getByRole('button',{name:'分类：购物',exact:true})).toBeVisible();await add(page,'保留我的数据');const original=(await rows(page))[0];
  await page.getByRole('button',{name:'添加或管理分类'}).click();
  await page.getByRole('button',{name:'修改分类：工作',exact:true}).click();await page.getByRole('textbox',{name:'分类名称'}).fill('事业');await page.getByRole('button',{name:'保存分类'}).click();
  for(const name of ['生活','事业','学习','购物']){
    await page.getByRole('button',{name:`删除分类：${name}`,exact:true}).click();await page.getByRole('button',{name:'确认删除分类',exact:true}).click();await expect(page.getByRole('button',{name:`修改分类：${name}`,exact:true})).toHaveCount(0);
  }
  await expect(page.getByRole('button',{name:'修改分类：生活',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'关闭弹窗'}).click();await page.reload();await expect(card(page,'保留我的数据')).toBeVisible();
  const saved=(await rows(page))[0];expect(saved).toMatchObject({...original,categoryId:'life'});
});

for(const [width,height] of [[360,740],[393,852],[430,932]])test(`自定义面板、标题收藏、双端渐隐与键盘 ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await page.goto('/');await add(page,'读一本书');
  await page.getByRole('button',{name:'编辑：读一本书',exact:true}).click();const dialog=page.getByRole('dialog');
  await expect(dialog.locator('input[type=date],input[type=time],select,.decoration-picker,.favorite-control')).toHaveCount(0);
  const star=dialog.getByRole('button',{name:'收藏这件小事',exact:true});const a=(await star.boundingBox())!,b=(await dialog.getByRole('button',{name:'关闭弹窗'}).boundingBox())!;expect(a.x+a.width).toBeLessThanOrEqual(b.x);
  await star.focus();await page.keyboard.press('Space');await expect(dialog.getByRole('button',{name:'已收藏这件小事',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'选择归属日期'}).click();await page.getByRole('button',{name:'下个月'}).click();await page.getByRole('button',{name:'上个月'}).click();await page.getByRole('button',{name:'回到今天'}).click();
  await page.getByRole('button',{name:'所属分类',exact:true}).click();await page.getByRole('group',{name:'选择所属分类'}).getByRole('button',{name:'学习',exact:true}).click();await expect(page.getByRole('button',{name:'所属分类',exact:true})).toHaveText('学习');
  await page.getByRole('button',{name:'选择时间',exact:true}).click();await page.getByRole('group',{name:'时',exact:true}).getByRole('button',{name:'14',exact:true}).click();await page.getByRole('group',{name:'分',exact:true}).getByRole('button',{name:'20',exact:true}).click();await page.getByRole('button',{name:'确定时间'}).click();await expect(page.getByLabel('计划时间',{exact:true})).toHaveValue('14:20');
  expect(await page.evaluate(()=>document.body.scrollWidth)).toBe(width);await page.getByRole('button',{name:'清除时间'}).click();await page.getByRole('button',{name:'保存',exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(page.locator('.task-top-fade')).toHaveCSS('opacity','0');await expect(page.locator('.task-top-fade')).toHaveCSS('pointer-events','none');
});

test('已保存的分类列表不会被新预设覆盖或补回',async({page})=>{
  await page.route('**/saved-category-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>isolated fixture</title>'}));await page.goto('/saved-category-fixture');
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('little-days',30);request.onupgradeneeded=()=>{
      const todos=request.result.createObjectStore('todos',{keyPath:'id',autoIncrement:true});for(const key of ['date','completed','createdAt','categoryId'])todos.createIndex(key,key);
      const categories=request.result.createObjectStore('categories',{keyPath:'id'});categories.createIndex('key','key',{unique:true});categories.createIndex('createdAt','createdAt');
    };request.onsuccess=()=>{const db=request.result,tx=db.transaction('categories','readwrite');tx.objectStore('categories').put({id:'mine',name:'我的日常',key:'我的日常',builtin:false,createdAt:42});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  }));
  await page.goto('/');await expect(page.getByRole('button',{name:'分类：我的日常',exact:true})).toBeVisible();for(const name of ['工作','生活','学习','购物'])await expect(page.getByRole('button',{name:`分类：${name}`,exact:true})).toHaveCount(0);
  await add(page,'使用自己的分类');expect((await rows(page))[0].categoryId).toBe('mine');await page.reload();await expect(page.getByRole('button',{name:'分类：我的日常',exact:true})).toBeVisible();
});


for(const [width,height] of [[360,740],[393,852],[430,932]])test('空状态、完成文字及多条撤销不遮挡 '+width+'x'+height,async({page})=>{
  await page.setViewportSize({width,height});await page.goto('/');
  await expect(page.locator('.empty-art')).toBeVisible();await expect(page.locator('.empty-state').getByRole('button',{name:'新增待办',exact:true})).toHaveCount(0);
  await expect(page.locator('.fab')).toBeVisible();
  for(const text of ['一号任务','二号任务','三号任务'])await add(page,text);
  await taskAction(page,'一号任务','complete');await page.getByRole('button',{name:'已完成 1',exact:true}).click();
  const done=page.getByRole('button',{name:'编辑：一号任务',exact:true});await expect(done).toHaveCSS('text-decoration-line','none');
  await taskAction(page,'二号任务','delete');await taskAction(page,'三号任务','delete');await expect(page.locator('.undo-toast')).toHaveCount(2);
  const fab=await page.locator('.fab').boundingBox();expect(fab).not.toBeNull();
  for(const item of await page.locator('.undo-toast').all()){
    const rect=await item.boundingBox();expect(rect).not.toBeNull();expect(rect!.x+rect!.width).toBeLessThanOrEqual(fab!.x-4);
    const button=await item.getByRole('button',{name:'撤销'}).boundingBox();expect(button!.x+button!.width).toBeLessThanOrEqual(fab!.x-4);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
});
