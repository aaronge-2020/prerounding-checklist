/**
 * GRACE ACS Risk Score (original nomogram) — NOT MDCalc's current calculator.
 *
 * Estimates mortality risk in acute coronary syndrome (ACS) from 8 clinical
 * variables, and supports timing of invasive strategy (score >140 suggests
 * consideration of an early invasive strategy).
 *
 * IMPORTANT — MDCalc parity limitation, do not remove:
 * This module implements the ORIGINAL published GRACE nomogram
 * (Granger et al., Arch Intern Med 2003; Fox et al., BMJ 2006), whose point
 * tables are public and exact. MDCalc's live calculator was updated to
 * GRACE 2.0 (Fox et al., BMJ Open 2014), a non-linear model whose exact
 * coefficients are not publicly published, so its point totals and
 * mortality percentages cannot be reproduced here. Verified live on
 * 2026-09-26: MDCalc (GRACE 2.0) shows different point totals and only a
 * 6-month death probability (e.g. 154 points / 23% where this nomogram
 * gives 197 points). The result below is the verifiable original-nomogram
 * score with the published low/intermediate/high risk categories, clearly
 * labeled as the original so it is never mistaken for MDCalc's output.
 * verifiedOn stays null: one-to-one parity is not claimed.
 *
 * Point tables (published GRACE nomogram):
 * - Age (years): <30: 0; 30-39: 8; 40-49: 25; 50-59: 41; 60-69: 58;
 *   70-79: 75; 80-89: 91; >=90: 100
 * - Heart rate (bpm): <50: 0; 50-69: 3; 70-89: 9; 90-109: 15;
 *   110-149: 24; 150-199: 38; >=200: 46
 * - Systolic BP (mmHg): <80: 58; 80-99: 53; 100-119: 43; 120-139: 34;
 *   140-159: 28; 160-199: 17; >=200: 0
 * - Creatinine (mg/dL): <0.40: 1; 0.40-0.79: 4; 0.80-1.19: 7;
 *   1.20-1.59: 10; 1.60-1.99: 13; 2.00-3.99: 21; >=4.00: 28
 * - Killip class: I: 0; II: 20; III: 39; IV: 59
 * - Cardiac arrest at admission: yes: 39
 * - ST-segment deviation: yes: 28
 * - Elevated cardiac enzymes/markers: yes: 14
 *
 * Risk categories (published GRACE cutoffs):
 * - In-hospital mortality: <=108 low (<1%); 109-140 intermediate (1-3%);
 *   >140 high (>3%)
 * - 6-month mortality: <=88 low (<3%); 89-118 intermediate (3-8%);
 *   >118 high (>8%)
 *
 * Patient bindings: only supported, conservative pulls are bound — numeric
 * age (demographic ageYears), heart rate (vital "heart rate"), and systolic
 * BP (vital "systolic"). Creatinine, Killip class, cardiac arrest, ST
 * deviation, and troponin have no supported pull descriptors and stay manual.
 */

const graceDefinition = {
  verifiedOn: null, // intentionally null: MDCalc runs GRACE 2.0; one-to-one parity is not claimed
  id: "grace",
  title: "GRACE ACS Risk Score (Original)",
  mdcalcId: "1099",
  mdcalcUrl: "https://www.mdcalc.com/calc/1099/grace-acs-risk-mortality-calculator",
  subtitle:
    "Mortality risk in confirmed ACS — original 2003 nomogram. MDCalc now uses GRACE 2.0 (different point scale); values will not match MDCalc.",
  reference: "Granger CB et al. Predictors of hospital mortality in the global registry of acute coronary events. Arch Intern Med. 2003;163(19):2345-53. Fox KAA et al. Prediction of risk of death and myocardial infarction in the six months after presentation with acute coronary syndrome. BMJ. 2006;333(7575):1091.",
  calculate: calculateGrace,
  inputs: [
    { key: "age", label: "Age", type: "number", min: 18, max: 120, unit: "years",
      pull: { kind: "demographic", field: "ageYears" } },
    { key: "heartRate", label: "Heart rate", type: "number", min: 20, max: 300, unit: "bpm",
      pull: { kind: "vital", match: [/heart rate/i] } },
    { key: "sbp", label: "Systolic BP", type: "number", min: 40, max: 300, unit: "mmHg",
      pull: { kind: "vital", match: [/systolic/i] } },
    {
      key: "creatinine",
      label: "Creatinine",
      hint: "Enter mg/dL (or µmol/L ÷ 88.4).",
      type: "number",
      min: 0,
      max: 30,
      unit: "mg/dL"
    },
    {
      key: "killipClass",
      label: "Killip class",
      type: "radio",
      options: [
        { value: 0, label: "I" },
        { value: 20, label: "II" },
        { value: 39, label: "III" },
        { value: 59, label: "IV" }
      ]
    },
    {
      key: "cardiacArrest",
      label: "Cardiac arrest at admission",
      type: "radio",
      options: [
        { value: 39, label: "Yes" },
        { value: 0, label: "No" }
      ]
    },
    {
      key: "stDeviation",
      label: "ST-segment deviation",
      type: "radio",
      options: [
        { value: 28, label: "Yes" },
        { value: 0, label: "No" }
      ]
    },
    {
      key: "elevatedMarkers",
      label: "Elevated cardiac enzymes/markers",
      type: "radio",
      options: [
        { value: 14, label: "Yes" },
        { value: 0, label: "No" }
      ]
    }
  ]
};

