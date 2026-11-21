import { version as appVersion } from '../../package.json';
import { decodeBackup, encodeBackup, makeBackup, mergeBackup, type Backup, type RestoreMode } from './backupModel';
import { localId } from './localId';
import { periodDatabase, readPeriod } from './periodDatabase';
import { cloudScope } from './localDatabase';
import { trackBackupChanges } from './cloudStore';
import { cloudChanged } from './cloudTypes';
import {
  canRestore, previousBackup, readPrimary, restoreJournal, restoreRevision, rollbackRestore,
  withDataAccess, writePrimary, type PrimaryRecords,
} from './storageAccess';

async function capture(): Promise<Backup> {
  return makeBackup({ ...await readPrimary(), period: await readPeriod() }, appVersion);
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

export function restoreBackup(backup: Backup, mode: RestoreMode) {
  if (!canRestore()) return Promise.reject(new Error('此环境无法安全恢复，请使用 HTTPS 正式版或支持 Web Locks 的浏览器。'));
  return withDataAccess(async () => {
    const before = await capture();
    const { period: _period, ...primary } = before.records;
    const { records, periodConflicts } = mode === 'merge'
      ? mergeBackup(before.records, backup.records)
      : { records: backup.records, periodConflicts: 0 };
    const { state } = periodDatabase;
    if (cloudScope) {
      await trackBackupChanges(async () => {
        if (mode === 'replace') await state.put({ id: previousBackup, value: encodeBackup(before) });
        await writePrimary(records);
        if (records.period === null) await state.delete('local');
        else await state.put({ id: 'local', value: records.period });
      });
      window.dispatchEvent(new Event(cloudChanged));
      return { periodConflicts };
    }

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

async function finishRollback(rollback: () => Promise<void>) {
  try { await rollback(); }
  catch { throw new Error('导入未完成。已保留恢复日志，请重新打开应用以重试回滚。'); }
}
