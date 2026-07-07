import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRecommendedExamChecklist,
  buildEvidencePromptReplacement,
  loadEvidenceCatalog,
  evidenceReviewContainsPhiLikeContent,
  exportEvidenceReviewState,
  expandEvidenceContextText,
  extractEvidenceTags,
  importEvidenceReviewState,
  joinEvidenceCatalog,
  matchEvidenceForChecklistItem,
  mergeLegacyPhysicalExamOverlay,
  normalizeEvidenceReviewState,
  parseCsv,
  rankEvidenceCandidates,
  rowFingerprint,
  validateEvidenceCatalogSemanticConsistency,
  validateAcceptedCatalogAdditionRows,
  validateCatalogGapRows,
  validateEvidenceSourceRows,
  updateEvidenceReviewState,
  validateEvidenceOverlayRows
} from "../evidence.js";
import {
  buildClinicalIntentRetrievalContext,
  selectedValidatedClinicalIntents
} from "../clinical-intents.js";

const baseRows = parseCsv(readFileSync("data/evidence/exam_technique_base.csv", "utf8"));
const currentRows = parseCsv(readFileSync("data/physical-exam/physical_exam_reference.csv", "utf8"));
const overlayRows = parseCsv(readFileSync("data/evidence/exam_evidence_overlay.csv", "utf8"));
const legacyOverlayRows = parseCsv(readFileSync("data/physical-exam/physical_exam_evidence_overlay.csv", "utf8"));
const acceptedCatalogAdditionRows = parseCsv(readFileSync("data/evidence/accepted_exam_catalog_additions.csv", "utf8"));
const tagRows = parseCsv(readFileSync("data/evidence/retrieval_tag_dictionary.csv", "utf8"));
const sourceRows = parseCsv(readFileSync("data/evidence/source_registry.csv", "utf8"));
const gapRows = parseCsv(readFileSync("data/evidence/catalog_gap_registry.csv", "utf8"));
const sourceIds = new Set(sourceRows.map((row) => row.source_id));
const mergedOverlayRows = mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows);
const catalog = joinEvidenceCatalog(baseRows, mergedOverlayRows, sourceRows, acceptedCatalogAdditionRows);
const loadedEvidenceCatalog = await loadEvidenceCatalog((url) => readFileSync(url, "utf8"));

assert.deepEqual(baseRows, currentRows, "exam_technique_base.csv must preserve the current maneuver catalog exactly");
assert.ok(
  currentRows.every((row) => row.how_to_perform && row.how_to_perform.includes("Perform the maneuver:")),
  "every physical exam reference row should include patient-facing performance instructions"
);
assert.ok(loadedEvidenceCatalog.gapRows.length >= 20, "app evidence loader should include catalog gap registry rows");
assert.ok(
  loadedEvidenceCatalog.gapRows.some((row) => row.gap_exam_id === "GAP-derm-skin-inspection" && row.review_status === "staged_gap"),
  "catalog gap registry should load staged dermatology gap metadata"
);
assert.ok(
  loadedEvidenceCatalog.gapRows.every((row) => row.review_owner && row.last_reviewed && row.planned_resolution),
  "loaded catalog gap rows should expose reviewer metadata"
);

const sleepApneaGapContext = [
  "General medicine",
  "validated clinical intent workup",
  "intent: Sleep apnea evaluation",
  "intent_id: sleep_apnea_test_intent_v1",
  "intent tags: sleep_apnea; snoring",
  "clinical bundles: sleep_apnea_airway",
  "required domains: upper airway",
  "patient modifiers: loud snoring witnessed apnea daytime sleepiness"
].join("\n");
const sleepApneaTestIntent = {
  intent_id: "sleep_apnea_test_intent_v1",
  label: "Sleep apnea evaluation",
  status: "validated",
  source_ids: ["MCGEE_EBPD"],
  evidence_tags: ["sleep_apnea", "snoring"],
  clinical_bundle_ids: ["sleep_apnea_airway"],
  required_domains: ["upper airway"],
  avoid_labels: ["Broad abdominal exam"],
  gold_case_ids: ["sleep_apnea"]
};
const sleepApneaGapRecommendation = buildRecommendedExamChecklist(sleepApneaGapContext, { candidates: [], matchedTags: [] }, {
  validatedIntents: [sleepApneaTestIntent],
  catalogGapRegistryRows: gapRows
});
const validatedNeckCircumferenceEntry = sleepApneaGapRecommendation.coreItems.find((entry) => entry.exam_id === "REQ-osa-neck-circumference");
assert.ok(validatedNeckCircumferenceEntry, "validated sleep-apnea bundle should promote neck circumference as an active validated exam item");
assert.equal(validatedNeckCircumferenceEntry.traceability.catalog_gap, false, "validated neck circumference should no longer carry catalog_gap trace");
assert.equal(validatedNeckCircumferenceEntry.traceability.authorized_by, "validated_clinical_intent", "validated neck circumference should trace to the selected clinical intent");
assert.ok(
  validatedNeckCircumferenceEntry.traceability.intent_ids.includes("sleep_apnea_test_intent_v1"),
  "validated neck circumference should trace to the selected validated intent"
);
const stagedGapReview = sleepApneaGapRecommendation.catalogGapsNeedingReview.find((gap) => gap.gapId === "GAP-sleep-apnea-neck-circumference");
assert.equal(stagedGapReview, undefined, "validated sleep-apnea bundle should no longer expose neck circumference as a reviewer gap");
const nonStagedGapRecommendation = buildRecommendedExamChecklist(sleepApneaGapContext, { candidates: [], matchedTags: [] }, {
  validatedIntents: [sleepApneaTestIntent],
  catalogGapRegistryRows: gapRows,
  catalogGaps: [{
    exam_id: "abdomen_organ_exam_spleen_palpate_spleen",
    suggested_checklist_label: "Spleen palpation",
    maneuver_or_finding: "Spleen palpation",
    include_when: "broad abdominal context"
  }]
});
assert.ok(
  nonStagedGapRecommendation.catalogGapsNeedingReview.every((gap) => /^GAP-/.test(gap.gapId)),
  "recommendation-owned catalog gaps should never include ordinary base-catalog rows"
);
assert.ok(
  !nonStagedGapRecommendation.catalogGapsNeedingReview.some((gap) => /spleen/i.test(gap.label || gap.gapId)),
  "ordinary base-catalog rows should remain reviewer audit candidates, not staged catalog gaps"
);
assert.ok(
  gapRows.some((row) => row.gap_exam_id === "GAP-hypoglycemia-diaphoresis-inspection"),
  "catalog gap registry should include staged rows for recommendation bundle gaps"
);

