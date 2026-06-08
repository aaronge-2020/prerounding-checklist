import {
  buildRecommendedExamChecklist,
  formatEvidenceCandidatesBlock,
  formatEvidenceGapOnlyBlock,
  promptEligibleRecommendationCandidates,
  replaceStudentReferenceWithEvidenceBlock,
  rankEvidenceCandidates
} from "./evidence.js";
import { examSemanticConsistencyIssues } from "./complaint-cds.js";

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
  const validatedIntents = [
    ...(Array.isArray(options.validatedIntents) ? options.validatedIntents : []),
    ...(Array.isArray(options.selectedIntents) ? options.selectedIntents : [])
  ].filter((intentRow) => intentRow && intentRow.status === "validated");
  if (!validatedIntents.length) {
    return {
      success: false,
      blocked: true,
      blockedReason: "No validated clinical intent authorized evidence prompt injection.",
      prompt,
      evidenceBlock: "",
      candidates: [],
      promptCandidates: [],
      recommendation: null,
      matchedTags: [],
      embeddingStatus: ranked?.embeddingStatus || null
    };
  }
  const recommendation = buildRecommendedExamChecklist(contextText, ranked, options);
  const promptCandidates = promptEligibleRecommendationCandidates(recommendation, options);
  const evidenceBlock = formatEvidenceCandidatesBlock(promptCandidates, options)
    || formatEvidenceGapOnlyBlock(recommendation, options);
  return {
    success: Boolean(evidenceBlock),
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
    || /\b(?:MRN|medical record number)\s*[:#]?\s*[A-Z0-9-]{4,}\b/i.test(text)
    || /\b(?:room|rm|bed)\s*[:#-]?\s*[A-Za-z]?\d+[A-Za-z]?\b/i.test(text)
    || /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(text)
    || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)
    || /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/.test(text)
    || /\b(?:patient|pt|name)\s*[:#-]?\s*[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(text)
    || /\b[A-Z][a-z]+,\s*[A-Z][a-z]+\b/.test(text)
    || /\b\d{1,5}\s+[A-Z][A-Za-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln)\b/.test(text);
}

const forbiddenKnowledgePackFieldPattern = /^(?:raw[\s_-]*)?(?:(?:chart|patient|notes?|handoff|epic|mrn|dob|ssn|room|bed|address|phone|email|identifiers?)(?:[\s_-]*(?:text|context|info|name|id|number|date|of[\s_-]*birth|birthdate)s?)?|date[\s_-]*of[\s_-]*birth|birthdate)$/i;
const knowledgePackItemTypes = new Set([
  "history_question",
  "physical_exam_maneuver",
  "red_flag",
  "catalog_gap",
  "diagnostic_test",
  "reference_threshold",
  "management_change",
  "safety_check"
]);
const knowledgePackIntentTypes = new Set([
  "complaint",
  "diagnosis",
  "syndrome",
  "management_scenario"
]);
const legacyKnowledgePackKindToItemType = {
  question: "history_question",
  exam: "physical_exam_maneuver",
  red_flag: "red_flag",
  bundle_gap: "catalog_gap"
};
const knowledgePackBasicSafetyLabelPattern = /\b(?:blood pressure|heart rate|respiratory rate|oxygen saturation|spo2|pulse oximetry|bedside glucose|point-of-care glucose|fingerstick glucose|blood glucose|weight|body mass index|bmi|orthostatic|orthostasis|pain score|pregnancy status|pregnancy possibility|mental status|level of consciousness|general appearance|acuity|safety check|ability to protect airway|airway protection)\b|\b(?:measure|check|document|record|obtain|verify)\s+(?:temperature|temp|pregnancy)\b/i;
const knowledgePackActionSpecificSafetyLabelPattern = /^(?:measure|count|document|verify|clarify|calculate|review|screen|ask|obtain|observe)\b/i;
const knowledgePackWeakSafetyCheckLabelPattern = /^(?:assess|check|evaluate)\b|^(?:mental status|general appearance|pregnancy possibility safety check|bedside glucose safety check)$/i;
const knowledgePackBundledExamLabelPattern = /[,;:]|\/|\b(?:and|plus)\b.*\b(?:and|plus)\b|\b(?:focused exam|acuity screen|trigger exam|work-of-breathing|cardiac exam|pulmonary exam|perfusion and pulses|volume status)\b/i;
const knowledgePackBundledExamTextPattern = /\b(?:focused physical exam|complete physical exam|comprehensive exam|trigger exam|screen for|assess for .*(?:,|;|\/).*(?:,|;|\/)|positive, negative, and unable-to-assess|positive negative and unable)\b/i;
const knowledgePackPlaceholderTechniquePattern = /\bperform the named (?:bedside item|maneuver) directly\b/i;
const knowledgePackGenericDiagnosticTargetPattern = /\bfocused bedside finding relevant to\b|^\s*$/i;
const knowledgePackPlaceholderContentPattern = /\b(?:replace[\s_-]+with(?:[\s_-]+[a-z0-9]+)*|placeholder|todo|tbd|source[\s_-]+pending|citation[\s_-]+pending|reviewer[\s_-]+needed|not[\s_-]+yet[\s_-]+reviewed|lorem[\s_-]+ipsum|example[\s_-]+only)\b|example\.org\/replace-with-real-source/i;
const knowledgePackGenericFindingOptionPattern = /^(?:normal|abnormal|present|absent|normal absent|abnormal present|positive|negative|yes|no|unable|unable to assess|not assessed)$/i;
const knowledgePackExamConceptFamilies = [
  { id: "strength", pattern: /\b(?:strength|weakness|motor|hip flexor|chair rise|proximal)\b/i },
  { id: "bone_tenderness", pattern: /\b(?:bone tenderness|bony tenderness|spine tenderness|focal tenderness|skeletal pain)\b/i },
  { id: "gait", pattern: /\b(?:gait|fall|falls|ambulation|walk)\b/i },
  { id: "hypocalcemia_signs", pattern: /\b(?:hypocalcemia|chvostek|trousseau|tetany|carpopedal)\b/i },
  { id: "lung", pattern: /\b(?:lung|lungs|breath sounds|crackles|wheezes|rales|auscultation)\b/i },
  { id: "heart", pattern: /\b(?:heart sounds|murmur|s3|s4|precordium|cardiac)\b/i },
  { id: "jvp", pattern: /\b(?:jvp|jugular venous|neck veins)\b/i },
  { id: "edema", pattern: /\b(?:edema|swelling|pitting)\b/i },
  { id: "pulses", pattern: /\b(?:pulse|pulses|capillary refill|perfusion)\b/i },
  { id: "abdomen", pattern: /\b(?:abdomen|abdominal|guarding|rebound|murphy|bowel sounds|cva)\b/i },
  { id: "skin", pattern: /\b(?:skin|rash|ulcer|wound|lesion|turgor|diaphoresis)\b/i },
  { id: "thyroid", pattern: /\b(?:thyroid|goiter|nodule|neck mass)\b/i },
  { id: "eye", pattern: /\b(?:visual|pupil|extraocular|diplopia|proptosis|ophthalmic)\b/i },
  { id: "neuro", pattern: /\b(?:cranial nerve|sensation|reflex|coordination|babinski|pronator|mental status)\b/i }
];

function collectForbiddenKnowledgePackFields(value, path = "pack", issues = []) {
  if (!value || typeof value !== "object") {
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKnowledgePackFields(item, `${path}[${index}]`, issues));
    return issues;
  }
  Object.entries(value).forEach(([key, child]) => {
    const nextPath = `${path}.${key}`;
    if (forbiddenKnowledgePackFieldPattern.test(key)) {
      issues.push({ type: "forbidden-field", message: `Knowledge pack must not include raw chart or identifier field ${nextPath}.` });
    }
    collectForbiddenKnowledgePackFields(child, nextPath, issues);
  });
  return issues;
}

function validateKnowledgePackNoPlaceholderText(issues, value, label, typePrefix = "placeholder") {
  const text = typeof value === "string" ? value : JSON.stringify(value || {});
  if (knowledgePackPlaceholderContentPattern.test(text)) {
    issues.push({
      type: `${typePrefix}-placeholder`,
      message: `${label} contains placeholder text; collaborator packs must include final source-backed content before staging.`
    });
  }
}

function sanitizeKnowledgePackReviewerId(value, fallback = "local_reviewer") {
  const raw = String(value || "").trim();
  if (!raw
    || /\s/.test(raw)
    || /\b\d{3}[-_\s]?\d{4}\b/.test(raw)
    || /[A-Z][a-z]+[_\s-]+[A-Z][a-z]+/.test(raw)
    || containsPhiLikeContent(raw)
    || knowledgePackPlaceholderContentPattern.test(raw)) {
    return fallback;
  }
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (!normalized || containsPhiLikeContent(normalized) || knowledgePackPlaceholderContentPattern.test(normalized)) {
    return fallback;
  }
  return normalized;
}

function safeKnowledgePackReviewNote(value, fallbackMessage = "Reviewer note omitted because it appeared to contain PHI, identifiers, or placeholder text.") {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (containsPhiLikeContent(raw) || knowledgePackPlaceholderContentPattern.test(raw)) {
    return fallbackMessage;
  }
  return raw.slice(0, 1000);
}

function safeKnowledgePackIsoTimestamp(value, fallback = new Date().toISOString()) {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }
  if (containsPhiLikeContent(raw) || knowledgePackPlaceholderContentPattern.test(raw)) {
    return fallback;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function joinSafeKnowledgePackReviewerNotes(notes = []) {
  return notes
    .map((note) => safeKnowledgePackReviewNote(note))
    .map((note) => String(note || "").trim())
    .filter(Boolean)
    .join("\n");
}

function sanitizeKnowledgePackForStaging(pack = {}) {
  const cloned = JSON.parse(JSON.stringify(pack || {}));
  cloned.intents = packArray(cloned.intents).map((intent) => {
    if (intent.status === "validated") {
      return {
        ...intent,
        imported_status: "validated",
        status: "draft",
        activation_note: "Imported validated status was downgraded for local staged review; activation requires explicit reviewer acceptance."
      };
    }
    return intent;
  });
  return cloned;
}

function packArray(value) {
  return Array.isArray(value) ? value : [];
}

function packSourceId(source = {}) {
  return source.source_id || source.id || "";
}

function sourceRefForPackItem(item = {}) {
  return item.evidence_source_primary || item.source_id || item.source?.source_id || "";
}

function packIntentRefs(object = {}) {
  return [
    ...packArray(object.intent_ids),
    object.intent_id
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function splitKnowledgePackList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizedKnowledgePackLabel(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function knowledgePackFindingOptionTokens(value = "") {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizedKnowledgePackLabel(entry)).filter(Boolean);
  }
  return String(value || "")
    .split(/[;,|/]+/)
    .map((entry) => normalizedKnowledgePackLabel(entry))
    .filter(Boolean);
}

function knowledgePackGenericFindingsOptions(value = "") {
  const tokens = knowledgePackFindingOptionTokens(value);
  if (tokens.length < 3) {
    return false;
  }
  const genericTokens = tokens.filter((token) => knowledgePackGenericFindingOptionPattern.test(token));
  if (genericTokens.length !== tokens.length) {
    return false;
  }
  const hasUnable = tokens.some((token) => /^(?:unable|unable to assess|not assessed)$/.test(token));
  const joined = tokens.join(" ");
  return hasUnable
    && ((/\bnormal\b/.test(joined) && /\babnormal\b/.test(joined))
      || (/\bpresent\b/.test(joined) && /\babsent\b/.test(joined))
      || (/\bpositive\b/.test(joined) && /\bnegative\b/.test(joined))
      || (/\byes\b/.test(joined) && /\bno\b/.test(joined)));
}

function knowledgePackExamConceptFamilyIds(value = "") {
  const text = String(value || "");
  return knowledgePackExamConceptFamilies
    .filter((family) => family.pattern.test(text))
    .map((family) => family.id);
}

function validateKnowledgePackAtomicExamManeuver(item, label, issues) {
  const displayLabel = String(item.label || item.suggested_checklist_label || label || "");
  const findingsOptions = item.findings_options || item.options || "";
  if (knowledgePackGenericFindingsOptions(findingsOptions)) {
    issues.push({ type: "exam-generic-findings_options", message: `${label} findings_options are generic; use maneuver-specific findings such as side, severity, or named positive/negative finding.` });
  }

  const labelFamilies = knowledgePackExamConceptFamilyIds(displayLabel);
  if (labelFamilies.length > 2) {
    issues.push({ type: "exam-bundled-label", message: `${label} physical exam label spans multiple exam families (${labelFamilies.join(", ")}); split it into one atomic maneuver per item.` });
  }

  const techniqueText = String(item.technique || item.action || "");
  const techniqueFamilies = knowledgePackExamConceptFamilyIds(techniqueText);
  if (knowledgePackBundledExamTextPattern.test(techniqueText) || techniqueFamilies.length > 2) {
    issues.push({ type: "exam-bundled-technique", message: `${label} technique appears to combine multiple maneuvers (${techniqueFamilies.join(", ") || "bundled wording"}); split the import into atomic exam rows.` });
  }

  const combinedExamText = [
    displayLabel,
    item.technique,
    item.diagnostic_target,
    item.result_changes_management,
    Array.isArray(findingsOptions) ? findingsOptions.join(" ") : findingsOptions
  ].filter(Boolean).join(" ");
  const staleGeneratedEndocrineBundle = /\bproximal strength\b.*\bbone tenderness\b.*\bgait\b.*\bhypocalcemia signs\b/i.test(combinedExamText)
    || (/\bproximal strength\b.*\bbone tenderness\b/i.test(combinedExamText)
      && /\b(?:gait|chvostek|trousseau|hypocalcemia)\b/i.test(combinedExamText));
  if (staleGeneratedEndocrineBundle) {
    issues.push({ type: "exam-bundled-generated-workup", message: `${label} contains stale bundled endocrine exam wording; split strength, bone tenderness, gait/falls, and hypocalcemia signs into separate maneuvers.` });
  }
}

function validatePackIntentRefs(issues, object, label, intentIds, typePrefix) {
  const refs = packIntentRefs(object);
  if (!refs.length) {
    issues.push({ type: `${typePrefix}-intent_ids`, message: `${label} needs intent_ids or intent_id for traceability to a staged intent.` });
    return;
  }
  const seen = new Set();
  refs.forEach((intentId) => {
    if (seen.has(intentId)) {
      issues.push({ type: `${typePrefix}-duplicate-intent-ref`, message: `${label} repeats intent reference ${intentId}.` });
    }
    seen.add(intentId);
    if (!intentIds.has(intentId)) {
      issues.push({ type: `${typePrefix}-intent-ref`, message: `${label} references unknown intent ${intentId}.` });
    }
  });
}

function validKnowledgePackLikelihoodRatio(value) {
  const text = String(value || "").trim();
  return /^(?:n\/a|na|not available|not studied|pending|[<>]?\s*\d+(?:\.\d+)?(?:\s*-\s*[<>]?\s*\d+(?:\.\d+)?)?)$/i.test(text);
}

function validPositiveNumberString(value) {
  const text = String(value || "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    return false;
  }
  return Number(text) >= 0;
}

function validKnowledgePackSourceUrlOrDoi(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  if (/^(?:https?):\/\/[^\s/$.?#].[^\s]*$/i.test(text)) {
    return true;
  }
  if (/^doi:\s*10\.\d{4,9}\/\S+$/i.test(text)) {
    return true;
  }
  if (/^10\.\d{4,9}\/\S+$/i.test(text)) {
    return true;
  }
  return false;
}

function hasAnyField(object = {}, fields = []) {
  return fields.some((field) => {
    return packValuePresent(object[field]);
  });
}

function packValuePresent(value) {
  if (Array.isArray(value)) {
    return value.some((item) => packValuePresent(item));
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return Boolean(value);
}

function hasPackField(object = {}, field) {
  return packValuePresent(object?.[field]);
}

function requireAnyPackField(issues, object, fields, label, typePrefix, displayName) {
  if (!fields.some((field) => hasPackField(object, field))) {
    issues.push({ type: `${typePrefix}-${fields[0]}`, message: `${label} needs ${displayName || fields.join(" or ")}.` });
  }
}

function requirePackFields(issues, object, fields, label, typePrefix) {
  fields.forEach((field) => {
    if (!packValuePresent(object?.[field])) {
      issues.push({ type: `${typePrefix}-${field}`, message: `${label} needs ${field}.` });
    }
  });
}

const knowledgePackLrNoteFields = ["likelihood_ratio_note", "LR_note", "lr_note"];

function hasKnowledgePackLikelihoodRatioNote(item = {}) {
  return knowledgePackLrNoteFields.some((field) => Boolean(String(item[field] || "").trim()));
}

function requireKnowledgePackLikelihoodRatioNote(issues, item, label, typePrefix) {
  if (!hasKnowledgePackLikelihoodRatioNote(item)) {
    issues.push({
      type: `${typePrefix}-likelihood_ratio_note`,
      message: `${label} needs likelihood_ratio_note explaining the quantitative LR values or why item-level LR evidence is unavailable/not applicable.`
    });
  }
}

function validateKnowledgePackLikelihoodRatioValues(item, label, issues, typePrefix) {
  if (item.LR_plus && !validKnowledgePackLikelihoodRatio(item.LR_plus)) {
    issues.push({ type: `${typePrefix}-LR_plus-format`, message: `${label} LR_plus must be n/a, not available, pending, a number, or a numeric range.` });
  }
  if (item.LR_minus && !validKnowledgePackLikelihoodRatio(item.LR_minus)) {
    issues.push({ type: `${typePrefix}-LR_minus-format`, message: `${label} LR_minus must be n/a, not available, pending, a number, or a numeric range.` });
  }
}

function knowledgePackQuestionNeedsDetailPrompts(text = "") {
  const value = String(text || "");
  const commaCount = (value.match(/,/g) || []).length;
  const orCount = (value.match(/\bor\b/gi) || []).length;
  return value.length >= 150
    || commaCount >= 5
    || orCount >= 4
    || (/^Any\b/i.test(value.trim()) && commaCount >= 3);
}

function validateKnowledgePackQuestionDetailPrompts(item, label, issues) {
  if (!knowledgePackQuestionNeedsDetailPrompts(item.text || item.label || "")) {
    return;
  }
  const prompts = Array.isArray(item.detail_prompts)
    ? item.detail_prompts.map((prompt) => String(prompt || "").trim()).filter(Boolean)
    : [];
  if (prompts.length < 2) {
    issues.push({
      type: "question-detail_prompts",
      message: `${label} is a broad history question and needs at least two concrete detail_prompts so collaborators do not stage an overloaded one-line history prompt.`
    });
    return;
  }
  prompts.forEach((prompt, index) => {
    if (prompt.length < 12 || !/[a-z]/i.test(prompt)) {
      issues.push({
        type: "question-detail_prompts",
        message: `${label} detail_prompts[${index}] should be a concrete clinician-facing sub-question or prompt.`
      });
    }
  });
}

function validateKnowledgePackQuestionItem(item, label, issues) {
  requirePackFields(
    issues,
    item,
    ["text", "options", "when_to_ask", "diagnostic_purpose", "management_implication", "tags"],
    label,
    "question"
  );
  if (item.text && !/\?$/.test(String(item.text).trim())) {
    issues.push({ type: "question-text", message: `${label} text must be phrased as an askable bedside question.` });
  }
  requireKnowledgePackLikelihoodRatioNote(issues, item, label, "question");
  validateKnowledgePackQuestionDetailPrompts(item, label, issues);
}

function validateKnowledgePackExamItem(item, label, issues) {
  requirePackFields(
    issues,
    item,
    [
      "technique",
      "when_to_use_structured",
      "diagnostic_target",
      "LR_plus",
      "LR_minus",
      "likelihood_ratio_note",
      "result_changes_management",
      "difficulty",
      "time_burden_minutes",
      "equipment_needed",
      "patient_cooperation_required",
      "limitations",
      "tags"
    ],
    label,
    "exam"
  );
  requireAnyPackField(issues, item, ["findings_options", "options"], label, "exam", "findings_options or options");
  validateKnowledgePackLikelihoodRatioValues(item, label, issues, "exam");
  if (item.time_burden_minutes && !validPositiveNumberString(item.time_burden_minutes)) {
    issues.push({ type: "exam-time_burden_minutes-format", message: `${label} time_burden_minutes must be a non-negative numeric string.` });
  }
  const displayLabel = String(item.label || item.suggested_checklist_label || label || "");
  if (knowledgePackBasicSafetyLabelPattern.test(`${displayLabel} ${item.diagnostic_target || ""}`)) {
    issues.push({ type: "exam-safety-check", message: `${label} appears to be basic bedside data or a safety check; import it as item_type safety_check, not physical_exam_maneuver.` });
  }
  if (knowledgePackBundledExamLabelPattern.test(displayLabel)) {
    issues.push({ type: "exam-bundled-label", message: `${label} physical exam label appears bundled or vague; split it into one atomic maneuver per item.` });
  }
  validateKnowledgePackAtomicExamManeuver(item, label, issues);
  if (item.technique && knowledgePackPlaceholderTechniquePattern.test(item.technique)) {
    issues.push({ type: "exam-placeholder-technique", message: `${label} needs a maneuver-specific technique, not a placeholder instruction.` });
  }
  if (item.diagnostic_target && knowledgePackGenericDiagnosticTargetPattern.test(item.diagnostic_target)) {
    issues.push({ type: "exam-generic-diagnostic-target", message: `${label} needs a specific diagnostic target.` });
  }
  const semanticIssues = examSemanticConsistencyIssues("knowledge-pack", "items", {
    id: item.item_id || item.exam_id || label,
    label: displayLabel,
    technique: item.technique,
    findings_options: item.findings_options || item.options,
    when_to_perform: item.when_to_use_structured,
    diagnostic_target: item.diagnostic_target,
    management_change: item.result_changes_management || item.management_link,
    limitations: item.limitations,
    tags: item.tags,
    source: {
      source_section: item.source?.source_section || item.source_section || item.evidence_source_primary || ""
    }
  });
  semanticIssues.forEach((message) => {
    issues.push({ type: "exam-semantic-mismatch", message });
  });
}

function validateKnowledgePackSafetyCheckItem(item, label, issues) {
  requirePackFields(
    issues,
    item,
    [
      "action",
      "rationale",
      "result_changes_management",
      "difficulty",
      "time_burden_minutes",
      "equipment_needed",
      "patient_cooperation_required",
      "limitations",
      "likelihood_ratio_note",
      "tags"
    ],
    label,
    "safety-check"
  );
  requireKnowledgePackLikelihoodRatioNote(issues, item, label, "safety-check");
  const displayLabel = String(item.label || label || "").trim();
  if (displayLabel && (!knowledgePackActionSpecificSafetyLabelPattern.test(displayLabel) || knowledgePackWeakSafetyCheckLabelPattern.test(displayLabel))) {
    issues.push({
      type: "safety-check-label",
      message: `${label} safety_check label should name a specific bedside action such as Measure, Count, Document, Verify, Clarify, Review, Screen, Ask, Obtain, or Observe.`
    });
  }
  if (item.time_burden_minutes && !validPositiveNumberString(item.time_burden_minutes)) {
    issues.push({ type: "safety-check-time_burden_minutes-format", message: `${label} time_burden_minutes must be a non-negative numeric string.` });
  }
}

function validateKnowledgePackDiagnosticTestItem(item, label, issues) {
  requirePackFields(
    issues,
    item,
    [
      "action",
      "LR_plus",
      "LR_minus",
      "likelihood_ratio_note",
      "interpretation_cautions",
      "tags"
    ],
    label,
    "diagnostic-test"
  );
  requireAnyPackField(
    issues,
    item,
    ["reference_range", "reference_ranges", "diagnostic_threshold", "diagnostic_thresholds", "thresholds", "interpretation"],
    label,
    "diagnostic-test",
    "reference range, diagnostic threshold, or interpretation"
  );
  validateKnowledgePackLikelihoodRatioValues(item, label, issues, "diagnostic-test");
}

function validateKnowledgePackReferenceThresholdItem(item, label, issues) {
  requirePackFields(
    issues,
    item,
    [
      "action",
      "LR_plus",
      "LR_minus",
      "likelihood_ratio_note",
      "interpretation_cautions",
      "tags"
    ],
    label,
    "reference-threshold"
  );
  requireAnyPackField(
    issues,
    item,
    ["reference_range", "reference_ranges", "diagnostic_threshold", "diagnostic_thresholds", "thresholds", "interpretation"],
    label,
    "reference-threshold",
    "reference range, diagnostic threshold, or interpretation"
  );
  validateKnowledgePackLikelihoodRatioValues(item, label, issues, "reference-threshold");
}

function validateKnowledgePackManagementChangeItem(item, label, issues) {
  requirePackFields(
    issues,
    item,
    [
      "action",
      "rationale",
      "LR_plus",
      "LR_minus",
      "likelihood_ratio_note",
      "limitations",
      "tags"
    ],
    label,
    "management-change"
  );
  validateKnowledgePackLikelihoodRatioValues(item, label, issues, "management-change");
}

function validateKnowledgePackRedFlagItem(item, label, issues) {
  requirePackFields(
    issues,
    item,
    [
      "action",
      "rationale",
      "LR_plus",
      "LR_minus",
      "likelihood_ratio_note",
      "limitations",
      "tags"
    ],
    label,
    "red-flag"
  );
  validateKnowledgePackLikelihoodRatioValues(item, label, issues, "red-flag");
}

function validateKnowledgePackItemType(item, label, issues) {
  const itemType = String(item.item_type || "").trim();
  if (!itemType) {
    issues.push({ type: "item-item_type", message: `${label} needs item_type so staged imports cannot blur history, safety checks, exams, tests, and gaps.` });
    return "";
  }
  if (!knowledgePackItemTypes.has(itemType)) {
    issues.push({ type: "item-item_type", message: `${label} has invalid item_type ${itemType}.` });
    return itemType;
  }
  if (item.kind) {
    const expectedFromKind = legacyKnowledgePackKindToItemType[item.kind];
    if (!expectedFromKind) {
      issues.push({ type: "kind", message: `${label} has invalid legacy kind ${item.kind}.` });
    } else if (expectedFromKind !== itemType) {
      issues.push({ type: "item-kind-type-mismatch", message: `${label} legacy kind ${item.kind} must map to item_type ${expectedFromKind}, got ${itemType}.` });
    }
  }
  return itemType;
}

function validateKnowledgePackSourceRegistry(pack, issues) {
  if (!Array.isArray(pack.source_registry) || !pack.source_registry.length) {
    issues.push({ type: "source-registry", message: "Knowledge pack needs a non-empty source_registry." });
    return new Set();
  }
  const sourceIds = new Set();
  pack.source_registry.forEach((source, index) => {
    const sourceId = packSourceId(source);
    const label = sourceId || `source ${index + 1}`;
    if (!sourceId) {
      issues.push({ type: "source-id", message: `Knowledge pack source ${index + 1} needs source_id.` });
      return;
    }
    if (sourceIds.has(sourceId)) {
      issues.push({ type: "duplicate-source", message: `Duplicate knowledge pack source ${sourceId}.` });
    }
    sourceIds.add(sourceId);
    requirePackFields(
      issues,
      source,
      ["source_type", "url_or_doi", "date_accessed", "license_or_access_notes"],
      label,
      "source"
    );
    if (source.date_accessed && !/^\d{4}-\d{2}-\d{2}$/.test(String(source.date_accessed))) {
      issues.push({ type: "source-date_accessed-format", message: `${label} date_accessed must use YYYY-MM-DD.` });
    }
    if (source.url_or_doi && !validKnowledgePackSourceUrlOrDoi(source.url_or_doi)) {
      issues.push({ type: "source-url_or_doi-format", message: `${label} url_or_doi must be an http(s) URL, doi:10.xxxx/... identifier, or bare DOI.` });
    }
    if (!source.preferred_citation && !source.citation) {
      issues.push({ type: "source-citation", message: `${label} needs preferred_citation or citation.` });
    }
    validateKnowledgePackNoPlaceholderText(issues, source, label, "source");
    if (containsPhiLikeContent(JSON.stringify(source))) {
      issues.push({ type: "phi", message: `${label} appears to contain PHI-like content.` });
    }
  });
  return sourceIds;
}

function validateKnowledgePackGoldCases(pack, issues, intentIds) {
  const goldCaseIds = new Set();
  const goldCaseIntentById = new Map();
  packArray(pack.gold_cases).forEach((goldCase, index) => {
    const label = goldCase.case_id || `gold case ${index + 1}`;
    if (!goldCase.case_id) {
      issues.push({ type: "gold-case-id", message: `Knowledge pack gold case ${index + 1} needs case_id.` });
    }
    if (goldCase.case_id && goldCaseIds.has(goldCase.case_id)) {
      issues.push({ type: "duplicate-gold-case", message: `Duplicate knowledge pack gold case ${goldCase.case_id}.` });
    }
    goldCaseIds.add(goldCase.case_id);
    requirePackFields(
      issues,
      goldCase,
      ["intent_id", "presentation", "expected_core_labels", "avoid_labels"],
      label,
      "gold-case"
    );
    if (goldCase.intent_id && !intentIds.has(goldCase.intent_id)) {
      issues.push({ type: "gold-case-intent", message: `${label} references unknown intent ${goldCase.intent_id}.` });
    }
    if (goldCase.case_id && goldCase.intent_id) {
      goldCaseIntentById.set(goldCase.case_id, goldCase.intent_id);
    }
    const expectedLabels = splitKnowledgePackList(goldCase.expected_core_labels);
    const acceptableLabels = splitKnowledgePackList(goldCase.acceptable_labels);
    const expectedSafetyLabels = splitKnowledgePackList(goldCase.expected_safety_labels);
    const acceptableSafetyLabels = splitKnowledgePackList(goldCase.acceptable_safety_labels);
    const expectedHistoryLabels = splitKnowledgePackList(goldCase.expected_history_labels);
    const acceptableHistoryLabels = splitKnowledgePackList(goldCase.acceptable_history_labels);
    const expectedTestLabels = splitKnowledgePackList(goldCase.expected_test_labels);
    const acceptableTestLabels = splitKnowledgePackList(goldCase.acceptable_test_labels);
    const expectedRedFlagLabels = splitKnowledgePackList(goldCase.expected_red_flag_labels);
    const acceptableRedFlagLabels = splitKnowledgePackList(goldCase.acceptable_red_flag_labels);
    const expectedManagementChangeLabels = splitKnowledgePackList(goldCase.expected_management_change_labels);
    const acceptableManagementChangeLabels = splitKnowledgePackList(goldCase.acceptable_management_change_labels);
    const avoidLabels = splitKnowledgePackList(goldCase.avoid_labels);
    if (!expectedLabels.length) {
      issues.push({ type: "gold-case-expected_core_labels", message: `${label} needs at least one concrete expected_core_labels entry.` });
    }
    const safetyExpectedLabels = expectedLabels.filter((candidateLabel) => knowledgePackBasicSafetyLabelPattern.test(candidateLabel));
    const safetyAcceptableLabels = acceptableLabels.filter((candidateLabel) => knowledgePackBasicSafetyLabelPattern.test(candidateLabel));
    if (safetyExpectedLabels.length) {
      issues.push({
        type: "gold-case-core-safety-label",
        message: `${label} lists basic safety data as expected_core_labels (${safetyExpectedLabels.join("; ")}); move them to expected_safety_labels so vitals/acuity checks do not count as physical exam maneuvers.`
      });
    }
    if (safetyAcceptableLabels.length) {
      issues.push({
        type: "gold-case-acceptable-safety-label",
        message: `${label} lists basic safety data as acceptable_labels (${safetyAcceptableLabels.join("; ")}); move them to acceptable_safety_labels.`
      });
    }
    if (expectedSafetyLabels.some((candidateLabel) => !knowledgePackBasicSafetyLabelPattern.test(candidateLabel))) {
      issues.push({
        type: "gold-case-expected_safety_labels",
        message: `${label} expected_safety_labels should contain only baseline acuity/safety items; keep true exam maneuvers in expected_core_labels.`
      });
    }
    if (acceptableSafetyLabels.some((candidateLabel) => !knowledgePackBasicSafetyLabelPattern.test(candidateLabel))) {
      issues.push({
        type: "gold-case-acceptable_safety_labels",
        message: `${label} acceptable_safety_labels should contain only baseline acuity/safety items; keep true exam maneuvers in acceptable_labels.`
      });
    }
    if (!avoidLabels.length) {
      issues.push({ type: "gold-case-avoid_labels", message: `${label} needs at least one concrete avoid_labels entry.` });
    }
    const avoidSet = new Set(avoidLabels.map(normalizedKnowledgePackLabel).filter(Boolean));
    [
      ...expectedLabels,
      ...acceptableLabels,
      ...expectedHistoryLabels,
      ...acceptableHistoryLabels,
      ...expectedTestLabels,
      ...acceptableTestLabels,
      ...expectedRedFlagLabels,
      ...acceptableRedFlagLabels,
      ...expectedManagementChangeLabels,
      ...acceptableManagementChangeLabels
    ].forEach((candidateLabel) => {
      const normalized = normalizedKnowledgePackLabel(candidateLabel);
      if (normalized && avoidSet.has(normalized)) {
        issues.push({ type: "gold-case-conflict", message: `${label} lists ${candidateLabel} as both expected/acceptable and avoid.` });
      }
    });
    validateKnowledgePackNoPlaceholderText(issues, goldCase, label, "gold-case");
    if (containsPhiLikeContent(JSON.stringify(goldCase))) {
      issues.push({ type: "phi", message: `${label} appears to contain PHI-like content.` });
    }
  });
  return { goldCaseIds, goldCaseIntentById };
}

function validateKnowledgePackSuppressRules(pack, issues, intentIds) {
  const ruleIds = new Set();
  const referencedIntentIds = new Set();
  packArray(pack.suppress_rules).forEach((rule, index) => {
    const label = rule.rule_id || `suppress rule ${index + 1}`;
    if (!rule.rule_id) {
      issues.push({ type: "suppress-rule-id", message: `Knowledge pack suppress rule ${index + 1} needs rule_id.` });
    }
    if (rule.rule_id && ruleIds.has(rule.rule_id)) {
      issues.push({ type: "duplicate-suppress-rule", message: `Duplicate knowledge pack suppress rule ${rule.rule_id}.` });
    }
    ruleIds.add(rule.rule_id);
    if (!hasAnyField(rule, ["when_context_lacks", "when_context_has", "when_tags_include", "unless_tags_include"])) {
      issues.push({ type: "suppress-rule-condition", message: `${label} needs a context or tag condition.` });
    }
    requirePackFields(issues, rule, ["suppress_labels", "reason"], label, "suppress-rule");
    validatePackIntentRefs(issues, rule, label, intentIds, "suppress-rule");
    packIntentRefs(rule).forEach((intentId) => {
      if (intentIds.has(intentId)) {
        referencedIntentIds.add(intentId);
      }
    });
    validateKnowledgePackNoPlaceholderText(issues, rule, label, "suppress-rule");
    if (containsPhiLikeContent(JSON.stringify(rule))) {
      issues.push({ type: "phi", message: `${label} appears to contain PHI-like content.` });
    }
  });
  return { ruleIds, referencedIntentIds };
}

function knowledgePackItemLabelMatches(item = {}, expectedLabel = "") {
  const expected = normalizedKnowledgePackLabel(expectedLabel);
  if (!expected) {
    return false;
  }
  const labels = [
    item.label,
    item.suggested_checklist_label,
    item.text,
    item.technique,
    item.action
  ].map((value) => normalizedKnowledgePackLabel(value)).filter(Boolean);
  return labels.some((label) => (
    label === expected
    || label.includes(expected)
    || expected.includes(label)
  ));
}

function validateKnowledgePackIntentCoverage(pack, issues) {
  const intents = packArray(pack.intents);
  const items = packArray(pack.items);
  const goldCases = packArray(pack.gold_cases);
  const itemTypesByIntent = new Map();

  items.forEach((item) => {
    const itemType = String(item.item_type || "").trim();
    packIntentRefs(item).forEach((intentId) => {
      if (!itemTypesByIntent.has(intentId)) {
        itemTypesByIntent.set(intentId, new Map());
      }
      const typeMap = itemTypesByIntent.get(intentId);
      if (!typeMap.has(itemType)) {
        typeMap.set(itemType, []);
      }
      typeMap.get(itemType).push(item);
    });
  });

  intents.forEach((intent, index) => {
    const intentId = String(intent.intent_id || "").trim();
    const label = intentId || intent.label || `intent ${index + 1}`;
    if (!intentId || String(intent.status || "").trim() === "unsupported") {
      return;
    }
    const typeMap = itemTypesByIntent.get(intentId) || new Map();
    const hasType = (type) => (typeMap.get(type) || []).length > 0;
    const hasAny = (types) => types.some((type) => hasType(type));

    if (!hasType("history_question")) {
      issues.push({
        type: "intent-history_question-coverage",
        message: `${label} needs at least one linked history_question item before reviewer activation can create an active validated workup.`
      });
    }
    if (!hasType("physical_exam_maneuver")) {
      issues.push({
        type: "intent-physical_exam_maneuver-coverage",
        message: `${label} needs at least one linked physical_exam_maneuver item before reviewer activation can create an active validated workup.`
      });
    }
    if (!hasType("safety_check")) {
      issues.push({
        type: "intent-safety_check-coverage",
        message: `${label} needs at least one linked safety_check item so basic bedside data/acuity checks remain modeled separately from physical exam maneuvers.`
      });
    }
    if (!hasAny(["diagnostic_test", "reference_threshold"])) {
      issues.push({
        type: "intent-test-threshold-coverage",
        message: `${label} needs at least one linked diagnostic_test or reference_threshold item so the workup includes auditable guideline thresholds or testing anchors.`
      });
    }
    if (!hasAny(["red_flag", "management_change"])) {
      issues.push({
        type: "intent-escalation-coverage",
        message: `${label} needs at least one linked red_flag or management_change item so management-changing results are explicit.`
      });
    }

    const linkedPhysicalExamItems = typeMap.get("physical_exam_maneuver") || [];
    const linkedSafetyItems = typeMap.get("safety_check") || [];
    const linkedHistoryItems = typeMap.get("history_question") || [];
    const linkedTestItems = [
      ...(typeMap.get("diagnostic_test") || []),
      ...(typeMap.get("reference_threshold") || [])
    ];
    const linkedRedFlagItems = typeMap.get("red_flag") || [];
    const linkedManagementChangeItems = typeMap.get("management_change") || [];
    goldCases
      .filter((goldCase) => goldCase.intent_id === intentId)
      .forEach((goldCase) => {
        const assertExpectedLabelsBacked = (fieldName, linkedItems, issueType, displayType) => {
          splitKnowledgePackList(goldCase[fieldName]).forEach((expectedLabel) => {
            if (!knowledgePackItemLabelMatches({ label: expectedLabel }, expectedLabel)) {
              return;
            }
            if (!linkedItems.some((item) => knowledgePackItemLabelMatches(item, expectedLabel))) {
              issues.push({
                type: issueType,
                message: `${goldCase.case_id || label} expects ${displayType} "${expectedLabel}", but no linked ${displayType} item in ${label} backs that gold label.`
              });
            }
          });
        };
        splitKnowledgePackList(goldCase.expected_core_labels).forEach((expectedLabel) => {
          if (!knowledgePackItemLabelMatches({ label: expectedLabel }, expectedLabel)) {
            return;
          }
          if (!linkedPhysicalExamItems.some((item) => knowledgePackItemLabelMatches(item, expectedLabel))) {
            issues.push({
              type: "gold-case-expected_core_label-unbacked",
              message: `${goldCase.case_id || label} expects core exam "${expectedLabel}", but no linked physical_exam_maneuver item in ${label} backs that gold label.`
            });
          }
        });
        splitKnowledgePackList(goldCase.expected_safety_labels).forEach((expectedLabel) => {
          if (!linkedSafetyItems.some((item) => knowledgePackItemLabelMatches(item, expectedLabel))) {
            issues.push({
              type: "gold-case-expected_safety_label-unbacked",
              message: `${goldCase.case_id || label} expects safety check "${expectedLabel}", but no linked safety_check item in ${label} backs that gold label.`
            });
          }
        });
        assertExpectedLabelsBacked(
          "expected_history_labels",
          linkedHistoryItems,
          "gold-case-expected_history_label-unbacked",
          "history_question"
        );
        assertExpectedLabelsBacked(
          "expected_test_labels",
          linkedTestItems,
          "gold-case-expected_test_label-unbacked",
          "diagnostic_test/reference_threshold"
        );
        assertExpectedLabelsBacked(
          "expected_red_flag_labels",
          linkedRedFlagItems,
          "gold-case-expected_red_flag_label-unbacked",
          "red_flag"
        );
        assertExpectedLabelsBacked(
          "expected_management_change_labels",
          linkedManagementChangeItems,
          "gold-case-expected_management_change_label-unbacked",
          "management_change"
        );
      });
  });
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
  const allowValidatedStatus = Boolean(options.allowValidatedStatus);
  if (normalized.schema_version !== clinicalKnowledgePackSchemaVersion) {
    issues.push({ type: "schema", message: `schema_version must be ${clinicalKnowledgePackSchemaVersion}.` });
  }
  for (const field of ["pack_id", "title", "version"]) {
    if (!normalized[field]) {
      issues.push({ type: "required", message: `Knowledge pack is missing ${field}.` });
    }
  }
  if (!normalized.review_notes) {
    issues.push({ type: "review-notes", message: "Knowledge pack needs review_notes describing provenance, scope, and reviewer caveats." });
  }
  ["pack_id", "title", "version", "review_notes", "complaint_aliases"].forEach((field) => {
    if (normalized[field] !== undefined) {
      validateKnowledgePackNoPlaceholderText(issues, normalized[field], `Knowledge pack ${field}`, "pack");
    }
  });
  collectForbiddenKnowledgePackFields(normalized, "pack", issues);
  const sourceIds = validateKnowledgePackSourceRegistry(normalized, issues);
  const itemIds = new Set();
  const intentIds = new Set();
  if (!Array.isArray(normalized.intents) || !normalized.intents.length) {
    issues.push({ type: "intents", message: "Knowledge pack needs at least one staged intent." });
  }
  for (const [index, intent] of packArray(normalized.intents).entries()) {
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
    if (intent.status === "validated" && !allowValidatedStatus) {
      issues.push({ type: "intent-status", message: `${label} cannot be imported as validated. Stage as draft/partial and activate only after reviewer acceptance.` });
    }
    if (!intent.intent_type) {
      issues.push({ type: "intent-intent_type", message: `${label} needs intent_type so collaborators declare whether the staged intent is a complaint, diagnosis, syndrome, or management scenario.` });
    } else if (!knowledgePackIntentTypes.has(String(intent.intent_type))) {
      issues.push({ type: "intent-intent_type", message: `${label} has invalid intent_type ${intent.intent_type}; use complaint, diagnosis, syndrome, or management_scenario.` });
    }
    for (const field of ["aliases", "source_ids", "evidence_tags", "clinical_bundle_ids", "required_domains", "avoid_labels", "gold_case_ids"]) {
      if (intent[field] !== undefined && !Array.isArray(intent[field])) {
        issues.push({ type: "intent-field", message: `${label}.${field} must be an array when present.` });
      }
    }
    requirePackFields(
      issues,
      intent,
      ["aliases", "intent_type", "source_ids", "evidence_tags", "clinical_bundle_ids", "required_domains", "avoid_labels", "gold_case_ids", "last_reviewed", "review_owner"],
      label,
      "intent"
    );
    if (intent.last_reviewed && !/^\d{4}-\d{2}-\d{2}$/.test(String(intent.last_reviewed))) {
      issues.push({ type: "intent-last_reviewed-format", message: `${label} last_reviewed must use YYYY-MM-DD.` });
    }
    (intent.source_ids || []).forEach((sourceId) => {
      if (!sourceIds.has(sourceId)) {
        issues.push({ type: "intent-source", message: `${label} references unknown source ${sourceId}.` });
      }
    });
    validateKnowledgePackNoPlaceholderText(issues, intent, label, "intent");
    if (containsPhiLikeContent(JSON.stringify(intent))) {
      issues.push({ type: "phi", message: `${label} appears to contain PHI-like content.` });
    }
  }
  const { goldCaseIds, goldCaseIntentById } = validateKnowledgePackGoldCases(normalized, issues, intentIds);
  const { referencedIntentIds: suppressRuleReferencedIntentIds } = validateKnowledgePackSuppressRules(normalized, issues, intentIds);
  for (const [index, intent] of packArray(normalized.intents).entries()) {
    const label = intent.intent_id || intent.label || `intent ${index + 1}`;
    if (intent.intent_id && !suppressRuleReferencedIntentIds.has(intent.intent_id)) {
      issues.push({ type: "intent-suppress_rules", message: `${label} needs at least one top-level suppress_rule referencing this intent so inappropriate maneuvers are auditable before activation.` });
    }
    (intent.gold_case_ids || []).forEach((caseId) => {
      if (!goldCaseIds.has(caseId)) {
        issues.push({ type: "intent-gold-case", message: `${label} references missing gold case ${caseId}.` });
      } else if (goldCaseIntentById.get(caseId) && goldCaseIntentById.get(caseId) !== intent.intent_id) {
        issues.push({ type: "intent-gold-case-intent", message: `${label} references gold case ${caseId} for ${goldCaseIntentById.get(caseId)}.` });
      }
    });
  }
  if (!Array.isArray(normalized.items) || !normalized.items.length) {
    issues.push({ type: "items", message: "Knowledge pack needs at least one question, exam, red flag, or bundle gap item." });
  }
  for (const [index, item] of packArray(normalized.items).entries()) {
    const label = item.item_id || item.exam_id || `item ${index + 1}`;
    if (!item.item_id && !item.exam_id) {
      issues.push({ type: "item-id", message: `Knowledge pack item ${index + 1} needs item_id or exam_id.` });
    }
    const stableId = item.item_id || item.exam_id;
    if (stableId && itemIds.has(stableId)) {
      issues.push({ type: "duplicate-item", message: `Duplicate knowledge pack item ${stableId}.` });
    }
    itemIds.add(stableId);
    const itemType = validateKnowledgePackItemType(item, label, issues);
    if (!item.label && !item.suggested_checklist_label) {
      issues.push({ type: "label", message: `${label} needs label or suggested_checklist_label.` });
    }
    const sourceId = sourceRefForPackItem(item);
    if (!sourceId) {
      issues.push({ type: "source", message: `${label} needs evidence_source_primary or source.source_id.` });
    } else if (!sourceIds.has(sourceId)) {
      issues.push({ type: "source", message: `${label} references unknown source ${sourceId}.` });
    }
    requirePackFields(
      issues,
      item,
      ["condition_or_syndrome", "diagnostic_target", "when_to_use_structured", "result_changes_management", "likelihood_ratio_note", "retrieval_tags", "reviewer_notes"],
      label,
      "item"
    );
    validatePackIntentRefs(issues, item, label, intentIds, "item");
    if (itemType === "history_question") {
      validateKnowledgePackQuestionItem(item, label, issues);
    }
    if (itemType === "physical_exam_maneuver") {
      validateKnowledgePackExamItem(item, label, issues);
    }
    if (itemType === "safety_check") {
      validateKnowledgePackSafetyCheckItem(item, label, issues);
    }
    if (itemType === "diagnostic_test") {
      validateKnowledgePackDiagnosticTestItem(item, label, issues);
    }
    if (itemType === "reference_threshold") {
      validateKnowledgePackReferenceThresholdItem(item, label, issues);
    }
    if (itemType === "management_change") {
      validateKnowledgePackManagementChangeItem(item, label, issues);
    }
    if (itemType === "red_flag") {
      validateKnowledgePackRedFlagItem(item, label, issues);
    }
    if (itemType === "catalog_gap") {
      requirePackFields(issues, item, ["result_changes_management", "retrieval_tags", "reviewer_notes"], label, "bundle-gap");
    }
    validateKnowledgePackNoPlaceholderText(issues, item, label, "item");
    if (containsPhiLikeContent(JSON.stringify(item))) {
      issues.push({ type: "phi", message: `${label} appears to contain PHI-like content.` });
    }
  }
  validateKnowledgePackIntentCoverage(normalized, issues);
  validateKnowledgePackNoPlaceholderText(issues, normalized.review_notes || "", "Knowledge pack review_notes", "review-notes");
  if (containsPhiLikeContent(JSON.stringify(normalized.review_notes || ""))) {
    issues.push({ type: "phi", message: "Knowledge pack review_notes appear to contain PHI-like content." });
  }
  return {
    ok: issues.length === 0,
    issues,
    pack: normalized,
    itemCount: (normalized.items || []).length,
    sourceCount: (normalized.source_registry || []).length,
    intentCount: (normalized.intents || []).length,
    goldCaseCount: (normalized.gold_cases || []).length,
    suppressRuleCount: (normalized.suppress_rules || []).length
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
    activationStatus: "inactive_pending_reviewer_acceptance",
    stagedAt: new Date().toISOString(),
    itemCount: packValidation.itemCount,
    sourceCount: packValidation.sourceCount,
    intentCount: packValidation.intentCount || 0,
    goldCaseCount: packValidation.goldCaseCount || 0,
    suppressRuleCount: packValidation.suppressRuleCount || 0,
    reviewerNotes: safeKnowledgePackReviewNote(packValidation.pack.review_notes || ""),
    pack: sanitizeKnowledgePackForStaging(packValidation.pack)
  };
  const packs = reviewState.packs.filter((pack) => pack.pack_id !== stagedPack.pack_id);
  packs.push(stagedPack);
  return {
    ...reviewState,
    packs,
    updatedAt: stagedPack.stagedAt
  };
}

function activateKnowledgePackIntentForReview(intent = {}, reviewer = "local_reviewer", activatedAt = "") {
  const importedStatus = String(intent.imported_status || intent.status || "").trim().toLowerCase();
  const reviewDate = String(activatedAt || new Date().toISOString()).slice(0, 10);
  if (importedStatus === "unsupported") {
    return {
      ...intent,
      imported_status: intent.imported_status || intent.status || "unsupported",
      status: "unsupported",
      last_reviewed: reviewDate,
      review_owner: reviewer,
      activation_note: "Kept unsupported after pack activation; unsupported intents remain searchable as gaps but cannot authorize recommendations."
    };
  }
  return {
    ...intent,
    imported_status: intent.imported_status || intent.status,
    status: "validated",
    last_reviewed: reviewDate,
    review_owner: reviewer,
    activation_note: "Activated locally after reviewer acceptance of the staged knowledge pack."
  };
}

export function activateStagedClinicalKnowledgePack(state, packId, options = {}) {
  const reviewState = normalizeKnowledgePackReviewState(state);
  const reviewer = sanitizeKnowledgePackReviewerId(options.reviewer || "local_reviewer");
  const reviewerNote = safeKnowledgePackReviewNote(options.note || "");
  const activatedAt = safeKnowledgePackIsoTimestamp(options.activatedAt);
  const packs = reviewState.packs.map((stagedPack) => {
    if (stagedPack.pack_id !== packId) {
      return stagedPack;
    }
    if (stagedPack.status !== "staged" || stagedPack.activationStatus !== "inactive_pending_reviewer_acceptance") {
      return stagedPack;
    }
    const pack = sanitizeKnowledgePackForStaging(stagedPack.pack || {});
    const validation = validateClinicalKnowledgePack(pack, { allowValidatedStatus: true });
    if (!validation.ok) {
      return {
        ...stagedPack,
        activationStatus: "inactive_validation_failed",
        activationIssues: validation.issues.slice(0, 12),
        reviewerNotes: joinSafeKnowledgePackReviewerNotes([stagedPack.reviewerNotes, reviewerNote, "Activation blocked because the staged pack no longer passes validation."]),
        updatedAt: activatedAt
      };
    }
    return {
      ...stagedPack,
      status: "accepted",
      activationStatus: "active_reviewer_accepted",
      activatedAt,
      activationReviewer: reviewer,
      reviewerNotes: joinSafeKnowledgePackReviewerNotes([stagedPack.reviewerNotes, reviewerNote]),
      pack: {
        ...pack,
        intents: packArray(pack.intents).map((intent) => activateKnowledgePackIntentForReview(intent, reviewer, activatedAt))
      }
    };
  });
  return {
    ...reviewState,
    packs,
    updatedAt: activatedAt
  };
}

export function rejectStagedClinicalKnowledgePack(state, packId, options = {}) {
  const reviewState = normalizeKnowledgePackReviewState(state);
  const rejectedAt = safeKnowledgePackIsoTimestamp(options.rejectedAt);
  const reviewer = sanitizeKnowledgePackReviewerId(options.reviewer || "local_reviewer");
  const reviewerNote = safeKnowledgePackReviewNote(options.note || "");
  const packs = reviewState.packs.map((stagedPack) => (
    stagedPack.pack_id === packId
      ? {
          ...stagedPack,
          status: "rejected",
          activationStatus: "inactive_rejected",
          rejectedAt,
          rejectionReviewer: reviewer,
          reviewerNotes: joinSafeKnowledgePackReviewerNotes([stagedPack.reviewerNotes, reviewerNote])
        }
      : stagedPack
  ));
  return {
    ...reviewState,
    packs,
    updatedAt: rejectedAt
  };
}

export function activeClinicalKnowledgePacks(state = {}) {
  return normalizeKnowledgePackReviewState(state).packs.filter((pack) => (
    pack.status === "accepted" && pack.activationStatus === "active_reviewer_accepted" && pack.pack
  ));
}

export function activeClinicalKnowledgePackIntents(state = {}) {
  return activeClinicalKnowledgePacks(state).flatMap((stagedPack) => (
    packArray(stagedPack.pack.intents)
      .filter((intent) => intent.status === "validated")
      .map((intent) => ({
      schema_version: "clinical-intent-registry-v1",
      ...intent,
      status: "validated",
      knowledge_pack_id: stagedPack.pack_id,
      source_ids: packArray(intent.source_ids),
      aliases: packArray(intent.aliases),
      evidence_tags: packArray(intent.evidence_tags),
      clinical_bundle_ids: packArray(intent.clinical_bundle_ids),
      required_domains: packArray(intent.required_domains),
      avoid_labels: packArray(intent.avoid_labels),
      suppress_rules: packArray(stagedPack.pack.suppress_rules)
        .filter((rule) => packIntentRefs(rule).includes(intent.intent_id))
        .map((rule) => ({
          ...rule,
          intent_ids: packIntentRefs(rule),
          suppress_labels: splitPackTags(rule.suppress_labels),
          unless_tags_include: splitPackTags(rule.unless_tags_include || rule.when_context_has || rule.when_tags_include || rule.when_context_lacks || ""),
          reason: rule.reason || "Reviewer-accepted knowledge-pack suppress rule.",
          rule_scope: rule.rule_scope || "reviewer_accepted_pack_suppress_unless_triggered"
      })),
      gold_case_ids: packArray(intent.gold_case_ids)
    }))
  ));
}

export function activeClinicalKnowledgePackGoldCases(state = {}) {
  return activeClinicalKnowledgePacks(state).flatMap((stagedPack) => {
    const activeIntentIds = new Set(
      packArray(stagedPack.pack?.intents)
        .filter((intent) => intent.status === "validated")
        .map((intent) => intent.intent_id)
        .filter(Boolean)
    );
    return packArray(stagedPack.pack?.gold_cases)
      .filter((goldCase) => activeIntentIds.has(goldCase.intent_id))
      .map((goldCase) => ({
        ...goldCase,
        knowledge_pack_id: stagedPack.pack_id,
        review_status: "accepted",
        activated_at: stagedPack.activatedAt || "",
        review_owner: stagedPack.activationReviewer || "local_reviewer",
        expected_core_labels_list: splitKnowledgePackList(goldCase.expected_core_labels),
        acceptable_labels_list: splitKnowledgePackList(goldCase.acceptable_labels),
        expected_safety_labels_list: splitKnowledgePackList(goldCase.expected_safety_labels),
        acceptable_safety_labels_list: splitKnowledgePackList(goldCase.acceptable_safety_labels),
        expected_history_labels_list: splitKnowledgePackList(goldCase.expected_history_labels),
        acceptable_history_labels_list: splitKnowledgePackList(goldCase.acceptable_history_labels),
        expected_test_labels_list: splitKnowledgePackList(goldCase.expected_test_labels),
        acceptable_test_labels_list: splitKnowledgePackList(goldCase.acceptable_test_labels),
        expected_red_flag_labels_list: splitKnowledgePackList(goldCase.expected_red_flag_labels),
        acceptable_red_flag_labels_list: splitKnowledgePackList(goldCase.acceptable_red_flag_labels),
        expected_management_change_labels_list: splitKnowledgePackList(goldCase.expected_management_change_labels),
        acceptable_management_change_labels_list: splitKnowledgePackList(goldCase.acceptable_management_change_labels),
        avoid_labels_list: splitKnowledgePackList(goldCase.avoid_labels),
        required_rationale_terms_list: splitKnowledgePackList(goldCase.required_rationale_terms)
      }));
  });
}

function sourceCitationForActivePack(stagedPack = {}, sourceId = "") {
  const source = packArray(stagedPack.pack?.source_registry).find((row) => packSourceId(row) === sourceId) || {};
  return source.preferred_citation || source.citation || source.url_or_doi || sourceId;
}

function sourceUrlForActivePack(stagedPack = {}, sourceId = "") {
  const source = packArray(stagedPack.pack?.source_registry).find((row) => packSourceId(row) === sourceId) || {};
  return source.url_or_doi || "";
}

function splitPackTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function knowledgePackLikelihoodRatioUnavailable(value) {
  const text = String(value || "").trim().toLowerCase();
  return !text || /^(?:n\/a|na|not available|unavailable|not studied|pending)$/i.test(text);
}

function knowledgePackLikelihoodRatioNote(item = {}, itemType = "", lrPlus = "", lrMinus = "") {
  const explicit = item.likelihood_ratio_note
    || item.LR_note
    || item.lr_note
    || item.likelihoodRatioNote;
  if (explicit) {
    return explicit;
  }
  if (!knowledgePackLikelihoodRatioUnavailable(lrPlus) || !knowledgePackLikelihoodRatioUnavailable(lrMinus)) {
    return "Quantitative likelihood-ratio values are available in the curated metadata; interpret with the cited source, pretest probability, and patient context.";
  }
  const normalizedType = String(itemType || item.item_type || "").toLowerCase();
  if (normalizedType === "safety_check") {
    return "Likelihood ratios are not applicable to routine bedside safety data; use this item to assess acuity, monitoring needs, and management safety rather than diagnostic probability.";
  }
  if (normalizedType === "history_question") {
    return "Question-level LR+/LR- is not available unless the cited evidence validates the exact response; use this answer to localize the source, assess severity, and guide management.";
  }
  if (["diagnostic_test", "reference_threshold", "red_flag", "management_change"].includes(normalizedType)) {
    return "Likelihood ratios are not applicable to this structured workup support item; use the cited guideline or threshold to guide testing, escalation, or management.";
  }
  return "No maneuver-specific LR+/LR- is available in the local validated source metadata; treat this bedside finding as supportive and interpret it with the cited guideline, diagnostic tests, and patient context.";
}

export function activeClinicalKnowledgePackEvidenceCandidates(state = {}) {
  return activeClinicalKnowledgePacks(state).flatMap((stagedPack) => {
    const pack = stagedPack.pack || {};
    const activeIntents = packArray(pack.intents).filter((intent) => intent.status === "validated");
    const activeIntentIds = new Set(activeIntents.map((intent) => intent.intent_id).filter(Boolean));
    const intentById = new Map(activeIntents.map((intent) => [intent.intent_id, intent]));
    return packArray(pack.items)
      .filter((item) => [
        "history_question",
        "physical_exam_maneuver",
        "safety_check",
        "diagnostic_test",
        "reference_threshold",
        "management_change",
        "red_flag"
      ].includes(item.item_type))
      .filter((item) => packIntentRefs(item).some((intentId) => activeIntentIds.has(intentId)))
      .map((item, index) => {
        const sourceId = sourceRefForPackItem(item);
        const intentRefs = packIntentRefs(item).filter((intentId) => activeIntentIds.has(intentId));
        const intentTags = intentRefs.flatMap((intentId) => intentById.get(intentId)?.evidence_tags || []);
        const tags = unique([
          ...splitPackTags(item.tags),
          ...splitPackTags(item.retrieval_tags),
          ...intentTags
        ]);
        const stableId = item.exam_id || item.item_id;
        const LR_plus = item.LR_plus || "n/a";
        const LR_minus = item.LR_minus || "n/a";
        const likelihoodRatioNote = knowledgePackLikelihoodRatioNote(item, item.item_type, LR_plus, LR_minus);
        return {
          exam_id: stableId,
          base_row_number: "",
          base_row_fingerprint: `knowledge-pack:${stagedPack.pack_id}:${stableId}`,
          source_item: stableId,
          source_item_is_unique: "true",
          examLabel: item.label || item.text || stableId,
          examOptions: Array.isArray(item.findings_options)
            ? item.findings_options.join(" / ")
            : (item.options || ""),
          maneuver: item.technique || item.action || item.label || item.text || stableId,
          technique: item.technique || item.action || item.text || "",
          condition_or_syndrome: item.condition_or_syndrome || "",
          diagnostic_target: item.diagnostic_target || "",
          bedside_question_label: item.item_type === "history_question" ? item.text || item.label || "" : (item.bedside_question_label || ""),
          bedside_question_options: item.item_type === "history_question" ? item.options || "" : (item.bedside_question_options || ""),
          detail_prompts: Array.isArray(item.detail_prompts) ? item.detail_prompts : [],
          when_to_use_structured: item.when_to_use_structured || item.when_to_ask || "",
          result_changes_management: item.result_changes_management || item.management_implication || "",
          management_link: item.result_changes_management || item.management_implication || "",
          evidence_source_primary: sourceId,
          source_citation: sourceCitationForActivePack(stagedPack, sourceId),
          source_url: sourceUrlForActivePack(stagedPack, sourceId),
          LR_plus,
          LR_minus,
          likelihood_ratio_note: likelihoodRatioNote,
          evidence_tier: item.evidence_tier || "reviewer_accepted_pack",
          difficulty: item.difficulty || "easy",
          time_burden_minutes: item.time_burden_minutes || "1",
          equipment_needed: item.equipment_needed || "none",
          patient_cooperation_required: item.patient_cooperation_required || "low",
          care_setting: item.care_setting || "clinician support",
          limitations: item.limitations
            || item.interpretation_cautions
            || "Imported reviewer-accepted knowledge-pack item; interpret in clinical context and maintain local review.",
          retrieval_tags: tags.join(";"),
          tags,
          item_type: item.item_type,
          validated_intent_ids: intentRefs,
          score: 100,
          scoreBreakdown: {
            clinicalRelevance: 100,
            actionability: 95,
            diagnosticValue: item.item_type === "history_question" ? 70 : 80,
            bedsideFeasibility: 90,
            specialtyBonus: 15
          },
          retrievalRoutes: ["activated_knowledge_pack"],
          review: {
            status: "accepted",
            reviewer: stagedPack.activationReviewer || "local_reviewer",
            updatedAt: stagedPack.activatedAt || stagedPack.updatedAt || ""
          },
          traceability: {
            intent_ids: intentRefs,
            source_ids: [sourceId].filter(Boolean),
            knowledge_pack_id: stagedPack.pack_id,
            item_id: stableId,
            authorized_by: "accepted_knowledge_pack"
          },
          originalIndex: 100000 + index
        };
      });
  });
}
