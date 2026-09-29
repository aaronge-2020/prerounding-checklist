// Prompt assembly for chart-grounded cited answers.
//
// Pure module: no DOM, no network, no storage. Builds the numbered chart
// excerpt block the model receives and the strict citation instructions
// that govern its answer. The excerpts passed in must ALREADY be
// de-identified (they come out of the review gate's approvedText) — this
// module never sees raw chart text.

// Strict instructions, adapted from the quote-only pattern: the model may
// use ONLY the numbered excerpts for patient facts, must cite every such
// claim, and must say when the excerpts don't contain the answer.
export const RAG_CITATION_INSTRUCTIONS = [
  "CHART GROUNDING — read carefully. You are answering about THIS patient, and you have been given numbered chart excerpts below.",
  "",
  "1. Use ONLY the numbered excerpts for facts about the patient. Do not use outside knowledge, do not infer beyond what is written, and do not restate the question as fact.",
  "2. EVERY factual claim about the patient MUST cite the excerpt(s) it comes from, using the exact tags [C1], [C2], etc. A claim without a citation is a failure.",
  "3. Quote or closely paraphrase the excerpt; never add details the excerpt doesn't state.",
  "4. If the excerpts do not contain the answer, say so explicitly (\"The chart excerpts provided don't include …\") instead of guessing.",
  "5. General medical teaching (pathophysiology, guidelines) may supplement the answer but must be clearly separated from patient facts and labeled as general knowledge, not chart-derived."
].join("\n");

// "Admission — History of present illness", falling back gracefully.
export function formatChunkLabel(chunk) {
  const group = String(chunk?.group || "").trim();
  const label = String(chunk?.label || "Chart excerpt").trim();
  return group ? `${group} — ${label}` : label;
}

// Number the retrieved chunks [C1]..[Ck] in score order and render the
// context block. chunks: [{ label, group, text }] with DE-IDENTIFIED text.
// Returns { block, numbered } where numbered is [{ n, label, group, text }].
export function buildCitedContextBlock(chunks) {
  const numbered = (chunks || []).map((chunk, index) => ({
    n: index + 1,
    label: String(chunk?.label || "Chart excerpt"),
    group: String(chunk?.group || ""),
    text: String(chunk?.text || "")
  }));
  const block = numbered
    .map((chunk) => `[C${chunk.n}] (${formatChunkLabel(chunk)})\n${chunk.text}`)
    .join("\n\n");
  return { block, numbered };
}

// The full context section appended to the user message (or prompt) before
// sending: instructions first, then the numbered excerpts.
export function buildGroundedContextSection(chunks) {
  const { block, numbered } = buildCitedContextBlock(chunks);
  if (!numbered.length) return { section: "", numbered };
  const section = [
    "[Chart excerpts for citation — de-identified; verified by the student before sending]",
    "",
    RAG_CITATION_INSTRUCTIONS,
    "",
    block
  ].join("\n");
  return { section, numbered };
}
