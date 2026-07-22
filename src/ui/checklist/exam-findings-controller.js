import { createTextSection, updateActivePatient } from "../../app/state/vault.js";
import { clearOpenEvidenceExamNote, latestDay, saveOpenEvidenceExamNote, upsertDay } from "../../daily-updates/days.js";
import { sanitizeResidualWarningMetadata } from "../../patient-context/review.js";

export function createExamFindingsController({ state, active, persistVault, setStatus }) {
  async function saveExamFindings({ text, source, residualWarnings = [] }) {
    const patient = active();
    if (!patient) throw new Error("Add a patient before saving physical exam findings.");
    const targetDay = latestDay(patient.days || []);
    const now = new Date().toISOString();
    state.vault = updateActivePatient(state.vault, (current) => {
      if (targetDay) {
        const currentDay = (current.days || []).find((entry) => entry.id === targetDay.id);
        return currentDay
          ? {
              ...current,
              days: upsertDay(current.days, {
                ...saveOpenEvidenceExamNote(currentDay, { text, residualWarnings }),
                sections: upsertExamFindingsSection(currentDay.sections, text, residualWarnings, now)
              }),
              contextSections: (current.contextSections || []).filter((section) => !/^Physical exam findings -/.test(section.label || ""))
            }
          : current;
      }
      const label = "Physical exam findings - Admission";
      const existing = (current.contextSections || []).find((section) => section.label === label);
      const section = {
        ...(existing || createTextSection(label)),
        label,
        deidentifiedText: String(text || ""),
        residualWarnings: sanitizeResidualWarningMetadata(residualWarnings),
        updatedAt: now
      };
      return {
        ...current,
        contextSections: existing
          ? current.contextSections.map((entry) => (entry.id === existing.id ? section : entry))
          : [...(current.contextSections || []), section]
      };
    });
    const destination = targetDay ? `${targetDay.label} (${targetDay.date})` : "Admission";
    await persistVault(`Saved ${source.toLowerCase()} physical exam findings to ${destination}.`);
    setStatus(`${source} physical exam findings saved to ${destination}.`);
  }

  async function clearExamFindings() {
    const patient = active();
    if (!patient) return;
    const targetDay = latestDay(patient.days || []);
    state.vault = updateActivePatient(state.vault, (current) => {
      if (targetDay) {
        const currentDay = (current.days || []).find((entry) => entry.id === targetDay.id);
        return currentDay
          ? { ...current, days: upsertDay(current.days, {
              ...clearOpenEvidenceExamNote(currentDay),
              sections: (currentDay.sections || []).filter((section) => section.label !== "Physical exam findings")
            }) }
          : current;
      }
      return { ...current, contextSections: (current.contextSections || []).filter((section) => section.label !== "Physical exam findings - Admission") };
    });
    await persistVault("Cleared the saved physical exam findings.");
  }

  return Object.freeze({ saveExamFindings, clearExamFindings });
}

function upsertExamFindingsSection(sections = [], text, residualWarnings, updatedAt) {
  const existing = sections.find((section) => section.label === "Physical exam findings");
  const next = {
    ...(existing || createTextSection("Physical exam findings")),
    label: "Physical exam findings",
    deidentifiedText: String(text || ""),
    residualWarnings: sanitizeResidualWarningMetadata(residualWarnings),
    updatedAt
  };
  return existing
    ? sections.map((section) => section.id === existing.id ? next : section)
    : [...sections, next];
}
