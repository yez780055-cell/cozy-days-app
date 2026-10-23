import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
  const [returnPage, setReturnPage] = useState<'todo' | 'period' | 'anniversary'>('todo');
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [showSettingsHint, setShowSettingsHint] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigin = useRef<{x:number;y:number}|null>(null);
  const longPressTriggered = useRef(false);
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
  useEffect(() => {
    try {
      if (!localStorage.getItem('cozy-days.settings-hint-seen')) setShowSettingsHint(true);
    } catch { /* Hint is optional when storage is unavailable. */ }
  }, []);
  useEffect(() => {
    if (!quickMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Backspace') {
        event.preventDefault();
        setQuickMenuOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [quickMenuOpen]);
  function clearPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressOrigin.current = null;
  }
  function openQuickMenu() {
    longPressTriggered.current = true;
    clearPress();
    setQuickMenuOpen(true);
    setShowSettingsHint(false);
    try { localStorage.setItem('cozy-days.settings-hint-seen', '1'); } catch { /* Hint can reappear if storage is unavailable. */ }
  }
  function openSettings() {
    setReturnPage(page === 'settings' ? returnPage : page);
    setPage('settings');
    setQuickMenuOpen(false);
  }
  async function selectFont(id: FontId) {
    if (id === fontId || pendingFontId) return;
    setPendingFontId(id);
    setFontError(false);
    try {
      await loadFont(id);
      applyFontStack(id);
      try { localStorage.setItem(FONT_PREFERENCE_KEY, id); } catch { /* The current choice still applies for this session. */ }
      setFontId(id);
    } catch {
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
      {preview && PreviewStates ? <Suspense fallback={<p>载入预览…</p>}><PreviewStates/></Suspense> : page === 'todo' ? <TodoPage/> : page === 'period' ? <PeriodPage/> : page === 'anniversary' ? <AnniversaryPage/> : <SettingsPage fontId={fontId} pendingFontId={pendingFontId} onSelect={id => void selectFont(id)} onBack={() => setPage(returnPage)}/>}
      {fontError && page === 'settings' && <p className="font-error" role="alert">字体加载失败，请重试。当前字体选择没有更改。</p>}
      {quickMenuOpen && <><button type="button" className="quick-menu-backdrop" aria-label="关闭快捷菜单" onClick={() => setQuickMenuOpen(false)}/><div className="nav-quick-menu" role="menu" aria-label="快捷菜单"><button type="button" role="menuitem" onClick={openSettings}><Settings size={17}/>设置</button></div></>}
      {showSettingsHint && !quickMenuOpen && page !== 'settings' && <div className="settings-hint" role="status">长按底部导航打开设置</div>}
      <nav className="bottom-nav" aria-label="应用模块">{[{id:'todo' as const,label:'待办',Icon:House},{id:'period' as const,label:'生理期',Icon:CalendarDays},{id:'anniversary' as const,label:'纪念日',Icon:Heart}].map(({id,label,Icon}) => <button key={id} className={page === id ? 'selected' : ''} aria-current={page === id ? 'page' : undefined} aria-label={`${label}；长按打开设置`} aria-description="长按约半秒打开设置" onPointerDown={event => { if (event.button !== 0 && event.pointerType !== 'touch') return; longPressTriggered.current = false; pressOrigin.current = {x:event.clientX,y:event.clientY}; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is unavailable in some WebViews. */ } pressTimer.current = setTimeout(openQuickMenu, 500); }} onPointerMove={event => { const origin=pressOrigin.current; if (origin && Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>12) clearPress(); }} onPointerUp={clearPress} onPointerCancel={() => { clearPress(); longPressTriggered.current = false; }} onLostPointerCapture={clearPress} onContextMenu={event => { event.preventDefault(); openQuickMenu(); }} onKeyDown={event => { if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && !quickMenuOpen) { event.preventDefault(); openQuickMenu(); } }} onClick={event => { if (longPressTriggered.current) { event.preventDefault(); event.stopPropagation(); longPressTriggered.current = false; return; } if (preview) location.assign('/'); else setPage(id); }}><span><Icon size={23} strokeWidth={1.7}/></span>{label}</button>)}</nav>
    </main>
    {import.meta.env.DEV && <div className="desktop-caption">把平凡的小日子，过得柔软一点。<span>LOCAL FIRST · MADE FOR YOUR EVERYDAY</span></div>}
  </div>;
}

