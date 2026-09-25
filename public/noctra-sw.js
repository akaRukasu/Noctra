'use strict';

const CACHE_NAME = 'noctra-shell-v200-r104';
const CORE = [
  './noctra.webmanifest?v=182',
  './noctra-mark.svg?v=182',
  './icons/noctra-192.png?v=182',
  './icons/noctra-512.png?v=182',
  './vendor/hls.min.js?v=182'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).catch(() => undefined));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('noctra-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  const cacheable = CORE.some(item => url.pathname.endsWith(item.split('?')[0].replace(/^\.\//, '')));
  if (!cacheable) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(cached => cached || fetch(event.request)));
});
