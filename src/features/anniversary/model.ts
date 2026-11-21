import { Lunar, LunarYear, Solar } from 'lunar-typescript';
export const themes = ['生活', '恋爱', '生日', '宠物', '成长'] as const;
export const colors = ['pink', 'yellow', 'lavender', 'mint'] as const;
export const icons = ['♡', '🎂', '🐱', '🎓', '🌷', '⭐'] as const;
export const timingModes = ['countdown', 'cumulative'] as const;
export interface Anniversary {
  id?: number;
  name: string;
  date: string;
  theme: typeof themes[number];
  note: string;
  icon: string;
  yearly: boolean;
  calendar?: 'solar' | 'lunar';
  lunarDate?: { year: number; month: number; day: number }; // Negative month denotes a leap month.
  specialDays?: number[]; // undefined uses defaults; [] disables milestones.
  timingMode?: typeof timingModes[number];
  color: typeof colors[number];
  createdAt: number;
  updatedAt: number;
  backgroundImage?: string;
  backgroundX?: number;
  backgroundY?: number;
}
export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
export function validDate(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= '1000-01-01' && key <= '9999-12-31' && dateKey(localDate(key)) === key;
}
// UTC is used only as a numeric civil-day ordinal, never to parse stored dates.
function ordinal(key: string): number {
  const date = localDate(key);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}
export function inYear(event: Anniversary, year: number): string | null {
  const original = localDate(event.date);
  if (event.calendar === 'lunar' && event.lunarDate && event.yearly) {
    const lunar = event.lunarDate;
    if (year < lunar.year) return null;
    const months = LunarYear.fromYear(year);
    // A leap-month anniversary falls back to the regular month in non-leap years.
    const month = months.getMonth(lunar.month) ?? months.getMonth(Math.abs(lunar.month))!;
    return Lunar.fromYmd(year, month.getMonth(), Math.min(lunar.day, month.getDayCount())).getSolar().toYmd();
  }
  if (!event.yearly) return original.getFullYear() === year ? event.date : null;
  if (year < original.getFullYear()) return null;
  const lastDay = new Date(year, original.getMonth() + 1, 0, 12).getDate();
  return dateKey(new Date(year, original.getMonth(), Math.min(original.getDate(), lastDay), 12));
}
export function resolvedTimingMode(event: Pick<Anniversary, 'theme' | 'timingMode'>) {
  return event.timingMode ?? (event.theme === '恋爱' ? 'cumulative' : 'countdown');
}

export function occurrenceTiming(event: Anniversary, today = dateKey()) {
  let occurrence = event.date;
  if (event.yearly) {
    const currentYear = event.calendar === 'lunar' ? solarToLunar(today).year : localDate(today).getFullYear();
    const startYear = event.calendar === 'lunar' && event.lunarDate ? event.lunarDate.year : localDate(event.date).getFullYear();
    const year = Math.max(currentYear, startYear);
    occurrence = inYear(event, year)!;
    if (occurrence < today) occurrence = inYear(event, year + 1)!;
  }
  const days = ordinal(occurrence) - ordinal(today);
  const year = event.calendar === 'lunar' ? solarToLunar(today).year : localDate(today).getFullYear();
  const thisYear = inYear(event, year);
  const years = Math.max(0, year - (event.calendar === 'lunar' && event.lunarDate ? event.lunarDate.year : localDate(event.date).getFullYear()) - (thisYear && thisYear > today ? 1 : 0));
  return { occurrence, days, years };
}

export function nextImportantDate(events: Anniversary[], today: string) {
  const next = events.flatMap(row => {
    const annual = { row, ...occurrenceTiming(row, today), milestone: undefined as number | undefined };
    const special = resolvedTimingMode(row) === 'cumulative'
      ? (row.specialDays ?? defaultSpecialDays).map(milestone => {
        const occurrence = addDays(row.date, milestone - 1);
        return { row, occurrence, days: ordinal(occurrence) - ordinal(today), years: 0, milestone };
      }) : [];
    return [annual, ...special];
  })
    .filter(event => event.days >= 0)
    .sort((a, b) => a.days - b.days || a.row.createdAt - b.row.createdAt || (a.row.id ?? 0) - (b.row.id ?? 0))[0];
  if (!next) return undefined;

  const { row, occurrence } = next;
  if (next.milestone) return { ...next, title: row.name };
  const anniversary = row.calendar === 'lunar' && row.lunarDate ? solarToLunar(occurrence).year - row.lunarDate.year : localDate(occurrence).getFullYear() - localDate(row.date).getFullYear();
  const showAnniversary = row.yearly && anniversary > 0 && row.theme !== '生日'
    && (row.theme === '恋爱' || resolvedTimingMode(row) === 'cumulative');
  const ordinalLabel = ['','一','两','三','四','五','六','七','八','九','十'][anniversary] ?? anniversary;
  return { ...next, title: showAnniversary ? `${row.name}${ordinalLabel}周年` : row.name };
}

export const defaultSpecialDays = [520, 600, 700, 777, 800, 900, 999, 1000, 1001, 1314];
export function addDays(key: string, days: number): string {
  const date = localDate(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
export function solarToLunar(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  const lunar = Solar.fromYmd(year, month, day).getLunar();
  return { year: lunar.getYear(), month: lunar.getMonth(), day: lunar.getDay() };
}
export function lunarLabel(row: Pick<Anniversary, 'calendar' | 'lunarDate'>): string {
  if (row.calendar !== 'lunar' || !row.lunarDate) return '';
  const { year, month, day } = row.lunarDate;
  const lunar = Lunar.fromYmd(year, month, day);
  return `农历 · ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
}
export function validCalendarFields(row: { date?: unknown; calendar?: unknown; lunarDate?: unknown; specialDays?: unknown }): boolean {
  if (row.specialDays !== undefined && (!Array.isArray(row.specialDays) || row.specialDays.length > 100 ||
    !row.specialDays.every(day => Number.isSafeInteger(day) && day > 0 && day <= 1000000))) return false;
  if (row.calendar !== undefined && row.calendar !== 'solar' && row.calendar !== 'lunar') return false;
  if (row.lunarDate !== undefined) {
    const lunar = row.lunarDate as Anniversary['lunarDate'];
    if (!lunar || ![lunar.year, lunar.month, lunar.day].every(Number.isInteger)) return false;
    if (lunar.year < 1000 || lunar.year > 9998 || Math.abs(lunar.month) < 1 || Math.abs(lunar.month) > 12 || lunar.day < 1 || lunar.day > 30) return false;
    try {
      if (Lunar.fromYmd(lunar.year, lunar.month, lunar.day).getSolar().toYmd() !== row.date) return false;
    } catch { return false; }
  }
  return row.calendar !== 'lunar' || row.lunarDate !== undefined;
}

export function timing(event: Anniversary, today = dateKey()) {
  const next = occurrenceTiming(event, today);
  if (resolvedTimingMode(event) === 'cumulative') {
    const untilStart = ordinal(event.date) - ordinal(today);
    if (untilStart <= 0) {
      const days = 1 - untilStart;
      return { ...next, occurrence: event.date, days, kind: 'cumulative', label: `累计 ${days} 天` } as const;
    }
    return { ...next, days: untilStart, kind: 'upcoming', label: `还有 ${untilStart} 天` } as const;
  }
  if (next.days === 0) return { ...next, kind: 'today', label: '今天' } as const;
  if (next.days < 0) return { ...next, kind: 'past', label: `已过去 ${-next.days} 天` } as const;
  return { ...next, kind: 'upcoming', label: `还有 ${next.days} 天` } as const;
}
