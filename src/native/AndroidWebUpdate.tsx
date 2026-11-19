import { useEffect, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { AndroidShell } from './shell';

export function AndroidWebUpdate() {
  const [version, setVersion] = useState<{ shell: number; web: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void AndroidShell.updateInfo().then(setVersion).catch(() => setError('无法读取版本。'));
  }, []);

  async function run(action: 'importUpdate' | 'restoreBundled') {
    setBusy(true);
    setError('');
    try {
      await AndroidShell[action]();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '暂时无法更新网页内容。');
    } finally {
      setBusy(false);
    }
  }

  return <section aria-labelledby="settings-android">
    <h2 id="settings-android" className="settings-section-title">Android 版本</h2>
    <div className="settings-group" aria-busy={busy}>
      <button type="button" className="settings-row" disabled={busy} onClick={() => void run('importUpdate')}>
        <Download size={20} aria-hidden="true"/><span>导入网页更新</span>
        {version && <small>网页 {version.web} · 外壳 {version.shell}</small>}
      </button>
      {version && version.web > 1 && <button type="button" className="settings-row" disabled={busy}
        onClick={() => void run('restoreBundled')}>
        <RotateCcw size={20} aria-hidden="true"/><span>恢复内置网页</span>
      </button>}
    </div>
    {error && <p className="settings-notice settings-notice--error" role="alert">{error}</p>}
  </section>;
}
