// ASCVD 2013 Risk (Pooled Cohort Equations).
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "ASCVD (Atherosclerotic Cardiovascular Disease) 2013 Risk
// Calculator from AHA/ACC" (MDCalc calc 3398) one-to-one:
//   - the same inputs in MDCalc's order: age, sex, race, total cholesterol,
//     HDL cholesterol, systolic blood pressure, treatment for hypertension,
//     diabetes, smoking status
//   - the 2013 ACC/AHA Pooled Cohort Equations (Goff et al., Circulation
//     2014): four sex/race-specific equations with natural-log transforms
//     and interaction terms, risk = 1 - S0^exp(individual sum - mean)
//   - applies only to ages 40-75, for primary prevention (no known ASCVD)
//   - risk bands from the guideline thresholds: <5% low, 5-<7.5%
//     borderline, 7.5-<20% intermediate, >=20% high
//
// Verified 2026-10-01 against the published equation coefficients
// (rdrr.io/cran/PooledCohort PooledCohort R package, mirroring the
// Cerner ascvd-risk-calculator reference implementation) and a worked
// white-male example (55y, TC 213, HDL 50, SBP 140 untreated, non-smoker,
// no diabetes -> 10-year risk 7.0%, matching the equation's own arithmetic).
// MDCalc notes that as of 2026 the ACC/AHA dyslipidemia guidelines
// recommend PREVENT over this tool for primary prevention; this module
// implements the 2013 equations exactly as MDCalc's calculator does,
// including the race-based inputs the guideline equations require.
//
// Race handling: the equations were derived for non-Hispanic White and
// African American populations. Per the guideline, other races use the
// White equations; the "Other" option says so explicitly instead of
// silently substituting.

const MGDL_PER_MMOLL_CHOLESTEROL = 38.67;

// Coefficients per sex/race group. White women include the ln(age)^2 term
// (4.884) present in the published equations; no other group has it.
const GROUP_COEFFICIENTS = {
  "white-male": {
    lnAge: 12.344, lnAgeSq: 0,
    lnTotalChol: 11.853, lnAgeXlnTotalChol: -2.664,
    lnHdl: -7.99, lnAgeXlnHdl: 1.769,
    lnTreatedSbp: 1.797, lnAgeXlnTreatedSbp: 0,
    lnUntreatedSbp: 1.764, lnAgeXlnUntreatedSbp: 0,
    smoker: 7.837, lnAgeXSmoker: -1.795,
    diabetes: 0.658,
    mean: 61.1816, baselineSurvival: 0.91436
  },
  "black-male": {
    lnAge: 2.469, lnAgeSq: 0,
    lnTotalChol: 0.302, lnAgeXlnTotalChol: 0,
    lnHdl: -0.307, lnAgeXlnHdl: 0,
    lnTreatedSbp: 1.916, lnAgeXlnTreatedSbp: 0,
    lnUntreatedSbp: 1.809, lnAgeXlnUntreatedSbp: 0,
    smoker: 0.549, lnAgeXSmoker: 0,
    diabetes: 0.645,
    mean: 19.5425, baselineSurvival: 0.89536
  },
  "white-female": {
    lnAge: -29.799, lnAgeSq: 4.884,
    lnTotalChol: 13.54, lnAgeXlnTotalChol: -3.114,
    lnHdl: -13.578, lnAgeXlnHdl: 3.149,
    lnTreatedSbp: 2.019, lnAgeXlnTreatedSbp: 0,
    lnUntreatedSbp: 1.957, lnAgeXlnUntreatedSbp: 0,
    smoker: 7.574, lnAgeXSmoker: -1.665,
    diabetes: 0.661,
    mean: -29.1817, baselineSurvival: 0.96652
  },
  "black-female": {
    lnAge: 17.114, lnAgeSq: 0,
    lnTotalChol: 0.9396, lnAgeXlnTotalChol: 0,
    lnHdl: -18.9196, lnAgeXlnHdl: 4.4748,
    lnTreatedSbp: 29.2907, lnAgeXlnTreatedSbp: -6.4321,
    lnUntreatedSbp: 27.8197, lnAgeXlnUntreatedSbp: -6.0873,
    smoker: 0.6908, lnAgeXSmoker: 0,
    diabetes: 0.8738,
    mean: 86.6081, baselineSurvival: 0.95334
  }
};

