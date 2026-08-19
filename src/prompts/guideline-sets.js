import { createLocalId } from "../app/state/vault.js";

export const GUIDELINE_SET_STORAGE_KEY = "prerounding_guideline_sets_v1";
export const GUIDELINE_SET_CANONICAL_DEFAULTS_KEY = "prerounding_guideline_sets_canonical_defaults_v2";
export const TEACHING_GUIDELINE_SET_SEED_KEY = "prerounding_teaching_guideline_set_seed_v1";
export const OPEN_EVIDENCE_TASK_GUIDELINES_SEED_KEY = "prerounding_open_evidence_task_guidelines_seed_v1";

const OPEN_EVIDENCE_TASK_GUIDELINES_SEED_GROUP = "open_evidence_task_guidelines_v1";

export const DEFAULT_GUIDELINE_SET_SOURCES = Object.freeze([
  { label: "Admission", token: "@admission-guidelines", path: "./prompts/Guidelines-admission.md", task: { id: "initial_admission_rounds", label: "Initial admission rounds", order: 1 } },
  { label: "Pre-round checklist", token: "@pre-round-checklist-guidelines", path: "./prompts/Pre-round_checklist.md", task: { id: "preround_bedside_exam", label: "Pre-round bedside exam", order: 8 } },
  { label: "Discharge instructions", token: "@discharge-instructions-guidelines", path: "./prompts/Discharge_Instructions.md", task: { id: "discharge_instructions", label: "Discharge instructions", order: 9 } },
  { label: "Consulting", token: "@consulting-guidelines", path: "./prompts/Consulting.md", task: { id: "consulting", label: "Consulting", order: 10 } },
  { label: "Team preferences", token: "@team-preferences", path: "" },
  { label: "Progress notes", token: "@progress-guidelines", path: "./prompts/Guidelines-progress.md", task: { id: "daily_progress_note", label: "Daily progress-note update", order: 2 } },
  { label: "Teaching", token: "@teaching-guidelines", path: "./prompts/teaching.md", task: { id: "teaching_case_trajectory", label: "Teaching: full case trajectory", order: 4 } },
  { label: "Presentation editor", token: "@presentation-editor-guidelines", path: "./prompts/Presentation-editor.md", seedGroup: OPEN_EVIDENCE_TASK_GUIDELINES_SEED_GROUP, task: { id: "presentation_quality_editor", label: "Edit and verify presentation", order: 3 } },
  { label: "Medication organization and explanation", token: "@medication-explainer-guidelines", path: "./prompts/Medication-explainer.md", seedGroup: OPEN_EVIDENCE_TASK_GUIDELINES_SEED_GROUP, task: { id: "medication_explainer_by_problem", label: "Medication organization and explanation", order: 5 } },
  { label: "Medication safety audit", token: "@medication-safety-guidelines", path: "./prompts/Medication-safety.md", seedGroup: OPEN_EVIDENCE_TASK_GUIDELINES_SEED_GROUP, task: { id: "medication_safety_audit", label: "Medication safety audit", order: 6 } },
  { label: "Checklist/workup refinement", token: "@checklist-refinement-guidelines", path: "./prompts/Checklist-refinement.md", seedGroup: OPEN_EVIDENCE_TASK_GUIDELINES_SEED_GROUP, task: { id: "checklist_workup_refinement", label: "Checklist/workup refinement", order: 7 } }
]);

const DEFAULT_TOKENS = new Set(DEFAULT_GUIDELINE_SET_SOURCES.map((source) => source.token));
const LEGACY_DEFAULT_ALIASES = new Map([
  ["@pre-round-checklist-guidelines", ["@pre-round-checklist-updated-guidelines"]],
  ["@discharge-instructions-guidelines", ["@discharge-instructions-updated-guidelines"]]
]);

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

