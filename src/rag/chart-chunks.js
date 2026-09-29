// Chart-grounded RAG: structure-aware chunking of the patient's chart text.
//
// Pure module: no DOM, no network, no storage. Takes the chart pieces the
// Context inspector already understands ({ id, label, group, rawText }) and
// splits them into retrieval chunks that never cross a section boundary, so
// every chunk keeps its chart-section label for citations.
//
// Chunk ids are deterministic ("<pieceId>#<n>") so a rebuilt index yields
// the same ids — the review gate's session store keys on content hashes and
// ids, and stable ids keep unchanged chunks reusable across sends.

export const CHART_CHUNKS_VERSION = "20260929-rag-v2";

// Token estimate shared with the rest of the chat code: ~4 chars/token.
export const CHARS_PER_TOKEN = 4;

export const DEFAULT_CHUNK_TOKENS = 500;
export const DEFAULT_OVERLAP_TOKENS = 50;

export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / CHARS_PER_TOKEN);
}

// Canonical sentence splitter shared with the rest of the chat code.
// Re-exported here so existing importers keep working.
import { splitSentences } from "../local-llm/section-split.js?v=20260927-local-llm-v4";
export { splitSentences };

function packSentences(sentences, maxTokens, overlapTokens) {
  const chunks = [];
  let current = [];
  let currentTokens = 0;
  const flush = () => {
    if (!current.length) return;
    chunks.push(current.join(" "));
    // Overlap: carry trailing sentences (~overlapTokens) into the next
    // chunk so a fact split across a boundary stays retrievable.
    if (overlapTokens > 0) {
      const carried = [];
      let carriedTokens = 0;
      for (let i = current.length - 1; i >= 0; i -= 1) {
        const tokens = estimateTokens(current[i]);
        if (carried.length && carriedTokens + tokens > overlapTokens) break;
        carried.unshift(current[i]);
        carriedTokens += tokens;
      }
      // Don't carry the whole chunk (degenerate overlap on tiny pieces).
      current = carried.length < current.length ? carried : [];
      currentTokens = current.reduce((sum, s) => sum + estimateTokens(s), 0);
    } else {
      current = [];
      currentTokens = 0;
    }
  };
  for (const sentence of sentences) {
    const tokens = estimateTokens(sentence);
    if (current.length && currentTokens + tokens > maxTokens) flush();
    // A single oversized sentence becomes its own chunk rather than being
    // dropped; it may exceed maxTokens, which the caller tolerates.
    current.push(sentence);
    currentTokens += tokens;
  }
  flush();
  return chunks.filter((text) => text.trim().length > 0);
}

// Chunk one chart piece. Returns [{ id, pieceId, label, group, text, index,
// chunkCount }]. Empty pieces yield no chunks.
export function chunkPiece(piece, { maxTokens = DEFAULT_CHUNK_TOKENS, overlapTokens = DEFAULT_OVERLAP_TOKENS } = {}) {
  const rawText = String(piece?.rawText || "").trim();
  if (!rawText) return [];
  const pieceId = String(piece?.id || "piece");
  const sentences = splitSentences(rawText);
  // No sentence boundaries (e.g. a dense lab block): fall back to
  // character windows so nothing is silently dropped.
  const texts = sentences.length
    ? packSentences(sentences, maxTokens, overlapTokens)
    : characterWindows(rawText, maxTokens);
  return texts.map((text, index) => ({
    id: `${pieceId}#${index}`,
    pieceId,
    label: String(piece?.label || "Note"),
    group: String(piece?.group || ""),
    text,
    index,
    chunkCount: texts.length
  }));
}

function characterWindows(text, maxTokens) {
  const size = Math.max(200, maxTokens * CHARS_PER_TOKEN);
  const out = [];
  for (let start = 0; start < text.length; start += size) {
    out.push(text.slice(start, start + size));
  }
  return out;
}

// Chunk every piece of the chart. Pieces keep their order; chunk numbering
// restarts per piece so ids stay stable when an unrelated piece changes.
export function chunkChartPieces(pieces, options = {}) {
  const out = [];
  for (const piece of pieces || []) {
    for (const chunk of chunkPiece(piece, options)) out.push(chunk);
  }
  return out;
}

// FNV-1a 32-bit hash, hex-encoded. Change detection only (index staleness),
// not security — the vault's AES-GCM remains the confidentiality boundary.
export function hashContent(text) {
  let hash = 0x811c9dc5;
  const input = String(text || "");
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Hash the full chunk set: any chart edit changes the hash and the index
// rebuilds; unchanged charts reuse the cached vectors.
export function hashChunkSet(chunks) {
  return hashContent((chunks || []).map((c) => `${c.id}\n${c.text}`).join("\n"));
}

// Canonical piece-text resolver shared with the rest of the chat code.
// Re-exported as resolvePieceText so existing importers keep working.
import { pieceText } from "../local-llm/patient-context.js?v=20260929-local-llm-v10";
export { pieceText };
export const resolvePieceText = pieceText;

// Convenience: resolve raw text for every piece descriptor (the shape
// listPatientContextPieces returns) and attach it as rawText.
export function piecesWithRawText(patient, pieceDescriptors, { draftNoteText = "", draftNoteSections = null } = {}) {
  return (pieceDescriptors || [])
    .map((piece) => ({ ...piece, rawText: resolvePieceText(patient, piece, { draftNoteText, draftNoteSections }) }))
    .filter((piece) => piece.rawText);
}
