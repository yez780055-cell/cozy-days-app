// Read-only negative probes. Never sends email, creates accounts, joins a space,
// refreshes a real session, or mutates records. No credentials are accepted.
import assert from 'node:assert/strict';
import { ALLOWED_ORIGIN, ALLOWED_PATHS } from '../src/proxy.js';

const upstream = 'https://vicarious-cardinal-d6c5m0ec4d9c0.api.tcloudbasegateway.com';
const input = process.env.COZY_PROXY_TEST_URL;
if (!input) throw new Error('Set COZY_PROXY_TEST_URL to the deployed staging workers.dev HTTPS origin.');
const parsed = new URL(input);
if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(parsed.hostname)
  || parsed.port || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash)
  throw new Error('Expected only a staging workers.dev HTTPS origin.');
const base = parsed.origin;
const report = { kind: 'real-network-negative-probe', checkedAt: new Date().toISOString(), checks: [] };
async function send(target, options) {
  return fetch(target, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
}
try {
  for (const path of ALLOWED_PATHS) {
    const response = await send(base + path, { method: 'OPTIONS', headers: {
      Origin: ALLOWED_ORIGIN, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, Authorization, apikey, x-device-id',
    } });
    assert.equal(response.status, 204, 'Allowed preflight status');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN, 'Allowed preflight origin');
    assert.equal(response.headers.get('Access-Control-Max-Age'), '600', 'Preflight cache');
    assert.ok(response.headers.get('Vary')?.toLowerCase().includes('origin'), 'Preflight Vary');
    report.checks.push({ path, kind: 'preflight', status: response.status });
  }
  for (const origin of [undefined, 'https://unauthorized.example']) {
    for (const method of ['POST', 'OPTIONS']) {
      const response = await send(base + '/auth/v1/signin', { method, headers: {
        ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json',
        ...(method === 'OPTIONS' ? { 'Access-Control-Request-Method': 'POST' } : {}),
      }, ...(method === 'POST' ? { body: '{}' } : {}) });
      assert.equal(response.status, 403, 'Disallowed/missing origin status');
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), null, 'Denied origin has no CORS grant');
      report.checks.push({ kind: origin ? 'denied-origin' : 'missing-origin', method, status: response.status });
    }
  }
  // Both requests must be rejected by the real provider; a Worker-generated
  // status or error is a failure, not evidence of CloudBase connectivity.
  for (const path of ['/auth/v1/signin', '/v1/rdb/rest/rpc/cozy_days_space']) {
    const options = { method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-device-id': 'cozy-proxy-readonly-probe',
    }, body: '{}' };
    const direct = await send(upstream + path, options);
    const proxied = await send(base + path, { ...options, headers: { ...options.headers, Origin: ALLOWED_ORIGIN } });
    assert.ok(direct.status >= 400 && direct.status < 500, 'Real provider must reject anonymous/invalid input');
    assert.equal(proxied.status, direct.status, 'Proxy must preserve real provider rejection');
    assert.equal(proxied.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN, 'Provider error CORS');
    const directBody = await direct.json();
    const proxyBody = await proxied.json();
    const directCode = directBody.error ?? directBody.code;
    const proxyCode = proxyBody.error ?? proxyBody.code;
    assert.ok(typeof directCode === 'string' && directCode.length > 0, 'Provider must return a business error');
    assert.equal(proxyCode, directCode, 'Real upstream business code must match');
    assert.ok(!proxyCode.startsWith('PROXY_'), 'Worker failure is not upstream evidence');
    report.checks.push({ path, kind: 'real-upstream-rejection', status: proxied.status, matchedProviderCode: true });
  }
  report.result = 'passed-negative-probes-only';
  report.pending = ['real email delivery', 'verification', 'signup', 'signin', 'refresh', 'signout', 'authenticated RPC', 'device regression'];
  console.log(JSON.stringify(report, null, 2));
} catch {
  // Do not print raw fetch errors, response bodies, stack traces or assertions
  // containing potentially sensitive actual/expected provider values.
  console.error(JSON.stringify({ ...report, result: 'failed', message: 'Live negative probe failed; investigate privately. No authentication success is claimed.' }, null, 2));
  process.exitCode = 1;
}
