import { formatDate, isDateKey, parseDate, shiftDate } from './dates';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

export function TodoWeek({ date, today, followsDate, onSelect }: {
  date: string; today: string; followsDate: boolean; onSelect: (date: string) => void;
}) {
  const offset = (parseDate(date).getDay() + 6) % 7;
  return <div className="todo-week" role="group" aria-label="本周日期">
    {weekdays.map((label, index) => {
      const day = shiftDate(date, index - offset);
      const valid = isDateKey(day);
      return <button type="button" key={label} disabled={!valid}
        aria-label={valid ? `${formatDate(day)} 周${label}` : undefined}
        aria-pressed={followsDate && day === date} aria-current={day === today ? 'date' : undefined}
        onClick={() => onSelect(day)}>
        <small>周{label}</small><b>{Number(day.slice(-2))}</b>
      </button>;
    })}
  </div>;
}
