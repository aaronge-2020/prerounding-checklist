import { checklistAnswersSummary, hasAssessedChecklistContent } from "../checklist/state.js";
import { buildTrajectoryBlock } from "../daily-updates/days.js";
import { sectionsToPromptBlock } from "../patient-context/sections.js?v=20260722-unified-stay-v2";
import { dailySourceKindLabel, sourceCapturesToPromptBlock } from "../patient-context/source-captures.js?v=20260815-smart-variable-fields";
import { buildTeamPreferencesPromptBlock } from "../app/preferences.js?v=20260722-guideline-library";
import { ATTENDING_HOSPITALIST_PERSONA, attendingHospitalistPrompt } from "./natural-language.js?v=20260815-standalone-ap";
import { buildProgressNotePacket } from "./progress-note-packet.js";
import { DEFAULT_GUIDELINE_SET_SOURCES } from "./guideline-sets.js?v=20260819-one-to-one-task-guidelines";

export const PROMPT_TEMPLATE_STORAGE_KEY = "prerounding_prompt_templates_v1";
export const TEAM_PREFERENCES_PROMPT_TOKEN = "@team-preferences";
const TASK_GUIDELINE_TOKENS = new Map(DEFAULT_GUIDELINE_SET_SOURCES.filter((source) => source.task).map((source) => [source.task.id, source.token]));

// Every built-in task starts with its Settings-backed guideline token. The
// task registry hides the task when that exact guideline is deleted.
export const DEFAULT_PROMPT_TEMPLATES = {
  initial_admission_rounds: `@team-preferences\n\n@admission-guidelines\n\n@admission-packet`,
  daily_progress_note: `@team-preferences\n\n@progress-guidelines\n\n@progress-note-packet`,
  presentation_quality_editor: `@presentation-editor-guidelines\n\n@presentation-to-edit\n\n@admission-packet\n\n@progress-note-packet`,
  teaching_case_trajectory: `@teaching-guidelines\n\n@admission-packet\n\n@selected-day\n\n@checklist-answers`,
  medication_explainer_by_problem: `@medication-explainer-guidelines\n\n@admission-packet\n\n@medications\n\n@selected-day`,
  medication_safety_audit: `@medication-safety-guidelines\n\n@admission-packet\n\n@medications\n\n@labs\n\n@selected-day`,
  checklist_workup_refinement: `@checklist-refinement-guidelines\n\n@admission-packet\n\n@selected-day\n\n@checklist-answers`,
  preround_bedside_exam: `@team-preferences\n\n@pre-round-checklist-guidelines\n\n@admission-packet\n\n@selected-day\n\n@selected-day-physical-exam`,
  discharge_instructions: `@team-preferences\n\n@discharge-instructions-guidelines\n\n@admission-packet\n\n@selected-day\n\n@selected-day-physical-exam`,
  consulting: `@team-preferences\n\n@consulting-guidelines\n\n@admission-packet\n\n@selected-day\n\n@selected-day-physical-exam`
};

