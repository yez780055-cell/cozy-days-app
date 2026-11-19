import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { AndroidShell } from './shell';

type Layer = 'root' | 'page' | 'overlay';
const handlers: Record<Layer, Array<() => void>> = { root: [], page: [], overlay: [] };
const exitWindowMs = 2000;
let exitUntil = 0;

function top(layer: Layer): (() => void) | undefined {
  const stack = handlers[layer];
  return stack[stack.length - 1];
}

export function resetAndroidExit() {
  exitUntil = 0;
}

export function backFromAndroidHome() {
  const now = performance.now();
  const exit = now < exitUntil;
  exitUntil = exit ? 0 : now + exitWindowMs;
  void AndroidShell.homeBack({ exit }).catch(console.error);
}

export function bindAndroidBack() {
  window.addEventListener('cozy-android-back', () => {
    const overlay = top('overlay');
    const page = top('page');
    if (overlay || page) resetAndroidExit();
    const back = overlay ?? page ?? top('root');
    if (back) flushSync(back);
  });
  window.addEventListener('click', resetAndroidExit, { capture: true });
  document.addEventListener('visibilitychange', resetAndroidExit);
}

export function useAndroidBack(layer: Layer, enabled: boolean, handler: () => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useLayoutEffect(() => {
    if (import.meta.env.MODE !== 'android' || !enabled) return;
    const stack = handlers[layer];
    const entry = () => latest.current();
    stack.push(entry);
    resetAndroidExit();
    return () => {
      stack.splice(stack.indexOf(entry), 1);
      resetAndroidExit();
    };
  }, [enabled, layer]);
}
