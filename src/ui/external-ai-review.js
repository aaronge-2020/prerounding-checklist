import { createExternalRequestReview, externalReviewGroups } from "../ai/external-request-review.js?v=20261015-simple-review";
import { deidentifyText, getSelectedDeidModelStatus, verifyAdvancedDeidModel } from "../patient-context/deid-client.js?v=20261012-safety";
import { DEFAULT_DEID_MODEL_KEY } from "../patient-context/deid-model-options.js?v=20261011-request-controls";
import { assertRemoteAllowed, gatedFetch, onOfflineModeChange } from "../lib/network-gate.js?v=20261012-safety";

const pending = new Set();
const activeRequests = new Set();
const sessionCleanups = new Set();
export function onAiSessionClear(callback) {
  sessionCleanups.add(callback);
  return () => sessionCleanups.delete(callback);
}
export function cancelExternalAiReviews() {
  for (const clear of [...sessionCleanups]) clear();
  cancelPendingRequests();
}
function cancelPendingRequests() {
  for (const cancel of [...pending]) cancel();
  for (const controller of activeRequests) controller.abort();
}
onOfflineModeChange(offline => { if (offline) cancelPendingRequests(); });

export function aiReviewElement(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
const element = aiReviewElement;

// Called at the network edge, including agent follow-up requests and history
// compression. No caller can mark newly typed text as already de-identified.
export function reviewExternalAiRequest(endpoint, body, { signal, literatureOnly = false, deidentify = deidentifyText, ensureReady } = {}) {
  assertRemoteAllowed(endpoint);
  const review = createExternalRequestReview(endpoint, body, { literatureOnly });
  if (typeof document === "undefined" || !document.body) throw new Error("External AI requires an interactive privacy review.");
  if (pending.size) throw new Error("Finish or cancel the current external AI review first.");
  return new Promise((resolve, reject) => {
    const dialog = element("dialog", "", { class: "external-ai-review", "aria-label": "Review external AI request", "data-external-ai-review": "" });
    dialog.append(element("h3", literatureOnly ? "Review search question" : "Review before sending"));
    dialog.append(element("p", `${new URL(endpoint).hostname} · ${body.model}`, { class: "external-ai-destination" }));
    dialog.append(element("p", literatureOnly ? "Only this question goes to web search. Include just the clinical details needed to find evidence." : "Review your question and the included context. Open any section to inspect or edit its full text."));
    const editor = element("div");
    const status = element("p", "Checking privacy on this device…", { role: "status", "data-external-review-status": "" });
    const preview = element("pre", "", { "data-external-request-preview": "", tabindex: "0" });
    const checkbox = (label, attr) => {
      const row = element("label", "", { class: "external-ai-ack" });
      const input = element("input", "", { type: "checkbox", [attr]: "" });
      row.append(input, document.createTextNode(` ${label}`));
      dialog.append(row);
      return input;
    };
    const exact = element("details");
    exact.append(element("summary", "Technical request details"), element("p", "Every section above is included. The app cannot verify institutional permission or provider retention settings."), preview);
    dialog.append(status, editor, exact);
    const inspected = checkbox(literatureOnly ? "I reviewed this question for identifiers and unnecessary clinical details." : "I reviewed the included text for identifiers and unnecessary details.", "data-external-reviewed");
    const permitted = checkbox("My institution permits this provider and configuration for this use.", "data-external-permitted");
    const general = literatureOnly ? inspected : null;
    if (general) general.setAttribute("data-external-search-reviewed", "");
    const controls = element("div", "", { class: "button-row" });
    const scan = element("button", "Check again", { type: "button", "data-external-scan": "" });
    const send = element("button", "Approve and send", { type: "button", "data-external-send": "" });
    send.disabled = true;
    const cancel = element("button", "Cancel", { type: "button", "data-external-cancel": "" });
    controls.append(scan, send, cancel);
    dialog.append(controls);
    let ready = false;
    let finished = false;
    let scanning = false;
    const refresh = () => { send.disabled = !ready || !inspected.checked || !permitted.checked || (general && !general.checked); };
    const invalidate = () => { ready = false; inspected.checked = false; permitted.checked = false; if (general) general.checked = false; preview.textContent = ""; status.textContent = "Request changed — scan and review again."; refresh(); };
    const renderFields = ({ changedPaths = [], warningPaths = [] } = {}) => {
      const expanded = new Set([...editor.querySelectorAll("details[open]")].map(node => node.dataset.externalGroup));
      const contains = (paths, field) => paths.some(path => JSON.stringify(path) === JSON.stringify(field.path));
      editor.replaceChildren();
      for (const group of externalReviewGroups(body, review.fields(), { literatureOnly })) {
        const container = element(group.primary ? "section" : "details", "", { "data-external-group": group.key });
        const changed = group.fields.some(field => contains(changedPaths, field));
        const warned = group.fields.some(field => contains(warningPaths, field));
        const suffix = warned ? " — privacy warning" : changed ? " — updated locally" : "";
        container.append(element(group.primary ? "h4" : "summary", `${group.title}${group.primary ? "" : ` (${group.fields.length})`}${suffix}`));
        if (!group.primary) container.open = warned || expanded.has(group.key);
        for (const field of group.fields) {
          const label = element("label", group.fields.length > 1 ? field.label : "", { class: "external-ai-field" });
          const input = element("textarea", "", { rows: group.primary ? "6" : "4", spellcheck: "false", autocomplete: "off", "aria-label": field.label, "data-external-field": field.path.join(".") });
          input.value = field.text;
          input.addEventListener("input", () => { review.edit(field.path, input.value); invalidate(); });
          label.append(input);
          container.append(label);
        }
        editor.append(container);
      }
    };
    const finish = (value, error) => {
      if (finished) return;
      finished = true;
      pending.delete(abort);
      signal?.removeEventListener("abort", abort);
      dialog.close();
      dialog.replaceChildren();
      dialog.remove();
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(null, new DOMException("External AI request cancelled. Nothing was sent.", "AbortError"));
    pending.add(abort);
    signal?.addEventListener("abort", abort, { once: true });
    cancel.addEventListener("click", abort);
    dialog.addEventListener("cancel", event => { event.preventDefault(); abort(); });
    for (const input of [inspected, permitted, general].filter(Boolean)) input.addEventListener("change", refresh);
    const runScan = async () => {
      if (scanning) return;
      if (literatureOnly) {
        const question = review.fields().find(field => field.path[0] === "input")?.text || "";
        if (!question.trim() || question.length > 2000) {
          invalidate();
          status.textContent = "Enter a focused evidence question of 2000 characters or fewer, then scan again. Nothing was sent.";
          return;
        }
      }
      scanning = true;
      invalidate();
      status.textContent = "Running the local clinical de-identifier…";
      scan.disabled = true;
      try {
        if (ensureReady) await ensureReady();
        else {
          if (!getSelectedDeidModelStatus(DEFAULT_DEID_MODEL_KEY)?.ready) await verifyAdvancedDeidModel({ modelKey: DEFAULT_DEID_MODEL_KEY });
          if (!getSelectedDeidModelStatus(DEFAULT_DEID_MODEL_KEY)?.ready) throw new Error("Local de-identification is not verified.");
        }
        const result = await review.scan(text => deidentify(text, { mode: DEFAULT_DEID_MODEL_KEY, allowStructuredFallback: false }));
        if (finished) return;
        renderFields(result);
        preview.textContent = JSON.stringify(result.body, null, 2);
        status.textContent = result.warnings.length ? `Scan complete. ${result.warnings.join(" ")} Check the expanded sections before sending.` : "Scan complete. Review the text for anything the check missed.";
        ready = true;
      } catch { if (!finished) status.textContent = "Local scan failed or the request changed. Nothing was sent. Retry after verifying the local de-identification model."; }
      finally { scanning = false; scan.disabled = false; refresh(); }
    };
    scan.addEventListener("click", runScan);
    send.addEventListener("click", () => {
      try {
        assertRemoteAllowed(endpoint);
        const approved = review.approve({ reviewedContent: inspected.checked, permittedProvider: permitted.checked, reviewedSearchQuestion: general?.checked });
        finish(approved);
      } catch { invalidate(); }
    });
    renderFields();
    document.body.append(dialog);
    dialog.showModal();
    if (signal?.aborted) abort();
    else void runScan();
  });
}

export async function reviewedAiFetch(input, init = {}) {
  const endpoint = String(input);
  assertRemoteAllowed(endpoint);
  const controller = new AbortController();
  const abort = () => controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  if (init.signal?.aborted) abort();
  activeRequests.add(controller);
  try {
    const body = await reviewExternalAiRequest(endpoint, JSON.parse(init.body), { signal: controller.signal, literatureOnly: init.literatureOnly === true });
    if (controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
    assertRemoteAllowed(endpoint);
    const { literatureOnly: _purpose, onRequestReady, ...request } = init;
    onRequestReady?.(body);
    return await gatedFetch(endpoint, { ...request, body, signal: controller.signal, redirect: "error" });
  } finally {
    activeRequests.delete(controller);
    init.signal?.removeEventListener("abort", abort);
  }
}
