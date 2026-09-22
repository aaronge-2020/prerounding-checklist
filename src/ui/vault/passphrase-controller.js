function byId(id) {
  return document.getElementById(id);
}

export function createVaultPassphraseController({ app }) {
  function showVaultUnlockError(message) {
    app.vaultUnlockError = message;
    const input = byId("vaultPassphrase");
    const error = byId("vaultPassphraseError");
    if (input) {
      input.setAttribute("aria-describedby", "vaultPassphraseError");
      input.setAttribute("aria-invalid", "true");
      input.focus({ preventScroll: true });
    }
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
  }

  function clearVaultUnlockError() {
    if (!app.vaultUnlockError) return;
    app.vaultUnlockError = "";
    byId("vaultPassphrase")?.removeAttribute("aria-describedby");
    byId("vaultPassphrase")?.removeAttribute("aria-invalid");
    const error = byId("vaultPassphraseError");
    if (error) {
      error.textContent = "";
      error.hidden = true;
    }
  }

  function toggleVaultPassphraseVisibility() {
    const input = byId("vaultPassphrase");
    const button = byId("vaultPassphraseVisibility");
    if (!input || !button) return;
    const isMasked = input.type === "password";
    input.type = isMasked ? "text" : "password";
    button.setAttribute("aria-label", isMasked ? "Hide passphrase" : "Show passphrase");
    button.title = isMasked ? "Hide passphrase" : "Show passphrase";
    button.setAttribute("aria-pressed", String(isMasked));
  }

  function updateVaultPassphraseStrength(value) {
    const strength = byId("vaultPassphraseStrength");
    if (!strength) return;
    const length = value.length;
    const words = value.trim() ? value.trim().split(/\s+/).length : 0;
    let state = "is-empty";
    let label = "Use at least 12 characters and two or more words.";
    if (length > 0 && length < 12) {
      state = "is-weak";
      label = `${length}/12 characters — add more words, not a short code.`;
    } else if (length >= 12 && words < 2) {
      state = "is-fair";
      label = "Long enough, but use two or more words for a stronger passphrase.";
    } else if (length >= 12) {
      state = "is-strong";
      label = "Strong passphrase — multiple words make it easier to remember.";
    }
    strength.className = `vault-passphrase-strength ${state}`;
    strength.querySelector(".vault-passphrase-strength-label").textContent = label;
  }

  function updateVaultPrimaryActionEnabled(value) {
    const button = document.querySelector('.vault-access [data-action="unlock-vault"]');
    if (!button) return;
    const creatingVault = Boolean(byId("vaultPassphraseStrength"));
    button.disabled = creatingVault ? value.length < 12 : value.length === 0;
  }

  return Object.freeze({
    showVaultUnlockError,
    clearVaultUnlockError,
    toggleVaultPassphraseVisibility,
    updateVaultPassphraseStrength,
    updateVaultPrimaryActionEnabled
  });
}