export const SMART_PROMPT_VARIABLES = [
  { token: TEAM_PREFERENCES_PROMPT_TOKEN, label: "Team preferences", description: "The exact text in your Team preferences guideline, if any." },
  { token: "@admission-packet", label: "All admission fields", description: "Every saved field in the Admission packet." },
  { token: "@selected-day", label: "All selected-day fields", description: "Every saved field for the selected hospital day; defaults to the latest day." },
  { token: "@progress-note-packet", label: "Curated progress-note context", description: "Carry-forward admission context plus the selected hospital day, in clinical order." },
  { token: "@presentation-to-edit", label: "Presentation draft", description: "The de-identified presentation pasted into the editor; held only in this tab." },
  { token: "@checklist-answers", label: "Selected-day checklist answers", description: "History and physical-exam answers saved for the selected hospital day." },
  { token: "@admission-physical-exam", label: "Physical exam — admission", description: "Only the physical-exam field saved in the Admission packet." },
  { token: "@selected-day-physical-exam", label: "Physical exam — selected day", description: "Only the physical exam for the selected packet, including Admission when Admission is selected." },
  { token: "@openevidence-exam-note", label: "OpenEvidence exam note — selected day", description: "The saved de-identified OpenEvidence exam note for the selected hospital day, if any." }
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

// Selectable in the Hospital Day dropdown alongside real days so a user can
// point @selected-day at the admission packet (contextSections) instead of a
// daily record - admission info and days[] are separate concepts in this data
// model (see vault.js), and before this there was no way to reference "the
// admission" from that dropdown at all.
export const ADMISSION_PSEUDO_DAY_ID = "__admission__";

function selectedPromptDay(patient, selectedDayId = "") {
  if (selectedDayId === ADMISSION_PSEUDO_DAY_ID) return null;
  const days = [...(patient?.days || [])].sort((left, right) => `${left.date || ""} ${left.createdAt || ""}`.localeCompare(`${right.date || ""} ${right.createdAt || ""}`));
  return days.find((day) => day.id === selectedDayId) || days.at(-1) || null;
}

function guidelineSetVariables(guidelineSets = []) {
  const seen = new Set([TEAM_PREFERENCES_PROMPT_TOKEN]);
  return guidelineSets.filter((set) => {
    if (!set?.token || seen.has(set.token)) return false;
    seen.add(set.token);
    return true;
  }).map((set) => ({
    token: set.token,
    label: set.label,
    description: "Documentation guidelines you saved in Settings.",
    guidelineSetId: set.id
  }));
}

export function promptVariablesForPatient(patient, { selectedDayId = "", guidelineSets = [] } = {}) {
  const guidelineVariables = guidelineSetVariables(guidelineSets);
  const used = new Set([
    ...SMART_PROMPT_VARIABLES.map((variable) => variable.token),
    ...guidelineVariables.map((variable) => variable.token)
  ]);
  const sectionVariables = (patient?.contextSections || [])
    .filter((section) => String(section?.deidentifiedText || "").trim() && section?.sourceKind !== "prior_physical_exam")
    .map((section, index) => ({
    token: promptToken(`admission-${dailySourceKindLabel(section.sourceKind)}`, index, used),
    label: `Admission — ${dailySourceKindLabel(section.sourceKind)}`,
    description: `Only this saved Admission field: ${dailySourceKindLabel(section.sourceKind)}.`,
    sectionId: section.id
    }));
  const day = selectedPromptDay(patient, selectedDayId);
  const daySourceVariables = (day?.sourceCaptures || [])
    .filter((capture) => String(capture?.deidentifiedText || "").trim() && !isPhysicalExamCapture(capture))
    .map((capture, index) => ({
    token: promptToken(`selected-day-${dailySourceKindLabel(capture.sourceKind)}`, index, used),
    label: `${day.label || "Selected day"} — ${dailySourceKindLabel(capture.sourceKind)}`,
    description: `Only this saved ${day.label || "selected-day"} field: ${dailySourceKindLabel(capture.sourceKind)}.`,
    daySourceId: capture.id
    }));
  return [...guidelineVariables, ...sectionVariables, ...daySourceVariables, ...SMART_PROMPT_VARIABLES];
}

function sectionByLabel(sections = [], pattern) {
  return sections.find((section) => pattern.test(section.label || "")) || null;
}

// Prefers the checklist (it's what the clinician actually filled in) but
// falls back to a directly-saved OpenEvidence exam note when the checklist
// has nothing real in it, so a default note-writing prompt never goes empty
// just because the user chose the paste-a-note path over the checklist.
function examFindingsSummary(snapshot, answers, quickNotes, examNoteText) {
  if (hasAssessedChecklistContent(snapshot, answers, quickNotes)) return checklistAnswersSummary(snapshot, answers, quickNotes);
  const note = String(examNoteText || "").trim();
  return note || "No exam findings recorded.";
}

function savedExamNoteText(day) {
  return day?.openEvidenceExamNote?.text?.trim() || "";
}

function physicalExamSections(patient) {
  return (patient?.contextSections || []).filter((section) =>
    section?.sourceKind === "prior_physical_exam" || /^Physical exam findings(?: - Admission)?$/i.test(section?.label || "")
  );
}

function isPhysicalExamCapture(capture) {
  return ["physical_exam", "pre_round_physical_exam"].includes(capture?.sourceKind);
}

function admissionSectionsWithoutTodayExam(patient) {
  return patient?.contextSections || [];
}

function selectedDayCapturesWithoutExam(day) {
  return (day?.sourceCaptures || []).filter((capture) => !isPhysicalExamCapture(capture));
}

function admissionExamFindings(patient) {
  const texts = physicalExamSections(patient)
    .map((section) => String(section?.deidentifiedText || "").trim())
    .filter(Boolean);
  return texts.length ? `Prior clinician physical exam findings.\n\n${texts.join("\n\n")}` : "No prior clinician exam findings recorded.";
}

function selectedDayExamFindings(patient, selectedDayId, day) {
  if (selectedDayId === ADMISSION_PSEUDO_DAY_ID) return admissionExamFindings(patient);
  const captures = (day?.sourceCaptures || []).filter((capture) =>
    capture?.sourceKind === "physical_exam" && String(capture?.deidentifiedText || "").trim()
  );
  if (captures.length) return sourceCapturesToPromptBlock(captures, "Current pre-round physical exam findings");
  return examFindingsSummary(
    day?.checklistSnapshot || null,
    day?.answers || {},
    day?.quickNotes || [],
    day?.openEvidenceExamNote?.text
  );
}

export function loadPromptTemplateOverrides(storage = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(PROMPT_TEMPLATE_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const replacements = {
      "@clinical-differential-instructions": "",
      "@presentation-editor-instructions": "@presentation-editor-guidelines",
      "@teaching-case-instructions": "@teaching-guidelines",
      "@admissions-exam-findings": "@admission-physical-exam",
      "@selected-day-exam-findings": "@selected-day-physical-exam",
      "@medication-explainer-instructions": "@medication-explainer-guidelines",
      "@medication-safety-instructions": "@medication-safety-guidelines"
    };
    const migrated = Object.fromEntries(Object.entries(parsed).map(([taskId, template]) => {
      const guidelineToken = TASK_GUIDELINE_TOKENS.get(taskId);
      let text = interpolatePromptTemplate(String(template || ""), replacements).replace(/\n{3,}/g, "\n\n").trim();
      if (guidelineToken && !text.includes(guidelineToken)) text = `${guidelineToken}\n\n${text}`.trim();
      return [taskId, text];
    }));
    if (JSON.stringify(migrated) !== JSON.stringify(parsed)) savePromptTemplateOverrides(migrated, storage);
    return migrated;
  } catch {
    return {};
  }
}

export function savePromptTemplateOverrides(overrides, storage = localStorage) {
  storage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, JSON.stringify(overrides || {}));
}

