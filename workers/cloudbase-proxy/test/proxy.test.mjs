import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ALLOWED_ORIGIN, ALLOWED_PATHS, MAX_REQUEST_BYTES, createProxy } from '../src/proxy.js';

const host = 'https://proxy.example.test';
const upstreamHost = 'https://vicarious-cardinal-d6c5m0ec4d9c0.api.tcloudbasegateway.com';
const verification = '/auth/v1/verification';
const headers = { Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json', 'x-device-id': 'synthetic-device' };
function post(path = verification, options = {}) {
  return new Request(host + path, { method: 'POST', headers, body: '{}', ...options });
}
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...extra },
});
function isolated(fetchUpstream, options = {}) {
  const calls = [];
  const proxy = createProxy({ ...options, fetchUpstream: async (...args) => {
    calls.push(args);
    return fetchUpstream ? fetchUpstream(...args) : json({ ok: true });
  } });
  return { proxy, calls };
}
function preflight(extraHeaders = {}, path = verification) {
  return new Request(host + path, { method: 'OPTIONS', headers: {
    Origin: ALLOWED_ORIGIN,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type, Authorization, apikey, X-Device-ID',
    ...extraHeaders,
  } });
}

test('allowlist exactly matches the current cloudbase.ts auth and named RPC calls', () => {
  const source = readFileSync(new URL('../../../src/data/cloudbase.ts', import.meta.url), 'utf8');
  const auth = [...source.matchAll(/'(\/auth\/v1\/[^']+)'/g)].map(match => match[1]);
  const rpc = [...source.matchAll(/'cozy_days_[a-z_]+'/g)]
    .map(match => '/v1/rdb/rest/rpc/' + match[0].slice(1, -1));
  assert.deepEqual([...new Set([...auth, ...rpc])].sort(), [...ALLOWED_PATHS].sort());
  assert.equal(ALLOWED_PATHS.length, 9);
});

test('authorized preflight is 204 with exact CORS, cache and Vary; no upstream call', async () => {
  const { proxy, calls } = isolated();
  for (const path of ALLOWED_PATHS) {
    const response = await proxy(preflight({}, path));
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
    assert.equal(response.headers.get('Access-Control-Max-Age'), '600');
    for (const name of ['content-type', 'authorization', 'apikey', 'x-device-id'])
      assert.ok(response.headers.get('Access-Control-Allow-Headers').includes(name));
    assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
    assert.equal(response.headers.get('Vary'), 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  }
  assert.equal(calls.length, 0);
});

for (const origin of [null, 'null', 'https://evil.example', ALLOWED_ORIGIN + '.evil.example',
  ALLOWED_ORIGIN + '/', 'http://yez780055-cell.github.io', 'https://localhost']) {
  test(`POST and OPTIONS reject origin ${origin} without CORS or upstream contact`, async () => {
    const { proxy, calls } = isolated();
    for (const method of ['POST', 'OPTIONS']) {
      const deniedHeaders = { ...headers };
      if (origin === null) delete deniedHeaders.Origin;
      else deniedHeaders.Origin = origin;
      const response = await proxy(new Request(host + verification, {
        method, headers: deniedHeaders, ...(method === 'POST' ? { body: '{}' } : {}),
      }));
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
      assert.equal(response.headers.get('Vary'), 'Origin');
    }
    assert.equal(calls.length, 0);
  });
}

for (const path of ['/auth/v1/admin', '/auth/v1/verification/', '/auth/v1/verification/extra',
  '/v1/rdb/rest/rpc/admin', '/v1/rdb/rest/rpc/cozy_days_push/extra', '/v1/rdb/rest/table',
  '//evil.example/auth/v1/verification', '/auth%2fv1/verification', '/auth/v1/%76erification',
  '/auth/v1/verification%00', '/auth/v1/verification%2f..%2fadmin', '/%252e%252e/auth/v1/verification']) {
  test(`disallowed path is never forwarded: ${path}`, async () => {
    const { proxy, calls } = isolated();
    assert.equal((await proxy(post(path))).status, 404);
    assert.equal((await proxy(preflight({}, path))).status, 404);
    assert.equal(calls.length, 0);
  });
}

test('normalized dot segments can only resolve to an exact fixed-host allowlisted route', async () => {
  const { proxy, calls } = isolated();
  const response = await proxy(post('/auth/admin/../v1/verification'));
  assert.equal(response.status, 200);
  assert.equal(calls[0][0], upstreamHost + verification);
});

for (const suffix of ['?url=https://evil.example', '?', '#fragment']) {
  test(`query/hash cannot select an upstream: ${suffix}`, async () => {
    const { proxy, calls } = isolated();
    const response = await proxy(post(verification + suffix));
    // URL.search is empty for a bare '?'; forwarding still uses only pathname.
    assert.equal(response.status, suffix === '?' ? 200 : 400);
    if (calls.length) assert.equal(calls[0][0], upstreamHost + verification);
  });
}

for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE']) {
  test(`method ${method} cannot reach CloudBase`, async () => {
    const { proxy, calls } = isolated();
    const response = await proxy(new Request(host + verification, { method, headers }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), 'POST, OPTIONS');
    assert.equal(calls.length, 0);
  });
}

