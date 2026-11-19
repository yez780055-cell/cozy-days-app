import { shortDate, type DailyEntry } from './model';
import { moodFaces, PeriodChoiceIcon, symptomPaths } from './PeriodArt';

export const flows = ['无', '点滴', '较少', '适中', '较多'];
export const symptoms = Object.keys(symptomPaths);
export const moods = Object.keys(moodFaces);
const groups = [
  { label: '流量', options: flows, field: 'flow' },
  { label: '身体状况', options: symptoms, field: 'symptoms' },
  { label: '今日心情', options: moods, field: 'mood' },
] as const;

export function DailyPeriodRecord({ date, today, value, active, locked, onToggle, onChange }: {
  date: string; today: string; value?: DailyEntry; active: boolean; locked: boolean;
  onToggle: () => void; onChange: (value: DailyEntry) => void;
}) {
  const entry = value ?? { date, symptoms: [] };
  const future = date > today;
  const hint = locked ? '已结束的经期可在设置 → 周期信息中修改'
    : active ? '经期中 · 关闭以记录结束日期'
    : date < today ? '非经期 · 开启后选择结束日期' : '非经期 · 开启以记录开始日期';

  return <section className="period-daily" aria-label="每日记录">
    <header className="period-section-heading">
      <h2>{date === today ? '今日记录' : '每日记录'}</h2>
      <time dateTime={date}>{shortDate(date)}</time>
    </header>
    <div className="period-toggle-row">
      <div><strong>经期状态</strong><small>{hint}</small></div>
      <button type="button" role="switch" aria-label="经期中" aria-checked={active} disabled={locked}
        className="period-switch" onClick={onToggle}><span aria-hidden="true"/></button>
    </div>
    {future && <p className="period-fine">未来日期可设置经期状态，身体记录可在当天填写。</p>}
    {groups.map(({ label, options, field }) =>
      <div key={field} className="period-record-group">
        <fieldset disabled={future}>
          <legend>{label}{field === 'symptoms' && <small>可多选</small>}</legend>
          <div className="period-choices">
            {options.map((option, index) => {
              const selected = field === 'symptoms' ? entry.symptoms.includes(option) : entry[field] === option;
              return <button type="button" key={option} className="button button--soft"
                aria-pressed={selected} onClick={() => onChange({
                  ...entry,
                  [field]: field === 'symptoms'
                    ? selected ? entry.symptoms.filter(symptom => symptom !== option) : [...entry.symptoms, option]
                    : selected ? undefined : option,
                })}>
                <PeriodChoiceIcon field={field} option={option} index={index}/>
                {option}
              </button>;
            })}
          </div>
        </fieldset>
      </div>
    )}
  </section>;
}
