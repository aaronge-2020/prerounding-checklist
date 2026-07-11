const MODEL_PACK_CACHE_NAME = "prerounding-local-model-packs-v1";
const MODEL_PACK_ROUTE = "/__prerounding-models/";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.includes(MODEL_PACK_ROUTE)) return;
  event.respondWith((async () => {
    const cache = await caches.open(MODEL_PACK_CACHE_NAME);
    const response = await cache.match(event.request.url);
    return response || new Response("Local model file not found.", { status: 404, statusText: "Not Found" });
  })());
});
