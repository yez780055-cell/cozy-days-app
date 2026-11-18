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
  // Updates wait for the previous version's windows to close before replacing its cache.
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    if (`${url.origin}${url.pathname}` === scope || `${url.origin}${url.pathname}` === index) {
      event.respondWith(cachedShell(index, request));
    }
  } else if (shell.has(request.url)) {
    event.respondWith(cachedShell(request.url, request));
  } else if (fonts.has(request.url)) {
    event.respondWith(cachedFont(request));
  }
});

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
