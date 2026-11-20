import { useSyncExternalStore } from 'react';
import { AndroidShell } from './shell';

type Version = Awaited<ReturnType<typeof AndroidShell.updateInfo>>;
type Release = { web: number; downloadPage: string };
type Status = 'idle' | 'checking' | 'unconfigured' | 'current' | 'available' | 'browser'
  | 'offline' | 'checkFailed' | 'importing' | 'restoring' | 'nativeFailed';

let state: { status: Status; version?: Version; release?: Release; prompt: boolean; error?: string } = {
  status: 'idle', prompt: false,
};
const listeners = new Set<() => void>();

function setState(next: Partial<typeof state>) {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useWebUpdate = () => useSyncExternalStore(subscribe, () => state);

function updateRoot() {
  const value = import.meta.env.VITE_ANDROID_WEB_UPDATE_ROOT?.trim();
  if (!value) return;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname === location.hostname || url.username || url.password
    || url.search || url.hash) throw new Error('Invalid Android web release root');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

async function fetchRelease(root: URL, version: Version, signal: AbortSignal): Promise<Release | undefined> {
  const feed = new URL(`shell-${version.shell}/latest.json`, root);
  const response = await fetch(feed, { signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
  if (response.status === 404) return;
  if (!response.ok) throw new Error('Release catalog unavailable');
  const manifest = await response.json();
  if (manifest?.schema !== 1 || manifest.shell !== version.shell || !Number.isInteger(manifest.web)
    || manifest.web < 2 || manifest.web > 2_147_483_647 || typeof manifest.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error('Invalid release catalog');
  if (manifest.web <= version.web) return;
  const downloadPage = new URL(`web-${manifest.web}/download.html`, feed);
  downloadPage.hash = manifest.sha256;
  return { web: manifest.web, downloadPage: downloadPage.href };
}

export function isUpdateBusy(status: Status) {
  return status === 'checking' || status === 'importing' || status === 'restoring';
}

export async function checkWebUpdate(startup = false) {
  if (isUpdateBusy(state.status) || (startup && state.status !== 'idle')) return;
  setState({ status: 'checking', release: undefined, error: undefined, prompt: false });
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const version = await AndroidShell.updateInfo();
    setState({ version });
    const root = updateRoot();
    if (!root) { setState({ status: 'unconfigured' }); return; }
    if (!navigator.onLine) { setState({ status: 'offline' }); return; }
    const release = await fetchRelease(root, version, controller.signal);
    setState({ status: release ? 'available' : 'current', release, prompt: Boolean(release) });
  } catch {
    setState({ status: navigator.onLine ? 'checkFailed' : 'offline' });
  } finally {
    window.clearTimeout(timer);
  }
}

export function dismissWebUpdate() {
  setState({ prompt: false });
}

export function openWebDownload() {
  setState({ status: 'browser', prompt: true });
}

export async function runNativeWebUpdate(action: 'importUpdate' | 'restoreBundled') {
  if (isUpdateBusy(state.status)) return;
  const previous = state.status;
  const handoff = action === 'importUpdate' && state.prompt && (previous === 'browser' || previous === 'nativeFailed');
  setState({ status: action === 'importUpdate' ? 'importing' : 'restoring', error: undefined, prompt: handoff });
  try {
    await AndroidShell[action]();
    const version = await AndroidShell.updateInfo();
    const release = state.release && state.release.web > version.web ? state.release : undefined;
    const unchanged = version.web === state.version?.web;
    const status = handoff ? 'browser' : previous === 'nativeFailed' ? 'idle' : previous;
    setState({ version, release, status: unchanged ? status : 'idle', prompt: unchanged && handoff });
  } catch (cause) {
    setState({ status: 'nativeFailed', error: cause instanceof Error ? cause.message : '暂时无法更新网页内容。' });
  }
}
