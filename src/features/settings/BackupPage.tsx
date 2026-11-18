import { Capacitor, registerPlugin } from '@capacitor/core';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, DatabaseBackup, Download, FileUp } from 'lucide-react';
import { Button } from '../../components/Button';
import { exportBackup, exportPreviousBackup, restoreBackup } from '../../data/backup';
import { decodeBackup, maxBackupBytes, type Backup, type RestoreMode } from '../../data/backupModel';
import { canRestore } from '../../data/storageAccess';

const backupFile = registerPlugin<{ save(options: { filename: string; json: string }): Promise<{ saved: boolean }> }>('BackupFile');

async function download({ backup, json }: { backup: Backup; json: string }, prefix = 'cozy-days') {
  const filename = prefix + '-' + new Date(backup.exportedAt).toISOString().replace(/[:.]/g, '-') + '.json';
  if (Capacitor.getPlatform() === 'android') {
    const { saved } = await backupFile.save({ filename, json });
    return saved ? '已保存备份。' : '已取消保存。';
  }
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  return '已请求下载备份，请在设备中确认文件已保存。';
}

export function BackupPage({ onBack }: { onBack: () => void }) {
  const [candidate, setCandidate] = useState<Backup | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [previous, setPrevious] = useState(false);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const supported = canRestore();

  useEffect(() => {
    let mounted = true;
    void exportPreviousBackup().then(backup => { if (mounted) setPrevious(!!backup); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  async function run(operation: () => Promise<void>) {
    if (inFlight.current || finished) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await operation(); }
    catch (error) { setError(error instanceof Error ? error.message : '暂时无法读取或保存本地数据，请重试。'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    void run(async () => {
      setCandidate(null);
      setMode('merge');
      if (file.size > maxBackupBytes) throw new Error('备份文件超过 20 MB。');
      setCandidate(decodeBackup(await file.text()));
    });
  }

  function confirm(backup: Backup) {
    void run(async () => {
      const result = await restoreBackup(backup, mode);
      setCandidate(null);
      setFinished(true);
      const skipped = result.periodConflicts > 0 ? ` 已保留 ${result.periodConflicts} 项有冲突的本机生理期记录或设置。` : '';
      setMessage(mode === 'replace'
        ? '恢复完成。替换前的数据已自动保存在本设备，重新打开后可在这里下载。'
        : '合并完成。' + skipped);
    });
  }

  return <section className="settings-page backup-page" aria-label="数据备份与恢复">
    <header className="settings-header">
      <button type="button" className="settings-back icon-button" aria-label="返回设置" disabled={busy} onClick={finished ? () => location.reload() : onBack}><ArrowLeft size={19}/></button>
      <span className="settings-icon"><DatabaseBackup size={20}/></span>
      <h1>数据备份与恢复</h1>
    </header>
    <p className="settings-intro">备份包含已保存的待办、分类、经期记录和纪念日。JSON 只在本机处理，请妥善保管文件。</p>
    {message && <p className="backup-feedback" role="status">{message}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {finished ? <Button onClick={() => location.reload()}>重新打开应用</Button> : <>
      <section className="font-preview-card backup-actions" aria-label="导出备份">
        <Button variant="soft" disabled={busy} onClick={() => void run(async () => {
          setMessage(await download(await exportBackup()));
        })}><Download size={16}/>导出完整 JSON</Button>
        {previous && <Button variant="soft" disabled={busy} onClick={() => void run(async () => {
          const backup = await exportPreviousBackup();
          if (backup) setMessage(await download(backup, 'cozy-days-before-restore'));
        })}><Download size={16}/>下载最近一次替换前的备份</Button>}
      </section>
      <section className="font-preview-card backup-actions" aria-label="导入备份">
        <label className="backup-file"><FileUp size={16}/>选择备份文件
          <input type="file" accept=".json,application/json" disabled={busy || !supported} onChange={selectFile}/>
        </label>
        {!supported && <p>请在 HTTPS 或 localhost 页面使用支持 Web Locks 的浏览器恢复数据。</p>}
        {candidate && <div className="backup-review">
          <h2>确认导入</h2>
          <p>备份自 {new Date(candidate.exportedAt).toLocaleString('zh-CN')} · v{candidate.appVersion}</p>
          <dl>
            <div><dt>待办</dt><dd>{candidate.records.todos.length}</dd></div>
            <div><dt>分类</dt><dd>{candidate.records.categories.length}</dd></div>
            <div><dt>生理期区间</dt><dd>{candidate.records.period?.periods.length ?? 0}</dd></div>
            <div><dt>生理期日记</dt><dd>{Object.keys(candidate.records.period?.days ?? {}).length}</dd></div>
            <div><dt>纪念日</dt><dd>{candidate.records.anniversaries.length}</dd></div>
          </dl>
          <fieldset disabled={busy}>
            <legend>导入方式</legend>
            <label><input type="radio" name="restore-mode" checked={mode === 'merge'} onChange={() => setMode('merge')}/>合并并保留本机数据</label>
            <label><input type="radio" name="restore-mode" checked={mode === 'replace'} onChange={() => setMode('replace')}/>替换本机数据</label>
          </fieldset>
          <p>{mode === 'merge' ? '跳过重复项；同日或重叠的生理期记录优先保留本机版本。'
            : '本机三个模块的已保存数据将被替换。应用会先保存一份本机备份。'}</p>
          <p>继续前请关闭其他已打开的旧版应用页面。</p>
          <div className="backup-confirm">
            <Button variant="soft" disabled={busy} onClick={() => { setCandidate(null); setError(''); }}>取消</Button>
            <Button variant={mode === 'replace' ? 'danger' : 'primary'} disabled={busy} onClick={() => confirm(candidate)}>
              {mode === 'merge' ? '确认合并' : '确认替换'}
            </Button>
          </div>
        </div>}
      </section>
      {busy && <p role="status">正在处理本地数据…</p>}
    </>}
  </section>;
}
