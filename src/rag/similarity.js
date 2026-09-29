// Cosine similarity and top-k retrieval over embedding vectors.
//
// Pure module: no DOM, no network, no storage. Operates on plain arrays or
// Float32Arrays so both the Node tests and the Web Worker share one
// implementation.

export function dotProduct(a, b) {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += a[i] * b[i];
  return sum;
}

export function vectorNorm(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i += 1) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

// Cosine similarity in [-1, 1]. Zero vectors score 0 (no direction to
// compare) rather than NaN, so a degenerate embedding can't poison ranking.
export function cosineSimilarity(a, b) {
  const normA = vectorNorm(a);
  const normB = vectorNorm(b);
  if (normA === 0 || normB === 0) return 0;
  return dotProduct(a, b) / (normA * normB);
}

// Normalize in place; returns the vector for chaining.
export function normalizeInPlace(v) {
  const norm = vectorNorm(v);
  if (norm === 0) return v;
  for (let i = 0; i < v.length; i += 1) v[i] /= norm;
  return v;
}

// Rank candidates by cosine similarity to the query vector.
// candidates: [{ id, vector }]. Returns [{ id, score }] sorted by score
// descending, ties broken by id for determinism. k <= 0 returns [].
export function topKSimilarities(queryVector, candidates, k) {
  const limit = Math.max(0, Math.floor(Number(k) || 0));
  if (limit === 0) return [];
  const scored = [];
  for (const candidate of candidates || []) {
    if (!candidate || candidate.vector == null) continue;
    scored.push({
      id: candidate.id,
      score: cosineSimilarity(queryVector, candidate.vector)
    });
  }
  scored.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return scored.slice(0, limit);
}
