import assert from "node:assert/strict";
import {
  DEFAULT_GUIDELINE_SET_SOURCES,
  GUIDELINE_SET_CANONICAL_DEFAULTS_KEY,
  GUIDELINE_SET_STORAGE_KEY,
  addGuidelineSet,
  createGuidelineSet,
  ensureCanonicalDefaultGuidelineSets,
  guidelineSetMatchesQuery,
  loadGuidelineSets,
  loadOrMigrateGuidelineSets,
  removeGuidelineSet,
  saveGuidelineSets,
  updateGuidelineSet
} from "../src/prompts/guideline-sets.js";
import { DEFAULT_PROMPT_TEMPLATES } from "../src/prompts/custom-templates.js";

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; }
  };
}

const expectedTokens = [
  "@admission-guidelines",
  "@pre-round-checklist-guidelines",
  "@discharge-instructions-guidelines",
  "@consulting-guidelines",
  "@team-preferences",
  "@progress-guidelines"
];

assert.deepEqual(DEFAULT_GUIDELINE_SET_SOURCES.map((source) => source.token), expectedTokens);
assert.equal(new Set(expectedTokens).size, expectedTokens.length, "default guideline tokens must be unique");
assert.match(DEFAULT_PROMPT_TEMPLATES.preround_bedside_exam, /@pre-round-checklist-guidelines/);
assert.match(DEFAULT_PROMPT_TEMPLATES.discharge_instructions, /@discharge-instructions-guidelines/);
assert.doesNotMatch(Object.values(DEFAULT_PROMPT_TEMPLATES).join("\n"), /updated-guidelines/);

// New installs receive exactly the canonical defaults, in the requested order.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, text: async () => `Text from ${url}` });
  try {
    const storage = fakeStorage();
    const seeded = await loadOrMigrateGuidelineSets(storage);
    assert.deepEqual(seeded.map((set) => set.token), expectedTokens);
    assert.equal(storage.getItem(GUIDELINE_SET_CANONICAL_DEFAULTS_KEY), "1");

    saveGuidelineSets([], storage);
    assert.deepEqual(await loadOrMigrateGuidelineSets(storage), [], "deleted defaults must stay deleted");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Existing installs collapse historical app-generated variants into the same
// canonical list, preserve edits to wanted tokens, and keep unrelated custom sets.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, text: async () => `Canonical ${url}` });
  try {
    const storage = fakeStorage({ [GUIDELINE_SET_STORAGE_KEY]: "[]" });
    const admission = createGuidelineSet("Admission", "My edited admission text.");
    const custom = createGuidelineSet("Night float", "Custom handoff preference.");
    const existing = [
      admission,
      createGuidelineSet("Admission Current", "Old app revision.", { token: "@admission-current-guidelines" }),
      createGuidelineSet("Admissions Guidelines Detailed", "Random old prompt.", { token: "@admissions-guidelines-detailed" }),
      createGuidelineSet("Progress Focused", "Old app revision.", { token: "@progress-focused-guidelines" }),
      custom
    ];
    const canonical = await ensureCanonicalDefaultGuidelineSets(existing, {
      legacyTeamPreferences: "Rounds at 7.",
      storage
    });
    assert.deepEqual(canonical.slice(0, 6).map((set) => set.token), expectedTokens);
    assert.equal(canonical.find((set) => set.token === "@admission-guidelines")?.text, "My edited admission text.");
    assert.equal(canonical.find((set) => set.token === "@team-preferences")?.text, "Rounds at 7.");
    assert.equal(canonical.find((set) => set.token === custom.token)?.text, custom.text);
    assert.equal(canonical.some((set) => set.token === "@admission-current-guidelines"), false);
    assert.equal(canonical.some((set) => set.token === "@admissions-guidelines-detailed"), false);
    assert.equal(canonical.some((set) => set.token === "@progress-focused-guidelines"), false);

    const afterDeletion = canonical.filter((set) => set.token !== "@consulting-guidelines");
    saveGuidelineSets(afterDeletion, storage);
    assert.deepEqual(
      await ensureCanonicalDefaultGuidelineSets(afterDeletion, { storage }),
      afterDeletion,
      "canonical defaults must not be restored after the one-time cleanup"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Former "Updated" defaults are folded into their single clean identities
// without losing locally edited text when the canonical identity is absent.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Canonical text." });
  try {
    const storage = fakeStorage({ [GUIDELINE_SET_STORAGE_KEY]: "[]" });
    const canonical = await ensureCanonicalDefaultGuidelineSets([
      createGuidelineSet("Pre-round Checklist Updated", "My edited checklist text.", {
        token: "@pre-round-checklist-updated-guidelines"
      }),
      createGuidelineSet("Discharge Instructions Updated", "My edited discharge text.", {
        token: "@discharge-instructions-updated-guidelines"
      })
    ], { storage });
    assert.equal(canonical.find((set) => set.token === "@pre-round-checklist-guidelines")?.text, "My edited checklist text.");
    assert.equal(canonical.find((set) => set.token === "@discharge-instructions-guidelines")?.text, "My edited discharge text.");
    assert.equal(canonical.some((set) => set.token.includes("updated-guidelines")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Duplicate stored identities produce one canonical variable identity.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "Canonical text." });
  try {
    const storage = fakeStorage({ [GUIDELINE_SET_STORAGE_KEY]: "[]" });
    const duplicate = createGuidelineSet("Admission duplicate", "Duplicate.", { token: "@admission-guidelines" });
    const canonical = await ensureCanonicalDefaultGuidelineSets([
      createGuidelineSet("Admission", "Keep first.", { token: "@admission-guidelines" }),
      duplicate
    ], { storage });
    assert.equal(canonical.filter((set) => set.token === "@admission-guidelines").length, 1);
    assert.equal(canonical.find((set) => set.token === "@admission-guidelines")?.text, "Keep first.");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// CRUD remains fully user-managed after seeding.
{
  const storage = fakeStorage();
  assert.deepEqual(loadGuidelineSets(storage), []);
  let sets = addGuidelineSet([], "Consult note", "Be concise.");
  saveGuidelineSets(sets, storage);
  sets = loadGuidelineSets(storage);
  assert.equal(sets[0].token, "@consult-note-guidelines");
  sets = updateGuidelineSet(sets, sets[0].id, { label: "Consult note renamed", text: "Updated." });
  assert.equal(sets[0].token, "@consult-note-guidelines");
  assert.equal(sets[0].text, "Updated.");
  assert.deepEqual(removeGuidelineSet(sets, sets[0].id), []);
}

assert.equal(guidelineSetMatchesQuery({ label: "Admission", token: "@admission-guidelines", text: "body" }, "admission"), true);
assert.equal(guidelineSetMatchesQuery({ label: "Progress", token: "@progress-guidelines", text: "admission" }, "admission"), false);
assert.deepEqual(loadGuidelineSets(fakeStorage({ [GUIDELINE_SET_STORAGE_KEY]: "not json" })), []);

console.log("Guideline set tests passed");
