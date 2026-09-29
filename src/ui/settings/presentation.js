import { renderGuidelineEditor, renderGuidelineSets } from "./guidelines-presentation.js?v=20260921-medication-card-v4";

export function createSettingsPresentation({ escapeHtml }) {
  function renderSettings({
    preferences,
    apiKeySaved,
    guidelineSets,
    guidelineSearchQuery = "",
    guidelinePage = 1,
    guidelineSelectedIds = new Set(),
    guidelineOpenId = "",
    guidelineCreateDraft = null,
    OPENAI_WORKUP_MODEL_OPTIONS,
    colorOverrides = {},
    localAiGuidelines = "",
    offlineMode = false
  }) {
    return `
      <div class="settings-page ${guidelineOpenId || guidelineCreateDraft ? "has-guideline-editor" : ""}">
        <div class="settings-main">
          <div class="settings-page-heading"><h1>Settings</h1></div>
          <div class="settings-top-grid">
          <section class="panel settings-panel settings-panel--offline">
          <div class="section-heading">
            <div>
              <h2>Offline mode</h2>
              <p class="muted">Block every network request the app can make — OpenAI calls, ChatGPT chat, and model downloads. Everything on-device keeps working: the vault, calculators, de-identification, and on-device chat with an already-downloaded model.</p>
            </div>
          </div>
          <div class="notice settings-security-note">
            <strong>${offlineMode ? "Offline mode is on." : "Offline mode is off."}</strong>
            <span>${offlineMode ? "No network requests will be sent. Cloud features show a clear explanation instead of failing silently." : "Cloud features (OpenAI, ChatGPT chat) are available when you start them."}</span>
          </div>
          <div class="button-row">
            <button class="button--primary" type="button" data-action="toggle-offline-mode">${offlineMode ? "Turn offline mode off" : "Turn offline mode on"}</button>
          </div>
          <p class="muted settings-helper">Model downloads you start yourself also pause while offline mode is on — download a model first, then switch it on.</p>
          </section>
          <section class="panel settings-panel">
          <div class="section-heading">
            <div>
              <h2>Where does my data go?</h2>
              <p class="muted">Plain-language list of what leaves this browser — and what never does.</p>
            </div>
          </div>
          <dl class="data-flow-list">
            <div><dt>Patient records, notes, and checklists</dt><dd>Never leave this browser. Stored encrypted in the vault on this device. Vault backups are files you save yourself, and they stay encrypted.</dd></div>
            <div><dt>Calculators (Models tab)</dt><dd>Run entirely on-device. No network.</dd></div>
            <div><dt>De-identification</dt><dd>Runs on-device after a one-time model download from Hugging Face (pinned files, started only by you). Nothing is sent anywhere during redaction.</dd></div>
            <div><dt>On-device chat and note parsing</dt><dd>Run on-device after a one-time model download. Nothing leaves the browser.</dd></div>
            <div><dt>OpenAI features (formatting, per-problem plans, ChatGPT chat)</dt><dd>Sent to api.openai.com using your saved key. Text is de-identified on-device first, and ChatGPT chat shows you exactly what will be sent for your review before anything transmits. Blocked while offline mode is on.</dd></div>
            <div><dt>OpenEvidence / Doximity buttons</dt><dd>These open those sites in a new tab (they need a connection to load). The app sends them nothing — you paste whatever you choose.</dd></div>
            <div><dt>Model downloads</dt><dd>One-time downloads from Hugging Face when you explicitly start them. Blocked while offline mode is on.</dd></div>
            <div><dt>Drug lookups</dt><dd>When you search a drug name, only the name is sent to the FDA drug database (api.fda.gov) for reference information. Never patient context. Blocked while offline mode is on.</dd></div>
          </dl>
          <p class="muted settings-helper">No accounts, no sync, no analytics. If it is not listed above as leaving, it stays.</p>
          </section>
          <section class="panel settings-panel settings-panel--byok">
          <div class="section-heading">
            <div>
              <h2>Bring your own OpenAI key</h2>
              <p class="muted">Use your own key to format a reviewed, de-identified OpenEvidence workup draft, to fill checklist answers from a de-identified OpenEvidence note, or to generate per-problem assessment &amp; plans (differential, diagnostic and therapeutic plans with citations) from de-identified draft context.</p>
            </div>
          </div>
          <div class="notice settings-security-note">
            <strong>${apiKeySaved ? "An API key is saved in the encrypted vault." : "No API key is saved."}</strong>
            <span>The key is never shown again. It's encrypted at rest in this browser's vault record and only used when you start a conversion. While the vault is unlocked, the browser keeps it in memory to make that request.</span>
          </div>
          <div class="settings-fields">
            <label class="settings-field-wide">OpenAI API key
              <input id="openAiApiKeyInput" type="password" autocomplete="new-password" spellcheck="false" placeholder="${apiKeySaved ? "Saved in encrypted vault; enter a new key to replace it" : "Paste an API key to enable automatic formatting"}">
            </label>
            <label>Model
              <select id="openAiModelInput">
                ${OPENAI_WORKUP_MODEL_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${preferences.openAiModel === option.value ? "selected" : ""}>${escapeHtml(`${option.label} — ${option.description}`)}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="button-row">
            <button class="button--primary" type="button" data-action="save-openai-byok">Save encrypted key</button>
            <button class="button--quiet" type="button" data-action="clear-openai-byok" ${apiKeySaved ? "" : "disabled"}>Remove saved key</button>
          </div>
          <p class="muted settings-helper">Without a saved key, the Workups and Checklist pages fall back to the copy-and-paste ChatGPT formatter prompt.</p>
          </section>

          <section class="panel settings-panel settings-panel--backup">
          <div class="section-heading">
            <div>
              <h2>Encrypted vault backup</h2>
              <p class="muted">Download the encrypted vault record to move your settings and de-identified roster to another device.</p>
            </div>
          </div>
          <div class="notice settings-backup-note">
            <strong>Your backup remains encrypted.</strong>
            <span>It can only be opened with this vault's passphrase. Store the file somewhere you trust.</span>
          </div>
          <div class="button-row">
            <button class="button--primary" type="button" data-action="export-vault">Export Vault Backup</button>
          </div>
          </section>
          </div>

          <section class="panel settings-panel">
          <div class="section-heading">
            <div>
              <h2>Local AI guidelines</h2>
              <p class="muted">System instructions sent to the on-device model with every chat message — its identity, environment, and behavior. When patient context is attached, it is appended after these guidelines.</p>
            </div>
          </div>
          <div class="settings-fields">
            <label class="settings-field-wide">Guidelines
              <textarea id="localAiGuidelinesInput" rows="9" spellcheck="false" style="width:100%;font:inherit;resize:vertical;">${escapeHtml(localAiGuidelines)}</textarea>
            </label>
          </div>
          <div class="button-row">
            <button class="button--primary" type="button" data-action="save-local-ai-guidelines">Save guidelines</button>
            <button class="button--quiet" type="button" data-action="reset-local-ai-guidelines">Reset to default</button>
          </div>
          </section>

          ${renderGuidelineSets({ guidelineSets, escapeHtml, colorOverrides, searchQuery: guidelineSearchQuery, page: guidelinePage, selectedIds: guidelineSelectedIds, openId: guidelineOpenId })}
        </div>
        ${renderGuidelineEditor({ guidelineSets, escapeHtml, openId: guidelineOpenId, createDraft: guidelineCreateDraft })}
      </div>
    `;
  }

  return Object.freeze({ renderSettings });
}
