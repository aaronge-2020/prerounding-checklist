// Retained, de-identified chart sources are the authority. Review items point
// to exact ranges; they never replace the source or infer clinical chronology.
import { primaryTeamNoteFields } from "../patient-context/primary-team-note.js?v=20260921-primary-note-source";

export const REVIEW_KINDS = Object.freeze({ follow_up: "Follow-up", clarify: "Clarify", verify: "Verify today" });
export const REVIEW_STATUSES = Object.freeze({
  follow_up: {
    unknown: "Not checked",
    pending: "Pending",
    completed: "Completed",
    declined: "Declined",
    not_applicable: "No longer applicable"
  },
  clarify: { unknown: "Unresolved", resolved: "Resolved" },
  verify: { unknown: "Not verified", confirmed: "Confirmed", changed: "Changed" }
});

export function encounterPackets(patient) {
  if (!patient) return [];
  return [
    { id: "admission", label: "Admission", note: patient.admissionPrimaryTeamNote, sources: patient.contextSections || [] },
    ...(patient.days || []).map((day) => ({ id: day.id, label: day.label, note: day.primaryTeamNote, sources: day.sourceCaptures || [] }))
  ];
}

export function packetSources(patient, packetId) {
  const packet = encounterPackets(patient).find((entry) => entry.id === packetId);
  if (!packet) return [];
  const fields = packet.note
    ? primaryTeamNoteFields(packet.note.noteType).map((field) => {
        const value = packet.note.sections?.[field.id];
        return {
          id: `note:${packet.note.id}:${field.id}`,
          fieldId: field.id,
          label: field.label,
          matchKey: `note:${field.id}`,
          text: String(value?.deidentifiedText || ""),
          contextKey: JSON.stringify([packet.note.noteType, field.id]),
          version: String(value?.updatedAt || packet.note.updatedAt || ""),
          warnings: value?.residualWarnings || []
        };
      })
    : [];
  const captures = packet.sources.map((source) => ({
    id: `capture:${source.id}`,
    fieldId: "",
    label: source.label,
    matchKey: `capture:${source.sourceKind || source.role}:${source.label}:${source.resultCategory || ""}`,
    text: String(source.deidentifiedText || ""),
    contextKey: JSON.stringify([
      source.sourceKind || source.role || "",
      source.label || "",
      source.resultCategory || "",
      source.resultDate || "",
      source.resultContext || ""
    ]),
    version: String(source.updatedAt || ""),
    warnings: source.residualWarnings || [],
    skipped: source.deidentificationSkipped === true
  }));
  return [...fields, ...captures].filter((source) => source.text.trim()).map((source) => ({ ...source, packetId }));
}

function normalizeReference(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isInteger(value.start) ||
    !Number.isInteger(value.end) ||
    value.start < 0 ||
    value.end <= value.start ||
    typeof value.quote !== "string" ||
    value.end - value.start !== value.quote.length ||
    !value.quote.trim() ||
    !value.patientId ||
    !value.packetId ||
    !value.sourceId
  )
    return null;
  return {
    patientId: String(value.patientId),
    packetId: String(value.packetId || ""),
    sourceId: String(value.sourceId || ""),
    start: value.start,
    end: value.end,
    quote: value.quote,
    snapshotId: String(value.snapshotId || "")
  };
}

