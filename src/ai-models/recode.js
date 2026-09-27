/**
 * RECODe - Risk Equations for Complications Of type 2 Diabetes
 * (Basu et al., Lancet Diabetes & Endocrinology 2017; validated Diabetes Care 2018).
 *
 * Pure client-side port of the R/Shiny calculator equations at
 * https://github.com/sanjaybasu-waymark/diabetes-risk-equations (app.R).
 *
 * Each outcome is a Cox-type equation: risk = 100 * (1 - S0^exp(lp)),
 * where lp is the linear predictor and S0 the baseline 10-year survival.
 * Coefficients are transcribed verbatim from the repo's Shiny app.R.
 * (appSI.R carries identical coefficients with SI unit conversions, which
 * are honored here via numberWithUnit inputs using the repo's own factors:
 * cholesterol mmol/L -> mg/dL x 183.2/4.7, creatinine umol/L -> mg/dL
 * x 0.9/78.6, urine ACR mg/mmol -> mg/g x 99.2/11.3; HbA1c stays in %.)
 *
 * Outcomes implemented (exactly the six the repo's calculator covers):
 *   nephropathy (renal failure / ESRD), retinopathy (severe vision loss),
 *   neuropathy (pressure sensation loss), mi (MI or stroke, fatal or
 *   nonfatal), chf (heart failure, NYHA III-IV or EF <25%), mortality
 *   (all-cause). The repo does NOT ship separate MI, stroke, or ASCVD
 *   equations in its calculator (ASCVD was a development endpoint label);
 *   the "MI or stroke" equation is offered as the combined outcome.
 *
 * Display note: the Shiny app rounds the displayed percent to a whole
 * number; this module returns the full-precision percent (headline shows
 * one decimal).
 *
 * LICENSE: CC BY-NC-SA 4.0 - non-commercial use only.
 *
 * Verified 2026-09-27 by cross-checking against an independent Python
 * re-implementation of the repo's app.R equations (Rscript is not
 * available in this environment); JS matches Python to <1e-6 percentage
 * points across all six outcomes.
 *
 * No DOM, no storage, no network. Coefficients are baked in as constants.
 */

// Outcome equations: baseline 10-year survival, linear-predictor terms as
// [coefficient, variable] pairs, and the constant term.
const OUTCOMES = {
  nephropathy: {
    label: "nephropathy",
    description: "Renal failure / end-stage renal disease.",
    s0: 0.973,
    intercept: -0.2269629,
    terms: [
      [-0.0193838993, "age"],
      [-0.0112943865, "sex"],
      [-0.0881241594, "black"],
      [0.2337712368, "hispanic"],
      [0.0030271330, "sbp"],
      [-0.0795168593, "bpTreatment"],
      [0.1483078052, "currentSmoker"],
      [-0.0216363649, "priorMiOrStroke"],
      [-0.1255530728, "oralDiabetesMeds"],
      [0.8608801402, "creatinine"],
      [-0.0011121510, "totalCholesterol"],
      [0.0062888253, "hdl"],
      [0.0319895697, "anticoagulant"],
      [0.1369126389, "hba1c"],
      [0.0003615507, "uacr"]
    ]
  },
  retinopathy: {
    label: "retinopathy",
    description: "Severe vision loss (<20/200).",
    s0: 0.921,
    intercept: -4.563441,
    terms: [
      [0.0228504061, "age"],
      [0.2264337097, "sex"],
      [-0.1676573729, "black"],
      [0.0082431088, "sbp"],
      [0.0639339678, "bpTreatment"],
      [0.1127372373, "priorMiOrStroke"],
      [-0.2348989478, "oralDiabetesMeds"],
      [0.6946500975, "creatinine"],
      [-0.0001676169, "totalCholesterol"],
      [0.0054470159, "hdl"],
      [0.1449446673, "hba1c"],
      [0.0001991881, "uacr"]
    ]
  },
  neuropathy: {
    label: "neuropathy",
    description: "Pressure sensation loss.",
    s0: 0.87,
    intercept: -4.746261,
    terms: [
      [3.022e-02, "age"],
      [-1.868e-01, "sex"],
      [-9.448e-02, "black"],
      [4.561e-03, "sbp"],
      [1.819e-01, "bpTreatment"],
      [2.667e-01, "priorMiOrStroke"],
      [-2.575e-01, "oralDiabetesMeds"],
      [6.044e-01, "creatinine"],
      [2.185e-03, "totalCholesterol"],
      [-5.389e-03, "hdl"],
      [1.887e-01, "hba1c"]
    ]
  },
  mi: {
    label: "MI or stroke",
    description: "Fatal or nonfatal myocardial infarction or stroke.",
    s0: 0.85,
    intercept: -3.65,
    terms: [
      [0.034210, "age"],
      [-0.167200, "sex"],
      [-0.118700, "black"],
      [0.151000, "currentSmoker"],
      [0.000074, "sbp"],
      [0.055790, "bpTreatment"],
      [0.778400, "priorMiOrStroke"],
      [-0.033610, "statin"],
      [0.252400, "anticoagulant"],
      [0.435500, "creatinine"],
      [0.001929, "totalCholesterol"],
      [-0.008370, "hdl"],
      [0.171600, "hba1c"],
      [0.000333, "uacr"]
    ]
  },
  chf: {
    label: "heart failure",
    description: "Symptomatic heart failure, NYHA Class III or IV, or ejection fraction <25%.",
    s0: 0.96,
    intercept: -5.15,
    terms: [
      [5.268e-02, "age"],
      [2.529e-01, "sex"],
      [-4.969e-02, "black"],
      [2.905e-01, "currentSmoker"],
      [1.217e-03, "sbp"],
      [6.389e-01, "bpTreatment"],
      [1.007e00, "priorMiOrStroke"],
      [-1.175e-01, "statin"],
      [7.365e-01, "anticoagulant"],
      [4.142e-04, "uacr"],
      [8.214e-01, "creatinine"],
      [-1.358e-03, "totalCholesterol"],
      [-1.758e-02, "hdl"],
      [2.092e-01, "hba1c"]
    ]
  },
  mortality: {
    label: "mortality",
    description: "Death from any cause.",
    s0: 0.93,
    intercept: -4.66,
    terms: [
      [6.703e-02, "age"],
      [-1.529e-01, "sex"],
      [-2.393e-02, "black"],
      [5.399e-01, "currentSmoker"],
      [-2.988e-03, "sbp"],
      [8.766e-02, "bpTreatment"],
      [5.888e-01, "priorMiOrStroke"],
      [-2.681e-01, "statin"],
      [4.036e-01, "anticoagulant"],
      [3.889e-04, "uacr"],
      [3.597e-01, "creatinine"],
      [-9.478e-04, "totalCholesterol"],
      [-4.378e-03, "hdl"],
      [1.659e-01, "hba1c"]
    ]
  }
};

