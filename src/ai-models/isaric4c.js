/**
 * ISARIC 4C Mortality Score for COVID-19.
 *
 * Predicts in-hospital mortality for adults admitted to hospital with
 * COVID-19, from 8 admission variables: age, sex at birth, number of
 * comorbidities, respiratory rate, SpO2 on room air, Glasgow Coma Scale,
 * urea, and CRP. Integer score 0-21 maps to a per-score mortality lookup
 * and to four published risk bands.
 *
 * Point table and per-score mortality lookup transcribed from the official
 * open-source 4C calculator JS bundle (jamesscottbrown.github.io):
 *   age: 18-49: 0, 50-59: 2, 60-69: 4, 70-79: 6, >=80: 7
 *   sex at birth: female 0, male 1
 *   comorbidities: 0: 0, 1: 1, >=2: 2
 *   respiratory rate: <20: 0, 20-29: 1, >=30: 2
 *   SpO2 on room air: <92: 2, >=92: 0
 *   GCS: <15: 2, 15: 0
 *   urea: <7 mmol/L: 0, 7-14: 1, >14: 3
 *   CRP: <50 mg/L: 0, 50-99: 1, >=100: 2
 * Urea and CRP also accept the calculator's alternate units (BUN mg/dL,
 * CRP mg/dL); the official calculator's unit-native cutoffs are applied
 * directly (BUN <19.6 / 19.6-39.2 / >39.2; CRP <5 / 5-9.9 / >=10).
 *
 * Risk bands (published BMJ 2020 cutoffs): low 0-3 (1.2%), intermediate
 * 4-8 (9.9%), high 9-14 (31.4%), very high 15-21 (61.5%).
 *
 * Patient bindings: numeric age (demographic ageYears), respiratory rate
 * and SpO2 (vital pulls). Sex, comorbidity count, GCS, urea, and CRP have
 * no supported pull descriptors and stay manual.
 */

function finiteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Per-score in-hospital mortality (%), copied from the official calculator's
// lookup array (index = score, 0-21).
const MORTALITY_BY_SCORE = [
  0, 0.297619, 0.806452, 2.311248, 4.805195, 7.474227, 7.783784,
  11.695376, 14.448669, 19.164619, 22.899946, 26.915616, 32.907931,
  40.131889, 44.574944, 51.639344, 59.103139, 66.122449, 75.809935,
  77.391304, 82.882883, 87.5
];

// Published risk bands: [min, max, group label, observed band mortality %].
const RISK_BANDS = [
  [0, 3, "Low", 1.2],
  [4, 8, "Intermediate", 9.9],
  [9, 14, "High", 31.4],
  [15, 21, "Very high", 61.5]
];

function agePoints(age) {
  if (age < 50) return 0;
  if (age < 60) return 2;
  if (age < 70) return 4;
  if (age < 80) return 6;
  return 7;
}

function respiratoryRatePoints(rr) {
  if (rr < 20) return 0;
  if (rr < 30) return 1;
  return 2;
}

function spo2Points(spo2) {
  return spo2 < 92 ? 2 : 0;
}

function gcsPoints(gcs) {
  return gcs < 15 ? 2 : 0;
}

function ureaPoints(ureaValue, unit) {
  // Unit-native cutoffs, exactly as the official calculator's scores /
  // altScores objects: avoids float drift at the converted boundaries
  // (e.g. 39.2 mg/dL / 2.8 = 14.000000000000002 in IEEE-754).
  if (unit === "mg/dL") {
    if (ureaValue < 19.6) return 0;
    if (ureaValue <= 39.2) return 1;
    return 3;
  }
  if (ureaValue < 7) return 0;
  if (ureaValue <= 14) return 1;
  return 3;
}

function crpPoints(crpValue, unit) {
  if (unit === "mg/dL") {
    if (crpValue < 5) return 0;
    if (crpValue < 10) return 1;
    return 2;
  }
  if (crpValue < 50) return 0;
  if (crpValue < 100) return 1;
  return 2;
}

