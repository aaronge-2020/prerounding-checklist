import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const requiredSnippets = [
  "Start Rounds Workspace",
  "Existing local vault",
  "Saved local vault",
  "One patient, no vault",
  "Start one-patient prep",
  "Reset / replace vault",
  "No vault found",
  "Vault found on this browser",
  "Vault unlocked",
  "Encrypted storage unavailable",
  "This deletes the encrypted vault stored in this browser",
  "This does not affect OpenEvidence or Epic",
  "The app cannot recover your passcode",
  "Not saved after this browser session",
  "createCensusPassphraseConfirmInput",
  "toggleUnlockPassphraseButton",
  "toggleCreatePassphraseButton",
  "toggleResetPassphraseButton",
  "vaultResetExportAcknowledge",
  "vaultResetDeleteInput",
  "deleteCensusEnvelope",
  "setVaultEntryMode",
  "renderVaultEntryState",
  "startVaultResetFlow",
  "verifyVaultResetPasscode",
  "completeVaultResetAndCreate"
];

const requiredPrivacySnippets = [
  "No cloud upload by default",
  "No analytics, telemetry, tracking pixels, or ad scripts",
  "does not legally certify HIPAA de-identification",
  "Business Associate Agreement",
  "Do not paste PHI unless your institution has approved the workflow"
];

for (const snippet of requiredSnippets) {
  assert.ok(html.includes(snippet), `Expected vault entry markup/script to include: ${snippet}`);
}

for (const snippet of requiredPrivacySnippets) {
  assert.ok(html.includes(snippet), `Expected vault/privacy copy to include: ${snippet}`);
}

assert.doesNotMatch(
  html,
  /\bHIPAA\s+(?:compliant|certified)\b/i,
  "Vault/privacy copy should avoid overclaiming HIPAA compliance or certification."
);

for (const flowState of [
  "idle",
  "export-reminder",
  "verify-passcode",
  "type-delete",
  "ready-to-reset",
  "reset-complete"
]) {
  assert.ok(html.includes(`"${flowState}"`), `Missing reset flow state: ${flowState}`);
}

assert.match(
  html,
  /elements\.createCensusButton\.disabled = busy \|\| storageUnavailable \|\| vaultExists;/,
  "Create should be disabled when an existing vault is found."
);

assert.match(
  html,
  /elements\.unlockCensusButton\.disabled = busy \|\| storageUnavailable \|\| !vaultExists;/,
  "Unlock should be disabled when no vault is found or storage is unavailable."
);

assert.match(
  html,
  /elements\.completeVaultResetButton\.disabled = busy[\s\S]*!state\.census\.resetPassphraseVerified[\s\S]*!elements\.vaultResetExportAcknowledge\.checked[\s\S]*vaultResetDeleteInput\.value\.trim\(\) !== "DELETE"/,
  "Reset should require verified passcode, export acknowledgment, and DELETE confirmation."
);

assert.match(
  html,
  /passphrase\.trim\(\)\.length < 8/,
  "Create flow should enforce the inline minimum passcode length."
);

assert.match(
  html,
  /passphrase !== confirm/,
  "Create flow should require passcode confirmation."
);

assert.match(
  html,
  /workspaceHasUnreviewedPatientSource[\s\S]*Raw chart text is not saved into the vault/,
  "Create flow should warn when raw patient-source text has not been locally reviewed."
);

console.log("Vault entry UX tests passed.");
