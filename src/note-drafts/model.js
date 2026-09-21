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
  Object.freeze({ id: "vte_prophylaxis", label: "VTE Prophylaxis", required: false }),
  Object.freeze({ id: "code_status", label: "Code Status", required: false }),
  Object.freeze({ id: "disposition", label: "Disposition", required: false }),
  Object.freeze({ id: "medication_regimens", label: "Medication Regimens", required: false })
]);

const OBJECTIVE_BLOCK_STATES = new Set(["synced", "edited", "stale"]);
const ETIOLOGY_STATUSES = new Set(["known", "unknown"]);

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
  return Object.fromEntries(fieldsForNoteType(noteType).map(({ id }) => [
    id,
    normalizeDraftText(source[id] ?? "", { timestamp })
  ]));
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
    state
  };
  if (state === "stale") {
    normalized.pendingSourceFingerprint = text(block?.pendingSourceFingerprint);
    normalized.pendingGeneratedText = text(block?.pendingGeneratedText);
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
        .filter((block) => block.selectionId)
    },
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
  return { selectionId, sourceFingerprint, generatedText: text(selection?.generatedText) };
}

export function selectObjectiveBlock(draft, selection, { now = timestampNow } = {}) {
  const input = normalizedSelectionInput(selection);
  const existing = draft.objective.selectedBlocks.find((block) => block.selectionId === input.selectionId);
  if (existing) return reconcileObjectiveBlock(draft, input, { now });
  const block = normalizeObjectiveBlock({ ...input, editedText: input.generatedText, state: "synced" });
  return touch(draft, {
    objective: { ...draft.objective, selectedBlocks: [...draft.objective.selectedBlocks, block] }
  }, now);
}

export function deselectObjectiveBlock(draft, selectionId, { now = timestampNow } = {}) {
  return touch(draft, {
    objective: {
      ...draft.objective,
      selectedBlocks: draft.objective.selectedBlocks.filter((block) => block.selectionId !== selectionId)
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
          pendingGeneratedText: input.generatedText
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
