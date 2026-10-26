// Tests for the MSE fillable worksheet v3: system-grouped cards and note
// lines, the prose-style note builder, "normal" presets, phrases/render
// segment rules, the chip toggle rule, and progressive detail disclosure
// in src/ui/cheat-sheets/presentation.js. Answers are session-only state:
// Map<itemId, Map<fieldIndex, { selected: Set, text, detail, showDetail }>>.
// Run: node tests/test-mse-worksheet.js   (exits non-zero on failure)
//
// SPEC NOTE (contradiction in spec-v3.md, resolved for the phrases map):
// the phrases map (section C) maps Obsessions "Absent" -> "No obsessions"
// and byte-exact case 2 expects "no obsessions", while case 1 and the
// first case-3 scenario print "obsessions absent" for the same
// field+option. A deterministic builder cannot satisfy both; the phrases
// map and case 2 win, so the expectations below use "no obsessions".
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
assert.equal(mse.exam.length, 11, "MSE sheet still has 11 exam items (grouping is presentational)");

// ---- grouping: 10 groups from 11 items ---------------------------------------
const groups = presentation.worksheetGroups(mse);
assert.equal(groups.length, 10, "11 items group into 10 systems");
assert.deepEqual(
  groups.map((group) => group.system),
  ["Appearance", "Behavior", "Cooperation and attitude", "Speech", "Mood and affect",
   "Thought process", "Thought content", "Perception", "Cognition", "Insight and judgment"]
);
const moodGroup = groups.find((group) => group.system === "Mood and affect");
assert.deepEqual(moodGroup.items.map((item) => item.id), ["exam-05", "exam-06"],
  "the two Mood and affect items share one group, in sheet order");
assert.equal(moodGroup.items.reduce((n, item) => n + item.fields.length, 0), 6,
  "the grouped Mood and affect card keeps all 6 fields");

// ---- field data: chips, presets, render, phrases ------------------------------
let totalFields = 0;
let totalOptions = 0;
let labelRenderCount = 0;
for (const item of mse.exam) {
  assert.ok(Array.isArray(item.fields) && item.fields.length > 0, `${item.id} carries fields`);
  for (const field of item.fields) {
    totalFields += 1;
    totalOptions += field.options.length;
    assert.equal(field.kind, "chips", `${item.id}/${field.label} is a chips field`);
    assert.ok(Array.isArray(field.options) && field.options.length > 0, `${item.id}/${field.label} has options`);
    assert.equal(typeof field.multi, "boolean", `${item.id}/${field.label} declares multi`);
    // Every field carries a normal preset drawn from its own options.
    assert.ok(Array.isArray(field.normal), `${item.id}/${field.label} carries a normal preset`);
    for (const preset of field.normal) {
      assert.ok(field.options.includes(preset), `${item.id}/${field.label} normal preset "${preset}" is one of its options`);
    }
    if (field.render === "label") labelRenderCount += 1;
    if (field.phrases) {
      for (const option of Object.keys(field.phrases)) {
        assert.ok(field.options.includes(option), `${item.id}/${field.label} phrase key "${option}" is one of its options`);
      }
    }
  }
}
assert.equal(totalFields, 44);
assert.equal(totalOptions, 204);
assert.equal(labelRenderCount, 16, 'render "label" on exactly the 16 spec fields');
const fieldByLabel = (itemId, label) =>
  mse.exam.find((item) => item.id === itemId).fields.find((field) => field.label === label);
assert.equal(fieldByLabel("exam-10", "Orientation").render, "oriented");
assert.equal(fieldByLabel("exam-09", "Hallucinations").render, "hallucinations");
assert.deepEqual(fieldByLabel("exam-10", "Orientation").normal, ["Person", "Place", "Time", "Situation"]);
assert.deepEqual(fieldByLabel("exam-01", "Assistive devices").normal, [], "an empty preset clears the field");
assert.equal(fieldByLabel("exam-08", "Obsessions").phrases.Absent, "No obsessions");
assert.equal(fieldByLabel("exam-01", "Clothing").phrases["Appropriate for weather and setting"],
  "Dressed appropriately for the weather and setting");
assert.equal(fieldByLabel("exam-05", "Mood").quoteDetail, true, "Mood detail is quote-wrapped");

// Build nested Map state from { itemId: { fieldIndex: { selected, detail } } }.
function stateFor(spec) {
  const state = new Map();
  for (const [itemId, fields] of Object.entries(spec)) {
    const perItem = new Map();
    for (const [fieldIndex, entry] of Object.entries(fields)) {
      perItem.set(Number(fieldIndex), {
        selected: new Set(entry.selected || []),
        text: "",
        detail: entry.detail || "",
        showDetail: entry.showDetail || false
      });
    }
    state.set(itemId, perItem);
  }
  return state;
}

