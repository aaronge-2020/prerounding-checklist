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

export function checklistAnswersSummary(snapshot, answers = {}) {
  if (!snapshot?.items?.length) return "No checklist has been built.";
  return snapshot.items
    .map((item) => {
      const answer = answers[item.id] || { selected: [], note: "" };
      const selected = answer.selected?.length ? answer.selected.join(", ") : "No answer";
      const note = answer.note ? ` | Note: ${answer.note}` : "";
      return `- [${item.kind}] ${item.workupTitle}: ${item.text}\n  Answer: ${selected}${note}`;
    })
    .join("\n");
}

export function createPhoneChecklistBundle(patient, snapshot, answers = {}) {
  return {
    schema: "prerounding_phone_checklist_bundle_v1",
    patientLabel: patient?.displayLabel || "Patient",
    checklist: snapshot,
    answers,
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
    d: bundle.createdAt || ""
  };
}

function expandPhoneChecklistBundle(bundle) {
  if (bundle?.schema === "prerounding_phone_checklist_bundle_v1") return { ...bundle, answers: expandAnswers(bundle.answers) };
  if (bundle?.s !== "pc1") throw new Error("This is not a phone checklist bundle.");
  return {
    schema: "prerounding_phone_checklist_bundle_v1",
    patientLabel: bundle.p || "Patient",
    checklist: expandSnapshot(bundle.c),
    answers: expandAnswers(bundle.a),
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

export function createChecklistReturnBundle(snapshot, answers = {}) {
  return {
    schema: "prerounding_phone_checklist_return_v1",
    checklistId: snapshot?.id || "",
    answers,
    createdAt: new Date().toISOString()
  };
}

export function encodeChecklistReturnBundle(bundle) {
  return encodeJsonUrlSafe({
    s: "pr1",
    c: bundle?.checklistId || "",
    a: compactAnswers(bundle?.answers || {}),
    d: bundle?.createdAt || ""
  });
}

export function decodeChecklistReturnBundle(text) {
  const bundle = decodeJsonUrlSafe(String(text || "").trim().replace(/^#?return=/, ""));
  if (bundle?.schema === "prerounding_phone_checklist_return_v1") return { ...bundle, answers: expandAnswers(bundle.answers) };
  if (bundle?.s !== "pr1") throw new Error("This is not a returned checklist bundle.");
  return {
    schema: "prerounding_phone_checklist_return_v1",
    checklistId: bundle.c || "",
    answers: expandAnswers(bundle.a),
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

export function mergeReturnedAnswers(currentAnswers, returnBundle, snapshot) {
  if (returnBundle.checklistId && snapshot?.id && returnBundle.checklistId !== snapshot.id) {
    throw new Error("Returned answers belong to a different checklist.");
  }
  return {
    ...(currentAnswers || {}),
    ...(returnBundle.answers || {})
  };
}
