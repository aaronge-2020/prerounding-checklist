// Drug Lookup view: interaction checker + indication lookup.
// The interaction checker loads the active patient's MAR automatically and
// runs the check without any taps. Rendered HTML only; all network and state
// live in controller.js. Event wiring uses the app's delegated data-action
// convention.

export function createDrugLookupPresentation({ escapeHtml, icon }) {
  function renderPrivacyNotice() {
    return `
      <p class="notice drug-lookup-privacy">
        ${icon("shield")}
        <span><strong>Your privacy:</strong> when this view opens with an active patient,
        their medication names are sent to the U.S. National Library of Medicine (for name
        matching) and the U.S. Food and Drug Administration (for label text). Only drug
        names — never patient details. If you are offline, the lookup will tell you
        instead of failing silently.</span>
      </p>`;
  }

  function renderDrugChips(drugs) {
    if (!drugs.length) return `<p class="muted">No medications on file for the active patient. Add a MAR or medication list in Hospital Stay, or add drugs below to check manually.</p>`;
    return `
      <ul class="drug-chip-list">
        ${drugs.map((drug, index) => `
          <li class="drug-chip">
            <span>${escapeHtml(drug.name || drug.input)}</span>
            ${drug.unresolved ? `<span class="drug-chip-flag">not recognized</span>` : ""}
            <button type="button" class="button--quiet" data-action="drug-lookup-remove" data-index="${index}" aria-label="Remove ${escapeHtml(drug.input)}">${icon("x")}</button>
          </li>`).join("")}
      </ul>`;
  }

  function renderSeverityBadge(severity) {
    const level = String(severity || "").toLowerCase();
    const label = level === "major" ? "Major" : level === "moderate" ? "Moderate" : level === "minor" ? "Minor" : "Unknown";
    return `<span class="severity-badge severity-badge--${level}">${label}</span>`;
  }

  function renderFindings(findings) {
    if (!findings.length) {
      return `
        <div class="notice">
          <strong>No known interactions found in DDInter 2.0.</strong>
          <p>DDInter 2.0 covers major and moderate interactions across 1,900+ drugs, but no
          database is complete. A pair not listed here is <em>not</em> proven safe.
          When in doubt, check with a pharmacist.</p>
        </div>`;
    }
    return `
      <ul class="interaction-list">
        ${findings.map((finding) => `
          <li class="interaction-card interaction-card--${String(finding.severity || "").toLowerCase()}">
            <div class="interaction-card-head">
              ${renderSeverityBadge(finding.severity)}
              <strong>${escapeHtml(finding.drugA)} + ${escapeHtml(finding.drugB)}</strong>
            </div>
            <p>${escapeHtml(finding.description)}</p>
            <p class="muted"><small>Source: ${escapeHtml(finding.source)}</small></p>
          </li>`).join("")}
      </ul>`;
  }

  function renderChecker(state) {
    const { drugs, busy, error, findings, checked, patientLabel } = state;
    const hasMeds = drugs.length > 0;
    return `
      <section class="card" aria-labelledby="drug-checker-heading">
        <h3 id="drug-checker-heading">Interaction checker</h3>
        ${hasMeds ? `<p class="muted">Checking ${drugs.length} medication${drugs.length === 1 ? "" : "s"}${patientLabel ? ` for <strong>${escapeHtml(patientLabel)}</strong>` : ""}, pulled automatically from the MAR on this device.</p>` : `
        <p class="muted">No medications on file — open a patient with a MAR, or add drugs below to check manually.</p>`}
        <p class="muted">Each drug is matched against RxNorm, then checked pairwise against
        DDInter 2.0 (major + moderate interactions).</p>
        ${renderDrugChips(drugs)}
        <div class="drug-add-row">
          <label class="visually-hidden" for="drugLookupInput">Add a drug manually</label>
          <input id="drugLookupInput" type="text" data-drug-lookup-input placeholder="Add another drug (e.g. warfarin)"
            autocomplete="off" ${busy ? "disabled" : ""}>
          <button type="button" data-action="drug-lookup-add" ${busy ? "disabled" : ""}>${icon("plus")} Add drug</button>
        </div>
        <div class="button-row">
          <button type="button" data-action="drug-lookup-check" ${busy || drugs.length < 2 ? "disabled" : ""}>${icon("check")} Check interactions</button>
          <button type="button" class="button--quiet" data-action="drug-lookup-recheck" ${busy ? "disabled" : ""}>${icon("refresh")} Re-check from MAR</button>
          <button type="button" class="button--quiet" data-action="drug-lookup-clear" ${busy || !drugs.length ? "disabled" : ""}>Clear</button>
        </div>
        ${error ? `<div class="model-selection-message model-selection-message--error" role="alert">${escapeHtml(error)}</div>` : ""}
        ${busy ? `<div class="model-selection-progress" aria-live="polite"><progress></progress><span>Looking up drugs…</span></div>` : ""}
        ${checked && !busy ? renderFindings(findings) : ""}
        <p class="muted"><small>Interaction data: ${escapeHtml(state.datasetSource || "")}</small></p>
      </section>`;
  }

  function renderIndications(state) {
    const lookup = state.indicationLookup;
    return `
      <section class="card" aria-labelledby="drug-indications-heading">
        <h3 id="drug-indications-heading">What is a drug approved for?</h3>
        <p class="muted">Type one drug name to see its FDA-approved uses and dosing, taken from the official drug label.</p>
        <div class="drug-add-row">
          <label class="visually-hidden" for="indicationLookupInput">Drug name</label>
          <input id="indicationLookupInput" type="text" data-indication-lookup-input placeholder="e.g. atorvastatin"
            autocomplete="off" ${lookup.busy ? "disabled" : ""}>
          <button type="button" data-action="drug-lookup-indications" ${lookup.busy ? "disabled" : ""}>
            ${lookup.busy ? "Looking up…" : `Look up indications`}
          </button>
        </div>
        ${lookup.error ? `<div class="model-selection-message model-selection-message--error" role="alert">${escapeHtml(lookup.error)}</div>` : ""}
        ${lookup.result ? `
          <div class="indication-result">
            <h4>${escapeHtml(lookup.result.brandName || lookup.result.genericName || lookup.query)}</h4>
            ${lookup.result.genericName && lookup.result.brandName ? `<p class="muted">Generic: ${escapeHtml(lookup.result.genericName)}</p>` : ""}
            ${lookup.result.indications ? `
              <p><strong>FDA-approved uses (from the label):</strong></p>
              <p class="indication-text">${escapeHtml(lookup.result.indications)}</p>
            ` : `<p class="muted">No indication text found on the label for this drug.</p>`}
            ${lookup.result.dosage ? `
              <p><strong>Dosing (from the label):</strong></p>
              <p class="indication-text">${escapeHtml(lookup.result.dosage)}</p>
            ` : ""}
            ${lookup.result.drugInteractions ? `
              <details class="indication-details">
                <summary>What the label says about interactions</summary>
                <p class="indication-text">${escapeHtml(lookup.result.drugInteractions)}</p>
              </details>
            ` : ""}
            <p class="muted"><small>Source: U.S. Food and Drug Administration drug label (openFDA).</small></p>
          </div>
        ` : lookup.searched && !lookup.busy ? `
          <p class="muted">No FDA label found for “${escapeHtml(lookup.query)}”. Check the spelling or try the generic name.</p>
        ` : ""}
      </section>`;
  }

  function renderDrugLookup(state) {
    return `
      <div class="drug-lookup">
        <div class="view-heading">
          <h2 id="drug-lookup-heading">Drug Lookup</h2>
          <p class="muted">Interaction check for the active patient's medications, plus FDA label lookup.
          Reference only — not a substitute for a pharmacist or clinical judgment.</p>
        </div>
        ${renderPrivacyNotice()}
        ${renderChecker(state)}
        ${renderIndications(state)}
      </div>`;
  }

  return { renderDrugLookup };
}
