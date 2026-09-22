const reviewItems = Object.freeze([
  Object.freeze({
    id: "primary_note",
    label: "Primary team note",
    admissionLabel: "Admission primary note",
    requirement: "required",
    sourceKinds: Object.freeze(["primary_note"])
  }),
  Object.freeze({
    id: "vital_signs",
    label: "Vital signs",
    requirement: "required",
    sourceKinds: Object.freeze(["vital_signs"])
  }),
  Object.freeze({
    id: "laboratory_results",
    label: "Laboratory results",
    requirement: "required",
    sourceKinds: Object.freeze(["laboratory_results"])
  }),
  Object.freeze({
    id: "medication_activity",
    label: "Medication activity",
    requirement: "optional",
    sourceKinds: Object.freeze(["medication_activity"])
  }),
  Object.freeze({
    id: "consult_note",
    label: "Consult notes",
    requirement: "optional",
    sourceKinds: Object.freeze(["consult_note"])
  })
]);

function hasSavedText(capture) {
  return Boolean(String(capture?.deidentifiedText || "").trim());
}

// A capture keeps sanitized residual-warning metadata (type/severity/reason)
// until a clinician redacts or dismisses each flagged item - see
// dismissSectionWarning/dismissAllSectionWarnings in src/ui/app.js, which
// clear entries from this array as they are resolved. Its length is
// therefore a genuine "still needs PHI confirmation" signal, distinct from
// whether a source was merely saved.
function hasPendingResidualWarnings(capture) {
  return Boolean((capture?.residualWarnings || []).length);
}

export function packetReviewRequirement(sourceKind) {
  return reviewItems.find((item) => item.sourceKinds.includes(sourceKind))?.requirement || "optional";
}

export function evaluatePacketCompleteness(captures = [], { scope = "daily" } = {}) {
  const savedCaptures = (captures || []).filter(hasSavedText);
  const savedKinds = new Set(savedCaptures.map((capture) => String(capture.sourceKind || "")));
  const pendingReviewKinds = new Set(
    savedCaptures.filter(hasPendingResidualWarnings).map((capture) => String(capture.sourceKind || ""))
  );
  const items = reviewItems.map((item) => {
    // "Saved" only means a source of this kind was captured with text - it
    // is not a clinician's confirmation that the content is correct or that
    // residual PHI flags were resolved. "Reviewed" is the stricter, distinct
    // state: saved AND no outstanding residual-warning confirmation.
    const saved = item.sourceKinds.some((sourceKind) => savedKinds.has(sourceKind));
    const reviewed = saved && !item.sourceKinds.some((sourceKind) => pendingReviewKinds.has(sourceKind));
    return {
      id: item.id,
      label: scope === "admission" && item.admissionLabel ? item.admissionLabel : item.label,
      requirement: item.requirement,
      status: saved ? (reviewed ? "reviewed" : "needs_review") : "not_saved",
      saved,
      reviewed
    };
  });
  const requiredItems = items.filter((item) => item.requirement === "required");
  const missingRequired = requiredItems.filter((item) => !item.saved);

  return {
    scope,
    items,
    requiredReviewed: requiredItems.filter((item) => item.reviewed).length,
    requiredTotal: requiredItems.length,
    missingRequired,
    hasMissingRequired: missingRequired.length > 0
  };
}

export const PACKET_REVIEW_ITEMS = reviewItems;
