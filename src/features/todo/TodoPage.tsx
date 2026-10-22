import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Asset } from '../../components/Asset';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import type { Todo } from '../../data/database';
import { UndoToast } from './UndoToast';
import { CalendarPicker } from './CalendarPicker';
import { formatDate, shiftDate, todayKey, weekday } from './dates';
import { TodoCard } from './TodoCard';
import { TodoForm } from './TodoForm';
import { useTodos } from './useTodos';
import { CategoryManager } from './CategoryManager';
import { DEFAULT_CATEGORY } from '../../data/categories';

export type TodoStore = ReturnType<typeof useTodos>;
export type InitialDialog = 'add' | 'edit' | 'delete' | 'undo' | undefined;
type UndoRecord = { token: number; snapshot: Todo; label: string };

export default function TodoPage() {
  const store = useTodos();
  return <TodoView store={store}/>;
}

export function TodoView({ store, initialDialog }: { store: TodoStore; initialDialog?: InitialDialog }) {
  const [date, setDate] = useState(todayKey);
  const [view, setView] = useState<'date' | 'all'>('date');
  const [categoryId,setCategoryId]=useState('all');
  const [dialog, setDialog] = useState<'add' | 'edit' | 'delete' | 'calendar' | 'categories' | null>(
    initialDialog && initialDialog !== 'undo' ? initialDialog : null,
  );
  const [editing, setEditing] = useState<Todo | null>(store.todos[0] ?? null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [undo, setUndo] = useState<UndoRecord | null>(
    initialDialog === 'undo' && store.todos[0]?.id ? { token: 0, snapshot: {...store.todos[0],completed:false}, label: '完成一件小事啦' } : null,
  );
  const [deleting, setDeleting] = useState(false);
  const undoRef = useRef(undo);
  const sequence = useRef(0), undoBusy = useRef(false), alive = useRef(true);
  const scopedTodos=useMemo(()=>store.todos.filter(todo=>categoryId==='all'||(todo.categoryId??DEFAULT_CATEGORY)===categoryId),[store.todos,categoryId]);
  const dateTodos = useMemo(() => scopedTodos.filter(todo => todo.date === date), [scopedTodos, date]);
  const pending = useMemo(() => scopedTodos
    .filter(todo => !todo.completed && (view === 'all' || todo.date === date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt), [scopedTodos, date, view]);
  const completed = useMemo(() => (view === 'all' ? scopedTodos : dateTodos).filter(todo => todo.completed), [dateTodos, scopedTodos, view]);
  const categoryCount=(id:string)=>store.todos.filter(todo=>!todo.completed&&(view==='all'||todo.date===date)&&(id==='all'||(todo.categoryId??DEFAULT_CATEGORY)===id)).length;
  const totalForDate = dateTodos.length;
  const completedForDate = dateTodos.filter(todo => todo.completed).length;
  useEffect(() => { alive.current=true; return () => { alive.current=false; undoRef.current=null; }; }, []);
  useEffect(() => { window.dispatchEvent(new CustomEvent('cozy-card-open',{detail:null})); },[date,view,dialog]);
  useEffect(()=>{window.dispatchEvent(new CustomEvent('cozy-card-open',{detail:null}));if(categoryId!=='all'&&!store.loading&&!store.categories.some(c=>c.id===categoryId))setCategoryId('all');},[categoryId,store.categories,store.loading]);
  function remember(snapshot: Todo, label: string) {
    if (!alive.current) return;
    const record={token:++sequence.current,snapshot,label};
    undoRef.current=record; setUndo(record);
  }
  async function toggle(todo: Todo) {
    if (todo.id === undefined) return false;
    const snapshot=structuredClone(todo);
    const success = await store.complete(todo.id, !todo.completed);
    if (success) remember(snapshot,todo.completed ? '又放回小计划啦' : '完成一件小事啦');
    return success;
  }
  async function remove(todo: Todo) {
    if (todo.id === undefined) return false;
    const snapshot=structuredClone(todo);
    const success=await store.remove(todo.id);
    if (success) remember(snapshot,'哎呀点错了');
    return success;
  }
  async function undoOperation() {
    const record=undoRef.current;
    if (!record || undoBusy.current) return;
    undoBusy.current=true; undoRef.current=null; setUndo(null);
    const success=await store.restore(record.snapshot);
    undoBusy.current=false;
    if (!success && alive.current && !undoRef.current) remember(record.snapshot,record.label);
  }
  function openEdit(todo: Todo) { setEditing(todo); setDialog('edit'); }
  const selectDate = (value: string) => { undoRef.current=null; setUndo(null); setDate(value); setView('date'); setDialog(null); };

  return <>
    <header className="hero">
      <div className="hero-copy"><span className="eyebrow">COZY DAYS · 小饱日常</span>
        <h1>待办<Asset name="heart"/></h1><p>今天也辛苦啦，<br/>一件一件来就好。</p>
      </div>
      <div className="hero-art" aria-hidden="true"><Asset name="hero"/><Asset name="cat" className="hero-cat"/></div>
      <Asset name="sparkle" className="hero-sparkle"/>
      <Asset name="star" className="hero-star"/>
    </header>
    <section className="date-section" aria-label="日期与视图">
      <div className="date-row"><button className="date-button" aria-label="选择日期" onClick={() => setDialog('calendar')}>
        <span>{formatDate(date)}</span><span className="date-weekday">{weekday(date)}</span><ChevronDown size={16}/></button>
        <Button variant="soft" className="today-button" onClick={() => selectDate(todayKey())}><CalendarDays size={15}/>今天</Button>
      </div>
      <div className="date-navigation"><button className="icon-button" aria-label="前一天" onClick={() => selectDate(shiftDate(date, -1))}><ChevronLeft size={16}/></button>
        <span>{date === todayKey() ? '留一点时间，给喜欢的自己' : date.split('-').join(' / ')}</span>
        <button className="icon-button" aria-label="后一天" onClick={() => selectDate(shiftDate(date, 1))}><ChevronRight size={16}/></button>
      </div>
      <div className="view-tabs" role="group" aria-label="待办视图">
        <button className={view === 'date' ? 'active' : ''} aria-pressed={view === 'date'} onClick={() => setView('date')}>当前日期 <span>{dateTodos.filter(todo => !todo.completed).length}</span></button>
        <button className={view === 'all' ? 'active' : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>全部未完成 <span>{scopedTodos.filter(todo => !todo.completed).length}</span></button>
      </div>
      <div className="category-row"><div className="category-tabs" role="group" aria-label="任务分类">{[{id:'all',name:'全部'},...store.categories].map((category,index)=><button type="button" key={category.id} aria-label={`分类：${category.name}`} aria-pressed={categoryId===category.id} data-tone={index%4} onClick={()=>setCategoryId(category.id)}><span>{category.name}<small>{categoryCount(category.id)}</small></span></button>)}</div>
        <button type="button" className="category-add" aria-label="添加或管理分类" onClick={()=>setDialog('categories')}><Plus size={19}/></button></div>
    </section>
    <div className={`task-list-viewport ${pending.length||completed.length?'task-list-viewport--populated':''}`}>
    <section className={`task-area ${pending.length || completed.length ? 'task-area--populated' : ''}`} aria-label="待办列表">
      {store.error && <p className="error-message" role="alert">{store.error}</p>}
      {store.loading ? <p className="loading-message" role="status">正在翻开你的小日子…</p> : <>
        <div className="list-heading"><h2><Asset name="tape"/>{view === 'all' ? '每一件小事' : date === todayKey() ? '今天的小计划' : '这天的小计划'}</h2><span>{pending.length ? `${pending.length} 件待办` : '慢慢来，也很好'}</span></div>
        {pending.length > 0 ? <div className="task-list">{pending.map(todo => <TodoCard key={todo.id} todo={todo} showDate={view === 'all'} onToggle={toggle} onEdit={openEdit} onDelete={remove}/>)}</div>
          : <div className="empty-state"><div className="empty-art"><Asset name="flower" className="empty-flower"/><Asset name="empty"/><Asset name="star" className="empty-star"/></div><h2>{completed.length ? '太棒了，都完成啦！' : view === 'all' ? '还没有未完成的待办' : '今天，轻轻开始'}</h2>
            <p>{completed.length ? '去做点喜欢的事吧，休息也很重要。' : '把心里的小计划，放到这里吧。'}</p><Button variant="ghost" onClick={() => { setEditing(null); setDialog('add'); }}><Plus size={16}/>添加一件小事</Button></div>}
        {completed.length > 0 && <div className="completed-section"><button className="completed-heading" aria-expanded={completedOpen} onClick={() => setCompletedOpen(!completedOpen)}>
          <ChevronDown size={16} className={completedOpen ? '' : 'is-collapsed'}/><span>已完成</span><span className="completed-count">{completed.length}</span>
        </button>{completedOpen && completed.map(todo => <TodoCard key={todo.id} todo={todo} showDate={view === 'all'} onToggle={toggle} onEdit={openEdit} onDelete={remove}/>)}</div>}
        {totalForDate > 0 && view === 'date' && <div className="daily-progress" aria-label={`完成 ${completedForDate} / ${totalForDate}`}><span><Check size={13}/>已完成 {completedForDate} / {totalForDate}</span><div><i style={{ width: `${completedForDate / totalForDate * 100}%` }}/></div></div>}
      </>}
      <div className="list-footer" aria-hidden="true"><Asset name="book"/><span>小小的进步，也值得被记住。</span><Asset name="cherries"/></div>
    </section>
    <div className="task-bottom-fade" aria-hidden="true"/>
    </div>
    <button className="fab" aria-label="新增待办" onClick={() => { setEditing(null); setDialog('add'); }}><Plus size={32} strokeWidth={1.8}/></button>
    {undo && <UndoToast key={undo.token} label={undo.label} onUndo={()=>void undoOperation()} onExpire={()=>{
      if(undoRef.current?.token===undo.token){undoRef.current=null;setUndo(null);}
    }}/>}
    {(dialog === 'add' || dialog === 'edit') && <TodoForm todo={dialog === 'edit' ? editing : null} date={date} categories={store.categories} defaultCategoryId={categoryId==='all'?DEFAULT_CATEGORY:categoryId} onSave={store.save} onClose={() => setDialog(null)}/>}
    {dialog==='categories'&&<CategoryManager categories={store.categories} onSave={store.saveCategory} onRemove={store.removeCategory} onClose={()=>setDialog(null)}/>}
    {dialog === 'calendar' && <CalendarPicker value={date} onSelect={selectDate} onClose={() => setDialog(null)}/>}
    {dialog === 'delete' && editing && <Modal title="删除这件待办？" onClose={() => setDialog(null)}>
      <p className="delete-description">删除后无法恢复，要和这件小事告别吗？</p><div className="delete-preview">{editing.text}</div>
      <div className="confirm-actions"><Button variant="soft" onClick={() => setDialog(null)}>再想想</Button><Button variant="danger" disabled={deleting} onClick={async () => { if (editing.id === undefined) return; setDeleting(true); if (await remove(editing)) setDialog(null); setDeleting(false); }}>确认删除</Button></div>
    </Modal>}
  </>;
}
