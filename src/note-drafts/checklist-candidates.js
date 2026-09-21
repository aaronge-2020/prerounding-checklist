function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value ?? "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function meaningfulChoices(selected = []) {
  return selected.map(clean).filter((choice) => choice && choice.toLowerCase() !== "not assessed");
}

function checklistDay(patient, packetId) {
  const days = Array.isArray(patient?.days) ? patient.days : [];
  if (packetId && packetId !== "admission") return days.find((day) => day.id === packetId) || null;
  return [...days].reverse().find((day) => day?.checklistSnapshot?.items?.length) || null;
}

export function buildChecklistNoteCandidates(patient, packetId = "admission") {
  const day = checklistDay(patient, packetId);
  const snapshot = day?.checklistSnapshot;
  if (!snapshot?.items?.length) return [];
  const answers = day.answers || {};
  const candidates = [];
  for (const item of snapshot.items) {
    const answer = answers[item.id] || {};
    const selected = meaningfulChoices(answer.selected || []);
    const note = clean(answer.note);
    if (!selected.length && !note) continue;
    const answerText = [...selected, ...(note ? [note] : [])].join(" · ");
    const kind = item.kind === "exam" ? "exam" : "history";
    const question = clean(item.text);
    const selectionId = `checklist:${day.id}:${clean(item.id)}`;
    const generatedText = `${question}: ${answerText}`;
    candidates.push({
      id: selectionId,
      selectionId,
      kind,
      question,
      answerText,
      generatedText,
      sourceFingerprint: `fp_${stableHash(JSON.stringify({ question, answerText, kind }))}`,
      sourceDayId: day.id,
      sourceDayLabel: clean(day.label) || clean(day.date) || "Checklist",
      workupTitle: clean(item.workupTitle)
    });
  }
  return candidates;
}
