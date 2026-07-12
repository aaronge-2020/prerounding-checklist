export function createVaultPresentation({ escapeHtml, icon }) {
  function vaultPassphraseField(record, vaultUnlockError) {
    const hasUnlockError = Boolean(vaultUnlockError);
    return `
      <div class="vault-passphrase-field">
        <label for="vaultPassphrase">Vault passphrase</label>
        <div class="vault-passphrase-input">
          <input id="vaultPassphrase" type="password" autocomplete="current-password" placeholder="${record ? "Unlock existing vault" : "Create local vault"}"${hasUnlockError ? ' aria-describedby="vaultPassphraseError" aria-invalid="true"' : ""}>
          <button id="vaultPassphraseVisibility" class="button--quiet vault-passphrase-visibility" type="button" data-action="toggle-vault-passphrase" aria-controls="vaultPassphrase" aria-pressed="false">Show passphrase</button>
        </div>
        <p id="vaultPassphraseError" class="vault-unlock-error" role="alert"${hasUnlockError ? "" : " hidden"}>${escapeHtml(vaultUnlockError)}</p>
      </div>
    `;
  }

  function renderPatientRow(patient, activePatientId) {
    const selected = patient.id === activePatientId;
    const archived = Boolean(patient.archivedAt);
    const dayCount = patient.days?.length || 0;
    return `
      <div class="list-row roster-row ${selected ? "selected" : ""}">
        <div class="roster-patient-name">
          <strong>${escapeHtml(patient.displayLabel)}</strong>
          <span class="muted">${archived ? `Archived ${escapeHtml(patient.archivedAt.slice(0, 10))}` : "Active"} · HD${Math.max(dayCount, 1)}</span>
        </div>
        <span class="roster-status ${archived ? "is-archived" : ""}">${archived ? `Archived ${escapeHtml(patient.archivedAt.slice(0, 10))}` : "Active stay"}</span>
        <span class="muted roster-day-count">HD${Math.max(dayCount, 1)}</span>
        <div class="button-row roster-actions">
          <button class="button--secondary" type="button" data-action="select-patient" data-patient-id="${escapeHtml(patient.id)}">Select</button>
          <button class="button--quiet" type="button" data-action="archive-patient" data-patient-id="${escapeHtml(patient.id)}" ${archived ? "disabled" : ""}>${icon("archive")} Archive</button>
        </div>
      </div>
    `;
  }

  function renderVault({ record, unlocked, vault, vaultUnlockError }) {
    if (!unlocked) {
      return `
        <div class="locked-vault-shell">
          <section class="vault-access surface-panel">
            <div class="section-heading vault-access-heading">
              <div>
                <h2 id="vault-heading">Unlock local vault</h2>
                <p class="muted">Your passphrase decrypts patient, workup, checklist, and prompt data stored on this device. Nothing loads until you unlock it.</p>
              </div>
              <div class="button-row">
                <button class="button--secondary" type="button" data-action="restore-vault">${icon("upload")} Restore vault</button>
                <input id="restoreVaultInput" type="file" accept="application/json" hidden>
              </div>
            </div>
            <div class="vault-access-controls">
              ${vaultPassphraseField(record, vaultUnlockError)}
              <button class="button--primary" type="button" data-action="unlock-vault">${record ? "Unlock vault" : "Create vault"}</button>
            </div>
            ${
              record
                ? `<div class="vault-recovery">
                    <strong>Forgot the passphrase?</strong>
                    <span>It can't be recovered — delete this vault to start over.</span>
                    <button class="button--quiet" type="button" data-action="request-delete-vault">Delete vault and start over</button>
                  </div>`
                : `<div class="next-step compact-next-step"><strong>Next step: create a passphrase.</strong><span>This creates an encrypted local vault on this device.</span></div>`
            }
          </section>
        </div>
      `;
    }

    const patients = vault?.patients || [];
    return `
      <div class="vault-screen">
        <section class="vault-access surface-panel">
          <div class="section-heading vault-access-heading">
            <div>
              <h2>Patient vault</h2>
              <p class="muted">Encrypted on this device. No automatic network requests or cloud storage.</p>
            </div>
            <div class="button-row">
              <button class="button--secondary" type="button" data-action="export-vault" ${record ? "" : "disabled"}>${icon("download")} Export</button>
              <button class="button--secondary" type="button" data-action="restore-vault">${icon("upload")} Restore</button>
              <input id="restoreVaultInput" type="file" accept="application/json" hidden>
            </div>
          </div>
          <div class="vault-session-state" role="status">
            <div>
              <strong>Vault unlocked</strong>
              <span>Patient data is available only in this browser session.</span>
            </div>
            <button class="button--quiet" type="button" data-action="lock-vault">Lock vault</button>
          </div>
          ${
            record && !vault
              ? `<div class="vault-recovery">
                  <strong>Forgot the passphrase?</strong>
                  <span>It cannot be recovered. You can permanently remove this encrypted vault and create a new one.</span>
                  <button class="button--quiet" type="button" data-action="request-delete-vault">Delete vault and start over</button>
                </div>`
              : !record
                ? `<div class="next-step compact-next-step"><strong>Next step: create a passphrase.</strong><span>Then add your first de-identified room label to begin.</span></div>`
                : ""
          }
        </section>

        <section class="roster-surface surface-panel">
          <div class="section-heading roster-heading">
            <div>
              <h2>Roster</h2>
              <p class="muted">Use de-identified room labels only.</p>
            </div>
            <div class="roster-add-patient">
              <label>Local display label
                <input id="newPatientLabel" placeholder="Room A - General Admission">
              </label>
              <button class="button--primary" type="button" data-action="admit-patient" ${vault ? "" : "disabled"}>${icon("plus")} Add patient</button>
            </div>
          </div>
          <div class="roster-column-head" aria-hidden="true"><span>Patient</span><span>Status</span><span>Hospital days</span><span></span></div>
          <div class="patient-list">
            ${patients.length ? patients.map(p => renderPatientRow(p, vault?.activePatientId)).join("") : `<div class="empty-state">No patients yet. Add one above to get started.</div>`}
          </div>
          <div class="local-vault-note"><strong>Local encryption</strong><span>This vault lives only in this browser. Export it to create a portable encrypted backup.</span></div>
        </section>
      </div>
    `;
  }

  function patientRequiredMessage({ allowPhoneBundleImport = false } = {}) {
    return `
      <div class="empty-state next-step">
        <strong>Next step: unlock the vault and add a patient.</strong>
        <span>Use a de-identified room label to begin a new hospital stay.</span>
        ${allowPhoneBundleImport ? `<div class="button-row"><button class="button--secondary" type="button" data-action="choose-phone-bundle-file">${icon("upload")} Open shared checklist file</button><input id="phoneBundleFileInput" type="file" accept="application/json,.json" hidden></div>` : ""}
      </div>
    `;
  }

  return Object.freeze({ renderVault, patientRequiredMessage });
}
