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

const wbc = index.labs.find((candidate) => candidate.name === "WBC");
assert.ok(wbc);
assert.deepEqual(wbc.observations.map(({ value }) => value), ["15.2", "12.0", "8.8"], "repeated labs must be chronological across days even when day input is not");
assert.deepEqual(wbc.observations.map(({ status }) => status), ["high", "high", "normal"]);
assert.equal(wbc.latest.value, "8.8");
assert.match(wbc.insertionText, /latest 8\.8 K\/uL/);
assert.match(wbc.insertionText, /15\.2 K\/uL \[high\][\s\S]*12\.0 K\/uL \[high\][\s\S]*8\.8 K\/uL/);

const glucoseCandidates = index.labs.filter((candidate) => candidate.name === "Glucose");
assert.equal(glucoseCandidates.length, 2, "identical names with incompatible units must never be merged");
assert.deepEqual(glucoseCandidates.map(({ unit }) => unit).sort(), ["mg/dL", "mmol/L"]);

const lactate = index.labs.find((candidate) => candidate.name === "Lactate");
assert.equal(lactate.latest.value, "<0.5", "comparator observations remain selectable even though they are not numeric graph points");
const creatinine = index.labs.find((candidate) => candidate.name === "Creatinine");
assert.equal(creatinine.latest.value, "pending", "latest non-numeric/missing-status observations must not be discarded");
assert.equal(creatinine.observations.length, 3);

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
assert.equal(ceftriaxone.latestSavedEntry.administrationTimes, "0600");
assert.equal("course" in ceftriaxone.latestSavedEntry, false, "review data must not retain an inferred medication course");
assert.match(ceftriaxone.insertionText, /latest saved entry/, "medication output must describe saved state rather than claiming a recomputation");
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
const repeatedWbc = repeatedIndex.labs.find((candidate) => candidate.name === "WBC");
assert.equal(repeatedWbc.id, wbc.id, "selection IDs must be stable for unchanged source identity");
assert.equal(repeatedWbc.fingerprint, wbc.fingerprint);
const changedPatient = structuredClone(patient);
changedPatient.days.find(({ id }) => id === "day_three").sourceCaptures.find(({ id }) => id === "labs_three").deidentifiedText = changedPatient.days.find(({ id }) => id === "day_three").sourceCaptures.find(({ id }) => id === "labs_three").deidentifiedText.replace("8.8", "9.1");
const changedWbc = buildClinicalReviewIndex(changedPatient).labs.find((candidate) => candidate.name === "WBC");
assert.equal(changedWbc.id, wbc.id, "content changes must not break a saved selection reference");
assert.notEqual(changedWbc.fingerprint, wbc.fingerprint, "content changes must be detectable for explicit refresh decisions");

const serialized = JSON.stringify(index);
assert.doesNotMatch(serialized, /RAW ORIGINAL MUST NEVER APPEAR|RAW PATHOLOGY ORIGINAL/);
assert.doesNotMatch(serialized, /originalText|rawText/, "the review index must derive only from saved de-identified text and explicit metadata");

console.log("review data index tests passed");
