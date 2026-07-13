import assert from "node:assert/strict";
import {
  applyChecklistAnswerImport,
  buildChecklistAnswerImportPrompt,
  checklistAnswerImportSchema
} from "../src/checklist/openevidence-import.js";

const snapshot = {
  schema: "prerounding_checklist_v1",
  id: "checklist_1",
  items: [
    { id: "lung_auscultation", workupTitle: "General admission", kind: "exam", text: "Lung auscultation", choices: ["Clear", "Crackles", "Wheezes", "Diminished"], select: "one", system: "pulmonary" },
    { id: "ros_constitutional", workupTitle: "General admission", kind: "history", text: "Constitutional review of systems", choices: ["No complaints", "Fever", "Chills", "Weight loss"], select: "many", system: "general" },
    { id: "cardiac_auscultation", workupTitle: "General admission", kind: "exam", text: "Cardiac auscultation", choices: ["Normal S1/S2", "Murmur", "Irregular rhythm"], select: "one", system: "cardiovascular" }
  ]
};

// --- schema shape ---
const schema = checklistAnswerImportSchema(snapshot);
assert.equal(schema.type, "object");
assert.equal(schema.additionalProperties, false);
assert.deepEqual(schema.required, ["answers", "quickNotes"]);
assert.deepEqual(schema.properties.answers.items.properties.id.enum, ["lung_auscultation", "ros_constitutional", "cardiac_auscultation"]);
assert.equal(schema.properties.answers.items.additionalProperties, false);
assert.deepEqual(schema.properties.answers.items.required, ["id", "selected", "note"]);
assert.equal(schema.properties.quickNotes.items.type, "string");

const emptySchema = checklistAnswerImportSchema({ items: [] });
assert.deepEqual(emptySchema.properties.answers.items.properties.id.enum, [""]);

// --- prompt content ---
const prompt = buildChecklistAnswerImportPrompt({ snapshot, sourceText: "Lungs clear bilaterally. Patient also mentioned new hearing loss in the left ear." });
assert.match(prompt, /id: lung_auscultation/);
assert.match(prompt, /choices: Clear, Crackles, Wheezes, Diminished/);
assert.match(prompt, /id: cardiac_auscultation/);
assert.match(prompt, /quickNotes/);
assert.match(prompt, /does not correspond to any listed item/);
assert.match(prompt, /Return JSON only/i);
assert.match(prompt, /new hearing loss in the left ear/);

// --- merge: exact + case-insensitive choice match, respects select: "one" ---
{
  const result = {
    answers: [
      { id: "lung_auscultation", selected: ["crackles"], note: "" },
      { id: "cardiac_auscultation", selected: ["Murmur", "Normal S1/S2"], note: "2/6 systolic" }
    ],
    quickNotes: []
  };
  const applied = applyChecklistAnswerImport({ snapshot, answers: {}, quickNotes: [], result });
  assert.deepEqual(applied.answers.lung_auscultation, { selected: ["Crackles"], note: "" });
  // select: "one" keeps only the first valid match even though two were returned.
  assert.deepEqual(applied.answers.cardiac_auscultation, { selected: ["Murmur"], note: "2/6 systolic" });
  assert.equal(applied.filledCount, 2);
  assert.equal(applied.quickNoteCount, 0);
}

// --- merge: select: "many" keeps every valid match ---
{
  const result = { answers: [{ id: "ros_constitutional", selected: ["Fever", "chills"], note: "" }], quickNotes: [] };
  const applied = applyChecklistAnswerImport({ snapshot, answers: {}, quickNotes: [], result });
  assert.deepEqual(applied.answers.ros_constitutional.selected, ["Fever", "Chills"]);
}

// --- merge: text that doesn't match a real choice folds into that item's note instead of being dropped ---
{
  const result = { answers: [{ id: "lung_auscultation", selected: ["Rhonchi"], note: "" }], quickNotes: [] };
  const applied = applyChecklistAnswerImport({ snapshot, answers: {}, quickNotes: [], result });
  assert.deepEqual(applied.answers.lung_auscultation.selected, []);
  assert.match(applied.answers.lung_auscultation.note, /Rhonchi/);
}

// --- merge: items the AI did not mention are left untouched; unknown ids are ignored ---
{
  const existingAnswers = { cardiac_auscultation: { selected: ["Murmur"], note: "known" } };
  const result = { answers: [{ id: "not_a_real_item", selected: ["x"], note: "" }], quickNotes: [] };
  const applied = applyChecklistAnswerImport({ snapshot, answers: existingAnswers, quickNotes: [], result });
  assert.deepEqual(applied.answers, existingAnswers);
  assert.equal(applied.filledCount, 0);
}

// --- merge: an entry with nothing usable is skipped rather than blanking the item ---
{
  const result = { answers: [{ id: "lung_auscultation", selected: [], note: "" }], quickNotes: [] };
  const applied = applyChecklistAnswerImport({ snapshot, answers: {}, quickNotes: [], result });
  assert.equal(applied.answers.lung_auscultation, undefined);
  assert.equal(applied.filledCount, 0);
}

// --- merge: unmapped findings become real quick notes, never silently dropped ---
{
  const result = { answers: [], quickNotes: ["New left-ear hearing loss reported by patient.", "  ", ""] };
  const applied = applyChecklistAnswerImport({ snapshot, answers: {}, quickNotes: [], result });
  assert.equal(applied.quickNotes.length, 1);
  assert.equal(applied.quickNotes[0].text, "New left-ear hearing loss reported by patient.");
  assert.ok(applied.quickNotes[0].id);
  assert.ok(applied.quickNotes[0].createdAt);
  assert.equal(applied.quickNoteCount, 1);
}

console.log("Checklist OpenEvidence import tests passed");
