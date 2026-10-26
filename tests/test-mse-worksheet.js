// Tests for the MSE fillable worksheet's pure parts: the field-based
// note-text builder, the chip toggle rule, and the worksheet markup in
// src/ui/cheat-sheets/presentation.js. Answers are session-only state:
// Map<itemId, Map<fieldIndex, { selected: Set, text, detail }>>.
// Run: node tests/test-mse-worksheet.js   (exits non-zero on failure)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCheatSheetsPresentation } from "../src/ui/cheat-sheets/presentation.js";

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const presentation = createCheatSheetsPresentation({ escapeHtml });
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- the real MSE sheet ------------------------------------------------------
const bundle = JSON.parse(readFileSync(join(root, "src", "data", "cheat-sheets.json"), "utf8"));
const mse = bundle.sheets.find((sheet) => sheet.id === "mental-status-examination");
assert.ok(mse, "MSE sheet exists");
assert.equal(mse.worksheet, true, "MSE sheet carries the worksheet flag");
assert.equal(bundle.sheets.filter((sheet) => sheet.worksheet).length, 1, "only the MSE sheet is flagged");
assert.equal(mse.exam.length, 11, "MSE sheet has 11 exam items");

// Every field is tap-first chips with descriptor options (Aaron's
// amendment: no pure-text fields; free text is the per-field detail only).
let totalFields = 0;
let totalOptions = 0;
for (const item of mse.exam) {
  assert.ok(Array.isArray(item.fields) && item.fields.length > 0, `${item.id} carries fields`);
  for (const field of item.fields) {
    totalFields += 1;
    totalOptions += field.options.length;
    assert.equal(field.kind, "chips", `${item.id}/${field.label} is a chips field`);
    assert.ok(Array.isArray(field.options) && field.options.length > 0, `${item.id}/${field.label} has options`);
    assert.equal(typeof field.multi, "boolean", `${item.id}/${field.label} declares multi`);
  }
}
// 44 fields, 204 options: counted programmatically from the data when the
// amendment's option table was applied (2026-10-26).
assert.equal(totalFields, 44);
assert.equal(totalOptions, 204);
const moodField = mse.exam.find((item) => item.id === "exam-05").fields[0];
assert.equal(moodField.quoteDetail, true, "Mood detail is quote-wrapped");

// Build nested Map state from { itemId: { fieldIndex: { selected, detail } } }.
function stateFor(spec) {
  const state = new Map();
  for (const [itemId, fields] of Object.entries(spec)) {
    const perItem = new Map();
    for (const [fieldIndex, entry] of Object.entries(fields)) {
      perItem.set(Number(fieldIndex), {
        selected: new Set(entry.selected || []),
        text: "",
        detail: entry.detail || ""
      });
    }
    state.set(itemId, perItem);
  }
  return state;
}

// ---- worked examples (byte-exact) --------------------------------------------
// 1. Appearance: values in options data order regardless of tap order,
//    detail in parentheses exactly as typed.
const appearance = stateFor({
  "exam-01": {
    0: { selected: ["Unkempt", "Disheveled"] },
    1: { selected: ["Mismatched"], detail: "Wearing a hospital gown" },
    4: { selected: ["Missing teeth", "Poor"] }
  }
});
assert.equal(
  presentation.worksheetNoteText(mse, appearance),
  "Mental Status Examination\n" +
    "Appearance: grooming and hygiene: disheveled, unkempt; clothing: mismatched (Wearing a hospital gown); dentition: poor, missing teeth"
);

// 2. Single-field domain: the field label is omitted.
const cooperation = stateFor({ "exam-03": { 0: { selected: ["Guarded", "Cooperative"] } } });
assert.equal(
  presentation.worksheetNoteText(mse, cooperation),
  "Mental Status Examination\nCooperation and attitude: cooperative, guarded"
);

// 3. Thought content, unchanged from the spec-v2 example.
const thoughtContent = stateFor({
  "exam-08": {
    0: { selected: ["Denies"] },
    1: { selected: ["Denies"] },
    2: { selected: ["Present"], detail: "Believes the staff are poisoning his food" },
    3: { selected: ["Absent"] }
  }
});
assert.equal(
  presentation.worksheetNoteText(mse, thoughtContent),
  "Mental Status Examination\n" +
    "Thought content: suicidal or self-harm ideation: denies; homicidal or violent ideation: denies; " +
    "delusions: present (Believes the staff are poisoning his food); obsessions: absent"
);

// 4. Speech, unchanged from the spec-v2 example.
const speech = stateFor({
  "exam-04": {
    0: { selected: ["Regular"] },
    2: { selected: ["Dysarthria"] },
    4: { selected: ["Paucity"] }
  }
});
assert.equal(
  presentation.worksheetNoteText(mse, speech),
  "Mental Status Examination\nSpeech: rate: regular; articulation: dysarthria; quantity: paucity"
);

