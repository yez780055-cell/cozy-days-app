import { localId } from '../../data/localId';
import { useState } from 'react';
const legacyKey = 'cozy-days-period-recovery-v1';
let key = legacyKey;
let prefix = key + '-document-';
type Recovery = { pending?: {data:unknown;base:string}; drafts?: Record<string, unknown>; stamp?: number; conflicts?: unknown[]; owner?:string; tab?:string };
const owner=localId();
let localKey=prefix+owner;
let kind: 'local'|'session'|'memory' = 'memory';
function parse(raw:string|null):Recovery|undefined {
  try { const value=raw?JSON.parse(raw):undefined;return value&&typeof value==='object'&&!Array.isArray(value)&&Number.isSafeInteger(value.stamp)&&value.stamp>=0?value:undefined; } catch { return undefined; }
}
function localRecords() {
  const records:{key:string;value:Recovery}[]=[];
  try { for(let i=0;i<localStorage.length;i++) {const name=localStorage.key(i);if(name&&(name===key||name.startsWith(prefix))) {const value=parse(localStorage.getItem(name));if(value)records.push({key:name,value});}} } catch { /* optional local storage */ }
  return records;
}
let memory: Recovery;
export function setPeriodRecoveryScope(scope?: string) {
  key = scope ? legacyKey + ':cloud:' + scope : legacyKey;
  prefix = key + '-document-';
  localKey = prefix + owner;
  let session: Recovery | undefined;
  try { session = parse(sessionStorage.getItem(key)); } catch { /* optional session storage */ }
  const records = localRecords();
  const related = session ? records.filter(r => session.tab ? r.value.tab === session.tab : r.value.owner === session.owner) : records;
  const candidates = [...related.map(r => ({ value: r.value, kind: 'local' as const })),
    ...(session ? [{ value: session, kind: 'session' as const }] : [])];
  candidates.sort((a,b) => (b.value.stamp ?? 0) - (a.value.stamp ?? 0));
  kind = candidates[0]?.kind ?? 'memory';
  // Each document owns its local slot. Per-tab session state selects continuity.
  memory = { ...candidates[0]?.value, owner, tab: session?.tab ?? localId() };
}
setPeriodRecoveryScope();
export function persistRecovery() {
  memory.stamp = Math.max(Date.now(), (memory.stamp ?? 0) + 1);
  kind='memory';
  try { localStorage.setItem(localKey,JSON.stringify(memory));kind='local'; } catch { /* retain every other document's backup */ }
  try { sessionStorage.setItem(key,JSON.stringify(memory));if(kind!=='local')kind='session'; } catch { /* memory survives unmounts */ }
  return kind!=='memory';
}
export function isRecoveryStorageKey(value:string|null) { return value===null||value===key||value.startsWith(prefix); }
export function recoveryStatus() { return kind !== 'memory'; }
export function recoveryNotice() { return kind==='local'?'草稿暂存在此设备，保存成功后关闭。':kind==='session'?'草稿仅暂存在此标签页，关闭标签页会丢失。':'草稿仅内存保留，刷新或关闭页面可能丢失。'; }
export function pendingRecovery() { return memory.pending; }
export function setPending(data?: unknown, base='') { memory.pending = data===undefined?undefined:{data,base}; return persistRecovery(); }
export function archiveConflict(value: unknown) { memory.conflicts=[...(Array.isArray(memory.conflicts)?memory.conflicts:[]),value]; persistRecovery(); return kind==='local'; }
export function conflictArchives(baseline='') {
  const entries:unknown[]=Array.isArray(memory.conflicts)?[...memory.conflicts]:[];
  const ownPending=JSON.stringify(memory.pending?.data);
  for(const record of localRecords()) {
    if(record.key===localKey)continue;
    if(Array.isArray(record.value.conflicts))entries.push(...record.value.conflicts);
    const pending=record.value.pending;
    if(!pending||JSON.stringify(pending.data)===ownPending||JSON.stringify(pending.data)===baseline)continue;
    let database:unknown;try {database=JSON.parse(pending.base);}catch { /* still viewable/exportable */ }
    entries.push({database,draft:pending.data,source:'其他页面保留的更改'});
  }
  const seen=new Set<string>();
  return entries.filter(value=>{const fingerprint=JSON.stringify(value);if(seen.has(fingerprint))return false;seen.add(fingerprint);return true;});
}
export function usePeriodDraft<T extends object>(name: string, initial: () => T, validate?: (value:unknown)=>value is T) {
  const [value, setValue] = useState<T>(() => {
    const fallback=initial(), stored=memory.drafts?.[name];
    const valid=stored && typeof stored==='object' && !Array.isArray(stored) && (validate?validate(stored):!Object.entries(fallback).some(([key,value])=>typeof (stored as Record<string,unknown>)[key]!==typeof value));
    const result=valid?stored as T:fallback;
    // Opening an untouched view should not create a persistent document slot.
    if (!valid && Object.keys(result).length === 0) return result;
    memory.drafts={...(memory.drafts && typeof memory.drafts==='object'?memory.drafts:{}),[name]:result};
    persistRecovery();
    return result;
  });
  return [value, (next: T) => { memory.drafts = { ...(memory.drafts && typeof memory.drafts==='object'?memory.drafts:{}), [name]: next }; persistRecovery(); setValue(next); }] as const;
}
export function clearPeriodDraft(name: string) { if(memory.drafts && typeof memory.drafts==='object') delete memory.drafts[name]; persistRecovery(); }
