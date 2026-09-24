import assert from "node:assert/strict";
import { buildClinicalReviewIndex, filterClinicalReviewCandidates } from "../src/review-data/index.js";
import { createReviewController } from "../src/ui/review/controller.js";

const patient = {
  id: "patient_review",
  contextSections: [{
    id: "admission_ct",
    sourceKind: "results",
    label: "CT Head/Neck Without Contrast",
    resultCategory: "imaging",
    resultDate: "Hospital Day 1",
    resultContext: "Admission evaluation",
    deidentifiedText: "No acute intracranial abnormality or cervical fracture.",
    originalText: "RAW ORIGINAL MUST NEVER APPEAR",
    createdAt: "2026-09-19T08:00:00.000Z"
  }],
  days: [
    {
      id: "day_three",
      date: "2026-09-21",
      label: "HD3",
      createdAt: "2026-09-21T06:00:00.000Z",
      sourceCaptures: [
        {
          id: "labs_three",
          sourceKind: "laboratory_results",
          label: "Morning labs",
          deidentifiedText: `Labs
@ 09/21/26 0600
WBC: 8.8 K/uL; ref 4.0-11.0
Creatinine: pending
Glucose: 5.5 mmol/L`
        },
        {
          id: "vitals_three",
          sourceKind: "vital_signs",
          label: "Vital signs",
          deidentifiedText: `Vitals
@ 09/21/26 0600: HR 80; Temp 37.0; SpO2 98
@ 09/21/26 0000: HR 100; Temp 38.0; SpO2 94`
        },
        {
          id: "medications_three",
          sourceKind: "medication_activity",
          label: "Medication activity",
          deidentifiedText: `Medications
[Scheduled Medications] ceftriaxone — 2 g; q24h; IV; Day 3 | 0600
[PRN Medications] acetaminophen — 650 mg; q6h PRN; PO | 0215 (650 mg)`
        },
        {
          id: "pathology_three",
          sourceKind: "results",
          label: "Pleural Fluid Cytology",
          resultCategory: "pathology",
          resultContext: "Final report",
          deidentifiedText: "Negative for malignant cells.",
          rawText: "RAW PATHOLOGY ORIGINAL"
        }
      ]
    },
    {
      id: "day_one",
      date: "2026-09-19",
      label: "HD1",
      createdAt: "2026-09-19T06:00:00.000Z",
      sourceCaptures: [
        {
          id: "labs_one",
          sourceKind: "laboratory_results",
          label: "Admission labs",
          deidentifiedText: `Labs
@ 09/19/26 0600
WBC: 15.2 K/uL; ref 4.0-11.0; flag H
Creatinine: 1.7 mg/dL; ref 0.6-1.3; flag H
Lactate: <0.5 mmol/L
Glucose: 110 mg/dL`
        },
        {
          id: "vitals_one",
          sourceKind: "vital_signs",
          label: "Vital signs",
          deidentifiedText: `Vitals
@ 09/19/26 0500: HR 110; Temp 39.0; SpO2 91`
        },
        {
          id: "medications_one",
          sourceKind: "medication_activity",
          label: "Medication activity",
          deidentifiedText: `Medications
[Scheduled Medications] ceftriaxone — 2 g; q24h; IV; Day 1 | 0600`
        },
        {
          id: "micro_one",
          sourceKind: "results",
          label: "Blood Culture",
          resultCategory: "microbiology",
          resultContext: "Two peripheral sets",
          deidentifiedText: "No growth at 24 hours."
        }
      ]
    },
    {
      id: "day_two",
      date: "2026-09-20",
      label: "HD2",
      createdAt: "2026-09-20T06:00:00.000Z",
      sourceCaptures: [
        {
          id: "labs_two",
          sourceKind: "laboratory_results",
          label: "Morning labs",
          deidentifiedText: `Labs
@ 09/20/26 0600
WBC: 12.0 K/uL; ref 4.0-11.0; flag H
Creatinine: 1.3 mg/dL; ref 0.6-1.3`
        },
        {
          id: "vitals_two",
          sourceKind: "vital_signs",
          label: "Vital signs",
          deidentifiedText: `Vitals
@ 09/20/26 1200: HR 90; Temp 37.5; SpO2 96`
        },
        {
          id: "other_two",
          sourceKind: "results",
          label: "Telemetry Interpretation",
          resultCategory: "cardiac monitoring",
          resultContext: "Overnight",
          deidentifiedText: "Sinus rhythm without sustained arrhythmia."
        }
      ]
    }
  ]
};

