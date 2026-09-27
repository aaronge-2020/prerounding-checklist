// Pure presentation for the MD Calc tab: score cards, calculator forms and
// result panels. No DOM access, no state - the scores controller owns state
// and passes everything in.
export function createScoresPresentation({ escapeHtml }) {
  function inputId(scoreId, key) {
    return `score-${scoreId}-${key}`;
  }

  function bindingBadge(binding, overridden) {
    if (!binding) return "";
    if (overridden) {
      return ` <span class="score-binding-badge score-binding-badge--edited" title="${escapeHtml(`Was pulled from patient: ${binding.source}. You edited this value.`)}">edited</span>`;
    }
    return ` <span class="score-binding-badge" title="${escapeHtml(`Pulled from patient: ${binding.source}. Edit to override.`)}">from patient</span>`;
  }

  function renderRadioInput({ definition, input, value, binding, overridden }) {
    const name = inputId(definition.id, input.key);
    const current = value === undefined || value === null ? "" : String(value);
    return `
      <fieldset class="score-field" data-score-field="${escapeHtml(input.key)}">
        <legend>${escapeHtml(input.label)}${bindingBadge(binding, overridden)}</legend>
        ${input.hint ? `<p class="score-hint">${escapeHtml(input.hint)}</p>` : ""}
        <div class="score-options">
          ${input.options.map((option) => `
            <label class="score-option ${String(option.value) === current ? "is-selected" : ""}">
              <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(String(option.value))}"
                data-score-id="${escapeHtml(definition.id)}" data-score-input="${escapeHtml(input.key)}"
                ${String(option.value) === current ? "checked" : ""}>
              <span>${escapeHtml(option.label)}</span>
            </label>`).join("")}
        </div>
      </fieldset>`;
  }

  function renderSelectInput({ definition, input, value, binding, overridden }) {
    const current = value === undefined || value === null ? "" : String(value);
    return `
      <label class="score-field" data-score-field="${escapeHtml(input.key)}">
        <span class="score-field-label">${escapeHtml(input.label)}${bindingBadge(binding, overridden)}</span>
        ${input.hint ? `<span class="score-hint">${escapeHtml(input.hint)}</span>` : ""}
        <select id="${escapeHtml(inputId(definition.id, input.key))}"
          data-score-id="${escapeHtml(definition.id)}" data-score-input="${escapeHtml(input.key)}">
          <option value="">Select\u2026</option>
          ${input.options.map((option) => `
            <option value="${escapeHtml(String(option.value))}" ${String(option.value) === current ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
      </label>`;
  }

  function renderNumberInput({ definition, input, value, binding, overridden }) {
    return `
      <label class="score-field" data-score-field="${escapeHtml(input.key)}">
        <span class="score-field-label">${escapeHtml(input.label)}${bindingBadge(binding, overridden)}</span>
        ${input.hint ? `<span class="score-hint">${escapeHtml(input.hint)}</span>` : ""}
        <span class="score-number-wrap">
          <input id="${escapeHtml(inputId(definition.id, input.key))}" type="number"
            data-score-id="${escapeHtml(definition.id)}" data-score-input="${escapeHtml(input.key)}"
            value="${value === undefined || value === null ? "" : escapeHtml(String(value))}"
            ${input.min !== undefined ? `min="${input.min}"` : ""} ${input.max !== undefined ? `max="${input.max}"` : ""}
            ${input.step !== undefined ? `step="${input.step}"` : ""} inputmode="decimal"
            placeholder="${escapeHtml(input.placeholder || "")}">
          ${input.unit ? `<span class="score-unit">${escapeHtml(input.unit)}</span>` : ""}
        </span>
      </label>`;
  }

  function renderNumberWithUnitInput({ definition, input, value, unit, binding, overridden }) {
    const currentUnit = unit || input.defaultUnit || input.units[0];
    return `
      <div class="score-field" data-score-field="${escapeHtml(input.key)}">
        <span class="score-field-label">${escapeHtml(input.label)}${bindingBadge(binding, overridden)}</span>
        ${input.hint ? `<span class="score-hint">${escapeHtml(input.hint)}</span>` : ""}
        <span class="score-number-wrap">
          <input id="${escapeHtml(inputId(definition.id, input.key))}" type="number"
            data-score-id="${escapeHtml(definition.id)}" data-score-input="${escapeHtml(input.key)}"
            value="${value === undefined || value === null ? "" : escapeHtml(String(value))}"
            ${input.min !== undefined ? `min="${input.min}"` : ""} ${input.max !== undefined ? `max="${input.max}"` : ""}
            ${input.step !== undefined ? `step="${input.step}"` : ""} inputmode="decimal"
            placeholder="${escapeHtml(input.placeholder || "")}">
          <select data-score-id="${escapeHtml(definition.id)}" data-score-unit="${escapeHtml(input.key)}"
            aria-label="${escapeHtml(input.label)} unit">
            ${input.units.map((unitOption) => `
              <option value="${escapeHtml(unitOption)}" ${unitOption === currentUnit ? "selected" : ""}>${escapeHtml(unitOption)}</option>`).join("")}
          </select>
        </span>
      </div>`;
  }

  function renderDateInput({ definition, input, value, binding, overridden }) {
    const label = input.modeLabels && input.modeLabels[input.activeMode] ? input.modeLabels[input.activeMode] : input.label;
    return `
      <label class="score-field" data-score-field="${escapeHtml(input.key)}">
        <span class="score-field-label">${escapeHtml(label)}${bindingBadge(binding, overridden)}</span>
        <input id="${escapeHtml(inputId(definition.id, input.key))}" type="date"
          data-score-id="${escapeHtml(definition.id)}" data-score-input="${escapeHtml(input.key)}"
          value="${value ? escapeHtml(String(value)) : ""}">
      </label>`;
  }

  function isInputVisible(input, mode) {
    if (!input.modes) return true;
    return input.modes.includes(mode);
  }

  function renderInput({ definition, input, values, bindings, overriddenKeys, mode }) {
    if (!isInputVisible(input, mode)) return "";
    const binding = bindings[input.key] || null;
    const overridden = overriddenKeys.has(input.key);
    const value = values[input.key];
    const unit = values[`${input.key}Unit`];
    const args = { definition, input, value, unit, binding, overridden };
    switch (input.type) {
      case "radio": return renderRadioInput(args);
      case "select": return renderSelectInput(args);
      case "number": return renderNumberInput(args);
      case "numberWithUnit": return renderNumberWithUnitInput(args);
      case "date": return renderDateInput({ ...args, input: { ...input, activeMode: mode } });
      default: return "";
    }
  }

  function renderResult({ result, definition, savedState }) {
    if (!result) return "";
    if (!result.complete) {
      const missing = (result.missing || []).map((label) => escapeHtml(label)).join(", ");
      return `
        <section class="score-result score-result--incomplete" aria-live="polite">
          <strong>Complete the inputs to calculate.</strong>
          ${missing ? `<span>Still needed: ${missing}.</span>` : ""}
        </section>`;
    }
    const interpretation = result.interpretation || {};
    const justSaved = savedState === "saved";
    const saveFailed = savedState === "save-failed";
    return `
      <section class="score-result score-result--${escapeHtml(interpretation.band || "calculated")}" aria-live="polite">
        <strong class="score-result-headline">${escapeHtml(interpretation.headline || "")}</strong>
        ${interpretation.detail ? `<span>${escapeHtml(interpretation.detail)}</span>` : ""}
        <span class="score-result-actions">
          <button type="button" class="score-save" data-score-save="${escapeHtml(definition?.id || "")}" ${justSaved ? "disabled" : ""}>
            ${justSaved ? "Saved to patient \u2713" : saveFailed ? "Save failed — try again" : "Save to patient"}
          </button>
        </span>
      </section>`;
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

  function renderProvenance(definition) {
    if (definition.kind === "ai-model") {
      const links = [
        definition.paperUrl ? `<a href="${escapeHtml(definition.paperUrl)}" target="_blank" rel="noopener">Paper</a>` : "",
        definition.codeUrl ? `<a href="${escapeHtml(definition.codeUrl)}" target="_blank" rel="noopener">Code / weights</a>` : ""
      ].filter(Boolean).join(" \u00B7 ");
      const status = definition.verifiedOn
        ? `Verified against ${escapeHtml(definition.verifiedAgainst || "the published reference")} on ${escapeHtml(definition.verifiedOn)}.`
        : `Live verification pending \u2014 check the paper before acting on any result.`;
      return `
        <p class="muted score-provenance">${links ? `${links}<br>` : ""}${escapeHtml(definition.validationNote || "")}<br>${status}<br>Reference: ${escapeHtml(definition.reference || "")}</p>
        ${definition.licenseNote ? `<p class="muted score-license">${escapeHtml(definition.licenseNote)}</p>` : ""}
        ${definition.disclaimer ? `<p class="muted score-disclaimer">${escapeHtml(definition.disclaimer)}</p>` : ""}`;
    }
    return definition.verifiedOn ? `<p class="muted score-provenance">Verified one-to-one against
      <a href="${escapeHtml(definition.mdcalcUrl)}" target="_blank" rel="noopener">MDCalc \u00B7 ${escapeHtml(definition.title)}</a> on ${escapeHtml(definition.verifiedOn)}.
      Reference: ${escapeHtml(definition.reference || "")}</p>` : `<p class="muted score-provenance">Mirrors
      <a href="${escapeHtml(definition.mdcalcUrl)}" target="_blank" rel="noopener">MDCalc \u00B7 ${escapeHtml(definition.title)}</a> one-to-one in design \u2014 live verification pending.
      Reference: ${escapeHtml(definition.reference || "")}</p>`;
  }

  function renderScoreDetail({ definition, values, bindings, overriddenKeys, result, patientLabel, mode, hasBindings, savedState }) {
    return `
      <div class="scores-page">
        <button type="button" class="score-back" data-score-back>\u2190 All models</button>
        <div class="scores-page-heading">
          <h1>${escapeHtml(definition.title)}</h1>
          ${definition.subtitle ? `<p class="muted">${escapeHtml(definition.subtitle)}</p>` : ""}
          ${renderProvenance(definition)}
          ${patientLabel ? `<p class="muted">Inputs marked <span class="score-binding-badge">from patient</span> are pulled from ${escapeHtml(patientLabel)}\u2019s saved data \u2014 verify before use.</p>` : ""}
          ${hasBindings ? `<button type="button" class="score-repull" data-score-repull>Re-pull from patient</button>` : ""}
        </div>
        ${renderResult({ result, definition, savedState })}
        <form class="score-form" data-score-form="${escapeHtml(definition.id)}" onsubmit="return false;">
          ${(definition.inputs || []).map((input) => renderInput({ definition, input, values, bindings, overriddenKeys, mode })).join("")}
        </form>
        <p class="score-footnote">Decision support only \u2014 verify against the primary reference before acting on any result.</p>
      </div>`;
  }

  return { renderScoresHome, renderScoreDetail };
}
