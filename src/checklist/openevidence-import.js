import { addQuickNote } from "./state.js";

// Pure prompt/schema/merge logic for turning a de-identified OpenEvidence
// note into answers for an already-built checklist. Kept independent of the
// OpenAI transport (src/ui/openai-checklist-api.js) and of the DOM-touching
// controller (src/ui/checklist/openevidence-import-controller.js) so each
// piece can be tested and reused on its own.

export function checklistAnswerImportSchema(snapshot) {
  const itemIds = (snapshot?.items || []).map((item) => item.id);
  return {
    type: "object",
    additionalProperties: false,
    required: ["answers", "quickNotes"],
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "selected", "note"],
          properties: {
            // OpenAI strict schemas can't express "choices valid for this id
            // only" - selected stays a free string array and gets validated
            // against the item's real choices in applyChecklistAnswerImport.
            id: { type: "string", enum: itemIds.length ? itemIds : [""] },
            selected: { type: "array", items: { type: "string" } },
            note: { type: "string" }
          }
        }
      },
      quickNotes: {
        type: "array",
        items: { type: "string" }
      }
    }
  };
}

function itemPromptLine(item) {
  return `- id: ${item.id} | kind: ${item.kind} | select: ${item.select} | text: ${item.text} | choices: ${(item.choices || []).join(", ")}`;
}

export function buildChecklistAnswerImportPrompt({ snapshot, sourceText = "" } = {}) {
  const items = snapshot?.items || [];
  return `Read the de-identified OpenEvidence note below and use it to fill in this pre-rounding checklist.

Checklist items (use these exact ids and choice text - never invent, translate, or abbreviate them):
${items.map(itemPromptLine).join("\n")}

Rules:
- For every item the note gives you information about, return one entry in "answers" with that item's exact "id" and the subset of its listed choices that apply. For a "select: one" item return at most one choice; for "select: many" return every choice that applies.
- Use "note" on that same entry only for short detail beyond the fixed choices (e.g. a measurement, a location, a qualifier). Leave it "" if there is nothing to add.
- Do not return an entry for an item the note says nothing about.
- Do not fabricate findings the note does not support.
- Anything the note captures that does not correspond to any listed item - additional history, review of systems, vitals, labs, or exam findings outside this checklist - must still be kept. Add each such finding as its own short, plain-text entry in "quickNotes" instead of dropping it or forcing it onto an unrelated item.
- Return JSON only, no markdown.

De-identified OpenEvidence note:
${sourceText || "[Paste the de-identified OpenEvidence note here]"}`;
}

function matchChoice(choices, value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return (choices || []).find((choice) => choice.toLowerCase() === text.toLowerCase()) || null;
}

export function applyChecklistAnswerImport({ snapshot, answers = {}, quickNotes = [], result = {} } = {}) {
  const itemsById = new Map((snapshot?.items || []).map((item) => [item.id, item]));
  const nextAnswers = { ...answers };
  let filledCount = 0;

  for (const entry of Array.isArray(result?.answers) ? result.answers : []) {
    const item = itemsById.get(entry?.id);
    if (!item) continue;
    const rawSelected = Array.isArray(entry.selected) ? entry.selected : [];
    const matched = [];
    const unmatchedText = [];
    for (const value of rawSelected) {
      const choice = matchChoice(item.choices, value);
      if (choice) matched.push(choice);
      else if (String(value || "").trim()) unmatchedText.push(String(value).trim());
    }
    const selected = item.select === "many" ? [...new Set(matched)] : matched.slice(0, 1);
    const noteParts = [String(entry.note || "").trim(), ...unmatchedText].filter(Boolean);
    if (!selected.length && !noteParts.length) continue;
    nextAnswers[item.id] = { selected, note: noteParts.join(" · ") };
    filledCount += 1;
  }

  let nextQuickNotes = quickNotes;
  const incomingNotes = (Array.isArray(result?.quickNotes) ? result.quickNotes : [])
    .map((text) => String(text || "").trim())
    .filter(Boolean);
  for (const text of incomingNotes) nextQuickNotes = addQuickNote(nextQuickNotes, text);

  return { answers: nextAnswers, quickNotes: nextQuickNotes, filledCount, quickNoteCount: incomingNotes.length };
}
