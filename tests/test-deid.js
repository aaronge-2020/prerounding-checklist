import assert from "node:assert/strict";
import { createDeidentifier, deidentifyTextStructuredOnly, modelPredictionsToEntities, normalizeResidualTemporalPhi, scanResidualPhi } from "../src/vault/deid.js";
import { createEphemeralRedactionReview, synchronizeReviewPlaceholders } from "../src/patient-context/review.js";
import { DEMO_ADMISSION_DATE, DEMO_CONTEXT_TEXTS, DEMO_DAILY_TEXTS } from "../src/ui/demo/session.js";
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

const guidedDemoResults = [...DEMO_CONTEXT_TEXTS, ...DEMO_DAILY_TEXTS]
  .map((text) => deidentifyTextStructuredOnly(text, DEMO_ADMISSION_DATE));
const guidedDemoContext = guidedDemoResults[0].text;
assert.match(guidedDemoContext, /Preferred Name: \[PATIENT NAME\]/, "preferred-name aliases must use the patient-name placeholder");
assert.match(guidedDemoContext, /DOB: \[61 years, 7 months, and 25 days prior to hospital admission\]/, "DOB should become an age-relative phrase");
assert.doesNotMatch(guidedDemoContext, /\[Lab \d+\/\d+\] Timeline:/, "timeline metadata must not be ordinalized as a lab result");
assert.match(guidedDemoContext, /Admission Time: \[TIME\]/, "explicit admission times must not survive redaction");
assert.match(guidedDemoContext, /Insurance: \[ORGANIZATION\] PPO/, "insurance plan names must redact only the organization and preserve the plan type");
assert.match(guidedDemoContext, /Member ID: \[ID\]/, "member identifiers must be redacted");
assert.match(guidedDemoContext, /Group Number: \[ID\]/, "group identifiers must be redacted");
assert.match(guidedDemoContext, /Employer: \[ORGANIZATION\]/, "employer names must be redacted");
assert.match(guidedDemoContext, /Occupation: \[OCCUPATION\]/, "occupation may be a unique identifying characteristic and must be redacted");
assert.doesNotMatch(guidedDemoContext, /Mechanical Engineer/, "occupation values must not survive redaction");
assert.doesNotMatch(guidedDemoContext, /\[ADDRESS\]-V6/, "ECG leads must not be mistaken for an address");
assert.match(guidedDemoResults[3].text, /Coronary angiography within 24 hours\./, "durations must not be converted into calendar dates");
assert.match(guidedDemoResults[7].text, /decreasing from 8\/10 at presentation to 2\/10 by evening\./, "pain scores must not be converted into calendar dates");
assert.deepEqual(
  guidedDemoResults.flatMap((result) => result.residualWarnings),
  [],
  "the shipped guided-demo notes must not emit residual warnings after structured redaction"
);

const explicitSensitiveFields = deidentifyTextStructuredOnly("Occupation: President of State University\nAdmission Time: 08:43");
assert.match(explicitSensitiveFields.text, /Occupation: \[OCCUPATION\]/);
assert.match(explicitSensitiveFields.text, /Admission Time: \[TIME\]/);
assert.deepEqual(explicitSensitiveFields.residualWarnings, [], "redacted occupation and admission time should not leave residual warnings");
assert.equal(modelPredictionsToEntities("Occupation: Mechanical Engineer", [{ word: "Mechanical Engineer", entity_group: "PROFESSION", score: 0.99 }])[0]?.label, "OCCUPATION");
assert.equal(modelPredictionsToEntities("Admission Time: 08:43", [{ word: "08:43", entity_group: "TIME_OF_DAY", score: 0.99 }])[0]?.label, "TIME");
assert.ok(scanResidualPhi("Occupation: President of State University").some((warning) => warning.type === "occupation"), "unredacted occupation should be surfaced as a residual warning");
assert.ok(scanResidualPhi("Admission Time: 08:43").some((warning) => warning.type === "admission time"), "unredacted admission time should be surfaced as a residual warning");

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

const inlinePatientHeaderResult = deidentifyTextStructuredOnly("Patient Jane Smith MRN 123456 was seen today.");
assert.ok(!inlinePatientHeaderResult.text.includes("Jane Smith"), "inline patient header names should be redacted");
assert.ok(!inlinePatientHeaderResult.text.includes("123456"), "inline patient header MRNs should be redacted");

