import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checklistPrompt } from "../checklist.js";
import {
  buildClinicalIntentRetrievalContext,
  filterEvidenceCatalogForClinicalIntents,
  resolveClinicalIntents,
  selectedValidatedClinicalIntents
} from "../clinical-intents.js";
import {
  buildRecommendedExamChecklist,
  joinEvidenceCatalog,
  mergeLegacyPhysicalExamOverlay,
  parseCsv
} from "../evidence.js";
import {
  activateStagedClinicalKnowledgePack,
  activeClinicalKnowledgePackEvidenceCandidates,
  activeClinicalKnowledgePackGoldCases,
  activeClinicalKnowledgePackIntents,
  activeClinicalKnowledgePacks,
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
  rejectStagedClinicalKnowledgePack,
  stageClinicalKnowledgePack,
  validateClinicalKnowledgePack
} from "../embedding-recall.js";

const baseRows = parseCsv(readFileSync("data/evidence/exam_technique_base.csv", "utf8"));
const overlayRows = parseCsv(readFileSync("data/evidence/exam_evidence_overlay.csv", "utf8"));
const legacyOverlayRows = parseCsv(readFileSync("data/physical-exam/physical_exam_evidence_overlay.csv", "utf8"));
const acceptedCatalogAdditionRows = parseCsv(readFileSync("data/evidence/accepted_exam_catalog_additions.csv", "utf8"));
const tagRows = parseCsv(readFileSync("data/evidence/retrieval_tag_dictionary.csv", "utf8"));
const sourceRows = parseCsv(readFileSync("data/evidence/source_registry.csv", "utf8"));
const catalog = joinEvidenceCatalog(
  baseRows,
  mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows),
  sourceRows,
  acceptedCatalogAdditionRows
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

const knowledgePackSchema = JSON.parse(readFileSync("medical-knowledge/schema/clinical-knowledge-pack-v1.schema.json", "utf8"));
assert.equal(knowledgePackSchema.properties.schema_version.const, clinicalKnowledgePackSchemaVersion, "knowledge-pack schema should match runtime schema version");
[
  "source_registry",
  "intents",
  "items",
  "gold_cases",
  "suppress_rules",
  "review_notes"
].forEach((field) => assert.ok(knowledgePackSchema.required.includes(field), `knowledge-pack schema should require ${field}`));
assert.deepEqual(
  knowledgePackSchema.$defs.intent.properties.status.enum,
  ["draft", "partial", "unsupported"],
  "import schema should not allow self-activated validated intents"
);
assert.equal(
  knowledgePackSchema.propertyNames?.$ref,
  "#/$defs/safePropertyName",
  "knowledge-pack root schema should reject raw chart and identifier property names"
);
["source", "intent", "item", "goldCase", "suppressRule"].forEach((definitionName) => {
  assert.equal(
    knowledgePackSchema.$defs[definitionName].propertyNames?.$ref,
    "#/$defs/safePropertyName",
    `knowledge-pack ${definitionName} schema should reject raw chart and identifier property names`
  );
});
const forbiddenKnowledgePackPropertyPattern = new RegExp(knowledgePackSchema.$defs.safePropertyName.not.pattern, "i");
[
  "raw_chart_text",
  "rawChartText",
  "patient_name",
  "patientName",
  "dateOfBirth",
  "bedNumber",
  "mrn",
  "dob",
  "room",
  "address",
  "phone",
  "email",
  "identifier",
  "notes"
].forEach((field) => {
  assert.ok(forbiddenKnowledgePackPropertyPattern.test(field), `knowledge-pack schema should flag unsafe field name ${field}`);
});
["review_notes", "reviewer_notes", "review_owner", "patient_cooperation_required", "source_id", "intent_id"].forEach((field) => {
  assert.ok(!forbiddenKnowledgePackPropertyPattern.test(field), `knowledge-pack schema should allow non-PHI metadata field ${field}`);
});
assert.ok(knowledgePackSchema.$defs.item.required.includes("intent_ids"), "knowledge-pack items should require intent_ids for staged-intent traceability");
assert.ok(knowledgePackSchema.$defs.item.required.includes("item_type"), "knowledge-pack items should require item_type for section/type separation");
assert.ok(knowledgePackSchema.$defs.item.required.includes("likelihood_ratio_note"), "knowledge-pack items should require explicit LR/evidence interpretation notes");
assert.ok(knowledgePackSchema.$defs.intent.required.includes("intent_type"), "knowledge-pack intents should require intent_type for complaint/diagnosis/syndrome separation");
assert.ok(knowledgePackSchema.$defs.intent.required.includes("applicability"), "knowledge-pack intents should require explicit applicability constraints");
assert.deepEqual(
  knowledgePackSchema.$defs.applicability.properties.pregnancy_status_required.enum,
  ["pregnant", "must_assess", "not_required_but_must_consider", "not_applicable", "not_limited"],
  "knowledge-pack applicability should restrict pregnancy_status_required to recognized patient-context values"
);
assert.equal(knowledgePackSchema.$defs.applicability.properties.use_when.minItems, 1, "knowledge-pack applicability should require at least one use_when scope statement");
assert.equal(knowledgePackSchema.$defs.applicability.properties.do_not_use_when.minItems, 1, "knowledge-pack applicability should require at least one do_not_use_when limitation");
assert.deepEqual(
  knowledgePackSchema.$defs.intent.properties.intent_type.enum,
  ["complaint", "diagnosis", "syndrome", "management_scenario"],
  "knowledge-pack schema should restrict intent_type to supported clinical intent categories"
);
assert.ok(knowledgePackSchema.$defs.goldCase.required.includes("intent_id"), "knowledge-pack gold cases should require intent_id");
assert.ok(knowledgePackSchema.$defs.goldCase.properties.expected_safety_labels, "knowledge-pack gold cases should separate safety labels from physical exam core labels");
assert.ok(knowledgePackSchema.$defs.goldCase.properties.acceptable_safety_labels, "knowledge-pack gold cases should separate acceptable safety labels from exam substitutes");
assert.ok(knowledgePackSchema.$defs.goldCase.properties.expected_history_labels, "knowledge-pack gold cases should support expected focused-history labels");
assert.ok(knowledgePackSchema.$defs.goldCase.properties.expected_test_labels, "knowledge-pack gold cases should support expected diagnostic-test/reference-threshold labels");
assert.ok(knowledgePackSchema.$defs.goldCase.properties.expected_red_flag_labels, "knowledge-pack gold cases should support expected red-flag labels");
assert.ok(knowledgePackSchema.$defs.goldCase.properties.expected_management_change_labels, "knowledge-pack gold cases should support expected management-change labels");
assert.ok(knowledgePackSchema.$defs.suppressRule.required.includes("intent_ids"), "knowledge-pack suppress rules should require intent_ids");
assert.equal(knowledgePackSchema.properties.suppress_rules.minItems, 1, "knowledge packs should require at least one suppress rule");
const itemSchemaText = JSON.stringify(knowledgePackSchema.$defs.item);
[
  "item_type",
  "reference_threshold",
  "intent_ids",
  "when_to_ask",
  "diagnostic_purpose",
  "management_implication",
  "findings_options",
  "LR_plus",
  "LR_minus",
  "likelihood_ratio_note",
  "LR_note",
  "lr_note",
  "patient_cooperation_required",
  "diagnostic_thresholds",
  "interpretation_cautions",
  "rationale",
  "action"
].forEach((field) => assert.ok(itemSchemaText.includes(field), `knowledge-pack item schema should include ${field}`));
assert.equal(knowledgePackSchema.$defs.item.properties.likelihood_ratio_note.minLength, 1, "knowledge-pack schema should reject empty LR interpretation notes");
assert.equal(knowledgePackSchema.$defs.item.properties.findings_options.minItems, 1, "knowledge-pack schema should reject empty exam findings/options arrays");
assert.equal(knowledgePackSchema.$defs.item.properties.findings_options.items.minLength, 1, "knowledge-pack schema should reject empty exam finding option labels");
assert.equal(knowledgePackSchema.$defs.item.properties.tags.minItems, 1, "knowledge-pack schema should reject empty tag arrays");
assert.equal(knowledgePackSchema.$defs.item.properties.tags.items.minLength, 1, "knowledge-pack schema should reject empty tag labels");
assert.equal(knowledgePackSchema.$defs.item.properties.options.minLength, 1, "knowledge-pack schema should reject empty answer option strings");
assert.equal(knowledgePackSchema.$defs.item.properties.rationale.minLength, 1, "knowledge-pack schema should reject empty rationale fields");
assert.equal(knowledgePackSchema.$defs.item.properties.interpretation_cautions.minLength, 1, "knowledge-pack schema should reject empty interpretation cautions");
const safetyCheckSchemaRule = knowledgePackSchema.$defs.item.allOf.find((rule) => rule.if?.properties?.item_type?.const === "safety_check");
assert.match(
  safetyCheckSchemaRule.then?.properties?.label?.pattern || "",
  /Measure.*Document.*Verify/,
  "knowledge-pack schema should require action-specific safety-check labels"
);
assert.equal(knowledgePackSchema.$defs.intent.properties.aliases.items.minLength, 1, "knowledge-pack schema should reject empty intent aliases");
assert.equal(knowledgePackSchema.$defs.source.properties.preferred_citation.minLength, 1, "knowledge-pack schema should reject empty source citations");
["when_context_lacks", "when_context_has", "when_tags_include", "unless_tags_include", "suppress_labels"].forEach((field) => {
  assert.equal(
    knowledgePackSchema.$defs.suppressRule.properties[field].$ref,
    "#/$defs/stringOrStringArray",
    `knowledge-pack schema should accept collaborator-friendly arrays for suppress-rule ${field}`
  );
});
assert.equal(knowledgePackSchema.$defs.stringOrStringArray.oneOf[0].minLength, 1, "knowledge-pack schema should reject empty suppress-rule strings");
assert.equal(knowledgePackSchema.$defs.stringOrStringArray.oneOf[1].minItems, 1, "knowledge-pack schema should reject empty suppress-rule arrays");
assert.equal(knowledgePackSchema.$defs.stringOrStringArray.oneOf[1].items.minLength, 1, "knowledge-pack schema should reject empty suppress-rule array entries");

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
  semanticOnlyRecommendation.finalRecommendationAuthorized,
  false,
  "semantic/free-text retrieval should not authorize final recommendations without a validated intent"
);
assert.equal(
  semanticOnlyRecommendation.authorizationStatus,
  "audit_only_unvalidated_context",
  "semantic/free-text retrieval should be explicitly labeled audit-only"
);
assert.match(
  semanticOnlyRecommendation.warnings.join(" "),
  /No validated clinical intent/i,
  "audit-only recommendation payload should warn that no validated intent authorized final output"
);
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

const blockedSemanticPromptReplacement = buildEvidencePromptReplacementFromRanked(
  checklistPrompt,
  { catalog, tagRows },
  "semantic-only-alpha",
  semanticOnlyRanked,
  { maxCandidates: 18 }
);
assert.equal(blockedSemanticPromptReplacement.success, false, "embedding recall alone should not authorize evidence prompt injection");
assert.equal(blockedSemanticPromptReplacement.blocked, true, "embedding-only prompt replacement should expose a blocked state");
assert.match(blockedSemanticPromptReplacement.blockedReason, /No validated clinical intent/i, "embedding-only prompt block should cite validated-intent requirement");
assert.equal(blockedSemanticPromptReplacement.evidenceBlock, "", "embedding-only prompt block should not expose retrieved candidates");

