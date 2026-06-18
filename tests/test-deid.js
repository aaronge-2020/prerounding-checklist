import assert from "node:assert/strict";
import { createDeidentifier, deidentifyTextStructuredOnly, modelPredictionsToEntities, normalizeResidualTemporalPhi, scanResidualPhi } from "../deid.js";
import { assertDeidCase } from "../scripts/deid-adversarial.js";
import { clinicalGuardTerms, makeAdversarialCases, makeDemoLikeCase, makeSyntheticCases } from "../scripts/deid-fixtures.js";

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

const firstNameAliasText = `Patient: John Smith
MRN: 1234567
DOB: 04/12/1960
Room: 412B
S: John reports polyuria and thirst. Daughter Mary Smith at bedside.
O: glucose 412, sodium 132.
A/P: Type 2 diabetes with hyperglycemia.`;
const firstNameAliasResult = deidentifyTextStructuredOnly(firstNameAliasText);
for (const leak of ["John Smith", "John reports", "Mary Smith", "1234567", "04/12/1960", "412B"]) {
  assert.ok(!firstNameAliasResult.text.includes(leak), `patient/context identifier should not leak: ${leak}`);
}
for (const clinicalTerm of ["polyuria", "glucose 412", "Type 2 diabetes"]) {
  assert.ok(firstNameAliasResult.text.includes(clinicalTerm), `clinical term should be preserved: ${clinicalTerm}`);
}

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

const noDelimiterIdentifierResult = deidentifyTextStructuredOnly("Patient has MRN 1234567, CSN AB-1234, and Account Number HMO-70013.");
for (const leak of ["1234567", "AB-1234", "HMO-70013"]) {
  assert.ok(!noDelimiterIdentifierResult.text.includes(leak), `identifier without colon should be redacted: ${leak}`);
  assert.ok(!noDelimiterIdentifierResult.flags.some((flag) => flag.includes(leak)), `review flags should not repeat raw identifier: ${leak}`);
}
assert.ok(noDelimiterIdentifierResult.text.includes("MRN [MRN]"), "MRN without colon should keep readable label and redact value");
assert.ok(noDelimiterIdentifierResult.text.includes("CSN [ENCOUNTER ID]"), "CSN without colon should keep readable label and redact value");

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
assert.ok(timelineDateResult.text.includes("Admission date: 7 days ago"), "admission date should preserve relation to current source date");
assert.ok(timelineDateResult.text.includes("Symptoms changed on 1 day ago"), "yesterday-like change should be clear");
assert.ok(timelineDateResult.text.includes("Collected: today"), "latest lab/vital style date should be labeled as current source date");
assert.ok(timelineDateResult.text.includes("Follow-up on 2 days from now"), "future date should preserve relation to current source date");
assert.ok(timelineDateResult.text.includes("Issue resolved on 28 days ago"), "older resolved issue date should preserve day-level relation");
assert.ok(timelineDateResult.text.includes("PET stress in 2 months ago"), "month/year dates should preserve month relation without exact month");
assert.ok(timelineDateResult.text.includes("2 days ago: Started treatment"), "course date labels should preserve order");
assert.ok(timelineDateResult.text.includes("04:54 today: Morning labs drawn"), "lab/result-style date-attached time should preserve exact clock time");
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
assert.ok(crossYearTimelineResult.text.includes("2 days ago"), "Dec 31 should resolve to two days before Jan 2, not the following December");
assert.ok(crossYearTimelineResult.text.includes("1 day ago"), "Jan 1 should resolve to one day before Jan 2");
assert.ok(crossYearTimelineResult.text.includes("Current labs 06:00 today"), "current shorthand lab date should anchor the chart timeline with exact clock time");
assert.ok(crossYearTimelineResult.text.includes("Follow-up on 1 day from now"), "near-future shorthand follow-up should remain chronological");
assert.ok(!/Day [+-]?(?:36[0-9]|3[7-9]\d)/.test(crossYearTimelineResult.text), "cross-year shorthand dates should not produce near-one-year offsets");

const priorMonthYearAnchorText = `Prior transplant evaluation in 11/2025
PET stress in 12/2025
Labs 1/2 0454: Creatinine stable
12/31: Admitted for monitoring
1/1: Symptoms improved`;
const priorMonthYearAnchorResult = deidentifyTextStructuredOnly(priorMonthYearAnchorText);
assert.ok(priorMonthYearAnchorResult.text.includes("Prior transplant evaluation in 2 months ago"), "prior month/year should make Jan shorthand resolve to the following year");
assert.ok(priorMonthYearAnchorResult.text.includes("PET stress in 1 month ago"), "month/year history should remain relative to inferred Day 0");
assert.ok(priorMonthYearAnchorResult.text.includes("Labs 04:54 today"), "no-year current labs should infer the year from prior explicit history and preserve exact clock time");
assert.ok(priorMonthYearAnchorResult.text.includes("2 days ago: Admitted for monitoring"), "Dec shorthand should attach to the prior year relative to Jan Day 0");
assert.ok(priorMonthYearAnchorResult.text.includes("1 day ago: Symptoms improved"), "Jan shorthand should stay in the inferred current year");
assert.ok(!/Day [+-]?(?:36[0-9]|3[7-9]\d)/.test(priorMonthYearAnchorResult.text), "month/year anchors should not create near-one-year offsets");

