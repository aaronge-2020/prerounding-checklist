import { normalizeWorkup } from "./schema.js";

export const WORKUP_LIBRARY_SCHEMA = "prerounding_workup_library_v1";

const normalizeText = (value) => String(value || "").trim();
const normalizeVersion = (value) => normalizeText(value) || "1.0.0";
const normalizeWorkups = (workups) => (Array.isArray(workups) ? workups : []).map(normalizeWorkup);

export function normalizeWorkupLibrary(library) {
  const workups = normalizeWorkups(library?.workups);
  const errors = [];
  const id = normalizeText(library?.id);
  const title = normalizeText(library?.title);
  if (library?.schema !== WORKUP_LIBRARY_SCHEMA) errors.push(`schema must be ${WORKUP_LIBRARY_SCHEMA}`);
  if (!id) errors.push("id is required");
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) errors.push("id must be URL-safe");
  if (!title) errors.push("title is required");
  if (!workups.length) errors.push("workups must contain at least one workup");
  if (new Set(workups.map((workup) => workup.id)).size !== workups.length) errors.push("workup ids must be unique within a library");
  if (errors.length) throw new Error(errors.join("; "));
  return {
    schema: WORKUP_LIBRARY_SCHEMA,
    id,
    title,
    version: normalizeVersion(library?.version),
    description: normalizeText(library?.description),
    workups
  };
}

export const parseWorkupLibraryJson = (text) => normalizeWorkupLibrary(JSON.parse(text));

export const createWorkupLibrary = ({ id, title, version = "1.0.0", description = "", workups = [] } = {}) =>
  normalizeWorkupLibrary({ schema: WORKUP_LIBRARY_SCHEMA, id, title, version, description, workups });

export const workupLibraryFromOverrides = (overrides, metadata) => createWorkupLibrary({
  ...metadata,
  workups: Object.values(overrides || {})
});

export const mergeWorkupLibraryIntoOverrides = (overrides, library) => {
  const normalizedLibrary = normalizeWorkupLibrary(library);
  return normalizedLibrary.workups.reduce(
    (nextOverrides, workup) => ({ ...nextOverrides, [workup.id]: workup }),
    { ...(overrides || {}) }
  );
};
