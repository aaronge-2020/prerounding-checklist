// Parity tests for the internal-medicine batch D calculators
// (sepsis / GI / metabolic). Each assertion is checked against the MDCalc
// calculator it mirrors:
//   qSOFA             -> MDCalc calc 2654 (RR >=22, SBP <=100, altered mentation; >=2 positive)
//   SOFA              -> MDCalc calc 691 (6 systems, 0-24; vent required for resp 3-4; worst renal criterion)
//   Glasgow-Blatchford-> MDCalc calc 518 (BUN / sex-specific Hgb / SBP bands; 0 = low risk)
//   Anion Gap         -> MDCalc calc 1669 (AG, albumin-corrected AG, delta gap, delta ratio)
//   Corrected Calcium -> MDCalc calc 31 (Payne: Ca + 0.8 x (4 - albumin))
import assert from "node:assert/strict";
import test from "node:test";
import { calculateQsofa, interpretQsofa, QSOFA_INPUTS, qsofaDefinition } from "../src/clinical-scores/qsofa.js";
import { calculateSofa, interpretSofa, SOFA_INPUTS, sofaDefinition } from "../src/clinical-scores/sofa.js";
import { calculateBlatchford, interpretBlatchford, BLATCHFORD_INPUTS, blatchfordDefinition } from "../src/clinical-scores/blatchford.js";
import { calculateAnionGap, interpretAnionGap, interpretDeltaRatio, ANION_GAP_INPUTS, anionGapDefinition } from "../src/clinical-scores/anion-gap.js";
import { calculateCorrectedCalcium, interpretCorrectedCalcium, CORRECTED_CALCIUM_INPUTS, correctedCalciumDefinition } from "../src/clinical-scores/corrected-calcium.js";

// ---------------------------------------------------------------- qSOFA

test("qsofa: input order/labels and vital pulls", () => {
  assert.deepEqual(QSOFA_INPUTS.map((i) => i.label), [
    "Respiratory rate \u226522",
    "Systolic BP \u2264100",
    "Altered mental status"
  ]);
  assert.equal(QSOFA_INPUTS[0].pull.kind, "vital");
  assert.equal(QSOFA_INPUTS[1].pull.kind, "vital");
});

test("qsofa: threshold boundaries", () => {
  const base = { alteredMentalStatus: 0 };
  assert.equal(calculateQsofa({ ...base, respiratoryRate: 22, systolicBp: 120 }).score, 1);
  assert.equal(calculateQsofa({ ...base, respiratoryRate: 21, systolicBp: 120 }).score, 0);
  assert.equal(calculateQsofa({ ...base, respiratoryRate: 16, systolicBp: 100 }).score, 1);
  assert.equal(calculateQsofa({ ...base, respiratoryRate: 16, systolicBp: 101 }).score, 0);
  assert.equal(calculateQsofa({ respiratoryRate: 16, systolicBp: 120, alteredMentalStatus: 1 }).score, 1);
});

test("qsofa: positive band at >=2 and missing inputs", () => {
  const positive = calculateQsofa({ respiratoryRate: 24, systolicBp: 95, alteredMentalStatus: 1 });
  assert.equal(positive.score, 3);
  assert.equal(positive.interpretation.band, "positive");
  assert.equal(positive.interpretation.headline, "3 points");
  assert.match(positive.interpretation.detail, /High risk\. qSOFA Scores 2-3 are associated with a 3- to 14-fold increase in in-hospital mortality\./);

  // Report Case A (2 points) and Case B (0 points), observed live 2026-09-26.
  const caseA = calculateQsofa({ respiratoryRate: 24, systolicBp: 95, alteredMentalStatus: 0 });
  assert.equal(caseA.interpretation.headline, "2 points");
  assert.match(caseA.interpretation.detail, /3- to 14-fold increase in in-hospital mortality/);
  const caseB = calculateQsofa({ respiratoryRate: 16, systolicBp: 120, alteredMentalStatus: 0 });
  assert.equal(caseB.interpretation.headline, "0 points");
  assert.match(caseB.interpretation.detail, /Not high risk\. If sepsis is still suspected/);

  const negative = calculateQsofa({ respiratoryRate: 24, systolicBp: 120, alteredMentalStatus: 0 });
  assert.equal(negative.interpretation.band, "negative");
  assert.equal(negative.interpretation.headline, "1 points");

  const empty = calculateQsofa({});
  assert.equal(empty.complete, false);
  assert.deepEqual(empty.missing, ["Respiratory rate \u226522", "Systolic BP \u2264100", "Altered mental status"]);
  assert.equal(empty.interpretation, null);
});