const index = buildClinicalReviewIndex(patient);
assert.equal(index.patientId, "patient_review");
assert.deepEqual(index.groups.map(({ id }) => id), ["vitals", "labs", "medications", "imaging", "microbiology", "pathology", "other_results"]);

const laboratoryResults = (reviewIndex, name) => reviewIndex.labs.flatMap((panel) =>
  panel.results.filter((result) => result.name === name).map((result) => ({ ...result, panel }))
);
assert.equal(index.labs.length, 1, "the review index must expose only the latest collection for each laboratory panel type");
assert.ok(index.labs.every((candidate) => candidate.kind === "laboratory_panel"));
const wbcResults = laboratoryResults(index, "WBC");
assert.deepEqual(wbcResults.map(({ value }) => value), ["8.8"], "the visible panel must use the latest saved collection");
assert.deepEqual(wbcResults.map(({ status }) => status), ["normal"]);
assert.deepEqual(wbcResults[0].trend.map(({ value }) => value), ["15.2", "12.0", "8.8"], "the latest lab row must retain older collections for its on-demand trend display");
assert.match(wbcResults.at(-1).panel.insertionText, /Laboratory results[\s\S]*WBC: 15\.2 \(HD1 · 09\/19\/26 0600\) → 12\.0 \(HD2 · 09\/20\/26 0600\) → 8\.8 \(HD3 · 09\/21\/26 0600\) K\/uL/);
assert.match(wbcResults[0].selectionCandidate.insertionText, /^WBC: 15\.2 \(HD1 · 09\/19\/26 0600\) → 12\.0 \(HD2 · 09\/20\/26 0600\) → 8\.8 \(HD3 · 09\/21\/26 0600\) K\/uL$/);
assert.ok(index.objectiveCandidates.some(({ id }) => id === wbcResults[0].selectionCandidate.id), "individual lab results must be independently selectable for Objective");
assert.equal(filterClinicalReviewCandidates(index, "15.2", { group: "labs" })[0].id, index.labs[0].id, "historical values must still find the latest panel type");

const legacyCombinedLabIndex = buildClinicalReviewIndex({
  id: "legacy_combined_labs",
  days: [{
    id: "legacy_day",
    date: "2026-09-21",
    label: "HD4",
    sourceCaptures: [{
      id: "legacy_lab_source",
      sourceKind: "laboratory_results",
      label: "Epic results with unparsed text",
      deidentifiedText: `Labs
@ 09/21/26 04:03
WBC: 10.4 10*3/uL; ref 4.0 - 10.0; flag H
Hemoglobin: 6.5 g/dL; ref 11.2 - 15.7; flag LL

Labs
@ 09/21/26 11:22
WBC: 10.9 10*3/uL; ref 4.0 - 10.0; flag H
Hemoglobin: 7.9 g/dL; ref 11.2 - 15.7; flag L
Platelets: 267 10*3/uL; ref 182 - 369`
    }]
  }]
});
assert.deepEqual(legacyCombinedLabIndex.labs.map(({ name }) => name), ["CBC"], "repeated legacy collections must collapse to the latest parsed panel type");
assert.deepEqual(legacyCombinedLabIndex.labs[0].results.find(({ name }) => name === "WBC").trend.map(({ value }) => value), ["10.4", "10.9"]);
const legacyWbc = legacyCombinedLabIndex.labs.at(-1).results.find(({ name }) => name === "WBC");
assert.deepEqual(legacyWbc.trend.map(({ value }) => value), ["10.4", "10.9"], "matching WBC rows from legacy collection blocks must share one trend");
assert.equal(legacyCombinedLabIndex.labs.at(-1).results.find(({ name }) => name === "Platelets").trend.length, 1, "single results must remain explicitly identifiable as having no trend");

const glucoseResults = laboratoryResults(index, "Glucose");
assert.deepEqual(glucoseResults.map(({ unit }) => unit), ["mmol/L"], "the latest panel must preserve its documented unit");
assert.deepEqual(glucoseResults[0].trend.map(({ unit }) => unit).sort(), ["mg/dL", "mmol/L"], "prior units remain available only in the analyte trend");

