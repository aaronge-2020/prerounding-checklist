// Contract tests for the MD Calc tab: pure presentation markup plus the
// controller's navigation / binding / override behavior through injected DOM
// fakes (the controller never touches the real DOM).
import assert from "node:assert/strict";
import { createScoresPresentation } from "../src/ui/scores/presentation.js";
import { createScoresController } from "../src/ui/scores/controller.js";
import { getScoreDefinition, listScoreDefinitions } from "../src/clinical-scores/index.js";

const escapeHtml = (value) => String(value ?? "");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    throw error;
  }
}

const presentation = createScoresPresentation({ escapeHtml });
const definitions = listScoreDefinitions();

// ---- presentation: home ----

test("home renders one card per calculator", () => {
  const html = presentation.renderScoresHome({ definitions, patientLabel: "Jane" });
  for (const definition of definitions) {
    assert.ok(html.includes(`data-score-open="${definition.id}"`), `card for ${definition.id}`);
    assert.ok(html.includes(definition.title));
  }
  assert.ok(html.includes("one-to-one"), "parity claim present after live MDCalc verification");
});

test("home explains patient-sourced inputs", () => {
  const html = presentation.renderScoresHome({ definitions, patientLabel: "Jane" });
  assert.ok(html.includes("from patient"));
  assert.ok(html.includes("Jane"));
});

// ---- presentation: detail ----

function detailHtml(overrides = {}) {
  const definition = getScoreDefinition("vbac-mfmu");
  return presentation.renderScoreDetail({
    definition,
    values: {},
    bindings: {},
    overriddenKeys: new Set(),
    result: null,
    patientLabel: "Jane",
    mode: undefined,
    hasBindings: false,
    ...overrides
  });
}

test("detail shows incomplete panel with missing labels when inputs are empty", () => {
  const definition = getScoreDefinition("bishop");
  const result = definition.calculate({});
  const html = presentation.renderScoreDetail({
    definition,
    values: {},
    bindings: {},
    overriddenKeys: new Set(),
    result,
    patientLabel: "Jane",
    mode: undefined,
    hasBindings: false
  });
  assert.ok(html.includes("Please fill out required fields."));
  assert.ok(html.includes("Still needed:"));
});

test("detail shows result headline when complete", () => {
  const definition = getScoreDefinition("bishop");
  const values = { dilation: 2, effacement: 2, station: 2, position: 2, consistency: 2 };
  const result = definition.calculate(values);
  assert.ok(result.complete);
  const html = presentation.renderScoreDetail({
    definition,
    values,
    bindings: {},
    overriddenKeys: new Set(),
    result,
    patientLabel: "Jane",
    mode: undefined,
    hasBindings: false
  });
  assert.ok(html.includes(String(result.score)));
  assert.ok(html.includes(result.interpretation.headline));
});

test("binding badge states: from patient, edited, none", () => {
  const definition = getScoreDefinition("vbac-mfmu");
  const binding = { ageYears: { value: 28, source: "HPI" } };
  const base = { definition, values: {}, result: null, patientLabel: "Jane", mode: undefined, hasBindings: true };
  const bound = presentation.renderScoreDetail({ ...base, bindings: binding, overriddenKeys: new Set() });
  assert.ok(bound.includes("from patient"), "shows from-patient badge");
  const edited = presentation.renderScoreDetail({ ...base, bindings: binding, overriddenKeys: new Set(["ageYears"]) });
  assert.ok(edited.includes("score-binding-badge--edited"), "shows edited badge");
  const fieldBlock = edited.slice(edited.indexOf('data-score-field="ageYears"'), edited.indexOf('data-score-field="ageYears"') + 600);
  assert.ok(!fieldBlock.includes(">from patient<"), "from-patient badge replaced once overridden");
  const unboundHtml = presentation.renderScoreDetail({ ...base, bindings: {}, overriddenKeys: new Set() });
  const unboundField = unboundHtml.slice(unboundHtml.indexOf('data-score-field="ageYears"'), unboundHtml.indexOf('data-score-field="ageYears"') + 600);
  assert.ok(!unboundField.includes("score-binding-badge"), "no badge without a binding");
});

test("re-pull button only appears when bindings exist", () => {
  assert.ok(detailHtml({ hasBindings: true }).includes("data-score-repull"), "re-pull shown");
  assert.ok(!detailHtml({ hasBindings: false }).includes("data-score-repull"), "re-pull hidden");
});

test("due-dates mode gating hides irrelevant fields", () => {
  const definition = getScoreDefinition("due-dates");
  const base = { definition, values: {}, bindings: {}, overriddenKeys: new Set(), result: null, patientLabel: "Jane", hasBindings: false };
  const lmpHtml = presentation.renderScoreDetail({ ...base, mode: "lmp", values: { mode: "lmp" } });
  assert.ok(lmpHtml.includes('data-score-field="dateISO"'), "lmp mode shows date field");
  assert.ok(!lmpHtml.includes('data-score-field="egaWeeks"'), "lmp mode hides EGA fields");
  const egaHtml = presentation.renderScoreDetail({ ...base, mode: "ega-today", values: { mode: "ega-today" } });
  assert.ok(egaHtml.includes('data-score-field="egaWeeks"'), "ega mode shows EGA fields");
  assert.ok(!egaHtml.includes('data-score-field="egaDateISO"'), "ega-today hides the EGA reference date");
});

