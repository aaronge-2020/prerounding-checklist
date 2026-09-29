// Delta-review helpers for AI Chat v3's ChatGPT-mode HIPAA review gate.
//
// Pure module: zero DOM, zero network, zero storage. The controller owns
// orchestration and state; this module owns the deterministic transforms:
// splitting the trusted patient-context assembly into reviewable pieces,
// fingerprinting pieces for the session-scoped review store, redaction
// record bookkeeping, and transmit assembly.
//
// The security-critical invariant: splitBuiltContext + verifySplitEquivalence
// prove that the per-piece review operates on EXACTLY the text the trusted
// builder (buildPatientContextFromPieces) would assemble — same piece order,
// same header, same budget-truncate rule. Any drift fails closed.

import {
  textOf,
  listPatientContextPieces,
  pieceText,
  buildPatientContextFromPieces,
  MAX_SELECTED_PIECES_CHARS,
  MAX_FULL_CHART_CHARS
} from "../../local-llm/patient-context.js?v=20260929-local-llm-v12";
import { buildRemoteChatInput } from "../../ai/remote-chat.js?v=20260929-ai-chat-v6";
import { redactFromEntities } from "../../vault/deid.js?v=20260921-medication-card-v4";
import { DEFAULT_SYSTEM_GUIDELINES } from "../../local-llm/system-prompt.js?v=20260928-local-llm-v10";
import { CHARS_PER_TOKEN } from "../../local-llm/context-budget.js?v=20260927-local-llm-v1";