assert.equal(laboratoryResults(index, "Lactate").length, 0, "analytes absent from the latest panel must not keep an older collection visible");
const creatinineResults = laboratoryResults(index, "Creatinine");
assert.equal(creatinineResults.at(-1).value, "pending", "latest non-numeric/missing-status results must not be discarded");
assert.equal(creatinineResults.length, 1);
assert.deepEqual(creatinineResults[0].trend.map(({ value }) => value), ["1.7", "1.3", "pending"]);

const heartRate = index.vitals.find((candidate) => candidate.name === "Pulse");
assert.ok(heartRate);
assert.deepEqual(heartRate.observations.map(({ value }) => value), ["110", "90", "100", "80"]);
assert.deepEqual(
  heartRate.statistics24h,
  {
    count: 3,
    minimum: 80,
    maximum: 100,
    mean: 90,
    median: 90,
    windowStart: new Date("2026-09-20T06:00:00").getTime(),
    windowEnd: new Date("2026-09-21T06:00:00").getTime()
  },
  "24-hour vital statistics must use the latest patient-wide vital timestamp"
);
assert.equal(heartRate.insertionText, "Pulse: latest 80 bpm; 24-hour range 80–100 bpm; median 90 bpm");
assert.doesNotMatch(heartRate.insertionText, /Hospital Day|09\/| → /, "vital note insertion must summarize rather than list every reading");

const relativeVitalIndex = buildClinicalReviewIndex({
  id: "relative_vitals",
  days: [{
    id: "relative_day",
    date: "2026-09-21",
    label: "HD1",
    sourceCaptures: [{
      id: "relative_vital_source",
      sourceKind: "vital_signs",
      label: "De-identified vital signs",
      deidentifiedText: `Vitals
@ [Hospital Day 1 at 06:00]: Temp 36.5
@ [1 day prior to hospital admission at 23:00]: Temp 35.6`
    }]
  }]
});
const relativeTemperature = relativeVitalIndex.vitals.find((candidate) => candidate.name === "Temperature");
assert.deepEqual(relativeTemperature.observations.map(({ value }) => value), ["35.6", "36.5"], "relative pre-admission timestamps must sort before admission-day observations");
assert.equal(relativeTemperature.latest.value, "36.5");
assert.match(relativeTemperature.insertionText, /latest 36\.5/);

const ceftriaxone = index.medications.find((candidate) => candidate.name === "ceftriaxone");
assert.ok(ceftriaxone);
assert.equal(ceftriaxone.history.length, 2);
assert.equal(ceftriaxone.latestSavedEntry.dose, "2 g");
assert.equal(ceftriaxone.latestSavedEntry.route, "IV");
assert.equal(ceftriaxone.latestSavedEntry.frequency, "q24h");
assert.equal(ceftriaxone.latestSavedEntry.administrationTimes, "06:00");
assert.equal(ceftriaxone.latestAdministration, "06:00");
assert.equal(ceftriaxone.scheduleLabel, "Scheduled");
assert.equal("course" in ceftriaxone.latestSavedEntry, false, "review data must not retain an inferred medication course");
assert.match(ceftriaxone.insertionText, /latest listed administration 06:00/, "medication output must describe the saved MAR rather than claiming a recomputation");
assert.doesNotMatch(ceftriaxone.insertionText, /Day 3/, "note insertion must omit legacy inferred course labels");
assert.ok(index.medications.some((candidate) => candidate.name === "acetaminophen"));

const ct = index.diagnosticResults.find((candidate) => candidate.label === "CT Head/Neck Without Contrast");
const micro = index.diagnosticResults.find((candidate) => candidate.label === "Blood Culture");
const pathology = index.diagnosticResults.find((candidate) => candidate.label === "Pleural Fluid Cytology");
const other = index.diagnosticResults.find((candidate) => candidate.label === "Telemetry Interpretation");
assert.equal(ct.group, "imaging");
assert.equal(micro.group, "microbiology");
assert.equal(pathology.group, "pathology");
assert.equal(other.group, "other_results", "unrecognized result categories stay explicit other results and are never inferred from text");
assert.match(ct.insertionText, /CT Head\/Neck Without Contrast[\s\S]*Admission evaluation[\s\S]*No acute intracranial abnormality/);
assert.equal(filterClinicalReviewCandidates(index, "head/neck").map(({ id }) => id).includes(ct.id), true);
assert.deepEqual(filterClinicalReviewCandidates(index, "blood", { group: "microbiology" }).map(({ label }) => label), ["Blood Culture"]);

