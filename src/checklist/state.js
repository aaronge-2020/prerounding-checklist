function encodeJsonUrlSafe(value) {
  const text = JSON.stringify(value);
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeJsonUrlSafe(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function emptyChecklistAnswers(snapshot = null) {
  return Object.fromEntries((snapshot?.items || []).map((item) => [item.id, { selected: [], note: "" }]));
}

export function setChecklistChoice(answers, item, choice, checked) {
  const current = answers?.[item.id] || { selected: [], note: "" };
  const selected = item.select === "many"
    ? checked
      ? [...new Set([...current.selected, choice])]
      : current.selected.filter((entry) => entry !== choice)
    : checked
      ? [choice]
      : [];
  return {
    ...answers,
    [item.id]: {
      ...current,
      selected
    }
  };
}

export function setChecklistNote(answers, itemId, note) {
  const current = answers?.[itemId] || { selected: [], note: "" };
  return {
    ...answers,
    [itemId]: {
      ...current,
      note: String(note || "")
    }
  };
}

// Quick notes capture something the patient said that doesn't map to any
// checklist item. They travel alongside answers through the same phone
// bundle / return bundle / merge pipeline but are never tied to an item id.
export function emptyQuickNotes() {
  return [];
}

function quickNoteId() {
  return `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addQuickNote(quickNotes, text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return quickNotes || [];
  return [...(quickNotes || []), { id: quickNoteId(), text: trimmed, createdAt: new Date().toISOString() }];
}

export function removeQuickNote(quickNotes, noteId) {
  return (quickNotes || []).filter((note) => note.id !== noteId);
}

export function mergeQuickNotes(currentQuickNotes, incomingQuickNotes) {
  const merged = [...(currentQuickNotes || [])];
  const seenIds = new Set(merged.map((note) => note.id));
  for (const note of incomingQuickNotes || []) {
    if (seenIds.has(note.id)) continue;
    seenIds.add(note.id);
    merged.push(note);
  }
  return merged.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
}

export function negativeChoiceForItem(item) {
  const choices = Array.isArray(item?.choices) ? item.choices : [];
  // Workup authoring requires the baseline negative/normal finding to be first.
  // This supports concise choices such as "No", "Reassuring", or "Not present".
  return String(choices[0] || "").trim();
}

export function fillNegativeChecklistAnswers(answers, items = []) {
  let changed = 0;
  const next = { ...(answers || {}) };
  for (const item of items) {
    const current = next[item.id] || { selected: [], note: "" };
    const negative = negativeChoiceForItem(item);
    if (current.selected?.length || !negative) continue;
    next[item.id] = { ...current, selected: [negative] };
    changed += 1;
  }
  return { answers: next, changed };
}

export function checklistAnswersSummary(snapshot, answers = {}, quickNotes = []) {
  if (!snapshot?.items?.length) return "No checklist has been built.";
  const itemLines = snapshot.items
    .map((item) => {
      const answer = answers[item.id] || { selected: [], note: "" };
      const selected = answer.selected?.length ? answer.selected.join(", ") : "No answer";
      const note = answer.note ? ` | Note: ${answer.note}` : "";
      return `- [${item.kind}] ${item.workupTitle}: ${item.text}\n  Answer: ${selected}${note}`;
    })
    .join("\n");
  if (!quickNotes?.length) return itemLines;
  const quickNoteLines = quickNotes.map((note) => `- ${note.text}`).join("\n");
  return `${itemLines}\n\nAdditional notes (not tied to a specific checklist item):\n${quickNoteLines}`;
}

export function createPhoneChecklistBundle(patient, snapshot, answers = {}, quickNotes = []) {
  return {
    schema: "prerounding_phone_checklist_bundle_v1",
    patientLabel: patient?.displayLabel || "Patient",
    checklist: snapshot,
    answers,
    quickNotes,
    createdAt: new Date().toISOString()
  };
}

function compactAnswers(answers = {}) {
  return Object.fromEntries(
    Object.entries(answers || {})
      .filter(([, answer]) => answer?.selected?.length || answer?.note)
      .map(([itemId, answer]) => [itemId, [answer?.selected || [], answer?.note || ""]])
  );
}

function expandAnswers(answers = {}) {
  return Object.fromEntries(
    Object.entries(answers || {}).map(([itemId, answer]) => [
      itemId,
      Array.isArray(answer) ? { selected: answer[0] || [], note: answer[1] || "" } : { selected: answer?.selected || [], note: answer?.note || "" }
    ])
  );
}

function compactQuickNotes(quickNotes = []) {
  return (quickNotes || []).map((note) => [note.id, note.text, note.createdAt]);
}

function expandQuickNotes(quickNotes = []) {
  return (quickNotes || []).map((note) =>
    Array.isArray(note)
      ? { id: note[0] || "", text: note[1] || "", createdAt: note[2] || "" }
      : { id: note?.id || "", text: note?.text || "", createdAt: note?.createdAt || "" }
  );
}

function compactSnapshot(snapshot = null) {
  const titles = snapshot?.workupTitles || [];
  return {
    i: snapshot?.id || "",
    t: titles,
    w: snapshot?.workupIds || [],
    a: snapshot?.createdAt || "",
    x: (snapshot?.items || []).map((item) => [
      item.id,
      Math.max(0, titles.indexOf(item.workupTitle)),
      item.kind === "exam" ? "e" : "h",
      item.text,
      item.choices,
      item.select === "many" ? "m" : "o",
      item.system || ""
    ])
  };
}

function expandSnapshot(snapshot = null) {
  if (!snapshot || snapshot.schema === "prerounding_checklist_v1") return snapshot;
  return {
    schema: "prerounding_checklist_v1",
    id: snapshot.i || "",
    createdAt: snapshot.a || "",
    workupIds: snapshot.w || [],
    workupTitles: snapshot.t || [],
    items: (snapshot.x || []).map((item) => ({
      id: item[0],
      workupId: "",
      workupTitle: (snapshot.t || [])[item[1]] || "",
      itemId: item[0],
      kind: item[2] === "e" ? "exam" : "history",
      text: item[3],
      choices: item[4] || [],
      select: item[5] === "m" ? "many" : "one",
      system: item[6] || ""
    }))
  };
}

function compactPhoneChecklistBundle(bundle) {
  return {
    s: "pc1",
    p: bundle.patientLabel || "Patient",
    c: compactSnapshot(bundle.checklist),
    a: compactAnswers(bundle.answers),
    n: compactQuickNotes(bundle.quickNotes),
    d: bundle.createdAt || ""
  };
}

function expandPhoneChecklistBundle(bundle) {
  if (bundle?.schema === "prerounding_phone_checklist_bundle_v1") {
    return { ...bundle, answers: expandAnswers(bundle.answers), quickNotes: expandQuickNotes(bundle.quickNotes) };
  }
  if (bundle?.s !== "pc1") throw new Error("This is not a phone checklist bundle.");
  return {
    schema: "prerounding_phone_checklist_bundle_v1",
    patientLabel: bundle.p || "Patient",
    checklist: expandSnapshot(bundle.c),
    answers: expandAnswers(bundle.a),
    quickNotes: expandQuickNotes(bundle.n),
    createdAt: bundle.d || ""
  };
}

export const PHONE_TRANSFER_FILE_SCHEMA = "prerounding_phone_transfer_file_v1";

function transferFilePayload(type, payload) {
  return {
    schema: PHONE_TRANSFER_FILE_SCHEMA,
    type,
    payload
  };
}

function decodeTransferFile(text, expectedType, decodePayload, message) {
  let file;
  try {
    file = JSON.parse(String(text || ""));
  } catch {
    throw new Error(message);
  }
  // Keep files downloaded by earlier app versions importable. Those files
  // contained only { bundle: encodedPayload } and did not declare a type.
  if (file?.schema === undefined && typeof file?.bundle === "string") return decodePayload(file.bundle);
  if (file?.schema !== PHONE_TRANSFER_FILE_SCHEMA || file?.type !== expectedType || typeof file?.payload !== "string") {
    throw new Error(message);
  }
  return decodePayload(file.payload);
}

export function createPhoneChecklistTransferFile(bundle) {
  return transferFilePayload("checklist", encodePhoneChecklistBundle(bundle));
}

export function decodePhoneChecklistTransferFile(text) {
  return decodeTransferFile(
    text,
    "checklist",
    decodePhoneChecklistBundle,
    "This is not a valid phone checklist bundle file."
  );
}

export function encodePhoneChecklistBundle(bundle) {
  return encodeJsonUrlSafe(compactPhoneChecklistBundle(bundle));
}

export function decodePhoneChecklistBundle(text) {
  const bundle = decodeJsonUrlSafe(String(text || "").trim().replace(/^#?phone=/, ""));
  return expandPhoneChecklistBundle(bundle);
}

export function createChecklistReturnBundle(snapshot, answers = {}, quickNotes = []) {
  return {
    schema: "prerounding_phone_checklist_return_v1",
    checklistId: snapshot?.id || "",
    answers,
    quickNotes,
    createdAt: new Date().toISOString()
  };
}

export function encodeChecklistReturnBundle(bundle) {
  return encodeJsonUrlSafe({
    s: "pr1",
    c: bundle?.checklistId || "",
    a: compactAnswers(bundle?.answers || {}),
    n: compactQuickNotes(bundle?.quickNotes || []),
    d: bundle?.createdAt || ""
  });
}

export function decodeChecklistReturnBundle(text) {
  const bundle = decodeJsonUrlSafe(String(text || "").trim().replace(/^#?return=/, ""));
  if (bundle?.schema === "prerounding_phone_checklist_return_v1") {
    return { ...bundle, answers: expandAnswers(bundle.answers), quickNotes: expandQuickNotes(bundle.quickNotes) };
  }
  if (bundle?.s !== "pr1") throw new Error("This is not a returned checklist bundle.");
  return {
    schema: "prerounding_phone_checklist_return_v1",
    checklistId: bundle.c || "",
    answers: expandAnswers(bundle.a),
    quickNotes: expandQuickNotes(bundle.n),
    createdAt: bundle.d || ""
  };
}

export function createChecklistReturnTransferFile(bundle) {
  return transferFilePayload("return", encodeChecklistReturnBundle(bundle));
}

export function decodeChecklistReturnTransferFile(text) {
  return decodeTransferFile(
    text,
    "return",
    decodeChecklistReturnBundle,
    "This is not a valid returned checklist bundle file."
  );
}

// Phones can hand back either the short return code or the full transfer
// file JSON (e.g. pasted from an AirDropped .bundle.json). Accept both so a
// pasted file's contents import the same way a pasted code would.
export function decodeChecklistReturnInput(text) {
  const raw = String(text || "").trim();
  if (raw.startsWith("{")) return decodeChecklistReturnTransferFile(raw);
  return decodeChecklistReturnBundle(raw);
}

export function mergeReturnedAnswers(currentAnswers, returnBundle, snapshot) {
  if (returnBundle.checklistId && snapshot?.id && returnBundle.checklistId !== snapshot.id) {
    throw new Error("Returned answers belong to a different checklist.");
  }
  return {
    ...(currentAnswers || {}),
    ...(returnBundle.answers || {})
  };
}
