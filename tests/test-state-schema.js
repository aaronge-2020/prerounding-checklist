import assert from "node:assert/strict";
import { PERSISTED_VAULT_FIELDS, persistedVaultPayload } from "../src/app/state-schema.js";

assert.ok(PERSISTED_VAULT_FIELDS.includes("patients"), "vault persistence schema should include patient roster");
assert.ok(PERSISTED_VAULT_FIELDS.includes("residualPhiWarnings"), "de-id warning state should persist with redacted context");
assert.ok(PERSISTED_VAULT_FIELDS.includes("bedsideAuditLogByPatientId"), "bedside audit log should persist by patient");

const payload = persistedVaultPayload({
  vaultName: "Rounds",
  patients: [{ id: "p1" }],
  residualPhiWarnings: [{ label: "DATE", sample: "2026" }],
  bedsideAuditLogByPatientId: { p1: [{ action: "answer" }] },
  servicePreferences: { serviceId: "primary_medicine" },
  transientOnly: true
});

assert.equal(payload.vaultName, "Rounds");
assert.deepEqual(payload.patients, [{ id: "p1" }]);
assert.deepEqual(payload.residualPhiWarnings, [{ label: "DATE", sample: "2026" }]);
assert.deepEqual(payload.bedsideAuditLogByPatientId, { p1: [{ action: "answer" }] });
assert.equal(Object.hasOwn(payload, "servicePreferences"), false, "service preferences are stored separately");
assert.equal(Object.hasOwn(payload, "transientOnly"), false, "unknown transient fields must not be persisted");

console.log("State schema tests passed.");
