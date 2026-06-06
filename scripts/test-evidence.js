import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildEvidencePromptReplacement,
  evidenceReviewContainsPhiLikeContent,
  exportEvidenceReviewState,
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
assert.ok(promptReplacement.prompt.includes("Use only the retrieved candidate labels"), "prompt should constrain candidate use");
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
