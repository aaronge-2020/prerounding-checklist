// The selected de-identification mode is a device preference, not patient
// data: it names which local model the clinician picked. It belongs in
// plaintext local storage next to the offline-mode flag, so the choice
// survives a reload instead of silently resetting to the default model.
// Only the model key is stored; a stored key that is no longer a known
// option falls back to the default rather than sticking.

export const DEID_MODE_STORAGE_KEY = "prerounding.deidMode.v1";

export function loadPersistedDeidMode(storage, validKeys = [], fallback) {
  try {
    const stored = storage?.getItem(DEID_MODE_STORAGE_KEY);
    return stored && validKeys.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function persistDeidMode(storage, key) {
  try {
    if (key) storage?.setItem(DEID_MODE_STORAGE_KEY, String(key));
  } catch {
    // Storage can be unavailable (private mode, quota). The in-memory
    // selection still applies for this session.
  }
}