// State with every field set to its normal preset (what Mark all normal does).
function normalState() {
  const state = new Map();
  for (const step of presentation.worksheetNormalPlan(mse, null)) {
    if (!state.has(step.itemId)) state.set(step.itemId, new Map());
    state.get(step.itemId).set(step.fieldIndex, {
      selected: new Set(step.selected), text: "", detail: "", showDetail: false
    });
  }
  return state;
}

// ---- byte-exact case 1: Aaron's pasted example, restyled ----------------------
const case1 = stateFor({
  "exam-01": {
    0: { selected: ["Well-groomed", "Neat"] },
    1: { selected: ["Appropriate for weather and setting"] },
    2: { selected: ["None"] },
    3: { selected: ["None noted"] },
    4: { selected: ["Good"] }
  },
  "exam-02": {
    0: { selected: ["Slumped"] },
    1: { selected: ["Poor"] },
    2: { selected: ["Not observed"] },
    3: { selected: ["Restless"] },
    4: { selected: ["None observed"] }
  },
  "exam-03": { 0: { selected: ["Guarded"] } },
  "exam-04": {
    0: { selected: ["Rapid"] },
    1: { selected: ["Normal"] },
    2: { selected: ["Stuttering"] },
    3: { selected: ["Normal"] },
    4: { selected: ["Normal"] },
    5: { selected: ["Normal"] }
  },
  "exam-06": {
    0: { selected: ["Anxious"] },
    1: { selected: ["Constricted"] },
    2: { selected: ["Stable"] },
    3: { selected: ["Appropriate"] }
  },
  "exam-07": { 0: { selected: ["Goal-directed"] }, 1: { selected: ["Present"] } },
  "exam-08": {
    0: { selected: ["Present"] },
    1: { selected: ["Denies"] },
    2: { selected: ["Present"] },
    3: { selected: ["Absent"] }
  },
  "exam-09": { 0: { selected: ["Present"] }, 1: { selected: ["Auditory", "Visual"] } }
});
assert.equal(
  presentation.worksheetNoteText(mse, case1),
  "Mental Status Examination\n" +
    "Appearance: Well-groomed, neat; dressed appropriately for the weather and setting; no jewelry or makeup; no scars, piercings, or tattoos noted; dentition good.\n" +
    "Behavior: Slumped; eye contact poor; gait not observed; restless; no abnormal movements.\n" +
    "Cooperation and attitude: Guarded.\n" +
    "Speech: Rapid; volume normal; stuttering; latency normal; quantity normal; prosody normal.\n" +
    "Mood and affect: Anxious; range constricted; stable; appropriate to content.\n" +
    "Thought process: Goal-directed; thought blocking present.\n" +
    // "no obsessions" per the phrases map (see the spec note at the top).
    "Thought content: Suicidal ideation present; denies homicidal ideation; delusions present; no obsessions.\n" +
    "Perception: Illusions present; auditory and visual hallucinations."
);
assert.equal(presentation.worksheetProgressText(mse, case1), "8 of 10 sections filled",
  "progress counts filled groups; the two Mood items are one section");

// ---- byte-exact case 2: the full normal exam ----------------------------------
assert.equal(
  presentation.worksheetNoteText(mse, normalState()),
  "Mental Status Examination\n" +
    "Appearance: Well-groomed; dressed appropriately for the weather and setting; jewelry and makeup appropriate; no scars, piercings, or tattoos noted; dentition good.\n" +
    "Behavior: Relaxed; eye contact good; gait normal; normal activity level; no abnormal movements.\n" +
    "Cooperation and attitude: Cooperative.\n" +
    "Speech: Regular; volume normal; clear; latency normal; quantity normal; prosody normal.\n" +
    "Mood and affect: Euthymic; bright; euthymic; range full; stable; appropriate to content.\n" +
    "Thought process: Goal-directed; no thought blocking.\n" +
    "Thought content: Denies suicidal ideation; denies homicidal ideation; no delusions; no obsessions.\n" +
    "Perception: No illusions.\n" +
    "Cognition: Alert; oriented to person, place, time, and situation; attention intact; immediate memory intact; recent memory intact; remote memory intact; visuospatial ability intact; abstraction intact (abstract).\n" +
    "Insight and judgment: Insight good; judgment good."
);
assert.equal(presentation.worksheetProgressText(mse, normalState()), "10 of 10 sections filled");

