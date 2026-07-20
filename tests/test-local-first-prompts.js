import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDailyRecord, upsertDay } from "../src/daily-updates/days.js";
import { createPatientRecord } from "../src/app/state/vault.js";
import { buildOpenEvidencePrompt, openEvidenceTasks } from "../src/prompts/open-evidence.js";
import { buildCustomOpenEvidencePrompt, DEFAULT_PROMPT_TEMPLATES, promptVariablesForPatient } from "../src/prompts/custom-templates.js";
import { createGuidelineSet } from "../src/prompts/guideline-sets.js";

const guidelines = {
  admission: readFileSync("prompts/Guidelines-admission.md", "utf8"),
  progress: readFileSync("prompts/Guidelines-progress.md", "utf8")
};

for (const template of Object.values(DEFAULT_PROMPT_TEMPLATES)) {
  assert.match(template, /^(?:\s*@[-a-z]+)+\s*$/, "default prompt templates must contain smart variables only");
}
assert.equal((DEFAULT_PROMPT_TEMPLATES.daily_progress_note.match(/@selected-day/g) || []).length, 1, "daily progress template must include selected day once");
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
const checklistSnapshot = {
  schema: "prerounding_checklist_v1",
  id: "checklist_prompt_test",
  createdAt: "2026-07-09T12:00:00.000Z",
  workupIds: ["test-workup"],
  workupTitles: ["Test workup"],
  items: [{ id: "item_1", workupId: "test-workup", workupTitle: "Test workup", itemId: "item_1", kind: "history", text: "Chest pain?", choices: ["No", "Yes"], select: "one", system: "Cardiovascular" }]
};
patient = {
  ...patient,
  days: upsertDay(patient.days, {
    ...day,
    sections: day.sections.map((section, index) =>
      index === 0 ? { ...section, deidentifiedText: "Feels less short of breath after diuresis." } : section
    ),
    checklistSnapshot,
    answers: { item_1: { selected: ["No"], note: "" } },
    quickNotes: [{ id: "note_1", text: "Patient mentioned new hip pain unrelated to admission.", createdAt: "2026-07-09T12:05:00.000Z" }]
  })
};

assert.equal(openEvidenceTasks[["final", "rounds", "update"].join("_")], undefined);

const admission = buildOpenEvidencePrompt("initial_admission_rounds", { patient, guidelines });
assert.match(admission, /Concise H&P Presentation/);
assert.match(admission, /Past Surgical History/);
assert.match(admission, /Admission context/);
assert.match(admission, /Chest pain\?/);
assert.match(admission, /Additional notes not tied to a specific checklist item/);
assert.match(admission, /Patient mentioned new hip pain unrelated to admission\./);

const progress = buildOpenEvidencePrompt("daily_progress_note", { patient, selectedDayId: day.id, guidelines });
assert.match(progress, /daily progress note/i);
assert.match(progress, /Vitals\/Clinical Support/);
assert.match(progress, /strict separation/);
assert.match(progress, /Patient mentioned new hip pain unrelated to admission\./);
assert.match(progress, /Feels less short of breath/);

const teaching = buildOpenEvidencePrompt("teaching_case_trajectory", { patient, selectedDayId: day.id });
assert.match(teaching, /full case and hospital course/i);
assert.match(teaching, /Do not write a clinical note or claim a trend/i);

const medicationOrganizer = buildOpenEvidencePrompt("medication_explainer_by_problem", { patient });
assert.match(medicationOrganizer, /disease, condition, symptom, or clinical purpose/);
assert.match(medicationOrganizer, /brief explanation of what it does/);
assert.match(medicationOrganizer, /confirmed from context, inferred, or uncertain/);
assert.doesNotMatch(medicationOrganizer, /Write for the Primary team/);

const medicationSafety = buildOpenEvidencePrompt("medication_safety_audit", { patient });
assert.match(medicationSafety, /indication/i);
assert.match(medicationSafety, /dose/i);
assert.match(medicationSafety, /route/i);
assert.match(medicationSafety, /frequency/i);
assert.match(medicationSafety, /insufficient information/);

