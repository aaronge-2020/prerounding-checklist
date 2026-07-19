import assert from "node:assert/strict";
import { createDemoPatient, DEMO_CONTEXT_TEXTS, DEMO_DAILY_TEXTS, DEMO_DAY_ID, DEMO_PATIENT_ID, DEMO_WORKUP_ID } from "../src/ui/demo/session.js";
import { deidentifyTextStructuredOnly } from "../src/vault/deid.js";
import { DEMO_GUIDE_STAGES, createDemoPresentation, demoStage } from "../src/ui/demo/presentation.js";
import { shouldStartGuidedDemo } from "../src/ui/demo/onboarding.js";

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
assert.equal(patient.contextSections[0].deidentifiedText.includes("Daniel Christopher Morgan"), true);
assert.equal(patient.contextSections[0].deidentifiedText.includes("NRM-847295104"), true);
assert.ok(DEMO_CONTEXT_TEXTS.join("\n").length > 5000);
assert.ok(DEMO_DAILY_TEXTS.join("\n").length > 1500);
const structuredDemo = deidentifyTextStructuredOnly(DEMO_CONTEXT_TEXTS.join("\n"), "2026-07-17");
assert.ok(structuredDemo.redactionTotal >= 10);
assert.match(structuredDemo.text, /\[PATIENT NAME\]/);
assert.match(structuredDemo.text, /\[MRN\]/);
assert.match(structuredDemo.text, /Admission Time: \[TIME\]/);
assert.match(structuredDemo.text, /Occupation: \[OCCUPATION\]/);
assert.doesNotMatch(structuredDemo.text, /Mechanical Engineer/);

assert.equal(demoStage("select-workup").targetSelector, `.workup-checkbox[value="${DEMO_WORKUP_ID}"]`);
assert.equal(demoStage("add-patient").targetSelector, '[data-action="add-demo-patient"]');
assert.equal(demoStage("add-patient").targetLabel, "Click Add patient");
assert.equal(demoStage("context-review").targetSelector, '[data-action="confirm-all-section-redactions"]');
assert.equal(demoStage("daily-review").targetSelector, '[data-action="confirm-all-section-redactions"]');
assert.equal(Object.keys(DEMO_GUIDE_STAGES).length, 12);
assert.equal(shouldStartGuidedDemo({ isNewVault: true, hasStartedGuidedDemo: false }), true);
assert.equal(shouldStartGuidedDemo({ isNewVault: false, hasStartedGuidedDemo: false }), false);
assert.equal(shouldStartGuidedDemo({ isNewVault: true, hasStartedGuidedDemo: true }), false);
Object.values(DEMO_GUIDE_STAGES).forEach((stage) => {
  assert.ok(stage.instruction, `${stage.title} should tell the user what to do`);
  if (stage !== DEMO_GUIDE_STAGES.done) assert.ok(stage.targetLabel, `${stage.title} should label the highlighted action`);
});
const guide = presentation.renderGuide({ session: { stage: "answer-checklist" }, currentView: "checklist" });
assert.match(guide, /Guided demo/);
assert.match(guide, /Review synthesized answers/);
assert.match(guide, /guided-demo-instructions/);
assert.match(guide, /chart-based suggestion/i);
assert.match(guide, /bedside assessment/i);
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
assert.match(complete, /repeat it anytime, click Guided demo in the sidebar/i);

const addPatient = presentation.renderGuide({ session: { stage: "add-patient" }, currentView: "vault" });
assert.match(addPatient, /Review the de-identified label/i);
assert.match(addPatient, /local-only label/i);
assert.match(complete, /data-action="exit-guided-demo"/);

console.log("Guided demo session tests passed");
