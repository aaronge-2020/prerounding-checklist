import { createLocalDraftPrivacyReview } from "./local-draft-privacy-review.js?v=20261015-clinical-drafts";
import { sharedLocalLlmClient, localLlmModelByKey } from "../local-llm/client.js?v=20261015-stable-draft-runtime";
import { synthesizeLocalNote, planLocalNoteSynthesis, measureLocalNoteSource, SYNTHESIS_SECTIONS } from "../local-llm/note-synthesis.js?v=20261015-clinical-drafts";
import { deidentifyText, getSelectedDeidModelStatus, verifyAdvancedDeidModel } from "../patient-context/deid-client.js?v=20261012-safety";
import { DEFAULT_DEID_MODEL_KEY } from "../patient-context/deid-model-options.js?v=20261011-request-controls";
import { aiReviewElement as element, onAiSessionClear } from "./external-ai-review.js?v=20261015-simple-review";

import { createLocalModelControls } from "./local-model-controls.js?v=20261015-clinical-drafts";

export function openLocalNoteSynthesis({ source, sources = [], apply, copy, stillCurrent, client = sharedLocalLlmClient(), hardwareReport }) {
  const dialog = element("dialog", "", { class: "external-ai-review", "aria-label": "Draft on device", "data-local-note-synthesis": "", "data-local-draft-state": "editing" });
  dialog.append(element("h3", "Draft on device"), element("p", "Choose and load a model here, then draft locally. Downloads retrieve model files; chart text stays on this device. Review the source and draft before applying."));
  const section = element("select", "", { "aria-label": "Section to draft" });
  for (const [value, title] of Object.entries(SYNTHESIS_SECTIONS)) section.append(element("option", title, { value }));
  const reason = element("textarea", "", { rows: "2", "aria-label": "Visit focus", placeholder: "e.g. Diabetes follow-up, prenatal visit, or persistent cough", spellcheck: "false" });
  const today = element("textarea", "", { rows: "3", "aria-label": "Updates obtained today", placeholder: "Only information explicitly obtained today. Leave blank when precharting.", spellcheck: "false" });
  const input = element("textarea", "", { rows: "8", "aria-label": "Reviewed source material", spellcheck: "false" });
  input.value = source;
  const sourcePicker = element("select", "", { "aria-label": "Chart representation", "data-local-source-picker": "" });
  for (const choice of sources) sourcePicker.append(element("option", choice.label, { value: choice.id }));
  const sourceChoice = element("label", "Chart representation"); sourceChoice.append(sourcePicker); sourceChoice.hidden = sources.length < 2;
  const status = element("p", "", { role: "status", "data-local-draft-status": "" });
  const context = element("p", "", { "data-local-context-budget": "", role: "status", title: "Source tokens use the loaded model tokenizer when available; otherwise an explicit estimate. Per-pass budget includes instructions, source labels, output reserve and headroom." });
  const contextBar = element("progress", "", { max: "1", "aria-label": "Estimated context use per pass", "data-local-context-bar": "" });
  const privacySlot = element("div", "", { "data-local-privacy-slot": "" });
  let privacy = null;
  const questions = element("div", "", { "data-local-interview-questions": "" });
  const evidence = element("details", "", { "data-local-draft-evidence": "" });
  const todaySection = element("details"); todaySection.append(element("summary", "Information obtained today (optional)"), today);
  const outputLabel = element("label", "Proposed note text — review before applying"); outputLabel.hidden = true;
  const output = element("textarea", "", { rows: "10", "aria-label": "Proposed note text", readonly: "" });
  output.hidden = true; evidence.hidden = true;
  const generate = element("button", "Generate on device", { type: "button", "data-local-generate": "" });
  const accept = element("button", "Apply reviewed draft", { type: "button", "data-local-apply": "" });
  const copyButton = element("button", "Copy draft", { type: "button" });
  const close = element("button", "Cancel", { type: "button" });
  let closed = false;
  let version = 0;
  let busy = false;
  let modelControls = null;
  let tokenization = null;
  let measureTimer = null;
  let measurementRevision = 0;
  let approvedTarget = "";
  let result = "";
  const request = () => ({ source: input.value, todayUpdates: today.value, section: section.value, visitReason: reason.value });
  const renderBudget = budget => {
    context.textContent = `${budget.tokenizerMeasured ? "" : "≈"}${budget.sourceTokens.toLocaleString()} source tokens (${budget.tokenizerMeasured ? "model tokenizer" : "estimate until model loads"}) · ${budget.contextWindow.toLocaleString()} context · ${budget.sourcePasses} source pass${budget.sourcePasses === 1 ? "" : "es"}. Largest planned pass: ${budget.maxPassTokens.toLocaleString()} tokens including output and headroom. No silent truncation.${budget.excludedSourceUnits ? " Baseline scope excludes result tables, prior exams and plans; use HPI/full draft for those details." : ""}${budget.sourcePasses > 1 && budget.contextWindow <= 4096 ? " Choose a Qwen3.5 16K model for fewer passes." : ""}`;
    contextBar.value = Math.min(1, budget.maxPassTokens / budget.contextWindow);
  };
  const updateBudget = () => {
    try { renderBudget(planLocalNoteSynthesis(request(), modelControls?.getSelectedModel(), tokenization).budget); }
    catch (error) { context.textContent = error.message; contextBar.value = 1; }
  };
  const scheduleMeasurement = () => {
    clearTimeout(measureTimer);
    const revision = ++measurementRevision;
    if (closed || busy || !modelControls?.isReady()) return;
    measureTimer = setTimeout(async () => {
      if (closed || busy || revision !== measurementRevision) return;
      try {
        const measured = await measureLocalNoteSource(client, request(), modelControls.getSelectedModel());
        if (!closed && !busy && revision === measurementRevision) { tokenization = measured; updateBudget(); }
      } catch (error) { if (!closed && revision === measurementRevision) context.textContent = `Local token count unavailable: ${error.message}`; }
    }, 250);
  };
  const invalidate = (retainMeasurement = false) => { version++; dialog.dataset.localDraftState = "editing"; privacy?.clear(); privacy = null; privacySlot.replaceChildren(); if (!retainMeasurement) tokenization = null; result = ""; output.value = ""; output.hidden = true; outputLabel.hidden = true; evidence.hidden = true; evidence.replaceChildren(); questions.replaceChildren(); accept.disabled = true; copyButton.disabled = true; updateBudget(); scheduleMeasurement(); };
  for (const node of [section, reason, today, input]) node.addEventListener("input", () => invalidate());
  sourcePicker.addEventListener("change", () => { input.value = sources.find(choice => choice.id === sourcePicker.value)?.text || ""; invalidate(); });
  const clear = () => { closed = true; clearTimeout(measureTimer); measurementRevision++; invalidate(); modelControls.dispose(); void client.unload?.().catch(() => console.warn("Unable to stop local generation.")); stop(); dialog.close(); dialog.replaceChildren(); dialog.remove(); };
  modelControls = createLocalModelControls({ client, hardwareReport, onChange: () => { if (!busy) invalidate(); generate.disabled = busy || !modelControls?.isReady(); } });
  generate.disabled = !modelControls.isReady();
  updateBudget(); scheduleMeasurement();
  const stop = onAiSessionClear(clear);
  close.addEventListener("click", clear);
  dialog.addEventListener("cancel", event => { event.preventDefault(); clear(); });
  generate.addEventListener("click", async () => {
    if (busy) return;
    invalidate(true);
    const started = version;
    busy = true;
    dialog.dataset.localDraftState = "generating";
    generate.disabled = true;
    try {
      const loaded = client.getStatus();
      if (!modelControls.isReady()) throw new Error("Choose a model and load it in this dialog before generating.");
      const model = localLlmModelByKey(loaded.activeModelKey);
      status.textContent = `Selecting source-grounded facts with ${model.label}…`;
      modelControls.setBusy(true);
      const draft = await synthesizeLocalNote(client, { source: input.value, todayUpdates: today.value, section: section.value, visitReason: reason.value }, {
        isCurrent: () => !closed && version === started && stillCurrent(),
        onProgress: progress => { if (!closed) status.textContent = progress.message; }
      });
      // Clear chart-bearing model history while retaining loaded weights.
      await client.resetChat();
      const text = draft.text;
      renderBudget(draft.budget);
      if (closed || version !== started || !stillCurrent()) return;
      if (!getSelectedDeidModelStatus(DEFAULT_DEID_MODEL_KEY)?.ready) await verifyAdvancedDeidModel({ modelKey: DEFAULT_DEID_MODEL_KEY });
      if (!getSelectedDeidModelStatus(DEFAULT_DEID_MODEL_KEY)?.ready) throw new Error("Verify the local de-identification model before applying a draft.");
      const safe = await deidentifyText(String(text || ""), { mode: DEFAULT_DEID_MODEL_KEY, allowStructuredFallback: false });
      if (!safe?.modelId || safe.modelChunkFailures || !safe.text?.trim()) throw new Error("No usable de-identified draft was produced.");
      if (closed || version !== started || !stillCurrent()) return;
      result = safe.text;
      approvedTarget = section.value;
      output.value = result; output.rows = approvedTarget === "one_liner" ? 4 : 12; output.hidden = false; outputLabel.hidden = false; evidence.hidden = false;
      const updatePrivacy = () => {
        if (closed || !privacy) return;
        result = privacy.text(); output.value = result;
        accept.disabled = approvedTarget === "full_note" || privacy.pending();
        copyButton.disabled = privacy.pending();
      };
      privacy = createLocalDraftPrivacyReview(text, safe, updatePrivacy);
      privacySlot.append(privacy.element); updatePrivacy();
      evidence.append(element("summary", `Sources used: ${draft.evidence.length} exact excerpts`));
      for (const item of draft.evidence) evidence.append(element("p", `${item.id} · ${item.kind === "today" ? "Entered today" : "Prior / unconfirmed"}: ${item.text}`));
      dialog.dataset.localDraftState = "review";
      status.textContent = `Reviewed ${draft.chunks} source pass${draft.chunks === 1 ? "" : "es"}${draft.budget.excludedSourceUnits ? " within baseline/history scope" : ""}; selected ${draft.evidence.length} excerpts. Source facts remain historical unless entered today. Review relevance and completeness before applying.`;
    } catch (error) { if (!closed) { await client.unload?.(); dialog.dataset.localDraftState = "error"; status.textContent = error?.message || "Local generation failed. Nothing was applied."; } }
    finally { busy = false; modelControls.setBusy(false); generate.disabled = !modelControls.isReady(); scheduleMeasurement(); }
  });
  accept.addEventListener("click", () => { if (result && !privacy?.pending() && stillCurrent()) { apply(approvedTarget, result); clear(); } });
  copyButton.addEventListener("click", () => { if (result && !privacy?.pending() && stillCurrent()) void copy(result); });
  accept.disabled = true;
  copyButton.disabled = true;
  const controls = element("div", "", { class: "button-row" });
  controls.append(generate, accept, copyButton, close);
  dialog.append(modelControls.element, element("label", "Section to draft"), section, element("label", "Visit focus (optional)"), reason, sourceChoice, element("label", "Prior notes and copied chart context — not current findings"), input, todaySection, context, contextBar, status, outputLabel, output, privacySlot, questions, evidence, controls);
  document.body.append(dialog);
  dialog.showModal();
}
