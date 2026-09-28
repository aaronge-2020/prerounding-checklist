// Orchestrates LLM-based note section splitting: chunk the note, ask the
// model to classify each chunk, parse the JSON, and run the deterministic
// verifier on every chunk. Fails closed: any chunk that does not verify after
// retries rejects the whole parse, and the caller keeps the deterministic
// result instead of silently using unverified output.

import {
  buildSectionSplitPrompt,
  chunkNoteForSplit,
  mergeSectionSplitResults,
  parseSectionSplitJson,
  verifySectionSplit
} from "./section-split.js?v=20260927-local-llm-v4";
import { stripThinking } from "./thinking.js?v=20260927-local-llm-v4";

const MAX_CHUNK_RETRIES = 2;
const MIN_COVERAGE = 0.5;
// Generation of one chunk must never hang the caller: the client enforces
// this deadline and fails closed so the deterministic parse is kept.
const PARSE_CHAT_TIMEOUT_MS = 10 * 60 * 1000;

async function parseChunkWithModel(client, chunkText, noteType, attempt, { onToken, index } = {}) {
  const { system, user } = buildSectionSplitPrompt(chunkText, noteType);
  const raw = await client.chat(
    [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    {
      maxTokens: 2048,
      temperature: attempt === 0 ? 0 : 0.3,
      // Deterministic extraction: sort sentences into labels, no reasoning
      // needed. Chain-of-thought would burn most of the 2048-token output
      // budget on thinking and slow every chunk to a crawl.
      chatOpts: { extraBody: { enable_thinking: false } },
      timeoutMs: PARSE_CHAT_TIMEOUT_MS,
      onToken: onToken ? (token) => onToken({ index, token }) : undefined
    }
  );
  const parsed = parseSectionSplitJson(stripThinking(raw));
  const verification = verifySectionSplit(parsed, chunkText, noteType);
  return { parsed, verification, raw };
}

// Returns { sections, unparsed, coverage, chunks } on success; throws on
// failure so the caller can fall back honestly. onChunk reports per-chunk
// progress; onToken streams live generation counts ({ index, token }) so the
// UI can show the model is actually producing output.
export async function splitNoteSectionsWithLlm(client, noteText, noteType, { onChunk, onToken } = {}) {
  const text = String(noteText || "").trim();
  if (!text) throw new Error("Nothing to parse.");
  const chunks = chunkNoteForSplit(text);
  let merged = { sections: {}, unparsed: "" };
  let accounted = 0;
  let total = 0;

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    let lastError = null;
    let accepted = null;
    for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
      try {
        const { parsed, verification } = await parseChunkWithModel(client, chunk, noteType, attempt, {
          onToken,
          index: index + 1
        });
        if (!verification.ok) {
          lastError = new Error(`Chunk ${index + 1} failed verification: ${verification.errors[0]}`);
          continue;
        }
        if (verification.coverage < MIN_COVERAGE) {
          lastError = new Error(
            `Chunk ${index + 1} left too much text unaccounted for (${Math.round(verification.coverage * 100)}% coverage).`
          );
          continue;
        }
        accepted = { parsed, verification };
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!accepted) {
      throw new Error(
        `Local AI could not verify its parse of part ${index + 1}/${chunks.length}: ${lastError?.message || "unknown error"}`
      );
    }
    merged = mergeSectionSplitResults(merged, accepted.parsed);
    accounted += accepted.verification.accountedSentences;
    total += accepted.verification.sourceSentences;
    onChunk?.({ index: index + 1, total: chunks.length, coverage: accepted.verification.coverage });
  }

  // Drop labels the model emitted that are empty after merging.
  const sections = {};
  for (const [label, body] of Object.entries(merged.sections)) {
    if (String(body || "").trim()) sections[label] = String(body).trim();
  }
  return {
    sections,
    unparsed: String(merged.unparsed || "").trim(),
    coverage: total ? accounted / total : 1,
    chunks: chunks.length
  };
}
