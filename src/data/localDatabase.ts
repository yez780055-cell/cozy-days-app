import Dexie, { type Table } from 'dexie';
import type { Anniversary } from '../features/anniversary/model';
import { decorationIdentity, resolveDecoration, type TaskDecoration } from '../features/todo/decorations';
import { DEFAULT_CATEGORY, categoryKey, defaultCategories, type Category } from './categories';
import type { CloudScope, SyncConflict, SyncRecord } from './cloudTypes';

export interface Todo {
  id?: number;
  text: string;
  date: string;
  completed: boolean;
  createdAt: number;
  decoration?: TaskDecoration;
  favorite?: boolean;
  categoryId?: string;
  time?: string;
}

// Never leave dangling references; reuse 生活 or the oldest surviving category.
export async function fallbackCategory(categories: Table<Category,string>, excluding?: string): Promise<string> {
  const rows=(await categories.orderBy('createdAt').toArray()).filter(row=>row.id!==excluding);
  const fallback=rows.find(row=>row.key===categoryKey('生活')) ?? rows[0];
  if(fallback) return fallback.id;
  const id=excluding===DEFAULT_CATEGORY ? 'life-fallback' : DEFAULT_CATEGORY;
  await categories.put({id,name:'生活',key:categoryKey('生活'),builtin:false,createdAt:Date.now()});
  return id;
}

export async function categoryFor(todo: Todo, categories: Table<Category,string>): Promise<string> {
  if (todo.categoryId) return await categories.get(todo.categoryId) ? todo.categoryId : fallbackCategory(categories);
  const legacy=(todo as Todo & {category?:unknown}).category;
  if(typeof legacy==='string' && legacy.trim()) {
    const key=categoryKey(legacy), existing=await categories.where('key').equals(key).first();
    if(key==='全部') return fallbackCategory(categories);
    if(existing) return existing.id;
    // Keep old named categories instead of discarding their association.
    const id='legacy-'+encodeURIComponent(key);
    await categories.put({id,name:legacy.trim(),key,builtin:false,createdAt:todo.createdAt});
    return id;
  }
  return fallbackCategory(categories);
}

class LocalDatabase extends Dexie {
  anniversaries!: Table<Anniversary, number>;
  todos!: Table<Todo, number>;
  categories!: Table<Category,string>;
  state!: Table<{ id: string; value: unknown }, string>;
  syncRecords!: Table<SyncRecord, string>;
  syncConflicts!: Table<SyncConflict, string>;
  constructor(scope?: CloudScope) {
    super(scope ? `little-days-cloud-${scope.spaceId}-${scope.userId}` : 'little-days');
    if (scope) {
      this.version(1).stores({
        todos: 'id,date,completed,createdAt,categoryId',
        categories: 'id,key,createdAt',
        anniversaries: 'id,date,createdAt',
        state: 'id',
        syncRecords: 'key,dirty',
        syncConflicts: 'operation,at',
      });
      return;
    }
    this.version(1).stores({ todos: '++id,date,completed,createdAt' });
    this.version(2).stores({ todos: '++id,date,completed,createdAt' }).upgrade(transaction =>
      transaction.table<Todo>('todos').toCollection().modify(todo => {
        todo.decoration = resolveDecoration(todo.text, todo.decoration, decorationIdentity(todo));
      }));
    this.version(3).stores({todos:'++id,date,completed,createdAt,categoryId',categories:'id,&key,createdAt'}).upgrade(async transaction=>{
      const categories=transaction.table<Category,string>('categories');
      await categories.bulkPut(defaultCategories);
      const todos=transaction.table<Todo,number>('todos');
      for(const todo of await todos.toArray()) await todos.update(todo.id!,{categoryId:await categoryFor(todo,categories)});
    });
    this.version(4).stores({ anniversaries: '++id,date,createdAt' });
    this.on('populate',transaction=>transaction.table('categories').bulkPut(defaultCategories));
  }
}
export let database = new LocalDatabase();
export let cloudScope: CloudScope | undefined;

export function openCloudDatabase(scope: CloudScope) {
  if (cloudScope) throw new Error('Changing accounts requires a fresh app session');
  const cloudDatabase = new LocalDatabase(scope);
  return cloudDatabase.open().then(() => {
    database = cloudDatabase;
    cloudScope = scope;
  });
}

export function newCloudRecordId(): number | undefined {
  if (!cloudScope) return undefined;
  const [high, low] = crypto.getRandomValues(new Uint32Array(2));
  return (high % 0x100000) * 0x100000000 + low || 1;
}
