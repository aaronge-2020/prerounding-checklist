import assert from "node:assert/strict";
import { createDeidentifier, deidentifyTextStructuredOnly, modelPredictionsToEntities, scanResidualPhi } from "../deid.js";
import { assertDeidCase } from "./deid-adversarial.js";
import { clinicalGuardTerms, makeAdversarialCases, makeDemoLikeCase, makeSyntheticCases } from "./deid-fixtures.js";

function countNeedle(text, needle) {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let start = 0;
  while (start < text.length) {
    const index = text.indexOf(needle, start);
    if (index === -1) {
      break;
    }
    count += 1;
    start = index + needle.length;
  }
  return count;
}

function leakedForbidden(caseItem, redactedText) {
  return caseItem.forbidden
    .filter((value) => countNeedle(redactedText, value) > 0)
    .sort();
}

function assertCaseClean(caseItem) {
  const result = deidentifyTextStructuredOnly(caseItem.text);
  const leaks = leakedForbidden(caseItem, result.text);
  assert.deepEqual(leaks, [], `${caseItem.id} leaked forbidden strings: ${leaks.join(", ")}`);

  for (const snippet of caseItem.requiredSnippets) {
    assert.ok(result.text.includes(snippet), `${caseItem.id} missing readable snippet: ${snippet}`);
  }

  for (const term of caseItem.clinicalTerms) {
    assert.ok(result.text.includes(term), `${caseItem.id} redacted clinical guard term: ${term}`);
  }

  const highResiduals = result.residualWarnings.filter((warning) => warning.severity === "high");
  assert.deepEqual(highResiduals, [], `${caseItem.id} left high-risk residual warnings.`);
  const medicalTermWarnings = result.residualWarnings.filter((warning) => (
    caseItem.clinicalTerms.some((term) => warning.snippet?.toLowerCase().includes(term.toLowerCase()))
  ));
  assert.deepEqual(medicalTermWarnings, [], `${caseItem.id} flagged protected medical terms as names.`);
  return result;
}

const demo = makeDemoLikeCase();
const demoResult = assertCaseClean(demo);
assert.ok(!demoResult.text.includes("John Smith"), "demo should redact repeated patient name");
assert.ok(!demoResult.text.includes("Mary Smith"), "demo should redact repeated contact name");
assert.ok(!demoResult.text.includes("Emily Johnson"), "demo should redact provider name");
assert.ok(demoResult.text.includes("Patient Name: [PATIENT NAME]"), "demo should keep the patient header readable");
assert.ok(demoResult.text.includes("Primary endocrinologist: [PROVIDER NAME]"), "demo should keep the provider header readable");

const cases = makeSyntheticCases(250);
for (const caseItem of cases) {
  assertCaseClean(caseItem);
}

const adversarialName = `One-line summary: Ms. Sita Gerrill-Stevenson is a 57 y.o. female.
Overall Assessment:
Ms Merrill-Stevenson is a 57-year-old woman admitted for work-up.
Plan: follow up with Ms. Gerrill-Stevenson after discharge. Gerrill-Stevenson will call.`;
const adversarialResult = deidentifyTextStructuredOnly(adversarialName);
for (const leak of ["Sita Gerrill-Stevenson", "Ms Merrill-Stevenson", "Ms. Gerrill-Stevenson", "Gerrill-Stevenson"]) {
  assert.ok(!adversarialResult.text.includes(leak), `identity alias should be redacted: ${leak}`);
}

