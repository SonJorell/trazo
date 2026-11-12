/*
 * Service worker de Trazo: hace que se pueda instalar como app y muestra una página clara si
 * no hay conexión con el servidor. Siempre intenta la red primero (para no quedarse con una
 * versión vieja de la app); la copia en caché solo se usa sin conexión.
 * Nunca toca la API, los archivos de las salas ni el tiempo real.
 */
const CACHE = 'trazo-v2.7.0';
const SHELL = ['/', '/sala', '/control', '/css/styles.css', '/offline.html', '/icons/icon-192.png', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/^\/(api|assets)\//.test(url.pathname)) return; // datos de la sala: siempre en vivo
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (res.type === 'basic' || res.type === 'default')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('/offline.html');
        return Response.error();
      }),
  );
});
