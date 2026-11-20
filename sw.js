// Keeps the app and the Firebase code on the phone so it opens with no signal.
const VERSION = 'v2';
const APP_CACHE = `home-duties-${VERSION}`;
const SDK_CACHE = 'home-duties-sdk-12.18.0';
const SDK = ['app', 'auth', 'firestore'].map(n => `https://www.gstatic.com/firebasejs/12.18.0/firebase-${n}.js`);
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'js/main.js', 'js/engine.js', 'js/store.js', 'js/backend.js', 'js/ui.js', 'js/views.js', 'js/sheets.js', 'js/pages.js', 'js/icons.js', 'fonts/poppins-400.woff', 'fonts/poppins-500.woff', 'fonts/poppins-700.woff', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/shortcut-today.png', 'icons/shortcut-add.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    await (await caches.open(APP_CACHE)).addAll(FILES);
    const sdk = await caches.open(SDK_CACHE);
    await Promise.all(SDK.map(u => sdk.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP_CACHE && k !== SDK_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.href.startsWith('https://www.gstatic.com/firebasejs/')) {
    e.respondWith(caches.open(SDK_CACHE).then(async c => (await c.match(r.url)) || fetch(r).then(res => { if (res.ok) c.put(r.url, res.clone()); return res; })));
  } else if (u.origin === location.origin) {
    // Open instantly from the phone, and pick up new versions in the background.
    e.respondWith((async () => {
      const c = await caches.open(APP_CACHE), key = r.mode === 'navigate' ? 'index.html' : u.pathname.endsWith('/') ? './' : r;
      const hit = await c.match(key, { ignoreSearch: true });
      const net = fetch(r).then(res => { if (res.ok && r.mode !== 'navigate') c.put(r, res.clone()); return res; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    })());
  }
});
