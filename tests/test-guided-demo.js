import assert from "node:assert/strict";
import { createDemoPatient, DEMO_ASSESSMENT, DEMO_CONTEXT_TEXTS, DEMO_DAILY_TEXTS, DEMO_DAY_ID, DEMO_PATIENT_ID, DEMO_PLAN_PROBLEMS, attachDemoObjectiveData } from "../src/ui/demo/session.js";
import { parsePrimaryTeamNote } from "../src/patient-context/primary-team-note-parser.js";
import { deidentifyTextStructuredOnly } from "../src/vault/deid.js";
import { DEMO_REVIEW_ACTIONS, demoReviewTransition, createDemoController } from "../src/ui/demo/controller.js";
import { DEMO_GUIDE_STAGES, DEMO_INFO_STAGES, DEMO_STAGE_NEXT, DEMO_PARSE_NOTE_TEXT, DEMO_DRUG_CHECK_MEDS, DEMO_AI_CHAT_QUESTION, DEMO_AI_CHAT_ANSWER, DEMO_SCRIBE_TRANSCRIPT, DEMO_SCRIBE_NOTE, createDemoPresentation, demoStage } from "../src/ui/demo/presentation.js";

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
assert.deepEqual([...DEMO_INFO_STAGES].sort(), ["ai-chat-ask", "ai-chat-models", "browse-cheat-sheet", "open-scribe-pro", "parse-note", "scribe-pro-voice", "write-note"]);
assert.equal(DEMO_STAGE_NEXT["parse-note"], "open-drug-checks");
assert.equal(DEMO_STAGE_NEXT["ai-chat-models"], "ai-chat-ask");
assert.equal(DEMO_STAGE_NEXT["ai-chat-ask"], "open-scribe-pro");
assert.equal(DEMO_STAGE_NEXT["open-scribe-pro"], "scribe-pro-voice");
assert.equal(DEMO_STAGE_NEXT["scribe-pro-voice"], "open-cheat-sheets");
// New feature stops carry the required hooks and prefills.
assert.equal(demoStage("open-drug-checks").navTarget, "drugChecks");
assert.equal(demoStage("open-ai-chat").navTarget, "aiChat");
assert.equal(demoStage("open-scribe-pro").info, true);
assert.equal(demoStage("scribe-pro-voice").info, true);
// The scribe stops show pre-built samples instead of starting the engine.
assert.equal(demoStage("open-scribe-pro").demoSample.kind, "transcript");
assert.equal(demoStage("scribe-pro-voice").demoSample.kind, "note");
assert.match(DEMO_SCRIBE_TRANSCRIPT, /NSTEMI/);
assert.match(DEMO_SCRIBE_NOTE, /ASSESSMENT AND PLAN/);
// The AI chat stop stages a grounded sample exchange.
assert.match(DEMO_AI_CHAT_QUESTION, /NSTEMI/);
assert.match(DEMO_AI_CHAT_ANSWER, /Fourth Universal Definition/);
assert.match(DEMO_AI_CHAT_ANSWER, /86 → 364 → 312/);
// The cheat-sheet stage names its sheet so an already-open sheet completes it.
assert.equal(demoStage("browse-cheat-sheet").sheetId, "acute-coronary-syndrome");
assert.equal(demoStage("check-interactions").targetSelector, '[data-action="drug-checks-check"]');
assert.equal(demoStage("parse-note").targetSelector, '[data-structured-note-detected="admission"]');
assert.match(DEMO_PARSE_NOTE_TEXT, /History of Present Illness/);
assert.match(DEMO_PARSE_NOTE_TEXT, /Chief Complaint/);
assert.match(DEMO_PARSE_NOTE_TEXT, /Laboratory Results/);
assert.match(DEMO_PARSE_NOTE_TEXT, /Daniel Christopher Morgan/);
// The parse-note stop pastes the complete admission note: the deterministic
// parser must section the whole case, not a toy excerpt.
const demoParse = parsePrimaryTeamNote(DEMO_PARSE_NOTE_TEXT, "hp");
const expectedDemoFields = ["one_liner", "chief_complaint", "history_of_present_illness", "past_medical_history", "past_surgical_history", "medications", "allergies", "family_history", "social_history", "review_of_systems", "physical_exam", "objective", "assessment", "plan"];
expectedDemoFields.forEach((fieldId) => {
  assert.ok(demoParse.detectedFieldIds.includes(fieldId), `the demo parse must detect ${fieldId}`);
  assert.ok(String(demoParse.sections[fieldId] || "").trim().length > 0, `the demo parse must fill ${fieldId}`);
});
// The Draft Note the tour showcases is built from those same parses, so it
// must be a complete case: one-liner, subjective, exam, objective, A/P.
const seededDraft = seededPatient.noteDrafts[DEMO_DAY_ID];
const seededSections = seededDraft.sections || {};
["one_liner", "interval_events", "patient_report", "physical_exam", "chief_complaint", "history_of_present_illness", "medications", "allergies", "past_medical_history", "family_history", "social_history"].forEach((sectionId) => {
  assert.ok(String(seededSections[sectionId]?.deidentifiedText || "").trim().length > 0, `the demo draft must fill ${sectionId}`);
});
assert.ok(String(seededDraft.objective?.manual?.deidentifiedText || "").match(/troponin/i), "the demo draft objective must include the parsed labs");
assert.ok(String(seededDraft.objective?.manual?.deidentifiedText || "").match(/ECG/i), "the demo draft objective must include the parsed imaging");
assert.equal(String(seededSections.one_liner.deidentifiedText), String(demoParse.sections.one_liner).trim(), "the demo one-liner must come from the real parse");
assert.ok(String(seededDraft.closing?.fen?.deidentifiedText || "").length > 0, "the demo draft must fill FEN");
assert.ok(String(seededDraft.closing?.disposition?.deidentifiedText || "").length > 0, "the demo draft must fill disposition");
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
assert.match(guide, /scan the history questions and exam maneuvers/);
assert.match(guide, /Cheat sheets are read-only/);
assert.match(guide, /data-action="exit-guided-demo"/);
assert.match(guide, />Exit demo</);
assert.doesNotMatch(guide, /Restart demo/);
assert.doesNotMatch(guide, /demo-answer|demo-generate-prompt|static/i);
const noteGuide = presentation.renderGuide({ session: { stage: "write-note" }, currentView: "review" });
assert.match(noteGuide, /Review the complete case note/);
assert.match(noteGuide, /parsed one-liner, subjective, and exam/i);
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

