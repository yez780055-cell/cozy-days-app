import { registeredAsset } from './registry';

export const assets = {
  hero: registeredAsset('bedroom_header', 'cover', '62% 45%'),
  cat: registeredAsset('cats_header'),
  empty: registeredAsset('cats_empty_state'),
  sparkle: registeredAsset('sparkle_gold'),
  heart: registeredAsset('heart_pink_outline'),
  star: registeredAsset('star_cream'),
  tape: registeredAsset('washi_pink'),
  flower: registeredAsset('flower_pink'),
  cherries: registeredAsset('cherries_simple'),
  book: registeredAsset('book_open_decor'),
  taskBook: registeredAsset('task_book'),
  taskStretch: registeredAsset('task_stretch'),
  work: registeredAsset('pencil_cup'),
  study: registeredAsset('books_upright'),
  home: registeredAsset('sprout'),
  originalPlant: registeredAsset('original_plant'),
  originalCheer: registeredAsset('original_cheer'),
  originalBooks: registeredAsset('original_books_bubble'),
  originalPeekingCat: registeredAsset('original_peeking_cat'),
} as const;
export type AssetName = keyof typeof assets;

