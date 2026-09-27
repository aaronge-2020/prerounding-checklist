// Controller for the MD Calc tab: owns calculator selection, input values,
// patient bindings and rendering. All scoring math lives in
// src/clinical-scores/ (pure); all markup in ./presentation.js (pure).
// This module touches the DOM only through the injected byId /
// replaceViewContent helpers, like the other feature controllers.
import { getScoreDefinition, listScoreDefinitions } from "../../clinical-scores/index.js";
import { getAiModelDefinition, listAiModelDefinitions } from "../../ai-models/index.js";
import { resolveScoreBindings } from "../../clinical-scores/patient-bindings.js";
import { appendSavedScore, createSavedScoreRecord } from "../../clinical-scores/saved-scores.js";
import { createScoresPresentation } from "./presentation.js";

function localTodayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function createScoresController({
  app,
  active,
  byId,
  escapeHtml,
  replaceViewContent,
  patientRequiredMessage,
  selectedDayId,
  persistVault,
  updateActivePatient
}) {
  const presentation = createScoresPresentation({ escapeHtml });
  const state = { patientId: null, scoreId: null, values: {}, overridden: new Set(), savedFingerprint: null };

  // Clinical calculators (MDCalc mirrors) plus native AI models.
  function listAllDefinitions() {
    return [...listScoreDefinitions(), ...listAiModelDefinitions()];
  }

  function getDefinition(id) {
    return getScoreDefinition(id) || getAiModelDefinition(id);
  }

  function resetForPatient(patientId) {
    state.patientId = patientId;
    state.scoreId = null;
    state.values = {};
    state.overridden = new Set();
    state.savedFingerprint = null;
    state.saveFailed = false;
  }

  function bindingsForPatient() {
    const patient = active();
    if (!patient) return {};
    try {
      return resolveScoreBindings(patient, selectedDayId());
    } catch {
      return {};
    }
  }

  // Merged view of defaults <- patient bindings <- manual entries.
  function effectiveValues(definition, bindings) {
    const values = {};
    const scoreBindings = bindings[definition.id] || {};
    for (const input of definition.inputs || []) {
      if (input.defaultValue !== undefined) values[input.key] = input.defaultValue;
      if (input.type === "numberWithUnit") values[`${input.key}Unit`] = input.defaultUnit || input.units[0];
    }
    const mode = state.values.mode ?? values.mode;
    for (const input of definition.inputs || []) {
      const binding = scoreBindings[input.key];
      if (!binding || state.overridden.has(input.key)) continue;
      if (binding && input.pull?.modes && mode && !input.pull.modes.includes(mode)) continue;
      values[input.key] = binding.value;
      if (binding.unit) values[`${input.key}Unit`] = binding.unit;
    }
    for (const [key, value] of Object.entries(state.values)) values[key] = value;
    return values;
  }

  function calculateResult(definition, values) {
    try {
      if (definition.id === "due-dates") {
        return definition.calculate({ ...values, todayISO: values.todayISO || localTodayISO() });
      }
      return definition.calculate(values);
    } catch {
      return null;
    }
  }

  // Identifies the exact on-screen result, so the "Saved to patient" state
  // clears as soon as any input changes.
  function fingerprintFor(definition, values, result) {
    if (!definition || !result || result.complete === false) return null;
    return `${definition.id}|${result.interpretation?.headline || ""}|${JSON.stringify(values)}`;
  }

  async function saveResult(definition, values, result) {
    const record = createSavedScoreRecord({ definition, result });
    if (!record || typeof updateActivePatient !== "function") return;
    app.vault = updateActivePatient(app.vault, (patient) => ({
      ...patient,
      savedScores: appendSavedScore(patient.savedScores, record)
    }));
    state.savedFingerprint = fingerprintFor(definition, values, result);
    render();
    if (typeof persistVault === "function") {
      try {
        await persistVault("Score saved to patient.");
      } catch {
        // The record is in the in-memory vault (a later save flushes it),
        // but don't claim success — let the student retry the save.
        state.savedFingerprint = null;
        state.saveFailed = true;
        render();
      }
    }
  }

  function render() {
    const patient = active();
    const container = byId("scoresContent");
    if (!container) return;
    if (!patient) {
      replaceViewContent(container, patientRequiredMessage());
      return;
    }
    if (state.patientId !== patient.id) resetForPatient(patient.id);
    const definitions = listAllDefinitions();
    const patientLabel = patient.displayLabel || "this patient";
    if (!state.scoreId) {
      replaceViewContent(container, presentation.renderScoresHome({ definitions, patientLabel }));
      return;
    }
    const definition = getDefinition(state.scoreId);
    if (!definition) {
      state.scoreId = null;
      replaceViewContent(container, presentation.renderScoresHome({ definitions, patientLabel }));
      return;
    }
    const bindings = bindingsForPatient();
    const values = effectiveValues(definition, bindings);
    const result = calculateResult(definition, values);
    const scoreBindings = bindings[definition.id] || {};
    const fingerprint = fingerprintFor(definition, values, result);
    const savedState = fingerprint && state.savedFingerprint === fingerprint
      ? "saved"
      : state.saveFailed ? "save-failed" : null;
    replaceViewContent(
      container,
      presentation.renderScoreDetail({
        definition,
        values,
        bindings: scoreBindings,
        overriddenKeys: state.overridden,
        result,
        patientLabel,
        mode: values.mode,
        hasBindings: Object.keys(scoreBindings).length > 0,
        savedState
      })
    );
  }

  function repullFromPatient() {
    state.values = {};
    state.overridden = new Set();
    state.savedFingerprint = null;
    state.saveFailed = false;
    render();
  }

  function noteManualEdit(scoreId, key, bindings) {
    if (scoreId !== state.scoreId) return;
    if (bindings[scoreId]?.[key]) state.overridden.add(key);
  }

  // Focus stewardship: render() replaces the whole calculator form, which
  // would drop keyboard focus to <body> on every change event — breaking
  // Tab navigation and arrow-key movement through radio groups. Capture the
  // focused control before rendering and re-focus its equivalent afterwards.
  function describeFocusable(el) {
    if (!el || !el.matches) return null;
    const scoreId = el.dataset?.scoreId;
    if (!scoreId) return null;
    if (el.matches("[data-score-input]")) {
      return { scoreId, kind: "input", key: el.dataset.scoreInput, value: el.value, type: el.type };
    }
    if (el.matches("[data-score-unit]")) {
      return { scoreId, kind: "unit", key: el.dataset.scoreUnit };
    }
    return null;
  }

  function restoreFocus(container, desc) {
    if (!container || !desc || desc.scoreId !== state.scoreId) return;
    const attr = desc.kind === "unit" ? "data-score-unit" : "data-score-input";
    const selector = `[data-score-id="${CSS.escape(desc.scoreId)}"][${attr}="${CSS.escape(desc.key)}"]`;
    const candidates = Array.from(container.querySelectorAll(selector));
    if (!candidates.length) return;
    let el = candidates[0];
    if (desc.type === "radio") {
      el = candidates.find((c) => c.value === desc.value) || el;
    }
    if (typeof el.focus === "function") el.focus({ preventScroll: true });
  }

  function renderPreservingFocus() {
    const container = byId("scoresContent");
    const active = typeof document !== "undefined" ? document.activeElement : null;
    const desc = container && active && container.contains(active) ? describeFocusable(active) : null;
    render();
    restoreFocus(container, desc);
  }

  // change events on text/number/date inputs fire during blur (Tab, click
  // away), so a synchronous render would run while the browser is still
  // moving focus to the next control — destroying its target mid-flight.
  // Deferring one frame lets the focus shift complete first, then we re-focus
  // the equivalent control in the fresh DOM. Radios/selects keep focus on
  // the changed control, so they render synchronously. Coalesced so rapid
  // changes render once.
  let renderQueued = false;
  function scheduleRenderPreservingFocus() {
    if (renderQueued) return;
    renderQueued = true;
    const schedule = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 0);
    schedule(() => {
      renderQueued = false;
      renderPreservingFocus();
    });
  }

  function renderAfterChange(target) {
    const active = typeof document !== "undefined" ? document.activeElement : null;
    const textLike = !!target && (target.type === "number" || target.type === "date" || target.type === "text");
    if (!active || (active === target && !textLike)) {
      renderPreservingFocus();
    } else {
      scheduleRenderPreservingFocus();
    }
  }

  function change(target) {
    if (!target || app.view !== "scores") return false;
    const scoreId = target.dataset?.scoreId;
    if (target.matches?.("[data-score-input]") && scoreId) {
      const key = target.dataset.scoreInput;
      state.values[key] = target.value;
      state.savedFingerprint = null;
    state.saveFailed = false;
      noteManualEdit(scoreId, key, bindingsForPatient());
      renderAfterChange(target);
      return true;
    }
    if (target.matches?.("[data-score-unit]") && scoreId) {
      state.values[`${target.dataset.scoreUnit}Unit`] = target.value;
      state.savedFingerprint = null;
    state.saveFailed = false;
      noteManualEdit(scoreId, target.dataset.scoreUnit, bindingsForPatient());
      renderAfterChange(target);
      return true;
    }
    return false;
  }

  function input(target) {
    if (!target || app.view !== "scores") return false;
    const scoreId = target.dataset?.scoreId;
    // Typing in number/date fields updates state silently so re-rendering
    // never steals focus mid-keystroke; the result refreshes on change.
    if (target.matches?.("[data-score-input]") && scoreId && (target.type === "number" || target.type === "date")) {
      state.values[target.dataset.scoreInput] = target.value;
      state.savedFingerprint = null;
    state.saveFailed = false;
      noteManualEdit(scoreId, target.dataset.scoreInput, bindingsForPatient());
      return true;
    }
    return false;
  }

  function click(target) {
    if (!target || app.view !== "scores") return false;
    const openButton = target.closest?.("[data-score-open]");
    if (openButton) {
      const openId = openButton.dataset.scoreOpen;
      if (openId === "__local_llm__" || openId === "__local_llm_parser__") {
        const navButton = document.querySelector('[data-view-target="localAi"]');
        if (navButton) navButton.click();
        return true;
      }
      state.scoreId = openId;
      state.values = {};
      state.overridden = new Set();
      state.savedFingerprint = null;
    state.saveFailed = false;
      render();
      return true;
    }
    if (target.closest?.("[data-score-back]")) {
      state.scoreId = null;
      state.values = {};
      state.overridden = new Set();
      state.savedFingerprint = null;
    state.saveFailed = false;
      render();
      return true;
    }
    if (target.closest?.("[data-score-repull]")) {
      repullFromPatient();
      return true;
    }
    const saveButton = target.closest?.("[data-score-save]");
    if (saveButton && state.scoreId) {
      const definition = getDefinition(state.scoreId);
      if (definition) {
        const values = effectiveValues(definition, bindingsForPatient());
        const result = calculateResult(definition, values);
        void saveResult(definition, values, result).catch(() => {});
      }
      return true;
    }
    return false;
  }

  return { render, change, input, click };
}
