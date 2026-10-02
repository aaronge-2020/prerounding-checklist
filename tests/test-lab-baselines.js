import assert from "node:assert/strict";
import {
  baselineDisplayText,
  clearLabBaseline,
  getLabBaseline,
  normalizeLabBaselines,
  setLabBaseline
} from "../src/patient-context/lab-baselines.js";
import { labNoteItem } from "../src/review-data/compact-summary.js";
import { buildClinicalReviewIndex } from "../src/review-data/index.js";

// Pure model: baselines are keyed canonically, so name variants share one entry.
{
  let baselines = {};
  baselines = setLabBaseline(baselines, "Creatinine", { value: "0.9", unit: "mg/dL", dateLabel: "Sep 2024" });
  assert.equal(getLabBaseline(baselines, "creatinine")?.value, "0.9");
  assert.equal(getLabBaseline(baselines, "CREATININE")?.value, "0.9");
  assert.equal(baselineDisplayText(getLabBaseline(baselines, "Creatinine")), "0.9 mg/dL · Sep 2024");

  // Alias keys collapse: "Hgb" and "Hemoglobin" share the hemoglobin entry.
  baselines = setLabBaseline(baselines, "Hgb", { value: "13.5", unit: "g/dL" });
  assert.equal(getLabBaseline(baselines, "Hemoglobin")?.value, "13.5");
  assert.equal(baselineDisplayText(getLabBaseline(baselines, "Hemoglobin")), "13.5 g/dL");

  // Overwriting keeps one entry per analyte.
  baselines = setLabBaseline(baselines, "creatinine", { value: "1.0", unit: "mg/dL", dateLabel: "Oct 2024" });
  assert.equal(Object.keys(baselines).filter((key) => key === "creatinine").length, 1);
  assert.equal(getLabBaseline(baselines, "Creatinine")?.value, "1.0");

  // Empty value is a no-op; clearing removes the entry.
  const before = baselines;
  baselines = setLabBaseline(baselines, "Creatinine", { value: "   " });
  assert.equal(getLabBaseline(baselines, "Creatinine")?.value, "1.0");
  baselines = clearLabBaseline(baselines, "CREATININE");
  assert.equal(getLabBaseline(baselines, "Creatinine"), null);
  assert.ok(!("creatinine" in baselines));
  assert.deepEqual(normalizeLabBaselines(null), {});
  assert.deepEqual(normalizeLabBaselines("nope"), {});
  assert.equal(baselineDisplayText(null), "");
  assert.equal(baselineDisplayText({ value: " ", unit: "mg/dL" }), "");
  assert.ok(before !== baselines, "updates are immutable");
}

// Note lines show the baseline next to the current value and trend.
{
  const without = labNoteItem({ name: "Creatinine", value: "1.6", unit: "mg/dL", flag: "H", trend: [{ value: "1.2" }, { value: "1.6" }] });
  assert.equal(without.detail, "1.6 mg/dL [H] (1.2 → 1.6)");
  const withBaseline = labNoteItem({
    name: "Creatinine",
    value: "1.6",
    unit: "mg/dL",
    flag: "H",
    trend: [{ value: "1.2" }, { value: "1.6" }],
    baseline: { value: "0.9", unit: "mg/dL", dateLabel: "Sep 2024" }
  });
  assert.equal(withBaseline.detail, "1.6 mg/dL [H] (1.2 → 1.6; baseline 0.9 mg/dL · Sep 2024)");
  const baselineOnly = labNoteItem({
    name: "A1c",
    value: "8.1",
    unit: "%",
    baseline: { value: "7.2", unit: "%", dateLabel: "Jun 2024" }
  });
  assert.equal(baselineOnly.detail, "8.1 % (baseline 7.2 % · Jun 2024)");
}

// The review index attaches patient baselines to lab rows and note details.
{
  const patient = {
    id: "patient_baseline",
    displayLabel: "Baseline test",
    labBaselines: { creatinine: { value: "0.9", unit: "mg/dL", dateLabel: "Sep 2024" } },
    contextSections: [],
    days: [
      {
        id: "day_one",
        date: "2026-09-24",
        label: "HD1",
        sourceCaptures: [
          {
            id: "labs_one",
            sourceKind: "laboratory_results",
            label: "Morning labs",
            deidentifiedText: `Labs
@ 09/24/26 0600
Creatinine: 1.6 mg/dL; ref 0.6-1.2 (H)
WBC: 8.8 K/uL; ref 4.0-11.0`
          }
        ]
      }
    ]
  };
  const index = buildClinicalReviewIndex(patient);
  const creatinine = index.labs.flatMap((panel) => panel.results).find((result) => result.name === "Creatinine");
  const wbc = index.labs.flatMap((panel) => panel.results).find((result) => result.name === "WBC");
  assert.ok(creatinine, "creatinine row exists");
  assert.equal(creatinine.baseline?.value, "0.9");
  assert.match(creatinine.selectionCandidate.noteDetail, /baseline 0\.9 mg\/dL · Sep 2024/);
  assert.match(creatinine.selectionCandidate.insertionText, /\(baseline 0\.9 mg\/dL · Sep 2024\)/);
  assert.equal(wbc.baseline, undefined);
  assert.doesNotMatch(wbc.selectionCandidate.noteDetail, /baseline/);

  // Case-insensitive analyte matching: "CREATININE" in the source still matches.
  const upper = buildClinicalReviewIndex({
    ...patient,
    labBaselines: setLabBaseline({}, "CREATININE", { value: "0.9", unit: "mg/dL" })
  });
  const upperRow = upper.labs.flatMap((panel) => panel.results).find((result) => result.name === "Creatinine");
  assert.equal(upperRow.baseline?.value, "0.9");
}

console.log("lab baseline tests passed");
