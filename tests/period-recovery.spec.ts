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
 await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage && k.startsWith('cozy-days-period-recovery-v1'))throw new DOMException('Synthetic quota');return set.call(this,k,v);};});
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
 await page.evaluate(async()=>{const path='/src/features/period/repository.ts';const {periodRepository}=await import(path);const save=periodRepository.save;let first=true;periodRepository.save=async(value:unknown,expected:string)=>{if(first){first=false;await new Promise<void>(resolve=>{(window as unknown as {release:()=>void}).release=resolve;});}return save(value,expected);};});
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
 const id=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('cozy-days-period-recovery-v1')!).pending.data.periods[0].id);
 await page.reload();await open(page);await page.getByRole('button',{name:'保存经期记录'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.period-storage')).toContainText('记录仅保存在');
 expect(await page.evaluate(async()=>{const path='/src/features/period/repository.ts';const {periodRepository}=await import(path);return (await periodRepository.load()).periods.map((x:{id:string})=>x.id);})).toEqual([id]);
});

test('malformed draft shapes do not crash or corrupt a valid database',async({page})=>{
 await page.evaluate(()=>{localStorage.setItem('cozy-days-period-recovery-v1',JSON.stringify({stamp:Date.now(),drafts:{view:{dialog:'editor',editing:{id:4}},'editor-new':{id:3,start:null,end:[]},settings:{cycle:{},period:null}}}));sessionStorage.removeItem('cozy-days-period-recovery-v1');});
 await page.reload();await open(page);await page.getByRole('button',{name:'记录第一次经期',exact:true}).click();await expect(page.getByLabel('开始日期',{exact:true})).toHaveValue(/\d{4}-\d{2}-\d{2}/);await page.keyboard.press('Escape');await page.getByRole('button',{name:'周期设置',exact:true}).click();await expect(page.getByLabel('默认周期长度（天）')).toHaveValue('28');
});

test('external newer database is not silently overwritten by the mounted session',async({page})=>{
 await page.evaluate(async()=>{const req=indexedDB.open('cozy-days-period');await new Promise<void>(resolve=>{req.onsuccess=()=>{const tx=req.result.transaction('state','readwrite');tx.objectStore('state').put({id:'local',value:{periods:[{id:'external',start:'2026-10-01',end:'2026-10-05'}],days:{},settings:{cycleLength:28,periodLength:5}}});tx.oncomplete=()=>{req.result.close();resolve();};};});});
 await page.getByRole('button',{name:'开心',exact:true}).click();await expect(page.getByRole('alert')).toContainText('冲突');await expect(page.getByRole('button',{name:'使用记录库版本'})).toBeVisible();
 await page.getByRole('button',{name:'使用记录库版本'}).click();await expect(page.locator('.period-history-link b')).toHaveText('10月1日10月5日');await page.getByRole('button',{name:'查看恢复备份'}).click();await expect(page.getByRole('dialog')).toContainText('2026-10-01');await expect(page.getByRole('dialog').getByRole('button',{name:'导出备份'}).first()).toBeVisible();
});

test('sparse period array is rejected without crashing or clearing the original',async({page})=>{
 await page.evaluate(async()=>{const req=indexedDB.open('cozy-days-period');await new Promise<void>(resolve=>{req.onsuccess=()=>{const tx=req.result.transaction('state','readwrite');tx.objectStore('state').put({id:'local',value:{periods:new Array(1),days:{},settings:{cycleLength:28,periodLength:5}}});tx.oncomplete=()=>{req.result.close();resolve();};};});});
 await page.reload();await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();await expect(page.getByRole('alert')).toContainText('原数据已保留');await expect(page.locator('.period-calendar')).toHaveCount(0);
});

