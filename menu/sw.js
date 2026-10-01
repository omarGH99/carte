// Offline support. A QR menu is read on restaurant wi-fi, which drops; the
// shell, every brand file and the fonts already seen should survive that.
// Bump VERSION on deploy so returning guests get the new menu.

const VERSION = 'menu-v2';
const SHELL = [
  './',
  'index.html',
  'css/themes.css',
  'css/menu.css',
  'js/app.js',
  'js/art.js',
  'js/i18n.js',
  'brands/kumo.json',
  'brands/fico.json',
  'brands/juniper.json',
  'icon.svg',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const own = url.origin === self.location.origin;
  if (!own && !FONT_HOSTS.includes(url.hostname)) return;

  // Brand files: network first, so a price change shows up on the next
  // visit; the cached copy only answers when the network does not.
  if (own && url.pathname.endsWith('.json')) {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(VERSION).then((c) => c.put(request, copy));
      return response;
    }).catch(() => caches.match(request)));
    return;
  }

  // Everything else (shell, fonts): cache first.
  event.respondWith(caches.match(request, { ignoreSearch: own && url.pathname.endsWith('/') })
    .then((hit) => hit || fetch(request).then((response) => {
      if (response.ok || response.type === 'opaque') {
        const copy = response.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
      }
      return response;
    })));
});
