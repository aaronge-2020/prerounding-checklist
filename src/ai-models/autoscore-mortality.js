/**
 * AutoScore 9-variable inpatient mortality point score (Xie et al.).
 *
 * AutoScore is an interpretable ML framework that derives point-based
 * clinical scores automatically. The published case study built a
 * nine-variable score for inpatient mortality on MIMIC-III/BIDMC EHR data:
 * age, heart rate, respiratory rate, systolic blood pressure, temperature,
 * SpO2, platelet count, BUN, and lactate. Each variable's interval maps to
 * integer points; the sum (0-162) stratifies risk.
 *
 * Interval convention is the paper's: "q1-q2" means q1 <= x < q2.
 * Point table transcribed from Table 4 of the paper (full table in the
 * header comment):
 *   Age (y): <30: 0, 30-48: 5, 48-78: 14, 78-85: 22, >=85: 24
 *   Heart rate (bpm): <62: 1, 62-72: 0, 72-98: 1, 98-112: 8, >=112: 13
 *   Respiratory rate (/min): <12: 3, 12-16: 0, 16-22: 4, >=22: 12
 *   SBP (mmHg): <90: 15, 90-100: 8, 100-130: 0, 130-150: 1, >=150: 3
 *   Temperature (C): <36: 12, 36-36.5: 3, 36.5-37.5: 0, 37.5-38: 5, >=38: 9
 *   SpO2 (%): <85: 25, 85-90: 13, 90-95: 4, >=95: 0
 *   Platelet (K/uL): <80: 17, 80-150: 3, 150-300: 0, 300-450: 3, >=450: 5
 *   BUN (mg/dL): <7.5: 0, 7.5-12: 2, 12-35: 9, 35-70: 19, >=70: 23
 *   Lactate (mmol/L): <1: 0, 1-2.5: 2, 2.5-4: 8, >=4: 21
 *
 * The paper publishes no per-score probability lookup; risk wording follows
 * the reported observed mortality on the test set: about 10% at a score of
 * 50, and over 50% for scores above 90 (Figure 4b). Test-set AUC 0.780
 * (95% CI 0.764-0.798).
 *
 * Patient bindings: numeric age (demographic ageYears) plus vital pulls for
 * heart rate, respiratory rate, systolic BP, temperature, and SpO2. Platelet,
 * BUN, and lactate are labs with no supported pull kind and stay manual.
 */

function finiteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Each entry: [exclusive upper bound of the interval, points].
// Implements the paper's "q1-q2 means q1 <= x < q2" convention.
const POINT_TABLES = {
  age: [[30, 0], [48, 5], [78, 14], [85, 22], [Infinity, 24]],
  heartRate: [[62, 1], [72, 0], [98, 1], [112, 8], [Infinity, 13]],
  respiratoryRate: [[12, 3], [16, 0], [22, 4], [Infinity, 12]],
  sbp: [[90, 15], [100, 8], [130, 0], [150, 1], [Infinity, 3]],
  temperature: [[36, 12], [36.5, 3], [37.5, 0], [38, 5], [Infinity, 9]],
  spo2: [[85, 25], [90, 13], [95, 4], [Infinity, 0]],
  platelet: [[80, 17], [150, 3], [300, 0], [450, 3], [Infinity, 5]],
  bun: [[7.5, 0], [12, 2], [35, 9], [70, 19], [Infinity, 23]],
  lactate: [[1, 0], [2.5, 2], [4, 8], [Infinity, 21]]
};

const AUTOSCORE_MAX_SCORE = 162;

function intervalPoints(value, bands) {
  for (const [upperExclusive, points] of bands) {
    if (value < upperExclusive) return points;
  }
  return 0; // unreachable: last band is Infinity
}

