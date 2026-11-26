import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('real workerd runtime forwards fixed-host POST and provider errors with exact CORS (synthetic upstream)', async t => {
  const calls = [];
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: ['index.js', 'proxy.js'].map(name => ({
      type: 'ESModule', path: fileURLToPath(new URL('../src/' + name, import.meta.url)),
    })),
    compatibilityDate: '2026-11-26',
    outboundService: async request => {
      calls.push({ url: request.url, method: request.method, body: await request.text(), headers: new Headers(request.headers) });
      return new Response('{"message":"COZY_AUTH_REQUIRED"}', { status: 401, headers: {
        'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Set-Cookie': 'synthetic=sensitive',
      } });
    },
  }));
  t.after(() => runtime.dispose());
  const url = 'https://proxy.example.test/v1/rdb/rest/rpc/cozy_days_space';
  const origin = 'https://yez780055-cell.github.io';
  const options = await runtime.dispatchFetch(url, { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type, Authorization, apikey, x-device-id',
  } });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(calls.length, 0);
  const denied = await runtime.dispatchFetch(url, { method: 'POST', headers: {
    Origin: 'https://unauthorized.example', 'Content-Type': 'application/json',
  }, body: '{}' });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.has('Access-Control-Allow-Origin'), false);
  assert.equal(calls.length, 0);
  const response = await runtime.dispatchFetch(url, { method: 'POST', headers: {
    Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-token',
    apikey: 'synthetic-public', 'x-device-id': 'synthetic-device', Cookie: 'must-not-forward=true',
  }, body: '{"p_invite":null}' });
  assert.equal(response.status, 401);
  assert.equal(await response.text(), '{"message":"COZY_AUTH_REQUIRED"}');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.has('Set-Cookie'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://vicarious-cardinal-d6c5m0ec4d9c0.api.tcloudbasegateway.com/v1/rdb/rest/rpc/cozy_days_space');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body, '{"p_invite":null}');
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer synthetic-token');
  assert.equal(calls[0].headers.get('apikey'), 'synthetic-public');
  assert.equal(calls[0].headers.has('Cookie'), false);
  assert.equal(calls[0].headers.has('Origin'), false);
});
