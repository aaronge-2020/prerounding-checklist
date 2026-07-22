import { DEFAULT_DAILY_SECTION_LABELS, createDefaultSections, createLocalId, normalizeDay, timestampNow } from "../app/state/vault.js";
import { sectionsToPromptBlock } from "../patient-context/sections.js";

export function localCalendarDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDailyRecord({ date = localCalendarDate(), label = "", now = timestampNow } = {}) {
  return normalizeDay(
    {
      id: createLocalId("day"),
      date,
      label: label || `Hospital day ${date}`,
      sections: createDefaultSections(DEFAULT_DAILY_SECTION_LABELS, { now, scope: "daily" }),
      answers: {},
      openEvidenceOutputs: {},
      openEvidenceExamNote: null
    },
    0,
    { now }
  );
}

export function upsertDay(days = [], nextDay) {
  const day = normalizeDay(nextDay);
  return days.some((entry) => entry.id === day.id) ? days.map((entry) => (entry.id === day.id ? day : entry)) : [...days, day];
}

export function removeDay(days = [], dayId = "") {
  return (days || []).filter((day) => day.id !== dayId);
}

export function sortDays(days = []) {
  return [...days].sort((a, b) => `${a.date || ""} ${a.createdAt || ""}`.localeCompare(`${b.date || ""} ${b.createdAt || ""}`));
}

export function latestDay(days = []) {
  return sortDays(days).at(-1) || null;
}

export function dayById(days = [], dayId = "") {
  return days.find((day) => day.id === dayId) || null;
}

export function buildTrajectoryBlock(patient, { selectedDayId = "", includeAllDays = true } = {}) {
  const days = sortDays(patient?.days || []);
  const selected = selectedDayId ? days.filter((day) => day.id === selectedDayId) : [];
  const includedDays = includeAllDays ? days : selected;
  if (!includedDays.length) return "Hospital trajectory. No saved daily updates.";
  const rendered = includedDays.map((day) => {
    const body = sectionsToPromptBlock(day.sections, `${day.date} - ${day.label}`);
    return body;
  });
  return `Hospital trajectory.\n\n${rendered.join("\n\n")}`;
}

export function saveOpenEvidenceOutput(day, taskId, text) {
  if (!day) return day;
  return {
    ...day,
    openEvidenceOutputs: {
      ...(day.openEvidenceOutputs || {}),
      [taskId]: {
        text: String(text || ""),
        savedAt: new Date().toISOString()
      }
    },
    updatedAt: new Date().toISOString()
  };
}

export function saveOpenEvidenceExamNote(day, { text = "", residualWarnings = [], now = timestampNow } = {}) {
  if (!day) return day;
  return {
    ...day,
    openEvidenceExamNote: {
      text: String(text || ""),
      residualWarnings: Array.isArray(residualWarnings) ? residualWarnings : [],
      savedAt: now()
    },
    updatedAt: now()
  };
}

export function clearOpenEvidenceExamNote(day, { now = timestampNow } = {}) {
  if (!day) return day;
  return { ...day, openEvidenceExamNote: null, updatedAt: now() };
}