// ---- byte-exact case 3: carried-over scenarios, restyled ------------------------
// Thought content with a detail on delusions.
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({
    "exam-08": {
      0: { selected: ["Denies"] },
      1: { selected: ["Denies"] },
      2: { selected: ["Present"], detail: "Believes the staff are poisoning his food" },
      3: { selected: ["Absent"] }
    }
  })),
  "Mental Status Examination\n" +
    // "no obsessions" per the phrases map (see the spec note at the top).
    "Thought content: Denies suicidal ideation; denies homicidal ideation; delusions present (Believes the staff are poisoning his food); no obsessions."
);
// Mood quote: chips plus the patient's own words.
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({
    "exam-05": { 0: { selected: ["Hopeless", "Anxious"], detail: "I feel hopeless" } }
  })),
  "Mental Status Examination\nMood and affect: Anxious, hopeless (\"I feel hopeless\")."
);
// Speech subset.
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({
    "exam-04": { 0: { selected: ["Regular"] }, 2: { selected: ["Dysarthria"] }, 4: { selected: ["Paucity"] } }
  })),
  "Mental Status Examination\nSpeech: Regular; dysarthria; quantity paucity."
);
// Appearance with a detail.
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({
    "exam-01": {
      0: { selected: ["Unkempt", "Disheveled"] },
      1: { selected: ["Mismatched"], detail: "Wearing a hospital gown" },
      4: { selected: ["Missing teeth", "Poor"] }
    }
  })),
  "Mental Status Examination\nAppearance: Disheveled, unkempt; mismatched (Wearing a hospital gown); dentition poor, missing teeth."
);

// ---- segment rules --------------------------------------------------------------
// oriented: Oxford join of the raw options ("a", "a and b", "a, b, and c").
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({ "exam-10": { 1: { selected: ["Person"] } } })),
  "Mental Status Examination\nCognition: Oriented to person."
);
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({ "exam-10": { 1: { selected: ["Person", "Place"] } } })),
  "Mental Status Examination\nCognition: Oriented to person and place."
);
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({ "exam-10": { 1: { selected: ["Time", "Person", "Place"] } } })),
  "Mental Status Examination\nCognition: Oriented to person, place, and time.",
  "selections render in options data order, not tap order"
);
// hallucinations: Oxford join plus the suffix; later segments lowercase.
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({ "exam-09": { 1: { selected: ["Tactile", "Auditory", "Visual"] } } })),
  "Mental Status Examination\nPerception: Auditory, visual, and tactile hallucinations."
);
// label mode keeps its short prefix; values lose only their first letter's case.
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({ "exam-11": { 0: { selected: ["Fair"] }, 1: { selected: ["Poor"] } } })),
  "Mental Status Examination\nInsight and judgment: Insight fair; judgment poor."
);
// quoteDetail with a detail but no selection: the segment is exactly the quote.
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({ "exam-05": { 0: { selected: [], detail: "I feel hopeless" } } })),
  "Mental Status Examination\nMood and affect: \"I feel hopeless\"."
);
// A detail with no chips still fills its field: label mode prefixes it,
// default mode stands alone in parentheses (v2 edge, restyled).
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({ "exam-01": { 4: { selected: [], detail: "Two broken molars" } } })),
  "Mental Status Examination\nAppearance: Dentition (Two broken molars)."
);
assert.equal(
  presentation.worksheetNoteText(mse, stateFor({ "exam-08": { 2: { selected: [], detail: "Grandiose plans to buy the hospital" } } })),
  "Mental Status Examination\nThought content: (Grandiose plans to buy the hospital)."
);
// Empty state: nothing filled -> empty text, progress at zero groups.
assert.equal(presentation.worksheetNoteText(mse, new Map()), "");
assert.equal(presentation.worksheetNoteText(mse, null), "");
assert.equal(presentation.worksheetProgressText(mse, new Map()), "0 of 10 sections filled");
assert.deepEqual(presentation.worksheetGroupFilled(mse, case1),
  [true, true, true, true, true, true, true, true, false, false]);
// Plain-object state (not Maps) works at both levels.
assert.equal(
  presentation.worksheetNoteText(mse, { "exam-03": { 0: { selected: ["Hostile"], text: "", detail: "" } } }),
  "Mental Status Examination\nCooperation and attitude: Hostile."
);

// ---- Mark normal plan -------------------------------------------------------------
const fullPlan = presentation.worksheetNormalPlan(mse, null);
assert.equal(fullPlan.length, 44, "the all-groups plan covers every field");
assert.deepEqual(fullPlan[0], { itemId: "exam-01", fieldIndex: 0, selected: ["Well-groomed"] });
const moodPlan = presentation.worksheetNormalPlan(mse, 4);
assert.deepEqual(
  moodPlan.map((step) => `${step.itemId}/${step.fieldIndex}`),
  ["exam-05/0", "exam-05/1", "exam-06/0", "exam-06/1", "exam-06/2", "exam-06/3"],
  "a group plan spans both items of the grouped Mood and affect card"
);
assert.deepEqual(moodPlan[0].selected, ["Euthymic"]);

