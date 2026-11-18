import { colors, themes, validDate } from '../features/anniversary/model';
import { sortedPeriods, validPeriodData, type PeriodData } from '../features/period/model';
import { isDateKey } from '../features/todo/dates';
import { resolveDecoration } from '../features/todo/decorations';
import { canonicalTime, categoryKey } from './categories';
import { localId } from './localId';
import type { PrimaryRecords } from './storageAccess';

const format = 'cozy-days-backup';
const databaseVersions = { littleDays: 4, period: 1 } as const;
export const maxBackupBytes = 20 * 1024 * 1024;
export type BackupRecords = PrimaryRecords & { period: PeriodData | null };
export type Backup = {
  format: typeof format;
  version: 1;
  appVersion: string;
  exportedAt: string;
  databases: typeof databaseVersions;
  records: BackupRecords;
};
export type RestoreMode = 'merge' | 'replace';

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const timestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
// Leave room for future IndexedDB auto-incremented keys after importing external IDs.
const rowId = (value: unknown): value is number => timestamp(value) && value > 0 && value <= 0xffffffff;
const optional = (value: unknown, valid: (value: unknown) => boolean) => value === undefined || valid(value);

function validJSON(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => validJSON(item, depth + 1));
  return !object(value) || Object.values(value).every(item => validJSON(item, depth + 1));
}

function unique<T>(rows: T[], key: (row: T) => unknown): boolean {
  return new Set(rows.map(key)).size === rows.length;
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => object(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item);
}

function validRecords(value: unknown): value is BackupRecords {
  if (!object(value) || !Array.isArray(value.categories) || !Array.isArray(value.todos) ||
      !Array.isArray(value.anniversaries) || (value.period !== null && !validPeriodData(value.period))) return false;

  const { categories, todos, anniversaries } = value;
  if (!categories.every(row => object(row) && text(row.id) && !!row.id && row.id !== 'all' && text(row.name) &&
      !!row.name.trim() && row.key !== '全部' && row.key === categoryKey(row.name) &&
      typeof row.builtin === 'boolean' && timestamp(row.createdAt)) ||
      !unique(categories, row => row.id) || !unique(categories, row => row.key)) return false;

  const categoryIds = new Set(categories.map(row => row.id));
  if (!todos.every(row => object(row) && rowId(row.id) && text(row.text) && text(row.date) &&
      isDateKey(row.date) && typeof row.completed === 'boolean' && timestamp(row.createdAt) &&
      optional(row.favorite, value => typeof value === 'boolean') &&
      optional(row.categoryId, id => categoryIds.has(id)) &&
      optional(row.time, value => text(value) && (value === '' || !!canonicalTime(value))) &&
      optional(row.decoration, value => {
        if (!object(value)) return false;
        const resolved = resolveDecoration(row.text as string, value);
        return Object.entries(resolved).every(([key, field]) => value[key] === field);
      })) || !unique(todos, row => row.id)) return false;

  if (!anniversaries.every(row => object(row) && rowId(row.id) && text(row.name) && !!row.name.trim() &&
      row.name.length <= 60 && text(row.date) && validDate(row.date) && themes.some(theme => theme === row.theme) &&
      colors.some(color => color === row.color) && text(row.note) && row.note.length <= 500 &&
      text(row.icon) && row.icon.length <= 16 && typeof row.yearly === 'boolean' &&
      timestamp(row.createdAt) && timestamp(row.updatedAt)) || !unique(anniversaries, row => row.id)) return false;

  if (value.period) {
    const intervals = sortedPeriods(value.period.periods);
    return intervals.slice(1).every((entry, index) => {
      const previous = intervals[index];
      return previous.end !== undefined && previous.end < entry.start;
    });
  }
  return true;
}

export function makeBackup(records: BackupRecords, appVersion: string): Backup {
  return { format, version: 1, appVersion, exportedAt: new Date().toISOString(), databases: databaseVersions, records };
}

