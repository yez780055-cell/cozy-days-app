import { test, expect } from '@playwright/test';

test('history deletion failure is visible inside the modal and can be retried', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-23T04:00:00Z')});
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();
  await page.getByRole('button',{name:'记录第一次经期',exact:true}).click();
  await page.getByLabel('开始日期',{exact:true}).fill('2026-10-01');
  await page.getByLabel('结束日期（进行中可留空）').fill('2026-10-05');
  await page.getByRole('button',{name:'保存经期记录'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.period-history-link').click();
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(this.transaction.db.name==='cozy-days-period')throw new DOMException('Synthetic quota','QuotaExceededError');return put.apply(this,args);};(window as unknown as {restoreWrites:()=>void}).restoreWrites=()=>{IDBObjectStore.prototype.put=put;};});
  await page.getByRole('button',{name:'删除 2026-10-01',exact:true}).click();
  await page.getByRole('button',{name:'确认删除',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('尚未保存');
  expect(await page.evaluate(async()=>{const path='/src/features/period/repository.ts';const {periodRepository}=await import(path);return (await periodRepository.load()).periods.length;})).toBe(1);
  await page.screenshot({path:'artifacts/integration/m5/history-delete-failure.png'});
  await page.evaluate(()=>(window as unknown as {restoreWrites:()=>void}).restoreWrites());
  await dialog.getByRole('button',{name:'重试保存',exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();
  await expect(page.locator('.period-empty')).toBeVisible();
});
