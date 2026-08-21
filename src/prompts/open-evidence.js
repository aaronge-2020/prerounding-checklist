import { checklistAnswersSummary } from "../checklist/state.js";
import { buildTrajectoryBlock } from "../daily-updates/days.js";
import { sectionsToPromptBlock } from "../patient-context/sections.js?v=20260722-unified-stay-v2";
import { attendingHospitalistPrompt } from "./natural-language.js?v=20260815-standalone-ap";
import { buildProgressNotePacket } from "./progress-note-packet.js";
import { sourceCapturesToPromptBlock } from "../patient-context/source-captures.js?v=20260815-smart-variable-fields";
import { DEFAULT_GUIDELINE_SET_SOURCES } from "./guideline-sets.js?v=20260819-one-to-one-task-guidelines";

// Built-in dropdown entries are derived from the same records Settings uses.
// A task cannot exist here without one exact editable guideline identity.
export const OPEN_EVIDENCE_TASKS = DEFAULT_GUIDELINE_SET_SOURCES
  .filter((source) => source.task)
  .sort((left, right) => left.task.order - right.task.order)
  .map((source) => ({
    id: source.task.id,
    label: source.task.label,
    guidelineToken: source.token,
    requiresGuidelines: true
  }));

export const openEvidenceTasks = Object.fromEntries(OPEN_EVIDENCE_TASKS.map((task) => [task.id, task]));

export function availableOpenEvidenceTasks(guidelineSets = []) {
  const availableTokens = new Set((guidelineSets || []).map((set) => set.token));
  return OPEN_EVIDENCE_TASKS.filter((task) => availableTokens.has(task.guidelineToken));
}

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
    selectedDay: currentDay ? sourceCapturesToPromptBlock(currentDay.sourceCaptures || [], "Selected hospital-day source record") : "",
    checklist: checklistAnswersSummary(snapshot, answers, quickNotes)
  };
}

export function buildInitialAdmissionPrompt({ patient, guidelines }) {
  const blocks = patientBlocks(patient);
  return attendingHospitalistPrompt(`Write a concise, chart-ready initial admission presentation from this de-identified information. Scale detail to case complexity and make a straightforward case very brief. Begin with a full One-Liner containing age, sex or gender as documented, hospital day, one to three pertinent past medical conditions, the reason for presentation, the established or leading diagnosis, and current severity or trajectory. Divide the HPI into two labeled paragraphs: Prior course for the chronological prehospital, ED, and overnight story, followed by Patient report today beginning with the presenting symptom's trajectory from arrival. In Patient report today, always document bowel function or last bowel movement, bladder function or urination episodes, and current ambulation status; if any domain is absent, state that it is not documented. Add the conditional Diet and Exercise section for ACS, stroke or TIA, PE or other VTE, diabetes or prediabetes, obesity, dyslipidemia, metabolic disease, or clinically meaningful lipid or glucose abnormalities; report supported diet and activity history or the targeted history still needed. Omit other subjective, objective, and historical detail that neither changes the current differential, management, plan, risk, or disposition nor supplies durable problem-defining context required to understand the Assessment and Plan alone. Make the overall Assessment exactly one shorter sentence containing age, sex or gender as documented, hospital day, one to three pertinent past medical conditions, the dominant admission problem, and its current severity or trajectory. Put detailed clinical reasoning, supporting discussion, uncertainty, and differential diagnoses under the applicable Plan problem. Under every active Plan problem, include the concise Key context synopsis required by the documentation standard. Under each corresponding problem, include every documented active or still-relevant consultant recommendation and begin every recommendation bullet with the actual service name followed by "recommends"; never use generic or unattributed consultant wording. Preserve the visible three-to-five-row differential table for every unestablished problem, targeting five supported diagnoses without padding. End the clinical problem list with FEN, VTE Prophylaxis, Code Status, and Disposition, then provide the nonspoken Medication Regimens appendix. Do not re-narrate full stories, sequences, or reports; selectively restate only decisive facts needed for read-alone Key context.

${documentationInstructionForTask("initial_admission_rounds", guidelines)}

${compactText(blocks.patientContext)}

Here are the checklist answers for context.
${compactText(blocks.checklist, 10000)}
`);
}

