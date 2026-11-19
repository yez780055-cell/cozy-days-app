import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Camera, LayoutGrid, List, Menu, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Asset } from '../../components/Asset';
import { anniversaryRepository } from '../../data/database';
import { dateKey, nextImportantDate, resolvedTimingMode, timing, timingModes, type Anniversary } from './model';
import { PhotoEditor } from './PhotoEditor';
import { AnniversaryArt } from './AnniversaryArt';
import './anniversary.css';
const filters = ['全部', '即将到来', '累计中', '已过去'] as const;
const timingLabels = { countdown: '倒计时', cumulative: '累计天数' };
const listOrder = { today: 0, upcoming: 0, cumulative: 1, past: 2 };
const timingPrefix = { today: '', upcoming: '还有', cumulative: '累计', past: '已过去' };
const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function eventType(row: Anniversary) {
  if (row.theme === '生日') return '生日';
  return row.yearly && (row.theme === '恋爱' || resolvedTimingMode(row) === 'cumulative') ? '周年' : row.theme;
}

function DateTicket({ row }: { row: Anniversary }) {
  const type = eventType(row);
  const tone = type === '生日' ? ' ann-ticket--birthday' : type === '周年' ? ' ann-ticket--yearly' : '';
  return <time className={`ann-ticket${tone}`} dateTime={row.date}>
    <span>{monthNames[Number(row.date.slice(5, 7)) - 1]}</span><b>{row.date.slice(8)}</b>
  </time>;
}

function newAnniversary(date: string): Anniversary {
  const now = Date.now();
  return { name: '', date, theme: '生活', note: '', icon: '♡', yearly: true, color: 'pink', createdAt: now, updatedAt: now };
}

function AnniversaryForm({ value, onSave, busy, onDirty }: { value: Anniversary; onSave: (value: Anniversary) => Promise<void>; busy: boolean; onDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { onDirty(JSON.stringify(draft) !== JSON.stringify(value)); }, [draft, value, onDirty]);
  const mode = resolvedTimingMode(draft);
  function submit(event: FormEvent) { event.preventDefault(); void onSave({ ...draft, timingMode: mode }); }
  return <form className="ann-form" onSubmit={submit}>
    <label>纪念日名称<input data-autofocus aria-label="纪念日名称" required maxLength={60} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="输入名称"/></label>
    <div className="ann-fields">
      <label>日期<input aria-label="日期" type="date" required min="1000-01-01" max="9999-12-31" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })}/></label>
      <label>计时方式<select value={mode} onChange={e => setDraft({ ...draft, timingMode: e.target.value as Anniversary['timingMode'] })}>{timingModes.map(value => <option key={value} value={value}>{timingLabels[value]}</option>)}</select></label>
    </div>
    <label className="ann-repeat">每年重复<input type="checkbox" checked={draft.yearly} onChange={e => setDraft({ ...draft, yearly: e.target.checked })}/></label>
    <label>备注 <span className="ann-field-note" aria-hidden="true">选填</span><textarea aria-label="备注" rows={2} maxLength={500} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })}/></label>
    <footer className="modal-actions"><Button type="submit" disabled={busy || !draft.name.trim()}>{busy ? '正在保存…' : '保存纪念日'}</Button></footer>
  </form>;
}

