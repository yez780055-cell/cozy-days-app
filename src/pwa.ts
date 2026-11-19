import { Capacitor } from '@capacitor/core';

type UpdateState = 'idle' | 'available' | 'updating' | 'error';
let state: UpdateState = 'idle';
let registration: ServiceWorkerRegistration | undefined;
const listeners = new Set<() => void>();
const setState = (next: UpdateState) => { state = next; listeners.forEach(listener => listener()); };
export const getUpdateState = () => state;
export const subscribeToUpdate = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function dismissUpdate() { setState('idle'); }

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || Capacitor.isNativePlatform()) return;
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }).then(reg => {
    registration = reg;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (state !== 'updating') setState('idle');
    });
    const showWaiting = () => {
      if (reg.waiting && navigator.serviceWorker.controller && navigator.onLine && state !== 'updating') setState('available');
    };
    const watch = (worker: ServiceWorker) => worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') showWaiting();
    });
    if (reg.installing) watch(reg.installing);
    reg.addEventListener('updatefound', () => { if (reg.installing) watch(reg.installing); });
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        showWaiting();
        if (!reg.installing) void reg.update().catch(() => {});
      }
    };
    showWaiting();
    document.addEventListener('visibilitychange', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
  }).catch(error => console.warn('Service worker registration failed:', error));
}

export async function applyUpdate() {
  if (state === 'updating') return;
  setState('updating');
  const activate = async () => {
    const worker = registration?.waiting;
    if (!worker) throw new Error('No waiting update');
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { cleanup(); reject(new Error('Activation timed out')); }, 15000);
      const changed = () => {
        if (navigator.serviceWorker.controller !== worker) return;
        cleanup();
        resolve();
      };
      const cleanup = () => { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', changed); };
      navigator.serviceWorker.addEventListener('controllerchange', changed);
      try {
        worker.postMessage({ type: 'SKIP_WAITING' });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
    window.location.reload();
  };
  try {
    if (navigator.locks) {
      await navigator.locks.request('cozy-days-pwa-update', { ifAvailable: true }, async lock => {
        if (!lock) { setState('idle'); return; }
        await activate();
      });
    } else {
      // A short lease coordinates browsers without the Web Locks API.
      const key = 'cozy-days.update-lease';
      const now = Date.now();
      if (Number(localStorage.getItem(key)) > now) { setState('idle'); return; }
      localStorage.setItem(key, String(now + 20000));
      try { await activate(); } finally { localStorage.removeItem(key); }
    }
  } catch {
    setState('error');
  }
}
