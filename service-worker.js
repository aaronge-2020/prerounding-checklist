const MODEL_PACK_CACHE_NAME = "prerounding-local-model-packs-v1";
const MODEL_PACK_ROUTE = "/__prerounding-models/";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// The local redaction models run through onnxruntime-web's threaded WASM
// build, which refuses to even load unless this page is cross-origin
// isolated (window.crossOriginIsolated) - without it, constructing the
// shared WebAssembly.Memory the runtime needs throws immediately, which is
// exactly the "stopped unexpectedly" crash right after a model finishes
// downloading and starts verifying. This app is served as static files with
// no server-side control over response headers, so this service worker
// stamps Cross-Origin-Opener-Policy/Cross-Origin-Embedder-Policy onto every
// response itself - the standard workaround for enabling cross-origin
// isolation from static hosting (e.g. GitHub Pages). Takes one reload after
// first install to take effect, since the very first navigation to this
// page is never controlled by the service worker that registers it.
function withIsolationHeaders(response) {
  if (!response || response.status === 0 || response.type === "opaqueredirect") return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  // "credentialless" (not "require-corp") so cross-origin, uncredentialed
  // model downloads from huggingface.co keep working without those hosts
  // needing to send back a Cross-Origin-Resource-Policy header of their own.
  headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.includes(MODEL_PACK_ROUTE)) {
    event.respondWith((async () => {
      const cache = await caches.open(MODEL_PACK_CACHE_NAME);
      const response = await cache.match(event.request.url);
      return response || new Response("Local model file not found.", { status: 404, statusText: "Not Found" });
    })());
    return;
  }
  if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") return;
  event.respondWith(
    fetch(event.request).then(withIsolationHeaders).catch(() => Response.error())
  );
});
