import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDailyRecord, upsertDay } from "../src/daily-updates/days.js";
import { createPatientRecord } from "../src/app/state/vault.js";
import { buildOpenEvidencePrompt, openEvidenceTasks } from "../src/prompts/open-evidence.js";
import { buildCustomOpenEvidencePrompt, promptVariablesForPatient } from "../src/prompts/custom-templates.js";

const guidelines = readFileSync("Guidelines.md", "utf8");
let patient = createPatientRecord("Room 7", { id: "patient_prompt" });
patient = {
  ...patient,
  contextSections: [
    { ...patient.contextSections[0], label: "Admission context", deidentifiedText: "Admitted for dyspnea and edema." },
    { ...patient.contextSections[1], label: "Medications", deidentifiedText: "Furosemide 40 mg PO daily. Lisinopril 10 mg PO daily." },
    { ...patient.contextSections[2], label: "Labs", deidentifiedText: "Creatinine 1.4, BNP elevated." }
  ]
};
const day = createDailyRecord({ date: "2026-07-09", label: "Hospital day 2" });
patient = {
  ...patient,
  days: upsertDay(patient.days, {
    ...day,
    sections: day.sections.map((section, index) =>
      index === 0 ? { ...section, deidentifiedText: "Feels less short of breath after diuresis." } : section
    )
  })
};

assert.equal(openEvidenceTasks[["final", "rounds", "update"].join("_")], undefined);

const admission = buildOpenEvidencePrompt("initial_admission_rounds", { patient, guidelines });
assert.match(admission, /Clinical Documentation Standard/);
assert.match(admission, /Rule of Separation/);
assert.match(admission, /The Full Admission Report/);
assert.match(admission, /Admission context/);

const progress = buildOpenEvidencePrompt("daily_progress_note", { patient, selectedDayId: day.id, guidelines });
assert.match(progress, /Clinical Documentation Standard/);
assert.match(progress, /The Daily Progress Note/);
assert.match(progress, /Subjective, Objective, Assessment, and Plan/);
assert.match(progress, /Feels less short of breath/);

const teaching = buildOpenEvidencePrompt("teaching_case_trajectory", { patient, selectedDayId: day.id });
assert.match(teaching, /entire patient case and trajectory/i);
assert.match(teaching, /Chronological hospital trajectory/);
assert.match(teaching, /Do not claim a trend unless/);

const medicationOrganizer = buildOpenEvidencePrompt("medication_explainer_by_problem", { patient });
assert.match(medicationOrganizer, /disease, condition, symptom, or clinical purpose/);
assert.match(medicationOrganizer, /what the medication does/);
assert.match(medicationOrganizer, /confirmed from context, inferred, or uncertain/);

const medicationSafety = buildOpenEvidencePrompt("medication_safety_audit", { patient });
assert.match(medicationSafety, /Indication/);
assert.match(medicationSafety, /Dosage/);
assert.match(medicationSafety, /Route/);
assert.match(medicationSafety, /Frequency/);
assert.match(medicationSafety, /insufficient information/);

assert.throws(() => buildOpenEvidencePrompt("daily_progress_note", { patient, guidelines: "" }), /Guidelines\.md/);

const fieldVariables = promptVariablesForPatient(patient);
assert.equal(fieldVariables.filter((variable) => variable.sectionId).length, patient.contextSections.length);
assert.equal(fieldVariables.find((variable) => variable.sectionId === patient.contextSections[0].id)?.token, "@admission-context");
assert.equal(fieldVariables.find((variable) => variable.token === "@guidelines")?.label, "Guidelines.md");

const directFieldPrompt = buildCustomOpenEvidencePrompt({
  taskId: "teaching_case_trajectory",
  template: "Use @admission-context only.",
  patient,
  selectedDayId: day.id
});
assert.match(directFieldPrompt, /Admitted for dyspnea and edema\./);
assert.doesNotMatch(directFieldPrompt, /Furosemide 40 mg/);

const directAdmission = buildCustomOpenEvidencePrompt({
  taskId: "initial_admission_rounds",
  template: "Create the note from @admission-packet.",
  patient,
  selectedDayId: day.id,
  guidelines
});
assert.match(directAdmission, /Clinical Documentation Standard/);
assert.doesNotMatch(directAdmission, /Privacy rules:/);

const directGuidelines = buildCustomOpenEvidencePrompt({
  taskId: "teaching_case_trajectory",
  template: "Use @guidelines before explaining the case.",
  patient,
  selectedDayId: day.id,
  guidelines
});
assert.match(directGuidelines, /Clinical Documentation Standard/);
assert.doesNotMatch(directGuidelines, /@guidelines/);

console.log("local-first prompt tests passed");
