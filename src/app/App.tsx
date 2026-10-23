import { lazy, Suspense, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { CalendarDays, Heart, House, Settings, Smartphone } from 'lucide-react';
import TodoPage from '../features/todo/TodoPage';
import PeriodPage from '../features/period/PeriodPage';
import AnniversaryPage from '../features/anniversary/AnniversaryPage';
import { motion } from '../styles/motion';
import { SettingsPage } from '../features/settings/SettingsPage';
import { applyFontStack, FONT_PREFERENCE_KEY, getStoredFontId, loadFont, type FontId } from '../styles/fontRegistry';

const PreviewStates = import.meta.env.DEV ? lazy(() => import('../dev/PreviewStates')) : null;
const devices = [{ name:'小屏', width:360, height:740 }, { name:'标准', width:393, height:852 }, { name:'大屏', width:430, height:932 }];
export default function App() {
  const [page, setPage] = useState<'todo' | 'period' | 'anniversary' | 'settings'>('todo');
  const [fontId, setFontId] = useState<FontId>(() => {
    const id = getStoredFontId();
    applyFontStack(id);
    return id;
  });
  const [pendingFontId, setPendingFontId] = useState<FontId | null>(null);
  const [fontError, setFontError] = useState(false);
  const [device, setDevice] = useState(devices[1]);
  const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview');
  useEffect(() => { void loadFont(fontId).catch(() => setFontError(true)); }, []);
  async function selectFont(id: FontId) {
    if (id === fontId || pendingFontId) return;
    const previous = fontId;
    setPendingFontId(id);
    setFontError(false);
    applyFontStack(id);
    try {
      await loadFont(id);
      try { localStorage.setItem(FONT_PREFERENCE_KEY, id); } catch { /* The current choice still applies for this session. */ }
      setFontId(id);
    } catch {
      applyFontStack(previous);
      setFontError(true);
    } finally {
      setPendingFontId(null);
    }
  }
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--motion-press', `${motion.press}ms`);
    root.style.setProperty('--motion-check', `${motion.checkbox}ms`);
    root.style.setProperty('--motion-modal', `${motion.modal}ms`);
    root.style.setProperty('--motion-list', `${motion.list}ms`);
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
  return <div className="app-shell">
    {import.meta.env.DEV && <aside className="preview-toolbar"><div className="preview-brand"><Smartphone size={18}/><strong>小日子</strong><span>设备预览</span></div><div className="device-options">{devices.map(item => <button key={item.width} aria-pressed={device.width === item.width} onClick={() => setDevice(item)}>{item.name}<small>{item.width} × {item.height}</small></button>)}</div><a href={preview ? '/' : '/?preview=1'}>{preview ? '返回应用' : '组件与状态 ↗'}</a><p>仅开发环境可见</p></aside>}
    <main className="phone" style={{ '--device-width': `${device.width}px`, '--device-height': `${device.height}px` } as React.CSSProperties}>
      {preview && PreviewStates ? <Suspense fallback={<p>载入预览…</p>}><PreviewStates/></Suspense> : page === 'todo' ? <TodoPage/> : page === 'period' ? <PeriodPage/> : page === 'anniversary' ? <AnniversaryPage/> : <SettingsPage fontId={fontId} pendingFontId={pendingFontId} onSelect={id => void selectFont(id)}/>}
      {fontError && page === 'settings' && <p className="font-error" role="alert">字体加载失败，请重试。当前字体选择没有更改。</p>}
      <nav className="bottom-nav" aria-label="应用模块">{[{id:'todo' as const,label:'待办',Icon:House},{id:'period' as const,label:'生理期',Icon:CalendarDays},{id:'anniversary' as const,label:'纪念日',Icon:Heart},{id:'settings' as const,label:'设置',Icon:Settings}].map(({id,label,Icon}) => <button key={id} className={page === id ? 'selected' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => { if (preview) location.assign('/'); else setPage(id); }}><span><Icon size={23} strokeWidth={1.7}/></span>{label}</button>)}</nav>
    </main>
    {import.meta.env.DEV && <div className="desktop-caption">把平凡的小日子，过得柔软一点。<span>LOCAL FIRST · MADE FOR YOUR EVERYDAY</span></div>}
  </div>;
}

