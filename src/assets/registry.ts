import catalog from './ready-catalog.json';

/** Single QA gate for every image in the app. Add audited catalog rows before use. */
export function registeredAsset(id: string, fit: 'cover' | 'contain' = 'contain', anchor = 'center') {
  const entry = catalog.find(asset => asset.name === id && asset.status === 'ready');
  if (!entry) throw new Error(`Asset is not approved: ${id}`);
  return { file: `${import.meta.env.BASE_URL}assets/cozy_days/${entry.file}`, name: id,
    width: entry.width, height: entry.height, fit, anchor, status: 'ready' as const };
}
