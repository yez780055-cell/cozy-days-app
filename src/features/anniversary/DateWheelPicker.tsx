import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Lunar, LunarYear } from 'lunar-typescript';
import { dateKey, localDate, solarToLunar, type Anniversary } from './model';

type Option = { value: number; label: string };
function Wheel({ label, options, value, onChange, onMoving }: { label: string; options: Option[]; value: number; onChange: (value: number) => void; onMoving: (moving: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const index = Math.max(0, options.findIndex(option => option.value === value));
  const [scrollIndex, setScrollIndex] = useState(index);
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    clearTimeout(timer.current);
    onMoving(false);
    if (ref.current) ref.current.scrollTop = index * 40;
    setScrollIndex(index);
  }, [index, options]);
  const start = Math.max(0, scrollIndex - 4);
  return <div className="ann-wheel" role="listbox" aria-label={label} tabIndex={0} ref={ref}
    aria-activedescendant={`ann-${label}-${value}`} onKeyDown={event => {
      const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : undefined;
      if (next !== undefined) { event.preventDefault(); onChange(options[Math.max(0, Math.min(options.length - 1, next))].value); }
    }} onScroll={event => {
      const nextIndex = Math.max(0, Math.min(options.length - 1, Math.round(event.currentTarget.scrollTop / 40)));
      setScrollIndex(nextIndex);
      onMoving(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (ref.current) ref.current.scrollTop = nextIndex * 40; if (options[nextIndex].value !== value) onChange(options[nextIndex].value); onMoving(false); }, 120);
    }}>
    <div style={{ height: options.length * 40 + 160, position: 'relative' }}>
    {options.slice(start, scrollIndex + 5).map((option, offset) => <div key={option.value} id={`ann-${label}-${option.value}`} role="option" aria-selected={value === option.value}
      style={{ position: 'absolute', top: 80 + (start + offset) * 40, width: '100%' }} onClick={() => onChange(option.value)}>{option.label}</div>)}
    </div>
  </div>;
}
export function DateWheelPicker({ value, onConfirm, onCancel, onDirty }: { value: Anniversary; onDirty: (dirty: boolean) => void; onConfirm: (patch: Partial<Anniversary>) => void; onCancel: () => void }) {
  const [moving, setMoving] = useState<Record<string, boolean>>({});
  const [pickerError, setPickerError] = useState('');
  const [calendar, setCalendar] = useState(value.calendar ?? 'solar');
  const initial = value.calendar === 'lunar' ? value.lunarDate ?? solarToLunar(value.date) : { year: localDate(value.date).getFullYear(), month: localDate(value.date).getMonth() + 1, day: localDate(value.date).getDate() };
  const [parts, setParts] = useState(initial);
  const years = useMemo(() => Array.from({ length: calendar === 'lunar' ? 8999 : 9000 }, (_, i) => ({ value: i + 1000, label: `${i + 1000} 年` })), [calendar]);
  const months = useMemo(() => calendar === 'solar' ? Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1} 月` }))
    : LunarYear.fromYear(parts.year).getMonthsInYear().map(month => ({ value: month.getMonth(), label: `${Lunar.fromYmd(parts.year, month.getMonth(), 1).getMonthInChinese()}月` })), [calendar, parts.year]);
  const month = months.some(m => m.value === parts.month) ? parts.month : Math.abs(parts.month);
  const dayCount = calendar === 'solar' ? new Date(parts.year, month, 0).getDate() : LunarYear.fromYear(parts.year).getMonth(month)!.getDayCount();
  const day = Math.min(parts.day, dayCount);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => ({ value: i + 1, label: calendar === 'solar' ? `${i + 1} 日` : Lunar.fromYmd(parts.year, month, i + 1).getDayInChinese() })), [calendar, parts.year, month, dayCount]);
  const solarDate = () => calendar === 'solar' ? dateKey(new Date(parts.year, month - 1, day, 12)) : Lunar.fromYmd(parts.year, month, day).getSolar().toYmd();
  useEffect(() => { onDirty(calendar !== (value.calendar ?? 'solar') || solarDate() !== value.date); return () => onDirty(false); }, [calendar, parts.year, month, day, value.date, value.calendar, onDirty]);
  function changeCalendar(next: 'solar' | 'lunar') {
    if (next === calendar) return;
    try {
      const key = solarDate();
      const converted = next === 'lunar' ? solarToLunar(key) : { year: localDate(key).getFullYear(), month: localDate(key).getMonth() + 1, day: localDate(key).getDate() };
      if (next === 'lunar' && (converted.year < 1000 || converted.year > 9998)) { setPickerError('这个日期超出农历选择范围，请使用公历'); return; }
      setParts(converted); setPickerError(''); setCalendar(next);
    } catch { setPickerError('这个历史日期无法转换为农历，请使用公历'); }
  }
  return <section className="ann-date-picker" aria-label="选择日期">
    <header><button type="button" className="ann-picker-cancel" onClick={onCancel}>取消</button><strong>选择日期</strong><button type="button" className="ann-picker-confirm" disabled={Object.values(moving).some(Boolean)} onClick={() => onConfirm({ date: solarDate(), calendar, lunarDate: calendar === 'lunar' ? { year: parts.year, month, day } : undefined })}>确定</button></header>
    <div className="ann-segment" role="group" aria-label="历法">{(['solar', 'lunar'] as const).map(item => <button type="button" key={item} aria-pressed={calendar === item} onClick={() => changeCalendar(item)}>{item === 'solar' ? '公历' : '农历'}</button>)}</div>
    <div className="ann-wheels">
      <Wheel label="年" value={parts.year} options={years} onMoving={active => setMoving(current => ({ ...current, year: active }))} onChange={year => setParts(current => ({ ...current, year }))}/>
      <Wheel label="月" value={month} options={months} onMoving={active => setMoving(current => ({ ...current, month: active }))} onChange={month => setParts(current => ({ ...current, month }))}/>
      <Wheel label="日" value={day} options={days} onMoving={active => setMoving(current => ({ ...current, day: active }))} onChange={day => setParts(current => ({ ...current, day }))}/>
    </div>
    {pickerError && <p role="alert" className="error-message">{pickerError}</p>}
    <p className="ann-picker-hint">{calendar === 'lunar' ? '闰月逢普通年份按同月，小月按最后一天' : '滚动或使用方向键选择日期'}</p>
  </section>;
}
