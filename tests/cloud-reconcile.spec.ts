import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/src/data/localDatabase.ts';
    const local = await import(path);
    await local.openCloudDatabase({ spaceId: crypto.randomUUID(), userId: 'synthetic', members: 1 });
    const periodPath = '/src/data/periodDatabase.ts';
    (await import(periodPath)).useCloudPeriodDatabase();
  });
});

test('malformed calendar is retained with diagnostics and cannot stop later pages or overwrite a local row', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const localPath = '/src/data/localDatabase.ts', syncPath = '/src/data/cloudStore.ts';
    const local = await import(localPath), sync = await import(syncPath);
    const db = local.database;
    const base = { id:42, name:'kept', date:'2023-03-22', calendar:'lunar', lunarDate:{year:2023,month:-2,day:1}, theme:'生活', color:'pink', note:'', icon:'', yearly:true, createdAt:1, updatedAt:1 };
    await db.anniversaries.put(base);
    const invalid = { ...base, date:'2023-03-23', unknown:{ original:'do not discard' } };
    const records = [{ kind:'anniversary', id:'42', version:1, value:invalid },
      { kind:'anniversary', id:'99', version:2, value:'malformed raw value' },
      ...Array.from({length:14}, (_, i) => ({kind:'day',id:`2026-11-${String(i+1).padStart(2,'0')}`,version:i+3,value:{date:`2026-11-${String(i+1).padStart(2,'0')}`,symptoms:[]}}))];
    await sync.applyPull(records);
    await sync.applyPull([{kind:'anniversary',id:'43',version:17,value:{...base,id:43,name:'later'}}]);
    return {cursor:await sync.readCursor(), kept:await db.anniversaries.get(42), later:await db.anniversaries.get(43), conflicts:await db.syncConflicts.toArray(), invalid};
  });
  expect(result.cursor).toBe(17);
  expect(result.kept.name).toBe('kept');
  expect(result.kept.date).toBe('2023-03-22');
  expect(result.later.name).toBe('later');
  expect(result.conflicts).toHaveLength(2);
  expect(result.conflicts).toEqual(expect.arrayContaining([
    expect.objectContaining({reason:'calendar',remoteVersion:1,attempted:result.invalid}),
    expect.objectContaining({reason:'calendar',remoteVersion:2,attempted:'malformed raw value'}),
  ]));
});

test('category tombstones reconcile paged and offline tasks without losing an in-flight operation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const localPath = '/src/data/localDatabase.ts', syncPath = '/src/data/cloudStore.ts';
    const local = await import(localPath), sync = await import(syncPath);
    const db = local.database;
    const life = {id:'life',name:'生活',key:'生活',builtin:true,createdAt:1};
    const category = {id:'deleted',name:'旧分类',key:'旧分类',builtin:false,createdAt:2};
    const task = {id:42,text:'offline',date:'2026-11-20',completed:false,createdAt:3,categoryId:'deleted',unknown:'preserved'};
    await sync.applyPull([{kind:'category',id:'life',version:1,value:life},{kind:'category',id:'deleted',version:2,value:category}]);
    await db.todos.put(task);
    const attempt = {operation:'a'.repeat(32),version:0,value:task};
    await db.syncRecords.put({key:'todo:42',kind:'todo',id:'42',version:0,value:null,desired:task,dirty:1,attempt});
    await sync.applyPull([{kind:'category',id:'deleted',version:3,value:null}]);
    const reconciled = await db.todos.get(42), queued = await db.syncRecords.get('todo:42');
    await sync.acceptPush('todo','42',attempt.operation,{status:'applied',version:4,value:task});
    const successor = await db.syncRecords.get('todo:42');
    await sync.applyPull([{kind:'category',id:'new',version:5,value:{...category,id:'new'}}]);
    await sync.applyPull([{kind:'todo',id:'43',version:6,value:{...task,id:43,text:'late'}}]);
    await sync.applyPull([{kind:'todo',id:'43',version:6,value:{...task,id:43,text:'late'}}]);
    return {reconciled,queued,successor,late:await db.todos.get(43),lateOutbox:await db.syncRecords.get('todo:43'),category:await db.categories.get('new'),cursor:await sync.readCursor()};
  });
  expect(result.reconciled).toMatchObject({id:42,categoryId:'life',unknown:'preserved'});
  expect(result.queued.attempt.value.categoryId).toBe('deleted');
  expect(result.queued.desired.categoryId).toBe('life');
  expect(result.successor).toMatchObject({dirty:1,version:4,desired:{categoryId:'life'}});
  expect(result.late).toMatchObject({id:43,categoryId:'life',unknown:'preserved'});
  expect(result.lateOutbox).toMatchObject({dirty:1,desired:{categoryId:'life'}});
  expect(result.category.id).toBe('new');
  expect(result.cursor).toBe(6);
});

