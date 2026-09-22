import { sanitizeResidualWarningMetadata } from "./review.js";

export const PRIMARY_TEAM_NOTE_SCHEMA = "primary_team_note_source_v1";
const H_AND_P = "hp";
const PROGRESS = "progress";

const sharedOneLiner = Object.freeze({ id: "one_liner", label: "One-liner", rows: 2 });

export const PRIMARY_TEAM_NOTE_FIELDS = Object.freeze({
  [H_AND_P]: Object.freeze([
    sharedOneLiner,
    Object.freeze({ id: "chief_complaint", label: "Chief complaint", rows: 2 }),
    Object.freeze({ id: "history_of_present_illness", label: "History of present illness" }),
    Object.freeze({ id: "review_of_systems", label: "Review of systems" }),
    Object.freeze({ id: "medications", label: "Medications" }),
    Object.freeze({ id: "allergies", label: "Allergies" }),
    Object.freeze({ id: "past_medical_history", label: "Past medical history" }),
    Object.freeze({ id: "past_surgical_history", label: "Past surgical history" }),
    Object.freeze({ id: "family_history", label: "Family history" }),
    Object.freeze({ id: "social_history", label: "Social history" }),
    Object.freeze({ id: "diet_and_exercise", label: "Diet and exercise" }),
    Object.freeze({ id: "physical_exam", label: "Physical exam" }),
    Object.freeze({ id: "objective", label: "Objective data" }),
    Object.freeze({ id: "assessment", label: "Assessment" }),
    Object.freeze({ id: "plan", label: "Plan", rows: 8 }),
    Object.freeze({ id: "fen", label: "FEN" }),
    Object.freeze({ id: "lda", label: "Lines / drains / airways" }),
    Object.freeze({ id: "vte_prophylaxis", label: "VTE prophylaxis" }),
    Object.freeze({ id: "code_status", label: "Code status" }),
    Object.freeze({ id: "disposition", label: "Disposition" }),
    Object.freeze({ id: "other", label: "Other note content" })
  ]),
  [PROGRESS]: Object.freeze([
    sharedOneLiner,
    Object.freeze({ id: "interval_events", label: "Interval events" }),
    Object.freeze({ id: "patient_report", label: "Patient report" }),
    Object.freeze({ id: "nursing_report", label: "Nursing report" }),
    Object.freeze({ id: "pertinent_symptoms", label: "Pertinent symptoms" }),
    Object.freeze({ id: "physical_exam", label: "Physical exam" }),
    Object.freeze({ id: "objective", label: "Objective data" }),
    Object.freeze({ id: "assessment", label: "Assessment" }),
    Object.freeze({ id: "plan", label: "Plan", rows: 8 }),
    Object.freeze({ id: "medications", label: "Medications / medication changes" }),
    Object.freeze({ id: "fen", label: "FEN" }),
    Object.freeze({ id: "lda", label: "Lines / drains / airways" }),
    Object.freeze({ id: "vte_prophylaxis", label: "VTE prophylaxis" }),
    Object.freeze({ id: "code_status", label: "Code status" }),
    Object.freeze({ id: "disposition", label: "Disposition" }),
    Object.freeze({ id: "other", label: "Other note content" })
  ])
});

function text(value) {
  return String(value ?? "");
}

function timestampNow() {
  return new Date().toISOString();
}

