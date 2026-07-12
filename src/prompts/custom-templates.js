import { checklistAnswersSummary } from "../checklist/state.js";
import { buildTrajectoryBlock } from "../daily-updates/days.js";
import { sectionsToPromptBlock } from "../patient-context/sections.js";
import { buildTeamPreferencesPromptBlock } from "../app/preferences.js";
import { documentationInstructionForTask, OPEN_EVIDENCE_TASKS } from "./open-evidence.js";
import { naturalLanguagePrompt } from "./natural-language.js";

export const PROMPT_TEMPLATE_STORAGE_KEY = "prerounding_prompt_templates_v1";

export const DEFAULT_PROMPT_TEMPLATES = {
  initial_admission_rounds: `@guidelines\n\nCreate an initial admission rounds note from the admission packet below.\n\n@admission-packet\n\n@selected-day\n\n@checklist-answers`,
  daily_progress_note: `@guidelines\n\nCreate a daily progress note for @selected-day.\n\n@admission-packet\n\n@selected-day\n\n@checklist-answers`,
  teaching_case_trajectory: `Teach the full case trajectory using the admission packet and selected hospital day below. Explain the clinical reasoning, uncertainty, and major management decisions.\n\n@admission-packet\n\n@selected-day\n\n@checklist-answers`,
  medication_explainer_by_problem: `Organize the medications by treated disease, condition, symptom, or indication. Explain what each medication does and mark uncertain indications clearly.\n\n@medications\n\n@selected-day`,
  medication_safety_audit: `Check each medication for indication, dose, route, frequency, duplication, interactions, contraindications, and missing context. Say "insufficient information" rather than guessing.\n\n@medications\n\n@labs\n\n@selected-day`,
  checklist_workup_refinement: `Review this checklist against the admission packet and selected hospital day. Suggest only history questions and physical exam items, organized by system when useful.\n\n@admission-packet\n\n@selected-day\n\n@checklist-answers`
};

export const SMART_PROMPT_VARIABLES = [
  { token: "@guidelines", label: "Task documentation standard", description: "Insert the admission/HPI or daily-progress standard required for this task." },
  { token: "@admission-packet", label: "Admission packet", description: "All saved admission fields, labeled." },
  { token: "@selected-day", label: "Selected hospital day", description: "The chosen hospital-day packet; defaults to the latest saved day." },
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

function selectedPromptDay(patient, selectedDayId = "") {
  const days = [...(patient?.days || [])].sort((left, right) => `${left.date || ""} ${left.createdAt || ""}`.localeCompare(`${right.date || ""} ${right.createdAt || ""}`));
  return days.find((day) => day.id === selectedDayId) || days.at(-1) || null;
}

export function promptVariablesForPatient(patient, { selectedDayId = "" } = {}) {
  const used = new Set(SMART_PROMPT_VARIABLES.map((variable) => variable.token));
  const sectionVariables = (patient?.contextSections || []).map((section, index) => ({
    token: promptToken(section.label, index, used),
    label: section.label || `Admission field ${index + 1}`,
    description: "This admission packet field.",
    sectionId: section.id
  }));
  const day = selectedPromptDay(patient, selectedDayId);
  const daySectionVariables = (day?.sections || []).map((section, index) => ({
    token: promptToken(`day-${section.label}`, index, used),
    label: `${day.label || "Selected day"}: ${section.label || `Field ${index + 1}`}`,
    description: "This selected hospital-day field.",
    daySectionId: section.id
  }));
  return [...sectionVariables, ...daySectionVariables, ...SMART_PROMPT_VARIABLES];
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

export function buildPromptVariableMap({ taskId, patient, selectedDayId, guidelines }) {
  const selectedDay = selectedPromptDay(patient, selectedDayId);
  const snapshot = selectedDay?.checklistSnapshot || null;
  const answers = selectedDay?.answers || {};
  const quickNotes = selectedDay?.quickNotes || [];
  const medicationSection = sectionByLabel(patient?.contextSections || [], /medication/i);
  const labSection = sectionByLabel(patient?.contextSections || [], /lab|result/i);
  const sectionValues = Object.fromEntries(
    promptVariablesForPatient(patient, { selectedDayId })
      .filter((variable) => !SMART_PROMPT_VARIABLES.some((base) => base.token === variable.token))
      .map((variable) => {
        const section = (patient?.contextSections || []).find((entry) => entry.id === variable.sectionId);
        return [variable.token, section?.deidentifiedText?.trim() || `No saved ${variable.label.toLowerCase()} text.`];
      })
  );
  const selectedDayValues = Object.fromEntries(
    promptVariablesForPatient(patient, { selectedDayId })
      .filter((variable) => variable.daySectionId)
      .map((variable) => {
        const section = (selectedDay?.sections || []).find((entry) => entry.id === variable.daySectionId);
        return [variable.token, section?.deidentifiedText?.trim() || `No saved ${variable.label.toLowerCase()} text.`];
      })
  );
  return {
    ...sectionValues,
    ...selectedDayValues,
    "@admission-packet": sectionsToPromptBlock(patient?.contextSections || [], "Admission packet"),
    "@medications": medicationSection?.deidentifiedText || "No saved medication text.",
    "@labs": labSection?.deidentifiedText || "No saved lab text.",
    // Compatibility alias for a previously saved template. New templates use
    // only @selected-day so there is one clear choice of hospital-day scope.
    "@hospital-stay": buildTrajectoryBlock(patient, { selectedDayId: selectedDay?.id, includeAllDays: false }),
    "@selected-day": selectedDay ? sectionsToPromptBlock(selectedDay.sections || [], `Selected day: ${selectedDay.date} - ${selectedDay.label}`) : "No saved hospital day.",
    "@checklist-answers": checklistAnswersSummary(snapshot, answers, quickNotes),
    "@guidelines": taskRequiresGuidelines(taskId) ? documentationInstructionForTask(taskId, guidelines) : ""
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
  const instruction = documentationInstructionForTask(taskId, guidelines);
  return prompt.includes(instruction) ? prompt : `${instruction}\n\n${prompt}`;
}

export function buildCustomOpenEvidencePrompt({ taskId, template, patient, selectedDayId, guidelines, teamPreferences }) {
  const variables = buildPromptVariableMap({ taskId, patient, selectedDayId, guidelines });
  const interpolated = interpolatePromptTemplate(template, variables);
  const prompt = ensureRequiredGuidelines({ taskId, prompt: interpolated, guidelines });
  return naturalLanguagePrompt(`${buildTeamPreferencesPromptBlock(teamPreferences)}\n\n${prompt}`);
}
