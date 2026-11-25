// A surface is eligible only while the owning React tree remains committed.
type Listener = (surface: HTMLElement | null) => void;
let current: HTMLElement | null = null;
let owner: object | undefined;
const listeners = new Set<Listener>();
export function publishStartupSurface(surface: HTMLElement) {
  const registration = {};
  owner = registration;
  current = surface;
  for (const listener of listeners) listener(current);
  return () => {
    if (owner !== registration) return;
    owner = undefined;
    current = null;
    for (const listener of listeners) listener(null);
  };
}
export function watchStartupSurface(listener: Listener) {
  listeners.add(listener);
  listener(current);
  return () => { listeners.delete(listener); };
}
