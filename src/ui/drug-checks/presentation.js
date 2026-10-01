// Pure markup for the Drug interaction checker view: a medication list the
// student pastes or pulls from the active patient's medication captures,
// resolved to RxNorm concepts and checked against the on-device DDInter
// bundle. State is passed in; DOM events, resolution, and the lookup live
// in src/ui/drug-checks/controller.js. Nothing is sent anywhere — both
// bundles are vendored, and every message says so.
export function createDrugChecksPresentation({ escapeHtml }) {
  const SEVERITIES = ["major", "moderate", "minor", "unknown"];

  function severityClass(severity) {
    const s = String(severity || "").trim().toLowerCase();
    return `dc-sev-${SEVERITIES.includes(s) ? s : "unknown"}`;
  }

  const MECH_CATEGORY_LABELS = {
    absorption: "Absorption",
    distribution: "Distribution",
    metabolism: "Metabolism",
    excretion: "Excretion",
    synergistic_effect: "Synergistic effect",
    antagonistic_effect: "Antagonistic effect",
    others: "Other mechanism"
  };

  function prettyCategory(c) {
    const key = String(c || "").trim();
    return MECH_CATEGORY_LABELS[key] || key.replace(/_/g, " ");
  }

  function renderStatus(state) {
    const text = String(state.status || "").trim();
    if (!text) return `<p class="dc-status" role="status" aria-live="polite"></p>`;
    return `<p class="dc-status" role="status" aria-live="polite">${escapeHtml(text)}</p>`;
  }

  function renderError(state) {
    const detail = String(state.dataError || "The drug database failed to load.").trim();
    return `
      <div class="dc-alert" role="alert">
        <strong>Drug database unavailable.</strong>
        <p>${escapeHtml(detail)}</p>
        <p>Check the connection once (the data bundles are downloaded on first use), then try again.</p>
      </div>`;
  }

  function renderConcepts(concepts) {
    return (concepts || [])
      .map((c) => `${escapeHtml(c.name || "")} <span class="dc-rxcui">RxCUI ${escapeHtml(c.rxcui || "")}</span>`)
      .join(", ");
  }

  function renderResolutionLines(state) {
    const result = state.result || {};
    const lines = Array.isArray(result.lines) ? result.lines : [];
    if (!lines.length) return "";
    const items = lines
      .map((line) => {
        const text = String(line.text || "");
        const concepts = Array.isArray(line.concepts) ? line.concepts : [];
        if (!concepts.length) {
          return `<li class="dc-res-line is-unrec"><span class="dc-res-src">${escapeHtml(text)}</span> <span class="dc-unrec">Not recognized — excluded from checking</span></li>`;
        }
        return `<li class="dc-res-line"><span class="dc-res-src">${escapeHtml(text)}</span><span class="dc-res-arrow" aria-hidden="true">→</span><span class="dc-res-target">${renderConcepts(concepts)}</span></li>`;
      })
      .join("");
    return `
      <section class="dc-sec" aria-label="Medication resolution">
        <h3 class="dc-sec-title">Resolved medications</h3>
        <ul class="dc-resolve">${items}</ul>
      </section>`;
  }

  function renderInteractionCard(interaction) {
    const names = Array.isArray(interaction.drugNames) && interaction.drugNames.length
      ? interaction.drugNames
      : [interaction.rxcuiA, interaction.rxcuiB];
    const heading = names.map((n) => escapeHtml(String(n || ""))).join(" + ");
    const severity = String(interaction.severity || "Unknown");
    const mechanisms = (interaction.mechanisms || [])
      .map((m) => `<li>${escapeHtml(String(m || ""))}</li>`)
      .join("");
    const categories = (interaction.mechanismCategories || [])
      .map((c) => `<span class="dc-mech-cat">${escapeHtml(prettyCategory(c))}</span>`)
      .join("");
    return `
      <article class="dc-card dc-interaction-card">
        <div class="dc-card-head">
          <h4>${heading}</h4>
          <span class="dc-badge ${severityClass(severity)}">${escapeHtml(severity)}</span>
        </div>
        ${mechanisms ? `<ul class="dc-mech">${mechanisms}</ul>` : `<p class="dc-mech-none">No mechanism text in the database entry.</p>`}
        ${categories ? `<p class="dc-mech-cats" aria-label="Mechanism categories">${categories}</p>` : ""}
        <p class="dc-caveat">No interaction found means &ldquo;not in this database&rdquo; &mdash; never &ldquo;proven safe.&rdquo;</p>
      </article>`;
  }

  function renderInteractions(state) {
    const result = state.result || {};
    const summary = result.summary || {};
    const interactions = Array.isArray(summary.interactions) ? summary.interactions : [];
    const medicationCount = Number(summary.medicationCount || 0);
    const checkedPairs = Number(summary.checkedPairs || 0);
    const cards = interactions.map(renderInteractionCard).join("");
    const empty = !interactions.length
      ? `<p class="dc-none">No interactions found in this database. This means &ldquo;not in this bundle&rdquo; &mdash; never &ldquo;proven safe.&rdquo;</p>`
      : "";
    return `
      <section class="dc-sec" aria-label="Interaction results">
        <h3 class="dc-sec-title">Interactions</h3>
        <p class="dc-summary">${medicationCount} medication${medicationCount === 1 ? "" : "s"} resolved · ${checkedPairs} pair${checkedPairs === 1 ? "" : "s"} checked · ${interactions.length} interaction${interactions.length === 1 ? "" : "s"} found</p>
        ${cards}${empty}
      </section>`;
  }

  function renderFooter(state) {
    const bundle = (state.result && state.result.bundle) || {};
    const pairs = Number(bundle.canonicalPairs || 0);
    const coverage = pairs > 0 ? `${pairs.toLocaleString()} interaction pairs` : "interaction data";
    const source = String(bundle.source || "DDInter 2.0");
    const attribution = String(bundle.attribution || "").trim();
    const partial = bundle.partial
      ? `<p>Coverage is incomplete (${Number(bundle.groupsProcessed || 0).toLocaleString()} of ${Number(bundle.groupsTotal || 0).toLocaleString()} groups loaded) &mdash; a missing interaction means &ldquo;not in this database&rdquo;, never &ldquo;proven safe&rdquo;.</p>`
      : "";
    return `
      <footer class="dc-foot">
        <p>${escapeHtml(coverage)} · ${escapeHtml(source)}</p>
        ${attribution ? `<p>${escapeHtml(attribution)}</p>` : ""}
        <p>Drug names resolved with RxNorm (U.S. National Library of Medicine).</p>
        ${partial}
      </footer>`;
  }

  function renderResults(state) {
    if (state.dataState === "error") return renderError(state);
    if (state.dataState !== "ready" || !state.result) return "";
    return `
      <div class="dc-results">
        ${renderResolutionLines(state)}
        ${renderInteractions(state)}
        ${renderFooter(state)}
      </div>`;
  }

  function renderDrugChecks({ state } = {}) {
    const s = state || {};
    const medInput = String(s.medInput || "");
    const loading = s.dataState === "loading";
    return `
      <div class="dc-wrap">
        <header class="dc-head">
          <h2>Drug interaction checker</h2>
          <p class="dc-privacy">Runs fully on-device. Medication names never leave your browser.</p>
        </header>
        <label class="dc-label" for="drugChecksInput">Medications to check</label>
        <textarea
          id="drugChecksInput"
          class="dc-input"
          rows="6"
          placeholder="One medication per line, e.g. warfarin 5 mg PO daily"
          aria-label="Medications to check, one per line"
        >${escapeHtml(medInput)}</textarea>
        <div class="dc-actions">
          <button type="button" class="button--primary" data-action="drug-checks-check"${loading ? " disabled" : ""}>${loading ? "Checking…" : "Check interactions"}</button>
          <button type="button" data-action="drug-checks-use-patient-meds">Use active patient&rsquo;s medications</button>
          <button type="button" class="button--quiet" data-action="drug-checks-clear">Clear</button>
        </div>
        ${renderStatus(s)}
        <section id="drugChecksResults" class="dc-results-region" aria-label="Drug interaction results">
          ${renderResults(s)}
        </section>
      </div>`;
  }

  return { renderDrugChecks };
}