// ---------------------------------------------------------------- SOFA

test("sofa: input order/labels", () => {
  assert.deepEqual(SOFA_INPUTS.map((i) => i.label), [
    "PaO2",
    "FiO2",
    "On mechanical ventilation",
    "Platelets, \u00d710\u00b3/\u00b5L",
    "Glasgow Coma Scale",
    "Bilirubin",
    "Mean arterial pressure OR administration of vasoactive agents required",
    "Creatinine",
    "Urine output"
  ]);
  // MDCalc FiO2 is a percent, not a fraction.
  const fio2Input = SOFA_INPUTS.find((i) => i.key === "fio2");
  assert.equal(fio2Input.unit, "%");
  assert.equal(fio2Input.min, 21);
  assert.equal(fio2Input.max, 100);
  // MDCalc cardiovascular option labels, verbatim.
  assert.deepEqual(SOFA_INPUTS.find((i) => i.key === "cardiovascular").options.map((o) => o.label), [
    "No hypotension 0",
    "MAP <70 mmHg +1",
    "DOPamine \u22645 or DOBUTamine (any dose) +2",
    "DOPamine >5, EPINEPHrine \u22640.1, or norEPINEPHrine \u22640.1 +3",
    "DOPamine >15, EPINEPHrine >0.1, or norEPINEPHrine >0.1 +4"
  ]);
});

const SOFA_BASE = {
  pao2: 400,
  fio2: 21,
  mechanicalVentilation: 0,
  platelets: 200,
  gcs: 15,
  bilirubin: 0.8,
  cardiovascular: 0,
  creatinine: 0.8
};

test("sofa: respiratory scoring needs ventilatory support for 3-4", () => {
  // PaO2/FiO2 = 150
  const vent = calculateSofa({ ...SOFA_BASE, pao2: 90, fio2: 60, mechanicalVentilation: 1 });
  assert.equal(vent.subscores.respiration, 3);
  const noVent = calculateSofa({ ...SOFA_BASE, pao2: 90, fio2: 60, mechanicalVentilation: 0 });
  assert.equal(noVent.subscores.respiration, 2);
  // PaO2/FiO2 = 80
  const severe = calculateSofa({ ...SOFA_BASE, pao2: 80, fio2: 100, mechanicalVentilation: 1 });
  assert.equal(severe.subscores.respiration, 4);
  // Boundaries: 300 -> 1, 299 -> 2 (without vent), 400 -> 0
  assert.equal(calculateSofa({ ...SOFA_BASE, pao2: 300, fio2: 100 }).subscores.respiration, 1);
  assert.equal(calculateSofa({ ...SOFA_BASE, pao2: 299, fio2: 100 }).subscores.respiration, 2);
  assert.equal(calculateSofa({ ...SOFA_BASE, pao2: 400, fio2: 100 }).subscores.respiration, 0);
});

test("sofa: coagulation / liver / CNS thresholds", () => {
  assert.equal(calculateSofa({ ...SOFA_BASE, platelets: 149 }).subscores.coagulation, 1);
  assert.equal(calculateSofa({ ...SOFA_BASE, platelets: 99 }).subscores.coagulation, 2);
  assert.equal(calculateSofa({ ...SOFA_BASE, platelets: 49 }).subscores.coagulation, 3);
  assert.equal(calculateSofa({ ...SOFA_BASE, platelets: 19 }).subscores.coagulation, 4);
  assert.equal(calculateSofa({ ...SOFA_BASE, bilirubin: 1.2 }).subscores.liver, 1);
  assert.equal(calculateSofa({ ...SOFA_BASE, bilirubin: 2.0 }).subscores.liver, 2);
  assert.equal(calculateSofa({ ...SOFA_BASE, bilirubin: 6.0 }).subscores.liver, 3);
  assert.equal(calculateSofa({ ...SOFA_BASE, bilirubin: 12.0 }).subscores.liver, 4);
  assert.equal(calculateSofa({ ...SOFA_BASE, gcs: 14 }).subscores.cns, 1);
  assert.equal(calculateSofa({ ...SOFA_BASE, gcs: 12 }).subscores.cns, 2);
  assert.equal(calculateSofa({ ...SOFA_BASE, gcs: 9 }).subscores.cns, 3);
  assert.equal(calculateSofa({ ...SOFA_BASE, gcs: 5 }).subscores.cns, 4);
});