const dysuriaPromptIntents = selectedValidatedClinicalIntents(["gu_renal_dysuria_v1"]);
const dysuriaPromptContext = buildClinicalIntentRetrievalContext(
  dysuriaPromptIntents,
  "Burning pee with fever and flank pain",
  "clinician support",
  "adult"
);
const semanticPromptNoiseCandidate = {
  ...(dysuriaRanked.candidates[0] || {}),
  exam_id: "SEMANTIC-ONLY-PMI-NOISE",
  examLabel: "PMI",
  examOptions: "Normal / Displaced / Diffuse / Unable",
  condition_or_syndrome: "unvalidated semantic recall noise",
  diagnostic_target: "unvalidated semantic-only candidate",
  result_changes_management: "Should remain reviewer-only unless validated by the selected intent.",
  matchedTags: [],
  embeddingOnly: true,
  retrievalRoutes: ["embedding"],
  score: 99,
  scoreBreakdown: {
    clinicalRelevance: 0,
    actionability: 0,
    diagnosticValue: 0,
    bedsideFeasibility: 0,
    specialtyContext: 0,
    semanticRecall: 99
  }
};
const dysuriaRankedWithSemanticNoise = {
  ...dysuriaRanked,
  candidates: [semanticPromptNoiseCandidate, ...dysuriaRanked.candidates]
};
const promptReplacement = buildEvidencePromptReplacementFromRanked(
  checklistPrompt,
  { catalog, tagRows },
  dysuriaPromptContext,
  dysuriaRankedWithSemanticNoise,
  { maxCandidates: 18, validatedIntents: dysuriaPromptIntents }
);
assert.ok(promptReplacement.prompt.includes("<retrieved_evidence_candidates>"), "prompt replacement should use retrieved evidence candidates");
assert.ok(!promptReplacement.prompt.includes("<student_exam_reference>"), "prompt replacement should remove the legacy student exam reference block");
assert.ok(promptReplacement.prompt.includes("not permission to invent unvalidated final checklist rows"), "prompt replacement should preserve the validated-context boundary");
assert.equal(
  promptReplacement.recommendation.finalRecommendationAuthorized,
  true,
  "validated prompt replacement should carry an authorized recommendation payload"
);
assert.equal(
  promptReplacement.recommendation.authorizationStatus,
  "validated_intent",
  "validated prompt replacement should identify selected validated intents as the authorization source"
);
assert.ok(
  promptReplacement.promptCandidates.every((candidate) => !candidate.embeddingOnly && !candidate.semanticOnly),
  "validated prompt replacement should not expose embedding-only candidates as usable checklist candidates"
);
assert.ok(
  !promptReplacement.evidenceBlock.includes("SEMANTIC-ONLY-PMI-NOISE"),
  "semantic-only audit noise should stay out of the OpenEvidence candidate block"
);
const recommendedPromptCandidateIds = new Set([
  ...promptReplacement.recommendation.focusedHistoryQuestions,
  ...promptReplacement.recommendation.corePhysicalExamManeuvers,
  ...promptReplacement.recommendation.conditionalPhysicalExamManeuvers
].map((entry) => entry.candidate?.exam_id || entry.exam_id || entry.id).filter(Boolean));
assert.ok(
  promptReplacement.promptCandidates.every((candidate) => recommendedPromptCandidateIds.has(candidate.exam_id)),
  "OpenEvidence prompt candidates should be a subset of the locally recommended checklist, not the raw audit retrieval list"
);
assert.ok(
  promptReplacement.promptCandidates.some((candidate) => candidate.item_type === "history_question"),
  "OpenEvidence prompt candidates may include locally recommended focused-history questions"
);
assert.ok(
  promptReplacement.promptCandidates.every((candidate) => !/blood pressure|heart rate|respiratory rate|temperature|oxygen saturation|bedside glucose|point-of-care glucose/i.test(`${candidate.examLabel || ""} ${candidate.maneuver || ""}`)),
  "routine safety basics should not be presented as OpenEvidence physical exam candidates"
);

