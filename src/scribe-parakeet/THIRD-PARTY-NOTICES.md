# Third-party notices — scribe-parakeet inference core

Everything this inference core reuses is MIT, Apache-2.0, BSD, or CC-BY-4.0.
No GPL/AGPL code or models are vendored or fetched. Evaluated-and-rejected
prior art is listed at the bottom for the record.

## Vendored (shipped in this repo)

### ONNX Runtime Web 1.22.0 — MIT
- `vendor/ort-1.22.0/` — runtime-relevant minimum of the onnxruntime-web
  1.22.0 `dist/` bundle, fetched from jsDelivr 2026-09-29:
  `ort.all.min.js`, `ort.webgpu.min.js`, `ort-wasm-simd-threaded.mjs`,
  `ort-wasm-simd-threaded.wasm`, `ort-wasm-simd-threaded.jsep.mjs`,
  `ort-wasm-simd-threaded.jsep.wasm`.
- Upstream: https://github.com/microsoft/onnxruntime (MIT License).
- The runtime executes the models below; it is not modified.

## Adapted (logic ported, not vendored)

### onnx-asr — MIT
- https://github.com/istupakov/onnx-asr
- The Parakeet TDT greedy decode loop (blank=1024, joint split into
  1025 token logits + 5 duration logits, int32 targets/target_length,
  token timestamping) is a port of onnx-asr's `NemoConformerTdt`, as
  previously proven through the R&D lab's `transcribe.html`.

### xiuxiu — MIT
- https://github.com/rberenguel/xiuxiu (`src/parakeet.worker.js`)
- Two implementation patterns adapted: reusing the decoder `targets` and
  `target_length` tensors across TDT steps instead of reallocating, and
  yielding to the event loop every 50 encoder frames to keep the worker
  responsive.

## Models (downloaded at runtime into IndexedDB; never committed)

### Parakeet TDT 0.6B v2 ONNX — CC-BY-4.0
- `istupakov/parakeet-tdt-0.6b-v2-onnx`
- `nemo128.onnx` (139,764 bytes), `encoder-model.int8.onnx`
  (652,184,014 bytes), `decoder_joint-model.int8.onnx` (8,998,286 bytes),
  `vocab.txt` (9,384 bytes).

### WeSpeaker voxceleb ResNet34-LM — CC-BY-4.0
- `onnx-community/wespeaker-voxceleb-resnet34-LM`, `onnx/model.onnx`
  (26,535,549 bytes).
- fp32 ONLY: the int8/model_quantized variants use the ConvInteger op,
  which has no implementation in onnxruntime-web's WASM or WebGPU EPs.

### Silero VAD — MIT (attribution to Silero)
- Exported `silero_vad.onnx` (1,280,185 bytes) as distributed in
  `christopherthompson81/sortformer_parakeet_onnx`.
- This export takes 576-sample windows at 16 kHz with inputs
  `input`[1,576] / `state`[2,1,128] and outputs `output`[1,1] /
  `stateN`[2,1,128] — no `sr` input, unlike the stock Silero export.

## Evaluated and rejected

- `asrjs/speech-recognition` (`@asrjs/speech-recognition`): contains a
  full TypeScript NeMo TDT/Parakeet browser implementation, but the repo
  has no LICENSE file, `package.json` declares no license, GitHub
  reports no detected license, and the package is not published on npm
  (404 as of 2026-09-29). Fails the permissive-license gate; not reused.
- `achetronic/parakeet` (Apache-2.0): Go server, no browser JS/TS
  worker or static-browser library; not reusable for a static build.
