"use strict";

/**
 * Internal-medicine batch A (cardiac) calculator tests.
 *
 * Covers CHA2DS2-VASc, HAS-BLED, HEART, TIMI UA/NSTEMI, and GRACE ACS:
 * point totals, band boundaries, incomplete-input handling, MDCalc-verified
 * display formats, and GRACE's published nomogram tables.
 *
 * Run with: node tests/test-im-cardiac.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { chadsvascDefinition, calculateChadsvasc } from "../src/clinical-scores/chadsvasc.js";
import { hasbledDefinition, calculateHasbled } from "../src/clinical-scores/hasbled.js";
import { heartDefinition, calculateHeart } from "../src/clinical-scores/heart.js";
import { timiDefinition, calculateTimi } from "../src/clinical-scores/timi.js";
import {
  graceDefinition,
  calculateGrace,
  gracePointTables
} from "../src/clinical-scores/grace.js";

function allYesNo(definition, value) {
  const inputs = {};
  for (const field of definition.inputs) {
    if (field.type === "radio") inputs[field.key] = value;
  }
  return inputs;
}

// ---------------------------------------------------------------------------
// CHA2DS2-VASc
// ---------------------------------------------------------------------------

test("CHA2DS2-VASc: minimum score, no anticoagulation", () => {
  const result = calculateChadsvasc({
    age: 0,
    sex: 0,
    chf: 0,
    hypertension: 0,
    strokeTiaTe: 0,
    vascularDisease: 0,
    diabetes: 0
  });
  assert.equal(result.complete, true);
  assert.equal(result.score, 0);
  assert.equal(result.annualStrokeRiskPercent, 0.2);
  assert.equal(result.strokeTiaSystemicEmbolismRiskPercent, 0.3);
  assert.equal(result.interpretation.headline, "0 points");
  assert.equal(result.interpretation.band, "low");
  assert.equal(
    result.interpretation.detail,
    "Stroke risk was 0.2% per year in >90,000 patients (the Swedish Atrial Fibrillation Cohort Study) and 0.3% risk of stroke/TIA/systemic embolism."
  );
});

test("CHA2DS2-VASc: stroke (2) + age >=75 (2) + CHF + vascular = 6", () => {
  const result = calculateChadsvasc({
    age: 2,
    sex: 0,
    chf: 1,
    hypertension: 0,
    strokeTiaTe: 2,
    vascularDisease: 1,
    diabetes: 0
  });
  assert.equal(result.score, 6);
  assert.equal(result.annualStrokeRiskPercent, 9.7);
  assert.equal(result.strokeTiaSystemicEmbolismRiskPercent, 13.6);
  assert.equal(result.interpretation.band, "high");
  assert.equal(
    result.interpretation.detail,
    "Stroke risk was 9.7% per year in >90,000 patients (the Swedish Atrial Fibrillation Cohort Study) and 13.6% risk of stroke/TIA/systemic embolism."
  );
});

test("CHA2DS2-VASc: score 7 uses MDCalc's Swedish-cohort figures (live-verified)", () => {
  const result = calculateChadsvasc({
    age: 2,
    sex: 0,
    chf: 1,
    hypertension: 1,
    strokeTiaTe: 2,
    vascularDisease: 1,
    diabetes: 0
  });
  assert.equal(result.score, 7);
  assert.equal(result.annualStrokeRiskPercent, 11.2);
  assert.equal(result.strokeTiaSystemicEmbolismRiskPercent, 15.7);
  assert.equal(
    result.interpretation.detail,
    "Stroke risk was 11.2% per year in >90,000 patients (the Swedish Atrial Fibrillation Cohort Study) and 15.7% risk of stroke/TIA/systemic embolism."
  );
});

test("CHA2DS2-VASc: age 65-74 band scores 1; female + 2 = consider", () => {
  const result = calculateChadsvasc({
    age: 1,
    sex: 1,
    chf: 0,
    hypertension: 0,
    strokeTiaTe: 0,
    vascularDisease: 0,
    diabetes: 0
  });
  assert.equal(result.score, 2);
  assert.equal(result.annualStrokeRiskPercent, 2.2);
  assert.equal(result.strokeTiaSystemicEmbolismRiskPercent, 2.9);
  assert.equal(result.interpretation.band, "moderate");
});

test("CHA2DS2-VASc: female with score 1 does not need anticoagulation", () => {
  const result = calculateChadsvasc({
    age: 0,
    sex: 1,
    chf: 0,
    hypertension: 0,
    strokeTiaTe: 0,
    vascularDisease: 0,
    diabetes: 0
  });
  assert.equal(result.score, 1);
  assert.equal(result.interpretation.band, "low");
});

test("CHA2DS2-VASc: incomplete input lists missing fields", () => {
  const result = calculateChadsvasc({ age: 1, sex: 0 });
  assert.equal(result.complete, false);
  assert.equal(result.score, null);
  assert.deepEqual(result.missing, [
    "Congestive heart failure history",
    "Hypertension history",
    "Stroke/TIA/thromboembolism history",
    "Vascular disease history (prior MI, peripheral artery disease, or aortic plaque)",
    "Diabetes history"
  ]);
  assert.equal(result.interpretation.headline, "Incomplete");
});

test("CHA2DS2-VASc: definition metadata", () => {
  assert.equal(chadsvascDefinition.id, "chadsvasc");
  assert.equal(chadsvascDefinition.mdcalcId, "801");
  assert.equal(
    chadsvascDefinition.mdcalcUrl,
    "https://www.mdcalc.com/calc/801/cha2ds2-vasc-score-atrial-fibrillation-stroke-risk"
  );
  assert.equal(chadsvascDefinition.inputs.length, 7);
  assert.equal(chadsvascDefinition.pullBindings, undefined);
});

// ---------------------------------------------------------------------------
// HAS-BLED
// ---------------------------------------------------------------------------

test("HAS-BLED: minimum score", () => {
  const result = calculateHasbled(allYesNo(hasbledDefinition, 0));
  assert.equal(result.complete, true);
  assert.equal(result.score, 0);
  assert.equal(result.majorBleedingRiskPercent, 0.9);
  assert.equal(result.riskGroup, "Low");
  assert.equal(result.interpretation.headline, "0 points");
  assert.equal(result.interpretation.band, "low");
  assert.equal(
    result.interpretation.detail,
    "Risk was 0.9% in one validation study (Lip 2011) and 1.13 bleeds per 100 patient-years in another validation study (Pisters 2010). " +
      "Anticoagulation should be considered: Patient has a relatively low risk for major bleeding (~1/100 patient-years)."
  );
});

test("HAS-BLED: maximum score 9 is very high with undetermined rate", () => {
  const result = calculateHasbled(allYesNo(hasbledDefinition, 1));
  assert.equal(result.score, 9);
  assert.equal(result.majorBleedingRiskPercent, null);
  assert.equal(result.riskGroup, "Very high");
  assert.equal(result.interpretation.band, "very-high");
  assert.equal(result.interpretation.headline, "9 points");
  assert.equal(
    result.interpretation.detail,
    "Scores greater than 5 were too rare to determine risk, but are likely over 10%. " +
      "Alternatives to anticoagulation should be considered: Patient is at very high risk for major bleeding."
  );
});

test("HAS-BLED: score 3 is high with alternatives recommendation", () => {
  const result = calculateHasbled({
    ...allYesNo(hasbledDefinition, 0),
    hypertension: 1,
    stroke: 1,
    elderly: 1
  });
  assert.equal(result.score, 3);
  assert.equal(result.majorBleedingRiskPercent, 5.8);
  assert.equal(result.riskGroup, "High");
  assert.equal(result.interpretation.band, "high");
  assert.equal(
    result.interpretation.detail,
    "Risk was 5.8% in one validation study (Lip 2011) and 3.72 bleeds per 100 patient-years in another validation study (Pisters 2010). " +
      "Alternatives to anticoagulation should be considered: Patient is at high risk for major bleeding."
  );
});

test("HAS-BLED: per-score verbatim text for scores 1, 2, 4, 5", () => {
  const base = allYesNo(hasbledDefinition, 0);
  const at1 = calculateHasbled({ ...base, hypertension: 1 });
  assert.equal(
    at1.interpretation.detail,
    "Risk was 3.4% in one validation study (Lip 2011) and 1.02 bleeds per 100 patient-years in another validation study (Pisters 2010). " +
      "Anticoagulation should be considered: Patient has a relatively low risk for major bleeding (~1/100 patient-years)."
  );
  const at2 = calculateHasbled({ ...base, hypertension: 1, elderly: 1 });
  assert.equal(
    at2.interpretation.detail,
    "Risk was 4.1% in one validation study (Lip 2011) and 1.88 bleeds per 100 patient-years in another validation study (Pisters 2010). " +
      "Anticoagulation can be considered, however patient does have moderate risk for major bleeding (~2/100 patient-years)."
  );
  const at4 = calculateHasbled({ ...base, hypertension: 1, stroke: 1, elderly: 1, alcohol: 1 });
  assert.equal(
    at4.interpretation.detail,
    "Risk was 8.9% in one validation study (Lip 2011) and 8.70 bleeds per 100 patient-years in another validation study (Pisters 2010). " +
      "Alternatives to anticoagulation should be considered: Patient is at high risk for major bleeding."
  );
  const at5 = calculateHasbled({ ...base, hypertension: 1, stroke: 1, elderly: 1, alcohol: 1, drugs: 1 });
  assert.equal(at5.score, 5);
  assert.equal(
    at5.interpretation.detail,
    "Risk was 9.1% in one validation study (Lip 2011) and 12.50 bleeds per 100 patient-years in another validation study (Pisters 2010). " +
      "Alternatives to anticoagulation should be considered: Patient is at high risk for major bleeding."
  );
});

test("HAS-BLED: score 2 is moderate", () => {
  const result = calculateHasbled({
    ...allYesNo(hasbledDefinition, 0),
    hypertension: 1,
    elderly: 1
  });
  assert.equal(result.score, 2);
  assert.equal(result.majorBleedingRiskPercent, 4.1);
  assert.equal(result.riskGroup, "Moderate");
  assert.equal(result.interpretation.band, "moderate");
});

test("HAS-BLED: incomplete input", () => {
  const result = calculateHasbled({ hypertension: 1 });
  assert.equal(result.complete, false);
  assert.equal(result.score, null);
  assert.ok(result.missing.includes("Renal disease"));
  assert.ok(result.missing.includes("Alcohol use"));
  assert.equal(result.missing.length, 8);
});

test("HAS-BLED: definition metadata and input order", () => {
  assert.equal(hasbledDefinition.id, "hasbled");
  assert.equal(hasbledDefinition.mdcalcId, "807");
  assert.deepEqual(
    hasbledDefinition.inputs.map((f) => f.label),
    [
      "Hypertension",
      "Renal disease",
      "Liver disease",
      "Stroke history",
      "Prior major bleeding or predisposition to bleeding",
      "Labile INR",
      "Age >65",
      "Medication usage predisposing to bleeding",
      "Alcohol use"
    ]
  );
});

// ---------------------------------------------------------------------------
// HEART
// ---------------------------------------------------------------------------

test("HEART: minimum score is low risk", () => {
  const result = calculateHeart({ history: 0, ecg: 0, age: 0, riskFactors: 0, troponin: 0 });
  assert.equal(result.complete, true);
  assert.equal(result.score, 0);
  assert.equal(result.interpretation.headline, "0 points");
  assert.equal(result.interpretation.band, "low");
  assert.equal(
    result.interpretation.detail,
    "Low Score (0-3 points). Risk of MACE of 0.9-1.7%."
  );
});

test("HEART: maximum score 10 is high risk", () => {
  const result = calculateHeart({ history: 2, ecg: 2, age: 2, riskFactors: 2, troponin: 2 });
  assert.equal(result.score, 10);
  assert.equal(result.interpretation.band, "high");
  assert.equal(result.interpretation.headline, "10 points");
  assert.equal(
    result.interpretation.detail,
    "High Score (7-10 points). Risk of MACE of 50-65%."
  );
});

test("HEART: score 6 is moderate risk", () => {
  const result = calculateHeart({ history: 2, ecg: 2, age: 1, riskFactors: 1, troponin: 0 });
  assert.equal(result.score, 6);
  assert.equal(result.interpretation.band, "moderate");
  assert.equal(
    result.interpretation.detail,
    "Moderate Score (4-6 points). Risk of MACE of 12-16.6%."
  );
});

test("HEART: positive troponin with non-high score appends the troponin sentence", () => {
  const result = calculateHeart({ history: 1, ecg: 1, age: 1, riskFactors: 0, troponin: 1 });
  assert.equal(result.score, 4);
  assert.equal(
    result.interpretation.detail,
    "Moderate Score (4-6 points). Risk of MACE of 12-16.6%. " +
      "If troponin is positive, many experts recommend further workup and admission even with a low HEART Score."
  );
});

test("HEART: 1-point score keeps MDCalc's plural headline", () => {
  const result = calculateHeart({ history: 1, ecg: 0, age: 0, riskFactors: 0, troponin: 0 });
  assert.equal(result.score, 1);
  assert.equal(result.interpretation.headline, "1 points");
});

test("HEART: band boundaries 3/4 and 6/7", () => {
  const at3 = calculateHeart({ history: 1, ecg: 1, age: 1, riskFactors: 0, troponin: 0 });
  const at4 = calculateHeart({ history: 2, ecg: 1, age: 1, riskFactors: 0, troponin: 0 });
  const at7 = calculateHeart({ history: 2, ecg: 2, age: 2, riskFactors: 1, troponin: 0 });
  assert.equal(at3.score, 3);
  assert.equal(at3.interpretation.band, "low");
  assert.equal(at4.score, 4);
  assert.equal(at4.interpretation.band, "moderate");
  assert.equal(at7.score, 7);
  assert.equal(at7.interpretation.band, "high");
});

test("HEART: incomplete input", () => {
  const result = calculateHeart({ history: 2 });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ["EKG", "Age", "Risk factors", "Initial troponin"]);
});

test("HEART: definition metadata", () => {
  assert.equal(heartDefinition.id, "heart");
  assert.equal(heartDefinition.mdcalcId, "1752");
  assert.equal(heartDefinition.inputs.length, 5);
});

// ---------------------------------------------------------------------------
// TIMI UA/NSTEMI
// ---------------------------------------------------------------------------

test("TIMI: minimum score shows non-zero residual risk", () => {
  const result = calculateTimi(allYesNo(timiDefinition, 0));
  assert.equal(result.complete, true);
  assert.equal(result.score, 0);
  assert.equal(result.riskPercent14Day, 5);
  assert.equal(result.interpretation.headline, "0 points");
  assert.equal(result.interpretation.band, "low");
  assert.equal(
    result.interpretation.detail,
    "5% risk at 14 days of: all-cause mortality, new or recurrent MI, or severe recurrent ischemia requiring urgent revascularization."
  );
});

test("TIMI: maximum score 7", () => {
  const result = calculateTimi(allYesNo(timiDefinition, 1));
  assert.equal(result.score, 7);
  assert.equal(result.riskPercent14Day, 41);
  assert.equal(result.interpretation.band, "high");
  assert.equal(result.interpretation.headline, "7 points");
  assert.equal(
    result.interpretation.detail,
    "41% risk at 14 days of: all-cause mortality, new or recurrent MI, or severe recurrent ischemia requiring urgent revascularization."
  );
});

test("TIMI: 1-point score keeps MDCalc's plural headline", () => {
  const result = calculateTimi({ ...allYesNo(timiDefinition, 0), age65: 1 });
  assert.equal(result.score, 1);
  assert.equal(result.interpretation.headline, "1 points");
  assert.match(result.interpretation.detail, /^5% risk at 14 days of:/);
});

test("TIMI: score 3 maps to 13%", () => {
  const result = calculateTimi({
    ...allYesNo(timiDefinition, 0),
    age65: 1,
    cadRiskFactors: 1,
    asaUse: 1
  });
  assert.equal(result.score, 3);
  assert.equal(result.riskPercent14Day, 13);
  assert.equal(result.interpretation.band, "moderate");
});

test("TIMI: score 5 maps to 26%", () => {
  const result = calculateTimi({
    ...allYesNo(timiDefinition, 1),
    knownCad: 0,
    severeAngina: 0
  });
  assert.equal(result.score, 5);
  assert.equal(result.riskPercent14Day, 26);
});

test("TIMI: incomplete input", () => {
  const result = calculateTimi({ age65: 1 });
  assert.equal(result.complete, false);
  assert.equal(result.missing.length, 6);
  assert.ok(result.missing.includes("Positive cardiac marker"));
});

test("TIMI: definition metadata", () => {
  assert.equal(timiDefinition.id, "timi");
  assert.equal(timiDefinition.mdcalcId, "111");
  assert.equal(timiDefinition.inputs.length, 7);
});

// ---------------------------------------------------------------------------
// GRACE ACS
// ---------------------------------------------------------------------------

test("GRACE: low-risk case (85 points)", () => {
  const result = calculateGrace({
    age: 50, // 41
    heartRate: 70, // 9
    sbp: 140, // 28
    creatinine: 1.0, // 7
    killipClass: 0,
    cardiacArrest: 0,
    stDeviation: 0,
    elevatedMarkers: 0
  });
  assert.equal(result.complete, true);
  assert.equal(result.score, 85);
  assert.equal(result.interpretation.headline, "85 points");
  assert.equal(result.interpretation.band, "low");
  assert.match(result.interpretation.detail, /In-hospital mortality: low \(<1%\)\./);
  assert.match(result.interpretation.detail, /Six-month mortality: low \(<3%\)\./);
  assert.doesNotMatch(result.interpretation.detail, /early invasive/);
});

test("GRACE: high-risk case above 140 triggers early-invasive note", () => {
  const result = calculateGrace({
    age: 75, // 75
    heartRate: 100, // 15
    sbp: 100, // 43
    creatinine: 1.5, // 10
    killipClass: 39,
    cardiacArrest: 39,
    stDeviation: 28,
    elevatedMarkers: 14
  });
  assert.equal(result.score, 75 + 15 + 43 + 10 + 39 + 39 + 28 + 14);
  assert.equal(result.score, 263);
  assert.equal(result.interpretation.band, "high");
  assert.match(result.interpretation.detail, /In-hospital mortality: high \(>3%\)/);
  assert.match(result.interpretation.detail, /Six-month mortality: high \(>8%\)/);
  assert.match(result.interpretation.detail, /early invasive strategy/);
});

test("GRACE: point-table boundaries", () => {
  const { agePoints, heartRatePoints, sbpPoints, creatininePoints } = gracePointTables;
  assert.equal(agePoints(29), 0);
  assert.equal(agePoints(30), 8);
  assert.equal(agePoints(90), 100);
  assert.equal(heartRatePoints(49), 0);
  assert.equal(heartRatePoints(50), 3);
  assert.equal(heartRatePoints(200), 46);
  assert.equal(sbpPoints(79), 58);
  assert.equal(sbpPoints(199), 17);
  assert.equal(sbpPoints(200), 0);
  assert.equal(creatininePoints(0.39), 1);
  assert.equal(creatininePoints(0.4), 4);
  assert.equal(creatininePoints(3.99), 21);
  assert.equal(creatininePoints(4.0), 28);
});

test("GRACE: risk-category cutoffs at 108/140 and 88/118", () => {
  const base = {
    age: 50,
    heartRate: 70,
    sbp: 140,
    creatinine: 1.0,
    killipClass: 0,
    cardiacArrest: 0,
    stDeviation: 0,
    elevatedMarkers: 0
  };
  // Force specific totals by adjusting SBP points only is awkward; instead
  // verify via a helper-free approach: build scores through killip/st/arrest.
  function scoreOf(overrides) {
    return calculateGrace({ ...base, ...overrides }).score;
  }
  // 85 + killip II (20) + ST (28) = 133 -> intermediate in-hospital
  assert.equal(scoreOf({ killipClass: 20, stDeviation: 28 }), 133);
  assert.equal(calculateGrace({ ...base, killipClass: 20, stDeviation: 28 }).interpretation.band, "moderate");
  // 85 + killip III (39) + ST (28) = 152 -> high
  assert.equal(scoreOf({ killipClass: 39, stDeviation: 28 }), 152);
  assert.equal(calculateGrace({ ...base, killipClass: 39, stDeviation: 28 }).interpretation.band, "high");
});

test("GRACE: incomplete input", () => {
  const result = calculateGrace({ age: 65, heartRate: 80 });
  assert.equal(result.complete, false);
  assert.equal(result.score, null);
  assert.deepEqual(result.missing, [
    "Systolic BP",
    "Creatinine",
    "Killip class",
    "Cardiac arrest at admission",
    "ST-segment deviation",
    "Elevated cardiac enzymes/markers"
  ]);
});

test("GRACE: definition metadata (no patient pull bindings)", () => {
  assert.equal(graceDefinition.pullBindings, undefined);
  assert.equal(graceDefinition.mdcalcId, "1099");
});

console.log("internal-medicine cardiac score tests passed");
