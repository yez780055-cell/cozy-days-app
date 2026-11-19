import { CalendarDays, SlidersHorizontal, ChevronRight, RefreshCw, Droplet } from 'lucide-react';
import { cycleStats, shortDate, type PeriodData } from './model';
export function CycleSummary({ data, today, onHistory, onSettings, onAdd }: { data:PeriodData; today:string; onHistory:()=>void; onSettings:()=>void; onAdd:()=>void }) {
  const stats=cycleStats(data,today);
  return <section className="period-card period-summary" aria-label="周期信息">
    <header><h2><span>✿</span> 当前周期</h2><button onClick={onSettings} aria-label="周期设置"><SlidersHorizontal size={18}/></button></header>
    {stats.latest ? <><div className="period-cycle-line"><p>第 <strong>{stats.cycleDay}</strong> 天 <span>♡</span></p><div className="period-countdown"><span>{stats.remaining!>0?'距离下次经期':stats.remaining===0?'预测经期':'超过预测日期'}</span><strong>{stats.remaining!>0?`${stats.remaining} 天`:stats.remaining===0?'可能今天开始':`${-stats.remaining!} 天`}</strong></div></div>
      <div className="period-progress" aria-hidden="true"><i style={{width:`${Math.min(100,stats.cycleDay!/stats.cycleLength*100)}%`}}/></div>
      <button className="period-history-link" onClick={onHistory}><CalendarDays size={18}/><span>本次经期<b>{shortDate(stats.latest.start)}<br/>{stats.latest.end?shortDate(stats.latest.end):'进行中'}</b></span><span aria-hidden="true">›</span></button>
      <div className="period-averages"><button aria-label={`${stats.cycleSamples?'平均周期长度':'设定周期长度'}：${stats.cycleLength} 天，打开周期设置`} title={stats.cycleSamples?'根据已记录经期计算的平均周期':'尚无足够记录，当前为设置的默认周期'} onClick={onSettings}><RefreshCw size={16}/><span>周期长度<b>{stats.cycleLength} <small>天</small></b></span><ChevronRight size={15}/></button><button aria-label={`${stats.periodSamples?'平均经期时长':'设定经期时长'}：${stats.periodLength} 天，打开周期设置`} title={stats.periodSamples?'根据已记录经期计算的平均时长':'尚无足够记录，当前为设置的默认经期时长'} onClick={onSettings}><Droplet size={16}/><span>经期时长<b>{stats.periodLength} <small>天</small></b></span><ChevronRight size={15}/></button></div>
      </> : <div className="period-empty"><span>♡</span><h3>从第一次记录，慢慢了解自己</h3><p>还没有经期记录。记下开始日期后，<br/>这里会陪你梳理自己的节奏。</p><button className="period-primary" onClick={onAdd}>记录第一次经期</button></div>}
  </section>;
}
