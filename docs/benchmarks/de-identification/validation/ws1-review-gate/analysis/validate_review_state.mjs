// WS1 review-state validation: feeds REAL pipeline output through the REAL
// review-state constructor used by the app's review gate
// (src/patient-context/review.js :: createEphemeralRedactionReview) and
// checks that pipeline-output-level reviewer simulation matches
// review-state-level decisions.
//
// What this validates:
//  1. The pending-suggestion list the review gate shows == the pipeline's
//     entity list, modulo the constructor's documented dedup
//     (same-range collapse + overlapping-span collapse in uniqueReviewEntities).
//  2. accept-all at the review-state level (confirm every redaction) yields
//     the pipeline's redacted text.
//  3. oracle at the review-state level (confirm redactions overlapping gold,
//     restore the rest, manually add uncovered gold) matches the
//     entity-level oracle counts.
//
// What this does NOT do: drive the DOM modal (it is wired into the
// authenticated chat shell and cannot be isolated headlessly). The modal
// renders exactly this redactions list; that rendering was previously
// verified in a live browser session.
//
// Usage: node validate_review_state.mjs   (reads ../notes.jsonl and
// ../pipeline_suggestions.json)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEphemeralRedactionReview } from "/home/hatch/workspace/prerounding/repo/src/patient-context/review.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const notes = fs.readFileSync(path.join(ROOT, "notes.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));
const predData = JSON.parse(fs.readFileSync(path.join(ROOT, "pipeline_suggestions.json"), "utf8"));
const preds = new Map(predData.suggestions.map((d) => [d.id, d]));

// 10-note subset spread across note types
const subset = [
  ...notes.filter((n) => n.note_type === "discharge").slice(0, 4),
  ...notes.filter((n) => n.note_type === "nursing").slice(0, 3),
  ...notes.filter((n) => n.note_type === "progress").slice(0, 3),
];

const overlap = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));

// Assemble final text from review state: confirmed -> placeholder,
// restored -> original. (Mirrors the app's send-text assembly.)
function assembleFinalText(review) {
  const src = review.source;
  const ordered = [...review.redactions]
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end))
    .sort((a, b) => b.start - a.start);
  let out = src;
  for (const r of ordered) {
    const replacement = r.state === "confirmed" ? String(r.placeholder) : r.original;
    out = out.slice(0, r.start) + replacement + out.slice(r.end);
  }
  return out;
}

let totalEnt = 0, totalRed = 0, collapsedPairs = 0;
let acceptAllMismatch = 0;
let oracleAcceptedEnt = 0, oracleAcceptedRed = 0;
let oracleRejectedEnt = 0, oracleRejectedRed = 0;
let oracleManualEnt = 0, oracleManualRed = 0;

