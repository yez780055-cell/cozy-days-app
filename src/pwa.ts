import { Capacitor } from '@capacitor/core';

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || Capacitor.isNativePlatform()) return;

  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    updateViaCache: 'none',
  }).then(registration => {
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && !registration.installing) {
        void registration.update().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
  }).catch(error => console.warn('Service worker registration failed:', error));
}
