// Structured correction capture for the automatic rule proposer.
//
// Integrates with the existing correction flow in app.js (logDeidCorrection).
// This module converts review decisions into the structured Correction format
// the rule proposer needs, with features extracted.
//
// Privacy: PHI span text is NEVER persisted. Corrections live in the
// session-only in-memory store (matching the existing adaptive.js policy).
// Only proposed rules (regex patterns, no PHI) may be persisted.

import { extractFeatures } from "./feature-extract.js";

let correctionSeq = 0;

/**
 * Build a structured correction from a review decision.
 *
 * @param {Object} opts
 *   - decision: 'accepted' | 'rejected' | 'added' | 'edited' | 'relabelled'
 *   - original: {start, end, label, text} (the system's prediction)
 *   - corrected: {start, end, label, text} | null (the clinician's fix)
 *   - noteText: full note text for context extraction
 *   - noteId: note identifier
 * @returns {Object|null} structured correction, or null if not learnable
 */
export function buildCorrection({ decision, original, corrected, noteText, noteId, label }) {
  // Map review decisions to proposer correction types
  let correctionType = null;
  if (decision === "rejected") {
    correctionType = "remove"; // false positive: system predicted, clinician removed
  } else if (decision === "added") {
    correctionType = "add"; // false negative: system missed, clinician added
  } else if (decision === "edited" || decision === "relabelled") {
    // Check if it's a relabel (same span, different label) or boundary change
    if (original && corrected &&
        original.start === corrected.start && original.end === corrected.end &&
        original.label !== corrected.label) {
      correctionType = "relabel";
    } else {
      return null; // boundary edits: logged but don't trigger proposals (harder to generalize)
    }
  } else {
    return null; // 'accepted' = implicit positive feedback, no correction needed
  }

  const span = corrected || original;
  if (!span) return null;

  // Resolve label: explicit label param wins, then corrected/original label
  const spanLabel = label || corrected?.label || original?.label || null;

  const correction = {
    id: `corr_${Date.now()}_${correctionSeq++}`,
    noteId: noteId || "",
    correctionType,
    originalType: original?.label || label || null,
    targetType: spanLabel,
    begin: span.start ?? span.begin,
    end: span.end,
    features: null, // filled below
  };

  // Extract features (needs full note text + span offsets)
  correction.features = extractFeatures({
    begin: correction.begin,
    end: correction.end,
    noteText,
    spanText: span.text || noteText.slice(correction.begin, correction.end),
  });

  return correction;
}

/**
 * Session-only correction store.
 * Holds structured corrections in memory. Cleared on vault lock,
 * matching the existing adaptive store policy.
 */
export function createCorrectionStore() {
  return {
    corrections: [],
    maxSize: 500,
  };
}

export function addCorrection(store, correction) {
  if (!store || !correction) return;
  store.corrections.push(correction);
  if (store.corrections.length > store.maxSize) {
    store.corrections.splice(0, store.corrections.length - store.maxSize);
  }
}

export function getCorrections(store) {
  return store ? [...store.corrections] : [];
}

export function clearCorrections(store) {
  if (store) store.corrections = [];
}
