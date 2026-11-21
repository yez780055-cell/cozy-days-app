import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { openPeriod, recordClosedPeriod } from './period-actions';

const gateway = '**/vicarious-cardinal-d6c5m0ec4d9c0.api.tcloudbasegateway.com/**';
const room = 'cf1390bd-8749-4c04-a975-c4994c871f62';
const users = ['10000000000000001', '10000000000000002', '10000000000000003'];
const email = (n: number) => 'tester' + n + '@example.test';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id bigint primary key, email text, email_verified boolean);
    create function auth.jwt() returns jsonb language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    create function auth.uid() returns text language sql stable as $$ select auth.jwt()->>'sub' $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    insert into auth.users values (${users[0]}, '${email(0)}', true), (${users[1]}, '${email(1)}', true),
      (${users[2]}, '${email(2)}', true), (4, 'unverified@example.test', false);
  `);
  await db.exec(await readFile(new URL('../cloudbase/001_shared_space.sql', import.meta.url), 'utf8'));
  const { rows: invitations } = await db.query<{ code: string }>(
    await readFile(new URL('../cloudbase/issue_invitations.sql', import.meta.url), 'utf8'));

  function rpc(user: string | null, name: 'space' | 'pull' | 'push', args: unknown[]) {
    return db.transaction(async tx => {
      const role = user ? 'authenticated' : 'anon';
      await tx.exec('set local role ' + role);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub:user, role })]);
      const placeholders = args.map((_, i) => '$' + (i + 1)).join(',');
      return (await tx.query<{ value: any }>(`select public.cozy_days_${name}(${placeholders}) as value`, args)).rows[0].value;
    });
  }
  let dropNext = false;
  let dropped = 0;
  let failSignup = false;
  const registered = new Set<string>();
  const requests = { verify: 0, signup: 0, signin: 0, signout: 0 };
  async function install(context: BrowserContext) {
    await context.route(gateway, async route => {
      const req = route.request();
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization, x-device-id, apikey' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status:204, headers });
      const body = req.postDataJSON();
      const path = new URL(req.url()).pathname;
      const user = req.headers().authorization?.slice(7) || null;
      let data: unknown;
      try {
        if (path.endsWith('/verification')) {
          const exists = registered.has(body.email);
          if (body.target === 'USER' && !exists) return route.fulfill({ status:400, headers,
            json:{ code:'FAILED_PRECONDITION', error:'failed_precondition', error_description:'账号不存在' } });
          data = { verification_id:body.email, is_user:exists };
        } else if (path.endsWith('/verify')) {
          requests.verify++;
          if (body.verification_code !== '123456') return route.fulfill({ status:400, headers,
            json:{ error:'invalid_verification_code' } });
          data = { verification_token:body.verification_id };
        }
        else if (path.endsWith('/signup') || path.endsWith('/signin') || path.endsWith('/token')) {
          if (path.endsWith('/signup')) {
            requests.signup++;
            if (failSignup) {
              failSignup = false;
              return route.fulfill({ status:503, headers, json:{ error:'unavailable' } });
            }
            registered.add(body.email);
          }
          if (path.endsWith('/signin')) {
            requests.signin++;
            if (!registered.has(body.verification_token)) return route.fulfill({ status:400, headers,
              json:{ error:'failed_precondition', error_description:'账号不存在' } });
          }
          const sub = users.find((_, i) => email(i) === body.verification_token) ?? body.refresh_token;
          data = { sub, access_token:sub, refresh_token:sub, expires_in:3600 };
        } else if (path.endsWith('/signout')) { requests.signout++; data = {}; }
        else if (path.endsWith('cozy_days_space')) data = await rpc(user, 'space', [body.p_invite]);
        else if (path.endsWith('cozy_days_pull')) data = await rpc(user, 'pull', [body.p_user, body.p_space, body.p_after]);
        else if (path.endsWith('cozy_days_push')) {
          data = await rpc(user, 'push', [body.p_user, body.p_space, body.p_kind, body.p_id,
            body.p_operation, body.p_base, body.p_value]);
          if (dropNext) { dropNext = false; dropped++; return route.abort(); }
        } else throw new Error('Unexpected gateway request ' + path);
      } catch (error) { return route.fulfill({ status:403, headers, json:{ message:(error as Error).message } }); }
      return route.fulfill({ status:200, headers, json:data });
    });
  }
  return { db, rpc, invitations, install, requests, failNextSignup: () => { failSignup = true; },
    dropNext: () => { dropNext = true; }, dropped: () => dropped };
}

test('PostgreSQL enforces two verified members and isolates private records', async () => {
  const { db, rpc, invitations } = await fixture();
  try {
    const [a, b, outsider] = users;
    await expect(rpc(null, 'space', [null])).rejects.toThrow();
    await expect(rpc('4', 'space', [invitations[0].code])).rejects.toThrow('COZY_AUTH_REQUIRED');
    await expect(rpc(a, 'space', [invitations[0].code])).resolves.toMatchObject({ userId:a, members:1 });
    await expect(rpc(outsider, 'space', [invitations[0].code])).rejects.toThrow('COZY_INVITE_INVALID');
    await expect(rpc(b, 'space', [invitations[1].code])).resolves.toMatchObject({ userId:b, members:2 });
    await expect(rpc(a, 'pull', [b, room, 0])).rejects.toThrow('COZY_SPACE_REQUIRED');
    await expect(rpc(outsider, 'pull', [outsider, room, 0])).rejects.toThrow('COZY_SPACE_REQUIRED');
    const push = (user: string, kind: string, id: string, op: string, version: number, content: unknown) =>
      rpc(user, 'push', [user, room, kind, id, op.repeat(32), version, content]);
    const task = { id:42, text:'只给自己看', date:'2026-11-20', completed:false, createdAt:1 };
    expect(await push(a, 'todo', '42', 'a', 0, task)).toMatchObject({ status:'applied' });
    expect(await rpc(b, 'pull', [b, room, 0])).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind:'todo' })]));
    const day = { date:'2026-11-20', symptoms:['腰酸'] };
    const saved = await push(a, 'day', day.date, 'b', 0, day);
    expect(saved).toMatchObject({ status:'applied' });
    expect(await rpc(b, 'pull', [b, room, 0])).toEqual(expect.arrayContaining([expect.objectContaining({ kind:'day', value:day })]));
    const removed = await push(b, 'day', day.date, 'c', saved.version, null);
    expect(removed).toMatchObject({ status:'applied', value:null });
    expect(await push(a, 'day', day.date, 'd', saved.version, day)).toMatchObject({ status:'conflict', reason:'version', value:null });
    expect(await push(b, 'day', day.date, 'c', saved.version, null)).toEqual(removed);
    await expect(push(b, 'day', day.date, 'c', saved.version, day)).rejects.toThrow('COZY_OPERATION_REUSED');
    const overlaps = [{ id:'p1', start:'2026-11-10' }, { id:'p2', start:'2026-11-20' }];
    expect(await push(a, 'periods', 'main', 'e', 0, overlaps)).toMatchObject({ status:'conflict', reason:'period' });
    await expect(db.transaction(async tx => { await tx.exec('set local role authenticated');
      await tx.exec('select * from cozy_days_private.record'); })).rejects.toThrow('permission denied');
  } finally { await db.close(); }
});

async function join(page: Page, index: number, invite?: string) {
  await page.goto('/');
  await page.getByRole('button', { name:invite ? '首次使用，注册账号' : '已有账号，登录' }).click();
  await page.getByLabel('邮箱', { exact:true }).fill(email(index));
  if (invite) await page.getByLabel('邀请码').fill(invite);
  await page.getByRole('button', { name:'发送验证码' }).click();
  await page.getByLabel('邮箱验证码').fill('123456');
  await page.getByRole('button', { name:invite ? '注册并加入空间' : '验证并登录' }).click();
  await expect(page.getByRole('button', { name:'打开应用设置' })).toBeVisible();
}

test('unregistered email can register and retry OTP, account creation and invitation without losing the form', async ({ page, context }) => {
  const f = await fixture();
  try {
    await f.install(context);
    await page.goto('/');
    await expect(page.getByRole('heading', { name:'欢迎来到双人空间' })).toBeVisible();
    await page.getByRole('button', { name:'已有账号，登录' }).click();
    const mailbox = page.getByLabel('邮箱', { exact:true });
    await mailbox.fill(email(0));
    await page.getByRole('button', { name:'发送验证码' }).click();
    await expect(page.getByRole('alert')).toContainText('这个邮箱还没有账号');
    expect(f.requests.signin).toBe(0);
    await page.getByRole('button', { name:'用此邮箱注册' }).click();
    await expect(mailbox).toHaveValue(email(0));

    const invalidInvite = '0'.repeat(32);
    const invite = page.getByLabel('邀请码');
    await invite.fill(invalidInvite);
    await page.getByRole('button', { name:'发送验证码' }).click();
    const code = page.getByLabel('邮箱验证码');
    await code.fill('000000');
    await page.getByRole('button', { name:'注册并加入空间' }).click();
    await expect(page.getByRole('alert')).toContainText('邮箱验证码有误');
    await expect(code).toHaveValue('000000');
    await expect(invite).toHaveValue(invalidInvite);
    expect(f.requests.signup).toBe(0);

    f.failNextSignup();
    await code.fill('123456');
    await page.getByRole('button', { name:'注册并加入空间' }).click();
    await expect(page.getByRole('alert')).toContainText('请求没有完成');
    await expect(code).toHaveValue('123456');
    await expect(mailbox).toHaveValue(email(0));
    await page.getByRole('button', { name:'注册并加入空间' }).click();
    await expect(page.getByRole('alert')).toContainText('邀请码无效');
    await expect(page.getByRole('heading', { name:'注册账号' })).toBeVisible();
    await expect(invite).toHaveValue(invalidInvite);
    await expect(code).toHaveValue('123456');
    await expect(f.rpc(users[0], 'space', [null])).resolves.toBeNull();

    await invite.fill(f.invitations[0].code);
    await page.getByRole('button', { name:'重试加入空间' }).click();
    await expect(page.getByRole('button', { name:'打开应用设置' })).toBeVisible();
    await expect(f.rpc(users[0], 'space', [null])).resolves.toMatchObject({ members:1 });
    expect(f.requests).toEqual({ verify:2, signup:2, signin:0, signout:0 });
    await page.reload();
    await expect(page.getByRole('button', { name:'打开应用设置' })).toBeVisible();
  } finally { await f.db.close(); }
});
const go = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact:true }).click();
const kick = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));
const detail = (page: Page, name: string) => page.getByRole('button', { name:'查看详情：' + name });
async function anniversary(page: Page, name: string, previous?: string) {
  if (previous) {
    await detail(page, previous).click();
    await page.getByRole('button', { name:'编辑纪念日', exact:true }).click();
  } else await page.getByRole('button', { name:'新增纪念日', exact:true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('纪念日名称').fill(name);
  await form.getByLabel('日期', { exact:true }).fill('2026-11-21');
  await form.getByRole('button', { name:'保存纪念日' }).click();
  await expect(form).toHaveCount(0);
}
async function settings(page: Page) {
  await go(page, '首页');
  await page.getByRole('button', { name:'打开应用设置' }).click();
  await page.getByRole('button', { name:/账号与同步/ }).click();
}

test('browser syncs after reconnect, retries a committed write and preserves a conflicting draft', async ({ browser }) => {
  const f = await fixture();
  const aContext = await browser.newContext({ viewport:{ width:393, height:852 } });
  const bContext = await browser.newContext({ viewport:{ width:393, height:852 } });
  const a = await aContext.newPage(), b = await bContext.newPage();
  const remote = async () => (await f.rpc(users[1], 'pull', [users[1], room, 0]))
    .find((row: any) => row.kind === 'anniversary')?.value?.name;
  try {
    await Promise.all([f.install(aContext), f.install(bContext)]);
    await join(a, 0, f.invitations[0].code);
    await join(b, 1, f.invitations[1].code);
    await a.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout:20000 });
    await go(a, '纪念日');
    await aContext.setOffline(true);
    await anniversary(a, '离线创建');
    await a.reload();
    await go(a, '纪念日');
    await expect(detail(a, '离线创建')).toBeVisible();
    expect(await remote()).toBeUndefined();
    f.dropNext();
    await aContext.setOffline(false);
    await expect.poll(f.dropped).toBe(1);
    await a.reload();
    await go(a, '纪念日');
    await expect(detail(a, '离线创建')).toBeVisible();
    await go(b, '纪念日');
    await kick(b);
    await expect(detail(b, '离线创建')).toBeVisible();
    await aContext.setOffline(true);
    await anniversary(a, '设备 A 修改', '离线创建');
    await anniversary(b, '设备 B 先保存', '离线创建');
    await expect.poll(remote).toBe('设备 B 先保存');
    await aContext.setOffline(false);
    await settings(a);
    await expect(a.getByRole('heading', { name:'同步冲突' })).toBeVisible();
    await a.getByText('比较两个版本', { exact:true }).click();
    await expect(a.getByText(/设备 A 修改/)).toBeVisible();
    await a.getByRole('button', { name:'保留云端版本' }).click();
    await expect(a.getByRole('heading', { name:'同步冲突' })).toHaveCount(0);
    await go(a, '纪念日');
    await expect(detail(a, '设备 B 先保存')).toBeVisible();

    const [start, end] = await b.evaluate(() => [-3, -1].map(offset => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')].join('-');
    }));
    await openPeriod(b);
    await recordClosedPeriod(b, start, end);
    await expect.poll(async () => (await f.rpc(users[0], 'pull', [users[0], room, 0]))
      .find((row: any) => row.kind === 'periods')?.value?.[0]?.start).toBe(start);
    await openPeriod(a);
    await kick(a);
    await expect(a.locator('.period-calendar').first().locator('button.actual').first()).toBeVisible();

    await go(a, '首页');
    await a.getByRole('button', { name:'添加待办', exact:true }).click();
    const form = a.getByRole('dialog');
    await form.getByRole('textbox').first().fill('A 的私密待办');
    await form.getByRole('button', { name:'保存', exact:true }).click();
    await expect(a.getByRole('button', { name:'编辑：A 的私密待办' })).toBeVisible();
    await settings(a);
    await a.getByRole('button', { name:'退出登录', exact:true }).click();
    await a.getByRole('button', { name:'确认退出', exact:true }).click();
    await expect(a.getByRole('heading', { name:'欢迎来到双人空间' })).toBeVisible();
    await join(a, 1);
    await go(a, '待办');
    await expect(a.getByRole('button', { name:'编辑：A 的私密待办' })).toHaveCount(0);
  } finally {
    await Promise.all([aContext.close(), bContext.close()]);
    await f.db.close();
  }
});
