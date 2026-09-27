// Pure presentation for the Models tab: MDCalc-style calculator views.
// Replicates the MDCalc calculator layout (header, Calculator / Next Steps /
// Evidence / Creator tabs, Instructions + When to Use / Pearls-Pitfalls /
// Why Use accordions, option-stack inputs, sticky result bar) using this
// app's theme (teal accent, navy primary, Aptos/system font).
// No DOM access, no state - the scores controller owns state and passes
// everything in.
export function createScoresPresentation({ escapeHtml }) {
  const TABS = [
    { id: "calculator", label: "Calculator" },
    { id: "next-steps", label: "Next Steps" },
    { id: "evidence", label: "Evidence" },
    { id: "creator", label: "Creator" }
  ];

  const ICONS = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6-5.1-2.8-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7z"/></svg>',
    starFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6-5.1-2.8-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 12v8h14v-8"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5"/><path d="M20 18H6.5A2.5 2.5 0 0 0 4 20.5"/><path d="M9 8h7M9 11.5h5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg>'
  };

  function inputId(scoreId, key) {
    return `score-${scoreId}-${key}`;
  }

  // Rendered into a <span data-score-badge> slot so the controller can patch
  // it in place when a manual edit overrides a patient binding.
  function renderBindingBadge(binding, overridden) {
    if (!binding) return "";
    if (overridden) {
      return ` <span class="score-binding-badge score-binding-badge--edited" title="${escapeHtml(`Was pulled from patient: ${binding.source}. You edited this value.`)}">edited</span>`;
    }
    return ` <span class="score-binding-badge" title="${escapeHtml(`Pulled from patient: ${binding.source}. Edit to override.`)}">from patient</span>`;
  }

  function fieldSide(input, binding, overridden) {
    return `
      <div class="mdc-field-side">
        <span class="mdc-field-name">${escapeHtml(input.label)}<span data-score-badge>${renderBindingBadge(binding, overridden)}</span></span>
        ${input.hint ? `<span class="mdc-field-hint">${escapeHtml(input.hint)}</span>` : ""}
      </div>`;
  }

  function renderRadioInput({ definition, input, value, binding, overridden, hidden }) {
    const name = inputId(definition.id, input.key);
    const current = value === undefined || value === null ? "" : String(value);
    return `
      <div class="mdc-field" data-score-field="${escapeHtml(input.key)}"${hidden ? " hidden" : ""}>
        ${fieldSide(input, binding, overridden)}
        <div class="mdc-opts" role="radiogroup" aria-label="${escapeHtml(input.label)}" data-score-opts="${escapeHtml(input.key)}">
          ${input.options.map((option) => `
            <label class="mdc-opt ${String(option.value) === current ? "is-selected" : ""}">
              <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(String(option.value))}"
                data-score-id="${escapeHtml(definition.id)}" data-score-input="${escapeHtml(input.key)}"
                ${String(option.value) === current ? "checked" : ""}>
              <span>${escapeHtml(option.label)}</span>
            </label>`).join("")}
        </div>
      </div>`;
  }

  function renderSelectInput({ definition, input, value, binding, overridden, hidden }) {
    const current = value === undefined || value === null ? "" : String(value);
    return `
      <div class="mdc-field mdc-field--stacked" data-score-field="${escapeHtml(input.key)}"${hidden ? " hidden" : ""}>
        ${fieldSide(input, binding, overridden)}
        <select class="mdc-select" id="${escapeHtml(inputId(definition.id, input.key))}"
          data-score-id="${escapeHtml(definition.id)}" data-score-input="${escapeHtml(input.key)}">
          <option value="">Select\u2026</option>
          ${input.options.map((option) => `
            <option value="${escapeHtml(String(option.value))}" ${String(option.value) === current ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
      </div>`;
  }

  function renderNumberInput({ definition, input, value, binding, overridden, hidden }) {
    return `
      <div class="mdc-field mdc-field--stacked" data-score-field="${escapeHtml(input.key)}"${hidden ? " hidden" : ""}>
        ${fieldSide(input, binding, overridden)}
        <span class="mdc-numberwrap">
          <input class="mdc-number" id="${escapeHtml(inputId(definition.id, input.key))}" type="number"
            data-score-id="${escapeHtml(definition.id)}" data-score-input="${escapeHtml(input.key)}"
            value="${value === undefined || value === null ? "" : escapeHtml(String(value))}"
            ${input.min !== undefined ? `min="${input.min}"` : ""} ${input.max !== undefined ? `max="${input.max}"` : ""}
            ${input.step !== undefined ? `step="${input.step}"` : ""} inputmode="decimal"
            placeholder="${escapeHtml(input.placeholder || "")}">
          ${input.unit ? `<span class="mdc-unit">${escapeHtml(input.unit)}</span>` : ""}
        </span>
      </div>`;
  }

  function renderNumberWithUnitInput({ definition, input, value, unit, binding, overridden, hidden }) {
    const currentUnit = unit || input.defaultUnit || input.units[0];
    return `
      <div class="mdc-field mdc-field--stacked" data-score-field="${escapeHtml(input.key)}"${hidden ? " hidden" : ""}>
        ${fieldSide(input, binding, overridden)}
        <span class="mdc-numberwrap">
          <input class="mdc-number" id="${escapeHtml(inputId(definition.id, input.key))}" type="number"
            data-score-id="${escapeHtml(definition.id)}" data-score-input="${escapeHtml(input.key)}"
            value="${value === undefined || value === null ? "" : escapeHtml(String(value))}"
            ${input.min !== undefined ? `min="${input.min}"` : ""} ${input.max !== undefined ? `max="${input.max}"` : ""}
            ${input.step !== undefined ? `step="${input.step}"` : ""} inputmode="decimal"
            placeholder="${escapeHtml(input.placeholder || "")}">
          <select class="mdc-unitsel" data-score-id="${escapeHtml(definition.id)}" data-score-unit="${escapeHtml(input.key)}"
            aria-label="${escapeHtml(input.label)} unit">
            ${input.units.map((unitOption) => `
              <option value="${escapeHtml(unitOption)}" ${unitOption === currentUnit ? "selected" : ""}>${escapeHtml(unitOption)}</option>`).join("")}
          </select>
        </span>
      </div>`;
  }

  function renderDateInput({ definition, input, value, binding, overridden, hidden }) {
    const label = input.modeLabels && input.modeLabels[input.activeMode] ? input.modeLabels[input.activeMode] : input.label;
    return `
      <div class="mdc-field mdc-field--stacked" data-score-field="${escapeHtml(input.key)}"${hidden ? " hidden" : ""}>
        <div class="mdc-field-side">
          <span class="mdc-field-name">${escapeHtml(label)}<span data-score-badge>${renderBindingBadge(binding, overridden)}</span></span>
          ${input.hint ? `<span class="mdc-field-hint">${escapeHtml(input.hint)}</span>` : ""}
        </div>
        <input class="mdc-date" id="${escapeHtml(inputId(definition.id, input.key))}" type="date"
          data-score-id="${escapeHtml(definition.id)}" data-score-input="${escapeHtml(input.key)}"
          value="${value ? escapeHtml(String(value)) : ""}">
      </div>`;
  }

  function isInputVisible(input, mode) {
    if (!input.modes) return true;
    return input.modes.includes(mode);
  }

  function renderInput({ definition, input, values, bindings, overriddenKeys, mode }) {
    // Mode-gated fields stay in the DOM with `hidden` (instead of being
    // omitted) so switching modes never rebuilds the form — the controller
    // toggles visibility in place and typed values survive.
    const binding = bindings[input.key] || null;
    const overridden = overriddenKeys.has(input.key);
    const value = values[input.key];
    const unit = values[`${input.key}Unit`];
    const hidden = !isInputVisible(input, mode);
    const args = { definition, input, value, unit, binding, overridden, hidden };
    switch (input.type) {
      case "radio": return renderRadioInput(args);
      case "select": return renderSelectInput(args);
      case "number": return renderNumberInput(args);
      case "numberWithUnit": return renderNumberWithUnitInput(args);
      case "date": return renderDateInput({ ...args, input: { ...input, activeMode: mode } });
      default: return "";
    }
  }

  // ---- guide content helpers ----

  function blockHtml(block) {
    if (!block) return "";
    if (Array.isArray(block)) {
      const items = block.filter((item) => item && String(item).trim()).map((item) => `<li>${escapeHtml(String(item))}</li>`).join("");
      return items ? `<ul class="mdc-bullets">${items}</ul>` : "";
    }
    return `<p>${escapeHtml(String(block))}</p>`;
  }

  function accordion({ target, title, bodyHtml, tinted }) {
    if (!bodyHtml) return "";
    return `
      <div class="mdc-accwrap">
        <button type="button" class="mdc-acc${tinted ? " mdc-acc--tinted" : ""}" data-mdc-acc="${escapeHtml(target)}" aria-expanded="false" aria-controls="mdc-acc-${escapeHtml(target)}">
          <span class="mdc-acc-title">${tinted ? `<span class="mdc-acc-icon">${ICONS.book}</span>` : ""}${escapeHtml(title)}</span>
          <span class="mdc-acc-chev">${ICONS.chev}</span>
        </button>
        <div class="mdc-acc-body" id="mdc-acc-${escapeHtml(target)}" data-mdc-acc-panel="${escapeHtml(target)}" hidden>
          ${bodyHtml}
        </div>
      </div>`;
  }

  function aiModelGuide(definition) {
    // AI models carry paper/code/validation metadata instead of a guide.
    return {
      description: definition.validationNote || definition.subtitle || "",
      instructions: "Enter the model inputs below. All computation runs locally in this browser.",
      whenToUse: null,
      pearlsPitfalls: null,
      whyUse: null,
      nextSteps: { default: definition.disclaimer || "Decision support only \u2014 verify against the primary reference before acting on any result." },
      evidence: [
        ...(definition.paperUrl ? [{ label: "Paper", url: definition.paperUrl }] : []),
        ...(definition.codeUrl ? [{ label: "Code / weights", url: definition.codeUrl }] : [])
      ],
      creator: definition.reference || ""
    };
  }

  function guideFor(definition) {
    return definition.guide || (definition.kind === "ai-model" ? aiModelGuide(definition) : null);
  }

  function resolveNextSteps(guide, result) {
    if (!guide || !guide.nextSteps) return { active: null, general: null };
    const ns = guide.nextSteps;
    if (typeof ns === "string") return { active: null, general: ns };
    const band = result?.interpretation?.band;
    return {
      active: band && ns[band] ? { band, text: ns[band] } : null,
      general: ns.default || null
    };
  }

  // ---- tabs ----

  function renderCalculatorTab({ definition, values, bindings, overriddenKeys, result, patientLabel, mode, hasBindings }) {
    const guide = guideFor(definition);
    const description = guide?.description || definition.subtitle || "";
    return `
      <div class="mdc-pane" data-mdc-pane="calculator">
        ${description ? `<p class="mdc-desc">${escapeHtml(description)}</p>` : ""}
        ${guide?.instructions ? accordion({ target: "instructions", title: "Instructions", bodyHtml: blockHtml(guide.instructions), tinted: true }) : ""}
        ${guide?.whenToUse || guide?.pearlsPitfalls || guide?.whyUse ? `
        <div class="mdc-trio" role="group" aria-label="About this calculator">
          ${guide.whenToUse ? `
          <button type="button" class="mdc-acc mdc-acc--trio" data-mdc-acc="whenToUse" aria-expanded="false" aria-controls="mdc-acc-whenToUse">
            <span class="mdc-acc-title">When to Use</span><span class="mdc-acc-chev">${ICONS.chev}</span>
          </button>` : ""}
          ${guide.pearlsPitfalls ? `
          <button type="button" class="mdc-acc mdc-acc--trio" data-mdc-acc="pearlsPitfalls" aria-expanded="false" aria-controls="mdc-acc-pearlsPitfalls">
            <span class="mdc-acc-title">Pearls/Pitfalls</span><span class="mdc-acc-chev">${ICONS.chev}</span>
          </button>` : ""}
          ${guide.whyUse ? `
          <button type="button" class="mdc-acc mdc-acc--trio" data-mdc-acc="whyUse" aria-expanded="false" aria-controls="mdc-acc-whyUse">
            <span class="mdc-acc-title">Why Use</span><span class="mdc-acc-chev">${ICONS.chev}</span>
          </button>` : ""}
        </div>
        ${guide.whenToUse ? `<div class="mdc-trio-panel" id="mdc-acc-whenToUse" data-mdc-acc-panel="whenToUse" hidden>${blockHtml(guide.whenToUse)}</div>` : ""}
        ${guide.pearlsPitfalls ? `<div class="mdc-trio-panel" id="mdc-acc-pearlsPitfalls" data-mdc-acc-panel="pearlsPitfalls" hidden>${blockHtml(guide.pearlsPitfalls)}</div>` : ""}
        ${guide.whyUse ? `<div class="mdc-trio-panel" id="mdc-acc-whyUse" data-mdc-acc-panel="whyUse" hidden>${blockHtml(guide.whyUse)}</div>` : ""}` : ""}
        ${patientLabel ? `<p class="mdc-patientline">Inputs marked <span class="score-binding-badge">from patient</span> are pulled from ${escapeHtml(patientLabel)}\u2019s saved data \u2014 verify before use.${hasBindings ? ` <button type="button" class="score-repull" data-score-repull>Re-pull from patient</button>` : ""}</p>` : ""}
        <form class="mdc-form" data-score-form="${escapeHtml(definition.id)}" onsubmit="return false;">
          ${(definition.inputs || []).map((input) => renderInput({ definition, input, values, bindings, overriddenKeys, mode })).join("")}
        </form>
        <p class="mdc-footnote">Decision support only \u2014 verify against the primary reference before acting on any result.</p>
      </div>`;
  }

  // Next-steps pane body, exported so the controller can refresh just this
  // pane in place when the result band changes (tab switches never rebuild
  // the calculator form).
  function renderNextStepsPane({ definition, result }) {
    const guide = guideFor(definition);
    const { active, general } = resolveNextSteps(guide, result);
    const headline = result?.complete ? result.interpretation?.headline : null;
    return `
        <h2 class="mdc-pane-title">Next steps</h2>
        ${!guide ? `<p class="muted">No next-steps guidance is available for this model yet.</p>` : ""}
        ${active ? `
        <section class="mdc-nextband" aria-live="polite">
          <strong class="mdc-nextband-head">${escapeHtml(headline || "Current result")}</strong>
          ${blockHtml(active.text)}
        </section>` : ""}
        ${!result?.complete && guide ? `<p class="muted">Complete the calculator to see guidance tailored to the result band.</p>` : ""}
        ${general ? `<div class="mdc-nextgeneral">${blockHtml(general)}</div>` : ""}`;
  }

  function renderEvidenceTab({ definition }) {
    const guide = guideFor(definition);
    const evidence = (guide?.evidence || []).filter((entry) => entry && entry.url);
    const verifiedLine = definition.kind === "ai-model"
      ? (definition.verifiedOn
        ? `Verified against ${escapeHtml(definition.verifiedAgainst || "the published reference")} on ${escapeHtml(definition.verifiedOn)}.`
        : `Live verification pending \u2014 check the paper before acting on any result.`)
      : (definition.verifiedOn
        ? `Verified one-to-one against <a href="${escapeHtml(definition.mdcalcUrl)}" target="_blank" rel="noopener">MDCalc \u00B7 ${escapeHtml(definition.title)}</a> on ${escapeHtml(definition.verifiedOn)}.`
        : `Mirrors <a href="${escapeHtml(definition.mdcalcUrl)}" target="_blank" rel="noopener">MDCalc \u00B7 ${escapeHtml(definition.title)}</a> one-to-one in design \u2014 live verification pending.`);
    return `
      <div class="mdc-pane" data-mdc-pane="evidence">
        <h2 class="mdc-pane-title">Evidence</h2>
        <p class="mdc-verified">${verifiedLine}</p>
        ${evidence.length ? `
        <ul class="mdc-refs">
          ${evidence.map((entry) => `<li><a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener">${escapeHtml(entry.label || entry.url)}</a></li>`).join("")}
        </ul>` : ""}
        ${definition.reference ? `<p class="mdc-refprimary">Primary reference: ${escapeHtml(definition.reference)}</p>` : ""}
        ${definition.licenseNote ? `<p class="muted">${escapeHtml(definition.licenseNote)}</p>` : ""}
      </div>`;
  }

  function renderCreatorTab({ definition }) {
    const guide = guideFor(definition);
    return `
      <div class="mdc-pane" data-mdc-pane="creator">
        <h2 class="mdc-pane-title">Creator</h2>
        ${guide?.creator ? blockHtml(guide.creator) : `<p class="muted">Creator information is not available for this calculator yet.</p>`}
        ${definition.reference ? `<p class="mdc-refprimary">Reference: ${escapeHtml(definition.reference)}</p>` : ""}
      </div>`;
  }

  // ---- sticky result bar ----

  function renderResultBar({ result, definition, savedState }) {
    const justSaved = savedState === "saved";
    const saveFailed = savedState === "save-failed";
    const saveLabel = justSaved ? "Saved to patient \u2713" : saveFailed ? "Save failed \u2014 try again" : "Save to patient";
    if (!result || !result.complete) {
      const missing = (result?.missing || []).map((label) => escapeHtml(label)).join(", ");
      return `
        <footer class="mdc-resultbar mdc-resultbar--incomplete" aria-live="polite">
          <span class="mdc-resultbar-label">Result:</span>
          <span class="mdc-resultbar-body"><span class="mdc-resultbar-pending">Please fill out required fields.${missing ? ` <span class="mdc-resultbar-missing">Still needed: ${missing}.</span>` : ""}</span></span>
        </footer>`;
    }
    const interpretation = result.interpretation || {};
    return `
      <footer class="mdc-resultbar mdc-resultbar--${escapeHtml(interpretation.band || "calculated")}" aria-live="polite">
        <span class="mdc-resultbar-label">Result:</span>
        <span class="mdc-resultbar-body">
          <strong class="mdc-resultbar-headline">${escapeHtml(interpretation.headline || "")}</strong>
          ${interpretation.detail ? `<span class="mdc-resultbar-detail">${escapeHtml(interpretation.detail)}</span>` : ""}
        </span>
        <button type="button" class="mdc-save" data-score-save="${escapeHtml(definition?.id || "")}" ${justSaved ? "disabled" : ""}>${saveLabel}</button>
      </footer>`;
  }

  // ---- detail + home ----

  // Exported so the controller can patch the star in place on favorite
  // toggles without rebuilding the header.
  function renderFavoriteButton({ definition, isFavorite }) {
    return `<button type="button" class="mdc-iconbtn${isFavorite ? " is-favorite" : ""}" data-score-fav aria-label="${isFavorite ? "Remove from favorites" : "Add to favorites"}" aria-pressed="${isFavorite ? "true" : "false"}">${isFavorite ? ICONS.starFilled : ICONS.star}</button>`;
  }

  function renderScoreDetail({ definition, values, bindings, overriddenKeys, result, patientLabel, mode, hasBindings, savedState, tab, isFavorite }) {
    const activeTab = TABS.some((entry) => entry.id === tab) ? tab : "calculator";
    // All four panes render once; inactive panes stay in the DOM with
    // `hidden` so tab switches are pure show/hide (no innerHTML rebuild,
    // no scroll jump, no focus loss).
    const pane = (id, bodyHtml) => `
      <div class="mdc-pane" data-mdc-pane="${id}"${id === activeTab ? "" : " hidden"}>
        ${bodyHtml}
      </div>`;
    return `
      <div class="mdc" data-mdc-calc="${escapeHtml(definition.id)}">
        <header class="mdc-header">
          <button type="button" class="mdc-iconbtn" data-score-back aria-label="Back to all models">${ICONS.back}</button>
          <h1 class="mdc-title">${escapeHtml(definition.title)}</h1>
          <span class="mdc-favslot" data-score-fav-slot>${renderFavoriteButton({ definition, isFavorite })}</span>
          <button type="button" class="mdc-iconbtn" data-score-share aria-label="Share this calculator">${ICONS.share}</button>
        </header>
        <nav class="mdc-tabs" role="tablist" aria-label="Calculator sections">
          ${TABS.map((entry) => `
            <button type="button" role="tab" class="mdc-tab${entry.id === activeTab ? " is-active" : ""}"
              data-score-tab="${entry.id}" aria-selected="${entry.id === activeTab ? "true" : "false"}">${entry.label}</button>`).join("")}
        </nav>
        <div class="mdc-body">
          ${pane("calculator", renderCalculatorTab({ definition, values, bindings, overriddenKeys, result, patientLabel, mode, hasBindings }))}
          ${pane("next-steps", renderNextStepsPane({ definition, result }))}
          ${pane("evidence", renderEvidenceTab({ definition }))}
          ${pane("creator", renderCreatorTab({ definition }))}
        </div>
        <div class="mdc-resultbar-slot" data-mdc-resultbar-slot>
          ${renderResultBar({ result, definition, savedState })}
        </div>
      </div>`;
  }

  function renderScoreCard(definition) {
    return `
      <button type="button" class="score-card" data-score-open="${escapeHtml(definition.id)}">
        <strong>${escapeHtml(definition.title)}</strong>
        <span>${escapeHtml(definition.subtitle || "")}</span>
      </button>`;
  }

  function renderScoresHome({ definitions, patientLabel }) {
    const calculators = (definitions || []).filter((definition) => definition.kind !== "ai-model");
    const aiModels = (definitions || []).filter((definition) => definition.kind === "ai-model");
    return `
      <div class="scores-page">
        <div class="scores-page-heading">
          <h1>Models</h1>
          <p class="muted">Native clinical calculators that mirror MDCalc one-to-one, plus peer-reviewed AI models. They run entirely on this device \u2014 no network, no other tab. Verification status is shown on each model.</p>
          ${patientLabel ? `<p class="muted">Inputs marked <span class="score-binding-badge">from patient</span> are pulled from ${escapeHtml(patientLabel)}\u2019s saved data. Always verify before using them.</p>` : ""}
        </div>
        <h2 class="scores-section-heading">Clinical calculators</h2>
        <div class="scores-grid">
          ${calculators.map(renderScoreCard).join("")}
        </div>
        ${aiModels.length ? `
        <h2 class="scores-section-heading">AI models</h2>
        <div class="scores-grid">
          ${aiModels.map(renderScoreCard).join("")}
        </div>` : ""}
        <h2 class="scores-section-heading">Local LLM</h2>
        <div class="scores-grid">
          <article class="score-card" data-score-open="__local_llm__" tabindex="0" role="button" aria-label="Open local LLM chat">
            <h3>Qwen chat (browser-local)</h3>
            <p>Chat directly with a Qwen model running in this browser via WebLLM. Download a model, then test its capabilities \u2014 no data leaves the device.</p>
          </article>
          <article class="score-card" data-score-open="__local_llm_parser__" tabindex="0" role="button" aria-label="Open local LLM note parser">
            <h3>Note parser (local LLM)</h3>
            <p>Parse pasted primary-team notes with the local model instead of the deterministic parser. Enable it from the Local AI tab.</p>
          </article>
        </div>
        <p class="score-footnote">Decision support only \u2014 verify against the primary reference before acting on any result.</p>
      </div>`;
  }

  return { renderScoresHome, renderScoreDetail, renderResultBar, renderNextStepsPane, renderFavoriteButton, renderBindingBadge };
}
