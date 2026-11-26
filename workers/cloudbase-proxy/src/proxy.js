const UPSTREAM = 'https://vicarious-cardinal-d6c5m0ec4d9c0.api.tcloudbasegateway.com';
export const ALLOWED_ORIGIN = 'https://yez780055-cell.github.io';
export const ALLOWED_PATHS = Object.freeze([
  '/auth/v1/verification',
  '/auth/v1/verification/verify',
  '/auth/v1/signup',
  '/auth/v1/signin',
  '/auth/v1/token',
  '/auth/v1/user/signout',
  '/v1/rdb/rest/rpc/cozy_days_space',
  '/v1/rdb/rest/rpc/cozy_days_pull',
  '/v1/rdb/rest/rpc/cozy_days_push',
]);
const REQUEST_HEADERS = ['content-type', 'authorization', 'apikey', 'x-device-id'];
export const MAX_REQUEST_BYTES = 1024 * 1024;
// cozy_days_pull returns at most 16 records, each limited to 650,000 bytes in SQL.
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 12000; // The existing client deadline is 15 seconds.

class ProxyError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function responseHeaders(authorized) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
  });
  if (authorized) headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  return headers;
}

function failure(status, code, authorized) {
  const headers = responseHeaders(authorized);
  headers.set('Content-Type', 'application/json');
  if (status === 405) headers.set('Allow', 'POST, OPTIONS');
  return new Response(JSON.stringify({ error: code }), { status, headers });
}

async function limitedBody(stream, maximum, status, code, signal) {
  if (signal.aborted) {
    void stream?.cancel().catch(() => {});
    throw new ProxyError(504, 'PROXY_UPSTREAM_TIMEOUT');
  }
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new ProxyError(status, code);
      chunks.push(value);
    }
    if (signal.aborted) throw new ProxyError(504, 'PROXY_UPSTREAM_TIMEOUT');
  } finally {
    // Do not wait for cancellation of an untrusted/failed stream.
    void reader.cancel().catch(() => {});
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

// Dependency injection is for isolated tests. No upstream URL or policy is read
// from request data, environment variables, or Worker bindings.
export function createProxy({ fetchUpstream = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  return async request => {
    const authorized = request.headers.get('Origin') === ALLOWED_ORIGIN;
    if (!authorized) return failure(403, 'PROXY_ORIGIN_DENIED', false);
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password)
      return failure(400, 'PROXY_URL_DENIED', true);
    if (!ALLOWED_PATHS.includes(url.pathname)) return failure(404, 'PROXY_PATH_DENIED', true);
    if (!['POST', 'OPTIONS'].includes(request.method)) return failure(405, 'PROXY_METHOD_DENIED', true);

    if (request.method === 'OPTIONS') {
      if (request.headers.get('Access-Control-Request-Method') !== 'POST')
        return failure(405, 'PROXY_METHOD_DENIED', true);
      const requested = request.headers.get('Access-Control-Request-Headers');
      if (requested !== null && requested.split(',').some(name => !REQUEST_HEADERS.includes(name.trim().toLowerCase())))
        return failure(400, 'PROXY_HEADERS_DENIED', true);
      const headers = responseHeaders(true);
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', REQUEST_HEADERS.join(', '));
      headers.set('Access-Control-Max-Age', '600');
      headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      return new Response(null, { status: 204, headers });
    }

    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || ''))
      return failure(415, 'PROXY_JSON_REQUIRED', true);
    const declaredLength = request.headers.get('Content-Length');
    if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES))
      return failure(413, 'PROXY_BODY_TOO_LARGE', true);
    const headers = new Headers();
    for (const name of REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value === null) continue;
      const maximum = name === 'x-device-id' ? 256 : 16384;
      if (value.length > maximum || /[\x00-\x1f\x7f]/.test(value))
        return failure(400, 'PROXY_HEADERS_DENIED', true);
      headers.set(name, value);
    }

    const controller = new AbortController();
    let expired = false;
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        controller.abort();
        reject(new ProxyError(504, 'PROXY_UPSTREAM_TIMEOUT'));
      }, timeoutMs);
    });
    try {
      return await Promise.race([deadline, (async () => {
        const body = await limitedBody(request.body, MAX_REQUEST_BYTES, 413, 'PROXY_BODY_TOO_LARGE', controller.signal);
        // Only the normalized, exact allowlisted path is used. Never forward the
        // incoming Host, Origin, cookies, URL parameters or proxy headers.
        const upstream = await fetchUpstream(UPSTREAM + url.pathname, {
          method: 'POST', headers, body, signal: controller.signal, redirect: 'manual',
        });
        if (upstream.status >= 300 && upstream.status < 400) {
          void upstream.body?.cancel().catch(() => {});
          throw new ProxyError(502, 'PROXY_UPSTREAM_REDIRECT');
        }
        const bytes = await limitedBody(upstream.body, MAX_RESPONSE_BYTES, 502, 'PROXY_UPSTREAM_TOO_LARGE', controller.signal);
        const output = responseHeaders(true);
        for (const name of ['Content-Type', 'Retry-After']) {
          const value = upstream.headers.get(name);
          if (value !== null) output.set(name, value);
        }
        output.set('Access-Control-Expose-Headers', 'Retry-After');
        // Preserve CloudBase business errors, status and body byte for byte.
        // Token-bearing successful responses remain no-store, with no logging.
        return new Response([204, 205].includes(upstream.status) ? null : bytes, {
          status: upstream.status, headers: output,
        });
      })()]);
    } catch (error) {
      controller.abort();
      if (expired) return failure(504, 'PROXY_UPSTREAM_TIMEOUT', true);
      if (error instanceof ProxyError) return failure(error.status, error.code, true);
      // Never serialize an exception, header, request body or URL into an error.
      return failure(502, 'PROXY_UPSTREAM_UNAVAILABLE', true);
    } finally {
      clearTimeout(timer);
    }
  };
}
