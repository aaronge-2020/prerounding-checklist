import assert from "node:assert/strict";
import { buildClinicalReviewIndex, filterClinicalReviewCandidates } from "../src/review-data/index.js";

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
assert.match(wbcResults.at(-1).panel.insertionText, /Laboratory results[\s\S]*WBC: 15\.2 → 12\.0 → 8\.8 K\/uL/);
assert.match(wbcResults[0].selectionCandidate.insertionText, /^WBC: 15\.2 → 12\.0 → 8\.8 K\/uL$/);
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
assert.equal(ceftriaxone.latestSavedEntry.administrationTimes, "0600");
assert.equal(ceftriaxone.latestAdministration, "0600");
assert.equal(ceftriaxone.scheduleLabel, "Scheduled");
assert.equal("course" in ceftriaxone.latestSavedEntry, false, "review data must not retain an inferred medication course");
assert.match(ceftriaxone.insertionText, /latest listed administration 0600/, "medication output must describe the saved MAR rather than claiming a recomputation");
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

console.log("review data index tests passed");
