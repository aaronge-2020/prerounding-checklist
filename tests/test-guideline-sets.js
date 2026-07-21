import assert from "node:assert/strict";
import {
  addGuidelineSet,
  createGuidelineSet,
  ensureConsultingGuidelineSet,
  ensureCurrentGuidelineSets,
  ensureCurrentProgressGuidelineSet,
  ensureLatestProgressGuidelineSet,
  ensureRevisedProgressGuidelineSet,
  ensureFocusedProgressGuidelineSet,
  ensureAttendingProgressGuidelineSet,
  ensureReasoningProgressGuidelineSet,
  ensureProblemAssessmentProgressGuidelineSet,
  ensureCanonicalProgressGuidelineSet,
  ensureCanonicalProgressGuidelineSetV2,
  ensureCurrentAdmissionGuidelineSet,
  ensureCanonicalProgressGuidelineSetV3,
  ensureCurrentAdmissionGuidelineSetV2,
  GUIDELINE_SET_STORAGE_KEY,
  GUIDELINE_SET_SEED_V3_KEY,
  GUIDELINE_SET_SEED_V4_KEY,
  GUIDELINE_SET_SEED_V5_KEY,
  GUIDELINE_SET_SEED_V6_KEY,
  GUIDELINE_SET_SEED_V7_KEY,
  GUIDELINE_SET_SEED_V8_KEY,
  GUIDELINE_SET_SEED_V9_KEY,
  GUIDELINE_SET_SEED_V10_KEY,
  GUIDELINE_SET_SEED_V11_KEY,
  GUIDELINE_SET_PROGRESS_CANONICAL_KEY,
  GUIDELINE_SET_PROGRESS_CANONICAL_V2_KEY,
  GUIDELINE_SET_ADMISSION_CURRENT_KEY,
  GUIDELINE_SET_PROGRESS_CANONICAL_V3_KEY,
  GUIDELINE_SET_ADMISSION_CURRENT_V2_KEY,
  loadGuidelineSets,
  loadOrMigrateGuidelineSets,
  removeGuidelineSet,
  saveGuidelineSets,
  updateGuidelineSet
} from "../src/prompts/guideline-sets.js";

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; }
  };
}

