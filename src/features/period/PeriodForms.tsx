import { useState, type FormEvent } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { cycleStats, shortDate, sortedPeriods, validatePeriod, type CycleSettings, type PeriodData, type PeriodEntry } from './model';

export function PeriodEditor({ entry, data, today, selected, onSave, onClose }: {entry?:PeriodEntry;data:PeriodData;today:string;selected:string;onSave:(entry:PeriodEntry)=>void;onClose:()=>void}) {
  const [start,setStart]=useState(entry?.start??(selected>today?today:selected));
  const [end,setEnd]=useState(entry?.end??'');
  const [error,setError]=useState('');
  function submit(event:FormEvent) {
    event.preventDefault(); const value={id:entry?.id??crypto.randomUUID(),start,end:end||undefined};
    const message=validatePeriod(value,data.periods,today);
    if(message) {setError(message);return;}
    onSave(value);
  }
  return <Modal title={entry?'修改经期记录':'记录经期'} onClose={onClose} className="period-dialog"><form onSubmit={submit}>
    <label>开始日期<input type="date" required value={start} max={today} onChange={e=>setStart(e.target.value)}/></label>
    <label>结束日期（进行中可留空）<input type="date" value={end} min={start} max={today} onChange={e=>setEnd(e.target.value)}/></label>
    <p>只填写真实发生的日期。流量、症状与心情在对应日期单独记录。</p>
    {error&&<p role="alert" className="error-message">{error}</p>}<button type="submit" className="period-primary">保存经期记录</button>
  </form></Modal>;
}
export function PeriodHistory({ data, onEdit, onRemove, onAdd, onClose }: {data:PeriodData;onEdit:(entry:PeriodEntry)=>void;onRemove:(id:string)=>void;onAdd:()=>void;onClose:()=>void}) {
  const [removing,setRemoving]=useState<string>();
  return <Modal title="历史经期记录" onClose={onClose} className="period-dialog"><button className="period-primary" onClick={onAdd}><Plus size={16}/>添加记录</button><ul className="period-history-list">{sortedPeriods(data.periods).reverse().map(entry=><li key={entry.id}><span>{entry.start} — {entry.end?shortDate(entry.end):'进行中'}</span><div><button aria-label={`修改 ${entry.start}`} onClick={()=>onEdit(entry)}><Pencil size={17}/></button><button aria-label={`删除 ${entry.start}`} onClick={()=>setRemoving(entry.id)}><Trash2 size={17}/></button></div>{removing===entry.id&&<div className="period-delete-confirm"><p>删除这次经期？日期日记会保留，预测将重新计算。</p><button onClick={()=>setRemoving(undefined)}>取消</button><button onClick={()=>{onRemove(entry.id);setRemoving(undefined);}}>确认删除</button></div>}</li>)}</ul>{!data.periods.length&&<p>还没有经期记录。</p>}</Modal>;
}
export function PeriodSettings({ data, today, onSave, onClose }: {data:PeriodData;today:string;onSave:(value:CycleSettings)=>void;onClose:()=>void}) {
  const [cycle,setCycle]=useState(data.settings.cycleLength),[period,setPeriod]=useState(data.settings.periodLength);
  const stats=cycleStats(data,today);
  return <Modal title="周期设置与预测规则" onClose={onClose} className="period-dialog"><form onSubmit={e=>{e.preventDefault();onSave({cycleLength:cycle,periodLength:period});}}><label>默认周期长度（天）<input type="number" required min={15} max={90} value={cycle} onChange={e=>setCycle(Number(e.target.value))}/></label><label>默认经期长度（天）<input type="number" required min={1} max={Math.min(15,cycle)} value={period} onChange={e=>setPeriod(Number(e.target.value))}/></label><p>这些值仅在历史记录不足时使用，初始 28 / 5 天是可修改的设置，不是你的统计数据。</p><p>平均周期：最近最多 6 个相邻经期开始日期的间隔，四舍五入。当前 {stats.cycleSamples} 个间隔。平均经期：最近最多 6 次已结束经期的天数（含首尾）。当前 {stats.periodSamples} 次。</p><p>下次经期 = 最近开始日期 + 平均周期；排卵日暂估为下次开始前 14 天；易孕期暂估为排卵前 5 天至后 1 天。只预测下一次，不自动生成真实记录；预测过期后请补充记录。</p><p>周期不规律、激素用药等情况可能使估算不准确。预测仅供记录参考，不用于避孕或医疗诊断。</p><button type="submit" className="period-primary">保存周期设置</button></form></Modal>;
}
