import assert from "node:assert/strict";
import {
  NOTE_DRAFT_SCHEMA,
  NOTE_TYPES,
  NOTE_TYPE_FIELDS,
  STUDENT_GUIDANCE,
  addDifferential,
  addPlanProblem,
  buildChecklistNoteCandidates,
  containsExcludedGuidanceLanguage,
  createNoteDraft,
  deselectChecklistFinding,
  deselectObjectiveBlock,
  editObjectiveBlock,
  editChecklistFinding,
  fieldsForNoteType,
  keepChecklistFinding,
  keepObjectiveBlock,
  normalizeNoteDraft,
  refreshChecklistFinding,
  refreshObjectiveBlock,
  reconcileChecklistFinding,
  reconcileObjectiveBlock,
  removeDifferential,
  removePlanProblem,
  renderFinalNote,
  renderFinalNotePlainText,
  reorderDifferentials,
  reorderPlanProblems,
  selectObjectiveBlock,
  selectChecklistFinding,
  studentGuidance,
  updateAssessment,
  updateClosingSection,
  updateDifferential,
  updateManualObjective,
  updateNoteSection,
  updatePlanProblem
} from "../src/note-drafts/index.js";

const FIXED_TIME = "2026-09-21T12:00:00.000Z";
const fixedNow = () => FIXED_TIME;
let nextId = 0;
const fixedId = (prefix) => `${prefix}_${++nextId}`;
const options = { now: fixedNow, idFactory: fixedId };

// Each note type exposes only its relevant, optional fields. The one-liner is
// always shown but never blocks saving.
{
  const hpFields = fieldsForNoteType(NOTE_TYPES.H_AND_P);
  const progressFields = fieldsForNoteType(NOTE_TYPES.PROGRESS);
  assert.deepEqual(hpFields.map(({ id }) => id), [
    "one_liner",
    "chief_complaint",
    "history_of_present_illness",
    "medications",
    "allergies",
    "past_medical_history",
    "past_surgical_history",
    "family_history",
    "social_history",
    "diet_and_exercise",
    "other"
  ]);
  assert.deepEqual(progressFields.map(({ id }) => id), [
    "one_liner",
    "interval_events",
    "patient_report",
    "nursing_report",
    "pertinent_symptoms",
    "other"
  ]);
  assert.equal(hpFields[0].alwaysVisible, true);
  assert.equal(progressFields[0].alwaysVisible, true);
  assert.ok(Object.values(NOTE_TYPE_FIELDS).flat().every((field) => field.required === false));
  assert.throws(() => fieldsForNoteType("unknown"), /Unsupported note type/);
}

// Blank drafts are valid, contain every field for the selected type, and do
// not fabricate output for omitted optional information.
{
  const hp = createNoteDraft(NOTE_TYPES.H_AND_P, { ...options, id: "hp_blank", patientId: "patient_1" });
  assert.equal(hp.schema, NOTE_DRAFT_SCHEMA);
  assert.equal(hp.id, "hp_blank");
  assert.equal(hp.patientId, "patient_1");
  assert.equal(hp.sections.one_liner.deidentifiedText, "");
  assert.equal(hp.sections.other.deidentifiedText, "");
  assert.deepEqual(hp.objective.selectedBlocks, []);
  assert.deepEqual(hp.checklistFindings.selectedBlocks, []);
  assert.deepEqual(hp.problems, []);
  assert.equal(renderFinalNote(hp), "");

  const progress = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "progress_blank" });
  assert.equal(renderFinalNote(progress), "");
  assert.throws(() => updateNoteSection(progress, "past_medical_history", "Should not be accepted", { now: fixedNow }), /not available/);
}

