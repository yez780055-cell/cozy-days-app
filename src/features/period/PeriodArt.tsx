import { Asset } from '../../components/Asset';

const art = {
  header: 'cat',
  note: 'empty',
} as const;

export function PeriodArt({ slot }: { slot: keyof typeof art }) {
  return <div className={`period-art period-art--${slot}`} aria-hidden="true">
    <Asset name={art[slot]} className="period-art-main"/>
    {slot === 'header' && <>
      <Asset name="star" className="period-art-star"/>
      <Asset name="sparkle" className="period-art-sparkle"/>
      <Asset name="heart" className="period-art-heart"/>
    </>}
  </div>;
}

export function CatFace({ variant = 0 }: { variant?: number }) {
  const sleepy = variant === 1 || variant === 3;
  return <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false" className={`period-cat-face variant-${variant}`}>
    <path d="M7 14 6 5l9 5a17 17 0 0 1 10 0l8-5-1 10a14 14 0 0 1 3 9c0 8-6 13-16 13S3 31 3 23a14 14 0 0 1 4-9Z" fill="#fff8ed" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M10 17q3-3 6 0M24 17q3-3 6 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    {sleepy ? <path d="M11 24q3 3 6 0m6 0q3 3 6 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/> : <><circle cx="13" cy="23" r="1.5" fill="currentColor"/><circle cx="27" cy="23" r="1.5" fill="currentColor"/><path d="m18 27 2 1 2-1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>}
    <ellipse cx="8" cy="25" rx="3" ry="1.5" fill="#f2a7b7" opacity=".65"/><ellipse cx="32" cy="25" rx="3" ry="1.5" fill="#f2a7b7" opacity=".65"/>
  </svg>;
}
