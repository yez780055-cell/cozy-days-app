import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Asset } from '../../components/Asset';
import { dateStatus, monthGrid, shiftMonth, shortDate, type PeriodData } from './model';
export const stateLabels: Record<string,string> = {actual:'经期',predicted:'预测经期',fertile:'预测易孕期',ovulation:'预测排卵日'};
export function PeriodCalendar({ month, selected, today, data, onMonth, onSelect }: {
  month:string; selected:string; today:string; data:PeriodData; onMonth:(value:string)=>void; onSelect:(value:string)=>void;
}) {
  return <section className="period-card period-calendar" aria-label="生理期日历">
    <Asset name="flower" className="period-calendar-flower"/>
    <header><h2>{Number(month.slice(0,4))}年{Number(month.slice(5))}月</h2><div><button aria-label="上个月" onClick={()=>onMonth(shiftMonth(month,-1))}><ChevronLeft size={19}/></button><button aria-label="下个月" onClick={()=>onMonth(shiftMonth(month,1))}><ChevronRight size={19}/></button><button className="period-today" onClick={()=>onSelect(today)}>今天</button></div></header>
    <div className="period-weekdays" aria-hidden="true">{'日一二三四五六'.split('').map(d=><span key={d}>{d}</span>)}</div>
    <div className="period-grid">{monthGrid(month).map(date=>{
      const status=dateStatus(date,data,today), daily=data.days[date];
      return <button key={date} type="button" className={`period-date ${date.startsWith(month)?'':'outside'} ${status} ${date===today?'today':''} ${date===selected?'chosen':''}`} aria-label={`${date}${date===today?' 今天':''}${status?' '+stateLabels[status]:''}${daily?' 有日记':''}`} aria-pressed={date===selected} onClick={()=>onSelect(date)}><span>{Number(date.slice(8))}</span>{daily && <i aria-hidden="true">♥</i>}</button>;
    })}</div>
    <div className="period-legend">{Object.entries(stateLabels).map(([key,label])=><span key={key}><i className={key}/>{label}</span>)}<span><i className="today"/>今天</span></div>
    <p className="period-selected">已选 {shortDate(selected)} · {stateLabels[dateStatus(selected,data,today)] || '照顾好今天的自己'}</p>
  </section>;
}
