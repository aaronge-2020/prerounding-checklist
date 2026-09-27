// Bishop Score for vaginal delivery and induction of labor.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Bishop Score for Vaginal Delivery and Induction of Labor"
// (MDCalc calc 3320) one-to-one:
//   - the same 5 components with the same point values (0-3, 0-3, 0-3, 0-2, 0-2)
//   - total = addition of the selected points (MDCalc "Formula: Addition of the selected points.")
//   - interpretation bands from MDCalc's pearls & advice:
//     "Typically a score >= 8 is used to predict spontaneous vaginal delivery
//      without induction and a score <= 5 suggests an unfavorable cervix
//      likely to require induction." / "Induction is often considered at a
//      Bishop Score of <= 5."
// Primary reference: Bishop EH. Pelvic scoring for elective induction.
// Obstet Gynecol. 1964;24:266-8.

export const BISHOP_MAX_SCORE = 13;

export const BISHOP_INPUTS = [
  {
    key: "dilation",
    label: "Dilation",
    type: "radio",
    options: [
      { value: 0, label: "Closed" },
      { value: 1, label: "1\u20132 cm" },
      { value: 2, label: "3\u20134 cm" },
      { value: 3, label: "\u22655 cm" }
    ]
  },
  {
    key: "effacement",
    label: "Effacement",
    type: "radio",
    options: [
      { value: 0, label: "0\u201330%" },
      { value: 1, label: "40\u201350%" },
      { value: 2, label: "60\u201370%" },
      { value: 3, label: "\u226580%" }
    ]
  },
  {
    key: "station",
    label: "Station",
    type: "radio",
    options: [
      { value: 0, label: "-3" },
      { value: 1, label: "-2" },
      { value: 2, label: "-1, 0" },
      { value: 3, label: "+1, +2" }
    ]
  },
  {
    key: "position",
    label: "Position",
    type: "radio",
    options: [
      { value: 0, label: "Posterior" },
      { value: 1, label: "Mid-position" },
      { value: 2, label: "Anterior" }
    ]
  },
  {
    key: "consistency",
    label: "Consistency",
    type: "radio",
    options: [
      { value: 0, label: "Firm" },
      { value: 1, label: "Moderately firm" },
      { value: 2, label: "Soft" }
    ]
  }
];

function toPoints(value) {
  const points = Number(value);
  return Number.isFinite(points) ? points : null;
}

export function scoreBishop(values = {}) {
  const missing = [];
  let score = 0;
  for (const input of BISHOP_INPUTS) {
    const points = toPoints(values[input.key]);
    if (points === null) {
      missing.push(input.label);
      continue;
    }
    score += points;
  }
  return { score, complete: missing.length === 0, missing };
}

export function interpretBishop(score) {
  // Result wording matches MDCalc's displayed interpretations verbatim
  // (verified against the live calculator 2026-09-26).
  if (score >= 8) {
    return {
      band: "favorable",
      headline: `${score} points`,
      detail: "Scores \u2265 8 suggest spontaneous vaginal delivery is more likely and augmentation or induction may be unnecessary."
    };
  }
  if (score <= 5) {
    return {
      band: "unfavorable",
      headline: `${score} points`,
      detail: "Scores \u2264 5 suggest an unfavorable cervix, and that induction may be necessary for successful vaginal delivery."
    };
  }
  return {
    band: "intermediate",
    headline: `${score} points`,
    detail: "Falls between MDCalc's published thresholds (\u22645 unfavorable, \u22658 favorable); use clinical judgment."
  };
}

export function calculateBishop(values = {}) {
  const { score, complete, missing } = scoreBishop(values);
  return {
    complete,
    missing,
    score,
    interpretation: complete ? interpretBishop(score) : null
  };
}

export const bishopDefinition = {
  verifiedOn: "2026-09-26",
  id: "bishop",
  title: "Bishop Score",
  subtitle: "Vaginal delivery & induction of labor",
  mdcalcId: "3320",
  mdcalcUrl: "https://www.mdcalc.com/calc/3320/bishop-score-vaginal-delivery-induction-labor",
  reference: "Bishop EH. Pelvic scoring for elective induction. Obstet Gynecol. 1964;24:266-8.",
  inputs: BISHOP_INPUTS,
  calculate: calculateBishop
};