const userReportedBatchCases = [
  {
    id: "user-reported-alice-note",
    text: `Patient Name Alice Smith
Date of Birth January 4 1980
Date of Service June 10 2026
Medical Record Number 10485739
Address 742 Evergreen Terrace Springfield Oregon 97477
Phone 541 555 0192
Provider Dr Robert Chang
Chief Complaint Headache
History of Present Illness Alice reports a severe headache. The pain began on June 8 2026. She took acetaminophen. The medicine reduced the pain.
Past Medical History Alice has asthma.
Physical Exam I examined the patient. Her vital signs show normal limits.
Assessment Alice has a tension headache. I prescribed rest.`,
    expected: `Patient Name [PATIENT NAME]
Date of Birth [46 years, 6 months, and 12 days prior to hospital admission]
Timeline [1 month and 6 days prior to hospital admission]
Medical Record Number [MRN]
Address [ADDRESS]
Phone [PHONE]
Provider [PROVIDER NAME]
Chief Complaint Headache
History of Present Illness [PATIENT NAME] reports a severe headache. The pain began on [1 month and 8 days prior to hospital admission]. She took acetaminophen. The medicine reduced the pain.
Past Medical History [PATIENT NAME] has asthma.
Physical Exam I examined the patient. Her vital signs show normal limits.
Assessment [PATIENT NAME] has a tension headache. I prescribed rest.`
  },
  {
    id: "user-reported-brian-note",
    text: `Patient Name Brian Johnson
Date of Birth March 15 1965
Date of Service July 2 2026
Medical Record Number 83920485
Address 101 Maple Street Austin Texas 78701
Phone 512 555 3847
Provider Dr Sarah Miller
Chief Complaint Knee pain
History of Present Illness Brian presents with right knee pain. He fell on July 1 2026. He rates the pain high.
Past Medical History Brian has hypertension.
Physical Exam I observed swelling on the right knee.
Assessment Brian has a knee sprain. I ordered an x ray.`,
    expected: `Patient Name [PATIENT NAME]
Date of Birth [61 years, 4 months, and 1 day prior to hospital admission]
Timeline [14 days prior to hospital admission]
Medical Record Number [MRN]
Address [ADDRESS]
Phone [PHONE]
Provider [PROVIDER NAME]
Chief Complaint Knee pain
History of Present Illness [PATIENT NAME] presents with right knee pain. He fell on [15 days prior to hospital admission]. He rates the pain high.
Past Medical History [PATIENT NAME] has hypertension.
Physical Exam I observed swelling on the right knee.
Assessment [PATIENT NAME] has a knee sprain. I ordered an x ray.`
  }
];
for (const caseItem of userReportedBatchCases) {
  const result = deidentifyTextStructuredOnly(caseItem.text, new Date("2026-07-16T00:00:00Z"));
  assert.equal(result.text, caseItem.expected, `${caseItem.id} should redact the complete note without changing clinical prose`);
  assert.deepEqual(result.residualWarnings, [], `${caseItem.id} should not leave residual PHI warnings`);
}

const familyHistoryClinicalPhraseText = `Family History
Father died from myocardial infarction at age 59.
Mother alive with diabetes and CKD.`;
const familyHistoryClinicalPhraseResult = deidentifyTextStructuredOnly(familyHistoryClinicalPhraseText);
assert.equal(
  familyHistoryClinicalPhraseResult.text,
  familyHistoryClinicalPhraseText,
  "family-history prose should not be captured as a contact name"
);
assert.deepEqual(
  familyHistoryClinicalPhraseResult.residualWarnings,
  [],
  "family-history clinical prose should not leave residual PHI warnings"
);
assert.deepEqual(
  familyHistoryClinicalPhraseResult.entities,
  [],
  "family-history clinical prose should not create structured name entities"
);

const familyHistoryContactNamesText = `Family History
Father: Robert Johnson
Mother Susan Johnson
Emergency contact: Laura Johnson`;
const familyHistoryContactNamesResult = deidentifyTextStructuredOnly(familyHistoryContactNamesText);
assert.equal(
  familyHistoryContactNamesResult.text,
  `Family History
Father: [CONTACT NAME]
Mother [CONTACT NAME]
Emergency contact: [CONTACT NAME]`,
  "actual family and emergency contact names should remain redacted"
);

