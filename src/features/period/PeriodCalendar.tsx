import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/Button';
import { dateStatus, monthGrid, shiftMonth, shortDate, type PeriodData } from './model';
export const stateLabels: Record<string,string> = {actual:'经期',predicted:'预测经期',fertile:'预测易孕期',ovulation:'预测排卵日'};
export function PeriodCalendar({ month, selected, today, data, onMonth, onSelect, minDate, maxDate }: {
  minDate?:string; maxDate?:string; month:string; selected:string; today:string; data:PeriodData; onMonth:(value:string)=>void; onSelect:(value:string)=>void;
}) {
  const unavailable = (date:string) => (!!minDate && date < minDate) || (!!maxDate && date > maxDate);
  return <section className="period-calendar" aria-label="生理期日历">
    <header className="period-section-heading">
      <h2>{Number(month.slice(0,4))} 年 {Number(month.slice(5))} 月</h2>
      <div>
        <button type="button" className="icon-button" aria-label="上个月" onClick={()=>onMonth(shiftMonth(month,-1))}><ChevronLeft size={20}/></button>
        <button type="button" className="icon-button" aria-label="下个月" onClick={()=>onMonth(shiftMonth(month,1))}><ChevronRight size={20}/></button>
        <Button variant="ghost" className="period-today" disabled={unavailable(today)} onClick={()=>onSelect(today)}>今天</Button>
      </div>
    </header>
    <div className="period-weekdays" aria-hidden="true">{'日一二三四五六'.split('').map(d=><span key={d}>{d}</span>)}</div>
    <div className="period-grid">{monthGrid(month).map(date=>{
      const status=dateStatus(date,data,today), daily=data.days[date];
      return <button key={date} type="button" className={`period-date ${date.startsWith(month)?'':'outside'} ${status} ${date===today?'today':''} ${date===selected?'chosen':''}`}
        aria-label={`${date}${date===today?' 今天':''}${status?' '+stateLabels[status]:''}${daily?' 有日记':''}`}
        aria-pressed={date===selected} aria-current={date===today?'date':undefined} disabled={unavailable(date)} onClick={()=>onSelect(date)}>
        <span>{Number(date.slice(8))}</span>
      </button>;
    })}</div>
    <div className="period-legend">
      {Object.entries(stateLabels).map(([key,label]) => <span key={key}><i className={key} aria-hidden="true"/>{key === 'actual' ? '已记录' : label}</span>)}
      <span><i className="today" aria-hidden="true"/>今天</span>
    </div>
    {selected && <p className="period-selected">已选 {shortDate(selected)}{stateLabels[dateStatus(selected,data,today)] && ' · ' + stateLabels[dateStatus(selected,data,today)]}</p>}
  </section>;
}
