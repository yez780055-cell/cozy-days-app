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
  const mood = variant % 6;
  const eyes = mood === 0 || mood === 3 ? 'open' : mood === 2 || mood === 4 ? 'wide' : 'soft';
  return <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false" className={`period-cat-face variant-${variant}`}>
    <path d="M7 14 6 5l9 5a17 17 0 0 1 10 0l8-5-1 10a14 14 0 0 1 3 9c0 8-6 13-16 13S3 31 3 23a14 14 0 0 1 4-9Z" fill="#fff8ed" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    {mood === 4 && <path d="m10 14 6 1m8 0 6-2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>}
    {mood === 2 && <path d="m10 14 6 2m8-2 6 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>}
    {eyes === 'soft' ? <path d="M10 19q3-3 6 0m8 0q3-3 6 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/> : eyes === 'wide' ? <><ellipse cx="13" cy="19" rx="2" ry="2.7" fill="currentColor"/><ellipse cx="27" cy="19" rx="2" ry="2.7" fill="currentColor"/></> : <><circle cx="13" cy="19" r="1.5" fill="currentColor"/><circle cx="27" cy="19" r="1.5" fill="currentColor"/></>}
    {mood === 0 ? <path d="M17 26q3 5 6 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/> : mood === 1 || mood === 5 ? <path d="M18 27h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/> : mood === 2 ? <><path d="m18 27 2-1 2 1" fill="none" stroke="currentColor" strokeWidth="1.5"/><circle cx="31" cy="27" r="1" fill="#78a8b3"/></> : mood === 3 ? <path d="M17 29q3-4 6 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/> : <path d="M18 29q2-3 4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>}
    <ellipse cx="8" cy="25" rx="3" ry="1.5" fill="#f2a7b7" opacity=".65"/><ellipse cx="32" cy="25" rx="3" ry="1.5" fill="#f2a7b7" opacity=".65"/>
  </svg>;
}
