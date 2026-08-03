import { createLocalId } from "../app/state/vault.js";

export const GUIDELINE_SET_STORAGE_KEY = "prerounding_guideline_sets_v1";
export const GUIDELINE_SET_CANONICAL_DEFAULTS_KEY = "prerounding_guideline_sets_canonical_defaults_v1";

export const DEFAULT_GUIDELINE_SET_SOURCES = Object.freeze([
  { label: "Admission", token: "@admission-guidelines", path: "./prompts/Guidelines-admission.md" },
  { label: "Pre-round checklist", token: "@pre-round-checklist-guidelines", path: "./prompts/Pre-round_checklist.md" },
  { label: "Discharge instructions", token: "@discharge-instructions-guidelines", path: "./prompts/Discharge_Instructions.md" },
  { label: "Consulting", token: "@consulting-guidelines", path: "./prompts/Consulting.md" },
  { label: "Pre-round Checklist Updated", token: "@pre-round-checklist-updated-guidelines", path: "./prompts/Pre-round_checklist.md" },
  { label: "Discharge Instructions Updated", token: "@discharge-instructions-updated-guidelines", path: "./prompts/Discharge_Instructions.md" },
  { label: "Team preferences", token: "@team-preferences", path: "" },
  { label: "Progress", token: "@progress-guidelines", path: "./prompts/Guidelines-progress.md" }
]);

const DEFAULT_TOKENS = new Set(DEFAULT_GUIDELINE_SET_SOURCES.map((source) => source.token));

// These names were created by the former chained migration system. They are
// app-managed revisions, not user-created guideline identities. One canonical
// migration removes them so the prompt menu and Settings have the same source
// of truth.
const LEGACY_DEFAULT_TOKEN = /^@(?:admissions?|progress|pre-round-checklist|discharge-instructions|consulting)[a-z0-9-]*guidelines[a-z0-9-]*$/;

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

export function createGuidelineSet(label, text = "", { id, existingTokens = [], token } = {}) {
  const now = new Date().toISOString();
  return {
    id: id || createLocalId("guideline_set"),
    label: String(label || "").trim() || "Untitled guidelines",
    token: token || guidelineToken(label, existingTokens),
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
  return sets.map((set) => set.id === id ? {
    ...set,
    ...(label === undefined ? {} : { label: String(label || "").trim() || set.label }),
    ...(text === undefined ? {} : { text: String(text || "") }),
    updatedAt: new Date().toISOString()
  } : set);
}

export function removeGuidelineSet(sets, id) {
  return sets.filter((set) => set.id !== id);
}

export function guidelineSetMatchesQuery(set, query) {
  const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const identity = `${set?.label || ""} ${set?.token || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return terms.every((term) => identity.includes(term.replace(/[^a-z0-9]+/g, " ").trim()));
}

async function fetchGuidelineText(path) {
  if (!path) return "";
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok ? await response.text() : "";
  } catch {
    return "";
  }
}

async function seedDefaultGuidelineSets({ legacyTeamPreferences = "" } = {}) {
  const sets = [];
  for (const source of DEFAULT_GUIDELINE_SET_SOURCES) {
    const text = source.token === "@team-preferences"
      ? String(legacyTeamPreferences || "")
      : await fetchGuidelineText(source.path);
    sets.push(createGuidelineSet(source.label, text, {
      token: source.token,
      existingTokens: sets.map((set) => set.token)
    }));
  }
  return sets;
}

// First install and existing-install cleanup share this exact default list.
// The storage marker is written even when a user later deletes a default, so
// deletion remains authoritative and startup never silently restores it.
export async function loadOrMigrateGuidelineSets(storage = localStorage) {
  if (storage.getItem(GUIDELINE_SET_STORAGE_KEY) !== null) return loadGuidelineSets(storage);
  const seeded = await seedDefaultGuidelineSets();
  saveGuidelineSets(seeded, storage);
  storage.setItem(GUIDELINE_SET_CANONICAL_DEFAULTS_KEY, "1");
  return seeded;
}

export async function ensureCanonicalDefaultGuidelineSets(sets, { legacyTeamPreferences = "", storage = localStorage } = {}) {
  if (storage.getItem(GUIDELINE_SET_CANONICAL_DEFAULTS_KEY) !== null) return sets;

  const firstByToken = new Map();
  for (const set of sets || []) {
    if (!firstByToken.has(set.token)) firstByToken.set(set.token, set);
  }

  const canonical = [];
  for (const source of DEFAULT_GUIDELINE_SET_SOURCES) {
    const existing = firstByToken.get(source.token);
    if (existing) {
      const teamText = source.token === "@team-preferences" && !String(existing.text || "").trim()
        ? String(legacyTeamPreferences || "")
        : existing.text;
      canonical.push({ ...existing, label: source.label, token: source.token, text: teamText });
      continue;
    }
    const text = source.token === "@team-preferences"
      ? String(legacyTeamPreferences || "")
      : await fetchGuidelineText(source.path);
    canonical.push(createGuidelineSet(source.label, text, {
      token: source.token,
      existingTokens: canonical.map((set) => set.token)
    }));
  }

  const custom = (sets || []).filter((set) =>
    !DEFAULT_TOKENS.has(set.token)
      && !LEGACY_DEFAULT_TOKEN.test(String(set.token || ""))
  );
  const next = [...canonical, ...custom];
  saveGuidelineSets(next, storage);
  storage.setItem(GUIDELINE_SET_CANONICAL_DEFAULTS_KEY, "1");
  return next;
}
