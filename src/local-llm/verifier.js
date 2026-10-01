// Browser local LLM privacy verifier for clinical text.
// Pure module: no DOM, no storage, no network. The chat function is injected
// so prompt building, JSON extraction, and span mapping stay unit testable
// in node. This is the WebLLM port of the wllama verifier prototype: a
// deterministic first pass runs first, then the local model rereads the note
// as a second privacy reviewer and returns PHI spans as JSON. The spans are
// mapped back to character offsets and merged with the first pass.
// Verification fails soft: when the model call or the parse fails, the
// caller keeps the first pass and reports honestly.

export const VERIFIER_SOURCE = "llm-verifier";
// The review queue surfaces the least certain detections first, so verifier
// spans carry a middling confidence that puts them ahead of deterministic
// findings without claiming certainty.
export const VERIFIER_CONFIDENCE = 0.5;
// Keep the prompt inside the context window of the registered local models
// (4096 tokens) with room left for the JSON answer.
export const VERIFIER_MAX_NOTE_CHARS = 12000;
export const VERIFIER_MAX_TOKENS = 1024;
export const VERIFIER_TIMEOUT_MS = 5 * 60 * 1000;

export const VERIFIER_ALLOWED_TYPES = Object.freeze([
  "PATIENT NAME",
  "PROVIDER NAME",
  "NAME",
  "DATE",
  "DOB",
  "AGE",
  "PHONE",
  "EMAIL",
  "ADDRESS",
  "LOCATION",
  "FACILITY",
  "ORGANIZATION",
  "OCCUPATION",
  "MRN",
  "ID"
]);

const SYSTEM_PROMPT = `You are a privacy reviewer for clinical notes. Find every span of protected health information in the clinical note below.
Reply with ONLY a JSON array. Each element: {"text": "<exact substring copied character for character from the note>", "type": "<TYPE>"}.
TYPE must be one of: PATIENT NAME, PROVIDER NAME, NAME, DATE, DOB, AGE, PHONE, EMAIL, ADDRESS, LOCATION, FACILITY, ORGANIZATION, OCCUPATION, MRN, ID.
Copy each span exactly as it appears. No explanations, no markdown. Empty array [] if the note has no PHI.`;

const USER_PREFIX = "NOTE:\n<<<\n";
const USER_SUFFIX = "\n>>>";

export function buildVerifierPrompt(noteText) {
  return {
    system: SYSTEM_PROMPT,
    user: `${USER_PREFIX}${String(noteText || "")}${USER_SUFFIX}`
  };
}

// The model sometimes wraps the array in prose. Slice from the first [
// to the last ] and parse; anything else is a parse failure.
export function extractVerifierJsonArray(raw) {
  const text = String(raw || "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0 || end < start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// Map predicted substrings to character offsets with a case sensitive
// search. Every non overlapping occurrence of a predicted string becomes a
// span, which favors recall. Predictions with zero matches are dropped and
// counted, as are predictions with an unrecognized type.
export function mapVerifierSpansToOffsets(noteText, items) {
  const source = String(noteText || "");
  const list = Array.isArray(items) ? items : [];
  const entities = [];
  let unmatched = 0;
  let ambiguous = 0;
  let badType = 0;
  for (const item of list) {
    const text = String(item?.text || "");
    const type = String(item?.type || "").toUpperCase().trim();
    if (!text || !VERIFIER_ALLOWED_TYPES.includes(type)) {
      badType += 1;
      continue;
    }
    const occurrences = [];
    let from = 0;
    for (;;) {
      const found = source.indexOf(text, from);
      if (found < 0) break;
      occurrences.push(found);
      from = found + text.length;
      if (occurrences.length > 200) break;
    }
    if (!occurrences.length) {
      unmatched += 1;
      continue;
    }
    if (occurrences.length > 1) ambiguous += 1;
    for (const start of occurrences) {
      entities.push({
        start,
        end: start + text.length,
        label: type,
        source: VERIFIER_SOURCE,
        confidence: VERIFIER_CONFIDENCE
      });
    }
  }
  return {
    entities,
    stats: { items: list.length, unmatched, ambiguous, badType }
  };
}

// Keep only verifier spans that add new coverage. A span touching any first
// pass span is already in the review queue, so the verifier cannot widen or
// contradict it here; the clinician can still adjust the span by hand during
// review.
export function dedupeVerifierEntities(firstPassEntities = [], verifierEntities = []) {
  const first = Array.isArray(firstPassEntities) ? firstPassEntities : [];
  const novel = [];
  for (const entity of Array.isArray(verifierEntities) ? verifierEntities : []) {
    const start = Number(entity?.start);
    const end = Number(entity?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const overlapsFirstPass = first.some((other) => {
      const otherStart = Number(other?.start);
      const otherEnd = Number(other?.end);
      return (
        Number.isFinite(otherStart) &&
        Number.isFinite(otherEnd) &&
        start < otherEnd &&
        end > otherStart
      );
    });
    if (!overlapsFirstPass) novel.push(entity);
  }
  return novel;
}

function emptyStats(extra = {}) {
  return {
    items: 0,
    unmatched: 0,
    ambiguous: 0,
    badType: 0,
    parseFailed: false,
    truncated: false,
    rawChars: 0,
    error: "",
    ...extra
  };
}

// Run one verification pass. chatFn has the client.chat signature
// (messages, options) and thinking is disabled so the model spends its
// output budget on the JSON array instead of reasoning traces. Never
// throws: failures return empty entities with the reason in stats so the
// caller can keep the first pass and say so.
export async function runLlmVerifier(
  chatFn,
  noteText,
  { onToken, maxTokens = VERIFIER_MAX_TOKENS, timeoutMs = VERIFIER_TIMEOUT_MS } = {}
) {
  const full = String(noteText || "");
  const truncated = full.length > VERIFIER_MAX_NOTE_CHARS;
  const text = truncated ? full.slice(0, VERIFIER_MAX_NOTE_CHARS) : full;
  const { system, user } = buildVerifierPrompt(text);
  let raw = "";
  try {
    raw = await chatFn(
      [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      {
        maxTokens,
        temperature: 0,
        chatOpts: { extraBody: { enable_thinking: false } },
        timeoutMs,
        onToken
      }
    );
  } catch (error) {
    return {
      entities: [],
      stats: emptyStats({
        truncated,
        error: error?.message || "Local model call failed."
      })
    };
  }
  const rawText = String(raw || "");
  const items = extractVerifierJsonArray(rawText);
  if (!items) {
    return {
      entities: [],
      stats: emptyStats({ parseFailed: true, truncated, rawChars: rawText.length })
    };
  }
  const { entities, stats } = mapVerifierSpansToOffsets(text, items);
  return {
    entities,
    stats: { ...emptyStats(), ...stats, truncated, rawChars: rawText.length }
  };
}