const repeatedIndex = buildClinicalReviewIndex(structuredClone(patient));
const latestLabPanel = index.labs[0];
const repeatedLatestLabPanel = repeatedIndex.labs[0];
assert.equal(repeatedLatestLabPanel.id, latestLabPanel.id, "panel-type selection IDs must be stable for unchanged data");
assert.equal(repeatedLatestLabPanel.fingerprint, latestLabPanel.fingerprint);
const changedPatient = structuredClone(patient);
changedPatient.days.find(({ id }) => id === "day_three").sourceCaptures.find(({ id }) => id === "labs_three").deidentifiedText = changedPatient.days.find(({ id }) => id === "day_three").sourceCaptures.find(({ id }) => id === "labs_three").deidentifiedText.replace("8.8", "9.1");
const changedLatestLabPanel = buildClinicalReviewIndex(changedPatient).labs[0];
assert.equal(changedLatestLabPanel.id, latestLabPanel.id, "new latest content must not break a saved panel-type selection reference");
assert.notEqual(changedLatestLabPanel.fingerprint, latestLabPanel.fingerprint, "panel content changes must be detectable for explicit refresh decisions");

const serialized = JSON.stringify(index);
assert.doesNotMatch(serialized, /RAW ORIGINAL MUST NEVER APPEAR|RAW PATHOLOGY ORIGINAL/);
assert.doesNotMatch(serialized, /originalText|rawText/, "the review index must derive only from saved de-identified text and explicit metadata");

// Problem-oriented plan auto-population from primary note
{
  const patientWithPrimaryNote = {
    id: "pt_auto_plan",
    days: [{
      id: "day_today",
      date: "2026-09-21",
      label: "HD1",
      primaryTeamNote: {
        noteType: "progress",
        sections: {
          plan: {
            deidentifiedText: "#Right MCA/ACA\nDate of Stroke: 9/16\nDifferential: cardioembolic vs dissection\n-- ASA 81mg held\n-- MRI Brain\n#Hypotension\nLoaded w/ 500ml NS\n-- Wean levophed"
          }
        }
      }
    }]
  };
  let capturedModel = null;
  const controller = createReviewController({
    app: {
      noteDraftSessions: new Map(),
      reviewPacketId: "day_today",
      reviewCategory: "all",
      reviewSearchQuery: "",
      reviewPage: 0
    },
    active: () => patientWithPrimaryNote,
    byId: () => ({ innerHTML: "" }),
    presentation: {
      renderReview: (data) => {
        capturedModel = data;
        return "";
      }
    },
    patientRequiredMessage: () => "",
    persistVault: async () => {},
    render: () => {},
    setStatus: () => {},
    copyText: async () => {},
    downloadText: () => {}
  });
  controller.render();
  assert.ok(capturedModel, "controller.render should populate review model");
  assert.equal(capturedModel.draft.problems.length, 2, "should populate all problems from today's primary note");
  assert.equal(capturedModel.draft.problems[0].problem.deidentifiedText, "Right MCA/ACA");
  assert.match(capturedModel.draft.problems[0].keyContext.deidentifiedText, /Date of Stroke: 9\/16/);
  assert.equal(capturedModel.draft.problems[0].differentials.length, 2);
  assert.equal(capturedModel.draft.problems[0].differentials[0].diagnosis.deidentifiedText, "cardioembolic");
  assert.equal(capturedModel.draft.problems[0].differentials[1].diagnosis.deidentifiedText, "dissection");
  assert.match(capturedModel.draft.problems[0].therapeuticPlan.deidentifiedText, /ASA 81mg held/);
  assert.match(capturedModel.draft.problems[0].diagnosticPlan.deidentifiedText, /MRI Brain/);
  assert.equal(capturedModel.draft.problems[1].problem.deidentifiedText, "Hypotension");
  assert.match(capturedModel.draft.problems[1].keyContext.deidentifiedText, /Loaded w\/ 500ml NS/);
  assert.match(capturedModel.draft.problems[1].therapeuticPlan.deidentifiedText, /Wean levophed/);
}

