// Pure helpers for hash-based view history.
//
// Views are in-memory state, so without this the browser Back button leaves
// the app entirely instead of moving between views. Each view maps to one
// hash ("#review"); Back and Forward fire hashchange, and the app moves to
// the view the hash names. Only view names travel in the hash, never patient
// data, and the locked vault still forces the vault view in render().

export function viewHash(view) {
  return `#${String(view || "")}`;
}

export function parseViewHash(hash, validViewIds = []) {
  const name = String(hash || "")
    .replace(/^#/, "")
    .trim();
  if (!name) return null;
  return validViewIds.includes(name) ? name : null;
}
