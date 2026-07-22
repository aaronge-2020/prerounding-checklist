import assert from "node:assert/strict";
import { createPatientRecord } from "../src/app/state/vault.js";
import { createDailyRecord } from "../src/daily-updates/days.js";
import { createExamFindingsController } from "../src/ui/checklist/exam-findings-controller.js";

const day = createDailyRecord({ date: "2026-07-13", label: "HD1" });
const laterDay = createDailyRecord({ date: "2026-07-14", label: "HD2" });
const patient = createPatientRecord("Synthetic patient", { days: [day, laterDay] });
const state = { vault: { schemaVersion: 2, activePatientId: patient.id, patients: [patient], preferences: {}, workupOverrides: {}, selectedWorkupIds: [], hiddenWorkupIds: [] } };
let persisted = "";
const controller = createExamFindingsController({
  state,
  active: () => state.vault.patients[0],
  persistVault: async (message) => { persisted = message; },
  setStatus: () => {}
});

await controller.saveExamFindings({ text: "Lungs clear bilaterally.", source: "OpenEvidence" });
const savedPatient = state.vault.patients[0];
const savedDay = savedPatient.days[1];
assert.equal(savedDay.openEvidenceExamNote.text, "Lungs clear bilaterally.");
assert.equal(savedDay.sourceCaptures.length, 1);
assert.equal(savedDay.sourceCaptures[0].sourceKind, "physical_exam");
assert.equal(savedDay.sourceCaptures[0].label, "Physical exam findings");
assert.equal(savedDay.sourceCaptures[0].deidentifiedText, "Lungs clear bilaterally.");
assert.equal(savedPatient.days[0].sourceCaptures.length, 0, "the exam must target the latest hospital day");
assert.equal(savedPatient.contextSections.filter((section) => /Physical exam findings/.test(section.label)).length, 0);
assert.equal(persisted, "Saved openevidence physical exam findings to HD2 (2026-07-14).");

const admissionOnly = createPatientRecord("Admission-only patient");
state.vault = { ...state.vault, activePatientId: admissionOnly.id, patients: [admissionOnly] };
await controller.saveExamFindings({ text: "Admission exam.", source: "OpenEvidence" });
assert.equal(state.vault.patients[0].contextSections.filter((section) => section.label === "Physical exam findings - Admission").length, 1);

console.log("Exam-findings save controller tests passed");
