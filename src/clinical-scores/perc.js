// PERC Rule for Pulmonary Embolism.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "PERC Rule for Pulmonary Embolism" (MDCalc calc 347) one-to-one:
//   - the same 8 rule-out criteria in MDCalc's order; each "Yes" = 1 point
//   - PERC negative = 0 points (all "No"); PERC positive = >=1 point
//   - applies only to patients already determined low risk by clinical
//     gestalt (pre-test probability <15%).
//   - result-box wording (headline counts "criteria", not points) verified
//     live on 2026-09-26 (2/2 controlled cases matched).
// Primary reference: Kline JA, Mitchell AM, Kabrhel C, Richman PB, Courtney DM.
// Clinical criteria to prevent unnecessary diagnostic testing in emergency
// department patients with suspected pulmonary embolism. J Thromb Haemost.
// 2004;2(8):1247-55.

function yesNo() {
  return [
    { value: 1, label: "Yes" },
    { value: 0, label: "No" }
  ];
}

export const PERC_INPUTS = [
  {
    key: "ageAtLeast50",
    label: "Age \u226550",
    type: "radio",
    options: yesNo()
  },
  {
    key: "heartRateAtLeast100",
    label: "HR \u2265100",
    type: "radio",
    options: yesNo()
  },
  {
    key: "o2SatBelow95",
    label: "O\u2082 sat on room air <95%",
    type: "radio",
    options: yesNo()
  },
  {
    key: "unilateralLegSwelling",
    label: "Unilateral leg swelling",
    type: "radio",
    options: yesNo()
  },
  {
    key: "hemoptysis",
    label: "Hemoptysis",
    type: "radio",
    options: yesNo()
  },
  {
    key: "recentSurgeryOrTrauma",
    label: "Recent surgery or trauma",
    type: "radio",
    hint: "Surgery or trauma \u22644 weeks ago requiring treatment with general anesthesia",
    options: yesNo()
  },
  {
    key: "priorPeOrDvt",
    label: "Prior PE or DVT",
    type: "radio",
    options: yesNo()
  },
  {
    key: "hormoneUse",
    label: "Hormone use",
    type: "radio",
    hint: "Oral contraceptives, hormone replacement or estrogenic hormones use in males or female patients",
    options: yesNo()
  }
];

function toPoints(value) {
  const points = Number(value);
  return Number.isFinite(points) ? points : null;
}

export function scorePerc(values = {}) {
  const missing = [];
  let score = 0;
  for (const input of PERC_INPUTS) {
    const points = toPoints(values[input.key]);
    if (points === null) {
      missing.push(input.label);
      continue;
    }
    score += points;
  }
  return { score, complete: missing.length === 0, missing };
}

export function interpretPerc(score) {
  // Wording verified against MDCalc's live result box on 2026-09-26. MDCalc
  // counts "criteria", not points, in the headline (and writes "1 points"-style
  // plurals elsewhere, so the plural is kept for every count).
  if (score === 0) {
    return {
      band: "negative",
      headline: "0 criteria",
      detail: "No need for further workup, as <2% chance of PE. If no criteria are positive and clinician's pre-test probability is <15%, PERC Rule criteria are satisfied."
    };
  }
  return {
    band: "positive",
    headline: `${score} criteria`,
    detail: "If any criteria are positive, the PERC rule cannot be used to rule out PE in this patient."
  };
}

export function calculatePerc(values = {}) {
  const { score, complete, missing } = scorePerc(values);
  return {
    complete,
    missing,
    score,
    interpretation: complete ? interpretPerc(score) : null
  };
}

export const percDefinition = {
  verifiedOn: "2026-09-26", // live MDCalc parity: 2/2 controlled cases matched
  id: "perc",
  title: "PERC Rule for Pulmonary Embolism",
  subtitle: "Rule out PE in low-risk patients",
  mdcalcId: "347",
  mdcalcUrl: "https://www.mdcalc.com/calc/347/perc-rule-pulmonary-embolism",
  reference: "Kline JA, Mitchell AM, Kabrhel C, Richman PB, Courtney DM. Clinical criteria to prevent unnecessary diagnostic testing in emergency department patients with suspected pulmonary embolism. J Thromb Haemost. 2004;2(8):1247-55.",
  inputs: PERC_INPUTS,
  calculate: calculatePerc
};
