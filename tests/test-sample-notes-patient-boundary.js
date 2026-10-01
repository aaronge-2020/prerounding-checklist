// Regression test for the patient-boundary bug in
// src/ui/sample-notes/controller.js: importing a sample chart switches the
// active patient, but the import path never cleared the previous patient's
// in-memory draft/review session (app.noteDraftSessions is keyed by packet,
// not patient). The Review Data / Draft Note view therefore kept rendering
// the previous patient's one-liner for the newly imported chart.
//
// The test drives the real controller with stubbed imports and asserts:
//   1. "Add to vault" clears the stale draft session of the previous patient.
//   2. The newly imported patient becomes active.
//   3. The new patient's ephemeral reviews are registered AFTER the clear
//      (the clear must not wipe the just-imported state).
//   4. Re-adding an already-imported chart (open-in-place path) also clears
//      when it switches patients, but NOT when the patient is already active.
//
// Node built-ins only. Run from the repo root:
//   node tests/test-sample-notes-patient-boundary.js
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = join(root, "tests", ".tmp-sample-notes-boundary");
rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });

// --- Stubs ---------------------------------------------------------------
writeFileSync(join(scratch, "stub-data.js"), `
export const SAMPLE_NOTES_DATA = [{
  id: "test-note",
  title: "Test Chart",
  body: "ADMISSION HISTORY AND PHYSICAL\\n\\nCHIEF COMPLAINT\\nTest complaint.",
  vitals: [{ time: "09/28/2026 10:15", hr: "108", bp: "138/84" }],
  labs: [{ panel: "CBC", collected: "09/28/2026", tests: [{ name: "WBC", value: "11.2", units: "K/uL" }] }],
  medications: [{ name: "Furosemide", dose: "40 mg", route: "PO", frequency: "BID", status: "Active" }]
}];
`);

writeFileSync(join(scratch, "stub-vault.js"), `
let nextId = 0;
export function createTextSection(label, opts = {}) {
  return { id: "sec-" + (++nextId), label, ...opts, deidentifiedText: opts.text || "" };
}
export function createPatientRecord(label, opts = {}) {
  return { id: "patient-" + (++nextId), label, contextSections: opts.contextSections || [], metadata: opts.metadata || {} };
}
export function upsertPatient(vault, patient, { activate = true } = {}) {
  const patients = vault.patients.some((p) => p.id === patient.id)
    ? vault.patients.map((p) => (p.id === patient.id ? patient : p))
    : [...vault.patients, patient];
  return { ...vault, patients, activePatientId: activate ? patient.id : vault.activePatientId };
}
`);

writeFileSync(join(scratch, "stub-review.js"), `
export function reviewKey(scope, id) { return scope + ":" + id; }
export function createEphemeralRedactionReview() { return { ephemeral: true }; }
`);

writeFileSync(join(scratch, "stub-presentation.js"), `
export function createSampleNotesPresentation() {
  return { renderEmpty: () => "", renderSampleNotes: () => "" };
}
export function resolveSection() { return ""; }
export function buildChartText() { return ""; }
export function buildSectionText() { return ""; }
`);

// The real import plan (pure, no imports) for fidelity.
writeFileSync(
  join(scratch, "import-plan.js"),
  readFileSync(join(root, "src/ui/sample-notes/import-plan.js"), "utf8")
);

// Rewrite the controller's cache-busted imports to the stubs above.
const source = readFileSync(join(root, "src/ui/sample-notes/controller.js"), "utf8");
const rewritten = source
  .replace(/"..\/..\/data\/sample-notes.data.js\?[^"]*"/, '"./stub-data.js"')
  .replace(/"..\/..\/app\/state\/vault.js\?[^"]*"/, '"./stub-vault.js"')
  .replace(/"..\/..\/patient-context\/review.js\?[^"]*"/, '"./stub-review.js"')
  .replace(/".\/presentation.js\?[^"]*"/, '"./stub-presentation.js"')
  .replace(/".\/import-plan.js\?[^"]*"/, '"./import-plan.js"');
assert.ok(!rewritten.includes("?v=") && !/\.js\?/.test(rewritten), "all cache-busted imports rewritten");
writeFileSync(join(scratch, "controller.js"), rewritten);

const { createSampleNotesController } = await import(scratch + "/controller.js");

