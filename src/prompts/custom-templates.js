import { checklistAnswersSummary } from "../checklist/state.js";
import { buildTrajectoryBlock, dayById, latestDay } from "../daily-updates/days.js";
import { sectionsToPromptBlock } from "../patient-context/sections.js";
import { OPEN_EVIDENCE_TASKS } from "./open-evidence.js";

export const PROMPT_TEMPLATE_STORAGE_KEY = "prerounding_prompt_templates_v1";

export const DEFAULT_PROMPT_TEMPLATES = {
  initial_admission_rounds: `@guidelines\n\nCreate an initial admission rounds note from the admission packet below.\n\n@admission-packet\n\n@hospital-stay\n\n@checklist-answers`,
  daily_progress_note: `@guidelines\n\nCreate a daily progress note for @selected-day.\n\n@admission-packet\n\n@hospital-stay\n\n@checklist-answers`,
  teaching_case_trajectory: `Teach the full case trajectory using the admission packet and hospital stay below. Explain the clinical reasoning, uncertainty, and major management decisions.\n\n@admission-packet\n\n@hospital-stay\n\n@checklist-answers`,
  medication_explainer_by_problem: `Organize the medications by treated disease, condition, symptom, or indication. Explain what each medication does and mark uncertain indications clearly.\n\n@medications\n\n@hospital-stay`,
  medication_safety_audit: `Check each medication for indication, dose, route, frequency, duplication, interactions, contraindications, and missing context. Say "insufficient information" rather than guessing.\n\n@medications\n\n@labs\n\n@hospital-stay`,
  checklist_workup_refinement: `Review this checklist against the admission packet and hospital stay. Suggest only history questions and physical exam items, organized by system when useful.\n\n@admission-packet\n\n@hospital-stay\n\n@checklist-answers`
};

export const SMART_PROMPT_VARIABLES = [
  { token: "@guidelines", label: "Guidelines.md", description: "Insert the complete bundled documentation standard." },
  { token: "@admission-packet", label: "Admission packet", description: "All saved admission fields, labeled." },
  { token: "@hospital-stay", label: "Hospital stay", description: "All saved hospital-day packets." },
  { token: "@selected-day", label: "Selected day", description: "The current hospital day packet." },
  { token: "@checklist-answers", label: "Checklist answers", description: "History and physical exam answers." }
];

function promptToken(label, index, used) {
  const stem = String(label || "context")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `context-${index + 1}`;
  const base = `@${stem}`;
  let token = base;
  let suffix = 2;
  while (used.has(token)) token = `${base}-${suffix++}`;
  used.add(token);
  return token;
}

export function promptVariablesForPatient(patient) {
  const used = new Set(SMART_PROMPT_VARIABLES.map((variable) => variable.token));
  const sectionVariables = (patient?.contextSections || []).map((section, index) => ({
    token: promptToken(section.label, index, used),
    label: section.label || `Admission field ${index + 1}`,
    description: "This admission packet field.",
    sectionId: section.id
  }));
  return [...sectionVariables, ...SMART_PROMPT_VARIABLES];
}

function sectionByLabel(sections = [], pattern) {
  return sections.find((section) => pattern.test(section.label || "")) || null;
}

function taskRequiresGuidelines(taskId) {
  return OPEN_EVIDENCE_TASKS.some((task) => task.id === taskId && task.requiresGuidelines);
}

export function loadPromptTemplateOverrides(storage = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(PROMPT_TEMPLATE_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePromptTemplateOverrides(overrides, storage = localStorage) {
  storage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, JSON.stringify(overrides || {}));
}

export function promptTemplateForTask(taskId, overrides = {}) {
  const saved = String(overrides?.[taskId] || "");
  return saved && saved !== "@default-prompt" ? saved : String(DEFAULT_PROMPT_TEMPLATES[taskId] || "");
}

export function buildPromptVariableMap({ taskId: _taskId, patient, selectedDayId, guidelines }) {
  const selectedDay = dayById(patient?.days || [], selectedDayId) || latestDay(patient?.days || []);
  const snapshot = selectedDay?.checklistSnapshot || null;
  const answers = selectedDay?.answers || {};
  const medicationSection = sectionByLabel(patient?.contextSections || [], /medication/i);
  const labSection = sectionByLabel(patient?.contextSections || [], /lab|result/i);
  const sectionValues = Object.fromEntries(
    promptVariablesForPatient(patient)
      .filter((variable) => !SMART_PROMPT_VARIABLES.some((base) => base.token === variable.token))
      .map((variable) => {
        const section = (patient?.contextSections || []).find((entry) => entry.id === variable.sectionId);
        return [variable.token, section?.deidentifiedText?.trim() || `No saved ${variable.label.toLowerCase()} text.`];
      })
  );
  return {
    ...sectionValues,
    "@admission-packet": sectionsToPromptBlock(patient?.contextSections || [], "Admission packet"),
    "@medications": medicationSection?.deidentifiedText || "No saved medication text.",
    "@labs": labSection?.deidentifiedText || "No saved lab text.",
    "@hospital-stay": buildTrajectoryBlock(patient, { selectedDayId, includeAllDays: true }),
    "@selected-day": selectedDay ? sectionsToPromptBlock(selectedDay.sections || [], `Selected day: ${selectedDay.date} - ${selectedDay.label}`) : "No selected day.",
    "@checklist-answers": checklistAnswersSummary(snapshot, answers),
    "@guidelines": String(guidelines || "").trim()
  };
}

export function interpolatePromptTemplate(template, variables) {
  return Object.entries(variables).reduce(
    (text, [token, value]) => text.split(token).join(String(value || "")),
    String(template || "")
  );
}

export function ensureRequiredGuidelines({ taskId, prompt, guidelines }) {
  if (!taskRequiresGuidelines(taskId)) return prompt;
  const text = String(guidelines || "").trim();
  if (!text) throw new Error("Guidelines.md must be loaded for admission and progress prompts.");
  if (prompt.includes(text)) return prompt;
  return `<documentation_standard source="Guidelines.md">\n${text}\n</documentation_standard>\n\n${prompt}`;
}

export function buildCustomOpenEvidencePrompt({ taskId, template, patient, selectedDayId, guidelines }) {
  const variables = buildPromptVariableMap({ taskId, patient, selectedDayId, guidelines });
  const interpolated = interpolatePromptTemplate(template, variables);
  return ensureRequiredGuidelines({ taskId, prompt: interpolated, guidelines });
}
