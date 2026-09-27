/**
 * EASP Sepsis Predictor (Explainable Artificial-intelligence Sepsis Predictor).
 *
 * Five-model XGBoost ensemble (xiangbu/easp Submit_model/model1..5.mdl, MIT)
 * predicting sepsis from ICU hourly data, published in Crit Care Med 2020.
 * The published submission averages the five models' output probabilities
 * (test.py: load_model_predict); the study's operating threshold is 0.525.
 *
 * Feature pipeline: this module ports the repository's
 * feature_engineering.py EXACTLY (37 retained challenge variables ->
 * 93 informative-missingness/difference features -> forward-fill ->
 * 30 six-hour-window statistics for HR/O2Sat/SBP/MAP/Resp ->
 * 8 empiric NEWS/SOFA/qSOFA-like scores = 168 features, in that order).
 * Faithfulness notes:
 *   - the original `x == np.nan` checks are always false, so missing
 *     empiric inputs fall through to score 0 (replicated by using the
 *     same comparison chains);
 *   - population SD (ddof=0) for window std;
 *   - np.std(np.diff(dat)) semantics, including NaN propagation;
 *   - single-row evaluation runs the same algorithm on a one-row window
 *     (the original pads early windows with the current row), so
 *     longitudinal history/trend signals are necessarily unavailable -
 *     this is disclosed, not silently altered.
 *
 * The original challenge frame also had Bilirubin_direct, TroponinI and
 * Fibrinogen; the repository drops them for massive missingness, so the
 * form collects the 37 retained variables only.
 *
 * Pure module: no DOM, no storage, no network.
 */

import { predictXgboost } from "./xgboost.js";
import { EASP_SEPSIS_MODELS } from "./weights/easp-sepsis-models.js";

/** 37 retained challenge variables, in challenge column order. */
const EASP_RAW_COLUMNS = [
  "HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp", "EtCO2",
  "BaseExcess", "HCO3", "FiO2", "pH", "PaCO2", "SaO2", "AST",
  "BUN", "Alkalinephos", "Calcium", "Chloride", "Creatinine",
  "Glucose", "Lactate", "Magnesium", "Phosphate", "Potassium",
  "Bilirubin_total", "Hct", "Hgb", "PTT", "WBC", "Platelets",
  "Age", "Gender", "Unit1", "Unit2", "HospAdmTime", "ICULOS"
];

/** The 31 variables receiving informative-missingness features (con + sep). */
const EASP_SEP_COUNT = 31;

/** Operating threshold from the original study (Submit_model/test.py). */
const EASP_THRESHOLD = 0.525;

function isNaNValue(v) {
  return typeof v === "number" && Number.isNaN(v);
}

/**
 * Port of feature_informative_missingness for one variable column.
 * Returns [intervalF1, intervalF2, diffF] column arrays.
 */
function informativeMissingness(data, colIdx) {
  const n = data.length;
  const sep = new Array(n);
  for (let i = 0; i < n; i++) sep[i] = data[i][colIdx];
  const nanPos = [];
  for (let i = 0; i < n; i++) if (!isNaNValue(sep[i])) nanPos.push(i);

  const f1 = new Array(n);
  const f2 = new Array(n);
  if (nanPos.length === 0) {
    for (let i = 0; i < n; i++) {
      f1[i] = 0;
      f2[i] = -1;
    }
  } else {
    for (let i = 0; i < nanPos[0]; i++) f1[i] = 0;
    for (let p = 0; p < nanPos.length - 1; p++) {
      for (let i = nanPos[p]; i < nanPos[p + 1]; i++) f1[i] = p + 1;
    }
    for (let i = nanPos[nanPos.length - 1]; i < n; i++) f1[i] = nanPos.length;

    for (let i = 0; i < nanPos[0]; i++) f2[i] = -1;
    for (let q = 0; q < nanPos.length - 1; q++) {
      const length = nanPos[q + 1] - nanPos[q];
      for (let l = 0; l < length; l++) f2[nanPos[q] + l] = l;
    }
    const tail = n - nanPos[nanPos.length - 1];
    for (let l = 0; l < tail; l++) f2[nanPos[nanPos.length - 1] + l] = l;
  }

  const diff = new Array(n);
  if (nanPos.length <= 1) {
    for (let i = 0; i < n; i++) diff[i] = NaN;
  } else {
    for (let i = 0; i < nanPos[1]; i++) diff[i] = NaN;
    for (let p = 1; p < nanPos.length - 1; p++) {
      const d = sep[nanPos[p]] - sep[nanPos[p - 1]];
      for (let i = nanPos[p]; i < nanPos[p + 1]; i++) diff[i] = d;
    }
    const dLast = sep[nanPos[nanPos.length - 1]] - sep[nanPos[nanPos.length - 2]];
    for (let i = nanPos[nanPos.length - 1]; i < n; i++) diff[i] = dLast;
  }
  return [f1, f2, diff];
}

