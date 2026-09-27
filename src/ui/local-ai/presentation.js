// Pure markup for the Local AI view: compact chat-first interface.
// State is passed in; DOM updates and the model lifecycle live in
// src/ui/local-ai/controller.js.

import { splitThinking } from "../../local-llm/thinking.js?v=20260927-local-llm-v4";

export function createLocalAiPresentation({ escapeHtml, icon }) {
  // Assistant reply body: reasoning goes in a collapsed dropdown (hidden by
  // default, ChatGPT-style); only the final answer is visible. Raw <think>
  // tags are stripped by splitThinking and never rendered.
  function renderThinkDetails(thinking) {
    if (!thinking) return "";
    return `<details class="lai-think"><summary>${icon("chevron")}<span>Thought process</span></summary><div class="lai-think-body">${escapeHtml(thinking)}</div></details>`;
  }

  function renderAssistantBody(text) {
    const { thinking, text: finalText } = splitThinking(text);
    const body = finalText ? `<p>${escapeHtml(finalText)}</p>` : "";
    return `${renderThinkDetails(thinking)}${body}`;
  }

  // Live-streaming variant of renderAssistantBody: same split, with the
  // typing caret at the end of the visible answer. The controller repaints
  // the in-progress bubble with this on every token.
  function renderStreamingMessage(text) {
    const { thinking, text: finalText } = splitThinking(text);
    return `${renderThinkDetails(thinking)}<p>${escapeHtml(finalText)}<span class="lai-caret">▍</span></p>`;
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
    const streaming = chat.streamingText
      ? `<div class="lai-m lai-m--a" data-local-ai-streaming><span class="lai-m-label">${escapeHtml(activeLabel)}</span>${renderStreamingMessage(chat.streamingText)}</div>`
      : "";
    const empty = !messages && !streaming
      ? `<div class="lai-empty"><p><strong>On-device chat.</strong> <span class="lai-muted">${ready ? "Ask anything to test the model." : "Get a model above to start."}</span></p></div>`
      : "";
    return `
      <section class="lai-chat" aria-label="Chat">
        <div class="lai-msgs" data-local-ai-messages aria-live="polite">${messages}${streaming}${empty}</div>
        <form data-local-ai-chat-form class="lai-form" onsubmit="return false;">
          <input type="text" data-local-ai-chat-input placeholder="${ready ? "Message local AI…" : "Get a model to chat"}" ${ready ? "" : "disabled"} aria-label="Chat message" autocomplete="off">
          <button type="submit" data-action="local-ai-send" class="lai-send" ${ready && !chat.streaming ? "" : "disabled"} aria-label="Send">${icon("send")}</button>
        </form>
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

  function render({ hardware, settings, llmStatus, chat, downloaded }) {
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
        ${renderParsing(settings, canParse)}
      </div>`;
  }

  return { render, renderStreamingMessage };
}
