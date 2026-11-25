import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Asset } from '../../components/Asset';
import { Button } from '../../components/Button';
import { authenticate, CloudError, forgetSession, lookupSpace, sendEmailCode, session, verifyEmailCode, watchSession } from '../../data/cloudbase';
import { cloudScope, openCloudDatabase } from '../../data/localDatabase';
import { useCloudPeriodDatabase } from '../../data/periodDatabase';
import { watchCloudCache } from '../../data/cloudStore';
import { initializeCloudCache, startCloudSync, type SyncStatus } from '../../data/cloudSync';
import type { CloudScope } from '../../data/cloudTypes';
import { setPeriodRecoveryScope } from '../period/recovery';
import { AccountContext } from './CloudAccount';
import './cloud.css';
import { publishStartupSurface } from '../../native/startupReadiness';

type Page = 'loading' | 'welcome' | 'signin' | 'signup' | 'invite' | 'ready' | 'retry' | 'exiting';
type Setup = { invitation?: string; retryPage?: 'signup' | 'invite' };
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
  if (error.code === 'ACCOUNT_NOT_FOUND') return '这个邮箱还没有账号。可以用此邮箱注册。';
  if (error.code === 'ACCOUNT_EXISTS') return '这个邮箱已经注册。请登录后继续。';
  if (error.code === 'COZY_INVITE_INVALID') return '邀请码无效、已使用或已过期。';
  if (error.code === 'invalid_verification_code') return '邮箱验证码有误或已过期。请检查后重试，或重新发送。';
  if (error.status === 429) return '操作太频繁，请稍后重试。';
  if (error.code === 'captcha_required') return '云端暂时限制验证码请求，请稍后重试。';
  if (error.code === 'COZY_AUTH_REQUIRED') return '云端暂时无法确认邮箱验证状态。可重试，或重新验证邮箱。';
  if (error.authRequired) return '登录已过期，请重新验证邮箱。';
  if (error.status === 0) return '暂时无法连接，请在联网后重试。';
  if (error.status === 404 || error.code === 'pgrst202') return '云端空间尚未初始化。';
  return '请求没有完成，请检查输入后重试。';
}

