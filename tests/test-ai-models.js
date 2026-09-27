// Verification tests for the native client-side AI/ML models in src/ai-models/.
//
// Unlike the MDCalc calculators (tests/test-clinical-scores.js), these models
// are NOT MDCalc mirrors — never claim MDCalc parity for them. Each expected
// value below was produced by running the reference implementation locally:
//
//   isaric4c            -> official 4C JS calculator bundles
//                          (jamesscottbrown.github.io/4c-mortality-calculator)
//   autoscore-mortality -> published point table, Xie et al., JMIR Med Inform 2020
//   covidgram           -> published odds ratios, Liang et al., JAMA Intern Med 2020
//                          (PMC7218676); betas are ln(OR)
//   qrisk3              -> reference Python implementation (cpi-2718/qrisk3),
//                          run locally 2026-09-27
//   recode              -> independent Python re-implementation of the repo's
//                          app.R equations (Rscript unavailable), 2026-09-27
//   periop-xgboost      -> JS traversal vs native xgboost 3.1.2 predictions
//                          (parity of the port, NOT clinical verification:
//                          the paper is a preprint under review at JAMIA)
//   easp-sepsis         -> JS feature pipeline vs the original
//                          feature_engineering.py (bit-identical) and JS
//                          inference vs native xgboost 2.0.3 on the original
//                          .mdl binaries (50/50 within 1.5e-7)
import assert from "node:assert/strict";
import { isaric4cDefinition, calculateIsaric4c } from "../src/ai-models/isaric4c.js";
import {
  autoscoreMortalityDefinition,
  calculateAutoscoreMortality
} from "../src/ai-models/autoscore-mortality.js";
import {
  covidgramDefinition,
  calculateCovidgram,
  COVIDGRAM_COEFFICIENTS
} from "../src/ai-models/covidgram.js";
import { qrisk3Definition, calculateQrsk3 } from "../src/ai-models/qrisk3.js";
import { recodeDefinition, calculateRecode } from "../src/ai-models/recode.js";
import {
  periopXgboostDefinition,
  calculatePeriopXgboost
} from "../src/ai-models/periop-xgboost.js";
import { easpSepsisDefinition, calculateEaspSepsis } from "../src/ai-models/easp-sepsis.js";
import {
  AI_MODELS,
  getAiModelDefinition,
  listAiModelDefinitions
} from "../src/ai-models/index.js";

const TOL = 1e-6;

// ---------- registry ----------
assert.equal(AI_MODELS.length, 7, "seven AI models registered");
assert.deepEqual(
  listAiModelDefinitions().map((d) => d.id),
  ["qrisk3", "isaric4c", "autoscore-mortality", "recode", "periop-xgboost", "easp-sepsis", "covidgram"]
);
for (const definition of AI_MODELS) {
  assert.equal(definition.kind, "ai-model", definition.id);
  assert.ok(definition.title && definition.reference && definition.paperUrl, definition.id);
  assert.ok(definition.validationNote, definition.id);
  assert.equal(typeof definition.calculate, "function", definition.id);
  assert.equal(getAiModelDefinition(definition.id), definition, definition.id);
}
// Every definition wires its calculate function and declares an honest
// verification state (verifiedOn is null only for the preprint model).
const DEFINITION_CHECKS = [
  [isaric4cDefinition, calculateIsaric4c],
  [autoscoreMortalityDefinition, calculateAutoscoreMortality],
  [covidgramDefinition, calculateCovidgram],
  [qrisk3Definition, calculateQrsk3],
  [recodeDefinition, calculateRecode],
  [periopXgboostDefinition, calculatePeriopXgboost],
  [easpSepsisDefinition, calculateEaspSepsis]
];
for (const [definition, calculate] of DEFINITION_CHECKS) {
  assert.equal(definition.calculate, calculate, `${definition.id} calculate wired`);
  assert.ok(
    definition.verifiedOn === null || /^\d{4}-\d{2}-\d{2}$/.test(definition.verifiedOn),
    `${definition.id} verifiedOn is null or a YYYY-MM-DD date`
  );
  if (definition.verifiedOn) {
    assert.ok(definition.verifiedAgainst, `${definition.id} verifiedAgainst names the reference`);
  }
}

// Perioperative model is the honest exception: preprint, unverified.
assert.equal(periopXgboostDefinition.verifiedOn, null);
assert.equal(periopXgboostDefinition.verifiedAgainst, null);
assert.match(periopXgboostDefinition.validationNote, /Preprint/);