test('preflight rejects missing/unsupported method or headers', async () => {
  const { proxy, calls } = isolated();
  for (const method of ['', 'GET', 'DELETE'])
    assert.equal((await proxy(preflight({ 'Access-Control-Request-Method': method }))).status, 405);
  for (const value of ['cookie', 'authorization, x-admin-key', 'content-type,', 'x-forwarded-host'])
    assert.equal((await proxy(preflight({ 'Access-Control-Request-Headers': value }))).status, 400);
  assert.equal(calls.length, 0);
});

test('only original authentication headers and unchanged JSON bytes reach fixed host', async () => {
  const { proxy, calls } = isolated();
  const body = '{ "verification_token": "synthetic-token", "email": "test@example.test" }';
  const response = await proxy(post('/auth/v1/signup', { body, headers: {
    ...headers, authorization: 'Bearer synthetic-access', apikey: 'synthetic-public-key',
    Cookie: 'admin=secret', Host: 'evil.example', 'X-Forwarded-Host': 'evil.example',
    'X-Admin-Key': 'must-not-forward', 'CF-Access-Jwt-Assertion': 'must-not-forward',
  } }));
  assert.equal(response.status, 200);
  const [target, init] = calls[0];
  assert.equal(target, upstreamHost + '/auth/v1/signup');
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'manual');
  assert.equal(new TextDecoder().decode(init.body), body);
  assert.deepEqual(Object.fromEntries(init.headers), {
    apikey: 'synthetic-public-key', authorization: 'Bearer synthetic-access',
    'content-type': 'application/json', 'x-device-id': 'synthetic-device',
  });
});

test('anonymous RPC is still sent anonymously; no Worker credential is added', async () => {
  const { proxy, calls } = isolated(() => json({ message: 'COZY_AUTH_REQUIRED' }, 401));
  const response = await proxy(post('/v1/rdb/rest/rpc/cozy_days_space'));
  assert.equal(response.status, 401);
  assert.equal(calls[0][1].headers.has('authorization'), false);
});

for (const type of ['', 'text/plain', 'application/jsonp', 'multipart/form-data']) {
  test(`rejects content type ${type}`, async () => {
    const { proxy, calls } = isolated();
    assert.equal((await proxy(post(verification, { headers: { ...headers, 'Content-Type': type } }))).status, 415);
    assert.equal(calls.length, 0);
  });
}

test('header bounds and control characters are rejected without forwarding', async () => {
  const { proxy, calls } = isolated();
  for (const [name, value] of [['x-device-id', 'a'.repeat(257)], ['apikey', 'a'.repeat(16385)],
    ['authorization', 'Bearer\tinjected']]) {
    assert.equal((await proxy(post(verification, { headers: { ...headers, [name]: value } }))).status, 400);
  }
  assert.throws(() => post(verification, { headers: { ...headers, authorization: 'a\r\nX-Admin: yes' } }));
  assert.equal(calls.length, 0);
});

