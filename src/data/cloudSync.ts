import { liveQuery } from 'dexie';
import { CloudError, pullCloud, pushCloud } from './cloudbase';
import {
  acceptPush, applyPull, cacheInitialized, finishPull, markInitialized, nextAttempt, readCursor, syncCounts,
} from './cloudStore';
import { cloudKinds, cloudQueued, type CloudScope, type SyncConflict } from './cloudTypes';

const pageSize = 16;
const maxPushes = 32;

async function pull(scope: CloudScope, active = () => true) {
  let more = true;
  while (more && active()) {
    const cursor = await readCursor();
    const rows = await pullCloud(scope, cursor);
    if (!Array.isArray(rows) || rows.length > pageSize || rows.some((row, index) =>
      !row || !cloudKinds.includes(row.kind) || typeof row.id !== 'string' || !Number.isSafeInteger(row.version)
      || row.version <= (index ? rows[index - 1].version : cursor)
      || (row.kind !== 'anniversary' && row.value !== null && (!row.value || typeof row.value !== 'object')))) {
      throw new CloudError(502, 'INVALID_SYNC_RESPONSE');
    }
    if (!active()) return;
    await applyPull(rows);
    more = rows.length === pageSize;
  }
  if (active()) await finishPull();
}

export async function initializeCloudCache(scope: CloudScope) {
  if (await cacheInitialized()) return;
  await pull(scope);
  await markInitialized();
}

export type SyncStatus = {
  phase: 'waiting' | 'offline' | 'syncing' | 'current' | 'error';
  pending: number;
  conflicts: SyncConflict[];
};

export function startCloudSync(scope: CloudScope, report: (status: SyncStatus) => void, onReauth: () => void) {
  let current: SyncStatus = { phase: 'waiting', pending: 0, conflicts: [] };
  let stopped = false;
  let running = false;
  let requested = false;
  let timer: number | undefined;
  let failures = 0;

  const update = (change: Partial<SyncStatus>) => {
    current = { ...current, ...change };
    if (!stopped) report(current);
  };
  const subscription = liveQuery(syncCounts).subscribe({
    next: counts => update(counts),
    error: () => update({ phase: 'error' }),
  });
  function schedule(delay: number) {
    if (stopped) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(kick, delay);
  }
  function kick() {
    if (stopped) return;
    window.clearTimeout(timer);
    if (!navigator.onLine) {
      update({ phase: 'offline' });
      return;
    }
    if (running) { requested = true; return; }
    void sync();
  }
  async function sync() {
    running = true;
    update({ phase: 'syncing' });
    try {
      let count = 0;
      while (!stopped && count < maxPushes) {
        const pending = await nextAttempt();
        if (!pending || stopped) break;
        const { kind, id, attempt } = pending;
        const result = await pushCloud(scope, kind, id, attempt);
        if (stopped) return;
        if (!result || !['applied', 'conflict'].includes(result.status) || !Number.isSafeInteger(result.version)
          || result.version < 0 || (kind !== 'anniversary' && result.value !== null && (!result.value || typeof result.value !== 'object'))) {
          throw new CloudError(502, 'INVALID_SYNC_RESPONSE');
        }
        await acceptPush(kind, id, attempt.operation, result);
        count++;
      }
      if (stopped) return;
      await pull(scope, () => !stopped);
      failures = 0;
      if (count === maxPushes) requested = true;
      update({ phase: navigator.onLine ? 'current' : 'offline' });
      schedule(requested ? 100 : 12000);
    } catch (error) {
      if (stopped) return;
      if (error instanceof CloudError && error.authRequired) {
        onReauth();
        return;
      }
      update({ phase: !navigator.onLine ? 'offline' : 'error' });
      failures++;
      schedule(Math.min(60000, 2000 * 2 ** Math.min(failures, 5)));
    } finally {
      running = false;
      requested = false;
    }
  }
  function queued() {
    if (running) requested = true;
    else schedule(200);
  }
  window.addEventListener(cloudQueued, queued);
  window.addEventListener('online', kick);
  window.addEventListener('offline', kick);
  window.addEventListener('focus', kick);
  const visible = () => { if (document.visibilityState === 'visible') kick(); };
  document.addEventListener('visibilitychange', visible);
  kick();
  return {
    retry: kick,
    stop() {
      stopped = true;
      window.clearTimeout(timer);
      subscription.unsubscribe();
      window.removeEventListener(cloudQueued, queued);
      window.removeEventListener('online', kick);
      window.removeEventListener('offline', kick);
      window.removeEventListener('focus', kick);
      document.removeEventListener('visibilitychange', visible);
    },
  };
}
