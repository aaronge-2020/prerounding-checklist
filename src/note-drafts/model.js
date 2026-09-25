import { sanitizeResidualWarningMetadata } from "../patient-context/review.js";

export const NOTE_DRAFT_SCHEMA = "student_note_draft_v2";
export const NOTE_TYPES = Object.freeze({
  H_AND_P: "hp",
  PROGRESS: "progress"
});

const sharedOneLiner = Object.freeze({
  id: "one_liner",
  label: "One-liner",
  alwaysVisible: true,
  required: false
});

export const NOTE_TYPE_FIELDS = Object.freeze({
  [NOTE_TYPES.H_AND_P]: Object.freeze([
    sharedOneLiner,
    Object.freeze({ id: "chief_complaint", label: "Chief complaint", required: false }),
    Object.freeze({ id: "history_of_present_illness", label: "History of present illness", required: false }),
    Object.freeze({ id: "medications", label: "Medications", required: false }),
    Object.freeze({ id: "allergies", label: "Allergies", required: false }),
    Object.freeze({ id: "past_medical_history", label: "Past medical history", required: false }),
    Object.freeze({ id: "past_surgical_history", label: "Past surgical history", required: false }),
    Object.freeze({ id: "family_history", label: "Family history", required: false }),
    Object.freeze({ id: "social_history", label: "Social history", required: false }),
    Object.freeze({ id: "diet_and_exercise", label: "Diet and exercise", required: false }),
    Object.freeze({ id: "other", label: "Other relevant history", required: false })
  ]),
  [NOTE_TYPES.PROGRESS]: Object.freeze([
    sharedOneLiner,
    Object.freeze({ id: "interval_events", label: "Events", required: false }),
    Object.freeze({ id: "patient_report", label: "Patient report", required: false }),
    Object.freeze({ id: "nursing_report", label: "Nursing report", required: false }),
    Object.freeze({ id: "pertinent_symptoms", label: "Pertinent symptoms", required: false }),
    Object.freeze({ id: "other", label: "Other subjective information", required: false })
  ])
});

export const CLOSING_SECTION_FIELDS = Object.freeze([
  Object.freeze({ id: "fen", label: "FEN", required: false }),
  Object.freeze({ id: "ins_outs", label: "Ins/Outs", required: false }),
  Object.freeze({ id: "vte_prophylaxis", label: "VTE Prophylaxis", required: false }),
  Object.freeze({ id: "code_status", label: "Code Status", required: false }),
  Object.freeze({ id: "disposition", label: "Disposition", required: false }),
  Object.freeze({ id: "medication_regimens", label: "Medication Regimens", required: false })
]);

const OBJECTIVE_BLOCK_STATES = new Set(["synced", "edited", "stale"]);
const ETIOLOGY_STATUSES = new Set(["known", "unknown"]);

// Toggleable optional sections in the note editor. Every note needs the
// core SOAP/H&P sections, so they are never toggleable — only these optional
// closing sections can be switched on/off for the final note.
export const SECTION_VISIBILITY_KEYS = Object.freeze([
  Object.freeze({ id: "diet_and_exercise", label: "Diet and exercise" }),
  Object.freeze({ id: "fen", label: "FEN" }),
  Object.freeze({ id: "ins_outs", label: "Ins/Outs" }),
  Object.freeze({ id: "vte_prophylaxis", label: "VTE Prophylaxis" }),
  Object.freeze({ id: "code_status", label: "Code Status" }),
  Object.freeze({ id: "disposition", label: "Disposition" }),
  Object.freeze({ id: "medication_regimens", label: "Medication Regimens" })
]);

export function normalizeSectionVisibility(value) {
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    SECTION_VISIBILITY_KEYS.map(({ id }) => [id, input[id] === undefined ? true : Boolean(input[id])])
  );
}

export function setSectionVisibility(draft, sectionId, included, { now = timestampNow } = {}) {
  if (!SECTION_VISIBILITY_KEYS.some(({ id }) => id === sectionId)) {
    throw new TypeError(`Unknown note section: ${text(sectionId) || "(blank)"}`);
  }
  return touch(draft, {
    sectionVisibility: { ...normalizeSectionVisibility(draft?.sectionVisibility), [sectionId]: Boolean(included) }
  }, now);
}

// Vitals and medications are included in the note by default. Unchecking one
// records its id here so the auto-include pass does not re-add it.
export function deselectObjectiveBlockWithMemory(draft, selectionId, { now = timestampNow } = {}) {
  const next = deselectObjectiveBlock(draft, selectionId, { now });
  const deselectedIds = new Set(next.objective.deselectedIds || []);
  deselectedIds.add(String(selectionId));
  return touch(next, {
    objective: { ...next.objective, deselectedIds: [...deselectedIds] }
  }, now);
}

