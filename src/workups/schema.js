import { BUNDLED_WORKUPS } from "./catalog.js";
import { isWorkupSystem, workupSystemPromptList } from "./systems.js";

const VALID_ITEM_KINDS = new Set(["history", "exam"]);
const VALID_SELECT_MODES = new Set(["one", "many"]);

export function normalizeChoiceList(choices) {
  return [...new Set((Array.isArray(choices) ? choices : []).map((choice) => String(choice || "").trim()).filter(Boolean))];
}

export function normalizeWorkup(workup) {
  const normalized = {
    schema: "prerounding_workup_v1",
    id: String(workup?.id || "").trim(),
    title: String(workup?.title || "").trim(),
    aliases: Array.isArray(workup?.aliases) ? workup.aliases.map((alias) => String(alias || "").trim()).filter(Boolean) : [],
    items: Array.isArray(workup?.items)
      ? workup.items.map((item) => ({
          id: String(item?.id || "").trim(),
          kind: String(item?.kind || "").trim(),
          system: String(item?.system || "").trim(),
          text: String(item?.text || "").trim(),
          choices: normalizeChoiceList(item?.choices),
          select: VALID_SELECT_MODES.has(item?.select) ? item.select : "one"
        }))
      : []
  };
  validateWorkup(normalized);
  return normalized;
}

export function validateWorkup(workup) {
  const errors = [];
  if (workup?.schema !== "prerounding_workup_v1") errors.push("schema must be prerounding_workup_v1");
  if (!workup?.id) errors.push("id is required");
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(workup?.id || "")) errors.push("id must be URL-safe");
  if (!workup?.title) errors.push("title is required");
  if (!Array.isArray(workup?.items) || !workup.items.length) errors.push("items must contain at least one history or exam item");
  const seenIds = new Set();
  for (const [index, item] of (workup?.items || []).entries()) {
    if (!item.id) errors.push(`items[${index}].id is required`);
    if (seenIds.has(item.id)) errors.push(`duplicate item id: ${item.id}`);
    seenIds.add(item.id);
    if (!VALID_ITEM_KINDS.has(item.kind)) errors.push(`items[${index}].kind must be history or exam`);
    if (!item.system) errors.push(`items[${index}].system is required`);
    if (item.system && !isWorkupSystem(item.system)) errors.push(`items[${index}].system must use a controlled workup-system id`);
    if (!item.text) errors.push(`items[${index}].text is required`);
    if (!Array.isArray(item.choices) || item.choices.length < 2) errors.push(`items[${index}].choices must include at least two choices`);
    if (!VALID_SELECT_MODES.has(item.select || "one")) errors.push(`items[${index}].select must be one or many`);
  }
  if (errors.length) throw new Error(errors.join("; "));
  return true;
}

export function parseWorkupJson(text) {
  return normalizeWorkup(JSON.parse(text));
}

export function effectiveWorkupCatalog(overrides = {}) {
  const map = new Map(BUNDLED_WORKUPS.map((workup) => [workup.id, normalizeWorkup(workup)]));
  for (const workup of Object.values(overrides || {})) {
    const normalized = normalizeWorkup(workup);
    map.set(normalized.id, normalized);
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function findWorkupsById(workups, ids = []) {
  const idSet = new Set(ids);
  return workups.filter((workup) => idSet.has(workup.id));
}

export function buildWorkupAuthoringPrompt(workup = null) {
  const existing = workup ? `\n\nExisting workup JSON to revise:\n\`\`\`json\n${JSON.stringify(workup, null, 2)}\n\`\`\`` : "";
  return `Create or revise a local prerounding workup JSON object.

Return only valid JSON matching this schema:
{
  "schema": "prerounding_workup_v1",
  "id": "url-safe-id",
  "title": "Short clinical title",
  "aliases": ["optional search alias"],
  "items": [
    {
      "id": "url_safe_item_id",
      "kind": "history",
      "system": "cardiovascular",
      "text": "Specific history or exam question/item",
      "choices": ["No", "Yes", "Unclear"],
      "select": "one"
    }
  ]
}

Rules:
- Include only history questions and physical exam items.
- Every item must use one exact system from the controlled vocabulary in the formatter prompt.
- Allowed systems:\n${workupSystemPromptList()}
- Do not include orders, imaging, labs, treatments, plan steps, citations, diagnoses, or narrative teaching.
- Each item needs patient-facing answer choices.
- The first choice must always be the negative, normal, absent, reassuring, or baseline finding. Positive, abnormal, present, or concerning choices come after it.
- Use "history" or "exam" only for kind.
- Use "one" unless multiple selections are genuinely needed.${existing}`;
}