const moduleBackedEvidenceOnlyIntent = {
  intent_id: "module_backed_evidence_only_test_v1",
  label: "Module-backed evidence-only test",
  status: "validated",
  source_ids: ["AHRQ_CALIBRATE_DX"],
  evidence_tags: ["endocrine_metabolic"],
  complaint_module_id: "module_backed_evidence_only_test_v1",
  clinical_bundle_ids: ["installed_guideline_module"],
  required_domains: ["focused history", "tests/reference thresholds", "red flags"],
  avoid_labels: [],
  gold_case_ids: ["module_backed_evidence_only_test"]
};
const moduleBackedEvidenceOnlyContext = [
  "General medicine",
  "validated clinical intent workup",
  "intent: Module-backed evidence-only test",
  "intent_id: module_backed_evidence_only_test_v1",
  "intent tags: endocrine_metabolic",
  "clinical bundles: installed_guideline_module",
  "required domains: focused history; tests/reference thresholds; red flags"
].join("\n");
const moduleBackedEvidenceOnlyRecommendation = buildRecommendedExamChecklist(
  moduleBackedEvidenceOnlyContext,
  { candidates: [], matchedTags: [] },
  {
    validatedIntents: [moduleBackedEvidenceOnlyIntent],
    catalogGapRegistryRows: gapRows
  }
);
const moduleBackedEvidenceOnlyGapLabels = moduleBackedEvidenceOnlyRecommendation.catalogGapsNeedingReview
  .map((gap) => gap.label)
  .join(" | ");
assert.match(
  moduleBackedEvidenceOnlyGapLabels,
  /Focused history question enrichment needs review/i,
  "evidence-only recommendations must not hide missing focused-history gaps just because an installed module exists"
);
assert.match(
  moduleBackedEvidenceOnlyGapLabels,
  /Diagnostic tests and reference thresholds need review/i,
  "evidence-only recommendations must not hide missing test/reference-threshold gaps just because an installed module exists"
);
assert.match(
  moduleBackedEvidenceOnlyGapLabels,
  /Red flags and escalation cues need review/i,
  "evidence-only recommendations must not hide missing red-flag gaps just because an installed module exists"
);
assert.equal(
  moduleBackedEvidenceOnlyRecommendation.workupReadinessStatus,
  "staged_gaps_need_review",
  "evidence-only module-backed recommendations should remain incomplete until module content is merged or the gaps are reviewed"
);

