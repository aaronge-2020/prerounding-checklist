// Writer feedback controller: session state and engine wiring for the
// "Get AI feedback" panel inside the note writer. DOM rendering lives in
// presentation.js; prompt assembly and reply parsing live in the pure
// module src/note-drafts/feedback.js. This controller owns no persistence
// format: feedback items live in memory only, are never written to the
// vault, and are cleared on patient switch and on session clear (it
// registers with onAiSessionClear and the review controller calls clear()
// when the patient/packet scope changes).
import {
  FEEDBACK_KIND_LABELS,
  FEEDBACK_PROMPT_MAX_CHARS,
  buildFeedbackSections,
  buildWriterFeedbackPrompt,
  parseWriterFeedback,
  sectionsInScope
} from "../../note-drafts/feedback.js?v=20261021-writer-feedback";
import {
  FEEDBACK_ENGINES,
  loadPersistedFeedbackEngine,
  persistFeedbackEngine
} from "../../app/feedback-preference.js?v=20261021-writer-feedback";
import { sharedLocalLlmClient } from "../../local-llm/client.js?v=20261015-stable-draft-runtime";
import { onAiSessionClear } from "../external-ai-review.js?v=20261015-simple-review";
import { generateWriterFeedbackWithOpenAi } from "./openai-feedback.js?v=20261021-writer-feedback";

