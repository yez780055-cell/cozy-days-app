import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

type SwipeHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
};

type Gesture = { pointerId: number; x: number; y: number; axis: 'pending' | 'x' | 'y' };

/** Horizontal date navigation that leaves vertical scrolling and taps to the browser. */
export function useDateSwipe(onSwipe: (direction: 'previous' | 'next') => void): SwipeHandlers {
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const clearClickTimer = useRef<ReturnType<typeof setTimeout>>();

  function down(event: ReactPointerEvent<HTMLElement>) {
    if (clearClickTimer.current) clearTimeout(clearClickTimer.current);
    clearClickTimer.current = undefined;
    suppressClick.current = false;
    if (!event.isPrimary) { gesture.current = null; return; }
    if (event.button !== 0) return;
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, axis: 'pending' };
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (current.axis === 'pending') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      current.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
      if (current.axis === 'x') {
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Capture can be unavailable in older WebViews. */ }
      }
    }
    if (current.axis === 'x' && event.cancelable) event.preventDefault();
  }

  function finish(event: ReactPointerEvent<HTMLElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (cancelled || current.axis !== 'x') return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    suppressClick.current = true;
    if (clearClickTimer.current) clearTimeout(clearClickTimer.current);
    clearClickTimer.current = setTimeout(() => { suppressClick.current = false; }, 120);
    onSwipe(dx < 0 ? 'next' : 'previous');
  }

  function clickCapture(event: ReactMouseEvent<HTMLElement>) {
    if (!suppressClick.current || event.detail === 0) return;
    suppressClick.current = false;
    if (clearClickTimer.current) clearTimeout(clearClickTimer.current);
    event.preventDefault();
    event.stopPropagation();
  }

  return {
    onPointerDown: down,
    onPointerMove: move,
    onPointerUp: event => finish(event),
    onPointerCancel: event => finish(event, true),
    onClickCapture: clickCapture,
  };
}
