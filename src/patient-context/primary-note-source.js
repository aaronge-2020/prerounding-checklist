import { parsePrimaryTeamNote } from "./primary-team-note-parser.js?v=20261015-sample-note-sections";
import { normalizePrimaryTeamNote } from "./primary-team-note.js?v=20260921-primary-note-source";

// One read boundary for the two explicitly supported primary-note storage
// forms: a sectioned note, or a retained de-identified primary_note capture.
// Derive sections from that capture; do not persist a competing second copy,
// inspect arbitrary chart text, or rehydrate the original sample fixture.
export function packetPrimaryNoteSource(patient, packetId) {
  const admission = packetId === "admission";
  const day = admission ? null : patient?.days?.find((entry) => entry.id === packetId);
  const structured = admission ? patient?.admissionPrimaryTeamNote : day?.primaryTeamNote;
  if (structured) return { note: structured, representation: "sections", reason: "" };
  const captures = (admission ? patient?.contextSections : day?.sourceCaptures) || [];
  const primary = captures.filter((capture) => capture.sourceKind === "primary_note" && String(capture.deidentifiedText || "").trim());
  if (!primary.length) return { note: null, representation: "", reason: "" };
  if (primary.length !== 1)
    return {
      note: null,
      representation: "capture",
      reason:
        "This packet has multiple primary-note sources. Choose and save the intended note in the section editor before pulling sections."
    };
  const capture = primary[0];
  if (capture.deidentificationSkipped)
    return { note: null, representation: "capture", reason: "De-identify the primary-note source before pulling sections." };
  const noteType = admission ? "hp" : "progress";
  const parsed = parsePrimaryTeamNote(capture.deidentifiedText, noteType);
  const timestamp = String(capture.updatedAt || capture.createdAt || "");
  const sections = Object.fromEntries(
    Object.entries(parsed.sections).map(([id, text]) => [
      id,
      {
        deidentifiedText: text,
        residualWarnings: text.trim() ? capture.residualWarnings || [] : [],
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ])
  );
  const note = normalizePrimaryTeamNote({ id: capture.id, sections, createdAt: timestamp, updatedAt: timestamp }, noteType, {
    patientId: patient.id,
    hospitalDayId: admission ? "" : packetId,
    now: () => timestamp
  });
  return { note: { ...note, parsedProblems: parsed.parsedProblems, sourceCaptureId: capture.id }, representation: "capture", reason: "" };
}