test("detail provenance states verified one-to-one parity", () => {
  const html = detailHtml({ tab: "evidence" });
  assert.ok(html.includes("one-to-one"));
  assert.ok(html.includes("Verified one-to-one against"));
  assert.ok(!html.includes("Modeled on"));
});

// ---- controller ----

const patient = {
  id: "p1",
  displayLabel: "Test Patient",
  contextSections: [
    { sourceKind: "history_present_illness", label: "HPI", deidentifiedText: "28-year-old G3P2 at 39w2d. LMP 1/2/26." },
    { sourceKind: "vital_signs", label: "Vitals", deidentifiedText: "Vitals\n@ 09/26 08:00: Weight 70 kg" }
  ],
  days: []
};

function makeController(currentPatient = patient) {
  const app = { view: "scores" };
  let lastHtml = "";
  const container = {};
  const controller = createScoresController({
    app,
    active: () => currentPatient,
    byId: (id) => (id === "scoresContent" ? container : null),
    escapeHtml,
    replaceViewContent: (node, html) => {
      assert.equal(node, container);
      lastHtml = html;
    },
    patientRequiredMessage: () => "<p>select a patient</p>",
    selectedDayId: () => ""
  });
  return { app, controller, html: () => lastHtml };
}

function fakeClickOpen(scoreId) {
  return { dataset: {}, matches: () => false, closest: (sel) => (sel === "[data-score-open]" ? { dataset: { scoreOpen: scoreId } } : null) };
}
function fakeClickBack() {
  return { dataset: {}, matches: () => false, closest: (sel) => (sel === "[data-score-back]" ? {} : null) };
}
function fakeClickRepull() {
  return { dataset: {}, matches: () => false, closest: (sel) => (sel === "[data-score-repull]" ? {} : null) };
}
function fakeChange(scoreId, key, value, type = "radio") {
  return { dataset: { scoreId, scoreInput: key }, value, type, matches: (sel) => sel === "[data-score-input]", closest: () => null };
}

test("controller navigates home -> detail -> home", () => {
  const { controller, html } = makeController();
  controller.render();
  assert.ok(html().includes('data-score-open="bishop"'), "home shows cards");
  assert.ok(controller.click(fakeClickOpen("bishop")), "open handled");
  assert.ok(html().includes('data-score-form="bishop"'), "detail renders");
  assert.ok(controller.click(fakeClickBack()), "back handled");
  assert.ok(html().includes('data-score-open="bishop"'), "back returns home");
});

test("controller pulls patient bindings and recalculates on change", () => {
  const { controller, html } = makeController();
  controller.render();
  controller.click(fakeClickOpen("vbac-mfmu"));
  assert.ok(html().includes(">from patient<"), "age binding pulled from patient");
  assert.ok(controller.change(fakeChange("vbac-mfmu", "height", "165")), "change handled");
  assert.ok(html().includes('value="165"'), "entered value persists across re-render");
});

test("manual edit marks binding overridden; re-pull restores it", () => {
  const { controller, html } = makeController();
  controller.render();
  controller.click(fakeClickOpen("vbac-mfmu"));
  assert.ok(html().includes(">from patient<"), "starts bound");
  controller.change(fakeChange("vbac-mfmu", "ageYears", "35", "number"));
  assert.ok(html().includes("score-binding-badge--edited"), "override shows edited badge");
  assert.ok(controller.click(fakeClickRepull()), "re-pull handled");
  assert.ok(html().includes(">from patient<"), "re-pull restores from-patient badge");
  assert.ok(!html().includes("score-binding-badge--edited"), "edited badge cleared");
});

test("switching patients resets calculator state", () => {
  const first = makeController(patient);
  first.controller.render();
  first.controller.click(fakeClickOpen("bishop"));
  first.controller.change(fakeChange("bishop", "dilation", "2"));
  assert.ok(first.html().includes('data-score-form="bishop"'), "detail open");

  const other = { ...patient, id: "p2", displayLabel: "Other Patient" };
  const second = makeController(other);
  second.controller.render();
  assert.ok(second.html().includes('data-score-open="bishop"'), "new patient starts at home");
});

test("no patient shows the patient-required message", () => {
  const { controller, html } = makeController(null);
  controller.render();
  assert.ok(html().includes("select a patient"));
});

test("handlers ignore events when the scores view is not active", () => {
  const { app, controller } = makeController();
  app.view = "checklist";
  assert.equal(controller.click(fakeClickOpen("bishop")), false);
  assert.equal(controller.change(fakeChange("bishop", "dilation", "2")), false);
});