const validPack = {
  schema_version: clinicalKnowledgePackSchemaVersion,
  pack_id: "burning_pee_pack_v1",
  title: "Burning pee pack",
  version: "2026-06-06",
  review_notes: "Curated test pack for staged review only. Contains no raw chart text.",
  source_registry: [
    {
      source_id: "PACK_SRC",
      source_type: "guideline",
      url_or_doi: "https://example.org/curated-local-test-source",
      date_accessed: "2026-06-06",
      license_or_access_notes: "Synthetic local test citation.",
      review_owner: "test_reviewer",
      reviewed_by_role: "clinician_content_reviewer",
      last_reviewed: "2026-06-06",
      next_review_due: "2027-06-06",
      currency_status: "reviewed_current_for_scope",
      preferred_citation: "Curated local test source"
    }
  ],
  intents: [
    {
      intent_id: "burning_pee_intent_v1",
      label: "Burning pee",
      status: "draft",
      aliases: ["burning pee"],
      intent_type: "complaint",
      source_ids: ["PACK_SRC"],
      evidence_tags: ["dysuria"],
      clinical_bundle_ids: ["gu_renal"],
      required_domains: ["vitals", "CVA tenderness"],
      avoid_labels: ["PMI"],
      gold_case_ids: ["burning_pee"],
      applicability: {
        age_group: "adult",
        setting: "clinician support",
        sex_or_reproductive_context: "adult dysuria patient; pregnancy status must be assessed when medication, imaging, or disposition safety could change",
        pregnancy_status_required: "must_assess",
        use_when: [
          "Use for adult dysuria, urinary frequency, flank pain, fever, or possible pyelonephritis workups."
        ],
        do_not_use_when: [
          "Do not use as a pediatric UTI workup or as pregnancy-specific obstetric care without separate reviewed guidance."
        ]
      },
      last_reviewed: "2026-06-06",
      review_owner: "test_reviewer"
    }
  ],
  items: [
    {
      item_id: "burning_pee_question",
      kind: "question",
      item_type: "history_question",
      label: "Ask about dysuria and flank pain",
      intent_ids: ["burning_pee_intent_v1"],
      text: "Any flank pain, fever, rigors, pregnancy, vomiting, or systemic symptoms with dysuria?",
      options: "No / Dysuria / Flank pain / Fever / Other ___",
      detail_prompts: [
        "Ask specifically about flank pain or CVA-area pain.",
        "Ask specifically about fever, chills, or rigors.",
        "Ask whether pregnancy is possible.",
        "Ask about vomiting, poor intake, or systemic illness."
      ],
      when_to_ask: "Ask when dysuria, urinary frequency, flank pain, fever, or possible urinary infection is the selected staged intent.",
      diagnostic_purpose: "Screens for upper urinary tract involvement, systemic infection, pregnancy-specific risk, or complicated UTI features.",
      management_implication: "A positive answer changes uncomplicated-cystitis framing, urgency, testing, pregnancy safety, imaging threshold, and antibiotic/disposition planning.",
      condition_or_syndrome: "Dysuria or possible pyelonephritis",
      diagnostic_target: "Upper urinary tract involvement or systemic infection",
      when_to_use_structured: "dysuria; urinary_frequency; fever; flank_pain",
      result_changes_management: "Fever, flank pain, rigors, pregnancy, or systemic symptoms change urgency and uncomplicated-cystitis framing.",
      evidence_source_primary: "PACK_SRC",
      likelihood_ratio_note: "Question-level LR+/LR- is not available unless the cited evidence validates the exact response; use this answer to localize urinary source risk and guide testing/escalation.",
      tags: ["dysuria", "UTI", "pyelonephritis", "flank_pain", "fever"],
      retrieval_tags: "dysuria; UTI; pyelonephritis; flank_pain",
      reviewer_notes: "Synthetic test item for staged knowledge-pack validation."
    },
    {
      item_id: "burning_pee_pregnancy_safety",
      item_type: "safety_check",
      label: "Verify pregnancy possibility",
      intent_ids: ["burning_pee_intent_v1"],
      action: "Ask or verify pregnancy possibility before choosing antibiotics, imaging, or disposition for dysuria with possible upper-tract infection.",
      rationale: "Pregnancy status is not a diagnostic maneuver but changes medication safety, imaging decisions, obstetric involvement, and admission threshold.",
      condition_or_syndrome: "Dysuria or possible pyelonephritis",
      diagnostic_target: "Pregnancy-associated urinary infection risk and medication/imaging safety",
      when_to_use_structured: "dysuria; pregnancy_possible; reproductive_age; pyelonephritis",
      result_changes_management: "Pregnancy possibility changes urine culture threshold, antibiotic choice, imaging safety, obstetric involvement, and disposition.",
      evidence_source_primary: "PACK_SRC",
      likelihood_ratio_note: "Likelihood ratios are not applicable to routine bedside safety data; use this item for medication, imaging, and disposition safety.",
      difficulty: "easy",
      time_burden_minutes: "0.5",
      equipment_needed: "privacy-aware history; urine pregnancy test when clinically appropriate",
      patient_cooperation_required: "low",
      limitations: "Use privacy-aware wording and interpret alongside test availability, gestational context, ectopic symptoms, and local policy.",
      tags: ["dysuria", "pregnancy_possible", "UTI", "pyelonephritis", "safety_check"],
      retrieval_tags: "dysuria; pregnancy_possible; UTI; pyelonephritis; safety_check",
      reviewer_notes: "Synthetic safety-check item for staged knowledge-pack validation."
    },
    {
      item_id: "burning_pee_cva_exam",
      kind: "exam",
      item_type: "physical_exam_maneuver",
      label: "CVA tenderness",
      intent_ids: ["burning_pee_intent_v1"],
      technique: "Percuss or palpate over each costovertebral angle and compare for reproducible flank pain.",
      findings_options: ["Absent", "Present right", "Present left", "Present bilateral", "Unable to assess"],
      options: "Absent / Present right / Present left / Present bilateral / Unable",
      condition_or_syndrome: "Dysuria with possible pyelonephritis or renal colic",
      diagnostic_target: "Renal/upper urinary tract pain localization",
      when_to_use_structured: "flank_pain; dysuria; pyelonephritis; nephrolithiasis",
      result_changes_management: "CVA tenderness with fever or systemic illness changes urgency of pyelonephritis/stone-complication workup.",
      evidence_source_primary: "PACK_SRC",
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "No maneuver-specific LR+/LR- is available in the local validated source metadata; treat CVA tenderness as supportive and interpret with fever, urinalysis, pregnancy status, and pain pattern.",
      difficulty: "easy",
      time_burden_minutes: "1",
      equipment_needed: "none",
      patient_cooperation_required: "low",
      limitations: "Absence does not exclude pyelonephritis or renal colic; interpret with fever, urinalysis, pregnancy status, and pain pattern.",
      tags: ["dysuria", "flank_pain", "pyelonephritis", "nephrolithiasis", "CVA_tenderness"],
      retrieval_tags: "dysuria; flank_pain; pyelonephritis; nephrolithiasis",
      reviewer_notes: "Synthetic test exam for staged knowledge-pack validation."
    },
    {
      item_id: "burning_pee_urinalysis_test",
      item_type: "diagnostic_test",
      label: "Urinalysis with urine culture when complicated infection features are present",
      intent_ids: ["burning_pee_intent_v1"],
      action: "Order urinalysis and culture when systemic illness, pregnancy, pyelonephritis concern, treatment failure, or complicated UTI features are present.",
      condition_or_syndrome: "Dysuria or possible pyelonephritis",
      diagnostic_target: "Evidence of urinary inflammation, bacteriuria, hematuria, or complicated infection features",
      when_to_use_structured: "dysuria; urinary_frequency; fever; flank_pain; pregnancy_possible",
      result_changes_management: "Positive infectious or hematuria findings change antibiotic selection, culture follow-up, imaging threshold, and uncomplicated-cystitis framing.",
      evidence_source_primary: "PACK_SRC",
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Test-level LR+/LR- depends on the exact urinalysis component, threshold, population, and culture definition; use local lab performance and the cited guideline context.",
      diagnostic_thresholds: "Use local laboratory reporting; pyuria, nitrite/leukocyte esterase positivity, hematuria, or culture growth must be interpreted with symptoms and contamination risk.",
      interpretation_cautions: "Urinalysis can be falsely negative early and falsely positive with contamination or asymptomatic bacteriuria; interpret with symptoms, pregnancy status, and systemic illness.",
      tags: ["dysuria", "UTI", "pyelonephritis", "urinalysis", "urine_culture"],
      retrieval_tags: "dysuria; UTI; pyelonephritis; urinalysis; urine_culture",
      reviewer_notes: "Synthetic diagnostic-test item for staged knowledge-pack validation."
    },
    {
      item_id: "burning_pee_creatinine_threshold",
      item_type: "reference_threshold",
      label: "Renal function threshold for antibiotic dosing and imaging contrast",
      intent_ids: ["burning_pee_intent_v1"],
      action: "Interpret creatinine or eGFR before selecting renally cleared antibiotics, contrast imaging, or disposition for dysuria with systemic or flank symptoms.",
      condition_or_syndrome: "Dysuria or possible pyelonephritis",
      diagnostic_target: "Renal impairment affecting antibiotic dosing, contrast safety, AKI framing, or disposition",
      when_to_use_structured: "dysuria; pyelonephritis; flank_pain; AKI; renal_function",
      result_changes_management: "Abnormal creatinine or eGFR changes renal dosing, nephrotoxin avoidance, imaging contrast planning, AKI workup, and escalation.",
      evidence_source_primary: "PACK_SRC",
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not applicable to a renal-function safety threshold; interpret the value against baseline kidney function and local laboratory reporting.",
      reference_ranges: "Use local laboratory adult reference intervals for creatinine and eGFR; compare with baseline when available.",
      diagnostic_thresholds: "Rising creatinine, low eGFR, oliguria, solitary kidney, obstruction concern, or sepsis physiology should change renal dosing, imaging, and disposition decisions.",
      interpretation_cautions: "Creatinine can lag behind acute kidney injury and must be interpreted with baseline kidney function, hydration, muscle mass, pregnancy, medications, and urine output.",
      tags: ["dysuria", "pyelonephritis", "AKI", "renal_function", "reference_threshold"],
      retrieval_tags: "dysuria; pyelonephritis; AKI; renal_function; reference_threshold",
      reviewer_notes: "Synthetic reference-threshold item for staged knowledge-pack validation."
    },
    {
      item_id: "burning_pee_escalation_rule",
      item_type: "management_change",
      label: "Escalate dysuria workup when systemic or high-risk features are present",
      intent_ids: ["burning_pee_intent_v1"],
      action: "Treat fever, rigors, vomiting, pregnancy, sepsis physiology, immunocompromise, or obstructing-stone concern as a higher-risk presentation requiring escalation.",
      rationale: "These features change the differential and disposition away from isolated uncomplicated cystitis.",
      condition_or_syndrome: "Dysuria or possible pyelonephritis",
      diagnostic_target: "Complicated UTI, pyelonephritis, sepsis, pregnancy-associated infection risk, or obstructing stone",
      when_to_use_structured: "dysuria; fever; rigors; vomiting; pregnancy_possible; sepsis; flank_pain",
      result_changes_management: "High-risk features change urgency, culture/imaging threshold, parenteral therapy consideration, and disposition.",
      evidence_source_primary: "PACK_SRC",
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not applicable to this management rule; use the cited guideline and patient acuity to decide escalation.",
      limitations: "This rule supports escalation framing and does not replace clinician judgment, local antibiogram review, pregnancy assessment, or sepsis evaluation.",
      tags: ["dysuria", "pyelonephritis", "sepsis", "pregnancy_possible", "management_change"],
      retrieval_tags: "dysuria; pyelonephritis; sepsis; pregnancy_possible; flank_pain",
      reviewer_notes: "Synthetic management-change item for staged knowledge-pack validation."
    },
    {
      item_id: "burning_pee_sepsis_red_flag",
      item_type: "red_flag",
      label: "Fever or rigors with dysuria",
      intent_ids: ["burning_pee_intent_v1"],
      action: "Screen for fever, rigors, hypotension, confusion, vomiting, or inability to maintain oral intake when dysuria is present.",
      rationale: "Systemic features can indicate pyelonephritis or sepsis rather than isolated lower urinary symptoms.",
      condition_or_syndrome: "Dysuria or possible pyelonephritis",
      diagnostic_target: "Systemic infection or sepsis physiology",
      when_to_use_structured: "dysuria; fever; rigors; sepsis; vomiting",
      result_changes_management: "Systemic features change urgency, disposition, culture threshold, and empiric treatment planning.",
      evidence_source_primary: "PACK_SRC",
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not applicable to this red-flag grouping; individual findings should be interpreted with vital signs, exam, labs, and source evaluation.",
      limitations: "Absence of one red flag does not exclude upper-tract infection or sepsis, especially in older, pregnant, immunocompromised, or recently treated patients.",
      tags: ["dysuria", "fever", "rigors", "sepsis", "red_flag"],
      retrieval_tags: "dysuria; fever; rigors; sepsis",
      reviewer_notes: "Synthetic red-flag item for staged knowledge-pack validation."
    }
  ],
  gold_cases: [
    {
      case_id: "burning_pee",
      intent_id: "burning_pee_intent_v1",
      presentation: "Burning pee with fever and flank pain",
      must_include_tags: "dysuria; flank_pain; fever",
      expected_history_labels: "Ask about dysuria and flank pain",
      expected_core_labels: "CVA tenderness",
      expected_safety_labels: "Verify pregnancy possibility",
      expected_test_labels: "Urinalysis with urine culture when complicated infection features are present; Renal function threshold for antibiotic dosing and imaging contrast",
      expected_red_flag_labels: "Fever or rigors with dysuria",
      expected_management_change_labels: "Escalate dysuria workup when systemic or high-risk features are present",
      avoid_labels: "PMI; Vibration sense"
    }
  ],
  suppress_rules: [
    {
      rule_id: "no_broad_neuro_for_isolated_dysuria",
      intent_ids: ["burning_pee_intent_v1"],
      when_context_lacks: "weakness; numbness; seizure; syncope; altered mental status",
      suppress_labels: "Pronator drift; Vibration sense; Gait",
      reason: "Avoid unrelated broad neurologic maneuvers for isolated urinary symptoms."
    }
  ]
};
const validPackQuestionItem = validPack.items.find((item) => item.item_type === "history_question");
const validPackExamItem = validPack.items.find((item) => item.item_type === "physical_exam_maneuver");
const validPackDiagnosticTestItem = validPack.items.find((item) => item.item_type === "diagnostic_test");
const validPackReferenceThresholdItem = validPack.items.find((item) => item.item_type === "reference_threshold");
const validPackManagementChangeItem = validPack.items.find((item) => item.item_type === "management_change");
const validPackRedFlagItem = validPack.items.find((item) => item.item_type === "red_flag");
const validPackSafetyCheckItem = validPack.items.find((item) => item.item_type === "safety_check");
const validPackResult = validateClinicalKnowledgePack(validPack);
assert.ok(validPackResult.ok, validPackResult.issues.map((issue) => issue.message).join("\n"));
assert.equal(validPackResult.intentCount, 1, "valid packs may stage intent definitions");
assert.equal(validPackResult.itemCount, 7, "valid packs may stage safety checks, questions, exams, tests, reference thresholds, management changes, and red flags as distinct item types");
const missingSafetyCheckPackResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "missing_safety_check_pack_v1",
  items: validPack.items.filter((item) => item.item_type !== "safety_check")
});
assert.ok(!missingSafetyCheckPackResult.ok, "knowledge packs should not activate an intent without a linked safety_check item");
assert.ok(
  missingSafetyCheckPackResult.issues.some((issue) => issue.type === "intent-safety_check-coverage"),
  "missing safety-check coverage should be reported with an explicit issue type"
);
const unbackedSafetyGoldCaseResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "unbacked_safety_gold_pack_v1",
  gold_cases: validPack.gold_cases.map((goldCase) => ({
    ...goldCase,
    expected_safety_labels: "Blood pressure; Heart rate"
  }))
});
assert.ok(!unbackedSafetyGoldCaseResult.ok, "knowledge-pack gold cases should not list safety expectations without linked safety_check rows");
assert.ok(
  unbackedSafetyGoldCaseResult.issues.some((issue) => issue.type === "gold-case-expected_safety_label-unbacked"),
  "unbacked safety gold labels should be reported with an explicit issue type"
);
const unbackedHistoryGoldCaseResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "unbacked_history_gold_pack_v1",
  gold_cases: validPack.gold_cases.map((goldCase) => ({
    ...goldCase,
    expected_history_labels: "Ask about cough, sputum, dyspnea, urinary symptoms, skin wounds, and line infection"
  }))
});
assert.ok(!unbackedHistoryGoldCaseResult.ok, "knowledge-pack gold cases should not list focused-history expectations without linked history_question rows");
assert.ok(
  unbackedHistoryGoldCaseResult.issues.some((issue) => issue.type === "gold-case-expected_history_label-unbacked"),
  "unbacked focused-history gold labels should be reported with an explicit issue type"
);
const unbackedTestGoldCaseResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "unbacked_test_gold_pack_v1",
  gold_cases: validPack.gold_cases.map((goldCase) => ({
    ...goldCase,
    expected_test_labels: "Chest radiograph when cough, dyspnea, hypoxemia, or focal lung findings suggest pneumonia"
  }))
});
assert.ok(!unbackedTestGoldCaseResult.ok, "knowledge-pack gold cases should not list testing expectations without linked diagnostic_test or reference_threshold rows");
assert.ok(
  unbackedTestGoldCaseResult.issues.some((issue) => issue.type === "gold-case-expected_test_label-unbacked"),
  "unbacked diagnostic-test/reference-threshold gold labels should be reported with an explicit issue type"
);
const unbackedRedFlagGoldCaseResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "unbacked_red_flag_gold_pack_v1",
  gold_cases: validPack.gold_cases.map((goldCase) => ({
    ...goldCase,
    expected_red_flag_labels: "Hypotension or altered mentation with fever"
  }))
});
assert.ok(!unbackedRedFlagGoldCaseResult.ok, "knowledge-pack gold cases should not list red-flag expectations without linked red_flag rows");
assert.ok(
  unbackedRedFlagGoldCaseResult.issues.some((issue) => issue.type === "gold-case-expected_red_flag_label-unbacked"),
  "unbacked red-flag gold labels should be reported with an explicit issue type"
);
const unbackedManagementGoldCaseResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "unbacked_management_gold_pack_v1",
  gold_cases: validPack.gold_cases.map((goldCase) => ({
    ...goldCase,
    expected_management_change_labels: "Escalate fever workup when sepsis physiology or high-risk host features are present"
  }))
});
assert.ok(!unbackedManagementGoldCaseResult.ok, "knowledge-pack gold cases should not list management expectations without linked management_change rows");
assert.ok(
  unbackedManagementGoldCaseResult.issues.some((issue) => issue.type === "gold-case-expected_management_change_label-unbacked"),
  "unbacked management-change gold labels should be reported with an explicit issue type"
);
const broadQuestionWithoutDetailsResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "broad_question_without_details",
  items: [
    {
      ...validPackQuestionItem,
      item_id: "broad_question_without_details",
      detail_prompts: [],
      text: "Any flank pain, fever, rigors, pregnancy, vomiting, inability to keep fluids down, catheter use, resistant urine culture, kidney transplant, immunosuppression, or systemic symptoms with dysuria?"
    }
  ]
});
assert.ok(!broadQuestionWithoutDetailsResult.ok, "broad imported history questions should require concrete detail prompts");
assert.ok(
  broadQuestionWithoutDetailsResult.issues.some((issue) => issue.type === "question-detail_prompts"),
  "broad imported history-question failure should name missing detail_prompts"
);
const staged = stageClinicalKnowledgePack(normalizeKnowledgePackReviewState(), validPackResult);
assert.equal(staged.packs.length, 1, "valid packs should stage for expert review");
assert.equal(staged.packs[0].status, "staged");
assert.equal(staged.packs[0].activationStatus, "inactive_pending_reviewer_acceptance", "staged packs should remain inactive until reviewer activation");
assert.equal(staged.packs[0].intentCount, 1, "staged pack should retain intent count");
assert.equal(staged.packs[0].goldCaseCount, 1, "staged pack should retain gold-case count");
assert.equal(staged.packs[0].suppressRuleCount, 1, "staged pack should retain suppress-rule count");
assert.match(staged.packs[0].reviewerNotes, /staged review/i, "staged pack should retain reviewer notes");
assert.doesNotMatch(
  JSON.stringify(staged),
  /raw_chart_text|MRN|DOB|patient_name|555-1212|@example\.com/i,
  "staged knowledge-pack review state should not contain raw chart or identifier fields"
);
const mutatedValidationForStaging = {
  ...validPackResult,
  pack: {
    ...validPackResult.pack,
    review_notes: "Patient John Smith DOB 01/02/1980 was discussed with reviewer."
  }
};
const defensivelyStaged = stageClinicalKnowledgePack(normalizeKnowledgePackReviewState(), mutatedValidationForStaging);
assert.doesNotMatch(
  defensivelyStaged.packs[0].reviewerNotes,
  /John Smith|DOB|01\/02\/1980/i,
  "staging should not persist PHI-like review notes even if a validated pack object is mutated before storage"
);
assert.match(
  defensivelyStaged.packs[0].reviewerNotes,
  /Reviewer note omitted because it appeared to contain PHI/i,
  "staging should preserve an audit-safe omission notice for unsafe review notes"
);
assert.equal(activeClinicalKnowledgePacks(staged).length, 0, "staged packs should not become active clinical knowledge");
assert.equal(activeClinicalKnowledgePackIntents(staged).length, 0, "staged packs should not extend validated intent search");
assert.equal(activeClinicalKnowledgePackEvidenceCandidates(staged).length, 0, "staged packs should not extend evidence retrieval");
assert.equal(activeClinicalKnowledgePackGoldCases(staged).length, 0, "staged packs should not expose gold cases as active audit fixtures");

