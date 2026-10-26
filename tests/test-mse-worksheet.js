// Tests for the MSE fillable worksheet's pure parts: the note-text builder
// and the worksheet markup in src/ui/cheat-sheets/presentation.js.
// Answers are session-only state: Map<itemId, { selected: Set, note }>.
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

// ---- fixture sheet ---------------------------------------------------------
const fixture = {
  id: "fixture-sheet",
  title: "Fixture",
  aliases: [],
  history: [],
  exam: [
    { id: "exam-01", system: "Appearance", maneuver: "Appearance: grooming and hygiene; clothing.",
      findings: ["Grooming and hygiene", "Clothing (type, appropriateness)", "Dentition"] },
    { id: "exam-02", system: "Behavior", maneuver: "Behavior: posture; eye contact.",
      findings: ["Posture", "Eye contact", "Gait"] },
    { id: "exam-03", system: "Speech", maneuver: "Speech: rate; volume.",
      findings: ["Rate: pressured", "Volume"] }
  ],
  reviewNeeded: { whyMissing: 3, howMissing: 3 }
};

// ---- note text format ------------------------------------------------------
// Empty state: nothing filled -> empty text, Copy stays disabled.
assert.equal(presentation.worksheetNoteText(fixture, new Map()), "");
assert.equal(presentation.worksheetNoteText(fixture, null), "");

// Selections join with "; " in findings data order, not tap order.
const tapOrder = new Map([
  ["exam-01", { selected: new Set(["Dentition", "Grooming and hygiene"]), note: "" }]
]);
assert.equal(
  presentation.worksheetNoteText(fixture, tapOrder),
  "Mental Status Examination\nAppearance: Grooming and hygiene; Dentition"
);

// A detail follows the selections after ". " and gains one trailing period;
// a detail that already ends with a period is left alone. Both match the
// spec example's first line.
const withDetail = new Map([
  ["exam-01", { selected: new Set(["Clothing (type, appropriateness)", "Grooming and hygiene"]), note: "Patient was disheveled" }],
  ["exam-02", { selected: new Set(["Posture", "Eye contact"]), note: "" }]
]);
assert.equal(
  presentation.worksheetNoteText(fixture, withDetail),
  "Mental Status Examination\n" +
    "Appearance: Grooming and hygiene; Clothing (type, appropriateness). Patient was disheveled.\n" +
    "Behavior: Posture; Eye contact"
);
const detailWithPeriod = new Map([
  ["exam-01", { selected: new Set(["Grooming and hygiene"]), note: "Patient was disheveled." }]
]);
assert.equal(
  presentation.worksheetNoteText(fixture, detailWithPeriod),
  "Mental Status Examination\nAppearance: Grooming and hygiene. Patient was disheveled."
);

// Detail-only section: the line is "Domain: detail"; unfilled middle
// sections are omitted and order follows the sheet.
const detailOnly = new Map([
  ["exam-03", { selected: new Set(), note: "  Mostly mute  " }],
  ["exam-01", { selected: new Set(["Dentition"]), note: "" }]
]);
assert.equal(
  presentation.worksheetNoteText(fixture, detailOnly),
  "Mental Status Examination\nAppearance: Dentition\nSpeech: Mostly mute."
);

// Plain-object state (not a Map) and array selections also work.
assert.equal(
  presentation.worksheetNoteText(fixture, { "exam-02": { selected: ["Gait"], note: "" } }),
  "Mental Status Examination\nBehavior: Gait"
);

// Progress text counts a section with only a detail as filled.
assert.equal(presentation.worksheetProgressText(fixture, detailOnly), "2 of 3 sections filled");
assert.equal(presentation.worksheetProgressText(fixture, new Map()), "0 of 3 sections filled");

// ---- worksheet markup ------------------------------------------------------
// One chip per finding, aria-pressed mirrors the state, selected chips
// carry a check mark (state never shown by color alone).
const html = presentation.worksheetHtml(fixture, withDetail);
const chipCount = (html.match(/data-worksheet-chip=/g) || []).length;
assert.equal(chipCount, 8, "one chip per finding across the three fixture items");
assert.match(html, /data-worksheet-chip="exam-01" data-value="Grooming and hygiene" aria-pressed="true"/);
assert.match(html, /data-worksheet-chip="exam-01" data-value="Dentition" aria-pressed="false"/);
assert.match(html, /\u2713 Grooming and hygiene/);
assert.match(html, /data-worksheet-progress[^>]*>2 of 3 sections filled</);
assert.match(html, /id="cheat-sheets-worksheet-output"[^>]*>[\s\S]*Appearance: Grooming and hygiene/);
assert.match(html, /data-worksheet-note="exam-02"/);
assert.match(html, />Detail \(optional\)</);

// Empty state: no chips pressed, Copy disabled, empty output.
const emptyHtml = presentation.worksheetHtml(fixture, new Map());
assert.doesNotMatch(emptyHtml, /aria-pressed="true"/);
assert.match(emptyHtml, /data-action="cheat-sheets-worksheet-copy" disabled/);

// ---- entry button gating ---------------------------------------------------
// The "Fill in worksheet" button appears only on sheets flagged worksheet.
const flagged = { ...fixture, worksheet: true };
assert.match(presentation.sheetDetailHtml(flagged), /data-action="cheat-sheets-open-worksheet"/);
assert.match(presentation.sheetDetailHtml(flagged), /Fill in worksheet/);
assert.doesNotMatch(presentation.sheetDetailHtml(fixture), /cheat-sheets-open-worksheet/);

// ---- the real MSE sheet -----------------------------------------------------
const bundle = JSON.parse(readFileSync(join(root, "src", "data", "cheat-sheets.json"), "utf8"));
const mse = bundle.sheets.find((sheet) => sheet.id === "mental-status-examination");
assert.ok(mse, "MSE sheet exists");
assert.equal(mse.worksheet, true, "MSE sheet carries the worksheet flag");
assert.equal(bundle.sheets.filter((sheet) => sheet.worksheet).length, 1, "only the MSE sheet is flagged");
const totalFindings = mse.exam.reduce((n, item) => n + (item.findings || []).length, 0);
const mseHtml = presentation.worksheetHtml(mse, new Map());
assert.equal((mseHtml.match(/data-worksheet-chip=/g) || []).length, totalFindings);
const mseState = new Map([
  ["exam-10", { selected: new Set(["Memory"]), note: "" }],
  ["exam-01", { selected: new Set(["Grooming and hygiene"]), note: "" }]
]);
assert.equal(
  presentation.worksheetNoteText(mse, mseState),
  "Mental Status Examination\nAppearance: Grooming and hygiene\nCognition: Memory"
);

console.log("All MSE worksheet tests passed.");
