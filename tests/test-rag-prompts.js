// Tests for src/rag/rag-prompts.js and src/rag/rag-chat-integration.js:
// grounded prompt assembly and the AI Chat review-gate wiring seam.

import assert from "node:assert/strict";

import {
  RAG_CITATION_INSTRUCTIONS,
  buildCitedContextBlock,
  buildGroundedContextSection,
  formatChunkLabel
} from "../src/rag/rag-prompts.js";

import {
  attachCitations,
  citationForChip,
  toRagReviewTargets
} from "../src/rag/rag-chat-integration.js";

{
  assert.ok(RAG_CITATION_INSTRUCTIONS.includes("[C1]"), "instructions explain the tag format");
  assert.ok(RAG_CITATION_INSTRUCTIONS.includes("do not contain the answer") || RAG_CITATION_INSTRUCTIONS.includes("don't include"),
    "instructions require admitting when the chart lacks the answer");
}

{
  assert.equal(formatChunkLabel({ label: "Plan", group: "Admission" }), "Admission — Plan");
  assert.equal(formatChunkLabel({ label: "Plan", group: "" }), "Plan");
  assert.equal(formatChunkLabel({}), "Chart excerpt");
}

{
  const chunks = [
    { label: "HPI", group: "Admission", text: "Chest pain for 2 hours." },
    { label: "Progress note", group: "Hospital day 1", text: "Troponin rising." }
  ];
  const { block, numbered } = buildCitedContextBlock(chunks);
  assert.equal(numbered.length, 2);
  assert.deepEqual(numbered.map((c) => c.n), [1, 2], "numbered [C1], [C2] in order");
  assert.ok(block.includes("[C1] (Admission — HPI)"), "block labels the section");
  assert.ok(block.includes("Chest pain for 2 hours."), "block carries chunk text");
  assert.ok(block.indexOf("[C1]") < block.indexOf("[C2]"), "score order preserved");
}

{
  const { section, numbered } = buildGroundedContextSection([
    { label: "HPI", group: "Admission", text: "De-identified excerpt." }
  ]);
  assert.ok(section.includes(RAG_CITATION_INSTRUCTIONS), "section starts with the citation instructions");
  assert.ok(section.includes("[C1]"), "section includes numbered excerpts");
  assert.equal(numbered.length, 1);
  const empty = buildGroundedContextSection([]);
  assert.equal(empty.section, "", "no chunks -> empty section (gate falls back)");
  assert.deepEqual(empty.numbered, []);
}

// --- wiring seam ---

{
  const hits = [
    { n: 1, id: "admission:sec1#0", pieceId: "admission:sec1", label: "HPI", group: "Admission", text: "Chest pain.", score: 0.8 },
    { n: 2, id: "day:d1:c1#0", pieceId: "day:d1:c1", label: "Progress note", group: "Hospital day 1", text: "Troponin up.", score: 0.7 }
  ];
  const targets = toRagReviewTargets(hits);
  assert.equal(targets.length, 2);
  assert.equal(targets[0].id, "rag:admission:sec1#0", "stable target id for the review gate");
  assert.equal(targets[0].citationN, 1, "citation number travels with the target");
  assert.equal(targets[0].rawText, "Chest pain.", "raw text is the chunk");
  assert.ok(targets[0].title.includes("[C1]"), "title shows the citation number");
  assert.ok(targets[0].title.includes("Admission"), "title shows the section");
  assert.deepEqual(targets[0].chunkRef, { n: 1, pieceId: "admission:sec1", label: "HPI", group: "Admission" });
  // Deterministic: same hits -> same target ids (review hash cache reuse).
  assert.deepEqual(toRagReviewTargets(hits).map((t) => t.id), targets.map((t) => t.id));
}

{
  const message = { role: "assistant", text: "Pain [C1]." };
  const withCites = attachCitations(message, [
    { n: 1, label: "HPI", group: "Admission", approvedText: "De-identified: chest pain." }
  ]);
  assert.equal(withCites.text, "Pain [C1].", "original message untouched");
  assert.equal(withCites.citations.length, 1);
  assert.equal(withCites.citations[0].text, "De-identified: chest pain.", "cited text is the REVIEWED text");
  assert.equal(citationForChip(withCites, 1).label, "HPI", "chip lookup finds the excerpt");
  assert.equal(citationForChip(withCites, 99), null, "unknown chip number -> null");
  assert.equal(citationForChip({}, 1), null, "message without citations -> null");
  // Does not mutate the input.
  assert.ok(!("citations" in message), "input message not mutated");
}

console.log("test-rag-prompts+integration: all assertions passed");