// 5. Mood: quoteDetail wraps the detail in double quotes inside the
//    parentheses; the unfilled Affect field contributes nothing.
const mood = stateFor({
  "exam-05": { 0: { selected: ["Hopeless", "Anxious"], detail: "I feel hopeless" } }
});
assert.equal(
  presentation.worksheetNoteText(mse, mood),
  "Mental Status Examination\nMood and affect: mood: anxious, hopeless (\"I feel hopeless\")"
);

// Empty state: nothing filled -> empty text, Copy stays disabled, and
// progress counts domains with at least one filled field.
assert.equal(presentation.worksheetNoteText(mse, new Map()), "");
assert.equal(presentation.worksheetNoteText(mse, null), "");
assert.equal(presentation.worksheetProgressText(mse, new Map()), "0 of 11 sections filled");
assert.equal(presentation.worksheetProgressText(mse, appearance), "1 of 11 sections filled");
const twoDomains = stateFor({
  "exam-01": { 6: { selected: ["Flushing"] } },
  "exam-11": { 0: { selected: ["Fair"] } }
});
assert.equal(presentation.worksheetProgressText(mse, twoDomains), "2 of 11 sections filled");
assert.equal(
  presentation.worksheetNoteText(mse, twoDomains),
  "Mental Status Examination\nAppearance: other signs: flushing\nInsight and judgment: insight: fair"
);

// A detail with no chips still fills its field and renders on its own.
const detailOnly = stateFor({ "exam-08": { 2: { selected: [], detail: "Grandiose plans to buy the hospital" } } });
assert.equal(
  presentation.worksheetNoteText(mse, detailOnly),
  "Mental Status Examination\nThought content: delusions: (Grandiose plans to buy the hospital)"
);

// Plain-object state (not Maps) works at both levels.
assert.equal(
  presentation.worksheetNoteText(mse, { "exam-03": { 0: { selected: ["Hostile"], text: "", detail: "" } } }),
  "Mental Status Examination\nCooperation and attitude: hostile"
);

// ---- chip toggle rule ---------------------------------------------------------
const rateField = mse.exam.find((item) => item.id === "exam-04").fields[0];
assert.equal(rateField.multi, false);
assert.deepEqual(presentation.worksheetChipToggle(rateField, [], "Rapid"), ["Rapid"]);
assert.deepEqual(presentation.worksheetChipToggle(rateField, ["Rapid"], "Slow"), ["Slow"], "single-select replaces");
assert.deepEqual(presentation.worksheetChipToggle(rateField, ["Slow"], "Slow"), [], "tapping the picked chip clears it");
const groomingField = mse.exam[0].fields[0];
assert.equal(groomingField.multi, true);
assert.deepEqual(presentation.worksheetChipToggle(groomingField, [], "Neat"), ["Neat"]);
assert.deepEqual(presentation.worksheetChipToggle(groomingField, ["Neat"], "Disheveled"), ["Neat", "Disheveled"]);
assert.deepEqual(presentation.worksheetChipToggle(groomingField, ["Neat", "Disheveled"], "Neat"), ["Disheveled"], "multi toggles off");

// ---- worksheet markup -----------------------------------------------------------
const html = presentation.worksheetHtml(mse, appearance);
assert.equal((html.match(/data-worksheet-chip=/g) || []).length, totalOptions, "one chip per option across all fields");
assert.equal((html.match(/data-worksheet-detail=/g) || []).length, totalFields, "one detail input per field");
assert.match(html, /data-worksheet-chip="exam-01" data-worksheet-field="0" data-value="Disheveled" aria-pressed="true"/);
assert.match(html, /data-worksheet-chip="exam-01" data-worksheet-field="0" data-value="Neat" aria-pressed="false"/);
assert.match(html, /✓ Disheveled/, "selected chips carry a check mark, not color alone");
assert.match(html, /data-worksheet-field="1"[^>]*placeholder="Type of clothing"/, "detailHint becomes the detail placeholder");
assert.match(html, /aria-label="Detail for Clothing"/);
assert.match(html, /data-worksheet-progress[^>]*>1 of 11 sections filled</);
assert.match(html, /id="cheat-sheets-worksheet-output"[^>]*>[\s\S]*Appearance: grooming and hygiene: disheveled, unkempt/);
assert.match(html, /Can use standardized tools like the MMSE or MoCA\./, "Cognition card keeps its how line");

const emptyHtml = presentation.worksheetHtml(mse, new Map());
assert.doesNotMatch(emptyHtml, /aria-pressed="true"/);
assert.match(emptyHtml, /data-action="cheat-sheets-worksheet-copy" disabled/);

// ---- entry button gating ---------------------------------------------------------
assert.match(presentation.sheetDetailHtml(mse), /data-action="cheat-sheets-open-worksheet"/);
assert.match(presentation.sheetDetailHtml(mse), /Fill in worksheet/);
const unflagged = bundle.sheets.find((sheet) => sheet.id === "dyspnea");
assert.doesNotMatch(presentation.sheetDetailHtml(unflagged), /cheat-sheets-open-worksheet/);

console.log("All MSE worksheet tests passed.");
