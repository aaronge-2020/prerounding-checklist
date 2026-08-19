import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_GUIDELINE_SET_SOURCES,
  GUIDELINE_SET_CANONICAL_DEFAULTS_KEY,
  GUIDELINE_SET_STORAGE_KEY,
  OPEN_EVIDENCE_TASK_GUIDELINES_SEED_KEY,
  TEACHING_GUIDELINE_SET_SEED_KEY,
  addGuidelineSet,
  createGuidelineSet,
  ensureCanonicalDefaultGuidelineSets,
  ensureOpenEvidenceTaskGuidelineSets,
  ensureTeachingGuidelineSet,
  guidelineSetMatchesQuery,
  loadGuidelineSets,
  loadOrMigrateGuidelineSets,
  removeGuidelineSet,
  restoreLatestDefaultGuidelineSets,
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
  "@progress-guidelines",
  "@teaching-guidelines",
  "@presentation-editor-guidelines",
  "@medication-explainer-guidelines",
  "@medication-safety-guidelines",
  "@checklist-refinement-guidelines"
];

assert.deepEqual(DEFAULT_GUIDELINE_SET_SOURCES.map((source) => source.token), expectedTokens);
assert.equal(new Set(expectedTokens).size, expectedTokens.length, "default guideline tokens must be unique");
assert.match(DEFAULT_PROMPT_TEMPLATES.preround_bedside_exam, /@pre-round-checklist-guidelines/);
assert.match(DEFAULT_PROMPT_TEMPLATES.discharge_instructions, /@discharge-instructions-guidelines/);
assert.match(DEFAULT_PROMPT_TEMPLATES.teaching_case_trajectory, /^@teaching-guidelines\b/);
assert.match(DEFAULT_PROMPT_TEMPLATES.presentation_quality_editor, /^@presentation-editor-guidelines\b/);
assert.match(DEFAULT_PROMPT_TEMPLATES.medication_explainer_by_problem, /^@medication-explainer-guidelines\b/);
assert.match(DEFAULT_PROMPT_TEMPLATES.medication_safety_audit, /^@medication-safety-guidelines\b/);
assert.match(DEFAULT_PROMPT_TEMPLATES.checklist_workup_refinement, /^@checklist-refinement-guidelines\b/);
assert.doesNotMatch(Object.values(DEFAULT_PROMPT_TEMPLATES).join("\n"), /updated-guidelines/);
for (const source of DEFAULT_GUIDELINE_SET_SOURCES.filter((entry) => entry.path)) {
  const deployedSeed = readFileSync(source.path.replace(/^\.\//, ""), "utf8");
  assert.match(deployedSeed, /Act as an attending hospitalist with over 30 years of inpatient experience/i, `${source.label} must carry the shared attending persona`);
}

// New installs receive exactly the canonical defaults, in the requested order.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, text: async () => `Text from ${url}` });
  try {
    const storage = fakeStorage();
    const seeded = await loadOrMigrateGuidelineSets(storage);
    assert.deepEqual(seeded.map((set) => set.token), expectedTokens);
    assert.equal(storage.getItem(GUIDELINE_SET_CANONICAL_DEFAULTS_KEY), "1");
    assert.equal(storage.getItem(TEACHING_GUIDELINE_SET_SEED_KEY), "1");
    assert.equal(storage.getItem(OPEN_EVIDENCE_TASK_GUIDELINES_SEED_KEY), "1");

    saveGuidelineSets([], storage);
    assert.deepEqual(await loadOrMigrateGuidelineSets(storage), [], "deleted defaults must stay deleted");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Existing installs receive the four formerly embedded task guidelines once,
// without restoring any older built-in the user deliberately deleted.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, text: async () => `Task guideline from ${url}` });
  try {
    const storage = fakeStorage({
      [GUIDELINE_SET_STORAGE_KEY]: "[]",
      [GUIDELINE_SET_CANONICAL_DEFAULTS_KEY]: "1",
      [TEACHING_GUIDELINE_SET_SEED_KEY]: "1"
    });
    const existing = [createGuidelineSet("Progress notes", "Keep me.", { token: "@progress-guidelines" })];
    const seeded = await ensureOpenEvidenceTaskGuidelineSets(existing, { storage });
    assert.deepEqual(seeded.map(({ token }) => token), [
      "@progress-guidelines",
      "@presentation-editor-guidelines",
      "@medication-explainer-guidelines",
      "@medication-safety-guidelines",
      "@checklist-refinement-guidelines"
    ]);
    assert.equal(storage.getItem(OPEN_EVIDENCE_TASK_GUIDELINES_SEED_KEY), "1");
    assert.equal(seeded.some(({ token }) => token === "@admission-guidelines"), false, "the migration must not restore unrelated deleted defaults");

    const afterDeletion = seeded.filter(({ token }) => token !== "@presentation-editor-guidelines");
    saveGuidelineSets(afterDeletion, storage);
    assert.deepEqual(await ensureOpenEvidenceTaskGuidelineSets(afterDeletion, { storage }), afterDeletion);
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
    assert.deepEqual(canonical.slice(0, expectedTokens.length).map((set) => set.token), expectedTokens);
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

// Existing installs receive Teaching once without re-seeding defaults the user
// previously deleted. Teaching itself also remains deleted after that seed.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, text: async () => `Teaching from ${url}` });
  try {
    const storage = fakeStorage({
      [GUIDELINE_SET_STORAGE_KEY]: "[]",
      [GUIDELINE_SET_CANONICAL_DEFAULTS_KEY]: "1"
    });
    const existing = [createGuidelineSet("Admission", "Keep me.", { token: "@admission-guidelines" })];
    const seeded = await ensureTeachingGuidelineSet(existing, { storage });
    assert.deepEqual(seeded.map(({ token }) => token), ["@admission-guidelines", "@teaching-guidelines"]);
    assert.equal(seeded[1].text, "Teaching from ./prompts/teaching.md");
    assert.equal(storage.getItem(TEACHING_GUIDELINE_SET_SEED_KEY), "1");

    const afterDeletion = seeded.filter(({ token }) => token !== "@teaching-guidelines");
    saveGuidelineSets(afterDeletion, storage);
    assert.deepEqual(await ensureTeachingGuidelineSet(afterDeletion, { storage }), afterDeletion);
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

// Explicit refresh replaces/restores only deploy-backed defaults, while
// preserving the local-only Team preferences set and all custom identities.
{
  const admission = createGuidelineSet("Admission custom label", "Locally edited admission.", { token: "@admission-guidelines" });
  const team = createGuidelineSet("Team preferences", "Rounds at 06:45.", { token: "@team-preferences" });
  const custom = createGuidelineSet("Night float", "Call family before 21:00.");
  const storage = fakeStorage();
  const requests = [];
  const refreshed = await restoreLatestDefaultGuidelineSets([admission, team, custom], {
    storage,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, text: async () => `Newest deployed text for ${url.split("?")[0]}` };
    }
  });
  assert.equal(requests.length, DEFAULT_GUIDELINE_SET_SOURCES.filter(({ path }) => path).length);
  assert.ok(requests.every(({ url }) => /[?&]prompt-refresh=\d+/.test(url)), "refresh URLs must bypass stale Pages caches");
  assert.ok(requests.every(({ options }) => options.cache === "no-store"));
  for (const source of DEFAULT_GUIDELINE_SET_SOURCES.filter(({ path }) => path)) {
    assert.equal(
      refreshed.find(({ token }) => token === source.token)?.text,
      `Newest deployed text for ${source.path}`,
      `${source.token} must receive the text downloaded from its own deployed source`
    );
  }
  assert.equal(refreshed.find(({ token }) => token === "@team-preferences")?.text, team.text);
  assert.equal(refreshed.find(({ token }) => token === custom.token)?.text, custom.text);
  assert.deepEqual(loadGuidelineSets(storage), refreshed);
}

// Downloads complete before storage is mutated, so any failed prompt leaves
// every local edit intact instead of producing a partially refreshed set.
{
  const existing = [createGuidelineSet("Admission", "Keep this edit.", { token: "@admission-guidelines" })];
  const storage = fakeStorage({ [GUIDELINE_SET_STORAGE_KEY]: JSON.stringify(existing) });
  let requestCount = 0;
  await assert.rejects(
    restoreLatestDefaultGuidelineSets(existing, {
      storage,
      fetchImpl: async () => {
        requestCount += 1;
        return requestCount === 2
          ? { ok: false, text: async () => "" }
          : { ok: true, text: async () => "Downloaded text." };
      }
    }),
    /Could not download/
  );
  assert.deepEqual(loadGuidelineSets(storage), existing);
}

{
  const existing = [createGuidelineSet("Admission", "Keep this edit too.", { token: "@admission-guidelines" })];
  const storage = fakeStorage({ [GUIDELINE_SET_STORAGE_KEY]: JSON.stringify(existing) });
  await assert.rejects(
    restoreLatestDefaultGuidelineSets(existing, {
      storage,
      fetchImpl: async () => ({ ok: true, text: async () => "   \n" })
    }),
    /was empty/
  );
  assert.deepEqual(loadGuidelineSets(storage), existing, "an empty deployed prompt must leave local storage unchanged");
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
