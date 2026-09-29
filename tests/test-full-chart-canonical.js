// The full chart is assembled from the canonical chart sources: the
// section-splitter's VERIFIED sections, saved to the vault, assembled in
// canonical order by patient-context.js. This pins that chain end to end —
// if the builder ever sourced text from anywhere else (raw note blobs,
// unparsed drafts), the byte-exact check below fails.
//
// All fixtures are synthetic and PHI-free.
import assert from "node:assert/strict";

import { verifySectionSplit } from "../src/local-llm/section-split.js";
import {
  listPatientContextPieces,
  pieceText,
  buildFullChartContextText
} from "../src/local-llm/patient-context.js";
import {
  splitFullChartContext,
  verifyFullChartEquivalence
} from "../src/ui/ai-chat/delta-review.js";

console.log("canonical: verified section-split output feeds the full chart");
{
  // A synthetic H&P note, split the way the local splitter would, then
  // verified by the extractiveness contract: the model may move sentences
  // between sections but never rewrite or invent them.
  const sourceNote = [
    "History of present illness: chest discomfort for one day.",
    "Past medical history: hypertension.",
    "Plan: admit for observation."
  ].join(" ");
  const parsed = {
    sections: {
      history_of_present_illness: "History of present illness: chest discomfort for one day.",
      past_medical_history: "Past medical history: hypertension.",
      plan: "Plan: admit for observation."
    },
    unparsed: ""
  };
  const verification = verifySectionSplit(parsed, sourceNote, "hp");
  assert.ok(verification.ok, `section split verifies: ${(verification.errors || []).join("; ")}`);

  // The app saves verified sections as the admission packet's chart
  // sources. The full-chart builder must carry them verbatim, in the
  // canonical piece order, with nothing added and nothing rewritten.
  const patient = {
    id: "patient-1",
    displayLabel: "Test Patient",
    metadata: { admissionDate: "01/02/2026" },
    contextSections: [
      {
        id: "s-hpi",
        label: "History of Present Illness",
        sourceKind: "h_and_p",
        deidentifiedText: parsed.sections.history_of_present_illness
      },
      {
        id: "s-pmh",
        label: "Past Medical History",
        sourceKind: "h_and_p",
        deidentifiedText: parsed.sections.past_medical_history
      },
      {
        id: "s-plan",
        label: "Plan",
        sourceKind: "h_and_p",
        deidentifiedText: parsed.sections.plan
      }
    ],
    days: []
  };

  const pieces = listPatientContextPieces(patient, {});
  assert.deepEqual(
    pieces.map((p) => p.id),
    ["admission:s-hpi", "admission:s-pmh", "admission:s-plan"],
    "canonical admission order"
  );

  const fullText = buildFullChartContextText(patient, {});
  for (const body of Object.values(parsed.sections)) {
    assert.ok(fullText.includes(body), `verified section carried verbatim: ${body.slice(0, 40)}…`);
  }
  // Order: HPI before PMH before Plan.
  const idx = (s) => fullText.indexOf(s);
  assert.ok(
    idx(parsed.sections.history_of_present_illness) < idx(parsed.sections.past_medical_history) &&
    idx(parsed.sections.past_medical_history) < idx(parsed.sections.plan),
    "canonical order preserved in the assembled text"
  );

  // The review split mirrors the same assembly byte-exactly.
  const split = splitFullChartContext(patient, {});
  assert.ok(verifyFullChartEquivalence(patient, split, {}), "split verifies against the builder");

  // A fabricated sentence — the exact thing verifySectionSplit forbids —
  // can never enter through the split path either.
  const tampered = {
    ...split,
    pieces: split.pieces.map((p, i) => (i === 0 ? { ...p, rawText: `${p.rawText} Fabricated sentence.` } : p))
  };
  assert.ok(!verifyFullChartEquivalence(patient, tampered, {}), "fabricated text fails the equivalence check");
  console.log("ok - verified sections flow verbatim into the full chart");
}

console.log("\nAll full-chart canonical tests passed.");
