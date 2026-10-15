import { sharedLocalLlmClient, getLocalLlmHardwareReport, readLocalLlmSettings, writeLocalLlmSettings, readLocalLlmDownloaded } from "../local-llm/client.js?v=20261015-stable-draft-runtime";
import { recommendLocalLlmModels } from "../local-llm/models.js?v=20261015-stable-draft-runtime";
import { aiReviewElement as element } from "./external-ai-review.js?v=20261015-simple-review";

// Local model lifecycle belongs next to the task that needs it. This view uses
// the shared client, so AI Chat and note drafting cannot load separate engines.
export function createLocalModelControls({ client = sharedLocalLlmClient(), hardwareReport = getLocalLlmHardwareReport, onChange = () => {} } = {}) {
  const root = element("details", "", { class: "local-model-controls", "data-local-model-controls": "" });
  root.open = true;
  const summary = element("summary", "Choose and load an on-device model");
  const select = element("select", "", { "aria-label": "On-device drafting model", "data-local-model-select": "" });
  const hardware = element("p", "Checking this browser's GPU capabilities…", { "data-local-hardware": "" });
  const description = element("p");
  const status = element("p", "", { role: "status", "data-local-model-status": "" });
  const progress = element("progress", "", { max: "1", "aria-label": "Local model loading progress" });
  const load = element("button", "Download and load", { type: "button", "data-local-model-load": "" });
  const cancel = element("button", "Cancel load", { type: "button", "data-local-model-cancel": "" });
  const options = element("details");
  options.append(element("summary", "Known GPU or unified memory (optional)"));
  const kind = element("select", "", { "aria-label": "Memory type", "data-local-memory-kind": "" });
  kind.append(element("option", "Dedicated GPU memory", { value: "dedicated" }), element("option", "Unified memory (Apple Silicon)", { value: "unified" }));
  const memory = element("input", "", { type: "number", min: "1", max: "256", step: "1", placeholder: "e.g. 12", "aria-label": "Known memory in GB", "data-local-memory-gb": "" });
  const memoryLabel = element("label", "Capacity in GB"); memoryLabel.append(memory);
  options.append(kind, memoryLabel, element("p", "Browsers do not report exact VRAM. Enter a capacity you know to refine the estimate; this stays in the current dialog. Unified memory reserves more room for the OS and browser."));
  const label = element("label", "On-device model"); label.append(select);
  const buttons = element("div", "", { class: "button-row" }); buttons.append(load, cancel);
  root.append(summary, label, hardware, options, description, progress, status, buttons);
  let report = null;
  let recommendation = null;
  let disposed = false;
  let ownLoad = false;
  let taskBusy = false;
  let wasReady = false;
  let failure = "";
  let signature = "";
  let selectionPinned = !!(client.getStatus().activeModelKey || readLocalLlmSettings().selectedModelKey);
  const downloaded = readLocalLlmDownloaded();
  const isReady = () => {
    const state = client.getStatus();
    return !!recommendation?.availableKeys.includes(select.value) && state.status === "ready" && state.verified && state.activeModelKey === select.value && !ownLoad;
  };
  const render = () => {
    if (disposed) return;
    const state = client.getStatus();
    const loading = ownLoad || state.status === "loading";
    const ready = isReady();
    if (ready && !wasReady) root.open = false;
    if (state.status === "error") root.open = true;
    wasReady = ready;
    summary.textContent = ready ? `Model: ${recommendation?.models.find(entry => entry.model.key === select.value)?.model.label} · ready` : loading ? "Loading on-device model…" : state.status === "error" ? "Model failed — open to retry" : "Choose and load an on-device model";
    select.disabled = !report || loading || taskBusy || !recommendation?.availableKeys.length;
    memory.disabled = loading || taskBusy; kind.disabled = loading || taskBusy;
    load.disabled = !recommendation?.availableKeys.includes(select.value) || loading || taskBusy || isReady();
    cancel.hidden = !loading;
    progress.hidden = !loading;
    progress.value = Math.max(0, Math.min(1, Number(state.progress) || 0));
    const entry = recommendation?.models.find(item => item.model.key === select.value);
    description.textContent = entry ? `${entry.model.blurb} Estimated GPU use: ${(entry.model.vramMB / 1024).toFixed(1)} GB; download: ${(entry.model.approxDownloadMB / 1024).toFixed(1)} GB. ${entry.note}` : "";
    if (entry?.model.key === "qwen3.5-2b") description.textContent += " In a small synthetic test this model missed useful excerpts in one case. Prefer 4B when it fits.";
    if (entry?.model.key === "qwen3.5-9b") description.textContent += " Experimental for dense drafting: 9B missed the patient baseline in the latest focused check. Prefer 4B for one-liners; larger does not guarantee a more useful draft.";
    if (entry && report?.storageAvailableMB !== null && report.storageAvailableMB < entry.model.approxDownloadMB && !downloaded[entry.model.key]) description.textContent += " Browser storage appears insufficient for this download; free space first.";
    load.textContent = downloaded[select.value] ? "Load cached model" : failure ? "Retry loading" : "Download and load";
    status.textContent = failure || (state.status === "error" ? state.statusDetail || "Model failed. Retry or choose a smaller model." : loading ? state.progressText || state.statusDetail || "Preparing model load…" : isReady() ? `${entry?.model.label} loaded and self-tested. Ready to draft.` : report ? recommendation?.availableKeys.length ? "Select a model, then load and verify it here." : "No compatible model available. Check browser WebGPU support and the memory guidance." : "");
    const next = `${select.value}:${state.activeModelKey}:${state.status}:${state.verified}:${isReady()}`;
    if (next !== signature) { signature = next; onChange(); }
  };
  const rebuild = () => {
    if (!report || disposed) return;
    recommendation = recommendLocalLlmModels(report.facts, report.gpu || report.recommendation?.gpu || report.recommendation?.webgpuAvailable, { memoryGB: Number(memory.value), memoryKind: kind.value });
    // Drafting evidence takes priority over choosing the largest model that fits.
    if (recommendation.recommendedKey === "qwen3.5-9b" && recommendation.availableKeys.includes("qwen3.5-4b")) recommendation = { ...recommendation, recommendedKey: "qwen3.5-4b" };
    const excluded = new Set(recommendation.models.filter(entry => entry.model.draftingExcludedReason).map(entry => entry.model.key));
    recommendation = { ...recommendation, models: recommendation.models.filter(entry => !excluded.has(entry.model.key)), availableKeys: recommendation.availableKeys.filter(key => !excluded.has(key)) };
    const previous = selectionPinned ? select.value || client.getStatus().activeModelKey || readLocalLlmSettings().selectedModelKey : "";
    select.replaceChildren();
    for (const entry of recommendation.models) {
      const option = element("option", `${entry.model.label} · ${entry.model.contextWindow / 1024}K context${entry.model.key === recommendation.recommendedKey ? " — suggested" : ""}${entry.available ? "" : " — unavailable"}`, { value: entry.model.key });
      option.disabled = !entry.available; select.append(option);
    }
    select.value = recommendation.availableKeys.includes(previous) ? previous : recommendation.recommendedKey || "";
    const hint = report.facts?.deviceMemoryGB;
    hardware.textContent = `${recommendation.webgpuAvailable ? "WebGPU available" : "WebGPU unavailable"}${report.gpu?.shaderF16 === false ? "; shader-f16 unavailable" : ""}. ${report.gpu?.adapterDescription || ""} ${typeof hint === "number" ? `Browser RAM hint: ${hint} GB (approximate/capped).` : "System memory not reported."} Exact GPU memory is unknown.`;
    if (recommendation.capacity) hardware.textContent += ` Using your ${recommendation.capacity.memoryGB} GB ${recommendation.capacity.memoryKind} memory estimate.`;
    hardware.textContent += " Qwen3.5 9B is withheld from drafting after failed baseline/GPU checks; it remains in AI Chat.";
    render();
  };
  select.addEventListener("change", () => { selectionPinned = true; failure = ""; onChange(); render(); });
  memory.addEventListener("input", rebuild); kind.addEventListener("change", rebuild);
  load.addEventListener("click", async () => {
    if (load.disabled || ownLoad) return;
    ownLoad = true; failure = ""; onChange(); render();
    const key = select.value;
    try {
      await client.ensureReady(key);
      if (!disposed) { downloaded[key] = true; writeLocalLlmSettings({ selectedModelKey: key }); }
    } catch (error) { if (!disposed) failure = error?.name === "AbortError" ? "Model load cancelled. Cached downloads are retained." : error?.message || "Model loading failed. Retry or choose a smaller model."; }
    finally { ownLoad = false; render(); }
  });
  const cancelLoad = async () => {
    try { await client.unload(); }
    catch { if (!disposed) failure = "Unable to stop the local model. Reload this page before retrying."; }
    render();
  };
  cancel.addEventListener("click", cancelLoad);
  const unsubscribe = client.onStatusChange?.(render);
  render();
  void (async () => {
    try { report = await hardwareReport(); rebuild(); }
    catch { if (!disposed) { failure = "Hardware detection failed. Check browser WebGPU settings and reopen this dialog."; render(); } }
  })();
  if (client.cachedModels) void client.cachedModels().then(actual => { if (!disposed) { Object.assign(downloaded, actual); render(); } }, () => { if (!disposed) { failure = "Model cache status could not be checked. A load may need to download files."; render(); } });
  return { element: root, isReady, getSelectedModel: () => recommendation?.models.find(entry => entry.model.key === select.value)?.model || null, setBusy(value) { taskBusy = value; render(); }, dispose() { disposed = true; unsubscribe?.(); if (ownLoad) void cancelLoad(); } };
}
