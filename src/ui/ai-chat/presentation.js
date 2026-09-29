// Pure markup for the AI Chat view: full-screen ChatGPT-style layout.
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

  // ── Topbar ──────────────────────────────────────────────
  // Minimal header bar: the mode segment, the local-model status pill,
  // the Model menu (local-model download/selection + advanced controls),
  // and — on narrow screens — the button that opens the sidebar drawer.
  // No service dropdown: service tailoring now comes from Settings >
  // Clinical preferences and is display-only here.

  function renderModelMenuList(models, llmStatus, selectedKey, recommendedKey, hardware, downloaded) {
    const cards = (models || []).map((entry) => {
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
        action = `<button type="button" data-action="ai-chat-download" data-model-key="${escapeHtml(model.key)}" class="aic-btn aic-btn--sm">Retry</button>`;
      } else if (isDownloaded) {
        // Weights are in this browser's cache: no download, just load into
        // the GPU and re-verify. Never label this "Get" again.
        action = `<button type="button" data-action="ai-chat-download" data-model-key="${escapeHtml(model.key)}" class="aic-btn aic-btn--sm">${icon("check")} Load</button>`;
      } else {
        action = `<button type="button" data-action="ai-chat-download" data-model-key="${escapeHtml(model.key)}" class="aic-btn aic-btn--sm">${icon("download")} Get</button>`;
      }

      return `
        <div class="aic-modelrow${isSelected ? " is-sel" : ""}${available ? "" : " is-off"}"${available && !isSelected ? ` role="button" tabindex="0" data-action="ai-chat-select" data-model-key="${escapeHtml(model.key)}"` : ""}>
          <div class="aic-modelrow-info">
            <strong>${escapeHtml(model.label)}${isRecommended ? ` <span class="aic-tag">Recommended</span>` : ""}${isDownloaded && !isReady ? ` <span class="aic-tag aic-tag--dl">Downloaded</span>` : ""}</strong>
            <span>${escapeHtml(model.blurb || "")}</span>
          </div>
          <div class="aic-modelrow-act">${action}</div>
        </div>`;
    }).join("");

    const facts = hardware?.facts || {};
    const webgpu = hardware?.recommendation?.webgpuAvailable;
    const specs = [
      webgpu ? "WebGPU ✓" : "No WebGPU",
      typeof facts.deviceMemoryGB === "number" ? `${facts.deviceMemoryGB}GB` : null,
      typeof facts.hardwareConcurrency === "number" ? `${facts.hardwareConcurrency} cores` : null
    ].filter(Boolean).join(" · ");

    return `
      <p class="aic-menu-title">On-device model</p>
      ${cards || `<p class="aic-muted aic-side-sub">No models available on this device.</p>`}
      <p class="aic-specs">${escapeHtml(specs)}</p>
      ${webgpu ? "" : `<p class="aic-warnline">${icon("alert")} Needs WebGPU — Chrome/Edge 113+, Safari 26+, or Firefox 141+.</p>`}`;
  }

  function renderTopbar(vm) {
    const { mode, hardware, settings, llmStatus, downloaded, remote, patientContext } = vm;
    const local = mode !== "remote";
    const models = hardware?.recommendation?.models || [];
    const recommendedKey = hardware?.recommendation?.recommendedKey;
    const activeEntry = models.find((e) => e.model.key === llmStatus.activeModelKey);
    const activeLabel = activeEntry ? activeEntry.model.label
      : models.find((e) => e.model.key === settings.selectedModelKey)?.model.label || "";
    return `
      <div class="aic-topbar">
        <div class="aic-modeseg" role="tablist" aria-label="Chat mode">
          <button type="button" role="tab" aria-selected="${local ? "true" : "false"}" data-action="ai-chat-mode" data-mode="local" class="aic-modeseg-btn${local ? " is-on" : ""}">${icon("phone")} On-device</button>
          <button type="button" role="tab" aria-selected="${local ? "false" : "true"}" data-action="ai-chat-mode" data-mode="remote" class="aic-modeseg-btn${local ? "" : " is-on"}">${icon("cloud")} ChatGPT</button>
        </div>
        <span class="aic-topbar-spacer"></span>
        ${local ? renderStatusPill(llmStatus, activeLabel) : ""}
        <details class="aic-modelwrap">
          <summary class="aic-modelbtn" aria-label="Model and chat options"><span>Model</span>${activeLabel ? `<strong>${escapeHtml(activeLabel)}</strong>` : ""}${icon("chevron")}</summary>
          <div class="aic-model-menu">
            ${renderModelMenuList(models, llmStatus, settings.selectedModelKey, recommendedKey, hardware, downloaded)}
            <p class="aic-menu-title">Advanced</p>
            <label class="aic-parse-row">
              <span class="aic-parse-txt"><strong>Web search</strong><span class="aic-muted">Ground ChatGPT citations in real sources.</span></span>
              <span class="aic-sw">
                <input type="checkbox" data-ai-chat-websearch-toggle ${remote.webSearch ? "checked" : ""}>
                <span class="aic-sw-t" aria-hidden="true"></span>
              </span>
            </label>
            <label class="aic-parse-row">
              <span class="aic-parse-txt"><strong>Patient context</strong><span class="aic-muted">Attach selected chart documents to both chats.</span></span>
              <span class="aic-sw">
                <input type="checkbox" data-ai-chat-context-toggle ${settings.patientContextEnabled ? "checked" : ""} ${patientContext.hasPatient ? "" : "disabled"}>
                <span class="aic-sw-t" aria-hidden="true"></span>
              </span>
            </label>
          </div>
        </details>
        <button type="button" class="aic-sidebtn" data-action="ai-chat-context-inspector">${icon("chevron")} Context</button>
      </div>
      <p class="aic-modesub aic-muted">${
        local
          ? "Private and free — a small model running entirely in this browser. Nothing leaves your device."
          : "More capable and rigorously cited — uses your saved OpenAI key. Patient context is de-identified and reviewed by you before anything is sent."
      }</p>`;
  }

  // ── Conversation ────────────────────────────────────────

  function renderLocalMessages(chat, activeLabel) {
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
      ? `<div class="aic-empty"><p><strong>On-device chat.</strong> <span class="aic-muted">Ask anything to test the model — open the Model menu above to get one first.</span></p></div>`
      : "";
    return `${messages}${streaming}${empty}`;
  }

  function renderRemoteMessages(remote) {
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
      ? `<div class="aic-empty"><p><strong>ChatGPT chat.</strong> <span class="aic-muted">Ask anything — every medical fact in the reply is cited. Attach patient context from the sidebar to ask about your patient.</span></p></div>`
      : "";
    return `${messages}${sending}${empty}`;
  }

  function renderLocalMain(vm) {
    const { chat, llmStatus, settings } = vm;
    const models = vm.hardware?.recommendation?.models || [];
    const activeEntry = models.find((e) => e.model.key === llmStatus.activeModelKey);
    const activeLabel = activeEntry ? activeEntry.model.label : "";
    const ready = llmStatus.status === "ready" && llmStatus.verified;
    return `
      <div class="aic-chatbar">
        <span class="aic-muted">${chat.messages?.length ? `${chat.messages.length} message${chat.messages.length === 1 ? "" : "s"}` : "New conversation"}</span>
        <button type="button" class="aic-newchat" data-action="ai-chat-new-chat" ${chat.streaming ? "disabled" : ""}>${icon("plus")} New chat</button>
      </div>
      <div class="aic-messages" data-ai-chat-messages aria-live="polite">${renderLocalMessages(chat, activeLabel)}</div>
      ${renderContextMeter(chat)}
      <div class="aic-composer">
        <form data-ai-chat-form class="aic-form">
          <div class="aic-input" contenteditable="${ready && !chat.streaming ? "true" : "false"}" data-ai-chat-input role="textbox" aria-multiline="true" aria-label="Chat message" data-placeholder="${ready ? "Message local AI…" : "Get a model from the Model menu first"}"></div>
          <button type="button" data-action="ai-chat-send" class="aic-send" ${ready && !chat.streaming ? "" : "disabled"} aria-label="Send">${icon("send")}</button>
        </form>
        ${renderDisclaimer(activeLabel)}
      </div>`;
  }

  function renderRemoteMain(vm) {
    const { remote, hasApiKey } = vm;
    const deid = remote.deid || {};
    // De-identification gate: nothing can be composed or sent until the
    // de-identification model is ready. A missing deid block is treated as
    // ready (older controller state); an explicit not-ready block gates.
    const gated = !!remote.deid && !deid.ready;
    const canCompose = !remote.sending && !gated;
    const disabledReason = gated ? "Download a de-identification model to enable sending." : "";
    const banner = gated ? `
      <div class="aic-deid-banner" role="alert">
        <span class="aic-deid-ic">${icon("shield")}</span>
        <div class="aic-deid-tx">
          <strong>De-identification is not ready.</strong>
          <p>Download a de-identification model to enable sending.${deid.blockedReason ? ` ${escapeHtml(deid.blockedReason)}` : ""}</p>
        </div>
        <button type="button" class="aic-btn aic-btn--primary" data-action="ai-chat-deid-download">${icon("download")} Download ${escapeHtml(deid.modelLabel || "de-identification model")}</button>
      </div>` : "";
    const keyWarn = hasApiKey ? "" : `
      <p class="aic-keywarn">${icon("alert")} No OpenAI API key saved — add one in Settings to use ChatGPT chat. Your key stays in the encrypted local vault.</p>`;
    return `
      ${banner}
      ${keyWarn}
      <div class="aic-chatbar">
        <span class="aic-muted">${remote.messages?.length ? `${remote.messages.length} message${remote.messages.length === 1 ? "" : "s"}` : "New conversation"}</span>
        <button type="button" class="aic-newchat" data-action="ai-chat-new-chat-remote" ${remote.sending ? "disabled" : ""}>${icon("plus")} New chat</button>
      </div>
      <div class="aic-messages" data-ai-chat-messages aria-live="polite">${renderRemoteMessages(remote)}</div>
      <div class="aic-composer">
        <form data-ai-chat-form class="aic-form">
          <div class="aic-input" contenteditable="${canCompose ? "true" : "false"}" data-ai-chat-input role="textbox" aria-multiline="true" aria-label="ChatGPT message" data-placeholder="${gated ? escapeHtml(disabledReason) : (hasApiKey ? "Message ChatGPT…" : "Add an OpenAI key in Settings first")}"${disabledReason ? ` title="${escapeHtml(disabledReason)}"` : ""}></div>
          <button type="button" data-action="ai-chat-send-remote" class="aic-send" ${canCompose ? "" : "disabled"} aria-label="Send">${icon("send")}</button>
        </form>
        <p class="aic-disclaimer">${icon("alert")} <span>ChatGPT — every medical fact is cited. Verify against primary sources before acting.</span></p>
      </div>`;
  }

  // ── Sidebar ─────────────────────────────────────────────
  // Desktop (≥1024px): a persistent right column. Narrower: a drawer with
  // a backdrop, opened by ai-chat-context-inspector and closed by
  // ai-chat-sidebar-close. Sections: patient context pieces, context
  // budget, clinical service (display-only; edited in Settings), and the
  // editable custom guidelines.

  function renderSidebarPieces(contextInspector) {
    const info = contextInspector || {};
    const pieces = Array.isArray(info.pieces) ? info.pieces : [];
    if (!info.hasPatient) {
      return `<p class="aic-muted aic-side-sub">No active patient — open the Vault to attach patient context.</p>`;
    }
    if (!pieces.length) {
      return `<p class="aic-muted aic-side-sub">No saved chart documents yet — add them in Hospital Stay.</p>`;
    }
    let lastGroup = "";
    const rows = pieces.map((piece) => {
      const sub = piece.group !== lastGroup
        ? `<div class="aic-side-group">${escapeHtml(piece.group || "Other")}</div>`
        : "";
      lastGroup = piece.group;
      return `${sub}<label class="aic-ctx-piece${piece.selected ? "" : " is-off"}">
        <input type="checkbox" data-ai-chat-context-piece="${escapeHtml(piece.id)}" ${piece.selected ? "checked" : ""} ${info.enabled ? "" : "disabled"}>
        <span class="aic-ctx-piece-label">${escapeHtml(piece.label)}</span>
        ${piece.primary ? `<span class="aic-tag">primary</span>` : ""}
        <span class="aic-muted aic-ctx-tok">~${Number(piece.tokens || 0).toLocaleString()}</span>
      </label>`;
    }).join("");
    return rows;
  }

  function renderBudgetMeter(contextInspector) {
    const info = contextInspector || {};
    const guidelines = Number(info.guidelinesTokens || 0);
    const patient = info.enabled ? Number(info.selectedTokens || 0) : 0;
    const history = Number(info.historyTokens || 0);
    const total = guidelines + patient + history;
    const windowSize = Number(info.contextWindow || 0) || 4096;
    const pct = Math.max(total > 0 ? 1 : 0, Math.min(100, Math.round((total / windowSize) * 100)));
    return `
      <div class="aic-meter">
        <span class="aic-meter-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
        <span class="aic-meter-label">~${total.toLocaleString()} / ${windowSize.toLocaleString()} tokens (${pct}%)</span>
      </div>
      <p class="aic-muted aic-side-sub">Guidelines ~${guidelines.toLocaleString()} · Patient ~${patient.toLocaleString()} · Conversation ~${history.toLocaleString()}${info.historyCount ? ` (${info.historyCount} message${info.historyCount === 1 ? "" : "s"})` : ""}</p>`;
  }

  function renderSidebarService(clinicalService) {
    const svc = clinicalService || {};
    const rows = [
      ["Service focus", svc.focus],
      ["Presentation detail", svc.detail],
      ["Attending preferences", svc.attending],
      ["Team instructions", svc.team]
    ]
      .filter(([, value]) => String(value || "").trim())
      .map(([label, value]) => `<p class="aic-side-kv"><span class="aic-muted">${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></p>`)
      .join("");
    const name = [svc.label, svc.customName].map((s) => String(s || "").trim()).filter(Boolean).join(" — ");
    return `
      ${name ? `<p class="aic-side-svc"><strong>${escapeHtml(name)}</strong></p>` : `<p class="aic-muted aic-side-sub">No service set.</p>`}
      ${rows}
      <p class="aic-muted aic-side-hint">Edit in Settings → Clinical preferences.</p>`;
  }

  function renderSidebar(vm) {
    const { contextInspector, patientContext, clinicalService, sidebarGuidelinesText, sidebarOpen } = vm;
    const guidelinesTokens = Number(contextInspector?.guidelinesTokens || 0);
    return `
      ${sidebarOpen ? `<button type="button" class="aic-side-backdrop" data-action="ai-chat-sidebar-close" aria-label="Close sidebar"></button>` : ""}
      <aside class="aic-sidebar${sidebarOpen ? " is-open" : ""}" aria-label="Chat context sidebar">
        <div class="aic-side-head">
          <strong>Context &amp; options</strong>
          <button type="button" class="aic-side-close" data-action="ai-chat-sidebar-close" aria-label="Close sidebar">${icon("chevron")} Close</button>
        </div>
        <section class="aic-side-sec" aria-label="Patient context">
          <h3 class="aic-side-title">Patient context</h3>
          ${patientContext.hasPatient ? `<p class="aic-side-patient">${escapeHtml(patientContext.label || "Active patient")}</p>` : ""}
          <label class="aic-parse-row">
            <span class="aic-parse-txt"><strong>Attach to chat</strong><span class="aic-muted">Include the selected documents below in the model's context.</span></span>
            <span class="aic-sw">
              <input type="checkbox" data-ai-chat-context-toggle ${patientContext.enabled ? "checked" : ""} ${patientContext.hasPatient ? "" : "disabled"}>
              <span class="aic-sw-t" aria-hidden="true"></span>
            </span>
          </label>
          ${renderSidebarPieces(contextInspector)}
        </section>
        <section class="aic-side-sec" aria-label="Context budget">
          <h3 class="aic-side-title">Context budget</h3>
          ${renderBudgetMeter(contextInspector)}
        </section>
        <section class="aic-side-sec" aria-label="Service">
          <h3 class="aic-side-title">Service</h3>
          ${renderSidebarService(clinicalService)}
        </section>
        <section class="aic-side-sec" aria-label="Custom guidelines">
          <h3 class="aic-side-title">Guidelines</h3>
          <textarea class="aic-guide" data-ai-chat-guidelines rows="6" aria-label="Custom chat guidelines" placeholder="Extra instructions for both chats — reviewed by you before anything is sent to ChatGPT.">${escapeHtml(sidebarGuidelinesText || "")}</textarea>
          <p class="aic-muted aic-side-sub">~${guidelinesTokens.toLocaleString()} tokens</p>
        </section>
      </aside>`;
  }

  // ── HIPAA review gate ───────────────────────────────────
  // A modal showing EXACTLY what will be sent to OpenAI after the
  // de-identification passes. The student must explicitly confirm; opening
  // this modal sends nothing.
  // Highlight redaction markers in already-escaped text: [LABEL] spans
  // become yellow pills, relative-timeline conversions ([Hospital Day N])
  // get a blue pill. Labels come from the piece's own redaction counts.
  function highlightHipaaRedactions(escapedText, labels) {
    let html = escapedText;
    const kinds = [...new Set((labels || []).filter(Boolean))].sort((a, b) => b.length - a.length);
    if (kinds.length) {
      const pat = kinds.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
      html = html.replace(new RegExp(`\\[(${pat})\\]`, "g"), '<mark class="aic-hipaa-mark">[$1]</mark>');
    }
    html = html.replace(/\[(Hospital Day [^\]]+)\]/g, '<mark class="aic-hipaa-mark aic-hipaa-mark--date">[$1]</mark>');
    return html;
  }

  function hipaaStat(iconName, label, value, tone) {
    return `
      <div class="aic-hipaa-stat${tone ? ` aic-hipaa-stat--${tone}` : ""}">
        <span class="aic-hipaa-stat-ic">${icon(iconName)}</span>
        <span class="aic-hipaa-stat-tx"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></span>
      </div>`;
  }

  function renderHipaaHead(deidModelLabel) {
    return `
      <div class="aic-hipaa-head">
        <span class="aic-hipaa-shield">${icon("shield")}</span>
        <div>
          <h2 id="aicHipaaTitle">Review before sending to ChatGPT</h2>
          <p>Nothing has been sent yet — confirm exactly what will leave this browser.${deidModelLabel ? ` <span class="aic-muted">De-identified with ${escapeHtml(deidModelLabel)}.</span>` : ""}</p>
        </div>
      </div>`;
  }

  // One delta-review suggestion row: the original snippet struck through,
  // the proposed replacement, a label chip, and Accept/Reject. Reviewed
  // rows show their status plus Undo/Restore/Accept depending on status.
  function renderSuggestionRow(pieceId, redaction, labels, reviewed) {
    const rid = String(redaction.id || "");
    const text = `
      <div class="aic-hipaa-sug-text">
        <span class="aic-hipaa-sug-orig">${escapeHtml(redaction.originalSnippet || "")}</span>
        <span class="aic-hipaa-sug-arrow" aria-hidden="true">→</span>
        <span class="aic-hipaa-sug-repl">${highlightHipaaRedactions(escapeHtml(redaction.replacement || ""), labels)}</span>
      </div>
      <div class="aic-hipaa-sug-meta">
        ${redaction.label ? `<span class="aic-hipaa-chip">${escapeHtml(redaction.label)}</span>` : ""}
        <span class="aic-hipaa-sug-act">${reviewed ? renderReviewedActions(pieceId, rid, redaction.status) : `
          <button type="button" class="aic-btn aic-btn--sm" data-action="ai-chat-hipaa-accept" data-piece="${escapeHtml(pieceId)}" data-redaction="${escapeHtml(rid)}">Accept</button>
          <button type="button" class="aic-btn aic-btn--sm" data-action="ai-chat-hipaa-reject" data-piece="${escapeHtml(pieceId)}" data-redaction="${escapeHtml(rid)}">Reject</button>`}
        </span>
      </div>`;
    return `<div class="aic-hipaa-sug${reviewed ? " is-reviewed" : ""}">${reviewed ? `<span class="aic-hipaa-chip aic-hipaa-chip--status">${escapeHtml(String(redaction.status || "reviewed"))}</span>` : ""}${text}</div>`;
  }

  function renderReviewedActions(pieceId, rid, status) {
    const s = String(status || "").toLowerCase();
    const undo = `<button type="button" class="aic-btn aic-btn--sm" data-action="ai-chat-hipaa-undo" data-piece="${escapeHtml(pieceId)}" data-redaction="${escapeHtml(rid)}">Undo</button>`;
    const restore = `<button type="button" class="aic-btn aic-btn--sm" data-action="ai-chat-hipaa-restore" data-piece="${escapeHtml(pieceId)}" data-redaction="${escapeHtml(rid)}">Restore</button>`;
    const accept = `<button type="button" class="aic-btn aic-btn--sm" data-action="ai-chat-hipaa-accept" data-piece="${escapeHtml(pieceId)}" data-redaction="${escapeHtml(rid)}">Accept</button>`;
    if (s === "accepted") return undo;
    if (s === "rejected") return `${accept} ${restore}`;
    return `${undo} ${restore} ${accept}`;
  }

  // One review piece card: collapsible header (badge + title + redaction
  // chips), new-suggestion rows with Accept all/Reject all, the
  // already-reviewed list, and the highlighted approved-text preview with
  // a "Redact selection" control for manual fixes.
  function renderReviewPiece(piece, ctx, opts = {}) {
    const pieceId = String(piece.id || "");
    const isOpen = ctx.expanded.has(pieceId);
    const reviewedOpen = ctx.reviewedOpen.has(pieceId);
    const counts = piece.counts || {};
    const labels = Object.keys(counts);
    const chips = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([kind, n]) => `<span class="aic-hipaa-chip aic-hipaa-chip--red">${escapeHtml(kind)} × ${n}</span>`)
      .join("");
    const badgeNames = { new: "New", changed: "Changed", reviewed: "Reviewed" };
    const badge = piece.badge
      ? `<span class="aic-hipaa-badge aic-hipaa-badge--${escapeHtml(piece.badge)}">${escapeHtml(badgeNames[piece.badge] || piece.badge)}</span>`
      : "";
    const approvedText = piece.approvedText ?? piece.text ?? "";
    const chars = Number(piece.chars ?? String(approvedText).length ?? 0);
    // Contract (v4): pieces carry modelRecords/manualRecords with
    // { id, start, end, originalText, replacement, label, source, status }.
    // Derive the pending/reviewed row lists here; keep the legacy
    // pending/reviewed arrays as a fallback for older view-models.
    const allRecords = [
      ...(Array.isArray(piece.modelRecords) ? piece.modelRecords : []),
      ...(Array.isArray(piece.manualRecords) ? piece.manualRecords : []),
    ].map((r) => ({ ...r, originalSnippet: r.originalSnippet ?? r.originalText ?? "" }));
    const pending = Array.isArray(piece.pending)
      ? piece.pending
      : allRecords.filter((r) => String(r.status || "pending") === "pending");
    const reviewed = Array.isArray(piece.reviewed)
      ? piece.reviewed
      : allRecords.filter((r) => String(r.status || "") !== "pending");
    const hasDateRedaction = pending.some((r) => /date/i.test(String(r.label || "")));
    const body = isOpen ? `
      <div class="aic-hipaa-piece-body">
        ${pending.length ? `
          <div class="aic-hipaa-sughead">
            <strong>New suggestions</strong>
            <span class="aic-hipaa-sug-all">
              <button type="button" class="aic-link" data-action="ai-chat-hipaa-accept-all" data-piece="${escapeHtml(pieceId)}">Accept all</button>
              <span class="aic-muted"> · </span>
              <button type="button" class="aic-link" data-action="ai-chat-hipaa-reject-all" data-piece="${escapeHtml(pieceId)}">Reject all</button>
            </span>
          </div>
          ${hasDateRedaction ? `<p class="aic-hipaa-note">${icon("alert")} Date redactions use relative timeline markers (e.g. [Hospital Day N]) — check the preview below.</p>` : ""}
          ${pending.map((r) => renderSuggestionRow(pieceId, r, labels, false)).join("")}` : ""}
        ${reviewed.length ? `
          <button type="button" class="aic-hipaa-reviewed-head" data-action="ai-chat-hipaa-toggle-reviewed" data-piece="${escapeHtml(pieceId)}" aria-expanded="${reviewedOpen ? "true" : "false"}">
            <span class="aic-hipaa-chev${reviewedOpen ? " is-open" : ""}">${icon("chevron")}</span>
            <strong>Already reviewed</strong>
            <span class="aic-muted">${reviewed.length}</span>
          </button>
          ${reviewedOpen ? `<div class="aic-hipaa-reviewed">${reviewed.map((r) => renderSuggestionRow(pieceId, r, labels, true)).join("")}</div>` : ""}` : ""}
        <div class="aic-hipaa-preview" data-hipaa-piece-preview data-piece="${escapeHtml(pieceId)}">${highlightHipaaRedactions(escapeHtml(approvedText), labels)}</div>
        <div class="aic-hipaa-preview-act">
          <button type="button" class="aic-btn aic-btn--sm" data-action="ai-chat-hipaa-redact-selection" data-piece="${escapeHtml(pieceId)}">${icon("wand")} Redact selection</button>
          <span class="aic-muted">Select text in the preview, then redact it.</span>
        </div>
        ${piece.truncated ? `<p class="aic-hipaa-note">${icon("alert")} This piece was truncated to fit the size budget — what you see above is the complete text that will be sent.</p>` : ""}
      </div>` : "";
    return `
      <div class="aic-hipaa-piece${isOpen ? " is-open" : ""}">
        <button type="button" class="aic-hipaa-piece-head" data-action="ai-chat-hipaa-piece" data-piece="${escapeHtml(pieceId)}" aria-expanded="${isOpen ? "true" : "false"}">
          <span class="aic-hipaa-chev${isOpen ? " is-open" : ""}">${icon("chevron")}</span>
          ${badge}
          <span class="aic-hipaa-piece-title">${escapeHtml(opts.title || piece.title || "Context")}</span>
          <span class="aic-hipaa-chips">${chips}<span class="aic-hipaa-chip">${chars.toLocaleString()} chars</span></span>
        </button>
        ${body}
      </div>`;
  }

  function renderHipaaReview(review) {
    if (!review) return "";
    // Phase is new in v3; fall back to the legacy boolean shape so older
    // controller state still renders the right modal.
    const phase = review.phase || (review.failed ? "failed" : "ready");
    const foot = (inner) => `
      <div class="aic-hipaa-foot">${inner}</div>`;
    const cancelOnly = foot(`<button type="button" class="aic-btn" data-action="ai-chat-hipaa-cancel">Cancel — don't send</button>`);

    if (phase === "preparing") {
      const progress = review.progress || {};
      const done = Number(progress.done || 0);
      const total = Number(progress.total || 0);
      const pct = total > 0 ? Math.max(1, Math.min(100, Math.round((done / total) * 100))) : 8;
      return `
      <div class="aic-hipaa-backdrop" data-action="ai-chat-hipaa-cancel">
        <div class="aic-hipaa-modal" role="dialog" aria-modal="true" aria-labelledby="aicHipaaTitle">
          ${renderHipaaHead(review.deidModelLabel)}
          <div class="aic-hipaa-body">
            <div class="aic-hipaa-progress">
              <strong>Preparing your review…</strong>
              <p class="aic-muted">${escapeHtml(progress.label || "Running de-identification…")}</p>
              <div class="aic-hipaa-progressbar" role="progressbar" aria-valuenow="${done}" aria-valuemax="${total}"><span style="width:${pct}%"></span></div>
              <p class="aic-muted">${done} of ${total}</p>
            </div>
          </div>
          ${cancelOnly}
        </div>
      </div>`;
    }

    if (phase === "failed") {
      // Fail-closed state: de-identification errored, so no message and no
      // context is shown and nothing can be sent from this dialog.
      return `
      <div class="aic-hipaa-backdrop" data-action="ai-chat-hipaa-cancel">
        <div class="aic-hipaa-modal" role="dialog" aria-modal="true" aria-labelledby="aicHipaaTitle">
          ${renderHipaaHead(review.deidModelLabel)}
          <div class="aic-hipaa-body">
            <div class="aic-hipaa-flags">
              <strong>${icon("alert")} De-identification failed — sending is blocked</strong>
              <ul><li>${escapeHtml(review.failedDetail || "The de-identification pass failed.")}</li>
              <li>Close this dialog and try again. Nothing from this send left the browser.</li></ul>
            </div>
          </div>
          ${cancelOnly}
        </div>
      </div>`;
    }

    // Ready: the full delta-review modal.
    const pieces = Array.isArray(review.pieces) ? review.pieces : [];
    const ctx = {
      expanded: new Set(review.expanded || []),
      reviewedOpen: new Set(review.reviewedOpen || [])
    };
    const totalRedactions = Number(review.redactionTotal || 0);
    const messageFlags = review.messageFlags || [];
    const warningCount =
      (review.residualWarnings || []).length +
      (review.flags || []).length +
      messageFlags.length;
    const messageText = review.messageTransformed ?? review.message ?? "";
    const messageCounts = review.messageCounts || {};
    const messageChips = Object.entries(messageCounts)
      .filter(([, n]) => n > 0)
      .map(([kind, n]) => `<span class="aic-hipaa-chip aic-hipaa-chip--red">${escapeHtml(kind)} × ${n}</span>`)
      .join("");
    const flagItems = [
      ...(review.flags || []).map((f) => ({ text: f, kind: "" })),
      ...(review.residualWarnings || []).map((w) => ({ text: w, kind: "warn" })),
      ...messageFlags.map((f) => ({ text: `Your message: ${f}`, kind: "" }))
    ];
    const guidelines = review.guidelines;
    const history = Array.isArray(review.history) ? review.history : [];
    const canSend = !!review.canSend && !!review.ack;
    return `
      <div class="aic-hipaa-backdrop" data-action="ai-chat-hipaa-cancel">
        <div class="aic-hipaa-modal" role="dialog" aria-modal="true" aria-labelledby="aicHipaaTitle">
          ${renderHipaaHead(review.deidModelLabel)}
          <div class="aic-hipaa-stats">
            ${hipaaStat("prompt", "Your message", "1 message", "")}
            ${hipaaStat("workup", "Context", `${pieces.length} document${pieces.length === 1 ? "" : "s"}`, "")}
            ${hipaaStat("wand", "Redactions", `${totalRedactions} applied`, totalRedactions ? "" : "ok")}
            ${hipaaStat("alert", "Warnings", warningCount ? `${warningCount} to check` : "none", warningCount ? "warn" : "ok")}
          </div>
          <div class="aic-hipaa-body">
            <h3 class="aic-hipaa-sec-title">Your message — de-identified before sending</h3>
            <div class="aic-hipaa-msg">
              ${highlightHipaaRedactions(escapeHtml(messageText), Object.keys(messageCounts))}
              ${messageChips ? `<div class="aic-hipaa-chips">${messageChips}</div>` : ""}
              ${messageFlags.length ? `<ul class="aic-hipaa-msgflags">${messageFlags.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
            </div>
            ${guidelines ? `
              <h3 class="aic-hipaa-sec-title">Custom instructions</h3>
              ${renderReviewPiece(guidelines, ctx, { title: guidelines.title || "Custom instructions" })}` : ""}
            <h3 class="aic-hipaa-sec-title">De-identified context</h3>
            ${pieces.map((piece) => renderReviewPiece(piece, ctx)).join("") || `<p class="aic-muted">No context pieces.</p>`}
            <h3 class="aic-hipaa-sec-title">What will be sent</h3>
            <pre class="aic-hipaa-transmit">${escapeHtml(review.transmitText || "")}</pre>
            ${review.truncationNote ? `<p class="aic-hipaa-note">${icon("alert")} ${escapeHtml(review.truncationNote)}</p>` : ""}
            <div class="aic-hipaa-flags${flagItems.length ? "" : " aic-hipaa-flags--ok"}">
              <strong>${icon("alert")} Review flags</strong>
              ${
                flagItems.length
                  ? `<ul>${flagItems.map((f) => `<li${f.kind ? ` class="is-${f.kind}"` : ""}>${escapeHtml(f.text)}</li>`).join("")}</ul>`
                  : `<p>No PHI spans detected. Review still required — confirm the content above is safe to send.</p>`
              }
            </div>
            <details class="aic-hipaa-details">
              <summary>Full system prompt</summary>
              <pre class="aic-hipaa-transmit">${escapeHtml(review.systemPromptText || "")}</pre>
            </details>
            <details class="aic-hipaa-details">
              <summary>Earlier messages (already reviewed)</summary>
              <div class="aic-hipaa-history">
                ${history.length
                  ? history.map((h) => `<div class="aic-hipaa-hist"><strong>${h.role === "user" ? "You" : "ChatGPT"}</strong><p>${escapeHtml(h.text || "")}</p></div>`).join("")
                  : `<p class="aic-muted">None yet — this is the first message.</p>`}
              </div>
            </details>
          </div>
          <div class="aic-hipaa-foot">
            <button type="button" class="aic-btn" data-action="ai-chat-hipaa-cancel">Cancel — don't send</button>
            <label class="aic-hipaa-ack">
              <input type="checkbox" data-ai-chat-hipaa-ack${review.ack ? " checked" : ""}>
              <span>I have reviewed the content above</span>
            </label>
            <button type="button" class="aic-btn aic-btn--primary" data-action="ai-chat-hipaa-confirm"${canSend ? "" : " disabled"}>${icon("send")} Send to ChatGPT</button>
          </div>
        </div>
      </div>`;
  }

  function render(vm = {}) {
    const {
      hardware = null,
      settings = {},
      llmStatus = {},
      downloaded = {},
      mode = "local",
      chat = {},
      remote = {},
      hasApiKey = false,
      patientContext = {},
      contextInspector = {},
      clinicalService = {},
      sidebarGuidelinesText = ""
    } = vm;
    const isRemote = mode === "remote";
    // The v3 sibling controller passes sidebarOpen; fall back to the
    // inspector's open flag for older state shapes.
    const sidebarOpen = typeof vm.sidebarOpen === "boolean"
      ? vm.sidebarOpen
      : !!(contextInspector && contextInspector.open);
    const topVm = { mode, hardware, settings, llmStatus, downloaded, remote, patientContext };
    return `
      <div class="aic-shell">
        ${renderTopbar(topVm)}
        <div class="aic-body">
          <div class="aic-main">
            ${isRemote ? renderRemoteMain({ remote, hasApiKey }) : renderLocalMain({ hardware, settings, llmStatus, chat })}
          </div>
          ${renderSidebar({ contextInspector, patientContext, clinicalService, sidebarGuidelinesText, sidebarOpen })}
        </div>
        ${renderHipaaReview(remote.review)}
      </div>`;
  }

  return { render, renderStreamingMessage };
}
