// LLM-based clinical note section splitter: prompt assembly, output parsing,
// and the deterministic verifier that enforces the extractiveness contract.
// Pure module: no DOM, no network, no storage. The safety rule is simple —
// the model may MOVE sentences between sections but must never rewrite,
// summarize, or invent text. verifySectionSplit() enforces that contract with
// plain string matching, so it cannot break the way heading-alias parsing
// does on unexpected note formatting.

export const SECTION_SPLIT_VERSION = "20260927-section-split-v1";

// Section labels the splitter may emit, per note type. These match the field
// ids used by the deterministic primary-team-note parser so results slot into
// the same drafts.
export const SECTION_SPLIT_LABELS = Object.freeze({
  hp: Object.freeze([
    "one_liner",
    "chief_complaint",
    "history_of_present_illness",
    "review_of_systems",
    "medications",
    "allergies",
    "past_medical_history",
    "past_surgical_history",
    "family_history",
    "social_history",
    "diet_and_exercise",
    "physical_exam",
    "objective",
    "assessment",
    "plan",
    "fen",
    "lda",
    "vte_prophylaxis",
    "code_status",
    "disposition",
    "other"
  ]),
  progress: Object.freeze([
    "one_liner",
    "interval_events",
    "patient_report",
    "nursing_report",
    "pertinent_symptoms",
    "medications",
    "physical_exam",
    "objective",
    "assessment",
    "plan",
    "fen",
    "lda",
    "vte_prophylaxis",
    "code_status",
    "disposition",
    "other"
  ])
});

export function sectionSplitLabels(noteType) {
  return SECTION_SPLIT_LABELS[noteType === "progress" ? "progress" : "hp"];
}

const SYSTEM_PROMPT =
  "You are a clinical note section classifier. Your only job is to sort each " +
  "sentence of the provided note into exactly one of the allowed section labels. " +
  "Rules you must follow:\n" +
  "1. COPY sentences verbatim. Never rewrite, summarize, correct, or rephrase.\n" +
  "2. Never invent text. Every sentence in your output must appear word-for-word in the input note.\n" +
  "3. Every input sentence goes into exactly one section, or into \"unparsed\" if it fits nowhere.\n" +
  "4. Do not add explanations, commentary, or any text outside the JSON object.\n" +
  "5. Use only the allowed section labels given in the task message.";

export function buildSectionSplitPrompt(noteText, noteType) {
  const labels = sectionSplitLabels(noteType);
  const user =
    `Allowed section labels: ${labels.join(", ")}\n\n` +
    `Sort every sentence of the following clinical note into those sections. ` +
    `Return ONLY a JSON object of the form:\n` +
    `{"sections": {"<label>": "<verbatim sentences, one per line>", ...}, "unparsed": "<verbatim leftover sentences>"}\n` +
    `Omit empty sections. Note text:\n\n${noteText}`;
  return { system: SYSTEM_PROMPT, user, version: SECTION_SPLIT_VERSION, labels };
}

// Rough token estimate for chunking (WebLLM prebuilt Qwen3 models use a 4096
// token context window; keep chunks well under half for prompt + output).
export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

export function chunkNoteForSplit(noteText, { maxTokens = 1500 } = {}) {
  const paragraphs = String(noteText || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks = [];
  let current = [];
  let currentTokens = 0;
  for (const paragraph of paragraphs) {
    const tokens = estimateTokens(paragraph);
    if (current.length && currentTokens + tokens > maxTokens) {
      chunks.push(current.join("\n\n"));
      current = [];
      currentTokens = 0;
    }
    // A single oversized paragraph becomes its own chunk rather than being dropped.
    current.push(paragraph);
    currentTokens += tokens;
  }
  if (current.length) chunks.push(current.join("\n\n"));
  return chunks.length ? chunks : [String(noteText || "")];
}

// Extract the JSON object from a model response that may include preamble or
// code fences. Returns the parsed object or throws with a clear reason.
export function parseSectionSplitJson(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Empty model response.");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response contained no JSON object.");
  }
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Model response was not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Model response JSON was not an object.");
  }
  return parsed;
}

