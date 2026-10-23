import { Bell, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Checkbox } from '../../components/Checkbox';
import { type PeriodReminder } from './model';
export function PeriodReminders({ values, onChange }: {values:PeriodReminder[];onChange:(values:PeriodReminder[])=>void}) {
  const [adding,setAdding]=useState(false),[text,setText]=useState('');
  return <section className="period-card period-reminders"><header><h2><Bell size={19}/>贴心提醒 <em>♡</em></h2><button aria-label="新建提醒" onClick={()=>setAdding(!adding)}><Plus size={20}/></button></header>
    {adding&&<form onSubmit={event=>{event.preventDefault();if(!text.trim())return;onChange([...values,{id:crypto.randomUUID(),text:text.trim(),completed:false}]);setText('');setAdding(false);}}><label htmlFor="period-reminder-input">给自己的小提醒</label><div><input id="period-reminder-input" autoFocus maxLength={120} value={text} onChange={e=>setText(e.target.value)} placeholder="例如：早点休息" required/><button className="period-primary" type="submit">添加</button></div></form>}
    {!values.length&&<p className="period-fine">还没有提醒，点右上角 +<br/>留一件照顾自己的小事。</p>}
    <ul>{values.map(item=><li key={item.id}><Checkbox checked={item.completed} label={`完成提醒：${item.text}`} onChange={()=>onChange(values.map(r=>r.id===item.id?{...r,completed:!r.completed}:r))}/><span className={item.completed?'done':''}>{item.text}</span><button aria-label={`删除提醒：${item.text}`} onClick={()=>onChange(values.filter(r=>r.id!==item.id))}><Trash2 size={16}/></button></li>)}</ul>
  </section>;
}
