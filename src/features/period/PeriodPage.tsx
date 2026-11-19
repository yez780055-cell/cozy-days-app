import { useEffect, useState } from 'react';
import { PeriodCalendar } from './PeriodCalendar';
import { DailyPeriodRecord } from './DailyPeriodRecord';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { localToday, shortDate, validatePeriod, type PeriodEntry } from './model';
import { localId } from '../../data/localId';
import { usePeriod } from './usePeriod';
import { usePeriodDraft } from './recovery';
import { PeriodRecovery } from './PeriodRecovery';
import { CycleOverview } from './CycleSummary';
import './period.css';
export default function PeriodPage() {
  const {data,ready,error,saving,restoring,durable,conflict,conflictData,archives,restoreArchive,resolveConflict,notice,update,retry}=usePeriod();
  const [backups,setBackups]=useState(false),[confirmRestore,setConfirmRestore]=useState(false);
  const [today,setToday]=useState(localToday),[selected,setSelected]=useState(localToday),[month,setMonth]=useState(()=>localToday().slice(0,7));
  const [history, setHistory] = useState<{id:string; start:string; end?:string; month:string}>();
  const [cancel, setCancel] = useState<PeriodEntry>();
  const [toggleError, setToggleError] = useState('');
  const [quickUndo, setQuickUndo] = usePeriodDraft<{id?:string}>('same-day-start', () => ({}));
  useEffect(()=>{ const refresh=()=>setToday(localToday()); const timer=setInterval(refresh,30_000); window.addEventListener('focus',refresh); return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);}; },[]);
  function select(date:string) {
    setSelected(date);
    setMonth(date.slice(0,7));
    setToggleError('');
  }
  const closed = data.periods.find(p => p.end && p.start <= selected && selected <= p.end);
  const current = data.periods.find(p => !p.end && p.start <= selected);
  const active = closed ? closed.start === closed.end || selected !== closed.end : !!current;

  function writePeriod(entry:PeriodEntry, action:'start'|'end'|'cancel') {
    setToggleError('');
    let validation = '';
    void update(d => {
      const previous = d.periods.find(p => p.id === entry.id);
      if (action === 'start' && previous) {
        validation = '这次经期记录已保存。';
        return d;
      }
      if (action !== 'start' && (!previous || previous.end || previous.start !== entry.start)) {
        validation = '这次经期记录已变更，请重新选择日期。';
        return d;
      }
      if (action !== 'cancel') {
        validation = validatePeriod(entry, d.periods) ?? '';
        if (validation) return d;
      }
      const periods = d.periods.filter(p => p.id !== entry.id);
      return {...d, periods:action === 'cancel' ? periods : [...periods, entry]};
    });
    if (validation) setToggleError(validation);
    return !validation;
  }

  function togglePeriod() {
    if (closed) return;
    if (current) {
      if (selected !== current.start) {
        if (writePeriod({...current, end:selected}, 'end') && quickUndo.id === current.id) setQuickUndo({});
      } else if (current.start === localToday() && quickUndo.id === current.id) {
        if (writePeriod(current, 'cancel')) setQuickUndo({});
      } else {
        setCancel(current);
      }
      return;
    }
    const entry = {id:localId(), start:selected};
    if (selected < localToday()) {
      setToggleError('');
      setHistory({...entry, month:selected.slice(0,7)});
    } else if (writePeriod(entry, 'start') && selected === localToday()) {
      setQuickUndo({id:entry.id});
    }
  }
  return <section className="period-page" aria-label="生理期页面">
    <header className="period-page-heading"><p>{today.slice(0,4)} · {today.slice(5,7)}</p><h1>生理期</h1></header>
    {error && <div className="period-error" role="alert">
      <p>{error}</p><Button variant="soft" disabled={restoring || saving} onClick={retry}>重试</Button>
    </div>}
    {conflict && <section className="period-warning" aria-label="恢复来源">
      <p>选择前双方均不覆盖，冲突副本暂留在恢复区。{notice}</p>
      <div className="period-recovery-actions">
        <Button variant="soft" onClick={()=>{setConfirmRestore(false);resolveConflict('database');}}>使用记录库版本</Button>
        <Button variant="soft" onClick={()=>setConfirmRestore(true)}>恢复草稿版本</Button>
      </div>
    </section>}
    {(conflict || archives.length > 0) && <Button variant="soft" disabled={saving || restoring} onClick={()=>setBackups(true)}>查看恢复备份</Button>}
    {conflict && confirmRestore && <Modal title="替换生理期记录？" layout="confirm" className="period-dialog" onClose={()=>setConfirmRestore(false)}>
      <p>草稿将替换当前记录库的全部生理期记录。设备会先保留双方副本。也可以先关闭弹窗，查看或导出备份。确认后还需点击重试保存。</p>
      <div className="confirm-actions">
        <Button variant="soft" data-autofocus onClick={()=>setConfirmRestore(false)}>取消替换</Button>
        <Button variant="danger" onClick={()=>{resolveConflict('draft');setConfirmRestore(false);}}>确认替换记录库</Button>
      </div>
    </Modal>}
    {backups&&<PeriodRecovery entries={[...archives,...(conflictData?[conflictData]:[])]} notice={notice} onClose={()=>setBackups(false)} onRestore={value=>{setBackups(false);setConfirmRestore(false);void restoreArchive(value);}}/>}
    {ready ? <div className="period-content">
      <CycleOverview data={data} today={today}/>
      <PeriodCalendar month={month} selected={selected} today={today} data={data} onMonth={setMonth} onSelect={select}/>
      <DailyPeriodRecord date={selected} today={today} value={data.days[selected]} active={active} locked={!!closed} onToggle={togglePeriod} onChange={value=>update(d=>{
        const days={...d.days}; if(!value.flow&&!value.mood&&!value.symptoms.length) delete days[selected]; else days[selected]=value;
        return {...d,days};
      })}/>
      {toggleError && !history && <p className="period-error" role="alert">{toggleError}</p>}
      <p className="period-storage" role="status">{saving?'正在保存…':error?(durable?'保存失败，尚未保存到记录库 · '+notice:'保存失败，仅内存保留，刷新或关闭页面会丢失，请重试'):''}</p>
    </div> : !error && <p className="loading-message" role="status">正在打开你的手账…</p>}
    {ready && history && <Modal title="选择经期结束日期" className="period-dialog period-end-dialog" onClose={() => { setHistory(undefined); setToggleError(''); }}>
      <p>开始日期 {shortDate(history.start)}。选择最后一天后保存。</p>
      <PeriodCalendar month={history.month} selected={history.end ?? ''} today={today} data={data}
        minDate={history.start} maxDate={today}
        onMonth={month => setHistory({...history, month})}
        onSelect={end => { setHistory({...history, end, month:end.slice(0,7)}); setToggleError(''); }}/>
      {toggleError && <p className="error-message" role="alert">{toggleError}</p>}
      <footer className="modal-actions"><Button disabled={!history.end} onClick={() => {
        const {id,start,end} = history;
        if (end && writePeriod({id,start,end}, 'start')) setHistory(undefined);
      }}>保存经期记录</Button></footer>
    </Modal>}
    {ready && cancel && <Modal title="是否取消这次经期记录？" layout="confirm" className="period-dialog" onClose={() => setCancel(undefined)}>
      <div className="confirm-actions">
        <Button variant="soft" data-autofocus onClick={() => setCancel(undefined)}>暂不操作</Button>
        <Button variant="danger" onClick={() => {
          if (writePeriod(cancel, 'cancel') && quickUndo.id === cancel.id) setQuickUndo({});
          setCancel(undefined);
        }}>取消经期</Button>
      </div>
    </Modal>}
  </section>;
}
