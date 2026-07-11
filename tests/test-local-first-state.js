import assert from "node:assert/strict";
import { createDailyRecord, localCalendarDate, removeDay, upsertDay } from "../src/daily-updates/days.js";
import { createEmptyVaultState, createPatientRecord, migrateVaultState, updateActivePatient } from "../src/app/state/vault.js";
import { loadOrCreateVault, saveEncryptedVault, readEncryptedVaultRecord } from "../src/app/state/persistence.js";

function memoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key)
  };
}

const vault = createEmptyVaultState({ now: () => "2026-07-09T12:00:00.000Z" });
assert.equal(vault.schemaVersion, 1);
assert.deepEqual(vault.patients, []);

const patient = createPatientRecord("Room 12", {
  id: "patient_test",
  now: () => "2026-07-09T12:01:00.000Z"
});
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
assert.equal(normalized.patients[0].contextSections.length, 4);
assert.equal(normalized.patients[0].days[0].sections.length, 5);
assert.equal(normalized.patients[0].days[0].label, "Hospital day 1");
assert.equal(localCalendarDate(new Date(2026, 6, 9, 23, 45)), "2026-07-09");
assert.deepEqual(removeDay([day], day.id), []);

const storage = memoryStorage();
await saveEncryptedVault(
  updateActivePatient(normalized, (current) => ({
    ...current,
    contextSections: current.contextSections.map((section, index) =>
      index === 0 ? { ...section, deidentifiedText: "MRN [MRN] with chest pain" } : section
    )
  })),
  "correct horse battery staple",
  storage
);

const encryptedRecord = readEncryptedVaultRecord(storage);
assert.equal(encryptedRecord.schema, "prerounding_encrypted_vault_v1");
assert.doesNotMatch(JSON.stringify(encryptedRecord), /chest pain|Room 12|MRN \[MRN\]/);

const loaded = await loadOrCreateVault("correct horse battery staple", storage);
assert.equal(loaded.patients[0].displayLabel, "Room 12");
assert.match(loaded.patients[0].contextSections[0].deidentifiedText, /MRN \[MRN\]/);

await assert.rejects(() => loadOrCreateVault("wrong passphrase", storage), /decrypt|operation|data/i);

console.log("local-first state tests passed");