export function reselectObjectiveBlock(draft, selection, { now = timestampNow } = {}) {
  const next = selectObjectiveBlock(draft, selection, { now });
  const selectionId = String(selection?.selectionId || "");
  return touch(next, {
    objective: {
      ...next.objective,
      deselectedIds: (next.objective.deselectedIds || []).filter((id) => id !== selectionId)
    }
  }, now);
}

function timestampNow() {
  return new Date().toISOString();
}

function localId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function text(value) {
  return String(value ?? "");
}

function assertNoteType(noteType) {
  if (!NOTE_TYPE_FIELDS[noteType]) throw new TypeError(`Unsupported note type: ${text(noteType) || "(blank)"}`);
  return noteType;
}

function timestampFrom(value, fallback) {
  return text(value).trim() || fallback;
}

export function fieldsForNoteType(noteType) {
  return NOTE_TYPE_FIELDS[assertNoteType(noteType)].map((field) => ({ ...field }));
}

export function normalizeDraftText(value, { existing = null, timestamp = timestampNow() } = {}) {
  const source = value && typeof value === "object" ? value : { deidentifiedText: value };
  const prior = existing && typeof existing === "object" ? existing : null;
  const warnings = Array.isArray(source.residualWarnings)
    ? source.residualWarnings
    : (Array.isArray(prior?.residualWarnings) ? prior.residualWarnings : []);
  return {
    deidentifiedText: text(source.deidentifiedText),
    residualWarnings: sanitizeResidualWarningMetadata(warnings),
    createdAt: timestampFrom(source.createdAt, timestampFrom(prior?.createdAt, timestamp)),
    updatedAt: timestampFrom(source.updatedAt, timestampFrom(prior?.updatedAt, timestamp))
  };
}

function blankText(timestamp) {
  return normalizeDraftText("", { timestamp });
}

function updateDraftText(existing, value, timestamp) {
  const source = value && typeof value === "object" ? value : { deidentifiedText: value };
  return normalizeDraftText({
    ...source,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp
  }, { existing, timestamp });
}

function normalizeSections(noteType, sections, timestamp) {
  const source = sections && typeof sections === "object" ? sections : {};
  // Preserve all input sections (e.g. physical_exam, plan from primary-team
  // notes), not just the core NOTE_TYPE_FIELDS. This ensures pasted note
  // content survives the round-trip to the draft.
  const normalized = {};
  for (const [id, value] of Object.entries(source)) {
    normalized[id] = normalizeDraftText(value ?? "", { timestamp });
  }
  // Ensure all expected fields exist even if not in the source.
  for (const { id } of fieldsForNoteType(noteType)) {
    if (!Object.hasOwn(normalized, id)) {
      normalized[id] = normalizeDraftText("", { timestamp });
    }
  }
  return normalized;
}

function normalizeClosingSections(closing, timestamp) {
  const source = closing && typeof closing === "object" ? closing : {};
  return Object.fromEntries(CLOSING_SECTION_FIELDS.map(({ id }) => [
    id,
    normalizeDraftText(source[id] ?? "", { timestamp })
  ]));
}

export function normalizeObjectiveBlock(block) {
  const generatedText = text(block?.generatedText);
  const editedText = block?.editedText === undefined ? generatedText : text(block.editedText);
  let state = OBJECTIVE_BLOCK_STATES.has(block?.state) ? block.state : (editedText === generatedText ? "synced" : "edited");
  if (state === "synced" && editedText !== generatedText) state = "edited";
  const normalized = {
    selectionId: text(block?.selectionId).trim(),
    sourceFingerprint: text(block?.sourceFingerprint),
    generatedText,
    editedText,
    state,
    // Final-note grouping metadata: which "Vitals:" / panel-family line this
    // block collapses into, and its compact single-line form. Blocks without
    // a noteGroupKey render as their own paragraph.
    kind: text(block?.kind),
    noteGroupKey: text(block?.noteGroupKey),
    noteGroupLabel: text(block?.noteGroupLabel),
    noteLabel: text(block?.noteLabel),
    noteDetail: text(block?.noteDetail),
    noteRange: text(block?.noteRange),
    noteMean: text(block?.noteMean),
    needsFreeText: block?.needsFreeText === true
  };
  if (state === "stale") {
    normalized.pendingSourceFingerprint = text(block?.pendingSourceFingerprint);
    normalized.pendingGeneratedText = text(block?.pendingGeneratedText);
    normalized.pendingNoteLabel = text(block?.pendingNoteLabel);
    normalized.pendingNoteDetail = text(block?.pendingNoteDetail);
    normalized.pendingNeedsFreeText = block?.pendingNeedsFreeText === true;
  }
  return normalized;
}

