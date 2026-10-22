import Dexie, { type Table } from 'dexie';
import { createSeed, decorationIdentity, resolveDecoration, reviseDecoration, type TaskDecoration } from '../features/todo/decorations';
import { CategoryError, DEFAULT_CATEGORY, canonicalTime, categoryKey, cleanCategoryName, defaultCategories, type Category } from './categories';

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

async function categoryFor(todo: Todo, categories: Table<Category,string>): Promise<string> {
  if (todo.categoryId) return await categories.get(todo.categoryId) ? todo.categoryId : DEFAULT_CATEGORY;
  const legacy=(todo as Todo & {category?:unknown}).category;
  if(typeof legacy==='string' && legacy.trim()) {
    const key=categoryKey(legacy), existing=await categories.where('key').equals(key).first();
    if(key==='全部') return DEFAULT_CATEGORY;
    if(existing) return existing.id;
    // Keep old named categories instead of discarding their association.
    const id='legacy-'+encodeURIComponent(key);
    await categories.put({id,name:legacy.trim(),key,builtin:false,createdAt:todo.createdAt});
    return id;
  }
  return DEFAULT_CATEGORY;
}

class LocalDatabase extends Dexie {
  todos!: Table<Todo, number>;
  categories!: Table<Category,string>;
  constructor() {
    super('little-days');
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
    this.on('populate',transaction=>transaction.table('categories').bulkPut(defaultCategories));
  }
}
const database = new LocalDatabase();

// Keep storage details behind repositories; no view directly reads IndexedDB.
export const categoryRepository = {
  all: () => database.categories.orderBy('createdAt').toArray(),
  save: (value:string,id?:string) => database.transaction('rw',database.categories,async()=>{
    const name=cleanCategoryName(value),key=categoryKey(name);
    const existing=await database.categories.where('key').equals(key).first();
    if(existing && existing.id!==id) throw new CategoryError('已经有这个分类啦，换一个名字吧。');
    const current=id ? await database.categories.get(id) : undefined;
    if(id && (!current || current.builtin)) throw new CategoryError('默认分类不能修改。');
    const row:Category={id:current?.id ?? `category-${Date.now().toString(36)}-${createSeed().toString(36)}`,
      name,key,builtin:false,createdAt:current?.createdAt ?? Date.now()};
    await database.categories.put(row);
  }),
  remove: (id:string) => database.transaction('rw',database.categories,database.todos,async()=>{
    const row=await database.categories.get(id);
    if(!row || row.builtin) throw new CategoryError('默认分类不能删除。');
    await database.todos.where('categoryId').equals(id).modify({categoryId:DEFAULT_CATEGORY});
    await database.categories.delete(id);
  }),
};

export const todoRepository = {
  all: () => database.transaction('rw', database.todos,database.categories, async () => {
    const todos = await database.todos.orderBy('createdAt').toArray();
    for (const todo of todos) {
      const decoration = resolveDecoration(todo.text, todo.decoration, decorationIdentity(todo));
      const categoryId=await categoryFor(todo,database.categories);
      if (JSON.stringify(todo.decoration) !== JSON.stringify(decoration) || todo.categoryId!==categoryId) {
        await database.todos.update(todo.id!, { decoration, categoryId });
        todo.decoration = decoration; todo.categoryId=categoryId;
      }
    }
    return todos;
  }),
  add: (todo: Todo) => database.transaction('rw',database.todos,database.categories,async()=>{
    const categoryId=await categoryFor(todo,database.categories);
    return database.todos.add({ ...todo,categoryId,time:canonicalTime(todo.time)||undefined,
      decoration: reviseDecoration(todo.text, todo.decoration ?? { seed: createSeed() }) });
  }),
  update: (id: number, changes: Partial<Omit<Todo, 'id'>>) => database.transaction('rw', database.todos,database.categories, async () => {
    const current = await database.todos.get(id);
    if (!current) throw new Error('Todo no longer exists');
    const text = changes.text ?? current.text;
    const decoration = changes.text !== undefined
      ? reviseDecoration(text, changes.decoration ?? current.decoration, decorationIdentity(current))
      : resolveDecoration(text, changes.decoration ?? current.decoration, decorationIdentity(current));
    const categoryId=await categoryFor({...current,...changes},database.categories);
    return database.todos.update(id, { ...changes, decoration,categoryId });
  }),
  remove: (id: number) => database.todos.delete(id),
  restore: (snapshot: Todo) => database.transaction('rw',database.todos,database.categories,async()=>{
    if(snapshot.id===undefined) throw new Error('Undo needs the original task ID');
    const restored=structuredClone(snapshot);
    restored.categoryId=await categoryFor(restored,database.categories);
    return database.todos.put(restored);
  }),
};
