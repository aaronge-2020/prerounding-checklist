import { normalizeUserPreferences } from "../preferences.js";

export const VAULT_SCHEMA_VERSION = 2;

export const DEFAULT_CONTEXT_SECTION_LABELS = ["Admission context", "Medications", "Labs", "Other"];
export const DEFAULT_DAILY_SECTION_LABELS = [
  "Interval events",
  "New labs/results",
  "Medication changes",
  "Patient-reported symptoms",
  "Other"
];

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
    workupOverrides: {},
    selectedWorkupIds: [],
    preferences: normalizeUserPreferences(),
    updatedAt: now()
  };
}

export function createTextSection(label, { id = createLocalId("section"), text = "", now = timestampNow } = {}) {
  const timestamp = now();
  return {
    id,
    label: String(label || "Section").trim() || "Section",
    deidentifiedText: String(text || ""),
    residualWarnings: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createDefaultSections(labels, options = {}) {
  return labels.map((label) => createTextSection(label, options));
}

export function createPatientRecord(
  displayLabel,
  {
    id = createLocalId("patient"),
    metadata = {},
    contextSections = createDefaultSections(DEFAULT_CONTEXT_SECTION_LABELS),
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
    archivedAt: "",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function normalizeSection(section, fallbackLabel = "Section", { now = timestampNow } = {}) {
  const timestamp = now();
  return {
    id: String(section?.id || createLocalId("section")),
    label: String(section?.label || fallbackLabel).trim() || fallbackLabel,
    deidentifiedText: String(section?.deidentifiedText || ""),
    residualWarnings: Array.isArray(section?.residualWarnings) ? section.residualWarnings : [],
    createdAt: String(section?.createdAt || timestamp),
    updatedAt: String(section?.updatedAt || section?.createdAt || timestamp)
  };
}

export function normalizeDay(day, index = 0, { now = timestampNow } = {}) {
  const timestamp = now();
  const fallbackDate = new Date(Date.now() + index * 86400000).toISOString().slice(0, 10);
  const labels = DEFAULT_DAILY_SECTION_LABELS;
  const sections = Array.isArray(day?.sections) && day.sections.length
    ? day.sections.map((section, sectionIndex) => normalizeSection(section, labels[sectionIndex] || "Daily update", { now }))
    : createDefaultSections(labels, { now });
  return {
    id: String(day?.id || createLocalId("day")),
    date: String(day?.date || fallbackDate),
    label: String(day?.label || `Hospital day ${index + 1}`).trim() || `Hospital day ${index + 1}`,
    sections,
    checklistSnapshot: day?.checklistSnapshot || null,
    answers: day?.answers && typeof day.answers === "object" ? day.answers : {},
    quickNotes: Array.isArray(day?.quickNotes) ? day.quickNotes : [],
    openEvidenceOutputs: day?.openEvidenceOutputs && typeof day.openEvidenceOutputs === "object" ? day.openEvidenceOutputs : {},
    createdAt: String(day?.createdAt || timestamp),
    updatedAt: String(day?.updatedAt || day?.createdAt || timestamp)
  };
}

export function normalizePatient(patient, index = 0, { now = timestampNow } = {}) {
  const timestamp = now();
  const labels = DEFAULT_CONTEXT_SECTION_LABELS;
  const contextSections = Array.isArray(patient?.contextSections) && patient.contextSections.length
    ? patient.contextSections.map((section, sectionIndex) => normalizeSection(section, labels[sectionIndex] || "Context", { now }))
    : createDefaultSections(labels, { now });
  return {
    id: String(patient?.id || createLocalId("patient")),
    displayLabel: String(patient?.displayLabel || patient?.label || `Patient ${index + 1}`).trim() || `Patient ${index + 1}`,
    metadata: patient?.metadata && typeof patient.metadata === "object" ? { ...patient.metadata } : {},
    contextSections,
    days: Array.isArray(patient?.days) ? patient.days.map((day, dayIndex) => normalizeDay(day, dayIndex, { now })) : [],
    archivedAt: String(patient?.archivedAt || ""),
    createdAt: String(patient?.createdAt || timestamp),
    updatedAt: String(patient?.updatedAt || patient?.createdAt || timestamp)
  };
}

export function migrateVaultState(value, { now = timestampNow } = {}) {
  const base = value && typeof value === "object" ? value : {};
  const patients = Array.isArray(base.patients) ? base.patients.map((patient, index) => normalizePatient(patient, index, { now })) : [];
  const activePatientId = patients.some((patient) => patient.id === base.activePatientId)
    ? String(base.activePatientId)
    : patients.find((patient) => !patient.archivedAt)?.id || patients[0]?.id || "";
  return {
    schemaVersion: VAULT_SCHEMA_VERSION,
    activePatientId,
    patients,
    workupOverrides: base.workupOverrides && typeof base.workupOverrides === "object" ? { ...base.workupOverrides } : {},
    selectedWorkupIds: Array.isArray(base.selectedWorkupIds) ? base.selectedWorkupIds.map(String) : [],
    preferences: normalizeUserPreferences(base.preferences),
    updatedAt: String(base.updatedAt || now())
  };
}

export function activePatient(vault) {
  return (vault?.patients || []).find((patient) => patient.id === vault.activePatientId) || null;
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

export function setSelectedWorkups(vault, workupIds, { now = timestampNow } = {}) {
  return {
    ...migrateVaultState(vault, { now }),
    selectedWorkupIds: [...new Set((workupIds || []).map(String).filter(Boolean))],
    updatedAt: now()
  };
}

export function setWorkupOverride(vault, workup, { now = timestampNow } = {}) {
  const current = migrateVaultState(vault, { now });
  return {
    ...current,
    workupOverrides: { ...current.workupOverrides, [workup.id]: workup },
    updatedAt: now()
  };
}

export function setWorkupOverrides(vault, workupOverrides, { now = timestampNow } = {}) {
  const current = migrateVaultState(vault, { now });
  return {
    ...current,
    workupOverrides: { ...(workupOverrides || {}) },
    updatedAt: now()
  };
}

export function removeWorkupOverride(vault, workupId, { now = timestampNow } = {}) {
  const current = migrateVaultState(vault, { now });
  const nextOverrides = { ...current.workupOverrides };
  delete nextOverrides[workupId];
  return { ...current, workupOverrides: nextOverrides, updatedAt: now() };
}
