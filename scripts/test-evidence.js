import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRecommendedExamChecklist,
  buildEvidencePromptReplacement,
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
  updateEvidenceReviewState,
  validateEvidenceOverlayRows
} from "../evidence.js";

const baseRows = parseCsv(readFileSync("exam_technique_base.csv", "utf8"));
const currentRows = parseCsv(readFileSync("physical_exam_reference.csv", "utf8"));
const overlayRows = parseCsv(readFileSync("exam_evidence_overlay.csv", "utf8"));
const legacyOverlayRows = parseCsv(readFileSync("physical_exam_evidence_overlay.csv", "utf8"));
const tagRows = parseCsv(readFileSync("retrieval_tag_dictionary.csv", "utf8"));
const queueRows = parseCsv(readFileSync("priority_enrichment_queue.csv", "utf8"));
const sourceRows = parseCsv(readFileSync("source_registry.csv", "utf8"));
const sourceIds = new Set(sourceRows.map((row) => row.source_id));
const mergedOverlayRows = mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows);
const catalog = joinEvidenceCatalog(baseRows, mergedOverlayRows, sourceRows);

assert.deepEqual(baseRows, currentRows, "exam_technique_base.csv must preserve the current maneuver catalog exactly");

const overlayAudit = validateEvidenceOverlayRows(overlayRows);
assert.ok(overlayAudit.ok, overlayAudit.issues.map((issue) => issue.message).join("\n"));
assert.ok(overlayRows.length >= 75 && overlayRows.length <= 100, "first overlay wave should contain 75 to 100 rows");
assert.ok(mergedOverlayRows.length >= overlayRows.length, "legacy physical overlay should supplement the requested evidence overlay");
assert.ok(queueRows.length >= 75 && queueRows.length <= 100, "priority queue should contain 75 to 100 rows");

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

const adrenalTags = extractEvidenceTags("Adrenal insufficiency with hypotension and hydrocortisone need.", tagRows).map((match) => match.tag);
assert.ok(adrenalTags.includes("adrenal_insufficiency"), "adrenal context should match adrenal insufficiency");
assert.ok(!adrenalTags.includes("AKI"), "single-word renal trigger should not match inside adrenal");
const stomachCrampTags = extractEvidenceTags(expandEvidenceContextText("Stomach cramps after dinner."), tagRows).map((match) => match.tag);
assert.ok(stomachCrampTags.includes("abdominal_pain"), "lay term stomach cramps should expand to abdominal pain evidence tags");

queueRows.forEach((row) => {
  assert.ok(overlayIds.has(row.exam_id), `${row.exam_id} in priority queue should exist in overlay`);
});

const mergedVisualAcuity = catalog.find((candidate) => candidate.base?.exam_id === "neuro_cranial_nerves_cn_ii_visual_acuity");
assert.ok(mergedVisualAcuity, "merged catalog should include visual acuity");
assert.ok(
  /merck|johns hopkins|neurological exam/i.test(`${mergedVisualAcuity.evidence_source_primary} ${mergedVisualAcuity.source_citation}`),
  "updated physical_exam_evidence_overlay.csv should feed the merged retrieval catalog"
);

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
  const entries = includeConditional
    ? [...recommendation.coreItems, ...recommendation.conditionalItems]
    : recommendation.coreItems;
  return entries.map((entry) => `${entry.label} ${entry.candidate?.maneuver || ""} ${entry.domain || ""}`.toLowerCase());
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
  [/blood pressure/, /respiratory rate/, /mouth exam/, /jvp/, /abdominal palpation/],
  "DKA/HHS recommendation"
);
assert.ok(
  [/blood pressure/, /respiratory rate/, /mouth exam/, /jvp/, /abdominal palpation/]
    .filter((pattern) => recommendationLabels(dkaRecommendation).some((label) => pattern.test(label))).length >= 4,
  "DKA/HHS recommendation should cover vitals, respiratory/volume, mucosa, and abdomen"
);
assert.ok(
  dkaRecommendation.coreItems.some((entry) => /respiratory rate/i.test(entry.label) && /Kussmaul|hyperglycemic-crisis/i.test(entry.displayDiagnosticTarget || "")),
  "DKA/HHS respiratory rate should display a DKA-specific diagnostic target"
);
assert.ok(
  dkaRecommendation.coreItems.some((entry) => /abdominal palpation|bowel sounds/i.test(entry.label) && /DKA|precipitating abdominal/i.test(entry.displayDiagnosticTarget || "")),
  "DKA/HHS abdominal items should display DKA-specific abdominal rationale"
);
assertRecommendedExcludes(
  "Endocrinology consult for T1DM admitted with DKA, anion gap acidosis, vomiting, dehydration, insulin drip, poor PO intake, and AKI.",
  [/pmi/, /vibration sense/, /ophthalmoscopic/, /visual acuity/],
  "DKA/HHS recommendation"
);