const overlayAudit = validateEvidenceOverlayRows(overlayRows, {
  knownSourceIds: sourceIds,
  baseRows,
  requireCompleteMetadata: true
});
assert.ok(overlayAudit.ok, overlayAudit.issues.map((issue) => issue.message).join("\n"));
const mergedOverlayAudit = validateEvidenceOverlayRows(mergedOverlayRows);
assert.ok(mergedOverlayAudit.ok, mergedOverlayAudit.issues.map((issue) => issue.message).join("\n"));
const badOverlayLrAudit = validateEvidenceOverlayRows([
  {
    ...overlayRows[0],
    LR_plus: "high",
    LR_minus: "low"
  }
]);
assert.ok(!badOverlayLrAudit.ok, "evidence overlay validation should reject non-numeric/non-n/a LR values");
assert.ok(
  ["bad-lr-plus", "bad-lr-minus"].every((type) => badOverlayLrAudit.issues.some((issue) => issue.type === type)),
  "evidence overlay LR failures should identify LR+ and LR- separately"
);
const badOverlayMetadataAudit = validateEvidenceOverlayRows([
  {
    ...overlayRows[0],
    diagnostic_target: "",
    evidence_source_primary: "MISSING_SOURCE_FOR_OVERLAY_TEST",
    source_citation: "MISSING_SOURCE_FOR_OVERLAY_TEST",
    base_row_number: "999999"
  },
  {
    ...overlayRows[1],
    base_row_fingerprint: "wrong-fingerprint"
  }
], {
  knownSourceIds: sourceIds,
  baseRows,
  requireCompleteMetadata: true
});
assert.ok(!badOverlayMetadataAudit.ok, "evidence overlay validation should reject incomplete metadata, unknown sources, and bad base references");
assert.ok(
  ["missing-field", "unknown-source", "bad-base-row", "bad-base-fingerprint"]
    .every((type) => badOverlayMetadataAudit.issues.some((issue) => issue.type === type)),
  "evidence overlay metadata failures should identify missing fields, unknown sources, bad base rows, and fingerprint mismatches"
);
const sourceRegistryAudit = validateEvidenceSourceRows(sourceRows, { maxAccessDate: "2026-06-08" });
assert.ok(sourceRegistryAudit.ok, sourceRegistryAudit.issues.map((issue) => issue.message).join("\n"));
[
  {
    source_id: "SSC_SEPSIS_2026",
    url: "https://www.sccm.org/survivingsepsiscampaign/guidelines-and-resources/surviving-sepsis-campaign-adult-guidelines",
    citationPattern: /Surviving Sepsis Campaign[\s\S]*Sepsis and Septic Shock 2026/i
  },
  {
    source_id: "ATS_CAP_2025",
    url: "https://academic.oup.com/ajrccm/article/212/1/24/8435770",
    citationPattern: /Am J Respir Crit Care Med\. 2026;212\(1\):24-44/i
  }
].forEach((expected) => {
  const row = sourceRows.find((source) => source.source_id === expected.source_id);
  assert.ok(row, `${expected.source_id} should be present in the evidence source registry`);
  assert.equal(row.url_or_doi, expected.url, `${expected.source_id} should retain the manually verified source URL`);
  assert.match(row.preferred_citation, expected.citationPattern, `${expected.source_id} should retain the manually verified citation form`);
  assert.ok(row.date_accessed <= "2026-06-08", `${expected.source_id} access date should not be later than this audit`);
});
const badSourceRegistryAudit = validateEvidenceSourceRows([
  sourceRows[0],
  {
    ...sourceRows[0],
    source_name: "TODO replace with final source",
    source_type: "blog_post",
    url_or_doi: "not-a-url",
    date_accessed: "June 7, 2026"
  },
  {
    ...sourceRows.find((row) => row.source_id === "SSC_SEPSIS_2026"),
    source_id: "SYNTHETIC_GUIDELINE_2027",
    date_accessed: "2026-06-08"
  },
  {
    ...sourceRows.find((row) => row.source_id === "ATS_CAP_2025"),
    source_id: "SYNTHETIC_FUTURE_ACCESS_2026",
    date_accessed: "2026-06-09"
  }
], { maxAccessDate: "2026-06-08" });
assert.ok(!badSourceRegistryAudit.ok, "source registry validation should reject duplicate, placeholder, bad type, bad URL, bad date, impossible source-year, and future-access metadata");
assert.ok(
  ["duplicate-source-id", "placeholder-source", "bad-source-type", "bad-url-or-doi", "bad-date-accessed", "source-year-after-access", "future-date-accessed"]
    .every((type) => badSourceRegistryAudit.issues.some((issue) => issue.type === type)),
  "source registry validation failures should identify duplicate, placeholder, type, URL, date, source-year, and future-access problems"
);
const acceptedCatalogAudit = validateAcceptedCatalogAdditionRows(acceptedCatalogAdditionRows, { knownSourceIds: sourceIds });
assert.ok(acceptedCatalogAudit.ok, acceptedCatalogAudit.issues.map((issue) => issue.message).join("\n"));
const badAcceptedCatalogLrAudit = validateAcceptedCatalogAdditionRows([
  {
    ...acceptedCatalogAdditionRows[0],
    LR_plus: "very high",
    LR_minus: "very low"
  }
], { knownSourceIds: sourceIds });
assert.ok(!badAcceptedCatalogLrAudit.ok, "accepted catalog additions should reject malformed LR values");
assert.ok(
  ["bad-lr-plus", "bad-lr-minus"].every((type) => badAcceptedCatalogLrAudit.issues.some((issue) => issue.type === type)),
  "accepted catalog LR failures should identify LR+ and LR- separately"
);
assert.ok(acceptedCatalogAdditionRows.length >= 10, "accepted catalog additions should include reviewed atomic maneuvers absent from the frozen base catalog");
assert.ok(
  loadedEvidenceCatalog.acceptedCatalogAdditionRows.some((row) => row.exam_id === "EXAM-DERM-SKIN-INSPECTION"),
  "app evidence loader should include accepted catalog addition rows"
);
assert.ok(
  loadedEvidenceCatalog.catalog.some((candidate) => candidate.exam_id === "EXAM-GU-SCROTAL-EXAM" && candidate.acceptedCatalogAddition),
  "accepted catalog additions should feed the merged retrieval catalog"
);
const catalogGapAudit = validateCatalogGapRows(gapRows, { knownSourceIds: sourceIds });
assert.ok(catalogGapAudit.ok, catalogGapAudit.issues.map((issue) => issue.message).join("\n"));
assert.ok(gapRows.length >= 20, "catalog gap registry should include staged gaps for uncovered validated bundle items");
assert.ok(gapRows.every((row) => /^GAP-/.test(row.gap_exam_id)), "catalog gap IDs should remain staged GAP-* identifiers");
assert.ok(gapRows.every((row) => row.review_status === "staged_gap"), "catalog gaps should not masquerade as accepted evidence rows");
const badGapAudit = validateCatalogGapRows([
  {
    ...gapRows[0],
    gap_exam_id: "EXAM-not-a-gap",
    review_status: "validated",
    last_reviewed: "06/07/2026",
    source_ids: "MISSING_SOURCE_FOR_GAP_TEST"
  }
], { knownSourceIds: sourceIds });
assert.ok(!badGapAudit.ok, "catalog gap validation should reject promoted IDs, invalid statuses/dates, and unknown sources");
assert.ok(
  ["bad-gap-id", "bad-gap-status", "bad-review-date", "unknown-source"].every((type) => badGapAudit.issues.some((issue) => issue.type === type)),
  "catalog gap validation failures should identify ID, status, date, and source problems"
);
assert.ok(overlayRows.length >= 75 && overlayRows.length <= 100, "first overlay wave should contain 75 to 100 rows");
assert.ok(mergedOverlayRows.length >= overlayRows.length, "legacy physical overlay should supplement the requested evidence overlay");