export function normalizeEncounterReview(value) {
  const ids = new Set();
  const items = (Array.isArray(value?.items) ? value.items : []).flatMap((item) => {
    const source = normalizeReference(item?.source);
    if (!item?.id || ids.has(String(item.id)) || !Object.hasOwn(REVIEW_KINDS, item.kind) || !source) return [];
    ids.add(String(item.id));
    const reviews = (Array.isArray(item.reviews) ? item.reviews : [])
      .filter((review) => review?.packetId && Object.hasOwn(REVIEW_STATUSES[item.kind], review.status))
      .map((review) => ({
        packetId: String(review.packetId),
        status: review.status,
        evidence: normalizeReference(review.evidence),
        recordedAt: String(review.recordedAt || "")
      }));
    return [{ id: String(item.id), kind: item.kind, source, reviews }];
  });
  const referenced = new Set(
    items.flatMap((item) => [item.source.snapshotId, ...item.reviews.map((review) => review.evidence?.snapshotId)])
  );
  const snapshotIds = new Set();
  const snapshots = (Array.isArray(value?.snapshots) ? value.snapshots : []).flatMap((snapshot) => {
    if (!snapshot?.id || snapshotIds.has(String(snapshot.id)) || !referenced.has(String(snapshot.id)) || typeof snapshot.text !== "string")
      return [];
    snapshotIds.add(String(snapshot.id));
    return [
      {
        id: String(snapshot.id),
        packetId: String(snapshot.packetId || ""),
        sourceId: String(snapshot.sourceId || ""),
        text: snapshot.text,
        contextKey: String(snapshot.contextKey || "")
      }
    ];
  });
  return { items, snapshots };
}

export function referenceState(patient, reference) {
  const ref = normalizeReference(reference);
  if (!ref) return { valid: false, reason: "Invalid source reference" };
  if (ref.patientId !== patient?.id) return { valid: false, reason: "Source belongs to a different patient" };
  const source = packetSources(patient, ref.packetId).find((entry) => entry.id === ref.sourceId);
  if (!source) return { valid: false, reason: "Source removed", source: null };
  const snapshot = (patient.encounterReview?.snapshots || []).find(
    (entry) => entry.id === ref.snapshotId && entry.packetId === ref.packetId && entry.sourceId === ref.sourceId
  );
  const snapshotText = snapshot?.text ?? reference.snapshotText;
  const snapshotContext = snapshot?.contextKey ?? reference.snapshotContext;
  if (source.text !== snapshotText || source.contextKey !== snapshotContext || source.text.slice(ref.start, ref.end) !== ref.quote)
    return { valid: false, reason: "Source changed — select the passage again", source };
  if (source.skipped || source.warnings.length) return { valid: false, reason: "Source needs privacy review", source };
  return { valid: true, reason: "", source };
}

export function createSourceReference(patient, packetId, sourceId, start, end) {
  const source = packetSources(patient, packetId).find((entry) => entry.id === sourceId);
  if (!source || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > source.text.length || end <= start)
    throw new Error("Select a passage in the saved source first.");
  const reference = {
    patientId: patient.id,
    packetId,
    sourceId,
    start,
    end,
    quote: source.text.slice(start, end),
    snapshotText: source.text,
    snapshotContext: source.contextKey
  };
  const state = referenceState(patient, reference);
  if (!state.valid) throw new Error(state.reason);
  return reference;
}

export function renderedSourceText(text) {
  return String(text || "").replace(/\r\n?/g, "\n");
}

// Textareas normalize CRLF/CR to LF and expose UTF-16 selection offsets.
// Translate those offsets back to the retained source, preserving exact quotes.
export function retainedSourceRange(text, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) throw new Error("Invalid source selection.");
  let rendered = 0,
    rawStart = -1;
  for (let raw = 0; raw <= text.length; rendered++) {
    if (rendered === start) rawStart = raw;
    if (rendered === end && rawStart >= 0) return { start: rawStart, end: raw };
    if (raw === text.length) break;
    raw += text[raw] === "\r" && text[raw + 1] === "\n" ? 2 : 1;
  }
  throw new Error("Source selection is outside the retained text.");
}

export function renderedSourceRange(text, start, end) {
  return { start: renderedSourceText(text.slice(0, start)).length, end: renderedSourceText(text.slice(0, end)).length };
}

