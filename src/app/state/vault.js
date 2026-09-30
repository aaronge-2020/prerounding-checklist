import { normalizeUserPreferences } from "../preferences.js";
import { sanitizeResidualWarningMetadata } from "../../patient-context/review.js";
import { CONTEXT_PACKET_ROLES, defaultPacketRole, normalizePacketRole, packetRoleLabel } from "../../patient-context/packet-roles.js";
import { migrateLegacyDailySections, normalizeDiagnosticResultCategory, normalizeSourceCapture, normalizeSourceKindForScope } from "../../patient-context/source-captures.js?v=20260921-medication-card-v4";
import { normalizePrimaryTeamNote } from "../../patient-context/primary-team-note.js?v=20260921-primary-note-source";
import { normalizeLabBaselines } from "../../patient-context/lab-baselines.js?v=20260925-lab-baselines-v2";
import { NOTE_TYPES, normalizeNoteDraft } from "../../note-drafts/index.js?v=20260929-draft-sections-v1";

export const VAULT_SCHEMA_VERSION = 5;

export const DEFAULT_CONTEXT_SECTION_LABELS = CONTEXT_PACKET_ROLES.map(({ label }) => label);

export function createLocalId(prefix = "id") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function timestampNow() {
  return new Date().toISOString();
}

export function createEmptyVaultState({ now = timestampNow } = {}) {
  return {
    schemaVersion: VAULT_SCHEMA_VERSION,
    activePatientId: "",
    patients: [],
    preferences: normalizeUserPreferences(),
    updatedAt: now()
  };
}

