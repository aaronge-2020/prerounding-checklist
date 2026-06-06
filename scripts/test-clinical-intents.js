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
assert.equal(topIntent("thyroid storm with fever and agitation"), "thyroid_crisis_v1");
assert.equal(topIntent("routine thyroid disease evaluation"), "routine_thyroid_disease_v1");
assert.equal(topIntent("Graves disease palpitations heat intolerance"), "routine_thyroid_disease_v1");

const routineGraves = resolveClinicalIntents("Graves disease palpitations heat intolerance");
assert.equal(routineGraves.validatedMatches[0]?.intent_id, "routine_thyroid_disease_v1", "routine Graves disease should authorize the routine thyroid intent");
assert.equal(routineGraves.unsupported, false, "routine thyroid disease should be an active validated intent");
assert.ok(
  !routineGraves.validatedMatches.some((intentRow) => intentRow.intent_id === "thyroid_crisis_v1"),
  "routine Graves disease should not auto-authorize the thyroid crisis intent"
);

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

const baseRows = parseCsv(readFileSync("data/evidence/exam_technique_base.csv", "utf8"));
const overlayRows = parseCsv(readFileSync("data/evidence/exam_evidence_overlay.csv", "utf8"));
const legacyRows = parseCsv(readFileSync("data/physical-exam/physical_exam_evidence_overlay.csv", "utf8"));
const sourceRows = parseCsv(readFileSync("data/evidence/source_registry.csv", "utf8"));
const tagRows = parseCsv(readFileSync("data/evidence/retrieval_tag_dictionary.csv", "utf8"));
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
const abdominalConditionalText = abdominalRecommendation.conditionalItems
  .map((entry) => `${entry.label} ${entry.domain} ${entry.reason}`)
  .join(" | ");
assert.doesNotMatch(abdominalConditionalText, /Lower extremity edema|Otoscope|nodes|fremitus|JVP/i, "abdominal cramps should not show broad tag-only add-ons");

const abdominalDehydrationContext = buildClinicalIntentRetrievalContext(
  abdominalIntent,
  "vomiting, poor intake or dehydration",
  "General medicine",
  "Adult"
);
const abdominalDehydrationRanked = rankEvidenceCandidates(abdominalCatalog, abdominalDehydrationContext, tagRows, {
  maxCandidates: 80,
  specialty: "General medicine"
});
const abdominalDehydrationRecommendation = buildRecommendedExamChecklist(abdominalDehydrationContext, abdominalDehydrationRanked, {
  specialty: "General medicine",
  maxCoreItems: 24,
  maxConditionalItems: 36
});
assert.match(
  abdominalDehydrationRecommendation.conditionalItems.map((entry) => entry.label).join(" | "),
  /Mouth exam/i,
  "dehydration/vomiting modifier should activate hydration add-ons for abdominal pain"
);

const heartFailureIntent = selectedValidatedClinicalIntents(["dyspnea_hf_v1"]);
const heartFailureContext = buildClinicalIntentRetrievalContext(
  heartFailureIntent,
  "",
  "General medicine",
  "Adult"
);
const heartFailureCatalog = filterEvidenceCatalogForClinicalIntents(catalog, heartFailureIntent);
const heartFailureRanked = rankEvidenceCandidates(heartFailureCatalog, heartFailureContext, tagRows, {
  maxCandidates: 80,
  specialty: "General medicine"
});
const heartFailureRecommendation = buildRecommendedExamChecklist(heartFailureContext, heartFailureRanked, {
  specialty: "General medicine",
  maxCoreItems: 24,
  maxConditionalItems: 36
});
assert.deepEqual(
  heartFailureRecommendation.activeProfiles.map((profile) => profile.id),
  ["dyspnea_hf"],
  "validated dyspnea/HF intent should activate only its declared bundle"
);
const heartFailureCoreLabels = heartFailureRecommendation.coreItems.map((entry) => entry.label).join(" | ");
assert.match(heartFailureCoreLabels, /Respiratory rate|Blood pressure|Heart rate/i);
assert.match(heartFailureCoreLabels, /Posterior lung sounds|Lateral lung sounds|Anterior lung sounds|thorax inspection/i);
assert.match(heartFailureCoreLabels, /JVP|Lower extremity edema|Heart sounds|Radial pulses/i);
const heartSoundsEntry = heartFailureRecommendation.coreItems.find((entry) => /Heart sounds/i.test(entry.label));
assert.ok(heartSoundsEntry, "HF/dyspnea should include heart sounds when volume/cardiac bundle is selected");
assert.doesNotMatch(heartSoundsEntry.displayDiagnosticTarget || "", /focal consolidation|effusion|wheeze/i, "heart sounds should not inherit pulmonary diagnostic target");
assert.doesNotMatch(
  heartFailureRecommendation.conditionalItems.map((entry) => entry.label).join(" | "),
  /Aortic area|Pulmonic area|Tricuspid area|Mitral area/i,
  "HF/dyspnea should not show individual valve-area cards unless murmur/valve modifier is present"
);

const routineThyroidIntent = selectedValidatedClinicalIntents(["routine_thyroid_disease_v1"]);
const routineThyroidContext = buildClinicalIntentRetrievalContext(
  routineThyroidIntent,
  "Graves disease palpitations heat intolerance eye irritation",
  "Endocrinology consult",
  "Adult"
);
const routineThyroidCatalog = filterEvidenceCatalogForClinicalIntents(catalog, routineThyroidIntent);
const routineThyroidRanked = rankEvidenceCandidates(routineThyroidCatalog, routineThyroidContext, tagRows, {
  maxCandidates: 80,
  specialty: "Endocrinology consult"
});
const routineThyroidRecommendation = buildRecommendedExamChecklist(routineThyroidContext, routineThyroidRanked, {
  specialty: "Endocrinology consult",
  maxCoreItems: 24,
  maxConditionalItems: 36
});
assert.deepEqual(
  routineThyroidRecommendation.activeProfiles.map((profile) => profile.id),
  ["routine_thyroid"],
  "routine thyroid intent should activate the routine thyroid bundle, not the thyroid-crisis bundle"
);
const routineThyroidCoreText = routineThyroidRecommendation.coreItems.map((entry) => `${entry.label} ${entry.domain} ${entry.reason}`).join(" | ");
assert.match(routineThyroidCoreText, /Blood pressure|Heart rate/i, "routine thyroid should include HR/BP vitals");
assert.match(routineThyroidCoreText, /Thyroid exam/i, "routine thyroid should include thyroid inspection/palpation");
assert.match(routineThyroidCoreText, /Heart sounds|Radial pulses/i, "Graves with palpitations should include rhythm/perfusion exam");
assert.doesNotMatch(routineThyroidCoreText, /JVP|PMI|Vibration sense|CVA tenderness/i, "routine Graves should not promote unrelated volume, neuro, or GU maneuvers");
const routineThyroidConditionalText = routineThyroidRecommendation.conditionalItems.map((entry) => entry.label).join(" | ");
assert.match(routineThyroidConditionalText, /Pupils|Extraocular movements|Visual acuity|Visual fields/i, "Graves with eye symptoms should include orbitopathy/vision add-ons");

console.log("Clinical intent tests passed.");
