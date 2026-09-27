/**
 * Perioperative in-hospital mortality (XGBoost, preoperative-only: XGB-INS-A).
 *
 * Vendored XGBoost model trained on the INSPIRE cohort (Seoul National
 * University Hospital, Korea, n=127,413, 1,387 in-hospital deaths) from
 * dspurkayastha/cross-continental-perioperative (MIT). The released
 * preoperative feature set is demographics/body habitus, ASA physical
 * status, and emergency status only - no comorbidity or laboratory
 * variables. Eight model features:
 *   age, sex, height_cm, weight_kg, bmi, asa, emergency, high_asa
 * The form collects six raw preoperative inputs; bmi is derived from
 * height/weight and high_asa from ASA (high_asa = 1 when ASA >= 3, the
 * high-ASA stratum used throughout the study's analyses).
 *
 * Sex coding: the study repository does not publish its training
 * preprocessing, so the coding cannot be read from the model release
 * itself. It follows the INSPIRE dataset authors' own convention for this
 * dataset: the raw INSPIRE `sex` field is 'M'/'F' and their published
 * perioperative-mortality XGBoost example encodes `sex = (sex == 'M')`,
 * i.e. male = 1, female = 0
 * (vitaldb/inspire gbm_mortality.py). The same numeric coding is required
 * for the MOVER external cohort to be scored by the released model.
 *
 * IMPORTANT - calibration: the study's headline finding is that
 * discrimination transfers across continents but calibration collapses;
 * the authors state raw probabilities require local (Platt) recalibration
 * and ship no portable recalibration coefficients. This calculator
 * therefore reports the RAW, UNCALIBRATED model output, not a reliable
 * calibrated mortality probability. verifiedOn stays null: the paper is
 * a preprint (under review at JAMIA), not peer-reviewed validation.
 *
 * Inference identity vs the shipped final_model.json was cross-checked
 * with native xgboost 3.1.2 (the training version): max absolute error
 * 6.6e-08 across 5 test vectors (see
 * ~/workspace/ai-model-tests/group-c.js). Note: xgboost 2.0.3 misreads
 * this model's bracketed base_score ("[2.2682887E-1]") and must not be
 * used as the reference.
 *
 * Pure module: no DOM, no storage, no network.
 */

import { predictXgboost } from "./xgboost.js";
import { PERIOP_XGBOOST_MODEL } from "./weights/periop-xgboost-model.js";

function finiteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const periopXgboostDefinition = {
  verifiedOn: null,
  id: "periop-xgboost",
  kind: "ai-model",
  title: "Perioperative Mortality (XGBoost, Preoperative)",
  subtitle:
    "In-hospital mortality after surgery from 6 preoperative inputs (XGB-INS-A, INSPIRE cohort). Raw model output — not calibrated.",
  reference:
    "Shome Purkayastha D. When external validation isn't enough: Simpson's paradox, direction asymmetry, and calibration collapse in cross-continental perioperative mortality prediction. medRxiv. 2025. doi:10.64898/2025.12.28.25343118. Under review at JAMIA.",
  paperUrl: "https://doi.org/10.64898/2025.12.28.25343118",
  codeUrl: "https://github.com/dspurkayastha/cross-continental-perioperative",
  validationNote:
    "Preprint — not yet peer-reviewed (under review at JAMIA). " +
    "The authors' central finding is that discrimination transfers across continents but calibration collapses: " +
    "raw probabilities require local recalibration and no portable recalibration coefficients are shipped with the model, " +
    "so the number below is a raw, uncalibrated model output, not a reliable mortality probability.",
  verifiedAgainst: null,
  inputs: [
    {
      key: "age",
      label: "Age",
      type: "number",
      min: 18,
      max: 90,
      unit: "years",
      placeholder: "e.g. 65",
      pull: { kind: "demographic", field: "ageYears" }
    },
    {
      key: "sex",
      label: "Sex",
      type: "radio",
      options: [
        { value: 0, label: "Female" },
        { value: 1, label: "Male" }
      ],
      hint: "Model coding: male = 1, female = 0 (INSPIRE dataset convention)."
    },
    {
      key: "heightCm",
      label: "Height",
      type: "number",
      min: 100,
      max: 230,
      unit: "cm",
      placeholder: "e.g. 170",
      pull: { kind: "vital", field: "height", preferUnit: "cm" }
    },
    {
      key: "weightKg",
      label: "Weight",
      type: "number",
      min: 25,
      max: 300,
      unit: "kg",
      placeholder: "e.g. 70",
      pull: { kind: "vital", field: "weight", preferUnit: "kg" }
    },
    {
      key: "asa",
      label: "ASA physical status",
      type: "radio",
      options: [
        { value: 1, label: "I" },
        { value: 2, label: "II" },
        { value: 3, label: "III" },
        { value: 4, label: "IV" },
        { value: 5, label: "V" },
        { value: 6, label: "VI" }
      ]
    },
    {
      key: "emergency",
      label: "Emergency surgery",
      type: "radio",
      options: [
        { value: 0, label: "No" },
        { value: 1, label: "Yes" }
      ]
    }
  ],
  calculate: calculatePeriopXgboost
};

