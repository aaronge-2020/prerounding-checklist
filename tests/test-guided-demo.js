import assert from "node:assert/strict";
import { createDemoPatient, DEMO_CONTEXT_TEXTS, DEMO_DAILY_TEXTS, DEMO_DAY_ID, DEMO_PATIENT_ID, DEMO_WORKUP_ID } from "../src/ui/demo/session.js";
import { deidentifyTextStructuredOnly } from "../src/vault/deid.js";
import { DEMO_GUIDE_STAGES, createDemoPresentation, demoStage } from "../src/ui/demo/presentation.js";

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
assert.equal(demoStage("context-review").targetSelector, '[data-action="confirm-all-section-redactions"]');
assert.equal(demoStage("daily-review").targetSelector, '[data-action="confirm-all-section-redactions"]');
assert.equal(Object.keys(DEMO_GUIDE_STAGES).length, 11);
Object.values(DEMO_GUIDE_STAGES).forEach((stage) => {
  assert.ok(stage.what, `${stage.title} should explain what the user is doing`);
  assert.ok(stage.why, `${stage.title} should explain why the step exists`);
});
const guide = presentation.renderGuide({ session: { stage: "answer-checklist" }, currentView: "checklist" });
assert.match(guide, /Guided demo/);
assert.match(guide, /Answer a checklist question/);
assert.match(guide, /guided-demo-instructions/);
assert.match(guide, /What:/);
assert.match(guide, /Why:/);
assert.match(guide, /Next:/);
assert.match(guide, /real checklist/);
assert.doesNotMatch(guide, /demo-answer|demo-generate-prompt|static/i);
const handoffGuide = presentation.renderGuide({
  session: { stage: "context-review" },
  currentView: "daily",
  reviewAction: "continue-section-review",
  nextSectionLabel: "Medications"
});
assert.match(handoffGuide, /Continue to next field/);
assert.match(handoffGuide, /Medications/);
assert.match(handoffGuide, /person must verify the draft/);

const complete = presentation.renderGuide({ session: { stage: "done" }, currentView: "prompts" });
assert.match(complete, /Demo complete/);
assert.match(complete, /nothing from this demo was written to your vault/i);

console.log("Guided demo session tests passed");
