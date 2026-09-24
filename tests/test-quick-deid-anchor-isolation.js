import assert from "node:assert/strict";
import { createDeidSessionCoordinator } from "../src/ui/deid/session-coordinator.js";

// Quick De-ID pastes arbitrary standalone text. When its admission gate is
// skipped and no session date was entered, the current patient's admission
// date must not leak in as the anchor: dates are evaluated on the text's own
// merits. Regression test for the 2026-09-24 fix where "06/06/2026" pasted
// into Quick De-ID rendered as "3 months and 12 days prior to hospital
// admission" (anchored to the test patient's 2026-09-24 admission) instead
// of "[Historical: 2026 at 04:02]".
{
  const calls = [];
  const state = { admissionDate: "2026-09-24", deidMode: "structured-only", deidOperation: {} };
  const coordinator = createDeidSessionCoordinator({
    state,
    admissionDateAnchor: { restore: () => { throw new Error("gate must be skipped"); }, remember: () => {} },
    admissionDateGate: { requestAdmissionDateFromUser: async () => { throw new Error("gate must be skipped"); } },
    deidentifyText: async (text, options) => { calls.push({ text, options }); return { text }; },
    updateDeidStatus: () => {},
    updateDeidOperation: () => {},
    setStatus: () => {}
  });

  await coordinator.deidentify("POC Glucose 06/06/2026 04:02 160", { admissionDate: "", skipAdmissionGate: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.admissionDate, null, "patient admission date must not anchor standalone Quick De-ID text");
  assert.equal(calls[0].options.relativeDate, null, "relative expressions must not resolve against the patient admission date");

  // An explicit session date is still a valid anchor.
  await coordinator.deidentify("Labs drawn 09/20/2026 were normal.", { admissionDate: "2026-09-18", skipAdmissionGate: true });
  assert.equal(calls[1].options.admissionDate, "2026-09-18", "explicit Quick De-ID session date must anchor");
  assert.equal(calls[1].options.relativeDate, "2026-09-18");

  // Non-Quick De-ID callers still go through the gate and keep the patient anchor.
  const gatedState = { admissionDate: "2026-09-24", deidMode: "structured-only", deidOperation: {} };
  const gatedCalls = [];
  const gated = createDeidSessionCoordinator({
    state: gatedState,
    admissionDateAnchor: { restore: () => {}, remember: () => {} },
    admissionDateGate: { requestAdmissionDateFromUser: async () => { throw new Error("should not be called"); } },
    deidentifyText: async (text, options) => { gatedCalls.push(options); return { text }; },
    updateDeidStatus: () => {},
    updateDeidOperation: () => {},
    setStatus: () => {}
  });
  await gated.deidentify("Admitted on 09/18/2026.");
  assert.equal(gatedCalls[0].admissionDate, "2026-09-24", "gated callers keep the patient admission anchor");
}

console.log("quick de-id anchor isolation: OK");
