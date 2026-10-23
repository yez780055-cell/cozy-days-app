import { Droplet, Smile, Heart } from 'lucide-react';
import { shortDate, type DailyEntry } from './model';
import { PeriodArt } from './PeriodArt';
export const flows=['较多','适中','较少','点滴','无'];
export const symptoms=['腹痛','疲惫','头痛','胸部胀痛','其他'];
export const moods=['开心','平静','焦虑','低落','易怒'];
const symbols=[['♥','♦','♦','·','○'],['〰','☾','⌁','♡','···'],['◡','ᴗ','﹏','︵','⌢']];
export function DailyPeriodRecord({ date, today, value, onChange }: {date:string;today:string;value?:DailyEntry;onChange:(value:DailyEntry)=>void}) {
  const entry=value??{date,symptoms:[]}, future=date>today;
  return <section className="period-card period-daily" aria-label="每日记录"><header><h2><Heart size={19}/> {date===today?'今日记录':'每日记录'} <em>♡</em></h2><span>{shortDate(date)}</span></header>
    <p className="period-fine">{future?'未来日期暂不能记录身体状态。':'点选即可保存，再次点选可取消。流量日记不会自动改动经期起止。'}</p>
    {[{label:'经期流量',Icon:Droplet,options:flows,field:'flow' as const},{label:'身体症状',Icon:Heart,options:symptoms,field:'symptoms' as const},{label:'今日心情',Icon:Smile,options:moods,field:'mood' as const}].map(({label,Icon,options,field},row)=><fieldset key={field} disabled={future}><legend><Icon size={16}/>{label}{field==='symptoms'&&<small>可多选</small>}</legend><div className="period-choices">{options.map((option,i)=>{
      const active=field==='symptoms'?entry.symptoms.includes(option):entry[field]===option;
      return <button type="button" key={option} aria-pressed={active} onClick={()=>onChange({...entry,[field]:field==='symptoms'?(active?entry.symptoms.filter(s=>s!==option):[...entry.symptoms,option]):active?undefined:option})}><span className={`period-choice-icon row-${row}`} aria-hidden="true">{symbols[row][i]}</span><span>{option}</span></button>;
    })}</div></fieldset>)}
    <aside className="period-note"><span>今天也辛苦啦<br/>给自己一点温柔 ♡</span><PeriodArt slot="note"/></aside>
  </section>;
}
