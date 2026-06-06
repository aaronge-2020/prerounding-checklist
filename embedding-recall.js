import {
  buildRecommendedExamChecklist,
  formatEvidenceCandidatesBlock,
  replaceStudentReferenceWithEvidenceBlock,
  rankEvidenceCandidates
} from "./evidence.js";

export const embeddingRecallSchemaVersion = "embedding-recall-v1";
export const clinicalKnowledgePackSchemaVersion = "clinical_knowledge_pack_v1";
export const defaultEmbeddingModelKey = "embeddinggemma";

export const embeddingModelRegistry = {
  embeddinggemma: {
    key: "embeddinggemma",
    label: "EmbeddingGemma 300M",
    modelId: "onnx-community/embeddinggemma-300m-ONNX",
    sourceModelId: "google/embeddinggemma-300m",
    defaultDtype: "q4",
    defaultDimensions: 768,
    supportedDimensions: [768, 512, 256, 128],
    defaultThreshold: 0.22,
    defaultTopK: 24,
    license: "gemma",
    queryPrefix: "task: search result | query: ",
    documentPrefix: "title: {title} | text: "
  },
  mxbaiXsmall: {
    key: "mxbaiXsmall",
    label: "mxbai embed xsmall",
    modelId: "mixedbread-ai/mxbai-embed-xsmall-v1",
    defaultDtype: "q4",
    defaultDimensions: 384,
    supportedDimensions: [384, 256, 128],
    defaultThreshold: 0.2,
    defaultTopK: 24,
    license: "apache-2.0",
    queryPrefix: "",
    documentPrefix: ""
  },
  miniLm: {
    key: "miniLm",
    label: "all-MiniLM-L6-v2",
    modelId: "sentence-transformers/all-MiniLM-L6-v2",
    defaultDtype: "q8",
    defaultDimensions: 384,
    supportedDimensions: [384],
    defaultThreshold: 0.2,
    defaultTopK: 24,
    license: "apache-2.0",
    queryPrefix: "",
    documentPrefix: ""
  }
};

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function numericVector(values) {
  if (!values) {
    return [];
  }
  if (Array.isArray(values)) {
    return values.map(Number).filter(Number.isFinite);
  }
  if (typeof values.tolist === "function") {
    return numericVector(values.tolist());
  }
  if (ArrayBuffer.isView(values)) {
    return Array.from(values).map(Number).filter(Number.isFinite);
  }
  return [];
}

export function normalizeEmbeddingSettings(options = {}) {
  const requestedKey = options.modelKey || options.model || defaultEmbeddingModelKey;
  const model = embeddingModelRegistry[requestedKey] || embeddingModelRegistry[defaultEmbeddingModelKey];
  const requestedDimensions = Number.parseInt(options.dimensions || model.defaultDimensions, 10);
  const dimensions = model.supportedDimensions.includes(requestedDimensions)
    ? requestedDimensions
    : model.defaultDimensions;
  return {
    schema: embeddingRecallSchemaVersion,
    modelKey: model.key,
    label: model.label,
    modelId: options.modelId || model.modelId,
    sourceModelId: model.sourceModelId || model.modelId,
    dtype: options.dtype || model.defaultDtype,
    dimensions,
    threshold: Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : model.defaultThreshold,
    topK: Number.parseInt(options.topK || model.defaultTopK, 10),
    device: options.device || "auto",
    cacheVersion: String(options.cacheVersion || "v1"),
    queryPrefix: model.queryPrefix || "",
    documentPrefix: model.documentPrefix || "",
    license: model.license || ""
  };
}

export function detectEmbeddingRuntime(env = globalThis) {
  const navigatorLike = env?.navigator;
  if (navigatorLike?.gpu) {
    return {
      runtime: "webgpu",
      device: "webgpu",
      available: true,
      detail: "WebGPU available"
    };
  }
  return {
    runtime: "wasm",
    device: "wasm",
    available: true,
    detail: "WebGPU unavailable; using WASM fallback"
  };
}

export function formatEmbeddingQueryText(contextText = "", options = {}) {
  const settings = normalizeEmbeddingSettings(options);
  return `${settings.queryPrefix}${String(contextText || "").trim()}`.trim();
}

