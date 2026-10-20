// Pure progress wording for a running de-identification operation.
//
// The operation bar used to show only a progress element and a message, so a
// long run looked frozen: no percent, no step count, and no clock. These
// helpers turn the operation state the controllers already maintain
// (value/total plus a startedAt timestamp) into the three pieces of text the
// bar renders. No percent is invented when the step count is unknown.

export function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds) || 0) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function deidOperationProgress(operation = {}, now = Date.now()) {
  const value = Number(operation.value);
  const total = Number(operation.total);
  const hasSteps = Number.isFinite(value) && Number.isFinite(total) && total > 0;
  const startedAt = Number(operation.startedAt);
  return {
    percent: hasSteps ? Math.min(100, Math.max(0, Math.round((value / total) * 100))) : null,
    stepText: hasSteps ? `Step ${Math.min(Math.max(0, value), total)} of ${total}` : "",
    elapsedText: Number.isFinite(startedAt) && startedAt > 0 ? formatElapsed(now - startedAt) : ""
  };
}

// Renders the shared operation-bar markup used by both de-id strips. The
// elapsed span carries data-deid-operation-elapsed so the app's 1-second
// ticker can update the clock without re-rendering the view.
export function renderDeidOperationMarkup(operation = {}, escapeHtml, now = Date.now()) {
  const progress = deidOperationProgress(operation, now);
  const detail = [progress.stepText, progress.elapsedText ? `${progress.elapsedText} elapsed` : ""].filter(Boolean).join(" · ");
  return `
      <div class="deid-operation ${operation.active ? "is-active" : ""}" data-deid-operation aria-live="polite">
        <progress data-deid-operation-progress ${Number.isFinite(operation.value) ? `value="${Math.max(0, operation.value)}" max="${Math.max(1, operation.total || 1)}"` : ""}></progress>
        <span data-deid-operation-message>${escapeHtml(operation.message || "")}</span>
        <span class="deid-operation-detail" data-deid-operation-elapsed>${escapeHtml(detail)}</span>
      </div>`;
}
