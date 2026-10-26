// Tests for the generic fillable worksheet: every cheat sheet carries
// `worksheet: true`; sheets without curated `fields` (all but the MSE
// sheet) render one single-select chip row per item from its own
// listenFor/findings, grouped by system across the history/exam
// boundary, building a prose note headed by the sheet's title.
// Answers are session-only state:
// Map<itemId, Map<0, { selected: Set, text, detail, showDetail }>>.
// Run: node tests/test-generic-worksheet.js   (exits non-zero on failure)
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

const bundle = JSON.parse(readFileSync(join(root, "src", "data", "cheat-sheets.json"), "utf8"));
const sheets = bundle.sheets;

// ---- every sheet is flagged ---------------------------------------------------
assert.equal(sheets.length, 88, "88 sheets in the bundle");
assert.ok(sheets.every((sheet) => sheet.worksheet === true), "all 88 sheets carry worksheet: true");

// ---- generic item census --------------------------------------------------------
// Generic items = every history item plus every exam item without curated
// `fields`. Each must offer at least 1 answer option; most offer at most 5,
// while CIWA-Ar scale items carry up to 8 graded anchors.
let genericItems = 0;
for (const sheet of sheets) {
  for (const item of sheet.history) {
    genericItems += 1;
    assert.ok(Array.isArray(item.listenFor) && item.listenFor.length >= 1 && item.listenFor.length <= 8,
      `${sheet.id}/${item.id} offers 1-8 listenFor options`);
  }
  for (const item of sheet.exam) {
    if (Array.isArray(item.fields) && item.fields.length) continue;
    genericItems += 1;
    assert.ok(Array.isArray(item.findings) && item.findings.length >= 1 && item.findings.length <= 8,
      `${sheet.id}/${item.id} offers 1-8 findings options`);
  }
}
assert.equal(genericItems, 1803, "1,803 generic items across the bundle");

// ---- dispatch -------------------------------------------------------------------
const mse = sheets.find((sheet) => sheet.id === "mental-status-examination");
const dyspnea = sheets.find((sheet) => sheet.id === "dyspnea");
assert.equal(presentation.sheetHasFields(mse), true, "MSE sheet takes the curated-fields path");
assert.equal(presentation.sheetHasFields(dyspnea), false, "dyspnea takes the generic path");

// ---- PSYH 530 sheets appended 2026-10-26 take the generic path -------------------
const capacity = sheets.find((sheet) => sheet.id === "decision-making-capacity");
const substanceUse = sheets.find((sheet) => sheet.id === "substance-use-history");
const ciwa = sheets.find((sheet) => sheet.id === "ciwa-ar");
const cows = sheets.find((sheet) => sheet.id === "cows");
for (const sheet of [capacity, substanceUse, ciwa, cows]) {
  assert.ok(sheet, "PSYH 530 sheet is present");
  assert.equal(presentation.sheetHasFields(sheet), false, `${sheet.id} takes the generic path`);
}

// ---- addiction reference sheets appended 2026-10-26 take the generic path --------
const addictionSheets = [
  ["alcohol-withdrawal-management", 11],
  ["moud", 11],
  ["toxidromes-urine-drug-testing", 15],
  ["aud-medications", 9],
  ["motivational-interviewing-screening", 12]
];
for (const [id, itemCount] of addictionSheets) {
  const sheet = sheets.find((candidate) => candidate.id === id);
  assert.ok(sheet, `addiction reference sheet ${id} is present`);
  assert.equal(presentation.sheetHasFields(sheet), false, `${id} takes the generic path`);
  const sheetGroups = presentation.genericWorksheetGroups(sheet);
  assert.equal(
    sheetGroups.reduce((n, group) => n + group.entries.length, 0), itemCount,
    `all ${itemCount} ${id} items are grouped`
  );
}
const miGroups = presentation.genericWorksheetGroups(
  sheets.find((sheet) => sheet.id === "motivational-interviewing-screening"));
