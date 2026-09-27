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
