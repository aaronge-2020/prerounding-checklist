// Wells' Criteria for DVT.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Wells' Criteria for DVT" (MDCalc calc 362) one-to-one:
//   - the same 10 clinical criteria in MDCalc's order: +1 each, except
//     "Alternative diagnosis to DVT as likely or more likely" at -2
//   - total = addition of the selected points (score range -2 to 9)
//   - risk bands from the primary reference, with MDCalc's live result-box
//     wording verified on 2026-09-26 (2/2 controlled cases matched).
// Primary reference: Wells PS, Anderson DR, Bormanis J, et al. Value of
// assessment of pretest probability of deep-vein thrombosis in clinical
// management. Lancet. 1997;350(9094):1349-54.

export const WELLS_DVT_MIN_SCORE = -2;
export const WELLS_DVT_MAX_SCORE = 9;

const YES = 1;
const NO = 0;

function yesNo(points) {
  return [
    { value: points, label: "Yes" },
    { value: NO, label: "No" }
  ];
}

export const WELLS_DVT_INPUTS = [
  {
    key: "activeCancer",
    label: "Active cancer / Treatment or palliation within 6 months",
    type: "radio",
    options: yesNo(YES)
  },
  {
    key: "bedriddenOrSurgery",
    label: "Bedridden recently >3 days or major surgery within 12 weeks",
    type: "radio",
    options: yesNo(YES)
  },
  {
    key: "calfSwelling",
    label: "Calf swelling >3 cm compared to the other leg / Measured 10 cm below tibial tuberosity",
    type: "radio",
    options: yesNo(YES)
  },
  {
    key: "collateralVeins",
    label: "Collateral (nonvaricose) superficial veins present",
    type: "radio",
    options: yesNo(YES)
  },
  {
    key: "entireLegSwollen",
    label: "Entire leg swollen",
    type: "radio",
    options: yesNo(YES)
  },
  {
    key: "localizedTenderness",
    label: "Localized tenderness along the deep venous system",
    type: "radio",
    options: yesNo(YES)
  },
  {
    key: "pittingEdema",
    label: "Pitting edema, confined to symptomatic leg",
    type: "radio",
    options: yesNo(YES)
  },
  {
    key: "paralysisOrImmobilization",
    label: "Paralysis, paresis, or recent plaster immobilization of the lower extremity",
    type: "radio",
    options: yesNo(YES)
  },
  {
    key: "priorDvt",
    label: "Previously documented DVT",
    type: "radio",
    options: yesNo(YES)
  },
  {
    key: "alternativeDiagnosis",
    label: "Alternative diagnosis to DVT as likely or more likely",
    type: "radio",
    options: [
      { value: -2, label: "Yes" },
      { value: NO, label: "No" }
    ]
  }
];

function toPoints(value) {
  const points = Number(value);
  return Number.isFinite(points) ? points : null;
}

export function scoreWellsDvt(values = {}) {
  const missing = [];
  let score = 0;
  for (const input of WELLS_DVT_INPUTS) {
    const points = toPoints(values[input.key]);
    if (points === null) {
      missing.push(input.label);
      continue;
    }
    score += points;
  }
  return { score, complete: missing.length === 0, missing };
}

export function interpretWellsDvt(score) {
  // Wording verified against MDCalc's live result box on 2026-09-26. The
  // moderate-tier sentence omits MDCalc's trailing "See Next Steps" pointer,
  // which refers to MDCalc UI that does not exist in this app.
  if (score >= 3) {
    return {
      band: "likely",
      headline: `${score} points`,
      detail: "High risk group for DVT. \"Likely\" according to Wells' DVT studies."
    };
  }
  if (score >= 1) {
    return {
      band: "moderate",
      headline: `${score} points`,
      detail: "Moderate risk group for DVT."
    };
  }
  return {
    band: "unlikely",
    headline: `${score} points`,
    detail: "Low risk group for DVT. \"Unlikely\" according to Wells' DVT studies."
  };
}

export function calculateWellsDvt(values = {}) {
  const { score, complete, missing } = scoreWellsDvt(values);
  return {
    complete,
    missing,
    score,
    interpretation: complete ? interpretWellsDvt(score) : null
  };
}

export const wellsDvtDefinition = {
  verifiedOn: "2026-09-26", // live MDCalc parity: 2/2 controlled cases matched
  id: "wells-dvt",
  title: "Wells' Criteria for DVT",
  subtitle: "Pre-test probability of deep vein thrombosis",
  mdcalcId: "362",
  mdcalcUrl: "https://www.mdcalc.com/calc/362/wells-criteria-dvt",
  reference: "Wells PS, Anderson DR, Bormanis J, et al. Value of assessment of pretest probability of deep-vein thrombosis in clinical management. Lancet. 1997;350(9094):1349-54.",
  inputs: WELLS_DVT_INPUTS,
  calculate: calculateWellsDvt
};
