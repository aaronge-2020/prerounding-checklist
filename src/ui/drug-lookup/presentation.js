// Drug Lookup view: interaction checker + indication lookup.
// Rendered HTML only; all network and state live in controller.js.
// Event wiring uses the app's delegated data-action convention.

export function createDrugLookupPresentation({ escapeHtml, icon }) {
  function renderPrivacyNotice() {
    return `
      <p class="notice drug-lookup-privacy">
        ${icon("shield")}
        <span><strong>Your privacy:</strong> nothing is sent anywhere until you tap
        “Check interactions” or “Look up indications”. When you do, only the drug
        names you typed are sent to the U.S. National Library of Medicine and the
        U.S. Food and Drug Administration for the lookup. Patient details are never
        included. If you are offline, the lookup will tell you instead of failing silently.</span>
      </p>`;
  }

  function renderDrugChips(drugs) {
    if (!drugs.length) return `<p class="muted">No drugs added yet.</p>`;
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
          <strong>No known interactions found in the high-priority list.</strong>
          <p>This list covers well-established, high-priority interactions only — it is not
          a complete drug database. A pair not listed here is <em>not</em> proven safe.
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
    const { drugs, busy, error, findings, checked } = state;
    return `
      <section class="card" aria-labelledby="drug-checker-heading">
        <h3 id="drug-checker-heading">Interaction checker</h3>
        <p class="muted">Add two or more drugs by name (brand or generic). Each is matched
        against RxNorm, then checked pairwise against a curated list of high-priority interactions.</p>
        <div class="drug-add-row">
          <label class="visually-hidden" for="drugLookupInput">Drug name</label>
          <input id="drugLookupInput" type="text" data-drug-lookup-input placeholder="e.g. warfarin, Lipitor"
            autocomplete="off" ${busy ? "disabled" : ""}>
          <button type="button" data-action="drug-lookup-add" ${busy ? "disabled" : ""}>${icon("plus")} Add drug</button>
        </div>
        ${renderDrugChips(drugs)}
        <div class="button-row">
          <button type="button" data-action="drug-lookup-check" ${busy || drugs.length < 2 ? "disabled" : ""}>
            ${busy ? "Checking…" : `Check interactions`}
          </button>
          <button type="button" class="button--quiet" data-action="drug-lookup-clear" ${busy || !drugs.length ? "disabled" : ""}>Clear</button>
        </div>
        ${state.patientMedsAvailable ? `
          <div class="button-row">
            <button type="button" class="button--transfer" data-action="drug-lookup-patient-meds" ${busy ? "disabled" : ""}>
              ${icon("clipboard")} Check my patient's meds
            </button>
          </div>
          <p class="muted"><small>Tapping this loads the active patient's medication list from this device
          into the checker above. Only the drug names are sent to NLM for matching — nothing else leaves the device.</small></p>
        ` : ""}
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
        <p class="muted">Type one drug name to see its FDA-approved uses, taken from the official drug label.</p>
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
          <p class="muted">Check drug interactions and look up what drugs are approved for.
          Reference only — not a substitute for a pharmacist or clinical judgment.</p>
        </div>
        ${renderPrivacyNotice()}
        ${renderChecker(state)}
        ${renderIndications(state)}
      </div>`;
  }

  return { renderDrugLookup };
}
