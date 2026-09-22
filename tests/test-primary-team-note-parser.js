import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parsePrimaryTeamNote,
  extractFirstSentence,
  parseClinicalPlanProblems
} from "../src/patient-context/primary-team-note-parser.js";

const fixtureDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "primary-team-notes");
const fixture = (name) => fs.readFileSync(path.join(fixtureDirectory, name), "utf8");

function assertMostlyLossless(source, parsed, label) {
  assert.ok(parsed.recognized, `${label} should recognize explicit note headings`);
  assert.ok(parsed.parsedCharacterCount / parsed.sourceCharacterCount > 0.93, `${label} should retain source content instead of summarizing it`);
}

const progressTeamNote = fixture("progress-team-note.txt");
const progressParsed = parsePrimaryTeamNote(progressTeamNote, "progress");
assertMostlyLossless(progressTeamNote, progressParsed, "progress-team note");
assert.match(progressParsed.sections.one_liner, /40 y\/o F with prior stroke and L sided deficits who presented with completed R MCA\/ACA stroke with malignant edema s\/p DHC/);
assert.match(progressParsed.sections.interval_events, /No acute overnight events/);
assert.match(progressParsed.sections.medications, /NUTRITION Tube Feeding/);
assert.match(progressParsed.sections.physical_exam, /Sedated, not following commands/);
assert.match(progressParsed.sections.objective, /Sodium[ |]+150/);
assert.match(progressParsed.sections.objective, /midline shift/);
assert.match(progressParsed.sections.plan, /Right MCA\/ACA/);
assert.match(progressParsed.sections.lda, /Patient Lines\/Drains\/Airways Status/);
assert.doesNotMatch(progressParsed.sections.plan, /Patient Lines\/Drains\/Airways Status/);
assert.doesNotMatch(progressParsed.sections.vte_prophylaxis, /Patient Lines\/Drains\/Airways Status/);
assert.match(progressParsed.sections.other, /Name: \[PATIENT NAME\]/);
assert.match(progressParsed.sections.other, /ALLERGIES: Patient has no known allergies/);
assert.match(progressParsed.sections.code_status, /CPR, Full Code/);

const criticalCareNote = fixture("critical-care-note.txt");
const criticalCareParsed = parsePrimaryTeamNote(criticalCareNote, "progress");
assertMostlyLossless(criticalCareNote, criticalCareParsed, "critical-care note");
assert.match(criticalCareParsed.sections.one_liner, /40 year old woman with prior stroke presented with completed RMCA\/ACA stroke with malignant edema s\/p DHC\./);
assert.match(criticalCareParsed.sections.patient_report, /Acute ischemic stroke and Cerebral edema/);
assert.match(criticalCareParsed.sections.patient_report, /Chief Complaint:/);
assert.match(criticalCareParsed.sections.patient_report, /HPI:/);
assert.match(criticalCareParsed.sections.interval_events, /\[Hospital Day 1\]: OR for DHC/);
assert.match(criticalCareParsed.sections.interval_events, /RTOR for blown right pupil/);
assert.match(criticalCareParsed.sections.assessment, /Principal Problem/);
assert.match(criticalCareParsed.sections.physical_exam, /Pupillometer/);
assert.match(criticalCareParsed.sections.objective, /PH ART/);
assert.match(criticalCareParsed.sections.objective, /SBP goal <160/);
assert.match(criticalCareParsed.sections.disposition, /EDUCATION\/COUNSELING/);

const compactNote = fixture("compact-soap-note.txt");
const compactParsed = parsePrimaryTeamNote(compactNote, "progress");
assertMostlyLossless(compactNote, compactParsed, "compact SOAP note");
assert.match(compactParsed.sections.one_liner, /40 y\.o\. female history of previous CVA, ulcerative colitis who presents with as a stroke\./);
assert.match(compactParsed.sections.patient_report, /complete occlusion of the right M1 MCA/);
assert.match(compactParsed.sections.objective, /Intake\/Output Summary/);
assert.match(compactParsed.sections.objective, /150\\\*\s+121\\\*\s+14\s+94/);
assert.match(compactParsed.sections.physical_exam, /GCS 3T/);
assert.match(compactParsed.sections.medications, /levETIRAcetam/);
assert.match(compactParsed.sections.plan, /SBP<160/);

