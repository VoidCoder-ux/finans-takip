const CACHE = 'finanstakip-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './vendor/chart.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const API_HOSTS = ['api.deepseek.com', 'finans.truncgil.com', 'api.frankfurter.app'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return Promise.all(ASSETS.map(function(asset) {
        return c.add(asset).catch(function() { return null; });
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (API_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(function() { return new Response('', { status: 504, statusText: 'Offline' }); }));
    return;
  }
  var isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1;
  if (isHTML) {
    e.respondWith(
      fetch(req).then(function(resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE).then(function(c) { c.put('./index.html', copy); });
        }
        return resp;
      }).catch(function() {
        return caches.match('./index.html').then(function(cached) { return cached || caches.match('./'); });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function(cached) {
      return cached || fetch(req).then(function(resp) {
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          var copy = resp.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function() { return new Response('', { status: 504, statusText: 'Offline' }); });
    })
  );
});