// ---------- ISARIC 4C ----------
{
  const vectors = [
    [
      { age: 40, sex: 0, comorbidities: 0, respiratoryRate: 18, spo2: 96, gcs: 15, urea: 5, crp: 30 },
      0, 0, "Low"
    ],
    [
      { age: 55, sex: 1, comorbidities: 1, respiratoryRate: 22, spo2: 94, gcs: 15, urea: 8, crp: 60 },
      7, 11.695376, "Intermediate"
    ],
    [
      { age: 65, sex: 1, comorbidities: 1, respiratoryRate: 24, spo2: 94, gcs: 15, urea: 8, crp: 60 },
      9, 19.164619, "High"
    ],
    [
      { age: 82, sex: 1, comorbidities: 3, respiratoryRate: 32, spo2: 88, gcs: 13, urea: 16, crp: 150 },
      21, 87.5, "Very high"
    ]
  ];
  for (const [inputs, score, mortality, band] of vectors) {
    const result = calculateIsaric4c(inputs);
    assert.equal(result.complete, true);
    assert.equal(result.score, score);
    assert.ok(Math.abs(result.mortalityPercent - mortality) <= 1e-4, `${score}: ${result.mortalityPercent}`);
    assert.equal(result.riskGroup, band);
  }
  // Interval boundaries from the official calculator.
  const base = { age: 40, sex: 0, comorbidities: 0, respiratoryRate: 18, spo2: 96, gcs: 15, urea: 5, crp: 30 };
  assert.equal(calculateIsaric4c({ ...base, age: 50 }).score, 2);
  assert.equal(calculateIsaric4c({ ...base, age: 49 }).score, 0);
  assert.equal(calculateIsaric4c({ ...base, urea: 14.1 }).score, 3);
  assert.equal(calculateIsaric4c({ ...base, crp: 50 }).score, 1);
  assert.equal(calculateIsaric4c({ ...base, gcs: 14 }).score, 2);
  // Alternate units reproduce SI cutoffs (official calculator behavior).
  assert.equal(calculateIsaric4c({ ...base, urea: 39.2, ureaUnit: "mg/dL" }).score, 1);
  const incomplete = calculateIsaric4c({ age: 40 });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.interpretation.band, "incomplete");
  assert.ok(incomplete.missing.length > 0);
}

// ---------- AutoScore mortality ----------
{
  const min = calculateAutoscoreMortality({
    age: 25, heartRate: 65, respiratoryRate: 14, sbp: 110, temperature: 37,
    spo2: 98, platelet: 200, bun: 5, lactate: 0.8
  });
  assert.equal(min.score, 0);
  assert.equal(min.interpretation.band, "low");

  const mid = calculateAutoscoreMortality({
    age: 60, heartRate: 100, respiratoryRate: 20, sbp: 95, temperature: 37.7,
    spo2: 92, platelet: 100, bun: 20, lactate: 3
  });
  assert.equal(mid.score, 63);
  assert.equal(mid.interpretation.band, "moderate");

  const max = calculateAutoscoreMortality({
    age: 90, heartRate: 120, respiratoryRate: 30, sbp: 85, temperature: 35,
    spo2: 80, platelet: 50, bun: 80, lactate: 5
  });
  assert.equal(max.score, 162, "published maximum score");
  assert.equal(max.interpretation.band, "high");

  const base = { age: 25, heartRate: 65, respiratoryRate: 14, sbp: 110, temperature: 37, spo2: 98, platelet: 200, bun: 5, lactate: 0.8 };
  const one = (over) => calculateAutoscoreMortality({ ...base, ...over });
  assert.equal(one({ age: 48 }).score, 14);
  assert.equal(one({ sbp: 90 }).score, 8);
  assert.equal(one({ spo2: 85 }).score, 13);
  assert.equal(one({ lactate: 2.5 }).score, 8);

  const incomplete = calculateAutoscoreMortality({ age: 60 });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.interpretation.band, "incomplete");
}

