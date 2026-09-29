# vendor/ort-1.22.0 — onnxruntime-web (MIT)

Vendored 2026-09-29 from jsDelivr (`onnxruntime-web@1.22.0`). This is the
runtime-relevant minimum for the scribe-parakeet worker, not the entire
npm `dist/`:

- `ort.all.min.js` — main bundle (loaded by the worker via importScripts)
- `ort.webgpu.min.js` — WebGPU execution provider
- `ort-wasm-simd-threaded.{mjs,wasm}` — WASM EP (SIMD, multi-thread)
- `ort-wasm-simd-threaded.jsep.{mjs,wasm}` — JSEP glue used by the WebGPU EP

Deliberately omitted: the non-`all` bundles (`ort.min.js`, `ort.web.min.js`),
single-threaded and non-SIMD wasm builds, `.mjs` ESM variants, node/training
artifacts. The worker only ever loads `ort.all.min.js` and uses the `wasm`
and `webgpu` EPs, so the omitted files are dead weight for a static
GitHub-Pages deployment. Verified sufficient: all five sessions create and
all inference paths (VAD, transcribe, embed) ran against exactly these
files in headless Chromium 2026-09-29.

Upstream: https://github.com/microsoft/onnxruntime — MIT License.
See /THIRD-PARTY-NOTICES.md.
