import { checklistAnswersSummary, hasAssessedChecklistContent } from "../checklist/state.js";
import { buildTrajectoryBlock } from "../daily-updates/days.js";
import { sectionsToPromptBlock } from "../patient-context/sections.js";
import { buildTeamPreferencesPromptBlock } from "../app/preferences.js";
import { naturalLanguagePrompt } from "./natural-language.js";

export const PROMPT_TEMPLATE_STORAGE_KEY = "prerounding_prompt_templates_v1";
export const TEAM_PREFERENCES_PROMPT_TOKEN = "@team-preferences";

// These reference the tokens the migration in guideline-sets.js assigns to
// the two seeded "Admission"/"Progress" sets. If a user deletes one of those
// sets the token below simply won't resolve (same graceful degradation as
// referencing any other deleted variable).
export const DEFAULT_PROMPT_TEMPLATES = {
  initial_admission_rounds: `@team-preferences\n\n@admission-updated-guidelines\n\n@admission-packet\n\n@selected-day\n\n@exam-findings`,
  daily_progress_note: `@team-preferences\n\n@progress-problem-assessment-guidelines\n\n@admission-packet\n\n@selected-day\n\n@exam-findings`,
  teaching_case_trajectory: `@admission-packet\n\n@selected-day\n\n@checklist-answers`,
  medication_explainer_by_problem: `@medications\n\n@selected-day`,
  medication_safety_audit: `@medications\n\n@labs\n\n@selected-day`,
  checklist_workup_refinement: `@admission-packet\n\n@selected-day\n\n@checklist-answers`,
  preround_bedside_exam: `@team-preferences\n\n@pre-round-checklist-updated-guidelines\n\n@admission-packet\n\n@selected-day\n\n@exam-findings`,
  discharge_instructions: `@team-preferences\n\n@discharge-instructions-updated-guidelines\n\n@admission-packet\n\n@selected-day\n\n@exam-findings`,
  consulting: `@team-preferences\n\n@consulting-updated-guidelines\n\n@admission-packet\n\n@selected-day\n\n@exam-findings`
};

export const SMART_PROMPT_VARIABLES = [
  { token: TEAM_PREFERENCES_PROMPT_TOKEN, label: "General instructions (smart)", description: "Your saved service, presentation, focus, and attending preferences." },
  { token: "@admission-packet", label: "Admission packet", description: "All saved admission fields, labeled." },
  { token: "@selected-day", label: "Selected hospital day", description: "The chosen hospital-day packet; defaults to the latest saved day." },
  { token: "@checklist-answers", label: "Checklist answers", description: "History and physical exam answers." },
  { token: "@exam-findings", label: "Exam findings (smart)", description: "Checklist answers/quick notes if any exist, else the saved OpenEvidence exam note, else a note that nothing is recorded." },
  { token: "@openevidence-exam-note", label: "OpenEvidence exam note", description: "The saved de-identified OpenEvidence exam note for the selected hospital day, if any." }
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
  return guidelineSets.map((set) => ({
    token: set.token,
    label: set.label,
    description: "Documentation guidelines you saved in Settings.",
    guidelineSetId: set.id
  }));
}

export function promptVariablesForPatient(patient, { selectedDayId = "", guidelineSets = [] } = {}) {
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
  return [...sectionVariables, ...daySectionVariables, ...guidelineSetVariables(guidelineSets), ...SMART_PROMPT_VARIABLES];
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

export function buildPromptVariableMap({ patient, selectedDayId, guidelineSets = [], teamPreferences = {} }) {
  const usingAdmission = selectedDayId === ADMISSION_PSEUDO_DAY_ID;
  const selectedDay = selectedPromptDay(patient, selectedDayId);
  const snapshot = selectedDay?.checklistSnapshot || null;
  const answers = selectedDay?.answers || {};
  const quickNotes = selectedDay?.quickNotes || [];
  const medicationSection = sectionByLabel(patient?.contextSections || [], /medication/i);
  const labSection = sectionByLabel(patient?.contextSections || [], /lab|result/i);
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
      .filter((variable) => variable.daySectionId)
      .map((variable) => {
        const section = (selectedDay?.sections || []).find((entry) => entry.id === variable.daySectionId);
        return [variable.token, section?.deidentifiedText?.trim() || `No saved ${variable.label.toLowerCase()} text.`];
      })
  );
  const guidelineValues = Object.fromEntries(
    guidelineSets.map((set) => [set.token, set.text.trim() || `No saved "${set.label}" guidelines yet - add them in Settings.`])
  );
  return {
    ...sectionValues,
    ...selectedDayValues,
    ...guidelineValues,
    [TEAM_PREFERENCES_PROMPT_TOKEN]: buildTeamPreferencesPromptBlock(teamPreferences),
    "@admission-packet": sectionsToPromptBlock(patient?.contextSections || [], "Admission packet"),
    "@medications": medicationSection?.deidentifiedText || "No saved medication text.",
    "@labs": labSection?.deidentifiedText || "No saved lab text.",
    // Compatibility alias for a previously saved template. New templates use
    // only @selected-day so there is one clear choice of hospital-day scope.
    "@hospital-stay": buildTrajectoryBlock(patient, { selectedDayId: selectedDay?.id, includeAllDays: false }),
    "@selected-day": usingAdmission
      ? sectionsToPromptBlock(patient?.contextSections || [], "Admission")
      : (selectedDay ? sectionsToPromptBlock(selectedDay.sections || [], `Selected day: ${selectedDay.date} - ${selectedDay.label}`) : "No saved hospital day."),
    "@checklist-answers": checklistAnswersSummary(snapshot, answers, quickNotes),
    "@openevidence-exam-note": selectedDay?.openEvidenceExamNote?.text?.trim() || "No saved OpenEvidence exam note.",
    "@exam-findings": examFindingsSummary(snapshot, answers, quickNotes, selectedDay?.openEvidenceExamNote?.text)
  };
}

export function interpolatePromptTemplate(template, variables) {
  return Object.entries(variables).reduce(
    (text, [token, value]) => text.split(token).join(String(value || "")),
    String(template || "")
  );
}

export function buildCustomOpenEvidencePrompt({ template, patient, selectedDayId, guidelineSets = [], teamPreferences }) {
  const variables = buildPromptVariableMap({ patient, selectedDayId, guidelineSets, teamPreferences });
  const interpolated = interpolatePromptTemplate(template, variables);
  return naturalLanguagePrompt(interpolated);
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
  return { ...(overrides || {}), [token]: ((Math.round(hue) % 360) + 360) % 360 };
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
  return Number.isFinite(stored) ? stored : hashToken(String(token || "")) % 360;
}

export function tokenAccentColor(token, { dot = false, overrides = {} } = {}) {
  const hue = tokenAccentHue(token, overrides);
  return dot ? `hsl(${hue}, 62%, 45%)` : `hsl(${hue}, 70%, 90%)`;
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

function escapeRegExpLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Splits a template into literal-text and resolved-variable segments (longest
// token first, so e.g. "@admission-context-2" is never half-matched by
// "@admission-context") for the color-highlighted preview only - the plain
// copy/OpenEvidence-ready text still comes from interpolatePromptTemplate
// above, untouched by this.
export function buildPromptPreviewSegments(template, variables) {
  const text = String(template || "");
  const tokens = Object.keys(variables || {}).sort((left, right) => right.length - left.length);
  if (!tokens.length) return [{ type: "text", value: text }];
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
  return segments;
}
