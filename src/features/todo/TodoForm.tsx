import { useState, type FormEvent } from 'react';
import { CalendarDays } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import type { Todo } from '../../data/database';
import { Asset } from '../../components/Asset';
import { cardThemes, createSeed, decorationIdentity, resolveDecoration, reviseDecoration, stickerOptions, type TaskDecoration } from './decorations';
import { canonicalTime, DEFAULT_CATEGORY, defaultCategories, type Category } from '../../data/categories';
export function TodoForm({ todo, date, categories=defaultCategories, defaultCategoryId=DEFAULT_CATEGORY, onSave, onClose }: {
  todo: Todo | null; date: string; categories?:Category[];defaultCategoryId?:string; onSave: (text: string, date: string, id?: number, decoration?: TaskDecoration, favorite?: boolean, categoryId?:string,time?:string) => Promise<boolean>; onClose: () => void;
}) {
  const [text, setText] = useState(todo?.text ?? '');
  const [formDate, setFormDate] = useState(todo?.date ?? date);
  const [categoryId,setCategoryId]=useState(todo?.categoryId ?? defaultCategoryId);
  const [time,setTime]=useState(canonicalTime(todo?.time));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [favorite, setFavorite] = useState(todo?.favorite === true);
  const [decoration, setDecoration] = useState(() => resolveDecoration(todo?.text ?? '',
    todo ? todo.decoration : {seed: createSeed()}, todo ? decorationIdentity(todo) : undefined));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || !formDate || busy) return;
    setBusy(true);
    const saved = await onSave(text.trim(), formDate, todo?.id, reviseDecoration(text.trim(), decoration), favorite,categoryId,time);
    setBusy(false);
    if (saved) onClose();
    else setError('保存失败，请重试。输入内容仍保留在这里。');
  };
  return <Modal title={todo ? '编辑待办' : '新建待办'} onClose={onClose}><form onSubmit={submit}>
    <label className="field-label" htmlFor="todo-content">想做些什么？</label>
    <textarea id="todo-content" data-autofocus rows={3} maxLength={1000} placeholder="写下要做的事情…" value={text} onChange={event => setText(event.target.value)} required/>
    <label className="date-field"><span><CalendarDays size={17}/> 归属日期</span><input aria-label="归属日期" type="date" value={formDate} onChange={event => setFormDate(event.target.value)} required/></label>
    <div className="schedule-fields"><label>所属分类<select aria-label="所属分类" value={categoryId} onChange={event=>setCategoryId(event.target.value)}>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>时间（可选）<span className="time-input"><input aria-label="计划时间" type="time" value={time} onChange={event=>setTime(event.target.value)}/>{time&&<button type="button" aria-label="清除时间" onClick={()=>setTime('')}>清除</button>}</span></label></div>
    <button className="favorite-control" type="button" aria-pressed={favorite} onClick={() => setFavorite(value=>!value)}><Asset name="star"/>{favorite ? '已收藏这件小事' : '收藏这件小事'}</button>
    <details className="decoration-picker"><summary>贴纸与卡片配色</summary>
      <div className="decoration-sample" data-theme={decoration.theme} aria-label="装饰预览"><Asset name={reviseDecoration(text, decoration).illustrationId}/><span>{text.trim() || '一件值得记下的小事'}</span><Asset name={decoration.stickerId}/></div>
      <div className="sticker-options" role="group" aria-label="选择贴纸">{stickerOptions.map(option => <button key={option.id} type="button" aria-label={option.label} aria-pressed={decoration.stickerId === option.id} onClick={() => setDecoration(current=>({...current, stickerId: option.id}))}><Asset name={option.id}/></button>)}</div>
      <div className="theme-options" role="group" aria-label="选择卡片配色">{Object.entries(cardThemes).map(([theme,label]) => <button key={theme} type="button" data-theme={theme} aria-pressed={decoration.theme === theme} onClick={() => setDecoration(current=>({...current, theme: theme as TaskDecoration['theme']}))}>{label}</button>)}</div>
      <p>插画随标题匹配；纸张统一奶油底，配色用于小面积点缀。</p>
    </details>
    <Button className="todo-submit" type="submit" disabled={!text.trim() || !formDate || busy}>{busy ? '正在保存…' : '保存'}</Button>
    {error && <p className="error-message" role="alert">{error}</p>}
    <p className="form-note">一件小事，也值得认真记下来。</p>
  </form></Modal>;
}
