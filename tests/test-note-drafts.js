import assert from "node:assert/strict";
import {
  NOTE_DRAFT_SCHEMA,
  NOTE_TYPES,
  NOTE_TYPE_FIELDS,
  STUDENT_GUIDANCE,
  addDifferential,
  addPlanProblem,
  buildChecklistNoteCandidates,
  changeNoteDraftType,
  containsExcludedGuidanceLanguage,
  createNoteDraft,
  deselectChecklistFinding,
  deselectObjectiveBlock,
  editObjectiveBlock,
  editObjectiveGroup,
  editChecklistFinding,
  fieldsForNoteType,
  keepChecklistFinding,
  keepObjectiveBlock,
  normalizeNoteDraft,
  objectiveEditorGroups,
  objectiveGroupKeyFor,
  objectiveGroupRenderedText,
  refreshObjectiveGroup,
  removeObjectiveGroup,
  removeObjectiveGroupWithMemory,
  refreshChecklistFinding,
  refreshObjectiveBlock,
  reconcileChecklistFinding,
  reconcileObjectiveBlock,
  removeDifferential,
  removePlanProblem,
  renderFinalNote,
  renderFinalNotePlainText,
  renderFinalNoteHtml,
  reorderDifferentials,
  reorderPlanProblems,
  SECTION_VISIBILITY_KEYS,
  selectObjectiveBlock,
  selectChecklistFinding,
  setSectionVisibility,
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

// Completed checklist answers become chart-ready findings without copying the
// bedside questions into the note.
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
  assert.deepEqual(candidates.map(({ generatedText }) => generatedText), ["No · Denies pressure.", "None"]);
  let draft = createNoteDraft(NOTE_TYPES.PROGRESS, { ...options, id: "checklist_import" });
  draft = selectChecklistFinding(draft, candidates[0], { now: fixedNow });
  draft = selectChecklistFinding(draft, candidates[1], { now: fixedNow });
  draft = editChecklistFinding(draft, candidates[1].id, "No lower-extremity edema bilaterally.", { now: fixedNow });
  const rendered = renderFinalNote(draft);
  assert.match(rendered, /\*\*Subjective\*\*[\s\S]*No · Denies pressure/);
  assert.doesNotMatch(rendered, /Chest pain now\?|Lower-extremity edema:/);
  assert.match(rendered, /\*\*Physical Exam\*\*[\s\S]*No lower-extremity edema bilaterally/);
  const plain = renderFinalNotePlainText(draft);
  assert.match(plain, /^Subjective$/m);
  assert.doesNotMatch(plain, /\*\*/);
  draft = deselectChecklistFinding(draft, candidates[0].id, { now: fixedNow });
  assert.doesNotMatch(renderFinalNote(draft), /Chest pain now/);
  assert.match(renderFinalNote(draft), /No lower-extremity edema/);
}