// Only completed checklist questions and performed exam maneuvers are offered
// for deliberate import. Imported lines remain independently editable.
{
  const checklistPatient = {
    days: [{
      id: "day_checklist",
      label: "Hospital day 2",
      checklistSnapshot: { items: [
        { id: "chest_pain", kind: "history", text: "Chest pain now?", workupTitle: "ACS", choices: ["No", "Yes"] },
        { id: "edema", kind: "exam", text: "Lower-extremity edema", workupTitle: "Heart failure", choices: ["None", "Present"] },
        { id: "jvp", kind: "exam", text: "JVP", workupTitle: "Heart failure", choices: ["Normal", "Elevated"] },
        { id: "syncope", kind: "history", text: "Syncope?", workupTitle: "ACS", choices: ["No", "Yes"] }
      ] },
      answers: {
        chest_pain: { selected: ["No"], note: "Denies pressure." },
        edema: { selected: ["None"], note: "" },
        jvp: { selected: ["Not assessed"], note: "" },
        syncope: { selected: [], note: "" }
      }
    }]
  };
  const candidates = buildChecklistNoteCandidates(checklistPatient, "day_checklist");
  assert.deepEqual(candidates.map(({ question }) => question), ["Chest pain now?", "Lower-extremity edema"]);
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "checklist_import" });
  draft = selectChecklistFinding(draft, candidates[0], { now: fixedNow });
  draft = selectChecklistFinding(draft, candidates[1], { now: fixedNow });
  draft = editChecklistFinding(draft, candidates[1].id, "No lower-extremity edema bilaterally.", { now: fixedNow });
  const rendered = renderFinalNote(draft);
  assert.match(rendered, /\*\*Focused History from Checklist\*\*[\s\S]*Chest pain now\?[^\n]*No/);
  assert.match(rendered, /\*\*Physical Exam\*\*[\s\S]*No lower-extremity edema bilaterally/);
  const plain = renderFinalNotePlainText(draft);
  assert.match(plain, /^Focused History from Checklist/m);
  assert.doesNotMatch(plain, /\*\*/);
  draft = deselectChecklistFinding(draft, candidates[0].id, { now: fixedNow });
  assert.doesNotMatch(renderFinalNote(draft), /Chest pain now/);
  assert.match(renderFinalNote(draft), /No lower-extremity edema/);
}

// Student edits to imported checklist findings are preserved when the source
// answer changes, with explicit refresh or keep actions.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "checklist_stale" });
  draft = selectChecklistFinding(draft, {
    selectionId: "checklist:day_2:edema",
    sourceFingerprint: "v1",
    kind: "exam",
    question: "Lower-extremity edema",
    generatedText: "Lower-extremity edema: None"
  }, { now: fixedNow });
  draft = editChecklistFinding(draft, "checklist:day_2:edema", "No lower-extremity edema bilaterally.", { now: fixedNow });
  draft = reconcileChecklistFinding(draft, {
    selectionId: "checklist:day_2:edema",
    sourceFingerprint: "v2",
    kind: "exam",
    question: "Lower-extremity edema",
    generatedText: "Lower-extremity edema: Trace"
  }, { now: fixedNow });
  assert.equal(draft.checklistFindings.selectedBlocks[0].state, "stale");
  assert.equal(draft.checklistFindings.selectedBlocks[0].editedText, "No lower-extremity edema bilaterally.");
  assert.equal(draft.checklistFindings.selectedBlocks[0].pendingGeneratedText, "Lower-extremity edema: Trace");

  const kept = keepChecklistFinding(draft, "checklist:day_2:edema", { now: fixedNow });
  assert.equal(kept.checklistFindings.selectedBlocks[0].state, "edited");
  assert.equal(kept.checklistFindings.selectedBlocks[0].sourceFingerprint, "v2");

  const staleAgain = reconcileChecklistFinding(kept, {
    selectionId: "checklist:day_2:edema",
    sourceFingerprint: "v3",
    kind: "exam",
    question: "Lower-extremity edema",
    generatedText: "Lower-extremity edema: 1+"
  }, { now: fixedNow });
  const refreshed = refreshChecklistFinding(staleAgain, "checklist:day_2:edema", { now: fixedNow });
  assert.equal(refreshed.checklistFindings.selectedBlocks[0].state, "synced");
  assert.equal(refreshed.checklistFindings.selectedBlocks[0].editedText, "Lower-extremity edema: 1+");
}

