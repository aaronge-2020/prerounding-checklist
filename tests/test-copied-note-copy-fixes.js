import assert from "node:assert/strict";
import {
  NOTE_TYPES,
  addPlanProblem,
  createNoteDraft,
  renderFinalNotePlainText,
  sanitizeProblemTitle,
  selectObjectiveBlock,
  updateAssessment,
  updateNoteSection
} from "../src/note-drafts/index.js";
import { joinValueUnit, labNoteItem, vitalNoteItem } from "../src/review-data/compact-summary.js";

// Copied-note copy defenses (U3, U12–U16). All assertions run against the pure
// renderer, so they cover both "Copy for Epic" plain text and the .txt
// download, which share renderFinalNotePlainText.

const options = { patientId: "test-patient", hospitalDayId: "day_1" };
const now = () => 1700000000000;

// U3: copied plan bullets must not carry "Diagnostic plan —" /
// "Therapeutic plan —" prefixes.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "u3_plan_prefixes" });
  draft = addPlanProblem(draft, {
    problem: "Hyperkalemia",
    diagnosticPlan: "Repeat BMP in 4h\nCheck ECG",
    therapeuticPlan: "Calcium gluconate 1g IV"
  }, { now });
  const plain = renderFinalNotePlainText(draft);
  assert.doesNotMatch(plain, /Diagnostic plan —/);
  assert.doesNotMatch(plain, /Therapeutic plan —/);
  assert.match(plain, /- Repeat BMP in 4h/);
  assert.match(plain, /- Check ECG/);
  assert.match(plain, /- Calcium gluconate 1g IV/);
  // The dx/tx distinction is kept via short group subheads when both exist.
  assert.match(plain, /Diagnostics/);
  assert.match(plain, /Therapeutics/);
}

// U3b: a problem with only one plan kind gets plain bullets, no subheads.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "u3_single_kind" });
  draft = addPlanProblem(draft, { problem: "AKI", diagnosticPlan: "Renal ultrasound" }, { now });
  const plain = renderFinalNotePlainText(draft);
  assert.match(plain, /- Renal ultrasound/);
  assert.doesNotMatch(plain, /Diagnostics/);
  assert.doesNotMatch(plain, /Therapeutics/);
}

// U12: an Assessment that merely repeats the plan's problem titles is dropped
// from the copy — the Plan section carries the titles with content.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "u12_dupe" });
  draft = addPlanProblem(draft, { problem: "Hyperkalemia" }, { now });
  draft = addPlanProblem(draft, { problem: "AKI" }, { now });
  draft = updateAssessment(draft, "1. Hyperkalemia\n2. AKI", { now });
  const plain = renderFinalNotePlainText(draft);
  assert.doesNotMatch(plain, /^Assessment$/m);
  assert.match(plain, /^Plan$/m);
}

// U12b: real assessment prose is never dropped.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "u12_prose" });
  draft = addPlanProblem(draft, { problem: "Hyperkalemia" }, { now });
  draft = updateAssessment(draft, "Hyperkalemia likely from AKI on CKD; trending down after fluids.", { now });
  const plain = renderFinalNotePlainText(draft);
  assert.match(plain, /^Assessment$/m);
  assert.match(plain, /trending down after fluids/);
}

// U13: leaked source-note header lines are stripped from Subjective.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "u13_headers" });
  draft = updateNoteSection(draft, "other", "PROGRESS NOTE - HD 2\n[NAME], 54F\nPatient resting comfortably.", { now });
  const plain = renderFinalNotePlainText(draft);
  assert.doesNotMatch(plain, /PROGRESS NOTE/);
  assert.doesNotMatch(plain, /\[NAME\], 54F/);
  assert.match(plain, /Patient resting comfortably/);
}

// U13b: genuine HPI content that merely mentions admission is kept.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "u13_kept" });
  draft = updateNoteSection(draft, "patient_report", "Chest pain started after admission to the floor.", { now });
  const plain = renderFinalNotePlainText(draft);
  assert.match(plain, /Chest pain started after admission to the floor/);
}

// U14: the copied one-liner drops the source "CC:" label.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "u14_cc" });
  draft = updateNoteSection(draft, "one_liner", "CC: 54F with chest pain", { now });
  const plain = renderFinalNotePlainText(draft);
  assert.match(plain, /^One-Liner$/m);
  assert.doesNotMatch(plain, /CC:/);
  assert.match(plain, /54F with chest pain/);
}

// U15: PRN comparison em-dash artifacts are repaired in copied medications.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "u15_meds" });
  draft = selectObjectiveBlock(draft, {
    selectionId: "med:phos",
    sourceFingerprint: "med-v1",
    generatedText: "sodium phosphate",
    noteLabel: "sodium phosphate",
    noteDetail: "phosphorus <= — 2.5 mg/dL",
    noteGroupKey: "medications",
    noteGroupLabel: "Medications"
  }, { now });
  const plain = renderFinalNotePlainText(draft);
  assert.doesNotMatch(plain, /<= —/);
  assert.match(plain, /phosphorus <= 2\.5 mg\/dL/);
}

// U16: unit joining follows clinical convention — no space before % or °.
assert.equal(joinValueUnit("97", "%"), "97%");
assert.equal(joinValueUnit("37.3", "°C"), "37.3°C");
assert.equal(joinValueUnit("122", "bpm"), "122 bpm");
assert.equal(joinValueUnit("6.8", "g/dL"), "6.8 g/dL");
assert.equal(joinValueUnit("", "%"), "%");
assert.equal(joinValueUnit("97", ""), "97");

// U16b: vital and lab note items inherit the same spacing.
{
  const vital = vitalNoteItem({ name: "SpO2", latest: { value: "97", unit: "%" } });
  assert.equal(vital.detail, "97%");
  const lab = labNoteItem({ name: "Hemoglobin", value: "6.8", unit: "g/dL" });
  assert.equal(lab.detail, "6.8 g/dL");
  const temp = vitalNoteItem({ name: "Temperature", latest: { value: "37.3", unit: "°C" } });
  assert.equal(temp.detail, "37.3°C");
}

// U9: a raw markdown A&P table pasted as a problem title must never keep raw
// pipes or the header text — the title becomes the first data row's first cell.
{
  assert.equal(
    sanitizeProblemTitle("| Problem | Plan |\n|---|---|\n| Hyperkalemia | fluids |"),
    "Hyperkalemia"
  );
  assert.equal(
    sanitizeProblemTitle("|---|---|\n| AKI | IVF |"),
    "AKI"
  );
  assert.equal(sanitizeProblemTitle("Hyperkalemia"), "Hyperkalemia");
  assert.equal(sanitizeProblemTitle("AKI | on CKD"), "AKI on CKD");
  assert.equal(sanitizeProblemTitle("|---|"), "");
  assert.doesNotMatch(sanitizeProblemTitle("| Problem | Plan |\n|---|---|\n| Hyperkalemia |"), /\|/);
}

console.log("copied-note copy defenses (U3, U9, U12–U16): all assertions passed");
