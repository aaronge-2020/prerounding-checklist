import assert from "node:assert/strict";
import { createDemoPatient, DEMO_ASSESSMENT, DEMO_CONTEXT_TEXTS, DEMO_DAILY_TEXTS, DEMO_DAY_ID, DEMO_PATIENT_ID, DEMO_PLAN_PROBLEMS, attachDemoObjectiveData } from "../src/ui/demo/session.js";
import { deidentifyTextStructuredOnly } from "../src/vault/deid.js";
import { DEMO_REVIEW_ACTIONS, demoReviewTransition, createDemoController } from "../src/ui/demo/controller.js";
import { DEMO_GUIDE_STAGES, DEMO_INFO_STAGES, DEMO_STAGE_NEXT, DEMO_PARSE_NOTE_TEXT, DEMO_DRUG_CHECK_MEDS, createDemoPresentation, demoStage } from "../src/ui/demo/presentation.js";

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const presentation = createDemoPresentation({ escapeHtml });

const patient = createDemoPatient();
assert.equal(patient.id, DEMO_PATIENT_ID);
assert.equal(patient.metadata.demo, true);
assert.equal(patient.days[0].id, DEMO_DAY_ID);
assert.equal(patient.contextSections.length, 0);
assert.equal(DEMO_CONTEXT_TEXTS[0].includes("Daniel Christopher Morgan"), true);
assert.equal(DEMO_CONTEXT_TEXTS[0].includes("NRM-847295104"), true);
assert.ok(DEMO_CONTEXT_TEXTS.join("\n").length > 5000);
assert.ok(DEMO_DAILY_TEXTS.join("\n").length > 1500);
const structuredDemo = deidentifyTextStructuredOnly(DEMO_CONTEXT_TEXTS.join("\n"), "2026-07-17");
assert.ok(structuredDemo.redactionTotal >= 10);
assert.match(structuredDemo.text, /\[PATIENT NAME\]/);
assert.match(structuredDemo.text, /\[MRN\]/);
assert.match(structuredDemo.text, /DOB year: 1964/);
// Time-format handling in the structured de-id path is covered by the de-id
// suite; the tour test only pins the name/MRN/occupation redactions it needs.
assert.match(structuredDemo.text, /Occupation: \[OCCUPATION\]/);
assert.doesNotMatch(structuredDemo.text, /Mechanical Engineer/);
assert.doesNotMatch(structuredDemo.text, /11\/22\/1964|6:30 AM|heavy equipment|pickup truck|stairs at work/i);

