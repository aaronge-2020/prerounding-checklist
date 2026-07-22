import assert from "node:assert/strict";
import { createDailyRecord, localCalendarDate, removeDay, upsertDay } from "../src/daily-updates/days.js";
import { activePatient, createEmptyVaultState, createPatientRecord, migrateVaultState, updateActivePatient } from "../src/app/state/vault.js";
import { deleteEncryptedVaultRecord, loadOrCreateVault, saveEncryptedVault, readEncryptedVaultRecord } from "../src/app/state/persistence.js";
import { createEphemeralRedactionReview, sanitizeResidualWarningMetadata } from "../src/patient-context/review.js";

function memoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key)
  };
}

const vault = createEmptyVaultState({ now: () => "2026-07-09T12:00:00.000Z" });
assert.equal(vault.schemaVersion, 2);
assert.deepEqual(vault.patients, []);
assert.equal(vault.preferences.medicalService, "");
assert.equal(vault.preferences.openAiApiKey, "");
assert.equal(vault.preferences.openAiModel, "gpt-5.6");

const patient = createPatientRecord("Room 12", {
  id: "patient_test",
  now: () => "2026-07-09T12:01:00.000Z"
});

const migratedArchivedPatient = migrateVaultState({
  activePatientId: patient.id,
  patients: [{ ...patient, archivedAt: "2026-07-09T12:03:00.000Z" }]
});
assert.deepEqual(migratedArchivedPatient.patients, [], "legacy archived patients must be removed from runtime vault state");
assert.equal(migratedArchivedPatient.activePatientId, "", "a vault with only archived patients must have no active patient");
assert.equal(activePatient({ activePatientId: patient.id, patients: [{ ...patient, archivedAt: "2026-07-09T12:03:00.000Z" }] }), null, "active patient lookup must fail closed for archived records");
const remainingPatient = createPatientRecord("Room 13", {
  id: "patient_remaining",
  now: () => "2026-07-09T12:04:00.000Z"
});
const migratedMixedPatients = migrateVaultState({
  activePatientId: patient.id,
  patients: [{ ...patient, archivedAt: "2026-07-09T12:03:00.000Z" }, remainingPatient]
});
assert.deepEqual(migratedMixedPatients.patients.map((entry) => entry.id), [remainingPatient.id], "legacy archived records must not remain beside active patients");
assert.equal(migratedMixedPatients.activePatientId, remainingPatient.id, "a stale archived selection must move to the remaining active patient");

let nextVault = {
  ...vault,
  activePatientId: patient.id,
  patients: [patient]
};

const day = createDailyRecord({
  date: "2026-07-09",
  label: "Hospital day 1",
  now: () => "2026-07-09T12:02:00.000Z"
});
nextVault = updateActivePatient(nextVault, (current) => ({
  ...current,
  days: upsertDay(current.days, day)
}));

const normalized = migrateVaultState(nextVault);
assert.equal(normalized.activePatientId, "patient_test");
assert.equal(normalized.patients[0].contextSections.length, 7);
assert.equal(normalized.patients[0].days[0].sections.length, 10);
assert.equal(normalized.patients[0].contextSections[0].role, "admission_reason");
assert.equal(normalized.patients[0].days[0].sections[0].role, "interval_events");
assert.equal(normalized.patients[0].days[0].label, "Hospital day 1");
assert.equal(localCalendarDate(new Date(2026, 6, 9, 23, 45)), "2026-07-09");
assert.deepEqual(removeDay([day], day.id), []);

const storage = memoryStorage();
const vaultWithDeidentifiedContext = updateActivePatient(normalized, (current) => ({
  ...current,
  contextSections: current.contextSections.map((section, index) =>
    index === 0 ? { ...section, deidentifiedText: "MRN [MRN] with chest pain" } : section
  )
}));
await saveEncryptedVault(
  vaultWithDeidentifiedContext,
  "correct horse battery staple",
  storage
);

const encryptedRecord = readEncryptedVaultRecord(storage);
assert.equal(encryptedRecord.schema, "prerounding_encrypted_vault_v1");
assert.doesNotMatch(JSON.stringify(encryptedRecord), /chest pain|Room 12|MRN \[MRN\]/);

await saveEncryptedVault(
  {
    ...vaultWithDeidentifiedContext,
    preferences: {
      openAiApiKey: "local-test-key",
      openAiModel: "gpt-5.6-terra",
      medicalService: "consult",
      serviceFocus: "Focus on the consulted question.",
      presentationDetail: "detailed",
      attendingPreferences: "Lead with a one-liner."
    }
  },
  "correct horse battery staple",
  storage
);
assert.doesNotMatch(JSON.stringify(readEncryptedVaultRecord(storage)), /local-test-key/);

const loaded = await loadOrCreateVault("correct horse battery staple", storage);
assert.equal(loaded.patients[0].displayLabel, "Room 12");
assert.match(loaded.patients[0].contextSections[0].deidentifiedText, /MRN \[MRN\]/);
assert.equal(loaded.preferences.openAiApiKey, "local-test-key");
assert.equal(loaded.preferences.openAiModel, "gpt-5.6-terra");
assert.equal(loaded.preferences.medicalService, "consult");

const migratedLegacyModel = migrateVaultState({
  ...loaded,
  preferences: { ...loaded.preferences, openAiModel: "gpt-5" }
});
assert.equal(migratedLegacyModel.preferences.openAiModel, "gpt-5.6");

await assert.rejects(() => loadOrCreateVault("wrong passphrase", storage), /decrypt|operation|data/i);

deleteEncryptedVaultRecord(storage);
assert.equal(readEncryptedVaultRecord(storage), null);
const replacementVault = await loadOrCreateVault("new vault passphrase", storage);
assert.deepEqual(replacementVault.patients, []);

const warningMetadata = sanitizeResidualWarningMetadata([{ severity: "high", type: "MRN", snippet: "123456", start: 0, end: 6, reason: "direct identifier" }]);
assert.deepEqual(warningMetadata, [{ severity: "high", type: "MRN", reason: "direct identifier" }]);
assert.deepEqual(sanitizeResidualWarningMetadata([{ severity: "medium", type: "possible full name", snippet: "Clinical Phrase" }]), [], "low-confidence possible-name warnings should not persist");
const ephemeralReview = createEphemeralRedactionReview("Jane Patient met Jane Patient at MRN 123456", {
  entities: [
    { start: 0, end: 12, label: "PATIENT NAME", placeholder: "[PATIENT NAME]", source: "structured identifier" },
    { start: 17, end: 29, label: "PATIENT NAME", placeholder: "[PATIENT NAME]", source: "structured identifier" },
    { start: 37, end: 43, label: "MRN", placeholder: "[MRN]", source: "structured identifier" }
  ],
  residualWarnings: [{ severity: "high", type: "MRN", snippet: "123456" }]
});
assert.equal(ephemeralReview.redactions[0].original, "Jane Patient");
assert.equal(ephemeralReview.redactions.length, 3);
assert.deepEqual(ephemeralReview.redactions.map((redaction) => redaction.occurrence), [0, 1, 0]);
assert.equal(ephemeralReview.warnings[0].snippet, "123456");
assert.equal(ephemeralReview.activeWarningIndex, null);

console.log("local-first state tests passed");
