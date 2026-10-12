// Pure correction operations. Original chart text stays at the session edge.
// Moving a range never reparses, summarizes, or overwrites the destination.
export function applyNoteSelection(sections, { from, to, text, start, end, fieldIds, original }) {
  const current = from ? String(sections[from] || "") : String(original || "");
  if (current !== text) throw new Error("The source changed. Highlight the passage again.");
  return from
    ? moveNoteText(sections, { from, to, start, end, fieldIds })
    : appendSourceSelection(sections, { text, start, end, to, fieldIds });
}

export function moveNoteText(sections, { from, to, start = 0, end, fieldIds }) {
  if (!fieldIds.includes(from) || !fieldIds.includes(to) || from === to) {
    throw new Error("Choose a different destination section.");
  }
  const source = String(sections[from] || "");
  const finish = end ?? source.length;
  if (!Number.isInteger(start) || !Number.isInteger(finish) || start < 0 || finish > source.length || finish <= start) {
    throw new Error("Select text in the section, or move the whole section.");
  }
  const moved = source.slice(start, finish);
  if (!moved.trim()) throw new Error("There is no text to move.");
  const destination = String(sections[to] || "");
  return { ...sections, [from]: source.slice(0, start) + source.slice(finish),
    [to]: destination + (destination && !destination.endsWith("\n") ? "\n\n" : "") + moved };
}

export function appendSourceSelection(sections, { text, start, end, to, fieldIds }) {
  if (!fieldIds.includes(to) || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || end <= start) {
    throw new Error("Select the missing text in the original note first.");
  }
  const selected = text.slice(start, end);
  if (!selected.trim()) throw new Error("Select the missing text in the original note first.");
  return { ...sections, [to]: [String(sections[to] || ""), selected].filter(Boolean).join("\n\n") };
}
