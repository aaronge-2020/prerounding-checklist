// De-identification session coordinator - extracted from app.js to respect
// the coordinator-file size boundary (scripts/check-ui-module-boundaries.js).
// Orchestrates the admission-date gate and delegates to deidentifyText.
// `state` is the shared app state object, mutated directly the same way
// the other controllers in src/ui/ already do.
export function createDeidSessionCoordinator({
  state,
  admissionDateAnchor,
  admissionDateGate,
  deidentifyText,
  updateDeidStatus,
  updateDeidOperation,
  setStatus
}) {
  async function deidentify(rawText, { referenceDate = state.admissionDate, admissionDate = null, skipAdmissionGate = false } = {}) {
    // A session-scoped admissionDate (e.g. Quick De-ID's inline date) bypasses
    // the modal gate and is never written back to the global anchor or the
    // active patient's metadata.
    const sessionDate = String(admissionDate || "").trim();
    if (!sessionDate && !skipAdmissionGate) {
      if (!state.admissionDate) admissionDateAnchor.restore();
      if (!state.admissionDate) {
        await admissionDateGate.requestAdmissionDateFromUser();
        admissionDateAnchor.remember();
      }
    }
    // Quick De-ID pastes arbitrary standalone text: when its gate is skipped
    // and no session date was entered, the current patient's admission date
    // is not a valid anchor for that text. Fall back to null so dates are
    // evaluated on the text's own merits instead of inheriting an unrelated
    // patient's timeline.
    const effectiveAdmissionDate = sessionDate || (skipAdmissionGate ? null : state.admissionDate);
    // Same boundary for relative-date resolution: "2 days ago" in standalone
    // Quick De-ID text must not resolve against the patient's admission date,
    // and an explicit session date is the reference when one was entered.
    const effectiveReferenceDate = sessionDate || (skipAdmissionGate ? null : (referenceDate || effectiveAdmissionDate));
    return deidentifyText(rawText, {
      mode: state.deidMode,
      admissionDate: effectiveAdmissionDate,
      relativeDate: effectiveReferenceDate,
      onStatus: updateDeidStatus,
      onProgress: (progress) => {
        if (progress?.message) {
          setStatus(progress.message);
          if (state.deidOperation.active) updateDeidOperation({ ...state.deidOperation, message: progress.message });
        }
      }
    });
  }

  return Object.freeze({ deidentify });
}