export function normalizeChecklistFindingBlock(block) {
  return {
    ...normalizeObjectiveBlock(block),
    kind: block?.kind === "exam" ? "exam" : "history",
    question: text(block?.question),
    sourceDayLabel: text(block?.sourceDayLabel),
    workupTitle: text(block?.workupTitle)
  };
}

function normalizeDifferential(differential, { timestamp, idFactory }) {
  return {
    id: text(differential?.id).trim() || idFactory("differential"),
    diagnosis: normalizeDraftText(differential?.diagnosis ?? "", { timestamp }),
    cluesFor: normalizeDraftText(differential?.cluesFor ?? "", { timestamp }),
    cluesAgainst: normalizeDraftText(differential?.cluesAgainst ?? "", { timestamp })
  };
}

function normalizePlanProblem(problem, { timestamp, idFactory }) {
  const etiologyStatus = ETIOLOGY_STATUSES.has(problem?.etiologyStatus) ? problem.etiologyStatus : "unknown";
  return {
    id: text(problem?.id).trim() || idFactory("problem"),
    problem: normalizeDraftText(problem?.problem ?? problem?.title ?? "", { timestamp }),
    keyContext: normalizeDraftText(problem?.keyContext ?? "", { timestamp }),
    etiologyStatus,
    knownEtiology: normalizeDraftText(problem?.knownEtiology ?? "", { timestamp }),
    differentials: (Array.isArray(problem?.differentials) ? problem.differentials : []).map((entry) =>
      normalizeDifferential(entry, { timestamp, idFactory })
    ),
    diagnosticPlan: normalizeDraftText(problem?.diagnosticPlan ?? "", { timestamp }),
    therapeuticPlan: normalizeDraftText(problem?.therapeuticPlan ?? "", { timestamp })
  };
}

export function normalizeNoteDraft(draft, { now = timestampNow, idFactory = localId } = {}) {
  const timestamp = now();
  const noteType = assertNoteType(draft?.noteType);
  const createdAt = timestampFrom(draft?.createdAt, timestamp);
  return {
    schema: NOTE_DRAFT_SCHEMA,
    id: text(draft?.id).trim() || idFactory("note_draft"),
    patientId: text(draft?.patientId).trim(),
    hospitalDayId: text(draft?.hospitalDayId).trim(),
    noteType,
    sections: normalizeSections(noteType, draft?.sections, timestamp),
    objective: {
      manual: normalizeDraftText(draft?.objective?.manual ?? "", { timestamp }),
      selectedBlocks: (Array.isArray(draft?.objective?.selectedBlocks) ? draft.objective.selectedBlocks : [])
        .map(normalizeObjectiveBlock)
        .filter((block) => block.selectionId),
      // Ids the user explicitly removed from the auto-included vitals and
      // medications. The review controller re-applies auto-include on every
      // render; this list stops it from resurrecting deselected rows.
      deselectedIds: (Array.isArray(draft?.objective?.deselectedIds) ? draft.objective.deselectedIds : [])
        .map((id) => String(id).trim())
        .filter(Boolean),
      // Group-level text overrides from the inline Objective editor, keyed by
      // editor group key. A group edit replaces the generated lines for
      // display and the final note, but member blocks keep their identities
      // so individual selection, staleness, and reconciliation keep working.
      groupEdits: normalizeGroupEdits(draft?.objective?.groupEdits)
    },
    sectionVisibility: normalizeSectionVisibility(draft?.sectionVisibility),
    checklistFindings: {
      selectedBlocks: (Array.isArray(draft?.checklistFindings?.selectedBlocks) ? draft.checklistFindings.selectedBlocks : [])
        .map(normalizeChecklistFindingBlock)
        .filter((block) => block.selectionId)
    },
    assessment: normalizeDraftText(draft?.assessment ?? "", { timestamp }),
    problems: (Array.isArray(draft?.problems) ? draft.problems : []).map((problem) =>
      normalizePlanProblem(problem, { timestamp, idFactory })
    ),
    closing: normalizeClosingSections(draft?.closing, timestamp),
    // Structured physical-exam finding selections (finding id -> text).
    // Rendered by the exam findings picker; compiled into the note on insert.
    examSelections: normalizeExamSelections(draft?.examSelections),
    createdAt,
    updatedAt: timestampFrom(draft?.updatedAt, createdAt)
  };
}

export function createNoteDraft(noteType, {
  id = "",
  patientId = "",
  hospitalDayId = "",
  now = timestampNow,
  idFactory = localId
} = {}) {
  const timestamp = now();
  const normalizedType = assertNoteType(noteType);
  return normalizeNoteDraft({
    id: id || idFactory("note_draft"),
    patientId,
    hospitalDayId,
    noteType: normalizedType,
    sections: Object.fromEntries(fieldsForNoteType(normalizedType).map(({ id: fieldId }) => [fieldId, blankText(timestamp)])),
    objective: { manual: blankText(timestamp), selectedBlocks: [] },
    checklistFindings: { selectedBlocks: [] },
    assessment: blankText(timestamp),
    problems: [],
    closing: Object.fromEntries(CLOSING_SECTION_FIELDS.map(({ id: fieldId }) => [fieldId, blankText(timestamp)])),
    createdAt: timestamp,
    updatedAt: timestamp
  }, { now: () => timestamp, idFactory });
}