const hAndP = parsePrimaryTeamNote(`## Chief Complaint\r\nDyspnea\r\n\r\n**HPI:** Progressive symptoms.\r\nPMH — Asthma\r\nROS:\r\nNo fever.`, "hp");
assert.equal(hAndP.sections.one_liner, "Progressive symptoms.");
assert.equal(hAndP.sections.chief_complaint, "Dyspnea");
assert.equal(hAndP.sections.history_of_present_illness, "Progressive symptoms.");
assert.equal(hAndP.sections.past_medical_history, "Asthma");
assert.equal(hAndP.sections.review_of_systems, "No fever.");

const tabbedMetadata = parsePrimaryTeamNote("Room: [ROOM]\tALLERGIES: Penicillin\nTreatment Team: Service\tCODE STATUS: Full Code", "hp");
assert.equal(tabbedMetadata.sections.allergies, "Penicillin");
assert.equal(tabbedMetadata.sections.code_status, "Full Code");
assert.match(tabbedMetadata.sections.other, /Room: \[ROOM\]/);
assert.match(tabbedMetadata.sections.other, /Treatment Team: Service/);

const repeated = parsePrimaryTeamNote("Imaging:\nFirst study\nImaging\nSecond study", "progress");
assert.match(repeated.sections.objective, /Imaging\nFirst study/);
assert.match(repeated.sections.objective, /Imaging\nSecond study/);

const prose = parsePrimaryTeamNote("HPI\nPlan to repeat CT tomorrow.\nBP: 120\/80\nHPI was reviewed with the team.\n- Labs: repeat in AM", "progress");
assert.match(prose.sections.patient_report, /Plan to repeat CT tomorrow/);
assert.match(prose.sections.patient_report, /BP: 120\/80/);
assert.match(prose.sections.patient_report, /- Labs: repeat in AM/);
assert.equal(prose.sections.plan, "");
assert.equal(prose.sections.objective, "");

const soapVariants = parsePrimaryTeamNote("S:\nReports weakness.\nO:\nBP 120/80\nA&P:\nContinue monitoring.\nMeds:\nAspirin\nP:\nFollow up.", "progress");
assert.equal(soapVariants.sections.patient_report, "Reports weakness.");
assert.match(soapVariants.sections.objective, /BP 120\/80/);
assert.match(soapVariants.sections.plan, /Continue monitoring/);
assert.match(soapVariants.sections.plan, /Follow up/);
assert.equal(soapVariants.sections.medications, "Aspirin");

const historyVariants = parsePrimaryTeamNote("PMHx: Asthma\nPSHx:\nAppendectomy", "hp");
assert.equal(historyVariants.sections.past_medical_history, "Asthma");
assert.equal(historyVariants.sections.past_surgical_history, "Appendectomy");