const sameMorningLabTimeText = `BMP Collected: 06/06/2026 06:12 Na 132, K 3.4, Cr 1.5
BMP Collected: 06/06/2026 07:45 Na 136, K 4.2, Cr 1.2`;
const sameMorningLabTimeResult = deidentifyTextStructuredOnly(sameMorningLabTimeText);
assert.ok(sameMorningLabTimeResult.text.includes("BMP Collected: 06:12 today"), "first same-morning BMP exact time should be preserved");
assert.ok(sameMorningLabTimeResult.text.includes("BMP Collected: 07:45 today"), "second same-morning BMP exact time should be preserved");
assert.ok(!sameMorningLabTimeResult.text.includes("preserve exact time"), "multiple same-morning result times should not collapse into a bucket");
assert.ok(!sameMorningLabTimeResult.text.includes("06/06/2026"), "exact lab calendar date should still be removed");

const pocGlucoseTimeText = `POC Glucose 06/06/2026 04:02 160
POC Glucose 06/06/2026 08:01 190`;
const pocGlucoseTimeResult = deidentifyTextStructuredOnly(pocGlucoseTimeText);
assert.ok(pocGlucoseTimeResult.text.includes("POC Glucose 04:02 today 160"), "POC glucose exact AM time should be preserved");
assert.ok(pocGlucoseTimeResult.text.includes("POC Glucose 08:01 today 190"), "second POC glucose exact AM time should be preserved");

const narrativeTimeText = `Symptoms changed on 06/06/2026 06:12
Plan updated after rounds on 06/06/2026 07:45`;
const narrativeTimeResult = deidentifyTextStructuredOnly(narrativeTimeText);
assert.ok(narrativeTimeResult.text.includes("Symptoms changed on 06:12 today"), "non-result narrative timestamp should preserve exact time");
assert.ok(narrativeTimeResult.text.includes("Plan updated after rounds on 07:45 today"), "second non-result narrative timestamp should preserve exact time");
assert.ok(!narrativeTimeResult.text.includes("preserve exact time"), "narrative timestamps should use exact times, not buckets");

const labChronologyNormalized = normalizeResidualTemporalPhi(`<lab_chronology>
BMP timeline: Day 0 06:12 -> Day 0 07:45.
Most recent BMP by collection time: 07:45 on Day 0.
</lab_chronology>`);
assert.ok(labChronologyNormalized.includes("BMP timeline: 06:12 on Day 0 -> 07:45 on Day 0."), "lab chronology exact timeline should survive residual temporal normalization");
assert.ok(labChronologyNormalized.includes("Most recent BMP by collection time: 07:45 on Day 0."), "lab chronology most-recent exact time should survive residual temporal normalization");
assert.ok(!labChronologyNormalized.includes("early morning"), "lab chronology exact times should not be bucketed");

