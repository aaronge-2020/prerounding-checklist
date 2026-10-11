import assert from "node:assert/strict";
import {
  createAdaptiveStore,
  deserializeAdaptiveStore,
  serializeAdaptiveStore,
  learnFromCorrection,
  applyAdaptiveEntities,
  mergeAdaptiveStores,
  inferManualLabel,
  auditPatterns
} from "../src/vault/deid/adaptive.js";

function accept(store, original, label, textBefore = "", textAfter = "") {
  return learnFromCorrection(store, {
    decision: "accepted",
    original,
    label,
    textBefore,
    textAfter,
    source: "test"
  });
}

// 1. Gazetteer learns an accepted name and fires on new text.
{
  const store = createAdaptiveStore();
  accept(store, "Smith", "PROVIDER NAME", "referred by Dr. ");
  assert.equal(store.gazetteer["smith"].label, "PROVIDER NAME");
  const entities = applyAdaptiveEntities("Dr. Smith will see the patient. Smith is available.", [], store);
  const hits = entities.filter((entity) => entity.label === "PROVIDER NAME");
  assert.equal(hits.length, 2, `expected 2 gazetteer hits, got ${hits.length}`);
  assert.deepEqual([hits[0].start, hits[0].end], [4, 9]);
}

// 2. Title-prefix pattern extracted from one correction fires on unseen names.
{
  const store = createAdaptiveStore();
  accept(store, "Smith", "PROVIDER NAME", "referred by Dr. ");
  assert.equal(store.patterns.length, 1);
  assert.equal(store.patterns[0].kind, "title-prefix");
  const text = "Please see Dr. Jones for follow-up.";
  const entities = applyAdaptiveEntities(text, [], store);
  const patternHits = entities.filter((entity) => entity.source === "adaptive-pattern");
  assert.equal(patternHits.length, 1);
  assert.equal(text.slice(patternHits[0].start, patternHits[0].end), "Jones");
  assert.equal(patternHits[0].label, "PROVIDER NAME");
}

// 3. Greeting pattern.
{
  const store = createAdaptiveStore();
  accept(store, "Maria Garcia", "PATIENT NAME", "Dear ");
  assert.ok(store.patterns.some((pattern) => pattern.kind === "greeting"));
  const text = "Dear James Lee,\nYour results are ready.";
  const entities = applyAdaptiveEntities(text, [], store);
  const hit = entities.find((entity) => entity.source === "adaptive-pattern");
  assert.ok(hit, "greeting pattern should fire");
  assert.equal(text.slice(hit.start, hit.end), "James Lee");
}

// 4. Role-by pattern.
{
  const store = createAdaptiveStore();
  accept(store, "Patel", "PROVIDER NAME", "Electronically signed by ");
  assert.ok(store.patterns.some((pattern) => pattern.kind === "role-by"));
  const text = "Dictated by Rivera on 2024-01-01.";
  const entities = applyAdaptiveEntities(text, [], store);
  const hit = entities.find((entity) => entity.source === "adaptive-pattern");
  assert.ok(hit, "role-by pattern should fire");
  assert.equal(text.slice(hit.start, hit.end), "Rivera");
}

// 5. Rejection suppresses the span and never proposes it again.
{
  const store = createAdaptiveStore();
  learnFromCorrection(store, {
    decision: "rejected",
    original: "Chest CT",
    label: "PROVIDER NAME",
    source: "test"
  });
  const base = [{ start: 8, end: 16, label: "PROVIDER NAME", source: "model" }];
  const entities = applyAdaptiveEntities("Ordered Chest CT today.", base, store);
  assert.equal(entities.length, 0, "rejected span must be suppressed");
}

// 6. Suppression is label-specific: rejecting a NAME does not kill a DATE.
{
  const store = createAdaptiveStore();
  learnFromCorrection(store, { decision: "rejected", original: "May", label: "PATIENT NAME", source: "test" });
  const base = [{ start: 0, end: 3, label: "DATE", source: "rule" }];
  const entities = applyAdaptiveEntities("May 2024", base, store);
  assert.equal(entities.length, 1);
}

// 7. Within-note projection covers repeated mentions.
{
  const store = createAdaptiveStore();
  accept(store, "Alvarez", "PATIENT NAME", "Patient: ");
  const text = "Patient: Alvarez. Alvarez denies pain. See Alvarez in 2 weeks.";
  const entities = applyAdaptiveEntities(text, [], store);
  assert.equal(entities.length, 3, `expected 3 projected mentions, got ${entities.length}`);
}

