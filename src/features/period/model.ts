export interface PeriodEntry { id: string; start: string; end?: string }
export interface DailyEntry { date: string; flow?: string; symptoms: string[]; mood?: string }
export interface PeriodReminder { id: string; text: string; completed: boolean }
export interface CycleSettings { cycleLength: number; periodLength: number }
export interface PeriodData { periods: PeriodEntry[]; days: Record<string, DailyEntry>; reminders: PeriodReminder[]; settings: CycleSettings }
export const emptyData = (): PeriodData => ({ periods: [], days: {}, reminders: [], settings: { cycleLength: 28, periodLength: 5 } });
const DAY = 86400000;
// Date-only values are integer UTC days. Only today's key uses the device's local calendar.
export function dayNumber(key: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return NaN;
  const [, y, m, d] = match.map(Number);
  const value = Date.UTC(y, m - 1, d);
  return new Date(value).toISOString().slice(0, 10) === key ? value / DAY : NaN;
}
export const dateKey = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (key: string, count: number) => dateKey(dayNumber(key) + count);
export const daysBetween = (a: string, b: string) => dayNumber(b) - dayNumber(a);
export function localToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export const shortDate = (key: string) => `${Number(key.slice(5,7))}月${Number(key.slice(8))}日`;
export function shiftMonth(month: string, by: number) {
  const d = new Date(dayNumber(`${month}-01`) * DAY); d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0,7);
}
export function monthGrid(month: string) {
  const first = dayNumber(`${month}-01`), offset = new Date(first * DAY).getUTCDay();
  const count = daysBetween(`${month}-01`, `${shiftMonth(month,1)}-01`);
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => dateKey(first - offset + i));
}
export const sortedPeriods = (entries: PeriodEntry[]) => [...entries].sort((a,b) => a.start.localeCompare(b.start));
export function validatePeriod(entry: PeriodEntry, entries: PeriodEntry[], today: string): string | undefined {
  if (!Number.isFinite(dayNumber(entry.start)) || (entry.end && !Number.isFinite(dayNumber(entry.end)))) return '请填写有效日期。';
  if (entry.start > today || (entry.end && entry.end > today)) return '真实经期不能记录未来日期。';
  if (entry.end && entry.end < entry.start) return '结束日期不能早于开始日期。';
  if (entries.some(p => p.id !== entry.id && entry.start <= (p.end || today) && (entry.end || today) >= p.start)) return '这段日期与已有经期重叠，请修改原记录。';
}
const average = (values: number[], fallback: number) => values.length ? Math.round(values.reduce((a,b) => a+b,0)/values.length) : fallback;
export function cycleStats(data: PeriodData, today: string) {
  const entries = sortedPeriods(data.periods).filter(p => p.start <= today);
  const latest = entries[entries.length-1];
  const intervals = entries.slice(1).map((p,i) => daysBetween(entries[i].start,p.start)).slice(-6);
  const durations = entries.filter(p => p.end).slice(-6).map(p => daysBetween(p.start,p.end!)+1);
  const cycleLength = average(intervals, data.settings.cycleLength);
  const periodLength = average(durations, data.settings.periodLength);
  const next = latest ? addDays(latest.start,cycleLength) : undefined;
  return { latest, cycleLength, periodLength, cycleSamples: intervals.length, periodSamples: durations.length,
    cycleDay: latest ? daysBetween(latest.start,today)+1 : undefined,
    next, remaining: next ? daysBetween(today,next) : undefined, ovulation: next ? addDays(next,-14) : undefined };
}
export function dateStatus(date: string, data: PeriodData, today: string) {
  if (data.periods.some(p => date >= p.start && date <= (p.end || today))) return 'actual';
  const stats = cycleStats(data,today);
  if (!stats.next || date < today) return '';
  if (date >= stats.next && date < addDays(stats.next,stats.periodLength)) return 'predicted';
  if (date === stats.ovulation) return 'ovulation';
  if (stats.ovulation && date >= addDays(stats.ovulation,-5) && date <= addDays(stats.ovulation,1)) return 'fertile';
  return '';
}
