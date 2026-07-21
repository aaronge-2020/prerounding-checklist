import assert from "node:assert/strict";
import { buildPromptVariableMap } from "../src/prompts/custom-templates.js";

const snapshot = {
  items: [
    { id: "gen_appearance", kind: "exam", workupTitle: "General", text: "General appearance", choices: ["Normal", "Abnormal", "Not assessed"] }
  ]
};

function patientWithDay({ answers = {}, quickNotes = [], openEvidenceExamNote = null } = {}) {
  const day = { id: "day1", date: "2026-07-13", label: "HD1", checklistSnapshot: snapshot, answers, quickNotes, sections: [], openEvidenceExamNote };
  return { days: [day], contextSections: [] };
}

// Checklist empty, no exam note -> neutral fallback.
{
  const variables = buildPromptVariableMap({ taskId: "daily_progress_note", patient: patientWithDay(), selectedDayId: "day1" });
  assert.equal(variables["@exam-findings"], "No exam findings recorded.");
  assert.equal(variables["@openevidence-exam-note"], "No saved OpenEvidence exam note.");
}

// Checklist empty, exam note saved -> exam note wins.
{
  const patient = patientWithDay({ openEvidenceExamNote: { text: "Exam: lungs clear, heart RRR.", residualWarnings: [], savedAt: "2026-07-13T10:00:00.000Z" } });
  const variables = buildPromptVariableMap({ taskId: "daily_progress_note", patient, selectedDayId: "day1" });
  assert.equal(variables["@exam-findings"], "Exam: lungs clear, heart RRR.");
  assert.equal(variables["@openevidence-exam-note"], "Exam: lungs clear, heart RRR.");
}

// Checklist has a real answer -> checklist wins even if an exam note also exists.
{
  const patient = patientWithDay({
    answers: { gen_appearance: { selected: ["Normal"], note: "" } },
    openEvidenceExamNote: { text: "Exam: lungs clear.", residualWarnings: [], savedAt: "2026-07-13T10:00:00.000Z" }
  });
  const variables = buildPromptVariableMap({ taskId: "daily_progress_note", patient, selectedDayId: "day1" });
  assert.match(variables["@exam-findings"], /General appearance[\s\S]*Answer: Normal/);
  assert.doesNotMatch(variables["@exam-findings"], /Exam: lungs clear\./);
}

// Quick notes alone (no assessed items) also count as checklist content, taking priority over the exam note.
{
  const patient = patientWithDay({
    quickNotes: [{ id: "n1", text: "Patient reports mild nausea.", createdAt: "2026-01-01T00:00:00.000Z" }],
    openEvidenceExamNote: { text: "Exam: lungs clear.", residualWarnings: [], savedAt: "2026-07-13T10:00:00.000Z" }
  });
  const variables = buildPromptVariableMap({ taskId: "daily_progress_note", patient, selectedDayId: "day1" });
  assert.match(variables["@exam-findings"], /Patient reports mild nausea\./);
  assert.doesNotMatch(variables["@exam-findings"], /Exam: lungs clear\./);
}

// No selected day at all -> both tokens degrade gracefully, no crash.
{
  const variables = buildPromptVariableMap({ taskId: "daily_progress_note", patient: { days: [], contextSections: [] }, selectedDayId: "" });
  assert.equal(variables["@exam-findings"], "No exam findings recorded.");
  assert.equal(variables["@openevidence-exam-note"], "No saved OpenEvidence exam note.");
}

// Prompt variables are derived from the supplied patient record, never from
// another patient's saved checklist or OpenEvidence exam note.
{
  const firstPatient = patientWithDay({ openEvidenceExamNote: { text: "First patient: clear lungs.", residualWarnings: [], savedAt: "2026-07-13T10:00:00.000Z" } });
  const secondPatient = patientWithDay({ openEvidenceExamNote: { text: "Second patient: wheezing.", residualWarnings: [], savedAt: "2026-07-13T11:00:00.000Z" } });
  const firstVariables = buildPromptVariableMap({ patient: firstPatient, selectedDayId: "day1" });
  const secondVariables = buildPromptVariableMap({ patient: secondPatient, selectedDayId: "day1" });
  assert.equal(firstVariables["@exam-findings"], "First patient: clear lungs.");
  assert.equal(secondVariables["@exam-findings"], "Second patient: wheezing.");
  assert.doesNotMatch(secondVariables["@exam-findings"], /First patient/);
}

// The default daily-progress and admission templates use the smart token, not the raw checklist token.
{
  const { DEFAULT_PROMPT_TEMPLATES } = await import("../src/prompts/custom-templates.js");
  assert.match(DEFAULT_PROMPT_TEMPLATES.daily_progress_note, /@exam-findings/);
  assert.doesNotMatch(DEFAULT_PROMPT_TEMPLATES.daily_progress_note, /@checklist-answers/);
  assert.match(DEFAULT_PROMPT_TEMPLATES.initial_admission_rounds, /@exam-findings/);
  assert.match(DEFAULT_PROMPT_TEMPLATES.checklist_workup_refinement, /@checklist-answers/, "the checklist-refinement template still targets the checklist explicitly");
}

console.log("Exam-findings prompt token tests passed");