const familyHistoryModelPhraseStart = familyHistoryClinicalPhraseText.indexOf("myocardial infarction");
const familyHistoryModelEntities = modelPredictionsToEntities(familyHistoryClinicalPhraseText, [{
  entity_group: "CONTACT",
  start: familyHistoryModelPhraseStart,
  end: familyHistoryModelPhraseStart + "myocardial infarction".length,
  score: 0.99
}]);
assert.deepEqual(
  familyHistoryModelEntities,
  [],
  "clinical diagnoses must suppress model contact-name false positives"
);

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
const admissionAnchor = new Date("2026-05-01");
const timelineDateResult = deidentifyTextStructuredOnly(timelineDateText, admissionAnchor);
assert.ok(timelineDateResult.text.includes("Timeline: [Hospital Day 1]"), "admission date itself should anchor Hospital Day 1 and its field label should be renamed to Timeline");
assert.ok(timelineDateResult.text.includes("Symptoms changed on [Hospital Day 7]"), "later same-admission date should advance the Hospital Day count");
assert.ok(timelineDateResult.text.includes("Timeline: [Hospital Day 8]"), "Collected field label should be renamed to Timeline and dated by Hospital Day");
assert.ok(timelineDateResult.text.includes("Follow-up on [Hospital Day 10]"), "future date within the admission should still advance the Hospital Day count");
assert.ok(timelineDateResult.text.includes("Issue resolved on [21 days prior to hospital admission]"), "a date well before admission should collapse to a relative duration before admission");
assert.ok(timelineDateResult.text.includes("PET stress in [2 months prior to hospital admission]"), "month/year-only dates should collapse to a relative (day-free) duration before admission");
assert.ok(timelineDateResult.text.includes("[Hospital Day 6]: Started treatment"), "course date labels should preserve order via Hospital Day numbers");
assert.ok(timelineDateResult.text.includes("[Hospital Day 8 at 04:54]: Morning labs drawn"), "lab/result-style date-attached time should preserve the exact literal clock time next to its Hospital Day");
assert.deepEqual(timelineDateResult.residualWarnings, [], "timeline placeholders should not create PHI warnings");
assert.ok(!timelineDateResult.text.includes("2026-05-01"), "exact ISO date should not leak");
assert.ok(!timelineDateResult.text.includes("2026-04-"), "the real admission date must never be reconstructible from the output");

const legacyDateReview = createEphemeralRedactionReview("EKG (07/09/2026): Sinus rhythm", deidentifyTextStructuredOnly("EKG (07/09/2026): Sinus rhythm", new Date("2026-07-11T12:00:00Z")));
legacyDateReview.redactions[0].placeholder = "[DATE]";
synchronizeReviewPlaceholders(legacyDateReview, "EKG (2 days ago): Sinus rhythm");
assert.equal(legacyDateReview.redactions[0].placeholder, "2 days ago", "an active review created before relative-date rendering must recover the visible replacement for inline centering");

const duplicateSpanReview = createEphemeralRedactionReview("Ortiz returned on 07/09/2026.", {
  text: "[PATIENT NAME] returned on 2 days ago.",
  entities: [
    { start: 0, end: 5, label: "NAME", placeholder: "[NAME]", source: "medical model" },
    { start: 0, end: 5, label: "PATIENT NAME", placeholder: "[PATIENT NAME]", source: "residual validator" },
    { start: 0, end: 5, label: "NAME", placeholder: "[NAME]", source: "medical model" },
    { start: 18, end: 28, label: "DATE", renderedPlaceholder: "2 days ago", source: "medical model" }
  ]
});
assert.equal(duplicateSpanReview.redactions.length, 2, "the same source span must require one review decision even when detectors report it repeatedly");
assert.equal(duplicateSpanReview.redactions[0].label, "PATIENT NAME", "the review should keep the most specific label for a duplicated span");
assert.equal(duplicateSpanReview.redactions[0].placeholder, "[PATIENT NAME]", "the review should keep the corresponding specific replacement");
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
assert.ok(crossYearTimelineResult.text.includes("[Hospital Day 1]: Admitted overnight"), "Dec 31 should resolve relative to the inferred anchor without exposing the following December");
assert.ok(crossYearTimelineResult.text.includes("[Hospital Day 2]: Creatinine improving"), "Jan 1 should sequence one day after the admission anchor, not collapse into it");
assert.ok(crossYearTimelineResult.text.includes("Current labs [Hospital Day 3 at 06:00]: Creatinine stable"), "current shorthand lab date should stay sequential after admission with exact clock time");
assert.ok(crossYearTimelineResult.text.includes("Follow-up on [Hospital Day 4]"), "near-future shorthand follow-up should remain chronological");
assert.ok(!/Hospital Day (?:36[0-9]|3[7-9]\d)/.test(crossYearTimelineResult.text), "cross-year shorthand dates should not produce near-one-year Hospital Day offsets");