const activated = activateStagedClinicalKnowledgePack(staged, "burning_pee_pack_v1", {
  reviewer: "unit_test_reviewer",
  activatedAt: "2026-06-07T00:00:00.000Z",
  note: "Accepted by test reviewer."
});
assert.equal(activeClinicalKnowledgePacks(activated).length, 1, "accepted packs should become active only after reviewer activation");
assert.equal(activated.packs[0].status, "accepted", "activation should mark the staged pack accepted");
assert.equal(activated.packs[0].activationStatus, "active_reviewer_accepted", "activation should use the explicit active status");
assert.equal(activated.packs[0].pack.intents[0].status, "validated", "activated pack intents should become validated locally");
assert.equal(activated.packs[0].pack.intents[0].review_owner, "unit_test_reviewer", "activation should stamp the local reviewer");

const unsafeActivationMetadata = activateStagedClinicalKnowledgePack(staged, "burning_pee_pack_v1", {
  reviewer: "Jane Smith 555-1212",
  activatedAt: "2026-06-07T00:00:00.000Z",
  note: "Accepted after reviewing patient John Smith MRN 12345 on 01/02/1980."
});
assert.equal(unsafeActivationMetadata.packs[0].status, "accepted", "unsafe reviewer metadata should not block otherwise valid activation");
assert.equal(unsafeActivationMetadata.packs[0].activationReviewer, "local_reviewer", "activation should replace PHI-like reviewer names with a safe local reviewer id");
assert.doesNotMatch(
  unsafeActivationMetadata.packs[0].reviewerNotes,
  /John Smith|Jane Smith|12345|01\/02\/1980|555-1212/i,
  "activation reviewer notes should not persist PHI-like text"
);
assert.match(
  unsafeActivationMetadata.packs[0].reviewerNotes,
  /Reviewer note omitted because it appeared to contain PHI/i,
  "activation should preserve an audit-safe omission notice when reviewer notes are unsafe"
);

const unsafeActivationTimestamp = activateStagedClinicalKnowledgePack(staged, "burning_pee_pack_v1", {
  reviewer: "unit_test_reviewer",
  activatedAt: "Patient John Smith MRN 12345 DOB 01/02/1980",
  note: "Accepted by test reviewer."
});
assert.equal(unsafeActivationTimestamp.packs[0].status, "accepted", "unsafe activation timestamp metadata should not block otherwise valid activation");
assert.doesNotMatch(
  unsafeActivationTimestamp.packs[0].activatedAt,
  /John Smith|MRN|12345|DOB|01\/02\/1980/i,
  "activation should not persist PHI-like activatedAt metadata"
);
assert.match(
  unsafeActivationTimestamp.packs[0].activatedAt,
  /^\d{4}-\d{2}-\d{2}T/,
  "activation should replace unsafe activatedAt metadata with a safe ISO timestamp"
);
assert.match(
  unsafeActivationTimestamp.packs[0].pack.intents[0].last_reviewed,
  /^\d{4}-\d{2}-\d{2}$/,
  "activation should stamp intent last_reviewed from a safe date even when caller metadata is unsafe"
);

const tamperedWrapperNoteBeforeActivation = JSON.parse(JSON.stringify(staged));
tamperedWrapperNoteBeforeActivation.packs[0].reviewerNotes = "Discussed patient John Smith MRN 12345 DOB 01/02/1980 before activation.";
const activatedAfterTamperedWrapperNote = activateStagedClinicalKnowledgePack(tamperedWrapperNoteBeforeActivation, "burning_pee_pack_v1", {
  reviewer: "unit_test_reviewer",
  activatedAt: "2026-06-07T00:00:00.000Z",
  note: "Accepted by test reviewer."
});
assert.equal(
  activatedAfterTamperedWrapperNote.packs[0].status,
  "accepted",
  "tampered wrapper notes should be sanitized without blocking otherwise valid activation"
);
assert.doesNotMatch(
  activatedAfterTamperedWrapperNote.packs[0].reviewerNotes,
  /John Smith|MRN|12345|01\/02\/1980/i,
  "activation should not persist PHI-like text from pre-existing staged wrapper notes"
);
assert.match(
  activatedAfterTamperedWrapperNote.packs[0].reviewerNotes,
  /Reviewer note omitted because it appeared to contain PHI/i,
  "activation should retain an audit-safe omission notice for unsafe pre-existing wrapper notes"
);

const activatedIntents = activeClinicalKnowledgePackIntents(activated);
assert.equal(activatedIntents.length, 1, "accepted pack should expose one validated intent");
assert.equal(activatedIntents[0].status, "validated");
assert.equal(activatedIntents[0].knowledge_pack_id, "burning_pee_pack_v1");
assert.ok(activatedIntents[0].aliases.includes("burning pee"), "activated pack aliases should remain searchable");
assert.ok((activatedIntents[0].suppress_rules || []).length, "activated pack intents should retain reviewer suppress rules");
assert.equal(activatedIntents[0].suppress_rules[0].suppress_labels[0], "Pronator drift", "active pack suppress rules should expose suppress labels as arrays");
assert.ok((activatedIntents[0].suppress_rules[0].intent_ids || []).includes("burning_pee_intent_v1"), "active pack suppress rules should trace back to their staged intent");
const arraySuppressPack = {
  ...validPack,
  pack_id: "array_suppress_pack_v1",
  title: "Array suppress rule pack",
  suppress_rules: [
    {
      ...validPack.suppress_rules[0],
      rule_id: "array_no_broad_neuro_for_isolated_dysuria",
      when_context_lacks: ["weakness", "numbness", "seizure", "syncope", "altered mental status"],
      suppress_labels: ["Pronator drift", "Vibration sense", "Gait"]
    }
  ]
};
const arraySuppressValidation = validateClinicalKnowledgePack(arraySuppressPack);
assert.ok(arraySuppressValidation.ok, arraySuppressValidation.issues.map((issue) => issue.message).join("\n"));
const arraySuppressActivated = activateStagedClinicalKnowledgePack(
  stageClinicalKnowledgePack(normalizeKnowledgePackReviewState(), arraySuppressValidation),
  "array_suppress_pack_v1",
  {
    reviewer: "unit_test_reviewer",
    activatedAt: "2026-06-07T00:00:00.000Z",
    note: "Accepted array suppress-rule syntax."
  }
);
const arraySuppressIntent = activeClinicalKnowledgePackIntents(arraySuppressActivated)[0];
assert.deepEqual(
  arraySuppressIntent.suppress_rules[0].suppress_labels,
  ["Pronator drift", "Vibration sense", "Gait"],
  "array-style suppress labels should validate, activate, and remain arrays for downstream audits"
);
assert.deepEqual(
  arraySuppressIntent.suppress_rules[0].unless_tags_include.slice(0, 3),
  ["weakness", "numbness", "seizure"],
  "array-style suppress conditions should activate as structured tag lists"
);
const activatedGoldCases = activeClinicalKnowledgePackGoldCases(activated);
assert.equal(activatedGoldCases.length, 1, "accepted packs should expose active gold cases for reviewer/audit harnesses");
assert.equal(activatedGoldCases[0].knowledge_pack_id, "burning_pee_pack_v1", "active gold cases should trace to their source pack");
assert.equal(activatedGoldCases[0].review_status, "accepted", "active gold cases should expose reviewer acceptance state");
assert.ok(activatedGoldCases[0].expected_core_labels_list.includes("CVA tenderness"), "active gold cases should expose parsed expected labels");
assert.ok(activatedGoldCases[0].expected_safety_labels_list.includes("Verify pregnancy possibility"), "active gold cases should expose parsed expected safety labels");
assert.ok(!activatedGoldCases[0].expected_core_labels_list.includes("Verify pregnancy possibility"), "active gold cases should keep safety labels out of expected core exam labels");
assert.ok(activatedGoldCases[0].expected_history_labels_list.includes("Ask about dysuria and flank pain"), "active gold cases should expose parsed focused-history labels");
assert.ok(activatedGoldCases[0].expected_test_labels_list.includes("Urinalysis with urine culture when complicated infection features are present"), "active gold cases should expose parsed test/reference labels");
assert.ok(activatedGoldCases[0].expected_red_flag_labels_list.includes("Fever or rigors with dysuria"), "active gold cases should expose parsed red-flag labels");
assert.ok(activatedGoldCases[0].expected_management_change_labels_list.includes("Escalate dysuria workup when systemic or high-risk features are present"), "active gold cases should expose parsed management-change labels");
assert.ok(activatedGoldCases[0].avoid_labels_list.includes("PMI"), "active gold cases should expose parsed avoid labels");
assert.equal(activatedGoldCases[0].review_owner, "unit_test_reviewer", "active gold cases should carry activation reviewer metadata");
const resolvedActivatedIntent = resolveClinicalIntents("burning pee", activatedIntents, { limit: 4 });
assert.equal(resolvedActivatedIntent.validatedMatches[0]?.intent_id, "burning_pee_intent_v1", "activated pack intent should resolve from lay search");

