import { Asset } from '../../components/Asset';
import type { Anniversary } from './model';
import { anniversaryArtwork } from './artwork';

/** Small, locally drawn keepsakes used where the reference calls for specific objects. */
export function AnniversaryDoodle({ row }: { row: Anniversary }) {
  const label = row.theme.toLowerCase();
  if (/生日|birthday/.test(label)) return <svg viewBox="0 0 100 80" aria-hidden="true" className="ann-doodle"><path d="M17 52h66l-6 19H23z" fill="#fff8ef" stroke="currentColor" strokeWidth="2.5"/><path d="M23 51c0-8 54-8 54 0s-54 9-54 0Z" fill="#f7a9b3" stroke="currentColor" strokeWidth="2.5"/><path d="M33 43V27m17 15V20m17 23V27" stroke="currentColor" strokeWidth="3"/><path d="M29 25q4-8 8 0m8-7q5-8 9 0m8 7q5-8 9 0" fill="#ffd77b" stroke="currentColor" strokeWidth="2"/><path d="M16 33l-4-8m71 12 5-8" stroke="#e6a341" strokeWidth="2"/></svg>;
  if (/宠物|猫|pet/.test(label)) return <div className="ann-doodle ann-doodle-cats" aria-hidden="true"><Asset name="cat"/><Asset name="empty"/></div>;
  if (/毕业|成长|education|study/.test(label)) return <svg viewBox="0 0 100 80" aria-hidden="true" className="ann-doodle"><path d="m12 27 38-16 38 16-38 17z" fill="#454340" stroke="currentColor" strokeWidth="2.5"/><path d="M29 38v13q21 16 42 0V38L50 48z" fill="#625f59" stroke="currentColor" strokeWidth="2"/><path d="M81 29v24" stroke="#d9a74b" strokeWidth="3"/><circle cx="81" cy="56" r="4" fill="#e6a9ae"/><path d="M24 64q26-8 53 0l-5 9H29z" fill="#fff8ed" stroke="currentColor" strokeWidth="2"/></svg>;
  return <div className="ann-doodle ann-doodle-love" aria-hidden="true"><Asset name="cat"/><Asset name="heart"/></div>;
}
