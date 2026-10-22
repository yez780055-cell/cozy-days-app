export const motion = {
  press: 160,
  checkbox: 220,
  modal: 240,
  list: 240,
  undo: 5000,
  swipe: 300,
  easing: 'cubic-bezier(.2,.8,.2,1)',
};
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function animateElement(element: Element | null, frames: Keyframe[], duration = motion.list) {
  if (!element || reducedMotion() || !element.animate) return null;
  return element.animate(frames, { duration, easing: motion.easing, fill: 'none' });
}