export function formatEmbeddingDocumentText(candidate = {}, options = {}) {
  const settings = normalizeEmbeddingSettings(options);
  const title = candidate.examLabel || candidate.maneuver || candidate.exam_id || "none";
  const text = evidenceItemEmbeddingText(candidate);
  if (!settings.documentPrefix) {
    return text;
  }
  return `${settings.documentPrefix.replace("{title}", title)}${text}`.trim();
}

export function evidenceItemEmbeddingText(candidate = {}) {
  return [
    candidate.examLabel,
    candidate.examOptions,
    candidate.maneuver,
    candidate.bedside_question_label,
    candidate.bedside_question_options,
    candidate.condition_or_syndrome,
    candidate.diagnostic_target,
    candidate.when_to_use_structured,
    candidate.result_changes_management,
    candidate.management_link,
    candidate.retrieval_tags,
    candidate.evidence_source_primary,
    candidate.evidence_tier,
    candidate.difficulty,
    candidate.time_burden_minutes,
    candidate.equipment_needed,
    candidate.limitations
  ].filter(Boolean).join(" | ");
}

export function embeddingTextFingerprint(value) {
  const text = String(value || "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function evidenceItemEmbeddingFingerprint(candidate = {}) {
  return embeddingTextFingerprint([
    candidate.exam_id,
    candidate.base_row_fingerprint,
    candidate.rowFingerprintActual,
    evidenceItemEmbeddingText(candidate)
  ].join("|"));
}

export function catalogEmbeddingFingerprint(catalog = []) {
  return embeddingTextFingerprint(catalog.map((candidate) => [
    candidate.exam_id,
    evidenceItemEmbeddingFingerprint(candidate)
  ].join(":")).join("|"));
}

export function embeddingIndexStorageKey(options = {}) {
  const settings = normalizeEmbeddingSettings(options);
  return [
    "preRoundEmbeddingIndex",
    settings.schema,
    settings.modelKey,
    settings.dtype,
    settings.dimensions,
    settings.cacheVersion
  ].join(":");
}

export function makeEmbeddingManifest(catalog = [], options = {}) {
  const settings = normalizeEmbeddingSettings(options);
  return {
    schema: embeddingRecallSchemaVersion,
    modelKey: settings.modelKey,
    modelId: settings.modelId,
    sourceModelId: settings.sourceModelId,
    dtype: settings.dtype,
    dimensions: settings.dimensions,
    cacheVersion: settings.cacheVersion,
    catalogFingerprint: catalogEmbeddingFingerprint(catalog),
    itemCount: catalog.length,
    generatedAt: new Date().toISOString()
  };
}

export function isEmbeddingManifestCurrent(index, catalog = [], options = {}) {
  const manifest = index?.manifest;
  if (!manifest) {
    return false;
  }
  const expected = makeEmbeddingManifest(catalog, options);
  return manifest.schema === expected.schema
    && manifest.modelId === expected.modelId
    && manifest.dtype === expected.dtype
    && Number(manifest.dimensions) === Number(expected.dimensions)
    && manifest.cacheVersion === expected.cacheVersion
    && manifest.catalogFingerprint === expected.catalogFingerprint
    && Number(manifest.itemCount) === Number(expected.itemCount)
    && Array.isArray(index.entries);
}

export function truncateNormalizeVector(vector, dimensions) {
  const values = numericVector(vector).slice(0, dimensions);
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!norm) {
    return values.map(() => 0);
  }
  return values.map((value) => value / norm);
}