const priorMonthYearAnchorText = `Prior transplant evaluation in 11/2025
PET stress in 12/2025
Labs 1/2 0454: Creatinine stable
12/31: Admitted for monitoring
1/1: Symptoms improved`;
const priorMonthYearAnchorResult = deidentifyTextStructuredOnly(priorMonthYearAnchorText);
assert.ok(priorMonthYearAnchorResult.text.includes("Prior transplant evaluation in [1 year and 1 month prior to hospital admission]"), "prior month/year should collapse to a relative duration before admission, never a calendar date");
assert.ok(priorMonthYearAnchorResult.text.includes("PET stress in [1 year prior to hospital admission]"), "month/year history should collapse to a relative duration before admission");
assert.ok(priorMonthYearAnchorResult.text.includes("Labs [Hospital Day 3 at 04:54]"), "no-year current labs should infer the year from prior explicit history and preserve exact clock time, sequenced after the admission anchor");
assert.ok(priorMonthYearAnchorResult.text.includes("[Hospital Day 1]: Admitted for monitoring"), "the actual admission line should anchor Hospital Day 1, not just the prior year's date");
assert.ok(priorMonthYearAnchorResult.text.includes("[Hospital Day 2]: Symptoms improved"), "Jan shorthand should sequence one day after the admission anchor");
assert.ok(!/Hospital Day (?:36[0-9]|3[7-9]\d)/.test(priorMonthYearAnchorResult.text), "month/year anchors should not create near-one-year Hospital Day offsets");

const sameMorningLabTimeText = `BMP Collected: 06/06/2026 06:12 Na 132, K 3.4, Cr 1.5
BMP Collected: 06/06/2026 07:45 Na 136, K 4.2, Cr 1.2`;
const sameMorningLabTimeResult = deidentifyTextStructuredOnly(sameMorningLabTimeText);
assert.ok(sameMorningLabTimeResult.text.includes("[Lab 1/2] BMP Collected: [Hospital Day 1 at 06:12]"), "first same-morning BMP should be ordinal-tagged and keep its exact time");
assert.ok(sameMorningLabTimeResult.text.includes("**[LATEST_RESULT]** [Lab 2/2] BMP Collected: [Hospital Day 1 at 07:45]"), "second, later same-morning BMP should be tagged as the latest result and keep its exact time");
assert.ok(!sameMorningLabTimeResult.text.includes("06/06/2026"), "exact lab calendar date should still be removed");

const pocGlucoseTimeText = `POC Glucose 06/06/2026 04:02 160
POC Glucose 06/06/2026 08:01 190`;
const pocGlucoseTimeResult = deidentifyTextStructuredOnly(pocGlucoseTimeText);
assert.ok(pocGlucoseTimeResult.text.includes("POC Glucose [Hospital Day 1 at 04:02] 160"), "POC glucose exact AM time should be preserved");
assert.ok(pocGlucoseTimeResult.text.includes("POC Glucose [Hospital Day 1 at 08:01] 190"), "second POC glucose exact AM time should be preserved");

const narrativeTimeText = `Symptoms changed on 06/06/2026 06:12
Plan updated after rounds on 06/06/2026 07:45`;
const narrativeTimeResult = deidentifyTextStructuredOnly(narrativeTimeText);
assert.ok(narrativeTimeResult.text.includes("Symptoms changed on [Hospital Day 1 at 06:12]"), "non-result narrative timestamp should preserve exact time");
assert.ok(narrativeTimeResult.text.includes("Plan updated after rounds on [Hospital Day 1 at 07:45]"), "second non-result narrative timestamp should preserve exact time");
assert.ok(!/\b(?:morning|afternoon|evening|overnight|night)\b/.test(narrativeTimeResult.text), "narrative timestamps should use exact times, not time-of-day buckets");

