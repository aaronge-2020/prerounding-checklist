import { renderNoteSectionEntries } from "../note-drafts/render.js?v=20261011-ai-helper";

// Use the same reviewed content as Preview & copy, including clinician edits
// and selected objective results. Never include other problems or raw sources.
export function buildConsultNoteContext(draft) {
  const headings = new Set(["One-Liner", "Chief Complaint", "History of Present Illness", "HPI", "Interval Events", "Patient Report", "Subjective", "Relevant History", "Physical Exam", "Objective", "Medications"]);
  return renderNoteSectionEntries(draft)
    .filter((entry) => headings.has(entry.heading))
    .map((entry) => entry.text)
    .join("\n\n");
}
