// Asset task integration point. Supply independent transparent illustrations here.
export const periodArt: Partial<Record<'header' | 'note' | 'tips', string>> = {};
export function PeriodArt({ slot }: { slot: 'header' | 'note' | 'tips' }) {
  const src = periodArt[slot];
  return <div className={`period-art period-art--${slot}`} aria-hidden="true">
    {src ? <img src={src} alt="" draggable={false}/> : <><span className="period-moon">☾</span><span className="period-star">✧</span><div className="period-cat period-cat--white"><i/><b>· ᴗ ·</b></div><div className="period-cat period-cat--black"><i/><b>· ω ·</b></div><span className="period-art-heart">♡</span></>}
  </div>;
}
