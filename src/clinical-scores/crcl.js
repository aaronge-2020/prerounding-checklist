// Creatinine Clearance (Cockcroft-Gault Equation).
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Creatinine Clearance (Cockcroft-Gault Equation)" (MDCalc
// calc 43; the older calc number 34 is stale) one-to-one:
//   - the same inputs in MDCalc's order: sex, age, weight, creatinine,
//     height (optional)
//   - base equation: CrCl (mL/min) = (140 - age) x weight (kg) x (0.85 if
//     female) / (72 x serum creatinine in mg/dL)
//   - ideal body weight (Devine): male 50 + 2.3 x (height in inches - 60);
//     female 45.5 + 2.3 x (height in inches - 60)
//   - adjusted body weight: IBW + 0.4 x (actual body weight - IBW)
//   - weight selection when height is given (per MDCalc's published
//     "Evidence to Action" review, citing Brown et al and Winter et al):
//       BMI < 18.5            -> actual body weight
//       BMI 18.5 - 24.9       -> ideal body weight (range uses actual)
//       BMI >= 25             -> adjusted body weight (range uses ideal)
//     without height, the calculation uses actual body weight
//   - the result shows all three MDCalc outputs: the weight-modified
//     estimate, the original Cockcroft-Gault with actual body weight, and
//     the IBW/adjusted (or IBW/actual) range with MDCalc's "Controversy
//     exists over which form of weight to use" note
//   - headline estimates are whole mL/min; the range keeps one decimal
//   - use only with stable renal function
//
// Live-verified 2026-09-26 against MDCalc (2 controlled cases, synthetic
// inputs, no login): both matched, including the three-output layout, the
// per-weight-class captions ("modified for overweight patient, using
// adjusted body weight of 78 kg (172 lbs)" / "for normal weight patient,
// using ideal body weight of 75 kg (165 lbs)"), and the range notes. MDCalc
// shows no numeric BMI in the results.
// Primary references: Cockcroft DW, Gault MH. Nephron. 1976;16(1):31-41;
// Winter MA et al. Pharmacotherapy. 2012;32(7):604-612.

export const CRCL_INPUTS = [
  {
    key: "sex",
    label: "Sex",
    type: "radio",
    options: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" }
    ]
  },
  {
    key: "ageYears",
    label: "Age",
    type: "number",
    unit: "years",
    min: 18,
    max: 120,
    step: 1,
    placeholder: "e.g. 65",
    pull: { kind: "demographic", field: "ageYears" }
  },
  {
    key: "weight",
    label: "Weight",
    type: "numberWithUnit",
    units: ["kg", "lb"],
    toBase: { kg: 1, lb: 1 / 2.20462 },
    baseUnit: "kg",
    min: 20,
    step: 0.1,
    placeholder: "e.g. 80",
    pull: { kind: "vital", field: "weight", preferUnit: "kg" }
  },
  {
    key: "creatinine",
    label: "Creatinine",
    type: "numberWithUnit",
    units: ["mg/dL", "\u03bcmol/L"],
    toBase: { "mg/dL": 1, "\u03bcmol/L": 1 / 88.4 },
    baseUnit: "mg/dL",
    min: 0.1,
    step: 0.1,
    placeholder: "e.g. 1.0"
  },
  {
    key: "height",
    label: "Height",
    type: "numberWithUnit",
    units: ["cm", "in"],
    toBase: { cm: 1, in: 2.54 },
    baseUnit: "cm",
    min: 100,
    step: 0.5,
    placeholder: "Optional \u2014 needed for BMI-adjusted estimate",
    pull: { kind: "vital", field: "height", preferUnit: "cm" }
  }
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function idealBodyWeightKg(sex, heightCm) {
  const inches = heightCm / 2.54;
  return (sex === "female" ? 45.5 : 50) + 2.3 * (inches - 60);
}

export function adjustedBodyWeightKg(idealKg, actualKg) {
  return idealKg + 0.4 * (actualKg - idealKg);
}

export function crclValue({ ageYears, weightKg, creatinineMgDl, female }) {
  let crcl = ((140 - ageYears) * weightKg) / (72 * creatinineMgDl);
  if (female) crcl *= 0.85;
  return crcl;
}

// Picks the weight MDCalc's calculator uses and any alternate estimate
// shown as a range, per the BMI-based rule MDCalc publishes.
export function selectWeightKg({ sex, actualKg, heightCm }) {
  if (heightCm === null) {
    return { weightKg: actualKg, method: "actual", bmi: null, rangeKg: null };
  }
  const bmi = actualKg / Math.pow(heightCm / 100, 2);
  const ibw = idealBodyWeightKg(sex, heightCm);
  if (bmi < 18.5) {
    return { weightKg: actualKg, method: "actual", bmi, rangeKg: null };
  }
  if (bmi < 25) {
    return { weightKg: ibw, method: "ideal", bmi, rangeKg: actualKg };
  }
  const abw = adjustedBodyWeightKg(ibw, actualKg);
  return { weightKg: abw, method: "adjusted", bmi, rangeKg: ibw };
}

