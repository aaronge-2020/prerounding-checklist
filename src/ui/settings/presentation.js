import { renderGuidelineEditor, renderGuidelineSets } from "./guidelines-presentation.js";

export function createSettingsPresentation({ escapeHtml }) {
  function renderSettings({
    preferences,
    apiKeySaved,
    guidelineSets,
    guidelineSearchQuery = "",
    guidelineSelectedIds = new Set(),
    guidelineOpenId = "",
    guidelineCreateDraft = null,
    OPENAI_WORKUP_MODEL_OPTIONS,
    colorOverrides = {}
  }) {
    return `
      <div class="settings-page ${guidelineOpenId || guidelineCreateDraft ? "has-guideline-editor" : ""}">
        <div class="settings-main">
          <div class="settings-page-heading"><h1>Settings</h1></div>
          <div class="settings-top-grid">
          <section class="panel settings-panel settings-panel--byok">
          <div class="section-heading">
            <div>
              <h2>Bring your own OpenAI key</h2>
              <p class="muted">Use your own key to format a reviewed, de-identified OpenEvidence workup draft, or to fill checklist answers from a de-identified OpenEvidence note.</p>
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

          ${renderGuidelineSets({ guidelineSets, escapeHtml, colorOverrides, searchQuery: guidelineSearchQuery, selectedIds: guidelineSelectedIds, openId: guidelineOpenId })}
        </div>
        ${renderGuidelineEditor({ guidelineSets, escapeHtml, openId: guidelineOpenId, createDraft: guidelineCreateDraft })}
      </div>
    `;
  }

  return Object.freeze({ renderSettings });
}
