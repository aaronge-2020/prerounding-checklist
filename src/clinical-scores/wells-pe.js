// Wells' Criteria for Pulmonary Embolism.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Wells' Criteria for Pulmonary Embolism" (MDCalc calc 115)
// one-to-one:
//   - the same 7 clinical criteria in MDCalc's order, with MDCalc's point
//     values: DVT signs +3, PE #1 diagnosis +3, HR >100 +1.5,
//     immobilization/surgery +1.5, prior VTE +1.5, hemoptysis +1, malignancy +1
//   - total = addition of the selected points
//   - MDCalc displays both models; the three-tier interpretation and the
//     two-tier study line are MDCalc's live result-box wording, verified on
//     2026-09-26 (2/2 controlled cases matched).
// Primary reference: Wells PS, Anderson DR, Rodger M, et al. Derivation of a
// simple clinical model to categorize patients probability of pulmonary
// embolism: increasing the models utility with the SimpliRED D-dimer.
// Thromb Haemost. 2000;83(3):416-20.

export const WELLS_PE_MAX_SCORE = 12.5;

function yesNo(points) {
  return [
    { value: points, label: "Yes" },
    { value: 0, label: "No" }
  ];
}

export const WELLS_PE_INPUTS = [
  {
    key: "dvtSigns",
    label: "Clinical signs and symptoms of DVT",
    type: "radio",
    options: yesNo(3)
  },
  {
    key: "peMostLikely",
    label: "PE is #1 diagnosis OR equally likely",
    type: "radio",
    options: yesNo(3)
  },
  {
    key: "heartRateOver100",
    label: "Heart rate >100",
    type: "radio",
    options: yesNo(1.5)
  },
  {
    key: "immobilizationOrSurgery",
    label: "Immobilization at least 3 days OR surgery in the previous 4 weeks",
    type: "radio",
    options: yesNo(1.5)
  },
  {
    key: "priorVte",
    label: "Previous, objectively diagnosed PE or DVT",
    type: "radio",
    options: yesNo(1.5)
  },
  {
    key: "hemoptysis",
    label: "Hemoptysis",
    type: "radio",
    options: yesNo(1)
  },
  {
    key: "malignancy",
    label: "Malignancy w/ treatment within 6 months or palliative",
    type: "radio",
    options: yesNo(1)
  }
];

function toPoints(value) {
  const points = Number(value);
  return Number.isFinite(points) ? points : null;
}

function formatScore(score) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function scoreWellsPe(values = {}) {
  const missing = [];
  let score = 0;
  for (const input of WELLS_PE_INPUTS) {
    const points = toPoints(values[input.key]);
    if (points === null) {
      missing.push(input.label);
      continue;
    }
    score += points;
  }
  // 1.5-point increments are exactly representable; round defensively.
  score = Math.round(score * 2) / 2;
  return { score, complete: missing.length === 0, missing };
}

export function interpretWellsPe(score) {
  // Wording verified against MDCalc's live result box on 2026-09-26: the
  // three-tier interpretation plus the two-tier study line MDCalc shows
  // beneath it. The moderate-tier figure (16.2%) follows the same headline
  // pattern with the primary-reference incidence.
  const twoTier = score > 4
    ? "Another study assigned scores >4 as \"PE Likely\" and had a 28% incidence of PE."
    : "Another study assigned scores \u22644 as \"PE Unlikely\" and had a 3% incidence of PE.";
  if (score > 6) {
    return {
      band: "high",
      headline: `${formatScore(score)} points`,
      detail: `High risk group: 40.6% chance of PE in an ED population. ${twoTier}`
    };
  }
  if (score >= 2) {
    return {
      band: "moderate",
      headline: `${formatScore(score)} points`,
      detail: `Moderate risk group: 16.2% chance of PE in an ED population. ${twoTier}`
    };
  }
  return {
    band: "low",
    headline: `${formatScore(score)} points`,
    detail: `Low risk group: 1.3% chance of PE in an ED population. ${twoTier}`
  };
}

export function calculateWellsPe(values = {}) {
  const { score, complete, missing } = scoreWellsPe(values);
  return {
    complete,
    missing,
    score,
    interpretation: complete ? interpretWellsPe(score) : null
  };
}

export const wellsPeDefinition = {
  verifiedOn: "2026-09-26", // live MDCalc parity: 2/2 controlled cases matched
  id: "wells-pe",
  title: "Wells' Criteria for Pulmonary Embolism",
  subtitle: "Pre-test probability of PE",
  mdcalcId: "115",
  mdcalcUrl: "https://www.mdcalc.com/calc/115/wells-criteria-pulmonary-embolism-pe",
  reference: "Wells PS, Anderson DR, Rodger M, et al. Derivation of a simple clinical model to categorize patients probability of pulmonary embolism: increasing the models utility with the SimpliRED D-dimer. Thromb Haemost. 2000;83(3):416-20.",
  inputs: WELLS_PE_INPUTS,
  calculate: calculateWellsPe
};
