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
    const year = Math.max(localDate(today).getFullYear(), localDate(event.date).getFullYear());
    occurrence = inYear(event, year)!;
    if (occurrence < today) occurrence = inYear(event, year + 1)!;
  }
  const days = ordinal(occurrence) - ordinal(today);
  const year = localDate(today).getFullYear();
  const thisYear = inYear(event, year);
  const years = Math.max(0, year - localDate(event.date).getFullYear() - (thisYear && thisYear > today ? 1 : 0));
  return { occurrence, days, years };
}

export function nextImportantDate(events: Anniversary[], today: string) {
  const next = events.map(row => ({ row, ...occurrenceTiming(row, today) }))
    .filter(event => event.days >= 0)
    .sort((a, b) => a.days - b.days || a.row.createdAt - b.row.createdAt || (a.row.id ?? 0) - (b.row.id ?? 0))[0];
  if (!next) return undefined;

  const { row, occurrence } = next;
  const anniversary = localDate(occurrence).getFullYear() - localDate(row.date).getFullYear();
  const showAnniversary = row.yearly && anniversary > 0 && row.theme !== '生日'
    && (row.theme === '恋爱' || resolvedTimingMode(row) === 'cumulative');
  const ordinalLabel = ['','一','两','三','四','五','六','七','八','九','十'][anniversary] ?? anniversary;
  return { ...next, title: showAnniversary ? `${row.name}${ordinalLabel}周年` : row.name };
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
