import {test,expect,type Page} from '@playwright/test';
import {taskAction} from './task-actions';

async function add(page:Page,text:string,options:{category?:string;time?:string;date?:string;favorite?:boolean}={}) {
  await page.getByRole('button',{name:'新增待办',exact:true}).click();
  await page.getByRole('textbox',{name:'想做些什么？'}).fill(text);
  if(options.category){await page.getByRole('button',{name:'所属分类',exact:true}).click();await page.getByRole('group',{name:'选择所属分类'}).getByRole('button',{name:options.category,exact:true}).click();};
  if(options.date)await page.getByLabel('归属日期',{exact:true}).fill(options.date);
  if(options.time)await page.getByLabel('计划时间',{exact:true}).fill(options.time);
  if(options.favorite)await page.getByRole('button',{name:'收藏这件小事',exact:true}).click();
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
}
const card=(page:Page,text:string)=>page.getByTestId('todo-card').filter({has:page.getByRole('button',{name:`编辑：${text}`,exact:true})});
async function read(page:Page) {
  return page.evaluate(()=>new Promise<{todos:any[];categories:any[]}>((resolve,reject)=>{
    const request=indexedDB.open('little-days');request.onerror=()=>reject(request.error);request.onsuccess=()=>{
      const db=request.result,tx=db.transaction(['todos','categories'],'readonly');
      const todos=tx.objectStore('todos').getAll(),categories=tx.objectStore('categories').getAll();
      tx.oncomplete=()=>{db.close();resolve({todos:todos.result,categories:categories.result});};tx.onerror=()=>reject(tx.error);
    };
  }));
}
async function manager(page:Page){await page.getByRole('button',{name:'添加或管理分类',exact:true}).click();await expect(page.getByRole('dialog',{name:'管理分类'})).toBeVisible();}
async function close(page:Page){await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();}
async function createCategory(page:Page,name:string){await manager(page);await page.getByRole('textbox',{name:'分类名称'}).fill(name);await page.getByRole('button',{name:'添加分类',exact:true}).click();await expect(page.getByRole('button',{name:`修改分类：${name}`,exact:true})).toBeVisible();await close(page);}

