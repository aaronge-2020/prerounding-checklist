import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auditChecklistForCase,
  evaluateRetrievalSuite,
  formatEvaluationReport,
  loadEvaluationFixtures,
  writeEvaluationReport
} from "./evidence-eval.js";

const fixtures = loadEvaluationFixtures();
const suite = evaluateRetrievalSuite(fixtures);

assert.ok(fixtures.caseRows.length >= 120, "evaluation cases should cover the 100 complaints plus diagnostic variants");
assert.equal(fixtures.goldRows.length, fixtures.caseRows.length, "every evaluation case should have a gold row");
assert.ok(suite.recommendationPassRate >= 0.95, `recommended checklist recall too low: ${suite.recommendationPassRate}`);
assert.ok(suite.retrievalPassRate >= 0.98, `full retrieved-set recall too low: ${suite.retrievalPassRate}`);
assert.ok(suite.recommendedCoreLabelCoverageRate >= 0.75, `recommended core label coverage too low: ${suite.recommendedCoreLabelCoverageRate}`);
assert.equal(suite.recommendationAvoidHitCases, 0, "recommended checklists should have zero avoid-list hits");
assert.ok(suite.failures.length === 0, formatEvaluationReport(suite));
const safetyLabelPattern = /\b(?:blood pressure|heart rate|respiratory rate|temperature|bedside glucose|pregnancy|oxygen saturation|spo2|weight|bmi|orthostatic)\b/i;
suite.results.forEach((result) => {
  assert.ok(
    result.recommendedCore.every((entry) => !safetyLabelPattern.test(entry.label || "")),
    `${result.caseId}: physical-exam core recommendations should not contain safety/basic bedside data`
  );
  assert.ok(
    result.recommendedConditional.every((entry) => !safetyLabelPattern.test(entry.label || "")),
    `${result.caseId}: conditional physical-exam recommendations should not contain safety/basic bedside data`
  );
});
assert.ok(
  suite.results
    .filter((result) => result.coverageGap)
    .every((result) => result.expectedInValidatedGaps.length > 0 || result.coreOrAcceptableInRecommended.length > 0),
  "coverage-gap cases should be visibly covered by validated gap items or recommended acceptable substitutes"
);
assert.equal(
  suite.registeredGapCoveredCases,
  suite.coverageGapCases,
  "every active catalog coverage-gap case should have registered staged gap metadata"
);
assert.ok(
  suite.results
    .filter((result) => result.coverageGap)
    .every((result) => result.unregisteredCatalogGaps.length === 0),
  "active catalog gap recommendations must be registered for reviewer audit"
);
assert.ok(
  suite.results
    .filter((result) => result.coverageGap)
    .flatMap((result) => result.registeredCatalogGaps)
    .every((gap) => gap.review_status && gap.review_owner && gap.last_reviewed && gap.planned_resolution),
  "registered catalog gaps should expose review status owner date and planned resolution"
);

const requiredCases = [
  "dx_dka_hhs",
  "dx_suspected_pe",
  "dx_acs",
  "dx_stroke",
  "dx_appendicitis",
  "dx_sepsis",
  "dx_cord_compression",
  "cv_chest_pain",
  "cv_shortness_breath",
  "gi_abdominal_pain",
  "neuro_headache",
  "gu_dysuria",
  "id_fever"
];
const caseIds = new Set(fixtures.caseRows.map((row) => row.case_id));
requiredCases.forEach((caseId) => {
  assert.ok(caseIds.has(caseId), `missing required evaluation case ${caseId}`);
});

const dkaResult = suite.results.find((result) => result.caseId === "dx_dka_hhs");
assert.ok(dkaResult.coreInRecommended.some((label) => /blood pressure|respiratory rate|mouth|jvp|abdominal/i.test(label)), "DKA case should recommend volume/vitals/abdominal findings");
assert.ok(dkaResult.coreOrAcceptableInRetrieved.some((label) => /respiratory rate|mouth|jvp|abdominal|radial/i.test(label)), "DKA case should keep comprehensive volume/respiratory/abdominal candidates available");
assert.equal(dkaResult.avoidHitsRecommended.length, 0, "DKA recommendation should avoid unrelated maneuvers");

const peResult = suite.results.find((result) => result.caseId === "dx_suspected_pe");
assert.ok(peResult.coreInRecommended.some((label) => /respiratory rate|posterior lung sounds|heart sounds|jvp|edema|blood pressure/i.test(label)), "suspected PE case should recommend cardiopulmonary and DVT-relevant findings");
assert.equal(peResult.avoidHitsRecommended.length, 0, "suspected PE should avoid irrelevant abdominal/neuro maneuvers in the recommendation");

