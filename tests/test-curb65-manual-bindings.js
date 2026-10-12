import assert from "node:assert/strict";
import { resolveScoreBindings } from "../src/clinical-scores/patient-bindings.js";
// Demographics must never prefill a lab criterion or confusion. Unsupported
// pulls stay manual until unit-aware lab bindings are independently validated.
for (const text of ["74 year old man", "28 year old woman"]) {
  const bindings = resolveScoreBindings({ contextSections: [
    { sourceKind: "history_present_illness", deidentifiedText: text },
    { sourceKind: "laboratory_results", deidentifiedText: "BUN: 24 mg/dL" }
  ], days: [] }, "");
  assert.equal(bindings.curb65, undefined);
}
console.log("CURB65: no unrelated demographic or lab autofill.");