// Persisted text is explicitly de-identified, keeps timestamps, and strips
// warning snippets while retaining actionable warning metadata.
{
  const normalized = normalizeNoteDraft({
    id: "saved_hp",
    patientId: "patient_2",
    noteType: NOTE_TYPES.H_AND_P,
    sections: {
      one_liner: {
        deidentifiedText: "Adult on hospital day 2 with improving dyspnea.",
        residualWarnings: [{ severity: "high", type: "MRN", reason: "Identifier-like value", snippet: "123456" }],
        createdAt: "2026-09-20T10:00:00.000Z",
        updatedAt: "2026-09-20T10:30:00.000Z"
      }
    },
    createdAt: "2026-09-20T09:00:00.000Z",
    updatedAt: "2026-09-20T11:00:00.000Z"
  }, options);
  assert.deepEqual(normalized.sections.one_liner.residualWarnings, [{
    severity: "high",
    type: "MRN",
    reason: "Identifier-like value"
  }]);
  assert.equal(normalized.sections.one_liner.createdAt, "2026-09-20T10:00:00.000Z");
  assert.equal(normalized.sections.one_liner.updatedAt, "2026-09-20T10:30:00.000Z");
  assert.equal(normalized.createdAt, "2026-09-20T09:00:00.000Z");
  assert.equal(normalized.updatedAt, "2026-09-20T11:00:00.000Z");
}

// Objective selections remain isolated from manual Objective text and from
// unrelated selections. Deselecting never erases the student's own prose.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "objective_isolation" });
  draft = updateManualObjective(draft, "Manual exam: mild bibasilar crackles.", { now: fixedNow });
  draft = selectObjectiveBlock(draft, {
    selectionId: "lab:wbc",
    sourceFingerprint: "wbc-v1",
    generatedText: "WBC 14.2 → 11.0 K/uL."
  }, { now: fixedNow });
  draft = selectObjectiveBlock(draft, {
    selectionId: "result:ct-head",
    sourceFingerprint: "ct-v1",
    generatedText: "CT Head: no acute intracranial abnormality."
  }, { now: fixedNow });
  assert.deepEqual(draft.objective.selectedBlocks.map(({ selectionId }) => selectionId), ["lab:wbc", "result:ct-head"]);

  draft = deselectObjectiveBlock(draft, "lab:wbc", { now: fixedNow });
  assert.equal(draft.objective.manual.deidentifiedText, "Manual exam: mild bibasilar crackles.");
  assert.deepEqual(draft.objective.selectedBlocks.map(({ selectionId }) => selectionId), ["result:ct-head"]);
}

// Unedited source-linked content may update predictably. Student-edited text
// instead becomes stale and is never silently overwritten.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "objective_stale" });
  draft = selectObjectiveBlock(draft, {
    selectionId: "lab:wbc",
    sourceFingerprint: "v1",
    generatedText: "WBC 14.2 K/uL."
  }, { now: fixedNow });

  draft = reconcileObjectiveBlock(draft, {
    selectionId: "lab:wbc",
    sourceFingerprint: "v2",
    generatedText: "WBC 14.2 → 11.0 K/uL."
  }, { now: fixedNow });
  assert.deepEqual(draft.objective.selectedBlocks[0], {
    selectionId: "lab:wbc",
    sourceFingerprint: "v2",
    generatedText: "WBC 14.2 → 11.0 K/uL.",
    editedText: "WBC 14.2 → 11.0 K/uL.",
    state: "synced"
  });

  draft = editObjectiveBlock(draft, "lab:wbc", "WBC improving to 11.0 K/uL.", { now: fixedNow });
  assert.equal(draft.objective.selectedBlocks[0].state, "edited");
  draft = reconcileObjectiveBlock(draft, {
    selectionId: "lab:wbc",
    sourceFingerprint: "v3",
    generatedText: "WBC 14.2 → 11.0 → 9.8 K/uL."
  }, { now: fixedNow });
  const stale = draft.objective.selectedBlocks[0];
  assert.equal(stale.state, "stale");
  assert.equal(stale.editedText, "WBC improving to 11.0 K/uL.", "reconciliation must preserve the student's edit");
  assert.equal(stale.generatedText, "WBC 14.2 → 11.0 K/uL.", "the prior populated baseline remains available for review");
  assert.equal(stale.pendingGeneratedText, "WBC 14.2 → 11.0 → 9.8 K/uL.");

  const kept = keepObjectiveBlock(draft, "lab:wbc", { now: fixedNow });
  assert.equal(kept.objective.selectedBlocks[0].state, "edited");
  assert.equal(kept.objective.selectedBlocks[0].editedText, "WBC improving to 11.0 K/uL.");
  assert.equal(kept.objective.selectedBlocks[0].sourceFingerprint, "v3");
  assert.equal("pendingGeneratedText" in kept.objective.selectedBlocks[0], false);

  const staleAgain = reconcileObjectiveBlock(kept, {
    selectionId: "lab:wbc",
    sourceFingerprint: "v4",
    generatedText: "WBC 9.0 K/uL."
  }, { now: fixedNow });
  const refreshed = refreshObjectiveBlock(staleAgain, "lab:wbc", { now: fixedNow });
  assert.equal(refreshed.objective.selectedBlocks[0].state, "synced");
  assert.equal(refreshed.objective.selectedBlocks[0].editedText, "WBC 9.0 K/uL.");
  assert.equal(refreshed.objective.selectedBlocks[0].sourceFingerprint, "v4");
}

