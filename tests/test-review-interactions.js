import assert from "node:assert/strict";
import { createReviewPresentation } from "../src/ui/review/presentation.js";
import { createReviewController } from "../src/ui/review/controller.js";
import { parsePrimaryTeamNote } from "../src/patient-context/primary-team-note-parser.js";
import { renderFinalNotePlainText } from "../src/note-drafts/render.js";

// Regression coverage for the compact review sheet interactions:
// default-on vitals/medications, durable deselection (checkbox and scaffold
// remove paths), optional-only section toggles, and lab-family collapse.
// Runs the real controller + presentation in Node with stubbed DOM deps;
// browser-only painting is covered by test-review-data-browser.js.

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

globalThis.document = {
  createElement: () => ({
    set innerHTML(value) { this._html = value; },
    content: { querySelector: () => null }
  })
};

const patient = {
  id: "interaction_patient",
  displayLabel: "Test Patient",
  days: [{
    id: "day_one",
    date: "2026-09-23",
    label: "HD1",
    createdAt: "2026-09-23T06:00:00.000Z",
    primaryTeamNote: parsePrimaryTeamNote(`Assessment and Plan
#1. Sepsis secondary to pneumonia
Patient improving on antibiotics. Likely bacterial CAP.
- Continue ceftriaxone
- Repeat chest x-ray tomorrow`, "progress"),
    sourceCaptures: [
      {
        id: "labs_one",
        sourceKind: "laboratory_results",
        label: "Morning labs",
        deidentifiedText: `Labs\n@ 09/23/26 0600\nWBC: 14.2 K/uL; ref 4.0-11.0; flag H\nCreatinine: 1.6 mg/dL; ref 0.6-1.3; flag H\nSodium: 139 mmol/L; ref 135-145`
      },
      {
        id: "vitals_one",
        sourceKind: "vital_signs",
        label: "Vitals",
        deidentifiedText: `Vitals\n@ 09/23/26 0600: HR 98; BP 118/72; Temp 38.2; SpO2 94`
      },
      {
        id: "meds_one",
        sourceKind: "medication_activity",
        label: "MAR",
        deidentifiedText: `Medications\n[Scheduled Medications] ceftriaxone \u2014 2 g; q24h; IV; Day 1 | 0600`
      }
    ]
  }]
};

const reviewContent = { innerHTML: "", querySelector: () => null };
const app = {
  noteDraftSessions: new Map(),
  reviewPacketId: "day_one",
  reviewCategory: "all",
  reviewSearchQuery: "",
  reviewDifferenceSelectionId: ""
};
const controller = createReviewController({
  app,
  active: () => patient,
  byId: (id) => (id === "reviewContent" ? reviewContent : { innerHTML: "" }),
  presentation: createReviewPresentation({ escapeHtml, icon: () => "" }),
  patientRequiredMessage: () => "",
  persistVault: async () => {},
  render: () => {},
  setStatus: () => {},
  copyText: async () => {},
  downloadText: () => {}
});

const fakeTarget = ({ action, dataset = {}, checked = false, matchesSel = [], value = "" }) => ({
  dataset: { action, ...dataset },
  checked,
  value,
  matches: (selector) => matchesSel.includes(selector),
  closest: (selector) => (selector === "[data-action]" ? { dataset: { action, ...dataset } } : null)
});

const sessionDraft = () => app.noteDraftSessions.get([...app.noteDraftSessions.keys()][0]);
// Draft for the currently selected packet (sessionDraft() only sees the first
// session, which goes stale once the test switches packets).
const currentDraft = () => app.noteDraftSessions.get(String(app.reviewPacketId || "admission")) || sessionDraft();

controller.render();
let draft = sessionDraft();
const selectedKinds = new Set(draft.objective.selectedBlocks.map((block) => block.noteGroupKey));
assert.ok(selectedKinds.has("vitals"), "vitals are auto-selected by default");
assert.ok(selectedKinds.has("medications"), "medications are auto-selected by default");
assert.match(reviewContent.innerHTML, /data-objective-selection-id="[^"]*"[^>]*checked|checked[^>]*data-objective-selection-id/, "default-on rows render checked");

// Optional closing sections get toggles; core sections never do.
assert.match(reviewContent.innerHTML, /data-section-visibility="vte_prophylaxis"/, "VTE prophylaxis has a visibility toggle");
assert.match(reviewContent.innerHTML, /data-section-visibility="code_status"/, "code status has a visibility toggle");
assert.match(reviewContent.innerHTML, /data-section-visibility="fen"/, "FEN has a visibility toggle");
assert.doesNotMatch(reviewContent.innerHTML, /data-section-visibility="assessment"/, "core Assessment has no visibility toggle");
assert.doesNotMatch(reviewContent.innerHTML, /data-section-visibility="plan"/, "core Plan has no visibility toggle");
assert.doesNotMatch(reviewContent.innerHTML, /data-section-visibility="objective"/, "core Objective has no visibility toggle");

