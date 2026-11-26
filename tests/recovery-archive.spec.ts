import { test, expect, type Page } from '@playwright/test';

async function openCloud(page: Page, room: string) {
  await page.goto('/');
  await page.evaluate(async room => {
    const localPath='/src/data/localDatabase.ts', periodPath='/src/data/periodDatabase.ts';
    await (await import(localPath)).openCloudDatabase({spaceId:room,userId:'synthetic-user',members:1});
    (await import(periodPath)).useCloudPeriodDatabase();
  }, room);
}

test('recovery backup transfers quarantine, snapshots, outbox and conflicts without replay or replacing destination queue', async ({ browser, baseURL }) => {
  const sourceContext=await browser.newContext(), targetContext=await browser.newContext();
  try {
    const source=await sourceContext.newPage(), target=await targetContext.newPage();
    await openCloud(source, 'source-room'); await openCloud(target, 'target-room');
    const data=await source.evaluate(async () => {
      const localPath='/src/data/localDatabase.ts', backupPath='/src/data/backup.ts';
      const db=(await import(localPath)).database, backup=await import(backupPath);
      const life={id:'life',name:'生活',key:'生活',builtin:true,createdAt:1};
      const todo={id:42,text:'source',date:'2026-11-20',completed:false,createdAt:2,categoryId:'life'};
      const raw={id:50,date:'2023-03-23',calendar:'lunar',lunarDate:{year:2023,month:-2,day:1},unknown:{photo:'raw'}};
      const pending={key:'todo:42',kind:'todo',id:'42',version:3,value:todo,desired:{...todo,text:'pending'},dirty:1,
        attempt:{operation:'a'.repeat(32),version:3,value:{...todo,text:'pending'}}};
      const conflict={operation:'quarantine:anniversary:50:9',kind:'anniversary',recordId:'50',attempted:raw,latest:null,
        reason:'calendar',at:1,remoteVersion:9,rawRecord:{kind:'anniversary',id:'50',version:9,value:raw}};
      const snapshot={id:'cloud:category-reconciliation:synthetic',value:{todo:{...todo,categoryId:'old'},deletedCategoryId:'old',fallbackCategoryId:'life'}};
      await db.categories.put(life); await db.todos.put(todo); await db.syncRecords.put(pending); await db.syncConflicts.put(conflict);
      await db.state.put(snapshot); await db.state.put({id:'cloud:cursor',value:9});
      const result=await backup.exportBackup();
      return {json:result.json,pending,conflict,snapshot};
    });
    const result=await target.evaluate(async ({json}) => {
      const localPath='/src/data/localDatabase.ts', backupPath='/src/data/backup.ts', modelPath='/src/data/backupModel.ts';
      const db=(await import(localPath)).database, backup=await import(backupPath), model=await import(modelPath);
      const todo={id:99,text:'target pending',date:'2026-11-20',completed:false,createdAt:3,categoryId:'life'};
      const pending={key:'todo:99',kind:'todo',id:'99',version:0,value:null,desired:todo,dirty:1,
        attempt:{operation:'b'.repeat(32),version:0,value:todo}};
      await db.categories.put({id:'life',name:'生活',key:'生活',builtin:true,createdAt:1});
      await db.todos.put(todo); await db.syncRecords.put(pending);
      const parsed=model.decodeBackup(json);
      await backup.restoreBackup(parsed,'merge');
      const first=(await db.state.get('backup:recovery-archives-v1')).value;
      await backup.restoreBackup(parsed,'merge');
      const second=(await db.state.get('backup:recovery-archives-v1')).value;
      const exported=await backup.exportBackup();
      return {version:parsed.version,first,second,live:await db.syncRecords.get('todo:99'),pending,
        sourceActive:await db.syncRecords.get('todo:42'),exported:model.decodeBackup(exported.json)};
    }, {json:data.json});
    expect(result.version).toBe(2);
    expect(result.first).toEqual(result.second);
    expect(result.first).toHaveLength(1);
    expect(result.first[0]).toMatchObject({scope:{spaceId:'source-room',userId:'synthetic-user'},cursor:9,
      syncRecords:[data.pending],syncConflicts:[data.conflict],categorySnapshots:[data.snapshot]});
    expect(result.live).toEqual(result.pending);
    expect(result.sourceActive?.attempt).toBeUndefined(); // imported business data has a fresh operation, never the archived attempt
    expect(result.exported.recovery).toEqual(expect.arrayContaining(result.first));
  } finally { await sourceContext.close(); await targetContext.close(); }
});

