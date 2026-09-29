// Pinned on-device embedding models for chart-grounded retrieval.
//
// Pure module shared by the RAG worker and the main-thread service.
// The default was chosen by the live compatibility test
// (tests/test-rag-embedding-browser): real transformers.js runs of both
// candidates in headless Chromium, 2026-09-29. Both reached recall@1=100%
// on the synthetic chart set; bge-small-en-v1.5 showed consistently higher
// top-1 cosine margins (avg 0.75 vs 0.68 for MiniLM) and is the
// purpose-built retrieval model. Re-run that test to change the default.

// Cache-buster for the worker graph (worker + its relative imports:
// similarity.js, rag-models.js). Bump this when the worker's message
// contract or any of its relative imports changes; the service builds the
// worker URL from it so both stay aligned.
export const RAG_WORKER_VERSION = "20260929-rag-v1";

export const RAG_EMBEDDING_MODELS = Object.freeze({
  "minilm-l6-v2": {
    modelId: "Xenova/all-MiniLM-L6-v2",
    dims: 384,
    // No instruction prefix needed.
    queryPrefix: ""
  },
  "bge-small-en-v1.5": {
    modelId: "Xenova/bge-small-en-v1.5",
    dims: 384,
    // BGE retrieval models expect an instruction prefix on queries.
    queryPrefix: "Represent this sentence for searching relevant passages: "
  }
});

export const DEFAULT_RAG_MODEL_KEY = "bge-small-en-v1.5";

export function ragModelSpec(modelKey) {
  const spec = RAG_EMBEDDING_MODELS[String(modelKey || DEFAULT_RAG_MODEL_KEY)];
  if (!spec) throw new Error(`Unknown RAG embedding model: ${modelKey}`);
  return spec;
}
