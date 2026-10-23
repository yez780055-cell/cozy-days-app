import { useState } from 'react';
const key = 'cozy-days-period-recovery-v1';
type Recovery = { pending?: {data:unknown;base:string}; drafts?: Record<string, unknown>; stamp?: number; conflicts?: unknown[] };
let memory: Recovery = {};
let kind: 'local'|'session'|'memory' = 'memory';
for (const name of ['localStorage', 'sessionStorage'] as const) {
  try {
    const raw = window[name].getItem(key);
    if (raw) {
      const value = JSON.parse(raw);
      if (value && typeof value === 'object' && !Array.isArray(value) && Number.isFinite(value.stamp) && (!memory.stamp || value.stamp > memory.stamp)) {
        memory = value; kind = name==='localStorage'?'local':'session';
      }
    }
  } catch { /* try next storage */ }
}
export function persistRecovery() {
  memory.stamp = Math.max(Date.now(), (memory.stamp ?? 0) + 1);
  kind = 'memory';
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try { window[name].setItem(key, JSON.stringify(memory)); if(kind!=='local') kind=name==='localStorage'?'local':'session'; } catch { /* memory survives unmounts */ }
  }
  return kind !== 'memory';
}
export function recoveryStatus() { return kind !== 'memory'; }
export function recoveryNotice() { return kind==='local'?'草稿暂存在此设备，保存成功后关闭。':kind==='session'?'草稿仅暂存在此标签页，关闭标签页会丢失。':'草稿仅内存保留，刷新或关闭页面可能丢失。'; }
export function pendingRecovery() { return memory.pending; }
export function setPending(data?: unknown, base='') { memory.pending = data===undefined?undefined:{data,base}; return persistRecovery(); }
export function archiveConflict(value: unknown) { memory.conflicts=[...(Array.isArray(memory.conflicts)?memory.conflicts:[]),value]; persistRecovery(); }
export function usePeriodDraft<T extends object>(name: string, initial: () => T, validate?: (value:unknown)=>value is T) {
  const [value, setValue] = useState<T>(() => {
    const fallback=initial(), stored=memory.drafts?.[name];
    const valid=stored && typeof stored==='object' && !Array.isArray(stored) && (validate?validate(stored):!Object.entries(fallback).some(([key,value])=>typeof (stored as Record<string,unknown>)[key]!==typeof value));
    const result=valid?stored as T:fallback;
    memory.drafts={...(memory.drafts && typeof memory.drafts==='object'?memory.drafts:{}),[name]:result};
    persistRecovery();
    return result;
  });
  return [value, (next: T) => { memory.drafts = { ...(memory.drafts && typeof memory.drafts==='object'?memory.drafts:{}), [name]: next }; persistRecovery(); setValue(next); }] as const;
}
export function clearPeriodDraft(name: string) { if(memory.drafts && typeof memory.drafts==='object') delete memory.drafts[name]; persistRecovery(); }
