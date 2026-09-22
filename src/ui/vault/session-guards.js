// Vault session guards - extracted from app.js to respect the
// coordinator-file size boundary (scripts/check-ui-module-boundaries.js).
// Prevents destructive actions when there is no durable encrypted record.
export function createVaultSessionGuards({ readEncryptedVaultRecord }) {
  function assertDurableVault(action) {
    if (!readEncryptedVaultRecord()) {
      throw new Error(
        `Create a vault passphrase first — without one, ${action} would discard your session data.`
      );
    }
  }

  function guardLockVault() {
    assertDurableVault("locking");
  }

  return Object.freeze({ guardLockVault, assertDurableVault });
}
