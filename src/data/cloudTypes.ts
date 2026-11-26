export const cloudKinds = ['todo', 'category', 'anniversary', 'periods', 'day', 'cycle'] as const;
export type CloudKind = typeof cloudKinds[number];
export type CloudScope = { userId: string; spaceId: string; members: number };
export type CloudValue = object | null;
export type CloudRecord = { kind: CloudKind; id: string; version: number; value: CloudValue };
export type SyncAttempt = { operation: string; version: number; value: CloudValue };
export type SyncRecord = CloudRecord & {
  key: string;
  desired: CloudValue;
  dirty: 0 | 1;
  attempt?: SyncAttempt;
  seen?: CloudRecord;
  blocked?: boolean;
};
export type SyncConflict = {
  operation: string;
  kind: CloudKind;
  recordId: string;
  attempted: CloudValue;
  latest: CloudValue;
  reason: string;
  at: number;
  remoteVersion?: number;
  rawRecord?: Partial<CloudRecord>;
  inFlight?: SyncAttempt;
};
export type PushResponse = Pick<CloudRecord, 'version' | 'value'> & (
  { status: 'applied' } | { status: 'conflict'; reason: string }
);

export const cloudChanged = 'cozy-days:cloud-records';
export const cloudQueued = 'cozy-days:cloud-queued';
export const recordKey = (kind: CloudKind, id: string) => kind + ':' + id;

export function equalValue(left: CloudValue, right: CloudValue) {
  if (left === right) return true;
  if (left === null || right === null) return false;
  const canonical = (value: CloudValue) => JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
      : item);
  return canonical(left) === canonical(right);
}
