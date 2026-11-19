import { useEffect, useState, useSyncExternalStore } from 'react';
import { applyUpdate, dismissUpdate, getUpdateState, subscribeToUpdate } from './pwa';
import './styles/pwa-update.css';

export function PwaUpdate() {
  const state = useSyncExternalStore(subscribeToUpdate, getUpdateState);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const check = () => setBlocked(Boolean(document.querySelector('[role="dialog"]:not(.pwa-update)')));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  if (state === 'idle' || blocked) return null;
  return <div className="pwa-update-backdrop">
    <section className="pwa-update" role="dialog" aria-modal="true" aria-labelledby="pwa-update-title" aria-describedby="pwa-update-description">
      <img className="pwa-update-cat" src={`${import.meta.env.BASE_URL}assets/cozy_days/raster/original/peeking-cat.png`} alt="" />
      <h2 id="pwa-update-title">Cozy Days 有新版本啦！</h2>
      <p id="pwa-update-description">小饱日常又有一些新变化，更新后即可体验。</p>
      {state === 'error' && <p className="pwa-update-error" role="alert">更新暂时没有完成，请检查网络后重试。你的数据不会受影响。</p>}
      <button className="button button--primary" type="button" disabled={state === 'updating'} onClick={() => void applyUpdate()}>{state === 'updating' ? '正在更新…' : state === 'error' ? '重试更新' : '立即更新'}</button>
      <button className="button button--soft" type="button" disabled={state === 'updating'} onClick={dismissUpdate}>稍后再说</button>
    </section>
  </div>;
}
