import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { todoBaseline, type Todo } from '../../data/database';
import { equalValue } from '../../data/cloudTypes';
import { UndoToast } from './UndoToast';
import { CalendarPicker } from './CalendarPicker';
import { formatDate, isDateKey, shiftDate, todayKey, weekday } from './dates';
import { TodoCard } from './TodoCard';
import { TodoForm } from './TodoForm';
import { useTodos } from './useTodos';
import { CategoryManager } from './CategoryManager';
import { DEFAULT_CATEGORY, defaultCategories } from '../../data/categories';
import { TodoWeek } from './TodoWeek';
import './todo.css';

export type TodoStore = Omit<ReturnType<typeof useTodos>, 'saveError'> & { saveError?: string };
export type InitialDialog = 'add' | 'edit' | 'delete' | 'undo' | undefined;
type UndoRecord = { token: number; snapshot: Todo; label: string; kind: 'toggle'|'delete'; expiresAt: number; undone?: boolean };

export default function TodoPage({initialDialog,initialAll=false}:{initialDialog?:InitialDialog;initialAll?:boolean}) {
  const store = useTodos();
  return <TodoView store={store} initialDialog={initialDialog} initialAll={initialAll}/>;
}

export function TodoView({ store, initialDialog, initialAll=false }: { store: TodoStore; initialDialog?: InitialDialog; initialAll?: boolean }) {
  const [date, setDate] = useState(todayKey);
  const [view, setView] = useState<'date' | 'all'>(initialAll?'all':'date');
  const [categoryId,setCategoryId]=useState('all');
  const [dialog, setDialog] = useState<'add' | 'edit' | 'delete' | 'calendar' | 'categories' | null>(
    initialDialog && initialDialog !== 'undo' ? initialDialog : null,
  );
  const [editing, setEditing] = useState<Todo | null>(store.todos[0] ?? null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [undos, setUndos] = useState<UndoRecord[]>(
    initialDialog === 'undo' && store.todos[0]?.id ? [{ token: 0, snapshot: {...store.todos[0],completed:false}, label: '已完成待办', kind:'toggle', expiresAt:Date.now()+5000 }] : [],
  );
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = useRef<(() => Promise<boolean>) | null>(null);
  const undoRef = useRef(undos);
  const history = useRef<UndoRecord[]>([...undos]);
  // Undo compares against our own last result, never a later refreshed view.
  const undoExpected = useRef(new Map<number, Todo | null>(undos.flatMap(record =>
    record.snapshot.id === undefined ? [] : [[record.snapshot.id, {...record.snapshot, completed: !record.snapshot.completed}] as const])));
  const sequence = useRef(0), undoBusy = useRef(new Set<number>()), alive = useRef(true);
  const scopedTodos=useMemo(()=>store.todos.filter(todo=>categoryId==='all'||(todo.categoryId??DEFAULT_CATEGORY)===categoryId),[store.todos,categoryId]);
  const dateTodos = useMemo(() => scopedTodos.filter(todo => todo.date === date), [scopedTodos, date]);
  const pending = useMemo(() => scopedTodos
    .filter(todo => !todo.completed && (view === 'all' || todo.date === date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt), [scopedTodos, date, view]);
  const completed = useMemo(() => (view === 'all' ? scopedTodos : dateTodos).filter(todo => todo.completed), [dateTodos, scopedTodos, view]);
  const categoryCount=(id:string)=>store.todos.filter(todo=>!todo.completed&&(view==='all'||todo.date===date)&&(id==='all'||(todo.categoryId??DEFAULT_CATEGORY)===id)).length;
  const totalForDate = dateTodos.length;
  const completedForDate = dateTodos.filter(todo => todo.completed).length;
  useEffect(() => { alive.current=true; return () => { alive.current=false; undoRef.current=[]; }; }, []);
  useEffect(() => { window.dispatchEvent(new CustomEvent('cozy-card-open',{detail:null})); },[date,view,dialog]);
  useEffect(()=>{window.dispatchEvent(new CustomEvent('cozy-card-open',{detail:null}));if(categoryId!=='all'&&!store.loading&&!store.categories.some(c=>c.id===categoryId))setCategoryId('all');},[categoryId,store.categories,store.loading]);
  function remember(snapshot: Todo, label: string, kind: UndoRecord['kind']) {
    if (!alive.current) return;
    const record={token:++sequence.current,snapshot,label,kind,expiresAt:Date.now()+10000};
    history.current.push(record);
    undoRef.current=[...undoRef.current,record]; setUndos(undoRef.current);
  }
  async function toggle(todo: Todo) {
    if (todo.id === undefined) return false;
    const snapshot=todoBaseline(todo);
    const success = await store.complete(todo.id, !todo.completed, snapshot);
    if (success) {
      undoExpected.current.set(todo.id, {...snapshot, completed: !todo.completed});
      remember(snapshot,todo.completed ? '已恢复待办' : '已完成待办','toggle');
    }
    return success;
  }
  async function remove(todo: Todo) {
    if (todo.id === undefined) return false;
    const snapshot=todoBaseline(todo);
    const success=await store.remove(todo.id, snapshot);
    if (success) {
      undoExpected.current.set(todo.id, null);
      remember(snapshot,'已删除待办','delete');
    }
    return success;
  }
  function expire(token:number) {
    undoRef.current=undoRef.current.filter(record=>record.token!==token);
    setUndos(undoRef.current);
    // Expired operations remain committed while another undo for the task is live.
    const liveIds=new Set(undoRef.current.map(record=>record.snapshot.id));
    if(!undoBusy.current.size) {
      history.current=history.current.filter(record=>liveIds.has(record.snapshot.id));
      for (const id of undoExpected.current.keys()) if (!liveIds.has(id)) undoExpected.current.delete(id);
    }
  }
  async function undoOperation(token:number) {
    const record=undoRef.current.find(record=>record.token===token);
    if (!record || Date.now()>=record.expiresAt || undoBusy.current.size) return;
    undoBusy.current.add(token);
    // Replay this task's surviving operations. Undoing an earlier completion must
    // not resurrect a later deletion or overwrite a later restore.
    const operations=history.current.filter(item=>item.snapshot.id===record.snapshot.id);
    let target:Todo|null=operations[0].snapshot;
    for(const item of operations) {
      if(item.undone || item.token===token) continue;
      target=item.kind==='delete'?null:{...item.snapshot,completed:!item.snapshot.completed};
    }
    const id=record.snapshot.id!;
    if (!undoExpected.current.has(id)) { undoBusy.current.delete(token); return; }
    const expected=undoExpected.current.get(id)!;
    let restored: Todo | undefined;
    const success=target===null ? (expected === null || await store.remove(id, expected))
      : expected !== null ? await store.complete(id,target.completed,expected)
      : await store.restore({...record.snapshot,completed:target.completed}, row => { restored = row; });
    if(success) {
      if (target === null) undoExpected.current.set(id, null);
      else if (expected !== null) undoExpected.current.set(id, {...expected, completed: target.completed});
      else if (restored) undoExpected.current.set(id, restored);
      else undoExpected.current.delete(id); // A preview store supplied no committed row.
      record.undone=true;expire(token);
    }
    undoBusy.current.delete(token);
  }
  function reassignedCategories(changes: { before: Todo; after: Todo }[]) {
    for (const {before, after} of changes) {
      if (before.id === undefined) continue;
      const expected = undoExpected.current.get(before.id);
      if (expected && equalValue(expected, before)) undoExpected.current.set(before.id, after);
    }
  }
  function openEdit(todo: Todo) { setEditing(todo); setDialog('edit'); }
  function openDelete(todo: Todo, confirm: () => Promise<boolean>) {
    confirmDelete.current = confirm;
    setEditing(todo);
    setDialog('delete');
  }
  function closeDelete() {
    confirmDelete.current = null;
    setDialog(null);
  }
  const selectDate = (value: string) => {
    if (!isDateKey(value)) return;
    setDate(value);
    setView('date');
    setDialog(null);
  };
  const today = todayKey();
  const previous = shiftDate(date, -1);
  const next = shiftDate(date, 1);
  const categoryNames = new Map((store.categories.length ? store.categories : defaultCategories).map(category => [category.id, category.name]));
  const renderRow = (todo: Todo) => <TodoCard key={todo.id} todo={todo}
    category={categoryNames.get(todo.categoryId ?? DEFAULT_CATEGORY) ?? categoryNames.get(DEFAULT_CATEGORY) ?? '生活'}
    showDate={view === 'all'} onToggle={toggle} onEdit={openEdit} onDelete={remove} onRequestDelete={openDelete}/>;

  return <>
    <section className="todo-page" aria-label="待办页面">
      <header className="todo-heading">
        <div><p>{weekday(date)} · {formatDate(date)}</p><h1>待办</h1></div>
        <Button aria-label="新增待办" onClick={() => { setEditing(null); setDialog('add'); }}><Plus size={20} strokeWidth={1.7}/>新增</Button>
      </header>
      <div className="task-area">
        <section className="date-section" aria-label="日期与视图">
          <div className="todo-month">
            <strong>{Number(date.slice(0, 4))} 年 {Number(date.slice(5, 7))} 月</strong>
            <div>
              <button type="button" className="icon-button" aria-label="前一天" disabled={!isDateKey(previous)} onClick={() => selectDate(previous)}><ChevronLeft size={20}/></button>
              <button type="button" className="icon-button" aria-label="后一天" disabled={!isDateKey(next)} onClick={() => selectDate(next)}><ChevronRight size={20}/></button>
              <button type="button" className="icon-button" aria-label="选择日期" onClick={() => setDialog('calendar')}><CalendarDays size={20}/></button>
            </div>
          </div>
          <TodoWeek date={date} today={today} followsDate={view === 'date'} onSelect={selectDate}/>
          <div className="todo-view-controls">
            <div className="todo-views" role="group" aria-label="待办视图">
              <Button variant="soft" aria-pressed={view === 'date'} onClick={() => setView('date')}>当前日期 <small>{dateTodos.filter(todo => !todo.completed).length}</small></Button>
              <Button variant="soft" aria-pressed={view === 'all'} onClick={() => setView('all')}>全部未完成 <small>{scopedTodos.filter(todo => !todo.completed).length}</small></Button>
            </div>
            <Button variant="ghost" onClick={() => selectDate(today)}>今天</Button>
          </div>
          <div className="category-row">
            <div className="category-tabs" role="group" aria-label="任务分类">
              {[{id:'all',name:'全部'}, ...store.categories].map(category =>
                <Button key={category.id} variant="soft" aria-label={`分类：${category.name}`}
                  aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>
                  {category.name}<small>{categoryCount(category.id)}</small>
                </Button>
              )}
            </div>
            <button type="button" className="icon-button" aria-label="添加或管理分类" onClick={() => setDialog('categories')}><Plus size={20}/></button>
          </div>
        </section>
        <section aria-label="待办列表">
          {store.error && <p className="error-message" role="alert">{store.error}</p>}
          {store.saveStatus && !store.error && <p className="todo-save-status" role="status">{store.saveStatus}</p>}
          {store.loading ? <p className="loading-message" role="status">正在读取待办…</p> : <>
            <div className="list-heading"><h2>{view === 'all' ? '全部未完成' : date === today ? '今天要做' : '当天待办'}</h2><span>{pending.length}</span></div>
            {pending.length > 0 ? <div className="task-list">{pending.map(renderRow)}</div>
              : <p className="todo-empty">{view === 'all' ? '还没有未完成的待办' : '这一天的清单是空的。'}</p>}
            {completed.length > 0 && <div className="completed-section">
              <button type="button" className="completed-heading" aria-expanded={completedOpen} onClick={() => setCompletedOpen(!completedOpen)}>
                <span>{view === 'all' ? '已完成（可恢复）' : '已完成'}</span><ChevronDown size={16} className={completedOpen ? '' : 'is-collapsed'}/>{' '}<span>{completed.length}</span>
              </button>
              {completedOpen && completed.map(renderRow)}
            </div>}
            {totalForDate > 0 && view === 'date' && <div className="daily-progress">
              <span>已完成 {completedForDate} / {totalForDate}</span>
              <progress aria-label={`完成 ${completedForDate} / ${totalForDate}`} value={completedForDate} max={totalForDate}/>
            </div>}
          </>}
        </section>
      </div>
      <div className="undo-stack" aria-label="操作撤销" data-count={undos.length}>{undos.map(record=><UndoToast key={record.token} label={record.label} task={record.snapshot.text} expiresAt={record.expiresAt} onUndo={()=>void undoOperation(record.token)} onExpire={()=>expire(record.token)}/>)}</div>
    </section>
    {(dialog === 'add' || dialog === 'edit') && <TodoForm todo={dialog === 'edit' ? editing : null} date={date} categories={store.categories} defaultCategoryId={categoryId==='all'?DEFAULT_CATEGORY:categoryId} onSave={store.save} saveError={store.saveError} onClose={() => setDialog(null)}/>}
    {dialog==='categories'&&<CategoryManager categories={store.categories} onSave={store.saveCategory} onRemove={id => store.removeCategory(id, reassignedCategories)} onClose={()=>setDialog(null)}/>}
    {dialog === 'calendar' && <CalendarPicker value={date} onSelect={selectDate} onClose={() => setDialog(null)}/>}
    {dialog === 'delete' && editing && <Modal title="删除这件待办？" layout="confirm" canClose={() => !deleting} onClose={closeDelete}>
      <p className="todo-delete-preview">「{editing.text}」将从列表移除。删除后可在提示栏撤销。</p>
      {store.error && <p className="error-message" role="alert">{store.error}</p>}
      <div className="confirm-actions"><Button variant="soft" disabled={deleting} data-autofocus onClick={closeDelete}>取消</Button><Button variant="danger" disabled={deleting} onClick={async () => {
        setDeleting(true);
        const success = await (confirmDelete.current?.() ?? remove(editing));
        setDeleting(false);
        if (success) closeDelete();
      }}>确认删除</Button></div>
    </Modal>}
  </>;
}
