import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const requiredSnippets = [
  "Open local patient vault",
  "Create vault",
  "Open vault",
  "Start single patient",
  "Local patient roster",
  "Select a patient, then work admission, continuity, bedside findings, checklist, and handoff.",
  "Admit patient",
  "Discharge",
  "New admission context",
  "Continuity update",
  "History and physical exam answers",
  "Local vault",
  "No app-server upload",
  "Quick de-ID",
  "Standalone local de-ID",
  "Phone handoff",
  "Paste & open",
  "Open pasted text",
  "Scan desktop QR",
  "Manual bundle fallback",
  "Scan to open bedside mode",
  "Regenerate",
  "Copy bundle",
  "Download",
  "My service is not listed",
  "Bundle code mismatch",
  "Returned phone bundle code",
  "PHI review before copy",
  "code-paired local bundle"
];

const requiredPrivacySnippets = [
  "Local-first PHI risk reduction",
  "No analytics, telemetry, tracking pixels, or ad scripts",
  "not HIPAA certification",
  "Every prompt, transfer bundle, and final update copy action is gated by a PHI review overlay.",
  "not a substitute for clinical judgment",
  "Do not paste patient identifiers into knowledge tools"
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

const removedRosterDashboardPattern = new RegExp([
  ["Local cen", "sus"].join(""),
  ["Cen", "sus table"].join(""),
  ['data-view-target="', "cen", 'sus"'].join(""),
  ['id="', "cen", 'susView"'].join(""),
  ["openCen", "susButton"].join(""),
  ["addCen", "susCaseButton"].join(""),
  ["cen", "susRows"].join("")
].join("|"));
assert.doesNotMatch(html, removedRosterDashboardPattern, "The removed roster dashboard should not be present in the app shell.");
assert.match(html, /id="vaultAccessView"/, "Vault access screen should be present.");
assert.match(html, /id="openVaultForm"/, "Vault login form should be present.");
assert.match(html, /id="createVaultForm"/, "Vault creation form should be present.");
assert.match(html, /class="service-picker"/, "Service selection should use the searchable picker UI.");
assert.doesNotMatch(html, /Default service/, "Service labels should use the user-facing label 'Service'.");
assert.match(html, /id="singlePatientWorkflowButton"/, "No-save single-patient bypass should be present.");
assert.match(html, /id="patientAdmissionForm"/, "Patient admission form should be present.");
assert.match(html, /id="dischargePatientButton"/, "Patient discharge control should be present.");
assert.match(html, /id="workspaceQuickDeidButton"/, "Quick de-ID should remain reachable from the entry screen.");
assert.match(html, /id="topClinicalWorkupButton"/, "Clinical workup should remain reachable from the topbar.");
assert.match(html, /id="exportPhoneContextButton"/, "Phone handoff export should remain present.");
assert.match(html, /id="importPhoneFindingsButton"/, "Phone handoff import should remain present.");
assert.match(html, /id="phoneBundleEntryInput"/, "Vault entry should let a phone load a desktop handoff bundle.");
assert.match(html, /id="loadPhoneBundleEntryButton"/, "Vault entry should expose a one-tap phone interview loader.");
assert.match(html, /id="phoneBundleLoadInput"/, "Phone handoff screen should let the current device load a desktop bundle.");
assert.match(html, /id="loadPhoneBundleButton"/, "Phone handoff screen should open the bedside checklist from a pasted bundle.");

console.log("Vault entry UX tests passed.");
