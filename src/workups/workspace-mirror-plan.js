import { normalizeWorkup } from "./schema.js";

// A workspace mirror is deliberately a one-way, non-destructive export of a
// user's local overrides.  It never writes patient data, bundled workups, or
// Git state.  The browser vault remains the canonical runtime store.
export const WORKUP_WORKSPACE_DIRECTORY = ["workups", "local"];
export const WORKUP_WORKSPACE_MANIFEST = "prerounding-workups.local.json";

function stableWorkups(workups = []) {
  return [...workups]
    .map((workup) => normalizeWorkup(workup))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function workupWorkspaceFilename(workup) {
  const normalized = normalizeWorkup(workup);
  // `normalizeWorkup` already enforces the safe ID contract. Keeping the
  // filename derivation here avoids UI code inventing paths from display text.
  return `${normalized.id}.workup.json`;
}

export function workupWorkspaceMirrorPlan(workupOverrides = {}) {
  const workups = stableWorkups(Object.values(workupOverrides || {}));
  const files = workups.map((workup) => ({
    name: workupWorkspaceFilename(workup),
    contents: `${JSON.stringify(workup, null, 2)}\n`
  }));
  const manifest = {
    schema: "prerounding_workup_workspace_mirror_v1",
    description: "Browser-local workup override mirror. Contains no patient data and is not a source of truth for the encrypted vault.",
    workups: workups.map((workup) => ({ id: workup.id, file: workupWorkspaceFilename(workup) }))
  };
  return {
    directory: [...WORKUP_WORKSPACE_DIRECTORY],
    workups,
    files: [
      ...files,
      { name: WORKUP_WORKSPACE_MANIFEST, contents: `${JSON.stringify(manifest, null, 2)}\n` }
    ]
  };
}
