import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
if (!globalThis.btoa) {
  globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
}
if (!globalThis.atob) {
  globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
}

const {
  CENSUS_EXPORT_TYPE,
  CENSUS_STORAGE_TYPE,
  appendSnippetToPatient,
  buildPromptQueue,
  createPatientCase,
  deidentifiedSourceText,
  decryptJsonPayload,
  derivePatientStatus,
  encryptJsonPayload,
  filterPatients,
  nextPromptForPatient,
  normalizeCensusVault,
  normalizePatientCase,
  parseBatchSnippetBlocks,
  patientStatusLabels,
  removePatientAndSelectNext
} = await import("../census.js");

const patientA = createPatientCase({
  alias: "Patient A",
  roomBed: "Room 812",
  serviceProblem: "DKA consult",
  openEvidenceResults: [{
    taskId: "medication_safety",
    acceptedSummary: "- Verify basal insulin was not held.",
    reviewStatus: "accepted"
  }]
}, new Date("2026-06-06T10:00:00Z"));
assert.equal(patientA.alias, "Patient A");
assert.equal(patientA.openEvidenceResults.length, 1, "structured OpenEvidence summaries should persist on patient cases");
assert.equal(derivePatientStatus(patientA), patientStatusLabels.needsChartInfo);

const contextReady = createPatientCase({
  ...patientA,
  rawSoapNote: "Synthetic source note",
  scrubbedNote: "Redacted source note"
});
assert.equal(contextReady.rawSoapNote, "", "raw SOAP text must not persist in patient cases");
assert.equal(nextPromptForPatient(contextReady).kind, "initial");

const initialCopied = createPatientCase({
  ...contextReady,
  initialRoundsPromptCopied: true,
  conversationContextReady: true
});
assert.equal(derivePatientStatus(initialCopied), patientStatusLabels.promptCopied);
assert.equal(nextPromptForPatient(initialCopied).kind, "checklist");

const checklistReady = createPatientCase({
  ...initialCopied,
  checklistRawText: "BEDSIDE QUESTION CHECKLIST\nHow are you?: Better / Same / Worse",
  sections: [{ title: "BEDSIDE QUESTION CHECKLIST", items: [] }]
});
assert.equal(derivePatientStatus(checklistReady), patientStatusLabels.checklistReady);

const bedsideDone = createPatientCase({
  ...checklistReady,
  compiledText: "How are you: Better"
});
assert.equal(derivePatientStatus(bedsideDone), patientStatusLabels.bedsideDone);
assert.equal(nextPromptForPatient(bedsideDone).kind, "update");

const updateReady = createPatientCase({
  ...bedsideDone,
  conversationFinalReady: true
});
assert.equal(derivePatientStatus(updateReady), patientStatusLabels.updateReady);
assert.equal(nextPromptForPatient(updateReady), null);

const patientB = createPatientCase({
  alias: "Patient B",
  roomBed: "Room 101",
  highPriority: true,
  scrubbedNote: "Redacted note"
});
const patientC = createPatientCase({
  alias: "Patient C",
  roomBed: "Room 301",
  seenToday: true,
  compiledText: "Findings ready"
});
const queue = buildPromptQueue([contextReady, patientB, patientC]);
assert.equal(queue[0].patientAlias, "Patient B", "high-priority queue item should sort first");
assert.ok(queue.some((item) => item.kind === "update" && item.patientAlias === "Patient C"), "patients with findings should queue update prompts");
assert.equal(filterPatients([contextReady, patientB, patientC], { highPriority: true }).length, 1);
assert.equal(filterPatients([contextReady, patientB, patientC], { seenToday: true }).length, 1);
assert.equal(filterPatients([contextReady, patientB, patientC], { needsUpdate: true }).length, 1);

const batchBlocks = parseBatchSnippetBlocks(`Snippet one line

still snippet one

---

Snippet two


Snippet three`);
assert.equal(batchBlocks.length, 3);
assert.equal(batchBlocks[0].label, "Snippet 1");

const appended = appendSnippetToPatient(patientA, { id: "s1", type: "labs", text: "Na 132" }, "Na [DATE REDACTED]");
assert.equal(appended.rawLabs, "");
assert.ok(appended.deidentifiedSourceSections.labs.includes("Na [DATE REDACTED]"));
assert.ok(deidentifiedSourceText(appended).includes("De-identified labs/results"));
assert.ok(appended.scrubbedNote.includes("Batch labs"));
assert.equal(appended.assignedSnippets.length, 1);