test('conflicting restore and interrupted cloud restore preserve existing records and the pending attempt', async ({ page }) => {
  await openCloud(page, 'failure-room');
  const result=await page.evaluate(async () => {
    const localPath='/src/data/localDatabase.ts', backupPath='/src/data/backup.ts', modelPath='/src/data/backupModel.ts';
    const db=(await import(localPath)).database, backup=await import(backupPath), model=await import(modelPath);
    const todo={id:7,text:'pending',date:'2026-11-20',completed:false,createdAt:1,categoryId:'life'};
    const pending={key:'todo:7',kind:'todo',id:'7',version:0,value:null,desired:todo,dirty:1,
      attempt:{operation:'c'.repeat(32),version:0,value:todo}};
    await db.categories.put({id:'life',name:'生活',key:'生活',builtin:true,createdAt:1});
    await db.todos.put(todo); await db.syncRecords.put(pending);
    const original=await backup.exportBackup();
    const replacement=model.decodeBackup(original.json);
    replacement.records.todos[0].text='unsafe replacement';
    let rejected=''; try { await backup.restoreBackup(replacement,'replace'); } catch (error) { rejected=(error as Error).message; }
    const unchanged=await db.todos.get(7), queue=await db.syncRecords.get('todo:7');
    const incoming=model.decodeBackup(original.json);
    incoming.records.todos.push({...todo,id:8,text:'new'});
    const put=db.state.put.bind(db.state);
    db.state.put=(row: {id:string}) => row.id==='backup:recovery-archives-v1' ? Promise.reject(new Error('synthetic failure')) : put(row);
    let interrupted=''; try { await backup.restoreBackup(incoming,'merge'); } catch (error) { interrupted=(error as Error).message; }
    db.state.put=put;
    return {rejected,unchanged,queue,pending,interrupted,after:await db.todos.toArray(),saved:await db.state.get('backup:recovery-archives-v1')};
  });
  expect(result.rejected).toContain('尚未同步');
  expect(result.unchanged.text).toBe('pending');
  expect(result.queue).toEqual(result.pending);
  expect(result.interrupted).toContain('synthetic failure');
  expect(result.after).toHaveLength(1);
  expect(result.saved).toBeUndefined();
});

test('legacy version 1 remains readable and malformed recovery data fails closed', async ({ page }) => {
  await page.goto('/');
  const result=await page.evaluate(async () => {
    const path='/src/data/backupModel.ts', model=await import(path);
    const legacy=model.makeBackup({todos:[],categories:[],anniversaries:[],period:null},'0.2.1');
    const decoded=model.decodeBackup(model.encodeBackup(legacy));
    let invalid=''; try { model.decodeBackup(JSON.stringify({...legacy,version:2,recovery:[{scope:null}]})); } catch (error) { invalid=(error as Error).message; }
    return {decoded,invalid};
  });
  expect(result.decoded.version).toBe(1);
  expect(result.invalid).toContain('无效');
});

