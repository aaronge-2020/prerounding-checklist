// Regression test for the Drug checks "Use active patient's medications"
// patient lookup: the vault keeps patients in an ARRAY plus an
// activePatientId string, so indexing the array by that id
// (patients[activePatientId]) silently yields undefined and the button
// reported "No medication captures found" for every patient. The lookup
// must go through activePatient(vault), which matches by id.
//
// Also guards medication extraction across both capture locations:
// admission contextSections and hospital-day sourceCaptures, in the
// canonical "Medications" source format the import pipeline produces.
//
// Runs the real controller in Node with stubbed DOM deps.
// Node built-ins only. Run from the repo root:
//   node tests/test-drug-checks-patient-meds.js
import assert from "node:assert/strict";
import { createDrugChecksController } from "../src/ui/drug-checks/controller.js";

const escapeHtml = (value) => String(value ?? "");

function makeController(app) {
  return createDrugChecksController({
    app,
    byId: () => null,
    escapeHtml,
    render: () => {},
    vaultIsUnlocked: () => true
  });
}

// A fake event target carrying the "use patient meds" action.
function actionTarget(action) {
  return { closest: () => ({ dataset: { action } }) };
}

function vaultWithPatient(patient) {
  return {
    patients: [patient],
    activePatientId: patient.id
  };
}

const ADMISSION_MEDS = [
  "Medications",
  "[Active] Furosemide — Dose: 40 mg | Route: IV | Frequency: twice daily",
  "[Active] Carvedilol — Dose: 12.5 mg | Route: PO | Frequency: twice daily"
].join("\n");

const DAY_MEDS = [
  "Medications",
  "[Active] Apixaban — Dose: 5 mg | Route: PO | Frequency: twice daily"
].join("\n");

// 1. The regression: a realistic vault where the active patient's id is a
// string that is NOT a valid array index. The old
// patients[activePatientId] lookup returned undefined here.
{
  const app = {
    vault: vaultWithPatient({
      id: "p_kx8m2qza",
      displayLabel: "Sample: ADHF exacerbation",
      contextSections: [
        { id: "sec_meds", sourceKind: "medication_activity", deidentifiedText: ADMISSION_MEDS }
      ],
      days: []
    })
  };
  const controller = makeController(app);
  controller.click(actionTarget("drug-checks-use-patient-meds"));
  const meds = String(app.drugChecks.medInput || "").split("\n").filter(Boolean);
  assert.deepEqual(meds, ["Furosemide", "Carvedilol"], "admission medication_activity captures resolve to drug names");
  assert.match(String(app.drugChecks.status || ""), /2 medications/, "status reports the filled count");
}

// 2. Hospital-day sourceCaptures are swept too, and duplicates are removed.
{
  const app = {
    vault: vaultWithPatient({
      id: "p_daycapture",
      displayLabel: "Sample: CAP",
      contextSections: [
        { id: "sec_meds", sourceKind: "medication_activity", deidentifiedText: ADMISSION_MEDS }
      ],
      days: [
        {
          id: "day_1",
          sourceCaptures: [
            { id: "cap_meds", sourceKind: "medication_activity", deidentifiedText: DAY_MEDS },
            { id: "cap_labs", sourceKind: "laboratory_results", deidentifiedText: "Labs\nSodium: 138 mEq/L" }
          ]
        }
      ]
    })
  };
  const controller = makeController(app);
  controller.click(actionTarget("drug-checks-use-patient-meds"));
  const meds = String(app.drugChecks.medInput || "").split("\n").filter(Boolean);
  assert.deepEqual(
    meds,
    ["Furosemide", "Carvedilol", "Apixaban"],
    "day captures merge with admission captures"
  );
}

// 3. No active patient, or no medication captures: honest empty status,
// never a throw.
{
  const app = { vault: { patients: [], activePatientId: "" } };
  const controller = makeController(app);
  controller.click(actionTarget("drug-checks-use-patient-meds"));
  assert.equal(String(app.drugChecks.medInput || ""), "", "med input stays empty without a patient");
  assert.match(String(app.drugChecks.status || ""), /No medication captures/, "status explains the empty result");
}

console.log("drug checks patient meds: all assertions passed.");