const autoscoreMortalityDefinition = {
  verifiedOn: "2026-09-27",
  id: "autoscore-mortality",
  kind: "ai-model",
  title: "AutoScore Inpatient Mortality (9-variable)",
  subtitle: "ML-derived point score for inpatient mortality (MIMIC-III/BIDMC).",
  reference:
    "Xie F et al. AutoScore: A Machine Learning-Based Automatic Clinical Score Generator and Its Application to Mortality Prediction Using Electronic Health Records. JMIR Med Inform. 2020;8(10):e21798.",
  paperUrl: "https://doi.org/10.2196/21798",
  codeUrl: "https://github.com/nliulab/AutoScore",
  validationNote:
    "Per-interval point table transcribed from the paper's Table 4 (interval convention q1 <= x < q2) and verified against the paper's stated score range 0-162. The paper publishes no per-score probability lookup, so risk wording follows the reported observed test-set mortality: about 10% at a score of 50, over 50% for scores above 90; test-set AUC 0.780 (95% CI 0.764-0.798).",
  verifiedAgainst:
    "published point table and risk mapping, Xie et al., JMIR Med Inform 2020",
  calculate: calculateAutoscoreMortality,
  inputs: [
    {
      key: "age",
      label: "Age",
      hint: "Points: <30: 0, 30-48: 5, 48-78: 14, 78-85: 22, >=85: 24.",
      type: "number",
      min: 18,
      max: 120,
      unit: "years",
      placeholder: "e.g. 60",
      pull: { kind: "demographic", field: "ageYears" }
    },
    {
      key: "heartRate",
      label: "Heart rate",
      hint: "Points: <62: 1, 62-72: 0, 72-98: 1, 98-112: 8, >=112: 13.",
      type: "number",
      min: 20,
      max: 300,
      unit: "bpm",
      placeholder: "e.g. 88",
      pull: { kind: "vital", match: [/heart rate/i] }
    },
    {
      key: "respiratoryRate",
      label: "Respiratory rate",
      hint: "Points: <12: 3, 12-16: 0, 16-22: 4, >=22: 12.",
      type: "number",
      min: 5,
      max: 80,
      unit: "breaths/min",
      placeholder: "e.g. 18",
      pull: { kind: "vital", match: [/respiratory/i, /\brr\b/i] }
    },
    {
      key: "sbp",
      label: "Systolic BP",
      hint: "Points: <90: 15, 90-100: 8, 100-130: 0, 130-150: 1, >=150: 3.",
      type: "number",
      min: 40,
      max: 300,
      unit: "mmHg",
      placeholder: "e.g. 120",
      pull: { kind: "vital", match: [/systolic/i] }
    },
    {
      key: "temperature",
      label: "Temperature",
      hint: "Enter in °C (paper uses °C; °F converts as (°F-32) x 5/9). Points: <36: 12, 36-36.5: 3, 36.5-37.5: 0, 37.5-38: 5, >=38: 9.",
      type: "number",
      min: 30,
      max: 45,
      step: 0.1,
      unit: "°C",
      placeholder: "e.g. 37.0",
      pull: { kind: "vital", match: [/temperature/i], preferUnit: "°C" }
    },
    {
      key: "spo2",
      label: "SpO2",
      hint: "Points: <85: 25, 85-90: 13, 90-95: 4, >=95: 0.",
      type: "number",
      min: 50,
      max: 100,
      unit: "%",
      placeholder: "e.g. 97",
      pull: { kind: "vital", match: [/spo2/i, /oxygen saturation/i] }
    },
    {
      key: "platelet",
      label: "Platelet count",
      hint: "Manual entry (no pull). Points: <80: 17, 80-150: 3, 150-300: 0, 300-450: 3, >=450: 5.",
      type: "number",
      min: 0,
      max: 2000,
      unit: "×10³/µL",
      placeholder: "e.g. 220"
    },
    {
      key: "bun",
      label: "BUN",
      hint: "Manual entry (no pull). Points: <7.5: 0, 7.5-12: 2, 12-35: 9, 35-70: 19, >=70: 23.",
      type: "number",
      min: 0,
      max: 300,
      unit: "mg/dL",
      placeholder: "e.g. 18"
    },
    {
      key: "lactate",
      label: "Lactate",
      hint: "Manual entry (no pull). Points: <1: 0, 1-2.5: 2, 2.5-4: 8, >=4: 21.",
      type: "number",
      min: 0,
      max: 30,
      step: 0.1,
      unit: "mmol/L",
      placeholder: "e.g. 1.8"
    }
  ]
};

/**
 * Sum the nine interval point values. Risk wording follows the paper's
 * reported observed mortality anchors (about 10% at score 50; over 50%
 * for scores above 90) since no per-score lookup is published.
 */
function calculateAutoscoreMortality(inputs) {
  const missing = autoscoreMortalityDefinition.inputs
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

  const values = {};
  for (const key of Object.keys(POINT_TABLES)) {
    values[key] = finiteNumber(inputs[key]);
  }

  const componentPoints = {};
  for (const [key, bands] of Object.entries(POINT_TABLES)) {
    componentPoints[key] = intervalPoints(values[key], bands);
  }
  const score = Object.values(componentPoints).reduce((sum, p) => sum + p, 0);

  let band;
  let riskWording;
  if (score > 90) {
    band = "high";
    riskWording =
      "Observed inpatient mortality exceeded 50% for scores above 90 in the paper's test cohort (MIMIC-III/BIDMC).";
  } else if (score >= 50) {
    band = "moderate";
    riskWording =
      "Observed inpatient mortality was about 10% at a score of 50 and rose steeply with higher scores in the paper's test cohort (MIMIC-III/BIDMC).";
  } else {
    band = "low";
    riskWording =
      "Below the paper's ~10% observed-mortality level (reported at a score of 50) in the test cohort (MIMIC-III/BIDMC).";
  }

  return {
    complete: true,
    missing: [],
    score,
    maxScore: AUTOSCORE_MAX_SCORE,
    componentPoints,
    interpretation: {
      band,
      headline: score + " points (of " + AUTOSCORE_MAX_SCORE + ")",
      detail: riskWording + " The paper publishes no per-score probability lookup; test-set AUC 0.780."
    }
  };
}

export { autoscoreMortalityDefinition, calculateAutoscoreMortality, AUTOSCORE_MAX_SCORE };
