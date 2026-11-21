import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Asset } from '../../components/Asset';
import { Button } from '../../components/Button';
import { authenticate, CloudError, forgetSession, lookupSpace, sendEmailCode, session, watchSession } from '../../data/cloudbase';
import { cloudScope, openCloudDatabase } from '../../data/localDatabase';
import { useCloudPeriodDatabase } from '../../data/periodDatabase';
import { watchCloudCache } from '../../data/cloudStore';
import { initializeCloudCache, startCloudSync, type SyncStatus } from '../../data/cloudSync';
import type { CloudScope } from '../../data/cloudTypes';
import { setPeriodRecoveryScope } from '../period/recovery';
import { AccountContext } from './CloudAccount';
import './cloud.css';

type Page = 'loading' | 'auth' | 'invite' | 'ready' | 'retry' | 'exiting';
let opening: Promise<void> | undefined;

async function openScope(scope: CloudScope) {
  if (!opening) {
    opening = (async () => {
      await openCloudDatabase(scope);
      useCloudPeriodDatabase();
      const key = scope.spaceId + ':' + scope.userId;
      setPeriodRecoveryScope(key);
      watchCloudCache(key);
    })().catch(error => { opening = undefined; throw error; });
  }
  await opening;
  if (cloudScope?.userId !== scope.userId || cloudScope?.spaceId !== scope.spaceId) {
    throw new CloudError(401, 'SESSION_CHANGED');
  }
  await initializeCloudCache(scope);
}

function message(error: unknown) {
  if (!(error instanceof CloudError)) return '暂时无法读取本机记录，请检查浏览器的存储设置。';
  if (error.code === 'COZY_INVITE_INVALID') return '邀请码无效、已使用或已过期。';
  if (error.status === 429) return '操作太频繁，请稍后重试。';
  if (error.code === 'captcha_required') return '云端暂时限制验证码请求，请稍后重试。';
  if (error.code === 'COZY_AUTH_REQUIRED') return '请检查邮箱登录方式是否已启用，再重新验证邮箱。';
  if (error.authRequired) return '登录已过期，请重新验证邮箱。';
  if (error.status === 0) return '暂时无法连接，请在联网后重试。';
  if (error.status === 404 || error.code === 'PGRST202') return '云端空间尚未初始化。';
  return '请求没有完成，请检查输入后重试。';
}

