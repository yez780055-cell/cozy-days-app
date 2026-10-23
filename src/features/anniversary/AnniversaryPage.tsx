import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Asset } from '../../components/Asset';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { anniversaryRepository } from '../../data/database';
import { anniversaryArtwork } from './artwork';
import { colors, dateKey, icons, inYear, localDate, themes, timing, type Anniversary } from './model';
import './anniversary.css';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const eventsOn = (rows: Anniversary[], key: string) => rows.filter(row => inYear(row, localDate(key).getFullYear()) === key);

function AnniversaryForm({ value, onSave, busy }: { value: Anniversary; onSave: (value: Anniversary) => Promise<void>; busy: boolean }) {
  const [draft, setDraft] = useState(value);
  function submit(event: FormEvent) { event.preventDefault(); void onSave(draft); }
  return <form className="ann-form" onSubmit={submit}>
    <label>纪念日名称<input data-autofocus required maxLength={60} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="给重要的日子起个名字"/></label>
    <label>日期<input type="date" required min="1000-01-01" max="9999-12-31" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })}/></label>
    <div className="ann-fields"><label>分类 / 主题<select value={draft.theme} onChange={e => setDraft({ ...draft, theme: e.target.value as Anniversary['theme'] })}>{themes.map(theme => <option key={theme}>{theme}</option>)}</select></label><label>图标<select aria-label="图标" value={draft.icon} onChange={e => setDraft({ ...draft, icon: e.target.value })}><option value="">无图标</option>{icons.map(icon => <option key={icon}>{icon}</option>)}</select></label></div>
    <label className="ann-repeat"><input type="checkbox" checked={draft.yearly} onChange={e => setDraft({ ...draft, yearly: e.target.checked })}/>每年重复</label>
    {draft.yearly && <p className="ann-hint">每年计算下一个日子。2 月 29 日在平年按 2 月 28 日纪念。</p>}
    <label>备注<textarea aria-label="备注" maxLength={500} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="写下一点想珍藏的话…"/></label>
    <fieldset><legend>卡片颜色</legend><div className="ann-swatches">{colors.map((color, index) => <button type="button" key={color} className={`ann-${color}`} aria-label={['粉色', '奶黄', '淡紫', '薄荷绿'][index]} aria-pressed={draft.color === color} onClick={() => setDraft({ ...draft, color })}>{draft.color === color ? '♡' : ''}</button>)}</div></fieldset>
    <Button type="submit" disabled={busy || !draft.name.trim()}>{busy ? '正在保存…' : '保存纪念日'}</Button>
  </form>;
}