const medicalFalsePositiveText = `Provider Referral
Abnormal Labs
#Atypical Chest Pain, resolved
#Chronic Pain
- Home Escitalopram 40mg daily
# Diet: Heart Healthy
Last Reading 24-Hour Range
Pulmonary Toilet
Bowel Management
Fall Risk
Suicide Risk
Elopement Risk
Elopmement Risk
Daily Labs
Summary Situational Awareness Action
Immature Grans (Abs): 0.01
Nora W. Abrahimi`;
const medicalFalsePositiveResult = deidentifyTextStructuredOnly(medicalFalsePositiveText);
for (const term of ["Provider Referral", "Abnormal Labs", "Atypical Chest", "Chronic Pain", "Home Escitalopram", "Heart Healthy", "Last Reading", "Hour Range", "Pulmonary Toilet", "Bowel Management", "Fall Risk", "Suicide Risk", "Elopement Risk", "Elopmement Risk", "Daily Labs", "Summary Situational", "Awareness Action", "Immature Grans"]) {
  assert.ok(medicalFalsePositiveResult.text.includes(term), `medical term should be preserved: ${term}`);
  assert.ok(!medicalFalsePositiveResult.residualWarnings.some((warning) => warning.snippet?.includes(term)), `medical term should not be a name warning: ${term}`);
}
assert.ok(!medicalFalsePositiveResult.text.includes("Nora W. Abrahimi"), "standalone middle-initial person name should be redacted");
assert.ok(!medicalFalsePositiveResult.residualWarnings.some((warning) => warning.snippet?.includes("Nora W. Abrahimi")), "redacted person name should not remain as residual warning");

const userReportedFalsePositiveText = `On Prednisone
CAR Echo
Add Nephrovite
Elevated Lipids
Heart Attack
DNA Amplification
RNA Amplification
PLEASE HOLD ON Day
FOR RENAL BIOPSY
Do NOT
OR HR
PRN Route
Low Blood Sugar
Sterile Water
Patient identity: Sivramiah Shantharam
Provider: Qazi Khan
Provider: Khanjan Harish Nagarsheth
Patient previously received dialysis in India.`;
const userReportedFalsePositiveResult = deidentifyTextStructuredOnly(userReportedFalsePositiveText);
for (const term of ["On Prednisone", "CAR Echo", "Add Nephrovite", "Elevated Lipids", "Heart Attack", "DNA Amplification", "RNA Amplification", "PLEASE HOLD ON Day", "FOR RENAL BIOPSY", "Do NOT", "OR HR", "PRN Route", "Low Blood Sugar", "Sterile Water", "India"]) {
  assert.ok(userReportedFalsePositiveResult.text.includes(term), `clinical/result phrase should be preserved: ${term}`);
  assert.ok(!userReportedFalsePositiveResult.residualWarnings.some((warning) => warning.snippet?.includes(term)), `clinical/result phrase should not be a residual warning: ${term}`);
  assert.ok(!userReportedFalsePositiveResult.entities.some((entity) => {
    const snippet = userReportedFalsePositiveText.slice(entity.start, entity.end);
    return snippet.includes(term);
  }), `clinical/result phrase should not be a redaction entity: ${term}`);
}
for (const leak of ["Sivramiah Shantharam", "Qazi Khan", "Khanjan Harish Nagarsheth"]) {
  assert.ok(!userReportedFalsePositiveResult.text.includes(leak), `true person name should still be redacted: ${leak}`);
}