// Synthetic Results Review fixture; do not replace with patient chart text.
const epicResultsReviewText = `Most Recent
WBC: 9.1 1/10/26 04:48
Sodium: 140 1/10/26 04:48
POC Glucose: 123 1/9/26 20:42
Troponin T 5th Gen, High Sensitivity: 12 1/3/26 11:35
BK Virus Quant Log 10: Cannot Be Determined 1/8/26 10:20
EBV LOG10: Cannot Be Determined 1/3/26 11:35
Parainflu 1 Virus RNA Amplification: Not Detected 1/2/26 18:42
Rhinovirus/Enterovirus RNA Amplification: Not Detected 1/2/26 18:42
XR Knee 1/2 Views RIGHT: Rpt (E) 1/7/26 07:31
US Renal Transplant W/Duplex: Rpt 1/2/26 20:43
CAR Echo 2D Adult Complete: Rpt 1/8/26 10:06
QTC Calculation (Bazett): 453 1/6/26 23:41
External Hemoglobin A1C: 8.2 (H) (E) 1/5/26 07:43
Miscellaneous Test: SEE LAB TAB 1/1/26 12:00
Transfuse Red Blood Cells: Rpt  |  Rpt 1/7/26 10:28

01/08/26 21:31
POC Glucose: 160

01/09/26 05:32
POC Glucose: 95

01/09/26 05:51
POC Glucose: 150

01/09/26 11:54
POC Glucose: 111

01/10/26 04:48
WBC: 9.1
Sodium: 140`;
const epicResultsReviewResult = deidentifyTextStructuredOnly(epicResultsReviewText);
assert.ok(epicResultsReviewResult.text.includes("WBC: 9.1 04:48 today"), "latest Results Review row should anchor Day 0 and preserve exact clock time");
assert.ok(epicResultsReviewResult.text.includes("Sodium: 140 04:48 today"), "BMP-like row should preserve exact clock time");
assert.ok(epicResultsReviewResult.text.includes("POC Glucose: 123 20:42  days ago"), "same-day/previous-day POC glucose row should preserve exact clock time");
assert.ok(epicResultsReviewResult.text.includes("Troponin T 5th Gen, High Sensitivity: 12 11:35  days ago"), "high-sensitivity troponin label should not be redacted as a name");
assert.ok(epicResultsReviewResult.text.includes("BK Virus Quant Log 10: Cannot Be Determined 10:20  days ago"), "Cannot Be Determined should remain a result value");
assert.ok(epicResultsReviewResult.text.includes("EBV LOG10: Cannot Be Determined 11:35  days ago"), "viral result values should not be name-redacted");
assert.ok(epicResultsReviewResult.text.includes("Parainflu 1 Virus RNA Amplification: Not Detected 18:42  days ago"), "viral panel label should be preserved");
assert.ok(epicResultsReviewResult.text.includes("Rhinovirus/Enterovirus RNA Amplification: Not Detected 18:42  days ago"), "slash-separated viral label should be preserved");
assert.ok(epicResultsReviewResult.text.includes("XR Knee 1/2 Views RIGHT: Rpt (E) 07:31  days ago"), "imaging view count should not be converted to a date");
assert.ok(epicResultsReviewResult.text.includes("US Renal Transplant W/Duplex: Rpt 20:43  days ago"), "renal transplant imaging result should not be location/name redacted");
assert.ok(epicResultsReviewResult.text.includes("CAR Echo 2D Adult Complete: Rpt 10:06  days ago"), "Adult Complete echo label should be preserved");
assert.ok(epicResultsReviewResult.text.includes("QTC Calculation (Bazett): 453 23:41  days ago"), "QTC Calculation should not be redacted as a name");
assert.ok(epicResultsReviewResult.text.includes("External Hemoglobin A1C: 8.2 (H) (E) 07:43  days ago"), "External Hemoglobin A1C should remain clinical result text");
assert.ok(epicResultsReviewResult.text.includes("Miscellaneous Test: SEE LAB TAB 12:00  days ago"), "stray SEE LAB TAB should not become Day 0");
assert.ok(epicResultsReviewResult.text.includes("Transfuse Red Blood Cells: Rpt  |  Rpt 10:28  days ago\n\n21:31  days ago\nPOC Glucose: 160"), "day/time normalizer should not merge across blank lines");
assert.ok(epicResultsReviewResult.text.includes("05:32  days ago\nPOC Glucose: 95"), "standalone POC glucose header should preserve exact time");
assert.ok(epicResultsReviewResult.text.includes("05:51  days ago\nPOC Glucose: 150"), "multiple AM POC glucose headers should stay distinguishable");
assert.ok(epicResultsReviewResult.text.includes("11:54  days ago\nPOC Glucose: 111"), "POC glucose value should not be rewritten as a relative date");
assert.ok(epicResultsReviewResult.text.includes("04:48 today\nWBC: 9.1"), "standalone CBC/BMP header should preserve exact collection/result time");
assert.ok(!epicResultsReviewResult.text.includes("Day +2409"), "old 2019 anchor should not survive");
assert.ok(!epicResultsReviewResult.text.includes("[NAME]"), "clinical result labels/values in Results Review specimen should not become names");
assert.ok(!epicResultsReviewResult.text.includes("relative date"), "numeric result values should not be replaced by relative date placeholders");
assert.ok(!epicResultsReviewResult.text.includes("1/10/26"), "exact calendar dates should still be removed");
assert.deepEqual(epicResultsReviewResult.residualWarnings.filter((warning) => warning.severity === "high"), [], "Results Review specimen should not leave high-risk PHI warnings");

