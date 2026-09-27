// Contract tests for the Models tab: pure presentation markup plus the
// controller's navigation / binding / override behavior through a minimal
// fake DOM (the controller never touches the real DOM in tests).
//
// The central regression contract: interacting with an open calculator
// (change/input/click) must NEVER rebuild the form. Tests assert node
// identity — the same field/form nodes must survive every interaction —
// because full innerHTML replacement was the root cause of the view
// "jumping" while filling calculators out.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createScoresPresentation } from "../src/ui/scores/presentation.js";
import { createScoresController } from "../src/ui/scores/controller.js";
import { getScoreDefinition, listScoreDefinitions } from "../src/clinical-scores/index.js";

const escapeHtml = (value) => String(value ?? "");

// ---- minimal fake DOM ----
// Supports the selector subset the scores controller uses: [data-*],
// [data-*="value"], .class, tag, tag[attr="value"], and descendant chains.

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr", "path"
]);

function parseSimpleSelector(part) {
  const out = { tag: null, classes: [], attrs: [] };
  let rest = part;
  const tagMatch = rest.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  if (tagMatch) {
    out.tag = tagMatch[1].toLowerCase();
    rest = rest.slice(tagMatch[1].length);
  }
  const re = /(\.[a-zA-Z0-9_-]+)|\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g;
  let m;
  while ((m = re.exec(rest))) {
    if (m[1]) out.classes.push(m[1].slice(1));
    else out.attrs.push({ name: m[2], value: m[3] === undefined ? null : m[3] });
  }
  return out;
}

function matchesSimple(el, sel) {
  if (!el || !el.attrs) return false;
  if (sel.tag && el.tagName.toLowerCase() !== sel.tag) return false;
  const classes = new Set((el.attrs.class || "").split(/\s+/).filter(Boolean));
  for (const name of sel.classes) if (!classes.has(name)) return false;
  for (const { name, value } of sel.attrs) {
    if (!(name in el.attrs)) return false;
    if (value !== null && el.attrs[name] !== value) return false;
  }
  return true;
}

function matchesChain(el, parts) {
  if (!matchesSimple(el, parts[parts.length - 1])) return false;
  let node = el.parent;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (node && !matchesSimple(node, parts[i])) node = node.parent;
    if (!node) return false;
    node = node.parent;
  }
  return true;
}

class FakeClassList {
  constructor(el) {
    this.el = el;
  }
  _set() {
    return new Set((this.el.attrs.class || "").split(/\s+/).filter(Boolean));
  }
  _write(set) {
    this.el.attrs.class = [...set].join(" ");
  }
  add(...names) {
    const set = this._set();
    for (const name of names) set.add(name);
    this._write(set);
  }
  remove(...names) {
    const set = this._set();
    for (const name of names) set.delete(name);
    this._write(set);
  }
  toggle(name, force) {
    const set = this._set();
    const on = force === undefined ? !set.has(name) : !!force;
    if (on) set.add(name);
    else set.delete(name);
    this._write(set);
    return on;
  }
  contains(name) {
    return this._set().has(name);
  }
}

class FakeText {
  constructor(text) {
    this.text = text;
    this.parent = null;
    this.children = [];
    this.attrs = {};
    this.tagName = "#TEXT";
  }
  get innerHTML() {
    return this.text;
  }
  get outerHTML() {
    return this.text;
  }
  get textContent() {
    return this.text;
  }
  querySelectorAll() {
    return [];
  }
  querySelector() {
    return null;
  }
  matches() {
    return false;
  }
  closest() {
    return null;
  }
  contains() {
    return false;
  }
}