const multiSourceLabPatient = {
  id: "multi_source_labs",
  days: [{
    id: "ms_day",
    date: "2026-09-21",
    label: "HD1",
    createdAt: "2026-09-21T06:00:00.000Z",
    sourceCaptures: [
      {
        id: "serum_labs",
        sourceKind: "laboratory_results",
        label: "Morning labs",
        deidentifiedText: `Labs
@ 09/21/26 0600
Lactate: 3.1 mmol/L; ref 0.5-2.0; flag H`
      },
      {
        id: "abg_labs",
        sourceKind: "laboratory_results",
        label: "ABG",
        deidentifiedText: `Labs
@ 09/21/26 0700
Lactate: 1.9 mmol/L; ref 0.5-2.0`
      }
    ]
  }]
};
const multiSourceIndex = buildClinicalReviewIndex(multiSourceLabPatient);
const lactatePanels = multiSourceIndex.labs.filter((panel) =>
  panel.results.some((result) => result.name === "Lactate"));
assert.equal(lactatePanels.length, 2, "lactate from different panel types must stay as separate panels");
const serumLactate = lactatePanels.find((panel) => panel.source.sourceLabel === "Morning labs")
  .results.find((result) => result.name === "Lactate");
const abgLactate = lactatePanels.find((panel) => panel.source.sourceLabel === "ABG")
  .results.find((result) => result.name === "Lactate");
assert.deepEqual(serumLactate.trend.map(({ value }) => value), ["3.1"], "serum lactate trend must not include the ABG lactate value");
assert.deepEqual(abgLactate.trend.map(({ value }) => value), ["1.9"], "ABG lactate trend must not include the serum lactate value");
assert.notEqual(serumLactate.selectionCandidate.id, abgLactate.selectionCandidate.id, "lactate results from different sources must be independently selectable");

// Lab trends show at most three points, each labeled with its hospital day and
// timestamp. The latest value always anchors the trend; abnormal values are
// preferred over older normal ones.
const sodiumDays = [140, 141, 160, 142, 139].map((value, index) => ({
  id: `sodium_day_${index + 1}`,
  date: `2026-09-${17 + index}`,
  label: `HD${index + 1}`,
  sourceCaptures: [{
    id: `sodium_labs_${index + 1}`,
    sourceKind: "laboratory_results",
    label: "Morning labs",
    deidentifiedText: `Labs\n@ 09/${17 + index}/26 0600\nSodium: ${value} mmol/L; ref 135-145${value === 160 ? "; flag H" : ""}`
  }]
}));
const sodiumIndex = buildClinicalReviewIndex({ id: "sodium_trend", days: sodiumDays });
const sodiumResult = sodiumIndex.labs
  .flatMap((panel) => panel.results)
  .find((result) => result.name === "Sodium" && (result.trend || []).length === 5);
assert.ok(sodiumResult, "five daily sodium results form one trend");
assert.deepEqual(
  sodiumResult.displayTrend.map((entry) => entry.value),
  ["160", "142", "139"],
  "the displayed trend keeps the latest value, the abnormal value, and the most recent other value"
);
assert.ok(sodiumResult.displayTrend.length <= 3, "at most three trend points are shown per lab");
const sodiumInsertion = sodiumResult.selectionCandidate.insertionText;
assert.match(sodiumInsertion, /→/, "the note trend connects the selected points");
for (const [day, stamp] of [["HD3", "09/19/26 0600"], ["HD4", "09/20/26 0600"], ["HD5", "09/21/26 0600"]]) {
  assert.ok(sodiumInsertion.includes(day), `the note trend labels the hospital day (${day})`);
  assert.ok(sodiumInsertion.includes(stamp), `the note trend labels the timestamp (${stamp})`);
}
assert.ok(!sodiumInsertion.includes("HD1") && !sodiumInsertion.includes("HD2"), "unselected trend points stay out of the note");