const modelFalsePositiveText = "On Prednisone. CAR Echo. Add Nephrovite. Elevated Lipids. Heart Attack. DNA Amplification. RNA Amplification. PLEASE HOLD ON Day. FOR RENAL BIOPSY. Do NOT. OR HR. PRN Route. Low Blood Sugar. Sterile Water. Patient previously received dialysis in India. Sivramiah Shantharam saw Dr. Qazi Khan.";
const modelFalsePositivePredictions = [
  ["PATIENT", "On Prednisone"],
  ["NAME", "CAR Echo"],
  ["NAME", "Add Nephrovite"],
  ["CONTACT", "Elevated Lipids"],
  ["CONTACT", "Heart Attack"],
  ["NAME", "DNA Amplification"],
  ["NAME", "RNA Amplification"],
  ["NAME", "PLEASE HOLD ON Day"],
  ["NAME", "FOR RENAL BIOPSY"],
  ["NAME", "Do NOT"],
  ["NAME", "OR HR"],
  ["NAME", "PRN Route"],
  ["NAME", "Low Blood Sugar"],
  ["NAME", "Sterile Water"],
  ["LOCATION", "India"],
  ["PATIENT", "Sivramiah Shantharam"],
  ["DOCTOR", "Qazi Khan"]
].map(([entity_group, phrase]) => ({
  entity_group,
  start: modelFalsePositiveText.indexOf(phrase),
  end: modelFalsePositiveText.indexOf(phrase) + phrase.length,
  score: 0.99
}));
const modelFalsePositiveEntities = modelPredictionsToEntities(modelFalsePositiveText, modelFalsePositivePredictions);
for (const term of ["On Prednisone", "CAR Echo", "Add Nephrovite", "Elevated Lipids", "Heart Attack", "DNA Amplification", "RNA Amplification", "PLEASE HOLD ON Day", "FOR RENAL BIOPSY", "Do NOT", "OR HR", "PRN Route", "Low Blood Sugar", "Sterile Water", "India"]) {
  assert.ok(!modelFalsePositiveEntities.some((entity) => modelFalsePositiveText.slice(entity.start, entity.end) === term), `model false positive should be suppressed: ${term}`);
}
for (const term of ["Sivramiah Shantharam", "Qazi Khan"]) {
  assert.ok(modelFalsePositiveEntities.some((entity) => modelFalsePositiveText.slice(entity.start, entity.end) === term), `real model-detected name should be retained: ${term}`);
}

const instructionFalsePositiveText = `PLEASE HOLD ON Day
FOR RENAL BIOPSY
Do NOT
OR HR
PRN Route
Low Blood Sugar
Sterile Water`;
const instructionFalsePositiveWarnings = scanResidualPhi(instructionFalsePositiveText);
assert.deepEqual(instructionFalsePositiveWarnings, [], "clinical medication/procedure instructions must not be flagged as possible full names");

const chartChromeFalsePositiveText = `Expand All Collapse All
HOSPITAL PROGRESS NOTE: Primary Cardiology Service
CODE STATUS: CPR, Full Code
Room: C3E 54-A
Chief Complaint: Triage RFV: Provider Referral; Pain, Chest; and Abnormal Labs (K 2.5)
One-line summary: Ms. Lita Merrill-Stevenson is a 57 y.o. female.
Overall Assessment: Ms Merrill-Stevenson is a 57-year-old woman.
Active Consultants: Endocrinology, Bariatric surgery, IR
Running Hospital Course by Date
5/20/2026
Recommend FU CBC
Giving IVF
Cr. Endocrine
BP elevated
Ideally BP should be <160 systolic
Per Dr. Hu
CHG Bath
GLUCOSE BLD`;
const chartChromeResult = deidentifyTextStructuredOnly(chartChromeFalsePositiveText);
for (const term of [
  "Expand All Collapse All",
  "Primary Cardiology Service",
  "Full Code",
  "Triage RFV",
  "Endocrinology",
  "Running Hospital Course",
  "Recommend FU CBC",
  "Giving IVF",
  "Cr. Endocrine",
  "BP elevated",
  "Ideally BP",
  "CHG Bath",
  "GLUCOSE BLD"
]) {
  assert.ok(chartChromeResult.text.includes(term), `chart chrome term should be preserved: ${term}`);
  assert.ok(!chartChromeResult.residualWarnings.some((warning) => warning.snippet?.includes(term)), `chart chrome term should not be a residual warning: ${term}`);
  assert.ok(!chartChromeResult.entities.some((entity) => {
    const snippet = chartChromeFalsePositiveText.slice(entity.start, entity.end);
    return snippet.includes(term);
  }), `chart chrome term should not be a redaction entity: ${term}`);
}
assert.ok(chartChromeResult.text.includes("Room: [ROOM]"), "room should still be redacted");
assert.ok(chartChromeResult.text.includes("One-line summary: [PATIENT NAME] is a 57 y.o. female."), "patient name should still be redacted");
assert.ok(chartChromeResult.text.includes("Overall Assessment: [PATIENT NAME] is a 57-year-old woman."), "patient alias should still be redacted");
assert.ok(chartChromeResult.text.includes("Per [PROVIDER NAME]"), "provider name should still be redacted");
assert.ok(!chartChromeResult.text.includes("Lita Merrill-Stevenson"), "full patient name should not leak");
assert.ok(!chartChromeResult.text.includes("Ms Merrill-Stevenson"), "patient alias should not leak");
assert.ok(!chartChromeResult.text.includes("Dr. Hu"), "provider name should not leak");
assert.ok(!chartChromeResult.text.includes("5/20/2026"), "exact date should not leak");
assert.ok(chartChromeResult.flags.every((flag) => !flag.includes("5/20/2026")), "date detail should not display exact source date in review flags");