export function changeNoteDraftType(draft, noteType, { now = timestampNow } = {}) {
  const targetType = assertNoteType(noteType);
  if (draft.noteType === targetType) return draft;
  const timestamp = now();
  const sourceSections = draft.sections || {};
  const mappedSections = Object.fromEntries(fieldsForNoteType(targetType).map(({ id }) => {
    let source = sourceSections[id];
    if (!source && targetType === NOTE_TYPES.PROGRESS && id === "patient_report")
      source = sourceSections.history_of_present_illness;
    if (!source && targetType === NOTE_TYPES.H_AND_P && id === "history_of_present_illness")
      source = sourceSections.patient_report;
    return [id, normalizeDraftText(source || "", { timestamp })];
  }));
  return normalizeNoteDraft({
    ...draft,
    noteType: targetType,
    sections: mappedSections,
    updatedAt: timestamp
  }, { now: () => timestamp });
}

function normalizeGroupEdits(value) {
  const out = {};
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      const k = text(key).trim();
      const v = text(val).trim();
      if (k && v) out[k] = v;
    }
  }
  return out;
}

// Structured physical-exam finding selections, keyed by finding id from
// src/clinical/exam-findings.js. Only non-empty string values survive;
// unknown ids are dropped so a stale catalog cannot pollute the draft.
function normalizeExamSelections(value) {
  const out = {};
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      const k = text(key).trim();
      const v = text(val).trim();
      if (k && v) out[k] = v;
    }
  }
  return out;
}

function touch(draft, changes, now) {
  return { ...draft, ...changes, updatedAt: now() };
}

function hasField(noteType, fieldId) {
  return NOTE_TYPE_FIELDS[noteType].some((field) => field.id === fieldId);
}

export function updateNoteSection(draft, fieldId, value, { now = timestampNow } = {}) {
  assertNoteType(draft.noteType);
  if (!hasField(draft.noteType, fieldId)) throw new TypeError(`Field ${fieldId} is not available for ${draft.noteType} notes.`);
  const timestamp = now();
  return { ...draft, sections: { ...draft.sections, [fieldId]: updateDraftText(draft.sections?.[fieldId], value, timestamp) }, updatedAt: timestamp };
}

export function updateManualObjective(draft, value, { now = timestampNow } = {}) {
  const timestamp = now();
  return {
    ...draft,
    objective: { ...draft.objective, manual: updateDraftText(draft.objective?.manual, value, timestamp) },
    updatedAt: timestamp
  };
}

/**
 * Update structured physical-exam finding selections.
 * `changes` is an object of findingId -> text. Empty/blank values remove
 * the selection for that finding. Unknown finding ids are ignored.
 */
export function updateExamSelections(draft, changes, { now = timestampNow } = {}) {
  const timestamp = now();
  const next = { ...(draft.examSelections || {}) };
  if (changes && typeof changes === "object") {
    for (const [key, val] of Object.entries(changes)) {
      const k = String(key).trim();
      const v = String(val ?? "").trim();
      if (!k) continue;
      if (v) next[k] = v;
      else delete next[k];
    }
  }
  return { ...draft, examSelections: next, updatedAt: timestamp };
}

export function updateAssessment(draft, value, { now = timestampNow } = {}) {
  const timestamp = now();
  return { ...draft, assessment: updateDraftText(draft.assessment, value, timestamp), updatedAt: timestamp };
}

export function updateClosingSection(draft, fieldId, value, { now = timestampNow } = {}) {
  if (!CLOSING_SECTION_FIELDS.some((field) => field.id === fieldId)) throw new TypeError(`Unknown closing section: ${fieldId}`);
  const timestamp = now();
  return { ...draft, closing: { ...draft.closing, [fieldId]: updateDraftText(draft.closing?.[fieldId], value, timestamp) }, updatedAt: timestamp };
}

export function createPlanProblem(values = {}, { now = timestampNow, idFactory = localId } = {}) {
  return normalizePlanProblem(values, { timestamp: now(), idFactory });
}

export function addPlanProblem(draft, values = {}, options = {}) {
  const problem = createPlanProblem(values, options);
  return touch(draft, { problems: [...(draft.problems || []), problem] }, options.now || timestampNow);
}

