import Dexie, { type Table } from 'dexie';
import { dayNumber, emptyData, type PeriodData } from './model';

export function validPeriodData(value: unknown): value is PeriodData {
  if (!value || typeof value !== 'object') return false;
  const d = value as PeriodData;
  const date = (s: unknown) => typeof s === 'string' && Number.isFinite(dayNumber(s));
  return Array.isArray(d.periods) && d.periods.every(p => p && typeof p.id === 'string' && date(p.start) && (p.end === undefined || (date(p.end) && p.end >= p.start)))
    && new Set(d.periods.map(p => p.id)).size === d.periods.length
    && !!d.days && typeof d.days === 'object' && !Array.isArray(d.days) && Object.entries(d.days).every(([key, e]) => date(key) && e && e.date === key && Array.isArray(e.symptoms) && e.symptoms.every(s => typeof s === 'string') && (e.flow === undefined || typeof e.flow === 'string') && (e.mood === undefined || typeof e.mood === 'string'))
    && Array.isArray(d.reminders) && d.reminders.every(r => r && typeof r.id === 'string' && typeof r.text === 'string' && typeof r.completed === 'boolean')
    && !!d.settings && Number.isInteger(d.settings.cycleLength) && d.settings.cycleLength >= 15 && d.settings.cycleLength <= 90 && Number.isInteger(d.settings.periodLength) && d.settings.periodLength >= 1 && d.settings.periodLength <= Math.min(15, d.settings.cycleLength);
}

// Reuse Dexie in a module-owned database: no todo schema upgrade or data coupling.
class PeriodDatabase extends Dexie {
  state!: Table<{ id: string; value: PeriodData }, string>;
  constructor() { super('cozy-days-period'); this.version(1).stores({ state: 'id' }); }
}
const db = new PeriodDatabase();
export const periodRepository = {
  async load(): Promise<PeriodData> {
    const record = await db.state.get('local');
    if (!record) return emptyData();
    if (!validPeriodData(record.value)) throw new Error('Invalid period data; original record retained');
    return record.value;
  },
  async save(value: PeriodData) { await db.state.put({ id: 'local', value }); },
};