export function dotProduct(left = [], right = []) {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

async function embedTexts(service, texts, kind, settings) {
  if (!texts.length) {
    return [];
  }
  if (kind === "query" && typeof service.embedQuery === "function") {
    return [await service.embedQuery(texts[0], settings)];
  }
  if (kind === "document" && typeof service.embedDocuments === "function") {
    return service.embedDocuments(texts, settings);
  }
  if (typeof service.embedMany === "function") {
    return service.embedMany(texts, { kind, settings });
  }
  if (typeof service.embedText === "function") {
    return Promise.all(texts.map((text) => service.embedText(text, { kind, settings })));
  }
  throw new Error("Embedding service does not expose embedQuery, embedDocuments, embedMany, or embedText.");
}

export async function buildEmbeddingIndex(catalog = [], service, options = {}) {
  const settings = normalizeEmbeddingSettings(options);
  if (!service) {
    throw new Error("Embedding service is required to build an index.");
  }
  const documents = catalog.map((candidate) => formatEmbeddingDocumentText(candidate, settings));
  const vectors = await embedTexts(service, documents, "document", settings);
  const manifest = makeEmbeddingManifest(catalog, settings);
  const entries = catalog.map((candidate, index) => ({
    exam_id: candidate.exam_id,
    fingerprint: evidenceItemEmbeddingFingerprint(candidate),
    label: candidate.examLabel || candidate.maneuver || candidate.exam_id,
    vector: truncateNormalizeVector(vectors[index] || [], settings.dimensions)
  }));
  return {
    schema: embeddingRecallSchemaVersion,
    manifest,
    entries
  };
}

export function loadEmbeddingIndexFromStorage(storage, key) {
  if (!storage || !key) {
    return null;
  }
  try {
    const text = storage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return null;
  }
}

export function saveEmbeddingIndexToStorage(storage, key, index) {
  if (!storage || !key || !index) {
    return false;
  }
  try {
    storage.setItem(key, JSON.stringify(index));
    return true;
  } catch (error) {
    return false;
  }
}

export async function getOrBuildEmbeddingIndex(catalog = [], service, options = {}) {
  const settings = normalizeEmbeddingSettings(options);
  const storage = options.storage || null;
  const storageKey = options.storageKey || embeddingIndexStorageKey(settings);
  let index = options.index || loadEmbeddingIndexFromStorage(storage, storageKey);
  let fromCache = false;
  let rebuilt = false;

  if (isEmbeddingManifestCurrent(index, catalog, settings)) {
    fromCache = true;
  } else {
    index = await buildEmbeddingIndex(catalog, service, settings);
    rebuilt = true;
    saveEmbeddingIndexToStorage(storage, storageKey, index);
  }

  return {
    index,
    storageKey,
    fromCache,
    rebuilt,
    manifest: index.manifest
  };
}

export async function retrieveEmbeddingCandidates(catalog = [], index, contextText = "", service, options = {}) {
  const settings = normalizeEmbeddingSettings(options);
  if (!index?.entries?.length || !service) {
    return [];
  }
  const [queryVectorRaw] = await embedTexts(service, [String(contextText || "")], "query", settings);
  const queryVector = truncateNormalizeVector(queryVectorRaw, settings.dimensions);
  const byExamId = new Map(catalog.map((candidate) => [candidate.exam_id, candidate]));
  return index.entries
    .map((entry) => {
      const score = dotProduct(queryVector, entry.vector || []);
      const candidate = byExamId.get(entry.exam_id);
      if (!candidate) {
        return null;
      }
      return {
        ...candidate,
        embedding_score: score,
        embedding_model: settings.modelId,
        vector_manifest_id: index.manifest?.catalogFingerprint || "",
        retrievalRoutes: unique([...(candidate.retrievalRoutes || []), "embedding"])
      };
    })
    .filter(Boolean)
    .filter((candidate) => candidate.embedding_score >= settings.threshold)
    .sort((a, b) => b.embedding_score - a.embedding_score)
    .slice(0, settings.topK);
}

export function mergeRankedAndEmbeddingCandidates(ranked, embeddingCandidates = [], options = {}) {
  const maxCandidates = options.maxCandidates || ranked?.candidates?.length || 48;
  const byExamId = new Map();
  const allScored = [...(ranked?.allScored || [])];

  for (const candidate of ranked?.candidates || []) {
    byExamId.set(candidate.exam_id, {
      ...candidate,
      retrievalRoutes: unique([...(candidate.retrievalRoutes || []), candidate.matchedTags?.length ? "tag" : "lexical"])
    });
  }

  for (const candidate of embeddingCandidates) {
    const existing = byExamId.get(candidate.exam_id);
    if (existing) {
      existing.embedding_score = Math.max(existing.embedding_score || 0, candidate.embedding_score || 0);
      existing.embedding_model = candidate.embedding_model;
      existing.vector_manifest_id = candidate.vector_manifest_id;
      existing.retrievalRoutes = unique([...(existing.retrievalRoutes || []), "embedding"]);
      existing.score += Math.min(12, Math.max(0, (candidate.embedding_score || 0) * 12));
      continue;
    }

    const semanticScore = 44 + Math.max(0, candidate.embedding_score || 0) * 34;
    const semanticCandidate = {
      ...candidate,
      matchedTags: [],
      embeddingOnly: true,
      score: semanticScore,
      scoreBreakdown: {
        clinicalRelevance: 0,
        actionability: 0,
        diagnosticValue: 0,
        bedsideFeasibility: 0,
        specialtyContext: 0,
        semanticRecall: Math.round((candidate.embedding_score || 0) * 100)
      },
      retrievalRoutes: unique([...(candidate.retrievalRoutes || []), "embedding"])
    };
    byExamId.set(candidate.exam_id, semanticCandidate);
    allScored.push(semanticCandidate);
  }

  const candidates = Array.from(byExamId.values())
    .sort((a, b) => b.score - a.score || (b.embedding_score || 0) - (a.embedding_score || 0) || (a.originalIndex || 0) - (b.originalIndex || 0))
    .slice(0, maxCandidates);

  return {
    ...ranked,
    candidates,
    allScored,
    embeddingCandidates,
    retrievalMode: embeddingCandidates.length ? "hybrid" : "lexical"
  };
}

export async function rankEvidenceCandidatesHybrid(catalog = [], contextText = "", tagRows = [], options = {}) {
  const lexicalRanked = rankEvidenceCandidates(catalog, contextText, tagRows, options);
  const embeddingOptions = normalizeEmbeddingSettings(options.embedding || {});
  const embeddingStatus = {
    enabled: Boolean(options.embedding?.enabled),
    ok: false,
    model: embeddingOptions.modelId,
    modelLabel: embeddingOptions.label,
    dtype: embeddingOptions.dtype,
    dimensions: embeddingOptions.dimensions,
    runtime: "not loaded",
    indexState: "not used",
    fallback: "lexical"
  };

  if (!options.embedding?.enabled || !options.embeddingService) {
    return {
      ...lexicalRanked,
      retrievalMode: "lexical",
      embeddingStatus
    };
  }

  try {
    const indexResult = await getOrBuildEmbeddingIndex(catalog, options.embeddingService, {
      ...embeddingOptions,
      index: options.embeddingIndex,
      storage: options.storage,
      storageKey: options.storageKey
    });
    const embeddingCandidates = await retrieveEmbeddingCandidates(
      catalog,
      indexResult.index,
      contextText,
      options.embeddingService,
      embeddingOptions
    );
    const merged = mergeRankedAndEmbeddingCandidates(lexicalRanked, embeddingCandidates, options);
    return {
      ...merged,
      embeddingIndex: indexResult.index,
      embeddingStatus: {
        ...embeddingStatus,
        ok: true,
        runtime: options.embeddingService.runtime || detectEmbeddingRuntime().runtime,
        indexState: indexResult.rebuilt ? "rebuilt" : (indexResult.fromCache ? "current" : "current"),
        fromCache: indexResult.fromCache,
        rebuilt: indexResult.rebuilt,
        storageKey: indexResult.storageKey,
        candidateCount: embeddingCandidates.length,
        fallback: ""
      }
    };
  } catch (error) {
    return {
      ...lexicalRanked,
      retrievalMode: "lexical",
      embeddingStatus: {
        ...embeddingStatus,
        ok: false,
        runtime: options.embeddingService.runtime || "unknown",
        indexState: "failed",
        errorMessage: error?.message || "Embedding recall failed.",
        fallback: "lexical"
      }
    };
  }
}

export function buildEvidencePromptReplacementFromRanked(prompt, evidenceCatalog, contextText, ranked, options = {}) {
  const recommendation = buildRecommendedExamChecklist(contextText, ranked, options);
  const promptCandidates = [];
  const seenPromptCandidateIds = new Set();
  [
    ...recommendation.coreItems.map((entry) => entry.candidate),
    ...recommendation.conditionalItems.map((entry) => entry.candidate),
    ...(ranked?.candidates || [])
  ].forEach((candidate) => {
    if (!candidate?.exam_id || seenPromptCandidateIds.has(candidate.exam_id)) {
      return;
    }
    promptCandidates.push(candidate);
    seenPromptCandidateIds.add(candidate.exam_id);
  });
  const evidenceBlock = formatEvidenceCandidatesBlock(promptCandidates, options);
  return {
    prompt: evidenceBlock ? replaceStudentReferenceWithEvidenceBlock(prompt, evidenceBlock) : prompt,
    evidenceBlock,
    candidates: ranked?.candidates || [],
    promptCandidates,
    recommendation,
    matchedTags: ranked?.matchedTags || [],
    embeddingStatus: ranked?.embeddingStatus || null
  };
}

function tensorToRows(tensorLike) {
  const rows = typeof tensorLike?.tolist === "function" ? tensorLike.tolist() : tensorLike;
  if (!Array.isArray(rows)) {
    return [];
  }
  if (rows.length && Array.isArray(rows[0])) {
    return rows;
  }
  return [rows];
}

export function createBrowserEmbeddingService(options = {}) {
  const settings = normalizeEmbeddingSettings(options);
  const runtime = detectEmbeddingRuntime();
  let modelPromise = null;
  async function importTransformers() {
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      return import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0");
    }
    return import("@huggingface/transformers");
  }
  const service = {
    runtime: runtime.runtime,
    settings,
    async load() {
      if (!modelPromise) {
        modelPromise = importTransformers().then(async (transformers) => {
          const { pipeline } = transformers;
          const modelOptions = { dtype: settings.dtype };
          if (settings.device !== "auto") {
            modelOptions.device = settings.device;
          } else if (runtime.device === "webgpu") {
            modelOptions.device = "webgpu";
          }
          const extractor = await pipeline("feature-extraction", settings.modelId, modelOptions);
          return { extractor };
        });
      }
      return modelPromise;
    },
    async embedMany(texts, request = {}) {
      const { extractor } = await service.load();
      const output = await extractor(texts, { pooling: "mean", normalize: true });
      const tensor = output.sentence_embedding || output.embeddings || output.pooler_output || output;
      if (!tensor) {
        throw new Error("Embedding model did not return sentence embeddings.");
      }
      return tensorToRows(tensor);
    },
    async embedQuery(text, requestSettings = settings) {
      const [vector] = await service.embedMany([formatEmbeddingQueryText(text, requestSettings)], { kind: "query", settings: requestSettings });
      return vector;
    },
    async embedDocuments(texts, requestSettings = settings) {
      return service.embedMany(texts, { kind: "document", settings: requestSettings });
    }
  };
  return service;
}