const unsupportedOnlyPack = JSON.parse(JSON.stringify(validPack));
unsupportedOnlyPack.pack_id = "unsupported_only_pack_v1";
unsupportedOnlyPack.title = "Unsupported-only pack";
unsupportedOnlyPack.intents = unsupportedOnlyPack.intents.map((intent) => ({
  ...intent,
  status: "unsupported",
  aliases: [...intent.aliases, "unsupported burning pee concept"]
}));
const unsupportedOnlyValidation = validateClinicalKnowledgePack(unsupportedOnlyPack);
assert.ok(unsupportedOnlyValidation.ok, unsupportedOnlyValidation.issues.map((issue) => issue.message).join("\n"));
const unsupportedOnlyStaged = stageClinicalKnowledgePack(normalizeKnowledgePackReviewState(), unsupportedOnlyValidation);
const unsupportedOnlyActivated = activateStagedClinicalKnowledgePack(unsupportedOnlyStaged, "unsupported_only_pack_v1", {
  reviewer: "unit_test_reviewer",
  activatedAt: "2026-06-07T00:00:00.000Z",
  note: "Accepted for audit, but the intent remains unsupported."
});
assert.equal(unsupportedOnlyActivated.packs[0].status, "accepted", "unsupported-only packs may be accepted for audit tracking");
assert.equal(unsupportedOnlyActivated.packs[0].pack.intents[0].status, "unsupported", "activation should not convert unsupported imported intents into validated intents");
assert.equal(activeClinicalKnowledgePackIntents(unsupportedOnlyActivated).length, 0, "unsupported activated pack intents should not extend validated intent search");
assert.equal(activeClinicalKnowledgePackEvidenceCandidates(unsupportedOnlyActivated).length, 0, "unsupported activated pack items should not extend evidence retrieval");
assert.equal(activeClinicalKnowledgePackGoldCases(unsupportedOnlyActivated).length, 0, "unsupported activated pack intents should not expose active gold cases");
assert.equal(
  resolveClinicalIntents("unsupported burning pee concept", activeClinicalKnowledgePackIntents(unsupportedOnlyActivated), { limit: 4 }).validatedMatches.length,
  0,
  "unsupported activated pack aliases should not authorize recommendations"
);

const activatedCandidates = activeClinicalKnowledgePackEvidenceCandidates(activated);
assert.equal(activatedCandidates.length, 7, "accepted pack should expose safety-check, question, exam, diagnostic-test, reference-threshold, management-change, and red-flag items");
assert.ok(
  ["safety_check", "history_question", "physical_exam_maneuver", "diagnostic_test", "reference_threshold", "management_change", "red_flag"]
    .every((itemType) => activatedCandidates.some((candidate) => candidate.item_type === itemType)),
  "accepted packs should preserve all supported structured item types for downstream sectioning"
);
assert.ok(activatedCandidates.every((candidate) => candidate.review?.status === "accepted"), "activated candidates should retain accepted-review metadata");
assert.ok(activatedCandidates.every((candidate) => candidate.retrievalRoutes?.includes("activated_knowledge_pack")), "activated candidates should expose their retrieval route");
assert.ok(activatedCandidates.every((candidate) => candidate.traceability?.authorized_by === "accepted_knowledge_pack"), "activated candidates should be explicitly authorized by the accepted pack");
assert.ok(
  activatedCandidates.every((candidate) => candidate.likelihood_ratio_note),
  "activated candidates should carry an explicit LR interpretation note"
);
assert.match(
  activatedCandidates.find((candidate) => candidate.item_type === "safety_check")?.likelihood_ratio_note || "",
  /not applicable to routine bedside safety data/i,
  "accepted pack safety checks should explain why LR fields are not diagnostic-performance values"
);
assert.match(
  activatedCandidates.find((candidate) => candidate.item_type === "physical_exam_maneuver")?.likelihood_ratio_note || "",
  /No maneuver-specific LR\+\/LR-/i,
  "accepted pack physical exams with n/a LR values should explain the evidence limitation"
);
assert.ok(
  (activatedCandidates.find((candidate) => candidate.item_type === "history_question")?.detail_prompts || []).length >= 2,
  "accepted pack history_question candidates should preserve concrete detail prompts"
);

const activeFilteredCandidates = filterEvidenceCatalogForClinicalIntents(activatedCandidates, activatedIntents);
assert.equal(activeFilteredCandidates.length, 7, "activated candidates should pass the same validated-intent evidence filter as bundled catalog rows");
const activePackContext = buildClinicalIntentRetrievalContext(
  activatedIntents,
  "burning pee with fever and flank pain",
  "clinician support",
  "adult"
);
const activePackRecommendation = buildRecommendedExamChecklist(activePackContext, activeFilteredCandidates, {
  validatedIntents: activatedIntents,
  maxCoreItems: 8,
  maxConditionalItems: 8
});
assert.ok(
  activePackRecommendation.basicSafetyChecks.some((entry) => /Verify pregnancy possibility/i.test(entry.label)),
  "accepted pack safety_check items should route to basic bedside data/safety checks"
);
assert.ok(
  activePackRecommendation.focusedHistoryQuestions.some((entry) => /flank pain|fever|rigors|pregnancy/i.test(`${entry.text} ${entry.options || ""}`)),
  "accepted pack history_question items should route to focused history"
);
assert.ok(
  (activePackRecommendation.focusedHistoryQuestions.find((entry) => /flank pain|fever|rigors|pregnancy/i.test(`${entry.text} ${entry.options || ""}`))?.detail_prompts || []).length >= 2,
  "accepted pack focused-history recommendations should preserve concrete detail prompts"
);
assert.ok(
  activePackRecommendation.corePhysicalExamManeuvers.some((entry) => /Percuss costovertebral angle tenderness|CVA tenderness/i.test(entry.label)),
  "accepted pack physical_exam_maneuver items should be eligible for core exam recommendations"
);
assert.ok(
  activePackRecommendation.initialTestsAndReferenceThresholds.some((entry) => /Urinalysis with urine culture/i.test(entry.label)),
  "accepted pack diagnostic_test items should route to tests/reference thresholds"
);
assert.ok(
  activePackRecommendation.initialTestsAndReferenceThresholds.some((entry) => /Renal function threshold/i.test(entry.label)),
  "accepted pack reference_threshold items should route to tests/reference thresholds"
);
assert.ok(
  activePackRecommendation.redFlagsAndEscalationCues.some((entry) => /Fever or rigors with dysuria/i.test(entry.label)),
  "accepted pack red_flag items should route to red flags/escalation cues"
);
assert.ok(
  activePackRecommendation.managementChangingFindings.some((entry) => /Escalate dysuria workup/i.test(entry.label)),
  "accepted pack management_change items should route to management-changing findings"
);
assert.ok(
  !activePackRecommendation.corePhysicalExamManeuvers.some((entry) => /Ask about/i.test(entry.label)),
  "history questions should not leak into the physical exam section"
);
assert.ok(
  !activePackRecommendation.corePhysicalExamManeuvers.some((entry) => /Urinalysis|Renal function threshold|Escalate dysuria|Fever or rigors/i.test(entry.label)),
  "tests, reference thresholds, red flags, and management-change rows should not leak into the physical exam section"
);
assert.ok(
  [...activePackRecommendation.focusedHistoryQuestions, ...activePackRecommendation.corePhysicalExamManeuvers]
    .every((entry) => entry.traceability?.authorized_by === "validated_clinical_intent" && entry.traceability?.knowledge_pack_id === "burning_pee_pack_v1"),
  "accepted-pack recommendations should remain traceable to the selected validated intent and source pack"
);
const acceptedPackRecommendedEntries = [
  activePackRecommendation.basicSafetyChecks.find((entry) => /Verify pregnancy possibility/i.test(entry.label)),
  activePackRecommendation.focusedHistoryQuestions.find((entry) => /flank pain|fever|rigors|pregnancy/i.test(`${entry.text} ${entry.options || ""}`)),
  activePackRecommendation.corePhysicalExamManeuvers.find((entry) => /Percuss costovertebral angle tenderness|CVA tenderness/i.test(entry.label)),
  activePackRecommendation.initialTestsAndReferenceThresholds.find((entry) => /Urinalysis with urine culture/i.test(entry.label)),
  activePackRecommendation.initialTestsAndReferenceThresholds.find((entry) => /Renal function threshold/i.test(entry.label)),
  activePackRecommendation.redFlagsAndEscalationCues.find((entry) => /Fever or rigors with dysuria/i.test(entry.label)),
  activePackRecommendation.managementChangingFindings.find((entry) => /Escalate dysuria workup|CVA tenderness|costovertebral angle tenderness/i.test(entry.label))
].filter(Boolean);
assert.equal(acceptedPackRecommendedEntries.length, 7, "accepted pack should surface each supported item type as a structured recommendation");
acceptedPackRecommendedEntries.forEach((entry) => {
  assert.ok(entry.source || entry.evidence?.source, `${entry.label || entry.text}: accepted-pack item should retain source metadata`);
  assert.ok(entry.evidence && Object.prototype.hasOwnProperty.call(entry.evidence, "LR_plus"), `${entry.label || entry.text}: accepted-pack item should retain LR+ metadata`);
  assert.ok(entry.evidence && Object.prototype.hasOwnProperty.call(entry.evidence, "LR_minus"), `${entry.label || entry.text}: accepted-pack item should retain LR- metadata`);
  assert.ok(entry.evidence?.likelihood_ratio_note, `${entry.label || entry.text}: accepted-pack item should retain LR interpretation metadata`);
  assert.ok((entry.tags || entry.matchedTags || entry.retrievalTags || []).length, `${entry.label || entry.text}: accepted-pack item should retain retrieval tags`);
  assert.ok(entry.traceability?.knowledge_pack_id === "burning_pee_pack_v1", `${entry.label || entry.text}: accepted-pack item should trace to source pack`);
  assert.ok((entry.traceability?.source_ids || []).includes("PACK_SRC"), `${entry.label || entry.text}: accepted-pack item should trace to pack source`);
  assert.equal(entry.traceability?.authorized_by, "validated_clinical_intent", `${entry.label || entry.text}: accepted-pack item should be authorized only after validated intent selection`);
});
const acceptedPackExam = activePackRecommendation.corePhysicalExamManeuvers.find((entry) => /Percuss costovertebral angle tenderness|CVA tenderness/i.test(entry.label));
assert.ok(acceptedPackExam.technique, "accepted pack exam should retain technique in final recommendation");
assert.ok(acceptedPackExam.whenToUse, "accepted pack exam should retain when-to-use metadata in final recommendation");
assert.ok(acceptedPackExam.limitations, "accepted pack exam should retain limitations in final recommendation");
assert.ok(acceptedPackExam.managementRelevance, "accepted pack exam should retain management relevance in final recommendation");
assert.ok(acceptedPackExam.feasibility?.difficulty && acceptedPackExam.feasibility?.time_burden_minutes && acceptedPackExam.feasibility?.equipment_needed && acceptedPackExam.feasibility?.patient_cooperation_required, "accepted pack exam should retain feasibility metadata in final recommendation");
const activePackCatalogGaps = activePackRecommendation.catalogGapsNeedingReview || [];
assert.ok(
  !activePackCatalogGaps.some((entry) => activePackRecommendation.corePhysicalExamManeuvers.some((exam) => exam.exam_id === entry.gapId || exam.exam_id === entry.linkedExamId)),
  "accepted pack recommendation items should not masquerade as staged catalog gaps after reviewer activation"
);
activePackCatalogGaps
  .filter((entry) => entry.traceability?.knowledge_pack_id === "burning_pee_pack_v1")
  .forEach((entry) => {
    assert.equal(entry.traceability?.authorized_by, "staged_catalog_gap", `${entry.label}: pack-associated completeness gaps should remain staged`);
    assert.equal(entry.traceability?.generated_completeness_gap, true, `${entry.label}: pack-associated gaps should be generated completeness gaps, not accepted pack items`);
    assert.match(entry.gapId || "", /^GAP-/, `${entry.label}: pack-associated completeness gap should keep a GAP-* id`);
  });