export function promptTemplateForTask(taskId, overrides = {}, guidelineSets = []) {
  const guideline = (guidelineSets || []).find((set) => set.id === taskId);
  if (guideline) return String(guideline.text || "");
  const saved = String(overrides?.[taskId] || "");
  const template = saved && saved !== "@default-prompt" ? saved : String(DEFAULT_PROMPT_TEMPLATES[taskId] || "");
  const guidelineToken = TASK_GUIDELINE_TOKENS.get(taskId);
  return guidelineToken && !template.includes(guidelineToken) ? `${guidelineToken}\n\n${template}`.trim() : template;
}

export function buildPromptVariableMap({ patient, selectedDayId, guidelineSets = [], teamPreferences = {}, presentationToEdit = "" }) {
  const usingAdmission = selectedDayId === ADMISSION_PSEUDO_DAY_ID;
  const selectedDay = selectedPromptDay(patient, selectedDayId);
  const snapshot = selectedDay?.checklistSnapshot || null;
  const answers = selectedDay?.answers || {};
  const quickNotes = selectedDay?.quickNotes || [];
  const medicationSection = sectionByLabel(patient?.contextSections || [], /medication/i);
  const labSection = sectionByLabel(patient?.contextSections || [], /lab|result/i);
  const selectedMedicationSources = (selectedDay?.sourceCaptures || []).filter((capture) => capture.sourceKind === "medication_activity");
  const selectedResultSources = (selectedDay?.sourceCaptures || []).filter((capture) => capture.sourceKind === "results");
  const allVariables = promptVariablesForPatient(patient, { selectedDayId, guidelineSets });
  const sectionValues = Object.fromEntries(
    allVariables
      .filter((variable) => variable.sectionId)
      .map((variable) => {
        const section = (patient?.contextSections || []).find((entry) => entry.id === variable.sectionId);
        return [variable.token, section?.deidentifiedText?.trim() || `No saved ${variable.label.toLowerCase()} text.`];
      })
  );
  const selectedDayValues = Object.fromEntries(
    allVariables
      .filter((variable) => variable.daySourceId)
      .map((variable) => {
        const capture = (selectedDay?.sourceCaptures || []).find((entry) => entry.id === variable.daySourceId);
        return [variable.token, capture?.deidentifiedText?.trim() || `No saved ${variable.label.toLowerCase()} text.`];
      })
  );
  const guidelineValues = Object.fromEntries(
    guidelineSets.map((set) => [set.token, set.text.trim() || `No saved "${set.label}" guidelines yet - add them in Settings.`])
  );
  return {
    ...sectionValues,
    ...selectedDayValues,
    ...guidelineValues,
    [TEAM_PREFERENCES_PROMPT_TOKEN]: guidelineSets.find((set) => set.token === TEAM_PREFERENCES_PROMPT_TOKEN)?.text?.trim()
      || buildTeamPreferencesPromptBlock(teamPreferences),
    "@admission-packet": sectionsToPromptBlock(admissionSectionsWithoutTodayExam(patient), "Admission packet"),
    "@medications": selectedMedicationSources.length
      ? sourceCapturesToPromptBlock(selectedMedicationSources, "Selected-day medication activity")
      : medicationSection?.deidentifiedText || "No saved medication text.",
    "@labs": selectedResultSources.length
      ? sourceCapturesToPromptBlock(selectedResultSources, "Selected-day results")
      : labSection?.deidentifiedText || "No saved lab text.",
    // Compatibility alias for a previously saved template. New templates use
    // only @selected-day so there is one clear choice of hospital-day scope.
    "@hospital-stay": buildTrajectoryBlock(patient, { selectedDayId: selectedDay?.id, includeAllDays: false }),
    "@selected-day": usingAdmission
      ? sectionsToPromptBlock(admissionSectionsWithoutTodayExam(patient), "Admission")
      : (selectedDay ? sourceCapturesToPromptBlock(selectedDayCapturesWithoutExam(selectedDay), "Selected hospital-day source record") : "No saved hospital day."),
    "@progress-note-packet": buildProgressNotePacket({ patient, selectedDay }),
    // A presentation can be supplied directly in the destination chat. Keep
    // this optional token empty rather than inserting an instruction that
    // would make a copied editor prompt unusable in that workflow.
    "@presentation-to-edit": String(presentationToEdit || "").trim(),
    "@checklist-answers": checklistAnswersSummary(snapshot, answers, quickNotes),
    "@openevidence-exam-note": savedExamNoteText(selectedDay) || "No saved OpenEvidence exam note.",
    "@admission-physical-exam": admissionExamFindings(patient),
    "@selected-day-physical-exam": selectedDayExamFindings(patient, selectedDayId, selectedDay)
  };
}

