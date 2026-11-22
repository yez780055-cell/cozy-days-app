import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let sequence = 0;
const repository = 'yez780055-cell/cozy-days-app';

export function classifyResponse(status, headers, body, now = Date.now(), attempt = 0) {
  const limited = status === 429 || status === 403 && (headers.get('x-ratelimit-remaining') === '0'
    || headers.has('retry-after') || /(?:secondary rate limit|API rate limit exceeded|abuse detection)/i.test(body));
  if (!limited) return { reason: status === 403 ? 'forbidden' : 'http-error', delayMs: null };
  const after = headers.get('retry-after');
  const retryAfter = after === null ? 0 : /^\d+$/.test(after) ? Number(after) * 1000 : Date.parse(after) - now;
  const reset = Number(headers.get('x-ratelimit-reset')) * 1000;
  const primary = headers.get('x-ratelimit-remaining') === '0';
  const delayMs = Math.max(1000, Number.isFinite(retryAfter) ? retryAfter : 0,
    primary && reset > 0 ? reset - now + 1000 : 0,
    (!primary && after === null || primary && reset <= 0) ? 60_000 * 2 ** attempt : 0);
  return { reason: primary ? 'primary-rate-limit' : 'secondary-rate-limit', delayMs };
}

function saveResponse(record, bytes, directory) {
  mkdirSync(directory, { recursive: true });
  const id = `${String(++sequence).padStart(3, '0')}-${record.kind}`;
  writeFileSync(join(directory, id + '.json'), JSON.stringify(record, null, 2) + '\n');
  // Keep the entire API/error body, never just the status assertion or a shortened message.
  if (record.kind === 'release-api' || record.status !== 200) writeFileSync(join(directory, id + '.body'), bytes);
}

// No credentials, cookies, token lookup or authenticated fallback. Used for both API and stable asset URLs.
export async function anonymousGet(url, { kind, fetchImpl = fetch, now = Date.now,
  wait = ms => new Promise(done => setTimeout(done, ms)), maxWaitMs = 10 * 60_000,
  attempts = 5, directory = 'artifacts/android-web-http', record = saveResponse, log = console.log } = {}) {
  const started = now();
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, { headers: {
        'User-Agent': 'Cozy-Days-Anonymous-Release-Verification',
        Accept: kind === 'release-api' ? 'application/vnd.github+json' : 'application/octet-stream',
      }, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
    } catch (error) {
      // Do not invent an HTTP diagnosis for a transport error.
      log(JSON.stringify({ kind, url, reason: 'transport-error', message: error.message }));
      throw error;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const headers = Object.fromEntries(response.headers.entries());
    const body = response.status === 200 ? '' : bytes.toString('utf8');
    const diagnosis = classifyResponse(response.status, response.headers, body, now(), attempt);
    const details = { kind, url, finalUrl: response.url, status: response.status, headers,
      bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      ...(response.status === 200 ? { reason: 'ok' } : { ...diagnosis, body }) };
    record(details, bytes, directory);
    if (response.status === 200) return bytes;
    log(JSON.stringify(details));
    if (diagnosis.delayMs === null || attempt === attempts - 1 || now() - started + diagnosis.delayMs > maxWaitMs) {
      throw new Error(`Anonymous ${kind} HTTP ${response.status} (${diagnosis.reason}); full response saved in ${directory}`
        + (diagnosis.delayMs === null ? '' : `; next retry no earlier than ${new Date(now() + diagnosis.delayMs).toISOString()}`));
    }
    // Honor the full delay, but emit a heartbeat at least once per minute.
    let remaining = diagnosis.delayMs;
    while (remaining > 0) {
      const slice = Math.min(remaining, 60_000);
      log(`Anonymous ${kind}: ${diagnosis.reason}; waiting ${Math.ceil(remaining / 1000)} seconds, no authenticated fallback`);
      await wait(slice); remaining -= slice;
    }
  }
}

// A one-request API probe plus an independent tiny asset download, to capture runner-specific evidence.
// A rate-limited probe is diagnostic only: it must never be reported as successful release verification.
export async function probe(tag) {
  if (!/^android-web-shell-3-web-[1-9][0-9]*$/.test(tag)) throw new Error('Invalid shell 3 tag');
  const results = [];
  for (const [kind, url] of [
    ['release-api', `https://api.github.com/repos/${repository}/releases/tags/${tag}`],
    ['release-asset', `https://github.com/${repository}/releases/download/${tag}/latest.json`],
  ]) {
    let captured;
    try {
      await anonymousGet(url, { kind, attempts: 1, record: (details, bytes, directory) => {
        captured = details; saveResponse(details, bytes, directory);
      } });
    } catch (error) {
      if (!captured || !['primary-rate-limit', 'secondary-rate-limit'].includes(captured.reason)) throw error;
    }
    results.push(captured);
  }
  console.log(JSON.stringify({ diagnosticOnly: true, results }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== 'probe') throw new Error('Expected probe <published-tag>');
  await probe(process.argv[3]);
}
