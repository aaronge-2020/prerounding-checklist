/**
 * Builds a disambiguated display name per patient id. Patients with a unique
 * display label keep it untouched; when two or more patients share the same
 * label (e.g. the same de-identified room label for separate stays), a suffix
 * with the record's creation date is appended so the patient switcher and
 * roster rows are never indistinguishable.
 */
export function disambiguatedPatientLabels(patients = []) {
  const labelCounts = new Map();
  for (const patient of patients) {
    const key = String(patient?.displayLabel || "").trim().toLowerCase();
    labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
  }
  const result = new Map();
  const usedNames = new Map();
  for (const patient of patients) {
    const base = String(patient?.displayLabel || "Patient").trim() || "Patient";
    const key = base.toLowerCase();
    if ((labelCounts.get(key) || 0) < 2) {
      result.set(patient.id, base);
      continue;
    }
    const created = String(patient?.createdAt || "").slice(0, 10);
    let suffix = created ? ` · added ${created.slice(5).replace("-", "/")}/${created.slice(2, 4)}` : "";
    let candidate = `${base}${suffix}`;
    if (usedNames.has(candidate.toLowerCase())) {
      const shortId = String(patient?.id || "").slice(-4);
      candidate = shortId ? `${base}${suffix} · ${shortId}` : `${base}${suffix} · ${result.size + 1}`;
    }
    usedNames.set(candidate.toLowerCase(), true);
    result.set(patient.id, candidate);
  }
  return result;
}

