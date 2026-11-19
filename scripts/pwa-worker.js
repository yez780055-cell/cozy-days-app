const scope = self.registration.scope;
const cachePrefix = `cozy-days-shell:${scope}:`;
const cacheName = `${cachePrefix}${VERSION}`;
const index = new URL('index.html', scope).href;
const shell = new Set(ASSETS.entries.map(({ path }) => new URL(path, scope).href));
const fonts = new Set(ASSETS.fonts.map(path => new URL(path, scope).href));

self.addEventListener('install', event => {
  // addAll is atomic. Integrity avoids mixing files from different deploys at the CDN edge.
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(
    ASSETS.entries.map(({ path, integrity }) => new Request(new URL(path, scope), {
      cache: 'reload', integrity,
    })),
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await pruneShells().catch(() => {});
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    if (`${url.origin}${url.pathname}` === scope || `${url.origin}${url.pathname}` === index) {
      event.respondWith(cachedShell(index, request));
      if (event.resultingClientId) event.waitUntil(pruneShells(event.resultingClientId).catch(() => {}));
    }
  } else if (shell.has(request.url)) {
    event.respondWith(cachedShell(request.url, request));
  } else if (fonts.has(request.url)) {
    event.respondWith(cachedFont(request));
  } else if (request.url.startsWith(new URL('assets/', scope).href)) {
    // Older open tabs can still request their version's hashed assets offline.
    event.respondWith((async () => {
      const keys = await caches.keys();
      for (const cacheName of keys.filter(key => key.startsWith(cachePrefix)).reverse()) {
        const cached = await caches.match(request, { cacheName });
        if (cached) return cached;
      }
      return fetch(request);
    })());
  }
});

async function pruneShells(incomingClientId) {
  const keys = (await caches.keys()).filter(key => key.startsWith(cachePrefix));
  const current = keys.indexOf(cacheName);
  if (current < 2) return;
  // A claimed client may still be running any earlier build. Only a fresh
  // navigation (or an activation with no open pages) can prove those are gone.
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (windows.some(client => client.id !== incomingClientId && client.url.startsWith(scope))) return;
  // Retain one previous shell and leave newer installing/waiting caches alone.
  await Promise.all(keys.slice(0, current - 1).map(key => caches.delete(key)));
}

async function cachedShell(key, request) {
  const cache = await caches.open(cacheName);
  return (await cache.match(key)) ?? fetch(request);
}

async function cachedFont(request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone()).catch(() => {});
  return response;
}