export function isCustomGuidelineSet(set) {
  return Boolean(set?.id) && !DEFAULT_TOKENS.has(set.token);
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

async function fetchLatestGuidelineText(path, fetchImpl) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${path}${separator}prompt-refresh=${Date.now()}`, { cache: "no-store" });
  if (!response?.ok) throw new Error(`Could not download ${path}.`);
  const text = await response.text();
  if (!String(text || "").trim()) throw new Error(`The downloaded prompt ${path} was empty.`);
  return text;
}

// Explicit destructive refresh only. Startup seeding remains one-time and
// deletion-safe; this function runs solely after the user confirms that the
// currently deployed built-ins should replace local edits.
export async function restoreLatestDefaultGuidelineSets(
  sets,
  { storage = localStorage, fetchImpl = fetch } = {}
) {
  const current = Array.isArray(sets) ? sets : [];
  const currentByToken = new Map(current.map((set) => [set.token, set]));
  const refreshableSources = DEFAULT_GUIDELINE_SET_SOURCES.filter((source) => source.path);
  const downloaded = await Promise.all(
    refreshableSources.map(async (source) => [source.token, await fetchLatestGuidelineText(source.path, fetchImpl)])
  );
  const textByToken = new Map(downloaded);
  const refreshedDefaults = DEFAULT_GUIDELINE_SET_SOURCES.flatMap((source) => {
    const existing = currentByToken.get(source.token);
    if (!source.path) return existing ? [{ ...existing, label: source.label, token: source.token }] : [];
    const text = textByToken.get(source.token);
    if (existing) {
      return [{ ...existing, label: source.label, token: source.token, text, updatedAt: new Date().toISOString() }];
    }
    return [createGuidelineSet(source.label, text, {
      token: source.token,
      existingTokens: current.map((set) => set.token)
    })];
  });
  const custom = current.filter((set) => !DEFAULT_TOKENS.has(set.token));
  const next = [...refreshedDefaults, ...custom];
  saveGuidelineSets(next, storage);
  return next;
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
  storage.setItem(TEACHING_GUIDELINE_SET_SEED_KEY, "1");
  storage.setItem(OPEN_EVIDENCE_TASK_GUIDELINES_SEED_KEY, "1");
  return seeded;
}

// Adds the Teaching guideline exactly once to installs that were already
// seeded before teaching.md became a Settings-backed smart variable. A
// dedicated marker preserves deletion of every other default and ensures a
// user who later deletes Teaching does not have it silently restored.
export async function ensureTeachingGuidelineSet(sets, { storage = localStorage } = {}) {
  if (storage.getItem(TEACHING_GUIDELINE_SET_SEED_KEY) !== null) return sets;
  const source = DEFAULT_GUIDELINE_SET_SOURCES.find(({ token }) => token === "@teaching-guidelines");
  const hasTeaching = (sets || []).some(({ token }) => token === source.token);
  const next = hasTeaching ? sets : [
    ...(sets || []),
    createGuidelineSet(source.label, await fetchGuidelineText(source.path), {
      token: source.token,
      existingTokens: (sets || []).map((set) => set.token)
    })
  ];
  if (!hasTeaching) saveGuidelineSets(next, storage);
  storage.setItem(TEACHING_GUIDELINE_SET_SEED_KEY, "1");
  return next;
}

// Adds the formerly embedded task instructions exactly once for existing
// installs. The marker makes later deletion authoritative, just like every
// other Settings-backed guideline.
export async function ensureOpenEvidenceTaskGuidelineSets(sets, { storage = localStorage } = {}) {
  if (storage.getItem(OPEN_EVIDENCE_TASK_GUIDELINES_SEED_KEY) !== null) return sets;
  const current = Array.isArray(sets) ? sets : [];
  const existingTokens = new Set(current.map((set) => set.token));
  const sources = DEFAULT_GUIDELINE_SET_SOURCES.filter(({ seedGroup }) => seedGroup === OPEN_EVIDENCE_TASK_GUIDELINES_SEED_GROUP);
  const additions = [];
  for (const source of sources) {
    if (existingTokens.has(source.token)) continue;
    additions.push(createGuidelineSet(source.label, await fetchGuidelineText(source.path), {
      token: source.token,
      existingTokens: [...existingTokens]
    }));
    existingTokens.add(source.token);
  }
  const next = [...current, ...additions];
  if (additions.length) saveGuidelineSets(next, storage);
  storage.setItem(OPEN_EVIDENCE_TASK_GUIDELINES_SEED_KEY, "1");
  return next;
}

export async function ensureCanonicalDefaultGuidelineSets(sets, { legacyTeamPreferences = "", storage = localStorage } = {}) {
  if (storage.getItem(GUIDELINE_SET_CANONICAL_DEFAULTS_KEY) !== null) return sets;

  const firstByToken = new Map();
  for (const set of sets || []) {
    if (!firstByToken.has(set.token)) firstByToken.set(set.token, set);
  }

  const canonical = [];
  for (const source of DEFAULT_GUIDELINE_SET_SOURCES) {
    const aliases = LEGACY_DEFAULT_ALIASES.get(source.token) || [];
    const existing = firstByToken.get(source.token)
      || aliases.map((token) => firstByToken.get(token)).find(Boolean);
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
