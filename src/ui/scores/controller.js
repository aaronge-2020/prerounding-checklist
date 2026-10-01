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
  const state = { patientId: null, scoreId: null, values: {}, overridden: new Set(), savedFingerprint: null, tab: "calculator" };

  const FAVORITES_KEY = "prerounding.scoreFavorites.v1";
  // In-memory fallback for environments without localStorage (tests, SSR).
  const memoryFavorites = new Set();
  const hasLocalStorage = (() => {
    try {
      return typeof localStorage !== "undefined" && typeof localStorage.getItem === "function";
    } catch {
      return false;
    }
  })();

  function readFavorites() {
    if (!hasLocalStorage) return new Set(memoryFavorites);
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function toggleFavorite(scoreId) {
    const favorites = readFavorites();
    if (favorites.has(scoreId)) favorites.delete(scoreId);
    else favorites.add(scoreId);
    if (hasLocalStorage) {
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
      } catch {
        // Favorites are a nicety; ignore storage failures.
      }
    } else {
      memoryFavorites.clear();
      for (const id of favorites) memoryFavorites.add(id);
    }
    return favorites.has(scoreId);
  }

  async function shareScore(definition, result) {
    const headline = result?.complete ? result.interpretation?.headline : "incomplete";
    const text = `${definition.title}: ${headline}${definition.mdcalcUrl ? ` ${definition.mdcalcUrl}` : ""}`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: definition.title, text });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // User dismissed the share sheet or clipboard failed; nothing to do.
    }
  }

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
    state.tab = "calculator";
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
      if (binding.unit) {
        if (input.units) {
          // Only accept a pulled unit the input can actually display (e.g.
          // labs saved as "mg/dl" still map to the input's "mg/dL" option).
          // A unit the input does not offer leaves the default in place
          // instead of selecting a phantom option.
          const canonical = input.units.find(
            (unit) => String(unit).toLowerCase() === String(binding.unit).toLowerCase()
          );
          if (canonical) values[`${input.key}Unit`] = canonical;
        } else {
          values[`${input.key}Unit`] = binding.unit;
        }
      }
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

  // Escape for double-quoted attribute selectors (score ids/keys are
  // author-controlled, but never trust them in a selector).
  function escAttr(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  // Full model snapshot for the open calculator: data model only, no DOM.
  function detailModel() {
    const patient = active();
    if (!patient || !state.scoreId) return null;
    const definition = getDefinition(state.scoreId);
    if (!definition) return null;
    const bindings = bindingsForPatient();
    const values = effectiveValues(definition, bindings);
    const result = calculateResult(definition, values);
    return { definition, bindings, scoreBindings: bindings[definition.id] || {}, values, result };
  }

  function savedStateFor(definition, values, result) {
    const fingerprint = fingerprintFor(definition, values, result);
    if (fingerprint && state.savedFingerprint === fingerprint) return "saved";
    if (state.saveFailed) return "save-failed";
    return null;
  }

  // ---- surgical DOM updates ----
  // The detail view is built ONCE per calculator open (see render below).
  // Every interaction below only mutates the data model (state.values etc.)
  // and then patches the affected nodes in place. Nothing here replaces the
  // form's innerHTML, so scroll position, focus, caret, and accordion/tab
  // state all survive every keystroke and click. This is the root fix for
  // the view "jumping" while filling out a calculator.

  function detailContainer() {
    const container = byId("scoresContent");
    return container && typeof container.querySelector === "function" ? container : null;
  }

  // Result bar only: a small footer swap. Focus lives in the form above it,
  // never inside the bar, so this cannot steal focus or move scroll.
  function patchResultBar() {
    const container = detailContainer();
    const slot = container?.querySelector?.("[data-mdc-resultbar-slot]");
    const ctx = detailModel();
    if (!slot || !ctx) return;
    slot.innerHTML = presentation.renderResultBar({
      result: ctx.result,
      definition: ctx.definition,
      savedState: savedStateFor(ctx.definition, ctx.values, ctx.result)
    });
  }

  function patchRadioSelection(container, key) {
    const field = container.querySelector(`[data-score-field="${escAttr(key)}"]`);
    const labels = field?.querySelectorAll?.(".mdc-opt") || [];
    for (const label of labels) {
      const input = label.querySelector?.('input[type="radio"]');
      label.classList?.toggle?.("is-selected", !!(input && input.checked));
    }
  }

  function patchFieldVisibility(container, definition, mode) {
    for (const input of definition.inputs || []) {
      if (!input.modes) continue;
      const field = container.querySelector(`[data-score-field="${escAttr(input.key)}"]`);
      if (field) field.hidden = !input.modes.includes(mode);
    }
  }

  function patchBadge(container, definition, key, scoreBindings) {
    const field = container.querySelector(`[data-score-field="${escAttr(key)}"]`);
    const slot = field?.querySelector?.("[data-score-badge]");
    if (!slot) return;
    slot.innerHTML = presentation.renderBindingBadge(scoreBindings[key] || null, state.overridden.has(key));
  }

  // Push one field's DOM controls to the data-model values (re-pull path).
  function setFieldValue(container, definition, key, values, scoreBindings) {
    const input = (definition.inputs || []).find((entry) => entry.key === key);
    const field = container.querySelector(`[data-score-field="${escAttr(key)}"]`);
    if (!input || !field) return;
    const value = values[key];
    if (input.type === "radio") {
      const radios = field.querySelectorAll?.('input[type="radio"]') || [];
      for (const radio of radios) radio.checked = String(radio.value) === String(value ?? "");
      patchRadioSelection(container, key);
    } else if (input.type === "numberWithUnit") {
      const numberEl = field.querySelector?.("[data-score-input]");
      if (numberEl) numberEl.value = value ?? "";
      const unitEl = field.querySelector?.("[data-score-unit]");
      if (unitEl) unitEl.value = values[`${key}Unit`] ?? input.defaultUnit ?? input.units[0];
    } else {
      const el = field.querySelector?.("[data-score-input]");
      if (el) el.value = value ?? "";
    }
    patchBadge(container, definition, key, scoreBindings);
  }

  function patchFavoriteButton() {
    const container = detailContainer();
    const slot = container?.querySelector?.("[data-score-fav-slot]");
    const ctx = detailModel();
    if (!slot || !ctx) return;
    slot.innerHTML = presentation.renderFavoriteButton({
      definition: ctx.definition,
      isFavorite: readFavorites().has(ctx.definition.id)
    });
  }

  function refreshNextStepsPane() {
    const container = detailContainer();
    const pane = container?.querySelector?.('[data-mdc-pane="next-steps"]');
    const ctx = detailModel();
    if (!pane || !ctx) return;
    pane.innerHTML = presentation.renderNextStepsPane({ definition: ctx.definition, result: ctx.result });
  }

  function switchTab(nextTab) {
    const container = detailContainer();
    state.tab = nextTab;
    if (!container) {
      render();
      return;
    }
    for (const button of container.querySelectorAll("[data-score-tab]")) {
      const selected = button.dataset?.scoreTab === nextTab;
      button.classList?.toggle?.("is-active", selected);
      if (typeof button.setAttribute === "function") button.setAttribute("aria-selected", String(selected));
    }
    for (const pane of container.querySelectorAll("[data-mdc-pane]")) {
      pane.hidden = pane.dataset?.mdcPane !== nextTab;
    }
    if (nextTab === "next-steps") refreshNextStepsPane();
  }

  async function saveResult(definition, values, result) {
    const record = createSavedScoreRecord({ definition, result });
    if (!record || typeof updateActivePatient !== "function") return;
    const scoreId = definition.id;
    app.vault = updateActivePatient(app.vault, (patient) => ({
      ...patient,
      savedScores: appendSavedScore(patient.savedScores, record)
    }));
    state.savedFingerprint = fingerprintFor(definition, values, result);
    patchResultBar();
    if (typeof persistVault === "function") {
      try {
        await persistVault("Score saved to patient.");
      } catch {
        // The record is in the in-memory vault (a later save flushes it),
        // but don't claim success — let the student retry the save.
        state.savedFingerprint = null;
        state.saveFailed = true;
        if (state.scoreId === scoreId) patchResultBar();
      }
    }
  }

  // Full builds happen only on navigation: entering the view, switching
  // patients, opening a calculator, or going back to the list. Editing a
  // calculator never comes through here.
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
        savedState: savedStateFor(definition, values, result),
        tab: state.tab,
        isFavorite: readFavorites().has(definition.id)
      })
    );
  }

  function repullFromPatient() {
    state.values = {};
    state.overridden = new Set();
    state.savedFingerprint = null;
    state.saveFailed = false;
    const container = detailContainer();
    const ctx = detailModel();
    if (!ctx || !container) {
      render();
      return;
    }
    for (const input of ctx.definition.inputs || []) {
      setFieldValue(container, ctx.definition, input.key, ctx.values, ctx.scoreBindings);
    }
    patchFieldVisibility(container, ctx.definition, ctx.values.mode);
    patchResultBar();
  }

  function noteManualEdit(scoreId, key, bindings) {
    if (scoreId !== state.scoreId) return;
    if (bindings[scoreId]?.[key]) state.overridden.add(key);
  }

  // Every branch below updates the DATA MODEL first (state.values etc.)
  // and then patches only the affected nodes. The form is never rebuilt,
  // so typing/clicking cannot move scroll, drop focus, or reset the caret.
  function change(target) {
    if (!target || app.view !== "scores") return false;
    const scoreId = target.dataset?.scoreId;
    if (!scoreId || scoreId !== state.scoreId) return false;
    if (target.matches?.("[data-score-input]")) {
      const key = target.dataset.scoreInput;
      // Data model updates first; every patch below reads the fresh model.
      state.values[key] = target.value;
      state.savedFingerprint = null;
      state.saveFailed = false;
      noteManualEdit(scoreId, key, bindingsForPatient());
      const container = detailContainer();
      const ctx = detailModel();
      if (ctx && container) {
        if (target.type === "radio") patchRadioSelection(container, key);
        if (key === "mode") patchFieldVisibility(container, ctx.definition, ctx.values.mode);
        patchBadge(container, ctx.definition, key, ctx.scoreBindings);
        patchResultBar();
      }
      return true;
    }
    if (target.matches?.("[data-score-unit]")) {
      const key = target.dataset.scoreUnit;
      state.values[`${key}Unit`] = target.value;
      state.savedFingerprint = null;
      state.saveFailed = false;
      noteManualEdit(scoreId, key, bindingsForPatient());
      const container = detailContainer();
      const ctx = detailModel();
      if (ctx && container) {
        patchBadge(container, ctx.definition, key, ctx.scoreBindings);
        patchResultBar();
      }
      return true;
    }
    return false;
  }

  function input(target) {
    if (!target || app.view !== "scores") return false;
    const scoreId = target.dataset?.scoreId;
    if (!scoreId || scoreId !== state.scoreId) return false;
    if (!target.matches?.("[data-score-input]")) return false;
    // Keystrokes update the model and the result bar live. The input element
    // itself is never touched, so the caret never jumps mid-typing.
    const key = target.dataset.scoreInput;
    state.values[key] = target.value;
    state.savedFingerprint = null;
    state.saveFailed = false;
    noteManualEdit(scoreId, key, bindingsForPatient());
    const container = detailContainer();
    const ctx = detailModel();
    if (ctx && container) {
      if (target.type === "radio") patchRadioSelection(container, key);
      patchBadge(container, ctx.definition, key, ctx.scoreBindings);
      patchResultBar();
    }
    return true;
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
      state.tab = "calculator";
      render();
      return true;
    }
    if (target.closest?.("[data-score-back]")) {
      state.scoreId = null;
      state.values = {};
      state.overridden = new Set();
      state.savedFingerprint = null;
    state.saveFailed = false;
      state.tab = "calculator";
      render();
      return true;
    }
    const tabButton = target.closest?.("[data-score-tab]");
    if (tabButton && state.scoreId) {
      const nextTab = tabButton.dataset?.scoreTab;
      if (nextTab && nextTab !== state.tab) switchTab(nextTab);
      return true;
    }
    // Accordions toggle in place (no re-render) so open sections survive.
    const accButton = target.closest?.("[data-mdc-acc]");
    if (accButton) {
      const targetId = accButton.dataset?.mdcAcc;
      const root = accButton.closest(".mdc");
      const panel = targetId && root?.querySelector
        ? root.querySelector(`[data-mdc-acc-panel="${targetId}"]`)
        : null;
      if (panel) {
        const willOpen = panel.hasAttribute("hidden");
        if (willOpen) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "");
        accButton.setAttribute("aria-expanded", String(willOpen));
      }
      return true;
    }
    const favButton = target.closest?.("[data-score-fav]");
    if (favButton && state.scoreId) {
      toggleFavorite(state.scoreId);
      patchFavoriteButton();
      return true;
    }
    const shareButton = target.closest?.("[data-score-share]");
    if (shareButton && state.scoreId) {
      const definition = getDefinition(state.scoreId);
      if (definition) {
        const values = effectiveValues(definition, bindingsForPatient());
        const result = calculateResult(definition, values);
        void shareScore(definition, result);
      }
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
