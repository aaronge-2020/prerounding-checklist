import assert from "node:assert/strict";
import { createReviewController } from "../src/ui/review/controller.js";

// Regression test: saved primary-team-note sections cross a state boundary.
// A fresh parse stores plain strings; the vault stores { deidentifiedText }
// objects. An empty-but-present object (e.g. { deidentifiedText: "" }) is
// truthy, so the old `x?.deidentifiedText || x` fallthrough handed the raw
// object onward and String(object) seeded the draft assessment with the
// literal text "[object Object]".

function buildController(patient, packetId) {
  let capturedModel = null;
  const controller = createReviewController({
    app: {
      noteDraftSessions: new Map(),
      reviewPacketId: packetId,
      reviewCategory: "all",
      reviewSearchQuery: "",
      reviewPage: 0
    },
    active: () => patient,
    byId: () => ({ innerHTML: "" }),
    presentation: {
      renderReview: (data) => {
        capturedModel = data;
        return "";
      }
    },
    patientRequiredMessage: () => "",
    persistVault: async () => {},
    render: () => {},
    setStatus: () => {},
    copyText: async () => {},
    downloadText: () => {}
  });
  controller.render();
  assert.ok(capturedModel, "controller.render should populate review model");
  return capturedModel;
}

{
  // Empty-but-present vault-shaped sections must not seed "[object Object]".
  const patient = {
    id: "pt_empty_sections",
    days: [
      {
        id: "day_one",
        date: "2026-09-21",
        label: "HD1",
        primaryTeamNote: {
          noteType: "progress",
          sections: {
            assessment: { deidentifiedText: "", residualWarnings: [] },
            plan: { deidentifiedText: "", residualWarnings: [] }
          }
        }
      }
    ]
  };
  const model = buildController(patient, "day_one");
  const assessmentText = model.draft.assessment?.deidentifiedText ?? "";
  assert.ok(
    !assessmentText.includes("[object Object]"),
    `empty vault-shaped assessment must not seed "[object Object]", got: ${JSON.stringify(assessmentText)}`
  );
  assert.equal(assessmentText, "", "empty vault-shaped assessment seeds empty draft assessment");
  assert.equal(model.draft.problems.length, 0, "empty vault-shaped plan yields no problems");
}

{
  // Real vault-shaped text still seeds the draft assessment.
  const patient = {
    id: "pt_real_assessment",
    days: [
      {
        id: "day_one",
        date: "2026-09-21",
        label: "HD1",
        primaryTeamNote: {
          noteType: "progress",
          sections: {
            assessment: { deidentifiedText: "Septic shock improving on norepinephrine.", residualWarnings: [] },
            plan: { deidentifiedText: "", residualWarnings: [] }
          }
        }
      }
    ]
  };
  const model = buildController(patient, "day_one");
  assert.equal(
    model.draft.assessment?.deidentifiedText,
    "Septic shock improving on norepinephrine.",
    "vault-shaped assessment text seeds the draft assessment"
  );
}

{
  // Fresh-parse string-shaped sections still seed the draft assessment.
  const patient = {
    id: "pt_string_sections",
    days: [
      {
        id: "day_one",
        date: "2026-09-21",
        label: "HD1",
        primaryTeamNote: {
          noteType: "progress",
          sections: {
            assessment: "DKA resolved, anion gap closed.",
            plan: ""
          }
        }
      }
    ]
  };
  const model = buildController(patient, "day_one");
  assert.equal(
    model.draft.assessment?.deidentifiedText,
    "DKA resolved, anion gap closed.",
    "string-shaped assessment text seeds the draft assessment"
  );
}

console.log("review section text boundary tests passed");
