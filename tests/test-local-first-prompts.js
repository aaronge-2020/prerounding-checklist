import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDailyRecord, upsertDay } from "../src/daily-updates/days.js";
import { createPatientRecord } from "../src/app/state/vault.js";
import { buildOpenEvidencePrompt, openEvidenceTasks } from "../src/prompts/open-evidence.js";
import { buildCustomOpenEvidencePrompt, DEFAULT_PROMPT_TEMPLATES, promptVariablesForPatient } from "../src/prompts/custom-templates.js";
import { createGuidelineSet } from "../src/prompts/guideline-sets.js";
import { buildTeamPreferencesPromptBlock, normalizeUserPreferences } from "../src/app/preferences.js";
import { createSourceCapture } from "../src/patient-context/source-captures.js";

const guidelines = {
  admission: readFileSync("prompts/Guidelines-admission.md", "utf8"),
  progress: readFileSync("prompts/Guidelines-progress.md", "utf8")
};

for (const template of Object.values(DEFAULT_PROMPT_TEMPLATES)) {
  assert.match(template, /^(?:\s*@[-a-z]+)+\s*$/, "default prompt templates must contain smart variables only");
}
assert.match(DEFAULT_PROMPT_TEMPLATES.daily_progress_note, /@progress-note-packet/, "daily progress template must use the compiled selected-day packet");
assert.doesNotMatch(DEFAULT_PROMPT_TEMPLATES.daily_progress_note, /@exam-findings/, "daily progress template must not use the removed all-days examination variable");
assert.match(DEFAULT_PROMPT_TEMPLATES.teaching_case_trajectory, /@teaching-case-instructions/, "case teaching defaults must include their reusable instructions");
assert.match(DEFAULT_PROMPT_TEMPLATES.medication_explainer_by_problem, /@medication-explainer-instructions/, "medication teaching defaults must include their reusable instructions");
assert.match(DEFAULT_PROMPT_TEMPLATES.medication_safety_audit, /@medication-safety-instructions/, "medication safety defaults must include their reusable instructions");
assert.match(DEFAULT_PROMPT_TEMPLATES.medication_explainer_by_problem, /@admission-packet/, "medication teaching defaults need patient context to establish indication");
assert.match(DEFAULT_PROMPT_TEMPLATES.medication_safety_audit, /@admission-packet/, "medication safety defaults need patient context for contraindications and verification");
const customTeamInstructions = "Write only the highest-yield active problems and keep the plan action-focused.";
assert.equal(buildTeamPreferencesPromptBlock(), "", "team preferences must be blank by default");
assert.equal(buildTeamPreferencesPromptBlock({ medicalService: "", presentationDetail: "" }), "", "blank settings must stay blank");
assert.equal(buildTeamPreferencesPromptBlock({ medicalService: "primary", presentationDetail: "standard" }), "", "legacy untouched defaults must migrate to blank");
assert.equal(buildTeamPreferencesPromptBlock({ teamInstructions: customTeamInstructions }), customTeamInstructions);
assert.equal(normalizeUserPreferences({ teamInstructions: customTeamInstructions }).teamInstructions, customTeamInstructions);
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
const primaryDaySource = { ...createSourceCapture({ sourceKind: "primary_note", text: "Feels less short of breath after diuresis." }), id: "day_source_primary" };
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
    sourceCaptures: [primaryDaySource],
    checklistSnapshot,
    answers: { item_1: { selected: ["No"], note: "" } },
    quickNotes: [{ id: "note_1", text: "Patient mentioned new hip pain unrelated to admission.", createdAt: "2026-07-09T12:05:00.000Z" }]
  })
};

assert.equal(openEvidenceTasks[["final", "rounds", "update"].join("_")], undefined);

const admission = buildOpenEvidencePrompt("initial_admission_rounds", { patient, guidelines });
assert.match(admission, /Attending-Facing H&P Instructions/);
assert.match(admission, /Limit the overall Assessment to two sentences/);
assert.match(admission, /Scale detail to case complexity and make a straightforward case very brief/);
assert.match(admission, /Omit every subjective, objective, and historical detail that does not change the current differential, management, plan, risk, or disposition/);
assert.match(admission, /why the patient was admitted plus the one or two past medical-history conditions most pertinent/);
assert.match(admission, /differential diagnoses under the applicable problem in Plan/);
assert.match(admission, /most likely diagnosis vs plausible alternative 1 vs plausible alternative 2 vs plausible alternative 3 vs plausible alternative 4/);
assert.match(guidelines.admission, /Begin with age, sex or gender as documented/);
assert.match(guidelines.admission, /conditions or procedures that modify diagnosis or treatment/);
assert.match(guidelines.admission, /Use the straightforward-case format unless there is meaningful diagnostic uncertainty/);
assert.match(guidelines.admission, /material treatment already received when it affects current care/);
assert.match(guidelines.admission, /clearly distinguish your recommendations from documented treatment/);
assert.match(admission, /Admission context/);
assert.match(admission, /Chest pain\?/);
assert.match(admission, /Patient mentioned new hip pain unrelated to admission\./);

