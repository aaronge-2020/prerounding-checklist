// APGAR Score for the newborn.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "APGAR Score" (MDCalc calc 23) one-to-one:
//   - the same 5 components in MDCalc's order (Activity/muscle tone, Pulse,
//     Grimace, Appearance/color, Respirations), each scored 0-2
//   - total = addition of assigned points (min 0, max 10)
//   - result display ("N points") and interpretation text match MDCalc's
//     displayed wording verbatim (verified against the live calculator
//     2026-09-26): >=7 "typically normal", <7 "suggest potential need for
//     medical intervention".
// Primary reference: Apgar V. A proposal for a new method of evaluation of the
// newborn infant. Curr Res Anesth Analg. 1953;32(4):260-267.

export const APGAR_MAX_SCORE = 10;

export const APGAR_INPUTS = [
  {
    key: "activity",
    label: "Activity/muscle tone",
    type: "radio",
    options: [
      { value: 0, label: "Limp" },
      { value: 1, label: "Some extremity flexion" },
      { value: 2, label: "Active" }
    ]
  },
  {
    key: "pulse",
    label: "Pulse",
    type: "radio",
    options: [
      { value: 0, label: "Absent" },
      { value: 1, label: "<100 BPM" },
      { value: 2, label: "\u2265100 BPM" }
    ]
  },
  {
    key: "grimace",
    label: "Grimace",
    type: "radio",
    options: [
      { value: 0, label: "None" },
      { value: 1, label: "Grimace" },
      { value: 2, label: "Sneeze/cough" }
    ]
  },
  {
    key: "appearance",
    label: "Appearance/color",
    type: "radio",
    options: [
      { value: 0, label: "Blue/pale" },
      { value: 1, label: "Blue extremities, pink body" },
      { value: 2, label: "All pink" }
    ]
  },
  {
    key: "respiration",
    label: "Respirations",
    type: "radio",
    options: [
      { value: 0, label: "Absent" },
      { value: 1, label: "Irregular/slow" },
      { value: 2, label: "Good/crying" }
    ]
  }
];

function toPoints(value) {
  const points = Number(value);
  return Number.isFinite(points) ? points : null;
}

export function scoreApgar(values = {}) {
  const missing = [];
  let score = 0;
  for (const input of APGAR_INPUTS) {
    const points = toPoints(values[input.key]);
    if (points === null) {
      missing.push(input.label);
      continue;
    }
    score += points;
  }
  return { score, complete: missing.length === 0, missing };
}

export function interpretApgar(score) {
  // MDCalc displays exactly two interpretations (verified 2026-09-26).
  if (score >= 7) {
    return {
      band: "reassuring",
      headline: `${score} points`,
      detail: "Scores \u22657 are typically \"normal\" for neonates."
    };
  }
  if (score >= 4) {
    return {
      band: "moderately-abnormal",
      headline: `${score} points`,
      detail: "Scores <7 suggest potential need for medical intervention, like suction, drying, warming, and stimulation."
    };
  }
  return {
    band: "low",
    headline: `${score} points`,
    detail: "Scores <7 suggest potential need for medical intervention, like suction, drying, warming, and stimulation."
  };
}

export function calculateApgar(values = {}) {
  const { score, complete, missing } = scoreApgar(values);
  return {
    complete,
    missing,
    score,
    interpretation: complete ? interpretApgar(score) : null
  };
}

export const apgarDefinition = {
  verifiedOn: "2026-09-26",
  id: "apgar",
  title: "APGAR Score",
  subtitle: "Newborn assessment at 1 & 5 minutes",
  mdcalcId: "23",
  mdcalcUrl: "https://www.mdcalc.com/calc/23/apgar-score",
  reference: "Apgar V. A proposal for a new method of evaluation of the newborn infant. Curr Res Anesth Analg. 1953;32(4):260-267.",
  inputs: [
    {
      key: "assessmentTime",
      label: "Assessment time",
      type: "select",
      annotation: true,
      options: [
        { value: "1min", label: "1 minute" },
        { value: "5min", label: "5 minutes" },
        { value: "10min", label: "10 minutes" },
        { value: "15min", label: "15 minutes" },
        { value: "20min", label: "20 minutes" }
      ],
      hint: "Does not change the score. Per NRP, scoring continues at 5-minute intervals until 7 or 20 minutes of life."
    },
    ...APGAR_INPUTS
  ],
  calculate: calculateApgar
};
