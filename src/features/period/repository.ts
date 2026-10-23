import Dexie, { type Table } from 'dexie';
import { emptyData, type PeriodData } from './model';

// Reuse Dexie in a module-owned database: no todo schema upgrade or data coupling.
class PeriodDatabase extends Dexie {
  state!: Table<{ id: string; value: PeriodData }, string>;
  constructor() { super('cozy-days-period'); this.version(1).stores({ state: 'id' }); }
}
const db = new PeriodDatabase();
export const periodRepository = {
  async load(): Promise<PeriodData> { return (await db.state.get('local'))?.value ?? emptyData(); },
  async save(value: PeriodData) { await db.state.put({ id: 'local', value }); },
};