const peRecommendation = assertRecommendedIncludes(
  "Suspected pulmonary embolism with pleuritic chest pain, dyspnea, tachycardia, hypoxia, and unilateral leg swelling.",
  [/respiratory rate/, /posterior lung sounds/, /heart sounds/, /jvp/, /lower extremity edema/, /blood pressure/],
  "suspected PE recommendation"
);
assert.ok(
  [/respiratory rate/, /posterior lung sounds/, /heart sounds/, /jvp/, /lower extremity edema/, /blood pressure/]
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
  [/abdominal inspection/, /abdominal palpation/, /bowel sounds/, /blood pressure/, /heart rate/],
  "stomach cramps recommendation"
);
assert.ok(
  [/abdominal inspection/, /abdominal palpation/, /bowel sounds/]
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
  [/abdominal inspection/, /abdominal palpation/, /bowel sounds/]
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
  [/jvp/, /pmi/, /radial pulses/, /pronator drift/, /facial symmetry/, /abdominal palpation/, /bowel sounds/]
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
  [/facial symmetry/, /eye closure/, /pronator drift/],
  "face weakness recommendation"
);
assert.ok(
  [/facial symmetry/, /eye closure/].some((pattern) => recommendationLabels(faceWeaknessRecommendation, false).some((label) => pattern.test(label))),
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
  [/jvp/, /lower extremity edema/, /posterior lung sounds/, /heart sounds/, /blood pressure/, /respiratory rate/],
  "dyspnea/HF recommendation"
);
assert.ok(
  [/jvp/, /lower extremity edema/, /posterior lung sounds/, /heart sounds/, /blood pressure/, /respiratory rate/]
    .filter((pattern) => recommendationLabels(heartFailureRecommendation).some((label) => pattern.test(label))).length >= 5,
  "dyspnea/HF recommendation should prioritize volume, lung, cardiac, BP, and respiratory items"
);

assertRecommendedIncludes(
  "Eye redness with discharge, photophobia, eye pain, and blurry vision.",
  [/visual acuity/, /pupils/, /extraocular/, /sclerae and conjunctivae/],
  "eye redness recommendation"
);
assertRecommendedExcludes(
  "Eye redness with discharge, photophobia, eye pain, and blurry vision.",
  [/murphy/, /cva tenderness/, /posterior lung sounds/, /bowel sounds/],
  "eye redness recommendation"
);

const prompt = "<student_exam_reference>\nlegacy\n</student_exam_reference>\n<format_contract>\nReturn exactly two parent checklists.";
const promptReplacement = buildEvidencePromptReplacement(prompt, {
  catalog,
  tagRows,
  sourceRows,
  overlayRows,
  baseRows
}, "Endocrinology consult DKA with dehydration and AKI.", {
  specialty: "Endocrinology consult",
  maxCandidates: 12
});
assert.ok(promptReplacement.prompt.includes("<retrieved_evidence_candidates>"), "prompt should include retrieved evidence candidates");
assert.ok(!promptReplacement.prompt.includes("<student_exam_reference>"), "evidence prompt should replace legacy student exam reference");
assert.ok(promptReplacement.prompt.includes("starting point, not an exclusive list"), "prompt should describe retrieved candidates as prioritized guidance");
assert.ok(promptReplacement.prompt.includes("add any missing bedside-feasible exam maneuvers"), "prompt should ask OpenEvidence to identify clinically important gaps");
assert.ok(promptReplacement.prompt.includes("Return exactly two parent checklists"), "format contract should remain intact");

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