const progress = buildOpenEvidencePrompt("daily_progress_note", { patient, selectedDayId: day.id, guidelines });
assert.match(progress, /daily progress note/i);
assert.match(progress, /Limit the overall Assessment to two sentences/);
assert.match(progress, /Scale detail to case complexity and make a straightforward case very brief/);
assert.match(progress, /Omit every subjective, objective, and historical detail that does not change today's differential, management, plan, risk, or disposition/);
assert.match(progress, /why the patient was admitted plus the one or two past medical-history conditions most pertinent/);
assert.match(progress, /differential diagnoses under the applicable problem in Plan/);
assert.match(progress, /most likely diagnosis vs plausible alternative 1 vs plausible alternative 2 vs plausible alternative 3 vs plausible alternative 4/);
assert.match(guidelines.progress, /The first sentence must restate the overall One-Liner synthesis/);
assert.match(guidelines.progress, /One or two comorbidities or recent interventions most relevant to today’s decisions/);
assert.match(guidelines.progress, /Target 350–500 words for a complex patient and fewer for a straightforward patient/);
assert.match(guidelines.progress, /If removing this fact would not change today’s clinical interpretation/);
assert.match(guidelines.progress, /Use one to three active problem groups/);
assert.match(progress, /Vitals and Clinical Support/);
assert.match(progress, /Focused Examination/);
assert.match(progress, /Current vital signs and oxygen requirement are not available/);
assert.match(progress, /Patient mentioned new hip pain unrelated to admission\./);
assert.match(progress, /Feels less short of breath/);
assert.match(progress, /Selected hospital day/, "daily progress prompt must identify the selected day explicitly");
assert.doesNotMatch(progress, /2026-07-09/, "OpenEvidence progress prompts must not expose the selected packet's calendar date");

const selectedDayOnlyPrompt = buildCustomOpenEvidencePrompt({
  taskId: "custom-selected-day-date-guard",
  template: "@selected-day",
  patient,
  selectedDayId: day.id
});
assert.match(selectedDayOnlyPrompt, /Selected hospital-day source record/);
assert.doesNotMatch(selectedDayOnlyPrompt, /2026-07-09/, "the selected-day prompt variable must never expose its stored calendar date");

const teaching = buildOpenEvidencePrompt("teaching_case_trajectory", { patient, selectedDayId: day.id });
assert.match(teaching, /full case and hospital course/i);
assert.match(teaching, /Do not write a clinical note or claim a trend/i);

const defaultTeachingPrompt = buildCustomOpenEvidencePrompt({
  taskId: "teaching_case_trajectory",
  template: DEFAULT_PROMPT_TEMPLATES.teaching_case_trajectory,
  patient,
  selectedDayId: day.id
});
assert.match(defaultTeachingPrompt, /two progressively challenging, case-specific active-recall questions/i);
assert.match(defaultTeachingPrompt, /withhold their answers until the student asks/i);

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
assert.equal(openEvidenceTasks.presentation_quality_editor?.label, "Edit and verify presentation");
const presentationEditorPrompt = buildCustomOpenEvidencePrompt({
  taskId: "presentation_quality_editor",
  template: DEFAULT_PROMPT_TEMPLATES.presentation_quality_editor,
  patient,
  selectedDayId: day.id,
  presentationToEdit: "One-Liner\nA de-identified sample presentation.\n\nAssessment\nA concise assessment."
});
assert.match(presentationEditorPrompt, /Return only the fully revised presentation/);
assert.match(presentationEditorPrompt, /A de-identified sample presentation/);
assert.doesNotMatch(presentationEditorPrompt, /@presentation-to-edit/);
const presentationEditorWithoutPastedText = buildCustomOpenEvidencePrompt({
  taskId: "presentation_quality_editor",
  template: DEFAULT_PROMPT_TEMPLATES.presentation_quality_editor,
  patient,
  selectedDayId: day.id
});
assert.match(presentationEditorWithoutPastedText, /Return only the fully revised presentation/);
assert.doesNotMatch(presentationEditorWithoutPastedText, /No presentation was pasted/);
const consultingGuidelines = createGuidelineSet("Consulting Updated", readFileSync("prompts/Consulting.md", "utf8"));
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
const teamGuideline = createGuidelineSet("Team preferences", "Use concise language.", { existingTokens: ["@team-preferences"] });
teamGuideline.token = "@team-preferences";
const teamVariables = promptVariablesForPatient(patient, { guidelineSets: [teamGuideline] });
assert.equal(teamVariables.filter((variable) => variable.token === "@team-preferences").length, 1);
const teamGuidelinePrompt = buildCustomOpenEvidencePrompt({ template: "Use @team-preferences only.", patient, guidelineSets: [teamGuideline] });
assert.match(teamGuidelinePrompt, /Use concise language/);

const dayVariables = promptVariablesForPatient(patient, { selectedDayId: day.id });
const firstDayVariable = dayVariables.find((variable) => variable.daySourceId === primaryDaySource.id);
assert.ok(firstDayVariable, "saved hospital-day sources should become dynamic prompt variables");
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
    sourceCaptures: [{ ...createSourceCapture({ sourceKind: "primary_note", text: "Older day finding." }), id: "older_day_source" }]
  }), {
    ...day,
    sourceCaptures: [{ ...createSourceCapture({ sourceKind: "primary_note", text: "Latest day finding." }), id: "latest_day_source" }]
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
assert.doesNotMatch(directAdmission, /Attending-Facing H&P Instructions/, "guidelines are only included where a template references their token - never force-injected");
assert.match(directAdmission, /most likely diagnosis vs plausible alternative 1 vs plausible alternative 2 vs plausible alternative 3 vs plausible alternative 4/);
assert.doesNotMatch(directAdmission, /Privacy rules:/);

const directProgress = buildCustomOpenEvidencePrompt({
  taskId: "daily_progress_note",
  template: "Create the note from @progress-note-packet.",
  patient,
  selectedDayId: day.id,
  guidelineSets
});
assert.match(directProgress, /most likely diagnosis vs plausible alternative 1 vs plausible alternative 2 vs plausible alternative 3 vs plausible alternative 4/);

const directGuidelines = buildCustomOpenEvidencePrompt({
  taskId: "initial_admission_rounds",
  template: "Use @admission-guidelines before explaining the case.",
  patient,
  selectedDayId: day.id,
  guidelineSets
});
assert.match(directGuidelines, /Attending-Facing H&P Instructions/);
assert.doesNotMatch(directGuidelines, /@admission-guidelines/);

const medicationTeachingPrompt = buildCustomOpenEvidencePrompt({
  taskId: "medication_explainer_by_problem",
  template: `${DEFAULT_PROMPT_TEMPLATES.medication_explainer_by_problem}\n\n@team-preferences`,
  patient,
  selectedDayId: day.id,
  teamPreferences: { teamInstructions: "Medication-focused review." }
});
assert.match(medicationTeachingPrompt, /Medication-focused review/);
assert.doesNotMatch(medicationTeachingPrompt, /Organize medications by the disease/, "task prose is not embedded in the default template");

const medicationDefaultPrompt = buildCustomOpenEvidencePrompt({
  taskId: "medication_explainer_by_problem",
  template: DEFAULT_PROMPT_TEMPLATES.medication_explainer_by_problem,
  patient,
  selectedDayId: day.id,
  teamPreferences: { teamInstructions: "Medication-focused review." }
});
assert.doesNotMatch(medicationDefaultPrompt, /Write for the Primary team/);
assert.match(medicationDefaultPrompt, /one patient-relevant monitoring or counseling pearl/i);
assert.match(medicationDefaultPrompt, /case-specific active-recall questions/i);

const medicationSafetyDefaultPrompt = buildCustomOpenEvidencePrompt({
  taskId: "medication_safety_audit",
  template: DEFAULT_PROMPT_TEMPLATES.medication_safety_audit,
  patient,
  selectedDayId: day.id
});
assert.match(medicationSafetyDefaultPrompt, /Rank only credible, clinically important concerns by urgency/i);
assert.match(medicationSafetyDefaultPrompt, /case-specific pause-and-check questions/i);
assert.match(medicationSafetyDefaultPrompt, /Missing data alone are not a safety concern/i);

const consultPrompt = buildCustomOpenEvidencePrompt({
  taskId: "teaching_case_trajectory",
  template: "@team-preferences\n\nUse @admission-context only.",
  patient,
  selectedDayId: day.id,
  teamPreferences: { teamInstructions: "Focus on the consulted arrhythmia question. Start with the one-liner." }
});
assert.match(consultPrompt, /arrhythmia question/);
assert.match(consultPrompt, /Start with the one-liner/);
assert.doesNotMatch(consultPrompt, /[\[\]{}<>()`]/);

console.log("local-first prompt tests passed");
