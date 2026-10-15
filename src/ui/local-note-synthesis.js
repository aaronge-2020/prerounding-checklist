import { sharedLocalLlmClient, localLlmModelByKey } from "../local-llm/client.js?v=20261012-safety";
import { estimateTokens, TOKEN_SAFETY_MARGIN } from "../local-llm/context-budget.js?v=20260927-local-llm-v1";
import { buildLocalSynthesisMessages, SYNTHESIS_SECTIONS } from "../local-llm/note-synthesis.js?v=20261014-local-synthesis";
import { deidentifyText, getSelectedDeidModelStatus, verifyAdvancedDeidModel } from "../patient-context/deid-client.js?v=20261012-safety";
import { DEFAULT_DEID_MODEL_KEY } from "../patient-context/deid-model-options.js?v=20261011-request-controls";
import { aiReviewElement as element, onAiSessionClear } from "./external-ai-review.js?v=20261015-simple-review";

export function openLocalNoteSynthesis({ source, apply, copy, stillCurrent, client = sharedLocalLlmClient() }) {
  const dialog = element("dialog", "", { class: "external-ai-review", "aria-label": "Draft on device", "data-local-note-synthesis": "" });
  dialog.append(element("h3", "Draft on device"), element("p", "Uses the loaded, verified on-device model. No chart text is sent to an external AI. Review the source and draft before applying."));
  const section = element("select", "", { "aria-label": "Section to draft" });
  for (const [value, title] of Object.entries(SYNTHESIS_SECTIONS)) section.append(element("option", title, { value }));
  const reason = element("textarea", "", { rows: "2", "aria-label": "Visit reason and today's updates", placeholder: "Visit reason and explicitly obtained updates today", spellcheck: "false" });
  const input = element("textarea", "", { rows: "8", "aria-label": "Reviewed source material", spellcheck: "false" });
  input.value = source;
  const status = element("p", "Load and verify a local model in AI Chat before generating.", { role: "status" });
  const output = element("textarea", "", { rows: "10", "aria-label": "Proposed note text", readonly: "" });
  const generate = element("button", "Generate on device", { type: "button", "data-local-generate": "" });
  const accept = element("button", "Apply reviewed draft", { type: "button", "data-local-apply": "" });
  const copyButton = element("button", "Copy draft", { type: "button" });
  const close = element("button", "Cancel", { type: "button" });
  let closed = false;
  let version = 0;
  let busy = false;
  let approvedTarget = "";
  let result = "";
  const invalidate = () => { version++; result = ""; output.value = ""; accept.disabled = true; copyButton.disabled = true; };
  for (const node of [section, reason, input]) node.addEventListener("input", invalidate);
  const clear = () => { closed = true; invalidate(); stop(); dialog.close(); dialog.replaceChildren(); dialog.remove(); };
  const stop = onAiSessionClear(clear);
  close.addEventListener("click", clear);
  dialog.addEventListener("cancel", event => { event.preventDefault(); clear(); });
  generate.addEventListener("click", async () => {
    if (busy) return;
    invalidate();
    const started = version;
    busy = true;
    generate.disabled = true;
    try {
      const loaded = client.getStatus();
      if (loaded.status !== "ready" || !loaded.verified) throw new Error("Load and verify an on-device model in AI Chat first.");
      const model = localLlmModelByKey(loaded.activeModelKey);
      const messages = buildLocalSynthesisMessages({ source: input.value, section: section.value, visitReason: reason.value });
      const maxTokens = 1024;
      if (!model || messages.reduce((sum, message) => sum + estimateTokens(message.content), 0) + maxTokens + TOKEN_SAFETY_MARGIN > model.contextWindow) {
        throw new Error("The source exceeds this model's context budget. Select a smaller source or draft one section at a time. Nothing was truncated.");
      }
      status.textContent = `Generating with ${model.label} on this device…`;
      await client.resetChat();
      const text = await client.chat(messages, { maxTokens, temperature: 0, chatOpts: { extraBody: { enable_thinking: false } } });
      if (closed || version !== started || !stillCurrent()) return;
      if (!getSelectedDeidModelStatus(DEFAULT_DEID_MODEL_KEY)?.ready) await verifyAdvancedDeidModel({ modelKey: DEFAULT_DEID_MODEL_KEY });
      if (!getSelectedDeidModelStatus(DEFAULT_DEID_MODEL_KEY)?.ready) throw new Error("Verify the local de-identification model before applying a draft.");
      const safe = await deidentifyText(String(text || ""), { mode: DEFAULT_DEID_MODEL_KEY, allowStructuredFallback: false });
      if (!safe?.modelId || safe.modelChunkFailures || !safe.text?.trim()) throw new Error("No usable de-identified draft was produced.");
      if (closed || version !== started || !stillCurrent()) return;
      result = safe.text;
      approvedTarget = section.value;
      output.value = result;
      accept.disabled = approvedTarget === "full_note";
      copyButton.disabled = false;
      status.textContent = "Review every statement against the sources. Applying replaces only the selected section; a complete draft can be copied.";
    } catch (error) { if (!closed) status.textContent = error?.message || "Local generation failed. Nothing was applied."; }
    finally { busy = false; generate.disabled = false; }
  });
  accept.addEventListener("click", () => { if (result && stillCurrent()) { apply(approvedTarget, result); clear(); } });
  copyButton.addEventListener("click", () => { if (result && stillCurrent()) void copy(result); });
  accept.disabled = true;
  copyButton.disabled = true;
  const controls = element("div", "", { class: "button-row" });
  controls.append(generate, accept, copyButton, close);
  dialog.append(element("label", "Section to draft"), section, element("label", "Visit reason and updates obtained today"), reason, element("label", "Source material — remove anything irrelevant"), input, status, element("label", "Proposed note text — review before applying"), output, controls);
  document.body.append(dialog);
  dialog.showModal();
}