test("sofa: renal takes the worst of creatinine or urine output", () => {
  // Creatinine 1.0 alone scores 0, but oliguria <500 mL/day forces 3.
  assert.equal(calculateSofa({ ...SOFA_BASE, creatinine: 1.0, urineOutput: 400 }).subscores.renal, 3);
  // Anuria <200 mL/day forces 4 even with a low creatinine.
  assert.equal(calculateSofa({ ...SOFA_BASE, creatinine: 1.0, urineOutput: 150 }).subscores.renal, 4);
  // Creatinine alone still scores when urine output is absent.
  assert.equal(calculateSofa({ ...SOFA_BASE, creatinine: 6.0 }).subscores.renal, 4);
  assert.equal(calculateSofa({ ...SOFA_BASE, creatinine: 1.2 }).subscores.renal, 1);
  assert.equal(calculateSofa({ ...SOFA_BASE, creatinine: 2.0 }).subscores.renal, 2);
  assert.equal(calculateSofa({ ...SOFA_BASE, creatinine: 3.5 }).subscores.renal, 3);
  // High urine output does not lower the creatinine score.
  assert.equal(calculateSofa({ ...SOFA_BASE, creatinine: 2.5, urineOutput: 2000 }).subscores.renal, 2);
});

test("sofa: full-case total and missing handling", () => {
  const result = calculateSofa({
    pao2: 90, fio2: 30, mechanicalVentilation: 0, // ratio 300 -> 1
    platelets: 120, // 1
    gcs: 14, // 1
    bilirubin: 2.5, // 2
    cardiovascular: 1, // 1
    creatinine: 1.5 // 1
  });
  assert.equal(result.complete, true);
  assert.equal(result.score, 7);
  assert.equal(result.interpretation.headline, "7 points");
  assert.match(result.interpretation.detail, /Initial SOFA Scores \u22649 predict \u226433\.3% mortality/);

  // Report-style 6-point case: "6 points" with the mortality line.
  const six = calculateSofa({
    pao2: 250, fio2: 50, mechanicalVentilation: 0, // ratio 500 -> 0
    platelets: 100, // 1
    gcs: 13, // 1
    bilirubin: 2.5, // 2
    cardiovascular: 1, // 1
    creatinine: 1.5 // 1
  });
  assert.equal(six.score, 6);
  assert.equal(six.interpretation.headline, "6 points");
  assert.match(six.interpretation.detail, /Initial SOFA Scores \u22649 predict \u226433\.3% mortality/);

  // Urine output is optional: absent is fine, present-but-blank is fine.
  assert.equal(calculateSofa({ ...SOFA_BASE }).complete, true);

  const missing = calculateSofa({ ...SOFA_BASE, creatinine: undefined });
  assert.equal(missing.complete, false);
  assert.ok(missing.missing.includes("Creatinine"));
});

// ---------------------------------------------------------------- Glasgow-Blatchford

test("blatchford: input order/labels", () => {
  assert.deepEqual(BLATCHFORD_INPUTS.map((i) => i.label), [
    "Hemoglobin",
    "BUN",
    "Initial systolic BP",
    "Sex",
    "Heart rate \u2265100",
    "Melena present",
    "Recent syncope",
    "Hepatic disease history",
    "Cardiac failure present"
  ]);
});

const GBS_BASE = {
  hemoglobin: 14,
  bun: 15,
  systolicBp: 120,
  sex: "male",
  heartRate: 80,
  melena: 0,
  syncope: 0,
  hepaticDisease: 0,
  cardiacFailure: 0
};

test("blatchford: sex-specific hemoglobin bands", () => {
  assert.equal(calculateBlatchford({ ...GBS_BASE, hemoglobin: 12.5 }).points.hemoglobin, 1);
  assert.equal(calculateBlatchford({ ...GBS_BASE, sex: "female", hemoglobin: 12.5 }).points.hemoglobin, 0);
  assert.equal(calculateBlatchford({ ...GBS_BASE, hemoglobin: 11.5 }).points.hemoglobin, 3);
  assert.equal(calculateBlatchford({ ...GBS_BASE, sex: "female", hemoglobin: 11.5 }).points.hemoglobin, 1);
  assert.equal(calculateBlatchford({ ...GBS_BASE, hemoglobin: 9.5 }).points.hemoglobin, 6);
  assert.equal(calculateBlatchford({ ...GBS_BASE, sex: "female", hemoglobin: 9.5 }).points.hemoglobin, 6);
  // Boundaries: men 13.0 -> 0, 12.0 -> 1, 10.0 -> 3; women 12.0 -> 0, 10.0 -> 1
  assert.equal(calculateBlatchford({ ...GBS_BASE, hemoglobin: 13.0 }).points.hemoglobin, 0);
  assert.equal(calculateBlatchford({ ...GBS_BASE, hemoglobin: 12.0 }).points.hemoglobin, 1);
  assert.equal(calculateBlatchford({ ...GBS_BASE, hemoglobin: 10.0 }).points.hemoglobin, 3);
  assert.equal(calculateBlatchford({ ...GBS_BASE, sex: "female", hemoglobin: 12.0 }).points.hemoglobin, 0);
  assert.equal(calculateBlatchford({ ...GBS_BASE, sex: "female", hemoglobin: 10.0 }).points.hemoglobin, 1);
});

