// Calcium Correction for Hypoalbuminemia.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Calcium Correction for Hypoalbuminemia and Hyperalbuminemia"
// (MDCalc calc 31) one-to-one:
//   - formula: corrected calcium = serum calcium
//     + 0.8 x (normal albumin - patient albumin), in mg/dL and g/dL
//     (Payne formula; normal albumin defaults to 4 g/dL)
//   - MDCalc input labels (observed live 2026-09-26): "Calcium",
//     "Albumin", "Normal albumin: 4 g/dL or 40 g/L".
//   - MDCalc result display (observed live 2026-09-26): one decimal place
//     ("9.2 mg/dL", not "9.20") plus the SI equivalent
//     ("Equivalent to 2.3 mmol/L"; mg/dL ÷ 4.008).
//     No explicit normal range is shown in the result.
//   - MDCalc advice (verified against the live calculator 2026-09-26):
//     "If calcium is confirmed to be outside of normal range, consider a
//      diagnostic evaluation to determine the etiology."
//     and: "Consider measuring ionized calcium to confirm conclusions drawn
//      after correcting for serum calcium."
// Reference: Payne RB, Little AJ, Williams RB, Milner JR. Interpretation of
// serum calcium in patients with abnormal serum proteins.
// Br Med J. 1973;4(5893):643-6.
//
// NOTE: the supplied MDCalc calc id 33 is remapped and now serves the
// PSI/PORT calculator; the live calcium-correction calculator is calc 31
// (verified 2026-09-26). Result display verified live 2026-09-26.

export const CORRECTED_CALCIUM_DEFAULT_NORMAL_ALBUMIN = 4.0;
export const CORRECTED_CALCIUM_NORMAL_LOW = 8.5;
export const CORRECTED_CALCIUM_NORMAL_HIGH = 10.5;
// Calcium atomic weight 40.08: 1 mmol/L = 4.008 mg/dL.
export const CORRECTED_CALCIUM_MGDL_PER_MMOL = 4.008;

export const CORRECTED_CALCIUM_INPUTS = [
  {
    key: "calcium",
    label: "Calcium",
    type: "number",
    unit: "mg/dL",
    min: 0,
    max: 25,
    step: 0.1,
    placeholder: "e.g. 8.2"
  },
  {
    key: "albumin",
    label: "Albumin",
    type: "number",
    unit: "g/dL",
    min: 0,
    max: 10,
    step: 0.1,
    placeholder: "e.g. 2.8"
  },
  {
    key: "normalAlbumin",
    label: "Normal albumin: 4 g/dL or 40 g/L",
    type: "number",
    unit: "g/dL",
    min: 0,
    max: 10,
    step: 0.1,
    placeholder: "4.0",
    required: false,
    hint: "Defaults to 4.0 g/dL when left blank."
  }
];

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function scoreCorrectedCalcium(values = {}) {
  const missing = [];
  const calcium = toFiniteNumber(values.calcium);
  const albumin = toFiniteNumber(values.albumin);
  if (calcium === null) missing.push("Calcium");
  if (albumin === null) missing.push("Albumin");

  // Normal albumin is optional and defaults to 4.0 g/dL when blank.
  const rawNormal = values.normalAlbumin;
  const normalAlbumin = rawNormal === undefined || rawNormal === null || rawNormal === ""
    ? CORRECTED_CALCIUM_DEFAULT_NORMAL_ALBUMIN
    : toFiniteNumber(rawNormal);
  if (normalAlbumin === null) missing.push("Normal albumin: 4 g/dL or 40 g/L");

  if (missing.length > 0) {
    return { complete: false, missing, result: null };
  }

  // MDCalc displays one decimal place.
  const corrected = Math.round((calcium + 0.8 * (normalAlbumin - albumin)) * 10) / 10;
  return {
    complete: true,
    missing,
    result: { correctedCalcium: corrected, calcium, albumin, normalAlbumin }
  };
}

export function interpretCorrectedCalcium(result) {
  const formatted = result.correctedCalcium.toFixed(1);
  const mmol = (result.correctedCalcium / CORRECTED_CALCIUM_MGDL_PER_MMOL).toFixed(1);
  let band = "normal";
  if (result.correctedCalcium < CORRECTED_CALCIUM_NORMAL_LOW) band = "low";
  else if (result.correctedCalcium > CORRECTED_CALCIUM_NORMAL_HIGH) band = "high";
  return {
    band,
    // MDCalc headline is the value with one decimal; the detail carries the
    // SI equivalent and the verified MDCalc advice sentence.
    headline: `${formatted} mg/dL`,
    detail: `Equivalent to ${mmol} mmol/L. If calcium is confirmed to be outside of normal range, consider a diagnostic evaluation to determine the etiology.`
  };
}

export function calculateCorrectedCalcium(values = {}) {
  const { complete, missing, result } = scoreCorrectedCalcium(values);
  return {
    complete,
    missing,
    result,
    interpretation: complete ? interpretCorrectedCalcium(result) : null
  };
}

export const correctedCalciumDefinition = {
  verifiedOn: "2026-09-26",
  id: "corrected-calcium",
  title: "Calcium Correction for Hypoalbuminemia",
  subtitle: "Corrected serum calcium",
  mdcalcId: "31",
  mdcalcUrl: "https://www.mdcalc.com/calc/31/calcium-correction-hypoalbuminemia",
  reference: "Payne RB, Little AJ, Williams RB, Milner JR. Interpretation of serum calcium in patients with abnormal serum proteins. Br Med J. 1973;4(5893):643-6.",
  inputs: CORRECTED_CALCIUM_INPUTS,
  calculate: calculateCorrectedCalcium
};
