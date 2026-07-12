export function createDeidPresentation({ escapeHtml, icon }) {
  function renderDeidOperation(operation = {}) {
    return `
      <div class="deid-operation ${operation.active ? "is-active" : ""}" data-deid-operation aria-live="polite">
        <progress data-deid-operation-progress ${Number.isFinite(operation.value) ? `value="${Math.max(0, operation.value)}" max="${Math.max(1, operation.total || 1)}"` : ""}></progress>
        <span data-deid-operation-message>${escapeHtml(operation.message || "")}</span>
      </div>`;
  }

  function renderDeidLoadButton({ option, state, canInstall, isDownloading, fallbackLabel, fallbackDisabled }) {
    if (!option) {
      return `<span class="model-selection-message model-selection-message--ready">${icon("shield")} Ready locally</span>`;
    }
    
    if (state === "installed") {
      return `<button type="button" data-action="verify-model-pack" data-model-key="${escapeHtml(option.key)}" ${isDownloading ? "disabled" : ""}>${icon("shield")} Verify ${escapeHtml(option.shortLabel || option.label)}</button>`;
    }
    
    if (canInstall) {
      return `<button type="button" data-action="download-model-pack" data-model-key="${escapeHtml(option.key)}" ${isDownloading ? "disabled" : ""}>${icon("download")} ${isDownloading ? "Downloading locally..." : `Download ${escapeHtml(option.shortLabel || option.label)} locally`}</button>`;
    }
    
    return `<button type="button" data-action="load-advanced-deid" ${fallbackDisabled ? "disabled" : ""}>${icon("shield")} ${escapeHtml(fallbackLabel)}</button>`;
  }

  function renderDeidModeOptions({ options, selectedMode, structuredModeValue }) {
    const modelOptions = options.map((option) => {
      const disabled = option.unavailable ? "disabled" : "";
      return `<option value="${escapeHtml(option.key)}" ${selectedMode === option.key ? "selected" : ""} ${disabled}>${escapeHtml(option.label)}${escapeHtml(option.suffix || "")}</option>`;
    }).join("");
    return `
      <option value="${escapeHtml(structuredModeValue)}" ${selectedMode === structuredModeValue ? "selected" : ""}>Structured only</option>
      ${modelOptions}
    `;
  }

  function renderDeidStrip({ 
    modeLabel,
    stateText, 
    selectOptionsHtml, 
    loadButtonHtml, 
    operation, 
    progress, 
    progressText,
    readiness 
  }) {
    return `
      <div class="deid-strip deid-strip-compact">
        <div class="deid-inline-status">
          <strong>Advanced De-identification</strong>
          <span class="muted" data-deid-selected-state>Selected: ${escapeHtml(modeLabel)} | ${escapeHtml(stateText)}</span>
        </div>
        <div class="button-row">
          <select id="deidModeSelect" aria-label="De-identification mode">
            ${selectOptionsHtml}
          </select>
          ${loadButtonHtml}
        </div>
        ${renderDeidOperation(operation)}
        ${progress ? `<div class="deid-download-progress" aria-live="polite"><progress data-shared-model-progress value="${Math.max(0, progress.completedBytes)}" max="${Math.max(1, progress.totalBytes)}"></progress><span data-shared-model-progress-text>${escapeHtml(progressText)}</span></div>` : ""}
        ${readiness.ready ? "" : `<span class="deid-readiness-note">${escapeHtml(readiness.message)}</span>`}
      </div>
    `;
  }

  return Object.freeze({ 
    renderDeidOperation, 
    renderDeidLoadButton, 
    renderDeidModeOptions, 
    renderDeidStrip 
  });
}