export function encodeBackup(backup: Backup): string {
  const json = JSON.stringify(backup);
  if (new TextEncoder().encode(json).length > maxBackupBytes) throw new Error('当前记录超过 20 MB，无法生成可恢复的备份。');
  decodeBackup(json);
  return json;
}

export function decodeBackup(json: string): Backup {
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new Error('文件不是有效的 JSON，或文件已损坏。'); }
  if (!object(value) || value.format !== format) throw new Error('请选择小饱日常的完整 JSON 备份。');
  if (value.version !== 1 || !object(value.databases) ||
      value.databases.littleDays !== databaseVersions.littleDays || value.databases.period !== databaseVersions.period) {
    throw new Error('此备份版本与当前应用不兼容。');
  }
  if (!text(value.appVersion) || !/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(value.appVersion) ||
      !text(value.exportedAt) || !Number.isFinite(Date.parse(value.exportedAt)) ||
      !validJSON(value.records) || !validRecords(value.records)) throw new Error('备份中的记录结构无效，未读取任何数据。');
  return value as Backup;
}

function rowContent<T extends { id: string | number }>({ id: _id, ...row }: T): string {
  return canonical(row);
}

function mergeRows<T extends { id: number }>(local: T[], incoming: T[]): T[] {
  const rows = [...local];
  const ids = new Set(local.map(row => row.id));
  const reserved = new Set(incoming.map(row => row.id));
  const fingerprints = new Set(local.map(rowContent));
  let nextId = 1;
  for (const row of incoming) {
    const content = rowContent(row);
    if (fingerprints.has(content)) continue;
    let id = row.id;
    if (ids.has(id)) {
      while (ids.has(nextId) || reserved.has(nextId)) nextId++;
      id = nextId++;
    }
    rows.push({ ...row, id });
    ids.add(id);
    fingerprints.add(content);
  }
  return rows;
}

function mergePeriod(local: PeriodData | null, incoming: PeriodData | null) {
  if (!local || !incoming) return { period: local ?? incoming, periodConflicts: 0 };
  const periods = [...local.periods];
  const days = { ...local.days };
  const ids = new Set(periods.map(row => row.id));
  const fingerprints = new Set(periods.map(rowContent));
  let periodConflicts = Number(canonical(local.settings) !== canonical(incoming.settings));

  for (const row of incoming.periods) {
    const content = rowContent(row);
    if (fingerprints.has(content)) continue;
    if (periods.some(other => (!other.end || row.start <= other.end) && (!row.end || row.end >= other.start))) {
      periodConflicts++;
      continue;
    }
    let id = row.id;
    while (ids.has(id)) id = localId();
    periods.push({ ...row, id });
    ids.add(id);
    fingerprints.add(content);
  }
  for (const [date, row] of Object.entries(incoming.days)) {
    if (!days[date]) days[date] = row;
    else if (canonical(days[date]) !== canonical(row)) periodConflicts++;
  }
  return { period: { ...incoming, ...local, periods, days }, periodConflicts };
}

export function mergeBackup(local: BackupRecords, incoming: BackupRecords) {
  const categories = [...local.categories];
  const ids = new Set(categories.map(row => row.id));
  const byKey = new Map(categories.map(row => [row.key, row.id]));
  const remapped = new Map<string, string>();
  const reserved = new Set(incoming.categories.map(row => row.id));
  for (const row of incoming.categories) {
    let id = byKey.get(row.key);
    if (id === undefined) {
      id = row.id;
      while (ids.has(id) || (id !== row.id && reserved.has(id))) id = localId();
      categories.push({ ...row, id });
      ids.add(id);
      byKey.set(row.key, id);
    }
    remapped.set(row.id, id);
  }
  const todos = incoming.todos.map(row => row.categoryId ? { ...row, categoryId: remapped.get(row.categoryId)! } : row);
  const { period, periodConflicts } = mergePeriod(local.period, incoming.period);
  return {
    records: { categories, todos: mergeRows(local.todos, todos), anniversaries: mergeRows(local.anniversaries, incoming.anniversaries), period },
    periodConflicts,
  };
}