export function createTextSection(label, { id = createLocalId("section"), text = "", role = "", scope = "context", sourceKind = "other_chart_text", resultCategory = "", resultDate = "", resultContext = "", deidentificationSkipped = false, now = timestampNow } = {}) {
  const timestamp = now();
  const normalizedSourceKind = normalizeSourceKindForScope(scope, sourceKind);
  return {
    id,
    label: String(label || "Section").trim() || "Section",
    role: normalizePacketRole(scope, role, label),
    sourceKind: normalizedSourceKind,
    resultCategory: normalizedSourceKind === "results" ? normalizeDiagnosticResultCategory(resultCategory) : "",
    resultDate: normalizedSourceKind === "results" ? String(resultDate || "") : "",
    resultContext: normalizedSourceKind === "results" ? String(resultContext || "") : "",
    deidentifiedText: String(text || ""),
    residualWarnings: [],
    deidentificationSkipped: deidentificationSkipped === true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createDefaultSections(labels, options = {}) {
  const scope = options.scope || "context";
  return labels.map((label, index) => createTextSection(label, { ...options, scope, role: defaultPacketRole(scope, index) }));
}

export function createPatientRecord(
  displayLabel,
  {
    id = createLocalId("patient"),
    metadata = {},
    contextSections = createDefaultSections(DEFAULT_CONTEXT_SECTION_LABELS, { scope: "context" }),
    days = [],
    now = timestampNow
  } = {}
) {
  const timestamp = now();
  return {
    id,
    displayLabel: String(displayLabel || "New patient").trim() || "New patient",
    metadata: { ...metadata },
    contextSections,
    days,
    labBaselines: {},
    archivedAt: "",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function normalizeSection(section, fallbackLabel = "Section", { now = timestampNow, scope = "context", index = 0 } = {}) {
  const timestamp = now();
  const sourceKind = normalizeSourceKindForScope(scope, section?.sourceKind);
  return {
    id: String(section?.id || createLocalId("section")),
    label: String(section?.label || fallbackLabel).trim() || fallbackLabel,
    role: normalizePacketRole(scope, section?.role, section?.label || fallbackLabel, index),
    sourceKind,
    resultCategory: sourceKind === "results" ? normalizeDiagnosticResultCategory(section?.resultCategory) : "",
    resultDate: sourceKind === "results" ? String(section?.resultDate || "") : "",
    resultContext: sourceKind === "results" ? String(section?.resultContext || "") : "",
    deidentifiedText: String(section?.deidentifiedText || ""),
    residualWarnings: sanitizeResidualWarningMetadata(Array.isArray(section?.residualWarnings) ? section.residualWarnings : []),
    createdAt: String(section?.createdAt || timestamp),
    updatedAt: String(section?.updatedAt || section?.createdAt || timestamp)
  };
}

export function normalizeDay(day, index = 0, { now = timestampNow } = {}) {
  const timestamp = now();
  const fallbackDate = new Date(Date.now() + index * 86400000).toISOString().slice(0, 10);
  const sourceCaptures = Array.isArray(day?.sourceCaptures)
    ? day.sourceCaptures.map((capture) => normalizeSourceCapture(capture, { now }))
    : migrateLegacyDailySections(day?.sections || [], { now });
  return {
    id: String(day?.id || createLocalId("day")),
    date: String(day?.date || fallbackDate),
    label: String(day?.label || `Hospital day ${index + 1}`).trim() || `Hospital day ${index + 1}`,
    sourceCaptures,
    primaryTeamNote: normalizeOptionalPrimaryTeamNote(day?.primaryTeamNote, NOTE_TYPES.PROGRESS, { now }),
    // Retired checklist fields (checklistSnapshot, answers, quickNotes) are
    // not carried forward: old vaults still decrypt because normalization
    // only reads known fields, but new day records ignore them entirely.
    openEvidenceOutputs: day?.openEvidenceOutputs && typeof day.openEvidenceOutputs === "object" ? day.openEvidenceOutputs : {},
    // A de-identified OpenEvidence exam note the user pasted in as a
    // physical-exam alternative to the checklist - source material like
    // `sections`, never AI-generated output, so persisting it is consistent
    // with "no OpenEvidence output in the vault."
    openEvidenceExamNote: day?.openEvidenceExamNote && typeof day.openEvidenceExamNote === "object"
      ? {
          text: String(day.openEvidenceExamNote.text || ""),
          residualWarnings: sanitizeResidualWarningMetadata(Array.isArray(day.openEvidenceExamNote.residualWarnings) ? day.openEvidenceExamNote.residualWarnings : []),
          savedAt: String(day.openEvidenceExamNote.savedAt || "")
        }
      : null,
    createdAt: String(day?.createdAt || timestamp),
    updatedAt: String(day?.updatedAt || day?.createdAt || timestamp)
  };
}

function normalizeOptionalPrimaryTeamNote(value, noteType, { now = timestampNow, patientId = "", hospitalDayId = "" } = {}) {
  if (!value || typeof value !== "object") return null;
  return normalizePrimaryTeamNote(value, noteType, { now, patientId, hospitalDayId });
}

function normalizeSavedNoteDrafts(value, patient, { now = timestampNow } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, draft]) => key && draft && typeof draft === "object")
      .map(([key, draft]) => [
        key,
        normalizeNoteDraft({
          ...draft,
          noteType: key === "admission" ? NOTE_TYPES.H_AND_P : NOTE_TYPES.PROGRESS,
          patientId: draft.patientId || patient?.id || "",
          hospitalDayId: key === "admission" ? "" : (draft.hospitalDayId || key)
        }, { now })
      ])
  );
}

export function normalizeTemperatureUnits(value) {
  const entries = value && typeof value === "object" ? Object.entries(value) : [];
  const next = {};
  for (const [key, unit] of entries) {
    const candidateId = String(key || "").trim();
    if (!candidateId) continue;
    if (unit === "°F" || unit === "°C") next[candidateId] = unit;
  }
  return next;
}