const labChronologyInput = `<lab_chronology>
BMP timeline: Hospital Day 1 06:12 -> Hospital Day 1 07:45.
Most recent BMP by collection time: 07:45 on Hospital Day 1.
</lab_chronology>`;
const labChronologyNormalized = normalizeResidualTemporalPhi(labChronologyInput);
assert.equal(labChronologyNormalized, labChronologyInput, "already-anchored Hospital Day text with no real calendar dates should pass through residual temporal normalization unchanged");
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
assert.ok(epicResultsReviewResult.text.includes("WBC: 9.1 [Hospital Day 10 at 04:48]"), "latest Results Review row should anchor to its correct sequential day and preserve exact clock time");
assert.ok(epicResultsReviewResult.text.includes("Sodium: 140 [Hospital Day 10 at 04:48]"), "BMP-like row should preserve exact clock time");
assert.ok(epicResultsReviewResult.text.includes("POC Glucose: 123 [Hospital Day 9 at 20:42]"), "same-day/previous-day POC glucose row should preserve exact clock time");
assert.ok(epicResultsReviewResult.text.includes("Troponin T 5th Gen, High Sensitivity: 12 [Hospital Day 3 at 11:35]"), "high-sensitivity troponin label should not be redacted as a name");
assert.ok(epicResultsReviewResult.text.includes("BK Virus Quant Log 10: Cannot Be Determined [Hospital Day 8 at 10:20]"), "Cannot Be Determined should remain a result value");
assert.ok(epicResultsReviewResult.text.includes("EBV LOG10: Cannot Be Determined [Hospital Day 3 at 11:35]"), "viral result values should not be name-redacted");
assert.ok(epicResultsReviewResult.text.includes("Parainflu 1 Virus RNA Amplification: Not Detected [Hospital Day 2 at 18:42]"), "viral panel label should be preserved");
assert.ok(epicResultsReviewResult.text.includes("Rhinovirus/Enterovirus RNA Amplification: Not Detected [Hospital Day 2 at 18:42]"), "slash-separated viral label should be preserved");
assert.ok(epicResultsReviewResult.text.includes("XR Knee 1/2 Views RIGHT: Rpt (E) [Hospital Day 7 at 07:31]"), "imaging view count should not be converted to a date");
assert.ok(epicResultsReviewResult.text.includes("US Renal Transplant W/Duplex: Rpt [Hospital Day 2 at 20:43]"), "renal transplant imaging result should not be location/name redacted");
assert.ok(epicResultsReviewResult.text.includes("CAR Echo 2D Adult Complete: Rpt [Hospital Day 8 at 10:06]"), "Adult Complete echo label should be preserved");
assert.ok(epicResultsReviewResult.text.includes("QTC Calculation (Bazett): 453 [Hospital Day 6 at 23:41]"), "QTC Calculation should not be redacted as a name");
assert.ok(epicResultsReviewResult.text.includes("External Hemoglobin A1C: 8.2 (H) (E) [Hospital Day 5 at 07:43]"), "External Hemoglobin A1C should remain clinical result text");
assert.ok(epicResultsReviewResult.text.includes("Miscellaneous Test: SEE LAB TAB [Hospital Day 1 at 12:00]"), "stray SEE LAB TAB should not become an unrelated label");
assert.ok(epicResultsReviewResult.text.includes("Transfuse Red Blood Cells: Rpt  |  Rpt [Hospital Day 7 at 10:28]\n\n[Hospital Day 8 at 21:31]\nPOC Glucose: 160"), "date conversion should not merge lines across blank lines");
assert.ok(epicResultsReviewResult.text.includes("[Hospital Day 9 at 05:32]\nPOC Glucose: 95"), "standalone POC glucose header should preserve exact time");
assert.ok(epicResultsReviewResult.text.includes("[Hospital Day 9 at 05:51]\nPOC Glucose: 150"), "multiple AM POC glucose headers should stay distinguishable");
assert.ok(epicResultsReviewResult.text.includes("[Hospital Day 9 at 11:54]\nPOC Glucose: 111"), "POC glucose value should not be rewritten as a date placeholder");
assert.ok(epicResultsReviewResult.text.includes("[Hospital Day 10 at 04:48]\nWBC: 9.1"), "standalone CBC/BMP header should preserve exact collection/result time");
assert.ok(!epicResultsReviewResult.text.includes("[NAME]"), "clinical result labels/values in Results Review specimen should not become names");
assert.ok(!/\b(?:morning|afternoon|evening|overnight|night)\b/.test(epicResultsReviewResult.text), "result chronology should keep exact clocks instead of time-of-day buckets");
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
assert.ok(epicRespImagingResult.text.includes("[Lab 1/2] BG Site: A-Line [Hospital Day 10 at 15:49]"), "A-line blood gas site should remain clinical text, keep exact time, and be ordinal-tagged as the first of its repeated label");
assert.ok(epicRespImagingResult.text.includes("pH, Arterial: 7.35 [Hospital Day 11 at 10:42]"), "blood gas result should preserve exact clock time");
assert.ok(epicRespImagingResult.text.includes("Oxygen Device: Ventilator [Hospital Day 10 at 09:54]"), "vent setting row should preserve exact clock time");
assert.ok(epicRespImagingResult.text.includes("Mode: High Flow Nasal Cannula [Hospital Day 10 at 20:49]"), "respiratory mode should not be treated as a name");
assert.ok(epicRespImagingResult.text.includes("WBC: 8.8 [Hospital Day 13 at 12:22]"), "CBC row within the admission window should anchor to its correct sequential day");
assert.ok(epicRespImagingResult.text.includes("POC Glucose: 104 [Hospital Day 15 at 08:10]"), "latest POC glucose should anchor to its correct sequential day");
assert.ok(epicRespImagingResult.text.includes("Card 1 Collection Date: [Hospital Day 9] [Hospital Day 9 at 10:28]"), "Card 1 Collection Date should not leak a calendar date and should not duplicate exact-time wording");
assert.ok(epicRespImagingResult.text.includes("Oral/Maxillo Panorex Image By Clinic XR: Rpt [7 days prior to hospital admission]"), "imaging title containing Clinic should not be redacted as an organization, and an old date should collapse to a relative duration before admission");
assert.ok(epicRespImagingResult.text.includes("XR Metal Screening MR Clearance (Abd): Rpt [6 days prior to hospital admission]"), "XR metal screening title should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("IR CV Tunneled Cath Insertion >=5 yrs: Rpt [Hospital Day 6 at 14:33]"), "IR tunneled catheter title should be preserved");
assert.ok(epicRespImagingResult.text.includes("MR Shoulder W+WO Con RIGHT: Rpt [27 days prior to hospital admission]"), "MR Shoulder W+WO title should be preserved and its prior date collapsed to a relative duration before admission");
assert.ok(epicRespImagingResult.text.includes("Request for: Plasma: Rpt [Hospital Day 7 at 10:55]"), "blood product request rows should preserve exact clock time");
assert.ok(epicRespImagingResult.text.includes("Transfuse Platelets: Rpt  |  Rpt [Hospital Day 9 at 20:43]"), "transfusion rows should preserve exact clock time");
assert.ok(epicRespImagingResult.text.includes("Special Send Out Test: Rpt [8 days prior to hospital admission]"), "special send-out test should not be redacted as a facility");
assert.ok(epicRespImagingResult.text.includes("HCV Spec Site: Blood [Hospital Day 8 at 08:51]"), "HCV spec site value Blood should remain clinical text");
assert.ok(epicRespImagingResult.text.includes("Iron: Not Performed [Hospital Day 7 at 06:19]"), "Not Performed should remain a result value");
assert.ok(epicRespImagingResult.text.includes("Vitamin B-12: 322 [12 days prior to hospital admission]"), "Vitamin B-12 should not be redacted as a name, and an older date should collapse to a relative duration before admission");
assert.ok(epicRespImagingResult.text.includes("**[LATEST_RESULT]** [Lab 2/2] BG Site: Peripheral Venous [Hospital Day 10 at 03:40]"), "Peripheral Venous should remain a blood gas site value and be tagged as the most recent of its repeated label");
assert.ok(epicRespImagingResult.text.includes("Base Exc Art: -4.1 [Hospital Day 11 at 16:02]"), "arterial base excess should preserve exact result time");
assert.ok(epicRespImagingResult.text.includes("Base Excess, Ven: -1.8 [Hospital Day 11 at 03:40]"), "venous base excess should preserve exact result time");
assert.ok(epicRespImagingResult.text.includes("Hypochromasia: Moderate ! [26 days prior to hospital admission]"), "morphology value with an old date should collapse to a relative duration before admission");
assert.ok(epicRespImagingResult.text.includes("Microcytes: Moderate ! [26 days prior to hospital admission]"), "microcyte morphology row with an old date should collapse to a relative duration before admission");
assert.ok(epicRespImagingResult.text.includes("Retic CT %: 1.23 [Hospital Day 6 at 21:49]"), "Retic CT should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Body Fluid Culture (Aerobic): Rpt !! [Hospital Day 10 at 13:38]"), "body fluid culture should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("QuantiFERON TB1 Ag Value: 0.04 [21 days prior to hospital admission]"), "QuantiFERON Ag Value should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Group A Streptococcus Screen w/o Reflex: Rpt [20 days prior to hospital admission]"), "strep screen w/o reflex should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("XR Ankle Min 3 Views Each Bilateral: Rpt (E) [19 days prior to hospital admission]"), "bilateral ankle imaging title should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("XR Hands 1 or 2 Views Each Bilateral: Rpt (E) [18 days prior to hospital admission]"), "bilateral hand imaging title should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("CAR Echo 2D w Agitated Saline Adult Comp: Rpt (C) [Hospital Day 6 at 10:45]"), "agitated saline echo title should not be redacted as a patient name");
assert.ok(epicRespImagingResult.text.includes("POCUS ANES Procedure Nerve or Fascial Plane Block: Rpt [Hospital Day 11 at 10:26]"), "POCUS anesthesia fascial-plane block title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Manual Diff?: Yes [25 days prior to hospital admission]"), "manual differential result should collapse an old date to a relative duration before admission, not a time bucket");
assert.ok(epicRespImagingResult.text.includes("Ref Com Comments: H/O Anti-K; No other antibody detected. [Hospital Day 8 at 07:59]"), "blood-bank reference comments should keep exact time and not create name warnings");
assert.ok(epicRespImagingResult.text.includes("TACROLIMUS BLOOD (FK506), LC/MS/MS (T): 3.4 [Hospital Day 15 at 05:12]"), "Tacrolimus blood label should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("[Lab 1/2] ABO Rh: B Negative [Hospital Day 15 at 07:00]"), "blood type value B Negative should not create residual name warnings and should be ordinal-tagged");
assert.ok(epicRespImagingResult.text.includes("Antigen Typing: K Neg  |  C Neg  |  E Neg [22 days prior to hospital admission]"), "blood-bank antigen shorthand should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Spec Gravity, Ur: 1.030 [Hospital Day 9 at 20:08]"), "urine specific gravity should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("Leukocyte Esterase, Ur: Trace ! [Hospital Day 9 at 20:08]"), "leukocyte esterase should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("CT Head/Brain W/O Con: Rpt [Hospital Day 9 at 19:06]"), "CT head/brain W/O contrast title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("VAS Venous Duplex LE Bilat Complete: Rpt [Hospital Day 7 at 11:58]"), "LE bilateral venous duplex title should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("POC SAT O2 ART: 98 [Hospital Day 11 at 12:08]"), "POC saturation label should not create residual name warnings");
assert.ok(epicRespImagingResult.text.includes("HCG Beta Subunit - QuaL: Negative [Hospital Day 10 at 06:19]"), "HCG beta subunit label should remain clinical text");
assert.ok(epicRespImagingResult.text.includes("Quantiferon TB Gold: Indeterminate ! [22 days prior to hospital admission]"), "Quantiferon result with an old date should collapse to a relative duration before admission, not a time bucket");
assert.ok(epicRespImagingResult.text.includes("TREPONEMA PALLIDUM IGG AB: Minimal React [Hospital Day 6 at 03:14]"), "Treponema serology should keep exact result time");
assert.ok(epicRespImagingResult.text.includes("Bacterial Vaginosis, RNA: Positive ! [Hospital Day 10 at 12:00]"), "Bacterial Vaginosis RNA should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("Dolutegravir Resistance: NOT PREDICTED [20 days prior to hospital admission]"), "HIV resistance rows with an old date should collapse to a relative duration before admission");
assert.ok(epicRespImagingResult.text.includes("Antibody Identification: Cold Autoantibody [Hospital Day 10 at 06:19]"), "cold autoantibody result value should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("DIRECT COOMBS-C3D: Negative [Hospital Day 9 at 14:26]"), "COOMBS-C3D should remain a clinical label, not an ID placeholder");
assert.ok(epicRespImagingResult.text.includes("Tissue Examination: Rpt (P) [Hospital Day 10 at 10:43]"), "tissue examination label should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("POC SARS COV-2 (COVID-19) Ag: Negative [16 days prior to hospital admission]"), "COVID-19 should remain a clinical label token, not an ID placeholder");
assert.ok(epicRespImagingResult.text.includes("Test Cup: Plain Cup [Hospital Day 7 at 15:00]"), "TEG cup descriptor should keep exact result time");
assert.ok(epicRespImagingResult.text.includes("Appearance, Ur: Slightly Cloudy [Hospital Day 8 at 18:57]"), "urine appearance descriptor should keep exact result time");
assert.ok(epicRespImagingResult.text.includes("R Axis: -2 [Hospital Day 8 at 18:12]"), "EKG axis result should keep exact result time");
assert.ok(epicRespImagingResult.text.includes("Banding Type: FISH [Hospital Day 10 at 02:31]"), "cytogenetics banding row should keep exact result time");
assert.ok(epicRespImagingResult.text.includes("Source: Blood\n [Hospital Day 10 at 02:31]"), "standalone timestamp after specimen source should keep exact result time");
assert.ok(epicRespImagingResult.text.includes("TEG Platelet Aggregation (MA): 68.3 [Hospital Day 7 at 15:00]"), "TEG platelet aggregation should not be redacted as a name");
assert.ok(epicRespImagingResult.text.includes("Beta HCG Tumor Marker (Male): 2080 (H) [Hospital Day 6 at 04:33]"), "tumor-marker lab label should not be redacted as a patient name");
assert.ok(epicRespImagingResult.text.includes("Prelim Result: Normal FISH [Hospital Day 10 at 02:31]"), "Normal FISH result should remain clinical text");
assert.ok(epicRespImagingResult.text.includes("[Hospital Day 14 at 07:51]\nPOC Glucose: 101"), "timestamped POC glucose block should keep exact clock time");
assert.ok(!epicRespImagingResult.text.includes("[FACILITY]"), "Results Review clinical values should not become facilities");
assert.ok(!epicRespImagingResult.text.includes("[NAME]"), "Results Review clinical labels should not become names");
assert.ok(!epicRespImagingResult.text.includes("[ID]"), "known clinical label tokens should not become ID placeholders");
assert.ok(!/\b(?:morning|afternoon|evening|overnight|night)\b/.test(epicRespImagingResult.text), "result chronology should keep exact clocks instead of time-of-day buckets");
assert.ok(!/\b(?:19|20)\d{2}[/-]\d{1,2}[/-]\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/(?:19|20)?\d{2}\b/.test(epicRespImagingResult.text), "no exact calendar date should survive de-identification");
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

// ── Dictionary name-recall layer (src/vault/deid/name-recall.js) ──
// Names the NER model and contextual regexes historically missed: lowercase
// relatives, ALL-CAPS chart headers, comma-reversed names, contacts without
// honorifics. Paired "keep" cases pin the precision side: clinical eponyms,
// analytes, and imaging titles must survive untouched.
const recallCases = [
  ["lowercase relative", "Spoke with her daughter maria gonzalez about goals of care.", ["maria", "gonzalez"], []],
  ["all-caps reversed header", "PATIENT: WILLIAMS, ROBERT J\nMRN: 4429871", ["WILLIAMS", "ROBERT"], []],
  ["contact with relationship tag", "Emergency contact: Rosa Delgado (sister), phone on file.", ["Rosa", "Delgado"], []],
  ["relative in parens", "pt's mom (Denise) at bedside overnight, updated on plan.", ["Denise"], []],
  ["no-honorific contact", "Called Marcus Whitfield to confirm ride home tomorrow.", ["Marcus", "Whitfield"], []],
  ["neighbor weird format", "brought in by neighbor  BOB  who found pt down", ["BOB"], []],
  ["lowercase relative single name", "grandmother rosa stays with patient during the day", ["rosa"], []],
  ["provider signoff", "Read by Dr. Okafor, MD at outside facility.", ["Okafor"], []],
  ["eponym device", "Foley catheter in place, draining clear urine.", [], ["Foley"]],
  ["eponym scale", "Glasgow Coma Scale 15 on arrival. Wells score 2.", [], ["Glasgow", "Wells"]],
  ["eponym procedure", "s/p Whipple procedure 2 years ago for pancreatic mass.", [], ["Whipple"]],
  ["allen test", "Allen test negative prior to radial art line.", [], ["Allen"]],
  ["lab analytes intact", "CBC: WBC 8.8, Hgb 10.2, Plt 220\nBMP: Na 140, K 4.2, Cr 0.9", [], ["WBC", "Na", "Hgb"]],
  ["imaging narrative intact", "CT Head/Brain W/O Con: No acute intracranial abnormality. Ventricles normal.", [], ["CT", "Ventricles"]]
];
for (const [caseName, caseText, mustRedact, mustKeep] of recallCases) {
  const recallResult = deidentifyTextStructuredOnly(caseText);
  for (const token of mustRedact) {
    assert.ok(!recallResult.text.includes(token), `name recall (${caseName}): "${token}" should be redacted`);
  }
  for (const token of mustKeep) {
    assert.ok(recallResult.text.includes(token), `name recall (${caseName}): clinical term "${token}" must be preserved`);
  }
}

const overlapReview = createEphemeralRedactionReview("Patient Ortiz presented.", {
  text: "Patient [PATIENT NAME] presented.",
  entities: [
    { start: 8, end: 13, label: "NAME", placeholder: "[NAME]" },
    { start: 8, end: 13, label: "PATIENT NAME", placeholder: "[PATIENT NAME]" },
    { start: 7, end: 13, label: "FULL NAME", placeholder: "[NAME]" }
  ]
});
assert.equal(overlapReview.redactions.length, 1, "overlapping detector spans should become one review decision");

console.log(`De-ID tests passed for ${cases.length} synthetic cases plus targeted guards.`);
