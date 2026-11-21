import { validCalendarFields, validDate, themes, colors, timingModes, type Anniversary } from '../features/anniversary/model';
import { createSeed, decorationIdentity, resolveDecoration, reviseDecoration } from '../features/todo/decorations';
import { CategoryError, canonicalTime, categoryKey, cleanCategoryName, type Category } from './categories';
import { categoryFor, cloudScope, database, fallbackCategory, newCloudRecordId, type Todo } from './localDatabase';
import { withDataAccess } from './storageAccess';
import { trackCloudChanges } from './cloudStore';
import type { CloudKind } from './cloudTypes';
export type { Todo } from './localDatabase';

const write = <T>(kinds: readonly CloudKind[], action: () => Promise<T>) =>
  withDataAccess(() => trackCloudChanges(kinds, action));

export const anniversaryRepository = {
  all: () => withDataAccess(() => database.anniversaries.orderBy('createdAt').toArray()),
  save: (value: Anniversary) => write(['anniversary'], () => database.transaction('rw', database.anniversaries, async () => {
    const name = value.name.trim();
    if (!name || name.length > 60 || !validDate(value.date) || !validCalendarFields(value) || !themes.includes(value.theme) || !colors.includes(value.color) ||
        (value.timingMode !== undefined && !timingModes.includes(value.timingMode))) {
      throw new Error('请填写名称和有效日期。');
    }
    const current = value.id === undefined ? undefined : await database.anniversaries.get(value.id);
    if (value.id !== undefined && !current) throw new Error('这条纪念日已不存在，请重新打开页面。');
    if (cloudScope && current && current.updatedAt !== value.updatedAt) {
      throw new Error('这条纪念日已同步到新版本，请重新打开后再编辑。');
    }
    const row = { ...value, id: value.id ?? newCloudRecordId(), name, note: value.note.trim().slice(0, 500),
      icon: value.icon.slice(0, 16), createdAt: current?.createdAt ?? Date.now(), updatedAt: Date.now() };
    const id = await database.anniversaries.put(row);
    return { ...row, id };
  })),
  remove: (id: number) => write(['anniversary'], () => database.anniversaries.delete(id)),
};

// Keep storage details behind repositories; no view directly reads IndexedDB.
export const categoryRepository = {
  all: () => withDataAccess(() => database.categories.orderBy('createdAt').toArray()),
  save: (value:string,id?:string) => write(['category'], () => database.transaction('rw',database.categories,async()=>{
    const name=cleanCategoryName(value),key=categoryKey(name);
    const existing=await database.categories.where('key').equals(key).first();
    if(existing && existing.id!==id) throw new CategoryError('已经有这个分类啦，换一个名字吧。');
    const current=id ? await database.categories.get(id) : undefined;
    if(id && !current) throw new CategoryError('这个分类已不存在。');
    const row:Category={id:current?.id ?? `category-${Date.now().toString(36)}-${createSeed().toString(36)}`,
      name,key,builtin:false,createdAt:current?.createdAt ?? Date.now()};
    await database.categories.put(row);
  })),
  remove: (id:string) => write(['category', 'todo'], () => database.transaction('rw',database.categories,database.todos,async()=>{
    const row=await database.categories.get(id);
    if(!row) throw new CategoryError('这个分类已不存在。');
    await database.categories.delete(id);
    const fallback=await fallbackCategory(database.categories,id);
    await database.todos.where('categoryId').equals(id).modify({categoryId:fallback});
  })),
};

export const todoRepository = {
  all: () => withDataAccess(() => database.transaction('rw', database.todos,database.categories, async () => {
    const todos = await database.todos.orderBy('createdAt').toArray();
    if (cloudScope) {
      const categories = await database.categories.orderBy('createdAt').toArray();
      const fallback = categories.find(row => row.key === categoryKey('生活')) ?? categories[0];
      const ids = new Set(categories.map(row => row.id));
      return todos.map(todo => ({ ...todo, categoryId: todo.categoryId && ids.has(todo.categoryId) ? todo.categoryId : fallback?.id }));
    }
    for (const todo of todos) {
      const decoration = resolveDecoration(todo.text, todo.decoration, decorationIdentity(todo));
      const categoryId=await categoryFor(todo,database.categories);
      if (JSON.stringify(todo.decoration) !== JSON.stringify(decoration) || todo.categoryId!==categoryId) {
        await database.todos.update(todo.id!, { decoration, categoryId });
        todo.decoration = decoration; todo.categoryId=categoryId;
      }
    }
    return todos;
  })),
  add: (todo: Todo) => write(['todo', 'category'], () => database.transaction('rw',database.todos,database.categories,async()=>{
    const categoryId=await categoryFor(todo,database.categories);
    return database.todos.add({ ...todo,id: todo.id ?? newCloudRecordId(),categoryId,time:canonicalTime(todo.time)||undefined,
      decoration: reviseDecoration(todo.text, todo.decoration ?? { seed: createSeed() }) });
  })),
  update: (id: number, changes: Partial<Omit<Todo, 'id'>>) => write(['todo', 'category'], () => database.transaction('rw', database.todos,database.categories, async () => {
    const current = await database.todos.get(id);
    if (!current) throw new Error('Todo no longer exists');
    const text = changes.text ?? current.text;
    const decoration = changes.text !== undefined
      ? reviseDecoration(text, changes.decoration ?? current.decoration, decorationIdentity(current))
      : resolveDecoration(text, changes.decoration ?? current.decoration, decorationIdentity(current));
    const categoryId=await categoryFor({...current,...changes},database.categories);
    return database.todos.update(id, { ...changes, decoration,categoryId });
  })),
  remove: (id: number) => write(['todo'], () => database.todos.delete(id)),
  restore: (snapshot: Todo) => write(['todo', 'category'], () => database.transaction('rw',database.todos,database.categories,async()=>{
    if(snapshot.id===undefined) throw new Error('Undo needs the original task ID');
    const restored=structuredClone(snapshot);
    restored.categoryId=await categoryFor(restored,database.categories);
    return database.todos.put(restored);
  })),
};