function agePoints(age) {
  if (age < 30) return 0;
  if (age < 40) return 8;
  if (age < 50) return 25;
  if (age < 60) return 41;
  if (age < 70) return 58;
  if (age < 80) return 75;
  if (age < 90) return 91;
  return 100;
}

function heartRatePoints(heartRate) {
  if (heartRate < 50) return 0;
  if (heartRate < 70) return 3;
  if (heartRate < 90) return 9;
  if (heartRate < 110) return 15;
  if (heartRate < 150) return 24;
  if (heartRate < 200) return 38;
  return 46;
}

function sbpPoints(sbp) {
  if (sbp < 80) return 58;
  if (sbp < 100) return 53;
  if (sbp < 120) return 43;
  if (sbp < 140) return 34;
  if (sbp < 160) return 28;
  if (sbp < 200) return 17;
  return 0;
}

function creatininePoints(creatinineMgDl) {
  if (creatinineMgDl < 0.4) return 1;
  if (creatinineMgDl < 0.8) return 4;
  if (creatinineMgDl < 1.2) return 7;
  if (creatinineMgDl < 1.6) return 10;
  if (creatinineMgDl < 2.0) return 13;
  if (creatinineMgDl < 4.0) return 21;
  return 28;
}

function inHospitalRisk(score) {
  if (score <= 108) return { group: "low", mortality: "<1%" };
  if (score <= 140) return { group: "intermediate", mortality: "1–3%" };
  return { group: "high", mortality: ">3%" };
}

function sixMonthRisk(score) {
  if (score <= 88) return { group: "low", mortality: "<3%" };
  if (score <= 118) return { group: "intermediate", mortality: "3–8%" };
  return { group: "high", mortality: ">8%" };
}

/**
 * Score GRACE ACS (original nomogram). Radio options already carry their
 * point values; numeric inputs are mapped through the published tables.
 */
function calculateGrace(inputs) {
  const missing = graceDefinition.inputs
    .filter((field) => inputs[field.key] === undefined || inputs[field.key] === null || inputs[field.key] === "")
    .map((field) => field.label);

  if (missing.length > 0) {
    return {
      complete: false,
      missing,
      score: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: "Answer: " + missing.join(", ") + "."
      }
    };
  }

  const age = Number(inputs.age);
  const heartRate = Number(inputs.heartRate);
  const sbp = Number(inputs.sbp);
  const creatinine = Number(inputs.creatinine);

  const score =
    agePoints(age) +
    heartRatePoints(heartRate) +
    sbpPoints(sbp) +
    creatininePoints(creatinine) +
    Number(inputs.killipClass) +
    Number(inputs.cardiacArrest) +
    Number(inputs.stDeviation) +
    Number(inputs.elevatedMarkers);

  const inHospital = inHospitalRisk(score);
  const sixMonth = sixMonthRisk(score);
  const band = inHospital.group === "high" ? "high" : inHospital.group === "intermediate" ? "moderate" : "low";

  let detail =
    "In-hospital mortality: " +
    inHospital.group +
    " (" +
    inHospital.mortality +
    "). Six-month mortality: " +
    sixMonth.group +
    " (" +
    sixMonth.mortality +
    ").";
  if (score > 140) {
    detail += " A GRACE score >140 suggests consideration of an early invasive strategy.";
  }

  return {
    complete: true,
    missing: [],
    score,
    inHospitalMortality: inHospital.mortality,
    sixMonthMortality: sixMonth.mortality,
    interpretation: {
      band,
      headline: score + " points",
      detail
    }
  };
}

const gracePointTables = { agePoints, heartRatePoints, sbpPoints, creatininePoints };

export {
  graceDefinition,
  calculateGrace,
  gracePointTables
};