export function buildDailyProgressPrompt({ patient, selectedDayId, guidelines }) {
  const selectedDay = [...(patient?.days || [])]
    .sort((left, right) => `${left.date || ""} ${left.createdAt || ""}`.localeCompare(`${right.date || ""} ${right.createdAt || ""}`))
    .find((day) => day.id === selectedDayId) || [...(patient?.days || [])].at(-1) || null;
  return attendingHospitalistPrompt(`Write a concise, decision-focused daily progress presentation for the selected hospital day from this de-identified information. Scale detail to case complexity and make a straightforward case very brief. In Subjective, present acute overnight events and responses first, management-changing events from yesterday second, then begin the patient report with the presenting symptom's trajectory. Document bowel function or last bowel movement, bladder function or urination episodes, and current ambulation status; if any domain is absent, state that it is not documented. Add the conditional Diet and Exercise section for ACS, stroke or TIA, PE or other VTE, diabetes or prediabetes, obesity, dyslipidemia, metabolic disease, or clinically meaningful lipid or glucose abnormalities; report supported diet and activity history or the targeted history still needed. Omit other subjective, objective, and historical detail that neither changes today's differential, management, plan, risk, or disposition nor supplies durable problem-defining context required to understand the Assessment and Plan alone. Use the selected hospital day as the primary source of truth; use the admission packet only for relevant baseline conditions, reason for admission, major procedures, problem-defining studies, core treatment courses, and unresolved active problems. Do not reproduce prior notes or the full hospital course. Prioritize problems by decisional weight and compress resolved problems. Output the complete required structure beginning with One-Liner and ending with the nonspoken Medication Regimens appendix. Make the overall Assessment exactly one sentence containing age, sex or gender as documented, hospital day, one to three pertinent past medical conditions, the dominant active problem, and its current trajectory. Put detailed clinical reasoning, supporting discussion, uncertainty, and differential diagnoses under the applicable Plan problem. Under every active Plan problem, include the concise Key context synopsis required by the documentation standard, carrying forward unchanged defining facts only when necessary for read-alone understanding. Under each corresponding problem, include every documented active or still-relevant consultant recommendation and begin every recommendation bullet with the actual service name followed by "recommends"; never use generic or unattributed consultant wording. Preserve the visible three-to-five-row differential table for every new or materially re-ranked unresolved problem, targeting five supported diagnoses without padding. End the clinical problem list with FEN, VTE Prophylaxis, Code Status, and Disposition. Complete every required section before adding detail; never end mid-sentence or mid-bullet. Use only information present in this prompt and only recommendations or interpretations supported by the chart; if information is absent, omit it or state that it is not documented. Do not add guideline names, literature-based recommendations, treatment thresholds, or management changes from general medical knowledge. Do not list low-probability alternatives for completeness.

${documentationInstructionForTask("daily_progress_note", guidelines)}

${compactText(buildProgressNotePacket({ patient, selectedDay }), 28000)}
`);
}

export function buildTeachingTrajectoryPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return attendingHospitalistPrompt(`Teach this patient's full case and hospital course to a clinician in training. Start with a one-sentence illness script, then explain the course, key pathophysiology, clinical reasoning, uncertainty, and why the major decisions or pending questions matter. Tie teaching points directly to this patient. Do not write a clinical note or claim a trend that the provided information does not state.

${compactText(blocks.patientContext, 22000)}

${compactText(blocks.trajectory, 26000)}

Here are the checklist answers.
${compactText(blocks.checklist, 10000)}`);
}

export function buildMedicationExplainerPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return attendingHospitalistPrompt(`Organize the medications by the disease, condition, symptom, or clinical purpose they appear intended to treat. For each medication, give its generic name when available, dose, route, frequency, intended problem, a brief explanation of what it does, and whether the intended purpose is confirmed from context, inferred, or uncertain. If the purpose is unclear, say what information is needed. Do not guess.

${compactText(blocks.patientContext, 24000)}

${compactText(blocks.trajectory, 22000)}`);
}

export function buildMedicationSafetyPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return attendingHospitalistPrompt(`Review each medication for safety concerns. Consider its indication, dose, route, frequency, duplications or overlapping therapy, interactions, contraindications, renal or hepatic adjustment when relevant information is available, monitoring needs, and missing information. Use the exact phrase insufficient information when the chart does not provide enough data. Do not guess doses, routes, indications, kidney function, allergies, or interactions. Finish with the most important safety concerns first.

${compactText(blocks.patientContext, 24000)}

${compactText(blocks.trajectory, 22000)}`);
}

export function buildChecklistRefinementPrompt({ patient, selectedDayId }) {
  const blocks = patientBlocks(patient, selectedDayId);
  return attendingHospitalistPrompt(`Review this workup-derived checklist against the de-identified patient context. Suggest useful history questions or physical exam items, identify items that are redundant, vague, or not relevant, and offer short answer choices for new items. Use plain language only. Do not suggest orders, treatment plans, diagnoses, citations, code, or structured data.

${compactText(blocks.patientContext, 22000)}

${compactText(blocks.trajectory, 22000)}

Current checklist:
${compactText(blocks.checklist, 12000)}`);
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
  return builder(options);
}