// --- Harness -------------------------------------------------------------
function makeHarness() {
  const app = {
    view: "sampleNotes",
    vault: {
      patients: [{ id: "patient-old", label: "Old patient", metadata: {} }],
      activePatientId: "patient-old"
    },
    // Stale session state from the previous patient, keyed by packet only.
    noteDraftSessions: new Map([["admission", { stale: "OLD-OB-ONE-LINER" }]]),
    phiReviews: new Map([["context:old-sec", { stale: true }]]),
    sectionDrafts: new Map([["context:old-sec", "old draft text"]])
  };
  const events = { clears: 0, statuses: [], persisted: 0, reviews: [] };
  const deps = {
    app,
    byId: () => null,
    escapeHtml: (v = "") => String(v),
    icon: () => "",
    replaceViewContent: () => {},
    render: () => {},
    setStatus: (m) => events.statuses.push(String(m)),
    copyText: async () => {},
    vaultIsUnlocked: () => true,
    ensureSelectedDeidReady: async () => {},
    deidentify: async (text) => ({ text }),
    updateDeidOperation: () => {},
    persistVault: async () => { events.persisted += 1; },
    setSectionDraftText: (scope, id, text) => app.sectionDrafts.set(scope + ":" + id, text),
    beginSectionReview: () => {},
    // Mirrors app.js clearPatientScopedSession for the maps under test.
    clearPatientScopedSession: () => {
      events.clears += 1;
      app.noteDraftSessions.clear();
      app.phiReviews.clear();
      app.sectionDrafts.clear();
    }
  };
  const controller = createSampleNotesController(deps);
  const addTarget = {
    closest: (sel) => (sel === "[data-action]"
      ? { dataset: { action: "sample-notes-add", noteId: "test-note" } }
      : null)
  };
  async function clickAddAndWait({ expectPersist = true } = {}) {
    const before = events.persisted;
    const beforeClears = events.clears;
    app.view = "sampleNotes"; // user navigates (back) to the Sample Notes tab
    assert.equal(controller.click(addTarget), true, "add action handled");
    if (!expectPersist) {
      // The open-in-place path is synchronous; give the event loop one turn.
      await new Promise((r) => setTimeout(r, 50));
      return { persisted: false, clears: events.clears - beforeClears };
    }
    const deadline = Date.now() + 5000;
    while (events.persisted === before && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    return { persisted: events.persisted > before, clears: events.clears - beforeClears };
  }
  return { app, events, controller, clickAddAndWait };
}

// --- Case 1: fresh import clears the previous patient's session ----------
{
  const { app, events, clickAddAndWait } = makeHarness();
  const { persisted, clears } = await clickAddAndWait();
  assert.ok(persisted, "import completed and persisted");
  assert.equal(clears, 1, "patient-scoped session cleared exactly once during import");
  assert.equal(app.noteDraftSessions.has("admission"), false, "stale draft session is gone");
  const active = app.vault.patients.find((p) => p.id === app.vault.activePatientId);
  assert.ok(active, "an active patient exists");
  assert.equal(active.label, "Sample: Test Chart", "the imported chart is the active patient");
  assert.equal(active.metadata.sampleNoteId, "test-note", "import metadata recorded");
  // The new patient's ephemeral reviews must survive: they are registered
  // after the boundary clear.
  const reviewKeys = [...app.phiReviews.keys()];
  assert.ok(reviewKeys.length > 0, "new patient has ephemeral reviews");
  assert.ok(reviewKeys.every((k) => k.startsWith("context:sec-")), "reviews belong to the new patient's sections");
  assert.ok([...app.sectionDrafts.keys()].every((k) => k.startsWith("context:sec-")), "draft texts belong to the new patient");
  assert.ok(events.statuses.some((m) => m.includes("is now a patient in your vault")), "success status shown");
}

// --- Case 2: re-adding an already-imported chart clears on patient switch --
{
  const { app, events, clickAddAndWait } = makeHarness();
  await clickAddAndWait(); // fresh import; new patient now active
  const importedId = app.vault.activePatientId;
  // Simulate the user working on a different patient with stale session state.
  app.vault.activePatientId = "patient-old";
  app.noteDraftSessions.set("admission", { stale: "OLD-OB-ONE-LINER" });
  const before = events.clears;
  const { persisted } = await clickAddAndWait({ expectPersist: false }); // existingImport -> open in place
  assert.equal(persisted, false, "re-add does not re-import");
  assert.equal(events.clears, before + 1, "opening the imported chart cleared the other patient's session");
  assert.equal(app.vault.activePatientId, importedId, "imported chart is active again");
  assert.equal(app.noteDraftSessions.has("admission"), false, "stale session cleared on open");
  assert.ok(events.statuses.some((m) => m.includes("already in your vault")), "already-imported status shown");
}

// --- Case 3: re-opening the already-active chart does NOT wipe its session --
{
  const { app, events, clickAddAndWait } = makeHarness();
  await clickAddAndWait(); // fresh import; new patient now active
  app.noteDraftSessions.set("admission", { live: "current-patient-draft" });
  const before = events.clears;
  await clickAddAndWait({ expectPersist: false }); // already active -> open in place, no switch
  assert.equal(events.clears, before, "no session clear when re-opening the active patient");
  assert.equal(app.noteDraftSessions.get("admission").live, "current-patient-draft", "active patient's session preserved");
}

rmSync(scratch, { recursive: true, force: true });
console.log("test-sample-notes-patient-boundary: all assertions passed");
