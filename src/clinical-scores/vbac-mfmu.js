// Vaginal Birth After Cesarean (VBAC) - MFMU / Grobman 2021 model.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Vaginal Birth After Cesarean (VBAC)" (MDCalc calc 10433)
// one-to-one: the same 6 inputs (age, pre-pregnancy weight, height, arrest
// disorder indication, obstetric history, treated chronic hypertension) run
// through the Grobman 2021 logistic regression model "without race and
// ethnicity" that MDCalc cites as its primary reference.
//
// Model (Grobman WA et al. Am J Obstet Gynecol. 2021;225(6):664.e1-664.e7):
//   predicted probability (%) = exp(w) / (1 + exp(w)) * 100, where
//   w = -5.952
//       - 0.023 * (maternal age, years)
//       - 0.024 * (pre-pregnancy weight, kg)
//       + 0.056 * (height, cm)
//       - 0.597 * (arrest indication for previous cesarean: 1/0)
//       + 0.868 * (previous vaginal delivery only before previous cesarean: 1/0)
//       + 1.869 * (previous VBAC: 1/0)
//       - 0.966 * (treated chronic hypertension: 1/0)

const INTERCEPT = -5.952;
const COEF_AGE = -0.023;
const COEF_WEIGHT_KG = -0.024;
const COEF_HEIGHT_CM = 0.056;
const COEF_ARREST = -0.597;
const COEF_VAGINAL_BEFORE = 0.868;
const COEF_PRIOR_VBAC = 1.869;
const COEF_TREATED_HTN = -0.966;

export const VBAC_MFMU_INPUTS = [
  {
    key: "ageYears",
    label: "Age, years",
    type: "number",
    unit: "years",
    min: 10,
    max: 60,
    step: 1,
    placeholder: "e.g. 32",
    pull: { kind: "demographic", field: "ageYears" }
  },
  {
    key: "prepregnancyWeight",
    label: "Pre-pregnancy weight",
    type: "numberWithUnit",
    units: ["kg", "lb"],
    defaultUnit: "kg",
    min: 30,
    max: 300,
    step: 0.1,
    placeholder: "e.g. 70",
    pull: { kind: "vital", match: [/weight/i], preferUnit: "kg" }
  },
  {
    key: "height",
    label: "Height",
    type: "numberWithUnit",
    units: ["cm", "in"],
    defaultUnit: "cm",
    min: 100,
    max: 220,
    step: 0.5,
    placeholder: "e.g. 165",
    pull: { kind: "vital", match: [/height/i], preferUnit: "cm" }
  },
  {
    key: "arrestDisorder",
    label: "Arrest disorder for previous cesarean delivery",
    type: "radio",
    hint: "Arrest of dilation or descent (includes cephalopelvic disproportion, failure to progress).",
    options: [
      { value: 1, label: "Yes" },
      { value: 0, label: "No" }
    ]
  },
  {
    key: "obstetricHistory",
    label: "Obstetric history",
    type: "radio",
    options: [
      { value: 0, label: "No previous vaginal history" },
      { value: 1, label: "Previous vaginal delivery only before previous cesarean delivery" },
      { value: 2, label: "Previous VBAC" }
    ]
  },
  {
    key: "treatedChronicHypertension",
    label: "Treated chronic hypertension",
    type: "radio",
    hint: "Medication-treated chronic hypertension.",
    options: [
      { value: 1, label: "Yes" },
      { value: 0, label: "No" }
    ]
  }
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function toKilograms(value, unit) {
  if (value === null || value === undefined) return null;
  const number = finiteNumber(value);
  if (number === null) return null;
  return unit === "lb" ? number * 0.45359237 : number;
}

export function toCentimeters(value, unit) {
  if (value === null || value === undefined) return null;
  const number = finiteNumber(value);
  if (number === null) return null;
  return unit === "in" ? number * 2.54 : number;
}

function linearPredictor({ ageYears, weightKg, heightCm, arrestDisorder, obstetricHistory, treatedChronicHypertension }) {
  return (
    INTERCEPT +
    COEF_AGE * ageYears +
    COEF_WEIGHT_KG * weightKg +
    COEF_HEIGHT_CM * heightCm +
    COEF_ARREST * arrestDisorder +
    COEF_VAGINAL_BEFORE * (obstetricHistory === 1 ? 1 : 0) +
    COEF_PRIOR_VBAC * (obstetricHistory === 2 ? 1 : 0) +
    COEF_TREATED_HTN * treatedChronicHypertension
  );
}

export function vbacProbabilityPercent(linearW) {
  const probability = Math.exp(linearW) / (1 + Math.exp(linearW));
  return Math.round(probability * 1000) / 10;
}

// MDCalc displays the result with one decimal place and a space before the
// percent sign, e.g. "85.6 %" (verified against the live calculator 2026-09-26).
export function formatMfmuPercent(probabilityPercent) {
  return `${Number(probabilityPercent).toFixed(1)} %`;
}

export function calculateVbacMfmu(values = {}) {
  const missing = [];
  const ageYears = finiteNumber(values.ageYears);
  if (ageYears === null) missing.push("Age");
  const weightKg = toKilograms(values.prepregnancyWeight, values.prepregnancyWeightUnit);
  if (weightKg === null) missing.push("Pre-pregnancy weight");
  const heightCm = toCentimeters(values.height, values.heightUnit);
  if (heightCm === null) missing.push("Height");
  const arrestDisorder = finiteNumber(values.arrestDisorder);
  if (arrestDisorder === null) missing.push("Arrest disorder for previous cesarean delivery");
  const obstetricHistory = finiteNumber(values.obstetricHistory);
  if (obstetricHistory === null) missing.push("Obstetric history");
  const treatedChronicHypertension = finiteNumber(values.treatedChronicHypertension);
  if (treatedChronicHypertension === null) missing.push("Treated chronic hypertension");

  if (missing.length) {
    return { complete: false, missing, probabilityPercent: null, interpretation: null };
  }
  const w = linearPredictor({ ageYears, weightKg, heightCm, arrestDisorder, obstetricHistory, treatedChronicHypertension });
  const probabilityPercent = vbacProbabilityPercent(w);
  return {
    complete: true,
    missing: [],
    probabilityPercent,
    interpretation: {
      band: probabilityPercent >= 60 ? "higher" : "lower",
      headline: formatMfmuPercent(probabilityPercent),
      detail: "Chance of successful vaginal birth after cesarean delivery. Grobman 2021 model without race/ethnicity (AUC 0.75). Use to inform shared decision-making about trial of labor after cesarean."
    }
  };
}

export const vbacMfmuDefinition = {
  verifiedOn: "2026-09-26",
  id: "vbac-mfmu",
  title: "VBAC Calculator (MFMU)",
  subtitle: "Grobman 2021 model, without race/ethnicity",
  mdcalcId: "10433",
  mdcalcUrl: "https://www.mdcalc.com/calc/10433/vaginal-birth-after-cesarean-vbac",
  reference: "Grobman WA, Sandoval G, Rice MM, et al. Prediction of vaginal birth after cesarean delivery in term gestations: a calculator without race and ethnicity. Am J Obstet Gynecol. 2021;225(6):664.e1-664.e7.",
  inputs: VBAC_MFMU_INPUTS,
  calculate: calculateVbacMfmu
};