export function CloudGate({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>('loading');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [verification, setVerification] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<CloudScope>();
  const [status, setStatus] = useState<SyncStatus>({ phase: 'waiting', pending: 0, conflicts: [] });
  const engine = useRef<ReturnType<typeof startCloudSync>>();
  const openingAccount = useRef<Promise<void>>();
  const exiting = useRef(false);

  const signOut = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    engine.current?.stop();
    setPage('exiting');
    void forgetSession().finally(() => location.reload());
  }, []);

  const openAccount = useCallback((invitation?: string) => {
    if (openingAccount.current) return openingAccount.current;
    openingAccount.current = (async () => {
      const current = session();
      if (!current) { setPage('auth'); return; }
      setEmail(current.email);
      try {
        const linked = current.scope ?? await lookupSpace(current.userId, invitation);
        if (exiting.current || session()?.userId !== current.userId) return;
        if (!linked) { setPage('invite'); return; }
        await openScope(linked);
        if (exiting.current || session()?.userId !== current.userId) return;
        setScope(linked);
        setPage('ready');
      } catch (reason) {
        if (exiting.current) return;
        if (reason instanceof CloudError && reason.authRequired) { signOut(); return; }
        setError(message(reason));
        setPage(invitation && !session()?.scope ? 'invite' : 'retry');
      }
    })().finally(() => { openingAccount.current = undefined; });
    return openingAccount.current;
  }, [signOut]);

  useEffect(() => {
    if (!window.isSecureContext) return;
    void openAccount();
    return watchSession(next => {
      if (exiting.current) return;
      if (!next || (cloudScope && next.userId !== cloudScope.userId)) {
        exiting.current = true;
        engine.current?.stop();
        setPage('exiting');
        location.reload();
      } else if (!cloudScope) {
        void openAccount();
      }
    });
  }, [openAccount]);

  useEffect(() => {
    if (!scope || page !== 'ready') return;
    const sync = startCloudSync(scope, setStatus, signOut);
    engine.current = sync;
    const updateMembers = () => {
      if (navigator.onLine) void lookupSpace(scope.userId).then(next => {
        if (next && !exiting.current && next.members !== scope.members) setScope(next);
      }).catch(() => {});
    };
    const timer = window.setInterval(updateMembers, 30000);
    return () => { sync.stop(); clearInterval(timer); };
  }, [scope, page, signOut]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (page === 'invite') {
        await openAccount(invite.trim().toLowerCase());
      } else if (page === 'retry') {
        await openAccount();
      } else if (!verification) {
        setVerification(await sendEmailCode(email.trim(), mode === 'signup'));
      } else {
        await authenticate(email.trim(), verification, code.trim(), mode === 'signup');
        setVerification(''); setCode('');
        await openAccount();
      }
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  if (!window.isSecureContext) return <div className="app-shell"><section className="phone cloud-gate">
    <h1>小饱日常</h1><p role="alert">双人空间需要安全连接。请使用 HTTPS 版本或 Android 应用打开。</p>
  </section></div>;

  if (page === 'ready' && scope) return <AccountContext.Provider value={{
    email, scope, status, signOut, retry: () => engine.current?.retry(),
  }}>{children}</AccountContext.Provider>;

  return <div className="app-shell"><main className="phone cloud-gate">
    <div className="cloud-gate-content">
      <Asset name="cat" className="cloud-gate-art"/>
      <h1>小饱日常</h1>
      {(page === 'loading' || page === 'exiting') && <p role="status">{page === 'loading' ? '正在打开双人空间…' : '正在退出…'}</p>}
      {page === 'auth' && <form onSubmit={submit}>
        <h2>{mode === 'signup' ? '注册账号' : '登录双人空间'}</h2>
        <label>邮箱<input type="email" autoComplete="email" required value={email} readOnly={!!verification}
          onChange={event => setEmail(event.currentTarget.value)}/></label>
        {verification && <label>邮箱验证码<input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}"
          maxLength={6} value={code} onChange={event => setCode(event.currentTarget.value)}/></label>}
        <Button type="submit" disabled={busy}>{busy ? '请稍候…' : verification ? '验证邮箱' : '发送验证码'}</Button>
        {verification ? <Button variant="ghost" disabled={busy} onClick={() => {
          setVerification(''); setCode(''); setError('');
        }}>更换邮箱或重新发送</Button> : <Button variant="ghost" disabled={busy} onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin'); setError('');
        }}>{mode === 'signin' ? '首次使用？注册账号' : '已有账号？返回登录'}</Button>}
      </form>}
      {page === 'invite' && <form onSubmit={submit}>
        <h2>加入双人空间</h2>
        <p>邮箱已验证，请输入分配给你的邀请码。</p>
        <label>邀请码<input type="password" autoComplete="off" required
          minLength={32} maxLength={32} pattern="[0-9A-Fa-f]{32}" value={invite}
          onChange={event => setInvite(event.currentTarget.value)}/></label>
        <Button type="submit" disabled={busy}>{busy ? '正在加入…' : '加入空间'}</Button>
        <Button variant="ghost" onClick={signOut} disabled={busy}>退出登录</Button>
      </form>}
      {page === 'retry' && <form onSubmit={submit}>
        <Button type="submit" disabled={busy}>重试连接</Button>
        <Button variant="ghost" onClick={signOut} disabled={busy}>退出登录</Button>
      </form>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
  </main></div>;
}
