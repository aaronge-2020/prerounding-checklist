export function createQuickDeidPresentation({ escapeHtml, icon }) {
  function renderOpenMedSmallFallback({ option }) {
    if (!option?.openMedTier || option.openMedTier === "small") return "";
    return `<button class="button--quiet" type="button" data-action="select-deid-model" data-model-key="openmed-superclinical-small">${icon("chevron")} Use OpenMed Small for this device</button>`;
  }

  function renderQuickModelControl({
    option,
    state,
    busy,
    progress,
    error,
    webGpuAvailable,
    isInstallable,
    modelPackBusyKey,
    deidModelSelectOptionsHtml,
    quickDeidStatus,
    modelPackProgressText
  }) {
    let action = "";
    if (option?.requiresWebGpu && !webGpuAvailable) {
      action = `<span class="model-selection-message model-selection-message--error">This model needs graphics acceleration that isn't available in this browser.</span>`;
    } else if (option && isInstallable && !state?.ready) {
      const actionName = state?.state === "installed" ? "verify-model-pack" : "download-model-pack";
      const label = state?.state === "installed" ? "Verify model" : "Download and verify";
      action = `<div class="button-row"><button type="button" data-action="${actionName}" data-model-key="${escapeHtml(option.key)}" ${modelPackBusyKey ? "disabled" : ""}>${icon(state?.state === "installed" ? "shield" : "download")} ${label}</button><button class="button--quiet" type="button" data-action="import-model-pack" data-model-key="${escapeHtml(option.key)}" ${modelPackBusyKey ? "disabled" : ""}>Import folder</button>${busy ? `<button class="button--quiet" type="button" data-action="cancel-model-download" data-model-key="${escapeHtml(option.key)}">Cancel</button>` : ""}</div>`;
    } else if (option) {
      action = `<span class="model-selection-message model-selection-message--ready">${icon("shield")} Verified and ready locally.</span>`;
    } else {
      action = `<span class="model-selection-message">Ready — no download needed.</span>`;
    }
    return `
      <section class="quick-model-control" aria-label="Local de-identification model">
        <label for="quickDeidMode">Local de-identification model</label>
        <div class="quick-model-control-row">
          <select id="quickDeidMode" aria-label="Local model">${deidModelSelectOptionsHtml}</select>
          ${action}
        </div>
        <p class="muted">${escapeHtml(option?.description || "Uses structured local rules to redact identifiers without a downloaded model.")}</p>
        ${quickDeidStatus ? `<span class="model-selection-message" aria-live="polite">${escapeHtml(quickDeidStatus)}</span>` : ""}
        ${progress ? `<div class="model-selection-progress" aria-live="polite"><progress data-active-model-progress value="${Math.max(0, progress.completedBytes)}" max="${Math.max(1, progress.totalBytes)}"></progress><span data-active-model-progress-text>${escapeHtml(modelPackProgressText)}</span></div>` : ""}
        ${error ? `<div class="model-selection-message model-selection-message--error" role="alert">${escapeHtml(error)}</div>${renderOpenMedSmallFallback({ option })}` : ""}
      </section>
    `;
  }

  function renderQuickDeidReview({
    review,
    activeWarnings,
    pendingRedactions,
    activeRedactionIndex,
    activeRedaction,
    activeRedactionIsConfirmed,
    activeWarningIndex,
    activeWarning,
    queueStatus,
    renderRedactionDocumentHtml,
    warningDescriptionText
  }) {
    if (!review) {
      return `
        <div class="quick-review-empty notice">
          <strong>No review session yet</strong>
          <p class="quick-deid-step-helper">Run de-identification to inspect individual redactions and residual PHI flags.</p>
        </div>
      `;
    }
    return `
      <div class="redaction-review quick-redaction-review" data-redaction-review>
        <div class="redaction-review-heading">
          <div>
            <strong>${queueStatus}</strong>
            <span class="muted">${pendingRedactions.length} unconfirmed redaction${pendingRedactions.length === 1 ? "" : "s"}, ${activeWarnings.length} remaining flag${activeWarnings.length === 1 ? "" : "s"}. Originals disappear when you close this tab or leave this tool.</span>
          </div>
          <div class="button-row">
            ${pendingRedactions.length ? `<button class="button--quiet" type="button" data-action="confirm-all-quick-redactions">Confirm all (${pendingRedactions.length})</button>` : ""}
            <button class="button--quiet" type="button" data-action="manual-redact-quick-selection">${icon("wand")} Redact highlighted text</button>
          </div>
        </div>
        ${renderRedactionDocumentHtml}
        <p class="muted quick-review-instruction">The crossed-out text is the original — kept only in memory, never saved. Its replacement is safe to copy. To catch anything the model missed, highlight it here, then choose Redact highlighted text.</p>
        ${activeRedaction ? `
          <div class="redaction-inspector quick-review-current redaction-inline-actions">
            <div>
              <strong>${activeRedactionIsConfirmed ? "Accepted redaction" : `Review ${escapeHtml(activeRedaction.placeholder)}`}</strong>
              <span>${activeRedactionIsConfirmed ? "Only the safe replacement is shown. Undo brings back the original in this tab." : "Accept keeps the replacement. Reject restores the original, then the next pending redaction opens in the middle of the document."}</span>
            </div>
            <div class="button-row">
              ${activeRedactionIsConfirmed ? "" : `<button class="button--secondary" type="button" data-action="confirm-quick-redaction">Accept redaction</button>`}
              <button class="button--quiet" type="button" data-action="restore-quick-non-phi" data-redaction-index="${activeRedactionIndex}">${activeRedactionIsConfirmed ? "Undo redaction" : "Reject — restore original"}</button>
            </div>
          </div>
        ` : ""}
        ${!activeRedaction && activeWarning ? `
          <div class="quick-residual-review quick-review-current">
            <div>
              <strong>Residual PHI flag</strong>
              <span class="muted">Choose once — the next remaining flag opens automatically.</span>
            </div>
            <strong>${escapeHtml(warningDescriptionText)}</strong>
            <div class="button-row">
              <button class="button--quiet" type="button" data-action="redact-quick-warning" data-warning-index="${activeWarningIndex}">Redact</button>
              <button class="button--quiet" type="button" data-action="dismiss-quick-warning" data-warning-index="${activeWarningIndex}">Not PHI</button>
            </div>
          </div>
        ` : ""}
        ${!activeRedaction && !activeWarning ? `<div class="quick-review-complete notice"><strong>Ready to copy</strong><p class="quick-deid-step-helper">You can still highlight anything the model missed and redact it before copying.</p></div>` : ""}
      </div>
    `;
  }

  function renderQuickDeid({
    hasReview,
    deidReady,
    quickDeidInput,
    renderQuickModelControlHtml,
    renderQuickDeidReviewHtml
  }) {
    return `
      <section class="panel quick-deid-panel">
        <div class="section-heading quick-deid-heading">
          <div>
            <h2>Quick De-ID Tool</h2>
            <p class="muted">Review stays in this tab only. Copy the de-identified result when you are done.</p>
          </div>
          ${hasReview ? `<button class="button--quiet" type="button" data-action="start-new-quick-deid">${icon("plus")} New text</button>` : ""}
        </div>
        <details class="quick-deid-coverage-note">
          <summary>What this tool does and does not catch</summary>
          <p class="muted">
            Detection combines local pattern rules with a locally-run clinical text-scanning model (OpenMed SuperClinical, when
            selected below). Together they target most
            <a href="https://www.dhcs.ca.gov/data-statistics/data-resources/list-of-hipaa-identifiers/" target="_blank" rel="noopener noreferrer">HIPAA Safe Harbor identifier categories</a>
            — names, dates and ages 90+, phone/fax/email, SSNs, MRNs, health plan and account numbers, license/certificate
            numbers, addresses, URLs/IP addresses, device identifiers, biometric identifiers, and other structured IDs.
          </p>
          <p class="muted">
            It does <strong>not</strong> process images or photographs (this tool only ever handles pasted text), has no
            dedicated detector for vehicle identifiers or license plates, and — like any rule- or model-based system — can miss
            unusual phrasing it wasn't trained or written to expect. This is a risk-reduction aid, not a certified
            guarantee that all identifying information has been removed. Always review flagged redactions before copying or sharing the result.
          </p>
        </details>
        ${renderQuickModelControlHtml}
        ${hasReview ? `
          <section class="quick-review-workspace">
            ${renderQuickDeidReviewHtml}
            <div class="quick-copy-footer">
              <span class="muted">Copy after you've reviewed and accepted the marked changes.</span>
              <button class="button--primary" type="button" data-action="copy-quick-deid-output">${icon("copy")} Copy result</button>
            </div>
          </section>
        ` : `
          <section class="quick-deid-start">
            <label for="quickDeidInput">Source text</label>
            <textarea id="quickDeidInput" aria-label="Source text" spellcheck="false" placeholder="Paste text from any source">${escapeHtml(quickDeidInput)}</textarea>
            <div class="quick-deid-start-footer">
              <span class="muted">The selected model runs locally. Your text isn't saved by this tool.</span>
              <button class="button--primary" type="button" data-action="run-quick-deid" ${deidReady ? "" : "disabled"}>${icon("shield")} Run de-identification</button>
            </div>
          </section>
        `}
      </section>
    `;
  }

  return Object.freeze({ renderQuickDeid, renderQuickDeidReview, renderQuickModelControl, renderOpenMedSmallFallback });
}
