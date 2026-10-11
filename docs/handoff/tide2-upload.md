# TIDE2 approved hosting preparation

The only authorized destination recorded in the handoff is `stanford-med-hdr/tide2-sentry-clinical-ner`. Aaron or Dr. Posada must perform the hosting request and upload. No model binaries have been uploaded or mirrored by this work.

Run `python3 scripts/prepare-tide2-upload.py /path/to/approved-pack /path/to/manifest.json` where the evaluated fp16 artifact is available. The tool reads five required files, rejects missing/empty files and Git LFS pointers, checks JSON, and writes byte counts and SHA-256 hashes. It does not access the network or include credentials.

The pack must contain `config.json`, `special_tokens_map.json`, `tokenizer.json`, `tokenizer_config.json`, and `onnx/model_fp16.onnx`. Check the ONNX graph for external data files before upload; if it requires any, the pack and pinned runtime plan must include them explicitly. An inventory is not an inference-parity check.

For the maintainer request, provide the conversion source revision, conversion command and runtime versions, dtype/opset, exact ONNX size and SHA-256, metadata hashes, label mapping, inference-parity evidence, and the approved permission terms. Ask Stanford to preserve repository gating and return the immutable commit containing the ONNX and matching metadata. Do not request a public mirror or a license change.

After upload, update the app's pinned revision and exact file byte counts together. Test authenticated download, interrupted-download recovery, browser worker self-test, selected-model identity, and inference on synthetic text before changing the default. A failed TIDE2 selection must not silently change the selected model.

The evaluated 873 MB model and conversion provenance are absent from this machine. Therefore the final artifact manifest and upload request package remain incomplete. The existing pinned revision must not be treated as proof that the ONNX file exists there.