export function interpolatePromptTemplate(template, variables) {
  // Replace longer tokens first. Tokens such as @selected-day and
  // @selected-day-physical-exam intentionally share a prefix; replacing the
  // short token first corrupts the longer token and leaks "-exam-findings"
  // into the generated prompt.
  return Object.entries(variables).sort(([left], [right]) => right.length - left.length).reduce(
    (text, [token, value]) => text.split(token).join(String(value || "")),
    String(template || "")
  );
}

export function buildCustomOpenEvidencePrompt({ template, patient, selectedDayId, guidelineSets = [], teamPreferences, presentationToEdit = "" }) {
  const variables = buildPromptVariableMap({ patient, selectedDayId, guidelineSets, teamPreferences, presentationToEdit });
  const interpolated = interpolatePromptTemplate(template, variables);
  return attendingHospitalistPrompt(interpolated);
}

function hashToken(token) {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  return hash;
}

export const TOKEN_COLOR_STORAGE_KEY = "prerounding_token_colors_v1";

export function loadTokenColorOverrides(storage = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(TOKEN_COLOR_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTokenColorOverrides(overrides, storage = localStorage) {
  storage.setItem(TOKEN_COLOR_STORAGE_KEY, JSON.stringify(overrides || {}));
}

export function setTokenColorOverride(overrides, token, hue) {
  const value = typeof hue === "number"
    ? hueToHex(((Math.round(hue) % 360) + 360) % 360)
    : normalizeHexColor(hue) || hueToHex(0);
  return { ...(overrides || {}), [token]: value };
}

export function clearTokenColorOverride(overrides, token) {
  const next = { ...(overrides || {}) };
  delete next[token];
  return next;
}

// One deterministic hue per token by default (same token -> same color
// everywhere: the insert-variable menu swatches and the highlighted output
// preview), but a user-chosen hue in `overrides` always wins - lets someone
// nudge apart two tokens that happened to hash to similar, hard-to-tell-apart
// hues without having to hand-manage every token's color.
export function tokenAccentHue(token, overrides = {}) {
  const stored = overrides?.[String(token || "")];
  return typeof stored === "string" ? hexToHue(stored) : Number.isFinite(stored) ? stored : hashToken(String(token || "")) % 360;
}

export function tokenAccentColor(token, { dot = false, overrides = {} } = {}) {
  const custom = normalizeHexColor(overrides?.[String(token || "")]);
  if (custom) return dot ? custom : `color-mix(in srgb, ${custom} 18%, white)`;
  const hue = tokenAccentHue(token, overrides);
  return dot ? `hsl(${hue}, 62%, 45%)` : `hsl(${hue}, 70%, 90%)`;
}

export function tokenAccentHex(token, overrides = {}) {
  return normalizeHexColor(overrides?.[String(token || "")]) || hueToHex(tokenAccentHue(token, overrides));
}

// For the <input type="color"> swatch, which only speaks hex - shows/edits
// the same hue this token already renders with (at the "dot" saturation/
// lightness) so the picker's initial color always matches what's on screen.
export function hueToHex(hue, saturation = 62, lightness = 45) {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n) => Math.round(f(n) * 255).toString(16).padStart(2, "0");
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

export function hexToHue(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!match) return 0;
  const r = parseInt(match[1].slice(0, 2), 16) / 255;
  const g = parseInt(match[1].slice(2, 4), 16) / 255;
  const b = parseInt(match[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  return Math.round((hue + 360) % 360);
}

function normalizeHexColor(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value || "").trim());
  return match ? `#${match[1].toLowerCase()}` : "";
}

function escapeRegExpLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Splits a template into literal-text and resolved-variable segments (longest
// token first, so e.g. "@admission-context-2" is never half-matched by
// "@admission-context") for the color-highlighted preview only - the plain
// copy/OpenEvidence-ready text still comes from interpolatePromptTemplate
// above, untouched by this.
export function buildPromptPreviewSegments(template, variables, { ensurePersona = false } = {}) {
  const text = String(template || "");
  const tokens = Object.keys(variables || {}).sort((left, right) => right.length - left.length);
  if (!tokens.length) {
    const promptText = ensurePersona ? attendingHospitalistPrompt(text) : text;
    return [{ type: "text", value: promptText }];
  }
  const pattern = new RegExp(tokens.map(escapeRegExpLiteral).join("|"), "g");
  const segments = [];
  let lastIndex = 0;
  let match = pattern.exec(text);
  while (match) {
    if (match.index > lastIndex) segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    segments.push({ type: "token", token: match[0], value: String(variables[match[0]] || "") });
    lastIndex = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (lastIndex < text.length) segments.push({ type: "text", value: text.slice(lastIndex) });
  const resolved = segments.map((segment) => segment.value).join("");
  if (ensurePersona && !resolved.toLowerCase().includes(ATTENDING_HOSPITALIST_PERSONA.toLowerCase())) {
    segments.unshift({ type: "text", value: `${ATTENDING_HOSPITALIST_PERSONA}\n\n` });
  }
  return segments;
}