const overlayIds = new Set();
overlayRows.forEach((row) => {
  assert.ok(!overlayIds.has(row.exam_id), `duplicate exam_id ${row.exam_id}`);
  overlayIds.add(row.exam_id);
  const base = baseRows[Number(row.base_row_number) - 1];
  assert.ok(base, `${row.exam_id} should reference an existing base row`);
  assert.equal(row.base_row_fingerprint, rowFingerprint(base), `${row.exam_id} fingerprint should match base row`);
  assert.ok(sourceIds.has(row.evidence_source_primary), `${row.exam_id} source should exist in source registry`);
  row.source_citation.split(";").map((source) => source.trim()).filter(Boolean).forEach((sourceId) => {
    assert.ok(sourceIds.has(sourceId), `${row.exam_id} citation source should exist: ${sourceId}`);
  });
});

const tagKeys = new Set();
tagRows.forEach((row) => {
  assert.ok(row.tag, "tag row should have tag");
  assert.ok(row.trigger_terms, `${row.tag} should have trigger terms`);
  const key = row.tag.toLowerCase();
  assert.ok(!tagKeys.has(key), `duplicate tag dictionary row ${row.tag}`);
  tagKeys.add(key);
});

sourceRows.forEach((row) => {
  assert.ok(row.source_id, "source row should have source_id");
  assert.ok(row.url_or_doi.startsWith("http"), `${row.source_id} should have URL`);
  assert.ok(row.date_accessed, `${row.source_id} should include access date`);
});

const evidenceSourceById = new Map(sourceRows.map((row) => [row.source_id, row]));
const atsCapSource = evidenceSourceById.get("ATS_CAP_2025");
assert.ok(atsCapSource, "source registry should include the 2025 ATS adult CAP guideline update");
assert.equal(
  atsCapSource.url_or_doi,
  "https://academic.oup.com/ajrccm/article/212/1/24/8435770",
  "ATS_CAP_2025 should point at the canonical article page, not a generic journals redirect"
);
assert.match(
  `${atsCapSource.preferred_citation} ${atsCapSource.license_access_notes}`,
  /\bATS\b[\s\S]*(?:approved May 2025|Am J Respir Crit Care Med\. 2026;212\(1\):24-44)/i,
  "ATS_CAP_2025 should make the 2025-approved ATS guideline provenance explicit"
);
assert.ok(
  evidenceSourceById.has("IDSA_CAP_PATHWAY_2019"),
  "2019 IDSA CAP pathway should remain a distinct source instead of being merged into ATS_CAP_2025"
);

const adrenalTags = extractEvidenceTags("Adrenal insufficiency with hypotension and hydrocortisone need.", tagRows).map((match) => match.tag);
assert.ok(adrenalTags.includes("adrenal_insufficiency"), "adrenal context should match adrenal insufficiency");
assert.ok(!adrenalTags.includes("AKI"), "single-word renal trigger should not match inside adrenal");
const stomachCrampTags = extractEvidenceTags(expandEvidenceContextText("Stomach cramps after dinner."), tagRows).map((match) => match.tag);
assert.ok(stomachCrampTags.includes("abdominal_pain"), "lay term stomach cramps should expand to abdominal pain evidence tags");

const mergedVisualAcuity = catalog.find((candidate) => candidate.base?.exam_id === "neuro_cranial_nerves_cn_ii_visual_acuity");
assert.ok(mergedVisualAcuity, "merged catalog should include visual acuity");
assert.ok(
  /merck|johns hopkins|neurological exam/i.test(`${mergedVisualAcuity.evidence_source_primary} ${mergedVisualAcuity.source_citation}`),
  "updated physical_exam_evidence_overlay.csv should feed the merged retrieval catalog"
);

const semanticCatalogAudit = validateEvidenceCatalogSemanticConsistency(catalog);
assert.ok(semanticCatalogAudit.ok, semanticCatalogAudit.issues.map((issue) => issue.message).join("\n"));
const badSemanticCatalogAudit = validateEvidenceCatalogSemanticConsistency([
  {
    exam_id: "EXAM-BAD-BOWEL-SOUNDS",
    examLabel: "Bowel sounds",
    diagnostic_target: "murmur, abnormal heart sound, or S3/S4 clue",
    result_changes_management: "New rhythm, murmur, or extra sound changes telemetry and ECG planning.",
    base: {
      exam_system: "Abdomen",
      section: "Core Exam",
      maneuver_or_finding: "Auscultate abdomen",
      suggested_checklist_label: "Bowel sounds"
    }
  }
]);
assert.ok(!badSemanticCatalogAudit.ok, "semantic catalog validator should reject cross-domain diagnostic target leakage");
assert.ok(
  badSemanticCatalogAudit.issues.some((issue) => issue.type === "semantic-metadata-leakage" && issue.profile === "abdominal_metadata_leakage"),
  "semantic catalog validator should identify abdominal metadata leakage explicitly"
);

function catalogEntryByLabel(labelPattern) {
  const entry = catalog.find((candidate) => labelPattern.test([
    candidate.examLabel,
    candidate.source_item,
    candidate.base?.maneuver_or_finding
  ].filter(Boolean).join(" ")));
  assert.ok(entry, `expected merged catalog entry matching ${labelPattern.source}`);
  return entry;
}

function catalogMetadataText(entry) {
  return [
    entry.examLabel,
    entry.diagnostic_target,
    entry.result_changes_management,
    entry.evidence_source_primary,
    entry.source_citation,
    entry.retrieval_tags
  ].filter(Boolean).join(" ");
}

