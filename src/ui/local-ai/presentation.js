// Pure markup for the Local AI view: chat-first interface with model
// selector, device status, note-parsing toggle. State is passed in;
// DOM updates and the model lifecycle live in src/ui/local-ai/controller.js.

export function createLocalAiPresentation({ escapeHtml, icon }) {
  function renderStatusPill(llmStatus, activeLabel) {
    if (llmStatus.status === "ready" && llmStatus.verified) {
      return `<span class="local-ai-pill local-ai-pill--ready">${icon("check")} Ready · ${escapeHtml(activeLabel)}</span>`;
    }
    if (llmStatus.status === "loading") {
      const pct = Math.round((llmStatus.progress || 0) * 100);
      return `<span class="local-ai-pill local-ai-pill--loading">${pct}% — ${escapeHtml(llmStatus.progressText || "Loading…")}</span>`;
    }
    if (llmStatus.status === "error") {
      return `<span class="local-ai-pill local-ai-pill--error">${icon("alert")} Load failed</span>`;
    }
    return `<span class="local-ai-pill">Not set up</span>`;
  }

  function renderModelOption(entry, llmStatus, selectedKey, recommendedKey) {
    const { model, available, note } = entry;
    const isSelected = selectedKey === model.key;
    const isRecommended = model.key === recommendedKey;
    const isActive = llmStatus.activeModelKey === model.key;
    const isLoading = isActive && llmStatus.status === "loading";
    const isReady = isActive && llmStatus.status === "ready" && llmStatus.verified;
    const classes = ["local-ai-model-option"];
    if (isSelected) classes.push("is-selected");
    if (!available) classes.push("is-unavailable");

    let actionHtml = "";
    if (!available) {
      actionHtml = `<span class="local-ai-model-note">${escapeHtml(note || "Not available on this device")}</span>`;
    } else if (isLoading) {
      const pct = Math.round((llmStatus.progress || 0) * 100);
      actionHtml = `
        <div class="local-ai-progress" role="status" aria-live="polite">
          <progress value="${pct}" max="100"></progress>
          <span>${pct}%</span>
        </div>`;
    } else if (isReady) {
      actionHtml = `
        <span class="local-ai-model-note">${icon("check")} Downloaded &amp; verified</span>
        <button type="button" data-action="local-ai-unload" class="button--quiet">Unload</button>`;
    } else if (isActive && llmStatus.status === "error") {
      actionHtml = `<button type="button" data-action="local-ai-download" data-model-key="${escapeHtml(model.key)}">${icon("download")} Retry</button>`;
    } else {
      actionHtml = `<button type="button" data-action="local-ai-download" data-model-key="${escapeHtml(model.key)}">${icon("download")} Download</button>`;
    }

    return `
      <div class="${classes.join(" ")}" ${available && !isSelected ? `role="button" tabindex="0" data-action="local-ai-select" data-model-key="${escapeHtml(model.key)}"` : ""}>
        <div class="local-ai-model-head">
          <strong>${escapeHtml(model.label)}</strong>
          ${isRecommended ? `<span class="local-ai-badge">Recommended</span>` : ""}
          ${isSelected ? `<span class="local-ai-badge local-ai-badge--selected">${icon("check")}</span>` : ""}
        </div>
        <p class="muted">${escapeHtml(model.blurb)}</p>
        <div class="local-ai-model-actions">${actionHtml}</div>
      </div>`;
  }

  function renderModelSelector(models, llmStatus, selectedKey, recommendedKey, hardware) {
    if (!models.length) return "";
    const facts = hardware?.facts || {};
    const webgpu = hardware?.recommendation?.webgpuAvailable;
    const memory =
      typeof facts.deviceMemoryGB === "number" ? `${facts.deviceMemoryGB} GB` : "memory unknown";
    const cores =
      typeof facts.hardwareConcurrency === "number" ? `${facts.hardwareConcurrency} cores` : "";
    return `
      <section class="local-ai-models" aria-label="Choose a model">
        <div class="local-ai-model-grid">
          ${models.map((entry) => renderModelOption(entry, llmStatus, selectedKey, recommendedKey)).join("")}
        </div>
        <p class="local-ai-device-line muted">
          ${webgpu ? `${icon("check")} WebGPU` : `${icon("alert")} WebGPU unavailable`} · ${escapeHtml(memory)}${cores ? ` · ${escapeHtml(cores)}` : ""}
        </p>
        ${webgpu ? "" : `<p class="local-ai-warning">${icon("alert")} The local LLM needs WebGPU (Chrome or Edge 113+, Safari 26+, Firefox 141+). This browser cannot run it.</p>`}
      </section>`;
  }

  function renderChat(chat, llmStatus, activeLabel) {
    const ready = llmStatus.status === "ready" && llmStatus.verified;
    const messages = (chat.messages || [])
      .map((m) => {
        const cls = m.role === "user" ? "local-ai-msg--user" : "local-ai-msg--assistant";
        const label = m.role === "user" ? "" : `<span class="local-ai-msg-label">${icon("sparkles")} Local AI · ${escapeHtml(activeLabel)}</span>`;
        return `<div class="local-ai-msg ${cls}">${label}<p>${escapeHtml(m.text)}</p></div>`;
      })
      .join("");
    const streaming = chat.streamingText
      ? `<div class="local-ai-msg local-ai-msg--assistant"><span class="local-ai-msg-label">${icon("sparkles")} Local AI · ${escapeHtml(activeLabel)}</span><p>${escapeHtml(chat.streamingText)}<span class="local-ai-caret" aria-hidden="true">▍</span></p></div>`
      : "";
    const emptyState = !messages && !streaming
      ? `<div class="local-ai-empty">
           <p><strong>Chat with a model that never leaves this device.</strong></p>
           <p class="muted">${ready ? "Ask anything — great for testing what the model can do before trusting it with notes." : "Download and verify a model above to start chatting."}</p>
         </div>`
      : "";
    return `
      <section class="local-ai-chat" aria-label="Chat">
        <div class="local-ai-messages" data-local-ai-messages aria-live="polite">${messages}${streaming}${emptyState}</div>
        <form data-local-ai-chat-form class="local-ai-chat-form" onsubmit="return false;">
          <input type="text" data-local-ai-chat-input placeholder="${ready ? "Ask the local model…" : "Download a model to start chatting"}" ${ready ? "" : "disabled"} aria-label="Chat message" autocomplete="off">
          <button type="submit" data-action="local-ai-send" class="local-ai-send" ${ready && !chat.streaming ? "" : "disabled"} aria-label="Send">${icon("send")}</button>
        </form>
        ${ready ? `<p class="muted local-ai-disclaimer">Runs entirely in this browser. Not for clinical decisions.</p>` : ""}
      </section>`;
  }

  function renderParsingToggle(settings, canParse) {
    return `
      <section class="local-ai-parsing">
        <label class="local-ai-toggle-row">
          <span>
            <strong>Parse pasted notes with local AI</strong>
            <span class="muted">Sorts pasted Hospital Stay notes into sections, word-for-word. Unverified parses keep the built-in result.</span>
          </span>
          <span class="local-ai-switch">
            <input type="checkbox" data-local-ai-parsing-toggle ${settings.parsingEnabled ? "checked" : ""} ${canParse ? "" : "disabled"}>
            <span class="local-ai-switch-track" aria-hidden="true"></span>
          </span>
        </label>
        ${canParse ? "" : `<p class="muted">Download and verify a model above to enable this.</p>`}
      </section>`;
  }

  function render({ hardware, settings, llmStatus, chat }) {
    const models = hardware?.recommendation?.models || [];
    const recommendedKey = hardware?.recommendation?.recommendedKey;
    const activeEntry = models.find((e) => e.model.key === llmStatus.activeModelKey);
    const activeLabel = activeEntry ? activeEntry.model.label : "";
    const canParse = llmStatus.status === "ready" && llmStatus.verified;
    return `
      <div class="local-ai-page">
        <div class="local-ai-header">
          <h2 id="local-ai-heading">Local AI</h2>
          ${renderStatusPill(llmStatus, activeLabel)}
        </div>
        <p class="muted local-ai-sub">An on-device language model for chat and note parsing. Nothing you type is sent anywhere — models download once and stay cached in this browser.</p>
        ${renderModelSelector(models, llmStatus, settings.selectedModelKey, recommendedKey, hardware)}
        ${renderChat(chat, llmStatus, activeLabel)}
        ${renderParsingToggle(settings, canParse)}
      </div>`;
  }

  return { render };
}