export function updatePlanProblem(draft, problemId, patch = {}, { now = timestampNow } = {}) {
  const timestamp = now();
  const problems = (draft.problems || []).map((problem) => {
    if (problem.id !== problemId) return problem;
    const next = { ...problem };
    if (patch.problem !== undefined || patch.title !== undefined) next.problem = updateDraftText(problem.problem, patch.problem ?? patch.title, timestamp);
    if (patch.keyContext !== undefined) next.keyContext = updateDraftText(problem.keyContext, patch.keyContext, timestamp);
    if (patch.knownEtiology !== undefined) next.knownEtiology = updateDraftText(problem.knownEtiology, patch.knownEtiology, timestamp);
    if (patch.diagnosticPlan !== undefined) next.diagnosticPlan = updateDraftText(problem.diagnosticPlan, patch.diagnosticPlan, timestamp);
    if (patch.therapeuticPlan !== undefined) next.therapeuticPlan = updateDraftText(problem.therapeuticPlan, patch.therapeuticPlan, timestamp);
    if (patch.etiologyStatus !== undefined) {
      if (!ETIOLOGY_STATUSES.has(patch.etiologyStatus)) throw new TypeError(`Unknown etiology status: ${patch.etiologyStatus}`);
      next.etiologyStatus = patch.etiologyStatus;
    }
    return next;
  });
  return { ...draft, problems, updatedAt: timestamp };
}

export function removePlanProblem(draft, problemId, { now = timestampNow } = {}) {
  return touch(draft, { problems: (draft.problems || []).filter((problem) => problem.id !== problemId) }, now);
}

function reorderByIds(entries, orderedIds) {
  const byId = new Map((entries || []).map((entry) => [entry.id, entry]));
  const ordered = (orderedIds || []).map((id) => byId.get(id)).filter(Boolean);
  const included = new Set(ordered.map((entry) => entry.id));
  return [...ordered, ...(entries || []).filter((entry) => !included.has(entry.id))];
}

export function reorderPlanProblems(draft, orderedProblemIds, { now = timestampNow } = {}) {
  return touch(draft, { problems: reorderByIds(draft.problems, orderedProblemIds) }, now);
}

export function createDifferential(values = {}, { now = timestampNow, idFactory = localId } = {}) {
  return normalizeDifferential(values, { timestamp: now(), idFactory });
}

export function addDifferential(draft, problemId, values = {}, options = {}) {
  const differential = createDifferential(values, options);
  return touch(draft, {
    problems: (draft.problems || []).map((problem) => problem.id === problemId
      ? { ...problem, differentials: [...problem.differentials, differential] }
      : problem)
  }, options.now || timestampNow);
}

export function updateDifferential(draft, problemId, differentialId, patch = {}, { now = timestampNow } = {}) {
  const timestamp = now();
  const problems = (draft.problems || []).map((problem) => {
    if (problem.id !== problemId) return problem;
    return {
      ...problem,
      differentials: problem.differentials.map((differential) => {
        if (differential.id !== differentialId) return differential;
        return {
          ...differential,
          ...(patch.diagnosis === undefined ? {} : { diagnosis: updateDraftText(differential.diagnosis, patch.diagnosis, timestamp) }),
          ...(patch.cluesFor === undefined ? {} : { cluesFor: updateDraftText(differential.cluesFor, patch.cluesFor, timestamp) }),
          ...(patch.cluesAgainst === undefined ? {} : { cluesAgainst: updateDraftText(differential.cluesAgainst, patch.cluesAgainst, timestamp) })
        };
      })
    };
  });
  return { ...draft, problems, updatedAt: timestamp };
}

export function removeDifferential(draft, problemId, differentialId, { now = timestampNow } = {}) {
  return touch(draft, {
    problems: (draft.problems || []).map((problem) => problem.id === problemId
      ? { ...problem, differentials: problem.differentials.filter((entry) => entry.id !== differentialId) }
      : problem)
  }, now);
}

export function reorderDifferentials(draft, problemId, orderedDifferentialIds, { now = timestampNow } = {}) {
  return touch(draft, {
    problems: (draft.problems || []).map((problem) => problem.id === problemId
      ? { ...problem, differentials: reorderByIds(problem.differentials, orderedDifferentialIds) }
      : problem)
  }, now);
}

function normalizedSelectionInput(selection) {
  const selectionId = text(selection?.selectionId).trim();
  if (!selectionId) throw new TypeError("Objective selections require a selectionId.");
  const sourceFingerprint = text(selection?.sourceFingerprint);
  if (!sourceFingerprint) throw new TypeError("Objective selections require a sourceFingerprint.");
  return {
    selectionId,
    sourceFingerprint,
    generatedText: text(selection?.generatedText),
    kind: text(selection?.kind),
    noteGroupKey: text(selection?.noteGroupKey),
    noteGroupLabel: text(selection?.noteGroupLabel),
    noteLabel: text(selection?.noteLabel),
    noteDetail: text(selection?.noteDetail),
    noteRange: text(selection?.noteRange),
    noteMean: text(selection?.noteMean),
    needsFreeText: selection?.needsFreeText === true
  };
}