[
  {
    pattern: /\bBowel sounds\b/i,
    require: /bowel|abdominal|ileus|obstruction/i,
    forbid: /murmur|S3|S4|heart sound|focal consolidation|pulmonary|bronchodilator|musculoskeletal|immobilization/i,
    message: "bowel sounds should keep abdominal metadata rather than cardiac, pulmonary, or MSK leakage"
  },
  {
    pattern: /\bHeart sounds\b/i,
    require: /murmur|heart sound|rhythm|telemetry|ECG|echo/i,
    forbid: /focal consolidation|pneumonia|antibiotic|bronchodilator|abdominal|bowel/i,
    message: "heart sounds should keep cardiac metadata rather than pulmonary or abdominal leakage"
  },
  {
    pattern: /\bPMI\b/i,
    require: /cardiomegaly|precordial|cardiac|diuresis|heart/i,
    forbid: /focal consolidation|pneumonia|bowel|patellofemoral/i,
    message: "PMI should keep cardiac precordial metadata"
  },
  {
    pattern: /\bPatellar reflex\b/i,
    require: /upper versus lower motor neuron|neurologic|localization/i,
    forbid: /patellofemoral|anterior knee|immobilization|vascular/i,
    message: "patellar reflex should keep neurologic reflex metadata rather than patellofemoral knee-pain metadata"
  },
  {
    pattern: /\bPatellar grind\b/i,
    require: /patellofemoral|musculoskeletal|activity restriction|imaging/i,
    forbid: /perfusion|vascular|limb ischemia|pulmonary|bronchodilator|murmur/i,
    message: "patellar grind should keep MSK metadata rather than vascular leakage from patellofemoral text"
  },
  {
    pattern: /\bPatellar ballottement\b/i,
    require: /knee effusion|intra-articular|musculoskeletal|imaging/i,
    forbid: /pleural|pulmonary|bronchodilator|murmur|bowel/i,
    message: "patellar ballottement should keep knee-effusion metadata rather than pulmonary-effusion leakage"
  },
  {
    pattern: /\bNasal exam\b/i,
    require: /nasal|mucosa|obstruction|documentation|reassessment/i,
    forbid: /abdominal findings|bowel|serial abdominal|ileus|surgical consultation/i,
    message: "nasal exam should not treat nasal obstruction as bowel obstruction"
  },
  {
    pattern: /\bAbdominal palpation\b/i,
    require: /peritoneal|acute abdomen|abdominal|surgical|serial abdominal/i,
    forbid: /musculoskeletal|immobilization|patellofemoral|cardiac|murmur/i,
    message: "abdominal palpation should keep abdominal/peritoneal metadata rather than MSK tenderness metadata"
  }
].forEach((guardrail) => {
  const entry = catalogEntryByLabel(guardrail.pattern);
  const text = catalogMetadataText(entry);
  assert.match(text, guardrail.require, guardrail.message);
  assert.doesNotMatch(text, guardrail.forbid, guardrail.message);
});

function rankedLabels(context, options = {}) {
  const result = rankEvidenceCandidates(catalog, context, tagRows, {
    maxCandidates: 18,
    specialty: "Endocrinology consult",
    ...options
  });
  return {
    result,
    labels: result.candidates.map((candidate) => `${candidate.examLabel} ${candidate.maneuver} ${candidate.retrieval_tags}`.toLowerCase())
  };
}

function assertAnyLabel(context, expectedPatterns, message) {
  const { result, labels } = rankedLabels(context);
  assert.ok(result.candidates.length > 0, `${message}: should retrieve candidates`);
  assert.ok(
    expectedPatterns.some((pattern) => labels.some((label) => pattern.test(label))),
    `${message}: expected one of ${expectedPatterns.map((pattern) => pattern.source).join(", ")} in ${labels.slice(0, 8).join(" | ")}`
  );
  return result;
}

function recommendationForContext(context, options = {}) {
  const result = rankEvidenceCandidates(catalog, context, tagRows, {
    maxCandidates: 60,
    specialty: "Endocrinology consult",
    ...options
  });
  return buildRecommendedExamChecklist(context, result, {
    specialty: "Endocrinology consult"
  });
}

function recommendationLabels(recommendation, includeConditional = true) {
  const entries = [
    ...(recommendation.basicSafetyChecks || []),
    ...(recommendation.focusedHistoryQuestions || []),
    ...(recommendation.corePhysicalExamManeuvers || recommendation.coreItems || []),
    ...(includeConditional ? (recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems || []) : []),
    ...(recommendation.initialTestsAndReferenceThresholds || []),
    ...(recommendation.redFlagsAndEscalationCues || [])
  ];
  return entries.map((entry) => `${entry.label || entry.text || ""} ${entry.candidate?.maneuver || ""} ${entry.domain || ""}`.toLowerCase());
}

function assertRecommendedIncludes(context, patterns, message) {
  const recommendation = recommendationForContext(context);
  const labels = recommendationLabels(recommendation);
  assert.ok(recommendation.coreItems.length > 0, `${message}: should have core recommendations`);
  assert.ok(
    patterns.some((pattern) => labels.some((label) => pattern.test(label))),
    `${message}: expected one of ${patterns.map((pattern) => pattern.source).join(", ")} in ${labels.join(" | ")}`
  );
  return recommendation;
}

function assertRecommendedExcludes(context, patterns, message) {
  const recommendation = recommendationForContext(context);
  const labels = recommendationLabels(recommendation);
  const hits = patterns.filter((pattern) => labels.some((label) => pattern.test(label)));
  assert.equal(hits.length, 0, `${message}: should exclude ${hits.map((pattern) => pattern.source).join(", ")} from ${labels.join(" | ")}`);
  return recommendation;
}