// Problem cards and differential rows can be added, edited, reordered, and
// removed without requiring optional clues.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "plan_builder" });
  draft = addPlanProblem(draft, {
    id: "problem_respiratory",
    problem: "Acute hypoxemic respiratory failure",
    keyContext: "Oxygen requirement is improving.",
    etiologyStatus: "unknown",
    diagnosticPlan: "Review the chest radiograph.",
    therapeuticPlan: "Wean oxygen as tolerated."
  }, options);
  draft = addPlanProblem(draft, {
    id: "problem_hypertension",
    problem: "Hypertension",
    etiologyStatus: "known",
    knownEtiology: "Chronic essential hypertension",
    therapeuticPlan: "Continue the documented home regimen."
  }, options);
  draft = addDifferential(draft, "problem_respiratory", {
    id: "diff_edema",
    diagnosis: "Cardiogenic pulmonary edema",
    cluesFor: "Bilateral opacities and elevated filling pressures.",
    cluesAgainst: ""
  }, options);
  draft = addDifferential(draft, "problem_respiratory", {
    id: "diff_pneumonia",
    diagnosis: "Bacterial pneumonia",
    cluesFor: "Focal opacity.",
    cluesAgainst: "No fever."
  }, options);
  assert.equal(draft.problems[0].differentials[0].cluesAgainst.deidentifiedText, "", "optional clues may remain blank");

  draft = updateDifferential(draft, "problem_respiratory", "diff_edema", { cluesAgainst: "No peripheral edema." }, { now: fixedNow });
  draft = reorderDifferentials(draft, "problem_respiratory", ["diff_pneumonia", "diff_edema"], { now: fixedNow });
  assert.deepEqual(draft.problems[0].differentials.map(({ id }) => id), ["diff_pneumonia", "diff_edema"]);
  draft = removeDifferential(draft, "problem_respiratory", "diff_pneumonia", { now: fixedNow });
  assert.deepEqual(draft.problems[0].differentials.map(({ id }) => id), ["diff_edema"]);

  draft = updatePlanProblem(draft, "problem_hypertension", { problem: "Chronic hypertension", etiologyStatus: "known" }, { now: fixedNow });
  draft = reorderPlanProblems(draft, ["problem_hypertension", "problem_respiratory"], { now: fixedNow });
  assert.deepEqual(draft.problems.map(({ id }) => id), ["problem_hypertension", "problem_respiratory"]);
  draft = removePlanProblem(draft, "problem_hypertension", { now: fixedNow });
  assert.deepEqual(draft.problems.map(({ id }) => id), ["problem_respiratory"]);
}