export function selectObjectiveBlock(draft, selection, { now = timestampNow } = {}) {
  const input = normalizedSelectionInput(selection);
  const existing = draft.objective.selectedBlocks.find((block) => block.selectionId === input.selectionId);
  if (existing) return reconcileObjectiveBlock(draft, input, { now });
  const block = normalizeObjectiveBlock({ ...input, editedText: input.generatedText, state: "synced" });
  // A new member changes what the group holds: any group-level text override
  // described the old membership and no longer applies.
  const next = withoutGroupEdit(draft, objectiveGroupKeyFor(block));
  return touch(next, {
    objective: { ...next.objective, selectedBlocks: [...next.objective.selectedBlocks, block] }
  }, now);
}

export function deselectObjectiveBlock(draft, selectionId, { now = timestampNow } = {}) {
  const block = draft.objective.selectedBlocks.find((b) => b.selectionId === selectionId);
  const next = block ? withoutGroupEdit(draft, objectiveGroupKeyFor(block)) : draft;
  return touch(next, {
    objective: {
      ...next.objective,
      selectedBlocks: next.objective.selectedBlocks.filter((b) => b.selectionId !== selectionId)
    }
  }, now);
}

export function editObjectiveBlock(draft, selectionId, editedText, { now = timestampNow } = {}) {
  return touch(draft, {
    objective: {
      ...draft.objective,
      selectedBlocks: draft.objective.selectedBlocks.map((block) => {
        if (block.selectionId !== selectionId) return block;
        const nextText = text(editedText);
        return {
          ...block,
          editedText: nextText,
          state: block.state === "stale" ? "stale" : (nextText === block.generatedText ? "synced" : "edited")
        };
      })
    }
  }, now);
}

export function reconcileObjectiveBlock(draft, selection, { now = timestampNow } = {}) {
  const input = normalizedSelectionInput(selection);
  return touch(draft, {
    objective: {
      ...draft.objective,
      selectedBlocks: draft.objective.selectedBlocks.map((block) => {
        if (block.selectionId !== input.selectionId) return block;
        if (block.sourceFingerprint === input.sourceFingerprint && block.generatedText === input.generatedText) return block;
        if (block.state === "synced" && block.editedText === block.generatedText) {
          return normalizeObjectiveBlock({ ...input, editedText: input.generatedText, state: "synced" });
        }
        return normalizeObjectiveBlock({
          ...block,
          state: "stale",
          pendingSourceFingerprint: input.sourceFingerprint,
          pendingGeneratedText: input.generatedText,
          pendingNoteLabel: input.noteLabel,
          pendingNoteDetail: input.noteDetail,
          pendingNeedsFreeText: input.needsFreeText === true
        });
      })
    }
  }, now);
}

export function refreshObjectiveBlock(draft, selectionId, { now = timestampNow } = {}) {
  return touch(draft, {
    objective: {
      ...draft.objective,
      selectedBlocks: draft.objective.selectedBlocks.map((block) => {
        if (block.selectionId !== selectionId || block.state !== "stale") return block;
        return normalizeObjectiveBlock({
          selectionId: block.selectionId,
          sourceFingerprint: block.pendingSourceFingerprint,
          generatedText: block.pendingGeneratedText,
          editedText: block.pendingGeneratedText,
          kind: block.kind,
          noteGroupKey: block.noteGroupKey,
          noteGroupLabel: block.noteGroupLabel,
          noteLabel: block.pendingNoteLabel || block.noteLabel,
          noteDetail: block.pendingNoteDetail || block.noteDetail,
          needsFreeText: block.pendingNeedsFreeText === true,
          state: "synced"
        });
      })
    }
  }, now);
}

export function keepObjectiveBlock(draft, selectionId, { now = timestampNow } = {}) {
  return touch(draft, {
    objective: {
      ...draft.objective,
      selectedBlocks: draft.objective.selectedBlocks.map((block) => {
        if (block.selectionId !== selectionId || block.state !== "stale") return block;
        const generatedText = text(block.pendingGeneratedText);
        return normalizeObjectiveBlock({
          selectionId: block.selectionId,
          sourceFingerprint: block.pendingSourceFingerprint,
          generatedText,
          editedText: block.editedText,
          state: block.editedText === generatedText ? "synced" : "edited"
        });
      })
    }
  }, now);
}

// Groups selected objective blocks for compact inline rendering: all vitals
// share one "vitals" group, labs group by panel family, diagnostic results
// group by category, everything else renders as its own single-block group.
export function objectiveGroupKeyFor(block) {
  const groupKey = text(block?.noteGroupKey);
  if (groupKey === "vitals") return "vitals";
  if (groupKey === "pending-labs") return "pending-labs";
  if (groupKey.startsWith("lab:")) return groupKey;
  if (groupKey.startsWith("result:")) return groupKey;
  return text(block?.selectionId);
}

