// Fractional Excretion of Sodium (FENa).
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Fractional Excretion of Sodium (FENa)" (MDCalc calc 60;
// the older calc number 43 now serves Cockcroft-Gault and is stale for
// FENa) one-to-one:
//   - the same 4 inputs in MDCalc's order: serum sodium, serum creatinine,
//     urine sodium, urine creatinine
//   - FENa (%) = 100 x (urine Na x serum creatinine)
//     / (serum Na x urine creatinine)
//   - units cancel, so any consistent unit set works; sodium in mEq/L
//     (or mmol/L) and creatinine in mg/dL are accepted
//   - MDCalc cautions: do not use in patients taking diuretics (use FEUrea
//     instead), or with known CKD, urinary tract obstruction, or acute
//     glomerular disease; FENa <1% cannot differentiate hepatorenal
//     syndrome from other causes of renal disease
//   - result: the percentage to one decimal, then the band word
//     ("Prerenal" / "Indeterminate" / "Intrinsic") with MDCalc's explanation
//   - bands from MDCalc's Evidence table: prerenal FENa <1% (UNa <20),
//     indeterminate 1-2% (UNa 20-40), intrinsic >2% (UNa >40)
//
// Live-verified 2026-09-26 against MDCalc (2 controlled cases, synthetic
// inputs, no login): both matched, including exact result wording. The
// prerenal and indeterminate sentences are verbatim; the intrinsic sentence
// follows the same pattern (not one of the observed cases).
// Primary reference: Espinel CH. Clin Nephrol. 1976;6(2):340-5.

export const FENA_INPUTS = [
  {
    key: "serumSodium",
    label: "Serum sodium",
    type: "numberWithUnit",
    units: ["mEq/L", "mmol/L"],
    toBase: { "mEq/L": 1, "mmol/L": 1 },
    baseUnit: "mEq/L",
    min: 100,
    max: 180,
    step: 1,
    placeholder: "e.g. 140"
  },
  {
    key: "serumCreatinine",
    label: "Serum creatinine",
    type: "number",
    unit: "mg/dL",
    min: 0.1,
    step: 0.1,
    placeholder: "e.g. 1.0"
  },
  {
    key: "urineSodium",
    label: "Urine sodium",
    type: "number",
    unit: "mEq/L",
    min: 1,
    step: 1,
    placeholder: "e.g. 10"
  },
  {
    key: "urineCreatinine",
    label: "Urine creatinine",
    type: "number",
    unit: "mg/dL",
    min: 1,
    step: 1,
    placeholder: "e.g. 80"
  }
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function fenaPercent({ serumSodium, serumCreatinine, urineSodium, urineCreatinine }) {
  return (100 * urineSodium * serumCreatinine) / (serumSodium * urineCreatinine);
}

function fenaBand(percent) {
  const value = percent.toFixed(1);
  if (percent < 1) {
    return {
      band: "low",
      headline: `${value}%`,
      detail: "Prerenal. e.g., Hypovolemia, heart failure, renal artery stenosis, sepsis (anything causing decreased effective renal perfusion). Remember, contrast-induced nephropathy will often look pre-renal."
    };
  }
  if (percent <= 2) {
    return {
      band: "indeterminate",
      headline: `${value}%`,
      detail: "Indeterminate. Can be seen with either prerenal or intrinsic states."
    };
  }
  return {
    band: "high",
    headline: `${value}%`,
    detail: "Intrinsic. Suggests intrinsic renal disease (e.g., acute tubular necrosis)."
  };
}

export function calculateFena(values = {}) {
  const missing = [];
  const serumSodium = finiteNumber(values.serumSodium);
  if (serumSodium === null || serumSodium <= 0) missing.push("Serum sodium");
  const serumCreatinine = finiteNumber(values.serumCreatinine);
  if (serumCreatinine === null || serumCreatinine <= 0) missing.push("Serum creatinine");
  const urineSodium = finiteNumber(values.urineSodium);
  if (urineSodium === null || urineSodium <= 0) missing.push("Urine sodium");
  const urineCreatinine = finiteNumber(values.urineCreatinine);
  if (urineCreatinine === null || urineCreatinine <= 0) missing.push("Urine creatinine");

  if (missing.length) {
    return { complete: false, missing, percent: null, interpretation: null };
  }

  const percent = fenaPercent({ serumSodium, serumCreatinine, urineSodium, urineCreatinine });
  const interpretation = fenaBand(percent);
  return {
    complete: true,
    missing: [],
    percent: Math.round(percent * 10) / 10,
    interpretation
  };
}

export const fenaDefinition = {
  verifiedOn: "2026-09-26",
  id: "fena",
  title: "Fractional Excretion of Sodium (FENa)",
  subtitle: "Prerenal vs intrinsic renal failure",
  mdcalcId: "60",
  mdcalcUrl: "https://www.mdcalc.com/calc/60/fractional-excretion-sodium-fena",
  reference: "Espinel CH. Clin Nephrol. 1976;6(2):340-5.",
  inputs: FENA_INPUTS,
  calculate: calculateFena
};