function yesNoOptions(key, text, hint) {
  const input = {
    key,
    label: text,
    type: "radio",
    options: [
      { value: 1, label: "Yes" },
      { value: 0, label: "No" }
    ]
  };
  if (hint) input.hint = hint;
  return input;
}

const recodeDefinition = {
  verifiedOn: "2026-09-27",
  id: "recode",
  kind: "ai-model",
  title: "RECODe Diabetes Complication Risk",
  subtitle: "10-year complication risk in type 2 diabetes (six outcomes).",
  reference: "Basu S, Sussman JB, Berkowitz SA, Hayward RA, Yudkin JS. Development and validation of Risk Equations for Complications Of type 2 Diabetes (RECODe) using individual participant data from randomised trials. Lancet Diabetes Endocrinol. 2017;5(10):788-98. Validation: Basu S et al. Diabetes Care. 2018;41(3):586-95. Calculator code: https://github.com/sanjaybasu-waymark/diabetes-risk-equations (CC BY-NC-SA 4.0).",
  paperUrl: "https://doi.org/10.1016/S2213-8587(17)30221-8",
  codeUrl: "https://github.com/sanjaybasu-waymark/diabetes-risk-equations",
  validationNote: "Derived from ACCORD randomised-trial individual-participant data; validated in DPPOS (microvascular) and Look AHEAD (macrovascular) cohorts, and in the MESA and JHS US cohorts (Diabetes Care 2018). This module ports the repo's calculator equations and matches an independent Python re-implementation to <1e-6 percentage points.",
  verifiedAgainst: "independent Python re-implementation of the repo's Shiny app.R equations (Rscript unavailable in this environment), cross-checked JS vs Python to <1e-6 percentage points on vectors covering all six outcomes",
  licenseNote: "CC BY-NC-SA 4.0 \u2014 non-commercial use only. Attribution: Basu et al., Lancet Diabetes & Endocrinology 2017.",
  calculate: calculateRecode,
  inputs: [
    {
      key: "outcome",
      label: "Outcome",
      type: "select",
      options: [
        { value: "nephropathy", label: "Nephropathy (renal failure / ESRD)" },
        { value: "retinopathy", label: "Retinopathy (severe vision loss)" },
        { value: "neuropathy", label: "Neuropathy (pressure sensation loss)" },
        { value: "mi", label: "MI or stroke (fatal or nonfatal)" },
        { value: "chf", label: "Heart failure (NYHA III-IV / EF <25%)" },
        { value: "mortality", label: "Mortality (any cause)" }
      ]
    },
    {
      key: "age",
      label: "Age",
      type: "number",
      min: 18,
      max: 120,
      unit: "years",
      pull: { kind: "demographic", field: "ageYears" }
    },
    {
      key: "sex",
      label: "Sex",
      type: "radio",
      options: [
        { value: 0, label: "Male" },
        { value: 1, label: "Female" }
      ]
    },
    yesNoOptions("black", "Black?"),
    yesNoOptions("hispanic", "Hispanic?"),
    {
      key: "totalCholesterol",
      label: "Total cholesterol",
      type: "numberWithUnit",
      units: ["mg/dL", "mmol/L"],
      toBase: { "mg/dL": 1, "mmol/L": 183.2 / 4.7 },
      baseUnit: "mg/dL",
      min: 50,
      max: 500,
      step: 1
    },
    {
      key: "hdl",
      label: "HDL cholesterol",
      type: "numberWithUnit",
      units: ["mg/dL", "mmol/L"],
      toBase: { "mg/dL": 1, "mmol/L": 183.2 / 4.7 },
      baseUnit: "mg/dL",
      min: 10,
      max: 200,
      step: 1
    },
    yesNoOptions("statin", "On statin?"),
    {
      key: "hba1c",
      label: "Hemoglobin A1c",
      type: "number",
      min: 3,
      max: 20,
      step: 0.1,
      unit: "%"
    },
    yesNoOptions("oralDiabetesMeds", "On oral diabetes medication?"),
    {
      key: "creatinine",
      label: "Serum creatinine",
      type: "numberWithUnit",
      units: ["mg/dL", "\u00b5mol/L"],
      toBase: { "mg/dL": 1, "\u00b5mol/L": 0.9 / 78.6 },
      baseUnit: "mg/dL",
      min: 0.2,
      max: 15,
      step: 0.1
    },
    {
      key: "uacr",
      label: "Urine albumin/creatinine ratio",
      type: "numberWithUnit",
      units: ["mg/g", "mg/mmol"],
      toBase: { "mg/g": 1, "mg/mmol": 99.2 / 11.3 },
      baseUnit: "mg/g",
      min: 0,
      max: 10000,
      step: 1
    },
    {
      key: "sbp",
      label: "Systolic BP",
      type: "number",
      min: 40,
      max: 300,
      unit: "mmHg",
      pull: { kind: "vital", match: [/systolic/i] }
    },
    yesNoOptions("bpTreatment", "On blood pressure treatment?"),
    yesNoOptions("priorMiOrStroke", "Prior myocardial infarction or stroke?"),
    yesNoOptions("anticoagulant", "On anticoagulant?", "Other than aspirin."),
    yesNoOptions("currentSmoker", "Currently smoking tobacco?")
  ]
};

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

