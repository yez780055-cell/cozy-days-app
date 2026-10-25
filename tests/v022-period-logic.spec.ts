import { test, expect, type Page } from '@playwright/test';
import { emptyData, type PeriodData } from '../src/features/period/model';

// Playwright creates a fresh temporary browser context per test; only synthetic DB rows.
async function seed(page:Page,data:PeriodData) {
  await page.clock.install({time:new Date('2026-10-23T04:00:00Z')});
  await page.goto('/');
  await page.evaluate(async value=>{
    localStorage.setItem('cozy-days.settings-hint-seen','1');
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('cozy-days-period',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('state',{keyPath:'id'});
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put({id:'local',value});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
    });
  },data);
  await page.reload();
  await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();
  await expect(page.locator('.period-calendar')).toBeVisible();
}
async function read(page:Page) {
  await expect(page.locator('.period-storage')).toContainText('记录仅保存在');
  return page.evaluate(()=>new Promise<PeriodData>((resolve,reject)=>{const r=indexedDB.open('cozy-days-period');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get('local');q.onsuccess=()=>{db.close();resolve(q.result.value);};};}));
}
const yes=(page:Page)=>page.getByRole('button',{name:'是',exact:true});
const no=(page:Page)=>page.getByRole('button',{name:'否',exact:true});
test('today toggle persists intervals, hides flow, retains diary and unknown fields',async({page})=>{
  const data={...emptyData(),legacy:{keep:'root'},periods:[{id:'old',start:'2026-10-20',end:'2026-10-22',extra:'keep'}],days:{'2026-10-23':{date:'2026-10-23',symptoms:['腹痛'],mood:'平静',flow:'较多',legacy:'keep'}}};
  await seed(page,data);await expect(no(page)).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'较多',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'腹痛',exact:true})).toHaveAttribute('aria-pressed','true');
  await yes(page).click();await expect(page.getByRole('button',{name:'较多',exact:true})).toHaveAttribute('aria-pressed','true');
  let saved=await read(page);expect(saved.periods).toHaveLength(2);expect(saved.periods[0]).toEqual(data.periods[0]);
  await no(page).click();saved=await read(page);expect(saved).toEqual(data);
  await page.reload();await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();await expect(no(page)).toHaveAttribute('aria-pressed','true');
  await yes(page).click();await expect(page.getByRole('button',{name:'较多',exact:true})).toHaveAttribute('aria-pressed','true');
  saved=await read(page);expect(saved.days).toEqual(data.days);expect((saved as typeof data).legacy).toEqual(data.legacy);expect(saved.periods[0]).toEqual(data.periods[0]);
});
test('historical removal confirms exact suffix, cancellation does not mutate, future is locked',async({page})=>{
  const data={...emptyData(),periods:[{id:'p',start:'2026-10-19',end:'2026-10-23',extra:'keep'}],days:{'2026-10-21':{date:'2026-10-21',symptoms:['疲惫'],flow:'点滴'}}};
  await seed(page,data);await page.getByRole('button',{name:/^2026-10-21/}).click();await no(page).click();
  await expect(page.getByRole('dialog')).toContainText('2026-10-21 至 2026-10-23');
  await page.getByRole('button',{name:'取消',exact:true}).click();expect((await read(page)).periods).toEqual(data.periods);
  await no(page).click();await page.getByRole('button',{name:'确认取消标记'}).click();
  const saved=await read(page);expect(saved.periods).toEqual([{...data.periods[0],end:'2026-10-20'}]);expect(saved.days).toEqual(data.days);
  await page.getByRole('button',{name:/^2026-10-24/}).click();await expect(yes(page)).toBeDisabled();await expect(no(page)).toBeDisabled();
});
test('historical insertion with later record immediately requires bounded end and protects later record',async({page})=>{
  const data={...emptyData(),periods:[{id:'later',start:'2026-10-21',extra:'safe'}]};
  await seed(page,data);await page.getByRole('button',{name:/^2026-10-10/}).click();await yes(page).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toContainText('相邻记录分别保留，不自动合并');
  expect((await read(page)).periods).toEqual(data.periods);
  await dialog.getByLabel('本次结束日期').fill('2026-10-21');await dialog.getByRole('button',{name:'保存补录经期'}).click();await expect(dialog.getByRole('alert')).toContainText('重叠');
  await dialog.getByLabel('本次结束日期').fill('2026-10-20');await dialog.getByRole('button',{name:'保存补录经期'}).click();await expect(dialog).not.toBeVisible();
  const saved=await read(page);expect(saved.periods).toHaveLength(2);expect(saved.periods[0]).toEqual(data.periods[0]);expect(saved.periods[1]).toMatchObject({start:'2026-10-10',end:'2026-10-20'});
});
test('historical insertion without later record covers selected through today',async({page})=>{
  await seed(page,emptyData());await page.getByRole('button',{name:/^2026-10-10/}).click();await yes(page).click();
  expect((await read(page)).periods).toMatchObject([{start:'2026-10-10'}]);
  await page.getByRole('button',{name:'今天',exact:true}).click();await expect(yes(page)).toHaveAttribute('aria-pressed','true');await no(page).click();
  expect((await read(page)).periods).toMatchObject([{start:'2026-10-10',end:'2026-10-22'}]);
});
test('failed toggle save keeps latest state and retry persists it without touching daily records',async({page})=>{
  const data={...emptyData(),days:{'2026-10-23':{date:'2026-10-23',symptoms:['腹痛'],legacy:'safe'}}};
  await seed(page,data);
  await page.evaluate(()=>{
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>) {
      if(this.transaction.db.name==='cozy-days-period') {IDBObjectStore.prototype.put=put;throw new DOMException('Synthetic quota failure','QuotaExceededError');}
      return put.apply(this,args);
    };
  });
  await yes(page).click();await expect(page.getByRole('alert')).toContainText('保存失败');await expect(yes(page)).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'重试',exact:true}).click();const saved=await read(page);expect(saved.days).toEqual(data.days);expect(saved.periods).toMatchObject([{start:'2026-10-23'}]);
  await page.reload();await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();await expect(yes(page)).toHaveAttribute('aria-pressed','true');
});
test('legacy unknown fields survive period editor, settings and daily edits',async({page})=>{
  const data={...emptyData(),legacy:'root',settings:{cycleLength:28,periodLength:5,legacy:'settings'},periods:[{id:'old',start:'2026-10-01',end:'2026-10-05',legacy:'period'}],days:{'2026-10-23':{date:'2026-10-23',symptoms:[],legacy:'daily'}}};
  await seed(page,data);
  await page.getByRole('button',{name:'开心',exact:true}).click();
  await page.getByRole('button',{name:'周期设置',exact:true}).click();await page.getByLabel('默认周期长度（天）').fill('30');await page.getByRole('button',{name:'保存周期设置'}).click();
  await page.locator('.period-history-link').click();await page.getByRole('button',{name:'修改 2026-10-01'}).click();await page.getByLabel('结束日期（进行中可留空）').fill('2026-10-04');await page.getByRole('button',{name:'保存经期记录'}).click();
  const saved=await read(page) as typeof data;
  expect(saved.legacy).toBe('root');expect(saved.settings.legacy).toBe('settings');expect(saved.periods[0].legacy).toBe('period');expect(saved.days['2026-10-23'].legacy).toBe('daily');
});