/**
 * Score perioperative mortality with XGB-INS-A.
 * Returns the raw uncalibrated model probability plus derived inputs.
 */
function calculatePeriopXgboost(inputs) {
  // Age, sex, ASA, and emergency status are required. Height/weight are
  // optional: the model routes missing values natively and BMI is reported
  // as unavailable.
  const requiredKeys = ["age", "sex", "asa", "emergency"];
  const missing = periopXgboostDefinition.inputs
    .filter((field) => requiredKeys.includes(field.key))
    .filter((field) => {
      const v = inputs[field.key];
      return v === undefined || v === null || v === "";
    })
    .map((field) => field.label);

  if (missing.length > 0) {
    return {
      complete: false,
      missing,
      mortalityProbability: null,
      mortalityPercent: null,
      bmi: null,
      highAsa: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: "Answer: " + missing.join(", ") + "."
      }
    };
  }

  const age = finiteNumber(inputs.age);
  const sex = finiteNumber(inputs.sex);
  const heightCm = finiteNumber(inputs.heightCm);
  const weightKg = finiteNumber(inputs.weightKg);
  const asa = finiteNumber(inputs.asa);
  const emergency = finiteNumber(inputs.emergency);

  const rangeProblems = [];
  if (!(age >= 18 && age <= 90)) rangeProblems.push("Age must be between 18 and 90");
  if (!(sex === 0 || sex === 1)) rangeProblems.push("Sex must be female or male");
  if (heightCm !== null && !(heightCm > 0)) rangeProblems.push("Height must be positive");
  if (weightKg !== null && !(weightKg > 0)) rangeProblems.push("Weight must be positive");
  if (!(asa >= 1 && asa <= 6)) rangeProblems.push("ASA must be between 1 and 6");
  if (!(emergency === 0 || emergency === 1)) rangeProblems.push("Emergency must be yes or no");
  if (rangeProblems.length > 0) {
    return {
      complete: false,
      missing: [],
      mortalityProbability: null,
      mortalityPercent: null,
      bmi: null,
      highAsa: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: rangeProblems.join(". ") + "."
      }
    };
  }

  const bmi =
    heightCm !== null && weightKg !== null
      ? weightKg / Math.pow(heightCm / 100, 2)
      : null;
  const highAsa = asa >= 3 ? 1 : 0;

  const probability = predictXgboost(PERIOP_XGBOOST_MODEL, {
    age,
    sex,
    height_cm: heightCm,
    weight_kg: weightKg,
    bmi,
    asa,
    emergency,
    high_asa: highAsa
  });
  const mortalityPercent = probability * 100;

  return {
    complete: true,
    missing: [],
    mortalityProbability: probability,
    mortalityPercent,
    bmi,
    highAsa,
    interpretation: {
      band: "uncalibrated",
      headline:
        "Raw model output: " + mortalityPercent.toFixed(2) + "% — uncalibrated",
      detail:
        "XGB-INS-A raw output for age " + age + ", " +
        (sex === 1 ? "male" : "female") + ", " +
        (bmi === null ? "BMI unavailable (height/weight missing)" : "BMI " + bmi.toFixed(1)) +
        ", ASA " + asa + ", " + (emergency === 1 ? "emergency" : "elective") +
        ". This is NOT a calibrated mortality probability: the authors found " +
        "calibration collapses across populations and raw outputs require " +
        "local recalibration before any clinical use."
    }
  };
}

export { periopXgboostDefinition, calculatePeriopXgboost };
