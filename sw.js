/* Monsoon Merchant service worker: caches the whole game so it runs with no connection. */
const CACHE = 'mm-2.2.0';
const ASSETS = ['./', './index.html', './style.css', './engine.js', './map.js', './logistics.js', './network-ui.js', './company-actions.js', './company-play.js', './company-world.js', './company.css', './art.js', './pixel.js', './sfx.js', './ui.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', event => {
  // Bypass the HTTP cache so an update never mixes old and new files.
  const reqs = ASSETS.map(u => typeof Request === 'function' ? new Request(u, { cache: 'reload' }) : u);
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(reqs)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('mm-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const appPath = new URL('./', self.location.href).pathname;
  if (req.mode === 'navigate' && (url.pathname === appPath || url.pathname === appPath + 'index.html')) {
    event.respondWith(
      caches.match('./index.html').then(hit => hit || fetch(req)).catch(() => caches.match('./index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
