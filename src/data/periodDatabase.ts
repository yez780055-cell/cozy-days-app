import Dexie, { type Table } from 'dexie';
import { validPeriodData, type PeriodData } from '../features/period/model';
import { database } from './localDatabase';

class PeriodDatabase extends Dexie {
  state!: Table<{ id: string; value: unknown }, string>;

  constructor() {
    super('cozy-days-period');
    this.version(1).stores({ state: 'id' });
  }
}

export let periodDatabase: Dexie & { state: PeriodDatabase['state'] } = new PeriodDatabase();
export function useCloudPeriodDatabase() { periodDatabase = database; }

export async function readPeriod(): Promise<PeriodData | null> {
  const record = await periodDatabase.state.get('local');
  if (!record) return null;
  if (!validPeriodData(record.value)) throw new Error('Invalid period data; original record retained');
  return record.value;
}
