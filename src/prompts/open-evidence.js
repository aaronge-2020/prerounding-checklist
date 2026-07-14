import { checklistAnswersSummary } from "../checklist/state.js";
import { buildTrajectoryBlock } from "../daily-updates/days.js";
import { sectionsToPromptBlock } from "../patient-context/sections.js";
import { buildTeamPreferencesPromptBlock } from "../app/preferences.js";
import { naturalLanguagePrompt } from "./natural-language.js";

export const OPEN_EVIDENCE_TASKS = [
  {
    id: "initial_admission_rounds",
    label: "Initial admission rounds",
    requiresGuidelines: true
  },
  {
    id: "daily_progress_note",
    label: "Daily progress-note update",
    requiresGuidelines: true
  },
  {
    id: "teaching_case_trajectory",
    label: "Teaching: full case trajectory",
    requiresGuidelines: false
  },
  {
    id: "medication_explainer_by_problem",
    label: "Medication organization and explanation",
    requiresGuidelines: false
  },
  {
    id: "medication_safety_audit",
    label: "Medication safety audit",
    requiresGuidelines: false
  },
  {
    id: "checklist_workup_refinement",
    label: "Checklist/workup refinement",
    requiresGuidelines: false
  },
  {
    id: "preround_bedside_exam",
    label: "Pre-round bedside exam",
    requiresGuidelines: true
  },
  {
    id: "discharge_instructions",
    label: "Discharge instructions",
    requiresGuidelines: true
  }
];

export const openEvidenceTasks = Object.fromEntries(OPEN_EVIDENCE_TASKS.map((task) => [task.id, task]));

function compactText(text, limit = 42000) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  const head = value.slice(0, Math.floor(limit * 0.55));
  const tail = value.slice(value.length - Math.floor(limit * 0.35));
  return `${head}\n\nThe middle of this context was omitted to keep the request manageable.\n\n${tail}`;
}

export function documentationInstructionForTask(taskId, guidelines) {
  // Guidelines-admission.md and Guidelines-progress.md are the canonical
  // documentation standards; embed their full text so OpenEvidence receives
  // the exact standard rather than a paraphrase of it.
  const legacy = typeof guidelines === "string" ? guidelines : "";
  const text = taskId === "initial_admission_rounds"
    ? String(legacy || guidelines?.admission || "").trim()
    : String(legacy || guidelines?.progress || "").trim();
  if (!text) throw new Error("The task-specific documentation standard must be loaded before building this prompt.");
  return text;
}

function patientBlocks(patient, selectedDayId = "") {
  const days = [...(patient?.days || [])].sort((left, right) => `${left.date || ""} ${left.createdAt || ""}`.localeCompare(`${right.date || ""} ${right.createdAt || ""}`));
  const currentDay = days.find((day) => day.id === selectedDayId) || days.at(-1) || null;
  const snapshot = currentDay?.checklistSnapshot || null;
  const answers = currentDay?.answers || {};
  const quickNotes = currentDay?.quickNotes || [];
  return {
    patientContext: sectionsToPromptBlock(patient?.contextSections || [], "Saved patient context"),
    trajectory: buildTrajectoryBlock(patient, { selectedDayId: currentDay?.id, includeAllDays: false }),
    selectedDay: currentDay ? sectionsToPromptBlock(currentDay.sections || [], `Latest day: ${currentDay.date} - ${currentDay.label}`) : "",
    checklist: checklistAnswersSummary(snapshot, answers, quickNotes)
  };
}

export function buildInitialAdmissionPrompt({ patient, guidelines }) {
  const blocks = patientBlocks(patient);
  return `Write a concise, chart-ready initial admission note from this de-identified information. Do not repeat information.

${documentationInstructionForTask("initial_admission_rounds", guidelines)}

${compactText(blocks.patientContext)}

Here are the checklist answers for context.
${compactText(blocks.checklist, 10000)}
`;
}

export function buildDailyProgressPrompt({ patient, selectedDayId, guidelines }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return `Write a concise daily progress note for the selected hospital day from this de-identified information. Include differentials for acute problems when the available information supports them.

${documentationInstructionForTask("daily_progress_note", guidelines)}

${compactText(blocks.patientContext, 18000)}

${compactText(blocks.trajectory, 24000)}

Here are the checklist answers from today's rounds.
${compactText(blocks.checklist, 10000)}
`;
}

export function buildTeachingTrajectoryPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return `Teach this patient's full case and hospital course to a clinician in training. Start with a one-sentence illness script, then explain the course, key pathophysiology, clinical reasoning, uncertainty, and why the major decisions or pending questions matter. Tie teaching points directly to this patient. Do not write a clinical note or claim a trend that the provided information does not state.

${compactText(blocks.patientContext, 22000)}

${compactText(blocks.trajectory, 26000)}

Here are the checklist answers.
${compactText(blocks.checklist, 10000)}`;
}

export function buildMedicationExplainerPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return `Organize the medications by the disease, condition, symptom, or clinical purpose they appear intended to treat. For each medication, give its generic name when available, dose, route, frequency, intended problem, a brief explanation of what it does, and whether the intended purpose is confirmed from context, inferred, or uncertain. If the purpose is unclear, say what information is needed. Do not guess.

${compactText(blocks.patientContext, 24000)}

${compactText(blocks.trajectory, 22000)}`;
}

export function buildMedicationSafetyPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return `Review each medication for safety concerns. Consider its indication, dose, route, frequency, duplications or overlapping therapy, interactions, contraindications, renal or hepatic adjustment when relevant information is available, monitoring needs, and missing information. Use the exact phrase insufficient information when the chart does not provide enough data. Do not guess doses, routes, indications, kidney function, allergies, or interactions. Finish with the most important safety concerns first.

${compactText(blocks.patientContext, 24000)}

${compactText(blocks.trajectory, 22000)}`;
}

export function buildChecklistRefinementPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return `Review this workup-derived checklist against the de-identified patient context. Suggest useful history questions or physical exam items, identify items that are redundant, vague, or not relevant, and offer short answer choices for new items. Use plain language only. Do not suggest orders, treatment plans, diagnoses, citations, code, or structured data.

${compactText(blocks.patientContext, 22000)}

${compactText(blocks.trajectory, 22000)}

Current checklist:
${compactText(blocks.checklist, 12000)}`;
}

export function buildOpenEvidencePrompt(taskId, options = {}) {
  const builders = {
    initial_admission_rounds: buildInitialAdmissionPrompt,
    daily_progress_note: buildDailyProgressPrompt,
    teaching_case_trajectory: buildTeachingTrajectoryPrompt,
    medication_explainer_by_problem: buildMedicationExplainerPrompt,
    medication_safety_audit: buildMedicationSafetyPrompt,
    checklist_workup_refinement: buildChecklistRefinementPrompt
  };
  const builder = builders[taskId];
  if (!builder) throw new Error(`Unknown OpenEvidence prompt task: ${taskId}`);
  return naturalLanguagePrompt(`${buildTeamPreferencesPromptBlock(options.teamPreferences)}\n\n${builder(options)}`);
}
