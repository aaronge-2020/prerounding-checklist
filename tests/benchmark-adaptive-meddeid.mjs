// Benchmark: learned pipeline vs Track D baseline on MedDeID test-100.
//
// Protocol:
//   1. Track-D baseline: JS hybrid pipeline with learnedMeddeid:false on
//      frozen test-100 (the deployed baseline).
//   2. Learned: hybrid pipeline with learned-from-dev rules on test-100.
//      Pass: F1_learned > F1_trackd AND F1_learned > 0.87.
//   3. Track-D-free: learnedOnlyEntitiesFromModelEntities on test-100
//      (compliance path, no handwritten Track D stages).
//   4. Adaptive: learned + frozen adaptive store (20 dev corrections).
//      Reports delta; adaptive is a session-local personalization layer,
//      not required to beat the learned pipeline on this benchmark.
//   No test labels are used for learning (dev-200 only).
//
// Run: node tests/benchmark-adaptive-meddeid.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  modelPredictionsToEntities,
  hybridEntitiesFromModelEntities,
  learnedOnlyEntitiesFromModelEntities
} from "../src/vault/deid.js";
import {
  createAdaptiveStore,
  deserializeAdaptiveStore,
  serializeAdaptiveStore,
  learnFromCorrection
} from "../src/vault/deid/adaptive.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH = join(HERE, "..", "..", "..", "deid-benchmark");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const notes = new Map();
const noteLines = readFileSync(join(BENCH, "meddeid", "notes.jsonl"), "utf8").split("\n");
for (const line of noteLines) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  const record = JSON.parse(trimmed);
  notes.set(record.id || record.note_id, record.text);
}

const baseTest = new Map(readJson(join(BENCH, "meddeid", "out", "stanford_base_test100.json")).map((r) => [r.id, r.entities]));
const baseDev = new Map(readJson(join(BENCH, "meddeid", "out", "stanford_base_dev200.json")).map((r) => [r.id, r.entities]));
const goldTest = readJson(join(BENCH, "meddeid", "out", "gold-test100.json"));
const goldDev = readJson(join(BENCH, "forge", "data", "gold_dev200.json"));

function toPredictions(cached) {
  return (cached || []).map((entity) => ({
    start: entity.begin,
    end: entity.end,
    word: entity.text,
    entity: entity.type,
    score: 1
  }));
}

function predictEntities(text, cached, adaptiveStore) {
  const modelEntities = modelPredictionsToEntities(text, toPredictions(cached));
  return hybridEntitiesFromModelEntities(text, modelEntities, { adaptiveStore: adaptiveStore || null });
}

function predictTrackDBaseline(text, cached) {
  // Deployed Track D baseline: learned rules DISABLED.
  const modelEntities = modelPredictionsToEntities(text, toPredictions(cached));
  return hybridEntitiesFromModelEntities(text, modelEntities, { learnedMeddeid: false, adaptiveStore: null });
}

function predictLearnedOnly(text, cached, adaptiveStore) {
  // Track-D-free compliance path: pass raw cached predictions directly,
  // bypassing modelPredictionsToEntities (which applies handwritten trimming).
  const raw = (cached || []).map((entity) => ({
    start: entity.begin,
    end: entity.end,
    label: entity.type,
    score: 1
  }));
  return learnedOnlyEntitiesFromModelEntities(text, raw, { adaptiveStore: adaptiveStore || null });
}

// Exact-span scoring with identity label mapping (meddeid-15 "local").
function scoreNotes(goldNotes, predById) {
  let tp = 0, fp = 0, fn = 0;
  const perLabel = new Map();
  const bump = (label, key) => {
    if (!perLabel.has(label)) perLabel.set(label, { tp: 0, fp: 0, fn: 0 });
    perLabel.get(label)[key] += 1;
  };
  for (const note of goldNotes) {
    const gold = note.spans || [];
    const preds = (predById.get(note.id) || []).map((e) => ({ start: e.start, end: e.end, label: e.label }));
    const matchedGold = new Set();
    for (const pred of preds) {
      const idx = gold.findIndex((g, i) =>
        !matchedGold.has(i) && g.begin === pred.start && g.end === pred.end && g.type === pred.label);
      if (idx >= 0) {
        matchedGold.add(idx);
        tp += 1;
        bump(pred.label, "tp");
      } else {
        fp += 1;
        bump(pred.label, "fp");
      }
    }
    gold.forEach((g, i) => {
      if (!matchedGold.has(i)) {
        fn += 1;
        bump(g.type, "fn");
      }
    });
  }
  const f1 = (tp, fp, fn) => (tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn));
  return { tp, fp, fn, f1: f1(tp, fp, fn), perLabel };
}

