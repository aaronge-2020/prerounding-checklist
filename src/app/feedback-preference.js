// The writer feedback engine choice is a device preference, not patient
// data: it names whether the student last asked the on-device model or
// OpenAI for feedback on their writing. It belongs in plaintext local
// storage next to the de-identification mode choice, so the switch survives
// a reload. Only the engine key is stored; an unknown stored key falls back
// to the on-device default rather than sticking.

export const FEEDBACK_ENGINE_STORAGE_KEY = "prerounding.writerFeedbackEngine.v1";
export const FEEDBACK_ENGINES = Object.freeze(["local", "openai"]);
export const DEFAULT_FEEDBACK_ENGINE = "local";

export function loadPersistedFeedbackEngine(storage, fallback = DEFAULT_FEEDBACK_ENGINE) {
  try {
    const stored = storage?.getItem(FEEDBACK_ENGINE_STORAGE_KEY);
    return FEEDBACK_ENGINES.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function persistFeedbackEngine(storage, engine) {
  try {
    if (FEEDBACK_ENGINES.includes(engine)) storage?.setItem(FEEDBACK_ENGINE_STORAGE_KEY, engine);
  } catch {
    // Storage can be unavailable (private mode, quota). The in-memory
    // selection still applies for this session.
  }
}
