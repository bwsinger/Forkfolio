import { self } from '$app/service-worker';
import { version } from '$app/env';
import { immutable, assets } from '$app/manifest';
const cacheName = `forkfolio-${version}`;
const paths = [
  '/',
  ...immutable.map((a) => '/' + a.path.replace(/^\//, '')),
  ...assets.map((a) => '/' + a.path.replace(/^\//, ''))
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(paths)));
  // Wait for existing cooking tabs to close before activating an update.
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('forkfolio-') && key !== cacheName)
          await caches.delete(key);
      await self.clients.claim();
    })()
  );
});
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      if (request.mode === 'navigate')
        return (await cache.match('/')) ?? fetch(request);
      return (await cache.match(request)) ?? fetch(request);
    })()
  );
});
