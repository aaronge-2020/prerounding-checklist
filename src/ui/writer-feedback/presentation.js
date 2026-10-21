// Writer feedback panel markup. Pure presentation: it takes the view model
// from the writer feedback controller and returns a string. No DOM access,
// no storage, no engine calls. All model text is escaped by the caller-
// supplied escapeHtml before it lands in the page.

function scopeButton(vm, value, label, escapeHtml) {
  const active = vm.scope === value;
  return `<button type="button" class="button--small ${active ? "button--primary" : "button--secondary"}" data-wf-action="wf-scope" data-wf-scope="${value}" aria-pressed="${active}">${escapeHtml(label)}</button>`;
}

function engineButton(vm, value, label, escapeHtml) {
  const active = vm.engine === value;
  return `<button type="button" class="button--small ${active ? "button--primary" : "button--secondary"}" data-wf-action="wf-engine" data-wf-engine="${value}" aria-pressed="${active}">${escapeHtml(label)}</button>`;
}

function renderItem(item, escapeHtml) {
  const rewrite = item.rewrite
    ? `<div class="wf-rewrite"><span class="wf-rewrite-label">Suggested rewrite</span><pre>${escapeHtml(item.rewrite)}</pre>${item.canApply
      ? `<div class="button-row"><button type="button" class="button--primary button--small" data-wf-action="wf-apply" data-wf-item="${escapeHtml(item.id)}">Apply rewrite</button><button type="button" class="button--secondary button--small" data-wf-action="wf-dismiss" data-wf-item="${escapeHtml(item.id)}">Dismiss</button></div>`
      : `<p class="muted">The plan is written as separate problems, so this rewrite is not applied for you. Edit the problems above to use it.</p>`}</div>`
    : `<div class="button-row"><button type="button" class="button--secondary button--small" data-wf-action="wf-dismiss" data-wf-item="${escapeHtml(item.id)}">Dismiss</button></div>`;
  return `<article class="wf-item" data-wf-item-row="${escapeHtml(item.id)}">
    <div class="wf-item-head"><strong>${escapeHtml(item.sectionLabel)}</strong><span class="wf-kind wf-kind--${escapeHtml(item.kind)}">${escapeHtml(item.kindLabel)}</span></div>
    <p class="wf-comment">${escapeHtml(item.comment)}</p>
    ${rewrite}
  </article>`;
}

export function renderWriterFeedbackPanel(vm, escapeHtml) {
  if (!vm?.open) return "";
  const notice = vm.notice
    ? `<div class="wf-notice" role="status"><p>${escapeHtml(vm.notice.text)}</p>${vm.notice.action
      ? `<button type="button" class="button--secondary button--small" data-wf-action="${escapeHtml(vm.notice.action)}">${escapeHtml(vm.notice.actionLabel)}</button>`
      : ""}</div>`
    : "";
  const items = (vm.items || []).length
    ? `<div class="wf-items">${vm.items.map((item) => renderItem(item, escapeHtml)).join("")}</div>`
    : "";
  return `<section class="wf-panel" aria-label="AI feedback on your writing" data-writer-feedback-panel>
    <div class="wf-panel-head">
      <div><h3>AI feedback on your writing</h3><p class="muted">Feedback is graded against the section standards in this app. It stays in this tab and is not saved.</p></div>
      <button type="button" class="button--secondary button--small" data-wf-action="wf-close">Close</button>
    </div>
    <div class="wf-controls">
      <div class="wf-control-group" role="group" aria-label="Feedback scope">
        <span class="wf-control-label">Scope</span>
        ${scopeButton(vm, "whole", "Whole note", escapeHtml)}
        ${scopeButton(vm, "section", vm.lastSectionLabel ? `This section: ${vm.lastSectionLabel}` : "This section", escapeHtml)}
      </div>
      <div class="wf-control-group" role="group" aria-label="Feedback engine">
        <span class="wf-control-label">Engine</span>
        ${engineButton(vm, "local", "On device", escapeHtml)}
        ${engineButton(vm, "openai", "OpenAI", escapeHtml)}
      </div>
      ${vm.running
        ? `<button type="button" class="button--secondary button--small" data-wf-action="wf-stop">Stop</button>`
        : `<button type="button" class="button--primary button--small" data-wf-action="wf-run">Run feedback</button>`}
    </div>
    ${vm.scope === "whole" && (vm.wholeSectionLabels || []).length ? `<p class="muted wf-scope-note">Whole note grades: ${vm.wholeSectionLabels.map((label) => escapeHtml(label)).join(", ")}.</p>` : ""}
    ${vm.engine === "local" && !vm.running ? `<p class="muted wf-send-note">On device feedback runs on this device. It needs a downloaded model.${vm.localModelReady ? "" : " No model is ready yet."}</p>` : ""}
    ${vm.engine === "openai" && !vm.running ? `<p class="muted wf-send-note">OpenAI feedback sends the de-identified text in scope. You review the exact text before it sends. It uses your saved key, and OpenAI charges for use.</p>` : ""}
    ${vm.statusText ? `<p class="wf-status" role="status">${escapeHtml(vm.statusText)}</p>` : ""}
    ${vm.error ? `<p class="wf-error" role="alert">${escapeHtml(vm.error)}</p>` : ""}
    ${notice}
    ${items}
  </section>`;
}