// The final renderer follows the prompt's problem-oriented shape: headings,
// Key context, a three-column differential table, and separate action bullets.
{
  let draft = createNoteDraft(NOTE_TYPES.H_AND_P, { ...options, id: "render_hp" });
  draft = updateNoteSection(draft, "one_liner", "Adult on hospital day 1 admitted with hypoxemia.", { now: fixedNow });
  draft = updateNoteSection(draft, "history_of_present_illness", "Dyspnea began before admission and remains improved today.", { now: fixedNow });
  draft = updateNoteSection(draft, "past_medical_history", "HFpEF.", { now: fixedNow });
  draft = selectObjectiveBlock(draft, {
    selectionId: "vitals:oxygen",
    sourceFingerprint: "oxygen-v1",
    generatedText: "SpO2 92–98% on 2 L/min nasal cannula."
  }, { now: fixedNow });
  draft = updateManualObjective(draft, "Exam: bibasilar crackles.", { now: fixedNow });
  draft = updateAssessment(draft, "Adult with improving acute hypoxemia on hospital day 1.", { now: fixedNow });
  draft = addPlanProblem(draft, {
    id: "problem_hypoxemia",
    problem: "Acute hypoxemia",
    keyContext: "Currently on 2 L/min nasal cannula.",
    etiologyStatus: "unknown",
    diagnosticPlan: "Obtain a chest radiograph.",
    therapeuticPlan: "Titrate oxygen to the documented target."
  }, options);
  draft = addDifferential(draft, "problem_hypoxemia", {
    id: "diff_edema",
    diagnosis: "Pulmonary edema",
    cluesFor: "Bibasilar crackles.",
    cluesAgainst: ""
  }, options);
  draft = updateClosingSection(draft, "disposition", "Home when oxygen is no longer required.", { now: fixedNow });

  const note = renderFinalNote(draft);
  assert.match(note, /^\*\*One-Liner\*\*/);
  assert.match(note, /\*\*HPI\*\*[\s\S]*Dyspnea began/);
  assert.match(note, /\*\*Relevant History\*\*[\s\S]*Past medical history/);
  assert.match(note, /\*\*Objective\*\*[\s\S]*SpO2 92–98%[\s\S]*bibasilar crackles/);
  assert.match(note, /\| Differential \| Clues for this differential \| Clues against this differential \|/);
  assert.match(note, /\| Pulmonary edema \| Bibasilar crackles\. \|  \|/);
  assert.match(note, /- Diagnostic plan — Obtain a chest radiograph\./);
  assert.match(note, /- Therapeutic plan — Titrate oxygen/);
  assert.match(note, /\*\*Disposition\*\*[\s\S]*Home when oxygen/);
  assert.doesNotMatch(note, /not documented|unknown etiology|No acute events overnight/, "the renderer must not fabricate optional content");
}

// Progress rendering keeps patient and nursing reports distinct within
// Subjective and includes no H&P-only field.
{
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "render_progress" });
  draft = updateNoteSection(draft, "patient_report", "Dyspnea is improved since yesterday.", { now: fixedNow });
  draft = updateNoteSection(draft, "nursing_report", "No desaturation observed during ambulation.", { now: fixedNow });
  const note = renderFinalNote(draft);
  assert.match(note, /\*\*Subjective\*\*/);
  assert.match(note, /\*\*Patient report:\*\*/);
  assert.match(note, /\*\*Nursing report:\*\*/);
  assert.doesNotMatch(note, /Chief Complaint|Past medical history/);
}

// Curated help contains only concise student-facing documentation guidance.
{
  assert.match(studentGuidance("hp", "history_of_present_illness"), /chronologically/i);
  assert.match(studentGuidance("progress", "nursing_report"), /nursing staff/i);
  assert.match(studentGuidance("progress", "clues_against"), /may be blank/i);
  const allGuidance = Object.values(STUDENT_GUIDANCE).flatMap((group) => Object.values(group));
  assert.ok(allGuidance.every((entry) => !containsExcludedGuidanceLanguage(entry)));
  assert.ok(allGuidance.every((entry) => !/@[a-z]/i.test(entry)), "student help must not expose prompt variables");
  assert.ok(allGuidance.every((entry) => !/token|persona|closure table|ledger/i.test(entry)), "student help must not expose internal prompt machinery");
}

console.log("note draft model tests passed");
