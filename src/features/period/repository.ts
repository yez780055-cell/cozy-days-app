import { periodDatabase, readPeriod } from '../../data/periodDatabase';
import { withDataAccess } from '../../data/storageAccess';
import { emptyData, validPeriodData, type PeriodData } from './model';
export { validPeriodData } from './model';

export class PeriodConflictError extends Error {
  constructor(public current: PeriodData) { super('Period database changed'); }
}

export const periodRepository = {
  load: () => withDataAccess(async () => await readPeriod() ?? emptyData()),
  async save(value: PeriodData, expected: string) {
    if (!validPeriodData(value)) throw new Error('Invalid period write');
    const { state } = periodDatabase;
    await withDataAccess(() => periodDatabase.transaction('rw', state, async () => {
      const current = await readPeriod() ?? emptyData();
      if (JSON.stringify(current) !== expected) throw new PeriodConflictError(current);
      await state.put({ id: 'local', value });
    }));
  },
};