assert.deepEqual(
  miGroups.map((group) => group.title),
  ["Screening", "Oars skills", "Brief intervention", "Stages of change"],
  "MI/screening groups follow first appearance"
);

// ---- PSYH 530 worksheet sheets appended 2026-10-26 take the generic path -------
const psychWorksheetSheets = [
  ["suicide-risk-assessment", 14],
  ["case-formulation", 18],
  ["aims", 17]
];
for (const [id, itemCount] of psychWorksheetSheets) {
  const sheet = sheets.find((candidate) => candidate.id === id);
  assert.ok(sheet, `psych worksheet sheet ${id} is present`);
  assert.equal(presentation.sheetHasFields(sheet), false, `${id} takes the generic path`);
  const sheetGroups = presentation.genericWorksheetGroups(sheet);
  assert.equal(
    sheetGroups.reduce((n, group) => n + group.entries.length, 0), itemCount,
    `all ${itemCount} ${id} items are grouped`
  );
}
const formulationGroups = presentation.genericWorksheetGroups(
  sheets.find((sheet) => sheet.id === "case-formulation"));
assert.deepEqual(
  formulationGroups.map((group) => group.title),
  ["Problem summary", "Predisposing", "Precipitating", "Perpetuating",
   "Protective", "Treatment implications"],
  "formulation groups land in canonical order"
);

// ---- psychiatry reference sheets appended 2026-10-26 take the generic path -----
const psychReferenceSheets = [
  ["serotonin-nms-anticholinergic", 14],
  ["catatonia", 13],
  ["lithium", 12],
  ["antipsychotics", 14],
  ["antidepressant-traps", 14],
  ["ect", 10]
];
for (const [id, itemCount] of psychReferenceSheets) {
  const sheet = sheets.find((candidate) => candidate.id === id);
  assert.ok(sheet, `psychiatry reference sheet ${id} is present`);
  assert.equal(presentation.sheetHasFields(sheet), false, `${id} takes the generic path`);
  const sheetGroups = presentation.genericWorksheetGroups(sheet);
  assert.equal(
    sheetGroups.reduce((n, group) => n + group.entries.length, 0), itemCount,
    `all ${itemCount} ${id} items are grouped`
  );
}

// ---- grouping on the dyspnea sheet ----------------------------------------------
const groups = presentation.genericWorksheetGroups(dyspnea);
assert.deepEqual(
  groups.map((group) => group.title),
  ["Respiratory", "Cardiovascular", "Infectious", "Skin", "Gastrointestinal",
   "Functional", "Psychiatric", "Hematologic", "Ent", "Neurologic"],
  "groups follow first appearance, titles capitalized"
);
const respiratory = groups[0];
assert.deepEqual(
  respiratory.entries.map((entry) => entry.item.id),
  ["history-01", "history-05", "history-06", "history-07", "exam-01", "exam-02", "exam-04", "exam-09"],
  "Respiratory merges history and exam items, history before exam, each in sheet order"
);
assert.equal(respiratory.entries.filter((entry) => entry.kind === "history").length, 4);
assert.equal(respiratory.entries.filter((entry) => entry.kind === "exam").length, 4);
const totalEntries = groups.reduce((n, group) => n + group.entries.length, 0);
assert.equal(totalEntries, 30, "all 30 dyspnea items are grouped");

// ---- state helper (mirrors tests/test-mse-worksheet.js) ---------------------------
function stateFor(spec) {
  const state = new Map();
  for (const [itemId, entry] of Object.entries(spec)) {
    const perItem = new Map();
    perItem.set(0, {
      selected: new Set(entry.selected || []),
      text: "",
      detail: entry.detail || "",
      showDetail: entry.showDetail || false
    });
    state.set(itemId, perItem);
  }
  return state;
}

