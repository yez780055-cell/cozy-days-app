import { taskAction } from './task-actions';
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { cardThemes, matchIllustration, resolveDecoration, reviseDecoration, stickerOptions, illustrationRules } from '../src/features/todo/decorations';

test('关键词识别覆盖五类、英文边界与多关键词优先级', () => {
  for (const [text,id] of [['午休读书十分钟','taskBook'],['读一本新书','taskBook'],['看一本喜欢的书','taskBook'],['买一本小说','taskBook'],['晚上跑步三公里','taskStretch'],['周末洗衣服','home'],['复习英语单词','study'],['写项目报告','work'],['READ a book','taskBook'],['finish homework','study'],['work meeting','work']]) {
    expect(matchIllustration(text,123)).toBe(id);
  }
  expect(matchIllustration('学习后阅读',123)).toBe('taskBook');
});

test('未知标题稳定兜底，部分/非法字段修复，配色与布局存在变化', () => {
  const a = resolveDecoration('去见一位老朋友', {seed: 41});
  expect(stickerOptions.map(s=>s.id)).toContain(a.illustrationId);
  expect(resolveDecoration('去见一位老朋友',{seed:41})).toEqual(a);
  const repaired = resolveDecoration('跑步', {seed: -1, illustrationId:'task_laptop', stickerId:'task_broom', theme:'__proto__'}, 'legacy:1');
  expect(repaired.illustrationId).toBe('taskStretch');
  expect(stickerOptions.some(s=>s.id===repaired.stickerId)).toBe(true);
  expect(Object.keys(cardThemes)).toContain(repaired.theme);
  expect(repaired.seed).toBeGreaterThanOrEqual(0);
  expect(resolveDecoration('跑步', {seed:0}).seed).toBe(0);
  expect(resolveDecoration('跑步', null)).toEqual(resolveDecoration('跑步', null));
  const manual = {...a, theme:'lavender' as const, stickerId:'cherries' as const};
  expect(reviseDecoration('开项目会议',manual)).toEqual({...manual,illustrationId:'work'});
  const variants = Array.from({length:24},(_,seed)=>resolveDecoration('一个新计划',{seed}));
  expect(new Set(variants.map(d=>d.theme)).size).toBe(4);
  expect(new Set(variants.map(d=>d.stickerId)).size).toBeGreaterThan(1);
  expect(new Set(variants.map(d=>d.seed%3)).size).toBe(3);
});

test('素材注册表只包含 ready，文件真实存在且哈希一致', () => {
  const catalog = JSON.parse(fs.readFileSync('src/assets/ready-catalog.json','utf8').replace(/^\uFEFF/,''));
  for (const row of catalog) {
    expect(row.status).toBe('ready');
    const raw = fs.readFileSync('public/assets/cozy_days/'+row.file);
    const bytes = row.file.endsWith('.svg') ? Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n')) : raw;
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
  }
  expect(new Set(catalog.map((r:{name:string})=>r.name)).size).toBe(catalog.length);
  expect(illustrationRules.map(r=>r.id)).not.toContain('task_laptop');
});

test('插画请求失败时使用包内 ready 星星兜底',async({page})=>{
  await page.route('**/raster/tasks/task_book.png',route=>route.abort());
  await page.goto('/');
  await add(page,'阅读一本新书');
  const image=page.locator('.task-art .task-illustration');
  await expect(image).toHaveAttribute('src',/^data:image\/svg\+xml,/);
  expect(await image.evaluate(img=>(img as HTMLImageElement).decode().then(()=>true))).toBe(true);
});

async function records(page: Page) {
  return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
    const request=indexedDB.open('little-days');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction('todos','readonly');const read=tx.objectStore('todos').getAll();tx.oncomplete=()=>{db.close();resolve(read.result);};tx.onerror=()=>{db.close();reject(tx.error);};};
  }));
}
async function add(page:Page,text:string) {
  await page.getByRole('button',{name:'新增待办',exact:true}).click();
  await page.getByRole('textbox',{name:'想做些什么？'}).fill(text);
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

test('新任务保存装饰，编辑重匹配，自动贴纸/配色持久化且不影响勾选删除', async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto('/');
  await add(page,'去见一位老朋友');
  const first=(await records(page))[0];
  expect(first.decoration).toMatchObject({version:1,seed:expect.any(Number),illustrationId:expect.any(String),stickerId:expect.any(String),theme:expect.any(String)});
  await page.reload();
  await expect(page.getByTestId('todo-card')).toHaveCount(1);
  expect((await records(page))[0].decoration).toEqual(first.decoration);
  await page.getByRole('button',{name:'编辑：去见一位老朋友',exact:true}).click();
  await expect(page.getByText('贴纸与卡片配色',{exact:true})).toHaveCount(0);
  await page.getByRole('textbox',{name:'想做些什么？'}).fill('晚上慢跑之后拉伸');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const changed=(await records(page))[0];
  expect(changed.decoration).toEqual({...first.decoration,illustrationId:'taskStretch'});
  await page.reload();
  const card=page.getByTestId('todo-card');
  await expect(card).toHaveAttribute('data-theme',first.decoration.theme);
  await expect(card.locator('.task-art')).toHaveAttribute('data-sticker',first.decoration.stickerId);
  expect((await records(page))[0].decoration).toEqual(changed.decoration);
  // Cancel decoration edits without changing the saved appearance.
  await page.getByRole('button',{name:'编辑：晚上慢跑之后拉伸',exact:true}).click();
  await page.getByRole('button',{name:'收藏这件小事',exact:true}).click();
  await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await records(page))[0].decoration).toEqual(changed.decoration);
  await taskAction(page, '晚上慢跑之后拉伸', 'complete');
  await page.getByRole('button',{name:'已完成 1',exact:true}).click();
  await taskAction(page, '晚上慢跑之后拉伸', 'restore');
  expect((await records(page))[0].decoration).toEqual(changed.decoration);
  await taskAction(page,'晚上慢跑之后拉伸','delete');
  await expect(card).toHaveCount(0);
});

