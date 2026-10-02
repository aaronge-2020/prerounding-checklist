import assert from "node:assert/strict";
import {
  addDraftCustomSection,
  addPlanProblem,
  applyTemplateToDraft,
  changeNoteDraftType,
  createNoteDraft,
  createNoteTemplate,
  getLayout,
  hiddenSections,
  hideDraftSection,
  moveDraftSection,
  moveDraftSectionBy,
  normalizeDraftText,
  normalizeLayout,
  normalizeNoteDraft,
  normalizeNoteTemplates,
  orderedVisibleSections,
  removeDraftCustomSection,
  removeNoteTemplate,
  renderFinalNotePlainText,
  restoreDraftSection,
  updateNoteSection
} from "../src/note-drafts/index.js";

const HP_HEAD = ["one-liner", "chief-complaint", "history-of-present-illness", "review-of-systems", "relevant-history", "diet-and-exercise"];
const PROGRESS_HEAD = ["one-liner", "subjective"];
const TAIL = ["physical-exam", "objective", "assessment", "plan", "fen", "ins-outs", "vte-prophylaxis", "code-status", "disposition", "medication-regimens", "medications"];

// Default layouts mirror the historical hardcoded editor order.
const hp = createNoteDraft("hp", {});
assert.deepEqual(hp.layout.order, [...HP_HEAD, ...TAIL]);
const progress = createNoteDraft("progress", {});
assert.deepEqual(progress.layout.order, [...PROGRESS_HEAD, ...TAIL]);

// normalizeLayout repairs unknown ids, appends missing ones, dedupes.
const repaired = normalizeLayout({ order: ["plan", "bogus", "plan", "one-liner"], hidden: ["bogus", "plan"], custom: [] }, "progress");
assert.ok(!repaired.order.includes("bogus"), "unknown ids dropped");
assert.ok(!repaired.hidden.includes("bogus"), "unknown hidden ids dropped");
assert.equal(repaired.order[0], "plan");
assert.deepEqual(repaired.hidden, ["plan"]);
assert.equal(new Set(repaired.order).size, repaired.order.length, "order deduped");
assert.equal(repaired.order.length, PROGRESS_HEAD.length + TAIL.length, "missing ids appended");

// H&P-only sections are dropped for progress notes.
const crossType = normalizeLayout({ order: ["subjective", "chief-complaint"], custom: [] }, "progress");
assert.ok(!crossType.order.includes("chief-complaint"), "H&P section dropped for progress");

// moveDraftSection / moveDraftSectionBy reorder; out-of-range clamps.
const moved = moveDraftSection(progress, "plan", 0);
assert.equal(moved.layout.order[0], "plan");
assert.equal(moved.layout.order[1], "one-liner");
assert.equal(moveDraftSectionBy(progress, "plan", -99).layout.order[0], "plan", "clamps to start");
assert.equal(moveDraftSectionBy(progress, "one-liner", 99).layout.order.at(-1), "one-liner", "clamps to end");
assert.equal(moveDraftSection(progress, "missing", 0), progress, "unknown id returns draft unchanged");

// hideDraftSection / restoreDraftSection control editor + final-note visibility.
const hidden = hideDraftSection(progress, "medications");
assert.deepEqual(hidden.layout.hidden, ["medications"]);
assert.ok(!orderedVisibleSections(hidden).some((section) => section.id === "medications"));
assert.equal(hideDraftSection(hidden, "medications"), hidden, "hiding twice is a no-op");
const restored = restoreDraftSection(hidden, "medications");
assert.deepEqual(restored.layout.hidden, []);
assert.ok(orderedVisibleSections(restored).some((section) => section.id === "medications"));

// Custom sections: add, write text, render in order, remove.
const { draft: withCustom, sectionId } = addDraftCustomSection(progress, "Lines and Tubes");
assert.ok(sectionId.startsWith("custom_"), "custom id namespaced");
assert.equal(withCustom.layout.order.at(-1), sectionId, "custom appended at end");
assert.equal(addDraftCustomSection(progress, "   ").sectionId, "", "blank label rejected");
let customDraft = updateNoteSection(withCustom, sectionId, "Left IJ placed.");
assert.equal(customDraft.sections[sectionId].deidentifiedText, "Left IJ placed.");
const visible = orderedVisibleSections(customDraft);
assert.equal(visible.at(-1).id, sectionId);
assert.equal(visible.at(-1).label, "Lines and Tubes");
assert.equal(visible.at(-1).custom, true);
const removed = removeDraftCustomSection(customDraft, sectionId);
assert.ok(!removed.layout.order.includes(sectionId), "custom removed from order");
assert.ok(!Object.hasOwn(removed.sections, sectionId), "custom text removed too");
assert.equal(removeDraftCustomSection(progress, "plan"), progress, "core sections are not removable");

