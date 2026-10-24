import { test, expect, type Page } from '@playwright/test';

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('little-days');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const result: Record<string, unknown> = {};
    for (const name of ['todos', 'categories']) {
      const tx = db.transaction(name, 'readonly'), store = tx.objectStore(name);
      const get = store.getAll();
      const rows = await new Promise<unknown[]>((resolve, reject) => { get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); });
      result[name] = { keyPath:store.keyPath, autoIncrement:store.autoIncrement, indexes:Array.from(store.indexNames).map(key => { const index = store.index(key); return { name:index.name, keyPath:index.keyPath, unique:index.unique, multiEntry:index.multiEntry }; }), rows };
    }
    const version = db.version, stores = Array.from(db.objectStoreNames);
    db.close();
    return { version, stores, tables:result };
  });
}

test('v3→v4完整保留既有表字段、主键、自定义分类和所有索引', async ({ page }) => {
  await page.route('**/migration-fixture', route => route.fulfill({ contentType:'text/html', body:'<!doctype html><title>Migration</title>' }));
  await page.goto('/migration-fixture');
  await page.evaluate(async () => {
    const request = indexedDB.open('little-days', 30);
    request.onupgradeneeded = () => {
      const db = request.result;
      const todos = db.createObjectStore('todos', { keyPath:'id', autoIncrement:true });
      for (const name of ['date','completed','createdAt','categoryId']) todos.createIndex(name, name);
      const categories = db.createObjectStore('categories', { keyPath:'id' });
      categories.createIndex('key','key',{ unique:true }); categories.createIndex('createdAt','createdAt');
      categories.put({ id:'life', name:'生活', key:'生活', builtin:true, createdAt:1, opaque:{ preserve:['分类', 2] } });
      categories.put({ id:'custom-42', name:'自定义珍藏', key:'自定义珍藏', builtin:false, createdAt:123456, opaque:'原分类字段' });
      todos.put({ id:42, text:'保留原有待办', date:'2026-10-23', completed:true, categoryId:'custom-42', createdAt:123456, favorite:true, time:'09:05', decoration:{ version:1, seed:123, illustrationId:'flower', stickerId:'heart', theme:'rose' }, opaque:{ preserve:['待办', false] } });
      todos.put({ id:43, text:'未完成待办', date:'2027-01-01', completed:false, categoryId:'life', createdAt:123457, favorite:false, time:'23:59', decoration:{ version:1, seed:456, illustrationId:'heart', stickerId:'cherries', theme:'sage' } });
    };
    await new Promise<void>((resolve, reject) => { request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error); });
  });
  const before = await snapshot(page);
  expect(before.version).toBe(30);
  // Import only the repository so todo rendering cannot normalize the fixture before comparison.
  await page.evaluate(async () => {
    const modulePath = '/src/data/database.ts';
    const repo = (await import(modulePath)).anniversaryRepository;
    await repo.save({ name:'迁移后新增', date:'2026-10-23', yearly:true, theme:'生活', color:'pink', icon:'♡', note:'', createdAt:0, updatedAt:0 });
  });
  const after = await snapshot(page);
  expect(after.version).toBe(40);
  expect(after.stores).toEqual(['anniversaries', 'categories', 'todos']);
  expect(after.tables).toEqual(before.tables);
  await page.reload();
  expect((await snapshot(page)).tables).toEqual(before.tables);
});