/** Port of pandas fillna(method='ffill') over the full matrix. */
function forwardFill(data) {
  const n = data.length;
  const m = data[0].length;
  const out = data.map((row) => row.slice());
  for (let j = 0; j < m; j++) {
    let last = NaN;
    for (let i = 0; i < n; i++) {
      if (isNaNValue(out[i][j])) {
        if (!isNaNValue(last)) out[i][j] = last;
      } else {
        last = out[i][j];
      }
    }
  }
  return out;
}

/** [max, min, mean, median, population-std, std-of-first-differences]. */
function windowStats(dat) {
  const vals = dat.filter((v) => !isNaNValue(v));
  if (vals.length === 0) return [NaN, NaN, NaN, NaN, NaN, NaN];
  let max = vals[0];
  let min = vals[0];
  let sum = 0;
  for (const v of vals) {
    if (v > max) max = v;
    if (v < min) min = v;
    sum += v;
  }
  const mean = sum / vals.length;
  const sorted = vals.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  let varSum = 0;
  for (const v of vals) varSum += (v - mean) * (v - mean);
  const std = Math.sqrt(varSum / vals.length);

  // np.std(np.diff(dat)): any NaN in a difference poisons the result.
  let diffStd = NaN;
  if (dat.length > 1) {
    const diffs = [];
    let poisoned = false;
    for (let i = 1; i < dat.length; i++) {
      const d = dat[i] - dat[i - 1];
      if (isNaNValue(d)) {
        poisoned = true;
        break;
      }
      diffs.push(d);
    }
    if (!poisoned && diffs.length > 0) {
      const dm = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      let dv = 0;
      for (const d of diffs) dv += (d - dm) * (d - dm);
      diffStd = Math.sqrt(dv / diffs.length);
    }
  }
  return [max, min, mean, median, std, diffStd];
}

/**
 * Port of feature_slide_window: six-hour (7-row, current-padded) statistics
 * for HR, O2Sat, SBP, MAP, Resp. Returns rows x 30 in the order
 * [max x5, min x5, mean x5, median x5, std x5, diff-std x5].
 */
function slideWindow(featureA) {
  const n = featureA.length;
  const varIdx = [0, 1, 3, 4, 6]; // HR, O2Sat, SBP, MAP, Resp
  const out = [];
  for (let i = 0; i < n; i++) {
    const win = [];
    if (i < 6) {
      for (let r = 0; r <= i; r++) win.push(featureA[r]);
      for (let k = 0; k < 6 - i; k++) win.push(featureA[i]);
    } else {
      for (let r = i - 6; r <= i; r++) win.push(featureA[r]);
    }
    const stats = varIdx.map((j) => windowStats(win.map((row) => row[j])));
    const row = [];
    for (let s = 0; s < 6; s++) {
      for (let v = 0; v < 5; v++) row.push(stats[v][s]);
    }
    out.push(row);
  }
  return out;
}

