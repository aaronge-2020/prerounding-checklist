// Pure source assembly. Choose one provenance-bearing representation; never
// concatenate an imported note with its derived working draft.
export const NOTE_SOURCE_LABELS = Object.freeze({ one_liner: "Documented baseline", chief_complaint: "Reason for prior visit", history_of_present_illness: "Prior HPI", past_medical_history: "Medical history", past_surgical_history: "Surgical history", medications: "Medication list", allergies: "Allergies", family_history: "Family history", social_history: "Social history", review_of_systems: "Prior review of systems", physical_exam: "Prior examination", objective: "Prior objective findings", selected_medications: "Selected medication data", selected_results: "Selected chart results", results: "Chart results", assessment: "Prior assessment", plan: "Prior plan", other: "Other documented history" });
const workingFields = { "One-Liner": "one_liner", "Chief Complaint": "chief_complaint", "History of Present Illness": "history_of_present_illness", "HPI": "history_of_present_illness", "Subjective": "history_of_present_illness", "Medications": "medications", "Allergies": "allergies", "Objective": "objective", "Physical Exam": "physical_exam", "Assessment": "assessment", "Plan": "plan" };
const text = value => typeof value === "string" ? value : String(value?.deidentifiedText || "");
export function buildLocalNoteSources({ importedSections = {}, draftEntries = [] } = {}) {
  const entries = Object.entries(importedSections).map(([key, value]) => [key, text(value).trim()]).filter(([, value]) => value);
  const objective = draftEntries.filter(entry => ["Objective", "Medications"].includes(entry.heading) && String(entry.text || "").trim()).map(entry => `## ${entry.heading === "Medications" ? "selected_medications" : "selected_results"}\n${entry.text}`);
  const imported = entries.map(([key, value]) => `## ${key}\n${value}`).concat(objective).join("\n\n");
  const working = draftEntries.filter(entry => String(entry.text || "").trim()).map(entry => `## ${workingFields[entry.heading] || entry.heading}\n${entry.text}`).join("\n\n");
  return [entries.length ? { id: "imported", label: "Imported note + selected clinical data", text: imported } : null, working ? { id: "working", label: "Current working draft (includes edits)", text: working } : null].filter(Boolean);
}
