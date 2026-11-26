import { cloudScope, database, type Todo } from './localDatabase';
import { readPeriod } from './periodDatabase';
import { localId } from './localId';
import { emptyData, sortedPeriods, type CycleSettings, type DailyEntry, type PeriodEntry } from '../features/period/model';
import { colors, themes, timingModes, validCalendarFields, validDate, type Anniversary } from '../features/anniversary/model';
import { categoryKey, type Category } from './categories';
import {
  cloudChanged, cloudKinds, cloudQueued, equalValue, recordKey,
  type CloudKind, type CloudRecord, type CloudValue, type PushResponse, type SyncRecord,
} from './cloudTypes';

const cursorKey = 'cloud:cursor';
const initializedKey = 'cloud:initialized';
const periodKinds = ['periods', 'day', 'cycle'] as const;
let channel: BroadcastChannel | undefined;

export function watchCloudCache(scope: string) {
  if (typeof BroadcastChannel !== 'function') return;
  channel = new BroadcastChannel('cozy-days:cache:' + scope);
  channel.addEventListener('message', () => window.dispatchEvent(new Event(cloudChanged)));
}

function notifyCache(event: string) {
  channel?.postMessage('changed');
  window.dispatchEvent(new Event(event));
}

async function capture(kinds: readonly CloudKind[]) {
  const rows = new Map<string, CloudRecord>();
  const add = (kind: CloudKind, id: string | number, value: CloudValue) =>
    rows.set(recordKey(kind, String(id)), { kind, id: String(id), version: 0, value });
  if (kinds.includes('todo')) for (const row of await database.todos.toArray()) add('todo', row.id!, row);
  if (kinds.includes('category')) for (const row of await database.categories.toArray()) add('category', row.id, row);
  if (kinds.includes('anniversary')) for (const row of await database.anniversaries.toArray()) add('anniversary', row.id!, row);
  if (periodKinds.some(kind => kinds.includes(kind))) {
    const data = await readPeriod() ?? emptyData();
    if (kinds.includes('periods')) add('periods', 'main', sortedPeriods(data.periods));
    if (kinds.includes('cycle')) add('cycle', 'main', data.settings);
    if (kinds.includes('day')) for (const [date, row] of Object.entries(data.days)) add('day', date, row);
  }
  return rows;
}

async function queueChange(record: CloudRecord, value: CloudValue) {
  const key = recordKey(record.kind, record.id);
  const current = await database.syncRecords.get(key);
  const base = current ?? { ...record, key, version: 0, value: null };
  await database.syncRecords.put({
    ...base, desired: value, dirty: current?.attempt || !equalValue(base.value, value) ? 1 : 0,
  });
}

// Commit the feature write and the outbox together. The legacy path uses its existing transaction.
export async function trackCloudChanges<T>(kinds: readonly CloudKind[], action: () => Promise<T>): Promise<T> {
  if (!cloudScope) return action();
  let queued = false;
  const result = await database.transaction('rw', [
    database.todos, database.categories, database.anniversaries, database.state, database.syncRecords,
  ], async () => {
    const before = await capture(kinds);
    const result = await action();
    const after = await capture(kinds);
    for (const [key, row] of new Map([...before, ...after])) {
      const previous = before.get(key)?.value ?? null;
      const next = after.get(key)?.value ?? null;
      if (!equalValue(previous, next)) {
        await queueChange(row, next);
        queued = true;
      }
    }
    return result;
  });
  if (queued) notifyCache(cloudQueued);
  return result;
}

export const trackPeriodChanges = <T>(action: () => Promise<T>) => trackCloudChanges(periodKinds, action);
export const trackBackupChanges = <T>(action: () => Promise<T>) => trackCloudChanges(cloudKinds, action);

async function materialize({ kind, id, value }: CloudRecord) {
  switch (kind) {
    case 'todo':
      return value === null ? database.todos.delete(Number(id)) : database.todos.put(value as Todo);
    case 'category':
      return value === null ? database.categories.delete(id) : database.categories.put(value as Category);
    case 'anniversary':
      return value === null ? database.anniversaries.delete(Number(id)) : database.anniversaries.put(value as Anniversary);
  }
  const data = await readPeriod() ?? emptyData();
  if (kind === 'periods') data.periods = (value as PeriodEntry[] | null) ?? [];
  if (kind === 'cycle') data.settings = (value as CycleSettings | null) ?? emptyData().settings;
  if (kind === 'day') {
    if (value === null) delete data.days[id];
    else data.days[id] = value as DailyEntry;
  }
  await database.state.put({ id: 'local', value: data });
}

