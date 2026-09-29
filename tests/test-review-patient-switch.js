// Regression test: changing patients must reset the Review Data / Draft Note
// view. Admitting a new patient used to skip clearPatientScopedSession(), so
// the previous patient's in-memory draft (app.noteDraftSessions, keyed by
// packet id only) survived the switch and the review view kept rendering the
// previous patient's draft for the new patient.
//
// Part 1 (source guard): every active-patient-change path in src/ui/app.js
// must clear patient-scoped session state. Fails before the fix, passes after.
// Part 2 (behavioral): with the real review controller + presentation, a
// stale session entry leaks the old patient's draft into the new patient's
// view, and clearing the session resolves it. Documents why Part 1 matters.
//
// All fixtures are synthetic and PHI-free. No browser needed.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Part 1: every patient-change path clears patient-scoped session state
// ---------------------------------------------------------------------------

const appSource = await readFile(new URL("../src/ui/app.js", import.meta.url), "utf8");

function topLevelFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists in src/ui/app.js`);
  // Top-level functions close with "}" at column 0.
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start, `${name} has a parseable body`);
  return source.slice(start, end);
}

// Complete set of paths that change the active patient (all `app.vault`
// assignments that alter activePatientId, plus archive which can too).
for (const fnName of ["admitPatient", "selectPatient", "archiveSelectedPatient"]) {
  const body = topLevelFunctionBody(appSource, fnName);
  assert.ok(
    body.includes("clearPatientScopedSession()"),
    `${fnName} must call clearPatientScopedSession(): patient-scoped drafts/review state must never survive a patient switch`
  );
}
console.log("Part 1 passed: all patient-change paths clear patient-scoped session state");

// ---------------------------------------------------------------------------
// Part 2: behavioral proof with the real review controller + presentation
// ---------------------------------------------------------------------------

globalThis.document = {
  createElement: () => ({
    set innerHTML(value) { this._html = value; },
    content: { querySelector: () => null },
  }),
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
};

const { createReviewController } = await import("../src/ui/review/controller.js");
const { createReviewPresentation } = await import("../src/ui/review/presentation.js");
const { activePatient } = await import("../src/app/state/vault.js");
const { createNoteDraft, updateNoteSection, NOTE_TYPES } = await import("../src/note-drafts/index.js");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

function makeDraft(patientId, marker) {
  let draft = createNoteDraft(NOTE_TYPES.H_AND_P, { patientId, hospitalDayId: "" });
  return updateNoteSection(draft, "one_liner", marker);
}

const patientA = {
  id: "patient_a",
  displayLabel: "Alice Alpha",
  days: [],
  noteDrafts: { admission: makeDraft("patient_a", "ALICE_DRAFT_MARKER") },
};
const patientB = { id: "patient_b", displayLabel: "Bob Beta", days: [], noteDrafts: {} };

// Mirrors the patient-scoped fields src/ui/app.js keeps on `app`.
function makeApp() {
  return {
    vault: { patients: [patientA], activePatientId: "patient_a" },
    view: "review",
    reviewPacketId: "admission",
    reviewSearchQuery: "",
    reviewCategory: "all",
    reviewPage: 0,
    reviewDifferenceSelectionId: "",
    selectedDayId: "",
    selectedStayPacketId: "admission",
    noteDraftSessions: new Map(),
    sectionDrafts: new Map(),
  };
}

// Mirrors clearPatientScopedSession()'s review-relevant resets in src/ui/app.js.
function clearPatientScopedSession(app) {
  app.noteDraftSessions.clear();
  app.sectionDrafts.clear();
  Object.assign(app, {
    reviewPacketId: "admission",
    reviewSearchQuery: "",
    reviewCategory: "all",
    reviewPage: 0,
    reviewDifferenceSelectionId: "",
    selectedDayId: "",
    selectedStayPacketId: "admission",
  });
}

function makeHarness(app) {
  const container = {
    _html: "",
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
  };
  const controller = createReviewController({
    app,
    active: () => activePatient(app.vault),
    byId: (id) => (id === "reviewContent" ? container : null),
    presentation: createReviewPresentation({ escapeHtml, icon: () => "" }),
    patientRequiredMessage: () => "NO PATIENT",
    persistVault: async () => {},
    render: () => {},
    setStatus: () => {},
    showToast: () => {},
    copyText: async () => {},
    downloadText: () => {},
    isEphemeralDemo: () => false,
    onDraftSaved: () => {},
    currentPreferences: {},
  });
  return { controller, html: () => container._html };
}

// The bug mechanism: admitting without the session clear leaves the previous
// patient's draft in the packet-keyed session cache, and reviewDraft() prefers
// the cache over the new patient's saved drafts/source.
{
  const app = makeApp();
  const { controller, html } = makeHarness(app);
  controller.render();
  assert.ok(html().includes("ALICE_DRAFT_MARKER"), "patient A's draft renders for A");

  // Buggy admit: vault swaps to B, session NOT cleared.
  app.vault = { ...app.vault, patients: [...app.vault.patients, patientB], activePatientId: "patient_b" };
  controller.render();
  assert.ok(
    html().includes("ALICE_DRAFT_MARKER"),
    "mechanism pinned: a stale noteDraftSessions entry serves the previous patient's draft to the new patient"
  );
  assert.ok(html().includes("Bob Beta"), "patient label itself reads fresh from active()");
}

// The fix: the same admit WITH the session clear renders the new patient's view.
{
  const app = makeApp();
  const { controller, html } = makeHarness(app);
  controller.render();
  assert.ok(html().includes("ALICE_DRAFT_MARKER"), "patient A's draft renders for A");

  clearPatientScopedSession(app);
  app.vault = { ...app.vault, patients: [...app.vault.patients, patientB], activePatientId: "patient_b" };
  controller.render();
  assert.ok(!html().includes("ALICE_DRAFT_MARKER"), "no trace of the previous patient's draft after the session clear");
  assert.ok(html().includes("Bob Beta"), "new patient's view renders");
}

console.log("Part 2 passed: stale session leaks the old draft; the session clear resolves it");
console.log("All review patient-switch checks passed");
