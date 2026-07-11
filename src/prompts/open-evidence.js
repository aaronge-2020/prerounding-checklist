import { checklistAnswersSummary } from "../checklist/state.js";
import { buildTrajectoryBlock } from "../daily-updates/days.js";
import { sectionsToPromptBlock } from "../patient-context/sections.js";
import { buildTeamPreferencesPromptBlock } from "../app/preferences.js";

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
  }
];

export const openEvidenceTasks = Object.fromEntries(OPEN_EVIDENCE_TASKS.map((task) => [task.id, task]));

function compactText(text, limit = 42000) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  const head = value.slice(0, Math.floor(limit * 0.55));
  const tail = value.slice(value.length - Math.floor(limit * 0.35));
  return `${head}\n\n[Context compacted by the local app. Middle content omitted; documentation guidelines were not compacted.]\n\n${tail}`;
}

function documentationStandardBlock(taskId, guidelines) {
  const legacy = typeof guidelines === "string" ? guidelines : "";
  const text = taskId === "initial_admission_rounds"
    ? String(legacy || guidelines?.admission || "").trim()
    : String(legacy || guidelines?.progress || "").trim();
  if (!text) throw new Error("The task-specific documentation standard must be loaded before building this prompt.");
  const source = taskId === "initial_admission_rounds" ? "Guidelines-admission.md" : "Guidelines-progress.md";
  return `<documentation_standard source="${source}">\n${text}\n</documentation_standard>`;
}

function patientBlocks(patient, selectedDayId = "") {
  const days = [...(patient?.days || [])].sort((left, right) => `${left.date || ""} ${left.createdAt || ""}`.localeCompare(`${right.date || ""} ${right.createdAt || ""}`));
  const currentDay = days.find((day) => day.id === selectedDayId) || days.at(-1) || null;
  const snapshot = currentDay?.checklistSnapshot || null;
  const answers = currentDay?.answers || {};
  return {
    patientContext: sectionsToPromptBlock(patient?.contextSections || [], "Saved patient context"),
    trajectory: buildTrajectoryBlock(patient, { selectedDayId: currentDay?.id, includeAllDays: false }),
    selectedDay: currentDay ? sectionsToPromptBlock(currentDay.sections || [], `Latest day: ${currentDay.date} - ${currentDay.label}`) : "",
    checklist: checklistAnswersSummary(snapshot, answers)
  };
}

function baseHeader(taskName) {
  return `Task: ${taskName}`;
}

export function buildInitialAdmissionPrompt({ patient, guidelines }) {
  const blocks = patientBlocks(patient);
  return `${baseHeader("Initial admission rounds prompt")}

${documentationStandardBlock("initial_admission_rounds", guidelines)}

Follow the documentation standard exactly for the full admission report. Use the Rule of Separation. Do not repeat history, data, reasoning, and action steps across sections.

${compactText(blocks.patientContext)}

Checklist answers available for context:
${compactText(blocks.checklist, 10000)}

Return a concise, chart-ready initial admission rounds draft.`;
}

export function buildDailyProgressPrompt({ patient, selectedDayId, guidelines }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return `${baseHeader("Daily progress-note update prompt")}

${documentationStandardBlock("daily_progress_note", guidelines)}

Follow the Daily Progress Note section of the documentation standard exactly. Enforce Subjective, Objective, Assessment, and Plan separation. The Assessment must be concise and distinct from the prior day. The Plan must include differentials for acute problems as requested in the standard.

${compactText(blocks.patientContext, 18000)}

${compactText(blocks.trajectory, 24000)}

Checklist answers available for today's rounds:
${compactText(blocks.checklist, 10000)}

Return a daily progress-note update for the selected hospital day.`;
}

export function buildTeachingTrajectoryPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return `${baseHeader("Teaching prompt for the entire patient case and trajectory")}

Explain the patient's case as a teaching script for a clinician in training.

Required structure:
1. One-sentence illness script.
2. Chronological hospital trajectory using only provided context.
3. Key pathophysiology and clinical reasoning.
4. Diagnostic uncertainty and competing explanations.
5. Why each major management decision or pending question matters.
6. Teaching pearls tied directly to this patient's context.

Do not write a final note. Do not claim a trend unless the user-provided text states it.

${compactText(blocks.patientContext, 22000)}

${compactText(blocks.trajectory, 26000)}

Checklist answers:
${compactText(blocks.checklist, 10000)}`;
}

export function buildMedicationExplainerPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return `${baseHeader("Medication organization and explanation prompt")}

Organize every medication mentioned in the context by the disease, condition, symptom, or clinical purpose it appears intended to treat.

For each medication:
- Generic medication name if available.
- Dose, route, and frequency if provided.
- Problem/condition/symptom being treated.
- Brief background on what the medication does and why it may be used.
- Whether the indication is confirmed from context, inferred, or uncertain.

If a medication's purpose is unclear, put it under "Unclear or needs verification" and explain what information is missing. Do not guess.

${compactText(blocks.patientContext, 24000)}

${compactText(blocks.trajectory, 22000)}`;
}

export function buildMedicationSafetyPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return `${baseHeader("Medication safety audit prompt")}

Check each medication for medication errors or safety concerns.

For each medication, explicitly review:
- Indication.
- Dosage.
- Route.
- Frequency.
- Duplications or overlapping therapy.
- Important interactions.
- Contraindications or cautions.
- Renal/hepatic adjustment needs when relevant data is provided.
- Monitoring parameters or missing information.

Use the exact phrase "insufficient information" when the chart context does not provide enough data. Do not guess doses, routes, indications, renal function, allergies, or interactions.

Return a table followed by a prioritized safety checklist.

${compactText(blocks.patientContext, 24000)}

${compactText(blocks.trajectory, 22000)}`;
}

export function buildChecklistRefinementPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return `${baseHeader("Checklist/workup refinement prompt")}

Review the current workup-derived checklist against the de-identified patient context.

Return:
1. Checklist questions or exam items that should be added.
2. Items that are redundant, too vague, or not patient-relevant.
3. Suggested answer choices for any new item.
4. A valid prerounding_workup_v1 JSON patch if a new local workup should be created.

Only propose history questions and physical exam items. Do not add orders, treatment plans, diagnoses, or citations to the workup JSON.

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
  return `${buildTeamPreferencesPromptBlock(options.teamPreferences)}\n\n${builder(options)}`;
}