assert.ok(
  activePackCatalogGaps.some((entry) => /Conditional physical exam add-ons need review/i.test(entry.label || "")),
  "accepted packs without reviewed conditional add-ons should expose a staged completeness gap rather than silently appearing complete"
);

const tamperedStaged = JSON.parse(JSON.stringify(staged));
tamperedStaged.packs[0].pack.items[2].technique = "";
const tamperedActivation = activateStagedClinicalKnowledgePack(tamperedStaged, "burning_pee_pack_v1", {
  reviewer: "unit_test_reviewer",
  activatedAt: "2026-06-07T00:00:00.000Z",
  note: "Attempted activation after local state tampering."
});
assert.equal(tamperedActivation.packs[0].status, "staged", "tampered staged packs should not become accepted");
assert.equal(tamperedActivation.packs[0].activationStatus, "inactive_validation_failed", "activation should fail closed when staged content no longer validates");
assert.ok(
  (tamperedActivation.packs[0].activationIssues || []).some((issue) => issue.type === "exam-technique"),
  "activation failure should expose validation issues for reviewer cleanup"
);
assert.equal(activeClinicalKnowledgePacks(tamperedActivation).length, 0, "validation-failed activation should not expose active packs");
assert.equal(activeClinicalKnowledgePackIntents(tamperedActivation).length, 0, "validation-failed activation should not expose active intents");
assert.equal(activeClinicalKnowledgePackEvidenceCandidates(tamperedActivation).length, 0, "validation-failed activation should not expose active evidence candidates");

const rejected = rejectStagedClinicalKnowledgePack(staged, "burning_pee_pack_v1", {
  reviewer: "unit_test_reviewer",
  rejectedAt: "2026-06-07T00:00:00.000Z",
  note: "Rejected by test reviewer."
});
assert.equal(rejected.packs[0].status, "rejected", "reject action should mark the pack rejected");
assert.equal(rejected.packs[0].activationStatus, "inactive_rejected", "rejected packs should remain inactive");
assert.equal(activeClinicalKnowledgePacks(rejected).length, 0, "rejected packs should not become active clinical knowledge");
assert.equal(activeClinicalKnowledgePackIntents(rejected).length, 0, "rejected packs should not extend validated intent search");
assert.equal(activeClinicalKnowledgePackEvidenceCandidates(rejected).length, 0, "rejected packs should not extend evidence retrieval");
assert.equal(activeClinicalKnowledgePackGoldCases(rejected).length, 0, "rejected packs should not expose active gold cases");

const unsafeRejected = rejectStagedClinicalKnowledgePack(staged, "burning_pee_pack_v1", {
  reviewer: "replace_with_reviewer",
  rejectedAt: "Patient Jane Smith MRN 12345 DOB 01/02/1980",
  note: "TODO: ask patient Jane Smith at jane@example.com for missing chart note."
});
assert.equal(unsafeRejected.packs[0].rejectionReviewer, "local_reviewer", "rejection should replace placeholder reviewer IDs with a safe local reviewer id");
assert.doesNotMatch(
  unsafeRejected.packs[0].rejectedAt,
  /Jane Smith|MRN|12345|DOB|01\/02\/1980/i,
  "rejection should not persist PHI-like rejectedAt metadata"
);
assert.match(
  unsafeRejected.packs[0].rejectedAt,
  /^\d{4}-\d{2}-\d{2}T/,
  "rejection should replace unsafe rejectedAt metadata with a safe ISO timestamp"
);
assert.doesNotMatch(
  unsafeRejected.packs[0].reviewerNotes,
  /Jane Smith|jane@example\.com|TODO|replace_with/i,
  "rejection reviewer notes should not persist PHI-like or placeholder text"
);
assert.match(
  unsafeRejected.packs[0].reviewerNotes,
  /Reviewer note omitted because it appeared to contain PHI/i,
  "rejection should preserve an audit-safe omission notice when reviewer notes are unsafe"
);

const examplePackResult = validateClinicalKnowledgePack(readFileSync("medical-knowledge/examples/clinical_knowledge_pack_v1.example.json", "utf8"));
assert.ok(examplePackResult.ok, examplePackResult.issues.map((issue) => issue.message).join("\n"));
assert.ok(examplePackResult.itemCount >= 7, "example pack should contain plug-in-ready examples for each supported workup item type");
assert.ok(examplePackResult.intentCount >= 1, "example pack should contain a staged intent example");
assert.ok(
  ["safety_check", "history_question", "physical_exam_maneuver", "diagnostic_test", "reference_threshold", "management_change", "red_flag"]
    .every((itemType) => examplePackResult.pack.items.some((item) => item.item_type === itemType)),
  "example pack should demonstrate safety checks, questions, exams, tests, thresholds, management changes, and red flags as separate importable rows"
);

const duplicatePackResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [validPackQuestionItem, validPackQuestionItem]
});
assert.ok(!duplicatePackResult.ok, "duplicate knowledge-pack items should fail validation");
assert.ok(duplicatePackResult.issues.some((issue) => issue.type === "duplicate-item"));

const badIntentPackResult = validateClinicalKnowledgePack({
  ...validPack,
  intents: [{ ...validPack.intents[0], source_ids: ["MISSING_SRC"] }]
});
assert.ok(!badIntentPackResult.ok, "intent source IDs must resolve to the pack source registry");
assert.ok(badIntentPackResult.issues.some((issue) => issue.type === "intent-source"));

const missingIntentTypePackResult = validateClinicalKnowledgePack({
  ...validPack,
  intents: validPack.intents.map(({ intent_type, ...intent }) => intent)
});
assert.ok(!missingIntentTypePackResult.ok, "knowledge-pack intents should require intent_type");
assert.ok(missingIntentTypePackResult.issues.some((issue) => issue.type === "intent-intent_type"));

const invalidIntentTypePackResult = validateClinicalKnowledgePack({
  ...validPack,
  intents: [{ ...validPack.intents[0], intent_type: "free_text_blob" }]
});
assert.ok(!invalidIntentTypePackResult.ok, "knowledge-pack intents should reject unsupported intent_type values");
assert.ok(invalidIntentTypePackResult.issues.some((issue) => issue.type === "intent-intent_type"));

const missingItemIntentTraceResult = validateClinicalKnowledgePack({
  ...validPack,
  items: validPack.items.map(({ intent_ids, ...item }) => item)
});
assert.ok(!missingItemIntentTraceResult.ok, "knowledge-pack items should require traceability to staged intent IDs");
assert.ok(missingItemIntentTraceResult.issues.some((issue) => issue.type === "item-intent_ids"));

const badItemIntentTraceResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [{ ...validPackQuestionItem, intent_ids: ["missing_intent_v1"] }]
});
assert.ok(!badItemIntentTraceResult.ok, "knowledge-pack item intent references should resolve to staged intents");
assert.ok(badItemIntentTraceResult.issues.some((issue) => issue.type === "item-intent-ref"));

const badGoldIntentTraceResult = validateClinicalKnowledgePack({
  ...validPack,
  gold_cases: [{ ...validPack.gold_cases[0], intent_id: "missing_intent_v1" }]
});
assert.ok(!badGoldIntentTraceResult.ok, "gold cases should resolve to staged intents");
assert.ok(badGoldIntentTraceResult.issues.some((issue) => issue.type === "gold-case-intent"));

const conflictingGoldCaseResult = validateClinicalKnowledgePack({
  ...validPack,
  gold_cases: [{
    ...validPack.gold_cases[0],
    expected_core_labels: "CVA tenderness; PMI",
    avoid_labels: "PMI; Vibration sense"
  }]
});
assert.ok(!conflictingGoldCaseResult.ok, "gold cases should not list the same label as expected/acceptable and avoid");
assert.ok(conflictingGoldCaseResult.issues.some((issue) => issue.type === "gold-case-conflict"));

const safetyInGoldCoreResult = validateClinicalKnowledgePack({
  ...validPack,
  gold_cases: [{
    ...validPack.gold_cases[0],
    expected_core_labels: "Blood pressure; CVA tenderness",
    expected_safety_labels: ""
  }]
});
assert.ok(!safetyInGoldCoreResult.ok, "gold cases should not let vitals or acuity basics count as expected core physical exam maneuvers");
assert.ok(safetyInGoldCoreResult.issues.some((issue) => issue.type === "gold-case-core-safety-label"));

const examInGoldSafetyResult = validateClinicalKnowledgePack({
  ...validPack,
  gold_cases: [{
    ...validPack.gold_cases[0],
    expected_core_labels: "CVA tenderness",
    expected_safety_labels: "CVA tenderness"
  }]
});
assert.ok(!examInGoldSafetyResult.ok, "gold cases should not move true exam maneuvers into safety labels");
assert.ok(examInGoldSafetyResult.issues.some((issue) => issue.type === "gold-case-expected_safety_labels"));

const emptyGoldCaseListResult = validateClinicalKnowledgePack({
  ...validPack,
  gold_cases: [{
    ...validPack.gold_cases[0],
    expected_core_labels: " ; ",
    avoid_labels: " ; "
  }]
});
assert.ok(!emptyGoldCaseListResult.ok, "gold cases should require concrete expected and avoid label lists");
assert.ok(emptyGoldCaseListResult.issues.some((issue) => issue.type === "gold-case-expected_core_labels"));
assert.ok(emptyGoldCaseListResult.issues.some((issue) => issue.type === "gold-case-avoid_labels"));

const crossIntentGoldCasePack = JSON.parse(JSON.stringify(validPack));
crossIntentGoldCasePack.intents.push({
  ...validPack.intents[0],
  intent_id: "second_burning_pee_intent_v1",
  label: "Second burning pee intent",
  aliases: ["second burning pee"],
  gold_case_ids: ["burning_pee"]
});
const crossIntentGoldCaseResult = validateClinicalKnowledgePack(crossIntentGoldCasePack);
assert.ok(!crossIntentGoldCaseResult.ok, "intents should not cite gold cases owned by a different staged intent");
assert.ok(crossIntentGoldCaseResult.issues.some((issue) => issue.type === "intent-gold-case-intent"));

const missingIntentApplicabilityResult = validateClinicalKnowledgePack({
  ...validPack,
  intents: validPack.intents.map(({ applicability, ...intent }) => intent)
});
assert.ok(!missingIntentApplicabilityResult.ok, "knowledge packs should require intent-level applicability constraints");
assert.ok(missingIntentApplicabilityResult.issues.some((issue) => issue.type === "intent-applicability"));

const invalidIntentApplicabilityResult = validateClinicalKnowledgePack({
  ...validPack,
  intents: [{
    ...validPack.intents[0],
    applicability: {
      ...validPack.intents[0].applicability,
      pregnancy_status_required: "maybe",
      use_when: [],
      do_not_use_when: []
    }
  }]
});
assert.ok(!invalidIntentApplicabilityResult.ok, "knowledge packs should reject vague or empty applicability constraints");
assert.ok(invalidIntentApplicabilityResult.issues.some((issue) => issue.type === "intent-applicability-pregnancy_status_required"));
assert.ok(invalidIntentApplicabilityResult.issues.some((issue) => issue.type === "intent-applicability-use_when"));
assert.ok(invalidIntentApplicabilityResult.issues.some((issue) => issue.type === "intent-applicability-do_not_use_when"));

