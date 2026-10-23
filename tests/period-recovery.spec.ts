import { test, expect, type Page } from '@playwright/test';
async function open(page:Page) { await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click(); await expect(page.locator('.period-calendar')).toBeVisible(); }
async function failWrites(page:Page) { await page.evaluate(()=>{const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>) {if(this.transaction.db.name==='cozy-days-period') throw new DOMException('Synthetic failure','QuotaExceededError');return put.apply(this,args);};}); }
test.beforeEach(async({page})=>{await page.goto('/');await open(page);});
test('failed diary survives leaving and refreshing without claiming a database save',async({page})=>{
 await failWrites(page);await page.getByRole('button',{name:'开心',exact:true}).click();await expect(page.getByRole('alert')).toContainText('保存失败');
 await page.getByRole('navigation').getByRole('button',{name:'待办',exact:true}).click();await open(page);
 await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();await open(page);await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('alert')).toContainText('尚未');await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.locator('.period-storage')).toContainText('记录仅保存在');
});
test('raw editor and settings drafts survive navigation and refresh; failed save keeps editor open',async({page})=>{
 await page.getByRole('button',{name:'记录第一次经期',exact:true}).click();await page.getByLabel('开始日期',{exact:true}).fill('2026-10-01');
 await page.getByRole('navigation').getByRole('button',{name:'待办',exact:true}).evaluate(el=>(el as HTMLButtonElement).click());await open(page);
 await expect(page.getByLabel('开始日期',{exact:true})).toHaveValue('2026-10-01');await page.reload();await open(page);await expect(page.getByLabel('开始日期',{exact:true})).toHaveValue('2026-10-01');
 await failWrites(page);await page.getByRole('button',{name:'保存经期记录'}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('开始日期',{exact:true})).toHaveValue('2026-10-01');
});

test('settings raw empty input survives refresh and failed settings save stays open',async({page})=>{
 await page.getByRole('button',{name:'周期设置',exact:true}).click();await page.getByLabel('默认周期长度（天）').fill('');await page.reload();await open(page);
 await expect(page.getByLabel('默认周期长度（天）')).toHaveValue('');await page.getByLabel('默认周期长度（天）').fill('31');await failWrites(page);await page.getByRole('button',{name:'保存周期设置'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('默认周期长度（天）')).toHaveValue('31');
});

test('newer session fallback beats stale local backup; retry identity remains stable',async({page})=>{
 await failWrites(page);await page.getByRole('button',{name:'开心',exact:true}).click();await expect(page.getByRole('alert')).toContainText('保存失败');
 await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage && k==='cozy-days-period-recovery-v1')throw new DOMException('Synthetic quota');return set.call(this,k,v);};});
 await page.getByRole('button',{name:'腹痛',exact:true}).click();await expect(page.locator('.period-storage')).toContainText('标签页');await page.reload();await open(page);
 await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'腹痛',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.locator('.period-storage')).toContainText('记录仅保存在');
});

