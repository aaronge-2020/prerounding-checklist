// Pure markup for the Local AI view: model download manager, hardware report,
// note-parsing toggle, and chat UI. State is passed in; DOM updates and the
// model lifecycle live in src/ui/local-ai/controller.js.

export function createLocalAiPresentation({ escapeHtml, icon }) {
  function renderHardwareCard(hardware) {
    if (!hardware) {
      return `<div class="card"><p class="muted">Detecting device capabilities…</p></div>`;
    }
    const { facts, recommendation } = hardware;
    const webgpu = recommendation.webgpuAvailable;
    const memory =
      typeof facts.deviceMemoryGB === "number" ? `${facts.deviceMemoryGB} GB` : "not reported by this browser";
    const cores =
      typeof facts.hardwareConcurrency === "number" ? `${facts.hardwareConcurrency} cores` : "unknown";
    const recommended = recommendation.models.find((m) => m.model.key === recommendation.recommendedKey);
    return `
      <div class="card">
        <h3>${icon("check")} This device</h3>
        <dl class="local-ai-specs">
          <div><dt>WebGPU</dt><dd>${webgpu ? "Available" : "Not available"}</dd></div>
          <div><dt>Device memory</dt><dd>${escapeHtml(memory)}</dd></div>
          <div><dt>CPU cores</dt><dd>${escapeHtml(cores)}</dd></div>
          <div><dt>Recommended model</dt><dd>${recommended ? escapeHtml(recommended.model.label) : "None — WebGPU is required"}</dd></div>
        </dl>
        ${webgpu ? "" : `<p class="local-ai-warning">${icon("alert")} The local LLM needs WebGPU (Chrome or Edge 113+, Safari 26+, Firefox 141+). This browser cannot run it.</p>`}
      </div>`;
  }

  function renderModelCard(entry, llmStatus, selectedKey) {
    const { model, available, note } = entry;
    const isActive = llmStatus.activeModelKey === model.key;
    const isLoading = isActive && llmStatus.status === "loading";
    const isReady = isActive && llmStatus.status === "ready" && llmStatus.verified;
    const isError = isActive && llmStatus.status === "error";
    const isRecommended = entry.model.key === entry.recommendedKey;
    let actionHtml;
    if (!available) {
      actionHtml = `<button type="button" disabled title="${escapeHtml(note)}">Not available on this device</button>`;
    } else if (isLoading) {
      const pct = Math.round((llmStatus.progress || 0) * 100);
      actionHtml = `
        <div class="local-ai-progress" role="status" aria-live="polite">
          <progress value="${pct}" max="100"></progress>
          <span>${pct}% — ${escapeHtml(llmStatus.progressText || llmStatus.statusDetail || "Loading…")}</span>
        </div>`;
    } else if (isReady) {
      actionHtml = `
        <span class="local-ai-badge local-ai-badge--ready">${icon("check")} Downloaded &amp; verified</span>
        <button type="button" data-action="local-ai-unload" class="button--quiet">Unload</button>`;
    } else if (isError) {
      actionHtml = `
        <p class="local-ai-error">${icon("alert")} ${escapeHtml(llmStatus.statusDetail || "Load failed.")}</p>
        <button type="button" data-action="local-ai-download" data-model-key="${escapeHtml(model.key)}">${icon("download")} Retry download</button>`;
    } else {
      actionHtml = `<button type="button" data-action="local-ai-download" data-model-key="${escapeHtml(model.key)}">${icon("download")} Download (~${model.approxDownloadMB.toLocaleString()} MB)</button>`;
    }
    const selectedMark =
      selectedKey === model.key ? `<span class="local-ai-badge">${icon("check")} Selected</span>` : "";
    return `
      <div class="card local-ai-model-card">
        <h3>${escapeHtml(model.label)} ${isRecommended ? `<span class="local-ai-badge">Recommended</span>` : ""} ${selectedMark}</h3>
        <p class="muted">${escapeHtml(model.params)} · ~${model.vramMB.toLocaleString()} MB VRAM · ${escapeHtml(model.blurb)}</p>
        ${note && available ? `<p class="muted local-ai-note">${escapeHtml(note)}</p>` : ""}
        ${note && !available ? `<p class="local-ai-warning">${escapeHtml(note)}</p>` : ""}
        <div class="local-ai-model-actions">${actionHtml}</div>
        ${available && !isActive ? `<button type="button" data-action="local-ai-select" data-model-key="${escapeHtml(model.key)}" class="button--quiet">Select this model</button>` : ""}
      </div>`;
  }

  function renderParsingToggle(settings, canParse) {
    return `
      <div class="card">
        <h3>${icon("wand")} Note parsing</h3>
        <p class="muted">When you paste a note in Hospital Stay, the local model sorts it into sections. It may only move sentences word-for-word — every parse is verified before it touches your draft, and anything unverified keeps the built-in parser's result.</p>
        <label class="local-ai-toggle">
          <input type="checkbox" data-local-ai-parsing-toggle ${settings.parsingEnabled ? "checked" : ""} ${canParse ? "" : "disabled"}>
          Use local AI to parse pasted notes
        </label>
        ${canParse ? "" : `<p class="muted">Download and verify a model above to enable this.</p>`}
      </div>`;
  }

  function renderChat(chat, llmStatus, models) {
    const ready = llmStatus.status === "ready" && llmStatus.verified;
    const messages = (chat.messages || [])
      .map((m) => {
        const role = m.role === "user" ? "You" : "Local AI";
        return `<div class="local-ai-message local-ai-message--${m.role}"><strong>${role}</strong><p>${escapeHtml(m.text)}</p></div>`;
      })
      .join("");
    const streaming = chat.streamingText
      ? `<div class="local-ai-message local-ai-message--assistant"><strong>Local AI</strong><p>${escapeHtml(chat.streamingText)}<span class="local-ai-caret" aria-hidden="true">▍</span></p></div>`
      : "";
    const options = models
      .filter((entry) => entry.available)
      .map(
        (entry) =>
          `<option value="${escapeHtml(entry.model.key)}" ${chat.modelKey === entry.model.key ? "selected" : ""}>${escapeHtml(entry.model.label)}</option>`
      )
      .join("");
    return `
      <div class="card local-ai-chat">
        <h3>${icon("prompt")} Chat</h3>
        ${ready ? `<p class="muted">Chatting with <strong>${escapeHtml(chat.modelLabel || "")}</strong> — runs entirely in this browser. Not for clinical decisions.</p>` : `<p class="local-ai-warning">${icon("alert")} Chat needs a downloaded and verified model.</p>`}
        <div class="local-ai-chat-controls">
          <label>Model <select data-local-ai-chat-model>${options}</select></label>
          <button type="button" data-action="local-ai-new-chat" class="button--quiet" ${ready ? "" : "disabled"}>New chat</button>
        </div>
        <div class="local-ai-messages" data-local-ai-messages aria-live="polite">${messages}${streaming || `<p class="muted">No messages yet.</p>`}</div>
        <form data-local-ai-chat-form class="local-ai-chat-form" onsubmit="return false;">
          <textarea data-local-ai-chat-input rows="2" placeholder="${ready ? "Ask the local model…" : "Download a model to start chatting"}" ${ready ? "" : "disabled"} aria-label="Chat message"></textarea>
          <button type="button" data-action="local-ai-send" ${ready && !chat.streaming ? "" : "disabled"}>${icon("play")} Send</button>
        </form>
      </div>`;
  }

  function render({ hardware, settings, llmStatus, chat }) {
    const models = hardware?.recommendation?.models || [];
    const canParse = llmStatus.status === "ready" && llmStatus.verified;
    return `
      <div class="view-header">
        <h2 id="local-ai-heading">Local AI <span class="pill">Optional add-on</span></h2>
        <p class="muted">An optional on-device language model for note parsing and chat. Everything runs in your browser — no text is sent anywhere. Models download once (~1–2.5 GB) and are cached.</p>
      </div>
      ${renderHardwareCard(hardware)}
      <div class="local-ai-models">
        ${models.map((entry) => renderModelCard({ ...entry, recommendedKey: hardware.recommendation.recommendedKey }, llmStatus, settings.selectedModelKey)).join("")}
      </div>
      ${renderParsingToggle(settings, canParse)}
      ${renderChat(chat, llmStatus, models)}`;
  }

  return { render };
}