test('actual streamed bytes enforce 1 MiB even with missing or false Content-Length', async () => {
  const { proxy, calls } = isolated();
  for (const declared of [undefined, '1', String(MAX_REQUEST_BYTES + 1)]) {
    const nextHeaders = { ...headers, ...(declared ? { 'Content-Length': declared } : {}) };
    const response = await proxy(post(verification, { body: 'x'.repeat(MAX_REQUEST_BYTES + 1), headers: nextHeaders }));
    assert.equal(response.status, 413);
  }
  for (const declared of ['-1', 'invalid'])
    assert.equal((await proxy(post(verification, { headers: { ...headers, 'Content-Length': declared } }))).status, 413);
  assert.equal(calls.length, 0);
  assert.equal((await proxy(post(verification, { body: 'x'.repeat(MAX_REQUEST_BYTES) }))).status, 200);
});

for (const status of [200, 400, 401, 403, 409, 422, 429, 500, 502, 503]) {
  test(`upstream ${status} body/status preserved, upstream CORS/cache/cookies discarded`, async () => {
    const body = '{ "error": "provider_code", "message": "COZY_SPACE_REQUIRED" }';
    const { proxy, calls } = isolated(() => new Response(body, { status, headers: {
      'Content-Type': 'application/json', 'Retry-After': '60',
      'Access-Control-Allow-Origin': '*', 'Set-Cookie': 'sensitive=synthetic',
      'Cache-Control': 'public, max-age=9999', 'Location': 'https://evil.example',
      Server: 'internal-server', Vary: 'Cookie',
    } }));
    const response = await proxy(post());
    assert.equal(calls.length, 1);
    assert.equal(response.status, status);
    assert.equal(await response.text(), body);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
    assert.equal(response.headers.get('Retry-After'), '60');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Vary'), 'Origin');
    for (const name of ['Set-Cookie', 'Location', 'Server', 'Content-Length', 'Content-Encoding'])
      assert.equal(response.headers.get(name), null);
  });
}

test('bodyless responses are preserved', async () => {
  for (const status of [204, 205]) {
    const { proxy } = isolated(() => new Response(null, { status }));
    assert.equal((await proxy(post())).status, status);
  }
});

for (const status of [301, 302, 303, 307, 308]) {
  test(`redirect ${status} never followed or exposed`, async () => {
    const { proxy, calls } = isolated(() => new Response(null, { status, headers: { Location: 'https://evil.example' } }));
    const response = await proxy(post());
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'PROXY_UPSTREAM_REDIRECT' });
    assert.equal(calls.length, 1);
    assert.equal(response.headers.has('Location'), false);
  });
}

test('network errors never expose exception messages or input secrets', async () => {
  const secrets = 'password=secret verification_code=123456 Authorization=Bearer-token email@example.test';
  const { proxy } = isolated(() => { throw new Error(secrets); });
  const response = await proxy(post(verification, { body: secrets }));
  assert.equal(response.status, 502);
  assert.equal(await response.text(), '{"error":"PROXY_UPSTREAM_UNAVAILABLE"}');
});

test('deadline bounds even a fetch implementation ignoring abort and aborts signal', async () => {
  let signal;
  const { proxy } = isolated((_, init) => { signal = init.signal; return new Promise(() => {}); }, { timeoutMs: 20 });
  const response = await proxy(post());
  assert.equal(response.status, 504);
  assert.equal(signal.aborted, true);
  assert.deepEqual(await response.json(), { error: 'PROXY_UPSTREAM_TIMEOUT' });
});