// 8. Single common words never enter the gazetteer.
{
  const store = createAdaptiveStore();
  accept(store, "May", "PATIENT NAME", "");
  assert.ok(!store.gazetteer["may"], "common word must not be gazetteered");
}

// 9. A twice-rejected gazetteer entry stops firing.
{
  const store = createAdaptiveStore();
  accept(store, "Jordan", "PROVIDER NAME", "Dr. ");
  learnFromCorrection(store, { decision: "rejected", original: "Jordan", label: "PROVIDER NAME", source: "test" });
  learnFromCorrection(store, { decision: "rejected", original: "Jordan", label: "PROVIDER NAME", source: "test" });
  const entities = applyAdaptiveEntities("Jordan is here.", [], store);
  assert.equal(entities.length, 0, "demoted entry must not fire");
}

// 10. Serialization round-trips through the vault shape.
{
  const store = createAdaptiveStore();
  accept(store, "Smith", "PROVIDER NAME", "Dr. ");
  learnFromCorrection(store, { decision: "rejected", original: "Chest CT", label: "PROVIDER NAME", source: "test" });
  const blob = serializeAdaptiveStore(store);
  const restored = deserializeAdaptiveStore(JSON.parse(JSON.stringify(blob)));
  assert.ok(restored);
  assert.equal(restored.gazetteer["smith"].label, "PROVIDER NAME");
  assert.equal(restored.patterns.length, 1);
  assert.equal(restored.suppressions.length, 1);
  assert.equal(restored.stats.accepted, 1);
  assert.equal(restored.stats.rejected, 1);
}

// 11. Corrupt blobs degrade gracefully, never throw.
{
  assert.equal(deserializeAdaptiveStore(null), null);
  assert.equal(deserializeAdaptiveStore("nope"), null);
  const degraded = deserializeAdaptiveStore({ gazetteer: 42 });
  assert.ok(degraded && Object.keys(degraded.gazetteer).length === 0, "malformed gazetteer degrades to empty");
  const bad = deserializeAdaptiveStore({ patterns: [{ source: "(unclosed", label: "NAME" }] });
  assert.ok(bad && bad.patterns.length === 0, "bad regex must be dropped");
}

// 12. Merge unions two stores.
{
  const a = createAdaptiveStore();
  accept(a, "Smith", "PROVIDER NAME", "Dr. ");
  const b = createAdaptiveStore();
  accept(b, "Jones", "PATIENT NAME", "Dear ");
  const merged = mergeAdaptiveStores(a, b);
  assert.ok(merged.gazetteer["smith"] && merged.gazetteer["jones"]);
  assert.equal(merged.patterns.length, 2);
  assert.equal(merged.stats.accepted, 2);
}

// 13. Manual label inference.
{
  assert.equal(inferManualLabel("617-555-0142"), "PHONE");
  assert.equal(inferManualLabel("nurse@example.com"), "EMAIL");
  assert.equal(inferManualLabel("https://example.com/x"), "URL");
  assert.equal(inferManualLabel("Maria Garcia"), "NAME");
  assert.equal(inferManualLabel("St. Mary Hospital"), "FACILITY");
  assert.equal(inferManualLabel("123-45-6789"), "ID");
  assert.equal(inferManualLabel("!!!"), null);
}

// 14. A pattern that keeps missing auto-disables.
{
  const store = createAdaptiveStore();
  accept(store, "Smith", "PROVIDER NAME", "Dr. ");
  const pattern = store.patterns[0];
  pattern.hits = 1;
  pattern.misses = 5;
  auditPatterns(store);
  assert.equal(pattern.enabled, false);
}

// 15. No pattern is learned when the span is not name-shaped.
{
  const store = createAdaptiveStore();
  accept(store, "2024-01-01", "DATE", "seen on ");
  assert.equal(store.patterns.length, 0, "dates must not create name patterns");
}

// 16. Overlapping additions dedupe to the longest span.
{
  const store = createAdaptiveStore();
  accept(store, "Mary Hospital", "FACILITY", "at ");
  const text = "at St. Mary Hospital today";
  const entities = applyAdaptiveEntities(text, [], store);
  const facilityHits = entities.filter((entity) => entity.label === "FACILITY");
  assert.ok(facilityHits.length >= 1);
  const longest = facilityHits.reduce((best, entity) =>
    (entity.end - entity.start) > (best.end - best.start) ? entity : best, facilityHits[0]);
  assert.equal(text.slice(longest.start, longest.end), "Mary Hospital");
}

console.log("test-deid-adaptive: all assertions passed");