// The plain text the inline Objective editor shows for a group, one line per
// member, including the secondary hints (report prompts, vital ranges). Used
// to tell a real group edit apart from untouched text.
export function objectiveGroupRenderedText(draft, groupKey) {
  const key = text(groupKey);
  const isVitals = key === "vitals";
  const lines = [];
  for (const block of draft.objective?.selectedBlocks || []) {
    if (objectiveGroupKeyFor(block) !== key) continue;
    if (block.state === "edited" && block.editedText) {
      String(block.editedText).split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => lines.push(line));
      continue;
    }
    const label = String(block.noteLabel || "").trim();
    const detail = String(block.noteDetail || "").trim();
    let line = label && detail ? `${label} ${detail}` : (label || detail || String(block.generatedText || "").trim());
    if (line) {
      if (block.needsFreeText && block.state !== "edited") line += " ⚠️ paste report text";
      else if (isVitals) {
        const range = String(block.noteRange || "").trim();
        const mean = String(block.noteMean || "").trim();
        const secondary = [];
        if (range) secondary.push(`24h ${range}`);
        if (mean) secondary.push(`mean ${mean}`);
        if (secondary.length) line += ` ${secondary.join(" · ")}`;
      }
      lines.push(line.trim());
    }
  }
  return lines.join("\n");
}

// Drop the group-level override for one editor group key.
function withoutGroupEdit(draft, groupKey) {
  const key = text(groupKey);
  if (!key || !draft.objective?.groupEdits?.[key]) return draft;
  const groupEdits = { ...draft.objective.groupEdits };
  delete groupEdits[key];
  return { ...draft, objective: { ...draft.objective, groupEdits } };
}

export function objectiveEditorGroups(draft) {
  const blocks = (draft.objective?.selectedBlocks || []).filter((block) => block.noteGroupKey !== "medications");
  const groups = [];
  const byKey = new Map();
  for (const block of blocks) {
    const key = objectiveGroupKeyFor(block);
    if (!byKey.has(key)) {
      const isLab = key.startsWith("lab:");
      const isResult = key.startsWith("result:");
      byKey.set(key, {
        key,
        label: key === "vitals"
          ? "Vital signs"
          : key === "pending-labs"
            ? "Pending labs"
            : isLab
              ? text(block.noteGroupLabel) || key.slice(4)
              : isResult
                ? text(block.noteGroupLabel) || "Other results"
                : "",
        blocks: []
      });
      groups.push(byKey.get(key));
    }
    byKey.get(key).blocks.push(block);
  }
  // Pending labs always render last: they are follow-up items, not results.
  groups.sort((a, b) => (a.key === "pending-labs" ? 1 : 0) - (b.key === "pending-labs" ? 1 : 0));
  return groups;
}

// Editing a group's combined inline text stores a group-level override: the
// student's own words replace the generated lines for display and the final
// note, but the member blocks keep their identities, so individual
// selection, staleness, and source reconciliation keep working. Clearing the
// text removes the group (like the × button). Changing the group's
// membership — adding, removing, or refreshing a member — drops the
// override, because it described a different set of members.
export function editObjectiveGroup(draft, groupKey, editedText, { now = timestampNow } = {}) {
  const key = text(groupKey);
  if (!key) return draft;
  const members = (draft.objective?.selectedBlocks || []).filter((block) => objectiveGroupKeyFor(block) === key);
  if (!members.length) return draft;
  const nextText = text(editedText);
  if (!nextText.trim()) return removeObjectiveGroup(draft, key, { now });
  const normalizeLines = (value) => String(value).split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
  const groupEdits = { ...(draft.objective?.groupEdits || {}) };
  if (normalizeLines(nextText) === normalizeLines(objectiveGroupRenderedText(draft, key))) {
    // Untouched text: no override needed.
    if (!(key in groupEdits)) return draft;
    delete groupEdits[key];
  } else {
    groupEdits[key] = nextText.trim();
  }
  return touch(draft, { objective: { ...draft.objective, groupEdits } }, now);
}

export function removeObjectiveGroup(draft, groupKey, { now = timestampNow } = {}) {
  const key = text(groupKey);
  if (!key) return draft;
  const ids = new Set(
    (draft.objective?.selectedBlocks || [])
      .filter((block) => objectiveGroupKeyFor(block) === key)
      .map((block) => block.selectionId)
  );
  if (!ids.size) return draft;
  const next = withoutGroupEdit(draft, key);
  return touch(next, {
    objective: {
      ...next.objective,
      selectedBlocks: next.objective.selectedBlocks.filter((block) => !ids.has(block.selectionId))
    }
  }, now);
}

