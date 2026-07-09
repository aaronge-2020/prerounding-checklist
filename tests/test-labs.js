import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatLabChronologyPromptBlock,
  formatLabTimelinePreview,
  parseLabTimeline
} from "../src/clinical/labs.js";

function fixture(name) {
  return readFileSync(new URL(`./fixtures/labs/${name}`, import.meta.url), "utf8");
}

function latestFor(timeline, label) {
  return timeline.latestByLabel.find((entry) => entry.label === label)?.latest || null;
}

function eventsFor(timeline, label) {
  return timeline.events.filter((event) => event.label === label);
}

const multipleBmps = parseLabTimeline(fixture("multiple-bmps-same-day.txt"));
const latestBmp = latestFor(multipleBmps, "BMP");
assert.equal(latestBmp?.collectionTime.timeLabel, "14:48", "latest same-day BMP should use the 14:48 collection time");
assert.deepEqual(eventsFor(multipleBmps, "BMP").map((event) => event.collectionTime.timeLabel), ["06:12", "14:48"], "BMP panels should sort chronologically by same-day clock time");
const multipleBmpBlock = formatLabChronologyPromptBlock(multipleBmps);
assert.ok(multipleBmpBlock.includes("BMP timeline: 06:12 on Day 0 -> 14:48 on Day 0."), "prompt block should include an exact ordered BMP timeline");
assert.ok(multipleBmpBlock.includes("Most recent BMP by collection time: 14:48 on Day 0."), "prompt block should name the actual latest BMP");
assert.ok(multipleBmpBlock.includes("Earlier same-day BMP: 06:12 on Day 0."), "prompt block should call out the earlier same-day BMP");
assert.ok(!multipleBmpBlock.includes("Most recent BMP by collection time: 06:12"), "prompt block must not reproduce the second-most-recent BMP bug");
assert.ok(multipleBmps.ambiguousRows.some((row) => row.displayName === "A1c"), "untimed A1c should be ambiguous");
assert.ok(formatLabTimelinePreview(multipleBmps).warnings.some((warning) => /A1c/.test(warning.text)), "preview should warn about untimed A1c");

const glucoseQ4h = parseLabTimeline(`Glucose 06/06/2026 04:02 160 mg/dL
Glucose 06/06/2026 08:01 190 mg/dL
Glucose 06/06/2026 12:00 220 mg/dL
Glucose 06/06/2026 16:02 180 mg/dL`);
assert.equal(latestFor(glucoseQ4h, "Glucose")?.collectionTime.timeLabel, "16:02", "q4h glucose should sort by collection clock time");
assert.deepEqual(eventsFor(glucoseQ4h, "Glucose").map((event) => event.collectionTime.timeLabel), ["04:02", "08:01", "12:00", "16:02"], "q4h glucose events should remain chronological");
assert.ok(glucoseQ4h.abnormalFlags.some((flag) => flag.analyte === "Glucose" && flag.direction === "high"), "high glucose values should be flagged against the screening range");

const duplicateNames = parseLabTimeline(`Glucose 06/06/2026 08:00 180 mg/dL
Glucose 06/06/2026 12:00 210 mg/dL
Glucose 06/06/2026 12:00 210 mg/dL`);
assert.equal(duplicateNames.rows.length, 2, "exact duplicate lab rows should be deduped");
assert.deepEqual(eventsFor(duplicateNames, "Glucose").map((event) => event.collectionTime.timeLabel), ["08:00", "12:00"], "same analyte at different times should be preserved");

const resultedAfterCollection = parseLabTimeline(`BMP Collected: 06/06/2026 06:00 Resulted: 06/06/2026 11:00 Na 132, K 3.4, Cl 98, CO2 20, BUN 21, Cr 1.5, Glucose 412
BMP Collected: 06/06/2026 08:00 Resulted: 06/06/2026 09:00 Na 134, K 3.8, Cl 100, CO2 22, BUN 20, Cr 1.4, Glucose 250`);
assert.equal(latestFor(resultedAfterCollection, "BMP")?.collectionTime.timeLabel, "08:00", "collection time should outrank resulted time for recency");
assert.ok(resultedAfterCollection.criticalFlags.some((flag) => flag.analyte === "Glucose" && flag.severity === "critical"), "glucose >= 400 should be flagged as a critical screening value");
assert.ok(formatLabTimelinePreview(resultedAfterCollection).warnings.some((warning) => /critical high/.test(warning.text)), "preview should include critical lab screening warnings");

const midnight = parseLabTimeline(fixture("midnight-rollover.txt"));
assert.deepEqual(eventsFor(midnight, "Glucose").map((event) => `${event.collectionTime.dayLabel} ${event.collectionTime.timeLabel}`), ["Day -1 23:58", "Day 0 00:12", "Day 0 04:00"], "midnight rollover should preserve date boundary chronology");
assert.equal(latestFor(midnight, "Glucose")?.collectionTime.timeLabel, "04:00", "post-midnight latest glucose should be selected");

const reverseChron = parseLabTimeline(fixture("reverse-chronological-epic-table.txt"));
assert.deepEqual(eventsFor(reverseChron, "BMP").map((event) => event.collectionTime.timeLabel), ["06:12", "14:48"], "reverse chronological Epic columns should be sorted by timestamp, not source order");
assert.equal(latestFor(reverseChron, "BMP")?.collectionTime.timeLabel, "14:48", "reverse chronological table latest BMP should be 14:48");

const ambiguous = parseLabTimeline("A1c 7.4%");
const ambiguousBlock = formatLabChronologyPromptBlock(ambiguous);
assert.equal(ambiguous.events.length, 0, "untimed A1c should not produce a most-recent event");
assert.ok(ambiguousBlock.includes("Ambiguous lab timing"), "untimed lab should produce an ambiguous timing warning");
assert.ok(!ambiguousBlock.includes("Most recent A1c"), "untimed A1c must not be called most recent");

console.log("Lab timeline tests passed.");