// changeNoteDraftType keeps custom sections and rebuilds the default order.
const hpCustom = addDraftCustomSection(createNoteDraft("hp", {}), "Lines and Tubes");
const withCustomText = updateNoteSection(hpCustom.draft, hpCustom.sectionId, "Left IJ placed.");
const switched = changeNoteDraftType(withCustomText, "progress");
assert.deepEqual(switched.layout.order.slice(0, 2), PROGRESS_HEAD);
assert.ok(switched.layout.order.includes(hpCustom.sectionId), "custom survives type switch");
assert.equal(switched.sections[hpCustom.sectionId].deidentifiedText, "Left IJ placed.", "custom text survives type switch");

// Templates: create, normalize, apply, delete.
const template = createNoteTemplate({ name: "ICU layout", noteType: "progress", layout: moved.layout });
assert.ok(template, "template created");
assert.equal(template.name, "ICU layout");
assert.deepEqual(template.layout.order, moved.layout.order);
assert.equal(createNoteTemplate({ name: "   " }), null, "blank name rejected");
const applied = applyTemplateToDraft(progress, template);
assert.deepEqual(applied.layout.order, moved.layout.order, "template order applied");
assert.equal(applyTemplateToDraft(hp, template), hp, "cross-type template ignored");
const templates = normalizeNoteTemplates([template, template, null, { name: "" }]);
assert.equal(templates.length, 1, "normalize dedupes and drops junk");
assert.equal(removeNoteTemplate(templates, template.id).length, 0, "template removed");
assert.equal(removeNoteTemplate(templates, "missing").length, 1, "unknown id is a no-op");

// hiddenSections exposes labels for the restore UI.
const hiddenLabels = hiddenSections(hidden, (id) => ({ medications: "Medications" }[id] || id));
assert.deepEqual(hiddenLabels, [{ id: "medications", label: "Medications" }]);

// Final note follows the layout: reorder, hide, custom sections.
let note = createNoteDraft("progress", {});
note = updateNoteSection(note, "one_liner", "65yo M with SOB");
note = updateNoteSection(note, "interval_events", "Resting comfortably.");
note = addPlanProblem(note, { title: "Pneumonia" });
const added = addDraftCustomSection(note, "Lines and Tubes");
note = updateNoteSection(added.draft, added.sectionId, "Left IJ placed.");
note = moveDraftSection(note, "plan", 1);
note = hideDraftSection(note, "medications");
const text = renderFinalNotePlainText(note);
const planIdx = text.indexOf("Plan");
const subjectiveIdx = text.indexOf("Subjective");
assert.ok(planIdx > 0 && planIdx < subjectiveIdx, "reordered plan precedes subjective in final note");
assert.ok(text.indexOf("Lines and Tubes") > 0, "custom section appears in final note");
assert.ok(!text.includes("Medications"), "hidden section excluded from final note");

// A fresh draft keeps the historical default final-note order.
let fresh = createNoteDraft("progress", {});
fresh = updateNoteSection(fresh, "one_liner", "65yo M with SOB");
fresh = updateNoteSection(fresh, "interval_events", "ok");
fresh = { ...fresh, assessment: normalizeDraftText("Improving", {}) };
fresh = addPlanProblem(fresh, { title: "Pneumonia" });
const freshText = renderFinalNotePlainText(fresh);
let lastIdx = -1;
for (const heading of ["One-Liner", "Subjective", "Assessment", "Plan"]) {
  const idx = freshText.indexOf(heading);
  assert.ok(idx > lastIdx, `${heading} keeps default position`);
  lastIdx = idx;
}

// Layout survives a normalize round-trip (persistence shape).
const roundTripped = normalizeNoteDraft(JSON.parse(JSON.stringify(note)));
assert.deepEqual(roundTripped.layout.order, note.layout.order, "layout order survives persistence");
assert.deepEqual(roundTripped.layout.hidden, note.layout.hidden, "layout hidden survives persistence");
assert.equal(getLayout(roundTripped).custom.at(-1).label, "Lines and Tubes", "custom labels survive persistence");

console.log("note layout model tests passed");
