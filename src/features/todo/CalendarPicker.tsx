import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { parseDate, toDateKey, todayKey } from './dates';
export function CalendarPicker({ value, onSelect, onClose }: { value: string; onSelect: (date: string) => void; onClose: () => void }) {
  const [month, setMonth] = useState(() => { const date = parseDate(value); date.setDate(1); return date; });
  const offset = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const changeMonth = (amount: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1, 12));
  return <Modal title="选择日期" onClose={onClose} className="calendar-modal">
    <div className="calendar-month"><button className="icon-button" aria-label="上个月" onClick={() => changeMonth(-1)}><ChevronLeft size={20}/></button>
      <strong>{month.getFullYear()} 年 {month.getMonth() + 1} 月</strong><button className="icon-button" aria-label="下个月" onClick={() => changeMonth(1)}><ChevronRight size={20}/></button></div>
    <div className="calendar-grid">{['一','二','三','四','五','六','日'].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}
      {Array.from({ length: offset }, (_, i) => <span key={`blank${i}`}/>)}
      {Array.from({ length: count }, (_, i) => {
        const key = toDateKey(new Date(month.getFullYear(), month.getMonth(), i + 1, 12));
        return <button key={key} className={`calendar-day ${key === value ? 'is-selected' : ''} ${key === todayKey() ? 'is-today' : ''}`}
          aria-label={key} aria-pressed={key === value} onClick={() => onSelect(key)}>{i + 1}</button>;
      })}
    </div><Button variant="soft" onClick={() => onSelect(todayKey())}>回到今天</Button>
  </Modal>;
}

