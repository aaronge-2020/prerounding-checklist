import assert from "node:assert/strict";
import { buildPromptVariableMap, DEFAULT_PROMPT_TEMPLATES, SMART_PROMPT_VARIABLES } from "../src/prompts/custom-templates.js";

const snapshot = {
  items: [
    { id: "gen_appearance", kind: "exam", workupTitle: "General", text: "General appearance", choices: ["Normal", "Abnormal", "Not assessed"] }
  ]
};

function patientWithDay({ contextSections = [], sourceCaptures = [], answers = {}, quickNotes = [], openEvidenceExamNote = null } = {}) {
  const day = { id: "day1", date: "2026-07-13", label: "HD1", checklistSnapshot: snapshot, answers, quickNotes, sections: [], sourceCaptures, openEvidenceExamNote };
  return { days: [day], contextSections };
}

assert.equal(SMART_PROMPT_VARIABLES.some(({ token }) => token === "@exam-findings"), false);
assert.equal(SMART_PROMPT_VARIABLES.some(({ token }) => token === "@admissions-exam-findings"), true);
assert.equal(SMART_PROMPT_VARIABLES.some(({ token }) => token === "@selected-day-exam-findings"), true);

// Admission physical exam text comes from the admission packet.
{
  const variables = buildPromptVariableMap({
    patient: patientWithDay({
      contextSections: [{ label: "Physical exam findings - Admission", deidentifiedText: "Admission: lungs clear bilaterally." }]
    }),
    selectedDayId: "day1"
  });
  assert.match(variables["@admissions-exam-findings"], /Prior clinician physical exam findings[\s\S]*Admission: lungs clear bilaterally\./);
  assert.equal(variables["@selected-day-exam-findings"], "No exam findings recorded.");
}

// Hospital Stay physical-exam source text comes from the selected day packet.
{
  const variables = buildPromptVariableMap({
    patient: patientWithDay({
      sourceCaptures: [{ sourceKind: "physical_exam", label: "Physical exam findings", deidentifiedText: "HD1: faint wheeze." }]
    }),
    selectedDayId: "day1"
  });
  assert.match(variables["@selected-day-exam-findings"], /HD1: faint wheeze\./);
  assert.doesNotMatch(variables["@selected-day-exam-findings"], /No exam findings recorded/);
}

// Prior exams remain in the admission packet, while today's exam is excluded
// from both generic packets and appears only in its dedicated smart variable.
{
  const patient = patientWithDay({
    contextSections: [
      { id: "admission-exam", label: "Physical exam findings - Admission", deidentifiedText: "Prior lungs clear." },
      { id: "admission-reason", label: "Admission context", deidentifiedText: "Admitted for dyspnea." }
    ],
    sourceCaptures: [
      { sourceKind: "physical_exam", label: "Physical exam findings", deidentifiedText: "Current lungs clear." },
      { sourceKind: "primary_note", label: "Primary team note", deidentifiedText: "Breathing improved." }
    ]
  });
  const variables = buildPromptVariableMap({ patient, selectedDayId: "day1" });
  assert.match(variables["@admission-packet"], /Prior lungs clear/);
  assert.match(variables["@admissions-exam-findings"], /Prior lungs clear/);
  assert.doesNotMatch(variables["@admission-packet"], /Current lungs clear/);
  assert.doesNotMatch(variables["@selected-day"], /Current lungs clear/);
  assert.doesNotMatch(variables["@selected-day"], /Prior lungs clear/);
  assert.match(variables["@selected-day-exam-findings"], /Current lungs clear/);
}

// Legacy checklist-only records still resolve until their packet is edited.
{
  const variables = buildPromptVariableMap({
    patient: patientWithDay({ answers: { gen_appearance: { selected: ["Normal"], note: "" } } }),
    selectedDayId: "day1"
  });
  assert.match(variables["@selected-day-exam-findings"], /General appearance[\s\S]*Answer: Normal/);
}

assert.doesNotMatch(DEFAULT_PROMPT_TEMPLATES.initial_admission_rounds, /@admissions-exam-findings/);
assert.match(DEFAULT_PROMPT_TEMPLATES.consulting, /@selected-day-exam-findings/);
for (const template of Object.values(DEFAULT_PROMPT_TEMPLATES)) assert.doesNotMatch(template, /@exam-findings/);

console.log("Exam-findings prompt token tests passed");