/**
 * Port of feature_empiric_score (8 NEWS/SOFA/qSOFA-like scores).
 * Missing inputs fall through the comparisons to the same defaults as the
 * original (whose `x == np.nan` guards are always false).
 */
function empiricScores(featureA) {
  return featureA.map((row) => {
    const HR = row[0];
    const Temp = row[2];
    const Resp = row[6];
    const MAP = row[4];
    const SBP = row[3];
    const creat = row[19];
    const plat = row[30];
    const bili = row[25];

    let hrS;
    if (HR <= 40 || HR >= 131) hrS = 3;
    else if (HR >= 111 && HR <= 130) hrS = 2;
    else if ((HR >= 41 && HR <= 50) || (HR >= 91 && HR <= 110)) hrS = 1;
    else hrS = 0;

    let tempS;
    if (Temp <= 35) tempS = 3;
    else if (Temp >= 39.1) tempS = 2;
    else if ((Temp >= 35.1 && Temp <= 36.0) || (Temp >= 38.1 && Temp <= 39.0)) tempS = 1;
    else tempS = 0;

    let respS;
    if (Resp < 8 || Resp > 25) respS = 3;
    else if (Resp >= 21 && Resp <= 24) respS = 2;
    else if (Resp >= 9 && Resp <= 11) respS = 1;
    else respS = 0;

    let creatS;
    if (creat < 1.2) creatS = 0;
    else if (creat < 2) creatS = 1;
    else if (creat < 3.5) creatS = 2;
    else creatS = 3;

    const mapS = MAP >= 70 ? 0 : 1;
    const qsofa = SBP <= 100 && Resp >= 22 ? 1 : 0;

    let platS;
    if (plat <= 50) platS = 3;
    else if (plat <= 100) platS = 2;
    else if (plat <= 150) platS = 1;
    else platS = 0;

    let biliS;
    if (bili < 1.2) biliS = 0;
    else if (bili < 2) biliS = 1;
    else if (bili < 6) biliS = 2;
    else biliS = 3;

    return [hrS, tempS, respS, creatS, mapS, qsofa, platS, biliS];
  });
}

/**
 * Full feature pipeline: rows (n x 37, NaN for missing, EASP_RAW_COLUMNS
 * order) -> n x 168 engineered features. Exact port of feature_extraction
 * (minus the dropped Bilirubin_direct/TroponinI/Fibrinogen/SepsisLabel
 * columns, which never reach this function).
 */
function engineerEaspFeatures(rawRows) {
  const n = rawRows.length;
  const tempData = rawRows.map((row) => row.slice());
  for (let c = 0; c < EASP_SEP_COUNT; c++) {
    const [f1, f2, diff] = informativeMissingness(rawRows, c);
    for (let i = 0; i < n; i++) {
      tempData[i].push(f1[i], f2[i], diff[i]);
    }
  }
  const featureA = forwardFill(tempData);
  const featureB = slideWindow(featureA);
  const featureC = empiricScores(featureA);
  return featureA.map((row, i) => row.concat(featureB[i], featureC[i]));
}

/** Mean of the five submitted models' probabilities (per test.py). */
function easpEnsembleProbability(features168) {
  let sum = 0;
  const perModel = [];
  for (const model of EASP_SEPSIS_MODELS) {
    const p = predictXgboost(model, features168);
    perModel.push(p);
    sum += p;
  }
  return { perModel, mean: sum / perModel.length };
}

function finiteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Form input definitions: key, label, unit, and the challenge column index.
const EASP_INPUT_DEFS = [
  ["hr", "Heart rate", "beats/min", 0, 20, 250, { kind: "vital", match: [/heart rate/i, /\bhr\b/i] }],
  ["o2Sat", "Oxygen saturation (SpO2)", "%", 1, 50, 100, { kind: "vital", match: [/spo2/i, /oxygen saturation/i] }],
  ["temp", "Temperature", "°C", 2, 30, 43, { kind: "vital", match: [/temperature/i], preferUnit: "°C" }],
  ["sbp", "Systolic BP", "mmHg", 3, 40, 300, { kind: "vital", match: [/systolic/i] }],
  ["map", "Mean arterial pressure", "mmHg", 4, 20, 200, { kind: "vital", match: [/mean arterial/i, /\bmap\b/i] }],
  ["dbp", "Diastolic BP", "mmHg", 5, 20, 200, { kind: "vital", match: [/diastolic/i] }],
  ["resp", "Respiratory rate", "/min", 6, 4, 80, { kind: "vital", match: [/respiratory/i, /\brr\b/i] }],
  ["etco2", "End-tidal CO2", "mmHg", 7, 10, 80, null],
  ["baseExcess", "Base excess", "mmol/L", 8, -30, 30, null],
  ["hco3", "Bicarbonate (HCO3)", "mmol/L", 9, 5, 60, null],
  ["fio2", "FiO2", "fraction", 10, 0.21, 1.0, null],
  ["ph", "pH", null, 11, 6.8, 7.8, null],
  ["paco2", "PaCO2", "mmHg", 12, 10, 150, null],
  ["sao2", "SaO2", "%", 13, 50, 100, null],
  ["ast", "AST", "IU/L", 14, 0, 10000, null],
  ["bun", "BUN", "mg/dL", 15, 0, 300, null],
  ["alkPhos", "Alkaline phosphatase", "IU/L", 16, 0, 5000, null],
  ["calcium", "Calcium", "mg/dL", 17, 0, 20, null],
  ["chloride", "Chloride", "mmol/L", 18, 50, 160, null],
  ["creatinine", "Creatinine", "mg/dL", 19, 0, 30, null],
  ["glucose", "Glucose", "mg/dL", 20, 10, 2000, null],
  ["lactate", "Lactate", "mmol/L", 21, 0, 40, null],
  ["magnesium", "Magnesium", "mg/dL", 22, 0, 15, null],
  ["phosphate", "Phosphate", "mg/dL", 23, 0, 20, null],
  ["potassium", "Potassium", "mmol/L", 24, 1, 10, null],
  ["biliTotal", "Total bilirubin", "mg/dL", 25, 0, 60, null],
  ["hct", "Hematocrit", "%", 26, 5, 75, null],
  ["hgb", "Hemoglobin", "g/dL", 27, 2, 25, null],
  ["ptt", "PTT", "sec", 28, 10, 300, null],
  ["wbc", "WBC", "K/µL", 29, 0, 200, null],
  ["platelets", "Platelets", "K/µL", 30, 0, 1500, null],
  ["age", "Age", "years", 31, 18, 110, { kind: "demographic", field: "ageYears" }],
  ["gender", "Gender", null, 32, null, null, "radio-gender"],
  ["unit1", "Unit1 (ICU type flag)", null, 33, null, null, "radio-yesno"],
  ["unit2", "Unit2 (ICU type flag)", null, 34, null, null, "radio-yesno"],
  ["hospAdmTime", "Hospital admit to ICU admit", "hours", 35, -1000, 10000, null],
  ["iculos", "ICU length of stay at measurement", "hours", 36, 0, 10000, null]
];

function buildInputs() {
  return EASP_INPUT_DEFS.map(([key, label, unit, _col, min, max, pull]) => {
    if (pull === "radio-gender") {
      return {
        key,
        label,
        type: "radio",
        hint: "Challenge coding: female = 0, male = 1.",
        options: [
          { value: 0, label: "Female" },
          { value: 1, label: "Male" }
        ]
      };
    }
    if (pull === "radio-yesno") {
      return {
        key,
        label,
        type: "radio",
        hint: "Binary unit-type flag from the challenge data.",
        options: [
          { value: 0, label: "No" },
          { value: 1, label: "Yes" }
        ]
      };
    }
    const field = { key, label, type: "number", placeholder: "—" };
    if (unit) field.unit = unit;
    if (min !== null) field.min = min;
    if (max !== null) field.max = max;
    if (key === "fio2") field.step = 0.01;
    if (pull) field.pull = pull;
    return field;
  });
}