function containsPhiLikeContent(value) {
  const text = String(value || "");
  return /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/.test(text)
    || /\b(?:MRN|DOB|SSN|medical record number)\b/i.test(text)
    || /\b[A-Z][a-z]+,\s*[A-Z][a-z]+\b/.test(text)
    || /\b\d{1,5}\s+[A-Z][A-Za-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln)\b/.test(text);
}

export function validateClinicalKnowledgePack(pack, options = {}) {
  const issues = [];
  let normalized = {};
  try {
    normalized = typeof pack === "string" ? JSON.parse(pack) : (pack || {});
  } catch (error) {
    return {
      ok: false,
      issues: [{ type: "json", message: `Knowledge pack JSON could not be parsed: ${error?.message || "invalid JSON"}.` }],
      pack: {},
      itemCount: 0,
      sourceCount: 0
    };
  }
  if (normalized.schema_version !== clinicalKnowledgePackSchemaVersion) {
    issues.push({ type: "schema", message: `schema_version must be ${clinicalKnowledgePackSchemaVersion}.` });
  }
  for (const field of ["pack_id", "title", "version"]) {
    if (!normalized[field]) {
      issues.push({ type: "required", message: `Knowledge pack is missing ${field}.` });
    }
  }
  const sourceIds = new Set((normalized.source_registry || []).map((source) => source.source_id || source.id).filter(Boolean));
  const itemIds = new Set();
  const intentIds = new Set();
  for (const [index, intent] of (normalized.intents || []).entries()) {
    const label = intent.intent_id || intent.label || `intent ${index + 1}`;
    if (!intent.intent_id) {
      issues.push({ type: "intent-id", message: `Knowledge pack intent ${index + 1} needs intent_id.` });
    }
    if (intent.intent_id && intentIds.has(intent.intent_id)) {
      issues.push({ type: "duplicate-intent", message: `Duplicate knowledge pack intent ${intent.intent_id}.` });
    }
    intentIds.add(intent.intent_id);
    if (!intent.label) {
      issues.push({ type: "intent-label", message: `${label} needs label.` });
    }
    if (!["validated", "partial", "draft", "unsupported"].includes(intent.status || "")) {
      issues.push({ type: "intent-status", message: `${label} has invalid status ${intent.status || "blank"}.` });
    }
    for (const field of ["aliases", "source_ids", "evidence_tags", "clinical_bundle_ids", "required_domains", "avoid_labels", "gold_case_ids"]) {
      if (intent[field] !== undefined && !Array.isArray(intent[field])) {
        issues.push({ type: "intent-field", message: `${label}.${field} must be an array when present.` });
      }
    }
    (intent.source_ids || []).forEach((sourceId) => {
      if (sourceIds.size && !sourceIds.has(sourceId)) {
        issues.push({ type: "intent-source", message: `${label} references unknown source ${sourceId}.` });
      }
    });
    if (containsPhiLikeContent(JSON.stringify(intent))) {
      issues.push({ type: "phi", message: `${label} appears to contain PHI-like content.` });
    }
  }
  for (const [index, item] of (normalized.items || []).entries()) {
    const label = item.item_id || item.exam_id || `item ${index + 1}`;
    if (!item.item_id && !item.exam_id) {
      issues.push({ type: "item-id", message: `Knowledge pack item ${index + 1} needs item_id or exam_id.` });
    }
    const stableId = item.item_id || item.exam_id;
    if (stableId && itemIds.has(stableId)) {
      issues.push({ type: "duplicate-item", message: `Duplicate knowledge pack item ${stableId}.` });
    }
    itemIds.add(stableId);
    if (!["question", "exam", "red_flag", "bundle_gap"].includes(item.kind || "")) {
      issues.push({ type: "kind", message: `${label} has invalid kind ${item.kind || "blank"}.` });
    }
    if (!item.label && !item.suggested_checklist_label) {
      issues.push({ type: "label", message: `${label} needs label or suggested_checklist_label.` });
    }
    if (item.evidence_source_primary && sourceIds.size && !sourceIds.has(item.evidence_source_primary)) {
      issues.push({ type: "source", message: `${label} references unknown source ${item.evidence_source_primary}.` });
    }
    if (containsPhiLikeContent(JSON.stringify(item))) {
      issues.push({ type: "phi", message: `${label} appears to contain PHI-like content.` });
    }
  }
  if (containsPhiLikeContent(JSON.stringify(normalized.review_notes || ""))) {
    issues.push({ type: "phi", message: "Knowledge pack review_notes appear to contain PHI-like content." });
  }
  return {
    ok: issues.length === 0,
    issues,
    pack: normalized,
    itemCount: (normalized.items || []).length,
    sourceCount: (normalized.source_registry || []).length,
    intentCount: (normalized.intents || []).length
  };
}

export function normalizeKnowledgePackReviewState(value = {}) {
  let parsed = {};
  try {
    parsed = typeof value === "string" && value.trim() ? JSON.parse(value) : (value || {});
  } catch (error) {
    parsed = {};
  }
  return {
    schema: "clinicalKnowledgePackReviewV1",
    packs: Array.isArray(parsed.packs) ? parsed.packs : [],
    updatedAt: parsed.updatedAt || ""
  };
}

export function stageClinicalKnowledgePack(state, packValidation) {
  const reviewState = normalizeKnowledgePackReviewState(state);
  if (!packValidation?.ok) {
    return reviewState;
  }
  const stagedPack = {
    pack_id: packValidation.pack.pack_id,
    title: packValidation.pack.title,
    version: packValidation.pack.version,
    status: "staged",
    stagedAt: new Date().toISOString(),
    itemCount: packValidation.itemCount,
    sourceCount: packValidation.sourceCount,
    intentCount: packValidation.intentCount || 0,
    pack: packValidation.pack
  };
  const packs = reviewState.packs.filter((pack) => pack.pack_id !== stagedPack.pack_id);
  packs.push(stagedPack);
  return {
    ...reviewState,
    packs,
    updatedAt: stagedPack.stagedAt
  };
}
