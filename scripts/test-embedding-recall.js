import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checklistPrompt } from "../checklist.js";
import {
  buildRecommendedExamChecklist,
  joinEvidenceCatalog,
  mergeLegacyPhysicalExamOverlay,
  parseCsv
} from "../evidence.js";
import {
  buildEvidencePromptReplacementFromRanked,
  buildEmbeddingIndex,
  clinicalKnowledgePackSchemaVersion,
  defaultEmbeddingModelKey,
  embeddingIndexStorageKey,
  embeddingModelRegistry,
  formatEmbeddingDocumentText,
  formatEmbeddingQueryText,
  getOrBuildEmbeddingIndex,
  isEmbeddingManifestCurrent,
  normalizeEmbeddingSettings,
  normalizeKnowledgePackReviewState,
  rankEvidenceCandidatesHybrid,
  stageClinicalKnowledgePack,
  validateClinicalKnowledgePack
} from "../embedding-recall.js";

const baseRows = parseCsv(readFileSync("data/evidence/exam_technique_base.csv", "utf8"));
const overlayRows = parseCsv(readFileSync("data/evidence/exam_evidence_overlay.csv", "utf8"));
const legacyOverlayRows = parseCsv(readFileSync("data/physical-exam/physical_exam_evidence_overlay.csv", "utf8"));
const tagRows = parseCsv(readFileSync("data/evidence/retrieval_tag_dictionary.csv", "utf8"));
const sourceRows = parseCsv(readFileSync("data/evidence/source_registry.csv", "utf8"));
const catalog = joinEvidenceCatalog(
  baseRows,
  mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows),
  sourceRows
);

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.get(key) || null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }
}

function oneHot(index, dimensions = 768) {
  const vector = new Array(dimensions).fill(0);
  vector[index] = 1;
  return vector;
}

function fakeVector(text) {
  const normalized = String(text || "").toLowerCase();
  if (/semantic-only-alpha|burning pee|dysuria|urinary|flank|cva tenderness|costovertebral|pyelo/.test(normalized)) {
    return oneHot(0);
  }
  if (/stomach cramps|belly pain|abdominal|bowel|murphy|rebound/.test(normalized)) {
    return oneHot(1);
  }
  if (/can't breathe|dyspnea|pulmonary embolism|lung sounds|respiratory rate|edema|jvp/.test(normalized)) {
    return oneHot(2);
  }
  return oneHot(7);
}

const fakeEmbeddingService = {
  runtime: "mock",
  async embedDocuments(texts) {
    return texts.map(fakeVector);
  },
  async embedQuery(text) {
    return fakeVector(text);
  }
};

const settings = normalizeEmbeddingSettings({
  modelKey: "embeddinggemma",
  dtype: "q4",
  dimensions: 768,
  threshold: 0.6,
  topK: 18
});

assert.equal(defaultEmbeddingModelKey, "embeddinggemma", "EmbeddingGemma should be the primary model candidate");
assert.equal(embeddingModelRegistry.embeddinggemma.modelId, "onnx-community/embeddinggemma-300m-ONNX");
assert.equal(settings.dtype, "q4", "browser default should use q4");
assert.equal(settings.dimensions, 768, "default EmbeddingGemma vector size should be 768");
assert.ok(formatEmbeddingQueryText("stomach cramps", settings).startsWith("task: search result | query:"), "Gemma query prefix should be present");
assert.ok(formatEmbeddingDocumentText(catalog[0], settings).startsWith("title:"), "Gemma document prefix should be present");

const storage = new MemoryStorage();
const storageKey = embeddingIndexStorageKey(settings);
const subset = catalog.slice(0, 36);
const firstIndexResult = await getOrBuildEmbeddingIndex(subset, fakeEmbeddingService, {
  ...settings,
  storage,
  storageKey
});
assert.ok(firstIndexResult.rebuilt, "first index load should rebuild");
assert.ok(firstIndexResult.index.entries.length === subset.length, "index should contain one entry per catalog row");
assert.ok(isEmbeddingManifestCurrent(firstIndexResult.index, subset, settings), "fresh index manifest should be current");

const secondIndexResult = await getOrBuildEmbeddingIndex(subset, fakeEmbeddingService, {
  ...settings,
  storage,
  storageKey
});
assert.ok(secondIndexResult.fromCache, "second index load should reuse local storage cache");
assert.ok(!isEmbeddingManifestCurrent(firstIndexResult.index, subset, { ...settings, dimensions: 256 }), "dimension changes should stale the index");

const directIndex = await buildEmbeddingIndex(subset, fakeEmbeddingService, settings);
assert.equal(directIndex.manifest.modelId, settings.modelId, "index manifest should store the model id");
assert.equal(directIndex.manifest.dtype, "q4", "index manifest should store quantization");

const semanticOnlyRanked = await rankEvidenceCandidatesHybrid(catalog, "semantic-only-alpha", tagRows, {
  maxCandidates: 28,
  embedding: {
    ...settings,
    enabled: true
  },
  embeddingService: fakeEmbeddingService,
  storage: new MemoryStorage()
});
assert.ok(semanticOnlyRanked.embeddingStatus.ok, "hybrid ranker should report embedding success");
assert.equal(semanticOnlyRanked.retrievalMode, "hybrid", "semantic hits should switch retrieval mode to hybrid");
assert.ok(semanticOnlyRanked.candidates.some((candidate) => candidate.retrievalRoutes?.includes("embedding")), "hybrid ranked list should include embedding-routed candidates");
assert.ok(
  semanticOnlyRanked.candidates.some((candidate) => /cva|urinary|flank|costovertebral/i.test(`${candidate.examLabel} ${candidate.diagnostic_target} ${candidate.retrieval_tags}`)),
  "semantic recall should broaden retrieval to clinically related urinary/flank candidates"
);

