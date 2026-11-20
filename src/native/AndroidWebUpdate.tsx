import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, FlaskConical, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '../components/Button';
import { Asset } from '../components/Asset';
import { useAndroidBack } from './back';
import { checkWebUpdate, dismissWebUpdate, installOnlineWebUpdate, isOnlineUpdateBusy, isUpdateBusy, runNativeWebUpdate, setPrereleaseUpdates, useWebUpdate } from './webUpdate';
import './webUpdate.css';

const statusText = {
  idle: '可以检查网页更新。',
  checking: '正在检查小饱有没有更新',
  unconfigured: '在线更新源尚未配置。',
  current: '当前已是最新版本。',
  available: '有可用的网页更新。',
  offline: '当前离线，继续使用本地网页。',
  checkFailed: '暂时无法检查更新，请稍后重试。',
  importing: '正在导入网页更新…',
  restoring: '正在恢复内置网页…',
  nativeFailed: '网页更新操作未完成。',
  onlineFailed: '更新未完成',
  downloading: '小饱更新软件啦！正在下载中⁓',
  verifying: '下载完成⁓需要校验文件喔',
  installing: '马上！正在安装啦！',
  installed: '更新完成！！！',
  rolledBack: '新网页未能启动，已恢复稳定版本。',
};

const size = (bytes: number) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function AndroidWebUpdatePrompt() {
  const { prompt, release, status, error, received, version } = useWebUpdate();
  const active = isOnlineUpdateBusy(status);
  const card = useRef<HTMLElement>(null);
  useEffect(() => { void checkWebUpdate(true); }, []);
  useAndroidBack('overlay', active, () => {});
  useEffect(() => {
    if (!active) return;
    const app = document.querySelector<HTMLElement>('.app-shell');
    const previousFocus = document.activeElement;
    if (app) app.inert = true;
    card.current?.focus();
    return () => {
      if (app) app.inert = false;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [active]);
  if (!prompt) return null;
  const checking = status === 'checking';
  const title = status === 'available' ? '发现新版本，是否立即更新？' : statusText[status];
  const downloaded = Math.max(0, Math.min(received, release?.bytes ?? 0));
  const percent = release ? Math.floor(100 * downloaded / release.bytes) : 0;
  const progress = status === 'downloading' && release;
  const canClose = !active && !checking;

  return <div className={`android-update-frame${active ? ' android-update-frame--active' : ''}`}>
    <section className="android-update-prompt" role={active ? 'dialog' : undefined} aria-modal={active || undefined}
      aria-labelledby="android-update-title" ref={card} tabIndex={active ? -1 : undefined}>
    {(active || checking || status === 'installed') && <Asset name="originalPeekingCat"
      className={`android-update-cat${active || checking ? ' android-update-cat--moving' : ''}`} />}
    <h2 id="android-update-title" aria-live="polite">{title}</h2>
    {status === 'available' && release && <p>网页版本 {release.web} · {size(release.bytes)}</p>}
    {progress && <div className="android-update-download">
      <progress max={progress.bytes} value={downloaded} aria-label="网页包下载进度"
        aria-valuetext={`${percent}%，${size(downloaded)} / ${size(progress.bytes)}`} />
      <span>{percent}%</span><span>{size(downloaded)} / {size(progress.bytes)}</span>
    </div>}
    {(checking || status === 'verifying' || status === 'installing') && <div className="android-update-wait" aria-hidden="true" />}
    {(status === 'installed' || status === 'rolledBack') && version && <p>当前网页版本 {version.web}</p>}
    {error && <p role="alert">{error}</p>}
    {canClose && <div className="android-update-actions">
      {status === 'available' && <Button onClick={() => void installOnlineWebUpdate()}>立即更新</Button>}
      {status === 'onlineFailed' && <Button onClick={() => void installOnlineWebUpdate()}>重试下载</Button>}
      {status === 'rolledBack' && <Button onClick={() => void checkWebUpdate()}>重新检查</Button>}
      <Button variant="soft" onClick={dismissWebUpdate}>{status === 'available' ? '稍后更新' : '关闭'}</Button>
    </div>}
    </section>
  </div>;
}

export function AndroidWebUpdate() {
  const { status, version, release, error, prerelease } = useWebUpdate();
  if (Capacitor.getPlatform() !== 'android') return null;
  const busy = isUpdateBusy(status);

  return <section aria-labelledby="settings-android">
    <h2 id="settings-android" className="settings-section-title">Android 版本</h2>
    <div className="settings-group" aria-busy={busy}>
      {version && <p className="settings-intro">当前网页版本 {version.web} · 外壳 {version.shell}</p>}
      <button type="button" className="settings-row" disabled={busy} onClick={() => void checkWebUpdate()}>
        <RefreshCw size={20} aria-hidden="true"/><span>检查更新</span>
      </button>
      <label className="settings-row">
        <FlaskConical size={20} aria-hidden="true"/><span>接收预发布网页更新</span>
        <input type="checkbox" checked={prerelease} disabled={busy}
          onChange={event => setPrereleaseUpdates(event.currentTarget.checked)} />
      </label>
      {release && !busy && <button type="button" className="settings-row" onClick={() => void installOnlineWebUpdate()}>
        <Download size={20} aria-hidden="true"/><span>下载网页更新</span><small>网页 {release.web}</small>
      </button>}
      <button type="button" className="settings-row" disabled={busy} onClick={() => void runNativeWebUpdate('importUpdate')}>
        <Download size={20} aria-hidden="true"/><span>导入网页更新</span>
      </button>
      {version && version.web > 1 && <button type="button" className="settings-row" disabled={busy}
        onClick={() => void runNativeWebUpdate('restoreBundled')}>
        <RotateCcw size={20} aria-hidden="true"/><span>恢复内置网页</span>
      </button>}
    </div>
    <p className="settings-notice" role="status">{statusText[status]}</p>
    {error && <p className="settings-notice settings-notice--error" role="alert">{error}</p>}
  </section>;
}