function invalidCalendar(record: CloudRecord) {
  if (record.kind !== 'anniversary' || record.value === null) return false;
  if (typeof record.value !== 'object' || Array.isArray(record.value)) return true;
  const value = record.value as Anniversary;
  return !Number.isSafeInteger(value.id) || Number(value.id) <= 0 || Number(value.id) > 0xfffffffffffff
    || String(value.id) !== record.id || typeof value.date !== 'string' || !validDate(value.date)
    || !validCalendarFields(value) || typeof value.name !== 'string' || !value.name.trim()
    || typeof value.note !== 'string' || typeof value.icon !== 'string' || typeof value.yearly !== 'boolean'
    || !themes.includes(value.theme) || !colors.includes(value.color)
    || (value.timingMode !== undefined && !timingModes.includes(value.timingMode))
    || typeof value.createdAt !== 'number' || typeof value.updatedAt !== 'number';
}

// A quarantine entry is keyed by the remote revision, so later malformed versions
// cannot overwrite earlier evidence. It is committed with the cursor itself.
async function quarantine(record: CloudRecord, previous: CloudValue) {
  const operation = `quarantine:${record.kind}:${record.id}:${record.version}`;
  if (await database.syncConflicts.get(operation)) return;
  await database.syncConflicts.put({
    operation,
    kind: record.kind, recordId: record.id, remoteVersion: record.version, rawRecord: record,
    attempted: record.value, latest: previous, reason: 'calendar', at: Date.now(),
  });
}

// A missing category is not proof of deletion: it may simply be on a later
// page. Only a known tombstone permits rewriting a reference. Queue each
// rewrite in the same transaction, retaining any in-flight attempt.
async function reconcileCategoryReferences(completePageSet = false) {
  const categories = await database.categories.toArray();
  const ids = new Set(categories.map(category => category.id));
  const records = await database.syncRecords.toArray();
  const deleted = new Set(records.filter(row => row.kind === 'category' && !ids.has(row.id)
    && (row.value === null || (row.dirty && row.desired === null) || row.seen?.value === null)).map(row => row.id));
  const todos = await database.todos.toArray();
  let fallback = categories.find(category => category.key === categoryKey('生活'))
    ?? categories.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0];
  if (!fallback && completePageSet && todos.some(todo => todo.categoryId && deleted.has(todo.categoryId))) {
    // Do not invent a fallback until all pages have been read. Never reuse a tombstoned ID.
    let id = 'life-recovered';
    while (deleted.has(id)) id += '-next';
    fallback = { id, name: '生活', key: categoryKey('生活'), builtin: false, createdAt: 0 };
    await database.categories.put(fallback);
    await queueChange({ kind: 'category', id, version: 0, value: null }, fallback);
  }
  if (!fallback) return false;
  let changed = false;
  for (const todo of todos) {
    if (!todo.categoryId || !deleted.has(todo.categoryId)) continue;
    await database.state.put({ id: `cloud:category-reconciliation:${localId()}`,
      value: { todo: structuredClone(todo), deletedCategoryId: todo.categoryId, fallbackCategoryId: fallback.id } });
    const updated = { ...todo, categoryId: fallback.id };
    await database.todos.put(updated);
    await queueChange({ kind: 'todo', id: String(todo.id), version: 0, value: todo }, updated);
    changed = true;
  }
  return changed;
}

export async function finishPull() {
  const changed = await database.transaction('rw', materializationTables(), () => reconcileCategoryReferences(true));
  if (changed) { notifyCache(cloudChanged); notifyCache(cloudQueued); }
}

function materializationTables() {
  return [database.todos, database.categories, database.anniversaries, database.state, database.syncRecords];
}

export async function nextAttempt() {
  return database.transaction('rw', database.syncRecords, async () => {
    const row = await database.syncRecords.where('dirty').equals(1).filter(item => !item.blocked).first();
    if (!row) return;
    const attempt = row.attempt ?? { operation: localId(), version: row.version, value: row.desired };
    if (!row.attempt) await database.syncRecords.put({ ...row, attempt });
    return { kind: row.kind, id: row.id, attempt };
  });
}

