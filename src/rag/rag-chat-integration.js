// Wiring seam: chart-grounded cited answers into AI Chat's remote
// (ChatGPT) send flow.
//
// Pure module: no DOM, no network, no storage. It does NOT modify the
// AI Chat controller — it produces the exact values the controller's
// existing HIPAA review gate already consumes, so the wiring is a few
// lines in src/ui/ai-chat/controller.js once its remote flow (and the
// missing delta-review.js it imports) is complete.
//
// THE WIRING (for the AI Chat owner):
//
//  1. In sendRemoteChat, BEFORE building contextTargets: retrieve the
//     top-k chunks for the student's message:
//       import { retrieveChartChunks } from "../../rag/rag-service.js";
//       import { toRagReviewTargets } from "../../rag/rag-chat-integration.js";
//       const ragHits = await retrieveChartChunks({
//         patientId, pieces: split.pieces, query: message, k: 6
//       }).catch(() => []);
//     On any retrieval failure, ragHits is [] and the flow falls back to
//     the current full-piece contextTargets — the gate still applies.
//
//  2. Replace contextTargets with toRagReviewTargets(ragHits) when hits
//     exist. Each target flows through prepareReviewPiece EXACTLY like a
//     chart piece today: de-identified, reviewable, hash-cached in the
//     reviewStore. The review modal shows the de-identified excerpts —
//     exactly what will be sent. Nothing about the gate changes.
//
//  3. In rebuildTransmit / buildTransmitPayload, label the RAG targets
//     [C1]..[Ck] in hit order and append RAG_CITATION_INSTRUCTIONS (from
//     ../../rag/rag-prompts.js) to the system prompt. Build the context
//     section with buildGroundedContextSection(deidentifiedChunks).
//
//  4. In doRemoteSend, attach the reviewed excerpts to the assistant
//     message with attachCitations(message, reviewedChunks) where
//     reviewedChunks come from the gate's approvedText per RAG target.
//     The presentation renders the reply with renderCitedHtml (from
//     ../../rag/citations.js) and shows the chunk on chip click
//     (data-rag-cite="n" -> message.citations[n]).
//
// Why chunks go through the gate as pieces: the gate already proves
// per-piece de-identification, exact-outbound display, and fail-closed
// send. RAG targets reuse all of it; no parallel gate is invented.

import { buildCitedContextBlock, formatChunkLabel } from "./rag-prompts.js";

// Convert retrieved hits into review-gate context targets. The gate keys
// pieces by id and caches reviews by content hash; chunk ids are
// deterministic ("<pieceId>#<n>"), so unchanged chunks reuse their stored
// review verbatim across sends.
export function toRagReviewTargets(hits) {
  return (hits || []).map((hit) => ({
    id: `rag:${hit.id}`,
    title: `Chart excerpt [C${hit.n}] — ${formatChunkLabel(hit)}`,
    group: String(hit.group || ""),
    rawText: String(hit.text || ""),
    citationN: hit.n,
    chunkRef: {
      n: hit.n,
      pieceId: hit.pieceId,
      label: hit.label,
      group: hit.group
    }
  }));
}

// Attach the DE-IDENTIFIED reviewed excerpts to an assistant message so
// the presentation can render [Cn] chips. reviewedChunks:
// [{ n, label, group, approvedText }]. Returns a new message object.
export function attachCitations(message, reviewedChunks) {
  const citations = (reviewedChunks || []).map((chunk) => ({
    n: chunk.n,
    label: String(chunk?.label || "Chart excerpt"),
    group: String(chunk?.group || ""),
    text: String(chunk?.approvedText || chunk?.text || "")
  }));
  return { ...(message || {}), citations };
}

// Look up the cited excerpt for a chip click: message.citations is the
// array attachCitations built.
export function citationForChip(message, n) {
  const citations = Array.isArray(message?.citations) ? message.citations : [];
  return citations.find((c) => c.n === Number(n)) || null;
}

// Re-export the prompt builders at the seam so the controller imports
// from one place.
export { buildCitedContextBlock, formatChunkLabel };