// Regression (Item 1): exiting the demo must remove the dim overlay, the
// callout, and the highlight classes. Otherwise the screen stays dark and
// unclickable after every exit path.
{
  const removedClasses = [];
  const removedAttrs = [];
  const removedNodes = [];
  const fakeElement = () => ({
    classList: { remove: (...cls) => removedClasses.push(cls.join(" ")) },
    style: {},
    removeAttribute: (attr) => removedAttrs.push(attr),
    remove: () => removedNodes.push(true)
  });
  const dimEl = fakeElement();
  const calloutEl = fakeElement();
  const targetEl = fakeElement();
  const doc = globalThis.document;
  const priorQuerySelectorAll = doc.querySelectorAll;
  doc.querySelectorAll = (selector) => {
    if (selector === "[data-demo-guide]") return [];
    if (selector === ".demo-next-action") return [targetEl];
    if (selector === "[data-demo-target]") return [targetEl];
    if (selector === "[data-demo-callout]") return [calloutEl];
    if (selector === "[data-demo-dim]") return [dimEl];
    return [];
  };
  let clearedDemoChat = false;
  const controller = createDemoController({
    app: {},
    byId: () => null,
    escapeHtml: (value) => String(value),
    getSession: () => null,
    getView: () => "daily",
    render: () => {},
    selectDemoPacket: () => {},
    clearAiChatDemo: () => { clearedDemoChat = true; }
  });
  controller.render();
  assert.ok(removedNodes.length >= 2, "the dim overlay and callout must be removed when the demo exits");
  assert.ok(removedClasses.some((c) => c.includes("demo-next-action")), "highlight classes must be cleared when the demo exits");
  assert.ok(removedAttrs.includes("data-demo-target"), "demo target markers must be cleared when the demo exits");
  assert.equal(clearedDemoChat, true, "demo-seeded chat messages must be cleared when the demo exits");
  doc.querySelectorAll = priorQuerySelectorAll;

  console.log("Guided demo exit-cleanup regression tests passed");
}

// Regression (Item 2): the cheat-sheets tab restores the last-viewed sheet,
// so the ACS sheet can already be open when the tour reaches the
// browse-cheat-sheet stage. browse-cheat-sheet is an info stage: it must
// never auto-advance on render, and the guide bar's Continue button must
// complete it, so the tour cannot dead-end with no highlighted control.
{
  const doc = globalThis.document;
  const priorQuerySelectorAll = doc.querySelectorAll;
  const priorQuerySelector = doc.querySelector;
  const priorCreateElement = doc.createElement;
  doc.querySelectorAll = () => [];
  doc.querySelector = () => null;
  doc.createElement = () => ({ dataset: {}, addEventListener() {}, classList: { add() {} } });
  doc.body ??= { appendChild() {} };

  function makeController(session, openSheetId) {
    const contentEl = { querySelectorAll: () => [], insertAdjacentHTML() {} };
    return createDemoController({
      app: { vault: { activePatientId: DEMO_PATIENT_ID, patients: [createDemoPatient()] } },
      byId: (id) => (id === "cheatSheetsContent" ? contentEl : null),
      escapeHtml: (value) => String(value),
      getSession: () => session,
      getView: () => "cheatSheets",
      render: () => {},
      selectDemoPacket: () => {},
      getCheatSheetOpenId: () => openSheetId
    });
  }

  const session = { stage: "browse-cheat-sheet" };
  const controller = makeController(session, "acute-coronary-syndrome");
  controller.render();
  assert.equal(session.stage, "browse-cheat-sheet", "the first render only prepares the stage");
  controller.render();
  assert.equal(session.stage, "browse-cheat-sheet", "an info stage must not auto-advance on an already-open sheet");
  assert.equal(DEMO_STAGE_NEXT["browse-cheat-sheet"], "open-review", "Continue must complete the cheat-sheet stage");

  const otherSession = { stage: "browse-cheat-sheet" };
  const otherController = makeController(otherSession, "heart-failure");
  otherController.render();
  otherController.render();
  assert.equal(otherSession.stage, "browse-cheat-sheet", "a different open sheet must not advance the demo");

  const noneSession = { stage: "browse-cheat-sheet" };
  const noneController = makeController(noneSession, null);
  noneController.render();
  noneController.render();
  assert.equal(noneSession.stage, "browse-cheat-sheet", "no open sheet must not advance the demo");

  doc.querySelectorAll = priorQuerySelectorAll;
  doc.querySelector = priorQuerySelector;
  doc.createElement = priorCreateElement;

  console.log("Guided demo already-open sheet regression tests passed");
}
