import { version as appVersion } from '../../package.json';
import { decodeBackup, encodeBackup, makeBackup, mergeBackup, type Backup, type BackupRecords, type RestoreMode } from './backupModel';
import { localId } from './localId';
import { periodDatabase, readPeriod } from './periodDatabase';
import { cloudScope, database } from './localDatabase';
import { trackBackupChanges } from './cloudStore';
import { readRecoveryEntries, saveRecoveryEntries, type RecoveryEntry } from './recoveryArchive';
import { cloudChanged, equalValue, type CloudKind, type CloudValue } from './cloudTypes';
import { emptyData, sortedPeriods } from '../features/period/model';
import {
  canRestore, previousBackup, readPrimary, restoreJournal, restoreRevision, rollbackRestore,
  withDataAccess, writePrimary, type PrimaryRecords,
} from './storageAccess';

async function capture(): Promise<Backup> {
  const read = async () => makeBackup({ ...await readPrimary(), period: await readPeriod() }, appVersion, await readRecoveryEntries());
  // Sync does not take the UI's Web Lock; read cloud business and recovery rows
  // in one IndexedDB snapshot so an in-flight transaction cannot split them.
  if (cloudScope) return database.transaction('r', [database.todos, database.categories, database.anniversaries,
    database.state, database.syncRecords, database.syncConflicts], read);
  return read();
}

export function exportBackup() {
  return withDataAccess(async () => {
    const backup = await capture();
    return { backup, json: encodeBackup(backup) };
  });
}

export function exportPreviousBackup() {
  return withDataAccess(async () => {
    const row = await periodDatabase.state.get(previousBackup);
    if (!row) return null;
    if (typeof row.value !== 'string') throw new Error('自动备份无法读取。');
    return { backup: decodeBackup(row.value), json: row.value };
  });
}

export function importRecoveryEvidence(entry: RecoveryEntry) {
  if (!canRestore()) return Promise.reject(new Error('此环境无法安全恢复，请使用 HTTPS 正式版或支持 Web Locks 的浏览器。'));
  if (entry.scope !== null) return Promise.reject(new Error('此入口仅接受无账号来源的隔离记录。'));
  return withDataAccess(() => periodDatabase.transaction('rw', periodDatabase.state, () => saveRecoveryEntries([entry])));
}

export function restoreBackup(backup: Backup, mode: RestoreMode) {
  if (!canRestore()) return Promise.reject(new Error('此环境无法安全恢复，请使用 HTTPS 正式版或支持 Web Locks 的浏览器。'));
  return withDataAccess(async () => {
    // Callers other than the UI must not bypass recovery-data validation.
    backup = decodeBackup(encodeBackup(backup));
    const { state } = periodDatabase;
    if (cloudScope) {
      let periodConflicts = 0;
      await trackBackupChanges(async () => {
        const before = await capture();
        const merged = mode === 'merge' ? mergeBackup(before.records, backup.records)
          : { records: backup.records, periodConflicts: 0 };
        const { records } = merged;
        periodConflicts = merged.periodConflicts;
        await assertPendingUnchanged(before.records, records);
        if (mode === 'replace') await state.put({ id: previousBackup, value: encodeBackup(before) });
        await writePrimary(records);
        if (records.period === null) await state.delete('local');
        else await state.put({ id: 'local', value: records.period });
        await saveRecoveryEntries(backup.recovery ?? []);
      });
      window.dispatchEvent(new Event(cloudChanged));
      return { periodConflicts };
    }

    const before = await capture();
    const { period: _period, ...primary } = before.records;
    const { records, periodConflicts } = mode === 'merge'
      ? mergeBackup(before.records, backup.records)
      : { records: backup.records, periodConflicts: 0 };

    // Stage the original primary rows before touching either module database.
    // The final period transaction commits the third module and clears the
    // journal together. A surviving journal always means we must roll back.
    const automatic = mode === 'replace' ? encodeBackup(before) : null;
    try {
      await periodDatabase.transaction('rw', state, async () => {
        await state.put({ id: restoreJournal, value: primary });
        if (automatic !== null) await state.put({ id: previousBackup, value: automatic });
      });
    } catch {
      throw new Error('无法保存本机恢复日志，原数据未更改。');
    }

    try {
      await writePrimary(records);
    } catch {
      // A failed primary transaction has already rolled back its own writes.
      await finishRollback(() => state.delete(restoreJournal));
      throw new Error('导入失败，三个模块的原数据均已保留。');
    }

    try {
      await periodDatabase.transaction('rw', state, async () => {
        if (records.period === null) await state.delete('local');
        else await state.put({ id: 'local', value: records.period });
        await saveRecoveryEntries(backup.recovery ?? []);
        await state.put({ id: restoreRevision, value: localId() });
        await state.delete(restoreJournal);
      });
    } catch {
      await finishRollback(() => rollbackRestore(primary));
      throw new Error('导入失败，三个模块的原数据均已恢复。');
    }
    return { periodConflicts };
  });
}

function valueFor(records: BackupRecords, kind: CloudKind, id: string): CloudValue {
  if (kind === 'todo') return records.todos.find(row => String(row.id) === id) ?? null;
  if (kind === 'category') return records.categories.find(row => row.id === id) ?? null;
  if (kind === 'anniversary') return records.anniversaries.find(row => String(row.id) === id) ?? null;
  const period = records.period ?? emptyData();
  if (kind === 'periods') return sortedPeriods(period.periods);
  if (kind === 'cycle') return period.settings;
  return period.days[id] ?? null;
}

async function assertPendingUnchanged(before: BackupRecords, after: BackupRecords) {
  for (const row of await database.syncRecords.where('dirty').equals(1).toArray()) {
    if (!equalValue(valueFor(before, row.kind, row.id), valueFor(after, row.kind, row.id))) {
      throw new Error('备份会改动尚未同步的记录。请先完成同步或保留当前记录，原队列和备份均未更改。');
    }
  }
}

async function finishRollback(rollback: () => Promise<void>) {
  try { await rollback(); }
  catch { throw new Error('导入未完成。已保留恢复日志，请重新打开应用以重试回滚。'); }
}