export function refreshObjectiveGroup(draft, groupKey, { now = timestampNow } = {}) {
  const key = text(groupKey);
  if (!key) return draft;
  // Refreshed members carry new source text: a group-level override written
  // against the old text no longer applies.
  let next = withoutGroupEdit(draft, key);
  for (const block of draft.objective?.selectedBlocks || []) {
    if (objectiveGroupKeyFor(block) === key && block.state === "stale") {
      next = refreshObjectiveBlock(next, block.selectionId, { now });
    }
  }
  return next;
}

// Removing a group of default-on vitals remembers each member id so the
// auto-include pass does not silently re-add them.
export function removeObjectiveGroupWithMemory(draft, groupKey, { now = timestampNow } = {}) {
  const key = text(groupKey);
  if (!key) return draft;
  const ids = (draft.objective?.selectedBlocks || [])
    .filter((block) => objectiveGroupKeyFor(block) === key)
    .map((block) => String(block.selectionId));
  let next = removeObjectiveGroup(draft, key, { now });
  if (!ids.length) return next;
  const deselectedIds = new Set(next.objective.deselectedIds || []);
  for (const id of ids) deselectedIds.add(id);
  return touch(next, {
    objective: { ...next.objective, deselectedIds: [...deselectedIds] }
  }, now);
}

function normalizedChecklistFindingInput(selection) {
  return {
    ...normalizedSelectionInput(selection),
    kind: selection?.kind === "exam" ? "exam" : "history",
    question: text(selection?.question),
    sourceDayLabel: text(selection?.sourceDayLabel),
    workupTitle: text(selection?.workupTitle)
  };
}

export function selectChecklistFinding(draft, selection, { now = timestampNow } = {}) {
  const input = normalizedChecklistFindingInput(selection);
  const existing = draft.checklistFindings.selectedBlocks.find((block) => block.selectionId === input.selectionId);
  if (existing) return reconcileChecklistFinding(draft, input, { now });
  return touch(draft, {
    checklistFindings: {
      selectedBlocks: [...draft.checklistFindings.selectedBlocks, normalizeChecklistFindingBlock({ ...input, editedText: input.generatedText, state: "synced" })]
    }
  }, now);
}

export function deselectChecklistFinding(draft, selectionId, { now = timestampNow } = {}) {
  return touch(draft, {
    checklistFindings: { selectedBlocks: draft.checklistFindings.selectedBlocks.filter((block) => block.selectionId !== selectionId) }
  }, now);
}

export function editChecklistFinding(draft, selectionId, editedText, { now = timestampNow } = {}) {
  return touch(draft, {
    checklistFindings: {
      selectedBlocks: draft.checklistFindings.selectedBlocks.map((block) => block.selectionId === selectionId
        ? normalizeChecklistFindingBlock({ ...block, editedText: text(editedText), state: block.state === "stale" ? "stale" : (text(editedText) === block.generatedText ? "synced" : "edited") })
        : block)
    }
  }, now);
}

export function reconcileChecklistFinding(draft, selection, { now = timestampNow } = {}) {
  const input = normalizedChecklistFindingInput(selection);
  return touch(draft, {
    checklistFindings: {
      selectedBlocks: draft.checklistFindings.selectedBlocks.map((block) => {
        if (block.selectionId !== input.selectionId) return block;
        if (block.sourceFingerprint === input.sourceFingerprint) return block;
        if (block.state === "synced" && block.editedText === block.generatedText)
          return normalizeChecklistFindingBlock({ ...input, editedText: input.generatedText, state: "synced" });
        return normalizeChecklistFindingBlock({ ...block, state: "stale", pendingSourceFingerprint: input.sourceFingerprint, pendingGeneratedText: input.generatedText });
      })
    }
  }, now);
}

export function refreshChecklistFinding(draft, selectionId, { now = timestampNow } = {}) {
  return touch(draft, {
    checklistFindings: {
      selectedBlocks: draft.checklistFindings.selectedBlocks.map((block) => block.selectionId === selectionId && block.state === "stale"
        ? normalizeChecklistFindingBlock({ ...block, sourceFingerprint: block.pendingSourceFingerprint, generatedText: block.pendingGeneratedText, editedText: block.pendingGeneratedText, state: "synced" })
        : block)
    }
  }, now);
}

export function keepChecklistFinding(draft, selectionId, { now = timestampNow } = {}) {
  return touch(draft, {
    checklistFindings: {
      selectedBlocks: draft.checklistFindings.selectedBlocks.map((block) => {
        if (block.selectionId !== selectionId || block.state !== "stale") return block;
        const generatedText = text(block.pendingGeneratedText);
        return normalizeChecklistFindingBlock({ ...block, sourceFingerprint: block.pendingSourceFingerprint, generatedText, state: block.editedText === generatedText ? "synced" : "edited" });
      })
    }
  }, now);
}
