import { test, expect } from '@playwright/test';
import { openCycleInfo, openPeriod, recordClosedPeriod } from './period-actions';
test.use({ timezoneId:'Asia/Shanghai' });

test('history deletion failure is visible inside the modal and can be retried', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-23T04:00:00Z')});
  await page.goto('/');
  await openPeriod(page);
  await recordClosedPeriod(page,'2026-10-01','2026-10-05');
  await openCycleInfo(page);
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
  await openPeriod(page);
  await expect(page.getByRole('region',{name:'周期摘要'})).toContainText('暂无周期预测');
});
