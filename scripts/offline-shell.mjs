import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
/** Cache only the built application shell. Saves remain exclusively in IndexedDB. */
export function offlineShell() {
  return {
    name: 'voxel-offline-shell', apply: 'build', enforce: 'post',
    generateBundle(_options, bundle) {
      const publicFiles = ['manifest.webmanifest', 'icon.svg'];
      const files = ['index.html', ...Object.keys(bundle).filter(f => /\.(js|css)$/.test(f)), ...publicFiles];
      const version = createHash('sha256').update(files.join('|'));
      for (const file of publicFiles) version.update(readFileSync(new URL(`../public/${file}`, import.meta.url)));
      const cache = `voxel-shell-${version.digest('hex').slice(0, 16)}`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files)};
const urls = FILES.map(f => new URL(f, self.registration.scope).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls))));
// Wait for existing tabs to close before replacing their application version.
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('voxel-shell-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(new URL('index.html', self.registration.scope).href)));
  } else if (urls.includes(url.href)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fetch(request)));
  }
});
` });
    },
  };
}