// Store each retained de-identified source version once, shared by all exact
// excerpts. Full-text equality detects edits outside the selected passage.
// Timestamps are not content identity. No raw import or review original enters
// this registry, and normalization prunes snapshots no longer referenced.
function retainReference(review, patient, reference) {
  const source = referenceState(patient, reference).source;
  const existing = review.snapshots.find(
    (snapshot) =>
      snapshot.packetId === reference.packetId &&
      snapshot.sourceId === reference.sourceId &&
      snapshot.text === source.text &&
      snapshot.contextKey === source.contextKey
  );
  let snapshotId = existing?.id;
  if (!snapshotId) {
    let index = 1;
    while (review.snapshots.some((snapshot) => snapshot.id === `source_${index}`)) index++;
    snapshotId = `source_${index}`;
    review.snapshots.push({
      id: snapshotId,
      packetId: reference.packetId,
      sourceId: reference.sourceId,
      text: source.text,
      contextKey: source.contextKey
    });
  }
  return { ...normalizeReference(reference), snapshotId };
}

export function addReviewItem(patient, { id, kind, source }) {
  if (!id || !Object.hasOwn(REVIEW_KINDS, kind)) throw new Error("Choose a supported review item.");
  const state = referenceState(patient, source);
  if (!state.valid) throw new Error(state.reason);
  const review = normalizeEncounterReview(patient.encounterReview);
  const reference = retainReference(review, patient, source);
  if (review.items.some((item) => item.kind === kind && JSON.stringify(item.source) === JSON.stringify(reference))) return patient;
  return { ...patient, encounterReview: { ...review, items: [...review.items, { id, kind, source: reference, reviews: [] }] } };
}

export function recordItemReview(patient, { itemId, packetId, status, evidence = null, recordedAt }) {
  if (!encounterPackets(patient).some((packet) => packet.id === packetId)) throw new Error("Choose an existing encounter packet.");
  const review = normalizeEncounterReview(patient.encounterReview);
  const item = review.items.find((entry) => entry.id === itemId);
  if (!item || !Object.hasOwn(REVIEW_STATUSES[item.kind], status)) throw new Error("Choose a supported review status.");
  if (!referenceState(patient, item.source).valid) throw new Error("Review the changed or missing source before recording a status.");
  if (evidence && !referenceState(patient, evidence).valid) throw new Error("The supporting source is no longer current.");
  // Each packet has its own explicit decision. No confirmation is inherited.
  const next = {
    packetId,
    status,
    evidence: evidence ? retainReference(review, patient, evidence) : null,
    recordedAt: String(recordedAt || "")
  };
  return {
    ...patient,
    encounterReview: {
      ...review,
      items: review.items.map((entry) => (entry.id === itemId ? { ...entry, reviews: [...entry.reviews, next] } : entry))
    }
  };
}

export function reviewItemState(patient, item, packetId) {
  const source = referenceState(patient, item.source);
  const current = [...item.reviews].reverse().find((review) => review.packetId === packetId) || null;
  const evidence = current?.evidence ? referenceState(patient, current.evidence) : null;
  const valid = source.valid && (!evidence || evidence.valid);
  const prior = [...item.reviews].reverse().find((review) => review.packetId !== packetId) || null;
  const status = valid ? current?.status || "unknown" : "unknown";
  // Closed follow-up is historical workflow state, never verification today.
  // A new explicit pending decision reopens it without inventing a finding.
  const previouslyClosed =
    !current &&
    item.kind === "follow_up" &&
    source.valid &&
    prior &&
    ["completed", "declined", "not_applicable"].includes(prior.status) &&
    (!prior.evidence || referenceState(patient, prior.evidence).valid);
  return {
    source,
    current,
    evidence,
    valid,
    status,
    prior,
    previouslyClosed: Boolean(previouslyClosed),
    needsAttention: !valid || (!previouslyClosed && ["unknown", "pending", "changed"].includes(status))
  };
}