test('an interrupted local import rolls back business data and leaves recovery archives unchanged', async ({ page }) => {
  await page.goto('/');
  const result=await page.evaluate(async () => {
    const localPath='/src/data/localDatabase.ts', periodPath='/src/data/periodDatabase.ts', backupPath='/src/data/backup.ts', modelPath='/src/data/backupModel.ts';
    const db=(await import(localPath)).database, period=(await import(periodPath)).periodDatabase;
    const backup=await import(backupPath), model=await import(modelPath);
    const before=await backup.exportBackup();
    const incoming=model.decodeBackup(before.json);
    incoming.records.todos.push({id:999,text:'do not commit',date:'2026-11-20',completed:false,createdAt:1,categoryId:incoming.records.categories[0].id});
    incoming.version=2;
    incoming.recovery=[{scope:{spaceId:'other',userId:'synthetic'},cursor:7,syncRecords:[],syncConflicts:[{raw:'retained'}],categorySnapshots:[]}];
    const put=period.state.put.bind(period.state);
    period.state.put=(row: {id:string}) => row.id==='backup:recovery-archives-v1' ? Promise.reject(new Error('synthetic failure')) : put(row);
    let error=''; try { await backup.restoreBackup(incoming,'merge'); } catch (reason) { error=(reason as Error).message; }
    period.state.put=put;
    const after=await backup.exportBackup();
    return {error,before:before.backup.records,after:after.backup.records,archive:await period.state.get('backup:recovery-archives-v1'),journal:await period.state.get('backup:undo-v1')};
  });
  expect(result.error).toContain('原数据均已恢复');
  expect(result.after).toEqual(result.before);
  expect(result.archive).toBeUndefined();
  expect(result.journal).toBeUndefined();
});

test('same-account import restores quarantine and category evidence without overwriting existing evidence', async ({ browser }) => {
  const sourceContext=await browser.newContext(), targetContext=await browser.newContext();
  try {
    const source=await sourceContext.newPage(), target=await targetContext.newPage();
    await openCloud(source,'same-room'); await openCloud(target,'same-room');
    const json=await source.evaluate(async () => {
      const localPath='/src/data/localDatabase.ts', backupPath='/src/data/backup.ts';
      const db=(await import(localPath)).database;
      const raw={date:'2023-03-23',calendar:'lunar',lunarDate:{year:2023,month:-2,day:1},unknown:'raw'};
      await db.syncConflicts.put({operation:'quarantine:anniversary:5:8',kind:'anniversary',recordId:'5',reason:'calendar',at:1,
        attempted:raw,latest:null,remoteVersion:8,rawRecord:{kind:'anniversary',id:'5',version:8,value:raw}});
      await db.state.put({id:'cloud:category-reconciliation:source',value:{todo:{id:10,categoryId:'old'},deletedCategoryId:'old',fallbackCategoryId:'life'}});
      return (await (await import(backupPath)).exportBackup()).json;
    });
    const result=await target.evaluate(async json => {
      const localPath='/src/data/localDatabase.ts', backupPath='/src/data/backup.ts', modelPath='/src/data/backupModel.ts';
      const db=(await import(localPath)).database, backup=await import(backupPath), model=await import(modelPath);
      const existing={operation:'other',kind:'todo',recordId:'77',attempted:{text:'existing'},latest:null,reason:'version',at:2};
      await db.syncConflicts.put(existing);
      await backup.restoreBackup(model.decodeBackup(json),'merge');
      const first=await db.syncConflicts.toArray(), snapshot=await db.state.get('cloud:category-reconciliation:source');
      await backup.restoreBackup(model.decodeBackup(json),'merge');
      return {first,second:await db.syncConflicts.toArray(),snapshot,existing};
    },json);
    expect(result.first).toEqual(result.second);
    expect(result.first).toEqual(expect.arrayContaining([result.existing,expect.objectContaining({operation:'quarantine:anniversary:5:8',attempted:{date:'2023-03-23',calendar:'lunar',lunarDate:{year:2023,month:-2,day:1},unknown:'raw'}})]));
    expect(result.snapshot.value.todo.categoryId).toBe('old');
  } finally { await sourceContext.close(); await targetContext.close(); }
});

