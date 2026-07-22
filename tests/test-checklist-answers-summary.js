import assert from "node:assert/strict";
import { checklistAnswersSummary, checklistExamFindingsSummary, hasAssessedChecklistContent } from "../src/checklist/state.js";

const snapshot = {
  items: [
    { id: "gen_appearance", kind: "exam", workupTitle: "General", text: "General appearance", choices: ["Normal", "Abnormal", "Not assessed"] },
    { id: "lungs", kind: "exam", workupTitle: "Respiratory", text: "Lung auscultation", choices: ["Clear", "Crackles", "Not assessed"] },
    { id: "chest_pain", kind: "history", workupTitle: "Cardiovascular", text: "Chest pain today?", choices: ["No", "Yes"] }
  ]
};

// Unanswered items and items explicitly marked "Not assessed" carry no
// clinical information - they must not clutter the note-writing prompt.
{
  const answers = {
    gen_appearance: { selected: ["Normal"], note: "" },
    lungs: { selected: ["Not assessed"], note: "" }
    // chest_pain: left out entirely - never answered.
  };
  const summary = checklistAnswersSummary(snapshot, answers, []);
  assert.match(summary, /General appearance[\s\S]*Answer: Normal/);
  assert.doesNotMatch(summary, /No answer/i, "unanswered items must be omitted, not shown as 'No answer'");
  assert.doesNotMatch(summary, /Not assessed/i, "explicitly 'not assessed' items must be omitted rather than listed");
  assert.doesNotMatch(summary, /Lung auscultation/, "an item with no usable answer must not appear at all");
  assert.doesNotMatch(summary, /Chest pain today/, "an item nobody answered must not appear at all");
}

// A note alone (no selected choice) is still useful and must be kept.
{
  const answers = { lungs: { selected: [], note: "Faint wheeze on the right base." } };
  const summary = checklistAnswersSummary(snapshot, answers, []);
  assert.match(summary, /Lung auscultation\n {2}Answer: Faint wheeze on the right base\./);
}

// A "Not assessed" selection alongside a note keeps the note but drops the noise choice.
{
  const answers = { lungs: { selected: ["Not assessed"], note: "Deferred - patient asleep." } };
  const summary = checklistAnswersSummary(snapshot, answers, []);
  assert.match(summary, /Answer: Deferred - patient asleep\./);
  assert.doesNotMatch(summary, /Not assessed/i);
}

// If nothing on the checklist has been assessed, say so plainly instead of an empty block.
{
  assert.equal(checklistAnswersSummary(snapshot, {}, []), "No checklist items have been assessed yet.");
}

// Quick notes still appear even when every checklist item is unassessed.
{
  const quickNotes = [{ id: "n1", text: "Patient reports mild nausea.", createdAt: "2026-01-01T00:00:00.000Z" }];
  const summary = checklistAnswersSummary(snapshot, {}, quickNotes);
  assert.match(summary, /No checklist items have been assessed yet\.\n\nAdditional notes/);
  assert.match(summary, /- Patient reports mild nausea\./);
}

assert.equal(checklistAnswersSummary(null, {}, []), "No checklist has been built.");

const examSummary = checklistExamFindingsSummary(snapshot, {
  gen_appearance: { selected: ["Normal"], note: "" },
  chest_pain: { selected: ["Yes"], note: "" }
});
assert.match(examSummary, /General appearance[\s\S]*Answer: Normal/);
assert.doesNotMatch(examSummary, /Chest pain today/, "saving physical exam findings must not copy history answers into the admission field");

// hasAssessedChecklistContent - same "meaningful answer" rule, boolean form.
assert.equal(hasAssessedChecklistContent(snapshot, {}, []), false, "no answers and no quick notes means nothing assessed");
assert.equal(hasAssessedChecklistContent(snapshot, { lungs: { selected: ["Not assessed"], note: "" } }, []), false, "a bare 'Not assessed' selection alone does not count as assessed");
assert.equal(hasAssessedChecklistContent(snapshot, { gen_appearance: { selected: ["Normal"], note: "" } }, []), true, "a real selected choice counts as assessed");
assert.equal(hasAssessedChecklistContent(snapshot, { lungs: { selected: [], note: "Faint wheeze." } }, []), true, "a note alone counts as assessed");
assert.equal(hasAssessedChecklistContent(snapshot, {}, [{ id: "n1", text: "Nausea reported.", createdAt: "2026-01-01T00:00:00.000Z" }]), true, "a quick note alone counts as assessed even with zero checklist answers");
assert.equal(hasAssessedChecklistContent(null, {}, []), false);

console.log("Checklist answers summary tests passed");