test("blatchford: BUN and systolic BP bands", () => {
  assert.equal(calculateBlatchford({ ...GBS_BASE, bun: 18.1 }).points.bun, 0);
  assert.equal(calculateBlatchford({ ...GBS_BASE, bun: 18.2 }).points.bun, 2);
  assert.equal(calculateBlatchford({ ...GBS_BASE, bun: 22.4 }).points.bun, 3);
  assert.equal(calculateBlatchford({ ...GBS_BASE, bun: 28 }).points.bun, 4);
  assert.equal(calculateBlatchford({ ...GBS_BASE, bun: 70 }).points.bun, 6);
  assert.equal(calculateBlatchford({ ...GBS_BASE, systolicBp: 110 }).points.systolicBp, 0);
  assert.equal(calculateBlatchford({ ...GBS_BASE, systolicBp: 109 }).points.systolicBp, 1);
  assert.equal(calculateBlatchford({ ...GBS_BASE, systolicBp: 99 }).points.systolicBp, 2);
  assert.equal(calculateBlatchford({ ...GBS_BASE, systolicBp: 89 }).points.systolicBp, 3);
});

test("blatchford: full-case total, zero-risk band, and missing inputs", () => {
  const sick = calculateBlatchford({
    hemoglobin: 11.0, sex: "male", // 3
    bun: 30, // 4
    systolicBp: 95, // 2
    heartRate: 105, // 1
    melena: 1, // 1
    syncope: 0, hepaticDisease: 0, cardiacFailure: 0
  });
  assert.equal(sick.score, 11);
  assert.equal(sick.interpretation.headline, "11 points");
  assert.equal(sick.interpretation.band, "admit");
  assert.match(sick.interpretation.detail, /"High Risk" GI bleed/);
  assert.match(sick.interpretation.detail, /hemodynamic resuscitation prior to risk stratification/);

  // Report Case A: 19 points, observed live 2026-09-26.
  const caseA = calculateBlatchford({
    hemoglobin: 9.5, sex: "male", // 6
    bun: 75, // 6
    systolicBp: 85, // 3
    heartRate: 105, // 1
    melena: 1, // 1
    syncope: 0, hepaticDisease: 0, cardiacFailure: 1 // 2
  });
  assert.equal(caseA.score, 19);
  assert.equal(caseA.interpretation.headline, "19 points");
  assert.match(caseA.interpretation.detail, /scores \u22656 are associated with >50% risk of needing intervention/);

  const zero = calculateBlatchford(GBS_BASE);
  assert.equal(zero.score, 0);
  assert.equal(zero.interpretation.band, "low-risk");
  assert.equal(zero.interpretation.headline, "0 points");
  // Report Case B wording, observed live 2026-09-26.
  assert.match(zero.interpretation.detail, /A GBS of 0 is a "Low Risk" GI bleed/);
  assert.match(zero.interpretation.detail, /99\.6% in a 2007 retrospective study/);

  // Clinical history points add up.
  const history = calculateBlatchford({ ...GBS_BASE, syncope: 1, hepaticDisease: 1, cardiacFailure: 1 });
  assert.equal(history.score, 6);

  const empty = calculateBlatchford({});
  assert.equal(empty.complete, false);
  assert.equal(empty.missing.length, 9);
});

// ---------------------------------------------------------------- Anion gap

test("anion-gap: input order/labels, albumin optional", () => {
  assert.deepEqual(ANION_GAP_INPUTS.map((i) => i.label), ["Sodium", "Chloride", "Bicarbonate", "Albumin"]);
  assert.equal(ANION_GAP_INPUTS[3].required, false);
});

