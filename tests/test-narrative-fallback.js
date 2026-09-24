import assert from "node:assert/strict";
import { buildClinicalReviewIndex } from "../src/review-data/index.js";

function patientWithSections(sections) {
  return {
    contextSections: sections.map(([sourceKind, deidentifiedText], index) => ({
      id: `src-${index}`,
      sourceKind,
      label: sourceKind,
      deidentifiedText,
    })),
  };
}

// 1. Narrative vitals/labs that the parsers cannot structure stay visible as
// opt-in narrative candidates carrying the original text.
{
  const index = buildClinicalReviewIndex(patientWithSections([
    ["vital_signs", "Vitals\nTachycardic into the 110s overnight with intermittent fevers"],
    ["laboratory_results", "Labs\nRepeat BMP pending, phlebotomy missed the morning draw"],
  ]));
  const narratives = index.candidates.filter((candidate) => candidate.kind === "narrative");
  assert.equal(narratives.length, 2, `two narrative candidates, got: ${narratives.map((c) => c.name).join(", ")}`);
  const vitalsNarrative = narratives.find((candidate) => candidate.group === "vitals");
  assert.ok(vitalsNarrative, "narrative vitals candidate exists");
  assert.ok(/tachycardic/i.test(vitalsNarrative.narrativeText), "original narrative text is inspectable");
  assert.ok(!/^vitals$/i.test(vitalsNarrative.narrativeText.split("\n")[0]), "kind header line is dropped from display text");
  assert.equal(vitalsNarrative.insertionText, vitalsNarrative.narrativeText, "insertion text is the narrative");
  // Opt-in, never auto-included: noteGroupKey must not be a default-on key.
  for (const candidate of narratives) {
    assert.ok(!["vitals", "medications"].includes(candidate.noteGroupKey), `${candidate.name} is opt-in (${candidate.noteGroupKey})`);
  }
  // The sections no longer report phantom zeros.
  assert.ok(index.vitals.some((candidate) => candidate.kind === "narrative"), "narrative appears in the vitals group");
  assert.ok(index.labs.some((candidate) => candidate.kind === "narrative"), "narrative appears in the labs group");
}

// 2. Sources that DO parse produce no narrative duplicates.
{
  const index = buildClinicalReviewIndex(patientWithSections([
    ["vital_signs", "Vitals\nTemp 37 °C; HR 112"],
    ["laboratory_results", "Labs\nSodium: 139 mmol/L"],
  ]));
  const narratives = index.candidates.filter((candidate) => candidate.kind === "narrative");
  assert.equal(narratives.length, 0, `no narrative fallback for parsed sources, got: ${narratives.map((c) => c.name).join(", ")}`);
}

// 3. A second source whose rows merge into existing candidates is not
// mistaken for "parsed nothing".
{
  const index = buildClinicalReviewIndex(patientWithSections([
    ["vital_signs", "Vitals\nTemp 37 °C"],
    ["vital_signs", "Vitals\nTemp 38 °C"],
  ]));
  const narratives = index.candidates.filter((candidate) => candidate.kind === "narrative");
  assert.equal(narratives.length, 0, "merged rows do not trigger a narrative fallback");
  const temp = index.vitals.find((candidate) => /temperature/i.test(candidate.name));
  assert.equal(temp.observations.length, 2, "both observations merged into one candidate");
}

// 4. Narrative fingerprint is stable and the id is a stable hash.
{
  const first = buildClinicalReviewIndex(patientWithSections([["vital_signs", "Vitals\nSome unparseable narrative"]]));
  const second = buildClinicalReviewIndex(patientWithSections([["vital_signs", "Vitals\nSome unparseable narrative"]]));
  const a = first.candidates.find((candidate) => candidate.kind === "narrative");
  const b = second.candidates.find((candidate) => candidate.kind === "narrative");
  assert.equal(a.id, b.id, "narrative candidate id is stable across builds");
  assert.equal(a.fingerprint, b.fingerprint, "narrative fingerprint is stable across builds");
}

console.log("narrative fallback candidates: OK");