export function createWriterFeedbackController(deps = {}) {
  const storage = deps.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  const state = {
    open: false,
    scope: "whole",
    engine: loadPersistedFeedbackEngine(storage),
    running: false,
    statusText: "",
    error: "",
    notice: null,
    items: []
  };
  let runToken = 0;
  let abortController = null;

  const rerender = () => deps.rerender?.();
  const localClient = () => deps.localClient || sharedLocalLlmClient();

  function lastSectionLabel() {
    try {
      const ctx = deps.getContext?.();
      if (!ctx?.draft) return "";
      const sections = buildFeedbackSections(ctx.draft);
      return sections.find((section) => section.id === deps.getLastSectionId?.())?.label || "";
    } catch {
      return "";
    }
  }

  function viewModel(extra = {}) {
    return {
      open: state.open,
      scope: state.scope,
      engine: state.engine,
      running: state.running,
      statusText: state.statusText,
      error: state.error,
      notice: state.notice,
      items: state.items,
      lastSectionLabel: extra.lastSectionLabel ?? lastSectionLabel()
    };
  }

  function clear() {
    runToken += 1;
    abortController?.abort();
    abortController = null;
    state.open = false;
    state.running = false;
    state.statusText = "";
    state.error = "";
    state.notice = null;
    state.items = [];
  }
  onAiSessionClear(clear);

  function plainMessage(error) {
    const message = String(error?.message || "").trim();
    return message || "Feedback failed. Your note is unchanged.";
  }

  async function run() {
    if (state.running) return;
    state.error = "";
    state.notice = null;
    const ctx = deps.getContext?.();
    if (!ctx?.draft) {
      state.error = "Open a patient note first, then run feedback.";
      rerender();
      return;
    }
    const sections = buildFeedbackSections(ctx.draft);
    const scoped = sectionsInScope(sections, state.scope, deps.getLastSectionId?.() || "");
    if (!scoped.length) {
      state.error = "There is no section in scope. Write a section first, then run feedback.";
      rerender();
      return;
    }
    const prompt = buildWriterFeedbackPrompt({ noteType: ctx.noteType, sections: scoped });
    if (prompt.instructions.length + prompt.input.length > FEEDBACK_PROMPT_MAX_CHARS) {
      state.error = "This note is too long for one feedback run. Switch to This section and run again.";
      rerender();
      return;
    }
    const sectionIds = scoped.map((section) => section.id);

    if (state.engine === "local") {
      const status = localClient().getStatus();
      if (!(status.status === "ready" && status.verified)) {
        state.notice = {
          kind: "no-model",
          text: "No on-device model is ready yet. Get a model in the Model menu, or switch to OpenAI above.",
          action: "wf-get-model",
          actionLabel: "Get a model"
        };
        rerender();
        return;
      }
    } else {
      const preferences = deps.preferences?.() || {};
      if (!String(preferences.openAiApiKey || "").trim()) {
        state.notice = {
          kind: "no-key",
          text: "No OpenAI API key is saved. Add one in Settings, then run feedback again.",
          action: "wf-open-settings",
          actionLabel: "Open Settings"
        };
        rerender();
        return;
      }
    }

    const token = ++runToken;
    state.running = true;
    state.items = [];
    state.statusText = state.engine === "local"
      ? "Reading your note on this device. Nothing leaves this browser."
      : "Preparing the text for your review. Nothing sends until you approve it.";
    rerender();
    try {
      let parsed;
      if (state.engine === "local") {
        const client = localClient();
        const raw = await client.chat([
          { role: "system", content: prompt.instructions },
          { role: "user", content: prompt.input }
        ], { temperature: 0.2, maxTokens: 1600 });
        // Clear chart-bearing model history while retaining loaded weights,
        // the same rule local note drafting follows.
        await client.resetChat().catch(() => console.warn("Unable to clear local model history after feedback."));
        if (token !== runToken) return;
        parsed = parseWriterFeedback(raw, { sectionIds });
      } else {
        const preferences = deps.preferences?.() || {};
        abortController = new AbortController();
        parsed = await generateWriterFeedbackWithOpenAi({
          apiKey: preferences.openAiApiKey,
          model: preferences.openAiModel,
          prompt,
          sectionIds,
          signal: abortController.signal
        });
        if (token !== runToken) return;
      }
      const bySection = new Map(sections.map((section) => [section.id, section]));
      state.items = parsed.items.map((item) => ({
        ...item,
        sectionLabel: bySection.get(item.sectionId)?.label || item.sectionId,
        kindLabel: FEEDBACK_KIND_LABELS[item.kind] || item.kind,
        canApply: !!bySection.get(item.sectionId)?.canApply
      }));
      state.statusText = parsed.items.length
        ? `${parsed.items.length} feedback item${parsed.items.length === 1 ? "" : "s"}. Nothing was applied.`
        : "The model found nothing to flag in scope.";
    } catch (error) {
      if (token !== runToken) return;
      if (error?.name === "AbortError") {
        state.statusText = "Feedback stopped. Your note is unchanged.";
      } else {
        state.error = plainMessage(error);
        state.statusText = "";
      }
    } finally {
      if (token === runToken) {
        state.running = false;
        abortController = null;
        rerender();
      }
    }
  }

  function stop() {
    if (!state.running) return;
    runToken += 1;
    abortController?.abort();
    abortController = null;
    if (state.engine === "local") void localClient().unload?.().catch(() => console.warn("Unable to stop local generation."));
    state.running = false;
    state.statusText = "Feedback stopped. Your note is unchanged.";
    rerender();
  }

  function applyItem(itemId) {
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item?.rewrite || !item.canApply) return;
    if (deps.applyRewrite?.(item.sectionId, item.rewrite)) {
      state.items = state.items.filter((entry) => entry.id !== itemId);
      deps.setStatus?.(`Rewrite applied to ${item.sectionLabel}. Review it in the note.`);
    } else {
      deps.setStatus?.("That rewrite could not be applied. The section may have changed since the run.");
    }
  }

  function handleAction(action, dataset = {}) {
    switch (action) {
      case "wf-open": state.open = true; break;
      case "wf-toggle": state.open = !state.open; break;
      case "wf-close": state.open = false; break;
      case "wf-scope":
        state.scope = dataset.wfScope === "section" ? "section" : "whole";
        state.error = "";
        break;
      case "wf-engine":
        if (FEEDBACK_ENGINES.includes(dataset.wfEngine)) {
          state.engine = dataset.wfEngine;
          persistFeedbackEngine(storage, state.engine);
          state.notice = null;
          state.error = "";
        }
        break;
      case "wf-run": void run(); return true;
      case "wf-stop": stop(); return true;
      case "wf-apply": applyItem(dataset.wfItem); return true;
      case "wf-dismiss":
        state.items = state.items.filter((entry) => entry.id !== dataset.wfItem);
        break;
      case "wf-get-model": deps.openModelMenu?.(); return true;
      case "wf-open-settings": deps.openSettings?.(); return true;
      default: return false;
    }
    rerender();
    return true;
  }

  return Object.freeze({ viewModel, handleAction, run, stop, clear });
}