test("every registered calculator declares a verification date or explicit pending state", () => {
  for (const definition of listScoreDefinitions()) {
    assert.ok(
      "verifiedOn" in definition,
      `${definition.id} must declare verifiedOn`
    );
    assert.ok(
      definition.verifiedOn === null || /^\d{4}-\d{2}-\d{2}$/.test(definition.verifiedOn),
      `${definition.id} verifiedOn must be null or a YYYY-MM-DD date`
    );
  }
});

test("provenance wording matches verification state", () => {
  for (const definition of listScoreDefinitions()) {
    const html = presentation.renderScoreDetail({
      definition,
      values: {},
      bindings: {},
      overriddenKeys: new Set(),
      result: null,
      patientLabel: null,
      mode: "auto",
      hasBindings: false,
      tab: "evidence"
    });
    if (definition.verifiedOn) {
      assert.ok(html.includes("Verified one-to-one against"), `${definition.id} shows verified wording`);
      assert.ok(html.includes(definition.verifiedOn), `${definition.id} shows its verification date`);
    } else {
      assert.ok(html.includes("live verification pending"), `${definition.id} shows pending wording`);
      assert.ok(!html.includes("Verified one-to-one against"), `${definition.id} must not claim verification`);
    }
  }
});

// ---- MDCalc tabbed layout ----

const guideFixture = {
  description: "Predicts test outcomes.",
  instructions: "Fill in every field.",
  whenToUse: ["When testing"],
  pearlsPitfalls: ["A pearl"],
  whyUse: "Because testing matters.",
  nextSteps: { favorable: "Favorable next step.", default: "General next step." },
  evidence: [{ label: "Test paper", url: "https://example.com/paper" }],
  creator: "Dr. Test, 2020."
};

function guidedBishop() {
  const definition = getScoreDefinition("bishop");
  return { ...definition, guide: guideFixture };
}

test("detail renders all four MDCalc tabs with Calculator active", () => {
  const html = presentation.renderScoreDetail({
    definition: guidedBishop(),
    values: {},
    bindings: {},
    overriddenKeys: new Set(),
    result: null,
    patientLabel: "Jane",
    mode: undefined,
    hasBindings: false
  });
  for (const tab of ["calculator", "next-steps", "evidence", "creator"]) {
    assert.ok(html.includes(`data-score-tab="${tab}"`), `tab ${tab} present`);
  }
  assert.ok(html.includes("data-mdc-pane=\"calculator\""), "calculator pane shown by default");
  assert.ok(html.includes("mdc-resultbar"), "sticky result bar present");
  assert.ok(html.includes("data-score-fav"), "favorite star present");
  assert.ok(html.includes("data-score-share"), "share button present");
});

test("detail renders accordions and description from the guide", () => {
  const html = presentation.renderScoreDetail({
    definition: guidedBishop(),
    values: {},
    bindings: {},
    overriddenKeys: new Set(),
    result: null,
    patientLabel: "Jane",
    mode: undefined,
    hasBindings: false
  });
  assert.ok(html.includes("Predicts test outcomes."), "description shown");
  assert.ok(html.includes('data-mdc-acc="instructions"'), "instructions accordion shown");
  assert.ok(html.includes('data-mdc-acc="whenToUse"'), "when-to-use shown");
  assert.ok(html.includes('data-mdc-acc="pearlsPitfalls"'), "pearls shown");
  assert.ok(html.includes('data-mdc-acc="whyUse"'), "why-use shown");
});

test("next-steps tab resolves band-specific guidance", () => {
  const definition = guidedBishop();
  const values = { dilation: 3, effacement: 3, station: 3, position: 2, consistency: 2 };
  const result = definition.calculate(values);
  assert.ok(result.complete);
  const html = presentation.renderScoreDetail({
    definition,
    values,
    bindings: {},
    overriddenKeys: new Set(),
    result,
    patientLabel: "Jane",
    mode: undefined,
    hasBindings: false,
    tab: "next-steps"
  });
  assert.ok(html.includes("Favorable next step."), "band-specific next step shown");
  assert.ok(html.includes("General next step."), "general next step shown");
});

test("controller switches tabs and keeps calculator state", () => {
  const { controller, html } = makeController();
  controller.render();
  controller.click(fakeClickOpen("bishop"));
  assert.ok(html().includes('data-mdc-pane="calculator"'), "starts on calculator tab");
  const tabTarget = {
    dataset: { scoreTab: "evidence" },
    matches: () => false,
    closest: (sel) => (sel === "[data-score-tab]" ? { dataset: { scoreTab: "evidence" } } : null)
  };
  assert.ok(controller.click(tabTarget), "tab click handled");
  assert.ok(html().includes('data-mdc-pane="evidence"'), "evidence pane shown");
  const favTarget = {
    dataset: {},
    matches: () => false,
    closest: (sel) => (sel === "[data-score-fav]" ? {} : null)
  };
  assert.ok(controller.click(favTarget), "favorite click handled");
  assert.ok(html().includes("is-favorite"), "star fills after favoriting");
});

console.log("score UI contract tests passed");