const easpSepsisDefinition = {
  verifiedOn: "2026-09-27",
  id: "easp-sepsis",
  kind: "ai-model",
  title: "EASP Sepsis Predictor",
  subtitle:
    "Early sepsis prediction from ICU hourly data (5-model XGBoost ensemble). Single-snapshot evaluation.",
  reference:
    "Yang M, Liu C, Wang X, Li Y, Gao H, Liu X, Li J. An Explainable Artificial Intelligence Predictor for Early Detection of Sepsis. Crit Care Med. 2020;48(11):e1091-e1096.",
  paperUrl: "https://doi.org/10.1097/CCM.0000000000004550",
  codeUrl: "https://github.com/xiangbu/easp",
  validationNote:
    "Feature pipeline is an exact port of the repository's feature_engineering.py and the vendored weights are the " +
    "five submitted model binaries; JS inference was cross-checked against the original Python pipeline and native " +
    "xgboost predictions on 2026-09-27 (50/50 per-model probabilities match within 1.5e-7 absolute error across an " +
    "8-hour window, a full single-row snapshot, and a sparse single-row snapshot). " +
    "The study's operating threshold was 0.525; crossing it is not a sepsis diagnosis.",
  verifiedAgainst:
    "xiangbu/easp feature_engineering.py + Submit_model/model1..5.mdl via xgboost 2.0.3: 50 per-model probabilities " +
    "within 1.5e-7 absolute error; 168-feature vectors match the Python pipeline on all 3 fixture sets",
  inputs: buildInputs(),
  calculate: calculateEaspSepsis
};

/**
 * Score a single ICU snapshot. All 37 inputs are optional (the model is
 * defined for any missingness pattern); coverage is reported.
 */
function calculateEaspSepsis(inputs) {
  const rawRow = new Array(37).fill(NaN);
  let provided = 0;
  const providedLabels = [];
  const missingLabels = [];
  for (const [key, label, , col] of EASP_INPUT_DEFS) {
    const v = finiteNumber(inputs[key]);
    if (v === null) {
      missingLabels.push(label);
    } else {
      rawRow[col] = v;
      provided++;
      providedLabels.push(label);
    }
  }

  const features = engineerEaspFeatures([rawRow])[0];
  const { perModel, mean } = easpEnsembleProbability(features);
  const sepsisPercent = mean * 100;
  const aboveThreshold = mean >= EASP_THRESHOLD;

  return {
    complete: true,
    missing: [],
    providedCount: provided,
    missingCount: 37 - provided,
    providedLabels,
    missingLabels,
    sepsisProbability: mean,
    sepsisPercent,
    modelProbabilities: perModel,
    aboveThreshold,
    threshold: EASP_THRESHOLD,
    interpretation: {
      band: aboveThreshold ? "above-threshold" : "below-threshold",
      headline:
        sepsisPercent.toFixed(1) +
        "% — " +
        (aboveThreshold ? "at/above" : "below") +
        " the study's 0.525 operating threshold",
      detail:
        "Single-snapshot estimate from " + provided + " of 37 hourly variables" +
        (providedLabels.length > 0 ? " (" + providedLabels.join(", ") + ")" : "") +
        ". The model was designed for hourly monitoring: without prior hourly rows, " +
        "longitudinal history and trend features are unavailable, which limits this " +
        "single-snapshot evaluation. The 0.525 threshold is the operating point from " +
        "the original study; reaching it is not a sepsis diagnosis."
    }
  };
}

export {
  easpSepsisDefinition,
  calculateEaspSepsis,
  engineerEaspFeatures,
  easpEnsembleProbability,
  EASP_RAW_COLUMNS,
  EASP_THRESHOLD
};