const isaric4cDefinition = {
  verifiedOn: "2026-09-27",
  id: "isaric4c",
  kind: "ai-model",
  title: "ISARIC 4C Mortality Score",
  subtitle: "In-hospital mortality in adults admitted with COVID-19 (8 admission variables).",
  reference:
    "Knight SR et al. Risk stratification of patients admitted to hospital with covid-19 using the ISARIC WHO Clinical Characterisation Protocol: development and validation of the 4C Mortality Score. BMJ. 2020;370:m3339.",
  paperUrl: "https://doi.org/10.1136/bmj.m3339",
  codeUrl: "https://jamesscottbrown.github.io/4c-mortality-calculator/",
  validationNote:
    "Point table and per-score mortality lookup transcribed from the official open-source 4C calculator's JS bundle and cross-checked against the published BMJ 2020 point table; risk bands match the published cutoffs (0-3/4-8/9-14/15-21 with 1.2%/9.9%/31.4%/61.5% observed mortality).",
  verifiedAgainst:
    "official 4C JS calculator (jamesscottbrown.github.io/4c-mortality-calculator) + published BMJ 2020 point table",
  calculate: calculateIsaric4c,
  inputs: [
    {
      key: "age",
      label: "Age",
      type: "number",
      min: 18,
      max: 120,
      unit: "years",
      placeholder: "e.g. 65",
      pull: { kind: "demographic", field: "ageYears" }
    },
    {
      key: "sex",
      label: "Sex at birth",
      type: "radio",
      options: [
        { value: 0, label: "Female" },
        { value: 1, label: "Male" }
      ]
    },
    {
      key: "comorbidities",
      label: "Number of comorbidities",
      hint: "Count: chronic cardiac disease; chronic respiratory disease (excluding asthma); chronic renal disease (eGFR <=30); mild-to-severe liver disease; dementia; chronic neurological conditions; connective tissue disease; diabetes mellitus; HIV/AIDS; malignancy; obesity.",
      type: "number",
      min: 0,
      max: 12,
      step: 1,
      placeholder: "e.g. 2"
    },
    {
      key: "respiratoryRate",
      label: "Respiratory rate",
      type: "number",
      min: 5,
      max: 80,
      unit: "breaths/min",
      placeholder: "e.g. 22",
      pull: { kind: "vital", match: [/respiratory/i, /\brr\b/i] }
    },
    {
      key: "spo2",
      label: "SpO2 (on room air)",
      type: "number",
      min: 50,
      max: 100,
      unit: "%",
      placeholder: "e.g. 94",
      pull: { kind: "vital", match: [/spo2/i, /oxygen saturation/i] }
    },
    {
      key: "gcs",
      label: "Glasgow Coma Scale",
      type: "number",
      min: 3,
      max: 15,
      step: 1,
      unit: "points",
      placeholder: "e.g. 15"
    },
    {
      key: "urea",
      label: "Urea",
      type: "numberWithUnit",
      units: ["mmol/L", "mg/dL"],
      defaultUnit: "mmol/L",
      min: 0,
      step: 0.1,
      placeholder: "e.g. 8"
    },
    {
      key: "crp",
      label: "CRP",
      type: "numberWithUnit",
      units: ["mg/L", "mg/dL"],
      defaultUnit: "mg/L",
      min: 0,
      step: 0.1,
      placeholder: "e.g. 60"
    }
  ]
};

/**
 * Score ISARIC 4C. Returns the integer score, the per-score mortality
 * lookup value, and the published risk band.
 */
function calculateIsaric4c(inputs) {
  const missing = isaric4cDefinition.inputs
    .filter((field) => inputs[field.key] === undefined || inputs[field.key] === null || inputs[field.key] === "")
    .map((field) => field.label);

  if (missing.length > 0) {
    return {
      complete: false,
      missing,
      score: null,
      mortalityPercent: null,
      riskGroup: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: "Answer: " + missing.join(", ") + "."
      }
    };
  }

  const age = finiteNumber(inputs.age);
  const sex = finiteNumber(inputs.sex);
  const comorbidities = finiteNumber(inputs.comorbidities);
  const respiratoryRate = finiteNumber(inputs.respiratoryRate);
  const spo2 = finiteNumber(inputs.spo2);
  const gcs = finiteNumber(inputs.gcs);
  const ureaValue = finiteNumber(inputs.urea);
  const crpValue = finiteNumber(inputs.crp);

  const ureaUnit = inputs.ureaUnit === "mg/dL" ? "mg/dL" : "mmol/L";
  const crpUnit = inputs.crpUnit === "mg/dL" ? "mg/dL" : "mg/L";

  const componentPoints = {
    age: agePoints(age),
    sex: sex === 1 ? 1 : 0,
    comorbidities: comorbidities >= 2 ? 2 : comorbidities === 1 ? 1 : 0,
    respiratoryRate: respiratoryRatePoints(respiratoryRate),
    spo2: spo2Points(spo2),
    gcs: gcsPoints(gcs),
    urea: ureaPoints(ureaValue, ureaUnit),
    crp: crpPoints(crpValue, crpUnit)
  };
  const score = Object.values(componentPoints).reduce((sum, p) => sum + p, 0);
  const mortalityPercent = MORTALITY_BY_SCORE[score];
  const band = RISK_BANDS.find(([min, max]) => score >= min && score <= max);
  const riskGroup = band[2];
  const riskGroupMortality = band[3];

  const interpretationBand = score <= 3 ? "low" : score <= 8 ? "moderate" : "high";

  return {
    complete: true,
    missing: [],
    score,
    componentPoints,
    mortalityPercent,
    riskGroup,
    riskGroupMortalityPercent: riskGroupMortality,
    interpretation: {
      band: interpretationBand,
      headline: score + " points — " + riskGroup + " risk",
      detail:
        "In-hospital mortality was " +
        mortalityPercent.toFixed(1) +
        "% for a score of " +
        score +
        " in the ISARIC cohort (" +
        riskGroup.toLowerCase() +
        " risk group, " +
        riskGroupMortality +
        "% observed mortality)."
    }
  };
}

export { isaric4cDefinition, calculateIsaric4c };
