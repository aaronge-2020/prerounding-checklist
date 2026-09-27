// Pure markup for the Local AI view: compact chat-first interface.
// State is passed in; DOM updates and the model lifecycle live in
// src/ui/local-ai/controller.js.

import { splitThinking } from "../../local-llm/thinking.js?v=20260927-local-llm-v4";
import { renderChatMarkdown } from "../../local-llm/markdown.js?v=20260927-local-llm-v1";

export function createLocalAiPresentation({ escapeHtml, icon }) {
  // Assistant reply body: reasoning goes in a collapsed dropdown (hidden by
  // default, ChatGPT-style); only the final answer is visible. Raw <think>
  // tags are stripped by splitThinking and never rendered. The final answer
  // is rendered as safe markdown (HTML-escaped first).
  function renderThinkDetails(thinking) {
    if (!thinking) return "";
    return `<details class="lai-think"><summary>${icon("chevron")}<span>Thought process</span></summary><div class="lai-think-body">${escapeHtml(thinking)}</div></details>`;
  }

  function renderAssistantBody(text) {
    const { thinking, text: finalText } = splitThinking(text);
    const body = finalText ? renderChatMarkdown(finalText) : "";
    return `${renderThinkDetails(thinking)}${body}`;
  }

  // Live-streaming variant of renderAssistantBody: same split, with the
  // typing caret at the end of the visible answer. The controller repaints
  // the in-progress bubble with this on every token.
  function renderStreamingMessage(text) {
    const { thinking, text: finalText } = splitThinking(text);
    return `${renderThinkDetails(thinking)}${renderChatMarkdown(finalText)}<span class="lai-caret">▍</span>`;
  }
  function renderStatusPill(llmStatus, activeLabel) {
    if (llmStatus.status === "ready" && llmStatus.verified) {
      return `<span class="lai-pill lai-pill--ready">${icon("check")} ${escapeHtml(activeLabel)}</span>`;
    }
    if (llmStatus.status === "loading") {
      const pct = Math.round((llmStatus.progress || 0) * 100);
      return `<span class="lai-pill lai-pill--loading">${pct}%</span>`;
    }
    if (llmStatus.status === "error") {
      return `<span class="lai-pill lai-pill--error">${icon("alert")} Failed</span>`;
    }
    return `<span class="lai-pill">Not set up</span>`;
  }

  function renderModelRow(models, llmStatus, selectedKey, recommendedKey, hardware, downloaded) {
    if (!models.length) return "";
    const facts = hardware?.facts || {};
    const webgpu = hardware?.recommendation?.webgpuAvailable;
    const specs = [
      webgpu ? "WebGPU ✓" : "No WebGPU",
      typeof facts.deviceMemoryGB === "number" ? `${facts.deviceMemoryGB}GB` : null,
      typeof facts.hardwareConcurrency === "number" ? `${facts.hardwareConcurrency} cores` : null
    ].filter(Boolean).join(" · ");

    const cards = models.map((entry) => {
      const { model, available, note } = entry;
      const isSelected = selectedKey === model.key;
      const isRecommended = model.key === recommendedKey;
      const isActive = llmStatus.activeModelKey === model.key;
      const isLoading = isActive && llmStatus.status === "loading";
      const isReady = isActive && llmStatus.status === "ready" && llmStatus.verified;
      const isDownloaded = !!(downloaded && downloaded[model.key]);

      let action;
      if (!available) {
        action = `<span class="lai-muted">${escapeHtml(note || "Unavailable")}</span>`;
      } else if (isLoading) {
        const pct = Math.round((llmStatus.progress || 0) * 100);
        action = `<span class="lai-progress"><progress value="${pct}" max="100"></progress><span>${pct}%</span></span>`;
      } else if (isReady) {
        action = `<span class="lai-ok">${icon("check")} Ready</span><button type="button" data-action="local-ai-unload" class="lai-link">Unload</button>`;
      } else if (isActive && llmStatus.status === "error") {
        action = `<button type="button" data-action="local-ai-download" data-model-key="${escapeHtml(model.key)}" class="lai-btn">Retry</button>`;
      } else if (isDownloaded) {
        // Weights are in this browser's cache: no download, just load into
        // the GPU and re-verify. Never label this "Get" again.
        action = `<button type="button" data-action="local-ai-download" data-model-key="${escapeHtml(model.key)}" class="lai-btn">${icon("check")} Load</button>`;
      } else {
        action = `<button type="button" data-action="local-ai-download" data-model-key="${escapeHtml(model.key)}" class="lai-btn">${icon("download")} Get</button>`;
      }

      return `
        <div class="lai-model${isSelected ? " is-sel" : ""}${available ? "" : " is-off"}"${available && !isSelected ? ` role="button" tabindex="0" data-action="local-ai-select" data-model-key="${escapeHtml(model.key)}"` : ""}>
          <div class="lai-model-top">
            <strong>${escapeHtml(model.label)}</strong>
            ${isRecommended ? `<span class="lai-tag">Recommended</span>` : ""}
            ${isSelected ? `<span class="lai-tag lai-tag--sel">${icon("check")}</span>` : ""}
            ${isDownloaded && !isReady ? `<span class="lai-tag lai-tag--dl">${icon("check")} Downloaded</span>` : ""}
          </div>
          <div class="lai-model-sub">${escapeHtml(model.blurb)}</div>
          <div class="lai-model-act">${action}</div>
        </div>`;
    }).join("");

    return `
      <section class="lai-models" aria-label="Model">
        <div class="lai-models-grid">${cards}</div>
        <div class="lai-specs">${escapeHtml(specs)}</div>
        ${webgpu ? "" : `<p class="lai-warn">${icon("alert")} Needs WebGPU — Chrome/Edge 113+, Safari 26+, or Firefox 141+.</p>`}
      </section>`;
  }

  // Accuracy disclaimer: rendered by the UI (never left to the model),
  // always visible under the composer. This is a small on-device model,
  // thousands of times smaller than state-of-the-art models, so its
  // answers may be inaccurate.
  function renderDisclaimer(activeLabel) {
    const model = activeLabel ? `${escapeHtml(activeLabel)} · ` : "";
    return `<p class="lai-disclaimer" data-local-ai-disclaimer>${icon("alert")} <span>${model}Small on-device model — thousands of times smaller than state-of-the-art models, so answers may be inaccurate. Verify before acting.</span></p>`;
  }

  // Live context-window meter: share of the on-device model's window used
  // by the last request (system prompt + kept history). Shown only after
  // a send has measured it. Kept visually quiet — small, muted,
  // right-aligned.
  function renderContextMeter(chat) {
    const stats = chat.contextStats;
    if (!stats || !(stats.promptTokens > 0) || !(stats.contextWindow > 0)) return "";
    const pct = Math.max(1, Math.min(100, Math.round((stats.promptTokens / stats.contextWindow) * 100)));
    const trimmed = stats.droppedMessages > 0
      ? ` <span class="lai-context-note">· older messages trimmed</span>`
      : "";
    return `<div class="lai-context" title="Share of the on-device model's context window used by the last request"><span class="lai-context-bar" aria-hidden="true"><span style="width:${pct}%"></span></span><span class="lai-context-label">Context ${pct}%</span>${trimmed}</div>`;
  }

  function renderChat(chat, llmStatus, activeLabel) {
    const ready = llmStatus.status === "ready" && llmStatus.verified;
    const messages = (chat.messages || [])
      .map((m) => {
        const cls = m.role === "user" ? "lai-m--u" : "lai-m--a";
        const label = m.role === "user" ? "" : `<span class="lai-m-label">${escapeHtml(activeLabel)}</span>`;
        const body = m.role === "user" ? `<p>${escapeHtml(m.text)}</p>` : renderAssistantBody(m.text);
        return `<div class="lai-m ${cls}">${label}${body}</div>`;
      })
      .join("");
    const streamingBody = chat.streamingText
      ? renderStreamingMessage(chat.streamingText)
      : `<span class="lai-thinking"><span>Thinking</span><span class="lai-dots" aria-hidden="true"><span></span><span></span><span></span></span></span>`;
    const streaming = chat.streaming
      ? `<div class="lai-m lai-m--a" data-local-ai-streaming><span class="lai-m-label">${escapeHtml(activeLabel)}</span>${streamingBody}</div>`
      : "";
    const empty = !messages && !streaming
      ? `<div class="lai-empty"><p><strong>On-device chat.</strong> <span class="lai-muted">${ready ? "Ask anything to test the model." : "Get a model above to start."}</span></p></div>`
      : "";
    return `
      <section class="lai-chat" aria-label="Chat">
        <div class="lai-msgs" data-local-ai-messages aria-live="polite">${messages}${streaming}${empty}</div>
        ${renderContextMeter(chat)}
        <form data-local-ai-chat-form class="lai-form" onsubmit="return false;">
          <input type="text" data-local-ai-chat-input placeholder="${ready ? "Message local AI…" : "Get a model to chat"}" ${ready ? "" : "disabled"} aria-label="Chat message" autocomplete="off">
          <button type="submit" data-action="local-ai-send" class="lai-send" ${ready && !chat.streaming ? "" : "disabled"} aria-label="Send">${icon("send")}</button>
        </form>
        ${renderDisclaimer(activeLabel)}
      </section>`;
  }

  function renderParsing(settings, canParse) {
    return `
      <section class="lai-parse">
        <label class="lai-parse-row">
          <span class="lai-parse-txt"><strong>Auto-parse pasted notes</strong><span class="lai-muted">Sorts Hospital Stay pastes into sections, word-for-word.</span></span>
          <span class="lai-sw">
            <input type="checkbox" data-local-ai-parsing-toggle ${settings.parsingEnabled ? "checked" : ""} ${canParse ? "" : "disabled"}>
            <span class="lai-sw-t" aria-hidden="true"></span>
          </span>
        </label>
      </section>`;
  }

  function renderContextToggle(settings, patientContext) {
    const hasPatient = !!patientContext?.hasPatient;
    const hint = hasPatient
      ? `Ask anything about ${escapeHtml(patientContext.label)} — the primary team note is attached.`
      : "No active patient — open the Vault to attach patient context.";
    return `
      <section class="lai-parse">
        <label class="lai-parse-row">
          <span class="lai-parse-txt"><strong>Patient context</strong><span class="lai-muted">${hint}</span></span>
          <span class="lai-sw">
            <input type="checkbox" data-local-ai-context-toggle ${settings.patientContextEnabled ? "checked" : ""} ${hasPatient ? "" : "disabled"}>
            <span class="lai-sw-t" aria-hidden="true"></span>
          </span>
        </label>
      </section>`;
  }

  function render({ hardware, settings, llmStatus, chat, downloaded, patientContext }) {
    const models = hardware?.recommendation?.models || [];
    const recommendedKey = hardware?.recommendation?.recommendedKey;
    const activeEntry = models.find((e) => e.model.key === llmStatus.activeModelKey);
    const activeLabel = activeEntry ? activeEntry.model.label : "";
    const canParse = llmStatus.status === "ready" && llmStatus.verified;
    return `
      <div class="lai">
        <div class="lai-head">
          <h2>Local AI</h2>
          ${renderStatusPill(llmStatus, activeLabel)}
          <span class="lai-muted lai-tagline">On-device chat &amp; note parsing. Nothing leaves this browser.</span>
        </div>
        ${renderModelRow(models, llmStatus, settings.selectedModelKey, recommendedKey, hardware, downloaded)}
        ${renderChat(chat, llmStatus, activeLabel)}
        ${renderContextToggle(settings, patientContext)}
        ${renderParsing(settings, canParse)}
      </div>`;
  }

  return { render, renderStreamingMessage };
}