export function createVaultPresentation({ escapeHtml, icon }) {
  function vaultPassphraseField(record, vaultUnlockError) {
    const hasUnlockError = Boolean(vaultUnlockError);
    const creatingVault = !record;
    return `
      <div class="vault-passphrase-field">
        <label for="vaultPassphrase">${creatingVault ? "Choose a vault passphrase" : "Vault passphrase"}</label>
        <div class="vault-passphrase-input">
          <input id="vaultPassphrase" type="password" autocomplete="${record ? "current-password" : "new-password"}" placeholder="${record ? "Unlock existing vault" : "At least 12 characters"}"${creatingVault ? ' minlength="12" autofocus' : ""}${hasUnlockError ? ' aria-describedby="vaultPassphraseError" aria-invalid="true"' : ""}>
          <button id="vaultPassphraseVisibility" class="button--quiet vault-passphrase-visibility" type="button" data-action="toggle-vault-passphrase" aria-controls="vaultPassphrase" aria-pressed="false" aria-label="Show passphrase" title="Show passphrase">${icon("eye")}</button>
        </div>
        ${creatingVault ? `<div id="vaultPassphraseStrength" class="vault-passphrase-strength is-empty" aria-live="polite"><div class="vault-passphrase-meter" aria-hidden="true"><span></span></div><span class="vault-passphrase-strength-label">Use at least 12 characters and two or more words.</span></div>
        <div class="vault-no-recovery-warning" role="note"><strong>No recovery</strong><span>This app runs 100% on your device. There is no server, no reset button, and no recovery. If you forget this passphrase, your data is gone forever.</span></div>` : ""}
        <p id="vaultPassphraseError" class="vault-unlock-error" role="alert"${hasUnlockError ? "" : " hidden"}>${escapeHtml(vaultUnlockError)}</p>
      </div>
    `;
  }

  function renderPatientRow(patient, activePatientId, labelMap) {
    const selected = patient.id === activePatientId;
    const archived = Boolean(patient.archivedAt);
    const dayCount = patient.days?.length || 0;
    const displayName = labelMap?.get(patient.id) || patient.displayLabel;
    return `
      <div class="list-row roster-row ${selected ? "selected" : ""}">
        <div class="roster-patient-name">
          <strong>${escapeHtml(displayName)}</strong>
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

  function renderVault({ record, unlocked, vault, patients, vaultUnlockError }) {
    if (!unlocked) {
      const creatingVault = !record;
      return `
        <div class="locked-vault-shell">
          ${creatingVault ? `
          <section class="vault-pitch surface-panel">
            <h1 class="vault-pitch-title">Preround</h1>
            <p class="vault-pitch-lede">A local workspace for inpatient pre-rounding: organize hospital-day updates, build bedside checklists, and draft OpenEvidence prompts &mdash; everything encrypted in your browser. Nothing is sent to a server.</p>
            <div class="vault-edu-disclaimer" role="note">
              ${icon("shield")}
              <span><strong>Educational use only.</strong> Use de-identified room labels and synthetic details &mdash; never real patient names, MRNs, or other identifiers. This is a personal study aid, not audited PHI storage or a hospital system of record.</span>
            </div>
            <div class="vault-demo-cta">
              <button class="button--primary vault-primary-action" type="button" data-action="start-guided-demo">${icon("play")} Try the demo &mdash; no setup needed</button>
              <span class="muted">Walks through a synthetic patient end to end. Nothing is saved and no passphrase is required.</span>
            </div>
          </section>` : ""}
          <section class="vault-access surface-panel">
            <div class="section-heading vault-access-heading">
              <div>
                <h2 id="vault-heading">${creatingVault ? "Or create your local vault" : "Unlock your local vault"}</h2>
                <p class="muted">${creatingVault ? "Choose one passphrase to protect this browser's data so you can save your own de-identified patients." : "Your passphrase decrypts patient, workup, checklist, and prompt data stored on this device. Nothing loads until you unlock it."}</p>
              </div>
              <div class="transfer-actions">
                <button class="button--secondary button--transfer" type="button" data-action="restore-vault">${icon("upload")} Restore vault</button>
                <input id="restoreVaultInput" type="file" accept="application/json" hidden>
              </div>
            </div>
            <div class="vault-access-controls ${record ? "" : "vault-setup-controls"}">
              ${vaultPassphraseField(record, vaultUnlockError)}
              <button class="button--primary vault-primary-action" type="button" data-action="unlock-vault" disabled>${record ? "Unlock vault" : "Create vault and continue"}</button>
            </div>
            ${
              record
                ? `<div class="vault-recovery">
                    <strong>Forgot the passphrase?</strong>
                    <span>It can't be recovered — delete this vault to start over.</span>
                    <button class="button--quiet" type="button" data-action="request-delete-vault">Delete vault and start over</button>
                  </div>`
                : ""
            }
          </section>
          <footer class="vault-trust-footer">
            <span>Preround is open source &mdash; verify the trust claims yourself.</span>
            <div class="vault-trust-links">
              <a href="https://github.com/aaronge-2020/prerounding-checklist" target="_blank" rel="noopener">${icon("externalLink")} GitHub repo</a>
              <a href="https://github.com/aaronge-2020/prerounding-checklist/blob/main/PRIVACY.md" target="_blank" rel="noopener">${icon("externalLink")} Privacy notes</a>
              <a href="https://github.com/aaronge-2020/prerounding-checklist/blob/main/SECURITY.md" target="_blank" rel="noopener">${icon("externalLink")} Security posture</a>
            </div>
          </footer>
        </div>
      `;
    }

    const visiblePatients = patients || vault?.patients || [];
    const needsFirstPatient = !visiblePatients.length;
    return `
      <div class="vault-screen">
        <section class="vault-access surface-panel">
          <div class="section-heading vault-access-heading">
            <div>
              <h2>Patient vault</h2>
              <p class="muted">Encrypted on this device. No automatic network requests or cloud storage.</p>
            </div>
            <div class="transfer-actions">
              <button class="button--secondary button--transfer" type="button" data-action="export-vault" ${record ? "" : "disabled"}>${icon("download")} Export</button>
              <button class="button--secondary button--transfer" type="button" data-action="restore-vault">${icon("upload")} Restore</button>
              <input id="restoreVaultInput" type="file" accept="application/json" hidden>
            </div>
          </div>
          <div class="vault-session-state" role="status">
            <div>
              <strong>Vault unlocked</strong>
              <span>${record
                ? "Patient data is encrypted and stored in this browser. It persists across sessions — unlock with your passphrase after reload."
                : "Patient data is available only in this browser session. Create a passphrase below to keep it after reload."}</span>
            </div>
            <button class="button--secondary vault-lock-button" type="button" data-action="lock-vault"${record ? "" : " disabled title=\"Create a passphrase first — locking now would discard your session data.\""}>${icon("lock")}<span>Lock vault</span></button>
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
              ${needsFirstPatient ? '<div class="vault-onboarding-kicker">Next step <span>·</span> Step 2 of 2</div>' : ""}
              <h2>${needsFirstPatient ? "Start the guided demo" : "Roster"}</h2>
              <p class="muted">${needsFirstPatient ? "Click Guided demo in the left sidebar to launch the synthetic walkthrough. No patient or chart text is required." : "Use de-identified room labels only."}</p>
            </div>
            ${needsFirstPatient ? `<button class="button--primary vault-primary-action" type="button" data-action="start-guided-demo">${icon("play")} Start guided demo</button>` : ""}
          </div>
          ${needsFirstPatient ? `<div class="vault-optional-patient">
            <strong>Optional: add a patient manually</strong>
            <span>Use this only when you want to explore the real patient workflow with de-identified data.</span>
          </div>` : ""}
          <div class="section-heading roster-heading${needsFirstPatient ? " roster-heading-secondary" : ""}">
            <div>
              ${needsFirstPatient ? "" : ""}
              <h2 class="${needsFirstPatient ? "sr-only" : ""}">${needsFirstPatient ? "Patient roster" : ""}</h2>
            </div>
            <div class="roster-add-patient">
              <label>${needsFirstPatient ? "De-identified room label" : "Local display label"}
                <input id="newPatientLabel" placeholder="Room A - General Admission">
              </label>
              <button class="button--primary" type="button" data-action="admit-patient" ${vault ? "" : "disabled"}>${icon("plus")} Add patient</button>
            </div>
          </div>
          <div class="roster-column-head" aria-hidden="true"><span>Patient</span><span>Status</span><span>Hospital days</span><span></span></div>
          <div class="patient-list">
            ${visiblePatients.length ? visiblePatients.map(p => renderPatientRow(p, vault?.activePatientId, disambiguatedPatientLabels(visiblePatients))).join("") : `<div class="empty-state">${needsFirstPatient ? "No patient added. The guided demo uses synthetic data." : "No patients yet. Add one above to get started."}</div>`}
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
        ${allowPhoneBundleImport ? `<div class="transfer-actions"><button class="button--secondary button--transfer" type="button" data-action="choose-phone-bundle-file">${icon("upload")} Open shared checklist file</button><input id="phoneBundleFileInput" type="file" accept="application/json,.json,text/plain,.txt" hidden></div>` : ""}
      </div>
    `;
  }

  return Object.freeze({ renderVault, patientRequiredMessage });
}