// ---------------------------------------------------------------------------
// Full-chart budget
// ---------------------------------------------------------------------------
// The full-chart budget is grounded in the selected API model's real
// context window — not an arbitrary cap. Headroom is reserved for the
// system prompt, conversation history, the question, and the reply. A real
// student chart essentially never reaches this; if it does, the review
// modal names the cut piece honestly (see locateTruncation) instead of
// silently claiming the chart is complete. Unknown model: conservative
// fallback to MAX_FULL_CHART_CHARS.
export const FULL_CHART_RESERVE_TOKENS = 32000;
export function fullChartBudgetChars(contextWindowTokens) {
  const windowTokens = Number(contextWindowTokens) || 0;
  if (windowTokens <= 0) return MAX_FULL_CHART_CHARS;
  const usable = Math.max(0, windowTokens - FULL_CHART_RESERVE_TOKENS);
  return Math.max(500, Math.floor(usable * CHARS_PER_TOKEN));
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

// cyrb53 — deterministic 53-bit hash of a string, hex-encoded. Used to
// fingerprint piece content so the review store can tell "unchanged" (reuse
// the student's earlier review verbatim) from "changed" (de-identify again).
export function hashPiece(text) {
  const str = String(text ?? "");
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// ---------------------------------------------------------------------------
// Context splitting / equivalence
// ---------------------------------------------------------------------------

function normalizeBudget(maxChars) {
  return Math.max(500, Number(maxChars) || MAX_SELECTED_PIECES_CHARS);
}

// The trusted builder's own budget-truncate rule, applied identically here
// so verifySplitEquivalence compares exactly what the builder produces.
function truncateToBudget(text, budget) {
  const str = String(text || "");
  if (str.length <= budget) return str;
  return `${str.slice(0, budget - 3).trimEnd()}...`;
}

// The patient header, built exactly like buildPatientContextFromPieces
// builds it.
export function buildContextHeaderText(patient) {
  const headerBits = [`PATIENT: ${textOf(patient?.displayLabel) || "Active patient"}`];
  const admissionDate = textOf(patient?.metadata?.admissionDate);
  if (admissionDate) headerBits.push(`Admitted: ${admissionDate}`);
  return headerBits.join("\n");
}

// The student's custom instructions (system guidelines), falling back to the
// built-in default exactly like the on-device chat does.
export function effectiveGuidelinesText(settingsObj) {
  return String(settingsObj?.systemGuidelines || "").trim() || DEFAULT_SYSTEM_GUIDELINES;
}

// Split the trusted assembly into its header + one entry per selected piece,
// in listPatientContextPieces order, each with its raw (pre-redaction) text.
export function splitBuiltContext(patient, selectedIds, { draftNoteText = "", draftNoteSections = null, maxChars = MAX_SELECTED_PIECES_CHARS } = {}) {
  const budget = normalizeBudget(maxChars);
  const header = buildContextHeaderText(patient);
  const wanted = new Set(Array.isArray(selectedIds) ? selectedIds.map(String) : []);
  const pieces = [];
  const pieceOpts = { draftNoteText, draftNoteSections };
  for (const piece of listPatientContextPieces(patient, pieceOpts)) {
    if (!wanted.has(piece.id)) continue;
    const rawText = pieceText(patient, piece, pieceOpts);
    if (!rawText) continue;
    pieces.push({ id: piece.id, label: piece.label, group: piece.group, kind: piece.kind, rawText });
  }
  return { header, pieces, maxChars: budget };
}

// Reassemble the split with the trusted builder's own budget-truncate rule
// and require a byte-exact match against buildPatientContextFromPieces.
// Any drift (piece order, header format, truncation) fails the check.
export function verifySplitEquivalence(patient, selectedIds, split, { draftNoteText = "", draftNoteSections = null, maxChars } = {}) {
  if (!split || typeof split.header !== "string" || !Array.isArray(split.pieces)) return false;
  const budget = normalizeBudget(maxChars ?? split.maxChars);
  const parts = split.pieces.map((piece) => String(piece?.rawText ?? ""));
  const reassembled = parts.length ? truncateToBudget(`${split.header}\n\n${parts.join("\n\n")}`, budget) : "";
  return reassembled === buildPatientContextFromPieces(patient, selectedIds, { maxChars: budget, draftNoteText, draftNoteSections });
}

// Where a chart piece lives in the app, for citation navigation. Returns
// null for pieces with no chart location (patient header, draft note).
//   { scope: "context", sectionId }            -> admission packet section
//   { scope: "daily", dayId, sectionId|null }   -> hospital-day capture
//      (sectionId null = day-level piece, e.g. quick notes: the day itself
//      is the anchor)
export function pieceSectionTarget(pieceId) {
  const id = String(pieceId || "");
  if (id.startsWith("admission:")) {
    return { scope: "context", dayId: null, sectionId: id.slice("admission:".length) };
  }
  if (id.startsWith("day:")) {
    const rest = id.slice("day:".length);
    const cut = rest.lastIndexOf(":");
    if (cut <= 0) return null;
    const dayId = rest.slice(0, cut);
    const captureId = rest.slice(cut + 1);
    if (captureId === "quicknotes") return { scope: "daily", dayId, sectionId: null };
    return { scope: "daily", dayId, sectionId: captureId };
  }
  return null;
}

// Build the citation lookup for one assistant reply: lowercased section
// label -> { pieceId, label, group, target }. First piece wins on duplicate
// labels; pieces with no chart location are skipped (their citations stay
// inert text).
export function buildSectionCitationIndex(pieces) {
  const index = new Map();
  for (const piece of pieces || []) {
    // Reviewed pieces carry `title` (from contextTargets/prepareReviewPiece);
    // raw context targets carry `label`. Either is the chart-section name the
    // model cites as `per [Section Label]`.
    const label = String(piece?.label || piece?.title || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (index.has(key)) continue;
    const target = pieceSectionTarget(piece?.id);
    if (!target) continue;
    index.set(key, {
      pieceId: String(piece.id),
      label,
      group: String(piece?.group || ""),
      target
    });
  }
  return index;
}

// Content fingerprints for the session-scoped review store.
export function fingerprintPieces(split) {
  return (split?.pieces || []).map((piece) => ({ id: piece.id, contentHash: hashPiece(piece.rawText) }));
}

// ---------------------------------------------------------------------------
// Redaction records
// ---------------------------------------------------------------------------

// A RedactionRecord is the reviewable unit of one detected span:
//   { id, start, end, originalText, replacement, label, source, status }
// source is "model" (from the de-identification model) or "manual" (the
// student selected the span); status is "pending" | "accepted" | "rejected".
// Manual redaction is a user action on selected text, not a new in-house PII
// detection heuristic.
export function entitiesToRedactionRecords(rawText, entities) {
  const text = String(rawText ?? "");
  const records = [];
  for (const entity of entities || []) {
    const start = Number(entity?.start);
    const end = Number(entity?.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) continue;
    const label = String(entity?.label || "PII");
    records.push({
      id: `model:${start}:${end}`,
      start,
      end,
      originalText: text.slice(start, end),
      replacement: String(entity?.renderedPlaceholder || entity?.placeholder || `[${label}]`),
      label,
      source: "model",
      status: "pending"
    });
  }
  return records;
}

// Apply the given records to the raw text through the trusted renderer.
//
// redactFromEntities derives the rendered marker from the (refined) entity
// label — an explicit placeholder on the entity does NOT survive the call
// (verified against the baseline: normalizePhiEntity resets it to the
// label default). The student's manual "[REDACTED]" marker is therefore
// mapped to the REDACTED label, whose label-derived placeholder is exactly
// "[REDACTED]". The RedactionRecord itself keeps label "MANUAL" — only the
// entity handed to the renderer is translated.
function entityLabelForRecord(record) {
  return record?.label === "MANUAL" ? "REDACTED" : String(record?.label || "PII");
}

export function applyRedactions(rawText, appliedRecords, admissionDate = null) {
  // Only "accepted" and "pending" records render. Accepted records are the
  // student's approved redactions; pending records are the model's proposals
  // awaiting a decision, shown applied in the review preview. Rejected
  // records are dropped so the original text stays. The confirm gate
  // requires zero pending records, so at transmit time the approved text is
  // exactly what was reviewed.
  const entities = (appliedRecords || [])
    .filter((record) => record && record.status !== "rejected" && Number.isInteger(record.start) && Number.isInteger(record.end) && record.end > record.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((record) => ({
      start: record.start,
      end: record.end,
      label: entityLabelForRecord(record),
      placeholder: String(record.replacement || `[${record.label || "PII"}]`)
    }));
  return redactFromEntities(String(rawText ?? ""), entities, admissionDate, { relativeDate: admissionDate });
}

// Locate the student's selected text in the raw piece: exactly one
// non-overlapping occurrence, or { ok: false, reason }.
export function locateManualSpan(rawText, selectedText, occupiedSpans = []) {
  const text = String(rawText ?? "");
  const needle = String(selectedText ?? "");
  if (!needle) return { ok: false, reason: "empty" };
  const hits = [];
  let from = 0;
  for (;;) {
    const index = text.indexOf(needle, from);
    if (index < 0) break;
    hits.push({ start: index, end: index + needle.length });
    from = index + 1;
  }
  if (!hits.length) return { ok: false, reason: "not-found" };
  const occupied = Array.isArray(occupiedSpans) ? occupiedSpans : [];
  const overlaps = (span) => occupied.some((other) => other && span.start < other.end && other.start < span.end);
  const free = hits.filter((hit) => !overlaps(hit));
  if (!free.length) return { ok: false, reason: "overlapping" };
  if (free.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, start: free[0].start, end: free[0].end };
}

// ---------------------------------------------------------------------------
// Transmit assembly
// ---------------------------------------------------------------------------

// Assemble the exact context string that will be sent: the approved piece
// texts in piece order, joined with "\n\n", under the same budget the
// trusted builder enforces. The Responses-API input is built from the real
// buildRemoteChatInput so the wire format can't drift from review: exactly
// one standard outer context wrapper around the reviewed chart sections.
export function buildTransmitPayload({ approvedById = {}, pieceOrder = [], transformedMessage = "", systemPrompt = "", history = [], maxChars = MAX_FULL_CHART_CHARS } = {}) {
  const budget = Math.max(500, Number(maxChars) || MAX_FULL_CHART_CHARS);
  const parts = [];
  for (const id of pieceOrder || []) {
    const text = approvedById?.[id];
    if (text) parts.push(String(text));
  }
  const contextText = truncateToBudget(parts.join("\n\n"), budget);
  const input = buildRemoteChatInput({ systemPrompt, history, userMessage: transformedMessage, contextText });
  return { input, contextText, finalUserContent: input[input.length - 1].content };
}

// Locate where the budget cut lands, for the truncation note: which piece
// is cut and at what offset inside it (pre-trim, matching truncateToBudget).
export function locateTruncation(pieceOrder = [], approvedById = {}, maxChars = MAX_FULL_CHART_CHARS) {
  const budget = Math.max(500, Number(maxChars) || MAX_FULL_CHART_CHARS);
  let used = 0;
  for (const id of pieceOrder || []) {
    const text = String(approvedById?.[id] || "");
    if (!text) continue;
    const sep = used > 0 ? 2 : 0; // "\n\n" between parts
    if (used + sep + text.length > budget) {
      return { truncated: true, cutPieceId: id, cutOffsetInPiece: Math.max(0, budget - 3 - used - sep) };
    }
    used += sep + text.length;
  }
  return { truncated: false, cutPieceId: null, cutOffsetInPiece: null };
}