// Sanity: cached offsets must match the note text (check first 3 notes).
{
  let checked = 0, total = 0;
  for (const sample of goldTest.slice(0, 3)) {
    const text = notes.get(sample.id);
    const cached = baseTest.get(sample.id) || [];
    for (const entity of cached.slice(0, 10)) {
      total += 1;
      if (text.slice(entity.begin, entity.end) === entity.text) checked += 1;
    }
  }
  console.log(`offset sanity: ${checked}/${total} cached spans match note text verbatim`);
  if (total === 0 || checked !== total) {
    console.error("Cached prediction offsets do not align with note text; aborting.");
    process.exit(2);
  }
}

console.log("Running Track D baseline (learned OFF) on test-100...");
const trackdPreds = new Map();
for (const note of goldTest) {
  const text = notes.get(note.id);
  trackdPreds.set(note.id, predictTrackDBaseline(text, baseTest.get(note.id)));
}
const trackd = scoreNotes(goldTest, trackdPreds);
console.log(`TRACK-D BASELINE test-100: F1=${trackd.f1.toFixed(4)} (TP=${trackd.tp} FP=${trackd.fp} FN=${trackd.fn})`);

console.log("Running learned pipeline (hybrid + learned) on test-100...");
const baselinePreds = new Map();
for (const note of goldTest) {
  const text = notes.get(note.id);
  baselinePreds.set(note.id, predictEntities(text, baseTest.get(note.id), null));
}
const baseline = scoreNotes(goldTest, baselinePreds);
console.log(`LEARNED test-100: F1=${baseline.f1.toFixed(4)} P=${(baseline.tp / Math.max(1, baseline.tp + baseline.fp)).toFixed(4)} R=${(baseline.tp / Math.max(1, baseline.tp + baseline.fn)).toFixed(4)} (TP=${baseline.tp} FP=${baseline.fp} FN=${baseline.fn})`);
console.log(`Learned lift over Track D: +${(baseline.f1 - trackd.f1).toFixed(4)}`);

console.log("Running Track-D-free compliance path (learned-only) on test-100...");
const cleanPreds = new Map();
for (const note of goldTest) {
  const text = notes.get(note.id);
  cleanPreds.set(note.id, predictLearnedOnly(text, baseTest.get(note.id), null));
}
const clean = scoreNotes(goldTest, cleanPreds);
console.log(`LEARNED-ONLY (Track-D-free) test-100: F1=${clean.f1.toFixed(4)} (TP=${clean.tp} FP=${clean.fp} FN=${clean.fn})`);

