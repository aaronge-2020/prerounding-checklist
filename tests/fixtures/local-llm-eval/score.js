// Shared scoring for the local-LLM eval fixtures. Given a fixture (with
// per-sentence ground-truth labels) and a parser's section output
// ({ sectionId: text }), assigns each ground-truth sentence the label of the
// first section whose text contains it, then reports accuracy, coverage, and
// verbatim integrity. Pure module: usable in node and the browser.

export function normalizeSentence(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Split output section text into sentences the same way the verifier does:
// newlines are strong boundaries; within a line, split on sentence-ending
// punctuation followed by a capital letter or end.
export function splitOutputSentences(text) {
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

export function scoreParse(fixture, sections, { latencyMs = null } = {}) {
  const sectionEntries = Object.entries(sections || {}).filter(([, text]) => String(text || "").trim());
  const perSentence = fixture.sentences.map((sentence) => {
    const norm = normalizeSentence(sentence.text);
    let predicted = null;
    for (const [label, body] of sectionEntries) {
      if (normalizeSentence(body).includes(norm)) {
        predicted = label;
        break;
      }
    }
    return {
      text: sentence.text,
      expected: sentence.label,
      predicted, // null => dropped (in no section)
      correct: predicted === sentence.label
    };
  });
  const correct = perSentence.filter((s) => s.correct).length;
  const placed = perSentence.filter((s) => s.predicted !== null).length;

  // Verbatim integrity: every output sentence must appear in the source text.
  const sourceNorm = normalizeSentence(fixture.text);
  let outputSentences = 0;
  let verbatimSentences = 0;
  for (const [, body] of sectionEntries) {
    for (const sentence of splitOutputSentences(body)) {
      outputSentences++;
      if (sourceNorm.includes(normalizeSentence(sentence))) verbatimSentences++;
    }
  }

  return {
    fixtureId: fixture.id,
    noteType: fixture.noteType,
    sentences: fixture.sentences.length,
    correct,
    accuracy: fixture.sentences.length ? correct / fixture.sentences.length : 1,
    placed,
    dropped: fixture.sentences.length - placed,
    coverage: fixture.sentences.length ? placed / fixture.sentences.length : 1,
    outputSentences,
    verbatimSentences,
    verbatimRate: outputSentences ? verbatimSentences / outputSentences : 1,
    latencyMs,
    perSentence
  };
}

export function summarizeScores(scores) {
  const total = scores.reduce((n, s) => n + s.sentences, 0);
  const correct = scores.reduce((n, s) => n + s.correct, 0);
  const dropped = scores.reduce((n, s) => n + s.dropped, 0);
  const output = scores.reduce((n, s) => n + s.outputSentences, 0);
  const verbatim = scores.reduce((n, s) => n + s.verbatimSentences, 0);
  return {
    fixtures: scores.length,
    sentences: total,
    accuracy: total ? correct / total : 1,
    dropped,
    dropRate: total ? dropped / total : 0,
    verbatimRate: output ? verbatim / output : 1
  };
}