assertAnyLabel(
  "Endocrinology consult for T1DM admitted with DKA, anion gap acidosis, vomiting, dehydration, insulin drip, poor PO intake, and AKI.",
  [/blood pressure/, /respiratory rate/, /jvp/, /mouth exam/, /abdominal/],
  "DKA/HHS case"
);
assertAnyLabel(
  "Inpatient diabetes consult for basal bolus insulin adjustment, neuropathy, glucose variability, and discharge readiness.",
  [/dorsalis pedis|posterior tibial|extremity light touch|vibration|proprioception/],
  "inpatient diabetes case"
);
assertAnyLabel(
  "Patient had hypoglycemia with shakiness, sweats, confusion, and near syncope after insulin.",
  [/heart rate|blood pressure|pupils|gait|pronator/],
  "hypoglycemia case"
);
assertAnyLabel(
  "Concern for adrenal crisis with hypotension, hyponatremia, hyperkalemia, vomiting, abdominal pain, and hydrocortisone need.",
  [/blood pressure|jvp|abdominal tenderness|bowel sounds/],
  "adrenal crisis case"
);
assertAnyLabel(
  "Possible thyroid storm with Graves disease, palpitations, agitation, thyrotoxicosis, tachycardia, and hyperthermia.",
  [/thyroid exam|heart rate|heart sounds|blood pressure/],
  "thyroid storm case"
);
assertAnyLabel(
  "Possible myxedema coma with severe hypothyroidism, bradycardia, hypothermia, somnolence, hypoventilation, and hyponatremia.",
  [/thyroid exam|respiratory rate|heart rate|gait|pupils/],
  "myxedema case"
);
assertAnyLabel(
  "Severe hyponatremia with SIADH concern, confusion, seizure risk, low sodium, and uncertainty about volume status.",
  [/jvp|edema|gait|romberg|blood pressure/],
  "hyponatremia case"
);
assertAnyLabel(
  "Hypercalcemia of malignancy with high calcium, constipation, polyuria, dehydration, confusion, and bone pain.",
  [/blood pressure|jvp|abdominal|bowel sounds|gait/],
  "hypercalcemia case"
);
assertAnyLabel(
  "Pituitary sellar lesion abutting optic chiasm with headache, visual field loss, diplopia, and possible apoplexy.",
  [/visual fields|extraocular|pupils|visual acuity/],
  "pituitary/sellar case"
);
assertAnyLabel(
  "Dyspnea with hypoxia, edema, rising creatinine, orthopnea, and possible heart failure requiring diuresis decisions.",
  [/jvp|lower extremity edema|posterior lung sounds|heart sounds|blood pressure/],
  "dyspnea and volume overload case"
);
assertAnyLabel(
  "AKI with rising creatinine, oliguria, hypotension, flank pain, poor intake, and possible hypovolemia.",
  [/cva tenderness|blood pressure|jvp|radial pulses|mouth exam/],
  "AKI/hypovolemia case"
);

const dkaRecommendation = assertRecommendedIncludes(
  "Endocrinology consult for T1DM admitted with DKA, anion gap acidosis, vomiting, dehydration, insulin drip, poor PO intake, and AKI.",
  [/blood pressure/, /respiratory rate/, /inspect oral mucosa|mouth exam/, /inspect jugular venous pressure|jvp/, /palpate abdomen|abdominal palpation/],
  "DKA/HHS recommendation"
);
assert.ok(
  [/blood pressure/, /respiratory rate/, /inspect oral mucosa|mouth exam/, /inspect jugular venous pressure|jvp/, /palpate abdomen|abdominal palpation/]
    .filter((pattern) => recommendationLabels(dkaRecommendation).some((label) => pattern.test(label))).length >= 4,
  "DKA/HHS recommendation should cover vitals, respiratory/volume, mucosa, and abdomen"
);
assert.ok(
  dkaRecommendation.basicSafetyChecks.some((entry) => /respiratory rate/i.test(entry.label) && /Kussmaul|hyperglycemic-crisis/i.test(entry.displayDiagnosticTarget || "")),
  "DKA/HHS respiratory rate should display a DKA-specific diagnostic target as basic safety/acuity data"
);
assert.ok(
  dkaRecommendation.corePhysicalExamManeuvers.some((entry) => /palpate abdomen|abdominal palpation|auscultate bowel sounds|bowel sounds/i.test(entry.label) && /DKA|precipitating abdominal/i.test(entry.displayDiagnosticTarget || "")),
  "DKA/HHS abdominal items should display DKA-specific abdominal rationale"
);
assertRecommendedExcludes(
  "Endocrinology consult for T1DM admitted with DKA, anion gap acidosis, vomiting, dehydration, insulin drip, poor PO intake, and AKI.",
  [/pmi/, /vibration sense/, /ophthalmoscopic/, /visual acuity/],
  "DKA/HHS recommendation"
);

const peRecommendation = assertRecommendedIncludes(
  "Suspected pulmonary embolism with pleuritic chest pain, dyspnea, tachycardia, hypoxia, and unilateral leg swelling.",
  [/respiratory rate/, /auscultate posterior lung fields|posterior lung sounds/, /auscultate heart sounds|heart sounds/, /inspect jugular venous pressure|jvp/, /inspect unilateral leg swelling|lower extremity edema/, /blood pressure/],
  "suspected PE recommendation"
);
assert.ok(
  [/respiratory rate/, /auscultate posterior lung fields|posterior lung sounds/, /auscultate heart sounds|heart sounds/, /inspect jugular venous pressure|jvp/, /inspect unilateral leg swelling|lower extremity edema/, /blood pressure/]
    .filter((pattern) => recommendationLabels(peRecommendation).some((label) => pattern.test(label))).length >= 5,
  "suspected PE recommendation should cover vitals, pulmonary, cardiac strain, and DVT-relevant exam"
);
assertRecommendedExcludes(
  "Suspected pulmonary embolism with pleuritic chest pain, dyspnea, tachycardia, hypoxia, and unilateral leg swelling.",
  [/murphy/, /rebound/, /visual acuity/, /pronator drift/, /vibration sense/, /pmi/],
  "suspected PE recommendation"
);

