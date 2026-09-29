// Pure markup for the AI Chat view: compact chat-first interface.
// State is passed in; DOM updates and the model lifecycle live in
// src/ui/ai-chat/controller.js.

import { splitThinking } from "../../local-llm/thinking.js?v=20260927-local-llm-v4";
import { renderChatMarkdown } from "../../local-llm/markdown.js?v=20260928-local-llm-v2";

export function createAiChatPresentation({ escapeHtml, icon }) {
  // Assistant reply body: reasoning goes in a collapsed dropdown (hidden by
  // default, ChatGPT-style); only the final answer is visible. Raw <think>
  // tags are stripped by splitThinking and never rendered. The final answer
  // is rendered as safe markdown (HTML-escaped first). The whole reply is
  // ONE bubble (.aic-m-body) — paragraph/list elements inside never paint
  // their own bubbles, which used to make answers look disjointed.
  function renderThinkDetails(thinking) {
    if (!thinking) return "";
    return `<details class="aic-think"><summary>${icon("chevron")}<span>Thought process</span></summary><div class="aic-think-body">${escapeHtml(thinking)}</div></details>`;
  }

  function renderAssistantBody(text) {
    const { thinking, text: finalText } = splitThinking(text);
    const body = finalText ? renderChatMarkdown(finalText) : "";
    return `<div class="aic-m-body">${renderThinkDetails(thinking)}${body}</div>`;
  }

  // Live-streaming variant of renderAssistantBody: same split, with the
  // typing caret at the end of the visible answer. The controller repaints
  // the in-progress bubble with this on every token.
  function renderStreamingMessage(text) {
    const { thinking, text: finalText } = splitThinking(text);
    return `<div class="aic-m-body">${renderThinkDetails(thinking)}${renderChatMarkdown(finalText)}<span class="aic-caret">▍</span></div>`;
  }
  function renderStatusPill(llmStatus, activeLabel) {
    if (llmStatus.status === "ready" && llmStatus.verified) {
      return `<span class="aic-pill aic-pill--ready">${icon("check")} ${escapeHtml(activeLabel)}</span>`;
    }
    if (llmStatus.status === "loading") {
      const pct = Math.round((llmStatus.progress || 0) * 100);
      return `<span class="aic-pill aic-pill--loading">${pct}%</span>`;
    }
    if (llmStatus.status === "error") {
      return `<span class="aic-pill aic-pill--error">${icon("alert")} Failed</span>`;
    }
    return `<span class="aic-pill">Not set up</span>`;
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
        action = `<span class="aic-muted">${escapeHtml(note || "Unavailable")}</span>`;
      } else if (isLoading) {
        const pct = Math.round((llmStatus.progress || 0) * 100);
        action = `<span class="aic-progress"><progress value="${pct}" max="100"></progress><span>${pct}%</span></span>`;
      } else if (isReady) {
        action = `<span class="aic-ok">${icon("check")} Ready</span><button type="button" data-action="ai-chat-unload" class="aic-link">Unload</button>`;
      } else if (isActive && llmStatus.status === "error") {
        action = `<button type="button" data-action="ai-chat-download" data-model-key="${escapeHtml(model.key)}" class="aic-btn">Retry</button>`;
      } else if (isDownloaded) {
        // Weights are in this browser's cache: no download, just load into
        // the GPU and re-verify. Never label this "Get" again.
        action = `<button type="button" data-action="ai-chat-download" data-model-key="${escapeHtml(model.key)}" class="aic-btn">${icon("check")} Load</button>`;
      } else {
        action = `<button type="button" data-action="ai-chat-download" data-model-key="${escapeHtml(model.key)}" class="aic-btn">${icon("download")} Get</button>`;
      }

      return `
        <div class="aic-model${isSelected ? " is-sel" : ""}${available ? "" : " is-off"}"${available && !isSelected ? ` role="button" tabindex="0" data-action="ai-chat-select" data-model-key="${escapeHtml(model.key)}"` : ""}>
          <div class="aic-model-top">
            <strong>${escapeHtml(model.label)}</strong>
            ${isRecommended ? `<span class="aic-tag">Recommended</span>` : ""}
            ${isSelected ? `<span class="aic-tag aic-tag--sel">${icon("check")}</span>` : ""}
            ${isDownloaded && !isReady ? `<span class="aic-tag aic-tag--dl">${icon("check")} Downloaded</span>` : ""}
          </div>
          <div class="aic-model-sub">${escapeHtml(model.blurb)}</div>
          <div class="aic-model-act">${action}</div>
        </div>`;
    }).join("");

    return `
      <section class="aic-models" aria-label="Model">
        <div class="aic-models-grid">${cards}</div>
        <div class="aic-specs">${escapeHtml(specs)}</div>
        ${webgpu ? "" : `<p class="aic-warn">${icon("alert")} Needs WebGPU — Chrome/Edge 113+, Safari 26+, or Firefox 141+.</p>`}
      </section>`;
  }

  // Accuracy disclaimer: rendered by the UI (never left to the model),
  // always visible under the composer. This is a small on-device model,
  // thousands of times smaller than state-of-the-art models, so its
  // answers may be inaccurate.
  function renderDisclaimer(activeLabel) {
    const model = activeLabel ? `${escapeHtml(activeLabel)} · ` : "";
    return `<p class="aic-disclaimer" data-ai-chat-disclaimer>${icon("alert")} <span>${model}Small on-device model — thousands of times smaller than state-of-the-art models, so answers may be inaccurate. Verify before acting.</span></p>`;
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
      ? ` <span class="aic-context-note">· older messages trimmed</span>`
      : "";
    const firstToken = stats.firstTokenMs > 0
      ? ` First token took ${(stats.firstTokenMs / 1000).toFixed(1)}s.`
      : "";
    return `<div class="aic-context" title="Share of the on-device model's context window used by the last request.${firstToken}"><span class="aic-context-bar" aria-hidden="true"><span style="width:${pct}%"></span></span><span class="aic-context-label">Context ${pct}%</span>${trimmed}</div>`;
  }

  function renderChat(chat, llmStatus, activeLabel) {
    const ready = llmStatus.status === "ready" && llmStatus.verified;
    const messages = (chat.messages || [])
      .map((m, index) => {
        const cls = m.role === "user" ? "aic-m--u" : "aic-m--a";
        const label = m.role === "user" ? "" : `<span class="aic-m-label">${escapeHtml(activeLabel)}</span>`;
        const body = m.role === "user" ? `<p>${escapeHtml(m.text)}</p>` : renderAssistantBody(m.text);
        // Revert control: removes this message and everything after it from
        // the conversation, i.e. from the model's context on the next send.
        const revert = `<button type="button" class="aic-m-revert" data-action="ai-chat-revert-message" data-message-index="${index}" title="Revert to here — remove this message and everything after it">${icon("undo")} revert</button>`;
        return `<div class="aic-m ${cls}">${label}${body}${revert}</div>`;
      })
      .join("");
    // Before the first token arrives the model is prefilling the prompt
    // (system guidelines + patient context + history), which can take tens
    // of seconds on-device. The label carries a hook so the controller can
    // tick a live elapsed-time readout — a frozen-looking "Thinking…"
    // with animated dots was reported as the app hanging.
    const thinkingLabel = chat.streaming && !chat.streamingText
      ? `<span class="aic-thinking"><span data-ai-chat-thinking-label>Reading context…</span><span class="aic-dots" aria-hidden="true"><span></span><span></span><span></span></span></span>`
      : "";
    const streamingBody = chat.streamingText
      ? renderStreamingMessage(chat.streamingText)
      : thinkingLabel;
    const streaming = chat.streaming
      ? `<div class="aic-m aic-m--a" data-ai-chat-streaming><span class="aic-m-label">${escapeHtml(activeLabel)}</span>${streamingBody}</div>`
      : "";
    const empty = !messages && !streaming
      ? `<div class="aic-empty"><p><strong>On-device chat.</strong> <span class="aic-muted">${ready ? "Ask anything to test the model." : "Get a model above to start."}</span></p></div>`
      : "";
    return `
      <section class="aic-chat" aria-label="Chat">
        <div class="aic-chatbar">
          <span class="aic-muted">${chat.messages?.length ? `${chat.messages.length} message${chat.messages.length === 1 ? "" : "s"}` : "New conversation"}</span>
          <button type="button" class="aic-newchat" data-action="ai-chat-new-chat" ${chat.streaming ? "disabled" : ""}>${icon("plus")} New chat</button>
        </div>
        <div class="aic-msgs" data-ai-chat-messages aria-live="polite">${messages}${streaming}${empty}</div>
        ${renderContextMeter(chat)}
        <form data-ai-chat-form class="aic-form" onsubmit="return false;">
          <div class="aic-input" contenteditable="${ready && !chat.streaming ? "true" : "false"}" data-ai-chat-input role="textbox" aria-multiline="true" aria-label="Chat message" data-placeholder="${ready ? "Message local AI…" : "Get a model to chat"}"></div>
          <button type="submit" data-action="ai-chat-send" class="aic-send" ${ready && !chat.streaming ? "" : "disabled"} aria-label="Send">${icon("send")}</button>
        </form>
        ${renderDisclaimer(activeLabel)}
      </section>`;
  }

  function renderParsing(settings, canParse) {
    return `
      <section class="aic-parse">
        <label class="aic-parse-row">
          <span class="aic-parse-txt"><strong>Auto-parse pasted notes</strong><span class="aic-muted">Sorts Hospital Stay pastes into sections, word-for-word.</span></span>
          <span class="aic-sw">
            <input type="checkbox" data-ai-chat-parsing-toggle ${settings.parsingEnabled ? "checked" : ""} ${canParse ? "" : "disabled"}>
            <span class="aic-sw-t" aria-hidden="true"></span>
          </span>
        </label>
      </section>`;
  }

  function renderContextToggle(settings, patientContext) {
    const hasPatient = !!patientContext?.hasPatient;
    const selectedCount = patientContext?.selectedCount || 0;
    const pieceCount = patientContext?.pieceCount || 0;
    const hint = !hasPatient
      ? "No active patient — open the Vault to attach patient context."
      : !pieceCount
        ? "No saved chart documents yet — add them in Hospital Stay."
        : !selectedCount
          ? `Ask anything about ${escapeHtml(patientContext.label)} — open Context above to choose what to attach.`
          : `Ask anything about ${escapeHtml(patientContext.label)} — ${selectedCount} chart document${selectedCount === 1 ? "" : "s"} attached.`;
    return `
      <section class="aic-parse">
        <label class="aic-parse-row">
          <span class="aic-parse-txt"><strong>Patient context</strong><span class="aic-muted">${hint}</span></span>
          <span class="aic-sw">
            <input type="checkbox" data-ai-chat-context-toggle ${settings.patientContextEnabled ? "checked" : ""} ${hasPatient ? "" : "disabled"}>
            <span class="aic-sw-t" aria-hidden="true"></span>
          </span>
        </label>
      </section>`;
  }

  // "Context" inspector: shows exactly what will be loaded into the
  // model's context on the next send — system guidelines, the selected
  // patient-context pieces (checkboxes include/exclude each chart document),
  // and the conversation history — with token estimates against the model's
  // window. Piece selection is in-memory only; the exact prompt is measured
  // at send time (see renderContextMeter).
  function renderContextInspector(info) {
    if (!info) return "";
    const total = info.guidelinesTokens + (info.enabled ? info.selectedTokens : 0) + info.historyTokens;
    const windowSize = info.contextWindow || 4096;
    const pct = Math.max(1, Math.min(100, Math.round((total / windowSize) * 100)));
    const head = `
      <button type="button" class="aic-ctx-head" data-action="ai-chat-context-inspector" aria-expanded="${info.open ? "true" : "false"}">
        <span class="aic-ctx-chev${info.open ? " is-open" : ""}">${icon("chevron")}</span>
        <strong>Context</strong>
        <span class="aic-muted">~${total.toLocaleString()} / ${windowSize.toLocaleString()} tokens (${pct}%)</span>
      </button>`;
    if (!info.open) return `<section class="aic-ctx" aria-label="Context inspector">${head}</section>`;

    const guidelinesRow = `
      <div class="aic-ctx-row">
        <span><strong>System guidelines</strong> <span class="aic-muted">editable in Settings</span></span>
        <span class="aic-muted">~${info.guidelinesTokens.toLocaleString()}</span>
      </div>`;

    let patientGroup;
    if (!info.hasPatient) {
      patientGroup = `<p class="aic-muted aic-ctx-empty">No active patient — open the Vault to attach patient context.</p>`;
    } else if (!info.pieces.length) {
      patientGroup = `<p class="aic-muted aic-ctx-empty">No saved chart documents yet — add them in Hospital Stay.</p>`;
    } else {
      let lastGroup = "";
      const rows = info.pieces.map((piece) => {
        const sub = piece.group !== lastGroup
          ? `<div class="aic-ctx-sub">${escapeHtml(piece.group)}</div>`
          : "";
        lastGroup = piece.group;
        return `${sub}<label class="aic-ctx-piece${piece.selected ? "" : " is-off"}">
          <input type="checkbox" data-ai-chat-context-piece="${escapeHtml(piece.id)}" ${piece.selected ? "checked" : ""} ${info.enabled ? "" : "disabled"}>
          <span class="aic-ctx-piece-label">${escapeHtml(piece.label)}</span>
          ${piece.primary ? `<span class="aic-tag">primary</span>` : ""}
          <span class="aic-muted aic-ctx-tok">~${piece.tokens.toLocaleString()}</span>
        </label>`;
      }).join("");
      patientGroup = `
        <div class="aic-ctx-grouphead"><strong>Patient context</strong><span class="aic-muted">${escapeHtml(info.patientLabel)}</span></div>
        ${info.enabled ? "" : `<p class="aic-muted aic-ctx-empty">Patient context is off — turn it on below to attach these.</p>`}
        ${rows}`;
    }

    const historyRow = `
      <div class="aic-ctx-row">
        <span><strong>Conversation</strong> <span class="aic-muted">${info.historyCount} message${info.historyCount === 1 ? "" : "s"} · hover a message to revert</span></span>
        <span class="aic-muted">~${info.historyTokens.toLocaleString()}</span>
      </div>`;

    return `
      <section class="aic-ctx" aria-label="Context inspector">
        ${head}
        <div class="aic-ctx-body">
          ${guidelinesRow}
          ${patientGroup}
          ${historyRow}
          <p class="aic-ctx-foot">Estimates use ~3.6 characters per token. The exact prompt is measured against the model's window at send time — oldest messages are trimmed first if it overflows.</p>
        </div>
      </section>`;
  }

  // Mode selector: one streamlined header instead of two panels. The
  // description line makes the tradeoff obvious at a glance.
  function renderModeSegment(mode) {
    const local = mode !== "remote";
    return `
      <div class="aic-modeseg" role="tablist" aria-label="Chat mode">
        <button type="button" role="tab" aria-selected="${local ? "true" : "false"}" data-action="ai-chat-mode" data-mode="local" class="aic-modeseg-btn${local ? " is-on" : ""}">${icon("phone")} On-device</button>
        <button type="button" role="tab" aria-selected="${local ? "false" : "true"}" data-action="ai-chat-mode" data-mode="remote" class="aic-modeseg-btn${local ? "" : " is-on"}">${icon("cloud")} ChatGPT</button>
      </div>
      <p class="aic-modesub aic-muted">${
        local
          ? "Private and free — a small model running entirely in this browser. Nothing leaves your device."
          : "More capable and rigorously cited — uses your saved OpenAI key. Patient context is de-identified and reviewed by you before anything is sent."
      }</p>`;
  }

  // Remote (ChatGPT) chat: message list, service picker, web-search toggle,
  // composer. Replies render markdown; the system prompt behind them
  // requires a citation for every medical fact.
  function renderRemoteChat(remote, options) {
    const messages = (remote.messages || [])
      .map((m, index) => {
        const cls = m.role === "user" ? "aic-m--u" : "aic-m--a";
        const label = m.role === "user" ? "" : `<span class="aic-m-label">ChatGPT${m.webSearch ? " · web search" : ""}</span>`;
        const body = m.role === "user" ? `<p>${escapeHtml(m.text)}</p>` : `<div class="aic-m-body">${renderChatMarkdown(m.text)}</div>`;
        const revert = `<button type="button" class="aic-m-revert" data-action="ai-chat-revert-remote" data-message-index="${index}" title="Revert to here — remove this message and everything after it">${icon("undo")} revert</button>`;
        return `<div class="aic-m ${cls}">${label}${body}${revert}</div>`;
      })
      .join("");
    const sending = remote.sending
      ? `<div class="aic-m aic-m--a"><span class="aic-m-label">ChatGPT</span><span class="aic-thinking"><span>Thinking…</span><span class="aic-dots" aria-hidden="true"><span></span><span></span><span></span></span></span></div>`
      : "";
    const empty = !messages && !sending
      ? `<div class="aic-empty"><p><strong>ChatGPT chat.</strong> <span class="aic-muted">Ask anything — every medical fact in the reply is cited. Attach patient context below to ask about your patient.</span></p></div>`
      : "";
    const serviceOptions = (options.chatServiceOptions || [])
      .map((o) => `<option value="${escapeHtml(o.value)}"${o.value === options.chatService ? " selected" : ""}>${escapeHtml(o.label)}</option>`)
      .join("");
    const keyWarn = options.hasApiKey ? "" : `
      <p class="aic-warn">${icon("alert")} No OpenAI API key saved — add one in Settings to use ChatGPT chat. Your key stays in the encrypted local vault.</p>`;
    return `
      <section class="aic-chat" aria-label="ChatGPT chat">
        <div class="aic-remote-bar">
          <label class="aic-svc">Service
            <select data-ai-chat-service>${serviceOptions}</select>
          </label>
          <label class="aic-parse-row aic-ws">
            <span class="aic-parse-txt"><strong>Web search</strong><span class="aic-muted">Ground citations in real sources.</span></span>
            <span class="aic-sw">
              <input type="checkbox" data-ai-chat-websearch-toggle ${remote.webSearch ? "checked" : ""}>
              <span class="aic-sw-t" aria-hidden="true"></span>
            </span>
          </label>
        </div>
        ${keyWarn}
        <div class="aic-chatbar">
          <span class="aic-muted">${remote.messages?.length ? `${remote.messages.length} message${remote.messages.length === 1 ? "" : "s"}` : "New conversation"}</span>
          <button type="button" class="aic-newchat" data-action="ai-chat-new-chat-remote" ${remote.sending ? "disabled" : ""}>${icon("plus")} New chat</button>
        </div>
        <div class="aic-msgs" data-ai-chat-messages aria-live="polite">${messages}${sending}${empty}</div>
        <form data-ai-chat-form class="aic-form" onsubmit="return false;">
          <div class="aic-input" contenteditable="${!remote.sending ? "true" : "false"}" data-ai-chat-input role="textbox" aria-multiline="true" aria-label="ChatGPT message" data-placeholder="${options.hasApiKey ? "Message ChatGPT…" : "Add an OpenAI key in Settings first"}"></div>
          <button type="submit" data-action="ai-chat-send-remote" class="aic-send" ${!remote.sending ? "" : "disabled"} aria-label="Send">${icon("send")}</button>
        </form>
        <p class="aic-disclaimer">${icon("alert")} <span>ChatGPT — every medical fact is cited. Verify against primary sources before acting.</span></p>
      </section>`;
  }

  // HIPAA review gate: a modal showing EXACTLY what will be sent to OpenAI
  // after the second de-identification pass. The student must explicitly
  // confirm; opening this modal sends nothing.
  function renderHipaaReview(review) {
    if (!review) return "";
    const counts = Object.entries(review.redactionCounts || {})
      .filter(([, n]) => n > 0)
      .map(([kind, n]) => `<span class="aic-tag">${escapeHtml(kind)} × ${n}</span>`)
      .join("");
    const warnings = (review.residualWarnings || [])
      .map((w) => `<li>${escapeHtml(w)}</li>`)
      .join("");
    const flags = [...(review.flags || []), ...(review.messageFlags || [])]
      .map((f) => `<li>${escapeHtml(f)}</li>`)
      .join("");
    return `
      <div class="aic-hipaa" role="dialog" aria-modal="true" aria-label="Review before sending to ChatGPT">
        <div class="aic-hipaa-card">
          <h3>Review before sending to ChatGPT</h3>
          <p class="aic-muted">You attached patient context, so this needs your review. A second de-identification pass ran over the attached context — what you see below is <strong>exactly</strong> what will be sent to OpenAI if you confirm. Nothing has been sent yet.</p>
          <div class="aic-hipaa-sec">
            <h4>Your message (sent as typed)</h4>
            <div class="aic-hipaa-body">${escapeHtml(review.message)}${review.messageRedactionTotal ? `<p class="aic-muted">Your message also had ${review.messageRedactionTotal} identifier-like pattern${review.messageRedactionTotal === 1 ? "" : "s"} redacted.</p>` : ""}</div>
          </div>
          <div class="aic-hipaa-sec">
            <h4>De-identified context ${counts ? `(redactions: ${counts})` : "(no patterns found)"}</h4>
            <div class="aic-hipaa-body aic-hipaa-ctx">${escapeHtml(review.redactedContext)}</div>
            ${warnings ? `<div class="aic-hipaa-warn"><strong>Residual warnings — double-check these:</strong><ul>${warnings}</ul></div>` : ""}
            ${flags ? `<div class="aic-hipaa-warn"><strong>Review flags:</strong><ul>${flags}</ul></div>` : ""}
          </div>
          <div class="aic-hipaa-actions">
            <button type="button" class="aic-btn" data-action="ai-chat-hipaa-cancel">Cancel — don't send</button>
            <button type="button" class="aic-btn aic-btn--primary" data-action="ai-chat-hipaa-confirm">${icon("check")} I've reviewed it — send to ChatGPT</button>
          </div>
        </div>
      </div>`;
  }

  function render({ hardware, settings, llmStatus, chat, downloaded, patientContext, contextInspector, mode, remote, chatService, chatServiceOptions, hasApiKey }) {
    const models = hardware?.recommendation?.models || [];
    const recommendedKey = hardware?.recommendation?.recommendedKey;
    const activeEntry = models.find((e) => e.model.key === llmStatus.activeModelKey);
    const activeLabel = activeEntry ? activeEntry.model.label : "";
    const canParse = llmStatus.status === "ready" && llmStatus.verified;
    const isRemote = mode === "remote";
    const body = isRemote
      ? `${renderRemoteChat(remote, { chatService, chatServiceOptions, hasApiKey })}
        ${renderContextInspector(contextInspector)}
        ${renderContextToggle(settings, patientContext)}`
      : `${renderModelRow(models, llmStatus, settings.selectedModelKey, recommendedKey, hardware, downloaded)}
        ${renderChat(chat, llmStatus, activeLabel)}
        ${renderContextInspector(contextInspector)}
        ${renderContextToggle(settings, patientContext)}
        ${renderParsing(settings, canParse)}`;
    return `
      <div class="aic">
        <div class="aic-head">
          <h2>AI Chat</h2>
          ${isRemote ? "" : renderStatusPill(llmStatus, activeLabel)}
        </div>
        ${renderModeSegment(mode)}
        ${body}
        ${renderHipaaReview(remote?.review)}
      </div>`;
  }

  return { render, renderStreamingMessage };
}