test('invalid conflict preserves the pending operation and backup until a valid newer revision arrives', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const localPath = '/src/data/localDatabase.ts', syncPath = '/src/data/cloudStore.ts';
    const local = await import(localPath), sync = await import(syncPath), db = local.database;
    const localValue = {id:77,name:'local',date:'2023-03-22',calendar:'lunar',lunarDate:{year:2023,month:-2,day:1},theme:'生活',color:'pink',note:'',icon:'',yearly:true,createdAt:1,updatedAt:2};
    const invalid = {...localValue,date:'2023-03-23',unknown:'raw'};
    const attempt = {operation:'b'.repeat(32),version:1,value:localValue};
    await db.anniversaries.put(localValue);
    await db.state.put({id:'backup:previous-v1',value:'synthetic backup'});
    await db.syncRecords.put({key:'anniversary:77',kind:'anniversary',id:'77',version:1,value:localValue,desired:localValue,dirty:1,attempt});
    await sync.acceptPush('anniversary','77',attempt.operation,{status:'conflict',reason:'version',version:2,value:invalid});
    const blocked = await db.syncRecords.get('anniversary:77');
    const waiting = await sync.nextAttempt();
    await sync.applyPull([{kind:'anniversary',id:'77',version:3,value:{...localValue,name:'remote'}}]);
    const resumed = await sync.nextAttempt();
    return {blocked,waiting,resumed,backup:await db.state.get('backup:previous-v1'),local:await db.anniversaries.get(77),conflicts:await db.syncConflicts.toArray()};
  });
  expect(result.blocked).toMatchObject({dirty:1,blocked:true,attempt:{operation:'b'.repeat(32)}});
  expect(result.waiting).toBeUndefined();
  expect(result.resumed.attempt).toEqual(result.blocked.attempt);
  expect(result.backup.value).toBe('synthetic backup');
  expect(result.local.name).toBe('local');
  expect(result.conflicts[0]).toMatchObject({remoteVersion:2,attempted:{unknown:'raw'}});
});

test('a missing category on an early page is not a tombstone; after a real deletion fallback is created only after the last page', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const localPath = '/src/data/localDatabase.ts', syncPath = '/src/data/cloudStore.ts';
    const local = await import(localPath), sync = await import(syncPath), db = local.database;
    const todo = {id:9,text:'later category',date:'2026-11-20',completed:false,createdAt:1,categoryId:'gone'};
    await sync.applyPull([{kind:'todo',id:'9',version:1,value:todo}]);
    const first = await db.todos.get(9);
    await sync.applyPull([{kind:'category',id:'gone',version:2,value:null}]);
    const beforeFinish = await db.todos.get(9);
    await sync.finishPull();
    return {first,beforeFinish,after:await db.todos.get(9),categories:await db.categories.toArray(),outbox:await db.syncRecords.where('dirty').equals(1).toArray(),evidence:(await db.state.toArray()).filter((r: {id:string})=>r.id.startsWith('cloud:category-reconciliation:'))};
  });
  expect(result.first.categoryId).toBe('gone');
  expect(result.beforeFinish.categoryId).toBe('gone');
  expect(result.after.categoryId).toBe('life-recovered');
  expect(result.categories).toMatchObject([{id:'life-recovered',key:'生活'}]);
  expect(result.outbox).toHaveLength(2);
  expect(result.evidence[0].value.todo.categoryId).toBe('gone');
});

