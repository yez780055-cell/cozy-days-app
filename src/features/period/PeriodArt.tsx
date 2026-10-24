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