test("anion-gap: basic calculation and delta gap", () => {
  const basic = calculateAnionGap({ sodium: 140, chloride: 105, bicarbonate: 24 });
  assert.equal(basic.complete, true);
  assert.equal(basic.result.anionGap, 11);
  assert.equal(basic.result.deltaGap, -1);
  // MDCalc always shows the delta ratio; delta bicarbonate 0 -> -Infinity.
  assert.equal(basic.result.deltaRatio, -Infinity);
  assert.equal(basic.result.correctedAnionGap, undefined);
  assert.equal(basic.interpretation.headline, "11.0 mEq/L");
  assert.match(basic.interpretation.detail, /Delta gap: -1\.0 mEq\/L\./);
  assert.match(basic.interpretation.detail, /Delta ratio: -Infinity; Pure normal anion gap acidosis\./);
});

test("anion-gap: delta ratio bands", () => {
  const high = calculateAnionGap({ sodium: 140, chloride: 100, bicarbonate: 16 });
  assert.equal(high.result.anionGap, 24);
  assert.equal(high.result.deltaGap, 12);
  assert.equal(high.result.deltaRatio, 1.5);
  assert.match(high.interpretation.detail, /Delta ratio: 1\.5; Pure anion gap acidosis\./);

  assert.equal(interpretDeltaRatio(0.3), "Pure normal anion gap acidosis.");
  assert.equal(interpretDeltaRatio(0.4), "Mixed high and normal anion gap acidosis.");
  assert.equal(interpretDeltaRatio(0.8), "Mixed high and normal anion gap acidosis.");
  assert.equal(interpretDeltaRatio(2.0), "Pure anion gap acidosis.");
  assert.equal(interpretDeltaRatio(2.5), "High anion gap acidosis with pre-existing metabolic alkalosis.");
  assert.equal(interpretDeltaRatio(-Infinity), "Pure normal anion gap acidosis.");

  // Delta bicarbonate 0 with a nonzero delta gap -> +/-Infinity;
  // delta gap 0 too -> NaN (ratio omitted from the display).
  assert.equal(calculateAnionGap({ sodium: 140, chloride: 100, bicarbonate: 24 }).result.deltaRatio, Infinity);
  assert.ok(Number.isNaN(calculateAnionGap({ sodium: 140, chloride: 104, bicarbonate: 24 }).result.deltaRatio));
});

test("anion-gap: report Case A (140/100/18/4.0), observed live 2026-09-26", () => {
  const result = calculateAnionGap({ sodium: 140, chloride: 100, bicarbonate: 18, albumin: 4.0 });
  assert.equal(result.interpretation.headline, "22.0 mEq/L");
  assert.match(result.interpretation.detail, /Delta gap: 10\.0 mEq\/L\./);
  assert.match(result.interpretation.detail, /Delta ratio: 1\.7; Pure anion gap acidosis\./);
  assert.match(result.interpretation.detail, /Albumin corrected anion gap 22\.0 mEq\/L; suggests high anion gap acidosis\./);
  assert.match(result.interpretation.detail, /Albumin corrected delta gap: 10\.0 mEq\/L\./);
  assert.match(result.interpretation.detail, /Albumin corrected delta ratio: 1\.7\./);
});

test("anion-gap: report Case B (140/105/24/4.0), observed live 2026-09-26", () => {
  const result = calculateAnionGap({ sodium: 140, chloride: 105, bicarbonate: 24, albumin: 4.0 });
  assert.equal(result.interpretation.headline, "11.0 mEq/L");
  assert.match(result.interpretation.detail, /Delta gap: -1\.0 mEq\/L\./);
  assert.match(result.interpretation.detail, /Delta ratio: -Infinity; Pure normal anion gap acidosis\./);
  assert.match(result.interpretation.detail, /Albumin corrected anion gap 11\.0 mEq\/L; suggests non-anion gap acidosis\./);
  assert.match(result.interpretation.detail, /Albumin corrected delta ratio: -Infinity\./);
});

test("anion-gap: albumin correction", () => {
  const corrected = calculateAnionGap({ sodium: 140, chloride: 100, bicarbonate: 16, albumin: 2 });
  assert.equal(corrected.result.correctedAnionGap, 29);
  assert.equal(corrected.result.correctedDeltaGap, 17);
  assert.equal(corrected.result.correctedDeltaRatio, 2.125);
  assert.match(corrected.interpretation.detail, /Albumin corrected anion gap 29\.0 mEq\/L; suggests high anion gap acidosis\./);
  assert.match(corrected.interpretation.detail, /Albumin corrected delta ratio: 2\.1\./);

  // Albumin blank ("") is treated as not supplied, not as missing.
  const blank = calculateAnionGap({ sodium: 140, chloride: 105, bicarbonate: 24, albumin: "" });
  assert.equal(blank.complete, true);
  assert.equal(blank.result.correctedAnionGap, undefined);
});

