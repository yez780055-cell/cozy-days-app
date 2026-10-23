import type { AssetName } from '../../assets/manifest';

// Reuse the six user-approved, catalog-audited assets listed in the anniversary manifest.
// Asset supplies a bundled offline fallback if an image is unavailable.
export const anniversaryArtwork: Record<'headerCats' | 'emptyCollection' | 'sparkle' | 'flower' | 'heart' | 'star' | 'tape', AssetName> = {
  headerCats: 'empty', emptyCollection: 'empty', sparkle: 'sparkle',
  flower: 'flower', heart: 'heart', star: 'star', tape: 'tape',
};
