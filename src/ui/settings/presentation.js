export function createSettingsPresentation({ escapeHtml }) {
  function renderSettings({ 
    preferences, 
    apiKeySaved, 
    MEDICAL_SERVICE_OPTIONS, 
    PRESENTATION_DETAIL_OPTIONS, 
    OPENAI_WORKUP_MODEL_OPTIONS 
  }) {
    return `
      <div class="settings-layout">
        <section class="panel settings-panel">
          <div class="section-heading">
            <div>
              <h2 id="settings-heading">Team and presentation preferences</h2>
              <p class="muted">These are added to every OpenEvidence prompt and workup-draft request.</p>
            </div>
          </div>
          <div class="settings-fields">
            <label>Medical service
              <select id="settingsMedicalService">
                ${MEDICAL_SERVICE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${preferences.medicalService === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
              </select>
            </label>
            <label id="settingsCustomServiceWrap" ${preferences.medicalService === "other" ? "" : "hidden"}>Service name
              <input id="settingsCustomServiceName" value="${escapeHtml(preferences.customServiceName)}" placeholder="e.g., Cardiology consults">
            </label>
            <label class="settings-field-wide">Service focus
              <textarea id="settingsServiceFocus" rows="3" placeholder="e.g., Evaluate new atrial fibrillation and rate-control strategy; omit unrelated chronic issues unless they affect this question.">${escapeHtml(preferences.serviceFocus)}</textarea>
            </label>
            <label>Presentation detail
              <select id="settingsPresentationDetail">
                ${PRESENTATION_DETAIL_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${preferences.presentationDetail === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
              </select>
            </label>
            <label class="settings-field-wide">Attending preferences
              <textarea id="settingsAttendingPreferences" rows="4" placeholder="e.g., Start with a one-liner, then problem-based assessment and plan. Include overnight events and pertinent negatives.">${escapeHtml(preferences.attendingPreferences)}</textarea>
            </label>
          </div>
          <div class="button-row">
            <button class="button--primary" type="button" data-action="save-team-preferences">Save team preferences</button>
          </div>
        </section>

        <section class="panel settings-panel">
          <div class="section-heading">
            <div>
              <h2>Bring your own OpenAI key</h2>
              <p class="muted">Use your own key to turn a reviewed, de-identified OpenEvidence workup draft into editable workup rows.</p>
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
          <p class="muted settings-helper">Without a saved key, the Workups page falls back to the copy-and-paste ChatGPT formatter prompt.</p>
        </section>
      </div>
    `;
  }

  return Object.freeze({ renderSettings });
}