function localId() {
  return `primary_note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function assertNoteType(noteType) {
  if (!PRIMARY_TEAM_NOTE_FIELDS[noteType]) throw new TypeError(`Unsupported primary-team note type: ${text(noteType) || "(blank)"}`);
  return noteType;
}

export function primaryTeamNoteFields(noteType) {
  return PRIMARY_TEAM_NOTE_FIELDS[assertNoteType(noteType)].map((field) => ({ ...field }));
}

function normalizeSourceText(value, { existing = null, timestamp = timestampNow() } = {}) {
  const source = value && typeof value === "object" ? value : { deidentifiedText: value };
  const prior = existing && typeof existing === "object" ? existing : null;
  const warnings = Array.isArray(source.residualWarnings)
    ? source.residualWarnings
    : (Array.isArray(prior?.residualWarnings) ? prior.residualWarnings : []);
  return {
    deidentifiedText: text(source.deidentifiedText),
    residualWarnings: sanitizeResidualWarningMetadata(warnings),
    createdAt: text(source.createdAt || prior?.createdAt || timestamp),
    updatedAt: text(source.updatedAt || timestamp)
  };
}

function legacyObjective(value) {
  return [
    value?.objective?.manual?.deidentifiedText,
    ...(value?.objective?.selectedBlocks || []).map((block) => block?.editedText)
  ].map((entry) => text(entry).trim()).filter(Boolean).join("\n\n");
}

function legacyPlan(value) {
  return (value?.problems || []).map((problem) => {
    const heading = text(problem?.problem?.deidentifiedText).trim();
    if (!heading) return "";
    const lines = [heading];
    const context = text(problem?.keyContext?.deidentifiedText).trim();
    if (context) lines.push(`Key context: ${context}`);
    const etiology = text(problem?.knownEtiology?.deidentifiedText).trim();
    if (etiology) lines.push(`Known etiology: ${etiology}`);
    for (const differential of problem?.differentials || []) {
      const diagnosis = text(differential?.diagnosis?.deidentifiedText).trim();
      if (diagnosis) lines.push(`Differential: ${diagnosis}`);
    }
    const diagnostic = text(problem?.diagnosticPlan?.deidentifiedText).trim();
    const therapeutic = text(problem?.therapeuticPlan?.deidentifiedText).trim();
    if (diagnostic) lines.push(`Diagnostic plan: ${diagnostic}`);
    if (therapeutic) lines.push(`Therapeutic plan: ${therapeutic}`);
    return lines.join("\n");
  }).filter(Boolean).join("\n\n");
}

function migratedSections(value) {
  const sections = { ...(value?.sections || {}) };
  const timestamp = text(value?.updatedAt || value?.createdAt || timestampNow());
  const setText = (id, candidate) => {
    if (!text(sections[id]?.deidentifiedText).trim() && text(candidate).trim()) {
      sections[id] = normalizeSourceText(candidate, { timestamp });
    }
  };
  setText("objective", legacyObjective(value));
  setText("assessment", value?.assessment?.deidentifiedText);
  setText("plan", legacyPlan(value));
  for (const id of ["fen", "lda", "vte_prophylaxis", "code_status", "disposition", "medication_regimens"]) {
    const targetId = id === "medication_regimens" ? "medications" : id;
    setText(targetId, value?.closing?.[id]?.deidentifiedText || value?.[id]?.deidentifiedText);
  }
  return sections;
}

export function normalizePrimaryTeamNote(value, noteType, { now = timestampNow, idFactory = localId, patientId = "", hospitalDayId = "" } = {}) {
  if (!value || typeof value !== "object") return null;
  const normalizedType = assertNoteType(noteType || value.noteType);
  const timestamp = now();
  const sourceSections = value.schema === PRIMARY_TEAM_NOTE_SCHEMA ? value.sections || {} : migratedSections(value);
  return {
    schema: PRIMARY_TEAM_NOTE_SCHEMA,
    id: text(value.id).trim() || idFactory(),
    patientId: text(value.patientId || patientId).trim(),
    hospitalDayId: text(value.hospitalDayId || hospitalDayId).trim(),
    noteType: normalizedType,
    sections: Object.fromEntries(primaryTeamNoteFields(normalizedType).map(({ id }) => [
      id,
      normalizeSourceText(sourceSections[id] || "", { timestamp })
    ])),
    createdAt: text(value.createdAt || timestamp),
    updatedAt: text(value.updatedAt || value.createdAt || timestamp)
  };
}

export function createPrimaryTeamNote(noteType, { patientId = "", hospitalDayId = "", now = timestampNow, idFactory = localId } = {}) {
  const timestamp = now();
  return normalizePrimaryTeamNote({
    id: idFactory(),
    patientId,
    hospitalDayId,
    noteType,
    sections: {},
    createdAt: timestamp,
    updatedAt: timestamp
  }, noteType, { now: () => timestamp, idFactory, patientId, hospitalDayId });
}

export function updatePrimaryTeamNoteSection(note, fieldId, value, { now = timestampNow } = {}) {
  if (!primaryTeamNoteFields(note.noteType).some((field) => field.id === fieldId)) {
    throw new TypeError(`Field ${fieldId} is not available for ${note.noteType} primary-team notes.`);
  }
  const timestamp = now();
  return {
    ...note,
    sections: {
      ...note.sections,
      [fieldId]: normalizeSourceText(value, { existing: note.sections?.[fieldId], timestamp })
    },
    updatedAt: timestamp
  };
}

export function primaryTeamNoteHasContent(note) {
  return Object.values(note?.sections || {}).some((section) => text(section?.deidentifiedText).trim());
}

export function renderPrimaryTeamNote(note) {
  if (!note) return "";
  return primaryTeamNoteFields(note.noteType).map(({ id, label }) => {
    const value = text(note.sections?.[id]?.deidentifiedText).trim();
    return value ? `**${label}**\n\n${value}` : "";
  }).filter(Boolean).join("\n\n");
}