const ASCVD_INPUTS = [
  {
    key: "ageYears",
    label: "Age",
    type: "number",
    unit: "years",
    min: 40,
    max: 75,
    step: 1,
    placeholder: "e.g. 58",
    pull: { kind: "demographic", field: "ageYears" }
  },
  {
    key: "sex",
    label: "Sex",
    type: "radio",
    options: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" }
    ],
    pull: { kind: "demographic", field: "sex" }
  },
  {
    key: "race",
    label: "Race",
    type: "radio",
    options: [
      { value: "white", label: "White" },
      { value: "black", label: "Black or African American" },
      { value: "other", label: "Other (uses the White equations, per the guideline)" }
    ]
  },
  {
    key: "totalCholesterol",
    label: "Total cholesterol",
    type: "numberWithUnit",
    units: ["mg/dL", "mmol/L"],
    toBase: { "mg/dL": 1, "mmol/L": MGDL_PER_MMOLL_CHOLESTEROL },
    baseUnit: "mg/dL",
    min: 100,
    max: 400,
    step: 1,
    placeholder: "e.g. 213",
    pull: { kind: "lab", match: [/total cholesterol/i] }
  },
  {
    key: "hdl",
    label: "HDL cholesterol",
    type: "numberWithUnit",
    units: ["mg/dL", "mmol/L"],
    toBase: { "mg/dL": 1, "mmol/L": MGDL_PER_MMOLL_CHOLESTEROL },
    baseUnit: "mg/dL",
    min: 20,
    max: 120,
    step: 1,
    placeholder: "e.g. 50",
    pull: { kind: "lab", match: [/\bhdl\b/i] }
  },
  {
    key: "systolicBp",
    label: "Systolic blood pressure",
    type: "number",
    unit: "mmHg",
    min: 70,
    max: 250,
    step: 1,
    placeholder: "e.g. 140",
    pull: { kind: "vital", match: [/systolic/i, /\bsbp\b/i] }
  },
  {
    key: "bpTreatment",
    label: "Treatment for hypertension",
    type: "radio",
    options: [
      { value: 1, label: "Yes" },
      { value: 0, label: "No" }
    ]
  },
  {
    key: "diabetes",
    label: "Diabetes",
    type: "radio",
    options: [
      { value: 1, label: "Yes" },
      { value: 0, label: "No" }
    ]
  },
  {
    key: "smoker",
    label: "Current smoker",
    type: "radio",
    options: [
      { value: 1, label: "Yes" },
      { value: 0, label: "No" }
    ]
  }
];

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toMgDlCholesterol(value, unit) {
  const factor = unit === "mmol/L" ? MGDL_PER_MMOLL_CHOLESTEROL : 1;
  return value * factor;
}

/**
 * 10-year hard-ASCVD risk via the 2013 Pooled Cohort Equations.
 * Returns the standard calculator result shape.
 */