class FakeElement {
  constructor(tag, attrs = {}) {
    this.tagName = String(tag).toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parent = null;
    this._classList = new FakeClassList(this);
  }
  get classList() {
    return this._classList;
  }
  get dataset() {
    const ds = {};
    for (const [key, value] of Object.entries(this.attrs)) {
      if (key.startsWith("data-")) {
        ds[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      }
    }
    return ds;
  }
  get type() {
    return this.attrs.type || "";
  }
  get value() {
    return this.attrs.value ?? "";
  }
  set value(v) {
    this.attrs.value = String(v ?? "");
  }
  get checked() {
    return "checked" in this.attrs;
  }
  set checked(v) {
    if (v) this.attrs.checked = "";
    else delete this.attrs.checked;
  }
  get hidden() {
    return "hidden" in this.attrs;
  }
  set hidden(v) {
    if (v) this.attrs.hidden = "";
    else delete this.attrs.hidden;
  }
  getAttribute(name) {
    return this.attrs[name] ?? null;
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }
  removeAttribute(name) {
    delete this.attrs[name];
  }
  hasAttribute(name) {
    return name in this.attrs;
  }
  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  set innerHTML(html) {
    this.children = [];
    for (const child of parseFragment(html)) this.appendChild(child);
  }
  get innerHTML() {
    return this.children.map((child) => child.outerHTML).join("");
  }
  get outerHTML() {
    const attrs = Object.entries(this.attrs)
      .map(([key, value]) => ` ${key}="${value}"`)
      .join("");
    const tag = this.tagName.toLowerCase();
    if (VOID_TAGS.has(tag)) return `<${tag}${attrs}>`;
    return `<${tag}${attrs}>${this.innerHTML}</${tag}>`;
  }
  matches(selector) {
    return matchesSimple(this, parseSimpleSelector(selector.trim()));
  }
  closest(selector) {
    const sel = parseSimpleSelector(selector.trim().split(/\s+/).pop());
    let el = this;
    while (el) {
      if (matchesSimple(el, sel)) return el;
      el = el.parent;
    }
    return null;
  }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/).map(parseSimpleSelector);
    const results = [];
    const walk = (node) => {
      for (const child of node.children || []) {
        if (matchesChain(child, parts)) results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  contains(node) {
    let el = node;
    while (el) {
      if (el === this) return true;
      el = el.parent;
    }
    return false;
  }
}

function parseFragment(html) {
  const top = [];
  const stack = [];
  const push = (el) => {
    if (stack.length) stack[stack.length - 1].appendChild(el);
    else top.push(el);
  };
  const re = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g;
  let m;
  while ((m = re.exec(html))) {
    const token = m[0];
    if (token.startsWith("<!--")) continue;
    if (!token.startsWith("<")) {
      push(new FakeText(token));
      continue;
    }
    if (token[1] === "/") {
      stack.pop();
      continue;
    }
    const nameMatch = token.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
    if (!nameMatch) continue;
    const tag = nameMatch[1].toLowerCase();
    const attrs = {};
    const attrRe = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:="([^"]*)")?/g;
    let am;
    while ((am = attrRe.exec(token.slice(nameMatch[0].length)))) {
      attrs[am[1]] = am[2] === undefined ? "" : am[2];
    }
    const el = new FakeElement(tag, attrs);
    push(el);
    if (!token.endsWith("/>") && !VOID_TAGS.has(tag)) stack.push(el);
  }
  return top;
}

// ---- test runner (supports async) ----

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

// ---- presentation: home ----

const presentation = createScoresPresentation({ escapeHtml });
const definitions = listScoreDefinitions();

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

