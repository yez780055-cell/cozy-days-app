import { useSyncExternalStore } from 'react';
import { AndroidShell, androidPageReady, type WebUpdateProgress } from './shell';

type Version = Awaited<ReturnType<typeof AndroidShell.updateInfo>>;
type Release = NonNullable<Awaited<ReturnType<typeof AndroidShell.checkOnlineUpdate>>['release']>;
type Status = 'idle' | 'checking' | 'unconfigured' | 'current' | 'available' | 'offline' | 'checkFailed'
  | 'importing' | 'restoring' | 'nativeFailed' | 'installed' | 'rolledBack' | 'onlineFailed' | WebUpdateProgress['stage'];

const releasePreference = 'cozy-days.android-prerelease-updates';

function prefersPrerelease() {
  try { return localStorage.getItem(releasePreference) === '1'; } catch { return false; }
}

let state: { prerelease: boolean; status: Status; version?: Version; release?: Release; prompt: boolean; feedback: boolean; error?: string; received: number } = {
  prerelease: prefersPrerelease(), status: 'idle', prompt: false, feedback: false, received: 0,
};
// Automatic checks run once per document lifetime, even after dismissal or channel changes.
let startupChecked = false;
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

export function isOnlineUpdateBusy(status: Status) {
  return status === 'downloading' || status === 'verifying' || status === 'installing';
}

export function isUpdateBusy(status: Status) {
  return isOnlineUpdateBusy(status) || status === 'checking' || status === 'importing' || status === 'restoring';
}

function message(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export async function checkWebUpdate(startup = false) {
  if (isUpdateBusy(state.status) || (startup && startupChecked)) return;
  if (startup) startupChecked = true;
  setState({ status: 'checking', release: undefined, error: undefined, prompt: false, feedback: !startup });
  try {
    await androidPageReady;
    const version = await AndroidShell.updateInfo();
    setState({ version });
    if (version.outcome) { setState({ status: version.outcome, prompt: true, feedback: true }); return; }
    if (!navigator.onLine) { setState({ status: 'offline', prompt: false }); return; }
    const { configured, release } = await AndroidShell.checkOnlineUpdate({ retryFailed: !startup, prerelease: state.prerelease });
    setState({ status: release ? 'available' : configured ? 'current' : 'unconfigured', release, prompt: Boolean(release) });
  } catch (cause) {
    setState({ status: navigator.onLine ? 'checkFailed' : 'offline', prompt: false,
      error: startup ? undefined : message(cause, '暂时无法检查更新。可以继续使用本地网页。') });
  }
}

export function setPrereleaseUpdates(prerelease: boolean) {
  if (isUpdateBusy(state.status) || state.prerelease === prerelease) return;
  try {
    if (prerelease) localStorage.setItem(releasePreference, '1');
    else localStorage.removeItem(releasePreference);
  } catch { /* In-memory opt-in lasts only until the app reloads. */ }
  setState({ prerelease, feedback: false, status: 'idle', release: undefined, error: undefined, prompt: false });
}

export function dismissWebUpdate() {
  if (!isUpdateBusy(state.status)) setState({ prompt: false });
}

export async function installOnlineWebUpdate() {
  const release = state.release;
  if (!release || isUpdateBusy(state.status)) return;
  setState({ status: 'downloading', feedback: true, received: 0, error: undefined, prompt: true });
  try {
    const listener = await AndroidShell.addListener('webUpdateProgress', progress => {
      setState({ status: progress.stage, received: progress.received });
    });
    try {
      await AndroidShell.installOnlineUpdate({ web: release.web });
      // The native shell reloads the document and reports the outcome after the new page is ready.
      setState({ status: 'installing' });
    } finally {
      void listener.remove();
    }
  } catch (cause) {
    setState({ status: 'onlineFailed', error: message(cause, '更新未完成，请重试。') });
  }
}

export async function runNativeWebUpdate(action: 'importUpdate' | 'restoreBundled') {
  if (isUpdateBusy(state.status)) return;
  const previous = state.status;
  setState({ feedback: true, status: action === 'importUpdate' ? 'importing' : 'restoring', error: undefined, prompt: false });
  try {
    await AndroidShell[action]();
    const version = await AndroidShell.updateInfo();
    if (version.web === state.version?.web) {
      setState({ version, status: previous === 'nativeFailed' ? 'idle' : previous });
    } else {
      setState({ version, release: undefined, status: 'idle' });
    }
  } catch (cause) {
    setState({ status: 'nativeFailed', error: message(cause, '暂时无法更新网页内容。') });
  }
}