test('version 2 recovery moves cloud-sized IDs into an isolated local database without losing evidence', async ({ browser }) => {
  const cloudContext=await browser.newContext(), localContext=await browser.newContext();
  try {
    const cloud=await cloudContext.newPage(), local=await localContext.newPage();
    await openCloud(cloud,'cloud-source'); await local.goto('/');
    const json=await cloud.evaluate(async () => {
      const localPath='/src/data/localDatabase.ts', backupPath='/src/data/backup.ts';
      const db=(await import(localPath)).database;
      const todo={id:4294967337,text:'wide id',date:'2026-11-20',completed:false,createdAt:1,categoryId:'life'};
      await db.categories.put({id:'life',name:'生活',key:'生活',builtin:true,createdAt:1});
      await db.todos.put(todo);
      await db.syncRecords.put({key:'todo:4294967337',kind:'todo',id:'4294967337',version:0,value:null,desired:todo,dirty:1});
      return (await (await import(backupPath)).exportBackup()).json;
    });
    await local.evaluate(async json => {
      const backupPath='/src/data/backup.ts', modelPath='/src/data/backupModel.ts';
      const backup=await import(backupPath), model=await import(modelPath);
      await backup.restoreBackup(model.decodeBackup(json),'merge');
    },json);
    await local.reload();
    const result=await local.evaluate(async () => {
      const localPath='/src/data/localDatabase.ts', backupPath='/src/data/backup.ts', modelPath='/src/data/backupModel.ts', periodPath='/src/data/periodDatabase.ts';
      const db=(await import(localPath)).database, backup=await import(backupPath), model=await import(modelPath);
      return {todo:await db.todos.get(4294967337),archive:await (await import(periodPath)).periodDatabase.state.get('backup:recovery-archives-v1'),
        exported:model.decodeBackup((await backup.exportBackup()).json)};
    });
    expect(result.todo).toMatchObject({id:4294967337,text:'wide id'});
    expect(result.archive.value[0].syncRecords[0].id).toBe('4294967337');
    expect(result.exported.version).toBe(2);
  } finally { await cloudContext.close(); await localContext.close(); }
});

test('a previously exported single quarantine record can be saved and exported again without account inference', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'打开应用设置'}).click();
  await page.getByRole('button',{name:'数据备份与恢复'}).click();
  const conflict={operation:'quarantine:anniversary:5:8',kind:'anniversary',recordId:'5',reason:'calendar',at:1,
    attempted:{id:5,date:'2023-03-23',unknown:{photo:'raw'}},latest:null,remoteVersion:8};
  await page.getByLabel('选择备份文件').setInputFiles({name:'quarantine.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(conflict))});
  await expect(page.getByRole('heading',{name:'确认保存隔离记录'})).toBeVisible();
  await page.getByRole('button',{name:'保存隔离记录'}).click();
  await expect(page.getByRole('status')).toContainText('隔离记录已保存');
  const result=await page.evaluate(async () => {
    const path='/src/data/backup.ts'; return (await (await import(path)).exportBackup()).backup;
  });
  expect(result.version).toBe(2);
  expect(result.recovery).toEqual(expect.arrayContaining([expect.objectContaining({scope:null,syncConflicts:[conflict]})]));
});

test('a quarantine with a missing value keeps its raw envelope and remains exportable', async ({ page }) => {
  await openCloud(page,'missing-value');
  const result=await page.evaluate(async () => {
    const localPath='/src/data/localDatabase.ts', syncPath='/src/data/cloudStore.ts', backupPath='/src/data/backup.ts';
    const db=(await import(localPath)).database;
    await (await import(syncPath)).applyPull([{kind:'anniversary',id:'55',version:1}]);
    return {conflicts:await db.syncConflicts.toArray(),backup:(await (await import(backupPath)).exportBackup()).backup};
  });
  expect(result.conflicts[0]).toMatchObject({attempted:null,rawRecord:{kind:'anniversary',id:'55',version:1}});
  expect(Object.hasOwn(result.conflicts[0].rawRecord,'value')).toBe(false);
  expect(result.backup.recovery[0].syncConflicts).toEqual(result.conflicts);
});