// Switching the selected note format changes the available sections while
// preserving shared content and the closest matching patient narrative.
{
  let draft = createNoteDraft(NOTE_TYPES.H_AND_P, { ...options, id: "switch_type" });
  draft = updateNoteSection(draft, "one_liner", "Synthetic one-liner", { now: fixedNow });
  draft = updateNoteSection(draft, "history_of_present_illness", "Chest discomfort improved.", { now: fixedNow });
  draft = changeNoteDraftType(draft, NOTE_TYPES.PROGRESS, { now: fixedNow });
  assert.equal(draft.noteType, NOTE_TYPES.PROGRESS);
  assert.equal(draft.sections.one_liner.deidentifiedText, "Synthetic one-liner");
  assert.equal(draft.sections.patient_report.deidentifiedText, "Chest discomfort improved.");
  assert.equal(draft.sections.chief_complaint, undefined);
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
    state: "synced",
    kind: "",
    noteGroupKey: "",
    noteGroupLabel: "",
    noteLabel: "",
    noteDetail: "",
    noteRange: "",
    noteMean: "",
    needsFreeText: false
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
  assert.match(note, /\*\*Diagnostics\*\*[\s\S]*- Obtain a chest radiograph\./);
  assert.match(note, /\*\*Therapeutics\*\*[\s\S]*- Titrate oxygen/);
  assert.doesNotMatch(note, /Diagnostic plan —/);
  assert.doesNotMatch(note, /Therapeutic plan —/);
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

// Objective selections group in the final note: one Vitals line, one line
// per laboratory panel family, everything else in selection order.
{
  let draft = createNoteDraft(NOTE_TYPES.H_AND_P, { ...options, id: "objective_grouping" });
  const select = (selectionId, fields) => {
    draft = selectObjectiveBlock(draft, {
      selectionId,
      sourceFingerprint: `fp:${selectionId}`,
      generatedText: `${selectionId} verbose insertion text`,
      ...fields
    }, { now: fixedNow });
  };
  select("vital:hr", { kind: "vital_sign", noteGroupKey: "vitals", noteGroupLabel: "Vitals", noteLabel: "HR", noteDetail: "75 bpm (59–77)" });
  select("vital:bp", { kind: "vital_sign", noteGroupKey: "vitals", noteGroupLabel: "Vitals", noteLabel: "BP", noteDetail: "128/78 mmHg" });
  select("lab:wbc", { kind: "laboratory_result", noteGroupKey: "lab:cbc", noteGroupLabel: "CBC", noteLabel: "WBC", noteDetail: "8.8 K/uL" });
  select("lab:bun", { kind: "laboratory_result", noteGroupKey: "lab:metabolic", noteGroupLabel: "Basic metabolic panel", noteLabel: "BUN", noteDetail: "28 mg/dL [H] (23 → 28)" });
  select("lab:alt", { kind: "laboratory_result", noteGroupKey: "lab:hepatic", noteGroupLabel: "Hepatic function panel", noteLabel: "ALT", noteDetail: "45 U/L [H]" });
  select("report:cta", { kind: "laboratory_result", generatedText: "CTA Head-Neck: report filed — review the full report in Results Review" });

  const note = renderFinalNote(draft);
  const objective = note.split("**Objective**")[1].split("**Assessment**")[0];
  assert.match(objective, /\*\*Vitals:\*\* HR 75 bpm \(59–77\); BP 128\/78 mmHg/);
  assert.match(objective, /\*\*CBC:\*\* WBC 8\.8 K\/uL/);
  assert.match(objective, /\*\*Comprehensive metabolic panel:\*\* BUN 28 mg\/dL \[H\] \(23 → 28\); ALT 45 U\/L \[H\]/);
  assert.match(objective, /CTA Head-Neck: report filed/);
  assert.ok(objective.indexOf("**Vitals:**") < objective.indexOf("**CBC:**"), "vitals render before labs");

  const html = renderFinalNoteHtml(draft);
  assert.match(html, /<h2>Objective<\/h2>/);
  assert.match(html, /<table class="note-vitals">/);
  assert.match(html, /<th scope="row">HR<\/th><td>75 bpm \(59–77\)<\/td>/);
  assert.match(html, /<h3>Comprehensive metabolic panel<\/h3>/);
  assert.match(html, /<th scope="row">BUN<\/th><td>28 mg\/dL \[H\] \(23 → 28\)<\/td>/);
  assert.match(html, /<p>CTA Head-Neck: report filed/);
  assert.doesNotMatch(html, /&lt;table/);

  const plain = renderFinalNotePlainText(draft);
  assert.match(plain, /Vitals: HR 75 bpm/);
  assert.doesNotMatch(plain, /\*\*/);
}

// Edited objective blocks keep the student's wording inside their group.
{
  let draft = createNoteDraft(NOTE_TYPES.H_AND_P, { ...options, id: "objective_grouping_edited" });
  draft = selectObjectiveBlock(draft, {
    selectionId: "vital:hr",
    sourceFingerprint: "fp1",
    generatedText: "Heart Rate (Monitored): latest 75 bpm",
    kind: "vital_sign",
    noteGroupKey: "vitals",
    noteGroupLabel: "Vitals",
    noteLabel: "HR",
    noteDetail: "75 bpm (59–77)"
  }, { now: fixedNow });
  draft = editObjectiveBlock(draft, "vital:hr", "HR 75, bradycardic overnight per telemetry", { now: fixedNow });
  const note = renderFinalNote(draft);
  assert.match(note, /\*\*Vitals:\*\* HR 75, bradycardic overnight per telemetry/);
}

// The HPI must not repeat the one-liner.
{
  let draft = createNoteDraft(NOTE_TYPES.H_AND_P, { ...options, id: "oneliner_dedupe" });
  draft = updateNoteSection(draft, "one_liner", "68-year-old man with acute left hemispheric stroke.", { now: fixedNow });
  draft = updateNoteSection(draft, "history_of_present_illness",
    "68-year-old man with acute left hemispheric stroke. He presented with aphasia and right-sided weakness. Symptoms began this morning.",
    { now: fixedNow });
  let note = renderFinalNote(draft);
  const hpi = note.split("**HPI**")[1].split("**Review of Systems**")[0];
  assert.doesNotMatch(hpi, /68-year-old man with acute left hemispheric stroke\./);
  assert.match(hpi, /He presented with aphasia/);

  // A standalone one-liner paragraph inside a longer HPI is also dropped.
  draft = updateNoteSection(draft, "history_of_present_illness",
    "68-year-old man with acute left hemispheric stroke.\n\nHe presented with aphasia and right-sided weakness.",
    { now: fixedNow });
  note = renderFinalNote(draft);
  const hpi2 = note.split("**HPI**")[1].split("**Review of Systems**")[0];
  assert.doesNotMatch(hpi2, /68-year-old man with acute left hemispheric stroke\./);
  assert.match(hpi2, /He presented with aphasia/);

  // An HPI that does not repeat the one-liner is left untouched.
  draft = updateNoteSection(draft, "history_of_present_illness",
    "Patient reports sudden onset aphasia and right-sided weakness this morning while eating breakfast.",
    { now: fixedNow });
  note = renderFinalNote(draft);
  const hpi3 = note.split("**HPI**")[1].split("**Review of Systems**")[0];
  assert.match(hpi3, /sudden onset aphasia/);
}

// Rich HTML renders headings, lists, bold labels, and differential tables.
{
  let draft = createNoteDraft(NOTE_TYPES.H_AND_P, { ...options, id: "rich_html" });
  draft = updateNoteSection(draft, "chief_complaint", "Aphasia and weakness", { now: fixedNow });
  draft = addPlanProblem(draft, { now: fixedNow });
  const problemId = draft.problems[0].id;
  draft = updatePlanProblem(draft, problemId, {
    problem: { deidentifiedText: "Acute ischemic stroke", lastModified: fixedNow },
    etiologyStatus: "unknown",
    diagnosticPlan: { deidentifiedText: "MRI brain", lastModified: fixedNow }
  }, { now: fixedNow });
  draft = addDifferential(draft, problemId, { now: fixedNow });
  const diffId = draft.problems[0].differentials[0].id;
  draft = updateDifferential(draft, problemId, diffId, {
    diagnosis: { deidentifiedText: "Hemorrhage", lastModified: fixedNow },
    cluesFor: { deidentifiedText: "On anticoagulation", lastModified: fixedNow },
    cluesAgainst: { deidentifiedText: "CT negative", lastModified: fixedNow }
  }, { now: fixedNow });
  const html = renderFinalNoteHtml(draft);
  assert.match(html, /<div class="rich-note">/);
  assert.match(html, /<section class="note-section"><h2>Chief Complaint<\/h2><p>Aphasia and weakness<\/p><\/section>/);
  assert.match(html, /<h2>Plan<\/h2>/);
  assert.match(html, /<table><thead><tr><th>Differential<\/th><th>Clues for this differential<\/th><th>Clues against this differential<\/th><\/tr><\/thead>/);
  assert.match(html, /<td>Hemorrhage<\/td><td>On anticoagulation<\/td><td>CT negative<\/td>/);
  assert.match(html, /<ul><li>MRI brain<\/li><\/ul>/);
  assert.doesNotMatch(html, /Diagnostic plan —/);
  // Note content is escaped: no markup injection.
  draft = updateNoteSection(draft, "chief_complaint", "<script>alert(1)</script>", { now: fixedNow });
  const evil = renderFinalNoteHtml(draft);
  assert.doesNotMatch(evil, /<script>/);
  assert.match(evil, /&lt;script&gt;/);
}

// Optional sections toggle individually; core sections can never be toggled.
{
  const draft = createNoteDraft(NOTE_TYPES.H_AND_P, { ...options, id: "hp_optional", patientId: "patient_1" });
  const withDiet = updateNoteSection(draft, "diet_and_exercise", "Balanced diet, walks daily", { now: fixedNow });
  const withInsOuts = updateClosingSection(withDiet, "ins_outs", "In 2.1 L, out 1.8 L", { now: fixedNow });
  const markdown = renderFinalNote(withInsOuts);
  assert.match(markdown, /Diet and Exercise/);
  assert.match(markdown, /Balanced diet, walks daily/);
  assert.match(markdown, /Ins\/Outs/);
  assert.match(markdown, /In 2\.1 L, out 1\.8 L/);

  const dietOff = setSectionVisibility(withInsOuts, "diet_and_exercise", false, { now: fixedNow });
  const dietOffMarkdown = renderFinalNote(dietOff);
  assert.doesNotMatch(dietOffMarkdown, /Diet and Exercise/);
  assert.doesNotMatch(dietOffMarkdown, /Balanced diet/);
  // Toggling is durable through normalization and the other optional
  // sections are unaffected.
  assert.equal(normalizeNoteDraft(dietOff, { now: fixedNow }).sectionVisibility.diet_and_exercise, false);
  assert.match(dietOffMarkdown, /Ins\/Outs/);

  const insOutsOff = setSectionVisibility(withInsOuts, "ins_outs", false, { now: fixedNow });
  assert.doesNotMatch(renderFinalNote(insOutsOff), /Ins\/Outs/);

  // Unknown keys — including every core section — are rejected, never
  // silently stored.
  for (const core of ["assessment", "plan", "objective", "one_liner"]) {
    assert.throws(() => setSectionVisibility(withInsOuts, core, false, { now: fixedNow }), /Unknown note section/);
  }
  // Plain-text output honors the same visibility rules.
  assert.doesNotMatch(renderFinalNotePlainText(dietOff), /Diet and Exercise/);
}

{
  // Objective editor groups: vitals collapse to one group, labs by family.
  const mkBlock = (selectionId, noteGroupKey, editedText) => ({
    selectionId,
    sourceFingerprint: "fp",
    generatedText: editedText,
    editedText,
    state: "synced",
    kind: "vital_sign",
    noteGroupKey,
    noteGroupLabel: noteGroupKey === "vitals" ? "Vital signs" : "CBC",
    noteLabel: "",
    noteDetail: ""
  });
  const draft = normalizeNoteDraft({
    noteType: "progress",
    objective: {
      selectedBlocks: [
        mkBlock("v1", "vitals", "BP 120/80"),
        mkBlock("v2", "vitals", "HR 72"),
        mkBlock("v3", "vitals", "SpO2 96%"),
        mkBlock("l1", "lab:cbc", "WBC 12.3"),
        mkBlock("l2", "lab:cbc", "Hgb 9.1")
      ]
    }
  }, { now: fixedNow });
  const groups = objectiveEditorGroups(draft);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, "vitals");
  assert.equal(groups[0].label, "Vital signs");
  assert.equal(groups[0].blocks.length, 3);
  assert.equal(groups[1].key, "lab:cbc");
  assert.equal(groups[1].blocks.length, 2);
  assert.equal(objectiveGroupKeyFor({ noteGroupKey: "vitals" }), "vitals");
  assert.equal(objectiveGroupKeyFor({ noteGroupKey: "lab:cmp" }), "lab:cmp");
  assert.equal(objectiveGroupKeyFor({ noteGroupKey: "pending-labs" }), "pending-labs");
  assert.equal(objectiveGroupKeyFor({ noteGroupKey: "", selectionId: "abc" }), "abc");

  // Pending labs group together under their own label and always sort last.
  const pendingDraft = normalizeNoteDraft({
    noteType: "progress",
    objective: {
      selectedBlocks: [
        mkBlock("p1", "pending-labs", "Factor V Leiden Mutation: In Process"),
        mkBlock("v1", "vitals", "BP 120/80"),
        mkBlock("l1", "lab:cbc", "WBC 12.3"),
        mkBlock("p2", "pending-labs", "Magnesium: Pending")
      ]
    }
  }, { now: fixedNow });
  const pendingGroups = objectiveEditorGroups(pendingDraft);
  assert.equal(pendingGroups.length, 3);
  assert.equal(pendingGroups[2].key, "pending-labs", "pending labs must render last");
  assert.equal(pendingGroups[2].label, "Pending labs");
  assert.equal(pendingGroups[2].blocks.length, 2);

  // Editing a group's combined text stores a group-level override: the
  // student's words replace the generated lines, but every member block
  // keeps its identity (no collapsing, no deleted selections).
  const edited = editObjectiveGroup(draft, "vitals", "BP 120/80; HR 72; SpO2 96% on RA", { now: fixedNow });
  const vitalsBlocks = edited.objective.selectedBlocks.filter((b) => b.noteGroupKey === "vitals");
  assert.equal(vitalsBlocks.length, 3, "group edit must not delete member blocks");
  assert.deepEqual(
    vitalsBlocks.map((b) => b.selectionId).sort(),
    ["v1", "v2", "v3"],
    "member identities survive a group edit"
  );
  assert.equal(edited.objective.groupEdits.vitals, "BP 120/80; HR 72; SpO2 96% on RA");
  assert.equal(edited.objective.selectedBlocks.length, 5, "no blocks added or removed");
  // The edited group still renders as one group.
  assert.equal(objectiveEditorGroups(edited).length, 2);
  // The final note shows the student's words for that group.
  assert.match(renderFinalNotePlainText(edited), /BP 120\/80; HR 72; SpO2 96% on RA/);
  assert.doesNotMatch(renderFinalNotePlainText(edited), /BP 120\/80\n/);
  // Saving untouched text stores no override.
  const untouched = editObjectiveGroup(draft, "vitals", objectiveGroupRenderedText(draft, "vitals"), { now: fixedNow });
  assert.deepEqual(untouched.objective.groupEdits, {}, "untouched text must not create an override");
  // Adding a member drops the override: it described the old membership.
  const added = selectObjectiveBlock(edited, {
    selectionId: "v4", sourceFingerprint: "fp", generatedText: "Temp 98.6 F",
    kind: "vital_sign", noteGroupKey: "vitals", noteLabel: "Temp", noteDetail: "98.6 F"
  }, { now: fixedNow });
  assert.deepEqual(added.objective.groupEdits, {}, "adding a member clears the group override");
  assert.equal(added.objective.selectedBlocks.filter((b) => b.noteGroupKey === "vitals").length, 4);
  // Removing a member drops the override too.
  const deselected = deselectObjectiveBlock(edited, "v3", { now: fixedNow });
  assert.deepEqual(deselected.objective.groupEdits, {}, "removing a member clears the group override");
  assert.equal(deselected.objective.selectedBlocks.filter((b) => b.noteGroupKey === "vitals").length, 2);
  // Clearing the group's text removes the group, like the × button.
  const cleared = editObjectiveGroup(draft, "vitals", "   ", { now: fixedNow });
  assert.equal(cleared.objective.selectedBlocks.filter((b) => b.noteGroupKey === "vitals").length, 0);
  assert.equal(cleared.objective.selectedBlocks.length, 2); // only the labs remain

  // Removing a group drops every member block.
  const removed = removeObjectiveGroup(draft, "lab:cbc", { now: fixedNow });
  assert.equal(removed.objective.selectedBlocks.length, 3);
  assert.ok(removed.objective.selectedBlocks.every((b) => b.noteGroupKey === "vitals"));

  // Removing with memory records each member id so auto-include stays off.
  const removedMem = removeObjectiveGroupWithMemory(draft, "vitals", { now: fixedNow });
  assert.equal(removedMem.objective.selectedBlocks.length, 2);
  assert.deepEqual([...removedMem.objective.deselectedIds].sort(), ["v1", "v2", "v3"]);

  // Refreshing a group refreshes only its stale members.
  const stale = {
    ...draft,
    objective: {
      ...draft.objective,
      selectedBlocks: draft.objective.selectedBlocks.map((b) =>
        b.selectionId === "v1"
          ? { ...b, state: "stale", pendingSourceFingerprint: "fp2", pendingGeneratedText: "BP 122/81" }
          : b
      )
    }
  };
  const refreshed = refreshObjectiveGroup(stale, "vitals", { now: fixedNow });
  const v1 = refreshed.objective.selectedBlocks.find((b) => b.selectionId === "v1");
  assert.equal(v1.editedText, "BP 122/81");
  assert.equal(v1.state, "synced");
}

console.log("note draft model tests passed");
