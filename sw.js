/* sw.js — generado por build/generar.mjs. La herramienta funciona sin
   conexión; los anuncios, no. */
const CACHE = 'qr3d-76b7757302';
const PRECACHE = [
  "/",
  "/css/app.css",
  "/js/qr-core.js",
  "/js/qr-render.js",
  "/js/qr-engine.js",
  "/js/tipos.js",
  "/js/validar.js",
  "/js/export2d.js",
  "/js/pasos.js",
  "/js/ads.js",
  "/js/config.js",
  "/js/historial.js",
  "/js/iconos.js",
  "/js/estado.js",
  "/js/interpretar.js",
  "/qr-wifi/",
  "/qr-3d/llavero/",
  "/qr-whatsapp/",
  "/qr-resenas-google/",
  "/qr-tarjeta-de-contacto/",
  "/qr-menu-restaurante/",
  "/qr-instagram/",
  "/qr-ubicacion/",
  "/qr-3d/iman/",
  "/qr-3d/placa/",
  "/qr-3d/tarjeta/",
  "/leer-qr/",
  "/qr-por-lotes/",
  "/mis-qr/",
  "/js/lector.js",
  "/js/lotes.js",
  "/js/mis-qr.js"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copia = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
      return res;
    }).catch(() => caches.match('/')))
  );
});
