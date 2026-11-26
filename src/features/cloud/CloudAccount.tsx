import { createContext, useContext, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { resolveSyncConflict } from '../../data/cloudStore';
import type { SyncStatus } from '../../data/cloudSync';
import type { CloudScope, SyncConflict } from '../../data/cloudTypes';
import { SettingsHeader } from '../settings/SettingsHeader';

type Account = { email: string; scope: CloudScope; status: SyncStatus; retry: () => void; signOut: () => void };
export const AccountContext = createContext<Account | null>(null);
export const useCloudAccount = () => useContext(AccountContext);

const phaseLabels = {
  waiting: '等待同步', offline: '离线 · 更改保存在本机', syncing: '正在同步…',
  current: '已连接', error: '连接暂时失败，稍后自动重试',
};
const recordLabels = { todo: '待办', category: '待办分类', anniversary: '纪念日', periods: '经期记录',
  day: '生理期每日记录', cycle: '周期设置' };
const conflictLabels: Record<string, string> = {
  version: '另一设备已先保存这条记录。', category: '已有同名分类。请查看副本，再用其他名称新建。',
  period: '经期日期发生重叠。请查看副本，再到生理期页面调整。', invalid: '此副本未通过云端记录格式校验。',
  calendar: '云端纪念日或日期字段无效，原始记录已隔离；请先导出副本并联系支持。',
};

export function CloudAccount({ onBack }: { onBack: () => void }) {
  const account = useCloudAccount();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmExit, setConfirmExit] = useState(false);
  if (!account) return null;
  const { status, email, scope, signOut, retry } = account;
  async function resolve(event: FormEvent<HTMLFormElement>, conflict: SyncConflict) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const reapply = submitter?.value === 'reapply';
    if (reapply && !window.confirm('将此副本作为新的更改保存并同步？')) return;
    setBusy(conflict.operation); setError('');
    try { await resolveSyncConflict(conflict.operation, reapply); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '暂时无法处理冲突，请重试。'); }
    finally { setBusy(''); }
  }
  return <section className="settings-page" aria-label="账号与同步">
    <SettingsHeader title="账号与同步" onBack={onBack}/>
    <div className="settings-group cloud-panel">
      <strong>{email}</strong>
      <p>双人空间 · {scope.members} / 2 位成员</p>
      <p>纪念日和生理期由双方共同管理。待办和分类仅自己可见。</p>
      <p role="status">{phaseLabels[status.phase]}{status.pending > 0 && ` · ${status.pending} 条待同步`}</p>
      <Button variant="soft" onClick={retry} disabled={status.phase === 'syncing' || status.phase === 'offline'}>立即同步</Button>
    </div>
    {status.conflicts.length > 0 && <section>
      <h2 className="settings-section-title">同步冲突</h2>
      <p className="settings-intro">当前页面显示云端已保存的版本。你的修改副本仍保存在这台设备。</p>
      {status.conflicts.map(conflict => <form key={conflict.operation} className="settings-group cloud-panel" onSubmit={event => void resolve(event, conflict)}>
        <strong>{recordLabels[conflict.kind]}</strong>
        <p>{conflictLabels[conflict.reason]} {new Date(conflict.at).toLocaleString()}</p>
        <details><summary>比较两个版本</summary>
          <p>本机副本</p><pre>{describe(conflict.attempted)}</pre>
          <p>冲突时的云端版本</p><pre>{describe(conflict.latest)}</pre>
        </details>
        <div className="cloud-actions">
          {conflict.reason === 'calendar' ? <Button type="button" variant="soft" onClick={() => downloadConflict(conflict)}>导出隔离记录</Button> : <>
          <Button type="button" variant="soft" onClick={() => downloadConflict(conflict)}>导出冲突副本</Button>
          <Button type="submit" disabled={!!busy} variant="soft">保留云端版本</Button>
          {conflict.reason === 'version' && <Button type="submit" value="reapply" disabled={!!busy}>重新应用我的修改</Button>}
          </>}
        </div>
      </form>)}
    </section>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {confirmExit ? <div className="settings-group cloud-panel">
      <p>退出后需重新验证邮箱。待同步记录会留在这台设备，重新登录同一账号后继续同步。</p>
      <div className="cloud-actions"><Button variant="soft" onClick={() => setConfirmExit(false)}>取消</Button>
        <Button variant="danger" onClick={signOut}>确认退出</Button></div>
    </div> : <Button variant="ghost" onClick={() => setConfirmExit(true)}>退出登录</Button>}
  </section>;
}

function downloadConflict(conflict: SyncConflict) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(conflict, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `cozy-days-conflict-${conflict.remoteVersion ?? conflict.operation}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function describe(value: object | null) {
  return value === null ? '已删除或尚未创建' : JSON.stringify(value, (key, field) =>
    key === 'backgroundImage' ? '（纪念日照片）' : field, 2);
}