test("anion-gap: missing inputs", () => {
  const missing = calculateAnionGap({ chloride: 100, bicarbonate: 24 });
  assert.equal(missing.complete, false);
  assert.deepEqual(missing.missing, ["Sodium"]);
  assert.equal(missing.interpretation, null);
});

// ---------------------------------------------------------------- Corrected calcium

test("corrected-calcium: formula, default normal albumin, and rounding", () => {
  const basic = calculateCorrectedCalcium({ calcium: 8, albumin: 2.5 });
  assert.equal(basic.result.correctedCalcium, 9.2);
  // MDCalc shows one decimal place plus the SI equivalent.
  assert.equal(basic.interpretation.headline, "9.2 mg/dL");
  assert.match(basic.interpretation.detail, /Equivalent to 2\.3 mmol\/L\./);

  // Normal albumin defaults to 4.0 g/dL when left blank.
  const defaulted = calculateCorrectedCalcium({ calcium: 9, albumin: 3 });
  assert.equal(defaulted.result.correctedCalcium, 9.8);
  assert.equal(defaulted.result.normalAlbumin, 4);

  // Explicit normal albumin is honored.
  const custom = calculateCorrectedCalcium({ calcium: 9, albumin: 3, normalAlbumin: 4.4 });
  assert.equal(custom.result.correctedCalcium, 10.1);
});

test("corrected-calcium: report cases, observed live 2026-09-26", () => {
  const caseA = calculateCorrectedCalcium({ calcium: 8.4, albumin: 3.0 });
  assert.equal(caseA.interpretation.headline, "9.2 mg/dL");
  assert.match(caseA.interpretation.detail, /Equivalent to 2\.3 mmol\/L\./);
  const caseB = calculateCorrectedCalcium({ calcium: 8.7, albumin: 3.0 });
  assert.equal(caseB.interpretation.headline, "9.5 mg/dL");
  assert.match(caseB.interpretation.detail, /Equivalent to 2\.4 mmol\/L\./);
});

test("corrected-calcium: normal-range bands and missing inputs", () => {
  assert.equal(calculateCorrectedCalcium({ calcium: 8, albumin: 2.5 }).interpretation.band, "normal");
  assert.equal(calculateCorrectedCalcium({ calcium: 7, albumin: 2.5 }).interpretation.band, "low");
  assert.equal(calculateCorrectedCalcium({ calcium: 11, albumin: 4 }).interpretation.band, "high");
  assert.match(calculateCorrectedCalcium({ calcium: 7, albumin: 2.5 }).interpretation.detail, /diagnostic evaluation/);

  const missing = calculateCorrectedCalcium({});
  assert.equal(missing.complete, false);
  assert.deepEqual(missing.missing, ["Calcium", "Albumin"]);
});

// ---------------------------------------------------------------- Definitions / metadata

test("definitions: ids and MDCalc metadata", () => {
  assert.equal(qsofaDefinition.id, "qsofa");
  assert.equal(sofaDefinition.id, "sofa");
  assert.equal(blatchfordDefinition.id, "blatchford");
  assert.equal(anionGapDefinition.id, "anion-gap");
  assert.equal(correctedCalciumDefinition.id, "corrected-calcium");

  assert.equal(qsofaDefinition.mdcalcId, "2654");
  assert.equal(sofaDefinition.mdcalcId, "691");
  assert.equal(blatchfordDefinition.mdcalcId, "518");
  assert.equal(anionGapDefinition.mdcalcId, "1669");
  assert.equal(correctedCalciumDefinition.mdcalcId, "31");

  for (const def of [qsofaDefinition, sofaDefinition, blatchfordDefinition, anionGapDefinition, correctedCalciumDefinition]) {
    assert.ok(def.mdcalcUrl.includes(`/calc/${def.mdcalcId}/`), `${def.id} mdcalcUrl`);
    assert.ok(def.title && def.reference && Array.isArray(def.inputs) && typeof def.calculate === "function");
  }
});

test("definitions: calculate via definition matches module export", () => {
  const values = { respiratoryRate: 24, systolicBp: 95, alteredMentalStatus: 1 };
  assert.deepEqual(qsofaDefinition.calculate(values), calculateQsofa(values));
});
