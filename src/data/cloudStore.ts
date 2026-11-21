import { cloudScope, database, type Todo } from './localDatabase';
import { readPeriod } from './periodDatabase';
import { localId } from './localId';
import { emptyData, sortedPeriods, type CycleSettings, type DailyEntry, type PeriodEntry } from '../features/period/model';
import type { Anniversary } from '../features/anniversary/model';
import type { Category } from './categories';
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

function materializationTables() {
  return [database.todos, database.categories, database.anniversaries, database.state, database.syncRecords];
}

export async function nextAttempt() {
  return database.transaction('rw', database.syncRecords, async () => {
    const row = await database.syncRecords.where('dirty').equals(1).first();
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
    if (response.status === 'conflict') {
      await database.syncConflicts.put({
        operation, kind, recordId: id, attempted: row.desired, latest: latest.value, reason: response.reason, at: Date.now(),
      });
    }
    const hasSuccessor = response.status === 'applied' && !equalValue(row.desired, row.attempt.value);
    const baseline = hasSuccessor ? accepted : latest;
    const desired = hasSuccessor ? row.desired : latest.value;
    await database.syncRecords.put({
      ...baseline, key, desired, dirty: hasSuccessor ? 1 : 0,
      ...(hasSuccessor && latest.version > baseline.version ? { seen: latest } : {}),
    });
    if (equalValue(row.desired, desired)) return false;
    await materialize({ ...latest, value: desired });
    return true;
  });
  if (changed) notifyCache(cloudChanged);
}

export async function applyPull(rows: CloudRecord[]) {
  const changed = await database.transaction('rw', materializationTables(), async () => {
    let cursor = await readCursor();
    let changed = false;
    for (const record of rows) {
      if (record.version <= cursor) continue;
      cursor = record.version;
      const key = recordKey(record.kind, record.id);
      const row = await database.syncRecords.get(key);
      if (row && record.version <= Math.max(row.version, row.seen?.version ?? 0)) continue;
      if (row?.dirty) {
        await database.syncRecords.put({ ...row, seen: record });
        continue;
      }
      await database.syncRecords.put({ ...record, key, desired: record.value, dirty: 0 });
      await materialize(record);
      changed = true;
    }
    await database.state.put({ id: cursorKey, value: cursor });
    return changed;
  });
  if (changed) notifyCache(cloudChanged);
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
    if (reapply) {
      const key = recordKey(conflict.kind, conflict.recordId);
      const row = await database.syncRecords.get(key);
      if (!row || row.dirty || !equalValue(row.value, conflict.latest)) {
        throw new Error('这条记录在冲突发生后又有更改。请先比较当前记录和保留的副本。');
      }
      await queueChange(row, conflict.attempted);
      await materialize({ ...row, value: conflict.attempted });
    }
    await database.syncConflicts.delete(operation);
  });
  window.dispatchEvent(new Event(cloudChanged));
  notifyCache(cloudQueued);
}
