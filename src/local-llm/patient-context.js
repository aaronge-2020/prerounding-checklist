// Builds the in-memory patient context attached to Local AI chat so the
// user can ask the model anything about the active patient.
//
// Pure function of the vault patient record: admission context sections
// plus the hospital course, truncated to a token-safe budget. Rebuilt on
// every send (never persisted anywhere), so chart edits are always
// reflected. Only de-identified vault text is used.

export const MAX_PATIENT_CONTEXT_CHARS = 6000;

export function textOf(value) {
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

// ---------------------------------------------------------------------------
// Selectable context pieces: the Local AI "Context" inspector shows the user
// exactly which chart documents are available and lets them choose which
// ones ride along in the model's context. Pure functions of the vault
// patient record; selection state itself lives in the chat controller's
// in-memory state (never persisted), and the assembled prompt is rebuilt
// per send and never stored anywhere.
//
// A piece is { id, group, label, kind, chars, primary }:
//   id      stable selector, "admission:<sectionId>" | "day:<dayId>:<captureId>"
//           | "day:<dayId>:quicknotes" | "draft:current"
//   group   "Admission", the hospital-day label (with date), or "Draft note"
//   label   the section/capture label shown in the inspector
//   kind    the vault sourceKind (primary_note, laboratory_results, ...)
//           or "draft_note" for the in-progress note
//   chars   de-identified character count (for token estimates)
//   primary true when sourceKind === "primary_note"
//
// The optional draftNoteText (the student's current draft note, rendered as
// plain text by the Review controller) is appended as one opt-in piece when
// non-empty. It is never selected by default: it is in-progress work, so the
// user attaches it explicitly.

export function listPatientContextPieces(patient, { draftNoteText = "" } = {}) {
  if (!patient || typeof patient !== "object") return [];
  const pieces = [];
  for (const section of patient.contextSections || []) {
    const text = sectionText(section);
    if (!text) continue;
    pieces.push({
      id: `admission:${textOf(section?.id) || pieces.length}`,
      group: "Admission",
      label: textOf(section?.label) || "Admission note",
      kind: String(section?.sourceKind || ""),
      chars: text.length,
      primary: String(section?.sourceKind || "") === "primary_note"
    });
  }
  for (const day of patient.days || []) {
    const dayLabel = textOf(day?.label) || "Hospital day";
    const dayDate = textOf(day?.date);
    const group = dayDate ? `${dayLabel} (${dayDate})` : dayLabel;
    const dayId = textOf(day?.id) || group;
    for (const capture of day?.sourceCaptures || []) {
      const text = sectionText(capture);
      if (!text) continue;
      pieces.push({
        id: `day:${dayId}:${textOf(capture?.id) || pieces.length}`,
        group,
        label: textOf(capture?.label) || "Note",
        kind: String(capture?.sourceKind || ""),
        chars: text.length,
        primary: String(capture?.sourceKind || "") === "primary_note"
      });
    }
    const quickNotes = (day?.quickNotes || []).map(textOf).filter(Boolean);
    if (quickNotes.length) {
      pieces.push({
        id: `day:${dayId}:quicknotes`,
        group,
        label: "Quick notes",
        kind: "quick_notes",
        chars: quickNotes.join("\n").length,
        primary: false
      });
    }
  }
  const draft = textOf(draftNoteText);
  if (draft) {
    pieces.push({
      id: "draft:current",
      group: "Draft note",
      label: "Current draft note",
      kind: "draft_note",
      chars: draft.length,
      primary: false
    });
  }
  return pieces;
}

// Default selection: the primary team note(s) when they exist — the single
// most useful chart document for chat. When no primary note exists, fall
// back to the admission sections so "tell me about this patient" still has
// something to work with instead of silently attaching nothing.
export function defaultSelectedPieceIds(patient) {
  const pieces = listPatientContextPieces(patient);
  const primary = pieces.filter((piece) => piece.primary);
  if (primary.length) return primary.map((piece) => piece.id);
  return pieces.filter((piece) => piece.group === "Admission").map((piece) => piece.id);
}

export function pieceText(patient, piece, { draftNoteText = "" } = {}) {
  if (!patient || !piece) return "";
  if (piece.id === "draft:current") {
    const draft = textOf(draftNoteText);
    return draft ? `## Current draft note (in progress)\n${draft}` : "";
  }
  if (piece.id.startsWith("admission:")) {
    const section = (patient.contextSections || []).find(
      (candidate) => `admission:${textOf(candidate?.id)}` === piece.id
    );
    // Fall back to label match for sections whose vault id is missing.
    const target = section || (patient.contextSections || []).find(
      (candidate) => (textOf(candidate?.label) || "Admission note") === piece.label && sectionText(candidate)
    );
    return target ? `## ${textOf(target.label) || "Admission note"}\n${sectionText(target)}` : "";
  }
  const rest = piece.id.slice(4);
  const dayId = rest.slice(0, rest.lastIndexOf(":"));
  const captureId = rest.slice(rest.lastIndexOf(":") + 1);
  const day = (patient.days || []).find((candidate) => textOf(candidate?.id) === dayId)
    || (patient.days || []).find((candidate) => {
      const label = textOf(candidate?.label) || "Hospital day";
      const date = textOf(candidate?.date);
      return (date ? `${label} (${date})` : label) === piece.group;
    });
  if (!day) return "";
  if (captureId === "quicknotes") {
    const quickNotes = (day?.quickNotes || []).map(textOf).filter(Boolean);
    if (!quickNotes.length) return "";
    return `### ${piece.group} — Quick notes\n${quickNotes.map((note) => `- ${note}`).join("\n")}`;
  }
  const capture = (day?.sourceCaptures || []).find(
    (candidate) => textOf(candidate?.id) === captureId
  ) || (day?.sourceCaptures || []).find(
    (candidate) => (textOf(candidate?.label) || "Note") === piece.label && sectionText(candidate)
  );
  if (!capture || !sectionText(capture)) return "";
  return `### ${piece.group} — ${textOf(capture.label) || "Note"}\n${sectionText(capture)}`;
}

// Assemble the patient context from the user's selected pieces only.
// Unknown/stale ids are ignored; empty selection yields "". Rebuilt on
// every send, never persisted.
export const MAX_SELECTED_PIECES_CHARS = 6000;
export function buildPatientContextFromPieces(patient, selectedIds, { maxChars = MAX_SELECTED_PIECES_CHARS, draftNoteText = "" } = {}) {
  if (!patient || typeof patient !== "object") return "";
  const budget = Math.max(500, Number(maxChars) || MAX_SELECTED_PIECES_CHARS);
  const wanted = new Set(Array.isArray(selectedIds) ? selectedIds.map(String) : []);
  if (!wanted.size) return "";

  const headerBits = [`PATIENT: ${textOf(patient.displayLabel) || "Active patient"}`];
  const admissionDate = textOf(patient.metadata?.admissionDate);
  if (admissionDate) headerBits.push(`Admitted: ${admissionDate}`);

  const parts = [];
  const pieceOpts = { draftNoteText };
  for (const piece of listPatientContextPieces(patient, pieceOpts)) {
    if (!wanted.has(piece.id)) continue;
    const text = pieceText(patient, piece, pieceOpts);
    if (text) parts.push(text);
  }
  if (!parts.length) return "";
  let out = `${headerBits.join("\n")}\n\n${parts.join("\n\n")}`;
  if (out.length > budget) out = `${out.slice(0, budget - 3).trimEnd()}...`;
  return out;
}
// ---------------------------------------------------------------------------
// Full-chart context: the API (ChatGPT) path sends the ENTIRE chart text —
// every chart piece in canonical listPatientContextPieces order — through
// the de-identification review gate. The budget for the full chart is NOT
// this constant: the controller derives it from the selected API model's
// real context window (fullChartBudgetChars in ui/ai-chat/delta-review.js),
// reserving headroom for the system prompt, history, question, and reply.
// MAX_FULL_CHART_CHARS survives only as the conservative fallback for an
// unknown model and as the default budget of the pure builders below.
export const MAX_FULL_CHART_CHARS = 200000;

export function buildFullChartContextText(patient, { maxChars = MAX_FULL_CHART_CHARS, draftNoteText = "" } = {}) {
  if (!patient || typeof patient !== "object") return "";
  const budget = Math.max(500, Number(maxChars) || MAX_FULL_CHART_CHARS);

  const headerBits = [`PATIENT: ${textOf(patient.displayLabel) || "Active patient"}`];
  const admissionDate = textOf(patient.metadata?.admissionDate);
  if (admissionDate) headerBits.push(`Admitted: ${admissionDate}`);

  const parts = [];
  const pieceOpts = { draftNoteText };
  for (const piece of listPatientContextPieces(patient, pieceOpts)) {
    const text = pieceText(patient, piece, pieceOpts);
    if (text) parts.push(text);
  }
  if (!parts.length) return "";
  let out = `${headerBits.join("\n")}\n\n${parts.join("\n\n")}`;
  if (out.length > budget) out = `${out.slice(0, budget - 3).trimEnd()}...`;
  return out;
};


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
