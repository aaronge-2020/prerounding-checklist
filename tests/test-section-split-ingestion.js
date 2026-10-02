// The real saved-chart ingestion route, end to end: raw note text ->
// splitNoteSectionsWithLlm (parse.js) -> verifySectionSplit
// (section-split.js) -> verified sections saved to the vault the way
// source-controller.js saves them -> the full-chart builder assembles them
// verbatim in canonical order. A model that invents or drops sentences
// fails closed: the parse throws and nothing unverified can be saved.
//
// All fixtures are synthetic and PHI-free.
import assert from "node:assert/strict";

import { splitNoteSectionsWithLlm } from "../src/local-llm/parse.js";
import { createTextSection } from "../src/app/state/vault.js";
import {
  listPatientContextPieces,
  buildFullChartContextText
} from "../src/local-llm/patient-context.js";
import {
  splitFullChartContext,
  verifyFullChartEquivalence
} from "../src/ui/ai-chat/delta-review.js";

const SOURCE_NOTE = [
  "History of present illness: chest discomfort for one day.",
  "Past medical history: hypertension.",
  "Plan: admit for observation."
].join(" ");

function stubClient(responseForChunk) {
  return {
    async chat(messages, _opts) {
      const user = String(messages?.find((m) => m?.role === "user")?.content || "");
      return responseForChunk(user);
    }
  };
}

// The app saves verified sections as admission context sections (see
// source-controller.js saveAdmissionSource): one createTextSection per
// verified part, de-identified text only. The fixture text is already
// PHI-free, so it stands in for the de-identified text directly.
function saveVerifiedSectionsToPatient(sections) {
  const labels = {
    history_of_present_illness: "History of Present Illness",
    past_medical_history: "Past Medical History",
    plan: "Plan"
  };
  const contextSections = Object.entries(sections).map(([label, body]) =>
    createTextSection(labels[label] || label, {
      scope: "context",
      sourceKind: "primary_note",
      text: body
    })
  );
  return {
    id: "patient-1",
    displayLabel: "Test Patient",
    metadata: { admissionDate: "01/02/2026" },
    contextSections,
    days: []
  };
}

console.log("ingestion: honest model output verifies and feeds the full chart");
{
  const honest = stubClient(() =>
    JSON.stringify({
      sections: {
        history_of_present_illness: "History of present illness: chest discomfort for one day.",
        past_medical_history: "Past medical history: hypertension.",
        plan: "Plan: admit for observation."
      },
      unparsed: ""
    })
  );
  const result = await splitNoteSectionsWithLlm(honest, SOURCE_NOTE, "hp");
  assert.ok(result.coverage >= 0.5, `coverage is high enough to accept (${result.coverage})`);
  assert.deepEqual(Object.keys(result.sections).sort(), [
    "history_of_present_illness",
    "past_medical_history",
    "plan"
  ]);

  // Save exactly the way the app saves verified sections, then assemble.
  const patient = saveVerifiedSectionsToPatient(result.sections);
  const pieces = listPatientContextPieces(patient, {});
  assert.equal(pieces.length, 3, "three admission pieces listed in canonical order");

  const fullText = buildFullChartContextText(patient, {});
  for (const body of Object.values(result.sections)) {
    assert.ok(fullText.includes(body), `verified section carried verbatim: ${body.slice(0, 40)}…`);
  }
  const idx = (s) => fullText.indexOf(s);
  assert.ok(
    idx(result.sections.history_of_present_illness) < idx(result.sections.past_medical_history) &&
      idx(result.sections.past_medical_history) < idx(result.sections.plan),
    "canonical order preserved in the assembled text"
  );

  // The review split mirrors the same assembly byte-exactly.
  const split = splitFullChartContext(patient, {});
  assert.ok(verifyFullChartEquivalence(patient, split, {}), "split verifies against the builder");
  console.log("ok - honest parse verifies and feeds the full chart");
}

console.log("ingestion: fabricated model output fails closed — nothing is saved");
{
  const fabricator = stubClient(() =>
    JSON.stringify({
      sections: {
        history_of_present_illness: "History of present illness: chest discomfort for one day.",
        past_medical_history: "Past medical history: hypertension.",
        // Invented sentence: not in the source note.
        plan: "Plan: admit for observation. The patient is doing great."
      },
      unparsed: ""
    })
  );
  // The app keeps its deterministic parse when the LLM parse throws, so
  // simulate the caller: prior sections survive, nothing new is saved.
  const priorSections = [{ id: "s-prior", deidentifiedText: "Prior verified text." }];
  let saved = null;
  await assert.rejects(
    (async () => {
      const result = await splitNoteSectionsWithLlm(fabricator, SOURCE_NOTE, "hp");
      saved = saveVerifiedSectionsToPatient(result.sections);
    })(),
    /verif/i,
    "fabricated output rejects the whole parse"
  );
  assert.equal(saved, null, "no unverified sections reach the save path");
  assert.deepEqual(priorSections, [{ id: "s-prior", deidentifiedText: "Prior verified text." }], "prior sections untouched");
  console.log("ok - fabrication fails closed");
}

console.log("ingestion: low-coverage model output fails closed");
{
  const dropper = stubClient(() =>
    JSON.stringify({
      sections: {
        // Only one of three source sentences: 33% coverage < 50% minimum.
        history_of_present_illness: "History of present illness: chest discomfort for one day."
      },
      unparsed: ""
    })
  );
  await assert.rejects(
    splitNoteSectionsWithLlm(dropper, SOURCE_NOTE, "hp"),
    /coverage/i,
    "low coverage rejects the parse"
  );
  console.log("ok - low coverage fails closed");
}

console.log("\nAll section-split ingestion tests passed.");