export default function AnniversaryPage({initialAdd=false}:{initialAdd?:boolean}) {
  const [rows, setRows] = useState<Anniversary[]>([]);
  const [today, setToday] = useState(dateKey());
  const [filter, setFilter] = useState<typeof filters[number]>('全部');
  const [query, setQuery] = useState('');
  const [grid, setGrid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const pageScroll = useRef<HTMLElement>(null);
  const libraryScroll = useRef(0);
  const [editor, setEditor] = useState<Anniversary | null>(() => initialAdd ? newAnniversary(dateKey()) : null);
  const [detailId, setDetailId] = useState<number>();
  const [photoOpen, setPhotoOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [deleting, setDeleting] = useState<Anniversary | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mutationPending = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  useLayoutEffect(() => {
    if (pageScroll.current) pageScroll.current.scrollTop = detailId === undefined ? libraryScroll.current : 0;
  }, [detailId]);
  useEffect(() => {
    let mounted = true;
    void anniversaryRepository.all().then(data => { if (mounted) { setRows(data); setLoaded(true); } }).catch(() => { if (mounted) setError('暂时无法读取收藏，请重新读取或重新进入纪念日页面重试。'); });
    const update = () => setToday(dateKey());
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update); document.addEventListener('visibilitychange', update);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  async function refresh(committed?: '保存' | '删除') {
    setRefreshing(true);
    try { setRows(await anniversaryRepository.all()); setLoaded(true); setError(''); }
    catch { setError(committed ? `已${committed}，但暂时无法刷新收藏。请重新读取，无需重复${committed}。` : '暂时无法读取收藏，请重新读取或重新进入纪念日页面重试。'); }
    finally { setRefreshing(false); }
  }
  async function save(value: Anniversary) {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setBusy(true); setError(''); setSaveStatus('正在保存…');
    try {
      const saved = await anniversaryRepository.save(value);
      // A committed write remains successful even if the following read fails.
      setRows(current => [...current.filter(row => row.id !== saved.id), saved]);
      setEditor(null);
      setEditorDirty(false);
      setSaveStatus('已保存');
      await refresh('保存');
    }
    catch { setSaveStatus(''); setError('保存失败，请检查名称和日期后重试。'); }
    finally { mutationPending.current = false; setBusy(false); }
  }
  async function savePhoto(value:Anniversary) {
    if (mutationPending.current) return;
    mutationPending.current = true; setBusy(true); setError('');
    try {
      const saved = await anniversaryRepository.save(value);
      setRows(current => current.map(row => row.id === saved.id ? saved : row));
      setPhotoOpen(false);
    } catch { setError('图片保存失败，请重试。'); }
    finally { mutationPending.current = false; setBusy(false); }
  }
  async function remove() {
    if (deleting?.id === undefined || mutationPending.current) return;
    mutationPending.current = true;
    setBusy(true); setError('');
    try {
      await anniversaryRepository.remove(deleting.id);
      setRows(current => current.filter(row => row.id !== deleting.id));
      setDetailId(undefined);
      setDeleting(null);
      await refresh('删除');
    }
    catch { setError('删除失败，你的收藏仍在，请重试。'); }
    finally { mutationPending.current = false; setBusy(false); }
  }
  function create() { setError(''); setEditor(newAnniversary(today)); }
  function openDetail(row: Anniversary) {
    libraryScroll.current = pageScroll.current?.scrollTop ?? 0;
    setError('');
    setDetailId(row.id);
  }
  function closeMenu() { setMenuOpen(false); menuButton.current?.focus(); }
  const sorted = rows.map(row => ({ row, status: timing(row, today) })).sort((a, b) => {
    const group = listOrder[a.status.kind] - listOrder[b.status.kind];
    const age = a.status.kind === 'cumulative'
      ? b.row.date.localeCompare(a.row.date)
      : a.status.kind === 'past' ? b.status.days - a.status.days : a.status.days - b.status.days;
    return group || age || a.row.createdAt - b.row.createdAt;
  });
  const search = query.trim().toLocaleLowerCase();
  const visible = sorted.filter(({ row, status }) => {
    const group = status.kind === 'cumulative' ? '累计中' : status.kind === 'past' ? '已过去' : '即将到来';
    return (filter === '全部' || filter === group) && [row.name, row.note, row.theme, row.date, status.occurrence]
      .some(value => value.toLocaleLowerCase().includes(search));
  });
  const detail = rows.find(row => row.id === detailId);
  const detailTiming = detail && timing(detail, today);
  const featured = nextImportantDate(rows, today);
  const loadError = error && !photoOpen && !editor && !deleting && <div className="ann-feedback">
    <p role="alert" className="error-message">{error}</p>
    <Button variant="soft" disabled={refreshing || busy} onClick={() => void refresh()}>{refreshing ? '正在读取…' : '重新读取收藏'}</Button>
  </div>;
  return <>
    {detail && detailTiming ? <section ref={pageScroll} className="ann-page ann-detail" aria-label="纪念日详情">
      <header className="ann-detail-header">
        <button type="button" className="icon-button" aria-label="返回纪念日列表" onClick={() => setDetailId(undefined)}><ArrowLeft size={20}/></button>
        <button type="button" className="icon-button" aria-label="编辑纪念日" onClick={() => {
          setError(''); setEditor({ ...detail, timingMode: resolvedTimingMode(detail) });
        }}><Pencil size={20}/></button>
      </header>
      <AnniversaryArt image={detail.backgroundImage} x={detail.backgroundX} y={detail.backgroundY}/>
      <div className="ann-detail-meta">
        <p>{eventType(detail)} · {detail.yearly ? '每年重复' : '单次纪念'}</p>
        <p>{resolvedTimingMode(detail) === 'cumulative' && detailTiming.occurrence === detail.date ? '起始日期' : '纪念日期'} · <time dateTime={detailTiming.occurrence}>{detailTiming.occurrence}</time></p>
        {detailTiming.occurrence !== detail.date && <p>起始日期 · <time dateTime={detail.date}>{detail.date}</time></p>}
      </div>
      <h1>{detail.name}</h1>
      <dl className="ann-numbers">
        <div>
          <dt>{detailTiming.kind === 'today' ? '纪念日' : timingPrefix[detailTiming.kind]}</dt>
          <dd aria-label={detailTiming.label}>
            {detailTiming.kind === 'today' ? <strong>今天</strong> : <><strong>{Math.abs(detailTiming.days)}</strong> 天</>}
          </dd>
        </div>
        {detail.yearly && detail.date <= today && <div>
          <dt>已满</dt><dd><strong>{detailTiming.years}</strong> 周年</dd>
        </div>}
      </dl>
      {detail.note && <p className="ann-detail-note">{detail.note}</p>}
      {loadError}
      <div className="ann-detail-actions">
        <Button variant="soft" onClick={() => {setError('');setPhotoOpen(true);}}><Camera size={18}/> {detail.backgroundImage ? '更换或调整背景' : '添加背景图片'}</Button>
        <Button variant="ghost" className="ann-destructive-link" onClick={() => {setError('');setDeleting(detail);}}><Trash2 size={17}/>删除纪念日</Button>
      </div>
    </section> : <section ref={pageScroll} className="ann-page ann-library" aria-label="纪念日收藏">
      <header className="ann-bar">
        <div className="ann-title"><p>我们的收藏</p><h1>纪念日</h1></div>
        <div className="ann-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false); }}
          onKeyDown={event => { if (menuOpen && event.key === 'Escape') closeMenu(); }}>
          <button ref={menuButton} className="icon-button" type="button" aria-label="纪念日菜单" aria-controls="ann-menu-options" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Menu size={20}/></button>
          <div id="ann-menu-options" className="ann-menu-options" hidden={!menuOpen} aria-label="纪念日筛选">
            {filters.map(name => <Button key={name} variant="ghost" aria-pressed={filter === name} onClick={() => { setFilter(name); closeMenu(); }}>{name}</Button>)}
          </div>
        </div>
        <button type="button" className="icon-button" aria-label="新增纪念日" disabled={!loaded} onClick={create}><Plus size={20}/></button>
      </header>
      {featured ? <button type="button" className="ann-featured" onClick={() => openDetail(featured.row)}>
        <span className="ann-featured-meta">{featured.days === 0 ? '今天' : '即将到来'} · {eventType(featured.row)}</span>
        <strong className="ann-featured-title">{featured.title}</strong>
        <span className="ann-featured-count">
          {featured.days === 0 ? <strong className="ann-today">今天</strong> : <><strong>{featured.days}</strong><small> 天后</small></>}
        </span>
        <time dateTime={featured.occurrence}>{featured.occurrence.replace(/-/g, ' / ')}</time>
        {featured.row.backgroundImage
          ? <AnniversaryArt image={featured.row.backgroundImage} x={featured.row.backgroundX} y={featured.row.backgroundY}/>
          : <Asset name="empty" className="ann-featured-cats"/>}
      </button> : loaded && <div className="ann-featured-empty">
        <p>{rows.length ? '近期没有重要日子' : '还没有纪念日'}</p>
        {!rows.length && <Button variant="soft" onClick={create}>添加纪念日</Button>}
      </div>}
      <section className="ann-content" aria-labelledby="ann-collection">
        <header className="ann-list-heading"><h2 id="ann-collection">收藏的日子</h2><span>{visible.length}</span></header>
        {saveStatus && !error && <p className="ann-visually-hidden" role="status">{saveStatus}</p>}
        <div className="ann-tools">
          <label className="ann-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="搜索纪念日" placeholder="搜索纪念日" value={query} onChange={event => setQuery(event.target.value)}/></label>
          <button type="button" className="icon-button" aria-label="网格视图" aria-pressed={grid} onClick={() => setGrid(!grid)}>{grid ? <List size={20}/> : <LayoutGrid size={20}/>}</button>
        </div>
        {filter !== '全部' && <Button variant="soft" className="ann-filter-clear" aria-label={`清除筛选：${filter}`} onClick={() => setFilter('全部')}>{filter} ×</Button>}
        <div className={`ann-list${grid ? ' ann-grid' : ''}`} aria-live="polite">
          {!loaded && !error && <p className="ann-empty">正在读取纪念日…</p>}
          {loaded && !visible.length && (search || filter !== '全部') && <p className="ann-empty">没有符合条件的纪念日</p>}
          {visible.map(({ row, status }) =>
            <article key={row.id} data-testid="anniversary-card" className="ann-card">
              <button type="button" className="ann-card-main" aria-label={`查看详情：${row.name}`} aria-description={status.label} onClick={() => openDetail(row)}>
                <DateTicket row={row}/>
                <span className="ann-card-copy">
                  <strong>{row.name}</strong>
                  <small>{eventType(row)} · {row.yearly ? '每年' : '单次'}</small>
                </span>
                <small className="ann-count">{status.label}</small>
              </button>
            </article>
          )}
        </div>
        {loadError}
      </section>
    </section>}
    {photoOpen && detail && <PhotoEditor value={detail} busy={busy} error={error} onClose={() => setPhotoOpen(false)} onSave={savePhoto}/>}
    {editor && <Modal title={editor.id === undefined ? '新增纪念日' : '编辑纪念日'} className="ann-modal ann-editor" closeText="取消"
      dirty={editorDirty} canClose={() => !mutationPending.current} onClose={() => {setEditor(null);setEditorDirty(false);}}>
      {error && <p role="alert" className="error-message">{error}</p>}
      <AnniversaryForm value={editor} onSave={save} busy={busy} onDirty={setEditorDirty}/>
    </Modal>}
    {deleting && <Modal title="删除纪念日" layout="confirm" className="ann-modal" canClose={() => !mutationPending.current} onClose={() => setDeleting(null)}>
      <p>确定删除「{deleting.name}」吗？删除后无法恢复。</p>
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="confirm-actions">
        <Button variant="soft" data-autofocus disabled={busy} onClick={() => setDeleting(null)}>再想想</Button>
        <Button variant="danger" disabled={busy} onClick={() => void remove()}>确认删除</Button>
      </div>
    </Modal>}
  </>;
}