// ---------- COVID-GRAM ----------
{
  // Betas are ln of the published Table 3 odds ratios (spot-checked).
  assert.ok(Math.abs(COVIDGRAM_COEFFICIENTS.xrayAbnormality - Math.log(3.39)) <= 1e-12);
  assert.ok(Math.abs(COVIDGRAM_COEFFICIENTS.hemoptysis - Math.log(4.53)) <= 1e-12);
  assert.ok(Math.abs(COVIDGRAM_COEFFICIENTS.unconsciousness - Math.log(4.71)) <= 1e-12);
  assert.ok(Math.abs(COVIDGRAM_COEFFICIENTS.intercept - Math.log(0.001)) <= 1e-12);

  const vec = (xrayAbnormality, age, hemoptysis, dyspnea, unconsciousness, comorbidityCount, cancerHistory, nlr, ldh, directBilirubin) =>
    calculateCovidgram({
      xrayAbnormality, age, hemoptysis, dyspnea, unconsciousness,
      comorbidityCount, cancerHistory, nlr, ldh, directBilirubin
    });
  const low = vec(0, 30, 0, 0, 0, 0, 0, 2.0, 200, 8);
  assert.ok(Math.abs(low.linearPredictor - -4.386757323951972) <= 1e-9);
  assert.ok(Math.abs(low.probability - 0.012288129343777267) <= 1e-9);
  const mid = vec(1, 50, 0, 1, 0, 1, 0, 3.5, 300, 12);
  assert.ok(Math.abs(mid.probability - 0.34814012788714055) <= 1e-9);
  const high = vec(1, 70, 1, 1, 1, 3, 1, 8.0, 500, 20);
  assert.ok(Math.abs(high.probability - 0.9992141180327) <= 1e-9);

  const incomplete = calculateCovidgram({ age: 55 });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.interpretation.band, "incomplete");
}

// ---------- QRISK3 (reference Python run locally 2026-09-27) ----------
function qriskInputs(over) {
  const heightCm = 175;
  const weight = over.bmi * Math.pow(heightCm / 100, 2);
  return {
    age: over.age, sex: over.sex, ethnicity: over.ethnicity ?? 0,
    townsend: over.townsend ?? 0, smoking: over.smoking ?? 0,
    diabetes: over.diabetes ?? 0, sbp: over.sbp, sbpStd: over.sbpStd ?? 0,
    cholHdlRatio: over.ratio, weight, height: heightCm,
    atrialFibrillation: 0, atypicalAntipsychotic: 0, corticosteroids: 0,
    migraine: 0, rheumatoidArthritis: 0, chronicKidneyDisease: 0,
    severeMentalIllness: 0, systemicLupus: 0, treatedHypertension: 0,
    erectileDysfunction: 0, familyHistoryCvd: 0,
    ...over.extra
  };
}
{
  const vectors = [
    ["V1", qriskInputs({ age: 35, sex: "female", sbp: 120, ratio: 3.5, bmi: 22.0 }), 0.362051],
    [
      "V2",
      qriskInputs({
        age: 65, sex: "male", ethnicity: 2, sbp: 150, ratio: 5.5, bmi: 28.0,
        smoking: 3, diabetes: 2,
        extra: { treatedHypertension: 1, familyHistoryCvd: 1, atrialFibrillation: 1 }
      }),
      81.353452
    ],
    [
      "V4",
      qriskInputs({
        age: 80, sex: "male", ethnicity: 3, sbp: 170, ratio: 7.0, bmi: 31.5,
        smoking: 4, diabetes: 1, townsend: 6.5, sbpStd: 15.0,
        extra: {
          treatedHypertension: 1, atypicalAntipsychotic: 1, corticosteroids: 1,
          migraine: 1, rheumatoidArthritis: 1, severeMentalIllness: 1,
          familyHistoryCvd: 1, erectileDysfunction: 1
        }
      }),
      99.998949
    ]
  ];
  for (const [tag, values, expected] of vectors) {
    const result = calculateQrsk3(values);
    assert.equal(result.complete, true, tag);
    assert.ok(Math.abs(result.tenYearCvdRiskPercent - expected) <= TOL, `${tag}: ${result.tenYearCvdRiskPercent}`);
  }
  // ClinRisk disclaimer must be displayed with any generated score.
  assert.ok(
    qrisk3Definition.disclaimer.includes(
      "ClinRisk Ltd. stress that it is the responsibility of the end user to check that the source that they receive produces the same results as the original code found at https://qrisk.org."
    )
  );
  assert.ok(
    qrisk3Definition.disclaimer.includes(
      "Inaccurate implementations of risk scores can lead to wrong patients being given the wrong treatment."
    )
  );
  // Age outside 25–84 is rejected like the Python implementation.
  const outOfRange = calculateQrsk3({ ...vectors[0][1], age: 90 });
  assert.equal(outOfRange.complete, false);
}

