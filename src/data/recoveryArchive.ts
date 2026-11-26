import { cloudScope, database } from './localDatabase';
import { periodDatabase } from './periodDatabase';
import { cloudKinds, type SyncConflict } from './cloudTypes';

// Passive recovery evidence is never replayed as an active cloud operation.
// Keeping it separate avoids overwriting the destination's outbox or cursor.
export type RecoveryEntry = {
  scope: { spaceId: string; userId: string } | null;
  cursor: unknown;
  syncRecords: unknown[];
  syncConflicts: unknown[];
  categorySnapshots: { id: string; value: unknown }[];
};
export const recoveryArchiveKey = 'backup:recovery-archives-v1';
const snapshotPrefix = 'cloud:category-reconciliation:';

function jsonSafe(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => jsonSafe(item, depth + 1));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every(item => jsonSafe(item, depth + 1));
}

export function validRecoveryEntries(value: unknown): value is RecoveryEntry[] {
  if (!Array.isArray(value) || !jsonSafe(value)) return false;
  return value.every(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    const scope = row.scope as Record<string, unknown> | null;
    if (scope !== null && (!scope || typeof scope !== 'object' || Array.isArray(scope)
      || typeof scope.spaceId !== 'string' || !scope.spaceId || typeof scope.userId !== 'string' || !scope.userId)) return false;
    return Array.isArray(row.syncRecords) && Array.isArray(row.syncConflicts) && Array.isArray(row.categorySnapshots)
      && row.categorySnapshots.every(snapshot => snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
        && typeof snapshot.id === 'string' && snapshot.id.startsWith(snapshotPrefix) && 'value' in snapshot)
      && 'cursor' in row;
  });
}

// The previous release exported a single quarantine conflict without account
// provenance. Keep it as passive evidence; never infer an account or replay it.
export function decodeQuarantineExport(json: string): RecoveryEntry {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('文件不是有效的 JSON，或文件已损坏。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('不是可恢复的隔离记录。');
  const row = value as Record<string, unknown>;
  if (row.kind !== 'anniversary' || row.reason !== 'calendar' || typeof row.operation !== 'string'
    || !row.operation.startsWith('quarantine:anniversary:') || typeof row.recordId !== 'string'
    || !Object.prototype.hasOwnProperty.call(row, 'attempted') || !Object.prototype.hasOwnProperty.call(row, 'latest')) {
    throw new Error('不是可恢复的隔离记录。');
  }
  const entry = { scope: null, cursor: null, syncRecords: [], syncConflicts: [value], categorySnapshots: [] };
  if (!validRecoveryEntries([entry])) throw new Error('隔离记录格式无效，未读取任何数据。');
  return entry;
}

function mergeUnique(current: RecoveryEntry[], incoming: RecoveryEntry[]) {
  const result = [...current];
  const seen = new Set(result.map(item => JSON.stringify(item)));
  for (const entry of incoming) {
    const key = JSON.stringify(entry);
    if (!seen.has(key)) { result.push(entry); seen.add(key); }
  }
  return result;
}

export async function readRecoveryEntries(): Promise<RecoveryEntry[]> {
  const archiveRow = await periodDatabase.state.get(recoveryArchiveKey);
  const saved = archiveRow ? archiveRow.value : [];
  if (!validRecoveryEntries(saved)) throw new Error('本机恢复材料损坏，未导出不完整的备份。');
  if (!cloudScope) return saved;
  const [syncRecords, syncConflicts, state] = await Promise.all([
    database.syncRecords.toArray(), database.syncConflicts.toArray(), database.state.toArray(),
  ]);
  const cursor = state.find(row => row.id === 'cloud:cursor');
  const live: RecoveryEntry = {
    scope: { spaceId: cloudScope.spaceId, userId: cloudScope.userId },
    cursor: cursor ? cursor.value : null,
    syncRecords, syncConflicts,
    categorySnapshots: state.filter(row => row.id.startsWith(snapshotPrefix)),
  };
  if (!validRecoveryEntries([live])) throw new Error('恢复材料含无法无损导出的内容，未生成备份。');
  if (!live.syncRecords.length && !live.syncConflicts.length && !live.categorySnapshots.length) return saved;
  return mergeUnique(saved, [live]);
}

// Caller must hold the target state transaction. No active sync rows are changed.
export async function saveRecoveryEntries(incoming: RecoveryEntry[]) {
  if (!incoming.length) return;
  if (!validRecoveryEntries(incoming)) throw new Error('备份中的恢复材料无效，未导入任何数据。');
  const archiveRow = await periodDatabase.state.get(recoveryArchiveKey);
  const existing = archiveRow ? archiveRow.value : [];
  if (!validRecoveryEntries(existing)) throw new Error('本机恢复材料损坏，未覆盖原内容。');
  await periodDatabase.state.put({ id: recoveryArchiveKey, value: mergeUnique(existing, incoming) });

  // Restore inspectable evidence only for the same account and space. Never
  // overwrite a destination row or turn an archived operation into an attempt.
  if (!cloudScope) return;
  for (const entry of incoming) {
    if (entry.scope?.spaceId !== cloudScope.spaceId || entry.scope.userId !== cloudScope.userId) continue;
    for (const snapshot of entry.categorySnapshots) {
      if (!await database.state.get(snapshot.id)) await database.state.put(snapshot);
    }
    for (const candidate of entry.syncConflicts) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
      const row = candidate as SyncConflict;
      if (typeof row.operation !== 'string' || !row.operation || !cloudKinds.includes(row.kind)
        || typeof row.recordId !== 'string' || typeof row.reason !== 'string' || !Number.isFinite(row.at)
        || !Object.prototype.hasOwnProperty.call(row, 'attempted') || !Object.prototype.hasOwnProperty.call(row, 'latest')) continue;
      if (!await database.syncConflicts.get(row.operation)) await database.syncConflicts.put(row);
    }
  }
}
