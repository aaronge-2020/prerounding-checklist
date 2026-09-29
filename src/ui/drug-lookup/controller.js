// Drug Lookup controller: owns view state and orchestrates RxNav + openFDA
// lookups. When the view opens with an active patient, their medication names
// are loaded automatically from the on-device MAR and the interaction check
// runs without any taps. Only drug names are ever sent to NLM/FDA — never
// patient context.

import {
  resolveDrug,
  fetchLabel,
  checkPairs
} from "./api.js?v=20260929-ddinter-v2";
import { DDI_LOOKUP, DDI_DATASET_VERSION, DDI_DATASET_SOURCE } from "./interactions-data.js?v=20260929-ddinter-v2";

export function createDrugLookupController({ presentation, render, setStatus, getPatientMedicationNames, getActivePatientLabel, fetchImpl }) {
  const fetchFn = fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);

  const state = {
    drugs: [],
    busy: false,
    error: "",
    findings: [],
    checked: false,
    autoLoadedFor: null,
    patientLabel: "",
    datasetSource: `${DDI_DATASET_SOURCE} (dataset ${DDI_DATASET_VERSION})`,
    indicationLookup: { query: "", busy: false, error: "", result: null, searched: false }
  };

  function networkErrorMessage(error) {
    if (error instanceof TypeError) {
      return "Could not reach the drug reference service. Check your connection and try again — nothing was sent.";
    }
    return error instanceof Error ? error.message : "The lookup failed. Try again.";
  }

  function readInput(selector) {
    const el = typeof document !== "undefined" ? document.querySelector(selector) : null;
    return el ? el.value : "";
  }

  function setDrugsFromNames(names) {
    state.drugs = [];
    const seen = new Set();
    for (const raw of names || []) {
      const input = String(raw || "").trim();
      if (!input) continue;
      const key = input.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      state.drugs.push({ input, name: "", rxcui: null, ingredientRxcuis: [], unresolved: false, pending: true });
    }
  }

  async function checkInteractions() {
    if (state.drugs.length < 2 || state.busy) return;
    if (!fetchFn) {
      state.error = "Lookups need a network connection, which is not available here.";
      render();
      return;
    }
    state.busy = true;
    state.error = "";
    state.findings = [];
    render();
    try {
      const resolved = [];
      const unresolved = [];
      for (const drug of state.drugs) {
        const result = await resolveDrug(fetchFn, drug.input);
        Object.assign(drug, result, { pending: false });
        if (result.unresolved || !result.rxcui) unresolved.push(drug.input);
        else resolved.push(drug);
      }
      state.findings = checkPairs(resolved, DDI_LOOKUP);
      state.checked = true;
      if (unresolved.length) {
        state.error = `Could not recognize: ${unresolved.join(", ")}. Those were left out of the check — check the spelling or try the generic name.`;
      }
      setStatus(
        state.findings.length
          ? `Check complete: ${state.findings.length} interaction${state.findings.length === 1 ? "" : "s"} found.`
          : "Check complete: no known interactions in DDInter 2.0 for these drugs."
      );
    } catch (error) {
      state.error = networkErrorMessage(error);
    } finally {
      state.busy = false;
      render();
    }
  }

  // Auto-load: called by app.js when the view renders. Idempotent per
  // medication list — if the MAR hasn't changed since the last auto-load,
  // this is a no-op. Runs the interaction check automatically.
  function ensureAutoLoaded() {
    if (typeof getPatientMedicationNames !== "function") return;
    const names = getPatientMedicationNames() || [];
    const key = names.map((n) => String(n || "").trim().toLowerCase()).filter(Boolean).sort().join("|");
    if (state.autoLoadedFor === key) return;
    state.autoLoadedFor = key;
    if (typeof getActivePatientLabel === "function") {
      try {
        state.patientLabel = getActivePatientLabel() || "";
      } catch {
        state.patientLabel = "";
      }
    }
    if (!names.length) {
      // No meds: clear and show empty state, don't run a check.
      state.drugs = [];
      state.findings = [];
      state.checked = false;
      state.error = "";
      return;
    }
    setDrugsFromNames(names);
    state.checked = false;
    state.error = "";
    // Run the check in the background; render() is called by checkInteractions.
    void checkInteractions();
  }

  function addDrug(raw) {
    const input = String(raw || "").trim();
    if (!input) return;
    if (state.drugs.some((d) => d.input.toLowerCase() === input.toLowerCase())) {
      setStatus(`“${input}” is already in the list.`);
      return;
    }
    state.drugs.push({ input, name: "", rxcui: null, ingredientRxcuis: [], unresolved: false, pending: true });
    state.checked = false;
    // Manual adds invalidate the auto-load key so a re-render doesn't wipe them.
    state.autoLoadedFor = "__manual__";
    render();
  }

  async function lookupIndications() {
    const lookup = state.indicationLookup;
    const query = readInput("[data-indication-lookup-input]").trim();
    if (!query || lookup.busy) return;
    if (!fetchFn) {
      lookup.error = "Lookups need a network connection, which is not available here.";
      render();
      return;
    }
    lookup.query = query;
    lookup.busy = true;
    lookup.error = "";
    lookup.result = null;
    lookup.searched = false;
    render();
    try {
      lookup.result = await fetchLabel(fetchFn, query);
      lookup.searched = true;
    } catch (error) {
      lookup.error = networkErrorMessage(error);
    } finally {
      lookup.busy = false;
      render();
    }
  }

  function click(target) {
    const actionTarget = target.closest?.("[data-action]");
    if (!actionTarget) return false;
    const action = actionTarget.dataset.action;
    if (action === "drug-lookup-add") {
      addDrug(readInput("[data-drug-lookup-input]"));
      const input = typeof document !== "undefined" ? document.querySelector("[data-drug-lookup-input]") : null;
      if (input) input.value = "";
      return true;
    }
    if (action === "drug-lookup-remove") {
      const index = Number.parseInt(actionTarget.dataset.index || "", 10);
      if (Number.isInteger(index) && index >= 0 && index < state.drugs.length) {
        state.drugs.splice(index, 1);
        state.checked = false;
        state.autoLoadedFor = "__manual__";
        render();
      }
      return true;
    }
    if (action === "drug-lookup-clear") {
      state.drugs = [];
      state.findings = [];
      state.checked = false;
      state.error = "";
      state.autoLoadedFor = "__manual__";
      render();
      return true;
    }
    if (action === "drug-lookup-recheck") {
      state.autoLoadedFor = null;
      ensureAutoLoaded();
      render();
      return true;
    }
    if (action === "drug-lookup-indications") {
      void lookupIndications();
      return true;
    }
    return false;
  }

  function getState() {
    return {
      ...state,
      hasPatient: typeof getPatientMedicationNames === "function"
    };
  }

  function renderView() {
    return presentation.renderDrugLookup(getState());
  }

  return { click, getState, renderView, ensureAutoLoaded };
}