// ---------- RECODe (independent Python re-implementation of app.R) ----------
{
  // High-risk profile: all six repo outcomes.
  const base = {
    age: 72, sex: 1, black: 1, hispanic: 0, sbp: 165, bpTreatment: 1,
    totalCholesterol: 240, hdl: 38, statin: 1, hba1c: 9.5, oralDiabetesMeds: 1,
    creatinine: 1.8, uacr: 350, priorMiOrStroke: 1, anticoagulant: 1, currentSmoker: 1
  };
  const expected = {
    nephropathy: 13.657418664120147, retinopathy: 26.203917061195625,
    neuropathy: 39.76997809186139, mi: 83.89056778338121,
    chf: 93.7671281979663, mortality: 70.18548659399447
  };
  for (const [outcome, risk] of Object.entries(expected)) {
    const result = calculateRecode({ ...base, outcome });
    assert.equal(result.complete, true, outcome);
    assert.ok(Math.abs(result.riskPercent - risk) <= TOL, `${outcome}: ${result.riskPercent}`);
    assert.ok(result.interpretation.headline.startsWith("10-year "), outcome);
  }
  // CC BY-NC-SA 4.0: non-commercial license note is mandatory.
  assert.ok(recodeDefinition.licenseNote.includes("non-commercial use only"));
  const incomplete = calculateRecode({ outcome: "mi" });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.interpretation.band, "incomplete");
}

// ---------- Perioperative XGBoost (JS port parity vs native xgboost 3.1.2) ----------
// Preprint only (under review at JAMIA); output is raw and uncalibrated.
{
  const fixtures = [
    { age: 65, sex: 1, heightCm: 170, weightKg: 70, asa: 1, emergency: 0, prob: 0.03521429002285004 },
    { age: 78, sex: 0, heightCm: 160, weightKg: 85, asa: 4, emergency: 1, prob: 0.8148617148399353 },
    // Missing height/weight routes through the model's native missing-value path.
    { age: 45, sex: 1, asa: 1, emergency: 0, prob: 0.033776432275772095 },
    { age: 70, sex: 0, heightCm: 165, weightKg: 55, asa: 6, emergency: 1, prob: 0.9771100282669067 }
  ];
  for (const fixture of fixtures) {
    const result = calculatePeriopXgboost({
      age: fixture.age, sex: fixture.sex, asa: fixture.asa, emergency: fixture.emergency,
      ...(fixture.heightCm !== undefined ? { heightCm: fixture.heightCm, weightKg: fixture.weightKg } : {})
    });
    assert.equal(result.complete, true);
    assert.ok(Math.abs(result.mortalityProbability - fixture.prob) <= TOL,
      `age=${fixture.age}: ${result.mortalityProbability}`);
    assert.equal(result.interpretation.band, "uncalibrated");
  }
  const incomplete = calculatePeriopXgboost({ age: 65 });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.interpretation.band, "incomplete");
}

// ---------- EASP sepsis (feature pipeline bit-identical to feature_engineering.py) ----------
{
  // Sparse single snapshot: HR, Temp, Age, Gender, Unit1, Unit2, HospAdmTime, ICULOS.
  const sparse = calculateEaspSepsis({
    hr: 110, temp: 38.6, age: 67, gender: 1,
    unit1: 1, unit2: 0, hospAdmTime: 5.2, iculos: 12
  });
  assert.equal(sparse.complete, true);
  assert.equal(sparse.providedCount, 8);
  assert.equal(sparse.modelProbabilities.length, 5);
  assert.ok(Math.abs(sparse.sepsisProbability - 0.6880905985832214) <= 1e-6,
    String(sparse.sepsisProbability));
  assert.equal(sparse.aboveThreshold, true);
  assert.match(sparse.interpretation.detail, /Single-snapshot/);
  assert.match(sparse.interpretation.detail, /not a sepsis diagnosis/);
  // The model is defined for all-missing inputs (native missing-value routing).
  const empty = calculateEaspSepsis({});
  assert.equal(empty.complete, true);
  assert.equal(empty.providedCount, 0);
}

console.log("All AI model tests passed.");
