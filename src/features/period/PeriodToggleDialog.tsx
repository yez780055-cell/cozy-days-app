import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import type { TogglePlan } from './periodToggle';

export function PeriodToggleDialog({plan,date,today,onClose,onConfirm}:{plan:Extract<TogglePlan,{kind:'confirm-truncate'|'require-end'}>;date:string;today:string;onClose:()=>void;onConfirm:(end?:string)=>Promise<string|undefined>}) {
  const [end,setEnd]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  async function submit(e:FormEvent) {
    e.preventDefault();setSaving(true);
    const message=await onConfirm(plan.kind==='require-end'?end:undefined);
    setSaving(false);if(message)setError(message);else onClose();
  }
  return <Modal title={plan.kind==='require-end'?'补录历史经期':'确认取消经期标记'} onClose={onClose} canClose={()=>!saving} className="period-dialog"><form onSubmit={submit}>
    {plan.kind==='require-end'?<><p>已有后续经期，为保护近期记录，请先填写本次结束日期。相邻记录分别保留，不自动合并。</p><p>开始日期：{date}</p><label>本次结束日期<input type="date" required min={date} max={today} disabled={saving} value={end} onChange={e=>setEnd(e.target.value)}/></label></>:<p>将取消 {plan.from} 至 {plan.through} 的真实经期标记，原区间从所选日期起的后续标记都会移除。流量、症状与心情日记均保留。</p>}
    {error&&<p role="alert">{error}</p>}<button type="button" disabled={saving} onClick={onClose}>取消</button><button type="submit" disabled={saving} className="period-primary">{plan.kind==='require-end'?'保存补录经期':'确认取消标记'}</button>
  </form></Modal>;
}