export function compareEncounterPackets(patient, beforeId, afterId) {
  if (!beforeId || !afterId || beforeId === afterId) return [];
  const before = packetSources(patient, beforeId),
    after = packetSources(patient, afterId);
  const keys = [...new Set([...before, ...after].map((source) => source.matchKey))];
  return keys.map((key) => {
    const left = before.filter((source) => source.matchKey === key),
      right = after.filter((source) => source.matchKey === key);
    const ambiguous = left.length > 1 || right.length > 1;
    return {
      key,
      label: left[0]?.label || right[0]?.label,
      before: left,
      after: right,
      state: ambiguous
        ? "multiple"
        : !left.length
          ? "only_after"
          : !right.length
            ? "only_before"
            : left[0].text === right[0].text
              ? "same"
              : "different"
    };
  });
}

// Exact line comparison, with a bounded LCS working set. Large documents use
// shared prefix/suffix alignment and mark the entire middle for review; no
// source content is discarded and no clinical meaning is inferred.
export function compareSourceLines(beforeText, afterText) {
  const split = (value) => String(value || "").match(/[^\n]*\n|[^\n]+$/g) || [];
  const left = split(beforeText),
    right = split(afterText);
  const leftSame = new Set(),
    rightSame = new Set();
  if ((left.length + 1) * (right.length + 1) <= 250000) {
    const width = right.length + 1,
      table = new Uint32Array((left.length + 1) * width);
    for (let i = left.length - 1; i >= 0; i--)
      for (let j = right.length - 1; j >= 0; j--)
        table[i * width + j] =
          left[i] === right[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    let i = 0,
      j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) {
        leftSame.add(i++);
        rightSame.add(j++);
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++;
      else j++;
    }
  } else {
    let first = 0;
    while (first < left.length && first < right.length && left[first] === right[first]) {
      leftSame.add(first);
      rightSame.add(first++);
    }
    let i = left.length - 1,
      j = right.length - 1;
    while (i >= first && j >= first && left[i] === right[j]) {
      leftSame.add(i--);
      rightSame.add(j--);
    }
  }
  return {
    before: left.map((text, index) => ({ text, changed: !leftSame.has(index) })),
    after: right.map((text, index) => ({ text, changed: !rightSame.has(index) }))
  };
}

export function planPassages(source) {
  if (source?.fieldId !== "plan") return [];
  return [...String(source.text || "").matchAll(/[^\r\n]+/g)]
    .filter((match) => match[0].trim() && match[0].length <= 3000)
    .map((match) => ({ start: match.index, end: match.index + match[0].length, text: match[0] }));
}

export function buildEncounterReviewBrief(patient, packetId) {
  const items = normalizeEncounterReview(patient.encounterReview).items;
  const packets = encounterPackets(patient);
  const origin = (reference) => {
    const packetIndex = packets.findIndex((packet) => packet.id === reference.packetId);
    const sourceIndex = packetSources(patient, reference.packetId).findIndex((source) => source.id === reference.sourceId);
    return `${packetIndex === 0 ? "Admission" : `Packet ${packetIndex + 1}`}, source ${sourceIndex + 1}`;
  };
  const lines = [
    "Encounter preparation — clinician review record",
    "Statuses apply only to the explicitly selected packet. Source quotations are not new findings."
  ];
  for (const item of items) {
    const state = reviewItemState(patient, item, packetId);
    // Stale and privacy-pending material must not be promoted into a brief.
    if (!state.valid) {
      lines.push(`\n${REVIEW_KINDS[item.kind]}: source or supporting evidence needs review; quotation withheld.`);
      continue;
    }
    lines.push(
      state.previouslyClosed
        ? `\nFollow-up — Previously ${REVIEW_STATUSES.follow_up[state.prior.status].toLowerCase()} (clinician-recorded in another packet; not verified today)`
        : `\n${REVIEW_KINDS[item.kind]} — ${REVIEW_STATUSES[item.kind][state.status]} (clinician-recorded)`,
      `Prior source quotation (${origin(item.source)}): ${item.source.quote}`
    );
    if (state.current?.evidence)
      lines.push(`Supporting source quotation (${origin(state.current.evidence)}): ${state.current.evidence.quote}`);
  }
  return lines.join("\n");
}