const oneLineChartText = "One-line summary: Ms. Lita Merrill-Stevenson is a 57-year-old woman. Per Dr. Hu. Room: C3E 54-A. CHG Bath. GLUCOSE BLD.";
const oneLineChartResult = deidentifyTextStructuredOnly(oneLineChartText);
assert.equal(
  oneLineChartResult.text,
  "One-line summary: [PATIENT NAME] is a 57-year-old woman. Per [PROVIDER NAME]. Room: [ROOM]. CHG Bath. GLUCOSE BLD.",
  "one-line chart exports should not merge provider, room, and chart labels into a name"
);

const promptHeadingResidualText = `HIGH PRIORITY VERIFY BEFORE ROUNDS
POSSIBLE DOSE OR SAFETY CONCERNS
POSSIBLE MISSED HELD OR UNEXPECTED ADMINISTRATIONS
QUESTIONS TO ASK TEAM OR NURSING
LIKELY OKAY OR NO ACTION NEEDED
No PHI`;
const promptHeadingWarnings = scanResidualPhi(promptHeadingResidualText);
assert.deepEqual(promptHeadingWarnings, [], "prompt/output headings must not be flagged as possible full names");

const appGeneratedSourceLabelResidualText = `De-identified SOAP note, labs, handoff summaries, and other context:
[PATIENT NAME] is feeling better today.

De-identified source note:
Current inpatient medications

Translated SOAP Note
Subjective`;
const appGeneratedSourceLabelWarnings = scanResidualPhi(appGeneratedSourceLabelResidualText);
for (const snippet of ["De-identified SOAP", "De-identified source", "Translated SOAP"]) {
  assert.ok(
    !appGeneratedSourceLabelWarnings.some((warning) => warning.snippet?.includes(snippet)),
    `app-generated source labels must not be flagged as possible full names: ${snippet}`
  );
}

const realResidualPhiText = `Patient: Nora W. Abrahimi
One-line summary: Ms. Lita Merrill-Stevenson is a 57 y.o. female.
Per Dr. Hu
DOB: 5/20/2026
MRN: 123456
Room: C3E 54-A
Phone: 555-123-4567
Email: patient@example.com
Address: 123 Main Street
Accession Number: AB123456`;
const realResidualPhiWarnings = scanResidualPhi(realResidualPhiText);
for (const snippet of ["Nora W. Abrahimi", "Ms. Lita Merrill-Stevenson", "Dr. Hu", "DOB: 5/20/2026", "MRN: 123456", "555-123-4567", "patient@example.com", "123 Main Street", "Accession Number: AB123456"]) {
  assert.ok(
    realResidualPhiWarnings.some((warning) => warning.snippet?.includes(snippet)),
    `real residual PHI should still be flagged: ${snippet}`
  );
}
assert.ok(
  realResidualPhiWarnings.some((warning) => warning.type === "unit or room" && warning.snippet?.includes("Room")),
  "room/unit identifiers should still be flagged"
);

const ageText = "Overall Assessment: Ms Merrill-Stevenson is a 57-year-old woman.";
const ageStart = ageText.indexOf("-year-old");
const ageModelDeidentifier = createDeidentifier({
  pipelineFactory: async () => async () => [
    { entity_group: "DATE", start: ageStart, end: ageStart + "-year-old".length, score: 0.92 }
  ],
  modelCandidates: [{ modelId: "mock-age-date-model", options: {} }]
});
const ageModelResult = await ageModelDeidentifier.deidentifyText(ageText);
assert.ok(ageModelResult.text.includes("57-year-old woman"), "model date false positive must not corrupt ages under 90");

