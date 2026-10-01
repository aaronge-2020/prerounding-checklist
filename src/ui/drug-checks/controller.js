// Controller for the Drug interaction checker view: a pasted medication
// list (or the active patient's medication captures) resolved to RxNorm
// concepts and checked pairwise against the on-device DDInter bundle.
//
// Privacy boundary: the medication list is in-memory only — it is never
// persisted to the vault, localStorage, or any other storage. The vault
// is read for "Use active patient's medications" only after the vault is
// unlocked, and the pasted text itself never leaves this controller state.
//
// The DDInter/RxNorm bundles are pure data modules; they are lazy-loaded
// via dynamic import() inside the check handler so the app shell never
// pays their parse cost until this view is actually used. Import failures
// fail closed with state.dataState === "error" — this controller never
// throws.
export function createDrugChecksController({
  app,
  byId,
  escapeHtml,
  render,
  vaultIsUnlocked,
  onCheckComplete
} = {}) {
  // Matches the cache-buster on the bundled data modules so the UI never
  // resolves against a stale bundle after a data refresh.
  const DRUG_DATA_TAG = "20261001-drug-data-v2";

  function dc() {
    if (!app.drugChecks) {
      app.drugChecks = {
        medInput: "",
        status: "",
        dataState: "idle", // idle | loading | ready | error
        dataError: "",
        result: null
      };
    }
    return app.drugChecks;
  }

  // The passed render() paints #drugChecksContent for this view.
  function renderView() {
    render();
  }

  function click(target) {
    const actionTarget = target?.closest?.("[data-action]");
    if (!actionTarget) return false;
    const action = actionTarget.dataset.action;
    if (action === "drug-checks-check") {
      void runCheck();
      return true;
    }
    if (action === "drug-checks-use-patient-meds") {
      usePatientMeds();
      return true;
    }
    if (action === "drug-checks-clear") {
      const state = dc();
      // In-memory only — nothing persisted, so clearing is just resetting.
      state.medInput = "";
      state.status = "";
      state.dataState = "idle";
      state.dataError = "";
      state.result = null;
      renderView();
      return true;
    }
    return false;
  }

  // Track the textarea value without re-rendering: a re-render would
  // destroy the element and drop focus/caret mid-typing.
  function input(target) {
    const el = target?.closest?.("#drugChecksInput");
    if (!el) return false;
    // In-memory only — never persisted (privacy boundary).
    dc().medInput = el.value;
    return true;
  }

  async function runCheck() {
    const state = dc();
    const lines = String(state.medInput || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) {
      state.status = "Enter at least one medication first.";
      renderView();
      return;
    }
    state.dataState = "loading";
    state.dataError = "";
    state.result = null;
    state.status = "Checking interactions on-device…";
    renderView();
    try {
      const { checkMedicationList, ddiBundleStatus } = await import(
        `../../drug-data/ddi-query.js?v=${DRUG_DATA_TAG}`
      );
      const { resolveMedicationConcepts } = await import(
        `../../drug-data/rxnorm-resolve.js?v=${DRUG_DATA_TAG}`
      );
      const resolvedLines = [];
      const unresolved = [];
      const rxcuis = [];
      const seen = new Set();
      for (const line of lines) {
        const concepts = resolveMedicationConcepts(line) || [];
        resolvedLines.push({
          text: line,
          concepts: concepts.map((concept) => ({
            rxcui: concept.rxcui,
            name: concept.name
          }))
        });
        if (!concepts.length) unresolved.push(line);
        // Dedup before the pairwise check: combination products and
        // repeated lines must not generate self-pairs or double counts.
        for (const concept of concepts) {
          const key = String(concept.rxcui || "");
          if (key && !seen.has(key)) {
            seen.add(key);
            rxcuis.push(key);
          }
        }
      }
      const summary = checkMedicationList(rxcuis);
      const bundle = ddiBundleStatus();
      state.result = {
        lines: resolvedLines,
        unresolved,
        summary: {
          medicationCount: summary.medicationCount,
          checkedPairs: summary.checkedPairs,
          interactions: (summary.interactions || []).map((hit) => ({
            rxcuiA: hit.rxcuiA,
            rxcuiB: hit.rxcuiB,
            severity: hit.severity,
            mechanisms: [...(hit.mechanisms || [])],
            drugNames: [...(hit.drugNames || [])]
          })),
          bundlePartial: summary.bundlePartial,
          bundleTag: summary.bundleTag
        },
        bundle: {
          canonicalPairs: bundle.canonicalPairs,
          source: bundle.source,
          attribution: bundle.attribution,
          partial: bundle.partial,
          groupsProcessed: bundle.groupsProcessed,
          groupsTotal: bundle.groupsTotal
        }
      };
      state.dataState = "ready";
      const n = summary.interactions.length;
      state.status = n
        ? `Checked ${summary.checkedPairs} pair${summary.checkedPairs === 1 ? "" : "s"} — ${n} interaction${n === 1 ? "" : "s"} found.`
        : `Checked ${summary.checkedPairs} pair${summary.checkedPairs === 1 ? "" : "s"} — no interactions in this database.`;
    } catch (error) {
      // Fail closed: the bundles are the only data source, so a load
      // failure is an error state, never a partial result.
      state.dataState = "error";
      state.dataError = error?.message || "The drug database failed to load.";
      state.status = "Couldn't load the drug database.";
      state.result = null;
    }
    renderView();
    // Notify the host (e.g. the guided demo) that a check finished and its
    // results are painted. Fires only after the final synchronous render, so
    // observers can rely on the DOM being current. `ok` is true only when a
    // result rendered — never on validation or data-load failures.
    if (typeof onCheckComplete === "function") {
      try {
        onCheckComplete(state.dataState === "ready" && Boolean(state.result));
      } catch {
        // Host notification must never break the check itself.
      }
    }
  }

  // Extract the drug name token from one deidentifiedText capture line.
  // Reference format (src/ui/demo/session.js, demo_medications):
  //   "[Scheduled Medications] aspirin — Dose: 81 mg | Route: PO | ..."
  // Generic fallback: strip a leading "[...]" tag, then take the text
  // before the first " —", "|" or ",".
  function extractMedName(rawLine) {
    let line = String(rawLine || "").trim();
    if (!line) return "";
    // Header-ish lines ("Medications", "Active medication regimens") are
    // capture labels, not drugs — skip them.
    if (/^(medications?|active medications?(\s+regimens?)?|medication list)$/i.test(line)) return "";
    const close = line.indexOf("]");
    if (close >= 0) line = line.slice(close + 1).trim();
    let cut = line.indexOf(" — ");
    if (cut < 0) cut = line.indexOf("—");
    if (cut >= 0) line = line.slice(0, cut);
    for (const delim of ["|", ","]) {
      const i = line.indexOf(delim);
      if (i >= 0) line = line.slice(0, i);
    }
    return line.trim();
  }

  function usePatientMeds() {
    const state = dc();
    if (typeof vaultIsUnlocked === "function" && !vaultIsUnlocked()) {
      state.status = "Unlock the vault first.";
      renderView();
      return;
    }
    const patient = app.vault?.patients?.[app.vault?.activePatientId];
    const days = Array.isArray(patient?.days) ? patient.days : [];
    const meds = [];
    const seen = new Set();
    for (const day of days) {
      const captures = Array.isArray(day?.sourceCaptures) ? day.sourceCaptures : [];
      for (const capture of captures) {
        if (capture?.sourceKind !== "medication_activity") continue;
        const text = String(capture?.deidentifiedText || "");
        for (const rawLine of text.split("\n")) {
          const name = extractMedName(rawLine);
          if (!name) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          meds.push(name);
        }
      }
    }
    if (!meds.length) {
      state.status = "No medication captures found for the active patient.";
    } else {
      // In-memory only — never persisted to the vault or storage
      // (privacy boundary).
      state.medInput = meds.join("\n");
      const label = String(patient?.displayLabel || "Active patient");
      state.status = `Filled ${meds.length} medication${meds.length === 1 ? "" : "s"} from ${label}. Review the list, then Check interactions.`;
    }
    renderView();
  }

  return { render: renderView, click, input };
}
