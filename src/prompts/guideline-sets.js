import { createLocalId } from "../app/state/vault.js";

// Documentation-standard text (H&P, SOAP, or any other note type the user
// wants a standard for) used to live as exactly two hardcoded files,
// Guidelines-admission.md and Guidelines-progress.md, injected through a
// single @guidelines token whose meaning silently changed based on which
// task was selected. That made it impossible to reference both in one
// template and impossible to add a standard for any other note type. This
// module replaces that with a user-editable, named list - each set gets its
// own stable token, persisted the same way custom prompt tasks are.
export const GUIDELINE_SET_STORAGE_KEY = "prerounding_guideline_sets_v1";

function slugStem(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function guidelineToken(label, usedTokens = []) {
  const stem = slugStem(label) || "guidelines";
  const base = `@${stem.endsWith("guidelines") ? stem : `${stem}-guidelines`}`;
  const used = new Set(usedTokens);
  let token = base;
  let suffix = 2;
  while (used.has(token)) token = `${base}-${suffix++}`;
  return token;
}

// The token is assigned once, from the label at creation time, and never
// changes again even if the set is later renamed - so a default template
// that references @admission-guidelines keeps working after a rename.
export function createGuidelineSet(label, text = "", { id, existingTokens = [] } = {}) {
  const now = new Date().toISOString();
  return {
    id: id || createLocalId("guideline_set"),
    label: String(label || "").trim() || "Untitled guidelines",
    token: guidelineToken(label, existingTokens),
    text: String(text || ""),
    createdAt: now,
    updatedAt: now
  };
}

export function loadGuidelineSets(storage = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(GUIDELINE_SET_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGuidelineSets(sets, storage = localStorage) {
  storage.setItem(GUIDELINE_SET_STORAGE_KEY, JSON.stringify(sets || []));
}

export function addGuidelineSet(sets, label, text = "") {
  const created = createGuidelineSet(label, text, { existingTokens: sets.map((set) => set.token) });
  return [...sets, created];
}

export function updateGuidelineSet(sets, id, { label, text } = {}) {
  return sets.map((set) => {
    if (set.id !== id) return set;
    return {
      ...set,
      ...(label === undefined ? {} : { label: String(label || "").trim() || set.label }),
      ...(text === undefined ? {} : { text: String(text || "") }),
      updatedAt: new Date().toISOString()
    };
  });
}

export function removeGuidelineSet(sets, id) {
  return sets.filter((set) => set.id !== id);
}

// One-time migration so content already saved in the old two-file system
// isn't lost: seeds "Admission" and "Progress" guideline sets from those
// files the first time this ever runs (storage key literally absent), then
// never touches them again - all further edits happen through this module.
export async function loadOrMigrateGuidelineSets(storage = localStorage) {
  if (storage.getItem(GUIDELINE_SET_STORAGE_KEY) !== null) return loadGuidelineSets(storage);
  const seeded = [];
  try {
    const [admissionResponse, progressResponse] = await Promise.all([
      fetch("./prompts/Guidelines-admission.md", { cache: "no-store" }),
      fetch("./prompts/Guidelines-progress.md", { cache: "no-store" })
    ]);
    if (admissionResponse.ok) {
      seeded.push(createGuidelineSet("Admission", await admissionResponse.text(), { existingTokens: seeded.map((set) => set.token) }));
    }
    if (progressResponse.ok) {
      seeded.push(createGuidelineSet("Progress", await progressResponse.text(), { existingTokens: seeded.map((set) => set.token) }));
    }
  } catch {
    // No network/file access (e.g. a fresh install without those files) -
    // just start with an empty, fully user-managed list.
  }
  saveGuidelineSets(seeded, storage);
  return seeded;
}

export const GUIDELINE_SET_SEED_V2_KEY = "prerounding_guideline_sets_seed_v2";

// A second, independent one-time seed - same never-re-seed-once-the-flag-is-
// set guarantee as loadOrMigrateGuidelineSets above, kept as its own flag so
// it doesn't disturb that already-shipped, already-tested migration. This
// covers guideline files added after that original migration (bedside
// pre-round checklist, discharge instructions), so a user who migrated
// before these existed still gets them offered exactly once, without ever
// reintroducing one they've since deleted.
export async function ensureAdditionalGuidelineSets(sets, storage = localStorage) {
  if (storage.getItem(GUIDELINE_SET_SEED_V2_KEY) !== null) return sets;
  let next = sets;
  try {
    const [checklistResponse, dischargeResponse] = await Promise.all([
      fetch("./prompts/Pre-round_checklist.md", { cache: "no-store" }),
      fetch("./prompts/Discharge_Instructions.md", { cache: "no-store" })
    ]);
    if (checklistResponse.ok) next = addGuidelineSet(next, "Pre-round checklist", await checklistResponse.text());
    if (dischargeResponse.ok) next = addGuidelineSet(next, "Discharge instructions", await dischargeResponse.text());
  } catch {
    // No network/file access - leave it for the user to add manually later.
  }
  storage.setItem(GUIDELINE_SET_SEED_V2_KEY, "1");
  saveGuidelineSets(next, storage);
  return next;
}

export const GUIDELINE_SET_SEED_V3_KEY = "prerounding_guideline_sets_seed_v3";

// Independent one-time seed for the Consulting standard. Keeping this separate
// from the earlier seed lets existing installs receive the new standard while
// preserving the rule that a user who has deleted a set does not get it silently
// reintroduced on a later startup.
export async function ensureConsultingGuidelineSet(sets, storage = localStorage) {
  if (storage.getItem(GUIDELINE_SET_SEED_V3_KEY) !== null) return sets;
  let next = sets;
  try {
    const response = await fetch("./prompts/Consulting.md", { cache: "no-store" });
    if (response.ok) next = addGuidelineSet(next, "Consulting", await response.text());
  } catch {
    // No network/file access - leave it for the user to add manually later.
  }
  storage.setItem(GUIDELINE_SET_SEED_V3_KEY, "1");
  saveGuidelineSets(next, storage);
  return next;
}

export const GUIDELINE_SET_SEED_V4_KEY = "prerounding_guideline_sets_seed_v4";

// Existing users may have an older persisted @progress-guidelines set. Keep
// that user-managed set intact and add the current shipped standard under a
// new token so the default progress prompt can adopt it without overwriting
// saved preferences.
export async function ensureCurrentProgressGuidelineSet(sets, storage = localStorage) {
  if (storage.getItem(GUIDELINE_SET_SEED_V4_KEY) !== null) return sets;
  let next = sets;
  try {
    const response = await fetch("./prompts/Guidelines-progress.md", { cache: "no-store" });
    if (response.ok) next = addGuidelineSet(next, "Progress Updated", await response.text());
  } catch {
    // No network/file access - leave existing user-managed sets intact.
  }
  storage.setItem(GUIDELINE_SET_SEED_V4_KEY, "1");
  saveGuidelineSets(next, storage);
  return next;
}
