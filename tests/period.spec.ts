import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const evidence='public/review/period/evidence';
test.beforeEach(async({page})=>{
  await page.clock.install({time:new Date('2026-10-23T04:00:00Z')});
  await page.addInitScript(()=>localStorage.setItem('cozy-days.settings-hint-seen','1'));
  await page.goto('/');
});
async function open(page:Page) { await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click(); await expect(page.locator('.period-calendar')).toBeVisible(); }
async function add(page:Page,start:string,end?:string) {
  await page.getByRole('button',{name:/^记录第一次经期$|^记录经期$/}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('开始日期',{exact:true}).fill(start);
  if(end) await dialog.getByLabel('结束日期（进行中可留空）').fill(end);
  await dialog.getByRole('button',{name:'保存经期记录'}).click();
  await expect(dialog).not.toBeVisible();
}
async function shot(page:Page,name:string) {mkdirSync(evidence,{recursive:true});await page.screenshot({path:`${evidence}/${name}.png`,animations:'disabled'});}
async function saved(page:Page) { await expect(page.locator('.period-storage')).toContainText('记录仅保存在'); }

test('empty state, historical cycles, calendar, diary persistence, settings and evidence',async({page})=>{
  await open(page); await expect(page.locator('.period-empty')).toContainText('还没有经期记录');
  await page.locator('.period-empty').scrollIntoViewIfNeeded();
  await shot(page,'04-empty');
  await add(page,'2026-09-25','2026-09-29');
  await add(page,'2026-10-23');
  await saved(page);
  await page.locator('.period-page').evaluate(el=>el.scrollTop=0); await shot(page,'01-home');
  await page.getByRole('button',{name:/^2026-10-22/}).click();
  await expect(page.locator('.period-selected')).toContainText('10月22日'); await shot(page,'02-calendar-selected');
  await page.getByRole('button',{name:'今天',exact:true}).click();
  await page.getByRole('button',{name:'较多',exact:true}).click();
  await page.getByRole('button',{name:'腹痛',exact:true}).click();
  await page.getByRole('button',{name:'疲惫',exact:true}).click();
  await page.getByRole('button',{name:'开心',exact:true}).click();
  await saved(page);
  await page.locator('.period-daily').scrollIntoViewIfNeeded(); await shot(page,'03-daily-selected');
  await page.getByRole('button',{name:'周期设置',exact:true}).click();
  await page.getByLabel('默认周期长度（天）').fill('30');
  await page.getByRole('button',{name:'保存周期设置'}).click();
  // Historical 28 days takes priority over fallback 30.
  await expect(page.locator('.period-averages')).toContainText('28');
  await page.locator('.period-summary').scrollIntoViewIfNeeded(); await shot(page,'05-cycle-updated');
  await page.reload(); await open(page);
  await expect(page.locator('.period-averages')).toContainText('28');
  await expect(page.getByRole('button',{name:'较多',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'腹痛',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'疲惫',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/^2026-10-22/}).click();
  await expect(page.getByRole('button',{name:'较多',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'平静',exact:true}).click();
  await page.getByRole('button',{name:'今天',exact:true}).click();
  await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('history edit, overlap rejection, deletion and setting fallback',async({page})=>{
  await open(page); await add(page,'2026-10-01','2026-10-05');
  await page.locator('.period-history-link').click(); await page.getByRole('button',{name:'修改 2026-10-01'}).click();
  await page.getByLabel('结束日期（进行中可留空）').fill('2026-10-04'); await page.getByRole('button',{name:'保存经期记录'}).click();
  await expect(page.locator('.period-averages')).toContainText('4');
  await page.getByRole('button',{name:'记录经期',exact:true}).click(); await page.getByLabel('开始日期',{exact:true}).fill('2026-10-03');
  await page.getByRole('button',{name:'保存经期记录'}).click(); await expect(page.getByRole('alert')).toContainText('重叠'); await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'周期设置',exact:true}).click(); await page.getByLabel('默认周期长度（天）').fill('32'); await page.getByRole('button',{name:'保存周期设置'}).click();
  await expect(page.locator('.period-averages')).toContainText('32');
  await page.locator('.period-history-link').click(); await page.getByRole('button',{name:'删除 2026-10-01'}).click();await page.getByRole('button',{name:'确认删除'}).click(); await page.keyboard.press('Escape');
  await saved(page);await page.reload();await open(page);await expect(page.locator('.period-empty')).toBeVisible();
});

test('month navigation, adjacent date, future diary lock and todo isolation',async({page})=>{
  await page.getByRole('button',{name:'新增待办',exact:true}).click();await page.getByRole('textbox',{name:'想做些什么？'}).fill('保留待办');await page.getByRole('button',{name:'保存',exact:true}).click();
  await open(page);await add(page,'2026-10-01','2026-10-05');
  await page.getByRole('button',{name:'下个月',exact:true}).click();await expect(page.locator('.period-calendar h2')).toHaveText('2026年11月');
  await page.getByRole('button',{name:/^2026-12-01/}).click();await expect(page.locator('.period-calendar h2')).toHaveText('2026年12月');
  await expect(page.getByRole('button',{name:'较多',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'今天',exact:true}).click(); await expect(page.locator('.period-calendar h2')).toHaveText('2026年10月');
  await page.getByRole('navigation').getByRole('button',{name:'待办',exact:true}).click(); await expect(page.getByRole('button',{name:'编辑：保留待办',exact:true})).toBeVisible();
});

for(const viewport of [{width:360,height:740},{width:393,height:852},{width:430,height:932}]) test(`mobile fit ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);await open(page);
  await add(page,'2026-09-25','2026-09-29');await add(page,'2026-10-23');
  expect(await page.locator('.period-page').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
  await expect(page.getByRole('button',{name:'今天',exact:true})).toBeVisible();
  const art=await page.locator('.period-art--header').boundingBox();expect(art?.width).toBeGreaterThan(viewport.width*.54);
  const dash=await page.locator('.period-dashboard').boundingBox();const cal=await page.locator('.period-calendar').boundingBox();const summary=await page.locator('.period-summary').boundingBox();
  expect(cal!.width/(cal!.width+summary!.width)).toBeGreaterThan(.62);expect(cal!.width/(cal!.width+summary!.width)).toBeLessThan(.71);
  mkdirSync('artifacts/v021-g2',{recursive:true});
  await page.screenshot({path:`artifacts/v021-g2/period-${viewport.width}x${viewport.height}-full.png`,fullPage:true,animations:'disabled'});
  await page.screenshot({path:`artifacts/v021-g2/period-${viewport.width}x${viewport.height}-top.png`,animations:'disabled'});
  await page.locator('.period-daily').scrollIntoViewIfNeeded();
  await page.screenshot({path:`artifacts/v021-g2/period-${viewport.width}x${viewport.height}-record.png`,animations:'disabled'});
  await expect(page.getByRole('navigation')).toBeInViewport();
  await page.getByRole('button',{name:'周期设置',exact:true}).click();await expect(page.getByRole('dialog')).toBeInViewport();
});

test('failed save stays visible and retry persists the latest diary; offline writing works',async({page,context})=>{
  await open(page);
  await page.evaluate(()=>{
    const original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>) {
      if(this.transaction.db.name==='cozy-days-period') { IDBObjectStore.prototype.put=original; throw new DOMException('Synthetic failure','QuotaExceededError'); }
      return original.apply(this,args);
    };
  });
  await page.getByRole('button',{name:'开心',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('保存失败');
  await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'重试',exact:true}).click();await saved(page);
  await context.setOffline(true);await page.getByRole('button',{name:'腹痛',exact:true}).click();await saved(page);await context.setOffline(false);
  await page.reload();await open(page);
  await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'腹痛',exact:true})).toHaveAttribute('aria-pressed','true');
});