const WEIGHT_METHOD_LABEL = {
  actual: "actual body weight",
  ideal: "ideal body weight",
  adjusted: "adjusted body weight"
};

function kgLbs(kg) {
  return `${Math.round(kg)} kg (${Math.round(kg * 2.20462)} lbs)`;
}

// MDCalc's caption for the weight-modified estimate, per weight class.
function modifiedCaption(method, weightKg) {
  if (method === "adjusted") {
    return `Creatinine clearance modified for overweight patient, using adjusted body weight of ${kgLbs(weightKg)}.`;
  }
  if (method === "ideal") {
    return `Creatinine clearance for normal weight patient, using ideal body weight of ${kgLbs(weightKg)}.`;
  }
  return null;
}

function rangeNote(method) {
  const uses = method === "adjusted" ? "IBW and adjusted body weight" : "IBW and actual body weight";
  return `Note: This range uses ${uses}. Controversy exists over which form of weight to use.`;
}

export function calculateCrcl(values = {}) {
  const missing = [];
  const sex = values.sex === "male" || values.sex === "female" ? values.sex : null;
  if (sex === null) missing.push("Sex");
  const ageYears = finiteNumber(values.ageYears);
  if (ageYears === null) missing.push("Age");
  const weightValue = finiteNumber(values.weight);
  if (weightValue === null) missing.push("Weight");
  const creatinineValue = finiteNumber(values.creatinine);
  if (creatinineValue === null || creatinineValue <= 0) missing.push("Creatinine");

  const heightRaw = values.height;
  const heightValue = heightRaw === undefined || heightRaw === null || heightRaw === "" ? null : finiteNumber(heightRaw);

  if (missing.length) {
    return { complete: false, missing, crcl: null, weightUsedKg: null, weightMethod: null, bmi: null, range: null, interpretation: null };
  }

  const weightKg = weightValue * (values.weightUnit === "lb" ? 1 / 2.20462 : 1);
  const creatinineMgDl = creatinineValue * (values.creatinineUnit === "\u03bcmol/L" ? 1 / 88.4 : 1);
  const heightCm = heightValue === null ? null : heightValue * (values.heightUnit === "in" ? 2.54 : 1);

  const { weightKg: selectedKg, method, bmi, rangeKg } = selectWeightKg({ sex, actualKg: weightKg, heightCm });
  const crcl = crclValue({ ageYears, weightKg: selectedKg, creatinineMgDl, female: sex === "female" });
  const rounded = Math.round(crcl * 10) / 10;

  let range = null;
  if (rangeKg !== null) {
    const alt = crclValue({ ageYears, weightKg: rangeKg, creatinineMgDl, female: sex === "female" });
    range = {
      low: Math.round(Math.min(rounded, alt) * 10) / 10,
      high: Math.round(Math.max(rounded, alt) * 10) / 10
    };
  }

  const methodLabel = WEIGHT_METHOD_LABEL[method];
  const original = crclValue({ ageYears, weightKg, creatinineMgDl, female: sex === "female" });
  const detailLines = [];
  const modified = modifiedCaption(method, selectedKg);
  if (modified) {
    detailLines.push(modified);
    detailLines.push(`Creatinine clearance, original Cockcroft-Gault: ${Math.round(original)} mL/min.`);
  } else if (heightCm === null) {
    detailLines.push(`Creatinine clearance, original Cockcroft-Gault: ${Math.round(original)} mL/min (no height provided, so ${methodLabel} was used).`);
  } else {
    detailLines.push(`Creatinine clearance, original Cockcroft-Gault: ${Math.round(original)} mL/min (${methodLabel}).`);
  }
  if (range) {
    detailLines.push(`Range: ${range.low.toFixed(1)}-${range.high.toFixed(1)} mL/min. ${rangeNote(method)}`);
  }
  detailLines.push("Use only with stable renal function.");

  return {
    complete: true,
    missing: [],
    crcl: rounded,
    weightUsedKg: Math.round(selectedKg * 10) / 10,
    weightMethod: method,
    bmi: bmi === null ? null : Math.round(bmi * 10) / 10,
    range,
    interpretation: {
      band: "estimate",
      headline: `${Math.round(crcl)} mL/min`,
      detail: detailLines.join(" ")
    }
  };
}

export const crclDefinition = {
  verifiedOn: "2026-09-26",
  id: "crcl",
  title: "Creatinine Clearance (Cockcroft-Gault)",
  subtitle: "Drug dosing estimate; stable renal function only",
  mdcalcId: "43",
  mdcalcUrl: "https://www.mdcalc.com/calc/43",
  reference: "Cockcroft DW, Gault MH. Nephron. 1976;16(1):31-41.",
  inputs: CRCL_INPUTS,
  calculate: calculateCrcl
};