// ---- byte-exact note (spec section C) ----------------------------------------------
const caseState = stateFor({
  "history-01": { selected: ["Abrupt, over minutes to hours"] },
  "exam-01": { selected: ["Tachypneic with accessory muscle use"] },
  "exam-02": { selected: ["Normal saturation on room air"], detail: "98% on room air" },
  "history-02": { selected: ["No orthopnea"] }
});
const expectedNote = [
  "Shortness of breath / dyspnea",
  "Respiratory: Abrupt, over minutes to hours; tachypneic with accessory muscle use; normal saturation on room air (98% on room air).",
  "Cardiovascular: No orthopnea."
].join("\n");
assert.equal(presentation.worksheetNoteText(dyspnea, caseState), expectedNote,
  "the generic note matches the spec's byte-exact dyspnea example");
assert.equal(presentation.genericWorksheetNoteText(dyspnea, caseState), expectedNote);
assert.equal(presentation.worksheetProgressText(dyspnea, caseState), "2 of 10 sections filled");
assert.deepEqual(
  presentation.worksheetGroupFilled(dyspnea, caseState),
  [true, true, false, false, false, false, false, false, false, false],
  "group-filled flags follow group order"
);

// ---- grouping on the PSYH 530 scale and history sheets ------------------------------
const ciwaGroups = presentation.genericWorksheetGroups(ciwa);
assert.deepEqual(ciwaGroups.map((group) => group.title), ["Alcohol withdrawal"],
  "CIWA-Ar items form a single Alcohol withdrawal group");
assert.equal(ciwaGroups[0].entries.length, 11, "CIWA-Ar renders its 10 scale items plus the total/bands item");
const cowsGroups = presentation.genericWorksheetGroups(cows);
assert.deepEqual(cowsGroups.map((group) => group.title), ["Opioid withdrawal"],
  "COWS items form a single Opioid withdrawal group");
assert.equal(cowsGroups[0].entries.length, 12, "COWS renders its 11 scale items plus the total/bands item");
const substanceGroups = presentation.genericWorksheetGroups(substanceUse);
assert.deepEqual(
  substanceGroups.map((group) => group.title),
  ["Alcohol", "Opioids", "Stimulants", "Cannabis", "Tobacco", "Sedatives",
   "Consequences", "Treatment history", "Readiness"],
  "substance use history groups follow first appearance"
);
assert.equal(substanceGroups.reduce((n, group) => n + group.entries.length, 0), 41,
  "all 41 substance use history items are grouped");

// ---- byte-exact note: capacity worked example, tier 1 (blood draw refusal) ------------
// Selections and expected text from scratch/mse-worksheet/capacity-sheet-draft.md,
// section 3, Case A: the same four abilities pass at tier 1.
const capacityState = stateFor({
  "history-01": { selected: ["States one clear choice and stays with it"] },
  "exam-02": { selected: ["Low stakes: the outcome is similar whichever way the patient chooses"] },
  "exam-04": { selected: ["Tier 1 applies: awareness and assent (Drane standard 1)"] },
  "exam-09": { selected: ["Meets the required showing: the patient has capacity for this decision and the choice governs"] }
});
const capacityNote = [
  "Decision-Making Capacity and Informed Consent (Sliding Scale)",
  "Expressing a choice: States one clear choice and stays with it.",
  "Sliding scale: Low stakes: the outcome is similar whichever way the patient chooses; tier 1 applies: awareness and assent (Drane standard 1).",
  "Documentation: Meets the required showing: the patient has capacity for this decision and the choice governs."
].join("\n");
assert.equal(presentation.worksheetNoteText(capacity, capacityState), capacityNote,
  "the capacity worksheet reproduces the draft's tier-1 worked-example note byte-exact");
assert.equal(presentation.genericWorksheetNoteText(capacity, capacityState), capacityNote);
assert.equal(presentation.worksheetProgressText(capacity, capacityState), "3 of 7 sections filled");

// ---- empty sheet -> empty note -------------------------------------------------------
assert.equal(presentation.worksheetNoteText(dyspnea, new Map()), "", "an untouched sheet builds no note");
assert.equal(presentation.worksheetProgressText(dyspnea, new Map()), "0 of 10 sections filled");

