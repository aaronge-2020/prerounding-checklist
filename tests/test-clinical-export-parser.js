import assert from "node:assert/strict";
import { parseClinicalExport } from "../src/patient-context/clinical-export-parser.js";

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
assert.match(parsedMar.outputText, /Administration or order status\. GIVEN Hospital Day 2@10:05:00 xyz; DISCONTINUED/);
assert.match(parsedMar.outputText, /Special instructions\. Use for synthetic mild pain/);
assert.doesNotMatch(parsedMar.outputText, /RPH:|={10,}|\| \|/);

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
assert.match(parsedMixed.outputText, /Temperature\. 98\.6; Pulse\. 72/);
assert.match(parsedMixed.outputText, /SODIUM 139 mmol\/L 135 - 145/);
assert.match(parsedMixed.outputText, /This synthetic narrative remains exactly available/);
assert.match(parsedMixed.outputText, /Free-form plans are not automatically classified/);
assert.doesNotMatch(parsedMixed.outputText, /Test Name Result Units Range/);

const syntheticLabTable = [
  "Component\tResult\tUnits\tReference Range\tCollected",
  "Sodium\t140\tmmol/L\t135-145\tHospital Day 2 06:00",
  "Creatinine\t1.2\tmg/dL\t0.6-1.3\tHospital Day 2 06:00"
].join("\n");
const parsedLabTable = parseClinicalExport(syntheticLabTable);
assert.equal(parsedLabTable.recognized, true);
assert.equal(parsedLabTable.formatId, "delimited_lab_table");
assert.equal(parsedLabTable.suggestedSourceKind, "results");
assert.equal(parsedLabTable.itemCount, 2);
assert.match(parsedLabTable.outputText, /Component\. Sodium; Result\. 140; Units\. mmol\/L/);

const narrative = "Assessment and plan:\nContinue the documented treatment and reassess tomorrow.";
const parsedNarrative = parseClinicalExport(narrative);
assert.equal(parsedNarrative.recognized, false);
assert.equal(parsedNarrative.outputText, narrative);
assert.match(parsedNarrative.summary, /Narrative text is intentionally not reorganized/);

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
assert.equal(parsedEpicResults.suggestedSourceKind, "results");
assert.equal(parsedEpicResults.itemCount, 4);
assert.match(parsedEpicResults.outputText, /Collected\. 04\/12\/31 06:52/);
assert.match(parsedEpicResults.outputText, /Result\. Crossmatch: Red Blood Cells: Rpt \(P\)/);
assert.match(parsedEpicResults.outputText, /Reported flag definitions\.[\s\S]*L: Data is abnormally low[\s\S]*Rpt: View report/);

const syntheticEpicResultsWithoutTimestamp = `Sodium: 137
Creatinine: 0.9
Specimen status: Pending`;
const parsedEpicResultsWithoutTimestamp = parseClinicalExport(syntheticEpicResultsWithoutTimestamp);
assert.equal(parsedEpicResultsWithoutTimestamp.recognized, true, "Epic results remain usable if the collection timestamp was not copied");
assert.match(parsedEpicResultsWithoutTimestamp.outputText, /Collected\. Not included in pasted source\./);
assert.equal(parsedEpicResultsWithoutTimestamp.itemCount, 3);

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
assert.match(parsedEpicMar.outputText, /Medication activity parsed from Epic MAR/);
assert.match(parsedEpicMar.outputText, /MAR section\. Completed Medications/);
assert.match(parsedEpicMar.outputText, /Frequency\. once\nRoute\. PO/);
assert.match(parsedEpicMar.outputText, /Administration\. 0829 \(30 mL\) \[C\]/);
assert.match(parsedEpicMar.outputText, /Admin instructions\. Maximum synthetic daily dose/);
assert.match(parsedEpicMar.outputText, /MAR section\. Other Encounter[\s\S]*ceFAZolin/);
assert.doesNotMatch(parsedEpicMar.outputText, /&#x9;|1 Day|Legend:/);

const syntheticEpicMarMissingFields = `Medications
ondansetron (ZOFRAN) injection
Route: IV
0815 (4 mg)`;
const parsedEpicMarMissingFields = parseClinicalExport(syntheticEpicMarMissingFields);
assert.equal(parsedEpicMarMissingFields.recognized, true, "a partial medication block must not require dose, frequency, start, or end lines");
assert.match(parsedEpicMarMissingFields.outputText, /Route\. IV[\s\S]*Administration\. 0815 \(4 mg\)/);
assert.doesNotMatch(parsedEpicMarMissingFields.outputText, /Dose\.|Frequency\.|Start\.|End\./);

const syntheticSingleEpicMarRow = `Medications 04/12/31
furosemide (LASIX) tablet 20 mg
Freq: daily`;
const parsedSingleEpicMarRow = parseClinicalExport(syntheticSingleEpicMarRow);
assert.equal(parsedSingleEpicMarRow.recognized, true, "an Epic medication date header can identify a single sparse medication row");
assert.equal(parsedSingleEpicMarRow.itemCount, 1);
assert.match(parsedSingleEpicMarRow.outputText, /Medication 1\. furosemide[\s\S]*Frequency\. daily/);

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
assert.equal(parsedEpicVitals.suggestedSourceKind, "results");
assert.equal(parsedEpicVitals.itemCount, 6);
assert.match(parsedEpicVitals.outputText, /Temperature\. 37\.1 \(9\.\.\. \| 36\.9 \(\.\.\.\)\. Copied value appears truncated\./);
assert.match(parsedEpicVitals.outputText, /Blood Pressure \(cuff\)\. 117\/72/);
assert.match(parsedEpicVitals.outputText, /O2 Device\. None \(R\.\.\.\. Copied value appears truncated\./);
assert.doesNotMatch(parsedEpicVitals.outputText, /&#x9;/);

const syntheticEpicVitalsMissingHeader = `Pulse 76 Pulse
Respirations 16 Respirations
SpO2 (%) 100 SpO2 (%)`;
const parsedEpicVitalsMissingHeader = parseClinicalExport(syntheticEpicVitalsMissingHeader);
assert.equal(parsedEpicVitalsMissingHeader.recognized, true, "repeated Epic vital labels are sufficient when the Vitals heading was omitted");
assert.equal(parsedEpicVitalsMissingHeader.itemCount, 3);

console.log("clinical export parser tests passed");
