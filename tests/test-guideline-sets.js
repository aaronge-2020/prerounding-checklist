import assert from "node:assert/strict";
import {
  addGuidelineSet,
  createGuidelineSet,
  ensureConsultingGuidelineSet,
  ensureCurrentProgressGuidelineSet,
  GUIDELINE_SET_STORAGE_KEY,
  GUIDELINE_SET_SEED_V3_KEY,
  GUIDELINE_SET_SEED_V4_KEY,
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
