import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { BookImage, Droplet, House, ListTodo, Smartphone } from 'lucide-react';
import { Button } from '../components/Button';
import { HomePage, type HomeStartup } from '../features/home/HomePage';
import { anniversaryRepository, todoRepository } from '../data/database';
import { database } from '../data/localDatabase';
import { publishStartupSurface } from '../native/startupReadiness';
import TodoPage from '../features/todo/TodoPage';
import PeriodPage from '../features/period/PeriodPage';
import AnniversaryPage from '../features/anniversary/AnniversaryPage';
import { motion } from '../styles/motion';
import { dataChangedEvent } from '../data/storageAccess';
import { SettingsPage } from '../features/settings/SettingsPage';
import { applyFontStack, DEFAULT_FONT_ID, FONT_PREFERENCE_KEY, getStoredFontId, loadFont, type FontId } from '../styles/fontRegistry';
import { backFromAndroidHome, resetAndroidExit, useAndroidBack } from '../native/back';

const PreviewStates = import.meta.env.DEV ? lazy(() => import('../dev/PreviewStates')) : null;
// Share only concurrent startup reads for the same account database, including
// StrictMode remounts. Never retain a settled snapshot for later visits.
const startupReads = new WeakMap<object, HomeStartup>();
function readStartupData(): HomeStartup {
  const scope = database;
  const pending = startupReads.get(scope);
  if (pending) return pending;
  const read = Promise.all([todoRepository.all(), anniversaryRepository.all()]);
  startupReads.set(scope, read);
  const clear = () => { if (startupReads.get(scope) === read) startupReads.delete(scope); };
  void read.then(clear, clear);
  return read;
}
const devices = [{ name:'小屏', width:360, height:740 }, { name:'标准', width:393, height:852 }, { name:'大屏', width:430, height:932 }];
export default function App() {
  const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview');
  const [page, setPage] = useState<'home' | 'todo' | 'period' | 'anniversary' | 'settings'>('home');
  const [reloadRequired, setReloadRequired] = useState(false);
  const [startup] = useState<HomeStartup>(() => preview ? Promise.resolve([[], []]) : readStartupData());
  const [startupLoaded, setStartupLoaded] = useState(false);
  const [homeReady, setHomeReady] = useState(false);
  const phone = useRef<HTMLDivElement>(null);
  const initialHome = useRef(true);
  const [returnPage, setReturnPage] = useState<'home' | 'todo' | 'period' | 'anniversary'>('home');
  const [quickAdd, setQuickAdd] = useState(false);
  const [showAllTodos, setShowAllTodos] = useState(false);
  const fontBusy = useRef(false);
  const [fontId, setFontId] = useState<FontId>(() => {
    const id = getStoredFontId();
    if (id) applyFontStack(id);
    return id ?? DEFAULT_FONT_ID;
  });
  const [pendingFontId, setPendingFontId] = useState<FontId | null>(null);
  const [failedFontId, setFailedFontId] = useState<FontId | null>(null);
  const [device, setDevice] = useState<typeof devices[number]>();
  useAndroidBack('root', true, () => {
    if (page === 'home') backFromAndroidHome();
    else {
      resetAndroidExit();
      setQuickAdd(false);
      setShowAllTodos(false);
      setPage('home');
    }
  });
  useEffect(() => {
    const requireReload = () => setReloadRequired(true);
    window.addEventListener(dataChangedEvent, requireReload);
    return () => window.removeEventListener(dataChangedEvent, requireReload);
  }, []);
  useEffect(() => {
    let active = true;
    void loadFont(fontId).catch(() => { if (active) setFailedFontId(fontId); });
    return () => { active = false; };
  }, [fontId]);
  function openSettings() {
    setReturnPage(page === 'settings' ? returnPage : page);
    setPage('settings');
  }
  async function selectFont(id: FontId) {
    if ((id === fontId && failedFontId !== id) || fontBusy.current) return;
    fontBusy.current = true;
    setPendingFontId(id);
    setFailedFontId(null);
    try {
      await loadFont(id);
      applyFontStack(id);
      try { localStorage.setItem(FONT_PREFERENCE_KEY, id); } catch { /* The current choice still applies for this session. */ }
      setFontId(id);
      setFailedFontId(null);
    } catch {
      setFailedFontId(id);
    } finally {
      fontBusy.current = false;
      setPendingFontId(null);
    }
  }
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--motion-press', `${motion.press}ms`);
    root.style.setProperty('--motion-check', `${motion.checkbox}ms`);
    root.style.setProperty('--motion-modal', `${motion.modal}ms`);
    root.style.setProperty('--motion-list', `${motion.list}ms`);
    if (import.meta.env.MODE === 'android') return;
    const update = () => {
      root.style.setProperty('--visible-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
      root.style.setProperty('--visible-offset', `${window.visualViewport?.offsetTop ?? 0}px`);
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    // Android normally resizes the WebView; this also covers overlay keyboards.
    const listeners = Capacitor.isNativePlatform()
      ? [Keyboard.addListener('keyboardDidShow', update), Keyboard.addListener('keyboardDidHide', update)]
      : [];
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      listeners.forEach(listener => { void listener.then(handle => handle.remove()); });
    };
  }, []);
  useEffect(() => {
    let active = true;
    void startup.then(() => { if (active) setStartupLoaded(true); }, () => { if (active) setStartupLoaded(false); });
    return () => { active = false; };
  }, [startup]);
  useLayoutEffect(() => { if (page !== 'home') initialHome.current = false; }, [page]);
  useLayoutEffect(() => {
    if (!startupLoaded || reloadRequired || preview || (page === 'home' && !homeReady) || !phone.current) return;
    return publishStartupSurface(phone.current);
  }, [startupLoaded, reloadRequired, preview, page, homeReady]);
  const activePage = page === 'settings' ? 'home' : page;
  const previewDevice = device ?? (preview ? devices[1] : undefined);
  return <div className={`app-shell${previewDevice ? ' app-shell--device-preview' : ''}`}>
    {import.meta.env.DEV && <aside className="preview-toolbar"><div className="preview-brand"><Smartphone size={18}/><strong>小日子</strong><span>设备预览</span></div><div className="device-options">{devices.map(item => <button key={item.width} aria-pressed={previewDevice?.width === item.width} onClick={() => setDevice(item)}>{item.name}<small>{item.width} × {item.height}</small></button>)}</div><a href={preview ? './' : './?preview=1'}>{preview ? '返回应用' : '组件与状态 ↗'}</a><p>仅开发环境可见</p></aside>}
    <div ref={phone} className="phone" style={previewDevice && { '--device-width': `${previewDevice.width}px`, '--device-height': `${previewDevice.height}px` } as React.CSSProperties}>
      <main className="app-content">
      {preview && PreviewStates ? <Suspense fallback={<p>载入预览…</p>}><PreviewStates/></Suspense> : page === 'home' ? <HomePage startup={initialHome.current ? startup : undefined} onInitialReady={setHomeReady} onSettings={openSettings} onNavigate={(next,add,all) => {setQuickAdd(!!add);setShowAllTodos(!!all);setPage(next);}}/> : page === 'todo' ? <TodoPage initialDialog={quickAdd?'add':undefined} initialAll={showAllTodos}/> : page === 'period' ? <PeriodPage/> : page === 'anniversary' ? <AnniversaryPage initialAdd={quickAdd}/> : <SettingsPage fontId={fontId} pendingFontId={pendingFontId} failedFontId={failedFontId} onSelect={id => void selectFont(id)} onBack={() => setPage(returnPage)}/>}
      </main>
      {reloadRequired && <div className="restore-reload" role="alert">本机数据已恢复。<Button variant="soft" onClick={() => location.reload()}>重新打开以继续</Button></div>}
      <nav className="bottom-nav" aria-label="应用模块">{[{id:'home' as const,label:'首页',Icon:House},{id:'todo' as const,label:'待办',Icon:ListTodo},{id:'period' as const,label:'生理期',Icon:Droplet},{id:'anniversary' as const,label:'纪念日',Icon:BookImage}].map(({id,label,Icon}) => <button type="button" key={id} className={activePage === id ? 'selected' : ''} aria-current={activePage === id ? 'page' : undefined} aria-label={label} onClick={() => {setQuickAdd(false);setShowAllTodos(false);if (preview) location.assign('./'); else setPage(id);}}><span aria-hidden="true"><Icon size={20} strokeWidth={1.7}/></span>{label}</button>)}</nav>
    </div>
  </div>;
}

