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

export function packetReviewRequirement(sourceKind) {
  return reviewItems.find((item) => item.sourceKinds.includes(sourceKind))?.requirement || "optional";
}

export function evaluatePacketCompleteness(captures = [], { scope = "daily" } = {}) {
  const suppliedKinds = new Set((captures || []).filter(hasSavedText).map((capture) => String(capture.sourceKind || "")));
  const items = reviewItems.map((item) => {
    const reviewed = item.sourceKinds.some((sourceKind) => suppliedKinds.has(sourceKind));
    return {
      id: item.id,
      label: scope === "admission" && item.admissionLabel ? item.admissionLabel : item.label,
      requirement: item.requirement,
      status: reviewed ? "reviewed" : "not_reviewed",
      reviewed
    };
  });
  const requiredItems = items.filter((item) => item.requirement === "required");
  const missingRequired = requiredItems.filter((item) => !item.reviewed);

  return {
    scope,
    items,
    requiredReviewed: requiredItems.length - missingRequired.length,
    requiredTotal: requiredItems.length,
    missingRequired,
    hasMissingRequired: missingRequired.length > 0
  };
}

export const PACKET_REVIEW_ITEMS = reviewItems;
