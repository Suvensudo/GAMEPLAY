/* NEON DASH — service worker
   Amaç: offline oynanabilsin + telefona kurulabilsin.
   Strateji:
     - index.html  -> network-first  (yeni sürüm anında gelsin, offline'da önbellek)
     - diğerleri   -> cache-first    (hızlı açılış)
   Yeni sürüm yayınlarken CACHE adındaki numarayı artır (v2 -> v3). */
const CACHE = 'neon-dash-v15';
const ASSETS = [
  './',
  './index.html',
  './gizlilik.html',
  './sartlar.html',
  './lisanslar.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './assets/boot.js',
  './assets/tailwind.css',
  './assets/script_0.js',
  './assets/script_1.js',
  './assets/script_2.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHTML(req) {
  return req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') !== -1;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  if (isHTML(req)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