// ---- chip toggle rule (unchanged from v2) ------------------------------------------
const rateField = fieldByLabel("exam-04", "Rate");
assert.equal(rateField.multi, false);
assert.deepEqual(presentation.worksheetChipToggle(rateField, [], "Rapid"), ["Rapid"]);
assert.deepEqual(presentation.worksheetChipToggle(rateField, ["Rapid"], "Slow"), ["Slow"], "single-select replaces");
assert.deepEqual(presentation.worksheetChipToggle(rateField, ["Slow"], "Slow"), [], "tapping the picked chip clears it");
const groomingField = fieldByLabel("exam-01", "Grooming and hygiene");
assert.equal(groomingField.multi, true);
assert.deepEqual(presentation.worksheetChipToggle(groomingField, [], "Neat"), ["Neat"]);
assert.deepEqual(presentation.worksheetChipToggle(groomingField, ["Neat"], "Disheveled"), ["Neat", "Disheveled"]);
assert.deepEqual(presentation.worksheetChipToggle(groomingField, ["Neat", "Disheveled"], "Neat"), ["Disheveled"], "multi toggles off");

// ---- worksheet markup ---------------------------------------------------------------
const emptyHtml = presentation.worksheetHtml(mse, new Map());
assert.equal((emptyHtml.match(/<section class="cs-worksheet-card" data-worksheet-group=/g) || []).length, 10, "one card per group");
assert.equal((emptyHtml.match(/data-worksheet-system="Mood and affect"/g) || []).length, 1,
  "exactly one Mood and affect card");
assert.equal((emptyHtml.match(/data-worksheet-chip=/g) || []).length, totalOptions, "one chip per option across all fields");
assert.equal((emptyHtml.match(/data-worksheet-detail=/g) || []).length, 0,
  "no detail inputs are rendered while every field is untouched");
assert.equal((emptyHtml.match(/data-worksheet-add-detail=/g) || []).length, totalFields,
  "every untouched field offers an Add detail button instead");
assert.equal((emptyHtml.match(/data-action="cheat-sheets-worksheet-normal"/g) || []).length, 10,
  "one Mark normal button per card");
assert.match(emptyHtml, /data-action="cheat-sheets-worksheet-normal-all"/, "Mark all normal sits with the actions");
assert.match(emptyHtml, /data-action="cheat-sheets-worksheet-copy" disabled/, "Copy disabled when the note is empty");
assert.match(emptyHtml, /data-worksheet-progress[^>]*>0 of 10 sections filled</);
assert.doesNotMatch(emptyHtml, /aria-pressed="true"/);
assert.doesNotMatch(emptyHtml, /data-worksheet-group-check="0">✓/, "no check mark on an unfilled card");

const case1Html = presentation.worksheetHtml(mse, case1);
assert.equal((case1Html.match(/data-worksheet-detail=/g) || []).length, 29,
  "detail inputs render only for fields with a selection or detail (case 1 fills 29 fields)");
assert.match(case1Html, /data-worksheet-group-check="0">✓ </, "a filled card shows its check mark");
assert.match(case1Html, /✓ Well-groomed/, "selected chips carry a check mark, not color alone");
assert.match(case1Html, /id="cheat-sheets-worksheet-output"[^>]*>[\s\S]*Appearance: Well-groomed, neat;/);
assert.match(case1Html, /Can use standardized tools like the MMSE or MoCA\./, "Cognition card keeps its how line");
assert.match(case1Html, /data-worksheet-chip="exam-06" data-worksheet-field="0" data-value="Anxious" aria-pressed="true"/,
  "the grouped card renders the second Mood item's fields");

// A field opened via Add detail (showDetail flag) renders its input even
// with no selection, and the flag never reaches the note text.
const shownHtml = presentation.worksheetHtml(mse, stateFor({ "exam-01": { 6: { selected: [], showDetail: true } } }));
assert.match(shownHtml, /data-worksheet-detail="exam-01" data-worksheet-field="6"/);
assert.equal(presentation.worksheetNoteText(mse, stateFor({ "exam-01": { 6: { selected: [], showDetail: true } } })), "",
  "showDetail alone does not fill a field");

// ---- entry button gating ---------------------------------------------------------
assert.match(presentation.sheetDetailHtml(mse), /data-action="cheat-sheets-open-worksheet"/);
assert.match(presentation.sheetDetailHtml(mse), /Fill in worksheet/);
const unflagged = bundle.sheets.find((sheet) => sheet.id === "dyspnea");
assert.doesNotMatch(presentation.sheetDetailHtml(unflagged), /cheat-sheets-open-worksheet/);

console.log("All MSE worksheet tests passed.");
