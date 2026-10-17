/* Oddiy service worker: avval tarmoq, internet bo'lmasa kesh. Server (Supabase) so'rovlari keshlanmaydi. */
var CACHE = "dokon-v2";
var FILES = ["./", "index.html", "config.js", "sync.js", "pwa.js", "manifest.webmanifest", "favicon.ico", "icon-192.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(r).then(function (res) {
      if (res && res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); }
      return res;
    }).catch(function () { return caches.match(r).then(function (m) { return m || caches.match("index.html"); }); })
  );
});