const semanticOnlyRecommendation = buildRecommendedExamChecklist("semantic-only-alpha", semanticOnlyRanked);
assert.equal(
  semanticOnlyRecommendation.coreItems.filter((entry) => entry.candidate?.embeddingOnly).length,
  0,
  "embedding-only suggestions should not become core without bundle/tag/evidence support"
);

const dysuriaRanked = await rankEvidenceCandidatesHybrid(catalog, "Burning pee with fever and flank pain", tagRows, {
  maxCandidates: 40,
  embedding: {
    ...settings,
    enabled: true
  },
  embeddingService: fakeEmbeddingService,
  storage: new MemoryStorage()
});
const dysuriaRecommended = buildRecommendedExamChecklist("Burning pee with fever and flank pain", dysuriaRanked);
assert.ok(
  [...dysuriaRecommended.coreItems, ...dysuriaRecommended.conditionalItems]
    .some((entry) => /cva tenderness|blood pressure|heart rate|abdominal/i.test(`${entry.label} ${entry.candidate?.maneuver || ""}`)),
  "hybrid retrieval should still feed the deterministic clinical recommendation layer"
);

const promptReplacement = buildEvidencePromptReplacementFromRanked(
  checklistPrompt,
  { catalog, tagRows },
  "semantic-only-alpha",
  semanticOnlyRanked,
  { maxCandidates: 18 }
);
assert.ok(promptReplacement.prompt.includes("<retrieved_evidence_candidates>"), "prompt replacement should use retrieved evidence candidates");
assert.ok(!promptReplacement.prompt.includes("<student_exam_reference>"), "prompt replacement should remove the legacy student exam reference block");
assert.ok(promptReplacement.prompt.includes("starting point, not an exclusive list"), "OpenEvidence prompt should preserve the starting-point contract");

const validPack = {
  schema_version: clinicalKnowledgePackSchemaVersion,
  pack_id: "burning_pee_pack_v1",
  title: "Burning pee pack",
  version: "2026-06-06",
  source_registry: [
    { source_id: "PACK_SRC", source_type: "guideline", citation: "Curated local test source" }
  ],
  intents: [
    {
      intent_id: "burning_pee_intent_v1",
      label: "Burning pee",
      status: "draft",
      aliases: ["burning pee"],
      source_ids: ["PACK_SRC"],
      evidence_tags: ["dysuria"],
      clinical_bundle_ids: ["gu_renal"],
      required_domains: ["vitals", "CVA tenderness"],
      avoid_labels: ["PMI"],
      gold_case_ids: ["burning_pee"]
    }
  ],
  items: [
    {
      item_id: "burning_pee_question",
      kind: "question",
      label: "Ask about dysuria and flank pain",
      evidence_source_primary: "PACK_SRC"
    }
  ]
};
const validPackResult = validateClinicalKnowledgePack(validPack);
assert.ok(validPackResult.ok, validPackResult.issues.map((issue) => issue.message).join("\n"));
assert.equal(validPackResult.intentCount, 1, "valid packs may stage intent definitions");
const staged = stageClinicalKnowledgePack(normalizeKnowledgePackReviewState(), validPackResult);
assert.equal(staged.packs.length, 1, "valid packs should stage for expert review");
assert.equal(staged.packs[0].status, "staged");
assert.equal(staged.packs[0].intentCount, 1, "staged pack should retain intent count");

const examplePackResult = validateClinicalKnowledgePack(readFileSync("medical-knowledge/examples/clinical_knowledge_pack_v1.example.json", "utf8"));
assert.ok(examplePackResult.ok, examplePackResult.issues.map((issue) => issue.message).join("\n"));
assert.ok(examplePackResult.itemCount >= 2, "example pack should contain plug-in-ready item examples");
assert.ok(examplePackResult.intentCount >= 1, "example pack should contain a staged intent example");

const duplicatePackResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [validPack.items[0], validPack.items[0]]
});
assert.ok(!duplicatePackResult.ok, "duplicate knowledge-pack items should fail validation");
assert.ok(duplicatePackResult.issues.some((issue) => issue.type === "duplicate-item"));

const badIntentPackResult = validateClinicalKnowledgePack({
  ...validPack,
  intents: [{ ...validPack.intents[0], source_ids: ["MISSING_SRC"] }]
});
assert.ok(!badIntentPackResult.ok, "intent source IDs must resolve to the pack source registry");
assert.ok(badIntentPackResult.issues.some((issue) => issue.type === "intent-source"));

const phiPackResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "phi_pack",
  items: [
    {
      item_id: "phi_item",
      kind: "exam",
      label: "Jane, Smith DOB 01/02/1980 needs CVA tenderness",
      evidence_source_primary: "PACK_SRC"
    }
  ]
});
assert.ok(!phiPackResult.ok, "PHI-like collaborator content should fail validation");
assert.ok(phiPackResult.issues.some((issue) => issue.type === "phi"));

const invalidJsonResult = validateClinicalKnowledgePack("{ nope");
assert.ok(!invalidJsonResult.ok, "invalid JSON should fail without throwing");
assert.ok(invalidJsonResult.issues.some((issue) => issue.type === "json"));

console.log("Embedding recall tests passed.");
