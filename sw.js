const CACHE = 'finanstakip-v18';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './vendor/chart.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return Promise.all(ASSETS.map(function(asset) {
        return c.add(asset).catch(function() { return null; });
      }));
    }).then(function() { return self.skipWaiting(); })
  );
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
  // Dış servisler (kur, AI, eşitleme sunucusu) ve eşitleme API'si hiç önbelleğe alınmaz: eski veri görülmesin
  if (url.origin !== self.location.origin || url.pathname.indexOf('/v1/') !== -1) return;
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

// ---- Uygulama kapalıyken bildirim ----
// Sunucu içeriksiz push atar; metin, uygulamanın IndexedDB'ye yazdığı hatırlatma listesinden burada oluşturulur.
function readReminders() {
  return new Promise(function(res) {
    try {
      var r = indexedDB.open('finanstakip', 1);
      r.onupgradeneeded = function() { r.result.createObjectStore('kv'); };
      r.onerror = function() { res([]); };
      r.onsuccess = function() {
        try {
          var q = r.result.transaction('kv', 'readonly').objectStore('kv').get('reminders');
          q.onsuccess = function() { res((q.result && q.result.items) || []); };
          q.onerror = function() { res([]); };
        } catch (err) { res([]); }
      };
    } catch (err) { res([]); }
  });
}

function localDay(offset) {
  var d = new Date(); d.setDate(d.getDate() + (offset || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

self.addEventListener('push', function(e) {
  e.waitUntil(readReminders().then(function(items) {
    var today = localDay(0), limit = localDay(2), when = {};
    when[today] = 'bugün'; when[localDay(1)] = 'yarın'; when[limit] = '2 gün sonra';
    var due = items.filter(function(x) { return x.date >= today && x.date <= limit; }).sort(function(a, b) { return a.date < b.date ? -1 : 1; });
    var body = due.length
      ? due.slice(0, 4).map(function(x) { return (when[x.date] || x.date) + ': ' + x.text; }).join('\n') + (due.length > 4 ? '\n+' + (due.length - 4) + ' ödeme daha' : '')
      : 'Yaklaşan ödemelerinizi kontrol edin.';
    return self.registration.showNotification(due.length > 1 ? '💰 ' + due.length + ' yaklaşan ödeme' : '💰 Yaklaşan ödeme', {
      body: body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'ft-due', renotify: true, data: { url: './index.html#dashboard' }
    });
  }));
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var target = new URL((e.notification.data && e.notification.data.url) || './index.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
    for (var i = 0; i < list.length; i++) { if (list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) return list[i].focus(); }
    return self.clients.openWindow(target);
  }));
});
