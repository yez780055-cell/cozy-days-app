import { useId } from 'react';

const drop = 'M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z';
const fillLevels = [22, 18, 15, 12, 5];
const bodyMarks = [
  'M12 13l-2 3h3l-2 3', 'M12 9v7m-3 1-2 2m8-2 2 2', 'M9 15h6m-5 2h4',
  'M7 11l-2-1m12 1 2-1', 'M8 12q2-3 4 0 2-3 4 0', 'M9 16q3 3 6 0',
  'M9 15q3-3 6 0', 'M9 12h.1m4 2h.1m2-3h.1', 'M9 15h.1m3 0h.1m3 0h.1',
];
const faces = [
  'M8 14q4 6 8 0', 'M9 15h6', 'M9 15q3 2 6 0', 'M10 16h4',
  'M9 16q2-3 4 0t3-1', 'M9 16q3-3 6 0', 'M9 16h6', 'M10 15q2-1 4 0', 'M9 17q3-4 6 0',
];

export function PeriodChoiceIcon({ field, index }: {field: 'flow' | 'symptoms' | 'mood'; index: number}) {
  const fillId = useId();
  return <svg className="period-choice-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {field === 'flow' ? <>
      <defs><clipPath id={fillId}><path d={drop}/></clipPath></defs>
      <path d={drop}/>
      <rect x="4" y={fillLevels[index]} width="16" height="18" fill="currentColor" stroke="none" clipPath={`url(#${fillId})`}/>
    </> : field === 'symptoms' ? <>
      <path d="M8 3v5l-2 8q0 5 6 5t6-5l-2-8V3"/>
      <path d={bodyMarks[index]}/>
    </> : <>
      <circle cx="12" cy="12" r="9"/>
      <path d={`M8 9h1m6 0h1 ${faces[index]}`}/>
    </>}
  </svg>;
}
