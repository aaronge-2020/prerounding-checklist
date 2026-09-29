// Tests for src/rag/similarity.js: cosine similarity and top-k ranking.

import assert from "node:assert/strict";

import {
  cosineSimilarity,
  dotProduct,
  normalizeInPlace,
  topKSimilarities,
  vectorNorm
} from "../src/rag/similarity.js";

{
  assert.equal(dotProduct([1, 2, 3], [4, 5, 6]), 32, "dot product");
  assert.ok(Math.abs(vectorNorm([3, 4]) - 5) < 1e-9, "norm of 3-4-5");
}

{
  // Identical direction -> 1; orthogonal -> 0; opposite -> -1.
  assert.ok(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [-1, 0]) + 1) < 1e-9);
  // Scale-invariant: embedding magnitudes don't affect ranking.
  assert.ok(Math.abs(cosineSimilarity([2, 0], [100, 0]) - 1) < 1e-9);
  // Zero vectors score 0, not NaN.
  assert.equal(cosineSimilarity([0, 0], [1, 0]), 0);
  assert.equal(cosineSimilarity([0, 0], [0, 0]), 0);
  // Works with Float32Array (worker vectors).
  assert.ok(Math.abs(cosineSimilarity(Float32Array.from([1, 2]), Float32Array.from([1, 2])) - 1) < 1e-6);
}

{
  const v = normalizeInPlace([3, 4]);
  assert.ok(Math.abs(vectorNorm(v) - 1) < 1e-9, "normalizeInPlace yields unit vector");
  assert.deepEqual([...normalizeInPlace([0, 0])], [0, 0], "zero vector untouched");
}

// Synthetic retrieval ranking: the query vector sits near one candidate.
{
  const candidates = [
    { id: "a", vector: [1, 0, 0] },
    { id: "b", vector: [0, 1, 0] },
    { id: "c", vector: [0.9, 0.1, 0] }
  ];
  const top = topKSimilarities([1, 0, 0], candidates, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].id, "a", "exact match ranks first");
  assert.equal(top[1].id, "c", "near match ranks second");
  assert.ok(top[0].score >= top[1].score, "scores descend");
}

{
  // Deterministic tie-break by id.
  const candidates = [
    { id: "b", vector: [1, 0] },
    { id: "a", vector: [1, 0] }
  ];
  const top = topKSimilarities([1, 0], candidates, 2);
  assert.deepEqual(top.map((t) => t.id), ["a", "b"]);
}

{
  assert.deepEqual(topKSimilarities([1, 0], [{ id: "a", vector: [1, 0] }], 0), [], "k=0 returns []");
  assert.deepEqual(topKSimilarities([1, 0], [{ id: "a", vector: [1, 0] }], -3), [], "negative k returns []");
  const top = topKSimilarities([1, 0], [{ id: "a", vector: [1, 0] }], 10);
  assert.equal(top.length, 1, "k larger than candidate count is fine");
  assert.deepEqual(topKSimilarities([1, 0], null, 5), [], "null candidates");
  // Candidates missing vectors are skipped, not fatal.
  const mixed = topKSimilarities([1, 0], [{ id: "a" }, { id: "b", vector: [1, 0] }], 5);
  assert.deepEqual(mixed.map((t) => t.id), ["b"]);
}

console.log("test-rag-similarity: all assertions passed");