// Synthetic respiratory/imaging Results Review fixture; no patient chart values.
const epicRespImagingResultsText = `Most Recent
BG Site: A-Line 2/5/26 15:49
pH, Arterial: 7.35 2/6/26 10:42
Oxygen Device: Ventilator 2/5/26 09:54
Mode: High Flow Nasal Cannula 2/5/26 20:49
WBC: 8.8 2/8/26 12:22
POC Glucose: 104 2/10/26 08:10
Card 1 Collection Date: 2/4/2026 2/4/26 10:28
Oral/Maxillo Panorex Image By Clinic XR: Rpt 1/20/26 17:39
XR Metal Screening MR Clearance (Abd): Rpt 1/21/26 15:42
IR CV Tunneled Cath Insertion >=5 yrs: Rpt 2/1/26 14:33
MR Shoulder W+WO Con RIGHT: Rpt 12/31/25 06:30
Request for: Plasma: Rpt 2/2/26 10:55
Transfuse Platelets: Rpt  |  Rpt 2/4/26 20:43
Special Send Out Test: Rpt 1/19/26 13:10
HCV Spec Site: Blood 2/3/26 08:51
Iron: Not Performed 2/2/26 06:19
Vitamin B-12: 322 1/15/26 04:20
BG Site: Peripheral Venous 2/5/26 03:40
Base Exc Art: -4.1 2/6/26 16:02
Base Excess, Ven: -1.8 2/6/26 03:40
Hypochromasia: Moderate ! 1/1/26 21:16
Microcytes: Moderate ! 1/1/26 21:16
Retic CT %: 1.23 2/1/26 21:49
Body Fluid Culture (Aerobic): Rpt !! 2/5/26 13:38
QuantiFERON TB1 Ag Value: 0.04 1/6/26 09:40
Group A Streptococcus Screen w/o Reflex: Rpt 1/7/26 09:48
XR Ankle Min 3 Views Each Bilateral: Rpt (E) 1/8/26 14:56
XR Foot 1 or 2 Views Each Bilateral: Rpt (E) 1/8/26 14:57
XR Hands 1 or 2 Views Each Bilateral: Rpt (E) 1/9/26 14:45
CAR Echo 2D w Agitated Saline Adult Comp: Rpt (C) 2/1/26 10:45
POCUS ANES Procedure Nerve or Fascial Plane Block: Rpt 2/6/26 10:26
Manual Diff?: Yes 1/2/26 11:19
Cast Type: Hyaline casts 1/3/26 12:15
Ref Com Comments: H/O Anti-K; No other antibody detected. 2/3/26 07:59
Clostridioides difficile DNA Assay: Rpt 1/4/26 08:18
TACROLIMUS BLOOD (FK506), LC/MS/MS (T): 3.4 2/10/26 05:12
ABO Rh: B Negative 2/10/26 07:00
Antigen Typing: K Neg  |  C Neg  |  E Neg 1/5/26 14:06
US Renal Transplant W/Duplex: Rpt 1/6/26 14:23
Scanned External EKG/ECG: Rpt 1/7/26 00:00
Spec Gravity, Ur: 1.030 2/4/26 20:08
Leukocyte Esterase, Ur: Trace ! 2/4/26 20:08
XR Elbow 2 Views LEFT: Rpt (C) (E) 1/22/26 20:25
CT Cervical Spine W/O Con: Rpt (C) (E) 1/22/26 19:29
CT Head/Brain W/O Con: Rpt 2/4/26 19:06
CT Upper Extremity WITH Con LEFT: Rpt 2/4/26 19:06
US Soft Tissue Head/Neck: Rpt (E) 1/23/26 14:23
VAS Venous Duplex LE Bilat Complete: Rpt 2/2/26 11:58
VAS Venous Duplex UE Bilat Complete: Rpt 2/2/26 12:38
POC SAT O2 ART: 98 2/6/26 12:08
HCG Beta Subunit - QuaL: Negative 2/5/26 06:19
Quantiferon TB Gold: Indeterminate ! 1/5/26 15:54
RPR Titer: Non Reactive 1/6/26 13:30
TREPONEMA PALLIDUM IGG AB: Minimal React 2/1/26 03:14
Bacterial Vaginosis, RNA: Positive ! 2/5/26 12:00
Dolutegravir Resistance: NOT PREDICTED 1/7/26 15:02
Casts: None seen 1/8/26 15:04
Microscopic Examination of Urine: See Comment 1/9/26 00:00
Antibody Identification: Cold Autoantibody 2/5/26 06:19
DIRECT COOMBS-C3D: Negative 2/4/26 14:26
Tissue Examination: Rpt (P) 2/5/26 10:43
XR Chest 1 View Post Intervention: Rpt (C) (E) 1/10/26 12:15
POC SARS COV-2 (COVID-19) Ag: Negative 1/11/26 04:02
SARS-CoV-2 (COVID-19) RNA: Not Detected 1/12/26 06:10
BUN/CREAT Ratio: 8 (L) 1/13/26 00:00
A/G Ratio: 1.2 1/13/26 00:00
LDL Chol Calc (NIH): 164 (H) 1/14/26 15:04
CD 4 Abs Helper: 935 1/15/26 15:02
Cd 4 Pos. Lymphs Pct: 26 (L) 1/15/26 15:02
Cd 8 Abs. Suppressor: 1,175 (H) 1/16/26 12:10
XR Chest AP (Portable): Rpt 1/17/26 18:19
XR Hand >= 3 Views LEFT: Rpt 1/18/26 11:11
XR Toe(s) >= 2 Views LEFT: Rpt 1/19/26 02:04
CT Abdomen/Pelvis IV Contrast Only: Rpt (C) (E) 1/20/26 08:15
CT Sinus/Facial/Mandible WITH Con: Rpt 1/21/26 18:35
CT Soft Tissue Neck WITH Con: Rpt (E) 1/22/26 19:09
CTA Chest (PE Protocol): Rpt (C) 1/23/26 21:48
IR Rvsc Tib/Peroneal Art, Init Vsl W/Tla: Rpt 1/24/26 13:54
NM MYOCARDIAL PERFUSION PHARM STRESS SPECT: Rpt (C) (E) 1/25/26 10:53
PET CT Tumor Imaging Skull Base To Mid T: Rpt 1/26/26 12:55
CAR Exercise Stress Portion of Nuc Med: Rpt (C) (E) 1/27/26 10:05
HBV S Ab - Quant: <3.1 (L) 1/28/26 00:00
Multi Drug Resistant Gram Negative Surveillance Culture: Rpt 1/29/26 11:11
N Gonorrhoeae, NAA: Negative 1/30/26 12:49
Quantiferon TB Ag Minus NIL Value: <0.01 1/31/26 15:54
Urine Culture, Routine Reflex Result: Rpt 2/1/26 15:02
C Glabrata, RNA: Positive ! 2/5/26 12:00
HIV Ag/Ab: Reactive ! 1/16/26 05:59
HIV Genosure Prime(SM): See Comment  |  See Comment 1/17/26 16:03
HIV Genosure(TM) MG PDF: . 1/18/26 15:54
Amphetamine Qual, Ur: Negative 1/19/26 14:54
Barbiturate Screen, Ur: Negative 1/19/26 14:54
Benzodiazapine Screen, Ur: Negative 1/19/26 14:54
Cannabinoid Qual Ur: Positive !  |  See Final Results 1/19/26 14:54
Opiate Scrn, Ur: Negative 1/19/26 14:54
Oxycodone/Oxymorphone UR Screen: Negative 1/19/26 14:54
Phencyclidine UR - Screen: Negative 1/19/26 14:54
Amorphous Crystals, UR: Present 1/20/26 14:50
Color, UA: Dark Yellow ! 1/20/26 10:40
Squam Epithel, UA: 3-5 ! 1/20/26 20:05
Epithelial Cells, UA: 0-2 1/20/26 10:40
Renal Epithel, UA: See Comment 1/20/26 15:04
Hyaline Casts, UA: 6-10 ! 1/20/26 15:02
Crystal Cmt 1: See Comment 1/20/26 15:04
Uric Acid, Ur: 103.4 1/20/26 16:05
Carisoprodol/Meprobamate Screen Urine: Negative 1/19/26 14:54
ABO Rh: O Positive 2/5/26 06:19
XR Ankle >= 3 Views LEFT: Rpt (C) (E) 1/21/26 18:02
Test Cup: Plain Cup 2/2/26 15:00
Appearance, Ur: Slightly Cloudy 2/3/26 18:57
Ketones, Ur: Trace ! 2/3/26 18:57
Mucus, Ur: Small 2/3/26 18:57
Appearance: Clear 1/28/26 01:51
R Axis: -2 2/3/26 18:12
Banding Type: FISH 2/5/26 02:31
Source: Blood
 2/5/26 02:31
TEG Platelet Aggregation (MA): 68.3 2/2/26 15:00
TEG Fibrinogen Activity (Angle): 65.2 2/2/26 15:00
TEG Clotting Time (R): 9.5 2/2/26 15:00
Beta HCG Tumor Marker (Male): 2080 (H) 2/1/26 04:33
XR Hip Bilateral & Pelvis 2 Views: Rpt 2/3/26 17:57
Prelim Result: Normal FISH 2/5/26 02:31
XR FEMUR 2 VIEWS: Rpt 2/2/26 22:25
XR FOOT MIN 3 VIEWS: Rpt 2/2/26 22:25

02/09/26 07:51
POC Glucose: 101

02/10/26 08:10
POC Glucose: 104`;
const epicRespImagingResult = deidentifyTextStructuredOnly(epicRespImagingResultsText);
assert.ok(epicRespImagingResult.text.includes("BG Site: A-Line 15:49  days ago"), "A-line blood gas site should remain clinical text with exact time");
assert.ok(epicRespImagingResult.text.includes("pH, Arterial: 7.35 10:42  days ago"), "blood gas result should preserve exact clock time");
assert.ok(epicRespImagingResult.text.includes("Oxygen Device: Ventilator 09:54  days ago"), "vent setting row should preserve exact clock time");
assert.ok(epicRespImagingResult.text.includes("Mode: High Flow Nasal Cannula 20:49  days ago"), "respiratory mode should not be treated as a name");
assert.ok(epicRespImagingResult.text.includes("WBC: 8.8 12:22  days ago"), "latest CBC before Day 0 should remain chronological");
assert.ok(epicRespImagingResult.text.includes("POC Glucose: 104 08:10 today"), "latest POC glucose should anchor Day 0");
assert.ok(epicRespImagingResult.text.includes("Card 1 Collection Date: Day -6 (2026) 10:28  days ago"), "Card 1 Collection Date should not override Day 0 and should not duplicate exact-time wording");
assert.ok(epicRespImagingResult.text.includes("Oral/Maxillo Panorex Image By Clinic XR: Rpt 17:39  days ago"), "imaging title containing Clinic should not be redacted as an organization");
assert.ok(epicRespImagingResult.text.includes("XR Metal Screening MR Clearance (Abd): Rpt 15:42  days ago"), "XR metal screening title should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("IR CV Tunneled Cath Insertion >=5 yrs: Rpt 14:33  days ago"), "IR tunneled catheter title should be preserved");
assert.ok(epicRespImagingResult.text.includes("MR Shoulder W+WO Con RIGHT: Rpt 06:30  days ago"), "MR Shoulder W+WO title should be preserved");
assert.ok(epicRespImagingResult.text.includes("Request for: Plasma: Rpt 10:55  days ago"), "blood product request rows should preserve exact clock time");
assert.ok(epicRespImagingResult.text.includes("Transfuse Platelets: Rpt  |  Rpt 20:43  days ago"), "transfusion rows should preserve exact clock time");
assert.ok(epicRespImagingResult.text.includes("Special Send Out Test: Rpt 13:10  days ago"), "special send-out test should not be redacted as a facility");
assert.ok(epicRespImagingResult.text.includes("HCV Spec Site: Blood 08:51  days ago"), "HCV spec site value Blood should remain clinical text");
assert.ok(epicRespImagingResult.text.includes("Iron: Not Performed 06:19  days ago"), "Not Performed should remain a result value");
assert.ok(epicRespImagingResult.text.includes("Vitamin B-12: 322 04:20  days ago"), "Vitamin B-12 should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("BG Site: Peripheral Venous 03:40  days ago"), "Peripheral Venous should remain a blood gas site value");
assert.ok(epicRespImagingResult.text.includes("Base Exc Art: -4.1 16:02  days ago"), "arterial base excess should preserve exact result time");
assert.ok(epicRespImagingResult.text.includes("Base Excess, Ven: -1.8 03:40  days ago"), "venous base excess should preserve exact result time");
assert.ok(epicRespImagingResult.text.includes("Hypochromasia: Moderate ! 21:16  days ago"), "morphology value should preserve exact result time");
assert.ok(epicRespImagingResult.text.includes("Microcytes: Moderate ! 21:16  days ago"), "microcyte morphology row should preserve exact result time");
assert.ok(epicRespImagingResult.text.includes("Retic CT %: 1.23 21:49  days ago"), "Retic CT should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Body Fluid Culture (Aerobic): Rpt !! 13:38  days ago"), "body fluid culture should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("QuantiFERON TB1 Ag Value: 0.04 09:40  days ago"), "QuantiFERON Ag Value should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Group A Streptococcus Screen w/o Reflex: Rpt 09:48  days ago"), "strep screen w/o reflex should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("XR Ankle Min 3 Views Each Bilateral: Rpt (E) 14:56  days ago"), "bilateral ankle imaging title should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("XR Foot 1 or 2 Views Each Bilateral: Rpt (E) 14:57  days ago"), "bilateral foot imaging title should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("XR Hands 1 or 2 Views Each Bilateral: Rpt (E) 14:45  days ago"), "bilateral hand imaging title should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("CAR Echo 2D w Agitated Saline Adult Comp: Rpt (C) 10:45  days ago"), "agitated saline echo title should not be redacted as a patient name");
assert.ok(epicRespImagingResult.text.includes("POCUS ANES Procedure Nerve or Fascial Plane Block: Rpt 10:26  days ago"), "POCUS anesthesia fascial-plane block title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Manual Diff?: Yes 11:19  days ago"), "manual differential result should keep exact time instead of a morning bucket");
assert.ok(epicRespImagingResult.text.includes("Cast Type: Hyaline casts 12:15  days ago"), "cast type should keep exact time instead of an afternoon bucket");
assert.ok(epicRespImagingResult.text.includes("Ref Com Comments: H/O Anti-K; No other antibody detected. 07:59  days ago"), "blood-bank reference comments should keep exact time and not create name warnings");
assert.ok(epicRespImagingResult.text.includes("Clostridioides difficile DNA Assay: Rpt 08:18  days ago"), "DNA Assay should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("TACROLIMUS BLOOD (FK506), LC/MS/MS (T): 3.4 05:12 today"), "Tacrolimus blood label should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("ABO Rh: B Negative 07:00 today"), "blood type value B Negative should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Antigen Typing: K Neg  |  C Neg  |  E Neg 14:06  days ago"), "blood-bank antigen shorthand should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("US Renal Transplant W/Duplex: Rpt 14:23  days ago"), "renal transplant ultrasound title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Scanned External EKG/ECG: Rpt 00:00  days ago"), "scanned external EKG title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Spec Gravity, Ur: 1.030 20:08  days ago"), "urine specific gravity should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Leukocyte Esterase, Ur: Trace ! 20:08  days ago"), "leukocyte esterase should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("XR Elbow 2 Views LEFT: Rpt (C) (E) 20:25  days ago"), "elbow imaging title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("CT Cervical Spine W/O Con: Rpt (C) (E) 19:29  days ago"), "CT cervical spine W/O contrast title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("CT Head/Brain W/O Con: Rpt 19:06  days ago"), "CT head/brain W/O contrast title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("CT Upper Extremity WITH Con LEFT: Rpt 19:06  days ago"), "CT upper extremity title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("US Soft Tissue Head/Neck: Rpt (E) 14:23  days ago"), "US soft-tissue head/neck title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("VAS Venous Duplex LE Bilat Complete: Rpt 11:58  days ago"), "LE bilateral venous duplex title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("VAS Venous Duplex UE Bilat Complete: Rpt 12:38  days ago"), "UE bilateral venous duplex title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("POC SAT O2 ART: 98 12:08  days ago"), "POC saturation label should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("HCG Beta Subunit - QuaL: Negative 06:19  days ago"), "HCG beta subunit label should remain clinical text");
assert.ok(epicRespImagingResult.text.includes("Quantiferon TB Gold: Indeterminate ! 15:54  days ago"), "Quantiferon result should keep exact time instead of an afternoon bucket");
assert.ok(epicRespImagingResult.text.includes("RPR Titer: Non Reactive 13:30  days ago"), "RPR titer should keep exact time instead of an afternoon bucket");
assert.ok(epicRespImagingResult.text.includes("TREPONEMA PALLIDUM IGG AB: Minimal React 03:14  days ago"), "Treponema serology should keep exact time instead of an early-morning bucket");
assert.ok(epicRespImagingResult.text.includes("Bacterial Vaginosis, RNA: Positive ! 12:00  days ago"), "Bacterial Vaginosis RNA should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("Dolutegravir Resistance: NOT PREDICTED 15:02  days ago"), "HIV resistance rows should keep exact time instead of an afternoon bucket");
assert.ok(epicRespImagingResult.text.includes("Casts: None seen 15:04  days ago"), "urine casts result should keep exact time instead of an afternoon bucket");
assert.ok(epicRespImagingResult.text.includes("Microscopic Examination of Urine: See Comment 00:00  days ago"), "urine microscopy label should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("Antibody Identification: Cold Autoantibody 06:19  days ago"), "cold autoantibody result value should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("DIRECT COOMBS-C3D: Negative 14:26  days ago"), "COOMBS-C3D should remain a clinical label, not an ID placeholder");
assert.ok(epicRespImagingResult.text.includes("Tissue Examination: Rpt (P) 10:43  days ago"), "tissue examination label should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("XR Chest 1 View Post Intervention: Rpt (C) (E) 12:15  days ago"), "post-intervention imaging title should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("POC SARS COV-2 (COVID-19) Ag: Negative 04:02  days ago"), "COVID-19 should remain a clinical label token, not an ID placeholder");
assert.ok(epicRespImagingResult.text.includes("SARS-CoV-2 (COVID-19) RNA: Not Detected 06:10  days ago"), "SARS-CoV-2 COVID-19 RNA label should be preserved");
assert.ok(epicRespImagingResult.text.includes("Test Cup: Plain Cup 15:00  days ago"), "TEG cup descriptor should keep exact result time");
assert.ok(epicRespImagingResult.text.includes("Appearance, Ur: Slightly Cloudy 18:57  days ago"), "urine appearance descriptor should keep exact result time");
assert.ok(epicRespImagingResult.text.includes("Ketones, Ur: Trace ! 18:57  days ago"), "urine trace values should not be treated as narrative time");
assert.ok(epicRespImagingResult.text.includes("Mucus, Ur: Small 18:57  days ago"), "urine small values should not be treated as names or narrative time");
assert.ok(epicRespImagingResult.text.includes("Appearance: Clear 01:51  days ago"), "generic appearance row should preserve exact result time");
assert.ok(epicRespImagingResult.text.includes("R Axis: -2 18:12  days ago"), "EKG axis result should keep exact result time");
assert.ok(epicRespImagingResult.text.includes("Banding Type: FISH 02:31  days ago"), "cytogenetics banding row should keep exact result time");
assert.ok(epicRespImagingResult.text.includes("Source: Blood\n 02:31  days ago"), "standalone timestamp after specimen source should keep exact result time");
assert.ok(epicRespImagingResult.text.includes("TEG Platelet Aggregation (MA): 68.3 15:00  days ago"), "TEG platelet aggregation should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("TEG Fibrinogen Activity (Angle): 65.2 15:00  days ago"), "TEG fibrinogen activity should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("TEG Clotting Time (R): 9.5 15:00  days ago"), "TEG clotting time should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Beta HCG Tumor Marker (Male): 2080 (H) 04:33  days ago"), "tumor-marker lab label should not be redacted as a patient name");
assert.ok(epicRespImagingResult.text.includes("XR Hip Bilateral & Pelvis 2 Views: Rpt 17:57  days ago"), "hip/pelvis imaging title should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("Prelim Result: Normal FISH 02:31  days ago"), "Normal FISH result should remain clinical text");
assert.ok(epicRespImagingResult.text.includes("XR FEMUR 2 VIEWS: Rpt 22:25  days ago"), "all-caps femur imaging title should not create name warnings");
assert.ok(epicRespImagingResult.text.includes("XR FOOT MIN 3 VIEWS: Rpt 22:25  days ago"), "all-caps foot imaging title should not create name warnings");
assert.ok(epicRespImagingResult.text.includes("07:51  days ago\nPOC Glucose: 101"), "timestamped POC glucose block should keep exact clock time");
assert.ok(!epicRespImagingResult.text.includes("[FACILITY]"), "Results Review clinical values should not become facilities");
assert.ok(!epicRespImagingResult.text.includes("[NAME]"), "Results Review clinical labels should not become names");
assert.ok(!epicRespImagingResult.text.includes("[ID]"), "known clinical label tokens should not become ID placeholders");
assert.ok(!epicRespImagingResult.text.includes("Day +30"), "Card 1 Collection Date should not create future lab days");
assert.ok(!/\b(?:preserve exact time|morning|afternoon|evening|night|overnight)\b/.test(epicRespImagingResult.text), "result chronology should keep exact clocks instead of buckets");
assert.deepEqual(epicRespImagingResult.residualWarnings, [], "respiratory/imaging Results Review specimen should not create residual PHI warnings");

const labCertificationText = "This test was developed and its performance characteristics determined by the Cytogenetics Laboratory, University of Example, Harbor City, MD. This laboratory is certified under the Clinical Laboratory Improvement Amendments of 1988 (CLIA) as qualified to perform high complexity clinical laboratory testing.";
const labCertificationResult = deidentifyTextStructuredOnly(labCertificationText);
assert.ok(labCertificationResult.text.includes("determined by the [ORGANIZATION]."), "named lab institution and city/state should be redacted");
assert.ok(labCertificationResult.text.includes("Clinical Laboratory Improvement Amendments of 1988 (CLIA)"), "generic CLIA regulatory phrase should not be redacted as a name");
assert.ok(!labCertificationResult.text.includes("University of Example"), "named university should not remain");
assert.ok(!labCertificationResult.text.includes("Harbor City"), "city/state facility detail should not remain");
assert.deepEqual(labCertificationResult.residualWarnings, [], "generic lab certification text should not create residual warnings after institution redaction");

const medicalTermFalsePositiveText = `Review details
Corrected Arterial
Manual Diff
No Day
DNA Assay
TACROLIMUS BLOOD
B Negative
K Neg
C Neg
E Neg
O Anti-K
US Guided Needle Placement: Rpt 1/10/26 12:00
SUBJECTIVE OBJECTIVE ASSESSMENT AND PLAN
Active Antimicrobial Orders
Cefepime IVPB MINI-BAG Plus`;
const medicalTermFalsePositiveResult = deidentifyTextStructuredOnly(medicalTermFalsePositiveText);
for (const term of [
  "Corrected Arterial",
  "Manual Diff",
  "No Day",
  "DNA Assay",
  "TACROLIMUS BLOOD",
  "B Negative",
  "K Neg",
  "C Neg",
  "E Neg",
  "O Anti-K",
  "US Guided Needle Placement",
  "SUBJECTIVE OBJECTIVE ASSESSMENT AND PLAN",
  "Active Antimicrobial Orders",
  "IVPB MINI-BAG Plus"
]) {
  assert.ok(medicalTermFalsePositiveResult.text.includes(term), `medical term should not be redacted: ${term}`);
}
assert.deepEqual(medicalTermFalsePositiveResult.residualWarnings, [], "listed medical terms should not create residual PHI warnings");

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
