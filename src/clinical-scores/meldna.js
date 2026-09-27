// MELDNa / MELD-Na Score (Model for End-Stage Liver Disease, 12 and older).
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "MELDNa (UNOS/OPTN) Score" (MDCalc calc 78) one-to-one:
//   - the same 6 inputs in MDCalc's order: dialysis x2 in past week, CVVHD
//     >=24h in past week, creatinine, total bilirubin, INR, sodium
//   - UNOS/OPTN 2016 rules: bilirubin/creatinine/INR < 1.0 are set to 1.0;
//     creatinine is set to 4.0 if > 4.0, on dialysis twice in the past week,
//     or CVVHD >= 24h in the past week
//   - MELD(i) = 10 x (0.957 x ln(Cr) + 0.378 x ln(bilirubin)
//     + 1.120 x ln(INR) + 0.643), rounded to the nearest integer
//   - if MELD(i) > 11: MELDNa = MELD(i) + 1.32 x (137 - Na)
//     - 0.033 x MELD(i) x (137 - Na), Na bounded to 125-137,
//     rounded to the nearest integer; maximum score 40
//   - result: "N points" with "MELD Score (2016)" caption and the
//     "Estimated 3-Month Mortality" percentage
//
// Live-verified 2026-09-26 against MDCalc (2 controlled cases, synthetic
// inputs, no login): both matched. MDCalc labels the CVVHD input
// "Or Continuous veno-venous hemodialysis (CVVHD) for \u226524 hours in the
// past week" with No/Yes buttons; the result caption reads
// "MELD Score (2016)" (no "MELDNa" headline). MDCalc merges original MELD,
// MELD-Na, and MELD 3.0 into one page family; there is no prior-transplant
// or exception-points input.
// Primary references: Kamath PS et al. Hepatology. 2001;33(2):464-70;
// Kim WR et al. Hepatology. 2008;47(5):1642-8; UNOS/OPTN policy, Jan 2016.

export const MELDNA_MAX_SCORE = 40;

export const MELDNA_INPUTS = [
  {
    key: "dialysisTwice",
    label: "Dialysis at least twice in the past week",
    type: "radio",
    options: [
      { value: 0, label: "No" },
      { value: 1, label: "Yes" }
    ]
  },
  {
    key: "cvvhd24",
    label: "Or Continuous veno-venous hemodialysis (CVVHD) for \u226524 hours in the past week",
    type: "radio",
    options: [
      { value: 0, label: "No" },
      { value: 1, label: "Yes" }
    ]
  },
  {
    key: "creatinine",
    label: "Creatinine",
    type: "number",
    unit: "mg/dL",
    min: 0.1,
    step: 0.1,
    placeholder: "e.g. 1.2"
  },
  {
    key: "bilirubin",
    label: "Total bilirubin",
    type: "number",
    unit: "mg/dL",
    min: 0.1,
    step: 0.1,
    placeholder: "e.g. 2.0"
  },
  {
    key: "inr",
    label: "INR",
    type: "number",
    min: 0.5,
    step: 0.1,
    placeholder: "e.g. 1.5"
  },
  {
    key: "sodium",
    label: "Sodium",
    type: "number",
    unit: "mEq/L",
    min: 100,
    max: 160,
    step: 1,
    placeholder: "e.g. 130"
  }
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampLab(value) {
  return value < 1 ? 1 : value;
}

// Initial MELD(i), rounded to the nearest integer per UNOS/OPTN.
export function meldInitial({ creatinine, bilirubin, inr, dialysisTwice, cvvhd24 }) {
  let cr = clampLab(creatinine);
  if (dialysisTwice === 1 || cvvhd24 === 1 || creatinine > 4) cr = 4;
  const bili = clampLab(bilirubin);
  const inrValue = clampLab(inr);
  const meldi = 10 * (0.957 * Math.log(cr) + 0.378 * Math.log(bili) + 1.12 * Math.log(inrValue) + 0.643);
  return Math.round(meldi);
}

// MELDNa per UNOS/OPTN 2016. Sodium bounded to 125-137; max score 40.
export function meldSodium(meldi, sodium) {
  const na = Math.min(137, Math.max(125, sodium));
  if (meldi <= 11) return meldi;
  const meldna = meldi + 1.32 * (137 - na) - 0.033 * meldi * (137 - na);
  return Math.min(MELDNA_MAX_SCORE, Math.round(meldna));
}

function meldMortalityBand(score) {
  if (score >= 40) return { band: "very-high", mortality: "71.3%" };
  if (score >= 30) return { band: "high", mortality: "52.6%" };
  if (score >= 20) return { band: "moderate", mortality: "19.6%" };
  if (score >= 10) return { band: "low", mortality: "6.0%" };
  return { band: "very-low", mortality: "1.9%" };
}

export function calculateMeldna(values = {}) {
  const missing = [];
  const dialysisTwice = finiteNumber(values.dialysisTwice);
  if (dialysisTwice === null) missing.push("Dialysis at least twice in the past week");
  const cvvhd24 = finiteNumber(values.cvvhd24);
  if (cvvhd24 === null) missing.push("Or Continuous veno-venous hemodialysis (CVVHD) for \u226524 hours in the past week");
  const creatinine = finiteNumber(values.creatinine);
  if (creatinine === null) missing.push("Creatinine");
  const bilirubin = finiteNumber(values.bilirubin);
  if (bilirubin === null) missing.push("Total bilirubin");
  const inr = finiteNumber(values.inr);
  if (inr === null) missing.push("INR");
  const sodium = finiteNumber(values.sodium);
  if (sodium === null) missing.push("Sodium");

  if (missing.length) {
    return { complete: false, missing, meldi: null, score: null, interpretation: null };
  }

  const meldi = meldInitial({ creatinine, bilirubin, inr, dialysisTwice, cvvhd24 });
  const score = meldSodium(meldi, sodium);
  const { band, mortality } = meldMortalityBand(score);
  return {
    complete: true,
    missing: [],
    meldi,
    score,
    interpretation: {
      band,
      headline: `${score} points`,
      detail: `MELD Score (2016). Estimated 3-month mortality: ${mortality}.`
    }
  };
}

export const meldnaDefinition = {
  verifiedOn: "2026-09-26",
  id: "meldna",
  title: "MELDNa Score",
  subtitle: "End-stage liver disease, 12 and older (UNOS/OPTN)",
  mdcalcId: "78",
  mdcalcUrl: "https://www.mdcalc.com/calc/78/meld-score-model-end-stage-liver-disease-12-older",
  reference: "Kamath PS et al. Hepatology. 2001;33(2):464-70; Kim WR et al. Hepatology. 2008;47(5):1642-8.",
  inputs: MELDNA_INPUTS,
  calculate: calculateMeldna
};