test('stale recovery cannot overwrite a newer database after backup cleanup fails',async({page})=>{
 await failWrites(page);await page.getByRole('button',{name:'开心',exact:true}).click();await expect(page.getByRole('alert')).toContainText('保存失败');
 await page.reload();await open(page);
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic quota');};});
 await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.locator('.period-storage')).toContainText('记录仅保存在');
 await page.getByRole('button',{name:'腹痛',exact:true}).click();await expect(page.locator('.period-storage')).toContainText('记录仅保存在');
 await page.reload();await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();await expect(page.getByRole('alert')).toContainText('冲突');await expect(page.locator('.period-calendar')).toHaveCount(0);
 await page.getByRole('button',{name:'使用记录库版本'}).click();await expect(page.getByRole('button',{name:'腹痛',exact:true})).toHaveAttribute('aria-pressed','true');await page.reload();await open(page);await expect(page.getByRole('button',{name:'腹痛',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('all recovery storage unavailable is explicit; memory survives navigation',async({page})=>{
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic denied','SecurityError');};});await failWrites(page);
 await page.getByRole('button',{name:'开心',exact:true}).click();await expect(page.locator('.period-storage')).toContainText('仅内存');await expect(page.locator('.period-storage')).toContainText('刷新');
 await page.getByRole('navigation').getByRole('button',{name:'待办',exact:true}).click();await open(page);await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('malformed period database is preserved and todo remains usable',async({page})=>{
 await page.evaluate(async()=>{const req=indexedDB.open('cozy-days-period');await new Promise<void>((resolve,reject)=>{req.onsuccess=()=>{const tx=req.result.transaction('state','readwrite');tx.objectStore('state').put({id:'local',value:{periods:'broken',marker:'keep-original'}});tx.oncomplete=()=>{req.result.close();resolve();};tx.onerror=()=>reject(tx.error);};});});
 await page.reload();await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();await expect(page.getByRole('alert')).toContainText('原数据已保留');await expect(page.locator('.period-calendar')).toHaveCount(0);await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByRole('alert')).toContainText('原数据已保留');
 await page.getByRole('navigation').getByRole('button',{name:'待办',exact:true}).click();await page.getByRole('button',{name:'新增待办',exact:true}).click();await page.getByRole('textbox',{name:'想做些什么？'}).fill('隔离仍可写');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('button',{name:'编辑：隔离仍可写',exact:true})).toBeVisible();
 expect(await page.evaluate(async()=>{const req=indexedDB.open('cozy-days-period');return new Promise(resolve=>{req.onsuccess=()=>{const get=req.result.transaction('state').objectStore('state').get('local');get.onsuccess=()=>{req.result.close();resolve(get.result.value.marker);};};});})).toBe('keep-original');
});

test('slow old writes cannot replace rapid newer edits across unmount',async({page})=>{
 await page.evaluate(async()=>{const path='/src/features/period/repository.ts';const {periodRepository}=await import(path);const save=periodRepository.save;let first=true;periodRepository.save=async(value:unknown)=>{if(first){first=false;await new Promise<void>(resolve=>{(window as unknown as {release:()=>void}).release=resolve;});}return save(value);};});
 await page.getByRole('button',{name:'开心',exact:true}).click();await expect(page.locator('.period-storage')).toContainText('正在保存');await page.getByRole('navigation').getByRole('button',{name:'待办',exact:true}).click();await open(page);await page.getByRole('button',{name:'腹痛',exact:true}).click();await page.getByRole('button',{name:'疲惫',exact:true}).click();await page.evaluate(()=>(window as unknown as {release:()=>void}).release());await expect(page.locator('.period-storage')).toContainText('记录仅保存在');
 await page.reload();await open(page);for(const name of ['开心','腹痛','疲惫'])await expect(page.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
});

test('360x480 settings and editor actions remain reachable',async({page})=>{
 await page.setViewportSize({width:360,height:480});await page.getByRole('button',{name:'周期设置',exact:true}).click();await page.getByRole('button',{name:'保存周期设置'}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'保存周期设置'})).toBeInViewport();await page.screenshot({path:'artifacts/integration/m2/period-360x480-settings.png'});await page.keyboard.press('Escape');await page.getByRole('button',{name:'记录第一次经期',exact:true}).click();await page.getByRole('button',{name:'保存经期记录'}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'保存经期记录'})).toBeInViewport();expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();await page.screenshot({path:'artifacts/integration/m2/period-360x480-editor.png'});
});

for(const zone of ['Pacific/Kiritimati','America/Los_Angeles'])test(`local midnight focus preserves draft in ${zone}`,async({browser})=>{
 const context=await browser.newContext({timezoneId:zone,viewport:{width:393,height:852}});const p=await context.newPage();await p.clock.install({time:new Date(zone==='Pacific/Kiritimati'?'2026-10-22T09:59:50Z':'2026-03-08T07:59:50Z')});await p.goto('/');await open(p);
 await p.getByRole('button',{name:'记录第一次经期',exact:true}).click();const input=p.getByLabel('开始日期',{exact:true});const original=await input.inputValue();await p.clock.fastForward(40000);await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(input).toHaveValue(original);await p.keyboard.press('Escape');await p.getByRole('button',{name:'今天',exact:true}).click();await expect(p.locator('.period-date.today')).toHaveCount(1);await context.close();
});

test('failed untouched new form retries with the same identity after refresh',async({page})=>{
 await page.getByRole('button',{name:'记录第一次经期',exact:true}).click();await failWrites(page);await page.getByRole('button',{name:'保存经期记录'}).click();await expect(page.getByRole('dialog')).toBeVisible();
 const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('cozy-days-period-recovery-v1')!).pending.data.periods[0].id);
 await page.reload();await open(page);await page.getByRole('button',{name:'保存经期记录'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.period-storage')).toContainText('记录仅保存在');
 expect(await page.evaluate(async()=>{const path='/src/features/period/repository.ts';const {periodRepository}=await import(path);return (await periodRepository.load()).periods.map((x:{id:string})=>x.id);})).toEqual([id]);
});

test('malformed draft shapes do not crash or corrupt a valid database',async({page})=>{
 await page.evaluate(()=>{localStorage.setItem('cozy-days-period-recovery-v1',JSON.stringify({stamp:Date.now(),drafts:{view:{dialog:'editor',editing:{id:4}},'editor-new':{id:3,start:null,end:[]},settings:{cycle:{},period:null}}}));sessionStorage.removeItem('cozy-days-period-recovery-v1');});
 await page.reload();await open(page);await page.getByRole('button',{name:'记录第一次经期',exact:true}).click();await expect(page.getByLabel('开始日期',{exact:true})).toHaveValue(/\d{4}-\d{2}-\d{2}/);await page.keyboard.press('Escape');await page.getByRole('button',{name:'周期设置',exact:true}).click();await expect(page.getByLabel('默认周期长度（天）')).toHaveValue('28');
});