const legacyRaw = normalizePatientCase({
  alias: "Legacy raw patient",
  rawSoapNote: "Raw note should be scrubbed from storage",
  rawLabs: "Raw labs should be scrubbed from storage",
  admission: { briefHpi: "Structured admission text should not persist without de-ID review" },
  scrubbedNote: "Existing de-identified note"
});
assert.equal(legacyRaw.rawSoapNote, "");
assert.equal(legacyRaw.rawLabs, "");
assert.deepEqual(legacyRaw.admission, {});
assert.equal(legacyRaw.scrubbedNote, "Existing de-identified note");

const removeResult = removePatientAndSelectNext([patientA, patientB, patientC], patientB.id, patientB.id);
assert.equal(removeResult.patients.length, 2);
assert.ok(!removeResult.patients.some((patient) => patient.id === patientB.id));
assert.equal(removeResult.activePatientId, patientC.id, "active selection should move to the next patient after discharge");
assert.equal(buildPromptQueue(removeResult.patients).some((item) => item.patientId === patientB.id), false);

const vault = normalizeCensusVault({
  activePatientId: patientA.id,
  activeContinuityCaseId: "case-a",
  continuityCases: [{ id: "case-a", label: "Patient A", days: [{ date: "2026-06-06" }] }],
  patients: [patientA, patientB, { ...patientC, lifecycleStatus: "discharged" }]
});
assert.equal(vault.activePatientId, patientA.id);
assert.equal(vault.activeContinuityCaseId, "case-a");
assert.equal(vault.continuityCases.length, 1);
assert.equal(vault.patients.length, 2, "discharged patients must not remain in normalized vault payloads");
assert.equal(vault.patients.some((patient) => patient.id === patientC.id), false);

const vaultWithDischargedActive = normalizeCensusVault({
  activePatientId: patientC.id,
  patients: [patientA, { ...patientC, lifecycleStatus: "discharged" }]
});
assert.equal(vaultWithDischargedActive.activePatientId, patientA.id);

const secret = "correct horse battery staple";
const storageEnvelope = await encryptJsonPayload(vault, secret, {
  type: CENSUS_STORAGE_TYPE,
  iterations: 1000
});
const decryptedStorage = await decryptJsonPayload(storageEnvelope, secret, {
  type: CENSUS_STORAGE_TYPE
});
assert.equal(decryptedStorage.patients.length, 2);

const legacyRawVault = normalizeCensusVault({
  patients: [normalizePatientCase({
    alias: "Legacy vault patient",
    rawSoapNote: "DO NOT STORE RAW SOAP",
    rawLabs: "DO NOT STORE RAW LABS",
    rawHandoff: "DO NOT STORE RAW HANDOFF",
    rawMedicationText: "DO NOT STORE RAW MAR",
    admission: { briefHpi: "DO NOT STORE RAW ADMISSION" },
    scrubbedNote: "Reviewed de-identified note"
  })]
});
const legacyRawEnvelope = await encryptJsonPayload(legacyRawVault, secret, {
  type: CENSUS_STORAGE_TYPE,
  iterations: 1000
});
const decryptedLegacyVault = await decryptJsonPayload(legacyRawEnvelope, secret, {
  type: CENSUS_STORAGE_TYPE
});
const decryptedLegacyText = JSON.stringify(decryptedLegacyVault);
assert.ok(decryptedLegacyText.includes("Reviewed de-identified note"));
assert.equal(/DO NOT STORE RAW/.test(decryptedLegacyText), false, "decrypted vault payload must not contain raw legacy text");

await assert.rejects(
  () => decryptJsonPayload(storageEnvelope, "wrong passphrase", { type: CENSUS_STORAGE_TYPE }),
  /decrypt|operation|failed/i
);

const exportEnvelope = await encryptJsonPayload(vault, "TRANSFER-CODE-1234", {
  type: CENSUS_EXPORT_TYPE,
  iterations: 1000
});
const decryptedExport = await decryptJsonPayload(exportEnvelope, "TRANSFER-CODE-1234", {
  type: CENSUS_EXPORT_TYPE
});
assert.equal(decryptedExport.activePatientId, patientA.id);

console.log("Census tests passed.");