test("detail renders all four panes with only the active one visible", () => {
  const html = detailHtml();
  for (const pane of ["calculator", "next-steps", "evidence", "creator"]) {
    assert.ok(html.includes(`data-mdc-pane="${pane}"`), `pane ${pane} present`);
  }
  assert.ok(!html.includes('data-mdc-pane="calculator" hidden'), "calculator pane visible");
  assert.ok(html.includes('data-mdc-pane="next-steps" hidden'), "next-steps pane hidden");
  assert.ok(html.includes('data-mdc-pane="evidence" hidden'), "evidence pane hidden");
  assert.ok(html.includes('data-mdc-pane="creator" hidden'), "creator pane hidden");
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

test("due-dates mode gating hides irrelevant fields in place", () => {
  const definition = getScoreDefinition("due-dates");
  const base = { definition, values: {}, bindings: {}, overriddenKeys: new Set(), result: null, patientLabel: "Jane", hasBindings: false };
  const lmpHtml = presentation.renderScoreDetail({ ...base, mode: "lmp", values: { mode: "lmp" } });
  assert.ok(lmpHtml.includes('data-score-field="dateISO"'), "lmp mode shows date field");
  assert.ok(lmpHtml.includes('data-score-field="egaWeeks" hidden'), "lmp mode hides EGA fields but keeps them in the DOM");
  const egaHtml = presentation.renderScoreDetail({ ...base, mode: "ega-today", values: { mode: "ega-today" } });
  assert.ok(egaHtml.includes('data-score-field="egaWeeks"'), "ega mode shows EGA fields");
  assert.ok(egaHtml.includes('data-score-field="egaDateISO" hidden'), "ega-today hides the EGA reference date but keeps it in the DOM");
});

test("detail provenance states verified one-to-one parity", () => {
  const html = detailHtml({ tab: "evidence" });
  assert.ok(html.includes("one-to-one"));
  assert.ok(html.includes("Verified one-to-one against"));
  assert.ok(!html.includes("Modeled on"));
});

test("granular renderers are exported for surgical updates", () => {
  for (const name of ["renderResultBar", "renderNextStepsPane", "renderFavoriteButton", "renderBindingBadge"]) {
    assert.equal(typeof presentation[name], "function", `${name} exported`);
  }
  const definition = getScoreDefinition("bishop");
  const bar = presentation.renderResultBar({ result: null, definition, savedState: null });
  assert.ok(bar.includes("mdc-resultbar"), "result bar renders standalone");
  assert.ok(!bar.includes("data-mdc-resultbar-slot"), "slot wrapper lives in the detail, not the bar");
  const fav = presentation.renderFavoriteButton({ definition, isFavorite: true });
  assert.ok(fav.includes("is-favorite") && fav.includes("data-score-fav"), "favorite button renders standalone");
  const pane = presentation.renderNextStepsPane({ definition: getScoreDefinition("bishop"), result: null });
  assert.ok(pane.includes("Next steps"), "next-steps pane renders standalone");
});

// ---- controller (fake DOM) ----

const patient = {
  id: "p1",
  displayLabel: "Test Patient",
  contextSections: [
    { sourceKind: "history_present_illness", label: "HPI", deidentifiedText: "28-year-old G3P2 at 39w2d. LMP 1/2/26." },
    { sourceKind: "vital_signs", label: "Vitals", deidentifiedText: "Vitals\n@ 09/26 08:00: Weight 70 kg" }
  ],
  days: []
};

function makeController(currentPatient = patient, extra = {}) {
  const app = { view: "scores" };
  const container = new FakeElement("div", { id: "scoresContent" });
  const controller = createScoresController({
    app,
    active: () => currentPatient,
    byId: (id) => (id === "scoresContent" ? container : null),
    escapeHtml,
    replaceViewContent: (node, html) => {
      assert.equal(node, container);
      node.innerHTML = html;
    },
    patientRequiredMessage: () => "<p>select a patient</p>",
    selectedDayId: () => "",
    updateActivePatient: extra.updateActivePatient,
    persistVault: extra.persistVault
  });
  return { app, controller, container };
}

function openScore(controller, container, scoreId) {
  const button = container.querySelector(`[data-score-open="${scoreId}"]`);
  assert.ok(button, `open button for ${scoreId}`);
  assert.ok(controller.click(button), "open handled");
}

function setRadio(controller, container, scoreId, key, value) {
  const radios = container.querySelectorAll('input[type="radio"]');
  const target = radios.find((r) => r.dataset.scoreInput === key && r.value === String(value));
  assert.ok(target, `radio ${scoreId}.${key}=${value} exists`);
  // The browser checks the radio natively before the change event fires.
  for (const r of radios) if (r.dataset.scoreInput === key) r.checked = r === target;
  assert.ok(controller.change(target), "change handled");
  return target;
}

function formOf(container, scoreId) {
  return container.querySelector(`[data-score-form="${scoreId}"]`);
}

const BISHOP_KEYS = ["dilation", "effacement", "station", "position", "consistency"];
function fillBishop(controller, container) {
  for (const key of BISHOP_KEYS) setRadio(controller, container, "bishop", key, 2);
}

test("controller navigates home -> detail -> home", () => {
  const { controller, container } = makeController();
  controller.render();
  assert.ok(container.querySelector('[data-score-open="bishop"]'), "home shows cards");
  openScore(controller, container, "bishop");
  assert.ok(formOf(container, "bishop"), "detail renders");
  assert.ok(controller.click(container.querySelector("[data-score-back]")), "back handled");
  assert.ok(container.querySelector('[data-score-open="bishop"]'), "back returns home");
});

test("change() updates the model without rebuilding the form", () => {
  const { controller, container } = makeController();
  controller.render();
  openScore(controller, container, "vbac-mfmu");
  assert.ok(formOf(container, "vbac-mfmu").innerHTML.includes(">from patient<"), "age binding pulled from patient");
  const formBefore = formOf(container, "vbac-mfmu");
  const heightInput = container.querySelector('[data-score-input="height"]');
  assert.ok(heightInput, "height input present");
  heightInput.value = "165";
  assert.ok(controller.change(heightInput), "change handled");
  assert.equal(formOf(container, "vbac-mfmu"), formBefore, "form node identity preserved: no innerHTML rebuild");
  assert.equal(container.querySelector('[data-score-input="height"]').value, "165", "entered value persists");
});

test("typing updates the result bar live without touching the input", () => {
  const { controller, container } = makeController();
  controller.render();
  openScore(controller, container, "due-dates");
  const dateInput = container.querySelector('[data-score-input="dateISO"]');
  assert.ok(dateInput, "date input present");
  dateInput.value = "2026-01-02";
  assert.ok(controller.input(dateInput), "input handled");
  assert.equal(container.querySelector('[data-score-input="dateISO"]'), dateInput, "input node untouched: caret cannot jump");
  const bar = container.querySelector("[data-mdc-resultbar-slot]").innerHTML;
  assert.ok(bar.includes("mdc-resultbar-headline"), "result bar recomputed live from the model");
  assert.ok(bar.includes("Due date: Friday, Oct 9, 2026"), "live result is correct");
});

test("radio change moves the selected option in place", () => {
  const { controller, container } = makeController();
  controller.render();
  openScore(controller, container, "bishop");
  const fieldBefore = container.querySelector('[data-score-field="dilation"]');
  setRadio(controller, container, "bishop", "dilation", 2);
  const fieldAfter = container.querySelector('[data-score-field="dilation"]');
  assert.equal(fieldAfter, fieldBefore, "field node identity preserved");
  const selected = fieldAfter.querySelectorAll(".mdc-opt").filter((label) => label.classList.contains("is-selected"));
  assert.equal(selected.length, 1, "exactly one option selected");
  assert.ok(selected[0].querySelector('input[type="radio"]').checked, "the checked input carries the class");
  setRadio(controller, container, "bishop", "dilation", 3);
  const reselected = fieldAfter.querySelectorAll(".mdc-opt").filter((label) => label.classList.contains("is-selected"));
  assert.equal(reselected.length, 1, "selection moved, still exactly one");
  assert.ok(reselected[0].querySelector('input[type="radio"]').checked, "selection follows the checked input");
});

test("completing the form updates the result bar in place", () => {
  const { controller, container } = makeController();
  controller.render();
  openScore(controller, container, "bishop");
  const formBefore = formOf(container, "bishop");
  fillBishop(controller, container);
  assert.equal(formOf(container, "bishop"), formBefore, "form never rebuilt while filling out");
  const bar = container.querySelector("[data-mdc-resultbar-slot]").innerHTML;
  const definition = getScoreDefinition("bishop");
  const result = definition.calculate({ dilation: 2, effacement: 2, station: 2, position: 2, consistency: 2 });
  assert.ok(bar.includes(result.interpretation.headline), "result headline shown");
  assert.ok(bar.includes("Save to patient"), "save action present");
});

test("tab switches toggle panes in place and refresh next-steps", () => {
  const { controller, container } = makeController();
  controller.render();
  openScore(controller, container, "bishop");
  fillBishop(controller, container);
  const formBefore = formOf(container, "bishop");
  assert.ok(controller.click(container.querySelector('[data-score-tab="next-steps"]')), "tab click handled");
  assert.equal(formOf(container, "bishop"), formBefore, "no rebuild on tab switch");
  const calcPane = container.querySelector('[data-mdc-pane="calculator"]');
  const nextPane = container.querySelector('[data-mdc-pane="next-steps"]');
  assert.equal(calcPane.hidden, true, "calculator pane hidden");
  assert.equal(nextPane.hidden, false, "next-steps pane shown");
  const tabButton = container.querySelector('[data-score-tab="next-steps"]');
  assert.ok(tabButton.classList.contains("is-active"), "tab button active");
  assert.equal(tabButton.getAttribute("aria-selected"), "true", "aria-selected updated");
  const definition = getScoreDefinition("bishop");
  const result = definition.calculate({ dilation: 2, effacement: 2, station: 2, position: 2, consistency: 2 });
  const bandText = definition.guide.nextSteps[result.interpretation.band];
  const needle = String(Array.isArray(bandText) ? bandText[0] : bandText).slice(0, 48);
  assert.ok(nextPane.innerHTML.includes(needle), "next-steps pane refreshed with band-specific guidance");
  assert.ok(controller.click(container.querySelector('[data-score-tab="calculator"]')), "switch back handled");
  assert.equal(container.querySelector('[data-mdc-pane="calculator"]').hidden, false, "calculator pane restored");
  assert.equal(formOf(container, "bishop"), formBefore, "still no rebuild");
});

test("favorite toggle patches the star in place", () => {
  const { controller, container } = makeController();
  controller.render();
  openScore(controller, container, "bishop");
  const formBefore = formOf(container, "bishop");
  const headerBefore = container.querySelector(".mdc-header");
  assert.ok(controller.click(container.querySelector("[data-score-fav]")), "favorite click handled");
  assert.equal(formOf(container, "bishop"), formBefore, "form not rebuilt");
  assert.equal(container.querySelector(".mdc-header"), headerBefore, "header not rebuilt");
  assert.ok(container.querySelector("[data-score-fav-slot]").innerHTML.includes("is-favorite"), "star fills");
  assert.ok(controller.click(container.querySelector("[data-score-fav]")), "unfavorite handled");
  assert.ok(!container.querySelector("[data-score-fav-slot]").innerHTML.includes("is-favorite"), "star unfills");
});

test("accordions toggle in place", () => {
  const { controller, container } = makeController();
  controller.render();
  openScore(controller, container, "bishop");
  const formBefore = formOf(container, "bishop");
  const button = container.querySelector('[data-mdc-acc="instructions"]');
  const panel = container.querySelector('[data-mdc-acc-panel="instructions"]');
  assert.equal(panel.hidden, true, "starts closed");
  assert.ok(controller.click(button), "accordion click handled");
  assert.equal(panel.hidden, false, "opens");
  assert.equal(button.getAttribute("aria-expanded"), "true", "aria-expanded updated");
  assert.equal(formOf(container, "bishop"), formBefore, "no rebuild");
  assert.ok(controller.click(button), "second click handled");
  assert.equal(panel.hidden, true, "closes again");
});

test("manual edit marks binding overridden; re-pull restores it in place", () => {
  const { controller, container } = makeController();
  controller.render();
  openScore(controller, container, "vbac-mfmu");
  const ageInput = container.querySelector('[data-score-input="ageYears"]');
  assert.equal(ageInput.value, "28", "binding pulled from patient");
  assert.ok(container.querySelector('[data-score-field="ageYears"]').innerHTML.includes(">from patient<"), "starts bound");
  ageInput.value = "35";
  controller.input(ageInput);
  assert.ok(
    container.querySelector('[data-score-field="ageYears"]').innerHTML.includes("score-binding-badge--edited"),
    "override shows edited badge"
  );
  assert.ok(controller.click(container.querySelector("[data-score-repull]")), "re-pull handled");
  const ageAfter = container.querySelector('[data-score-input="ageYears"]');
  assert.equal(ageAfter, ageInput, "input node identity preserved through re-pull");
  assert.equal(ageAfter.value, "28", "re-pull restores the bound value");
  assert.ok(container.querySelector('[data-score-field="ageYears"]').innerHTML.includes(">from patient<"), "badge restored");
  assert.ok(
    !container.querySelector('[data-score-field="ageYears"]').innerHTML.includes("score-binding-badge--edited"),
    "edited badge cleared"
  );
});

test("mode switch toggles field visibility in place", () => {
  const { controller, container } = makeController();
  controller.render();
  openScore(controller, container, "due-dates");
  const formBefore = formOf(container, "due-dates");
  assert.equal(container.querySelector('[data-score-field="egaWeeks"]').hidden, true, "EGA hidden in lmp mode");
  setRadio(controller, container, "due-dates", "mode", "ega-today");
  assert.equal(formOf(container, "due-dates"), formBefore, "no rebuild on mode switch");
  assert.equal(container.querySelector('[data-score-field="egaWeeks"]').hidden, false, "EGA shown");
  assert.equal(container.querySelector('[data-score-field="dateISO"]').hidden, true, "lmp date hidden");
  setRadio(controller, container, "due-dates", "mode", "lmp");
  assert.equal(container.querySelector('[data-score-field="egaWeeks"]').hidden, true, "EGA hidden again");
});

test("save patches only the result bar in place", async () => {
  let savedPatient = null;
  const { controller, container } = makeController(patient, {
    updateActivePatient: (vault, fn) => {
      savedPatient = fn({ id: "p1", savedScores: [] });
      return savedPatient;
    },
    persistVault: async () => {}
  });
  controller.render();
  openScore(controller, container, "bishop");
  fillBishop(controller, container);
  const formBefore = formOf(container, "bishop");
  assert.ok(controller.click(container.querySelector("[data-score-save]")), "save click handled");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(savedPatient && savedPatient.savedScores.length === 1, "record saved to patient");
  assert.equal(formOf(container, "bishop"), formBefore, "form untouched by save");
  assert.ok(
    container.querySelector("[data-mdc-resultbar-slot]").innerHTML.includes("Saved to patient"),
    "save state shown in the result bar"
  );
});

test("save failure surfaces retry state without rebuilding", async () => {
  const { controller, container } = makeController(patient, {
    updateActivePatient: (vault, fn) => fn({ id: "p1", savedScores: [] }),
    persistVault: async () => {
      throw new Error("vault locked");
    }
  });
  controller.render();
  openScore(controller, container, "bishop");
  fillBishop(controller, container);
  const formBefore = formOf(container, "bishop");
  assert.ok(controller.click(container.querySelector("[data-score-save]")), "save click handled");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(formOf(container, "bishop"), formBefore, "form untouched by failed save");
  assert.ok(
    container.querySelector("[data-mdc-resultbar-slot]").innerHTML.includes("Save failed"),
    "retry state shown in the result bar"
  );
});

test("switching patients resets calculator state", () => {
  const first = makeController(patient);
  first.controller.render();
  openScore(first.controller, first.container, "bishop");
  setRadio(first.controller, first.container, "bishop", "dilation", 2);
  assert.ok(formOf(first.container, "bishop"), "detail open");

  const other = { ...patient, id: "p2", displayLabel: "Other Patient" };
  const second = makeController(other);
  second.controller.render();
  assert.ok(second.container.querySelector('[data-score-open="bishop"]'), "new patient starts at home");
});

test("no patient shows the patient-required message", () => {
  const { controller, container } = makeController(null);
  controller.render();
  assert.ok(container.innerHTML.includes("select a patient"));
});

test("handlers ignore events when the scores view is not active", () => {
  const { app, controller } = makeController();
  app.view = "checklist";
  const inert = { dataset: {}, matches: () => false, closest: () => null };
  assert.equal(controller.click(inert), false);
  assert.equal(controller.change(inert), false);
  assert.equal(controller.input(inert), false);
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
  assert.ok(html.includes('data-mdc-pane="calculator"'), "calculator pane present");
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

test("mdc-opt is positioned: absolute radio input stays inside the label", () => {
  // Root-cause regression contract for the calculator "jumping" bug
  // (2026-09-27): .mdc-opt input is position:absolute + opacity:0. Without
  // position:relative on the label, the input's containing block escapes to
  // <body> and Chrome sizes it to a ~viewport-wide box hanging off-screen;
  // focusing it on label click then scrolls the page wildly. The label must
  // remain the containing block so the input's box is the label's box and
  // focus never moves scroll. Keyboard focus still reaches the real input
  // (no tabindex hacks), so this stays accessible.
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(here, "..", "styles.css"), "utf8");
  const match = css.match(/\.mdc-opt\s*\{([^}]*)\}/);
  assert.ok(match, ".mdc-opt rule exists in styles.css");
  assert.match(match[1], /position\s*:\s*relative/, ".mdc-opt must declare position: relative");
  const inputMatch = css.match(/\.mdc-opt\s+input\s*\{([^}]*)\}/);
  assert.ok(inputMatch, ".mdc-opt input rule exists in styles.css");
  assert.match(inputMatch[1], /position\s*:\s*absolute/, ".mdc-opt input stays absolutely positioned (invisible overlay)");
  assert.match(inputMatch[1], /opacity\s*:\s*0/, ".mdc-opt input stays invisible");
});

for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    throw error;
  }
}

console.log("score UI contract tests passed");
