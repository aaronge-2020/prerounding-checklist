// Builds the in-memory patient context attached to Local AI chat so the
// user can ask the model anything about the active patient.
//
// Pure function of the vault patient record: admission context sections
// plus the hospital course, truncated to a token-safe budget. Rebuilt on
// every send (never persisted anywhere), so chart edits are always
// reflected. Only de-identified vault text is used.

export const MAX_PATIENT_CONTEXT_CHARS = 6000;

function textOf(value) {
  return String(value ?? "").trim();
}

function sectionText(section) {
  return textOf(section?.deidentifiedText);
}

// One hospital day -> "## <label> (<date>)" with its captures and quick
// notes. Returns "" when the day carries no text at all.
function dayPart(day) {
  const lines = [];
  const heading = textOf(day?.label) || "Hospital day";
  const date = textOf(day?.date);
  lines.push(`## ${heading}${date ? ` (${date})` : ""}`);
  for (const capture of day?.sourceCaptures || []) {
    const text = sectionText(capture);
    if (!text) continue;
    const label = textOf(capture?.label) || "Note";
    lines.push(`### ${label}\n${text}`);
  }
  const quickNotes = (day?.quickNotes || []).map(textOf).filter(Boolean);
  if (quickNotes.length) {
    lines.push(`### Quick notes\n${quickNotes.map((note) => `- ${note}`).join("\n")}`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

export function buildPatientContextText(patient, { maxChars = MAX_PATIENT_CONTEXT_CHARS } = {}) {
  if (!patient || typeof patient !== "object") return "";
  const budget = Math.max(500, Number(maxChars) || MAX_PATIENT_CONTEXT_CHARS);

  const headerBits = [`PATIENT: ${textOf(patient.displayLabel) || "Active patient"}`];
  const admissionDate = textOf(patient.metadata?.admissionDate);
  if (admissionDate) headerBits.push(`Admitted: ${admissionDate}`);

  const admissionParts = [];
  for (const section of patient.contextSections || []) {
    const text = sectionText(section);
    if (!text) continue;
    admissionParts.push(`## ${textOf(section.label) || "Admission note"}\n${text}`);
  }
  const head = [...headerBits, "", "ADMISSION CONTEXT:", ...admissionParts].join("\n");

  // Days are added newest-first so budget pressure drops the oldest days;
  // the kept days are then re-chronologized for the model.
  const dayParts = (patient.days || []).map(dayPart).filter(Boolean);
  const newestFirst = [...dayParts].reverse();
  const kept = [];
  let used = head.length;
  for (const part of newestFirst) {
    if (used + part.length + 2 > budget) break;
    kept.push(part);
    used += part.length + 2;
  }
  kept.reverse();

  let out = head;
  if (kept.length) out += `\n\nHOSPITAL COURSE:\n${kept.join("\n\n")}`;
  if (out.length > budget) out = `${out.slice(0, budget - 3).trimEnd()}...`;
  return out;
}

// The single most useful chart document for chat: the latest primary team
// note ("primary_note" source capture — the latest primary-team note or
// interval update copied from Epic). The full admission context plus
// hospital course does not fit the on-device model's 4096-token window
// alongside a growing conversation, so chat attaches just this note.
//
// Selection: newest hospital day first — the first day (in reverse
// chronological order) whose sourceCaptures holds a primary_note capture
// with non-empty de-identified text; falls back to the admission
// contextSections entry with sourceKind "primary_note" (the H&P).
// Rebuilt on every send, never persisted. Returns "" when no primary
// note exists anywhere.
export const MAX_PRIMARY_NOTE_CHARS = 3000;

export function buildPrimaryTeamNoteText(patient, { maxChars = MAX_PRIMARY_NOTE_CHARS } = {}) {
  if (!patient || typeof patient !== "object") return "";
  const budget = Math.max(500, Number(maxChars) || MAX_PRIMARY_NOTE_CHARS);

  const headerBits = [`PATIENT: ${textOf(patient.displayLabel) || "Active patient"}`];
  const admissionDate = textOf(patient.metadata?.admissionDate);
  if (admissionDate) headerBits.push(`Admitted: ${admissionDate}`);
  const head = headerBits.join("\n");

  let note = "";
  let noteLabel = "";
  const days = [...(patient.days || [])].reverse();
  for (const day of days) {
    const capture = (day?.sourceCaptures || []).find(
      (candidate) =>
        String(candidate?.sourceKind || "") === "primary_note" && sectionText(candidate)
    );
    if (capture) {
      note = sectionText(capture);
      const dayLabel = textOf(day?.label) || "Hospital day";
      const dayDate = textOf(day?.date);
      noteLabel = `${dayLabel}${dayDate ? ` (${dayDate})` : ""}`;
      break;
    }
  }
  if (!note) {
    const section = (patient.contextSections || []).find(
      (candidate) =>
        String(candidate?.sourceKind || "") === "primary_note" && sectionText(candidate)
    );
    if (section) {
      note = sectionText(section);
      noteLabel = "Admission";
    }
  }
  if (!note) return "";

  let out = `${head}\n\nPRIMARY TEAM NOTE${noteLabel ? ` (${noteLabel})` : ""}:\n${note}`;
  if (out.length > budget) out = `${out.slice(0, budget - 3).trimEnd()}...`;
  return out;
}