// Learning phase on dev-200: synthesize corrections, keep the first 20.
console.log("Synthesizing corrections from dev-200...");
const store = createAdaptiveStore();
let correctionsMade = 0;
const CORRECTION_BUDGET = 20;
function pushCorrection(correction) {
  if (correctionsMade >= CORRECTION_BUDGET) return;
  learnFromCorrection(store, correction);
  correctionsMade += 1;
}
for (const note of goldDev) {
  if (correctionsMade >= CORRECTION_BUDGET) break;
  const text = notes.get(note.id);
  if (!text) continue;
  const preds = predictEntities(text, baseDev.get(note.id), null);
  const gold = note.spans || [];
  const matchedGold = new Set();
  const corrections = [];
  for (const pred of preds) {
    const spanText = text.slice(pred.start, pred.end);
    const ctx = {
      textBefore: text.slice(Math.max(0, pred.start - 80), pred.start),
      textAfter: text.slice(pred.end, pred.end + 40),
      source: "benchmark-sim"
    };
    const exact = gold.findIndex((g, i) => !matchedGold.has(i) && g.begin === pred.start && g.end === pred.end);
    if (exact >= 0 && gold[exact].type === pred.label) {
      matchedGold.add(exact);
      corrections.push({ decision: "accepted", original: spanText, label: pred.label, ...ctx });
      continue;
    }
    const overlapped = gold.findIndex((g, i) => !matchedGold.has(i) && g.begin < pred.end && pred.start < g.end);
    if (overlapped >= 0) {
      matchedGold.add(overlapped);
      const g = gold[overlapped];
      corrections.push({ decision: "rejected", original: spanText, label: pred.label, ...ctx });
      corrections.push({
        decision: "added",
        original: text.slice(g.begin, g.end),
        label: g.type,
        textBefore: text.slice(Math.max(0, g.begin - 80), g.begin),
        textAfter: text.slice(g.end, g.end + 40),
        source: "benchmark-sim"
      });
      continue;
    }
    corrections.push({ decision: "rejected", original: spanText, label: pred.label, ...ctx });
  }
  gold.forEach((g, i) => {
    if (matchedGold.has(i)) return;
    corrections.push({
      decision: "added",
      original: text.slice(g.begin, g.end),
      label: g.type,
      textBefore: text.slice(Math.max(0, g.begin - 80), g.begin),
      textAfter: text.slice(g.end, g.end + 40),
      source: "benchmark-sim"
    });
  });
  corrections.sort((a, b) => 0); // keep span order
  for (const correction of corrections) pushCorrection(correction);
}
// Freeze the store (serialize round-trip simulates vault persistence).
const frozen = deserializeAdaptiveStore(JSON.parse(JSON.stringify(serializeAdaptiveStore(store))));
console.log(`Learned from ${correctionsMade} corrections: ${Object.keys(frozen.gazetteer).length} gazetteer entries, ${frozen.patterns.length} patterns, ${frozen.suppressions.length} suppressions`);

console.log("Running adaptive evaluation on test-100...");
const adaptivePreds = new Map();
for (const note of goldTest) {
  const text = notes.get(note.id);
  adaptivePreds.set(note.id, predictEntities(text, baseTest.get(note.id), frozen));
}
const adaptive = scoreNotes(goldTest, adaptivePreds);
console.log(`ADAPTIVE test-100: F1=${adaptive.f1.toFixed(4)} P=${(adaptive.tp / Math.max(1, adaptive.tp + adaptive.fp)).toFixed(4)} R=${(adaptive.tp / Math.max(1, adaptive.tp + adaptive.fn)).toFixed(4)} (TP=${adaptive.tp} FP=${adaptive.fp} FN=${adaptive.fn})`);
console.log(`Delta F1: ${(adaptive.f1 - baseline.f1 >= 0 ? "+" : "")}${(adaptive.f1 - baseline.f1).toFixed(4)}`);

console.log("\nPer-label F1 (baseline -> adaptive):");
const labels = [...new Set([...baseline.perLabel.keys(), ...adaptive.perLabel.keys()])].sort();
for (const label of labels) {
  const b = baseline.perLabel.get(label) || { tp: 0, fp: 0, fn: 0 };
  const a = adaptive.perLabel.get(label) || { tp: 0, fp: 0, fn: 0 };
  const f = (s) => (s.tp === 0 ? 0 : (2 * s.tp) / (2 * s.tp + s.fp + s.fn));
  console.log(`  ${label}: ${f(b).toFixed(3)} -> ${f(a).toFixed(3)} (tp ${b.tp}->${a.tp}, fp ${b.fp}->${a.fp}, fn ${b.fn}->${a.fn})`);
}

const beatsTrackD = baseline.f1 > trackd.f1;
const beatsBar = baseline.f1 > 0.87;
const cleanBeatsBar = clean.f1 > 0.87;
const adaptiveBeatsLearned = adaptive.f1 > baseline.f1;
console.log(`\nLearned beats Track D baseline (${trackd.f1.toFixed(4)}): ${beatsTrackD ? "YES" : "NO"}`);
console.log(`Learned beats 0.87 bar: ${beatsBar ? "YES" : "NO"}`);
console.log(`Track-D-free path beats 0.87 bar: ${cleanBeatsBar ? "YES" : "NO"}`);
console.log(`Adaptive beats learned: ${adaptiveBeatsLearned ? "YES" : "NO"}`);
process.exit(beatsTrackD && beatsBar ? 0 : 1);
