import assert from "node:assert/strict";
import { createDemoPatient, DEMO_CONTEXT_TEXTS, DEMO_DAILY_TEXTS, DEMO_DAY_ID, DEMO_PATIENT_ID, DEMO_REQUIRED_ANSWER_ITEM_ID, DEMO_WORKUP_ID, prefillDemoChecklist } from "../src/ui/demo/session.js";
import { checklistAnswersSummary, emptyChecklistAnswers } from "../src/checklist/state.js";
import { createChecklistSnapshot } from "../src/workups/checklist-conversion.js";
import { effectiveWorkupCatalog } from "../src/workups/schema.js";
import { deidentifyTextStructuredOnly } from "../src/vault/deid.js";
import { DEMO_GUIDE_STAGES, createDemoPresentation, demoStage } from "../src/ui/demo/presentation.js";
import { DEMO_REVIEW_ACTIONS, demoReviewTransition } from "../src/ui/demo/controller.js";

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
assert.match(structuredDemo.text, /Admission Time: \[TIME\]/);
assert.match(structuredDemo.text, /Occupation: \[OCCUPATION\]/);
assert.doesNotMatch(structuredDemo.text, /Mechanical Engineer/);
assert.doesNotMatch(structuredDemo.text, /11\/22\/1964|6:30 AM|heavy equipment|pickup truck|stairs at work/i);

assert.equal(demoStage("select-workup").targetSelector, `.workup-checkbox[value="${DEMO_WORKUP_ID}"]`);
const demoWorkup = effectiveWorkupCatalog().find((workup) => workup.id === DEMO_WORKUP_ID);
assert.ok(demoWorkup, "the focused demo workup should be available in the built-in catalog");
assert.ok(demoWorkup.items.filter((item) => item.kind === "history").length >= 8);
assert.ok(demoWorkup.items.filter((item) => item.kind === "exam").length >= 12);
const snapshot = createChecklistSnapshot([demoWorkup], { id: "demo-checklist" });
const seededPatient = prefillDemoChecklist({ ...patient, days: [{ ...patient.days[0], checklistSnapshot: snapshot, answers: emptyChecklistAnswers(snapshot) }] });
const seededAnswers = seededPatient.days[0].answers;
assert.deepEqual(seededAnswers[DEMO_REQUIRED_ANSWER_ITEM_ID].selected, [], "the bedside chest-pain question should remain open for the user");
assert.equal(Object.values(seededAnswers).filter((answer) => answer.selected.length).length, snapshot.items.length - 1);
const promptSummary = checklistAnswersSummary(snapshot, seededAnswers);
assert.match(promptSummary, /JVP not elevated/);
assert.match(promptSummary, /Clear throughout including bases/);
assert.doesNotMatch(promptSummary, /Are you having chest pressure or pain now/);
assert.equal(demoStage("context-review").targetSelector, '[data-action="keep-reviewed-redaction"]');
assert.equal(demoStage("daily-review").targetSelector, '[data-action="keep-reviewed-redaction"]');
assert.deepEqual([...DEMO_REVIEW_ACTIONS], ["keep-reviewed-redaction", "confirm-all-section-redactions", "continue-section-review"]);
assert.equal(demoReviewTransition("keep-reviewed-redaction", true), "preserve-review");
assert.equal(demoReviewTransition("confirm-all-section-redactions", true), "preserve-review");
assert.equal(demoReviewTransition("continue-section-review", true), "preserve-review");
assert.equal(demoReviewTransition("keep-reviewed-redaction", false), "complete-review");
assert.equal(demoReviewTransition("copy-prompt", false), "unrelated");
assert.match(demoStage("context-review").instruction, /Accept.*one change at a time/i);
assert.equal(Object.keys(DEMO_GUIDE_STAGES).length, 13);
Object.values(DEMO_GUIDE_STAGES).forEach((stage) => {
  assert.ok(stage.instruction, `${stage.title} should tell the user what to do`);
});
const guide = presentation.renderGuide({ session: { stage: "answer-checklist" }, currentView: "checklist" });
assert.match(guide, /Guided demo/);
assert.match(guide, /Ask one bedside question/);
assert.match(guide, /guided-demo-instructions/);
assert.match(guide, /Record that Daniel has no chest discomfort now/);
assert.match(guide, /other history and examination findings are pre-filled/i);
assert.match(guide, /data-action="exit-guided-demo"/);
assert.match(guide, />Exit demo</);
assert.doesNotMatch(guide, /Restart demo/);
assert.doesNotMatch(guide, /demo-answer|demo-generate-prompt|static/i);
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
assert.match(complete, /nothing from this demo was written to your vault/i);
assert.match(complete, /data-action="exit-guided-demo"/);

console.log("Guided demo session tests passed");
