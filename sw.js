const CACHE_NAME = 'pulse50-pwa-v5';
const ASSETS = [
  '/manifest.json',
  '/privacy-policy.html',
  '/about.html',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) =>
      Promise.all(ks.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Always fetch fresh HTML pages from Netlify first
  if (e.request.mode === 'navigate' || e.request.url.endsWith('.html') || e.request.url.endsWith('/')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (e.request.url.includes('rss2json.com') || e.request.url.includes('allorigins.win')) return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});