export async function acceptPush(kind: CloudKind, id: string, operation: string, response: PushResponse) {
  const changed = await database.transaction('rw', [...materializationTables(), database.syncConflicts], async () => {
    const key = recordKey(kind, id);
    const row = await database.syncRecords.get(key);
    if (!row?.attempt || row.attempt.operation !== operation) return false;
    const accepted = { kind, id, value: response.value, version: response.version };
    const latest = row.seen && row.seen.version > accepted.version ? row.seen : accepted;
    if (invalidCalendar(latest)) {
      await quarantine(latest, row.value);
      // Keep the entire in-flight operation and successor untouched for recovery.
      await database.syncRecords.put({ ...row, blocked: true });
      return true;
    }
    if (response.status === 'conflict') {
      await database.syncConflicts.put({
        operation, kind, recordId: id, attempted: row.desired, latest: latest.value, reason: response.reason, at: Date.now(),
        inFlight: row.attempt,
      });
    }
    const hasSuccessor = response.status === 'applied' && !equalValue(row.desired, row.attempt.value);
    const baseline = hasSuccessor ? accepted : latest;
    const desired = hasSuccessor ? row.desired : latest.value;
    await database.syncRecords.put({
      ...baseline, key, desired, dirty: hasSuccessor ? 1 : 0,
      ...(hasSuccessor && latest.version > baseline.version ? { seen: latest } : {}),
    });
    const materialized = !equalValue(row.desired, desired);
    if (materialized) await materialize({ ...latest, value: desired });
    const reconciled = (kind === 'category' || kind === 'todo') && await reconcileCategoryReferences();
    return reconciled || materialized;
  });
  if (changed) notifyCache(cloudChanged);
}

export async function applyPull(rows: CloudRecord[]) {
  const changed = await database.transaction('rw', [...materializationTables(), database.syncConflicts], async () => {
    let cursor = await readCursor();
    let changed = false;
    for (const record of rows) {
      if (record.version <= cursor) continue;
      cursor = record.version;
      const key = recordKey(record.kind, record.id);
      const row = await database.syncRecords.get(key);
      if (row && record.version <= Math.max(row.version, row.seen?.version ?? 0)) continue;
      if (invalidCalendar(record)) {
        await quarantine(record, row?.value ?? null);
        changed = true;
        continue;
      }
      if (row?.dirty) {
        await database.syncRecords.put({ ...row, seen: record, blocked: false });
        continue;
      }
      await database.syncRecords.put({ ...record, key, desired: record.value, dirty: 0 });
      await materialize(record);
      changed = true;
    }
    if (rows.some(row => row.kind === 'category' || row.kind === 'todo'))
      changed = await reconcileCategoryReferences() || changed;
    await database.state.put({ id: cursorKey, value: cursor });
    return changed;
  });
  if (changed) { notifyCache(cloudChanged); notifyCache(cloudQueued); }
}

export async function readCursor() {
  return (await database.state.get(cursorKey))?.value as number | undefined ?? 0;
}
export async function cacheInitialized() {
  return (await database.state.get(initializedKey))?.value === true;
}
export async function markInitialized() {
  await database.state.put({ id: initializedKey, value: true });
}

export async function syncCounts() {
  const [pending, conflicts] = await Promise.all([
    database.syncRecords.where('dirty').equals(1).count(),
    database.syncConflicts.orderBy('at').reverse().toArray(),
  ]);
  return { pending, conflicts };
}

export async function resolveSyncConflict(operation: string, reapply: boolean) {
  await database.transaction('rw', [...materializationTables(), database.syncConflicts], async () => {
    const conflict = await database.syncConflicts.get(operation);
    if (!conflict) return;
    if (conflict.reason === 'calendar') throw new Error('隔离记录不能在此处删除；请先导出并修复原始数据。');
    if (reapply) {
      const key = recordKey(conflict.kind, conflict.recordId);
      const row = await database.syncRecords.get(key);
      if (invalidCalendar({ kind: conflict.kind, id: conflict.recordId, version: 0, value: conflict.attempted })) {
        throw new Error('副本中的日期字段不一致，请先导出副本并修复日期。');
      }
      if (!row || row.dirty || !equalValue(row.value, conflict.latest)) {
        throw new Error('这条记录在冲突发生后又有更改。请先比较当前记录和保留的副本。');
      }
      await queueChange(row, conflict.attempted);
      await materialize({ ...row, value: conflict.attempted });
      if (conflict.kind === 'category' || conflict.kind === 'todo') await reconcileCategoryReferences();
    }
    await database.syncConflicts.delete(operation);
  });
  window.dispatchEvent(new Event(cloudChanged));
  notifyCache(cloudQueued);
}