test('v1 旧数据升级及当前版本部分/缺失装饰修复均写回，编辑后稳定',async({page})=>{
  await page.route('**/legacy-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>fixture</title>'}));
  await page.goto('/legacy-fixture');
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('little-days',10); // Dexie version 1 maps to native version 10.
    request.onupgradeneeded=()=>{const table=request.result.createObjectStore('todos',{keyPath:'id',autoIncrement:true});for(const key of ['date','completed','createdAt'])table.createIndex(key,key);};
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction('todos','readwrite');
      tx.objectStore('todos').add({id:1,text:'复习英语',date:'2026-10-22',completed:false,createdAt:42});
      tx.objectStore('todos').add({id:2,text:'一件旧的小事',date:'2026-10-21',completed:true,createdAt:43});
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
  }));
  await page.goto('/');
  await page.getByRole('button',{name:/^全部未完成/}).click();
  await expect(page.getByTestId('todo-card').first().locator('.task-art')).toHaveAttribute('data-illustration','study');
  const upgraded=await records(page);
  expect(upgraded[0]).toMatchObject({id:1,text:'复习英语',date:'2026-10-22',completed:false,createdAt:42});
  expect(upgraded.every(row=>row.decoration?.version===1)).toBe(true);
  await page.reload();
  await expect(page.locator('.loading-message')).toHaveCount(0);
  expect(await records(page)).toEqual(upgraded);
  await page.goto('/legacy-fixture');
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const r=indexedDB.open('little-days');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('todos','readwrite');const table=tx.objectStore('todos');
      table.put({id:1,text:'复习英语',date:'2026-10-22',completed:false,createdAt:42,decoration:{seed:7,theme:'sage',illustrationId:'task_laptop'}});
      table.put({id:2,text:'一件旧的小事',date:'2026-10-21',completed:true,createdAt:43});
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
  }));
  await page.goto('/');
  await page.getByRole('button',{name:/^全部未完成/}).click();
  await expect(page.getByTestId('todo-card').first()).toHaveAttribute('data-theme','sage');
  const repaired=await records(page);
  expect(repaired[0].decoration).toMatchObject({seed:7,theme:'sage',illustrationId:'study',stickerId:expect.any(String)});
  expect(repaired[1].decoration).toEqual(upgraded[1].decoration);
  await page.getByRole('button',{name:'编辑：复习英语',exact:true}).click();
  await page.getByRole('textbox',{name:'想做些什么？'}).fill('明天开项目会议');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await records(page))[0].decoration).toEqual({...repaired[0].decoration,illustrationId:'work'});
});

test('三视口装饰不覆盖文字/按钮/复选框，所有任务有可解码插画',async({page})=>{
  test.setTimeout(60_000);
  await page.goto('/');
  for(const text of ['读一本新书','下班运动拉伸','周末做家务洗衣','复习课程','准备工作报告','预约剪头发','长任务标题'.repeat(30)]) await add(page,text);
  for(const [width,height] of [[360,740],[393,852],[430,932]]){
    await page.setViewportSize({width,height});await page.reload();
    await expect(page.getByTestId('todo-card')).toHaveCount(7);
    await page.locator('.task-art img').evaluateAll(imgs=>Promise.all(imgs.map(i=>(i as HTMLImageElement).decode())));
    const overlaps=await page.locator('.task-card').evaluateAll(cards=>cards.flatMap(card=>{
      const art=card.querySelector('.task-art')!.getBoundingClientRect();
      return [...card.querySelectorAll('.task-content,.task-actions,.checkbox')].filter(el=>{
        const r=el.getBoundingClientRect();const padding=el.classList.contains('checkbox')?11:0;
        return art.left<r.right+padding && art.right>r.left-padding && art.top<r.bottom+padding && art.bottom>r.top-padding;
      }).map(el=>el.className);
    }));
    expect(overlaps).toEqual([]);
    expect(await page.evaluate(()=>document.body.scrollWidth)).toBe(width);
    await page.screenshot({path:`artifacts/cozy-decorations-${width}x${height}.png`});
    await page.getByRole('button',{name:'编辑：预约剪头发',exact:true}).click();
    await expect(page.getByText('贴纸与卡片配色',{exact:true})).toHaveCount(0);
    await page.screenshot({path:`artifacts/cozy-decorations-picker-${width}x${height}.png`});
    await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  }
});
