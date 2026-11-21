import type { SafeArea } from './shell';

const keyboardFields = 'textarea, input:is([type=text], [type=search], [type=number], [type=email], [type=tel], [type=url], [type=password], :not([type])), [contenteditable=true]';

function revealFocusedField() {
  const field = document.activeElement;
  if (!(field instanceof HTMLElement) || !field.matches(keyboardFields)) return;
  const scroll = field.closest<HTMLElement>('.modal, .ann-page');
  if (!scroll) return;
  const viewport = scroll.getBoundingClientRect();
  const bounds = field.getBoundingClientRect();
  const header = scroll.querySelector('.modal-header');
  const actions = scroll.querySelector('.modal-actions');
  const top = Math.max(viewport.top, header?.getBoundingClientRect().bottom ?? viewport.top) + 6;
  const bottom = Math.min(viewport.bottom, actions?.getBoundingClientRect().top ?? viewport.bottom) - 6;
  if (bounds.top < top || bounds.height > bottom - top) scroll.scrollTop += bounds.top - top;
  else if (bounds.bottom > bottom) scroll.scrollTop += bounds.bottom - bottom;
}

export function bindAndroidKeyboard(root: HTMLElement) {
  let visible = false;
  let keyboardViewportHeight = 0;
  let frame = 0;
  let focusFrame = 0;
  const viewport = window.visualViewport;
  const update = () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(focusFrame);
    frame = requestAnimationFrame(() => {
      const offset = viewport?.offsetTop ?? 0;
      const browserHeight = viewport?.height ?? innerHeight;
      const height = keyboardViewportHeight
        ? Math.min(browserHeight, keyboardViewportHeight / (viewport?.scale ?? 1))
        : browserHeight;
      root.style.setProperty('--android-visible-height', `${Math.max(0, height)}px`);
      root.style.setProperty('--android-visible-offset', `${offset}px`);
      root.toggleAttribute('data-cozy-keyboard', visible);
      if (visible) focusFrame = requestAnimationFrame(revealFocusedField);
    });
  };
  window.addEventListener('resize', update);
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  document.addEventListener('focusin', update);
  update();
  return (area: SafeArea) => {
    visible = area.keyboardVisible;
    keyboardViewportHeight = visible ? area.keyboardViewportHeight : 0;
    update();
  };
}
