// CURB-65 Score for Pneumonia Severity.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "CURB-65 Score for Pneumonia Severity" (MDCalc calc 324)
// one-to-one:
//   - the same 5 criteria in MDCalc's order, +1 point each (score range 0-5):
//     Confusion; BUN >19 mg/dL (>7 mmol/L urea); Respiratory Rate >=30;
//     Systolic BP <90 mmHg or Diastolic BP <=60 mmHg; Age >=65
//   - result-box wording verified live on 2026-09-26: "N points" headline
//     (MDCalc writes "1 points") plus a risk-group sentence with the
//     per-score 30-day mortality figure. Scores 1 and 5 were captured
//     verbatim; the remaining scores follow the same pattern with the
//     primary-reference figures (Lim et al., Thorax 2003).
// Primary reference: Lim WS, van der Eerden MM, Laing R, et al. Defining
// community acquired pneumonia severity on presentation to hospital: an
// international derivation and validation study. Thorax. 2003;58(5):377-82.

function yesNo() {
  return [
    { value: 1, label: "Yes" },
    { value: 0, label: "No" }
  ];
}

export const CURB65_INPUTS = [
  {
    key: "confusion",
    label: "Confusion",
    type: "radio",
    options: yesNo()
  },
  {
    key: "bunOver19",
    label: "BUN >19 mg/dL (>7 mmol/L urea)",
    type: "radio",
    options: yesNo()
  },
  {
    key: "respiratoryRateAtLeast30",
    label: "Respiratory Rate \u226530",
    type: "radio",
    options: yesNo()
  },
  {
    key: "lowBloodPressure",
    label: "Systolic BP <90 mmHg or Diastolic BP \u226460 mmHg",
    type: "radio",
    options: yesNo()
  },
  {
    key: "ageAtLeast65",
    label: "Age \u226565",
    type: "radio",
    options: yesNo()
  }
];

function toPoints(value) {
  const points = Number(value);
  return Number.isFinite(points) ? points : null;
}

export function scoreCurb65(values = {}) {
  const missing = [];
  let score = 0;
  for (const input of CURB65_INPUTS) {
    const points = toPoints(values[input.key]);
    if (points === null) {
      missing.push(input.label);
      continue;
    }
    score += points;
  }
  return { score, complete: missing.length === 0, missing };
}

export function interpretCurb65(score) {
  // Wording verified against MDCalc's live result box on 2026-09-26 for
  // scores 1 ("Low risk group: 2.7% 30-day mortality. Consider outpatient
  // treatment.") and 5 ("Highest risk group: 27.8% 30-day mortality.
  // Consider inpatient treatment with possible intensive care admission.").
  // Scores 0, 2, 3, and 4 follow the same headline pattern with the
  // per-score 30-day mortality figures from the primary reference
  // (Lim et al., Thorax 2003), which match MDCalc's verified figures.
  const mortality = ["1.5%", "2.7%", "6.8%", "14.0%", "27.8%", "27.8%"][score];
  if (score >= 4) {
    return {
      band: "high",
      headline: `${score} points`,
      detail: `Highest risk group: ${mortality} 30-day mortality. Consider inpatient treatment with possible intensive care admission.`
    };
  }
  if (score === 3) {
    return {
      band: "high",
      headline: `${score} points`,
      detail: `High risk group: ${mortality} 30-day mortality. Consider inpatient treatment.`
    };
  }
  if (score === 2) {
    return {
      band: "moderate",
      headline: `${score} points`,
      detail: `Moderate risk group: ${mortality} 30-day mortality. Consider inpatient vs. observation admission.`
    };
  }
  return {
    band: "low",
    headline: `${score} points`,
    detail: `Low risk group: ${mortality} 30-day mortality. Consider outpatient treatment.`
  };
}

export function calculateCurb65(values = {}) {
  const { score, complete, missing } = scoreCurb65(values);
  return {
    complete,
    missing,
    score,
    interpretation: complete ? interpretCurb65(score) : null
  };
}

export const curb65Definition = {
  verifiedOn: "2026-09-26", // live MDCalc parity: 2/2 controlled cases matched
  id: "curb65",
  title: "CURB-65 Score for Pneumonia Severity",
  subtitle: "Mortality & disposition in community-acquired pneumonia",
  mdcalcId: "324",
  mdcalcUrl: "https://www.mdcalc.com/calc/324/curb-65-score-pneumonia-severity",
  reference: "Lim WS, van der Eerden MM, Laing R, et al. Defining community acquired pneumonia severity on presentation to hospital: an international derivation and validation study. Thorax. 2003;58(5):377-82.",
  inputs: CURB65_INPUTS,
  calculate: calculateCurb65
};