/** Convert a numberWithUnit input to its base unit. */
function toBase(inputs, inputDef) {
  const unit = inputs[inputDef.key + "Unit"] || inputDef.units[0];
  const factor = inputDef.toBase[unit];
  return Number(inputs[inputDef.key]) * factor;
}

/**
 * Evaluate the RECODe equation for the selected outcome.
 */
function calculateRecode(inputs) {
  const missing = recodeDefinition.inputs
    .filter((field) => isMissing(inputs[field.key]))
    .map((field) => field.label);

  if (missing.length > 0) {
    return {
      complete: false,
      missing,
      outcome: inputs.outcome || null,
      riskPercent: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: "Answer: " + missing.join(", ") + "."
      }
    };
  }

  const eq = OUTCOMES[inputs.outcome];
  if (!eq) {
    return {
      complete: false,
      missing: [],
      outcome: null,
      riskPercent: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: "Select an outcome: " + Object.keys(OUTCOMES).join(", ") + "."
      }
    };
  }

  const byKey = {};
  for (const field of recodeDefinition.inputs) {
    byKey[field.key] = field;
  }
  const vars = {
    age: Number(inputs.age),
    sex: Number(inputs.sex),
    black: Number(inputs.black),
    hispanic: Number(inputs.hispanic),
    sbp: Number(inputs.sbp),
    bpTreatment: Number(inputs.bpTreatment),
    currentSmoker: Number(inputs.currentSmoker),
    priorMiOrStroke: Number(inputs.priorMiOrStroke),
    oralDiabetesMeds: Number(inputs.oralDiabetesMeds),
    creatinine: toBase(inputs, byKey.creatinine),
    totalCholesterol: toBase(inputs, byKey.totalCholesterol),
    hdl: toBase(inputs, byKey.hdl),
    anticoagulant: Number(inputs.anticoagulant),
    hba1c: Number(inputs.hba1c),
    uacr: toBase(inputs, byKey.uacr),
    statin: Number(inputs.statin)
  };

  let lp = eq.intercept;
  for (const [coef, name] of eq.terms) {
    lp += coef * vars[name];
  }
  const riskPercent = 100 * (1 - Math.pow(eq.s0, Math.exp(lp)));

  const band = riskPercent >= 10 ? "high" : riskPercent >= 5 ? "moderate" : "low";

  return {
    complete: true,
    missing: [],
    outcome: inputs.outcome,
    riskPercent,
    interpretation: {
      band,
      headline: "10-year " + eq.label + " risk: " + riskPercent.toFixed(1) + "%",
      detail:
        eq.description +
        " Risk band: " +
        band +
        " (<5% low, 5-10% moderate, \u226510% high)."
    }
  };
}

export { recodeDefinition, calculateRecode, OUTCOMES };
