import { useEffect, useState } from 'react';
import { emptyData, type PeriodData } from './model';
import { PeriodConflictError, periodRepository, validPeriodData } from './repository';
import { archiveConflict, conflictArchives, pendingRecovery, recoveryNotice, recoveryStatus, setPending } from './recovery';
// A module-owned session and single writer outlive page mounts.
let state = { data: emptyData(), ready: false, error: '', saving: false, restoring: false, durable: false };
const listeners = new Set<() => void>();
let loading: Promise<void> | undefined;
let writing: Promise<boolean> | undefined;
let revision = 0;
let restoreToken = 0;
let baseline = '';
let conflict: {database:PeriodData;draft:PeriodData}|undefined;
function publish(change: Partial<typeof state>) { state = { ...state, ...change }; listeners.forEach(fn => fn()); }
function load() {
  if(state.restoring) return Promise.resolve();
  if (loading) return loading;
  const started = revision;
  conflict=undefined;
  publish({});
  loading = periodRepository.load().then(value => {
    if (started !== revision) return;
    const pending = pendingRecovery();
    if (pending !== undefined && (!validPeriodData(pending.data) || typeof pending.base!=='string')) throw new Error('Invalid recovery');
    baseline=JSON.stringify(value);
    if(pending && JSON.stringify(pending.data)!==baseline && pending.base!==baseline) {
      conflict={database:value,draft:pending.data as PeriodData};
      publish({ready:false,error:'记录库与恢复草稿存在冲突，双方均已保留。请选择恢复来源，或重试读取。'});return;
    }
    if(pending && JSON.stringify(pending.data)===baseline) setPending(undefined);
    const unsaved=pending && JSON.stringify(pending.data)!==baseline;
    publish({ data: unsaved ? pending.data as PeriodData : value, ready: true, error: unsaved ? '恢复了尚未保存的更改，请重试保存。' : '', durable: recoveryStatus() });
  }).catch(() => publish({ ready: false, error: '记录读取失败或数据格式异常，原数据已保留，请重试。' })).finally(() => { loading = undefined; });
  return loading;
}
function save(): Promise<boolean> {
  if(state.restoring||!state.ready) return Promise.resolve(false);
  if (writing) return writing;
  publish({ saving: true });
  writing = (async () => {
    while (true) {
      const value = state.data, version = revision;
      try { await periodRepository.save(value,baseline); }
      catch(error) {
        if(error instanceof PeriodConflictError) {
          conflict={database:error.current,draft:state.data};
          publish({ready:false,error:'记录库与恢复草稿存在冲突，双方暂留在恢复区，请选择恢复来源。',saving:false});
        } else publish({ error: '保存失败，当前更改尚未保存，请重试。', saving: false });
        return false;
      }
      baseline=JSON.stringify(value);
      if (version !== revision) { publish({durable:setPending(state.data,baseline)}); continue; }
      setPending(undefined);
      publish({ error: '', saving: false, durable: recoveryStatus() });
      return true;
    }
  })().finally(() => { writing = undefined; });
  return writing;
}
export function usePeriod() {
  const [, render] = useState(0);
  useEffect(() => { const notify = () => render(n => n + 1); listeners.add(notify); if (!state.ready&&!state.restoring&&!conflict) void load(); return () => { listeners.delete(notify); }; }, []);
  function update(change: (value: PeriodData) => PeriodData) {
    if (!state.ready) return Promise.resolve(false);
    const data = change(state.data); revision++;
    publish({ data, durable: setPending(data,baseline) });
    return save();
  }
  function resolveConflict(source:'database'|'draft') {
    if(!conflict||state.restoring||writing||loading)return;
    const backedUp=archiveConflict(conflict);
    if(source==='draft'&&!backedUp) { publish({error:'无法可靠保存冲突备份，记录库未替换。请启用设备本地存储，或先查看并导出备份。'});return; }
    const data=conflict[source];baseline=JSON.stringify(conflict.database);conflict=undefined;revision++;
    publish({data,ready:true,error:source==='draft'?'已恢复草稿，尚未保存，请重试保存。':'',durable:setPending(source==='draft'?data:undefined,baseline)});
  }
  async function restoreArchive(value:unknown) {
    if(!validPeriodData(value))return;
    // This guard is synchronous: UI disabling alone cannot coordinate another
    // mount, a stale click handler, or a retry arriving during the read.
    if(writing||loading||state.restoring) { publish({error:'保存或读取仍在进行中，恢复尚未开始，请稍后重试。'});return; }
    const token=++restoreToken, version=revision, previousReady=state.ready, previousConflict=conflict;
    conflict=undefined;
    publish({restoring:true,ready:false,error:'正在读取恢复来源，暂不能编辑…'});
    try {
      const database=await periodRepository.load();
      if(token!==restoreToken)return;
      if(version!==revision) { publish({restoring:false,ready:previousReady,error:'恢复期间更改已变化，本次恢复已取消，最新更改仍保留。'});return; }
      const pending=pendingRecovery();
      if(pending!==undefined) {
        if(!validPeriodData(pending.data)||!archiveConflict({database,draft:pending.data})) {
          conflict=previousConflict;publish({restoring:false,ready:previousReady,error:'无法可靠保存当前未保存更改，恢复未开始；原草稿仍保留，请先导出或恢复设备本地存储。'});return;
        }
      }
      if(previousConflict&&!archiveConflict(previousConflict)) {
        conflict=previousConflict;publish({restoring:false,ready:previousReady,error:'无法可靠保存当前冲突副本，恢复未开始。'});return;
      }
      conflict={database,draft:value};publish({restoring:false,ready:false,error:'恢复备份将替换当前记录，请先检查双方内容并确认。'});
    }
    catch { if(token!==restoreToken)return;conflict=previousConflict;publish({restoring:false,ready:previousReady,error:'记录读取失败，未恢复备份，原数据与草稿已保留。'}); }
  }
  return { ...state, conflict:!!conflict, conflictData:conflict, archives:conflictArchives(),restoreArchive, resolveConflict, notice:recoveryNotice(), update, retry: () => state.restoring ? Promise.resolve() : state.ready ? save() : load() };
}
