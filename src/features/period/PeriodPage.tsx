import { useEffect, useRef, useState } from 'react';
import { PeriodArt } from './PeriodArt';
import { PeriodCalendar } from './PeriodCalendar';
import { CycleSummary } from './CycleSummary';
import { DailyPeriodRecord } from './DailyPeriodRecord';
import { PeriodReminders } from './PeriodReminders';
import { PeriodTips } from './PeriodTips';
import { PeriodEditor, PeriodHistory, PeriodSettings } from './PeriodForms';
import { localToday, type PeriodEntry } from './model';
import { usePeriod } from './usePeriod';
import { clearPeriodDraft, usePeriodDraft } from './recovery';
import './period.css';
export default function PeriodPage() {
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  const {data,ready,error,saving,durable,conflict,resolveConflict,notice,update,retry}=usePeriod();
  const [today,setToday]=useState(localToday),[selected,setSelected]=useState(localToday),[month,setMonth]=useState(()=>localToday().slice(0,7));
  const [view,setView]=usePeriodDraft<{dialog?:'editor'|'history'|'settings';editing?:PeriodEntry}>('view',()=>({}),(v):v is {dialog?:'editor'|'history'|'settings';editing?:PeriodEntry}=>{const x=v as {dialog?:unknown;editing?:PeriodEntry};return (!x.dialog||['editor','history','settings'].includes(String(x.dialog)))&&(!x.editing||(typeof x.editing.id==='string'&&typeof x.editing.start==='string'&&(x.editing.end===undefined||typeof x.editing.end==='string')));});
  const {dialog,editing}=view;
  const viewRef=useRef(view);viewRef.current=view;
  const setDialog=(dialog?:'editor'|'history'|'settings')=>setView({...view,dialog});
  const close=()=>{if(!mounted.current)return;clearPeriodDraft('editor-'+(editing?.id??'new'));clearPeriodDraft('settings');setView({});};
  useEffect(()=>{ const refresh=()=>setToday(localToday()); const timer=setInterval(refresh,30_000); window.addEventListener('focus',refresh); return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);}; },[]);
  function select(date:string) {setSelected(date);setMonth(date.slice(0,7));}
  function add() {setView({dialog:'editor'});}
  return <section className="period-page" aria-label="生理期页面">
    <header className="period-header"><div className="period-header-copy"><span>COZY DAYS · 小饱日常</span><h1>生理期 <em>♡</em></h1><p>好好照顾自己，<br/>每个阶段的你都很可爱。</p></div><PeriodArt slot="header"/><span className="period-header-sticker" aria-hidden="true">也要温柔地<br/>对待自己呀 ♡</span></header>
    {error&&<div className="period-error" role="alert">{error}<button onClick={retry}>重试</button></div>}
    {conflict&&<div className="period-error"><button onClick={()=>resolveConflict('database')}>使用记录库版本</button><button onClick={()=>resolveConflict('draft')}>恢复草稿版本</button><p>选择前双方均不覆盖；冲突副本暂留在恢复区。{notice}</p></div>}
    {!ready?<p className="loading-message">正在打开你的手账…</p>:<div className="period-content">
      <PeriodCalendar month={month} selected={selected} today={today} data={data} onMonth={setMonth} onSelect={select}/>
      <CycleSummary data={data} today={today} onHistory={()=>setDialog('history')} onSettings={()=>setDialog('settings')} onAdd={add}/>
      <DailyPeriodRecord date={selected} today={today} value={data.days[selected]} onChange={value=>update(d=>{
        const days={...d.days}; if(!value.flow&&!value.mood&&!value.symptoms.length) delete days[selected]; else days[selected]=value;
        return {...d,days};
      })}/>
      <PeriodReminders values={data.reminders} onChange={reminders=>update(d=>({...d,reminders}))}/>
      <PeriodTips data={data} today={today}/>
      <p className="period-storage" role="status">{saving?'正在保存…':error?(durable?'尚未保存到记录库 · '+notice:'尚未保存 · 仅内存保留，刷新或关闭页面会丢失，请重试'):'♡ 记录仅保存在这台设备 · 清除站点数据会丢失记录'}</p>
    </div>}
    {ready&&dialog==='editor'&&<PeriodEditor entry={editing} selected={selected} data={data} today={today} onClose={close} onSave={async entry=>{const ok=await update(d=>({...d,periods:[...d.periods.filter(p=>p.id!==entry.id),entry]}));if(ok&&viewRef.current===view) close();return ok;}}/>}
    {ready&&dialog==='history'&&<PeriodHistory data={data} onClose={close} onAdd={add} onEdit={entry=>setView({editing:entry,dialog:'editor'})} onRemove={id=>update(d=>({...d,periods:d.periods.filter(p=>p.id!==id)}))}/>}
    {ready&&dialog==='settings'&&<PeriodSettings data={data} today={today} onClose={close} onSave={async settings=>{const ok=await update(d=>({...d,settings}));if(ok&&viewRef.current===view) close();return ok;}}/>}
  </section>;
}