test('replacement requires confirmation and refuses unreliable backup storage',async({page})=>{
 await page.evaluate(async()=>{const req=indexedDB.open('cozy-days-period');await new Promise<void>(resolve=>{req.onsuccess=()=>{const tx=req.result.transaction('state','readwrite');tx.objectStore('state').put({id:'local',value:{periods:[{id:'external',start:'2026-10-01',end:'2026-10-05'}],days:{},settings:{cycleLength:28,periodLength:5}}});tx.oncomplete=()=>{req.result.close();resolve();};};});});await page.getByRole('button',{name:'开心',exact:true}).click();await expect(page.getByRole('alert')).toContainText('冲突');
 await page.getByRole('button',{name:'恢复草稿版本',exact:true}).click();await expect(page.getByText('草稿将替换当前记录库的全部生理期记录。',{exact:false})).toBeVisible();
 await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage)throw new DOMException('Synthetic quota');return set.call(this,k,v);};});await page.getByRole('button',{name:'确认替换记录库'}).click();await expect(page.getByRole('alert')).toContainText('无法可靠保存');await expect(page.locator('.period-calendar')).toHaveCount(0);
 await page.getByRole('button',{name:'使用记录库版本'}).click();await expect(page.locator('.period-history-link b')).toHaveText('10月1日10月5日');await page.getByRole('button',{name:'查看恢复备份'}).click();const download=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'导出备份'}).first().click();expect((await download).suggestedFilename()).toBe('cozy-days-period-recovery.json');
});

test('archived versions can be explicitly restored after confirmation',async({page})=>{
 await failWrites(page);await page.getByRole('button',{name:'开心',exact:true}).click();await expect(page.getByRole('alert')).toContainText('保存失败');
 await page.evaluate(async()=>{const req=indexedDB.open('cozy-days-period');await new Promise<void>(resolve=>{req.onsuccess=()=>{const tx=req.result.transaction('state','readwrite');tx.objectStore('state').add({id:'local',value:{periods:[{id:'backup',start:'2026-10-01',end:'2026-10-05'}],days:{},settings:{cycleLength:28,periodLength:5}}});tx.oncomplete=()=>{req.result.close();resolve();};};});});
 await page.reload();await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();await expect(page.getByRole('alert')).toContainText('冲突');await page.getByRole('button',{name:'恢复草稿版本',exact:true}).click();await page.getByRole('button',{name:'确认替换记录库'}).click();await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.locator('.period-storage')).toContainText('记录仅保存在');await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'查看恢复备份'}).click();await page.getByRole('button',{name:'恢复此副本的记录库版本'}).first().click();await page.getByRole('button',{name:'恢复草稿版本',exact:true}).click();await page.getByRole('button',{name:'确认替换记录库'}).click();await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.locator('.period-history-link b')).toHaveText('10月1日10月5日');await page.reload();await open(page);await expect(page.locator('.period-history-link b')).toHaveText('10月1日10月5日');
});

test('repository rejects malformed writes before changing the database',async({page})=>{
 expect(await page.evaluate(async()=>{const path='/src/features/period/repository.ts';const {periodRepository}=await import(path);const value=await periodRepository.load();try{await periodRepository.save({...value,periods:new Array(1)},JSON.stringify(value));return false;}catch{return JSON.stringify(await periodRepository.load())===JSON.stringify(value);}})).toBeTruthy();
});