const longInlineHpiText = "long clinical content ".repeat(12).trim();
const longInlineHpi = parsePrimaryTeamNote(`HPI: ${longInlineHpiText}`, "progress");
assert.equal(longInlineHpi.recognized, true);
assert.match(longInlineHpi.sections.patient_report, new RegExp(longInlineHpiText.slice(-48).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const fallbackHeading = parsePrimaryTeamNote("ALLERGIES: Penicillin\nPMHx: Asthma", "progress");
assert.match(fallbackHeading.sections.other, /ALLERGIES: Penicillin/);
assert.match(fallbackHeading.sections.other, /PMHx: Asthma/);

const metadataOrder = parsePrimaryTeamNote("Name: A\nDOB: B\nRoom: C\tALLERGIES: none", "hp");
assert.ok(metadataOrder.sections.other.indexOf("Name: A") < metadataOrder.sections.other.indexOf("Room: C"));

const unicodeBody = parsePrimaryTeamNote("HPI\nDose 5 ㎎ and ﬂow", "progress");
assert.match(unicodeBody.sections.patient_report, /Dose 5 ㎎ and ﬂow/);

const radiologySubheadings = parsePrimaryTeamNote("Imaging:\nCT head\nExam: Noncontrast head CT\nImpression: No hemorrhage\nAssessment:\nStable", "progress");
assert.match(radiologySubheadings.sections.objective, /Exam: Noncontrast head CT/);
assert.match(radiologySubheadings.sections.objective, /Impression: No hemorrhage/);
assert.equal(radiologySubheadings.sections.assessment, "Stable");

const userSampleNote = `Labs








Hospital Encounter on 09/16/26 (from the past 12 hours)
CT Head/Brain W/O Con
 
Collection Time: 09/20/26  9:57 PM
Result
Value
Ref Range
 
IMG WORKSTATION ID
RADHSGHARAVI
 
Arterial Blood Gas
 
Collection Time: 09/20/26 11:59 PM
 
Specimen: Arterial Blood
Result
Value
Ref Range
 
pH Arterial
7.50 (H)
7.35 - 7.45 pH
 
pCO2 Arterial
29.5 (L)
32.0 - 48.0 mmHg
 
pO2 Arterial
103.0
83.0 - 108.0 mmHg
 
HCO3 Art
22.7
>=16.0 mmol/L
 
Base Exc Art
0.0
-2.0 - 2.0 mmol/L
 
O2 Saturation
98.3
%
 
HBO2 Sat Art
96.8
94.0 - 99.0 %
 
FIO2
30
%
 
Body Temperature
37.0
degC
Basic Metabolic Panel
 
Collection Time: 09/21/26 12:00 AM
 
Specimen: Blood
Result
Value
Ref Range
 
Sodium
149 (H)
136 - 145 mmol/L
 
Potassium
3.6
3.5 - 5.1 mmol/L
 
Chloride
120 (H)
98 - 107 mmol/L
 
CO2 Total
23
21 - 30 mmol/L
 
Anion Gap
6
4 - 16 mmol/L
 
Glucose Level
90
74 - 109 mg/dL
 
BUN
14
7 - 17 mg/dL
 
Creatinine
0.5
0.5 - 1.0 mg/dL
 
Calcium
7.9 (L)
8.6 - 10.2 mg/dL
 
eGFR
122
>=60 mL/min/1.73 m2
Osmolality
 
Collection Time: 09/21/26 12:00 AM
 
Specimen: Blood
Result
Value
Ref Range
 
Osmolality
308 (H)
275 - 295 mOsm/kg
Arterial Blood Gas
 
Collection Time: 09/21/26  4:02 AM
 
Specimen: Arterial Blood
Result
Value
Ref Range
 
pH Arterial
7.50 (H)
7.35 - 7.45 pH
 
pCO2 Arterial
31.8 (L)
32.0 - 48.0 mmHg
 
pO2 Arterial
147.0 (H)
83.0 - 108.0 mmHg
 
HCO3 Art
24.4
>=16.0 mmol/L
 
Base Exc Art
1.5
-2.0 - 2.0 mmol/L
 
O2 Saturation
99.3
%
 
HBO2 Sat Art
97.7
94.0 - 99.0 %
 
FIO2
30
%
 
Body Temperature
37.0
degC
CBC W/O Auto Diff
 
Collection Time: 09/21/26  4:03 AM
 
Specimen: Blood
Result
Value
Ref Range
 
WBC
10.4 (H)
4.0 - 10.0 10*3/uL
 
RBC
2.39 (L)
3.93 - 5.22 10*6/uL
 
Hemoglobin
6.5 (LL)
11.2 - 15.7 g/dL
 
Hematocrit
21.5 (L)
34.1 - 44.9 %
 
MCV
90.0
79.4 - 94.8 fL
 
MCH
27.2
25.6 - 32.2 pg
 
MCHC
30.2 (L)
32.2 - 35.5 g/dL
 
Platelets
242
182 - 369 10*3/uL
 
MPV
10.7
9.4 - 12.3 fL
 
RDW
17.3 (H)
11.7 - 14.4 %
 
Nucleated Red Blood Cells
0.00
0.00 - 0.01 10*3/uL
 
Nucleated RBC %
0.0
0.0 - 0.2 %
Basic Metabolic Panel
 
Collection Time: 09/21/26  4:03 AM
 
Specimen: Blood
Result
Value
Ref Range
 
Sodium
150 (H)
136 - 145 mmol/L
 
Potassium
3.5
3.5 - 5.1 mmol/L
 
Chloride
121 (H)
98 - 107 mmol/L
 
CO2 Total
23
21 - 30 mmol/L
 
Anion Gap
6
4 - 16 mmol/L
 
Glucose Level
94
74 - 109 mg/dL
 
BUN
14
7 - 17 mg/dL
 
Creatinine
0.5
0.5 - 1.0 mg/dL
 
Calcium
8.0 (L)
8.6 - 10.2 mg/dL
 
eGFR
122
>=60 mL/min/1.73 m2
Osmolality
 
Collection Time: 09/21/26  4:03 AM
 
Specimen: Blood
Result
Value
Ref Range
 
Osmolality
311 (H)
275 - 295 mOsm/kg


Patient Lines/Drains/Airways Status

 
 

Active Active LDAs (selected)

 
 
Name
Placement date
Placement time
Site
Days
 
CVC Non-Tunneled 09/20/26 1400 Right Femoral
09/20/26
1400
Femoral
less than 1
 
Peripheral IV 09/16/26 0520 24 G Posterior;Right Hand
09/16/26
0520
Hand
5
 
Peripheral IV 09/16/26 1002 20 G Anterior;Right Forearm
09/16/26
1002
Forearm
4
 
Peripheral IV 09/16/26 1325 20 G Left Hand
09/16/26
1325
Hand
4
 
Peripheral IV 09/18/26 1600 20 G Anterior;Left;Lateral Forearm
09/18/26
1600
Forearm
2
 
Peripheral IV 09/19/26 1500 20 G Left;Posterior Forearm
09/19/26
1500
Forearm
1
 
Peripheral IV 09/20/26 1333 20 G Posterior;Right Forearm
09/20/26
1333
Forearm
less than 1
 
Urinary Catheter 09/20/26 1550
09/20/26
1550
—
less than 1
 
Non-Surgical Airway 09/16/26 1322
09/16/26
1322
—
4




Vital signs:
Encounter Vitals Stats (last 24 hours)

 
 
Vital Sign
MIN
AVG
MAX
 
Temp
35 °C (95 °F)
36.1 °C (96.91 °F)
36.8 °C (98.2 °F)
 
Resp
4
17.54
26
 
BP: Systolic
110
121.13
141
 
BP: Diastolic
66
78.21
88
 
Heart Rate (Monitored)
70
80.22
97
 
SpO2
97 %
99.57 %
100 %
`;

const userParsed = parsePrimaryTeamNote(userSampleNote, "progress");
assertMostlyLossless(userSampleNote, userParsed, "user note with labs, ldas, vitals");
assert.equal(userParsed.recognized, true);
assert.ok(userParsed.detectedFieldIds.includes("objective"));
assert.ok(userParsed.detectedFieldIds.includes("lda"));
assert.equal(userParsed.sections.plan, "", "LDAs must not go into plan section");
assert.match(userParsed.sections.lda, /\| Name \| Placement date \| Placement time \| Site \| Days \|/);
assert.match(userParsed.sections.lda, /CVC Non-Tunneled 09\/20\/26 1400 Right Femoral/);
assert.match(userParsed.sections.lda, /Urinary Catheter 09\/20\/26 1550/);
assert.match(userParsed.sections.objective, /\| Result \| Value \| Ref Range \|/);
assert.match(userParsed.sections.objective, /\| pH Arterial \| 7\.50 \(H\) \| 7\.35 - 7\.45 pH \|/);
assert.match(userParsed.sections.objective, /\| Sodium \| 149 \(H\) \| 136 - 145 mmol\/L \|/);
assert.match(userParsed.sections.objective, /\| Vital Sign \| MIN \| AVG \| MAX \|/);
assert.match(userParsed.sections.objective, /\| Temp \| 35 °C \(95 °F\) \| 36\.1 °C \(96\.91 °F\) \| 36\.8 °C \(98\.2 °F\) \|/);
assert.equal(userParsed.detectedTables.length, 10);
assert.equal(userParsed.detectedTables.filter((t) => t.type === "labs").length, 8);
assert.equal(userParsed.detectedTables.filter((t) => t.type === "lda").length, 1);
assert.equal(userParsed.detectedTables.filter((t) => t.type === "vitals_stats").length, 1);
assert.equal(userParsed.sections.one_liner, "", "Notes without HPI or subjective should have empty one_liner");

// Explicit one-liner preservation
const explicitNote = parsePrimaryTeamNote("One-Liner: 70 yo M with severe AS s/p TAVR.\n\nHPI: Patient is a 70 yo M presenting with exertional syncope. Onset was 3 days ago.", "hp");
assert.equal(explicitNote.sections.one_liner, "70 yo M with severe AS s/p TAVR.");
assert.equal(explicitNote.sections.history_of_present_illness, "Patient is a 70 yo M presenting with exertional syncope. Onset was 3 days ago.");

// Direct extractFirstSentence unit tests
assert.equal(
  extractFirstSentence("40 y.o. female history of previous CVA, ulcerative colitis who presents with as a stroke.  Last known well midnight, CT/CTA obtained on arrival..."),
  "40 y.o. female history of previous CVA, ulcerative colitis who presents with as a stroke."
);
assert.equal(
  extractFirstSentence("Chief Complaint: Acute stroke\nHPI: 40 year old woman with prior stroke presented with completed stroke s/p DHC.\nStay Summary:"),
  "40 year old woman with prior stroke presented with completed stroke s/p DHC."
);
assert.equal(
  extractFirstSentence("- 75yo male with CAD who presents with acute chest pain.\n- Pain started 2 hours ago."),
  "75yo male with CAD who presents with acute chest pain."
);
assert.equal(
  extractFirstSentence("Dr. Smith's pt. is a 65 y.o. male with a hx. of CAD approx. 5 yrs ago who presents with acute chest pain. Pain radiated to the left arm."),
  "Dr. Smith's pt. is a 65 y.o. male with a hx. of CAD approx. 5 yrs ago who presents with acute chest pain."
);
assert.equal(
  extractFirstSentence("58 yo male with alcoholic cirrhosis presenting with hematemesis\nLast drink was 2 days ago."),
  "58 yo male with alcoholic cirrhosis presenting with hematemesis"
);
assert.equal(
  extractFirstSentence("40 year old woman with prior stroke presented with completed\nRMCA/ACA stroke with malignant edema s/p DHC.\nShe was taken to the OR."),
  "40 year old woman with prior stroke presented with completed RMCA/ACA stroke with malignant edema s/p DHC."
);
// Test 2-column EHR table with assessment and plan
const twoColumnNote = `Diagnostic and Objective Findings\tAssessment and Plan
Neuro\tGlasgow Coma Scale Score  Avg: 6.8  Min: 3  Max: 11\tL MCA occlusion s/p mechanical thrombectomy
\t-- Neurochecks per protocol for 24 hours
\t-- ASA 81mg daily
\t-- High dose statin
\t-- MRI Brain
CV\tHeart Rate (Monitored)  Avg: 81.2\tHypoTN on pressor
\t-- Wean norepinephrine as tolerated
Renal\tIntake/Output Summary\tCKD3a
\tHyponatremia
\t-- Monitor UOP
Patient Lines/Drains/Airways Status
Active Active LDAs (selected)
\tPeripheral IV 20G\tForearm
\tUrinary Catheter\t—
Heme/Onc Plan:
Recommendations:
\tPursue outpatient mammogram
Neurosurgery plan:
Plan:
- SBP<160
- q1 checks with pupillometry`;

const twoColumnParsed = parsePrimaryTeamNote(twoColumnNote, "progress");
assert.equal(twoColumnParsed.recognized, true);
assert.ok(twoColumnParsed.detectedFieldIds.includes("objective"));
assert.ok(twoColumnParsed.detectedFieldIds.includes("plan"));
assert.ok(twoColumnParsed.detectedFieldIds.includes("lda"));
assert.match(twoColumnParsed.sections.objective, /Glasgow Coma Scale Score/);
assert.match(twoColumnParsed.sections.objective, /Heart Rate/);
assert.match(twoColumnParsed.sections.lda, /Peripheral IV/);
assert.doesNotMatch(twoColumnParsed.sections.plan, /Peripheral IV/);
assert.match(twoColumnParsed.sections.plan, /L MCA occlusion/);
assert.match(twoColumnParsed.sections.plan, /Neurosurgery plan/);

assert.ok(twoColumnParsed.parsedProblems.length >= 4);
const lMcaProblem = twoColumnParsed.parsedProblems.find((p) => p.problem.includes("L MCA occlusion"));
assert.ok(lMcaProblem, "Should extract L MCA problem");
assert.match(lMcaProblem.therapeuticPlan, /ASA 81mg daily/);
assert.match(lMcaProblem.diagnosticPlan, /MRI Brain/);

const nsgyProblem = twoColumnParsed.parsedProblems.find((p) => p.problem.includes("Neurosurgery"));
assert.ok(nsgyProblem, "Should extract Neurosurgery problem");
assert.match(nsgyProblem.therapeuticPlan, /SBP<160/);
assert.match(nsgyProblem.diagnosticPlan, /pupillometry/);

// Direct unit tests for parseClinicalPlanProblems
const hashPlan = `#Right MCA/ACA
Date of Stroke: 9/16/2026
Differential: cardioembolic vs dissection
-- ASA 81mg held
-- MRI Brain W/WO
#Hypotension
Loaded w/ 500ml NS
-- Wean levophed`;

const hashProblems = parseClinicalPlanProblems(hashPlan);
assert.equal(hashProblems.length, 2);
assert.equal(hashProblems[0].problem, "Right MCA/ACA");
assert.match(hashProblems[0].keyContext, /Date of Stroke/);
assert.equal(hashProblems[0].differentials.length, 2);
assert.equal(hashProblems[0].differentials[0].diagnosis, "cardioembolic");
assert.equal(hashProblems[0].differentials[1].diagnosis, "dissection");
assert.match(hashProblems[0].therapeuticPlan, /ASA 81mg/);
assert.match(hashProblems[0].diagnosticPlan, /MRI Brain/);
assert.equal(hashProblems[1].problem, "Hypotension");
assert.match(hashProblems[1].keyContext, /Loaded w\/ 500ml NS/);
assert.match(hashProblems[1].therapeuticPlan, /Wean levophed/);

// Numbered plan items
const numberedPlan = `1. Acute Stroke
Etiology: RT ICA occlusion
- LEV 750mg BID
- TTE with bubble
2. Type 2 Diabetes
- Check blood glucose QAC`;

const numberedProblems = parseClinicalPlanProblems(numberedPlan);
assert.equal(numberedProblems.length, 2);
assert.equal(numberedProblems[0].problem, "Acute Stroke");
assert.match(numberedProblems[0].keyContext, /RT ICA occlusion/);
assert.match(numberedProblems[0].therapeuticPlan, /LEV 750mg BID/);
assert.match(numberedProblems[0].diagnosticPlan, /TTE with bubble/);
assert.equal(numberedProblems[1].problem, "Type 2 Diabetes");
assert.match(numberedProblems[1].diagnosticPlan, /Check blood glucose/);

console.log("primary-team note parser tests passed");