// Combined "Assessment and Plan" seeds the draft assessment through the parser.
assert.match(reviewContent.innerHTML, /Sepsis secondary to pneumonia/, "combined A/P seeds the draft assessment");

// Unchecking a default-on vital remembers the choice across re-renders.
const vitalBlock = draft.objective.selectedBlocks.find((block) => block.noteGroupKey === "vitals");
controller.change(fakeTarget({
  dataset: { objectiveSelectionId: vitalBlock.selectionId },
  checked: false,
  matchesSel: ["[data-objective-selection-id]"]
}));
draft = sessionDraft();
assert.ok(!draft.objective.selectedBlocks.some((block) => block.selectionId === vitalBlock.selectionId), "uncheck removes the vital block");
assert.ok((draft.objective.deselectedIds || []).includes(vitalBlock.selectionId), "uncheck is remembered in deselectedIds");
controller.render();
draft = sessionDraft();
assert.ok(!draft.objective.selectedBlocks.some((block) => block.selectionId === vitalBlock.selectionId), "remembered deselection survives re-render");

// Removing a medication through the scaffold also remembers the choice.
const medBlock = draft.objective.selectedBlocks.find((block) => block.noteGroupKey === "medications");
controller.click(fakeTarget({ action: "remove-objective-selection", dataset: { selectionId: medBlock.selectionId } }));
draft = sessionDraft();
assert.ok(!draft.objective.selectedBlocks.some((block) => block.selectionId === medBlock.selectionId), "scaffold remove drops the medication");
controller.render();
draft = sessionDraft();
assert.ok(!draft.objective.selectedBlocks.some((block) => block.selectionId === medBlock.selectionId), "scaffold-removed medication stays removed after re-render");

// Optional section toggle flips visibility state.
controller.change(fakeTarget({
  dataset: { sectionVisibility: "vte_prophylaxis" },
  checked: false,
  matchesSel: ["[data-section-visibility]"]
}));
assert.equal(sessionDraft().sectionVisibility?.vte_prophylaxis, false, "VTE toggle off is recorded");

// Lab families collapse and expand with no search query present.
const familyKey = reviewContent.innerHTML.match(/data-family="(lab:[^"]+)"/)?.[1];
assert.ok(familyKey, "a lab family toggle is rendered");
const collapsedPattern = (key) => new RegExp(`data-family="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*aria-expanded="false"`);
controller.click(fakeTarget({ action: "toggle-lab-family", dataset: { family: familyKey } }));
controller.render();
assert.match(reviewContent.innerHTML, collapsedPattern(familyKey), "lab family collapses on toggle");
controller.click(fakeTarget({ action: "toggle-lab-family", dataset: { family: familyKey } }));
controller.render();
assert.doesNotMatch(reviewContent.innerHTML, collapsedPattern(familyKey), "lab family expands on second toggle");

// Ins/Outs is an optional closing section on every note type.
assert.match(reviewContent.innerHTML, /data-section-visibility="ins_outs"/, "Ins/Outs has a visibility toggle");

// The admission packet opens an H&P draft, where Diet and exercise is the one
// non-core field with its own toggle.
controller.open("admission");
controller.render();
assert.match(reviewContent.innerHTML, /data-section-visibility="diet_and_exercise"/, "Diet and exercise has a visibility toggle on the H&P");
assert.doesNotMatch(reviewContent.innerHTML, /data-section-visibility="chief_complaint"/, "core H&P fields stay toggle-free");
controller.input(fakeTarget({
  dataset: { draftSection: "diet_and_exercise" },
  matchesSel: ["[data-draft-section]"],
  value: "Balanced diet, walks daily"
}));
controller.render();
assert.match(reviewContent.innerHTML, /Balanced diet, walks daily/, "diet text reaches the editor");
assert.match(renderFinalNotePlainText(currentDraft()), /Balanced diet, walks daily/, "diet text reaches the final note");
controller.change(fakeTarget({
  dataset: { sectionVisibility: "diet_and_exercise" },
  checked: false,
  matchesSel: ["[data-section-visibility]"]
}));
assert.doesNotMatch(renderFinalNotePlainText(currentDraft()), /Diet and Exercise/, "toggling diet off removes it from the final note");

console.log("review interaction tests passed");