const stomachCrampRecommendation = assertRecommendedIncludes(
  "Stomach cramps with nausea after eating.",
  [/inspect abdomen|abdominal inspection/, /palpate abdomen|abdominal palpation/, /auscultate bowel sounds|bowel sounds/, /blood pressure/, /heart rate/],
  "stomach cramps recommendation"
);
assert.ok(
  [/inspect abdomen|abdominal inspection/, /palpate abdomen|abdominal palpation/, /auscultate bowel sounds|bowel sounds/]
    .filter((pattern) => recommendationLabels(stomachCrampRecommendation).some((label) => pattern.test(label))).length >= 2,
  "stomach cramps recommendation should cover focused abdominal exam"
);
assertRecommendedExcludes(
  "Stomach cramps with nausea after eating.",
  [/pmi/, /lower extremity edema/, /vibration sense/, /visual acuity/, /pronator drift/],
  "stomach cramps recommendation"
);

function generalMedicineRecommendation(context) {
  const result = rankEvidenceCandidates(catalog, context, tagRows, {
    maxCandidates: 80,
    specialty: "General medicine"
  });
  return buildRecommendedExamChecklist(context, result, {
    specialty: "General medicine",
    maxCoreItems: 28,
    maxConditionalItems: 42
  });
}

const periodCrampRecommendation = generalMedicineRecommendation("General clinic Period cramps management-relevant bedside physical exam.");
const periodCrampLabels = recommendationLabels(periodCrampRecommendation);
assert.ok(
  [/inspect abdomen|abdominal inspection/, /palpate abdomen|abdominal palpation/, /auscultate bowel sounds|bowel sounds/]
    .filter((pattern) => periodCrampLabels.some((label) => pattern.test(label))).length >= 2,
  `period cramps should produce lower-abdominal exam recommendations, got ${periodCrampLabels.join(" | ")}`
);
assert.equal(
  [/jvp/, /pmi/, /carotids/, /pronator drift/]
    .filter((pattern) => periodCrampLabels.some((label) => pattern.test(label))).length,
  0,
  `period cramps should avoid unrelated cardiopulmonary/neuro maneuvers, got ${periodCrampLabels.join(" | ")}`
);
assert.ok(
  periodCrampRecommendation.warnings.some((warning) => /pelvic\/speculum\/bimanual exam/i.test(warning)),
  "period cramps should warn about pelvic/pregnancy catalog gaps"
);
assert.ok(
  periodCrampRecommendation.coreItems.some((entry) => /lower-abdominal tenderness pattern/i.test(entry.displayDiagnosticTarget || "")),
  "period cramps should use pelvic/lower-abdominal display targets instead of generic abdominal metadata"
);

const jitteryRecommendation = generalMedicineRecommendation("General clinic Feeling jittery management-relevant bedside physical exam.");
const jitteryCoreLabels = recommendationLabels(jitteryRecommendation, false);
assert.ok(
  [/heart rate/, /blood pressure/, /respiratory rate/]
    .filter((pattern) => jitteryCoreLabels.some((label) => pattern.test(label))).length >= 2,
  `feeling jittery should prioritize adrenergic vital signs, got ${jitteryCoreLabels.join(" | ")}`
);
assert.equal(
  [/inspect jugular venous pressure|jvp/, /palpate point of maximal impulse|pmi/, /pronator drift/, /facial symmetry/, /palpate abdomen|abdominal palpation/, /auscultate bowel sounds|bowel sounds/]
    .filter((pattern) => recommendationLabels(jitteryRecommendation).some((label) => pattern.test(label))).length,
  0,
  `isolated feeling jittery should not recommend unrelated volume, neuro, or abdominal maneuvers, got ${recommendationLabels(jitteryRecommendation).join(" | ")}`
);
assert.ok(
  jitteryRecommendation.warnings.some((warning) => /bedside glucose check/i.test(warning)),
  "feeling jittery should warn about bedside glucose/mental-status catalog gaps"
);

const faceWeaknessRecommendation = assertRecommendedIncludes(
  "Face weakness with crooked smile and mouth droop.",
  [/inspect facial symmetry|facial symmetry/, /test eye closure|eye closure/, /test pronator drift|pronator drift/],
  "face weakness recommendation"
);
assert.ok(
  [/inspect facial symmetry|facial symmetry/, /test eye closure|eye closure/].some((pattern) => recommendationLabels(faceWeaknessRecommendation, false).some((label) => pattern.test(label))),
  "face weakness recommendation should prioritize cranial nerve VII maneuvers in core items"
);
assert.equal(
  [/vibration sense/, /great toe proprioception/, /extremity light touch/, /extremity pinprick/, /hip flexion/, /deltoid/, /babinski/]
    .filter((pattern) => recommendationLabels(faceWeaknessRecommendation, false).some((label) => pattern.test(label))).length,
  0,
  "face weakness recommendation should not make broad sensory, reflex, or limb-strength maneuvers core without limb/sensory context"
);

const heartFailureRecommendation = assertRecommendedIncludes(
  "Dyspnea with hypoxia, edema, rising creatinine, orthopnea, and possible heart failure requiring diuresis decisions.",
  [/inspect jugular venous pressure|jvp/, /inspect and press lower extremity edema|lower extremity edema/, /auscultate posterior lung fields|posterior lung sounds/, /auscultate heart sounds|heart sounds/, /blood pressure/, /respiratory rate/],
  "dyspnea/HF recommendation"
);
assert.ok(
  [/inspect jugular venous pressure|jvp/, /inspect and press lower extremity edema|lower extremity edema/, /auscultate posterior lung fields|posterior lung sounds/, /auscultate heart sounds|heart sounds/, /blood pressure/, /respiratory rate/]
    .filter((pattern) => recommendationLabels(heartFailureRecommendation).some((label) => pattern.test(label))).length >= 5,
  "dyspnea/HF recommendation should prioritize volume, lung, cardiac, BP, and respiratory items"
);

assertRecommendedIncludes(
  "Eye redness with discharge, photophobia, eye pain, and blurry vision.",
  [/test visual acuity|visual acuity/, /check pupils|pupils/, /test extraocular|extraocular/, /inspect sclerae and conjunctivae|sclerae and conjunctivae/],
  "eye redness recommendation"
);
assertRecommendedExcludes(
  "Eye redness with discharge, photophobia, eye pain, and blurry vision.",
  [/murphy/, /cva tenderness/, /posterior lung sounds/, /bowel sounds/],
  "eye redness recommendation"
);