test('conflicting in-flight and successor edits are retained and can be reapplied idempotently', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const localPath = '/src/data/localDatabase.ts', syncPath = '/src/data/cloudStore.ts';
    const local = await import(localPath), sync = await import(syncPath), db = local.database;
    const category = {id:'life',name:'生活',key:'生活',builtin:true,createdAt:1};
    const original = {id:10,text:'first',date:'2026-11-20',completed:false,createdAt:1,categoryId:'life'};
    const successor = {...original,text:'successor',unknown:'keep'};
    const remote = {...original,text:'remote'};
    const attempt = {operation:'c'.repeat(32),version:1,value:original};
    await db.categories.put(category);
    await db.todos.put(successor);
    await db.syncRecords.put({key:'todo:10',kind:'todo',id:'10',version:1,value:original,desired:successor,dirty:1,attempt});
    const response = {status:'conflict',reason:'version',version:2,value:remote};
    await sync.acceptPush('todo','10',attempt.operation,response);
    await sync.acceptPush('todo','10',attempt.operation,response);
    const conflicts = await db.syncConflicts.toArray();
    await sync.resolveSyncConflict(attempt.operation,true);
    const retry = await sync.nextAttempt();
    await sync.acceptPush('todo','10',retry.attempt.operation,{status:'applied',version:3,value:retry.attempt.value});
    return {conflicts,retry,todo:await db.todos.get(10),record:await db.syncRecords.get('todo:10')};
  });
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts[0]).toMatchObject({attempted:{text:'successor',unknown:'keep'},inFlight:{value:{text:'first'}}});
  expect(result.retry.attempt.value).toMatchObject({text:'successor',unknown:'keep'});
  expect(result.todo).toMatchObject({text:'successor',unknown:'keep'});
  expect(result.record).toMatchObject({version:3,dirty:0});
});

test('two isolated devices retain an offline creation while a category is deleted and recreated', async ({ browser, page: initialPage }) => {
  const aContext = await browser.newContext(), bContext = await browser.newContext();
  try {
    const a = await aContext.newPage(), b = await bContext.newPage();
    for (const page of [a,b]) {
      await page.goto(new URL(initialPage.url()).origin);
      await page.evaluate(async () => {
        const localPath = '/src/data/localDatabase.ts', periodPath = '/src/data/periodDatabase.ts';
        await (await import(localPath)).openCloudDatabase({spaceId:'synthetic-room',userId:'same-user',members:1});
        (await import(periodPath)).useCloudPeriodDatabase();
      });
      await page.evaluate(async () => {
        const path = '/src/data/cloudStore.ts';
        await (await import(path)).applyPull([
          {kind:'category',id:'life',version:1,value:{id:'life',name:'生活',key:'生活',builtin:true,createdAt:1}},
          {kind:'category',id:'old',version:2,value:{id:'old',name:'旅行',key:'旅行',builtin:false,createdAt:2}},
        ]);
      });
    }
    const offline = await b.evaluate(async () => {
      const databasePath = '/src/data/database.ts', syncPath = '/src/data/cloudStore.ts';
      const repo = await import(databasePath), sync = await import(syncPath);
      const id = await repo.todoRepository.add({text:'offline task',date:'2026-11-20',completed:false,createdAt:3,categoryId:'old'});
      return {id, pending:await sync.nextAttempt()};
    });
    await a.evaluate(async () => {
      const path = '/src/data/database.ts';
      await (await import(path)).categoryRepository.remove('old');
    });
    const deletion = await a.evaluate(async () => {
      const path = '/src/data/cloudStore.ts';
      const sync = await import(path), pending = await sync.nextAttempt();
      await sync.acceptPush(pending.kind,pending.id,pending.attempt.operation,{status:'applied',version:3,value:null});
      return pending;
    });
    expect(deletion).toMatchObject({kind:'category',id:'old'});
    await b.evaluate(async () => {
      const path = '/src/data/cloudStore.ts';
      await (await import(path)).applyPull([{kind:'category',id:'old',version:3,value:null}]);
    });
    const bSuccessor = await b.evaluate(async ({offline}) => {
      const path = '/src/data/cloudStore.ts';
      const sync = await import(path), previous = offline.pending;
      await sync.acceptPush('todo',String(offline.id),previous.attempt.operation,{status:'applied',version:4,value:previous.attempt.value});
      return sync.nextAttempt();
    }, {offline});
    expect(bSuccessor.attempt.value).toMatchObject({id:offline.id,categoryId:'life',text:'offline task'});
    await b.evaluate(async ({pending}) => {
      const path = '/src/data/cloudStore.ts';
      await (await import(path)).acceptPush(pending.kind,pending.id,pending.attempt.operation,{status:'applied',version:5,value:pending.attempt.value});
    }, {pending:bSuccessor});
    await a.evaluate(async ({pending}) => {
      const path = '/src/data/cloudStore.ts';
      await (await import(path)).applyPull([{kind:'todo',id:pending.id,version:5,value:pending.attempt.value},
        {kind:'category',id:'new',version:6,value:{id:'new',name:'旅行',key:'旅行',builtin:false,createdAt:6}}]);
    }, {pending:bSuccessor});
    await b.evaluate(async () => {
      const path = '/src/data/cloudStore.ts';
      await (await import(path)).applyPull([{kind:'category',id:'new',version:6,value:{id:'new',name:'旅行',key:'旅行',builtin:false,createdAt:6}}]);
    });
    for (const page of [a,b]) {
      const result = await page.evaluate(async id => {
        const path = '/src/data/localDatabase.ts';
        const db = (await import(path)).database;
        return {todo:await db.todos.get(id),old:await db.categories.get('old'),replacement:await db.categories.get('new')};
      }, offline.id);
      expect(result.todo).toMatchObject({id:offline.id,categoryId:'life',text:'offline task'});
      expect(result.old).toBeUndefined();
      expect(result.replacement.id).toBe('new');
    }
  } finally { await aContext.close(); await bContext.close(); }
});