export default function AnniversaryPage() {
  const [rows, setRows] = useState<Anniversary[]>([]);
  const [today, setToday] = useState(dateKey());
  const [selected, setSelected] = useState(dateKey());
  const [filter, setFilter] = useState('全部');
  const [calendar, setCalendar] = useState(false);
  const [month, setMonth] = useState(() => localDate(dateKey()));
  const [editor, setEditor] = useState<Anniversary | null>(null);
  const [deleting, setDeleting] = useState<Anniversary | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mutationPending = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
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
    setBusy(true); setError('');
    try {
      const saved = await anniversaryRepository.save(value);
      // A committed write remains successful even if the following read fails.
      setRows(current => [...current.filter(row => row.id !== saved.id), saved]);
      setEditor(null);
      await refresh('保存');
    }
    catch { setError('保存失败，请检查名称和日期后重试。'); }
    finally { mutationPending.current = false; setBusy(false); }
  }
  async function remove() {
    if (deleting?.id === undefined || mutationPending.current) return;
    mutationPending.current = true;
    setBusy(true); setError('');
    try {
      await anniversaryRepository.remove(deleting.id);
      setRows(current => current.filter(row => row.id !== deleting.id));
      setDeleting(null);
      await refresh('删除');
    }
    catch { setError('删除失败，你的收藏仍在，请重试。'); }
    finally { mutationPending.current = false; setBusy(false); }
  }
  function create() { setError(''); setEditor({ name: '', date: selected, theme: '生活', note: '', icon: '♡', yearly: true, color: 'pink', createdAt: Date.now(), updatedAt: Date.now() }); }
  const date = localDate(selected);
  const weekStart = new Date(date); weekStart.setDate(date.getDate() - (date.getDay() + 6) % 7);
  const year = month.getFullYear(), monthIndex = month.getMonth();
  const monthEvents = rows.filter(row => { const key = inYear(row, year); return key && localDate(key).getMonth() === monthIndex; });
  const upcoming = rows.filter(row => timing(row, today).days >= 0).length;
  const visible = rows.filter(row => filter === '全部' || (filter === '即将到来' ? timing(row, today).days >= 0 : timing(row, today).days < 0))
    .sort((a, b) => Math.abs(timing(a, today).days) - Math.abs(timing(b, today).days) || a.createdAt - b.createdAt);
  function select(key: string) { setSelected(key); setMonth(localDate(key)); }
  function shiftMonth(amount: number) { select(dateKey(new Date(year, monthIndex + amount, 1, 12))); }
  const chosen = eventsOn(rows, selected);
  return <>
    <section className="ann-page" aria-label="纪念日收藏">
      <header className="ann-hero"><span className="eyebrow">COZY DAYS · 小饱日常</span><h1>纪念日 <span>♡</span></h1><p>把重要的日子，<br/>认真收藏起来。</p><Asset name={anniversaryArtwork.headerCats} className="ann-cats"/><Asset name={anniversaryArtwork.sparkle} className="ann-sparkle"/></header>
      <div className="ann-content">
        <section className="ann-date-panel" aria-label="纪念日日历">
          <div className="ann-date-title"><div><strong>{date.getMonth() + 1}月{date.getDate()}日</strong><span>星期{weekdays[(date.getDay() + 6) % 7]}</span></div><button onClick={() => { setMonth(localDate(selected)); setCalendar(true); }}><CalendarDays size={17}/>月视图</button></div>
          <p className="ann-hint">{selected === today ? '今天也是值得被记住的一天 ♡' : `${date.getFullYear()} 年 · 把日子轻轻翻一页`}</p>
          <div className="ann-week-top"><button aria-label="上一周" onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 7); select(dateKey(d)); }}><ChevronLeft size={16}/></button><span>{date.getFullYear()} 年 {date.getMonth() + 1} 月 · 本月 {monthEvents.length} 个重要日子</span><button aria-label="下一周" onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 7); select(dateKey(d)); }}><ChevronRight size={16}/></button></div>
          <div className="ann-week">{weekdays.map((day, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); const key = dateKey(d); const count = eventsOn(rows, key).length; return <button key={day} aria-label={`${key}${count ? `，${count} 个纪念日` : ''}`} aria-pressed={key === selected} onClick={() => select(key)}><small>{day}</small><span>{d.getDate()}</span><i>{count ? '♡' : key === today ? '·' : ''}</i></button>; })}</div>
          <div className="ann-day-summary"><span>{chosen.length ? chosen.map(row => row.name).join(' · ') : '这天还没有收藏的纪念日'}</span><button onClick={() => select(today)}>回到今天</button></div>
        </section>
        <div className="ann-filters" aria-label="纪念日筛选">{['全部', '即将到来', '已过去'].map((name, i) => <button key={name} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}<span>{[rows.length, upcoming, rows.length - upcoming][i]}</span></button>)}</div>
        <div className="ann-list" aria-live="polite">
          {!loaded && !error && <p>正在打开日子收藏夹…</p>}
          {loaded && !visible.length && <div className="ann-empty"><Asset name={anniversaryArtwork.emptyCollection}/><h2>{rows.length ? '这里还没有这样的日子' : '重要的日子，从这里收藏'}</h2><p>{rows.length ? '切换分类，看看其他珍藏吧。' : '生日、相遇、或一个小小的开始。'}</p>{!rows.length && <Button variant="soft" onClick={create}>收藏第一个日子 ♡</Button>}</div>}
          {visible.map(row => { const status = timing(row, today); return <article key={row.id} data-testid="anniversary-card" className={`ann-card ann-${row.color}`}>
            <div className="ann-card-icon" aria-hidden="true">{row.icon || '♡'}<small>✧</small></div><div className="ann-card-copy"><div className="ann-card-top"><h2>{row.name}</h2><span className="ann-count">{status.label}</span></div><time dateTime={row.date}>{row.date.replace(/-/g, '.')}</time><div className="ann-meta">{row.theme}{row.yearly ? ` · 每年重复${status.years ? ` · 已满 ${status.years} 周年` : ''}` : ' · 单次纪念'}</div>{row.note && <p>{row.note}</p>}<div className="ann-card-bottom"><small>{row.yearly ? `下次 ${status.occurrence.replace(/-/g, '.')}` : '把这一天好好收藏 ♡'}</small><button aria-label={`编辑：${row.name}`} onClick={() => { setError(''); setEditor(row); }}><Pencil size={18}/></button><button aria-label={`删除：${row.name}`} onClick={() => { setError(''); setDeleting(row); }}><Trash2 size={18}/></button></div></div>
          </article>; })}
        </div><p className="ann-footer">♡ 每个小日子，都有被珍藏的理由</p>
      </div>
      {error && !editor && !deleting && <div><p role="alert" className="error-message">{error}</p><Button variant="soft" disabled={refreshing || busy} onClick={() => void refresh()}>{refreshing ? '正在读取…' : '重新读取收藏'}</Button></div>}
    </section>
    <button className="fab ann-fab" aria-label="新增纪念日" disabled={!loaded} onClick={create}><Plus size={32}/></button>
    {editor && <Modal title={editor.id === undefined ? '新增纪念日' : '编辑纪念日'} className="ann-modal" onClose={() => { if (!busy) setEditor(null); }}>{error && <p role="alert" className="error-message">{error}</p>}<AnniversaryForm value={editor} onSave={save} busy={busy}/></Modal>}
    {deleting && <Modal title="删除纪念日" className="ann-modal" onClose={() => { if (!busy) setDeleting(null); }}><p>确定删除「{deleting.name}」吗？删除后无法恢复。</p>{error && <p role="alert" className="error-message">{error}</p>}<div className="confirm-actions"><Button variant="soft" disabled={busy} onClick={() => setDeleting(null)}>再想想</Button><Button variant="danger" disabled={busy} onClick={() => void remove()}>确认删除</Button></div></Modal>}
    {calendar && <Modal title="月视图" className="ann-modal" onClose={() => setCalendar(false)}>
      <div className="ann-month-heading"><button aria-label="上个月" onClick={() => shiftMonth(-1)}><ChevronLeft/></button><strong>{year} 年 {monthIndex + 1} 月</strong><button aria-label="下个月" onClick={() => shiftMonth(1)}><ChevronRight/></button></div>
      <div className="ann-month-grid">{weekdays.map(day => <small key={day}>{day}</small>)}{Array.from({ length: (new Date(year, monthIndex, 1, 12).getDay() + 6) % 7 }, (_, i) => <span key={`blank-${i}`}/>)}{Array.from({ length: new Date(year, monthIndex + 1, 0, 12).getDate() }, (_, i) => { const key = dateKey(new Date(year, monthIndex, i + 1, 12)); const count = eventsOn(rows, key).length; return <button key={key} aria-label={`${key}${count ? `，${count} 个纪念日` : ''}`} aria-pressed={selected === key} onClick={() => setSelected(key)}>{i + 1}<i>{count ? '♡' : ''}</i></button>; })}</div>
      <p className="ann-hint">本月 {monthEvents.length} 个重要日子 · {selected}</p><div className="ann-month-events">{chosen.length ? chosen.map(row => <p key={row.id}>{row.icon} {row.name} · {timing(row, today).label}</p>) : <p>这天还没有纪念日，留给新的小美好。</p>}</div><Button variant="soft" onClick={() => select(today)}>回到今天</Button><Button onClick={() => setCalendar(false)}>查看收藏</Button>
    </Modal>}
  </>;
}

