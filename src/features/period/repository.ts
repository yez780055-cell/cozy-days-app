import Dexie, { type Table } from 'dexie';
import { dayNumber, emptyData, type PeriodData } from './model';

export function validPeriodData(value: unknown): value is PeriodData {
  if (!value || typeof value !== 'object') return false;
  const d = value as PeriodData;
  const date = (s: unknown) => typeof s === 'string' && Number.isFinite(dayNumber(s));
  return Array.isArray(d.periods) && Array.from(d.periods).every(p => p && typeof p.id === 'string' && !!p.id && date(p.start) && (p.end === undefined || (date(p.end) && p.end >= p.start)))
    && new Set(d.periods.map(p => p.id)).size === d.periods.length
    && !!d.days && typeof d.days === 'object' && !Array.isArray(d.days) && Object.entries(d.days).every(([key, e]) => date(key) && e && e.date === key && Array.isArray(e.symptoms) && Array.from(e.symptoms).every(s => typeof s === 'string') && (e.flow === undefined || typeof e.flow === 'string') && (e.mood === undefined || typeof e.mood === 'string'))
    && !!d.settings && Number.isInteger(d.settings.cycleLength) && d.settings.cycleLength >= 15 && d.settings.cycleLength <= 90 && Number.isInteger(d.settings.periodLength) && d.settings.periodLength >= 1 && d.settings.periodLength <= Math.min(15, d.settings.cycleLength);
}

// Reuse Dexie in a module-owned database: no todo schema upgrade or data coupling.
class PeriodDatabase extends Dexie {
  state!: Table<{ id: string; value: PeriodData }, string>;
  constructor() { super('cozy-days-period'); this.version(1).stores({ state: 'id' }); }
}
const db = new PeriodDatabase();
export class PeriodConflictError extends Error {
  constructor(public current:PeriodData) { super('Period database changed'); }
}
export const periodRepository = {
  async load(): Promise<PeriodData> {
    const record = await db.state.get('local');
    if (!record) return emptyData();
    if (!validPeriodData(record.value)) throw new Error('Invalid period data; original record retained');
    // Retired/unknown fields stay opaque and round-trip unchanged through edits
    // and recovery. Keep the original shape/order for optimistic save comparison.
    return record.value;
  },
  async save(value: PeriodData, expected: string) {
    if(!validPeriodData(value)) throw new Error('Invalid period write');
    await db.transaction('rw',db.state,async()=>{
      const current=await periodRepository.load();
      if(JSON.stringify(current)!==expected) throw new PeriodConflictError(current);
      await db.state.put({ id: 'local', value });
    });
  },
};