assert.equal(demoStage("open-cheat-sheets").view, "cheatSheets");
assert.equal(demoStage("open-cheat-sheets").navTarget, "cheatSheets");
assert.equal(demoStage("browse-cheat-sheet").targetSelector, '[data-cheat-sheets-open="acute-coronary-syndrome"]');
assert.match(demoStage("browse-cheat-sheet").instruction, /Acute coronary syndrome/i);
const seededPatient = attachDemoObjectiveData(patient);
assert.equal(seededPatient.days[0].sourceCaptures.length, 5, "the guided note workspace should include objective demo data");
assert.ok(seededPatient.days[0].sourceCaptures.some((capture) => capture.sourceKind === "vital_signs"));
assert.ok(seededPatient.days[0].sourceCaptures.some((capture) => capture.sourceKind === "laboratory_results"));
assert.ok(seededPatient.days[0].sourceCaptures.some((capture) => capture.label === "ECG interpretation"));
assert.equal(seededPatient.noteDrafts[DEMO_DAY_ID].assessment, DEMO_ASSESSMENT);
assert.equal(seededPatient.noteDrafts[DEMO_DAY_ID].problems, DEMO_PLAN_PROBLEMS);
assert.ok(DEMO_ASSESSMENT.length > 400, "the guided assessment should be fully written");
assert.equal(DEMO_PLAN_PROBLEMS.length, 3, "the guided plan should cover the active clinical problems");
DEMO_PLAN_PROBLEMS.forEach((problem) => {
  assert.ok(problem.problem && problem.keyContext && problem.diagnosticPlan && problem.therapeuticPlan);
});
assert.equal(demoStage("context-review").targetSelector, '[data-action="keep-reviewed-redaction"]');
assert.equal(demoStage("daily-review").targetSelector, '[data-action="keep-reviewed-redaction"]');
assert.deepEqual([...DEMO_REVIEW_ACTIONS], ["keep-reviewed-redaction", "confirm-all-section-redactions", "continue-section-review"]);
assert.equal(demoReviewTransition("keep-reviewed-redaction", true), "preserve-review");
assert.equal(demoReviewTransition("confirm-all-section-redactions", true), "preserve-review");
assert.equal(demoReviewTransition("continue-section-review", true), "preserve-review");
assert.equal(demoReviewTransition("keep-reviewed-redaction", false), "complete-review");
assert.equal(demoReviewTransition("copy-prompt", false), "unrelated");
assert.match(demoStage("context-review").instruction, /Accept.*one change at a time/i);
assert.equal(Object.keys(DEMO_GUIDE_STAGES).length, 19);
const stageOrder = Object.keys(DEMO_GUIDE_STAGES);
assert.ok(stageOrder.indexOf("daily-review") < stageOrder.indexOf("parse-note"));
assert.ok(stageOrder.indexOf("parse-note") < stageOrder.indexOf("open-drug-checks"));
assert.ok(stageOrder.indexOf("open-drug-checks") < stageOrder.indexOf("check-interactions"));
assert.ok(stageOrder.indexOf("check-interactions") < stageOrder.indexOf("open-ai-chat"));
assert.ok(stageOrder.indexOf("ai-chat-models") < stageOrder.indexOf("ai-chat-ask"));
assert.ok(stageOrder.indexOf("ai-chat-ask") < stageOrder.indexOf("open-scribe-pro"));
assert.ok(stageOrder.indexOf("open-scribe-pro") < stageOrder.indexOf("scribe-pro-voice"));
assert.ok(stageOrder.indexOf("scribe-pro-voice") < stageOrder.indexOf("open-cheat-sheets"));
assert.ok(stageOrder.indexOf("browse-cheat-sheet") < stageOrder.indexOf("write-note"));
assert.ok(stageOrder.indexOf("write-note") < stageOrder.indexOf("open-prompts"));
// Info stages explain and advance via the guide bar's Continue button.
assert.deepEqual([...DEMO_INFO_STAGES].sort(), ["ai-chat-ask", "ai-chat-models", "parse-note", "scribe-pro-voice"]);
assert.equal(DEMO_STAGE_NEXT["parse-note"], "open-drug-checks");
assert.equal(DEMO_STAGE_NEXT["ai-chat-models"], "ai-chat-ask");
assert.equal(DEMO_STAGE_NEXT["ai-chat-ask"], "open-scribe-pro");
assert.equal(DEMO_STAGE_NEXT["scribe-pro-voice"], "open-cheat-sheets");
// New feature stops carry the required hooks and prefills.
assert.equal(demoStage("open-drug-checks").navTarget, "drugChecks");
assert.equal(demoStage("open-ai-chat").navTarget, "aiChat");
assert.equal(demoStage("open-scribe-pro").navTarget, "scribePro");
assert.equal(demoStage("scribe-pro-voice").targetSelector, "#btnRecord");
assert.equal(demoStage("check-interactions").targetSelector, '[data-action="drug-checks-check"]');
assert.equal(demoStage("parse-note").targetSelector, '[data-structured-note-detected="admission"]');
assert.match(DEMO_PARSE_NOTE_TEXT, /HISTORY OF PRESENT ILLNESS/);
assert.match(DEMO_PARSE_NOTE_TEXT, /ASSESSMENT AND PLAN/);
assert.match(DEMO_DRUG_CHECK_MEDS, /warfarin/i);
assert.match(DEMO_DRUG_CHECK_MEDS, /fluconazole/i);
// Info stages render a Continue button; action stages must not.
const infoGuide = presentation.renderGuide({ session: { stage: "parse-note" }, currentView: "daily" });
assert.match(infoGuide, /data-action="advance-guided-demo"/);
assert.match(infoGuide, /data-demo-hint/);
const actionGuide = presentation.renderGuide({ session: { stage: "check-interactions" }, currentView: "drugChecks" });
assert.doesNotMatch(actionGuide, /data-action="advance-guided-demo"/);
assert.match(actionGuide, /data-demo-hint/);
Object.values(DEMO_GUIDE_STAGES).forEach((stage) => {
  assert.ok(stage.instruction, `${stage.title} should tell the user what to do`);
});
const guide = presentation.renderGuide({ session: { stage: "browse-cheat-sheet" }, currentView: "cheatSheets" });
assert.match(guide, /Guided demo/);
assert.match(guide, /Open the ACS cheat sheet/);
assert.match(guide, /guided-demo-instructions/);
assert.match(guide, /Click the Acute coronary syndrome \/ NSTEMI\/STEMI sheet/);
assert.match(guide, /Cheat sheets are read-only/);
assert.match(guide, /data-action="exit-guided-demo"/);
assert.match(guide, />Exit demo</);
assert.doesNotMatch(guide, /Restart demo/);
assert.doesNotMatch(guide, /demo-answer|demo-generate-prompt|static/i);
const noteGuide = presentation.renderGuide({ session: { stage: "write-note" }, currentView: "review" });
assert.match(noteGuide, /Review the complete assessment and plan/);
assert.match(noteGuide, /fully written synthetic assessment/i);
const feedbackGuide = presentation.renderGuide({ session: { stage: "open-prompts" }, currentView: "review" });
assert.match(feedbackGuide, /Open Prompts/i);
assert.match(presentation.renderCallout({ stage: demoStage("open-prompts") }), /feedback on the note you wrote/i);
const handoffGuide = presentation.renderGuide({
  session: { stage: "context-review" },
  currentView: "daily",
  reviewAction: "continue-section-review",
  nextSectionLabel: "Medications"
});
assert.match(handoffGuide, /Continue to next field/);
assert.match(handoffGuide, /Medications/);
assert.match(handoffGuide, /You check the app's suggestions before moving on/);

const complete = presentation.renderGuide({ session: { stage: "done" }, currentView: "prompts" });
assert.match(complete, /Demo complete/);
assert.match(complete, /reviewed a bedside cheat sheet, wrote and encrypted a student note/i);
assert.match(complete, /nothing from this demo was written to your vault/i);
assert.match(complete, /data-action="exit-guided-demo"/);

console.log("Guided demo session tests passed");

// The guided demo only advances past the cheat-sheets stage when the exact
// ACS sheet is opened; opening any other sheet must leave the stage alone.
{
  const session = { stage: "browse-cheat-sheet" };
  // createDemoController only touches document/window listeners at creation;
  // the render passed in here is a stub, so a minimal DOM shim is enough.
  globalThis.document ??= { addEventListener() {} };
  globalThis.window ??= { addEventListener() {} };
  const controller = createDemoController({
    app: { vault: { activePatientId: DEMO_PATIENT_ID, patients: [createDemoPatient()] } },
    byId: () => null,
    escapeHtml: (value) => String(value),
    getSession: () => session,
    getView: () => "cheatSheets",
    render: () => {},
    selectDemoPacket: () => {}
  });
  controller.observeSheetOpened("heart-failure");
  assert.equal(session.stage, "browse-cheat-sheet", "opening a different sheet must not advance the demo");
  controller.observeSheetOpened(undefined);
  assert.equal(session.stage, "browse-cheat-sheet", "a missing sheet id must not advance the demo");
  controller.observeSheetOpened("acute-coronary-syndrome");
  assert.equal(session.stage, "open-review", "opening the ACS sheet advances the demo");

  console.log("Guided demo cheat-sheet gate tests passed");
}
