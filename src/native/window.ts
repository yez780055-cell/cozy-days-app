import { AndroidShell, signalAndroidPageReady, type SafeArea } from './shell';
import { bindAndroidBack } from './back';
import { bindAndroidKeyboard } from './keyboard';
import './window.css';
import { watchStartupSurface } from './startupReadiness';

export async function prepareAndroidWindow() {
  const root = document.documentElement;
  root.dataset.cozyAndroid = '';
  bindAndroidBack();
  const updateKeyboard = bindAndroidKeyboard(root);
  const apply = (area: SafeArea) => {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      root.style.setProperty(`--android-safe-${side}`, `${area[side]}px`);
    }
    updateKeyboard(area);
  };
  window.addEventListener('cozy-safe-area', event => apply((event as CustomEvent<SafeArea>).detail));
  let startupToken: number | undefined;
  await AndroidShell.getSafeArea().then(area => {
    startupToken = area.startupToken;
    apply(area);
  }).catch(error => console.error(error));

  let generation = 0;
  let confirmed = false;
  watchStartupSurface(phone => {
    const mine = ++generation;
    if (!phone || confirmed || !Number.isInteger(startupToken) || startupToken! < 0 || startupToken! > 2147483647) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (mine !== generation || confirmed || !phone.isConnected) return;
      const style = getComputedStyle(phone);
      const context = document.createElement('canvas').getContext('2d');
      const prefersDarkIcons = (color: string) => {
        if (!context || !color.trim()) return true;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color.trim();
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3), byte => {
          const value = byte / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.179;
      };
      confirmed = true;
      void AndroidShell.ready({
        startupToken,
        darkStatusIcons: prefersDarkIcons(style.backgroundColor),
        darkNavigationIcons: prefersDarkIcons(style.getPropertyValue('--surface')),
      }).then(signalAndroidPageReady).catch(error => console.error(error));
    }));
  });
}
