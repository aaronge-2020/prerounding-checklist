// VBAC Risk Score for Successful Vaginal Delivery (Flamm Model).
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "VBAC Risk Score for Successful Vaginal Delivery (Flamm Model)"
// (MDCalc calc 3317) one-to-one:
//   - the same 5 admission inputs with the same point values (total 0-10)
//   - the same score -> predicted-success table from MDCalc:
//       0-2: 49% | 3: 60% | 4: 67% | 5: 77% | 6: 89% | 7: 93% | 8-10: 95%
//   - MDCalc critical action: "A low VBAC Risk Score does not predict failure."
// Primary reference: Flamm BL, Geiger AM. Vaginal birth after cesarean delivery:
// an admission scoring system. Obstet Gynecol. 1997;90(6):907-10.

export const FLAMM_MAX_SCORE = 10;

const FLAMM_PROBABILITY_TABLE = [
  { maxScore: 2, probabilityPercent: 49 },
  { maxScore: 3, probabilityPercent: 60 },
  { maxScore: 4, probabilityPercent: 67 },
  { maxScore: 5, probabilityPercent: 77 },
  { maxScore: 6, probabilityPercent: 89 },
  { maxScore: 7, probabilityPercent: 93 },
  { maxScore: 10, probabilityPercent: 95 }
];

export const FLAMM_INPUTS = [
  {
    key: "ageUnder40",
    label: "Maternal age < 40 years",
    type: "radio",
    options: [
      { value: 2, label: "Yes" },
      { value: 0, label: "No" }
    ],
    pull: { kind: "demographic", field: "ageYears", derive: "lt40" }
  },
  {
    key: "vaginalBirthHistory",
    label: "Vaginal birth history",
    type: "radio",
    options: [
      { value: 4, label: "Vaginal birth before and after first cesarean delivery" },
      { value: 2, label: "Vaginal birth after first cesarean delivery" },
      { value: 1, label: "Vaginal birth before cesarean delivery" },
      { value: 0, label: "No previous vaginal birth" }
    ]
  },
  {
    key: "reasonNotFailureToProgress",
    label: "Reason other than failure to progress for first cesarean delivery",
    type: "radio",
    options: [
      { value: 1, label: "Yes" },
      { value: 0, label: "No" }
    ]
  },
  {
    key: "effacement",
    label: "Cervical effacement at admission",
    type: "radio",
    options: [
      { value: 2, label: "> 75%" },
      { value: 1, label: "25\u201375%" },
      { value: 0, label: "< 25%" }
    ]
  },
  {
    key: "dilationAtLeast4cm",
    label: "Cervical dilation \u2265 4 cm at admission",
    type: "radio",
    options: [
      { value: 1, label: "Yes" },
      { value: 0, label: "No" }
    ]
  }
];

function toPoints(value) {
  const points = Number(value);
  return Number.isFinite(points) ? points : null;
}

export function scoreFlamm(values = {}) {
  const missing = [];
  let score = 0;
  for (const input of FLAMM_INPUTS) {
    const points = toPoints(values[input.key]);
    if (points === null) {
      missing.push(input.label);
      continue;
    }
    score += points;
  }
  return { score, complete: missing.length === 0, missing };
}

export function flammProbabilityPercent(score) {
  for (const row of FLAMM_PROBABILITY_TABLE) {
    if (score <= row.maxScore) return row.probabilityPercent;
  }
  return 95;
}

export function calculateFlamm(values = {}) {
  const { score, complete, missing } = scoreFlamm(values);
  if (!complete) return { complete, missing, score, probabilityPercent: null, interpretation: null };
  const probabilityPercent = flammProbabilityPercent(score);
  return {
    complete,
    missing,
    score,
    probabilityPercent,
    interpretation: {
      band: probabilityPercent >= 89 ? "high" : probabilityPercent >= 67 ? "moderate" : "lower",
      headline: `${probabilityPercent}% of women with successful VBAC`,
      detail: `Score ${score} / ${FLAMM_MAX_SCORE}. A low VBAC Risk Score does not predict failure.`
    }
  };
}

export const vbacFlammDefinition = {
  verifiedOn: "2026-09-26",
  id: "vbac-flamm",
  title: "VBAC Risk Score (Flamm)",
  subtitle: "Successful vaginal delivery \u2014 admission model",
  mdcalcId: "3317",
  mdcalcUrl: "https://www.mdcalc.com/calc/3317/vbac-risk-score-successful-vaginal-delivery-flamm-model",
  reference: "Flamm BL, Geiger AM. Vaginal birth after cesarean delivery: an admission scoring system. Obstet Gynecol. 1997;90(6):907-10.",
  inputs: FLAMM_INPUTS,
  calculate: calculateFlamm
};