test('shell2-web9 conflict code preserves the complete rejected old-client edit for recovery', async ({ page }) => {
  const source = execFileSync('git', ['show','android-web-shell-2-web-9:src/data/cloudStore.ts'], {encoding:'utf8'});
  const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    .replace(/from ['"](\.{1,2}\/[^'"]+)['"]/g, (_all, path: string) => `from "${path}.ts"`);
  await page.route('**/src/data/legacy-cloudStore.js', route => route.fulfill({contentType:'text/javascript',body:js}));
  const result = await page.evaluate(async () => {
    const localPath='/src/data/localDatabase.ts', legacyPath='/src/data/legacy-cloudStore.js';
    const db=(await import(localPath)).database, legacy=await import(legacyPath);
    const oldValue={id:52,name:'legacy',date:'2023-03-23',calendar:'lunar',lunarDate:{year:2023,month:-2,day:1},
      backgroundImage:'data:image/png;base64,YWJj',unknown:{retained:true},theme:'生活',color:'pink',note:'',icon:'',yearly:true,createdAt:1,updatedAt:2};
    const latest={...oldValue,date:'2023-03-22'};
    const attempt={operation:'d'.repeat(32),version:1,value:oldValue};
    await db.anniversaries.put(oldValue);
    await db.syncRecords.put({key:'anniversary:52',kind:'anniversary',id:'52',version:1,value:latest,desired:oldValue,dirty:1,attempt});
    await legacy.acceptPush('anniversary','52',attempt.operation,{status:'conflict',reason:'invalid',version:1,value:latest});
    return {oldValue,conflicts:await db.syncConflicts.toArray(),record:await db.anniversaries.get(52)};
  });
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts[0]).toMatchObject({reason:'invalid',attempted:result.oldValue});
  expect(result.conflicts[0].attempted.backgroundImage).toBe('data:image/png;base64,YWJj');
  expect(result.record.date).toBe('2023-03-22');
});

test('reapplying an old conflict cannot restore a known deleted category reference', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const localPath='/src/data/localDatabase.ts', syncPath='/src/data/cloudStore.ts';
    const db=(await import(localPath)).database, sync=await import(syncPath);
    const latest={id:11,text:'remote',date:'2026-11-20',completed:false,createdAt:1,categoryId:'life'};
    const attempted={...latest,text:'local',categoryId:'old'};
    await db.categories.put({id:'life',name:'生活',key:'生活',builtin:true,createdAt:1});
    await db.syncRecords.put({key:'category:old',kind:'category',id:'old',version:2,value:null,desired:null,dirty:0});
    await db.todos.put(latest);
    await db.syncRecords.put({key:'todo:11',kind:'todo',id:'11',version:3,value:latest,desired:latest,dirty:0});
    await db.syncConflicts.put({operation:'conflict',kind:'todo',recordId:'11',attempted,latest,reason:'version',at:1});
    await sync.resolveSyncConflict('conflict',true);
    return {todo:await db.todos.get(11),outbox:await db.syncRecords.get('todo:11'),conflicts:await db.syncConflicts.count()};
  });
  expect(result.todo).toMatchObject({text:'local',categoryId:'life'});
  expect(result.outbox).toMatchObject({dirty:1,desired:{text:'local',categoryId:'life'}});
  expect(result.conflicts).toBe(0);
});