// ---- detail-only item ------------------------------------------------------------------
const detailOnly = stateFor({ "history-08": { detail: "Fever to 39.4 last night" } });
assert.equal(
  presentation.worksheetNoteText(dyspnea, detailOnly),
  "Shortness of breath / dyspnea\nInfectious: Fever to 39.4 last night.",
  "a detail-only item renders its segment as the typed detail"
);
// A detail-only segment is never re-cased, even in a later position.
const detailLater = stateFor({
  "history-01": { selected: ["Abrupt, over minutes to hours"] },
  "exam-04": { detail: "Wheeze throughout" }
});
assert.equal(
  presentation.worksheetNoteText(dyspnea, detailLater),
  "Shortness of breath / dyspnea\nRespiratory: Abrupt, over minutes to hours; Wheeze throughout.",
  "a later detail-only segment keeps its typed capitalization"
);

// ---- single-select toggle through the shared toggle logic -------------------------------
const single = { multi: false };
assert.deepEqual(presentation.worksheetChipToggle(single, [], "Abrupt, over minutes to hours"),
  ["Abrupt, over minutes to hours"], "first tap selects");
assert.deepEqual(presentation.worksheetChipToggle(single, ["Abrupt, over minutes to hours"], "Gradual, over days to weeks"),
  ["Gradual, over days to weeks"], "tapping another option replaces the pick");
assert.deepEqual(presentation.worksheetChipToggle(single, ["Gradual, over days to weeks"], "Gradual, over days to weeks"),
  [], "tapping the picked option clears it");

// ---- generic worksheet markup -------------------------------------------------------------
const emptyHtml = presentation.worksheetHtml(dyspnea, new Map());
assert.equal((emptyHtml.match(/<section class="cs-worksheet-card" data-worksheet-group=/g) || []).length, 10,
  "one card per system group");
assert.equal((emptyHtml.match(/data-worksheet-chip=/g) || []).length,
  presentation.genericWorksheetItems(dyspnea).reduce((n, entry) => n + entry.options.length, 0),
  "one chip per option across all items");
assert.equal((emptyHtml.match(/data-worksheet-detail=/g) || []).length, 0,
  "no detail inputs while every item is untouched");
assert.equal((emptyHtml.match(/data-worksheet-add-detail=/g) || []).length, 30,
  "every untouched item offers an Add detail button");
assert.doesNotMatch(emptyHtml, /cheat-sheets-worksheet-normal/, "no Mark normal on generic sheets");
assert.doesNotMatch(emptyHtml, /cheat-sheets-worksheet-normal-all/, "no Mark all normal on generic sheets");
assert.match(emptyHtml, /data-action="cheat-sheets-worksheet-copy" disabled/, "Copy disabled when the note is empty");
assert.match(emptyHtml, /data-worksheet-progress[^>]*>0 of 10 sections filled</);
assert.match(emptyHtml, /<h1 class="cs-title">Shortness of breath \/ dyspnea<\/h1>/,
  "the generic worksheet header names the sheet");

const caseHtml = presentation.worksheetHtml(dyspnea, caseState);
assert.match(caseHtml, /data-worksheet-chip="exam-01" data-worksheet-field="0" data-value="Tachypneic with accessory muscle use" aria-pressed="true"/,
  "the picked chip renders pressed with its check state in markup");
assert.match(caseHtml, /✓ Tachypneic with accessory muscle use/, "selected chips carry a check mark, not color alone");
assert.match(caseHtml, /id="cheat-sheets-worksheet-output"[^>]*>[\s\S]*Respiratory: Abrupt, over minutes to hours;/,
  "the built note appears in the output textarea");
assert.equal((caseHtml.match(/data-worksheet-detail=/g) || []).length, 4,
  "detail inputs render only for the four touched items");

// ---- entry button on every sheet's detail --------------------------------------------
for (const sheet of sheets) {
  assert.match(presentation.sheetDetailHtml(sheet), /data-action="cheat-sheets-open-worksheet"/,
    `${sheet.id} detail offers Fill in worksheet`);
}

console.log("All generic worksheet tests passed.");
