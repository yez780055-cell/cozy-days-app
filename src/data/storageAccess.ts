import type { Anniversary } from '../features/anniversary/model';
import type { Category } from './categories';
import { database, type Todo } from './localDatabase';
import { periodDatabase } from './periodDatabase';

export type PrimaryRecords = {
  todos: (Todo & { id: number })[];
  categories: Category[];
  anniversaries: (Anniversary & { id: number })[];
};

export const restoreJournal = 'backup:undo-v1';
export const restoreRevision = 'backup:revision-v1';
export const previousBackup = 'backup:previous-v1';
export const dataChangedEvent = 'cozy-days:restore-reload';
const lockName = 'cozy-days:local-records';
let loadedRevision: string | null | undefined;
let localQueue = Promise.resolve();

export function canRestore(): boolean {
  return typeof navigator.locks?.request === 'function';
}

export function readPrimary(): Promise<PrimaryRecords> {
  const { todos, categories, anniversaries } = database;
  return database.transaction('r', todos, categories, anniversaries, async () => ({
    todos: await todos.toArray() as PrimaryRecords['todos'],
    categories: await categories.toArray(),
    anniversaries: await anniversaries.toArray() as PrimaryRecords['anniversaries'],
  }));
}

export function writePrimary(records: PrimaryRecords): Promise<void> {
  const { todos, categories, anniversaries } = database;
  return database.transaction('rw', todos, categories, anniversaries, async () => {
    await todos.clear();
    await categories.clear();
    await anniversaries.clear();
    await categories.bulkAdd(records.categories);
    await todos.bulkAdd(records.todos);
    await anniversaries.bulkAdd(records.anniversaries);
  });
}

export async function rollbackRestore(before: PrimaryRecords): Promise<void> {
  await writePrimary(before);
  await periodDatabase.state.delete(restoreJournal);
}

// Gate all application access, including read-time todo repairs. The lock
// must span commits, so an IndexedDB transaction alone cannot take its place.
export function withDataAccess<T>(action: () => Promise<T>): Promise<T> {
  const run = async () => {
    const [journal, revision] = await periodDatabase.state.bulkGet([restoreJournal, restoreRevision]);
    if (journal) {
      const before = journal.value as PrimaryRecords | undefined;
      if (!before || !Array.isArray(before.todos) || !Array.isArray(before.categories) || !Array.isArray(before.anniversaries)) {
        throw new Error('恢复日志损坏，已暂停读取和写入。');
      }
      await rollbackRestore(before);
    }

    const current = typeof revision?.value === 'string' ? revision.value : null;
    if (loadedRevision !== undefined && loadedRevision !== current) {
      window.dispatchEvent(new Event(dataChangedEvent));
      throw new Error('记录已在另一页面恢复，请重新打开应用。');
    }
    loadedRevision = current;
    return action();
  };

  if (canRestore()) return navigator.locks.request(lockName, run);
  // Plain HTTP still supports normal records and exports. Import requires
  // cross-tab exclusion and is disabled in contexts without Web Locks.
  const result = localQueue.then(run);
  localQueue = result.then(() => {}, () => {});
  return result;
}
