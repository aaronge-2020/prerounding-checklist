import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildClinicalIntentRetrievalContext,
  buildValidatedClinicalIntentPromptBlock,
  clinicalIntentRegistry,
  filterEvidenceCatalogForClinicalIntents,
  getClinicalIntentById,
  resolveClinicalIntents,
  selectedValidatedClinicalIntents,
  validateClinicalIntentRegistry
} from "../clinical-intents.js";
import {
  buildRecommendedExamChecklist,
  joinEvidenceCatalog,
  mergeLegacyPhysicalExamOverlay,
  parseCsv,
  rankEvidenceCandidates
} from "../evidence.js";

const registryAudit = validateClinicalIntentRegistry(clinicalIntentRegistry);
assert.ok(registryAudit.ok, registryAudit.issues.join("\n"));

function topIntent(query) {
  return resolveClinicalIntents(query, clinicalIntentRegistry).validatedMatches[0]?.intent_id || "";
}

assert.equal(topIntent("belly cramps after eating"), "abdominal_pain_cramping_v1");
assert.equal(topIntent("burning pee with fever"), "gu_renal_dysuria_v1");
assert.equal(topIntent("can't breathe lying flat"), "dyspnea_hf_v1");
assert.equal(topIntent("face droop and aphasia"), "stroke_focal_neuro_v1");
assert.equal(topIntent("black stool and dizziness"), "bleeding_anemia_v1");

const unsupported = resolveClinicalIntents("purple fingernails after eating mango while juggling");
assert.equal(unsupported.unsupported, true, "unsupported free text should not authorize recommendations");
assert.equal(unsupported.validatedMatches.length, 0, "unsupported free text should have no validated match");

const ambiguous = resolveClinicalIntents("chest pain with dyspnea and unilateral leg swelling");
assert.ok(ambiguous.validatedMatches.length >= 2, "ambiguous cardiopulmonary text should require picking from multiple intents");
assert.equal(ambiguous.requiresSelection, true, "resolver should not auto-authorize ambiguous text");

const selected = selectedValidatedClinicalIntents(["dka_hhs_v1", "missing_intent"]);
assert.equal(selected.length, 1);
assert.equal(selected[0].intent_id, "dka_hhs_v1");

const context = buildClinicalIntentRetrievalContext(
  [getClinicalIntentById("dka_hhs_v1")],
  "vomiting, tachypnea, dehydration",
  "Endocrinology consult",
  "Adult"
);
assert.match(context, /intent_id: dka_hhs_v1/);
assert.match(context, /patient modifiers: vomiting/);

const promptBlock = buildValidatedClinicalIntentPromptBlock(selected, "vomiting", []);
assert.match(promptBlock, /<validated_clinical_intents>/);
assert.match(promptBlock, /dka_hhs_v1/);
assert.match(promptBlock, /<patient_modifiers>/);
assert.doesNotMatch(promptBlock, /John Smith|DOB|MRN/i);

const baseRows = parseCsv(readFileSync("exam_technique_base.csv", "utf8"));
const overlayRows = parseCsv(readFileSync("exam_evidence_overlay.csv", "utf8"));
const legacyRows = parseCsv(readFileSync("physical_exam_evidence_overlay.csv", "utf8"));
const sourceRows = parseCsv(readFileSync("source_registry.csv", "utf8"));
const tagRows = parseCsv(readFileSync("retrieval_tag_dictionary.csv", "utf8"));
const catalog = joinEvidenceCatalog(baseRows, mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyRows), sourceRows);
const dkaCatalog = filterEvidenceCatalogForClinicalIntents(catalog, selected);
assert.ok(dkaCatalog.some((candidate) => /blood pressure/i.test(candidate.examLabel || "")), "DKA intent should allow vital signs");
assert.ok(dkaCatalog.some((candidate) => /abdominal palpation/i.test(candidate.examLabel || "")), "DKA intent should allow abdominal exam");
assert.equal(
  dkaCatalog.filter((candidate) => /visual acuity/i.test(candidate.examLabel || "")).length,
  0,
  "DKA intent filter should not allow unrelated visual acuity rows"
);

const abdominalIntent = selectedValidatedClinicalIntents(["abdominal_pain_cramping_v1"]);
const abdominalContext = buildClinicalIntentRetrievalContext(
  abdominalIntent,
  "",
  "General medicine",
  "Adult"
);
const abdominalCatalog = filterEvidenceCatalogForClinicalIntents(catalog, abdominalIntent);
const abdominalRanked = rankEvidenceCandidates(abdominalCatalog, abdominalContext, tagRows, {
  maxCandidates: 80,
  specialty: "General medicine"
});
const abdominalRecommendation = buildRecommendedExamChecklist(abdominalContext, abdominalRanked, {
  specialty: "General medicine",
  maxCoreItems: 24,
  maxConditionalItems: 36
});
assert.deepEqual(
  abdominalRecommendation.activeProfiles.map((profile) => profile.id),
  ["abdominal_gi"],
  "validated abdominal intent should activate only its declared clinical bundle"
);
const abdominalCoreText = abdominalRecommendation.coreItems
  .map((entry) => `${entry.label} ${entry.domain} ${entry.reason}`)
  .join(" | ");
assert.match(abdominalCoreText, /abdominal palpation|abdominal inspection|bowel sounds/i);
assert.doesNotMatch(abdominalCoreText, /Mouth exam/i, "abdominal cramps should not promote volume/renal mouth exam to core without dehydration modifier");
assert.doesNotMatch(abdominalCoreText, /sepsis physiology/i, "abdominal cramps should not inherit sepsis rationale without a sepsis intent");

console.log("Clinical intent tests passed.");