const chgModelText = "CHG Bath. GLUCOSE BLD.";
const chgStart = chgModelText.indexOf("CHG");
const chgModelDeidentifier = createDeidentifier({
  pipelineFactory: async () => async () => [
    { entity_group: "LOCATION", start: chgStart, end: chgStart + "CHG".length, score: 0.88 }
  ],
  modelCandidates: [{ modelId: "mock-chg-location-model", options: {} }]
});
const chgModelResult = await chgModelDeidentifier.deidentifyText(chgModelText);
assert.equal(chgModelResult.text, chgModelText, "model location false positive must not redact CHG Bath");

const longChunkText = `${"word ".repeat(220)}Ms. Lita Merrill-Stevenson is here. ${"word ".repeat(220)}`;
const retryModelDeidentifier = createDeidentifier({
  pipelineFactory: async () => async (input) => {
    if (input.length > 360) {
      throw new Error("Attempting to broadcast an axis by a dimension other than 1. 512 by 514");
    }
    const start = input.indexOf("Ms. Lita Merrill-Stevenson");
    return start === -1
      ? []
      : [{ entity_group: "PERSON", start, end: start + "Ms. Lita Merrill-Stevenson".length, score: 0.99 }];
  },
  modelCandidates: [{ modelId: "mock-retry-model", options: {} }]
});
const retryModelResult = await retryModelDeidentifier.deidentifyText(longChunkText);
assert.equal(retryModelResult.modelStatus, "primary model", "length retries should keep the model available");
assert.ok(retryModelResult.text.includes("[NAME] is here"), "recursive chunk retry should still use model entities");
assert.ok(!retryModelResult.text.includes("Lita Merrill-Stevenson"), "model entity in retried chunk should not leak");

const timelineDateText = `Admission date: 2026-05-01
Symptoms changed on 5/7
Collected: 05/08/2026
Follow-up on May 10, 2026
Issue resolved on April 10, 2026
PET stress in 3/2026
Hospital Course by Date
5/6: Started treatment
5/8 0454: Morning labs drawn
DOB: 03/14/1998`;
const timelineDateResult = deidentifyTextStructuredOnly(timelineDateText);
assert.ok(timelineDateResult.text.includes("Admission date: Day -7 (2026)"), "admission date should preserve relation to current source date");
assert.ok(timelineDateResult.text.includes("Symptoms changed on Day -1 (2026)"), "yesterday-like change should be clear");
assert.ok(timelineDateResult.text.includes("Collected: Day 0 (2026)"), "latest lab/vital style date should be labeled as current source date");
assert.ok(timelineDateResult.text.includes("Follow-up on Day +2 (2026)"), "future date should preserve relation to current source date");
assert.ok(timelineDateResult.text.includes("Issue resolved on Day -28 (2026)"), "older resolved issue date should preserve day-level relation");
assert.ok(timelineDateResult.text.includes("PET stress in about 2 months before Day 0 (2026)"), "month/year dates should preserve month relation without exact month");
assert.ok(timelineDateResult.text.includes("Day -2 (2026): Started treatment"), "course date labels should preserve order");
assert.ok(timelineDateResult.text.includes("Day 0 early morning (2026): Morning labs drawn"), "date-attached time should be generalized");
assert.deepEqual(timelineDateResult.residualWarnings, [], "timeline placeholders should not create PHI warnings");
assert.ok(!timelineDateResult.text.includes("2026-05-01"), "exact ISO date should not leak");
assert.ok(!timelineDateResult.text.includes("05/08/2026"), "exact slash date should not leak");
assert.ok(!timelineDateResult.text.includes("May 10, 2026"), "exact month-name date should not leak");
assert.ok(!timelineDateResult.text.includes("April 10, 2026"), "older exact month-name date should not leak");
assert.ok(!timelineDateResult.text.includes("5/7"), "timeline shorthand date should not leak when it has clinical date context");
assert.ok(!timelineDateResult.text.includes("3/2026"), "month/year date should not leak");
assert.ok(!timelineDateResult.text.includes("5/6"), "course shorthand date should not leak");
assert.ok(!timelineDateResult.text.includes("0454"), "date-attached exact time should not leak");
assert.ok(!timelineDateResult.text.includes("03/14/1998"), "DOB exact date should not leak");

