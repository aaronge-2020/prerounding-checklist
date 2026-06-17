import * as zstd from "@bokuweb/zstd-wasm";
import {
  QR_ZSTD_COMPRESSION_LEVEL,
  baseQrEncodeBytes,
  buildQrZstdTrainingCorpus,
  cborEncode,
  compactReturnPayloadForManifest,
  compactWorkupPayloadForManifest,
  fnv64Bytes
} from "./build-qr-zstd-dictionary.js";
import {
  QR_DEFAULT_REGISTRY_HASH,
  QR_DEFAULT_REGISTRY_MODULE_COUNT,
  QR_ZSTD_DICTIONARY_BASE64,
  QR_ZSTD_DICTIONARY_BYTES,
  QR_ZSTD_DICTIONARY_HASH,
  QR_ZSTD_TRAINING_CORPUS_HASH,
  QR_ZSTD_TRAINING_SAMPLE_COUNT,
  QR_ZSTD_TRAINING_SOURCE_FILE_COUNT,
  QR_ZSTD_TRAINING_SOURCE_HASH,
  QR_ZSTD_TRAINING_SOURCE_PATHS
} from "../vendor/qr-zstd-dictionary.js";

const DIRECT_TOKEN_LIMIT = 2600;
const THREE_FRAME_TOKEN_LIMIT = DIRECT_TOKEN_LIMIT * 3;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function base64UrlDecodeBytes(value = "") {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function bytesEqual(left = new Uint8Array(), right = new Uint8Array()) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function percentile(values = [], ratio = 0.95) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function summarize(rows = []) {
  const tokenLengths = rows.map((row) => row.tokenLength);
  const compressedBytes = rows.map((row) => row.compressedBytes);
  const maxRow = rows.reduce((best, row) => (row.tokenLength > (best?.tokenLength || 0) ? row : best), null);
  return {
    count: rows.length,
    maxTokenLength: maxRow?.tokenLength || 0,
    maxWorkupModuleId: maxRow?.workupModuleId || "",
    p95TokenLength: percentile(tokenLengths),
    p50TokenLength: percentile(tokenLengths, 0.5),
    maxCompressedBytes: Math.max(...compressedBytes),
    p95CompressedBytes: percentile(compressedBytes)
  };
}

function printSummary(label, summary) {
  console.log(`${label}: n=${summary.count}, max=${summary.maxTokenLength} (${summary.maxWorkupModuleId}), p95=${summary.p95TokenLength}, p50=${summary.p50TokenLength}, maxCompressed=${summary.maxCompressedBytes}B`);
}

async function main() {
  const corpus = await buildQrZstdTrainingCorpus();
  const dictionary = base64UrlDecodeBytes(QR_ZSTD_DICTIONARY_BASE64);
  assert(dictionary.length === QR_ZSTD_DICTIONARY_BYTES, "QR zstd dictionary byte count metadata is stale.");
  assert(fnv64Bytes(dictionary) === QR_ZSTD_DICTIONARY_HASH, "QR zstd dictionary hash metadata is stale.");
  assert(corpus.registryHash === QR_DEFAULT_REGISTRY_HASH, "QR default registry hash metadata is stale.");
  assert(corpus.manifests.length === QR_DEFAULT_REGISTRY_MODULE_COUNT, "QR default registry module count metadata is stale.");
  assert(corpus.sourceFiles.length === QR_ZSTD_TRAINING_SOURCE_FILE_COUNT, "QR dictionary source file count metadata is stale.");
  assert(corpus.samples.length === QR_ZSTD_TRAINING_SAMPLE_COUNT, "QR dictionary training sample count metadata is stale.");
  assert(corpus.corpusHash === QR_ZSTD_TRAINING_CORPUS_HASH, "QR dictionary training corpus hash metadata is stale.");
  assert(corpus.sourceHash === QR_ZSTD_TRAINING_SOURCE_HASH, "QR dictionary training source hash metadata is stale.");
  assert(
    JSON.stringify(corpus.sourceFiles.map((source) => source.relativePath)) === JSON.stringify(QR_ZSTD_TRAINING_SOURCE_PATHS),
    "QR dictionary training source path metadata is stale."
  );

  await zstd.init();
  const cctx = zstd.createCCtx();
  const dctx = zstd.createDCtx();
  const encodeRows = (entries, kind) => entries.map((entry) => {
    const payload = entry.payload || entry;
    const cborBytes = cborEncode(payload);
    const compressed = zstd.compressUsingDict(cctx, cborBytes, dictionary, QR_ZSTD_COMPRESSION_LEVEL);
    const restored = zstd.decompressUsingDict(dctx, compressed, dictionary, {
      defaultHeapSize: Math.max(1024 * 1024, cborBytes.length * 4)
    });
    assert(bytesEqual(cborBytes, restored), `QR zstd round-trip failed for ${kind} ${payload.w || payload.m || ""}`);
    const tokenPrefix = kind === "return" ? "A2Z:" : "W2Z:";
    return {
      kind,
      workupModuleId: entry.workupModuleId || payload.w || payload.cw || "",
      tokenLength: tokenPrefix.length + baseQrEncodeBytes(compressed).length,
      rawCborBytes: cborBytes.length,
      compressedBytes: compressed.length
    };
  });

  try {
    const workupDefaultRows = encodeRows(
      corpus.manifests.map((manifest) => ({
        workupModuleId: manifest.workupModuleId,
        payload: compactWorkupPayloadForManifest(manifest, QR_DEFAULT_REGISTRY_HASH, QR_ZSTD_DICTIONARY_HASH)
      })),
      "workup"
    );
    const workupEditedRows = encodeRows(
      corpus.manifests.map((manifest) => ({
        workupModuleId: manifest.workupModuleId,
        payload: compactWorkupPayloadForManifest(manifest, QR_DEFAULT_REGISTRY_HASH, QR_ZSTD_DICTIONARY_HASH, { includeRepresentativePatch: true })
      })),
      "workup"
    );
    const returnStructuredRows = encodeRows(
      corpus.manifests.map((manifest) => ({
        workupModuleId: manifest.workupModuleId,
        payload: compactReturnPayloadForManifest(manifest, QR_ZSTD_DICTIONARY_HASH, { includeNotes: false })
      })),
      "return"
    );
    const returnWithNotesRows = encodeRows(
      corpus.manifests.map((manifest) => ({
        workupModuleId: manifest.workupModuleId,
        payload: compactReturnPayloadForManifest(manifest, QR_ZSTD_DICTIONARY_HASH, { includeNotes: true })
      })),
      "return"
    );

    const summaries = {
      workupDefault: summarize(workupDefaultRows),
      workupEdited: summarize(workupEditedRows),
      returnStructured: summarize(returnStructuredRows),
      returnWithNotes: summarize(returnWithNotesRows)
    };

    printSummary("workup default", summaries.workupDefault);
    printSummary("workup representative edit", summaries.workupEdited);
    printSummary("return structured answers", summaries.returnStructured);
    printSummary("return representative notes", summaries.returnWithNotes);

    assert(summaries.workupDefault.maxTokenLength <= DIRECT_TOKEN_LIMIT, "Default workup sync should fit a single QR across the full library.");
    assert(summaries.workupEdited.maxTokenLength <= DIRECT_TOKEN_LIMIT, "Representative edited workup sync should fit a single QR across the full library.");
    assert(summaries.returnStructured.maxTokenLength <= DIRECT_TOKEN_LIMIT, "Structured answer return should fit a single QR across the full library.");
    assert(summaries.returnWithNotes.maxTokenLength <= THREE_FRAME_TOKEN_LIMIT, "Answer return with representative notes should remain within the three-frame QR cap.");
  } finally {
    zstd.freeCCtx(cctx);
    zstd.freeDCtx(dctx);
  }

  console.log(`QR zstd library coverage passed: ${corpus.sourceFiles.length} source workups, ${corpus.manifests.length} installed manifests, corpus ${corpus.corpusHash}.`);
}

await main();
