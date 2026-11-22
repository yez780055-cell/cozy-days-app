import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anonymousGet, classifyResponse } from './android-web-http.mjs';

const url = 'https://api.github.com/repos/yez780055-cell/cozy-days-app/releases/tags/android-web-shell-3-web-3';
const options = { kind: 'release-api', record() {}, log() {} };

test('primary limit waits until reset, preserves full evidence and stays anonymous on every request', async () => {
  let time = 0, calls = 0;
  const records = [], waits = [];
  const body = JSON.stringify({ message: 'API rate limit exceeded for public IP', documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting' });
  const bytes = await anonymousGet(url, { ...options, now: () => time, maxWaitMs: 120_000,
    record: (details, data) => records.push({ details, body: data.toString() }),
    wait: async ms => { waits.push(ms); time += ms; },
    fetchImpl: async (target, init) => {
      assert.equal(target, url);
      assert.deepEqual(Object.keys(init.headers).sort(), ['Accept', 'User-Agent']);
      assert.ok(!JSON.stringify(init).toLowerCase().includes('authorization'));
      return calls++ === 0 ? new Response(body, { status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '60', 'x-github-request-id': 'fixture-request' } })
        : new Response('{"draft":false}', { status: 200 });
    },
  });
  assert.equal(bytes.toString(), '{"draft":false}'); assert.equal(calls, 2);
  assert.deepEqual(waits, [60_000, 1000]);
  assert.equal(records[0].body, body); assert.equal(records[0].details.body, body);
  assert.equal(records[0].details.headers['x-github-request-id'], 'fixture-request');
  assert.equal(records[0].details.reason, 'primary-rate-limit');
});

test('secondary limits honor Retry-After seconds/date, otherwise exponential one-minute waits', () => {
  assert.equal(classifyResponse(429, new Headers({ 'retry-after': '90' }), '', 0).delayMs, 90_000);
  assert.equal(classifyResponse(403, new Headers({ 'retry-after': 'Thu, 01 Jan 1970 00:02:00 GMT' }), '', 0).delayMs, 120_000);
  assert.equal(classifyResponse(403, new Headers(), 'secondary rate limit', 0, 2).delayMs, 240_000);
  assert.equal(classifyResponse(403, new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '120', 'retry-after': '180' }), '', 0).delayMs, 180_000);
});

test('permission 403 fails immediately and distinguishes asset failures from API queries', async () => {
  let calls = 0, waits = 0, evidence;
  await assert.rejects(anonymousGet('https://github.com/yez780055-cell/cozy-days-app/releases/download/android-web-shell-3-web-3/latest.json', {
    ...options, kind: 'release-asset', wait: async () => { waits++; }, record: details => { evidence = details; },
    fetchImpl: async () => { calls++; return new Response('Forbidden\nfull response body\n', { status: 403, headers: { 'x-ratelimit-remaining': '15' } }); },
  }), /Anonymous release-asset HTTP 403 \(forbidden\)/);
  assert.equal(calls, 1); assert.equal(waits, 0);
  assert.equal(evidence.body, 'Forbidden\nfull response body\n');
  assert.equal(evidence.kind, 'release-asset');
});

test('a reset beyond the bounded waiting budget fails without retrying early', async () => {
  let calls = 0;
  await assert.rejects(anonymousGet(url, { ...options, now: () => 0, maxWaitMs: 60_000,
    wait: async () => assert.fail('must not retry before reset'),
    fetchImpl: async () => { calls++; return new Response('rate limited', { status: 403,
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '3600' } }); },
  }), /primary-rate-limit.*next retry no earlier than/);
  assert.equal(calls, 1);
});

test('repeated secondary limits stop after a finite number of anonymous attempts', async () => {
  let calls = 0, time = 0;
  await assert.rejects(anonymousGet(url, { ...options, attempts: 3, now: () => time,
    wait: async ms => { time += ms; }, fetchImpl: async () => {
      calls++; return new Response('secondary rate limit', { status: 429, headers: { 'retry-after': '1' } });
    },
  }), /secondary-rate-limit/);
  assert.equal(calls, 3); assert.equal(time, 2000);
});

test('publish-only recovery has read permissions, original-run provenance and no key or mutation steps', () => {
  const workflow = readFileSync('.github/workflows/android-web-publish-retry.yml', 'utf8').replace(/\r\n/g, '\n');
  assert.match(workflow, /permissions:\n  contents: read\n  actions: read/);
  assert.doesNotMatch(workflow, /secrets\.|contents: write|PackAndroidWeb|assembleRelease|npm run build|keytool|signer\.jks|release upload/);
  assert.match(workflow, /name: deployed-signed-android-web/);
  assert.match(workflow, /run-id: \$\{\{ inputs.source_run \}\}/);
  assert.match(workflow, /assert.equal\(run.path, '\.github\/workflows\/deploy-pages.yml'\)/);
  assert.match(workflow, /verify-published signed "\$ORIGINAL_SOURCE"/);
  const deploy = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
  const ignored = deploy.split('paths-ignore:')[1]?.split('  workflow_dispatch:')[0];
  for (const path of ['.github/workflows/android-web-publish-retry.yml', 'scripts/android-web-http.mjs', 'scripts/android-web-auto.mjs'])
    assert.ok(ignored?.includes(path), 'Publisher maintenance must not create a newly signed revision');
  assert.doesNotMatch(ignored, /src\/|android\/|public\//);
});
