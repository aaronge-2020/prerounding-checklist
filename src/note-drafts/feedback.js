// Writer AI feedback: pure prompt assembly and reply parsing.
// No DOM, no storage, no network. The UI controller in
// src/ui/writer-feedback/ owns the engines and the panel; this module owns
// the contract both engines share: which sections are in scope, the prompt
// that grades them against the app's own section standards, the structured
// reply format, and the parser that turns a model reply into feedback items.
// Malformed replies raise one plain error; raw model text is never passed
// through as if it were feedback.
import { CLOSING_SECTION_FIELDS, fieldsForNoteType } from "./model.js?v=20261012-citation-preview";
import { studentGuidance } from "./guidance.js";

export const FEEDBACK_KINDS = Object.freeze(["works", "unclear", "missing"]);

export const FEEDBACK_KIND_LABELS = Object.freeze({
  works: "Works",
  unclear: "Unclear",
  missing: "Missing"
});

// Sections that count as present in a whole-note run even when empty: the
// model should be able to flag a missing one-liner or assessment.
const CORE_SECTION_IDS = new Set(["one_liner", "assessment"]);

export const FEEDBACK_PROMPT_MAX_CHARS = 24000;
const MAX_ITEMS = 12;
const MAX_COMMENT_CHARS = 1000;
const MAX_REWRITE_CHARS = 6000;

// Strict structured-output schema for the OpenAI path. Every field is
// required (the AP suggestion schema follows the same rule); an empty
// rewrite string means the item offers no rewrite.
export const WRITER_FEEDBACK_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: MAX_ITEMS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "kind", "comment", "rewrite"],
        properties: {
          section: { type: "string" },
          kind: { type: "string", enum: [...FEEDBACK_KINDS] },
          comment: { type: "string" },
          rewrite: { type: "string" }
        }
      }
    }
  }
});

function textOf(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return String(value.deidentifiedText ?? "");
  return "";
}

function planText(draft) {
  const lines = [];
  for (const problem of draft.problems || []) {
    const name = textOf(problem.problem).trim();
    if (!name) continue;
    lines.push(name);
    const keyContext = textOf(problem.keyContext).trim();
    if (keyContext) lines.push(`Key context: ${keyContext}`);
    const diagnostic = textOf(problem.diagnosticPlan).trim();
    if (diagnostic) lines.push(`Diagnostic plan: ${diagnostic}`);
    const therapeutic = textOf(problem.therapeuticPlan).trim();
    if (therapeutic) lines.push(`Therapeutic plan: ${therapeutic}`);
  }
  return lines.join("\n");
}

// The writer's reviewable sections, in writer order: the note-type fields,
// then Assessment, then Plan, then the closing sections. Plan is built from
// structured problems, so it can be graded and commented on but a rewrite
// cannot be applied to it as one block of text (canApply: false). The
// Physical Exam and Objective sections are assembled from structured picks,
// not free writing, so they are not graded here.
export function buildFeedbackSections(draft) {
  if (!draft?.noteType) return [];
  const sections = [];
  for (const field of fieldsForNoteType(draft.noteType)) {
    sections.push({ id: field.id, label: field.label, text: textOf(draft.sections?.[field.id]), canApply: true });
  }
  sections.push({ id: "assessment", label: "Assessment", text: textOf(draft.assessment), canApply: true });
  sections.push({ id: "plan", label: "Plan", text: planText(draft), canApply: false });
  for (const field of CLOSING_SECTION_FIELDS) {
    sections.push({ id: field.id, label: field.label, text: textOf(draft.closing?.[field.id]), canApply: true });
  }
  return sections;
}

// The one section a "This section" run grades: the tracked section when it is
// in the graded list, otherwise the first written section, otherwise the
// first section. The panel label and the run both resolve through this
// function, so the label always names the section the run will grade, even
// after a patient switch or on a new empty note.
export function resolveScopedSection(sections, lastSectionId) {
  const list = Array.isArray(sections) ? sections : [];
  return list.find((section) => section.id === lastSectionId)
    || list.find((section) => section.text.trim())
    || list[0]
    || null;
}

export function sectionsInScope(sections, scope, lastSectionId) {
  const list = Array.isArray(sections) ? sections : [];
  if (scope === "section") {
    const chosen = resolveScopedSection(list, lastSectionId);
    return chosen ? [chosen] : [];
  }
  return list.filter((section) => section.text.trim() || CORE_SECTION_IDS.has(section.id));
}

export function buildWriterFeedbackPrompt({ noteType, sections }) {
  const scoped = Array.isArray(sections) ? sections : [];
  const instructions = [
    "You are a writing coach for a medical student. Grade the student's note writing against the standard given for each section.",
    "Judge only the writing: clarity, completeness against the standard, and whether the section does the job its standard describes.",
    "Do not invent clinical facts. Use only the student text and standards in the request. Do not add diagnoses, results, or plans the student did not write.",
    "Return only a JSON object in this shape: {\"items\": [{\"section\": \"<section id>\", \"kind\": \"works\" or \"unclear\" or \"missing\", \"comment\": \"<one or two plain sentences>\", \"rewrite\": \"<full replacement text for that section, or an empty string>\"}]}.",
    "kind \"works\" means the section meets its standard; \"unclear\" means the writing is hard to follow or vague; \"missing\" means the standard asks for something the section leaves out.",
    "Include at most 8 items, most important first, and at most one \"works\" item per section.",
    "Offer a rewrite only when new wording would fix the comment, and keep every fact from the student's text. Where the section is marked comment-only, always leave rewrite empty."
  ].join("\n");
  const blocks = scoped.map((section) => {
    const standard = studentGuidance(noteType, section.id);
    return [
      `## ${section.label} [section: ${section.id}]${section.canApply ? "" : " (comment-only)"}`,
      `Standard: ${standard || "No set standard for this section. Judge clarity and completeness only."}`,
      "Student text:",
      section.text.trim() ? section.text : "(empty)"
    ].join("\n");
  });
  return { instructions, input: blocks.join("\n\n") };
}

const UNREADABLE = "The model reply could not be read as feedback. Run feedback again.";

function extractJsonText(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  if (candidate.startsWith("{")) return candidate;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : null;
}

// Accepts the reply object (OpenAI structured output) or its JSON text
// (on-device chat). Items about sections outside the run, items with an
// unknown kind, and items with no comment are dropped. If nothing readable
// remains, this throws one plain error instead of returning raw text.
export function parseWriterFeedback(raw, { sectionIds } = {}) {
  let data = raw;
  if (typeof raw === "string") {
    const jsonText = extractJsonText(raw);
    if (!jsonText) throw new Error(UNREADABLE);
    try { data = JSON.parse(jsonText); } catch { throw new Error(UNREADABLE); }
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.items)) throw new Error(UNREADABLE);
  const allowed = new Set(sectionIds || []);
  const items = [];
  for (const entry of data.items) {
    if (!entry || typeof entry !== "object") continue;
    const sectionId = String(entry.section || "");
    if (!allowed.has(sectionId)) continue;
    const kind = String(entry.kind || "").toLowerCase();
    if (!FEEDBACK_KINDS.includes(kind)) continue;
    const comment = String(entry.comment || "").trim().slice(0, MAX_COMMENT_CHARS);
    if (!comment) continue;
    const rewrite = String(entry.rewrite || "").trim().slice(0, MAX_REWRITE_CHARS);
    items.push({ id: `item-${items.length + 1}`, sectionId, kind, comment, rewrite });
    if (items.length >= MAX_ITEMS) break;
  }
  if (data.items.length > 0 && items.length === 0) throw new Error(UNREADABLE);
  return { items };
}
