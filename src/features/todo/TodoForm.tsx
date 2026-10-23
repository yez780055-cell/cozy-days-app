import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, ChevronDown, Clock, Star } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import type { Todo } from '../../data/database';
import { createSeed, decorationIdentity, resolveDecoration, reviseDecoration, type TaskDecoration } from './decorations';
import { canonicalTime, DEFAULT_CATEGORY, defaultCategories, type Category } from '../../data/categories';
import { isDateKey } from './dates';
import { CalendarPanel } from './CalendarPicker';
export function TodoForm({ todo, date, categories=defaultCategories, defaultCategoryId=DEFAULT_CATEGORY, onSave, onClose }: {
  todo: Todo | null; date: string; categories?:Category[];defaultCategoryId?:string; onSave: (text: string, date: string, id?: number, decoration?: TaskDecoration, favorite?: boolean, categoryId?:string,time?:string) => Promise<boolean>; onClose: () => void;
}) {
  const [text, setText] = useState(todo?.text ?? '');
  const [formDate, setFormDate] = useState(todo?.date ?? date);
  const [categoryId,setCategoryId]=useState(()=>categories.some(c=>c.id===(todo?.categoryId??defaultCategoryId)) ? (todo?.categoryId??defaultCategoryId) : (categories.find(c=>c.key==='生活')??categories[0])?.id??DEFAULT_CATEGORY);
  const [time,setTime]=useState(canonicalTime(todo?.time));
  const [panel,setPanel]=useState<'date'|'category'|'time'|null>(null);
  const [hour,setHour]=useState(canonicalTime(todo?.time).slice(0,2)||'09');
  const [minute,setMinute]=useState(canonicalTime(todo?.time).slice(3)||'00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [favorite, setFavorite] = useState(todo?.favorite === true);
  const [decoration] = useState(() => resolveDecoration(todo?.text ?? '',
    todo ? todo.decoration : {seed: createSeed()}, todo ? decorationIdentity(todo) : undefined));
  const previousPanel=useRef<typeof panel>(null);
  useEffect(()=>{
    if(panel){
      const element=document.getElementById('form-'+panel+'-panel');
      element?.querySelectorAll<HTMLElement>('.time-options [aria-pressed="true"]').forEach(button=>button.scrollIntoView({block:'nearest'}));
      element?.scrollIntoView({block:'nearest'});
    } else if(previousPanel.current) document.querySelector<HTMLElement>('[aria-controls="form-'+previousPanel.current+'-panel"]')?.focus();
    previousPanel.current=panel;
  },[panel]);
  const togglePanel=(value:typeof panel)=>{
    if(value==='time'&&canonicalTime(time)){setHour(canonicalTime(time).slice(0,2));setMinute(canonicalTime(time).slice(3));}
    setPanel(current=>current===value?null:value);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || !formDate || busy) return;
    if(!isDateKey(formDate)){setError('请从日历选择有效日期，或填写 YYYY-MM-DD。');return;}
    if(time&&!canonicalTime(time)){setError('时间请填写为 00:00–23:59，或从面板选择。');return;}
    setBusy(true);
    const saved = await onSave(text.trim(), formDate, todo?.id, reviseDecoration(text.trim(), decoration), favorite,categoryId,time);
    setBusy(false);
    if (saved) onClose();
    else setError('保存失败，请重试。输入内容仍保留在这里。');
  };
  return <Modal title={todo ? '编辑待办' : '新建待办'} onClose={onClose} headerAction={<button className="favorite-star" type="button" aria-label={favorite?'已收藏这件小事':'收藏这件小事'} aria-pressed={favorite} onClick={()=>setFavorite(value=>!value)}><Star size={22} fill={favorite?'currentColor':'none'}/></button>}><form onSubmit={submit}>
    <label className="field-label" htmlFor="todo-content">想做些什么？</label>
    <textarea id="todo-content" data-autofocus rows={3} maxLength={1000} placeholder="写下要做的事情…" value={text} onChange={event => setText(event.target.value)} required/>
    <div className="form-date"><label className="field-label" htmlFor="form-date">归属日期</label><div className="date-entry"><input id="form-date" aria-label="归属日期" type="text" inputMode="numeric" value={formDate} onChange={event=>setFormDate(event.target.value)} placeholder="YYYY-MM-DD"/><button className="paper-select" type="button" aria-label="选择归属日期" aria-expanded={panel==='date'} aria-controls="form-date-panel" onClick={()=>togglePanel('date')}><CalendarDays size={17}/><ChevronDown size={16}/></button></div></div>
    {panel==='date'&&<div id="form-date-panel" className="paper-panel" role="group" aria-label="归属日期日历"><CalendarPanel key={formDate} value={isDateKey(formDate)?formDate:date} onSelect={value=>{setFormDate(value);setPanel(null);}}/></div>}
    <div className="schedule-fields"><div><span className="field-label">所属分类</span><button className="paper-select" type="button" aria-label="所属分类" aria-expanded={panel==='category'} aria-controls="form-category-panel" onClick={()=>togglePanel('category')}><span>{categories.find(c=>c.id===categoryId)?.name??'生活'}</span><ChevronDown size={16}/></button></div>
      <div><label className="field-label" htmlFor="planned-time">时间（可选）</label><span className="time-input"><input id="planned-time" aria-label="计划时间" type="text" inputMode="numeric" placeholder="不设时间" maxLength={5} value={time} onChange={event=>setTime(event.target.value)}/><button type="button" aria-label="选择时间" aria-expanded={panel==='time'} aria-controls="form-time-panel" onClick={()=>togglePanel('time')}><Clock size={17}/></button></span></div></div>
    {panel==='category'&&<div id="form-category-panel" className="paper-panel category-options" role="group" aria-label="选择所属分类">{categories.map(category=><button type="button" key={category.id} aria-pressed={category.id===categoryId} onClick={()=>{setCategoryId(category.id);setPanel(null);}}>{category.name}</button>)}</div>}
    {panel==='time'&&<div id="form-time-panel" className="paper-panel" role="group" aria-label="选择计划时间"><div className="time-columns">{(['时','分'] as const).map((label,column)=><div key={label}><strong>{label}</strong><div className="time-options" role="group" aria-label={label}>{Array.from({length:column===0?24:60},(_,i)=>String(i).padStart(2,'0')).map(value=><button key={value} type="button" aria-pressed={(column===0?hour:minute)===value} onClick={()=>column===0?setHour(value):setMinute(value)}>{value}</button>)}</div></div>)}</div><Button type="button" variant="soft" onClick={()=>{setTime(hour+':'+minute);setPanel(null);}}>确定时间</Button></div>}
    {time&&<button className="clear-time" type="button" onClick={()=>{setTime('');setPanel(null);}}>清除时间</button>}
    <Button className="todo-submit" type="submit" disabled={!text.trim() || !formDate || busy}>{busy ? '正在保存…' : '保存'}</Button>
    {error && <p className="error-message" role="alert">{error}</p>}
    <p className="form-note">一件小事，也值得认真记下来。</p>
  </form></Modal>;
}