for (const prompt of [admission, progress, teaching, medicationOrganizer, medicationSafety, buildOpenEvidencePrompt("checklist_workup_refinement", { patient })]) {
  assert.doesNotMatch(prompt, /[\[\]{}<>()`]/, "OpenEvidence prompts must stay in natural language without brackets or code syntax");
  assert.doesNotMatch(prompt, /^\s*(?:#|[-*]|\d+[.)])\s/m, "OpenEvidence prompts must not use Markdown or numbered-list syntax");
}

assert.throws(() => buildOpenEvidencePrompt("daily_progress_note", { patient, guidelines: "" }), /task-specific documentation standard/);

assert.equal(openEvidenceTasks.consulting?.label, "Consulting");
const consultingGuidelines = createGuidelineSet("Consulting", readFileSync("prompts/Consulting.md", "utf8"));
const consulting = buildCustomOpenEvidencePrompt({
  taskId: "consulting",
  template: DEFAULT_PROMPT_TEMPLATES.consulting,
  patient,
  selectedDayId: day.id,
  guidelineSets: [consultingGuidelines]
});
assert.match(consulting, /consult question/i);
assert.match(consulting, /V\/S/);
assert.match(consulting, /routine, about 24 hours; urgent; or emergent/i);
assert.match(consulting, /consulting-guidelines|Consulting/);
assert.doesNotMatch(consulting, /@consulting-guidelines/);

const checklistAnswersPrompt = buildCustomOpenEvidencePrompt({
  taskId: "checklist_workup_refinement",
  template: "Review @checklist-answers only.",
  patient,
  selectedDayId: day.id
});
assert.match(checklistAnswersPrompt, /Chest pain\?/);
assert.match(checklistAnswersPrompt, /Patient mentioned new hip pain unrelated to admission\./);

const fieldVariables = promptVariablesForPatient(patient);
assert.equal(fieldVariables.filter((variable) => variable.sectionId).length, patient.contextSections.length);
assert.equal(fieldVariables.find((variable) => variable.sectionId === patient.contextSections[0].id)?.token, "@admission-context");
assert.equal(fieldVariables.some((variable) => variable.token === "@guidelines"), false, "H&P and SOAP guidelines must not share one variable");

const guidelineSets = [
  createGuidelineSet("Admission", guidelines.admission),
  createGuidelineSet("Progress", guidelines.progress, { existingTokens: ["@admission-guidelines"] })
];
const fieldVariablesWithGuidelines = promptVariablesForPatient(patient, { guidelineSets });
assert.equal(fieldVariablesWithGuidelines.find((variable) => variable.token === "@admission-guidelines")?.label, "Admission");
assert.equal(fieldVariablesWithGuidelines.find((variable) => variable.token === "@progress-guidelines")?.label, "Progress");

const dayVariables = promptVariablesForPatient(patient, { selectedDayId: day.id });
const firstDayVariable = dayVariables.find((variable) => variable.daySectionId === day.sections[0].id);
assert.ok(firstDayVariable, "saved hospital-day fields should become dynamic prompt variables");
const directDayFieldPrompt = buildCustomOpenEvidencePrompt({
  taskId: "teaching_case_trajectory",
  template: `Use ${firstDayVariable.token} only.`,
  patient,
  selectedDayId: day.id
});
assert.match(directDayFieldPrompt, /Feels less short of breath/);

const directFieldPrompt = buildCustomOpenEvidencePrompt({
  taskId: "teaching_case_trajectory",
  template: "Use @admission-context only.",
  patient,
  selectedDayId: day.id
});
assert.match(directFieldPrompt, /Admitted for dyspnea and edema\./);
assert.doesNotMatch(directFieldPrompt, /Furosemide 40 mg/);

const plainCustomPrompt = buildCustomOpenEvidencePrompt({
  taskId: "teaching_case_trajectory",
  template: "Explain [this] {saved context} for @admission-context.",
  patient,
  selectedDayId: day.id
});
assert.match(plainCustomPrompt, /Admitted for dyspnea and edema\./);
assert.doesNotMatch(plainCustomPrompt, /[\[\]{}<>()`]/, "custom OpenEvidence prompts must remove bracketed template syntax");

const olderDay = createDailyRecord({ date: "2026-07-08", label: "Hospital day 1" });
const patientWithTwoDays = {
  ...patient,
  days: upsertDay(upsertDay([], {
    ...olderDay,
    sections: olderDay.sections.map((section, index) => index === 0 ? { ...section, deidentifiedText: "Older day finding." } : section)
  }), {
    ...day,
    sections: day.sections.map((section, index) => index === 0 ? { ...section, deidentifiedText: "Latest day finding." } : section)
  })
};
const selectedDayOnly = buildCustomOpenEvidencePrompt({
  taskId: "teaching_case_trajectory",
  template: "Use @hospital-stay only.",
  patient: patientWithTwoDays,
  selectedDayId: olderDay.id
});
assert.match(selectedDayOnly, /Older day finding\./);
assert.doesNotMatch(selectedDayOnly, /Latest day finding\./);

const latestOpenEvidenceDay = buildOpenEvidencePrompt("daily_progress_note", {
  patient: patientWithTwoDays,
  selectedDayId: olderDay.id,
  guidelines
});
assert.match(latestOpenEvidenceDay, /Older day finding\./);
assert.doesNotMatch(latestOpenEvidenceDay, /Latest day finding\./);

const directAdmission = buildCustomOpenEvidencePrompt({
  taskId: "initial_admission_rounds",
  template: "Create the note from @admission-packet.",
  patient,
  selectedDayId: day.id,
  guidelineSets
});
assert.doesNotMatch(directAdmission, /Concise H&P Presentation/, "guidelines are only included where a template references their token - never force-injected");
assert.doesNotMatch(directAdmission, /Privacy rules:/);

const directGuidelines = buildCustomOpenEvidencePrompt({
  taskId: "initial_admission_rounds",
  template: "Use @admission-guidelines before explaining the case.",
  patient,
  selectedDayId: day.id,
  guidelineSets
});
assert.match(directGuidelines, /Concise H&P Presentation/);
assert.doesNotMatch(directGuidelines, /@admission-guidelines/);

const medicationTeachingPrompt = buildCustomOpenEvidencePrompt({
  taskId: "medication_explainer_by_problem",
  template: `${DEFAULT_PROMPT_TEMPLATES.medication_explainer_by_problem}\n\n@team-preferences`,
  patient,
  selectedDayId: day.id,
  teamPreferences: { medicalService: "primary", presentationDetail: "standard" }
});
assert.match(medicationTeachingPrompt, /Write for the Primary team/);
assert.match(medicationTeachingPrompt, /Organize medications by the disease/);

const medicationDefaultPrompt = buildCustomOpenEvidencePrompt({
  taskId: "medication_explainer_by_problem",
  template: DEFAULT_PROMPT_TEMPLATES.medication_explainer_by_problem,
  patient,
  selectedDayId: day.id,
  teamPreferences: { medicalService: "primary", presentationDetail: "standard" }
});
assert.doesNotMatch(medicationDefaultPrompt, /Write for the Primary team/);

const consultPrompt = buildCustomOpenEvidencePrompt({
  taskId: "teaching_case_trajectory",
  template: "@team-preferences\n\nUse @admission-context only.",
  patient,
  selectedDayId: day.id,
  teamPreferences: {
    medicalService: "consult",
    serviceFocus: "Focus on the consulted arrhythmia question.",
    presentationDetail: "detailed",
    attendingPreferences: "Start with the one-liner."
  }
});
assert.match(consultPrompt, /Consult service/);
assert.match(consultPrompt, /consulted clinical question/i);
assert.match(consultPrompt, /arrhythmia question/);
assert.match(consultPrompt, /Start with the one-liner/);
assert.doesNotMatch(consultPrompt, /[\[\]{}<>()`]/);

console.log("local-first prompt tests passed");