test('默认分类与自定义分类新增/改名/筛选持久化，拒绝重名',async({page})=>{
  await page.goto('/');for(const name of ['全部','工作','生活','学习'])await expect(page.getByRole('button',{name:`分类：${name}`,exact:true})).toBeVisible();
  await createCategory(page,'灵感');await add(page,'记下一个想法',{category:'灵感',time:'10:00'});await add(page,'发一封工作邮件',{category:'工作'});
  await page.getByRole('button',{name:'分类：灵感',exact:true}).click();await expect(card(page,'记下一个想法')).toBeVisible();await expect(card(page,'发一封工作邮件')).toHaveCount(0);
  const before=(await read(page)).todos.find(t=>t.text==='记下一个想法');
  await manager(page);await page.getByRole('button',{name:'修改分类：灵感',exact:true}).click();await page.getByRole('textbox',{name:'分类名称'}).fill('创意');await page.getByRole('button',{name:'保存分类',exact:true}).click();
  await expect(page.getByRole('button',{name:'修改分类：创意',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'分类名称'}).fill('工作');await page.getByRole('button',{name:'添加分类',exact:true}).click();await expect(page.getByRole('alert')).toContainText('已经有这个分类');
  await expect(page.getByRole('button',{name:'删除分类：工作',exact:true})).toHaveCount(1);await close(page);
  await expect(page.getByRole('button',{name:'分类：创意',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();await page.getByRole('button',{name:'分类：创意',exact:true}).click();await expect(card(page,'记下一个想法')).toBeVisible();
  expect((await read(page)).todos.find(t=>t.id===before.id)).toEqual(before);
});

test('删除自定义分类只移入生活，保留已完成任务和时间；旧撤销不复活已删分类',async({page})=>{
  await page.goto('/');await createCategory(page,'旅行');
  await add(page,'准备旅行清单',{category:'旅行',time:'09:30',favorite:true});await add(page,'准备证件',{category:'旅行',time:'11:00'});
  await taskAction(page,'准备证件','complete');await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();
  const before=(await read(page)).todos;
  await page.getByRole('button',{name:'分类：旅行',exact:true}).click();await manager(page);await page.getByRole('button',{name:'删除分类：旅行',exact:true}).click();
  await expect(page.getByText('其中的任务都会移入「生活」，不会删除任务。')).toBeVisible();await page.getByRole('button',{name:'确认删除分类',exact:true}).click();
  await expect(page.getByRole('button',{name:'修改分类：旅行',exact:true})).toHaveCount(0);await close(page);
  await expect(page.getByRole('button',{name:'分类：全部',exact:true})).toHaveAttribute('aria-pressed','true');
  const after=await read(page);expect(after.todos).toEqual(before.map(t=>({...t,categoryId:'life'})));expect(after.categories.some(c=>c.name==='旅行')).toBe(false);
  // The task snapshot may outlive its category; undo must not create a dangling category ID.
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(card(page,'准备证件')).toBeVisible();
  expect((await read(page)).todos.find(t=>t.text==='准备证件')).toMatchObject({completed:false,categoryId:'life',time:'11:00'});
  await page.reload();await page.getByRole('button',{name:'分类：生活',exact:true}).click();await expect(page.getByTestId('todo-card')).toHaveCount(2);
  await expect(card(page,'准备旅行清单').locator('.task-favorite')).toHaveCount(1);
});

test('可选时间、跨日期编辑和分类筛选组合即时更新，未设时间不造默认值',async({page})=>{
  await page.goto('/');await add(page,'没有约定时间',{category:'生活'});await add(page,'十点工作计划',{category:'工作',time:'10:00'});
  await expect(card(page,'没有约定时间').locator('time')).toHaveCount(0);await expect(card(page,'十点工作计划').locator('time')).toHaveText('10:00');
  await page.getByRole('button',{name:'分类：工作',exact:true}).click();
  await page.getByRole('button',{name:'编辑：十点工作计划',exact:true}).click();
  const originalDate=await page.getByLabel('归属日期',{exact:true}).inputValue();
  const next=await page.evaluate(value=>{const d=new Date(value+'T12:00:00');d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;},originalDate);
  await page.getByLabel('归属日期',{exact:true}).fill(next);await page.getByLabel('计划时间',{exact:true}).fill('14:20');await page.getByRole('button',{name:'所属分类',exact:true}).click();await page.getByRole('group',{name:'选择所属分类'}).getByRole('button',{name:'学习',exact:true}).click();
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(card(page,'十点工作计划')).toHaveCount(0);
  await page.getByRole('button',{name:'分类：学习',exact:true}).click();await expect(card(page,'十点工作计划')).toHaveCount(0);
  await page.getByRole('button',{name:'后一天',exact:true}).click();await expect(card(page,'十点工作计划').locator('time')).toHaveText('14:20');
  await expect(page.getByRole('button',{name:'分类：学习',exact:true})).toContainText('1');
  await page.getByRole('button',{name:'编辑：十点工作计划',exact:true}).click();await page.getByRole('button',{name:'清除时间',exact:true}).click();await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(card(page,'十点工作计划').locator('time')).toHaveCount(0);await page.reload();await page.getByRole('button',{name:/^全部未完成/}).click();await page.getByRole('button',{name:'分类：学习',exact:true}).click();
  await expect(card(page,'十点工作计划')).toBeVisible();await expect(card(page,'十点工作计划').locator('time')).toHaveCount(0);
  const saved=(await read(page)).todos.find(t=>t.text==='十点工作计划');expect(saved).toMatchObject({date:next,categoryId:'study'});expect(saved.time).toBeUndefined();
  await taskAction(page,'十点工作计划','complete');await expect(page.getByRole('button',{name:'已完成 1',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(card(page,'十点工作计划')).toBeVisible();expect((await read(page)).todos.find(t=>t.id===saved.id)).toEqual(saved);
});

test('v2 旧任务迁移保留命名分类/完成/收藏，缺少时间不补值',async({page})=>{
  await page.route('**/round2-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>migration fixture</title>'}));await page.goto('/round2-fixture');
  const today=await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
  await page.evaluate(date=>new Promise<void>((resolve,reject)=>{
    const r=indexedDB.open('little-days',20);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('todos',{keyPath:'id',autoIncrement:true});for(const key of ['date','completed','createdAt'])s.createIndex(key,key);};
    r.onsuccess=()=>{const db=r.result,tx=db.transaction('todos','readwrite'),s=tx.objectStore('todos');
      s.put({id:1,text:'旧工作任务',date,completed:true,favorite:true,createdAt:7,category:'工作'});
      s.put({id:2,text:'旧运动任务',date,completed:false,createdAt:8,category:'运动',time:'9:05'});
      s.put({id:3,text:'旧无分类任务',date,completed:false,createdAt:9});
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };r.onerror=()=>reject(r.error);
  }),today);
  await page.goto('/');await expect(card(page,'旧无分类任务')).toBeVisible();const data=await read(page);
  expect(data.todos).toHaveLength(3);expect(data.todos[0]).toMatchObject({id:1,createdAt:7,date:today,categoryId:'work',favorite:true,completed:true});
  expect(data.todos[2]).toMatchObject({id:3,createdAt:9,categoryId:'life'});expect(data.todos[2].time).toBeUndefined();
  await expect(card(page,'旧无分类任务').locator('time')).toHaveCount(0);await page.getByRole('button',{name:'分类：运动',exact:true}).click();await expect(card(page,'旧运动任务').locator('time')).toHaveText('09:05');
  await page.reload();await page.getByRole('button',{name:'分类：运动',exact:true}).click();expect(await read(page)).toEqual(data);
});

for(const [width,height] of [[360,740],[393,852],[430,932]])test(`奶油卡片、独立滚动及渐变触控 ${width}x${height}`,async({page})=>{
  test.setTimeout(60_000);await page.setViewportSize({width,height});await page.goto('/');
  for(const [index,text] of ['准备设计稿','整理房间','看一本喜欢的书','晚上拉伸','第五件小事','第六件小事','第七件小事','第八件小事'].entries())await add(page,text,{category:['工作','生活','学习'][index%3],time:index%2===0?'10:00':undefined,favorite:index===0});
  const first=card(page,'准备设计稿'),rect=(await first.boundingBox())!;expect(rect.height).toBeLessThanOrEqual(66);await expect(first).toHaveCSS('background-color','rgb(255, 250, 240)');
  await expect(page.locator('.task-bottom-fade')).toHaveCSS('pointer-events','none');const fade=(await page.locator('.task-bottom-fade').boundingBox())!,navBefore=(await page.locator('.bottom-nav').boundingBox())!;
  // Position a card's center in the fade and hit-test/click through the overlay.
  await page.locator('.task-area').evaluate(el=>{el.scrollTop=40;});
  await expect(page.locator('.task-top-fade')).toHaveCSS('opacity','1');
  await expect(page.locator('.task-top-fade')).toHaveCSS('pointer-events','none');
  expect((await page.locator('.task-top-fade').boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator('.date-section').boundingBox())!.y+(await page.locator('.date-section').boundingBox())!.height-1);
  await page.locator('.task-area').evaluate(el=>{el.scrollTop=0;});
  const y=fade.y+12;
  await page.locator('.task-area').evaluate((el,target)=>{const more=el.querySelector('.card-more')!.getBoundingClientRect();el.scrollTop+=more.y+more.height/2-target;},y);
  // Scroll can only move forward; select an actual lower card and align it precisely.
  await page.locator('.task-area').evaluate((el,target)=>{const cards=[...el.querySelectorAll<HTMLElement>('.task-card')];const middle=cards[4].getBoundingClientRect();el.scrollTop+=middle.y+middle.height/2-target;},y);
  const target=card(page,'第五件小事'),r=(await target.boundingBox())!,more=(await target.locator('.card-more').boundingBox())!;
  expect(more.y+more.height/2).toBeGreaterThanOrEqual(fade.y);
  expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('.card-more')!==null,{x:more.x+more.width/2,y:more.y+more.height/2})).toBe(true);
  await page.mouse.click(more.x+more.width/2,more.y+more.height/2);await expect(page.getByRole('dialog',{name:'这件小事'})).toBeVisible();await close(page);
  // Swipe at the same faded edge without scrolling it away.
  await page.mouse.move(r.x+r.width*.7,y);await page.mouse.down();await page.mouse.move(r.x+r.width*.7-100,y,{steps:12});await page.mouse.up();await expect(target.locator('..')).toHaveAttribute('data-offset','-80');
  await page.getByRole('button',{name:'滑动删除：第五件小事',exact:true}).click();await expect(target).toHaveCount(0);await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(target).toHaveCount(1);
  const navAfter=(await page.locator('.bottom-nav').boundingBox())!;expect(navAfter.y).toBe(navBefore.y);expect(await page.evaluate(()=>document.body.scrollWidth)).toBe(width);
  await page.locator('.task-area').evaluate(el=>{el.scrollTop=0;});await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>(img as HTMLImageElement).decode())));
  await page.screenshot({path:`artifacts/cozy-round2-${width}x${height}.png`});
});