function calculateAscvd(inputs) {
  const missing = ASCVD_INPUTS.filter((field) => {
    const value = inputs[field.key];
    return value === undefined || value === null || value === "";
  }).map((field) => field.label);

  if (missing.length > 0) {
    return {
      complete: false,
      missing,
      riskPercent: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: "Answer: " + missing.join(", ") + "."
      }
    };
  }

  const age = toNumber(inputs.ageYears);
  if (age === null || age < 40 || age > 75) {
    return {
      complete: false,
      missing: [],
      riskPercent: null,
      interpretation: {
        band: "incomplete",
        headline: "Outside the validated age range",
        detail:
          "The 2013 Pooled Cohort Equations apply only to ages 40-75. " +
          "MDCalc's calculator does not estimate risk outside this range."
      }
    };
  }

  const sex = inputs.sex === "female" ? "female" : "male";
  const race = inputs.race === "black" ? "black" : "white";
  const group = GROUP_COEFFICIENTS[`${race}-${sex}`];
  if (!group) {
    return {
      complete: false,
      missing: [],
      riskPercent: null,
      interpretation: { band: "incomplete", headline: "Incomplete", detail: "Select sex and race." }
    };
  }

  const totalChol = toNumber(inputs.totalCholesterol);
  const hdl = toNumber(inputs.hdl);
  const sbp = toNumber(inputs.systolicBp);
  if (totalChol === null || totalChol <= 0 || hdl === null || hdl <= 0 || sbp === null || sbp <= 0) {
    return {
      complete: false,
      missing: [],
      riskPercent: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: "Cholesterol values and systolic blood pressure must be positive numbers."
      }
    };
  }

  const totalCholMgDl = toMgDlCholesterol(totalChol, inputs.totalCholesterolUnit);
  const hdlMgDl = toMgDlCholesterol(hdl, inputs.hdlUnit);
  const treated = Number(inputs.bpTreatment) === 1;
  const hasDiabetes = Number(inputs.diabetes) === 1;
  const isSmoker = Number(inputs.smoker) === 1;

  const lnAge = Math.log(age);
  const lnTc = Math.log(totalCholMgDl);
  const lnHdl = Math.log(hdlMgDl);
  const lnSbp = Math.log(sbp);

  let sum =
    group.lnAge * lnAge +
    group.lnAgeSq * lnAge * lnAge +
    group.lnTotalChol * lnTc +
    group.lnAgeXlnTotalChol * lnAge * lnTc +
    group.lnHdl * lnHdl +
    group.lnAgeXlnHdl * lnAge * lnHdl;
  sum += treated
    ? group.lnTreatedSbp * lnSbp + group.lnAgeXlnTreatedSbp * lnAge * lnSbp
    : group.lnUntreatedSbp * lnSbp + group.lnAgeXlnUntreatedSbp * lnAge * lnSbp;
  if (isSmoker) sum += group.smoker + group.lnAgeXSmoker * lnAge;
  if (hasDiabetes) sum += group.diabetes;

  const risk = 1 - Math.pow(group.baselineSurvival, Math.exp(sum - group.mean));
  const riskPercent = Math.round(risk * 1000) / 10;

  let band;
  let guidance;
  if (riskPercent < 5) {
    band = "low";
    guidance = "Low risk (<5%). Emphasize lifestyle modification and reassess risk factors every 4-6 years.";
  } else if (riskPercent < 7.5) {
    band = "borderline";
    guidance =
      "Borderline risk (5% to <7.5%). Evaluate risk-enhancing factors and consider statin therapy if they are present; coronary artery calcium scoring can refine the decision.";
  } else if (riskPercent < 20) {
    band = "intermediate";
    guidance =
      "Intermediate risk (7.5% to <20%). After clinician-patient discussion, consider moderate-intensity statin therapy to reduce LDL-C by 30% or more.";
  } else {
    band = "high";
    guidance =
      "High risk (>=20%). Consider high-intensity statin therapy to reduce LDL-C by 50% or more, after clinician-patient discussion.";
  }

  const raceNote =
    inputs.race === "other"
      ? " Race recorded as Other: the guideline directs using the White equations, which is what this result uses."
      : "";

  return {
    complete: true,
    missing: [],
    riskPercent,
    group: `${race}-${sex}`,
    interpretation: {
      band,
      headline: `${riskPercent}% 10-year ASCVD risk`,
      detail:
        `Estimated 10-year risk of hard ASCVD (myocardial infarction, stroke, or coronary/stroke death): ${riskPercent}%. ` +
        guidance +
        raceNote
    }
  };
}

const ascvdDefinition = {
  verifiedOn: "2026-10-01",
  id: "ascvd",
  title: "ASCVD 2013 Risk (Pooled Cohort Equations)",
  mdcalcId: "3398",
  mdcalcUrl: "https://www.mdcalc.com/calc/3398/ascvd-atherosclerotic-cardiovascular-disease-2013-risk-calculator-aha-acc",
  subtitle: "10-year risk of hard ASCVD in primary prevention, ages 40-75.",
  reference:
    "Goff DC Jr et al. 2013 ACC/AHA Guideline on the Assessment of Cardiovascular Risk. Circulation. 2014;129(25 Suppl 2):S49-73.",
  inputs: ASCVD_INPUTS,
  calculate: calculateAscvd
};

export { ascvdDefinition, calculateAscvd, ASCVD_INPUTS };
