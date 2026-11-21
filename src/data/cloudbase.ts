import { localId } from './localId';
import type { CloudRecord, CloudScope, PushResponse, SyncAttempt } from './cloudTypes';

export const cloudEnabled = import.meta.env.VITE_CLOUDBASE_ENABLED === 'true';
const envId = 'vicarious-cardinal-d6c5m0ec4d9c0';
const gateway = 'https://' + envId + '.api.tcloudbasegateway.com';
const authKey = 'cozy-days:cloud-auth:' + envId;
const deviceKey = authKey + ':device';
const publishableKey = import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY?.trim();

type Session = {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: CloudScope;
};

type TokenResponse = {
  sub: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export class CloudError extends Error {
  constructor(public status: number, public code: string) { super(code); }
  get retryable() { return !this.status || this.status >= 500 || this.status === 429; }
  get authRequired() {
    return this.status === 401 || this.code === 'COZY_AUTH_REQUIRED' || this.code === 'COZY_SPACE_REQUIRED';
  }
}

function getDeviceId() {
  const existing = localStorage.getItem(deviceKey);
  if (existing) return existing;
  const id = localId();
  localStorage.setItem(deviceKey, id);
  return id;
}

async function request<T>(path: string, body: object, token?: string, keepalive = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-device-id': getDeviceId() };
  if (publishableKey) headers.apikey = publishableKey;
  if (token) headers.Authorization = 'Bearer ' + token;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(gateway + path, {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
      cache: 'no-store', credentials: 'omit', keepalive,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error) {
      const message = typeof data?.message === 'string' ? data.message : '';
      const cozyCode = /^COZY_[A-Z_]+$/.test(message) ? message : '';
      throw new CloudError(response.status, cozyCode || String(data?.error ?? data?.code ?? 'CLOUD_REQUEST_FAILED'));
    }
    return data as T;
  } catch (error) {
    if (error instanceof CloudError) throw error;
    throw new CloudError(0, 'NETWORK_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

export function session(): Session | null {
  const raw = localStorage.getItem(authKey);
  if (!raw) return null;
  try {
    const value: Session = JSON.parse(raw);
    return typeof value.userId === 'string' && typeof value.accessToken === 'string'
      && typeof value.refreshToken === 'string' && Number.isFinite(value.expiresAt) ? value : null;
  } catch { return null; }
}
const saveSession = (value: Session) => localStorage.setItem(authKey, JSON.stringify(value));

export function watchSession(read: (next: Session | null) => void) {
  const listener = (event: StorageEvent) => { if (event.key === authKey || event.key === null) read(session()); };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

function fromTokens(value: TokenResponse, email: string): Session {
  if (!value || typeof value.sub !== 'string' || !value.sub.length || value.sub.length > 64
    || typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string'
    || !Number.isFinite(value.expires_in) || value.expires_in <= 0) throw new CloudError(502, 'INVALID_TOKEN_RESPONSE');
  return { userId: value.sub, accessToken: value.access_token, refreshToken: value.refresh_token,
    expiresAt: Date.now() + value.expires_in * 1000, email };
}

export async function sendEmailCode(email: string, register: boolean) {
  const data = await request<{ verification_id: string }>('/auth/v1/verification', { email, target: register ? 'ANY' : 'USER' });
  if (!data?.verification_id) throw new CloudError(502, 'INVALID_VERIFICATION_RESPONSE');
  return data.verification_id;
}

export async function authenticate(email: string, verificationId: string, code: string, register: boolean) {
  const start = session()?.refreshToken;
  const verified = await request<{ verification_token: string }>('/auth/v1/verification/verify', {
    verification_id: verificationId, verification_code: code,
  });
  if (!verified?.verification_token) throw new CloudError(502, 'INVALID_VERIFICATION_RESPONSE');
  const body = { verification_token: verified.verification_token, ...(register ? { email } : {}) };
  const next = fromTokens(await request<TokenResponse>(register ? '/auth/v1/signup' : '/auth/v1/signin', body), email);
  if (session()?.refreshToken !== start) throw new CloudError(401, 'SESSION_CHANGED');
  saveSession(next);
  return next;
}

// A device can have multiple tabs. Serialize refresh-token rotation and re-read
// the shared value inside the lock. A late response cannot undo sign-out.
let refreshTask: Promise<string> | undefined;
function tokenFor(userId: string, rejectedToken?: string): Promise<string> {
  const refresh = async () => {
    const current = session();
    if (current?.userId !== userId) throw new CloudError(401, 'SESSION_CHANGED');
    if (current.expiresAt > Date.now() + 45000 && (!rejectedToken || current.accessToken !== rejectedToken)) {
      return current.accessToken;
    }
    let refreshed: Session;
    try {
      refreshed = fromTokens(await request<TokenResponse>('/auth/v1/token', {
        grant_type: 'refresh_token', refresh_token: current.refreshToken,
      }), current.email);
    } catch (error) {
      const newer = session();
      if (newer?.userId === userId && newer.refreshToken !== current.refreshToken) return newer.accessToken;
      if (error instanceof CloudError && [400, 401, 403].includes(error.status)) throw new CloudError(401, 'SESSION_EXPIRED');
      throw error;
    }
    const active = session();
    if (active?.userId !== userId || refreshed.userId !== userId) throw new CloudError(401, 'SESSION_CHANGED');
    if (active.refreshToken !== current.refreshToken) return active.accessToken;
    saveSession({ ...refreshed, scope: active.scope });
    return refreshed.accessToken;
  };
  if (refreshTask) return refreshTask;
  refreshTask = (navigator.locks ? navigator.locks.request(authKey, refresh) : refresh()).finally(() => { refreshTask = undefined; });
  return refreshTask;
}

async function rpc<T>(userId: string, name: string, body: object): Promise<T> {
  const path = '/v1/rdb/rest/rpc/' + name;
  const token = await tokenFor(userId);
  try { return await request<T>(path, body, token); }
  catch (error) {
    if (error instanceof CloudError && error.status === 401 && !error.code.startsWith('COZY_')) {
      return request<T>(path, body, await tokenFor(userId, token));
    }
    throw error;
  }
}

export async function lookupSpace(userId: string, invite?: string): Promise<CloudScope | null> {
  const scope = await rpc<CloudScope | null>(userId, 'cozy_days_space', { p_invite: invite ?? null });
  if (scope === null) return null;
  if (scope.userId !== userId || typeof scope.spaceId !== 'string' || ![1, 2].includes(scope.members)) {
    throw new CloudError(502, 'INVALID_SPACE_RESPONSE');
  }
  const current = session();
  if (current?.userId !== userId) throw new CloudError(401, 'SESSION_CHANGED');
  saveSession({ ...current, scope });
  return scope;
}

export function pullCloud(scope: CloudScope, cursor: number) {
  return rpc<CloudRecord[]>(scope.userId, 'cozy_days_pull', {
    p_user: scope.userId, p_space: scope.spaceId, p_after: cursor,
  });
}
export function pushCloud(scope: CloudScope, kind: CloudRecord['kind'], id: string, attempt: SyncAttempt) {
  return rpc<PushResponse>(scope.userId, 'cozy_days_push', {
    p_user: scope.userId, p_space: scope.spaceId, p_kind: kind, p_id: id,
    p_operation: attempt.operation, p_base: attempt.version, p_value: attempt.value,
  });
}

export async function forgetSession() {
  const current = session();
  localStorage.removeItem(authKey);
  if (current && navigator.onLine) {
    await request('/auth/v1/user/signout', {}, current.accessToken, true).catch(() => {});
  }
}