test('deadline covers stalled inbound and upstream body streams, cancelling them', async () => {
  for (const direction of ['inbound', 'upstream']) {
    let cancelled = false;
    const stream = new ReadableStream({ cancel() { cancelled = true; } });
    const { proxy, calls } = isolated(() => new Response(stream), { timeoutMs: 20 });
    const request = direction === 'inbound' ? post(verification, { body: stream, duplex: 'half' }) : post();
    assert.equal((await proxy(request)).status, 504);
    assert.equal(cancelled, true);
    if (direction === 'inbound') assert.equal(calls.length, 0);
  }
});

test('a late upstream body is cancelled after the deadline, without restarting I/O', async () => {
  let completeFetch;
  let cancelled = false;
  const { proxy } = isolated(() => new Promise(resolve => { completeFetch = resolve; }), { timeoutMs: 20 });
  assert.equal((await proxy(post())).status, 504);
  completeFetch(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('plain HTTP is rejected before any upstream contact', async () => {
  const { proxy, calls } = isolated();
  const request = new Request('http://proxy.example.test' + verification, { method: 'POST', headers, body: '{}' });
  assert.equal((await proxy(request)).status, 400);
  assert.equal(calls.length, 0);
});

test('upstream response size and broken stream yield sanitized 502', async () => {
  for (const stream of [
    new ReadableStream({ start(c) { c.enqueue(new Uint8Array(16 * 1024 * 1024 + 1)); c.close(); } }),
    new ReadableStream({ start(c) { c.error(new Error('secret-provider-diagnostics')); } }),
  ]) {
    const { proxy } = isolated(() => new Response(stream));
    const response = await proxy(post());
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /secret-provider-diagnostics/);
  }
});

test('isolated synthetic verification, signup, signin, refresh, signout and all RPCs reach upstream fixture', async () => {
  const seen = [];
  const { proxy } = isolated((target, init) => {
    const path = new URL(target).pathname;
    const body = JSON.parse(new TextDecoder().decode(init.body));
    seen.push(path);
    switch (path) {
      case '/auth/v1/verification':
        assert.equal(body.email, 'tester@example.test');
        return json({ verification_id: 'synthetic-id' });
      case '/auth/v1/verification/verify':
        assert.equal(body.verification_id, 'synthetic-id');
        assert.equal(body.verification_code, 'synthetic-code');
        return json({ verification_token: 'synthetic-verified' });
      case '/auth/v1/signup':
      case '/auth/v1/signin':
        assert.equal(body.verification_token, 'synthetic-verified');
        return json({ sub: 'synthetic-user', access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600 });
      case '/auth/v1/token':
        assert.equal(body.grant_type, 'refresh_token');
        assert.equal(body.refresh_token, 'synthetic-refresh');
        return json({ access_token: 'synthetic-new-access', refresh_token: 'synthetic-new-refresh' });
      default:
        assert.equal(init.headers.get('Authorization'), 'Bearer synthetic-new-access');
        return path.endsWith('cozy_days_pull') ? json([]) : json({ accepted: true });
    }
  });
  const call = async (path, body, token) => {
    const response = await proxy(post(path, { body: JSON.stringify(body), headers: {
      ...headers, ...(token ? { Authorization: 'Bearer ' + token } : {}),
    } }));
    assert.equal(response.status, 200);
    return response.json();
  };
  const verificationResponse = await call(verification, { email: 'tester@example.test', target: 'ANY' });
  const verified = await call('/auth/v1/verification/verify', {
    verification_id: verificationResponse.verification_id, verification_code: 'synthetic-code',
  });
  for (const path of ['/auth/v1/signup', '/auth/v1/signin'])
    assert.equal((await call(path, verified)).access_token, 'synthetic-access');
  const tokens = await call('/auth/v1/token', { grant_type: 'refresh_token', refresh_token: 'synthetic-refresh' });
  for (const path of ALLOWED_PATHS.filter(path => path.startsWith('/v1/')))
    await call(path, { p_user: 'synthetic-user' }, tokens.access_token);
  await call('/auth/v1/user/signout', {}, tokens.access_token);
  assert.deepEqual(seen.sort(), [...ALLOWED_PATHS].sort());
});
