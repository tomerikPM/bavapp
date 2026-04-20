// Service Worker — Bavaria Sport 32 PWA  v6
// Strategi:
//   HTML / JS / CSS  → Network-first (alltid ferskeste kode), fallback til cache
//   Bilder / fonter  → Cache-first (endres sjelden), fallback til nettverk
//   API / Signal K   → Kun nettverk, fallback til cache ved offline

const CACHE_VERSION = 'bavaria32-v6';
const CACHE_STATIC  = 'bavaria32-static-v6';
const CACHE_ASSETS  = 'bavaria32-assets-v6';

// Filer som precaches ved install (kun stabile assets)
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())   // aktiver ny SW umiddelbart
  );
});

// ── Activate — rydd opp alle gamle caches ─────────────────────────────────────
self.addEventListener('activate', e => {
  const KEEP = [CACHE_STATIC, CACHE_ASSETS];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !KEEP.includes(k))
          .map(k => { console.log('[SW] Slett gammel cache:', k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())   // ta kontroll over alle åpne faner umiddelbart
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // 1. API-kall, Signal K, MET, tide — kun nettverk, cache som nødkopi
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/signalk/') ||
    url.pathname.startsWith('/met/') ||
    url.pathname.startsWith('/tide') ||
    url.hostname !== location.hostname
  ) {
    e.respondWith(
      fetch(request)
        .then(res => {
          // Cache API-svar for offline-fallback (kort TTL implisitt via neste SW-oppdatering)
          if (res.ok && request.method === 'GET') {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 2. JS, CSS, HTML — network-first: alltid prøv nettverket,
  //    server cachet versjon kun om nettverket feiler (offline)
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/'
  ) {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => {
          console.log('[SW] Offline — server cachet JS/CSS:', url.pathname);
          return caches.match(request);
        })
    );
    return;
  }

  // 3. Bilder, fonter, ikoner — cache-first (endres sjelden)
  if (
    url.pathname.match(/\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf)$/)
  ) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_ASSETS).then(c => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // 4. Alt annet — network-first med cache-fallback
  e.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});

// ── Melding fra app — tving oppdatering ──────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Push-varsler ──────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data?.json() || {}; } catch {}

  const title   = data.title || 'Bavaria Sport 32';
  const options = {
    body:               data.body  || '',
    icon:               '/icons/icon-192.png',
    badge:              '/icons/icon-192.png',
    vibrate:            data.severity === 'critical' ? [300, 100, 300, 100, 300] : [200, 100, 200],
    tag:                data.tag   || 'bavaria-notification',
    requireInteraction: data.severity === 'critical',
    data:               { url: data.url || '/#events' },
    actions: data.severity === 'critical' ? [{ action: 'open', title: 'Åpne app' }] : [],
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notifikasjonsklikk ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.navigate?.(targetUrl);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