export function CloudGate({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>('loading');
  const entrySurface = useRef<HTMLElement>(null);
  const [email, setEmail] = useState('');
  const [verification, setVerification] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<CloudScope>();
  const [status, setStatus] = useState<SyncStatus>({ phase: 'waiting', pending: 0, conflicts: [] });
  const engine = useRef<ReturnType<typeof startCloudSync>>();
  const openingAccount = useRef<Promise<void>>();
  const exiting = useRef(false);
  const submitting = useRef(false);
  const proof = useRef<{ verification: string; code: string; token: string }>();

  const signOut = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    engine.current?.stop();
    setPage('exiting');
    void forgetSession().finally(() => location.reload());
  }, []);

  const openAccount = useCallback(({ invitation, retryPage }: Setup = {}) => {
    if (openingAccount.current) return openingAccount.current;
    openingAccount.current = (async () => {
      const current = session();
      if (!current) { setPage('welcome'); return; }
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
        setError(message(reason));
        setErrorCode(reason instanceof CloudError ? reason.code : '');
        setPage(retryPage ?? 'retry');
      }
    })().finally(() => { openingAccount.current = undefined; });
    return openingAccount.current;
  }, []);

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

  function resetVerification() {
    setVerification('');
    setCode('');
    proof.current = undefined;
    setError('');
    setErrorCode('');
  }

  function choose(next: 'signin' | 'signup' | 'welcome') {
    resetVerification();
    setPage(next);
  }

  async function reverify() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await forgetSession();
      const next = page === 'signup' ? 'signin' : page === 'invite' ? 'signin' : 'welcome';
      setEmailVerified(false);
      choose(next);
    } catch (reason) {
      setError(message(reason));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(''); setErrorCode('');
    const invitation = invite.trim().toLowerCase();
    try {
      if (page === 'invite' || (page === 'signup' && emailVerified)) {
        await openAccount({ invitation, retryPage: page });
      } else if (page === 'retry') {
        await openAccount();
      } else if (!verification) {
        setVerification(await sendEmailCode(email.trim(), page === 'signup'));
      } else {
        const enteredCode = code.trim();
        if (proof.current?.verification !== verification || proof.current.code !== enteredCode) {
          proof.current = { verification, code: enteredCode, token: await verifyEmailCode(verification, enteredCode) };
        }
        await authenticate(email.trim(), proof.current.token, page === 'signup');
        if (page === 'signup') {
          setEmailVerified(true);
          await openAccount({ invitation, retryPage: 'signup' });
        } else {
          await openAccount(invitation ? { invitation, retryPage: 'invite' } : {});
        }
      }
    } catch (reason) {
      setError(message(reason));
      setErrorCode(reason instanceof CloudError ? reason.code : '');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  useLayoutEffect(() => {
    if (!window.isSecureContext || busy || error || !entrySurface.current ||
        !['welcome', 'signin', 'signup', 'invite'].includes(page)) return;
    return publishStartupSurface(entrySurface.current);
  }, [page, busy, error]);

  const registering = page === 'signup';
  const signedUp = registering && emailVerified;
  const inviteField = <label>邀请码<input type="password" autoComplete="off" required
    minLength={32} maxLength={32} pattern="[0-9A-Fa-f]{32}" value={invite} disabled={busy}
    onChange={event => setInvite(event.currentTarget.value)}/></label>;

  if (!window.isSecureContext) return <div className="app-shell"><section className="phone cloud-gate">
    <h1>小饱日常</h1><p role="alert">双人空间需要安全连接。请使用 HTTPS 版本或 Android 应用打开。</p>
  </section></div>;

  if (page === 'ready' && scope) return <AccountContext.Provider value={{
    email, scope, status, signOut, retry: () => engine.current?.retry(),
  }}>{children}</AccountContext.Provider>;

  return <div className="app-shell"><main ref={entrySurface} className="phone cloud-gate">
    <div className="cloud-gate-content">
      <Asset name="cat" className="cloud-gate-art"/>
      <h1>小饱日常</h1>
      {(page === 'loading' || page === 'exiting') && <p role="status">{page === 'loading' ? '正在打开双人空间…' : '正在退出…'}</p>}
      {page === 'welcome' && <div className="cloud-entry">
        <h2>欢迎来到双人空间</h2>
        <p>第一次使用？请准备你的邮箱和一次性邀请码。</p>
        <Button onClick={() => choose('signup')}>首次使用，注册账号</Button>
        <Button variant="soft" onClick={() => choose('signin')}>已有账号，登录</Button>
      </div>}
      {(page === 'signin' || registering) && <form onSubmit={submit}>
        <h2>{registering ? '注册账号' : '登录双人空间'}</h2>
        {registering && <p>{signedUp ? '邮箱已验证。可以在这里重试加入空间。' : '用自己的邮箱接收验证码，并输入分配给你的一次性邀请码。'}</p>}
        <label>邮箱<input type="email" autoComplete="email" required value={email} readOnly={!!verification || signedUp} disabled={busy}
          onChange={event => setEmail(event.currentTarget.value)}/></label>
        {registering && inviteField}
        {verification && !signedUp && <p role="status">验证码已发送，请查收邮件。</p>}
        {verification && <label>邮箱验证码<input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}"
          maxLength={6} value={code} readOnly={signedUp} disabled={busy} onChange={event => setCode(event.currentTarget.value)}/></label>}
        <Button type="submit" disabled={busy}>{busy ? '请稍候…' : signedUp ? '重试加入空间' :
          verification ? (registering ? '注册并加入空间' : '验证并登录') : '发送验证码'}</Button>
        {!signedUp && verification && <Button variant="ghost" disabled={busy} onClick={resetVerification}>更换邮箱或重新发送</Button>}
        {!signedUp && <Button variant="soft" disabled={busy} onClick={() => choose(registering ? 'signin' : 'signup')}>
          {registering ? '已有账号，返回登录' : errorCode === 'ACCOUNT_NOT_FOUND' ? '用此邮箱注册' : '首次使用，注册账号'}
        </Button>}
        {signedUp && error && <Button variant="soft" disabled={busy} onClick={() => void reverify()}>重新验证邮箱</Button>}
        {!signedUp && <Button variant="ghost" disabled={busy} onClick={() => choose('welcome')}>返回</Button>}
      </form>}
      {page === 'invite' && <form onSubmit={submit}>
        <h2>加入双人空间</h2>
        <p>邮箱已验证，请输入分配给你的邀请码。</p>
        {inviteField}
        <Button type="submit" disabled={busy}>{busy ? '正在加入…' : '加入空间'}</Button>
        {error && <Button variant="soft" onClick={() => void reverify()} disabled={busy}>重新验证邮箱</Button>}
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