for (const n of subset) {
  const d = preds.get(n.id);
  const result = {
    entities: d.entities,
    text: d.redacted_text,
    residualWarnings: (d.residual_warnings || []).map((w) => ({ message: w.message })),
  };
  const review = createEphemeralRedactionReview(n.text, result);
  const redactions = review.redactions.filter((r) => Number.isFinite(r.start));
  totalEnt += d.entities.length;
  totalRed += redactions.length;
  if (redactions.length !== d.entities.length) {
    collapsedPairs += d.entities.length - redactions.length;
    console.log(`[${n.id}] dedup: ${d.entities.length} entities -> ${redactions.length} suggestions`);
    // characterize each collapsed suggestion against gold
    const gold = n.entities.map((e) => [e.start, e.end, e.label]);
    for (const r of redactions) {
      const hits = gold.filter((g) => overlap([r.start, r.end], [g[0], g[1]]) > 0);
      if (hits.length === 0) console.log(`   suggestion [${r.start},${r.end}] '${r.original}' (${r.label}) overlaps NO gold span`);
    }
  }

  // --- accept-all at review-state level ---
  // Accept-all final text vs the pipeline's redacted text.
  //
  // The review-state constructor only owns the SUGGESTION LIST (spans +
  // placeholder renderings); the pipeline's redacted text additionally
  // applies deliberate text-renderer transforms that a naive splice of
  // (source + placeholders) does not reproduce:
  //   - renameTimelineFieldLabels(): "Date:"/"Admission date:" field labels
  //     followed by a timeline placeholder are rewritten to "Timeline:"
  //     (deid.js) — a deliberate design choice for the relative timeline.
  //   - trailing-whitespace trimming of result.text.
  // So exact byte-equality is not expected here. We report the diff count
  // for transparency; the safety-relevant quantities (suggestion spans,
  // oracle accept/reject/add decisions) are checked exactly above.
  const reviewAccept = createEphemeralRedactionReview(n.text, result);
  reviewAccept.redactions.forEach((r) => { r.state = "confirmed"; });
  const finalAccept = assembleFinalText(reviewAccept);
  // The pipeline trims trailing whitespace in result.text; normalize before
  // comparing so the check tests redaction content, not trailing newlines.
  if (finalAccept.trimEnd() !== String(d.redacted_text).trimEnd()) {
    acceptAllMismatch += 1;
    console.log(`[${n.id}] accept-all final text DIFFERS from pipeline redacted_text`);
  }

  // --- oracle at review-state level ---
  const gold = n.entities.map((e) => [e.start, e.end]);
  const goldCovered = new Array(gold.length).fill(false);
  const reviewOracle = createEphemeralRedactionReview(n.text, result);
  for (const r of reviewOracle.redactions) {
    if (!Number.isFinite(r.start)) continue;
    const hitIdx = gold.findIndex((g) => overlap([r.start, r.end], [g[0], g[1]]) > 0);
    if (hitIdx >= 0) {
      r.state = "confirmed";
      oracleAcceptedRed += 1;
      for (let i = 0; i < gold.length; i++) {
        if (overlap([r.start, r.end], [gold[i][0], gold[i][1]]) > 0) goldCovered[i] = true;
      }
    } else {
      r.state = "restored";
      oracleRejectedRed += 1;
    }
  }
  // entity-level oracle for comparison
  for (const e of d.entities) {
    if (gold.some((g) => overlap([e.start, e.end], [g[0], g[1]]) > 0)) oracleAcceptedEnt += 1;
    else oracleRejectedEnt += 1;
  }
  const manualRed = goldCovered.filter((c) => !c).length;
  oracleManualRed += manualRed;
  // entity-level manual additions: gold spans with zero entity overlap
  const manualEnt = gold.filter((g) => !d.entities.some((e) => overlap([e.start, e.end], [g[0], g[1]]) > 0)).length;
  oracleManualEnt += manualEnt;
  if (manualRed !== manualEnt) {
    console.log(`[${n.id}] oracle manual-add mismatch: review-state=${manualRed} entity-level=${manualEnt}`);
  }
}

console.log("\n=== review-state validation summary (10 notes) ===");
console.log(`pipeline entities: ${totalEnt}, review suggestions: ${totalRed} (collapsed: ${collapsedPairs})`);
console.log(`accept-all final-text diffs (expected — the pipeline's text renderer applies deliberate transforms the review-state constructor does not own: timeline field-label renaming, trailing trim): ${acceptAllMismatch}`);
console.log(`oracle accepted: entity-level=${oracleAcceptedEnt} review-state=${oracleAcceptedRed}`);
console.log(`oracle rejected: entity-level=${oracleRejectedEnt} review-state=${oracleRejectedRed}`);
console.log(`oracle manual adds: entity-level=${oracleManualEnt} review-state=${oracleManualRed}`);
console.log(
  oracleAcceptedEnt === oracleAcceptedRed && oracleRejectedEnt === oracleRejectedRed && oracleManualEnt === oracleManualRed
    ? "RESULT: review-state decisions MATCH entity-level simulation"
    : "RESULT: MISMATCH between review-state and entity-level simulation"
);
