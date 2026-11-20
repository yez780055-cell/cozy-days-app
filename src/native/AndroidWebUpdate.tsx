import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '../components/Button';
import { checkWebUpdate, dismissWebUpdate, isUpdateBusy, openWebDownload, runNativeWebUpdate, useWebUpdate } from './webUpdate';
import './webUpdate.css';

const statusText = {
  idle: '可以检查网页更新。',
  checking: '正在检查更新…',
  unconfigured: '在线更新源尚未配置。',
  current: '当前已是最新版本。',
  available: '有可用的网页更新。',
  browser: '保存网页包后，返回应用选择已下载的文件。',
  offline: '当前离线，继续使用本地网页。',
  checkFailed: '暂时无法检查更新，请稍后重试。',
  importing: '正在导入网页更新…',
  restoring: '正在恢复内置网页…',
  nativeFailed: '网页更新操作未完成。',
};

export function AndroidWebUpdatePrompt() {
  const { prompt, release, status, error } = useWebUpdate();
  useEffect(() => { void checkWebUpdate(true); }, []);
  if (!prompt || !release) return null;
  const handoff = status !== 'available';
  const busy = isUpdateBusy(status);

  return <section className="android-update-prompt" aria-labelledby="android-update-title">
    <h2 id="android-update-title" aria-live="polite">{handoff ? '导入已下载的网页包' : '发现新版本，是否立即更新？'}</h2>
    <p>{handoff ? '从下载目录选择已保存的网页包。' : '将在浏览器下载并校验网页包。保存后，返回应用导入。'}</p>
    {error && <p role="alert">{error}</p>}
    <div className="android-update-actions">
      {handoff ? <Button disabled={busy} onClick={() => void runNativeWebUpdate('importUpdate')}>选择网页包</Button>
        : <a className="button button--primary" href={release.downloadPage} onClick={openWebDownload}>立即更新</a>}
      <Button variant="soft" disabled={busy} onClick={dismissWebUpdate}>稍后更新</Button>
    </div>
  </section>;
}

export function AndroidWebUpdate() {
  const { status, version, release, error } = useWebUpdate();
  if (Capacitor.getPlatform() !== 'android') return null;
  const busy = isUpdateBusy(status);

  return <section aria-labelledby="settings-android">
    <h2 id="settings-android" className="settings-section-title">Android 版本</h2>
    <div className="settings-group" aria-busy={busy}>
      {version && <p className="settings-intro">当前网页版本 {version.web} · 外壳 {version.shell}</p>}
      <button type="button" className="settings-row" disabled={busy} onClick={() => void checkWebUpdate()}>
        <RefreshCw size={20} aria-hidden="true"/><span>检查更新</span>
      </button>
      {release && !busy && <a className="settings-row android-update-link" href={release.downloadPage} onClick={openWebDownload}>
        <Download size={20} aria-hidden="true"/><span>下载网页更新</span><small>网页 {release.web}</small>
      </a>}
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
