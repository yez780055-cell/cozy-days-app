export const themes = ['生活', '恋爱', '生日', '宠物', '成长'] as const;
export const colors = ['pink', 'yellow', 'lavender', 'mint'] as const;
export const icons = ['♡', '🎂', '🐱', '🎓', '🌷', '⭐'] as const;
export interface Anniversary {
  id?: number;
  name: string;
  date: string;
  theme: typeof themes[number];
  note: string;
  icon: string;
  yearly: boolean;
  color: typeof colors[number];
  createdAt: number;
  updatedAt: number;
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
export function timing(event: Anniversary, today = dateKey()) {
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
  return { occurrence, days, years, label: days === 0 ? '就是今天 ♡' : days > 0 ? `还有 ${days} 天` : `已过去 ${-days} 天` };
}
