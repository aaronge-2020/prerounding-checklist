// Tests for src/rag/chart-chunks.js: structure-aware chart chunking.
// All fixtures are synthetic and PHI-free.

import assert from "node:assert/strict";

import {
  CHART_CHUNKS_VERSION,
  chunkChartPieces,
  chunkPiece,
  estimateTokens,
  hashChunkSet,
  hashContent,
  piecesWithRawText,
  resolvePieceText,
  splitSentences,
  DEFAULT_CHUNK_TOKENS
} from "../src/rag/chart-chunks.js";

assert.ok(CHART_CHUNKS_VERSION, "version constant exists");
assert.equal(estimateTokens("abcd"), 1, "4 chars ~= 1 token");
assert.equal(estimateTokens("abcdefgh"), 2, "8 chars ~= 2 tokens");

// --- splitSentences ---

{
  const sentences = splitSentences("Chest pain for 2 hours.\nDenies SOB. Vitals stable.");
  assert.deepEqual(sentences, ["Chest pain for 2 hours.", "Denies SOB.", "Vitals stable."]);
  assert.deepEqual(splitSentences(""), []);
  assert.deepEqual(splitSentences("   \n  "), []);
}

// --- chunkPiece: section boundaries ---

{
  const piece = {
    id: "admission:sec1",
    label: "History of present illness",
    group: "Admission",
    rawText: "Mr. X is a 60-year-old man with chest pain. The pain started 2 hours ago. It radiates to the left arm. He denies shortness of breath. He denies nausea."
  };
  const chunks = chunkPiece(piece, { maxTokens: 20, overlapTokens: 0 });
  assert.ok(chunks.length >= 2, `long piece splits into multiple chunks (got ${chunks.length})`);
  for (const chunk of chunks) {
    assert.equal(chunk.pieceId, "admission:sec1");
    assert.equal(chunk.label, "History of present illness");
    assert.equal(chunk.group, "Admission");
    assert.ok(estimateTokens(chunk.text) <= 20, `chunk respects maxTokens: ${estimateTokens(chunk.text)}`);
  }
  // Deterministic ids.
  assert.deepEqual(chunks.map((c) => c.id), chunks.map((c, i) => `admission:sec1#${i}`));
  assert.equal(chunks[0].chunkCount, chunks.length);
}

{
  // Empty piece yields no chunks.
  assert.deepEqual(chunkPiece({ id: "x", rawText: "   " }), []);
  assert.deepEqual(chunkPiece({ id: "x", rawText: "" }), []);
}

// --- overlap ---

{
  const piece = {
    id: "p",
    label: "L",
    group: "G",
    rawText: Array.from({ length: 12 }, (_, i) => `Sentence number ${i} about the patient course.`).join(" ")
  };
  const noOverlap = chunkPiece(piece, { maxTokens: 30, overlapTokens: 0 });
  const withOverlap = chunkPiece(piece, { maxTokens: 30, overlapTokens: 10 });
  assert.ok(withOverlap.length >= noOverlap.length, "overlap does not reduce chunk count");
  if (withOverlap.length > 1) {
    // The second chunk starts with carried-over text from the first.
    const firstWords = withOverlap[0].text.split(" ").slice(-4).join(" ");
    assert.ok(withOverlap[1].text.includes(firstWords.split(" ").slice(0, 2).join(" ")),
      "overlap carries trailing sentences forward");
  }
}

// --- chunkChartPieces: never crosses pieces ---

{
  const pieces = [
    { id: "a", label: "Allergies", group: "Admission", rawText: "NKDA." },
    { id: "b", label: "Plan", group: "Admission", rawText: "Continue heparin drip. Repeat troponin in 3 hours. Cardiology consult." }
  ];
  const chunks = chunkChartPieces(pieces, { maxTokens: 500 });
  assert.ok(chunks.every((c) => c.pieceId === "a" || c.pieceId === "b"), "chunks keep their piece");
  const textA = chunks.filter((c) => c.pieceId === "a").map((c) => c.text).join(" ");
  const textB = chunks.filter((c) => c.pieceId === "b").map((c) => c.text).join(" ");
  assert.ok(!textA.includes("heparin"), "piece A's chunks contain no piece B text");
  assert.ok(!textB.includes("NKDA"), "piece B's chunks contain no piece A text");
}

// --- hashing ---

{
  assert.equal(hashContent("abc"), hashContent("abc"), "hash is deterministic");
  assert.notEqual(hashContent("abc"), hashContent("abd"), "hash distinguishes content");
  const chunks = chunkChartPieces([{ id: "a", label: "L", group: "G", rawText: "Some text here." }]);
  assert.equal(hashChunkSet(chunks), hashChunkSet(chunkChartPieces([{ id: "a", label: "L", group: "G", rawText: "Some text here." }])));
  assert.notEqual(
    hashChunkSet(chunks),
    hashChunkSet(chunkChartPieces([{ id: "a", label: "L", group: "G", rawText: "Some text here, edited." }])),
    "edited chart changes the chunk-set hash"
  );
}

// --- resolvePieceText ---

{
  const patient = {
    displayLabel: "Test Patient",
    metadata: { admissionDate: "2026-09-20" },
    contextSections: [
      { id: "sec-hpi", label: "History of present illness", sourceKind: "primary_note", deidentifiedText: "Chest pain, deidentified." }
    ],
    days: [
      {
        id: "day1", label: "Hospital day 1", date: "2026-09-21",
        sourceCaptures: [
          { id: "cap1", label: "Progress note", sourceKind: "primary_note", deidentifiedText: "Doing well, deidentified." }
        ],
        quickNotes: ["Call family"]
      }
    ]
  };
  const admission = resolvePieceText(patient, { id: "admission:sec-hpi", label: "History of present illness" });
  assert.ok(admission.includes("Chest pain, deidentified."), "resolves admission section text");
  const day = resolvePieceText(patient, { id: "day:day1:cap1", label: "Progress note", group: "Hospital day 1 (2026-09-21)" });
  assert.ok(day.includes("Doing well, deidentified."), "resolves day capture text");
  const quick = resolvePieceText(patient, { id: "day:day1:quicknotes", group: "Hospital day 1 (2026-09-21)" });
  assert.ok(quick.includes("Call family"), "resolves quick notes");
  const draft = resolvePieceText(patient, { id: "draft:current" }, { draftNoteText: "My draft." });
  assert.ok(draft.includes("My draft."), "resolves draft note text");
  assert.equal(resolvePieceText(patient, { id: "day:nope:cap1" }), "", "unknown day resolves empty");
  assert.equal(resolvePieceText(null, { id: "admission:x" }), "", "null patient resolves empty");

  const withText = piecesWithRawText(patient, [
    { id: "admission:sec-hpi", label: "History of present illness", group: "Admission" },
    { id: "day:nope:cap1", label: "Missing", group: "G" }
  ]);
  assert.equal(withText.length, 1, "pieces without text are dropped");
  assert.ok(withText[0].rawText.includes("Chest pain"), "rawText attached");
}

assert.ok(DEFAULT_CHUNK_TOKENS > 0, "default chunk size is sane");

console.log("test-rag-chunks: all assertions passed");