test('retired fields remain opaque through diary autosave, failure recovery and reload',async({page})=>{
 const legacy = {
   periods:[{id:'legacy-period',start:'2026-10-01',end:'2026-10-05'}],
   days:{'2026-10-02':{date:'2026-10-02',flow:'较少',symptoms:['腹痛'],mood:'平静'}},
   reminders:[{id:'legacy-reminder',text:'旧版保留数据',completed:true}],
   settings:{cycleLength:31,periodLength:6},
 };
 await page.evaluate(async value=>{
   const req=indexedDB.open('cozy-days-period');
   await new Promise<void>((resolve,reject)=>{req.onsuccess=()=>{
     const tx=req.result.transaction('state','readwrite');
     tx.objectStore('state').put({id:'local',value});
     tx.objectStore('state').put({id:'unrelated',value:{marker:'keep'}});
     tx.oncomplete=()=>{req.result.close();resolve();};tx.onerror=()=>reject(tx.error);
   };});
 },legacy);
 await page.reload();await open(page);
 await expect(page.getByRole('heading',{name:/贴心提醒|生理期小贴士/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/新建提醒|删除提醒|查看小贴士详情/})).toHaveCount(0);
 await expect(page.locator('.period-reminders, .period-tips, .period-art--tips')).toHaveCount(0);
 await page.getByRole('button',{name:'开心',exact:true}).click();
 await expect(page.locator('.period-storage')).toContainText('记录仅保存在');
 await failWrites(page);await page.getByRole('button',{name:'疲惫',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('保存失败');
 await page.reload();await open(page);
 await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'疲惫',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'重试',exact:true}).click();
 await expect(page.locator('.period-storage')).toContainText('记录仅保存在');
 await page.reload();await open(page);
 const stored=await page.evaluate(async()=>{
   const req=indexedDB.open('cozy-days-period');
   return new Promise<{id:string;value:unknown}[]>(resolve=>{req.onsuccess=()=>{
     const get=req.result.transaction('state').objectStore('state').getAll();
     get.onsuccess=()=>{req.result.close();resolve(get.result);};
   };});
 });
 expect(stored.find(row=>row.id==='unrelated')?.value).toEqual({marker:'keep'});
 expect(stored.find(row=>row.id==='local')?.value).toMatchObject(legacy);
 await expect(page.getByRole('button',{name:'疲惫',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('new records omit retired fields and optimistic comparison retains legacy changes',async({page})=>{
 const result=await page.evaluate(async()=>{
   const path='/src/features/period/repository.ts';
   const {periodRepository,PeriodConflictError}=await import(path);
   const initial=await periodRepository.load();
   const first={...initial,reminders:[{id:'legacy',text:'v1',completed:false}]};
   await periodRepository.save(first,JSON.stringify(initial));
   const loaded=await periodRepository.load();
   const newer={...first,reminders:[{id:'legacy',text:'v2',completed:true}]};
   await periodRepository.save(newer,JSON.stringify(loaded));
   let conflict=false;
   try {await periodRepository.save({...loaded,settings:{cycleLength:30,periodLength:5}},JSON.stringify(loaded));}
   catch(error) {conflict=error instanceof PeriodConflictError;}
   return {hasRetiredField:Object.hasOwn(initial,'reminders'),loaded,conflict,current:await periodRepository.load(),newer};
 });
 expect(result.hasRetiredField).toBe(false);
 expect(result.loaded).toHaveProperty('reminders',[{id:'legacy',text:'v1',completed:false}]);
 expect(result.conflict).toBe(true);
 expect(result.current).toEqual(result.newer);
});

test('one slow load survives page unmount without a competing old load',async({page})=>{
 await page.reload();await page.evaluate(async()=>{const path='/src/features/period/repository.ts';const {periodRepository}=await import(path);const load=periodRepository.load;let calls=0;periodRepository.load=()=>{calls++;(window as unknown as {loadCalls:number}).loadCalls=calls;return new Promise(resolve=>{(window as unknown as {finishLoad:()=>void}).finishLoad=async()=>resolve(await load());});};});
 await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();await expect(page.getByText('正在打开你的手账…')).toBeVisible();await page.getByRole('navigation').getByRole('button',{name:'待办',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();expect(await page.evaluate(()=>(window as unknown as {loadCalls:number}).loadCalls)).toBe(1);await page.evaluate(()=>(window as unknown as {finishLoad:()=>void}).finishLoad());await expect(page.locator('.period-calendar')).toBeVisible();
});

for(const [instant,hour] of [['2026-03-08T09:59:50Z',3],['2026-11-01T08:59:50Z',1]] as const)test(`DST clock change preserves date draft ${instant}`,async({browser})=>{
 const context=await browser.newContext({timezoneId:'America/Los_Angeles'});const p=await context.newPage();await p.clock.install({time:new Date(instant)});await p.goto('/');await open(p);await p.getByRole('button',{name:'记录第一次经期',exact:true}).click();const date=await p.getByLabel('开始日期',{exact:true}).inputValue();await p.clock.fastForward(40000);await p.evaluate(()=>window.dispatchEvent(new Event('focus')));expect(await p.evaluate(()=>new Date().getHours())).toBe(hour);await expect(p.getByLabel('开始日期',{exact:true})).toHaveValue(date);await context.close();
});

async function seedRecoveryArchive(page:Page) {
 await page.evaluate(async()=>{const path='/src/features/period/recovery.ts';const {archiveConflict}=await import(path);const database={periods:[],days:{},settings:{cycleLength:28,periodLength:5}};archiveConflict({database,draft:{...database,periods:[{id:'old',start:'2026-10-01',end:'2026-10-05'}]}});});
 await page.getByRole('navigation').getByRole('button',{name:'待办',exact:true}).click();await open(page);
}
test('historical recovery locks immediately during slow read and remount does not start another load',async({page})=>{
 await seedRecoveryArchive(page);await page.getByRole('button',{name:'查看恢复备份'}).click();
 await page.evaluate(async()=>{const path='/src/features/period/repository.ts';const {periodRepository}=await import(path);const load=periodRepository.load;let calls=0;periodRepository.load=()=>{calls++;(window as unknown as {restoreLoads:number}).restoreLoads=calls;return new Promise(resolve=>{(window as unknown as {finishRestore:()=>void}).finishRestore=async()=>resolve(await load());});};});
 await page.getByRole('button',{name:'恢复此副本的草稿版本'}).first().click();await expect(page.locator('.period-calendar')).toHaveCount(0);await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveCount(0);
 await page.getByRole('navigation').getByRole('button',{name:'待办',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();expect(await page.evaluate(()=>(window as unknown as {restoreLoads:number}).restoreLoads)).toBe(1);await page.evaluate(()=>(window as unknown as {finishRestore:()=>void}).finishRestore());await expect(page.getByRole('alert')).toContainText('确认');
});

test('historical recovery archives the latest failed pending diary before switching sources',async({page})=>{
 await seedRecoveryArchive(page);await failWrites(page);await page.getByRole('button',{name:'开心',exact:true}).click();await expect(page.getByRole('alert')).toContainText('保存失败');await page.getByRole('button',{name:'查看恢复备份'}).click();await page.getByRole('button',{name:'恢复此副本的草稿版本'}).first().click();await expect(page.getByRole('alert')).toContainText('确认');await page.getByRole('button',{name:'使用记录库版本'}).click();await page.getByRole('button',{name:'查看恢复备份'}).click();await expect(page.getByRole('dialog')).toContainText('开心');
 await page.getByRole('dialog').getByRole('button',{name:'恢复此副本的草稿版本'}).nth(1).click();await page.getByRole('button',{name:'恢复草稿版本',exact:true}).click();await page.getByRole('button',{name:'确认替换记录库'}).click();await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('historical recovery cannot discard pending changes when local backup fails',async({page})=>{
 await seedRecoveryArchive(page);await failWrites(page);await page.getByRole('button',{name:'开心',exact:true}).click();await expect(page.getByRole('alert')).toContainText('保存失败');
 await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage)throw new DOMException('Synthetic denied');return set.call(this,k,v);};});
 await page.getByRole('button',{name:'查看恢复备份'}).click();await page.getByRole('button',{name:'恢复此副本的草稿版本'}).first().click();await expect(page.getByRole('alert')).toContainText('恢复未开始');await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('navigation').getByRole('button',{name:'待办',exact:true}).click();await open(page);await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('another tab cannot erase a failed diary backup when its original tab closes',async({page,context})=>{
 const other=await context.newPage();await other.goto('/');await open(other);
 await failWrites(page);await page.getByRole('button',{name:'开心',exact:true}).click();await expect(page.getByRole('alert')).toContainText('保存失败');await expect(other.getByRole('button',{name:'查看恢复备份'})).toBeVisible();
 await other.getByRole('button',{name:'周期设置',exact:true}).click();await other.getByLabel('默认周期长度（天）').fill('31');await other.keyboard.press('Escape');await expect(other.getByRole('dialog')).toHaveCount(0);await page.close();
 const survivor=await context.newPage();await survivor.goto('/');await open(survivor);await expect(survivor.getByRole('button',{name:'查看恢复备份'})).toBeVisible();await survivor.getByRole('button',{name:'查看恢复备份'}).click();await expect(survivor.getByRole('dialog')).toContainText('开心');
 await survivor.getByRole('button',{name:'恢复此副本的草稿版本'}).first().click();await survivor.getByRole('button',{name:'恢复草稿版本',exact:true}).click();await survivor.getByRole('button',{name:'确认替换记录库'}).click();await survivor.getByRole('button',{name:'重试',exact:true}).click();await expect(survivor.locator('.period-storage')).toContainText('记录仅保存在');await expect(survivor.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');await other.close();await survivor.close();
});

test('newer device draft survives reload when session writes fail',async({page})=>{
 await page.getByRole('button',{name:'记录第一次经期',exact:true}).click();await page.getByLabel('开始日期',{exact:true}).fill('2026-10-01');
 await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===sessionStorage)throw new DOMException('Synthetic quota');return set.call(this,k,v);};});await page.getByLabel('结束日期（进行中可留空）').fill('2026-10-02');await page.reload();await open(page);await expect(page.getByLabel('结束日期（进行中可留空）')).toHaveValue('2026-10-02');
});