export function normalizePatient(patient, index = 0, { now = timestampNow } = {}) {
  const timestamp = now();
  const labels = DEFAULT_CONTEXT_SECTION_LABELS;
  const contextSections = Array.isArray(patient?.contextSections) && patient.contextSections.length
    ? patient.contextSections.map((section, sectionIndex) => normalizeSection(section, labels[sectionIndex] || packetRoleLabel("context", defaultPacketRole("context", sectionIndex), "Context"), { now, scope: "context", index: sectionIndex }))
    : createDefaultSections(labels, { now, scope: "context" });
  const id = String(patient?.id || createLocalId("patient"));
  return {
    id,
    displayLabel: String(patient?.displayLabel || patient?.label || `Patient ${index + 1}`).trim() || `Patient ${index + 1}`,
    metadata: patient?.metadata && typeof patient.metadata === "object" ? { ...patient.metadata } : {},
    contextSections,
    admissionPrimaryTeamNote: normalizeOptionalPrimaryTeamNote(patient?.admissionPrimaryTeamNote, NOTE_TYPES.H_AND_P, { now, patientId: id }),
    noteDrafts: normalizeSavedNoteDrafts(patient?.noteDrafts, { ...patient, id }, { now }),
    labBaselines: normalizeLabBaselines(patient?.labBaselines),
    temperatureUnits: normalizeTemperatureUnits(patient?.temperatureUnits),
    days: Array.isArray(patient?.days)
      ? patient.days.map((day, dayIndex) => {
          const normalized = normalizeDay(day, dayIndex, { now });
          return normalized.primaryTeamNote
            ? { ...normalized, primaryTeamNote: normalizeOptionalPrimaryTeamNote(normalized.primaryTeamNote, NOTE_TYPES.PROGRESS, { now, patientId: id, hospitalDayId: normalized.id }) }
            : normalized;
        })
      : [],
    archivedAt: String(patient?.archivedAt || ""),
    createdAt: String(patient?.createdAt || timestamp),
    updatedAt: String(patient?.updatedAt || patient?.createdAt || timestamp)
  };
}

export function migrateVaultState(value, { now = timestampNow } = {}) {
  const base = value && typeof value === "object" ? value : {};
  // Archiving is a destructive removal in the current contract. Older vault
  // records used an archivedAt marker instead, so discard those records while
  // normalizing rather than allowing them to remain readable through an
  // activePatientId left behind by the older build.
  const patients = (Array.isArray(base.patients) ? base.patients.map((patient, index) => normalizePatient(patient, index, { now })) : [])
    .filter((patient) => !patient.archivedAt);
  const activePatientId = patients.some((patient) => patient.id === base.activePatientId)
    ? String(base.activePatientId)
    : patients[0]?.id || "";
  return {
    schemaVersion: VAULT_SCHEMA_VERSION,
    activePatientId,
    patients,
    // Retired Workups fields (workupOverrides, selectedWorkupIds,
    // hiddenWorkupIds) are tolerated on decrypt but not carried forward.
    preferences: normalizeUserPreferences(base.preferences),
    updatedAt: String(base.updatedAt || now())
  };
}

export function activePatient(vault) {
  return (vault?.patients || []).find((patient) => patient.id === vault.activePatientId && !patient.archivedAt) || null;
}

export function upsertPatient(vault, nextPatient, { activate = true, now = timestampNow } = {}) {
  const current = migrateVaultState(vault, { now });
  const patient = normalizePatient({ ...nextPatient, updatedAt: now() }, 0, { now });
  const exists = current.patients.some((entry) => entry.id === patient.id);
  const patients = exists ? current.patients.map((entry) => (entry.id === patient.id ? patient : entry)) : [...current.patients, patient];
  return {
    ...current,
    patients,
    activePatientId: activate ? patient.id : current.activePatientId,
    updatedAt: now()
  };
}

export function updateActivePatient(vault, updater, { now = timestampNow } = {}) {
  const current = migrateVaultState(vault, { now });
  const patient = activePatient(current);
  if (!patient) return current;
  const nextPatient = normalizePatient({ ...updater(patient), updatedAt: now() }, 0, { now });
  return {
    ...current,
    patients: current.patients.map((entry) => (entry.id === patient.id ? nextPatient : entry)),
    updatedAt: now()
  };
}

export function archivePatient(vault, patientId, { now = timestampNow } = {}) {
  const current = migrateVaultState(vault, { now });
  const patients = current.patients.filter((patient) => patient.id !== patientId);
  const nextActive = current.activePatientId === patientId ? patients[0]?.id || "" : current.activePatientId;
  return { ...current, patients, activePatientId: nextActive, updatedAt: now() };
}

export function setActivePatient(vault, patientId, { now = timestampNow } = {}) {
  const current = migrateVaultState(vault, { now });
  return current.patients.some((patient) => patient.id === patientId) ? { ...current, activePatientId: patientId, updatedAt: now() } : current;
}
