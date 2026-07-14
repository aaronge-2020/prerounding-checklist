import { normalizeWorkup } from "./schema.js";
import { isWorkupSystem, workupSystemPromptList } from "./systems.js";
import { buildTeamPreferencesPromptBlock } from "../app/preferences.js";
import { naturalLanguagePrompt } from "../prompts/natural-language.js";

export const WORKUP_ITEM_KINDS = ["history", "exam"];

export const WORKUP_THOROUGHNESS = {
  focused: {
    label: "Fast rounds",
    helper: "6–10 priority history questions and 6–10 focused exam items for a busy morning.",
    prompt: "Use a focused fast-rounds scope: provide 6 to 10 highest-yield history questions and 6 to 10 focused physical-exam items. Omit lower-yield routine items."
  },
  standard: {
    label: "Standard",
    helper: "12–18 targeted items per section for a balanced pre-round.",
    prompt: "Use a standard scope: provide roughly 12 to 18 targeted history questions and 12 to 18 targeted physical-exam items, prioritizing the active problems."
  },
  thorough: {
    label: "Thorough",
    helper: "A broad, teaching-level review when there is time for a full bedside assessment.",
    prompt: "Use a thorough teaching-level scope: cover all clinically relevant history questions and physical-exam items, including important systems beyond the immediate complaint."
  }
};

export function workupThoroughnessOption(value = "standard") {
  return WORKUP_THOROUGHNESS[value] ? value : "standard";
}

export function slugifyId(value, fallback = "workup") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export function createBlankWorkup({ id = "", title = "New Workup" } = {}) {
  const workupId = id || slugifyId(title);
  return normalizeWorkup({
    schema: "prerounding_workup_v1",
    id: workupId,
    title,
    aliases: [],
    items: [
      createBlankWorkupItem("history", { id: "chief_concern", system: "general", text: "Chief concern", choices: ["Absent", "Present", "Unclear"] }),
      createBlankWorkupItem("exam", { id: "general_appearance", system: "general", text: "General appearance", choices: ["Normal", "Abnormal", "Not assessed"] })
    ]
  });
}

export function createBlankWorkupItem(kind = "history", overrides = {}) {
  const baseText = kind === "exam" ? "New physical exam item" : "New history question";
  const text = overrides.text || baseText;
  return {
    id: overrides.id || slugifyId(text, `${kind}_item`),
    kind: WORKUP_ITEM_KINDS.includes(kind) ? kind : "history",
    system: isWorkupSystem(overrides.system) ? overrides.system : "general",
    text,
    choices: overrides.choices || ["No", "Yes", "Unclear"],
    select: overrides.select || "one"
  };
}

export function splitAliases(value) {
  return String(value || "")
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

export function choicesToText(choices = []) {
  return (choices || []).join(", ");
}

export function textToChoices(value) {
  return String(value || "")
    .split(/[,|\n]/)
    .map((choice) => choice.trim())
    .filter(Boolean);
}

export function groupWorkupItems(workup) {
  const items = Array.isArray(workup?.items) ? workup.items : [];
  return {
    history: items.filter((item) => item.kind === "history"),
    exam: items.filter((item) => item.kind === "exam")
  };
}

export function workupFromEditorDraft(draft) {
  const title = String(draft?.title || "").trim();
  const id = slugifyId(draft?.id || title);
  const items = (draft?.items || [])
    .map((item) => ({
      id: slugifyId(item.id || item.text, `${item.kind || "history"}_item`),
      kind: WORKUP_ITEM_KINDS.includes(item.kind) ? item.kind : "history",
      system: String(item.system || "").trim(),
      text: String(item.text || "").trim(),
      choices: textToChoices(item.choicesText || item.choices),
      select: item.select === "many" ? "many" : "one"
    }))
    .filter((item) => item.text || item.choices.length);
  return normalizeWorkup({
    schema: "prerounding_workup_v1",
    id,
    title,
    aliases: splitAliases(draft?.aliasesText),
    items
  });
}

export function collectWorkupDraftFromDocument(root = document) {
  const items = [...root.querySelectorAll("[data-workup-item-row]")].map((row) => ({
    id: row.querySelector("[data-field='item-id']")?.value || "",
    kind: row.dataset.kind || "history",
    system: row.querySelector("[data-field='item-system']")?.value || "",
    text: row.querySelector("[data-field='item-text']")?.value || "",
    choicesText: row.querySelector("[data-field='item-choices']")?.value || "",
    select: row.querySelector("[data-field='item-select']")?.value || "one"
  }));
  return {
    id: root.querySelector("#workupIdInput")?.value || "",
    title: root.querySelector("#workupTitleInput")?.value || "",
    aliasesText: root.querySelector("#workupAliasesInput")?.value || "",
    items
  };
}

export function buildOpenEvidenceWorkupDraftPrompt({ patientContext = "", dailyTrajectory = "", workupTitle = "", thoroughness = "standard", teamPreferences, guidelinesText = "" } = {}) {
  const scope = WORKUP_THOROUGHNESS[workupThoroughnessOption(thoroughness)];
  const intro = guidelinesText
    ? `Follow the guidelines above for ${workupTitle || "this patient"}.`
    : `Review this de-identified information and suggest a practical bedside checklist for ${workupTitle || "this patient"}.`;
  return naturalLanguagePrompt(`${guidelinesText ? `${guidelinesText}\n\n` : ""}${intro} ${buildTeamPreferencesPromptBlock(teamPreferences)} Put the negative, normal, absent, reassuring, or other baseline answer first, followed by positive or concerning findings, and never lead with not assessed or unable to assess. Use short, phone-tappable answer choices. ${scope.prompt} Exclude labs, imaging, orders, diagnoses, treatment plans, citations, and note prose. Use only the de-identified information provided here.

Patient context. ${patientContext || "No saved patient context."}

Daily trajectory. ${dailyTrajectory || "No daily updates selected."}`);
}

export function buildJsonFormatterPrompt({ sourceText = "", workupTitle = "" } = {}) {
  return `Convert the workup draft below into one valid JSON object matching this exact schema:

{
  "schema": "prerounding_workup_v1",
  "id": "url-safe-id",
  "title": "${workupTitle || "Short workup title"}",
  "aliases": ["optional alias"],
  "items": [
    {
      "id": "url_safe_item_id",
      "kind": "history",
      "system": "cardiovascular",
      "text": "Specific history question or physical exam item",
      "choices": ["No", "Yes", "Unclear"],
      "select": "one"
    }
  ]
}

Rules:
- Use only kind "history" or "exam".
- Every item must include one exact system ID from this controlled vocabulary; do not invent, abbreviate, combine, or qualify IDs:
${workupSystemPromptList()}
- Include only history questions and physical exam items.
- Keep answer choices short and phone-friendly. The first choice for every item must be the negative, normal, absent, reassuring, or baseline finding; positive/abnormal/present choices must follow it.
- Return JSON only, no markdown.

Draft to convert:
${sourceText || "[Paste the OpenEvidence workup draft here]"}`;
}
