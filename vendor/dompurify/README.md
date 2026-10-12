# DOMPurify

Pinned npm package: `dompurify@3.4.17`.

`purify.es.mjs` is copied unchanged from `node_modules/dompurify/dist/purify.es.mjs`; the upstream license is included. Runtime loading is same-origin and does not require a CDN.

SHA-256: `60c5d5ccbb466de3de3ba863461a92bf134f8c156cef7992da43e0f659bc5cbd`.

All workspace HTML sinks use `src/lib/safe-html.js`. Do not add a permissive default Trusted Types policy. Updates must refresh the npm lockfile, vendored module, hash, and run the browser and safety suites.