const prompt = "<student_exam_reference>\nlegacy\n</student_exam_reference>\n<format_contract>\nReturn exactly two parent checklists.";
const dkaPromptIntents = selectedValidatedClinicalIntents(["dka_hhs_v1"]);
const dkaPromptContext = buildClinicalIntentRetrievalContext(
  dkaPromptIntents,
  "Endocrinology consult DKA with dehydration and AKI.",
  "Endocrinology consult",
  "Adult"
);
const promptReplacement = buildEvidencePromptReplacement(prompt, {
  catalog,
  tagRows,
  sourceRows,
  overlayRows,
  baseRows
}, dkaPromptContext, {
  specialty: "Endocrinology consult",
  maxCandidates: 12,
  validatedIntents: dkaPromptIntents
});
assert.ok(promptReplacement.prompt.includes("<retrieved_evidence_candidates>"), "prompt should include retrieved evidence candidates");
assert.ok(!promptReplacement.prompt.includes("<student_exam_reference>"), "evidence prompt should replace legacy student exam reference");
assert.ok(promptReplacement.prompt.includes("not permission to invent unvalidated final checklist rows"), "prompt should describe retrieved candidates as reviewer-visible evidence context");
assert.ok(promptReplacement.prompt.includes("catalog gap for app-side review"), "prompt should route missing items to gap review instead of final rows");
assert.equal(promptReplacement.success, true, "prompt replacement should report successful evidence injection");
assert.ok(promptReplacement.prompt.includes("Return exactly two parent checklists"), "format contract should remain intact");
const dkaRecommendedPromptCandidateIds = new Set([
  ...promptReplacement.recommendation.focusedHistoryQuestions,
  ...promptReplacement.recommendation.corePhysicalExamManeuvers,
  ...promptReplacement.recommendation.conditionalPhysicalExamManeuvers
].map((entry) => entry.candidate?.exam_id || entry.exam_id || entry.id).filter(Boolean));
assert.ok(
  promptReplacement.promptCandidates.every((candidate) => dkaRecommendedPromptCandidateIds.has(candidate.exam_id)),
  "evidence prompt should include local recommended question/exam candidates, not every raw ranked audit candidate"
);
assert.ok(
  promptReplacement.promptCandidates.some((candidate) => candidate.item_type === "history_question"),
  "evidence prompt should include separately modeled focused history question candidates"
);
assert.ok(
  promptReplacement.prompt.includes("item type: history_question")
    && promptReplacement.prompt.includes("exam: none"),
  "history question candidates should be labeled as questions rather than masquerading as exam rows"
);
assert.ok(
  promptReplacement.promptCandidates.every((candidate) => !["safety_check", "diagnostic_test", "reference_threshold", "red_flag", "management_change"].includes(String(candidate.item_type || "").toLowerCase())),
  "evidence prompt should exclude safety checks, diagnostic tests, red flags, and management rules from final checklist candidates"
);
assert.ok(
  promptReplacement.promptCandidates.every((candidate) => !/^GAP-/i.test(candidate.exam_id || "") && candidate.traceability?.authorized_by !== "staged_catalog_gap"),
  "evidence prompt should exclude staged catalog gaps even when they carry question text"
);
assert.ok(
  promptReplacement.promptCandidates.every((candidate) => !/blood pressure|heart rate|respiratory rate|temperature|oxygen saturation|bedside glucose|point-of-care glucose/i.test(`${candidate.examLabel || ""} ${candidate.maneuver || ""}`)),
  "routine safety basics should stay outside the physical-exam candidate prompt"
);

const blockedPromptReplacement = buildEvidencePromptReplacement(prompt, {
  catalog,
  tagRows,
  sourceRows,
  overlayRows,
  baseRows
}, "unsupported free text concern without selected validated intent", {
  specialty: "General medicine",
  maxCandidates: 12
});
assert.equal(blockedPromptReplacement.success, false, "prompt replacement should not inject evidence without a validated intent");
assert.equal(blockedPromptReplacement.blocked, true, "prompt replacement should expose a blocked unsupported state");
assert.match(blockedPromptReplacement.blockedReason, /No validated clinical intent/i, "blocked prompt should explain validated-intent requirement");
assert.equal(blockedPromptReplacement.prompt, prompt, "blocked prompt replacement should leave the original prompt untouched");
assert.equal(blockedPromptReplacement.evidenceBlock, "", "blocked prompt replacement should not include retrieved evidence candidates");
assert.equal(blockedPromptReplacement.promptCandidates.length, 0, "blocked prompt replacement should not expose prompt candidates");

const jvpCandidate = catalog.find((candidate) => candidate.examLabel === "JVP");
assert.ok(jvpCandidate, "catalog should contain JVP candidate");
const match = matchEvidenceForChecklistItem({ label: "JVP" }, [jvpCandidate]);
assert.equal(match?.exam_id, jvpCandidate.exam_id, "metadata matcher should match checklist label to candidate");

let reviewState = normalizeEvidenceReviewState();
reviewState = updateEvidenceReviewState(reviewState, jvpCandidate.exam_id, { status: "accepted" });
const exported = exportEvidenceReviewState(reviewState);
assert.ok(exported.includes(jvpCandidate.exam_id), "review export should include accepted item");
const imported = importEvidenceReviewState(exported);
assert.equal(imported.items[jvpCandidate.exam_id].status, "accepted", "review import should preserve status");
assert.equal(evidenceReviewContainsPhiLikeContent(imported), false, "review export should not contain obvious PHI-like fields");

console.log("Evidence overlay tests passed.");
