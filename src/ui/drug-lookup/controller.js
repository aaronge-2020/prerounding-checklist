// Drug Lookup controller: owns view state and orchestrates RxNav + openFDA
// lookups. Nothing leaves the device until the user taps a lookup button;
// only typed drug names are ever sent, never patient context.

import {
  resolveDrug,
  fetchLabel,
  checkPairs
} from "./api.js?v=20260929-drug-lookup-v1";
import { DDI_PAIRS, DDI_DATASET_VERSION, DDI_DATASET_SOURCE } from "./interactions-data.js?v=20260929-drug-lookup-v1";

export function createDrugLookupController({ presentation, render, setStatus, getPatientMedicationNames, fetchImpl }) {
  const fetchFn = fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);

  const state = {
    drugs: [],
    busy: false,
    error: "",
    findings: [],
    checked: false,
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

  function addDrug(raw) {
    const input = String(raw || "").trim();
    if (!input) return;
    if (state.drugs.some((d) => d.input.toLowerCase() === input.toLowerCase())) {
      setStatus(`“${input}” is already in the list.`);
      return;
    }
    state.drugs.push({ input, name: "", rxcui: null, ingredientRxcuis: [], unresolved: false, pending: true });
    state.checked = false;
    render();
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
        // Resolve each drug name via RxNav (exact, then approximate).
        const result = await resolveDrug(fetchFn, drug.input);
        Object.assign(drug, result, { pending: false });
        if (result.unresolved || !result.rxcui) unresolved.push(drug.input);
        else resolved.push(drug);
      }
      state.findings = checkPairs(resolved, DDI_PAIRS);
      state.checked = true;
      if (unresolved.length) {
        state.error = `Could not recognize: ${unresolved.join(", ")}. Those were left out of the check — check the spelling or try the generic name.`;
      }
      setStatus(
        state.findings.length
          ? `Check complete: ${state.findings.length} interaction${state.findings.length === 1 ? "" : "s"} found.`
          : "Check complete: no known interactions in the high-priority list."
      );
    } catch (error) {
      state.error = networkErrorMessage(error);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function loadPatientMeds() {
    if (state.busy || typeof getPatientMedicationNames !== "function") return;
    const names = getPatientMedicationNames() || [];
    if (!names.length) {
      setStatus("No medications found for the active patient. Paste a MAR or medication list in Hospital Stay first.");
      return;
    }
    state.drugs = [];
    state.checked = false;
    state.error = "";
    for (const name of names) {
      const input = String(name || "").trim();
      if (input && !state.drugs.some((d) => d.input.toLowerCase() === input.toLowerCase())) {
        state.drugs.push({ input, name: "", rxcui: null, ingredientRxcuis: [], unresolved: false, pending: true });
      }
    }
    setStatus(`${state.drugs.length} medication${state.drugs.length === 1 ? "" : "s"} loaded from the active patient. Tap “Check interactions” when ready — only these drug names will be sent.`);
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
      if (!lookup.result) {
        lookup.error = "";
      }
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
        render();
      }
      return true;
    }
    if (action === "drug-lookup-clear") {
      state.drugs = [];
      state.findings = [];
      state.checked = false;
      state.error = "";
      render();
      return true;
    }
    if (action === "drug-lookup-check") {
      void checkInteractions();
      return true;
    }
    if (action === "drug-lookup-patient-meds") {
      void loadPatientMeds();
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
      patientMedsAvailable: typeof getPatientMedicationNames === "function"
    };
  }

  function renderView() {
    return presentation.renderDrugLookup(getState());
  }

  return { click, getState, renderView };
}
