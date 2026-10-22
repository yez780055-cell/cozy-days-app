export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const todayKey = () => toDateKey(new Date());
export const parseDate = (key: string) => new Date(`${key}T12:00:00`);
export function shiftDate(key: string, amount: number) {
  const date = parseDate(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}
export const formatDate = (key: string) => new Intl.DateTimeFormat('zh-CN', {
  month: 'long', day: 'numeric',
}).format(parseDate(key));
export const weekday = (key: string) => new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(parseDate(key));

