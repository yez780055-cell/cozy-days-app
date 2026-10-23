import { useEffect, useState } from 'react';
import { PeriodArt } from './PeriodArt';
import { PeriodCalendar } from './PeriodCalendar';
import { CycleSummary } from './CycleSummary';
import { DailyPeriodRecord } from './DailyPeriodRecord';
import { PeriodReminders } from './PeriodReminders';
import { PeriodTips } from './PeriodTips';
import { PeriodEditor, PeriodHistory, PeriodSettings } from './PeriodForms';
import { localToday, type PeriodEntry } from './model';
import { usePeriod } from './usePeriod';
import './period.css';
export default function PeriodPage() {
  const {data,ready,error,saving,update,retry}=usePeriod();
  const [today,setToday]=useState(localToday),[selected,setSelected]=useState(localToday),[month,setMonth]=useState(()=>localToday().slice(0,7));
  const [dialog,setDialog]=useState<'editor'|'history'|'settings'>(),[editing,setEditing]=useState<PeriodEntry>();
  useEffect(()=>{ const refresh=()=>setToday(localToday()); const timer=setInterval(refresh,30_000); window.addEventListener('focus',refresh); return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);}; },[]);
  function select(date:string) {setSelected(date);setMonth(date.slice(0,7));}
  function add() {setEditing(undefined);setDialog('editor');}
  return <section className="period-page" aria-label="生理期页面">
    <header className="period-header"><div className="period-header-copy"><span>COZY DAYS · 小饱日常</span><h1>生理期 <em>♡</em></h1><p>好好照顾自己，<br/>每个阶段的你都很可爱。</p></div><PeriodArt slot="header"/><span className="period-header-sticker" aria-hidden="true">也要温柔地<br/>对待自己呀 ♡</span></header>
    {error&&<div className="period-error" role="alert">{error}<button onClick={retry}>重试</button></div>}
    {!ready?<p className="loading-message">正在打开你的手账…</p>:<div className="period-content">
      <PeriodCalendar month={month} selected={selected} today={today} data={data} onMonth={setMonth} onSelect={select}/>
      <CycleSummary data={data} today={today} onHistory={()=>setDialog('history')} onSettings={()=>setDialog('settings')} onAdd={add}/>
      <DailyPeriodRecord date={selected} today={today} value={data.days[selected]} onChange={value=>update(d=>{
        const days={...d.days}; if(!value.flow&&!value.mood&&!value.symptoms.length) delete days[selected]; else days[selected]=value;
        return {...d,days};
      })}/>
      <PeriodReminders values={data.reminders} onChange={reminders=>update(d=>({...d,reminders}))}/>
      <PeriodTips data={data} today={today}/>
      <p className="period-storage" role="status">{saving?'正在保存…':error?'请重试保存更改':'♡ 记录仅保存在这台设备 · 清除站点数据会丢失记录'}</p>
    </div>}
    {dialog==='editor'&&<PeriodEditor entry={editing} selected={selected} data={data} today={today} onClose={()=>setDialog(undefined)} onSave={entry=>{update(d=>({...d,periods:[...d.periods.filter(p=>p.id!==entry.id),entry]}));setDialog(undefined);}}/>}
    {dialog==='history'&&<PeriodHistory data={data} onClose={()=>setDialog(undefined)} onAdd={add} onEdit={entry=>{setEditing(entry);setDialog('editor');}} onRemove={id=>update(d=>({...d,periods:d.periods.filter(p=>p.id!==id)}))}/>}
    {dialog==='settings'&&<PeriodSettings data={data} today={today} onClose={()=>setDialog(undefined)} onSave={settings=>{update(d=>({...d,settings}));setDialog(undefined);}}/>}
  </section>;
}