const crossYearTimelineText = `Hospital Course by Date
12/31: Admitted overnight
1/1: Creatinine improving
Current labs 1/2 0600: Creatinine stable
Follow-up on 1/3`;
const crossYearTimelineResult = deidentifyTextStructuredOnly(crossYearTimelineText);
assert.ok(crossYearTimelineResult.text.includes("Day -2"), "Dec 31 should resolve to two days before Jan 2, not the following December");
assert.ok(crossYearTimelineResult.text.includes("Day -1"), "Jan 1 should resolve to one day before Jan 2");
assert.ok(crossYearTimelineResult.text.includes("Current labs Day 0 early morning"), "current shorthand lab date should anchor the chart timeline");
assert.ok(crossYearTimelineResult.text.includes("Follow-up on Day +1"), "near-future shorthand follow-up should remain chronological");
assert.ok(!/Day [+-]?(?:36[0-9]|3[7-9]\d)/.test(crossYearTimelineResult.text), "cross-year shorthand dates should not produce near-one-year offsets");

const priorMonthYearAnchorText = `Prior transplant evaluation in 11/2025
PET stress in 12/2025
Labs 1/2 0454: Creatinine stable
12/31: Admitted for monitoring
1/1: Symptoms improved`;
const priorMonthYearAnchorResult = deidentifyTextStructuredOnly(priorMonthYearAnchorText);
assert.ok(priorMonthYearAnchorResult.text.includes("Prior transplant evaluation in about 2 months before Day 0 (2026)"), "prior month/year should make Jan shorthand resolve to the following year");
assert.ok(priorMonthYearAnchorResult.text.includes("PET stress in about 1 month before Day 0 (2026)"), "month/year history should remain relative to inferred Day 0");
assert.ok(priorMonthYearAnchorResult.text.includes("Labs Day 0 early morning (2026)"), "no-year current labs should infer the year from prior explicit history");
assert.ok(priorMonthYearAnchorResult.text.includes("Day -2 (2026): Admitted for monitoring"), "Dec shorthand should attach to the prior year relative to Jan Day 0");
assert.ok(priorMonthYearAnchorResult.text.includes("Day -1 (2026): Symptoms improved"), "Jan shorthand should stay in the inferred current year");
assert.ok(!/Day [+-]?(?:36[0-9]|3[7-9]\d)/.test(priorMonthYearAnchorResult.text), "month/year anchors should not create near-one-year offsets");

const guardText = clinicalGuardTerms.join("\n");
const guardResult = deidentifyTextStructuredOnly(guardText);
for (const term of clinicalGuardTerms) {
  assert.ok(guardResult.text.includes(term), `clinical term should be preserved: ${term}`);
}

for (const caseItem of makeAdversarialCases()) {
  assertDeidCase(caseItem, deidentifyTextStructuredOnly(caseItem.text));
}

const ambiguous = "Assessment: The Blue Ridge protocol was discussed as a teaching phrase.";
const ambiguousResult = deidentifyTextStructuredOnly(ambiguous);
assert.ok(ambiguousResult.text.includes("Blue Ridge"), "ambiguous capitalized phrase should not be auto-redacted without strong context");

const modeled = modelPredictionsToEntities(
  "Patient Name: John Smith\nDOB: 03/14/1998",
  [{ entity_group: "PERSON", start: 14, end: 35, score: 0.99 }]
);
assert.equal(modeled.length, 1, "model span should survive clipping");
assert.deepEqual(
  { start: modeled[0].start, end: modeled[0].end },
  { start: 14, end: 24 },
  "model span reconstruction must not cross a newline/header boundary"
);

console.log(`De-ID tests passed for ${cases.length} synthetic cases plus targeted guards.`);