// Compact sheet: report-only placeholders group together, pending results are
// lifted out, labs regroup by source panel family, and separate
// systolic/diastolic readings pair into one Blood Pressure candidate.
const compactPatient = {
  id: "compact_sheet",
  days: [{
    id: "compact_day",
    date: "2026-09-23",
    label: "HD1",
    createdAt: "2026-09-23T06:00:00.000Z",
    sourceCaptures: [
      {
        id: "compact_labs",
        sourceKind: "laboratory_results",
        label: "Morning labs",
        deidentifiedText: `Labs
@ 09/23/26 11:50
CTA Head-Neck with Perfusion (Brain Attack): Rpt
@ 09/23/26 12:59
EKG 12 Lead: Rpt
@ 09/23/26 13:05
XR Chest AP (Portable): Rpt
@ 09/23/26 16:26
CAR Echo 2D Complete w Contrast: Rpt
@ 09/23/26 21:52
MR Brain W/O Con: Rpt
WBC: 9.1 K/uL; ref 4.0-11.0
Hemoglobin: 13.2 g/dL; ref 11.2-15.7
Sodium: 139 mmol/L; ref 136-145
Creatinine: 1.0 mg/dL; ref 0.6-1.3

Labs
@ 09/24/26 04:13
Factor V Leiden Mutation: Rpt (IP)
Magnesium: pending`
      },
      {
        id: "compact_vitals",
        sourceKind: "vital_signs",
        label: "Vital signs",
        deidentifiedText: `Vitals
@ 09/23/26 0600: SBP 142; DBP 88; HR 96
@ 09/23/26 1200: SBP 138; DBP 84; HR 92`
      }
    ]
  }]
};
const compactIndex = buildClinicalReviewIndex(compactPatient);

// Every Rpt placeholder lands in one reports collection, individually
// selectable, and never treated as copyable report content. Aaron's exact
// six-report mixed-results case: five plain "Rpt" placeholders at different
// timestamps plus one "Rpt (IP)" that keeps its In Process badge.
assert.equal(compactIndex.reportItems.length, 6, "all six Rpt placeholders must be collected into the reports section");
assert.deepEqual(
  compactIndex.reportItems.map((item) => item.result.name).sort(),
  ["CAR Echo 2D Complete w Contrast", "CTA Head-Neck with Perfusion (Brain Attack)", "EKG 12 Lead", "Factor V Leiden Mutation", "MR Brain W/O Con", "XR Chest AP (Portable)"].sort(),
  "all report-only rows group together regardless of timestamp"
);
const factorV = compactIndex.reportItems.find((item) => item.result.name === "Factor V Leiden Mutation");
assert.equal(factorV.pendingLabel, "In Process", "Rpt (IP) keeps its in-process status inside the reports section");
assert.match(factorV.selectionCandidate.insertionText, /In Process/, "the in-process badge survives into the note insertion");
assert.match(factorV.selectionCandidate.insertionText, /not the report content/, "report placeholders must never copy report text into the note");
for (const item of compactIndex.reportItems) {
  assert.ok(compactIndex.objectiveCandidates.some(({ id }) => id === item.selectionCandidate.id), `${item.result.name} must stay individually selectable`);
}

// Explicitly pending results surface separately from reports and panels.
assert.equal(compactIndex.pendingItems.length, 1, "plain pending values must be detected");
assert.equal(compactIndex.pendingItems[0].result.name, "Magnesium");
assert.equal(compactIndex.pendingItems[0].pendingLabel, "Pending");
assert.match(compactIndex.pendingItems[0].selectionCandidate.insertionText, /no result available yet/);

// Report-only and pending rows leave the panel family grids.
const familyLabels = compactIndex.labFamilies.map((section) => section.label);
assert.ok(familyLabels.includes("CBC"), `CBC family must exist (found: ${familyLabels.join(", ")})`);
assert.ok(familyLabels.includes("Basic metabolic panel"), `metabolic family must exist (found: ${familyLabels.join(", ")})`);
const cbcSection = compactIndex.labFamilies.find((section) => section.label === "CBC");
assert.deepEqual(cbcSection.rows.map(({ result }) => result.name).sort(), ["Hemoglobin", "WBC"], "CBC rows stay together without report or pending rows");
const metabolicSection = compactIndex.labFamilies.find((section) => section.label === "Basic metabolic panel");
assert.deepEqual(metabolicSection.rows.map(({ result }) => result.name).sort(), ["Creatinine", "Sodium"]);
assert.ok(cbcSection.rows.every(({ result }) => result.selectionCandidate), "family rows keep their analyte selection candidates");