const tremorResult = suite.results.find((result) => result.caseId === "neuro_tremors");
assert.ok(tremorResult.selectedIntentIds.includes("hypoglycemia_jittery_v1"), "tremor/palpitations should route to the adrenergic thyroid-aware intent, not generic stroke");
assert.ok(tremorResult.coreOrAcceptableInRecommended.length > 0, "tremor workup should include structured adrenergic/thyroid or focused neuro safety matches");

const eyeRednessResult = suite.results.find((result) => result.caseId === "id_eye_redness");
assert.ok(eyeRednessResult.selectedIntentIds.includes("eye_redness_vision_v1"), "eye redness should resolve to the focused eye/vision intent");
assert.ok(eyeRednessResult.coreOrAcceptableInRecommendedPhysicalExam.some((label) => /sclerae|visual acuity|pupils/i.test(label)), "eye redness should recommend focused eye exam maneuvers");

const incontinenceResult = suite.results.find((result) => result.caseId === "gu_incontinence");
assert.ok(incontinenceResult.selectedIntentIds.includes("spine_cord_compression_v1"), "incontinence with back pain/neuro symptoms should route to the spine/cord red-flag intent");
assert.ok(incontinenceResult.coreOrAcceptableInRecommendedPhysicalExam.some((label) => /saddle sensation|extremity light touch|patellar reflex|babinski/i.test(label)), "incontinence with neuro symptoms should include cord/neuro exam coverage");

const dkaChecklist = `BEDSIDE QUESTION CHECKLIST
SYMPTOM TRAJECTORY
Are you still feeling very thirsty or urinating more than usual?: No / Yes / Other ___

TARGETED PHYSICAL EXAM CHECKLIST
VITAL SIGNS AND VOLUME
Blood pressure: Normal / Low / High
Respiratory rate: Normal / High / Low
Mouth exam: Moist / Dry / Other ___
ABDOMINAL EXAM
Abdominal palpation: Nontender / Tender / Guarding`;

const dkaAudit = auditChecklistForCase({
  caseId: "dx_dka_hhs",
  checklistText: dkaChecklist,
  fixtures
});
assert.ok(dkaAudit.includedExpected.length > 0, "paste-back audit should recognize expected DKA maneuvers");
assert.equal(dkaAudit.untraceable.length, 0, "paste-back audit should trace DKA checklist rows to retrieved candidates");

const peChecklist = `BEDSIDE QUESTION CHECKLIST
SYMPTOM TRAJECTORY
Is your breathing better or worse today?: Better / Same / Worse / Other ___

TARGETED PHYSICAL EXAM CHECKLIST
VITAL SIGNS
Respiratory rate: Normal / High / Low
Blood pressure: Normal / Low / High
CARDIOPULMONARY EXAM
Posterior lung sounds: Clear / Crackles / Wheezes / Diminished
Heart sounds: Regular / Irregular / Murmur / Gallop
VASCULAR EXAM
Lower extremity edema: Absent / Present unilateral / Present bilateral`;

const peAudit = auditChecklistForCase({
  caseId: "dx_suspected_pe",
  checklistText: peChecklist,
  fixtures
});
assert.ok(peAudit.includedExpected.length > 0, "paste-back audit should recognize expected PE maneuvers");
assert.equal(peAudit.untraceable.length, 0, "paste-back audit should trace PE checklist rows to retrieved candidates");

const badPeChecklist = `BEDSIDE QUESTION CHECKLIST
SYMPTOM TRAJECTORY
Is your breathing worse?: No / Yes / Other ___

TARGETED PHYSICAL EXAM CHECKLIST
ABDOMINAL EXAM
Murphy sign: Negative / Positive
NEURO EXAM
Visual acuity: Intact / Reduced`;

const badPeAudit = auditChecklistForCase({
  caseId: "dx_suspected_pe",
  checklistText: badPeChecklist,
  fixtures
});
assert.ok(badPeAudit.untraceable.length > 0 || badPeAudit.avoidHits.length > 0 || badPeAudit.missedCore.length > 0, "paste-back audit should flag unrelated PE checklist maneuvers");

const scratch = mkdtempSync(join(tmpdir(), "evidence-eval-"));
try {
  const reportPath = join(scratch, "report.md");
  writeEvaluationReport(reportPath, suite);
  const reportText = readFileSync(reportPath, "utf8");
  assert.ok(reportText.includes("Evidence Evaluation Report"), "report writer should emit a compact report");
  assert.ok(!/chart_context|raw note|patient name/i.test(reportText), "reports should avoid raw chart text and obvious PHI labels");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`Evidence evaluation tests passed for ${suite.totalCases} cases with ${suite.coverageGapCases} catalog coverage gaps.`);