// Action-gate revisions refresh the current prompt sources while preserving
// one canonical Progress set and the prior user-managed Admission set.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Action-gated standard." });
  try {
    const storage = fakeStorage();
    const progress = await ensureCanonicalProgressGuidelineSetV3([
      createGuidelineSet("Progress", "Old progress."),
      createGuidelineSet("Admission", "Keep admission.")
    ], storage);
    assert.equal(progress.filter((set) => /^Progress(?: |$)/i.test(set.label || "")).length, 1);
    assert.equal(progress.find((set) => set.token === "@progress-guidelines")?.text, "Action-gated standard.");
    const admission = await ensureCurrentAdmissionGuidelineSetV2([
      createGuidelineSet("Admission", "User-edited admission.")
    ], storage);
    assert.equal(admission.find((set) => set.token === "@admission-current-2-guidelines")?.text, "Action-gated standard.");
    assert.equal(storage.getItem(GUIDELINE_SET_PROGRESS_CANONICAL_V3_KEY), "1");
    assert.equal(storage.getItem(GUIDELINE_SET_ADMISSION_CURRENT_V2_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Existing installs receive the expanded H&P standard under one current
// admission token while the prior user-managed Admission set remains intact.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Current H&P standard." });
  try {
    const storage = fakeStorage();
    const existing = [createGuidelineSet("Admission", "User-edited admission standard.")];
    const seeded = await ensureCurrentAdmissionGuidelineSet(existing, storage);
    assert.equal(seeded.length, 2);
    assert.equal(seeded.find((set) => set.token === "@admission-current-guidelines")?.text, "Current H&P standard.");
    assert.equal(seeded.find((set) => set.token === "@admission-guidelines")?.text, "User-edited admission standard.");
    assert.equal(storage.getItem(GUIDELINE_SET_ADMISSION_CURRENT_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// The latest progress revision still leaves exactly one canonical Progress
// set and preserves unrelated guideline sets.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Newest canonical standard." });
  try {
    const storage = fakeStorage();
    const existing = [
      createGuidelineSet("Progress", "Old canonical."),
      createGuidelineSet("Progress Problem Assessment", "Old variant."),
      createGuidelineSet("Consulting", "Keep consulting.")
    ];
    const seeded = await ensureCanonicalProgressGuidelineSetV2(existing, storage);
    assert.equal(seeded.filter((set) => /^Progress(?: |$)/i.test(set.label || "")).length, 1);
    assert.equal(seeded.find((set) => set.token === "@progress-guidelines")?.text, "Newest canonical standard.");
    assert.equal(seeded.find((set) => set.label === "Consulting")?.text, "Keep consulting.");
    assert.equal(storage.getItem(GUIDELINE_SET_PROGRESS_CANONICAL_V2_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// All historical progress migrations collapse into one current canonical set;
// unrelated guideline sets remain intact.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Latest canonical progress standard." });
  try {
    const storage = fakeStorage();
    const existing = [
      createGuidelineSet("Progress", "Old progress."),
      createGuidelineSet("Progress Focused", "Older progress."),
      createGuidelineSet("Admission", "Keep admission.")
    ];
    const seeded = await ensureCanonicalProgressGuidelineSet(existing, storage);
    assert.equal(seeded.filter((set) => /^Progress(?: |$)/i.test(set.label || "")).length, 1);
    assert.equal(seeded.find((set) => set.token === "@progress-guidelines")?.text, "Latest canonical progress standard.");
    assert.equal(seeded.find((set) => set.label === "Admission")?.text, "Keep admission.");
    assert.equal(storage.getItem(GUIDELINE_SET_PROGRESS_CANONICAL_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// The problem-oriented Assessment-in-Plan standard reaches existing installs
// without overwriting earlier user-managed content.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Problem assessment standard." });
  try {
    const storage = fakeStorage();
    const existing = [createGuidelineSet("Progress Reasoning", "Previously reasoning standard.")];
    const seeded = await ensureProblemAssessmentProgressGuidelineSet(existing, storage);
    assert.equal(seeded.length, 2);
    assert.equal(seeded.find((set) => set.token === "@progress-problem-assessment-guidelines")?.text, "Problem assessment standard.");
    assert.equal(seeded.find((set) => set.token === "@progress-reasoning-guidelines")?.text, "Previously reasoning standard.");
    assert.equal(storage.getItem(GUIDELINE_SET_SEED_V11_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// The reasoning-focused progress standard reaches existing installs under a
// new token without overwriting earlier user-managed content.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Reasoning progress standard." });
  try {
    const storage = fakeStorage();
    const existing = [createGuidelineSet("Progress Attending", "Previously attending standard.")];
    const seeded = await ensureReasoningProgressGuidelineSet(existing, storage);
    assert.equal(seeded.length, 2);
    assert.equal(seeded.find((set) => set.token === "@progress-reasoning-guidelines")?.text, "Reasoning progress standard.");
    assert.equal(seeded.find((set) => set.token === "@progress-attending-guidelines")?.text, "Previously attending standard.");
    assert.equal(storage.getItem(GUIDELINE_SET_SEED_V10_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// The attending-format progress standard reaches existing installs under a
// new token without overwriting earlier user-managed content.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Attending progress standard." });
  try {
    const storage = fakeStorage();
    const existing = [createGuidelineSet("Progress Focused", "Previously focused standard.")];
    const seeded = await ensureAttendingProgressGuidelineSet(existing, storage);
    assert.equal(seeded.length, 2);
    assert.equal(seeded.find((set) => set.token === "@progress-attending-guidelines")?.text, "Attending progress standard.");
    assert.equal(seeded.find((set) => set.token === "@progress-focused-guidelines")?.text, "Previously focused standard.");
    assert.equal(storage.getItem(GUIDELINE_SET_SEED_V9_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// The focused progress standard reaches existing installs under a new token
// without overwriting any prior user-managed progress set.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Focused progress standard." });
  try {
    const storage = fakeStorage();
    const existing = [createGuidelineSet("Progress Revised", "Previously revised standard.")];
    const seeded = await ensureFocusedProgressGuidelineSet(existing, storage);
    assert.equal(seeded.length, 2);
    assert.equal(seeded.find((set) => set.token === "@progress-focused-guidelines")?.text, "Focused progress standard.");
    assert.equal(seeded.find((set) => set.token === "@progress-revised-guidelines")?.text, "Previously revised standard.");
    assert.equal(storage.getItem(GUIDELINE_SET_SEED_V8_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// The revised progress standard is delivered under a new token to existing
// installs without overwriting prior user-managed content.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Revised progress standard." });
  try {
    const storage = fakeStorage();
    const existing = [createGuidelineSet("Progress Current", "Previously current standard.")];
    const seeded = await ensureRevisedProgressGuidelineSet(existing, storage);
    assert.equal(seeded.length, 2);
    assert.equal(seeded.find((set) => set.token === "@progress-revised-guidelines")?.text, "Revised progress standard.");
    assert.equal(seeded.find((set) => set.token === "@progress-current-guidelines")?.text, "Previously current standard.");
    assert.equal(storage.getItem(GUIDELINE_SET_SEED_V7_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// A later shipped refresh gets a new token while preserving every prior
// user-managed guideline set.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Newest progress standard." });
  try {
    const storage = fakeStorage();
    const existing = [createGuidelineSet("Progress Updated", "Previously saved standard.")];
    const seeded = await ensureLatestProgressGuidelineSet(existing, storage);
    assert.equal(seeded.length, 2);
    assert.equal(seeded.find((set) => set.token === "@progress-current-guidelines")?.text, "Newest progress standard.");
    assert.equal(seeded.find((set) => set.token === "@progress-updated-guidelines")?.text, "Previously saved standard.");
    assert.equal(storage.getItem(GUIDELINE_SET_SEED_V6_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Current shipped standards receive new tokens while older user-managed
// standards remain available and untouched.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, text: async () => `Latest ${url}` });
  try {
    const storage = fakeStorage();
    const seeded = await ensureCurrentGuidelineSets([], storage);
    assert.equal(seeded.length, 4);
    assert.equal(seeded.find((set) => set.token === "@admission-updated-guidelines")?.label, "Admission Updated");
    assert.equal(seeded.find((set) => set.token === "@pre-round-checklist-updated-guidelines")?.label, "Pre-round Checklist Updated");
    assert.equal(seeded.find((set) => set.token === "@discharge-instructions-updated-guidelines")?.label, "Discharge Instructions Updated");
    assert.equal(seeded.find((set) => set.token === "@consulting-updated-guidelines")?.label, "Consulting Updated");
    assert.equal(storage.getItem(GUIDELINE_SET_SEED_V5_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// The current progress standard is added under a new token so an existing
// user-edited Progress set is preserved while the default can update.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Current progress standard." });
  try {
    const storage = fakeStorage();
    const existing = [createGuidelineSet("Progress", "User-edited progress standard.")];
    const seeded = await ensureCurrentProgressGuidelineSet(existing, storage);
    assert.equal(seeded.length, 2);
    assert.equal(seeded.find((set) => set.token === "@progress-updated-guidelines")?.text, "Current progress standard.");
    assert.equal(seeded.find((set) => set.token === "@progress-guidelines")?.text, "User-edited progress standard.");
    assert.equal(storage.getItem(GUIDELINE_SET_SEED_V4_KEY), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// A label slugs into a stable token, unique against collisions.
{
  const set = createGuidelineSet("Admission", "text");
  assert.equal(set.token, "@admission-guidelines");
  assert.equal(set.label, "Admission");
  const collision = createGuidelineSet("Admission", "other", { existingTokens: [set.token] });
  assert.equal(collision.token, "@admission-guidelines-2");
}

// A label that already ends in "guidelines" isn't double-suffixed.
{
  const set = createGuidelineSet("Discharge guidelines");
  assert.equal(set.token, "@discharge-guidelines");
}

// CRUD round-trips through a fake localStorage.
{
  const storage = fakeStorage();
  assert.deepEqual(loadGuidelineSets(storage), []);
  let sets = addGuidelineSet(loadGuidelineSets(storage), "Consult note", "Be concise.");
  saveGuidelineSets(sets, storage);
  sets = loadGuidelineSets(storage);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].token, "@consult-note-guidelines");
  assert.equal(sets[0].text, "Be concise.");

  sets = updateGuidelineSet(sets, sets[0].id, { label: "Consult note (renamed)", text: "Updated text." });
  assert.equal(sets[0].token, "@consult-note-guidelines", "token stays stable across a rename");
  assert.equal(sets[0].label, "Consult note (renamed)");
  assert.equal(sets[0].text, "Updated text.");

  sets = removeGuidelineSet(sets, sets[0].id);
  assert.equal(sets.length, 0);
}

// Corrupt JSON degrades to an empty list rather than throwing.
{
  const storage = fakeStorage({ [GUIDELINE_SET_STORAGE_KEY]: "not json" });
  assert.deepEqual(loadGuidelineSets(storage), []);
}

// Migration seeds from the two legacy files exactly once, and never
// re-seeds after the user has deleted everything.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    text: async () => (url.includes("admission") ? "Admission standard text." : "Progress standard text.")
  });
  try {
    const storage = fakeStorage();
    const seeded = await loadOrMigrateGuidelineSets(storage);
    assert.equal(seeded.length, 2);
    assert.equal(seeded.find((set) => set.token === "@admission-guidelines")?.text, "Admission standard text.");
    assert.equal(seeded.find((set) => set.token === "@progress-guidelines")?.text, "Progress standard text.");

    saveGuidelineSets([], storage);
    const afterUserDeletedAll = await loadOrMigrateGuidelineSets(storage);
    assert.deepEqual(afterUserDeletedAll, [], "must not re-seed once the storage key has been written, even if now empty");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// A failed fetch (e.g. offline / files missing) still resolves to an empty,
// fully user-managed list instead of throwing.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network down"); };
  try {
    const storage = fakeStorage();
    const seeded = await loadOrMigrateGuidelineSets(storage);
    assert.deepEqual(seeded, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// The Consulting standard is seeded independently so existing installs receive
// it once, while a user who later deletes it does not get it reintroduced.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    text: async () => (url.includes("Consulting") ? "Consulting standard text." : "Unexpected file.")
  });
  try {
    const storage = fakeStorage();
    const seeded = await ensureConsultingGuidelineSet([], storage);
    assert.equal(seeded.length, 1);
    assert.equal(seeded[0].token, "@consulting-guidelines");
    assert.equal(seeded[0].text, "Consulting standard text.");
    assert.equal(storage.getItem(GUIDELINE_SET_SEED_V3_KEY), "1");

    saveGuidelineSets([], storage);
    const afterUserDeleted = await ensureConsultingGuidelineSet([], storage);
    assert.deepEqual(afterUserDeleted, [], "must not re-seed Consulting after the user deletes it");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log("Guideline set tests passed");