// Separate systolic/diastolic readings become one Blood Pressure candidate;
// already-combined readings are untouched.
assert.deepEqual(compactIndex.vitals.map((candidate) => candidate.name), ["Blood Pressure", "Pulse"], "systolic and diastolic must pair into one candidate");
const pairedBp = compactIndex.vitals[0];
assert.equal(pairedBp.latest.value, "138/84", "the paired candidate shows the latest systolic/diastolic together");
assert.equal(pairedBp.latest.unit, "mmHg");
assert.match(pairedBp.insertionText, /^Blood Pressure: 138\/84 mmHg/, "paired insertion text reads as one blood pressure");
assert.match(pairedBp.insertionText, /SBP 138–142/, "paired insertion keeps the systolic 24-hour range");
assert.match(pairedBp.insertionText, /DBP 84–88/, "paired insertion keeps the diastolic 24-hour range");
assert.ok(pairedBp.searchText.includes("systolic"), "searching systolic still finds the paired candidate");
assert.ok(compactIndex.objectiveCandidates.some(({ id }) => id === pairedBp.id), "the paired candidate must be selectable for Objective");

const alreadyPairedIndex = buildClinicalReviewIndex({
  id: "already_paired_bp",
  days: [{
    id: "paired_day",
    date: "2026-09-23",
    label: "HD1",
    sourceCaptures: [{
      id: "paired_vitals",
      sourceKind: "vital_signs",
      label: "Vital signs",
      deidentifiedText: `Vitals
@ 09/23/26 0600: BP 118/76; HR 80`
    }]
  }]
});
assert.deepEqual(alreadyPairedIndex.vitals.map((candidate) => candidate.name), ["Blood Pressure (cuff)", "Pulse"], "already-combined readings must not be re-paired");

// Narrative primary-team notes feed the review sheet through the same
// canonical pipeline: home meds, exam vitals, narrative labs, and study
// results from the note's prose become selectable candidates.
const notePatient = {
  id: "note_wired",
  contextSections: [],
  admissionPrimaryTeamNote: null,
  days: [{
    id: "note_day",
    date: "2026-09-24",
    label: "Hospital day 1",
    sourceCaptures: [],
    primaryTeamNote: {
      id: "note_progress_1",
      noteType: "progress",
      createdAt: "2026-09-24T08:00:00.000Z",
      updatedAt: "2026-09-24T08:00:00.000Z",
      sections: {
        medications: { deidentifiedText: "- Lisinopril 10 mg PO daily\n- Xarelto, dose unknown" },
        physical_exam: { deidentifiedText: "Gen: NAD. Vitals: BP 142/88, HR 94, T 98.6 F, RR 18, SpO2 96% on RA." },
        objective: { deidentifiedText: "Labs: WBC 12.3 (H), Hgb 9.1 (L), Creatinine 1.6 (H), Troponin rpt.\nEKG 12 Lead: sinus tach.\nCT head: no acute bleed." },
        plan: { deidentifiedText: "1. Stroke\n- telemetry" }
      }
    }
  }]
};
const noteIndex = buildClinicalReviewIndex(notePatient);
assert.deepEqual(
  noteIndex.vitals.map((candidate) => candidate.name),
  ["Blood Pressure (cuff)", "Pulse", "Respirations", "SpO2", "Temperature"],
  "exam vitals from note prose become vital candidates"
);
assert.deepEqual(
  noteIndex.medications.map((candidate) => candidate.name).sort(),
  ["Lisinopril", "Xarelto"],
  "home meds from the note become medication candidates"
);
assert.ok(
  noteIndex.labs.some((panel) => panel.results.some((result) => result.name === "WBC" && result.value === "12.3" && result.flag === "H")),
  "narrative labs from the note become lab results"
);
assert.ok(
  noteIndex.reportItems.some((item) => item.result.name === "Troponin"),
  "narrative rpt values land in the reports section"
);
assert.deepEqual(
  noteIndex.diagnosticResults.map((candidate) => [candidate.name, candidate.group]).sort(),
  [["CT head", "imaging"], ["EKG 12 Lead", "other_results"]],
  "study lines from the note become diagnostic candidates"
);

console.log("review data index tests passed");
