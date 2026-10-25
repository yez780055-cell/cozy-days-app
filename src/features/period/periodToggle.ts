import { addDays, dayNumber, validatePeriod, type PeriodEntry } from './model';

export function actualPeriod(date:string, periods:PeriodEntry[], today:string) {
  return date <= today ? periods.find(p=>date>=p.start&&date<=(p.end||today)) : undefined;
}
export type TogglePlan = {kind:'unchanged'} | {kind:'error';message:string} |
  {kind:'confirm-truncate';from:string;through:string} | {kind:'require-end'} |
  {kind:'ready';periods:PeriodEntry[]};
// Adjacent intervals always remain separate. No hidden merge or diary mutation.
export function planPeriodToggle(periods:PeriodEntry[], date:string, today:string, yes:boolean, id:string, options?:{confirm?:boolean;end?:string}):TogglePlan {
  if(!Number.isFinite(dayNumber(date))||date>today) return {kind:'error',message:'未来或无效日期不能记录真实经期。'};
  const current=actualPeriod(date,periods,today);
  if(Boolean(current)===yes) return {kind:'unchanged'};
  if(current) {
    if(date<today&&!options?.confirm) return {kind:'confirm-truncate',from:date,through:current.end||today};
    return {kind:'ready',periods:periods.flatMap(p=>p!==current?[p]:date===p.start?[]:[{...p,end:addDays(date,-1)}])};
  }
  const protectedHistory=date<today&&periods.some(p=>p.start>date||(p.start<=today&&(p.end||today)>=addDays(today,-89)));
  if(protectedHistory&&!options) return {kind:'require-end'};
  if(protectedHistory&&!options?.end) return {kind:'error',message:'已有后续或近90天经期，请填写本次结束日期。'};
  const entry:PeriodEntry={id,start:date,...(options?.end?{end:options.end}:{})};
  const message=validatePeriod(entry,periods,today);
  return message?{kind:'error',message}:{kind:'ready',periods:[...periods,entry]};
}
