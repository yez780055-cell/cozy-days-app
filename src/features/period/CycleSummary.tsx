import { CalendarDays, SlidersHorizontal, Plus } from 'lucide-react';
import { cycleStats, shortDate, type PeriodData } from './model';
export function CycleSummary({ data, today, onHistory, onSettings, onAdd }: { data:PeriodData; today:string; onHistory:()=>void; onSettings:()=>void; onAdd:()=>void }) {
  const stats=cycleStats(data,today);
  return <section className="period-card period-summary" aria-label="周期信息">
    <header><h2><span>✿</span> 当前周期</h2><button onClick={onSettings} aria-label="周期设置"><SlidersHorizontal size={18}/></button></header>
    {stats.latest ? <><div className="period-cycle-line"><p>第 <strong>{stats.cycleDay}</strong> 天 <span>♡</span></p><div className="period-countdown">{stats.remaining!>0?<>距离预测下次经期<strong>{stats.remaining} 天</strong></>:stats.remaining===0?<>预测经期<strong>可能今天开始</strong></>:<>已超过预测日期<strong>{-stats.remaining!} 天</strong></>}</div></div>
      <div className="period-progress" aria-hidden="true"><i style={{width:`${Math.min(100,stats.cycleDay!/stats.cycleLength*100)}%`}}/></div>
      <button className="period-history-link" onClick={onHistory}><CalendarDays size={18}/><span>最近一次经期<b>{shortDate(stats.latest.start)}<br/>{stats.latest.end?shortDate(stats.latest.end):'进行中'}</b></span><span>查看 ›</span></button>
      <div className="period-averages"><button onClick={onSettings}><span>{stats.cycleSamples?'平均周期长度':'设定周期长度'}</span><b>{stats.cycleLength} <small>天</small></b></button><button onClick={onSettings}><span>{stats.periodSamples?'平均经期长度':'设定经期长度'}</span><b>{stats.periodLength} <small>天</small></b></button><button onClick={onAdd}><Plus size={18}/>记录经期</button></div>
      <p className="period-fine">预测 {stats.next && shortDate(stats.next)} · 仅供记录参考，不用于避孕或诊断</p></> : <div className="period-empty"><span>♡</span><h3>从第一次记录，慢慢了解自己</h3><p>还没有经期记录。记下开始日期后，<br/>这里会陪你梳理自己的节奏。</p><button className="period-primary" onClick={onAdd}><Plus size={16}/>记录第一次经期</button></div>}
  </section>;
}