function normalizeForMatch(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Split text into sentences for the extractiveness check. Newlines are strong
// boundaries (clinical notes are line-oriented); within a line, split on
// sentence-ending punctuation followed by a capital letter or end.
export function splitSentences(text) {
  const sentences = [];
  for (const line of String(text || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/(?<=[.!?;])\s+(?=[A-Z0-9"'(])/);
    for (const part of parts) {
      const sentence = part.trim();
      if (sentence) sentences.push(sentence);
    }
  }
  return sentences;
}

// Verify the splitter output against the source note. Returns
// { ok, errors[], coverage, sections } where coverage is the fraction of
// source sentences accounted for (in a section or unparsed).
export function verifySectionSplit(parsed, sourceText, noteType) {
  const errors = [];
  const labels = new Set(sectionSplitLabels(noteType));
  const sections = parsed && typeof parsed.sections === "object" && parsed.sections !== null ? parsed.sections : null;
  if (!sections) errors.push("Missing \"sections\" object.");
  const unparsed = typeof parsed?.unparsed === "string" ? parsed.unparsed : "";

  const sourceSentences = splitSentences(sourceText);
  const sourceNorm = normalizeForMatch(sourceText);
  // Multiset accounting: a source sentence that appears N times may be
  // emitted at most N times. Emitting it more (or emitting an invented
  // sentence) is duplication/fabrication and fails verification.
  const sourceCounts = new Map();
  for (const sentence of sourceSentences) {
    const norm = normalizeForMatch(sentence);
    if (norm) sourceCounts.set(norm, (sourceCounts.get(norm) || 0) + 1);
  }
  let accountedTotal = 0;

  const outputSentences = [];
  if (sections) {
    for (const [label, body] of Object.entries(sections)) {
      if (!labels.has(label)) {
        errors.push(`Unknown section label: "${label}".`);
        continue;
      }
      for (const sentence of splitSentences(body)) {
        outputSentences.push({ sentence, label });
      }
    }
  }
  for (const sentence of splitSentences(unparsed)) {
    outputSentences.push({ sentence, label: "unparsed" });
  }

  for (const { sentence, label } of outputSentences) {
    const norm = normalizeForMatch(sentence);
    if (!norm) continue;
    if (!sourceNorm.includes(norm)) {
      errors.push(`Non-verbatim text in "${label}": "${sentence.slice(0, 80)}${sentence.length > 80 ? "…" : ""}"`);
      continue;
    }
    // The sentence occurs verbatim in the source. Account for one occurrence:
    // prefer an exact whole-sentence match, then a source sentence containing
    // it (the model may have trimmed a trailing fragment).
    const remaining = sourceCounts.get(norm) || 0;
    if (remaining > 0) {
      sourceCounts.set(norm, remaining - 1);
      accountedTotal++;
      continue;
    }
    let consumed = false;
    for (const [candidate, count] of sourceCounts) {
      if (count > 0 && candidate.includes(norm)) {
        sourceCounts.set(candidate, count - 1);
        accountedTotal++;
        consumed = true;
        break;
      }
    }
    if (!consumed) {
      errors.push(`Duplicated text in "${label}" (emitted more times than it appears in the source): "${sentence.slice(0, 80)}${sentence.length > 80 ? "…" : ""}"`);
    }
  }

  const coverage = sourceSentences.length ? accountedTotal / sourceSentences.length : 1;
  return {
    ok: errors.length === 0,
    errors,
    coverage,
    sourceSentences: sourceSentences.length,
    accountedSentences: accountedTotal
  };
}

// Merge one verified chunk result into the accumulator used across chunks.
export function mergeSectionSplitResults(acc, parsed) {
  const next = { sections: { ...(acc.sections || {}) }, unparsed: acc.unparsed || "" };
  const sections = parsed.sections || {};
  for (const [label, body] of Object.entries(sections)) {
    const text = String(body || "").trim();
    if (!text) continue;
    next.sections[label] = next.sections[label] ? `${next.sections[label]}\n${text}` : text;
  }
  const unparsed = String(parsed.unparsed || "").trim();
  if (unparsed) next.unparsed = next.unparsed ? `${next.unparsed}\n${unparsed}` : unparsed;
  return next;
}
