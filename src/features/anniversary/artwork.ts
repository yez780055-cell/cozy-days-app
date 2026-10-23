import type { AssetName } from '../../assets/manifest';

// Replace these semantic aliases with the audited anniversary assets after its PR lands.
// Existing Asset supplies a bundled offline fallback if an image is unavailable.
export const anniversaryArtwork: Record<'headerCats' | 'emptyCollection' | 'sparkle', AssetName> = {
  headerCats: 'cat', emptyCollection: 'empty', sparkle: 'sparkle',
};
