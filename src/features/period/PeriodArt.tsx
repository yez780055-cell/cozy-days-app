import { useId } from 'react';

const drop = 'M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z';
const fillLevels = [22, 18, 15, 12, 5];
export const symptomPaths: Record<string, string> = {
  腹痛: 'M8 4v2.5c0 2.7-3 5.2-3 9.2 0 1.7.6 3.2 1.5 4.3h11c.9-1.1 1.5-2.6 1.5-4.3 0-4-3-6.5-3-9.2V4M12.8 10l-2.9 4h4l-2.6 3.6',
  腰痛: 'M8 4c-.9 1.4-3.3 1.7-3.3 4.6 0 2.5 2.1 4.4 2.1 7.5l-.4 4M15.5 4c.9 1.4 3.3 1.7 3.3 4.6 0 .9-.3 1.8-.7 2.5m-.9 6.4.4 2.6M11.8 6v1.1m0 2.6v1.1m0 2.6v1.1m0 2.6v1.1M16 14.3h5m-2.5-2.5v5',
  疲惫: 'M5.5 6.5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2ZM21.5 10v4M7 10v4',
  头痛: 'M13.5 5a7.4 7.4 0 0 0-9 7.2c0 2.5 1.2 4.4 3 5.8v2h7v-2h1a2 2 0 0 0 2-2v-1.3h1.2c.5 0 .7-.5.4-.9l-1.7-2.1v-.8M13.7 11.9h.1M19 3.5v4.8m-2.4-2.4h4.8',
  胸部胀痛: 'M6.7 4.5v4.1l-2 3.1c-1.8 3-.2 6.8 3.1 6.8 1.7 0 3-.8 4.2-2.1 1.2 1.3 2.5 2.1 4.2 2.1 3.3 0 4.9-3.8 3.1-6.8l-2-3.1V4.5M6.7 8.6l5.3 3 5.3-3M12 5v3m-1.5-1.5h3',
  腹胀: 'M9 4.2c0 2.8-4.9 6.4-4.9 10.6a7.9 5.3 0 0 0 15.8 0c0-4.2-4.9-7.8-4.9-10.6M10.4 13.7H7.5m1.2-1.2-1.2 1.2 1.2 1.2m4.9-1.2h2.9m-1.2-1.2 1.2 1.2-1.2 1.2M12 17h.1',
  恶心: 'M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0ZM7.6 10.3l2.3.5m4.2 0 2.3-.5M7.8 15.1q1.1-1.7 2.2 0t2.2 0 2.2 0 2.2 0',
  痘痘: 'M20.2 12a8.2 8.2 0 1 1-16.4 0 8.2 8.2 0 0 1 16.4 0ZM8.7 9.7h.1m5.7 0h.1m-4.7 6q2.1 1.3 4.2 0m1.9-3.4h.1m1.4-1.2h.1m-.2 2.7h.1',
  其他: 'M7.5 6.5h9a5.5 5.5 0 0 1 0 11h-9a5.5 5.5 0 0 1 0-11ZM7.8 12h.1m4.1 0h.1m4.1 0h.1',
};

export const moodFaces: Record<string, string> = {
  开心: '😊', 平静: '🙂', 放松: '😌', 疲倦: '😪', 焦虑: '😰',
  低落: '😔', 易怒: '😠', 敏感: '🥺', 难过: '😢',
};

export function PeriodChoiceIcon({ field, option, index }: {field: 'flow' | 'symptoms' | 'mood'; option: string; index: number}) {
  const fillId = useId();
  if (field === 'mood') {
    return <span className="period-choice-icon period-mood-emoji" aria-hidden="true">{moodFaces[option]}</span>;
  }

  return <svg className="period-choice-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {field === 'flow' ? <>
      <defs><clipPath id={fillId}><path d={drop}/></clipPath></defs>
      <path d={drop}/>
      <rect x="4" y={fillLevels[index]} width="16" height="18" fill="currentColor" stroke="none" clipPath={`url(#${fillId})`}/>
    </> : <path d={symptomPaths[option]}/>}
  </svg>;
}
