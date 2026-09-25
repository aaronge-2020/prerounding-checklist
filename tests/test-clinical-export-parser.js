import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseClinicalExport,
  prepareClinicalExportForSave
} from "../src/patient-context/clinical-export-parser.js";
import {
  clinicalDataModel,
  clinicalDisplayModel,
  clinicalDisplayModelFromPromptText,
  laboratoryAbnormality
} from "../src/patient-context/structured-clinical-data.js";
import { deidentifyTextStructuredOnly } from "../src/vault/deid.js";

const parserRevision = "20260921-medication-card-v4";
const epicParserRevision = "20260925-mixed-unparsed-v1";
const clinicalParserRevision = "20260925-negative-lab-v1";
const primaryNoteRevision = "20260921-medication-card-v4";
const sourceControllerRevision = "20260923-plan-problems-v1";
const appRevision = "20260924-helptip-position-v1";
const styleRevision = "20260924-helptip-position-v1";
const runtimeSources = {
  index: readFileSync(new URL("../index.html", import.meta.url), "utf8"),
  app: readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8"),
  persistence: readFileSync(new URL("../src/app/state/persistence.js", import.meta.url), "utf8"),
  sections: readFileSync(new URL("../src/patient-context/sections.js", import.meta.url), "utf8"),
  sourceCaptures: readFileSync(new URL("../src/patient-context/source-captures.js", import.meta.url), "utf8"),
  controller: readFileSync(new URL("../src/ui/daily/source-controller.js", import.meta.url), "utf8"),
  dailyPresentation: readFileSync(new URL("../src/ui/daily/presentation.js", import.meta.url), "utf8"),
  admissionAnchor: readFileSync(new URL("../src/ui/admission-date-anchor.js", import.meta.url), "utf8"),
  redactionPresentation: readFileSync(new URL("../src/ui/redaction/presentation.js", import.meta.url), "utf8"),
  days: readFileSync(new URL("../src/daily-updates/days.js", import.meta.url), "utf8"),
  customTemplates: readFileSync(new URL("../src/prompts/custom-templates.js", import.meta.url), "utf8"),
  openEvidence: readFileSync(new URL("../src/prompts/open-evidence.js", import.meta.url), "utf8"),
  promptController: readFileSync(new URL("../src/ui/prompts/controller.js", import.meta.url), "utf8"),
  promptPresentation: readFileSync(new URL("../src/ui/prompts/presentation.js", import.meta.url), "utf8"),
  phoneSession: readFileSync(new URL("../src/ui/checklist/phone-session.js", import.meta.url), "utf8"),
  examFindings: readFileSync(new URL("../src/ui/checklist/exam-findings-controller.js", import.meta.url), "utf8"),
  parser: readFileSync(new URL("../src/patient-context/clinical-export-parser.js", import.meta.url), "utf8"),
  epicParser: readFileSync(new URL("../src/patient-context/epic-clinical-export-parser.js", import.meta.url), "utf8")
};
assert.match(runtimeSources.index, new RegExp(`styles\\.css\\?v=${styleRevision}`));
assert.match(runtimeSources.index, new RegExp(`app\\.js\\?v=${appRevision}`));
assert.match(runtimeSources.app, new RegExp(`daily/presentation\\.js\\?v=${primaryNoteRevision}`));
assert.match(runtimeSources.app, new RegExp(`daily/source-controller\\.js\\?v=${sourceControllerRevision}`));
assert.match(runtimeSources.app, new RegExp(`source-captures\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.app, new RegExp(`app/state/persistence\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.app, new RegExp(`patient-context/sections\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.app, new RegExp(`admission-date-anchor\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.app, new RegExp(`redaction/presentation\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.app, new RegExp(`prompts/presentation\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.app, new RegExp(`prompts/controller\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.app, new RegExp(`token-color-picker\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.controller, new RegExp(`clinical-export-parser\\.js\\?v=${clinicalParserRevision}`));
assert.match(runtimeSources.controller, new RegExp(`daily-updates/days\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.dailyPresentation, new RegExp(`structured-clinical-data\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.dailyPresentation, new RegExp(`clinical-export-parser\\.js\\?v=${clinicalParserRevision}`));
assert.match(runtimeSources.dailyPresentation, new RegExp(`packet-completeness\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.persistence, new RegExp(`vault\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.sections, new RegExp(`vault\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.sourceCaptures, new RegExp(`packet-completeness\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.admissionAnchor, new RegExp(`vault\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.redactionPresentation, new RegExp(`patient-context/sections\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.days, new RegExp(`app/state/vault\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.customTemplates, new RegExp(`daily-updates/days\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.customTemplates, new RegExp(`patient-context/sections\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.openEvidence, new RegExp(`daily-updates/days\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.openEvidence, new RegExp(`patient-context/sections\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.promptController, new RegExp(`custom-templates\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.promptController, new RegExp(`open-evidence\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.promptPresentation, new RegExp(`custom-templates\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.phoneSession, new RegExp(`daily-updates/days\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.examFindings, new RegExp(`daily-updates/days\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.examFindings, new RegExp(`app/state/vault\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.app, new RegExp(`clinical-export-parser\\.js\\?v=${clinicalParserRevision}`));
assert.match(runtimeSources.parser, new RegExp(`epic-clinical-export-parser\\.js\\?v=${epicParserRevision}`));
assert.match(runtimeSources.parser, new RegExp(`structured-clinical-data\\.js\\?v=${parserRevision}`));
assert.match(runtimeSources.epicParser, new RegExp(`structured-clinical-data\\.js\\?v=${parserRevision}`));

const syntheticCprsMar = `
** INPATIENT ORDERS **
======================================================================
Location | | |
Start Date Stop Date | Action Status
---------------------------------------------------------------------
INPATIENT | |
Hospital Day 2 Hospital Day 4 | 0900 |
@08:00 @12:00 | |
ACETAMINOPHEN ORAL TAB | |
 ACETAMINOPHEN 325MG TAB Give: 650MG PO Q6H PRN | |
 RPH: ABC RN: xyz | |
 Special Instructions:
 Use for synthetic mild pain.
---------------------------------------------------------------------
INPATIENT | |
Hospital Day 2 Hospital Day 2 | 1000 |
@09:00 @10:05 | GIVEN Hospital Day 2@10:05:00 xyz
HYDRALAZINE ORAL TAB | |
 HYDRALAZINE HCL 25MG TAB Give: 25MG PO ONCE | |
 ***DISCONTINUED | |
 RPH: ABC RN: xyz | |
---------------------------------------------------------------------
MEDICATION ADMINISTRATION HISTORY for Hospital Day 2
`;

const parsedMar = parseClinicalExport(syntheticCprsMar);
assert.equal(parsedMar.recognized, true);
assert.equal(parsedMar.formatId, "cprs_mar");
assert.equal(parsedMar.suggestedSourceKind, "medication_activity");
assert.equal(parsedMar.itemCount, 2);
assert.match(parsedMar.outputText, /ACETAMINOPHEN 325MG TAB Give: 650MG PO Q6H PRN/);
assert.match(parsedMar.outputText, /GIVEN Hospital Day 2@10:05:00 xyz; DISCONTINUED/);
assert.doesNotMatch(parsedMar.outputText, /Use for synthetic mild pain/, "medication review output must omit administration instructions");
assert.doesNotMatch(parsedMar.outputText, /RPH:|={10,}|\| \|/);
assert.equal(parsedMar.displayModel.type, "medications");
assert.equal(parsedMar.displayModel.groups[0].rows.length, 2);
assert.ok(parsedMar.parsedCharacterCount < parsedMar.rawCharacterCount, "normalized medication text must not expand the paste");

const syntheticMixedCprs = `DATE/TIME TEMP PULSE RESP BP PAIN WEIGHT
Hospital Day 2 @ 0700 98.6 72 16 118/64 2 75

HISTORY OF PRESENT ILLNESS:
This synthetic narrative remains exactly available for clinician review.

BASIC METABOLIC PANEL BLOOD

Timeline: Hospital Day 2@06:30

Test Name Result Units Range
--------- ------ ----- -----
SODIUM 139 mmol/L 135 - 145
POTASSIUM 4.1 mmol/L 3.5 - 5.1

ASSESSMENT & PLAN:
Free-form plans are not automatically classified.`;

const parsedMixed = parseClinicalExport(syntheticMixedCprs);
assert.equal(parsedMixed.recognized, true);
assert.equal(parsedMixed.formatId, "cprs_mixed_tables");
assert.equal(parsedMixed.suggestedSourceKind, "", "a mixed narrative must not be silently classified as a Results source");
assert.equal(parsedMixed.preservedUnparsedText, true);
assert.deepEqual(parsedMixed.sections.map((section) => section.sourceKind), ["vital_signs", "laboratory_results", "other_chart_text"]);
assert.deepEqual(parsedMixed.displayModels.map((model) => model.type), ["vitals", "labs"]);
assert.match(parsedMixed.outputText, /Temp 98\.6; HR 72/);
assert.match(parsedMixed.outputText, /SODIUM: 139 mmol\/L; ref 135 - 145/);
assert.match(parsedMixed.outputText, /This synthetic narrative remains exactly available/);
assert.match(parsedMixed.outputText, /Free-form plans are not automatically classified/);
assert.doesNotMatch(parsedMixed.outputText, /Test Name Result Units Range/);
assert.equal(parsedMixed.sections[1].displayModel.groups[0].rows[0].emphasis, "normal");

const syntheticLabTable = [
  "Component\tResult\tUnits\tReference Range\tCollected",
  "Sodium\t140\tmmol/L\t135-145\tHospital Day 2 06:00",
  "Creatinine\t1.2\tmg/dL\t0.6-1.3\tHospital Day 2 06:00"
].join("\n");
const parsedLabTable = parseClinicalExport(syntheticLabTable);
assert.equal(parsedLabTable.recognized, true);
assert.equal(parsedLabTable.formatId, "delimited_lab_table");
assert.equal(parsedLabTable.suggestedSourceKind, "laboratory_results");
assert.equal(parsedLabTable.itemCount, 2);
assert.match(parsedLabTable.outputText, /Sodium: 140 mmol\/L; ref 135-145/);
assert.equal(parsedLabTable.displayModel.type, "labs");
assert.equal(parsedLabTable.displayModel.groups[0].rows[0].emphasis, "normal");
assert.equal(parsedLabTable.displayModel.series[0].points[0].value, 140);
assert.ok(parsedLabTable.parsedCharacterCount < parsedLabTable.rawCharacterCount, "normalized laboratory text must not expand the paste");

const shortMedicationTable = "Medication\tStatus\nA\tGiven";
const parsedShortMedicationTable = parseClinicalExport(shortMedicationTable);
assert.equal(parsedShortMedicationTable.recognized, true);
assert.ok(parsedShortMedicationTable.parsedCharacterCount <= parsedShortMedicationTable.rawCharacterCount, "even a very short standard table must not expand after parsing");
assert.equal(parsedShortMedicationTable.displayModel.type, "medications", "compactness fallback must retain the clean display model");

const abnormalLabTable = [
  "Test\tValue\tUnits\tReference Range\tFlag\tCollected",
  "Potassium\t6.2\tmmol/L\t3.5-5.1\t\tHospital Day 2 06:00",
  "Hemoglobin\t7.1\tg/dL\t12-16\tL\tHospital Day 2 06:00",
  "Comment\tpending\t\t\t\tHospital Day 2 06:00"
].join("\n");
const parsedAbnormalLabs = parseClinicalExport(abnormalLabTable);
assert.equal(parsedAbnormalLabs.displayModel.groups[0].rows[0].emphasis, "high", "numeric values may be flagged only by a supplied parseable reference range");
assert.equal(parsedAbnormalLabs.displayModel.groups[0].rows[1].emphasis, "low", "an explicit source flag takes precedence");
assert.equal(parsedAbnormalLabs.displayModel.groups[0].rows[2].emphasis, "unknown", "non-numeric values without a source flag are not interpreted");

const narrative = "Assessment and plan:\nContinue the documented treatment and reassess tomorrow.";
const parsedNarrative = parseClinicalExport(narrative);
assert.equal(parsedNarrative.recognized, false);
assert.equal(parsedNarrative.outputText, narrative);
assert.match(parsedNarrative.summary, /Narrative text is intentionally not reorganized/);

const proseUnderResultsHeading = "Results\nAssessment: improving after fluids\nPlan: discharge tomorrow";
assert.equal(parseClinicalExport(proseUnderResultsHeading).recognized, false, "a Results heading alone must not turn narrative prose into laboratory data");
const resultsWithPlan = parseClinicalExport("Results\nSodium: 140\nPlan: 1 week follow-up");
assert.equal(resultsWithPlan.recognized, true);
assert.equal(resultsWithPlan.itemCount, 1, "a numeric plan line after a valid result must not become a laboratory row");
assert.doesNotMatch(resultsWithPlan.displayModel.groups[0].rows.map((row) => row.cells[0]).join("\n"), /^Plan$/m);
assert.match(resultsWithPlan.outputText, /Plan: 1 week follow-up/, "unparsed narrative remains visible instead of being silently removed");
const vitalLikeProse = "Blood pressure improved after fluids.\nHeart rate remains elevated.";
assert.equal(parseClinicalExport(vitalLikeProse).recognized, false, "vital-sign words without structured numeric values must stay narrative");

const primaryNoteWithEmbeddedResults = `Primary team note\nResults from EPIC:\n04/12/31 06:52\nWBC: 4.2 (L)\nHemoglobin: 10.1 (L)`;
const guardedPrimaryNote = parseClinicalExport(primaryNoteWithEmbeddedResults, { sourceKind: "primary_note" });
assert.equal(guardedPrimaryNote.recognized, false);
assert.equal(guardedPrimaryNote.intentionallySkipped, true);
assert.equal(guardedPrimaryNote.outputText, primaryNoteWithEmbeddedResults, "primary notes stay opaque even when they quote a standard results block");
const guardedPreparedNote = prepareClinicalExportForSave(primaryNoteWithEmbeddedResults, { recognized: true, edited: true, outputText: "wrong parsed text" }, { sourceKind: "primary_note" });
assert.equal(guardedPreparedNote.sourceText, primaryNoteWithEmbeddedResults, "the save boundary must not reuse an old parsed preview for a narrative source kind");

const syntheticEpicResults = `Results from EPIC:
04/12/31 06:52
WBC: 4.2 (L)
Hemoglobin: 10.1 (L)
HCG Beta Subunit - Qual: Negative

04/12/31 07:27
Crossmatch: Red Blood Cells: Rpt (P)

(L): Data is abnormally low
(P): Preliminary
Rpt: View report in Results Review for more information`;
const parsedEpicResults = parseClinicalExport(syntheticEpicResults);
assert.equal(parsedEpicResults.recognized, true);
assert.equal(parsedEpicResults.formatId, "epic_results");
assert.equal(parsedEpicResults.suggestedSourceKind, "laboratory_results");
assert.equal(parsedEpicResults.itemCount, 4);
assert.match(parsedEpicResults.outputText, /Collected\. 04\/12\/31 06:52/);
assert.match(parsedEpicResults.outputText, /Result\. Crossmatch: Red Blood Cells: Rpt \(P\)/);
assert.deepEqual(parsedEpicResults.flagDefinitions[0], { code: "L", meaning: "Data is abnormally low" });
assert.match(parsedEpicResults.outputText, /Reported flag definitions\.\nL: Data is abnormally low\nP: Preliminary/, "source flag meanings remain available in the output");
assert.equal(parsedEpicResults.displayModel.type, "labs");
assert.equal(parsedEpicResults.displayModel.groups[0].rows[0].emphasis, "low");
assert.equal(parsedEpicResults.displayModel.groups[0].rows[0].provenance.sourceSystem, "Epic");
// The structured "Laboratory and diagnostic results..." format with "Collected."
// headers and "Result." prefixes is intentionally longer than the raw paste —
// it distinguishes parsed results from unparsed text in the review UI.
assert.ok(parsedEpicResults.parsedCharacterCount > 0, "Epic results produce output");

const preparedEpicResults = prepareClinicalExportForSave(syntheticEpicResults);
assert.equal(preparedEpicResults.parseResult.formatId, "epic_results");
assert.equal(preparedEpicResults.sourceText, parsedEpicResults.canonicalPromptText, "the save boundary must persist the canonical representation so saved sources rebuild their display model");
assert.ok(preparedEpicResults.sourceText.startsWith("Labs"), "persisted Epic results use the rebuildable canonical Labs format");
assert.doesNotMatch(preparedEpicResults.sourceText, /Results from EPIC:/);
const reviewedEpicResults = prepareClinicalExportForSave(syntheticEpicResults, {
  ...parsedEpicResults,
  edited: true,
  outputText: "Clinician-reviewed structured result text."
});
assert.equal(reviewedEpicResults.sourceText, "Clinician-reviewed structured result text.", "submit-time parsing must preserve an edited structured preview");

const syntheticEpicResultsWithoutTimestamp = `Sodium: 137
Creatinine: 0.9
Specimen status: Pending`;
const parsedEpicResultsWithoutTimestamp = parseClinicalExport(syntheticEpicResultsWithoutTimestamp);
assert.equal(parsedEpicResultsWithoutTimestamp.recognized, false, "bare Label: value lines are not a standard export signature and must remain narrative");
assert.equal(parsedEpicResultsWithoutTimestamp.outputText, syntheticEpicResultsWithoutTimestamp);

const syntheticEpicMar = `1 Day\t3 Days\t7 Days\t<\tToday\t>
Legend:
&#x20;
Medications\t04/11/31\t04/12/31
syntheticacaine (TESTDRUG) 0.5 % injection
Freq: intraprocedure admin
Start: 04/12/31 0906
&#x9;0829 (30 mL) [C]&#x9;

Completed Medications
acetaminophen (TYLENOL) tablet 1,000 mg
Dose: 1,000 mg
Freq: once Route: PO
Start: 04/12/31 0530 End: 04/12/31 0634
Admin Instructions:
Maximum synthetic daily dose is documented in this test fixture.
&#9;0634 (1,000 mg)

Other Encounter
ceFAZolin (ANCEF) injection
Freq: intraprocedure admin Route: IV
&#x9;0801 (2 g)`;
const parsedEpicMar = parseClinicalExport(syntheticEpicMar);
assert.equal(parsedEpicMar.recognized, true);
assert.equal(parsedEpicMar.formatId, "epic_mar");
assert.equal(parsedEpicMar.suggestedSourceKind, "medication_activity");
assert.equal(parsedEpicMar.itemCount, 3);
assert.match(parsedEpicMar.outputText, /^Medications/);
assert.match(parsedEpicMar.outputText, /\[Completed Medications\] acetaminophen/);
assert.match(parsedEpicMar.outputText, /Dose: 1,000 mg \| Route: PO/);
assert.match(parsedEpicMar.outputText, /0829 \(30 mL\) \[C\]/);
assert.match(parsedEpicMar.outputText, /04\/12\/31 0829 \(30 mL\) \[C\]/, "an administration under a date column keeps that date");
assert.match(parsedEpicMar.outputText, /04\/12\/31 0634 \(1,000 mg\)/, "the dated administration matches the order start/end date");
assert.doesNotMatch(parsedEpicMar.outputText, /Maximum synthetic daily dose|Freq:|Start:|End:/);
assert.match(parsedEpicMar.outputText, /\[Other Encounter\] ceFAZolin/);
assert.doesNotMatch(parsedEpicMar.outputText, /&#x9;|1 Day|Legend:/);
assert.equal(parsedEpicMar.displayModel.type, "medications");
assert.ok(parsedEpicMar.parsedCharacterCount < parsedEpicMar.rawCharacterCount, "normalized Epic MAR text must not expand the paste");

const epicMarWithRateAndMetadata = `Medications\t09/18/26\t09/19/26\t09/20/26\t09/21/26
*NUTRITION Tube Feeding Continuous Formula Per NG Tube
Rate: 10-100 mL/hr
Freq: continuous Route: PER NG TUBE
Start: 09/17/26 0015
Order specific questions:
1218

calcium replacement IVPB
Dose: 2 g
Freq: every 12 hours PRN Route: IV
PRN Reason: Electrolyte Replacement
PRN Comment: for ionized calcium below goal
Start: 09/19/26 1225
1813

propofol infusion
Rate: 1.43-14.34 mL/hr Dose: 5-50 mcg/kg/min
Weight Dosing Info: 47.8 kg
Freq: titrated Route: IV
Start: 09/19/26 1500
1446 (25 mcg/kg/min)`;
const parsedEpicMarMetadata = parseClinicalExport(epicMarWithRateAndMetadata);
assert.equal(parsedEpicMarMetadata.itemCount, 3, "rate and PRN metadata rows must stay attached to their medications");
assert.deepEqual(parsedEpicMarMetadata.structuredData.groups[0].rows.map(({ name }) => name), [
  "*NUTRITION Tube Feeding Continuous Formula Per NG Tube",
  "calcium replacement IVPB",
  "propofol infusion"
]);
assert.equal(parsedEpicMarMetadata.structuredData.groups[0].rows[0].rate, "10-100 mL/hr");
assert.equal(parsedEpicMarMetadata.structuredData.groups[0].rows[0].asOfDate, "09/21/26");
assert.deepEqual(parsedEpicMarMetadata.displayModel.columns, ["Medication", "Current regimen", "Most recent administration", "Administration history"]);
assert.deepEqual(parsedEpicMarMetadata.displayModel.groups[0].rows[0].cells, [
  "*NUTRITION Tube Feeding Continuous Formula Per NG Tube",
  "rate 10-100 mL/hr · PER NG TUBE · continuous",
  "09/18/26 1218",
  "09/18/26 1218"
]);
assert.equal(parsedEpicMarMetadata.displayModel.groups[0].rows[1].medication.prnReason, "Electrolyte Replacement");
assert.equal(parsedEpicMarMetadata.displayModel.groups[0].rows[1].medication.prnComment, "for ionized calcium below goal");
assert.doesNotMatch(JSON.stringify(parsedEpicMarMetadata.displayModel), /Day 5/);
assert.equal(parsedEpicMarMetadata.preservedUnparsedText, false);
// Real save/reparse lifecycle: the vault persists
// prepareClinicalExportForSave(...).sourceText and reconstruction reads
// that persisted text — not the parser's internal prompt text.
const persistedEpicMarForSave = prepareClinicalExportForSave(epicMarWithRateAndMetadata, parsedEpicMarMetadata);
const savedEpicMarMetadata = clinicalDisplayModelFromPromptText("medication_activity", persistedEpicMarForSave.sourceText);
assert.ok(savedEpicMarMetadata, "the persisted Epic MAR text must rebuild a medication display model on reparse");
assert.deepEqual(savedEpicMarMetadata.columns, ["Medication", "Current regimen", "Most recent administration", "Administration history"]);
assert.deepEqual(savedEpicMarMetadata.groups[0].rows[0].cells, parsedEpicMarMetadata.displayModel.groups[0].rows[0].cells);
assert.deepEqual(savedEpicMarMetadata.groups[0].rows[1].medication, {
  name: "calcium replacement IVPB",
  dose: "2 g",
  rate: "",
  route: "IV",
  frequency: "every 12 hours PRN",
  timing: "",
  start: "",
  end: "",
  asOfDate: "",
  status: [],
  administrations: ["09/18/26 1813"],
  prnReason: "Electrolyte Replacement",
  prnComment: "for ionized calcium below goal",
  weightDosingInfo: ""
});

const savedNoisyLegacyMar = clinicalDisplayModelFromPromptText("medication_activity", `Medications
[Medications] PRN Comment: for K+ < 3.3 mEq/L — start 09/19/26 | 0420 (60 mEq)
[Medications] Order specific questions: —  | 0830
[PRN Medications] potassium chloride IVPB — 10 mEq; every 1 hour PRN; IV; Day 3 | 0420 (10 mEq)`);
assert.deepEqual(savedNoisyLegacyMar.groups.flatMap(({ rows }) => rows.map(({ cells }) => cells)), [[
  "potassium chloride IVPB",
  "10 mEq · IV · every 1 hour PRN",
  "0420 (10 mEq)",
  "0420 (10 mEq)"
]], "legacy saved MAR metadata must not be presented as medications");
assert.doesNotMatch(JSON.stringify(savedNoisyLegacyMar), /PRN Comment|Order specific questions|Day 3/);

const multiDayMar = `Medications\t09/20/26\t09/21/26\t09/22/26\t09/23/26
acetaminophen (TYLENOL) tablet 1,000 mg
Dose: 1,000 mg
Freq: every 6 hours Route: PER G TUBE
Start: 09/19/26 1530
Admin Instructions:
Maximum dose of acetaminophen is 4000 mg from all sources in 24 hours.
0418 (1,000 mg)
\t0951 (1,000 mg)
1431 (1,000 mg)
\t1813
2044
\t2213 (1,000 mg)`;
const parsedMultiDayMar = parseClinicalExport(multiDayMar);
const multiDayAdministrations = parsedMultiDayMar.displayModel.groups[0].rows[0].medication.administrations;
assert.deepEqual(multiDayAdministrations, [
  "09/20/26 0418 (1,000 mg)",
  "09/20/26 1431 (1,000 mg)",
  "09/20/26 2044",
  "09/21/26 0951 (1,000 mg)",
  "09/21/26 1813",
  "09/21/26 2213 (1,000 mg)"
], "each administration keeps the date of the column it was pasted under, in chronological order");
assert.equal(
  parsedMultiDayMar.displayModel.groups[0].rows[0].cells[2],
  "09/21/26 2213 (1,000 mg)",
  "the most recent administration is the chronologically latest dated event"
);
assert.match(parsedMultiDayMar.outputText, /Administrations: 09\/20\/26 0418 \(1,000 mg\)/);

// Epic positions each date column's administrations with a run of tab-only
// lines: the first run's tab count selects the date column (the Medications
// label column is column 1), and each later run advances exactly one column.
// Administration lines inherit that sticky column.
const stickyColumnMar = `Medications\t09/20/26\t09/21/26\t09/22/26\t09/23/26
thiamine (VITAMIN B-1) tablet 100 mg
Dose: 100 mg
Freq: 1 time daily Route: PER G TUBE
Start: 09/21/26 1000 End: 09/24/26 0959
\t\t
0900 (100 mg)
\t
\t
1039 (100 mg)
\t
\t
1000
\t
heparin 5000 units/mL injection 5,000 Units
Dose: 5,000 Units
Freq: 2 times daily Route: SC
Start: 09/21/26 2200
\t\t
2108 (5,000 Units)
\t
\t
1039 (5,000 Units)
\t2110 (5,000 Units)

*NUTRITION Modular Supplement Prosource TF20; 1 packet Per NG Tube
Freq: 2 times daily Route: PER NG TUBE
Start: 09/23/26 1000
Order specific questions:
\t\t\t\t
1000
\t2200

Completed Medications
alteplase (CATHFLO) 1 mg in sterile water 1 mL syringe for catheter clearance
Dose: 1 mg
Freq: once Route: INTRACATHETE
Start: 09/21/26 2215 End: 09/21/26 2215
\t\t
2215 (1 mg) [C]
\t
\t`;
const parsedStickyColumnMar = parseClinicalExport(stickyColumnMar);
const stickyRows = parsedStickyColumnMar.displayModel.groups.flatMap((group) => group.rows);
assert.deepEqual(
  stickyRows.find((row) => row.medication.name.startsWith("thiamine")).medication.administrations,
  ["09/21/26 0900 (100 mg)", "09/22/26 1039 (100 mg)", "09/23/26 1000"],
  "a daily medication's administrations advance one date column per separator run"
);
assert.deepEqual(
  stickyRows.find((row) => row.medication.name.startsWith("heparin")).medication.administrations,
  ["09/21/26 2108 (5,000 Units)", "09/22/26 1039 (5,000 Units)", "09/22/26 2110 (5,000 Units)"],
  "administrations sharing a column keep that column's date"
);
assert.deepEqual(
  stickyRows.find((row) => row.medication.name.startsWith("*NUTRITION Modular")).medication.administrations,
  ["09/23/26 1000", "09/23/26 2200"],
  "the first separator run's tab count selects the date column and administration lines ignore their own tabs"
);
assert.deepEqual(
  stickyRows.find((row) => row.medication.name.startsWith("alteplase")).medication.administrations,
  ["09/21/26 2215 (1 mg) [C]"],
  "completed medications use the same grid positioning"
);
assert.equal(
  stickyRows.find((row) => row.medication.name.startsWith("thiamine")).cells[2],
  "09/23/26 1000",
  "the most recent administration follows the sticky column dates"
);
assert.equal(parsedStickyColumnMar.preservedUnparsedText, false, "tab-only separator lines must not leak into unparsed text");

const syntheticEpicMarMissingFields = `Medications
ondansetron (ZOFRAN) injection
Route: IV
0815 (4 mg)`;
const parsedEpicMarMissingFields = parseClinicalExport(syntheticEpicMarMissingFields);
assert.equal(parsedEpicMarMissingFields.recognized, true, "a partial medication block must not require dose, frequency, start, or end lines");
assert.match(parsedEpicMarMissingFields.outputText, /IV[\s\S]*0815 \(4 mg\)/);
assert.doesNotMatch(parsedEpicMarMissingFields.outputText, /undefined|null/);

const syntheticSingleEpicMarRow = `Medications 04/12/31
furosemide (LASIX) tablet 20 mg
Freq: daily`;
const parsedSingleEpicMarRow = parseClinicalExport(syntheticSingleEpicMarRow);
assert.equal(parsedSingleEpicMarRow.recognized, true, "an Epic medication date header can identify a single sparse medication row");
assert.equal(parsedSingleEpicMarRow.itemCount, 1);
assert.match(parsedSingleEpicMarRow.outputText, /furosemide[\s\S]*daily/);

const syntheticEpicVitals = `Vitals
&#x9;Temperature&#x9;&#x9;37.1 (9...&#x9;36.9 (...)&#x9;Temperature&#x9;
&#x9;Source&#x9;&#x9;Oral&#x9;Source&#x9;
&#x9;Pulse&#x9;&#x9;82&#x9;Pulse&#x9;
&#x9;Blood Pressure (cuff)&#x9;&#x9;117/72&#x9;Blood Pressure (cuff)&#x9;
&#x9;SpO2 (%)&#x9;&#x9;99&#x9;SpO2 (%)&#x9;
&#x9;O2 Device&#x9;&#x9;None (R...&#x9;O2 Device&#x9;`;
const parsedEpicVitals = parseClinicalExport(syntheticEpicVitals);
assert.equal(parsedEpicVitals.recognized, true);
assert.equal(parsedEpicVitals.formatId, "epic_vitals");
assert.equal(parsedEpicVitals.suggestedSourceKind, "vital_signs");
assert.equal(parsedEpicVitals.itemCount, 6);
assert.match(parsedEpicVitals.outputText, /Temp 37\.1 \(9\.\.\. \| 36\.9 \(\.\.\.\)/);
assert.match(parsedEpicVitals.outputText, /BP 117\/72/);
assert.match(parsedEpicVitals.outputText, /O2 Device None \(R\.\.\./);
assert.doesNotMatch(parsedEpicVitals.outputText, /&#x9;/);
assert.equal(parsedEpicVitals.displayModel.type, "vitals");
assert.ok(parsedEpicVitals.parsedCharacterCount < parsedEpicVitals.rawCharacterCount, "normalized Epic vitals must not expand the paste");

const syntheticEpicVitalsMissingHeader = `Pulse 76 Pulse
Respirations 16 Respirations
SpO2 (%) 100 SpO2 (%)`;
const parsedEpicVitalsMissingHeader = parseClinicalExport(syntheticEpicVitalsMissingHeader);
assert.equal(parsedEpicVitalsMissingHeader.recognized, true, "repeated Epic vital labels are sufficient when the Vitals heading was omitted");
assert.equal(parsedEpicVitalsMissingHeader.itemCount, 3);

const compactEpicVitals = "Vitals\nHR 70\nBP 120/80";
const parsedCompactEpicVitals = parseClinicalExport(compactEpicVitals);
assert.equal(parsedCompactEpicVitals.recognized, true, "standard abbreviated numeric vitals are structured");
assert.ok(parsedCompactEpicVitals.parsedCharacterCount <= parsedCompactEpicVitals.rawCharacterCount, "short structured vital text must never expand after parsing");

const wideEpicVitals = `| Date/TimeTempPulseHeart Rate (Monitored)RespBPMAPArterial BPMAPSpO2$ O2 DeviceO2 Flow Rate (l/min)FiO2 (%)Weight | | | | | | | | | | | | | |
| --- | --- | - | -- | ------ | ------ | -------- | - | - | ----- | ---------- | - | ---- | - |
| 09/21/26 0600 | 36.5 °C (97.7 °F) | — | 72 | 18 | 119/77 | 93 mmHg | — | — | 99 % | Ventilator | — | 30 % | — |
| 09/21/26 0500 | 36.3 °C (97.3 °F) | — | 73 | 18 | 117/76 | 92 mmHg | — | — | 100 % | — | — | — | — |
| 09/20/26 2300 | 35.6 °C (96.1 °F) | — | 77 | 19 | 112/77 | 90 mmHg | — | — | 100 % | — | — | — | — |`;
const parsedWideEpicVitals = parseClinicalExport(wideEpicVitals);
assert.equal(parsedWideEpicVitals.formatId, "epic_wide_vitals");
assert.equal(parsedWideEpicVitals.structuredData.groups.length, 3);
assert.ok(parsedWideEpicVitals.structuredData.groups[0].rows.some(({ name, value }) => name === "Systolic BP" && value === "119"));
assert.deepEqual(parsedWideEpicVitals.displayModel.series.find(({ name }) => name === "Temperature").points.map(({ timestamp }) => timestamp), [
  "09/20/26 2300",
  "09/21/26 0500",
  "09/21/26 0600"
], "vital graphs must run chronologically even when Epic copies newest first");
const temperatureSummary = parsedWideEpicVitals.displayModel.statistics24h.find(({ name }) => name === "Temperature");
assert.deepEqual(temperatureSummary, { name: "Temperature", unit: "°C", count: 3, minimum: 35.6, maximum: 36.5, mean: 36.1, median: 36.3 });
// Real save/reparse lifecycle: reconstruction reads the persisted
// prepareClinicalExportForSave(...).sourceText, not the parser output.
const persistedWideEpicVitals = prepareClinicalExportForSave(wideEpicVitals, parsedWideEpicVitals);
const savedWideEpicVitals = clinicalDisplayModelFromPromptText("vital_signs", persistedWideEpicVitals.sourceText);
assert.ok(savedWideEpicVitals, "the persisted wide Epic vitals must rebuild a vital display model on reparse");
assert.ok(savedWideEpicVitals.series.some(({ name }) => name === "Heart Rate (Monitored)"), "saved vital display must retain monitored heart rate");
assert.ok(savedWideEpicVitals.series.some(({ name }) => name === "Systolic BP"), "saved vital display must retain separated blood pressure trends");
assert.ok(savedWideEpicVitals.series.some(({ name }) => name === "FiO2"), "saved vital display must retain oxygen settings");

const collapsedHeaderVitals = `| Date/timeTempHRBPRRSpO₂OxygenPain | | | | | | | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 09/18 14:38 | 101.8°F | 112 | 108/66 | 24 | 88% | Room air | 4/10 |
| 09/18 15:05 | 101.2°F | 106 | 110/68 | 22 | 95% | NC 2 L/min | 3/10 |`;
const parsedCollapsedHeaderVitals = parseClinicalExport(collapsedHeaderVitals);
assert.equal(parsedCollapsedHeaderVitals.formatId, "epic_wide_vitals", "collapsed Markdown vital headers must be recovered despite blank placeholder cells");
assert.equal(parsedCollapsedHeaderVitals.structuredData.groups.length, 2, "month/day timestamps without a copied year must remain recognizable");
assert.ok(parsedCollapsedHeaderVitals.structuredData.groups[0].rows.some(({ name, value, unit }) => name === "Temperature" && value === "101.8" && unit === "°F"));
assert.ok(parsedCollapsedHeaderVitals.structuredData.groups[0].rows.some(({ name, value }) => name === "Heart Rate" && value === "112"));
assert.ok(parsedCollapsedHeaderVitals.structuredData.groups[0].rows.some(({ name, value }) => name === "SpO2" && value === "88"));

const collapsedHeaderLabs = `| Test NameResultUnitsReference RangeFlagCollected | | | | | |
| --- | --- | --- | --- | --- | --- |
| WBC | 12.1 | 10*3/uL | 4.0-10.0 | H | 09/18 14:38 |`;
const parsedCollapsedHeaderLabs = parseClinicalExport(collapsedHeaderLabs);
assert.equal(parsedCollapsedHeaderLabs.formatId, "delimited_lab_table");
assert.equal(parsedCollapsedHeaderLabs.structuredData.groups[0].rows[0].name, "WBC");

const wideCollapsedHeaderLabs = `| Test09/18 14:5209/19 05:1809/20 05:41Reference | | | | |
| --- | --- | --- | --- | --- |
| WBC | 14.8 H | 11.6 H | 8.9 | 4.0–11.0 K/µL |
| Sodium | 134 L | 137 | 139 | 135–145 mmol/L |
| Lactate | 1.6 | — | — | 0.5–2.2 mmol/L |
| Procalcitonin | 0.34 H | — | — | <0.10 ng/mL |`;
const parsedWideCollapsedHeaderLabs = parseClinicalExport(wideCollapsedHeaderLabs);
assert.equal(parsedWideCollapsedHeaderLabs.formatId, "wide_lab_matrix");
assert.equal(parsedWideCollapsedHeaderLabs.suggestedSourceKind, "laboratory_results");
assert.equal(parsedWideCollapsedHeaderLabs.itemCount, 8, "em dashes represent empty cells rather than laboratory values");
const wideWbc = parsedWideCollapsedHeaderLabs.structuredData.groups.flatMap(({ rows }) => rows).find(({ name, sourceIndex }) => name === "WBC" && sourceIndex === 2);
assert.deepEqual({ value: wideWbc.value, flag: wideWbc.flag, unit: wideWbc.unit, referenceRange: wideWbc.referenceRange }, {
  value: "14.8",
  flag: "H",
  unit: "K/µL",
  referenceRange: "4.0–11.0"
});
assert.deepEqual([...new Set(parsedWideCollapsedHeaderLabs.structuredData.groups.map(({ timestamp }) => timestamp))], ["09/18 14:52", "09/19 05:18", "09/20 05:41"]);

const collapsedHeaderMar = `| MedicationDoseRouteFrequencyAdministration Status | | | | |
| --- | --- | --- | --- | --- |
| ceftriaxone | 1 g | IV | every 24 hours | Given |`;
const parsedCollapsedHeaderMar = parseClinicalExport(collapsedHeaderMar);
assert.equal(parsedCollapsedHeaderMar.formatId, "delimited_medication_table");
assert.equal(parsedCollapsedHeaderMar.structuredData.groups[0].rows[0].name, "ceftriaxone");

const fragmentedCell = (value = "") => `|   |
| - |

${value}`;
const fragmentedLabsAndVitals = [
  fragmentedCell("Latest Reference Range & Units"),
  fragmentedCell("09/21/26 04:03"),
  fragmentedCell("09/21/26 11:22"),
  fragmentedCell("WBC4.0 - 10.0 10\\*3/uL"),
  fragmentedCell("**10.4 (H)**"),
  fragmentedCell("**10.9 (H)**"),
  fragmentedCell("Hemoglobin11.2 - 15.7 g/dL"),
  fragmentedCell("**6.5 (LL)**"),
  fragmentedCell("**7.9 (L)**"),
  fragmentedCell("Sodium136 - 145 mmol/L"),
  fragmentedCell("**150 (H)**"),
  fragmentedCell("**147 (H)**"),
  fragmentedCell("Creatinine0.5 - 1.0 mg/dL"),
  fragmentedCell("0.5"),
  fragmentedCell("0.5")
].join("\n\n") + `\n\n${wideEpicVitals}`;
const parsedFragmentedLabsAndVitals = parseClinicalExport(fragmentedLabsAndVitals);
assert.equal(parsedFragmentedLabsAndVitals.formatId, "epic_mixed_fragmented_labs_vitals");
assert.deepEqual(parsedFragmentedLabsAndVitals.sections.map(({ sourceKind, formatLabel }) => [sourceKind, formatLabel]), [
  ["laboratory_results", "CBC · 09/21/26 04:03"],
  ["laboratory_results", "Basic metabolic panel · 09/21/26 04:03"],
  ["laboratory_results", "CBC · 09/21/26 11:22"],
  ["laboratory_results", "Basic metabolic panel · 09/21/26 11:22"],
  ["vital_signs", "Epic vital-sign flowsheet"]
], "fragmented Epic labs must become separate timestamped panel sources before saving");
assert.deepEqual(
  parsedFragmentedLabsAndVitals.sections.slice(0, 4).map((section) => section.structuredData.groups.map(({ label, timestamp }) => ({ label, timestamp }))),
  [
    [{ label: "CBC", timestamp: "09/21/26 04:03" }],
    [{ label: "Basic metabolic panel", timestamp: "09/21/26 04:03" }],
    [{ label: "CBC", timestamp: "09/21/26 11:22" }],
    [{ label: "Basic metabolic panel", timestamp: "09/21/26 11:22" }]
  ]
);
assert.equal(parsedFragmentedLabsAndVitals.sections[0].structuredData.groups[0].rows[0].unit, "10*3/uL");
assert.equal(parsedFragmentedLabsAndVitals.sections[0].structuredData.groups[0].rows[1].flag, "LL");
const deidentifiedWideEpicVitals = deidentifyTextStructuredOnly(persistedWideEpicVitals.sourceText, new Date("2026-09-17T00:00:00")).text;
const savedDeidentifiedWideEpicVitals = clinicalDisplayModelFromPromptText("vital_signs", deidentifiedWideEpicVitals);
assert.deepEqual(savedDeidentifiedWideEpicVitals.series.find(({ name }) => name === "Temperature").points.map(({ timestamp }) => timestamp), [
  "[Hospital Day 4 at 23:00]",
  "[Hospital Day 5 at 05:00]",
  "[Hospital Day 5 at 06:00]"
], "de-identified hospital-day timestamps must remain chronological");
assert.equal(savedDeidentifiedWideEpicVitals.series.find(({ name }) => name === "Temperature").unit, "°C");
assert.equal(savedDeidentifiedWideEpicVitals.statistics24h.find(({ name }) => name === "Systolic BP").unit, "mmHg");
const admissionDayDeidentifiedVitals = deidentifyTextStructuredOnly(persistedWideEpicVitals.sourceText, new Date("2026-09-21T00:00:00")).text;
const admissionDaySavedVitals = clinicalDisplayModelFromPromptText("vital_signs", admissionDayDeidentifiedVitals);
assert.match(admissionDayDeidentifiedVitals, /\[1 day prior to hospital admission at 23:00\]/);
assert.deepEqual(admissionDaySavedVitals.statistics24h, parsedWideEpicVitals.displayModel.statistics24h, "pre-admission times within the latest 24 hours must remain in saved statistics");
assert.equal(
  deidentifyTextStructuredOnly("Swish in mouth undiluted for 30 seconds, expel remainder.", new Date("2026-09-21T00:00:00")).text,
  "Swish in mouth undiluted for 30 seconds, expel remainder.",
  "medication instruction durations must not become timeline dates"
);

assert.deepEqual(
  laboratoryAbnormality({ value: "<3.5", referenceRange: "3.5-5.1" }),
  { status: "low", basis: "reference_range_bound", flag: "" },
  "a comparator can be classified only when its full bound is outside the supplied range"
);
assert.equal(laboratoryAbnormality({ value: "<4.0", referenceRange: "3.5-5.1" }).status, "unknown", "an overlapping comparator bound is indeterminate");
assert.equal(laboratoryAbnormality({ value: "<=3.5", referenceRange: "3.5-5.1" }).status, "unknown", "an inclusive comparator at the lower boundary includes a normal value");
assert.equal(laboratoryAbnormality({ value: ">=5.1", referenceRange: "3.5-5.1" }).status, "unknown", "an inclusive comparator at the upper boundary includes a normal value");
assert.equal(laboratoryAbnormality({ value: "<=3.4", referenceRange: "3.5-5.1" }).status, "low");
assert.equal(laboratoryAbnormality({ value: ">=5.2", referenceRange: "3.5-5.1" }).status, "high");

const splitUnitModel = clinicalDataModel({
  kind: "laboratory_results",
  sourceSystem: "Synthetic",
  formatId: "synthetic",
  formatLabel: "Synthetic",
  groups: [
    { id: "one", label: "First", timestamp: "Day 1", rows: [{ id: "one", name: "Glucose", value: "100", unit: "mg/dL" }] },
    { id: "two", label: "Second", timestamp: "Day 2", rows: [{ id: "two", name: "Glucose", value: "5.5", unit: "mmol/L" }] },
    { id: "three", label: "Third", timestamp: "Day 3", rows: [{ id: "three", name: "Glucose", value: "<4", unit: "mmol/L" }] }
  ]
});
const splitUnitSeries = clinicalDisplayModel(splitUnitModel).series;
assert.equal(splitUnitSeries.length, 2, "same-name observations with different units must not share a trend");
assert.deepEqual(splitUnitSeries.map((series) => series.unit).sort(), ["mg/dL", "mmol/L"]);
assert.equal(splitUnitSeries.find((series) => series.unit === "mmol/L").points.length, 1, "comparator values are omitted from numeric trends");

// Real save/reparse lifecycle: reconstruction reads the persisted
// prepareClinicalExportForSave(...).sourceText, not the parser's internal
// prompt text.
const persistedEpicResults = prepareClinicalExportForSave(syntheticEpicResults, parsedEpicResults);
const savedLabDisplay = clinicalDisplayModelFromPromptText("laboratory_results", persistedEpicResults.sourceText);
assert.ok(savedLabDisplay, "the persisted Epic lab text must rebuild a lab display model on reparse");
assert.equal(savedLabDisplay.type, "labs");
assert.equal(savedLabDisplay.groups[0].rows[0].emphasis, "low", "saved de-identified lab text reconstructs its clean display without retaining raw source data");
// Full lifecycle: save preparation -> de-identification -> persisted safe
// output -> reconstruction, the same path review-data takes.
const deidentifiedPersistedEpicResults = deidentifyTextStructuredOnly(persistedEpicResults.sourceText, new Date("2026-09-17T00:00:00")).text;
const rebuiltDeidentifiedLabDisplay = clinicalDisplayModelFromPromptText("laboratory_results", deidentifiedPersistedEpicResults);
assert.ok(rebuiltDeidentifiedLabDisplay?.groups?.length, "de-identified persisted Epic labs must still rebuild their display model");
const compactFallbackLabs = "Results\n9/20/26\nW: 1\n9/21/26\nW: 2";
const parsedCompactFallbackLabs = parseClinicalExport(compactFallbackLabs);
assert.equal(parsedCompactFallbackLabs.usedSourceTextForCompactness, true);
assert.equal(parsedCompactFallbackLabs.outputText, compactFallbackLabs, "parser output length contract may retain shorter source text");
assert.match(parsedCompactFallbackLabs.canonicalPromptText, /^Labs\n@ 9\/20\/26/);
const preparedCompactFallbackLabs = prepareClinicalExportForSave(compactFallbackLabs);
assert.equal(preparedCompactFallbackLabs.sourceText, parsedCompactFallbackLabs.canonicalPromptText, "recognized lab saves must use the canonical representation so collection navigation survives");
assert.equal(clinicalDisplayModelFromPromptText("laboratory_results", preparedCompactFallbackLabs.sourceText).groups.length, 2);
const persistedEpicVitals = prepareClinicalExportForSave(syntheticEpicVitals, parsedEpicVitals);
const savedVitalDisplay = clinicalDisplayModelFromPromptText("vital_signs", persistedEpicVitals.sourceText);
assert.equal(savedVitalDisplay.type, "vitals");
assert.ok(savedVitalDisplay.groups[0].rows.some((row) => row.cells[1] === "Pulse"));
const persistedEpicMar = prepareClinicalExportForSave(syntheticEpicMar, parsedEpicMar);
const savedMedicationDisplay = clinicalDisplayModelFromPromptText("medication_activity", persistedEpicMar.sourceText);
assert.equal(savedMedicationDisplay.type, "medications");
assert.ok(savedMedicationDisplay.groups.some((group) => group.rows.some((row) => row.cells[0].includes("acetaminophen"))));

const syntheticMixedEpic = `${syntheticEpicResults}
This is the MAR:
${syntheticEpicMar}
Vitals:
${syntheticEpicVitals}`;
const parsedMixedEpic = parseClinicalExport(syntheticMixedEpic);
assert.equal(parsedMixedEpic.recognized, true);
assert.equal(parsedMixedEpic.formatId, "epic_mixed_export", "one Epic paste containing results, MAR, and vitals must be split before de-identification");
assert.equal(parsedMixedEpic.sections.length, 3);
assert.deepEqual(parsedMixedEpic.sections.map((section) => section.sourceKind), ["laboratory_results", "medication_activity", "vital_signs"]);
assert.deepEqual(parsedMixedEpic.sections.map((section) => section.itemCount), [4, 3, 6]);
assert.equal(parsedMixedEpic.preservedUnparsedText, false);
assert.doesNotMatch(parsedMixedEpic.sections[0].outputText, /Medication activity|Vital signs/);
assert.doesNotMatch(parsedMixedEpic.sections[1].outputText, /WBC:|Temperature\./);
assert.doesNotMatch(parsedMixedEpic.sections[2].outputText, /WBC:|Medication activity/);

const syntheticMixedEpicMissingHeadings = `Sodium: 137
Creatinine: 0.9
${syntheticEpicMar}
${syntheticEpicVitalsMissingHeader}`;
const parsedMixedEpicMissingHeadings = parseClinicalExport(syntheticMixedEpicMissingHeadings);
assert.equal(parsedMixedEpicMissingHeadings.formatId, "epic_mixed_export", "recognized MAR and vital tables may still be split from opaque leading text");
assert.deepEqual(parsedMixedEpicMissingHeadings.sections.map((section) => section.sourceKind), ["other_chart_text", "medication_activity", "vital_signs"]);
assert.equal(parsedMixedEpicMissingHeadings.sections[0].outputText, "Sodium: 137\nCreatinine: 0.9", "unheaded result-like text must remain opaque");

const preparedMixedEpic = prepareClinicalExportForSave(syntheticMixedEpic);
assert.equal(preparedMixedEpic.parseResult.sections.length, 3, "the submit boundary must retain all typed sections without relying on an input event");
assert.equal(preparedMixedEpic.sourceText, parsedMixedEpic.outputText);

// P6: strict source-aware plain-line labs — known analytes with numeric
// values parse; colon-form narrative lines stay plain text.
{
  const plainLabs = parseClinicalExport("K 5.8 (H)\nWBC 14.2\nHgb 9.8 (L)\nNa 140\nCr 2.1 (H)", { sourceKind: "laboratory_results" });
  assert.equal(plainLabs.formatId, "plain_line_labs");
  const labRows = clinicalDisplayModelFromPromptText("laboratory_results", plainLabs.canonicalPromptText || plainLabs.outputText).groups[0].rows;
  const rowNames = labRows.map((row) => row.cells[0]);
  for (const expected of ["Potassium", "WBC", "Hgb", "Sodium", "Creatinine"]) {
    assert.ok(rowNames.some((name) => new RegExp(expected, "i").test(name)), `plain-line lab parsed: ${expected}`);
  }
  const colonForm = parseClinicalExport("Sodium: 137\nCreatinine: 0.9", { sourceKind: "laboratory_results" });
  assert.notEqual(colonForm.formatId, "plain_line_labs", "colon-form narrative lines must stay plain text");
}

// P7: blood-gas analytes including a negative base excess.
{
  const abg = parseClinicalExport("pH 7.28\npCO2 48\npO2 82\nbase excess -4.2\nlactate 2.0", { sourceKind: "laboratory_results" });
  assert.equal(abg.formatId, "plain_line_labs");
  const abgRows = clinicalDisplayModelFromPromptText("laboratory_results", abg.canonicalPromptText || abg.outputText).groups[0].rows;
  const abgByName = Object.fromEntries(abgRows.map((row) => [row.cells[0].toLowerCase(), row.cells[1]]));
  assert.equal(abgByName["ph"], "7.28");
  assert.equal(abgByName["pco2"], "48");
  assert.equal(abgByName["po2"], "82");
  assert.equal(abgByName["base excess"], "-4.2", "a negative base excess must survive parsing");
  assert.ok(Object.keys(abgByName).some((name) => /lactate/i.test(name)));
}

// P8: inline units and flags parse; a bare "Reference"/"Ref" header line is
// tolerated, not parsed as a lab.
{
  const inlineUnits = parseClinicalExport("K 5.8 mmol/L (H)\nNa 140\nReference\nWBC 14.2", { sourceKind: "laboratory_results" });
  assert.equal(inlineUnits.formatId, "plain_line_labs");
  const inlineRows = clinicalDisplayModelFromPromptText("laboratory_results", inlineUnits.canonicalPromptText || inlineUnits.outputText).groups[0].rows;
  assert.equal(inlineRows.length, 3, "the Reference header must not become a lab row");
  const potassium = inlineRows.find((row) => /potassium/i.test(row.cells[0]));
  assert.ok(potassium, "potassium row present");
  assert.match(potassium.cells[1], /5\.8 mmol\/L/, "inline unit captured");
}

// P9: strict plain-line medications only for medication_activity sources.
{
  const medKind = parseClinicalExport("Lisinopril 10mg PO daily\nMetoprolol 25mg PO BID", { sourceKind: "medication_activity" });
  assert.equal(medKind.formatId, "plain_line_medications");
  const labKind = parseClinicalExport("Lisinopril 10mg PO daily\nMetoprolol 25mg PO BID", { sourceKind: "laboratory_results" });
  assert.notEqual(labKind.formatId, "plain_line_medications", "medication lines must not parse as labs under a lab sourceKind");
}

console.log("clinical export parser tests passed");