const missingSuppressIntentTraceResult = validateClinicalKnowledgePack({
  ...validPack,
  suppress_rules: validPack.suppress_rules.map(({ intent_ids, ...rule }) => rule)
});
assert.ok(!missingSuppressIntentTraceResult.ok, "suppress rules should require traceability to staged intent IDs");
assert.ok(missingSuppressIntentTraceResult.issues.some((issue) => issue.type === "suppress-rule-intent_ids"));
assert.ok(missingSuppressIntentTraceResult.issues.some((issue) => issue.type === "intent-suppress_rules"), "each staged intent should be covered by a suppress rule");

const missingSuppressRuleCoverageResult = validateClinicalKnowledgePack({
  ...validPack,
  suppress_rules: []
});
assert.ok(!missingSuppressRuleCoverageResult.ok, "knowledge packs should require suppress-rule coverage for each staged intent");
assert.ok(missingSuppressRuleCoverageResult.issues.some((issue) => issue.type === "intent-suppress_rules"));

const missingIntentExamCoverageResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "missing_intent_exam_coverage_pack",
  items: validPack.items.filter((item) => item.item_type !== "physical_exam_maneuver")
});
assert.ok(!missingIntentExamCoverageResult.ok, "knowledge packs should not activate an intent without linked physical exam maneuvers");
assert.ok(
  missingIntentExamCoverageResult.issues.some((issue) => issue.type === "intent-physical_exam_maneuver-coverage"),
  "missing exam coverage should be explicit at the intent level"
);
assert.ok(
  missingIntentExamCoverageResult.issues.some((issue) => issue.type === "gold-case-expected_core_label-unbacked"),
  "gold core exam labels should be backed by linked physical_exam_maneuver items"
);

const missingIntentHistoryCoverageResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "missing_intent_history_coverage_pack",
  items: validPack.items.filter((item) => item.item_type !== "history_question")
});
assert.ok(!missingIntentHistoryCoverageResult.ok, "knowledge packs should not activate an intent without linked history questions");
assert.ok(
  missingIntentHistoryCoverageResult.issues.some((issue) => issue.type === "intent-history_question-coverage"),
  "missing history coverage should be explicit at the intent level"
);

const missingIntentTestingCoverageResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "missing_intent_testing_coverage_pack",
  items: validPack.items.filter((item) => !["diagnostic_test", "reference_threshold"].includes(item.item_type))
});
assert.ok(!missingIntentTestingCoverageResult.ok, "knowledge packs should not activate an intent without testing or reference-threshold anchors");
assert.ok(
  missingIntentTestingCoverageResult.issues.some((issue) => issue.type === "intent-test-threshold-coverage"),
  "missing diagnostic-test/reference-threshold coverage should be explicit at the intent level"
);

const missingIntentEscalationCoverageResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "missing_intent_escalation_coverage_pack",
  items: validPack.items.filter((item) => !["red_flag", "management_change"].includes(item.item_type))
});
assert.ok(!missingIntentEscalationCoverageResult.ok, "knowledge packs should not activate an intent without red-flag or management-change anchors");
assert.ok(
  missingIntentEscalationCoverageResult.issues.some((issue) => issue.type === "intent-escalation-coverage"),
  "missing escalation/management coverage should be explicit at the intent level"
);

const validatedImportResult = validateClinicalKnowledgePack({
  ...validPack,
  intents: [{ ...validPack.intents[0], status: "validated" }]
});
assert.ok(!validatedImportResult.ok, "imported packs should not self-activate validated intents");
assert.ok(validatedImportResult.issues.some((issue) => issue.type === "intent-status"));

const reviewerAllowedValidatedImport = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "reviewer_allowed_validated_pack",
  intents: [{ ...validPack.intents[0], status: "validated" }]
}, { allowValidatedStatus: true });
assert.ok(reviewerAllowedValidatedImport.ok, reviewerAllowedValidatedImport.issues.map((issue) => issue.message).join("\n"));
const stagedReviewerAllowed = stageClinicalKnowledgePack(normalizeKnowledgePackReviewState(), reviewerAllowedValidatedImport);
assert.equal(
  stagedReviewerAllowed.packs[0].pack.intents[0].status,
  "draft",
  "even reviewer-allowed validated imports should be downgraded while staged"
);
assert.equal(stagedReviewerAllowed.packs[0].pack.intents[0].imported_status, "validated");

const incompleteQuestionResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      item_id: "incomplete_question",
      kind: "question",
      item_type: "history_question",
      label: "Ask about urinary symptoms",
      text: "Dysuria and fever",
      options: "No / Yes",
      condition_or_syndrome: "Dysuria",
      diagnostic_target: "Urinary infection",
      when_to_use_structured: "dysuria",
      result_changes_management: "Fever changes urgency.",
      evidence_source_primary: "PACK_SRC",
      retrieval_tags: "dysuria",
      reviewer_notes: "Synthetic invalid question."
    }
  ]
});
assert.ok(!incompleteQuestionResult.ok, "question items need askable text, when-to-ask, purpose, management implication, and tags");
assert.ok(incompleteQuestionResult.issues.some((issue) => issue.type === "question-text"));
assert.ok(incompleteQuestionResult.issues.some((issue) => issue.type === "question-when_to_ask"));

const incompleteExamResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      item_id: "incomplete_exam",
      kind: "exam",
      item_type: "physical_exam_maneuver",
      label: "CVA tenderness",
      evidence_source_primary: "PACK_SRC"
    }
  ]
});
assert.ok(!incompleteExamResult.ok, "exam items need technique, management, feasibility, limitations, and tags");
assert.ok(incompleteExamResult.issues.some((issue) => issue.type === "exam-technique"));
assert.ok(incompleteExamResult.issues.some((issue) => issue.type === "exam-LR_plus"));
assert.ok(incompleteExamResult.issues.some((issue) => issue.type === "exam-findings_options"));
assert.ok(incompleteExamResult.issues.some((issue) => issue.type === "exam-limitations"));

const incompleteDiagnosticTestResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      ...validPackDiagnosticTestItem,
      item_id: "incomplete_diagnostic_test",
      action: "",
      diagnostic_thresholds: "",
      interpretation_cautions: "",
      tags: []
    }
  ]
});
assert.ok(!incompleteDiagnosticTestResult.ok, "diagnostic-test items need an action, thresholds/reference interpretation, interpretation cautions, and tags");
assert.ok(incompleteDiagnosticTestResult.issues.some((issue) => issue.type === "diagnostic-test-action"));
assert.ok(incompleteDiagnosticTestResult.issues.some((issue) => issue.type === "diagnostic-test-reference_range"));
assert.ok(incompleteDiagnosticTestResult.issues.some((issue) => issue.type === "diagnostic-test-interpretation_cautions"));
assert.ok(incompleteDiagnosticTestResult.issues.some((issue) => issue.type === "diagnostic-test-tags"));

const incompleteReferenceThresholdResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      ...validPackReferenceThresholdItem,
      item_id: "incomplete_reference_threshold",
      action: "",
      reference_ranges: "",
      diagnostic_thresholds: "",
      interpretation_cautions: "",
      tags: []
    }
  ]
});
assert.ok(!incompleteReferenceThresholdResult.ok, "reference-threshold items need action, threshold/reference interpretation, interpretation cautions, and tags");
assert.ok(incompleteReferenceThresholdResult.issues.some((issue) => issue.type === "reference-threshold-action"));
assert.ok(incompleteReferenceThresholdResult.issues.some((issue) => issue.type === "reference-threshold-reference_range"));
assert.ok(incompleteReferenceThresholdResult.issues.some((issue) => issue.type === "reference-threshold-interpretation_cautions"));
assert.ok(incompleteReferenceThresholdResult.issues.some((issue) => issue.type === "reference-threshold-tags"));

const incompleteManagementChangeResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      ...validPackManagementChangeItem,
      item_id: "incomplete_management_change",
      action: "",
      rationale: "",
      tags: []
    }
  ]
});
assert.ok(!incompleteManagementChangeResult.ok, "management-change items need an action, rationale, and tags");
assert.ok(incompleteManagementChangeResult.issues.some((issue) => issue.type === "management-change-action"));
assert.ok(incompleteManagementChangeResult.issues.some((issue) => issue.type === "management-change-rationale"));
assert.ok(incompleteManagementChangeResult.issues.some((issue) => issue.type === "management-change-tags"));

const incompleteRedFlagResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      ...validPackRedFlagItem,
      item_id: "incomplete_red_flag",
      action: "",
      rationale: "",
      tags: []
    }
  ]
});
assert.ok(!incompleteRedFlagResult.ok, "red-flag items need an action, rationale, and tags");
assert.ok(incompleteRedFlagResult.issues.some((issue) => issue.type === "red-flag-action"));
assert.ok(incompleteRedFlagResult.issues.some((issue) => issue.type === "red-flag-rationale"));
assert.ok(incompleteRedFlagResult.issues.some((issue) => issue.type === "red-flag-tags"));

const incompleteSourceResult = validateClinicalKnowledgePack({
  ...validPack,
  source_registry: [{ source_id: "PACK_SRC", source_type: "guideline" }]
});
assert.ok(!incompleteSourceResult.ok, "source registry rows need URL/DOI, access, license, and citation metadata");
assert.ok(incompleteSourceResult.issues.some((issue) => issue.type === "source-url_or_doi"));
assert.ok(incompleteSourceResult.issues.some((issue) => issue.type === "source-review_owner"));
assert.ok(incompleteSourceResult.issues.some((issue) => issue.type === "source-next_review_due"));

const invalidSourceDateResult = validateClinicalKnowledgePack({
  ...validPack,
  source_registry: [{ ...validPack.source_registry[0], date_accessed: "June 6, 2026" }]
});
assert.ok(!invalidSourceDateResult.ok, "source registry access dates should use ISO dates");
assert.ok(invalidSourceDateResult.issues.some((issue) => issue.type === "source-date_accessed-format"));

const invalidSourceGovernanceDateResult = validateClinicalKnowledgePack({
  ...validPack,
  source_registry: [{ ...validPack.source_registry[0], next_review_due: "2026-01-01" }]
});
assert.ok(!invalidSourceGovernanceDateResult.ok, "source registry next-review dates should be later than last review");
assert.ok(invalidSourceGovernanceDateResult.issues.some((issue) => issue.type === "source-next_review_due-order"));

const invalidSourceCurrencyResult = validateClinicalKnowledgePack({
  ...validPack,
  source_registry: [{ ...validPack.source_registry[0], currency_status: "probably_current" }]
});
assert.ok(!invalidSourceCurrencyResult.ok, "source registry rows should use recognized currency statuses");
assert.ok(invalidSourceCurrencyResult.issues.some((issue) => issue.type === "source-currency_status"));

const invalidSourceLocatorResult = validateClinicalKnowledgePack({
  ...validPack,
  source_registry: [{ ...validPack.source_registry[0], url_or_doi: "javascript:alert(1)" }]
});
assert.ok(!invalidSourceLocatorResult.ok, "source registry rows should reject unsafe or non-auditable URL/DOI locators");
assert.ok(invalidSourceLocatorResult.issues.some((issue) => issue.type === "source-url_or_doi-format"));

const bareDoiSourceResult = validateClinicalKnowledgePack({
  ...validPack,
  source_registry: [{ ...validPack.source_registry[0], url_or_doi: "10.2337/dc26-S012" }]
});
assert.ok(bareDoiSourceResult.ok, bareDoiSourceResult.issues.map((issue) => issue.message).join("\n"));

const invalidLrResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [{ ...validPackExamItem, LR_plus: "high", LR_minus: "low" }]
});
assert.ok(!invalidLrResult.ok, "knowledge-pack exam LR values should be numeric, ranges, or explicit n/a-style values");
assert.ok(invalidLrResult.issues.some((issue) => issue.type === "exam-LR_plus-format"));
assert.ok(invalidLrResult.issues.some((issue) => issue.type === "exam-LR_minus-format"));

const missingLrNoteResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      ...validPackExamItem,
      item_id: "missing_lr_note_exam",
      likelihood_ratio_note: ""
    }
  ]
});
assert.ok(!missingLrNoteResult.ok, "knowledge-pack items should not rely on synthesized LR interpretation notes");
assert.ok(
  missingLrNoteResult.issues.some((issue) => issue.type === "item-likelihood_ratio_note" || issue.type === "exam-likelihood_ratio_note"),
  "missing LR note failures should point reviewers to the evidence-interpretation gap"
);

const whitespaceContentResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      ...validPackQuestionItem,
      item_id: "whitespace_question",
      text: "   ",
      options: "   ",
      likelihood_ratio_note: "   ",
      tags: ["   "]
    }
  ]
});
assert.ok(!whitespaceContentResult.ok, "knowledge-pack validation should treat whitespace-only clinical content as missing");
assert.ok(whitespaceContentResult.issues.some((issue) => issue.type === "question-text"));
assert.ok(whitespaceContentResult.issues.some((issue) => issue.type === "question-options"));
assert.ok(whitespaceContentResult.issues.some((issue) => issue.type === "item-likelihood_ratio_note" || issue.type === "question-likelihood_ratio_note"));
assert.ok(whitespaceContentResult.issues.some((issue) => issue.type === "question-tags"));

const invalidTimeBurdenResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [{ ...validPackExamItem, time_burden_minutes: "about a minute" }]
});
assert.ok(!invalidTimeBurdenResult.ok, "knowledge-pack exam time burden should be numeric");
assert.ok(invalidTimeBurdenResult.issues.some((issue) => issue.type === "exam-time_burden_minutes-format"));

const weakSafetyLabelResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "weak_safety_label_pack",
  items: [
    {
      ...validPackSafetyCheckItem,
      item_id: "weak_mental_status_safety",
      label: "Mental status",
      diagnostic_target: "Mental status safety data",
      result_changes_management: "Altered mental status changes urgency, monitoring, and disposition.",
      tags: ["mental_status", "safety_check"],
      retrieval_tags: "mental_status; safety_check"
    }
  ]
});
assert.ok(!weakSafetyLabelResult.ok, "knowledge-pack safety checks should use action-specific labels, not bare safety nouns");
assert.ok(
  weakSafetyLabelResult.issues.some((issue) => issue.type === "safety-check-label"),
  "weak safety-check label failures should be explicit for collaborator cleanup"
);

const phiPackResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "phi_pack",
  items: [
    {
      item_id: "phi_item",
      kind: "exam",
      item_type: "physical_exam_maneuver",
      label: "Jane, Smith DOB 01/02/1980 needs CVA tenderness",
      evidence_source_primary: "PACK_SRC"
    }
  ]
});
assert.ok(!phiPackResult.ok, "PHI-like collaborator content should fail validation");
assert.ok(phiPackResult.issues.some((issue) => issue.type === "phi"));

const contactPhiPackResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "contact_phi_pack",
  review_notes: "Curator can be reached at jane.smith@example.com or 555-1212. Patient John Smith was reviewed."
});
assert.ok(!contactPhiPackResult.ok, "knowledge packs should reject email, phone, and explicit patient-name PHI patterns");
assert.ok(contactPhiPackResult.issues.some((issue) => issue.type === "phi"));

const dateLocationPhiPackResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "date_location_phi_pack",
  review_notes: "Reviewer copied a raw chart clue from room 412B on 01/02/1980."
});
assert.ok(!dateLocationPhiPackResult.ok, "knowledge packs should reject room/bed identifiers and slash-form chart dates in reviewer notes");
assert.ok(dateLocationPhiPackResult.issues.some((issue) => issue.type === "phi"));

const placeholderPackResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "placeholder_pack",
  review_notes: "TODO: replace with source-backed reviewer notes.",
  items: [
    {
      ...validPackManagementChangeItem,
      item_id: "placeholder_management_change",
      rationale: "Replace with source-backed rationale before activation."
    }
  ]
});
assert.ok(!placeholderPackResult.ok, "knowledge packs should reject placeholder text even when required fields are present");
assert.ok(
  placeholderPackResult.issues.some((issue) => /placeholder/.test(issue.type)),
  "placeholder failures should be labeled for reviewer cleanup"
);

const snakeCasePlaceholderPackResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "snake_case_placeholder_pack",
  intents: [
    {
      ...validPack.intents[0],
      review_owner: "replace_with_reviewer"
    }
  ]
});
assert.ok(!snakeCasePlaceholderPackResult.ok, "knowledge packs should reject snake_case placeholder reviewer metadata");
assert.ok(
  snakeCasePlaceholderPackResult.issues.some((issue) => issue.type === "intent-placeholder"),
  "snake_case reviewer placeholder failures should point to intent metadata"
);

const topLevelPlaceholderPackResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "top_level_placeholder_pack",
  title: "TODO pack title",
  complaint_aliases: ["replace_with_alias"]
});
assert.ok(!topLevelPlaceholderPackResult.ok, "knowledge packs should reject placeholder text in top-level metadata and aliases");
assert.ok(
  topLevelPlaceholderPackResult.issues.some((issue) => issue.type === "pack-placeholder"),
  "top-level placeholder failures should be labeled for reviewer cleanup"
);

const rawChartFieldPackResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "raw_chart_field_pack",
  raw_chart_text: "No identifiers here, but raw chart text fields are not allowed."
});
assert.ok(!rawChartFieldPackResult.ok, "knowledge packs should reject raw chart text fields even when text lacks obvious PHI");
assert.ok(rawChartFieldPackResult.issues.some((issue) => issue.type === "forbidden-field"));

const camelCaseRawChartFieldPackResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "camel_case_raw_chart_field_pack",
  rawChartText: "No obvious identifier, but camelCase raw chart fields are still not allowed."
});
assert.ok(!camelCaseRawChartFieldPackResult.ok, "knowledge packs should reject camelCase raw chart fields even when text lacks obvious PHI");
assert.ok(camelCaseRawChartFieldPackResult.issues.some((issue) => issue.type === "forbidden-field"));

const invalidJsonResult = validateClinicalKnowledgePack("{ nope");
assert.ok(!invalidJsonResult.ok, "invalid JSON should fail without throwing");
assert.ok(invalidJsonResult.issues.some((issue) => issue.type === "json"));

const missingItemTypeResult = validateClinicalKnowledgePack({
  ...validPack,
  items: validPack.items.map(({ item_type, ...item }) => item)
});
assert.ok(!missingItemTypeResult.ok, "knowledge-pack items should require item_type");
assert.ok(missingItemTypeResult.issues.some((issue) => issue.type === "item-item_type"));

const mismatchedKindTypeResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [{ ...validPackExamItem, kind: "question", item_type: "physical_exam_maneuver" }]
});
assert.ok(!mismatchedKindTypeResult.ok, "legacy kind and item_type should not disagree");
assert.ok(mismatchedKindTypeResult.issues.some((issue) => issue.type === "item-kind-type-mismatch"));

const vitalAsExamResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      ...validPackExamItem,
      item_id: "bp_as_exam",
      label: "Measure blood pressure",
      diagnostic_target: "Blood pressure severity"
    }
  ]
});
assert.ok(!vitalAsExamResult.ok, "knowledge-pack physical exam items should not stage vital signs as maneuvers");
assert.ok(vitalAsExamResult.issues.some((issue) => issue.type === "exam-safety-check"));

const extremityTemperaturePerfusionExamResult = validateClinicalKnowledgePack({
  ...validPack,
  pack_id: "extremity_temperature_perfusion_pack",
  gold_cases: validPack.gold_cases.map((goldCase) => ({
    ...goldCase,
    expected_core_labels: "Palpate distal extremity warmth"
  })),
  items: validPack.items.map((item) => item.item_type === "physical_exam_maneuver"
    ? {
        ...validPackExamItem,
        item_id: "extremity_temperature_perfusion_exam",
        label: "Palpate distal extremity warmth",
        technique: "Palpate distal extremities for warmth, coolness, mottling, and symmetry while comparing sides.",
        findings_options: ["Warm and symmetric", "Cool", "Mottled", "Asymmetric", "Unable to assess"],
        options: "Warm and symmetric / Cool / Mottled / Asymmetric / Unable",
        diagnostic_target: "Peripheral perfusion and shock physiology",
        result_changes_management: "Cool, mottled, or asymmetric extremities change perfusion assessment, resuscitation urgency, and vascular/shock evaluation.",
        tags: ["perfusion", "shock", "extremity_temperature"]
      }
    : item)
});
assert.ok(
  extremityTemperaturePerfusionExamResult.ok,
  extremityTemperaturePerfusionExamResult.issues.map((issue) => issue.message).join("\n")
);

const bundledExamResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      ...validPackExamItem,
      item_id: "bundled_exam",
      label: "Inspect gait, strength, and focal tenderness"
    }
  ]
});
assert.ok(!bundledExamResult.ok, "knowledge-pack physical exam labels should be atomic");
assert.ok(bundledExamResult.issues.some((issue) => issue.type === "exam-bundled-label"));

const genericFindingsOptionsResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      ...validPackExamItem,
      item_id: "generic_findings_options_exam",
      findings_options: ["Normal", "Abnormal", "Unable to assess"],
      options: "Normal / Abnormal / Unable"
    }
  ]
});
assert.ok(!genericFindingsOptionsResult.ok, "knowledge-pack physical exam findings/options should be maneuver-specific");
assert.ok(
  genericFindingsOptionsResult.issues.some((issue) => issue.type === "exam-generic-findings_options"),
  "generic findings/options failures should point reviewers to the exam option quality gap"
);

const bundledTechniqueExamResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      ...validPackExamItem,
      item_id: "bundled_technique_exam",
      label: "Focused skeletal exam",
      technique: "Assess proximal strength, bone tenderness, gait/falls, and hypocalcemia signs.",
      findings_options: ["Normal", "Abnormal", "Unable to assess"],
      options: "Normal / Abnormal / Unable",
      diagnostic_target: "Proximal strength, bone tenderness, gait/falls, and hypocalcemia signs",
      result_changes_management: "Documents several endocrine signs and complications in one bundled exam item."
    }
  ]
});
assert.ok(!bundledTechniqueExamResult.ok, "knowledge-pack physical exam techniques should not bundle multiple maneuvers into one row");
assert.ok(
  bundledTechniqueExamResult.issues.some((issue) => issue.type === "exam-bundled-technique" || issue.type === "exam-bundled-generated-workup"),
  "bundled technique failures should tell reviewers to split the stale grouped exam row"
);

const semanticMismatchExamResult = validateClinicalKnowledgePack({
  ...validPack,
  items: [
    {
      ...validPackExamItem,
      item_id: "skin_turgor_wound_mismatch",
      label: "Test skin turgor",
      findings_options: "Wound / Drainage / Ulcer / Unable",
      diagnostic_target: "Soft tissue infection and wound drainage",
      result_changes_management: "Escalate wound care and inspect line sites.",
      tags: ["wound", "cellulitis"]
    }
  ]
});
assert.ok(!semanticMismatchExamResult.ok, "knowledge-pack exam metadata should match the maneuver label");
assert.ok(
  semanticMismatchExamResult.issues.some((issue) => issue.type === "exam-semantic-mismatch" && /skin turgor/i.test(issue.message)),
  "knowledge-pack validation should reject mismatched skin-turgor findings and targets"
);

console.log("Embedding recall tests passed.");
