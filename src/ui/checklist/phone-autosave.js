// Phone-mode has no encrypted vault to persist into (it's opened without
// unlocking one), so in-progress answers otherwise live only in memory and
// vanish if the tab reloads or is reclaimed. This is a best-effort local
// cache, not a security boundary: it carries the same exposure as the
// #phone= link itself, which already contains the checklist content
// unencrypted in this browser's history/address bar.
const PREFIX = "prerounding_phone_autosave_v1:";

export function createPhoneAutosave(storage) {
  function key(checklistId) {
    return `${PREFIX}${checklistId}`;
  }

  function save(checklistId, { answers, quickNotes }) {
    if (!checklistId) return;
    try {
      storage.setItem(key(checklistId), JSON.stringify({ answers, quickNotes, savedAt: new Date().toISOString() }));
    } catch {
      // Best-effort only; private browsing or a full quota shouldn't block
      // filling out the checklist itself.
    }
  }

  function load(checklistId) {
    if (!checklistId) return null;
    try {
      const parsed = JSON.parse(storage.getItem(key(checklistId)) || "null");
      return parsed?.answers || parsed?.quickNotes?.length ? parsed : null;
    } catch {
      return null;
    }
  }

  function discard(checklistId) {
    if (!checklistId) return;
    try {
      storage.removeItem(key(checklistId));
    } catch {
      // Nothing to clean up if storage isn't available.
    }
  }

  return Object.freeze({ save, load, discard });
}
