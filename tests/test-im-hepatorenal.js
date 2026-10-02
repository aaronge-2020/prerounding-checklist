// Tests for the internal-medicine hepatorenal batch: MELDNa, Child-Pugh,
// FIB-4, FENa, and Cockcroft-Gault creatinine clearance.
// Style matches tests/test-clinical-scores.js: node asserts, bare blocks.
// Run: node tests/test-im-hepatorenal.js

import assert from "node:assert/strict";
import { meldnaDefinition, calculateMeldna, meldInitial, meldSodium } from "../src/clinical-scores/meldna.js";
import { childPughDefinition, calculateChildPugh, childPughComponentPoints } from "../src/clinical-scores/child-pugh.js";
import { fib4Definition, calculateFib4 } from "../src/clinical-scores/fib4.js";
import { fenaDefinition, calculateFena, fenaPercent } from "../src/clinical-scores/fena.js";
import { crclDefinition, calculateCrcl, selectWeightKg, idealBodyWeightKg } from "../src/clinical-scores/crcl.js";

const approx = (actual, expected, tolerance = 0.05) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ~${expected}, got ${actual}`);
};

{ // definitions carry the required ids and corrected MDCalc urls
  assert.equal(meldnaDefinition.id, "meldna");
  assert.equal(meldnaDefinition.mdcalcId, "78");
  assert.equal(meldnaDefinition.mdcalcUrl, "https://www.mdcalc.com/calc/78/meld-score-model-end-stage-liver-disease-12-older");
  assert.equal(childPughDefinition.id, "child-pugh");
  assert.equal(childPughDefinition.mdcalcId, "340");
  assert.equal(childPughDefinition.mdcalcUrl, "https://www.mdcalc.com/calc/340/child-pugh-score-cirrhosis-mortality");
  assert.equal(fib4Definition.id, "fib4");
  assert.equal(fib4Definition.mdcalcId, "2200");
  assert.equal(fib4Definition.mdcalcUrl, "https://www.mdcalc.com/calc/2200/fibrosis-4-fib-4-index-liver-fibrosis");
  assert.equal(fenaDefinition.id, "fena");
  assert.equal(fenaDefinition.mdcalcId, "60");
  assert.equal(fenaDefinition.mdcalcUrl, "https://www.mdcalc.com/calc/60/fractional-excretion-sodium-fena");
  assert.equal(crclDefinition.id, "crcl");
  assert.equal(crclDefinition.mdcalcId, "43");
  assert.equal(crclDefinition.mdcalcUrl, "https://www.mdcalc.com/calc/43");
  for (const def of [meldnaDefinition, childPughDefinition, fib4Definition, fenaDefinition, crclDefinition]) {
    assert.ok(def.title && def.subtitle && def.reference && def.inputs.length > 0);
  }
}

{ // MELDNa: classic case, labs above 1, Na within bounds
  // meldi = 10*(0.957*ln(1.0)+0.378*ln(2.0)+1.120*ln(1.5)+0.643) = 13.59 -> 14
  const r = calculateMeldna({ dialysisTwice: 0, cvvhd24: 0, creatinine: 1.0, bilirubin: 2.0, inr: 1.5, sodium: 140 });
  assert.equal(r.complete, true);
  assert.equal(r.meldi, 14);
  assert.equal(r.score, 14); // Na 140 bounded to 137 -> no change, meldi > 11 keeps 14
  assert.equal(r.interpretation.band, "low");
  assert.equal(r.interpretation.headline, "14 points");
  assert.match(r.interpretation.detail, /MELD Score \(2016\)/);
  assert.match(r.interpretation.detail, /Estimated 3-month mortality: 6\.0%/);
}

{ // MELDNa: UNOS worked example with sodium adjustment
  // meldi = 10*(0.957*ln(1.5)+0.378*ln(4.5)+1.120*ln(1.9)+0.643) = 23.19 -> 23
  // 23 + 1.32*5 - 0.033*23*5 = 25.805 -> 26
  const r = calculateMeldna({ dialysisTwice: 0, cvvhd24: 0, creatinine: 1.5, bilirubin: 4.5, inr: 1.9, sodium: 132 });
  assert.equal(r.meldi, 23);
  assert.equal(r.score, 26);
  assert.equal(r.interpretation.headline, "26 points");
  assert.equal(r.interpretation.band, "moderate");
}

{ // MELDNa: dialysis twice in the past week forces creatinine to 4.0
  const withDialysis = calculateMeldna({ dialysisTwice: 1, cvvhd24: 0, creatinine: 0.9, bilirubin: 2.0, inr: 1.5, sodium: 137 });
  const without = calculateMeldna({ dialysisTwice: 0, cvvhd24: 0, creatinine: 0.9, bilirubin: 2.0, inr: 1.5, sodium: 137 });
  assert.ok(withDialysis.score > without.score);
  approx(withDialysis.meldi, 10 * (0.957 * Math.log(4) + 0.378 * Math.log(2) + 1.12 * Math.log(1.5) + 0.643), 0.51);
}

{ // MELDNa: creatinine above 4 is capped at 4 even without dialysis
  const a = calculateMeldna({ dialysisTwice: 0, cvvhd24: 0, creatinine: 6.0, bilirubin: 2.0, inr: 1.5, sodium: 137 });
  const b = calculateMeldna({ dialysisTwice: 0, cvvhd24: 0, creatinine: 4.0, bilirubin: 2.0, inr: 1.5, sodium: 137 });
  assert.equal(a.score, b.score);
}

{ // MELDNa: values below 1.0 are set to 1.0, flooring at 6
  const r = calculateMeldna({ dialysisTwice: 0, cvvhd24: 0, creatinine: 0.5, bilirubin: 0.5, inr: 0.9, sodium: 160 });
  assert.equal(r.meldi, 6);
  assert.equal(r.score, 6); // meldi <= 11 -> no sodium adjustment
  assert.equal(r.interpretation.band, "very-low");
}

{ // MELDNa: sodium bounds 125-137
  const base = { dialysisTwice: 0, cvvhd24: 0, creatinine: 1.5, bilirubin: 4.5, inr: 1.9 };
  assert.equal(calculateMeldna({ ...base, sodium: 120 }).score, calculateMeldna({ ...base, sodium: 125 }).score);
  assert.equal(calculateMeldna({ ...base, sodium: 160 }).score, calculateMeldna({ ...base, sodium: 137 }).score);
  assert.ok(calculateMeldna({ ...base, sodium: 120 }).score > calculateMeldna({ ...base, sodium: 137 }).score);
}

{ // MELDNa: incomplete inputs report missing fields
  const r = calculateMeldna({ dialysisTwice: 0, cvvhd24: 0, creatinine: 1.0, bilirubin: 2.0, inr: 1.5 });
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ["Sodium"]);
}

{ // Child-Pugh: best case = 5 points, Class A
  const r = calculateChildPugh({ bilirubin: 1.0, albumin: 4.0, inr: 1.0, ascites: 1, encephalopathy: 1 });
  assert.equal(r.complete, true);
  assert.equal(r.score, 5);
  assert.deepEqual(r.points, { bilirubin: 1, albumin: 1, inr: 1, ascites: 1, encephalopathy: 1 });
  assert.equal(r.interpretation.headline, "5 points");
  assert.match(r.interpretation.detail, /Child Class A/);
  assert.match(r.interpretation.detail, /Life Expectancy: 15-20 years/);
  assert.match(r.interpretation.detail, /peri-operative mortality: 10%/);
}

{ // Child-Pugh: worst case = 15 points, Class C
  const r = calculateChildPugh({ bilirubin: 5.0, albumin: 2.0, inr: 3.0, ascites: 3, encephalopathy: 3 });
  assert.equal(r.score, 15);
  assert.equal(r.interpretation.headline, "15 points");
  assert.match(r.interpretation.detail, /Child Class C/);
  assert.match(r.interpretation.detail, /Life Expectancy: 1-3 years/);
  assert.match(r.interpretation.detail, /peri-operative mortality: 82%/);
}

{ // Child-Pugh: mixed = 10 points, Class C
  const r = calculateChildPugh({ bilirubin: 2.5, albumin: 3.0, inr: 2.0, ascites: 2, encephalopathy: 2 });
  assert.equal(r.score, 10);
  assert.equal(r.interpretation.headline, "10 points");
  assert.match(r.interpretation.detail, /Child Class C/);
}

{ // Child-Pugh: boundary cutoffs are inclusive on the middle band
  const pts = childPughComponentPoints({ bilirubinMgDl: 2, albuminGDl: 3.5, inr: 1.7, ascites: 1, encephalopathy: 1 });
  assert.deepEqual([pts.bilirubin, pts.albumin, pts.inr], [2, 2, 2]);
  const pts2 = childPughComponentPoints({ bilirubinMgDl: 3, albuminGDl: 2.8, inr: 2.3, ascites: 1, encephalopathy: 1 });
  assert.deepEqual([pts2.bilirubin, pts2.albumin, pts2.inr], [2, 2, 2]);
  const r = calculateChildPugh({ bilirubin: 3, albumin: 2.8, inr: 2.3, ascites: 1, encephalopathy: 1 });
  assert.equal(r.score, 8);
  assert.equal(r.interpretation.headline, "8 points");
  assert.match(r.interpretation.detail, /Child Class B/);
}

{ // Child-Pugh: 9 points, Class B — MDCalc's verbatim result box (live-verified)
  const r = calculateChildPugh({ bilirubin: 2.5, albumin: 3.0, inr: 2.0, ascites: 2, encephalopathy: 1 });
  assert.equal(r.score, 9);
  assert.equal(r.interpretation.headline, "9 points");
  assert.equal(
    r.interpretation.detail,
    "Child Class B. Indication for transplant evaluation. Abdominal surgery peri-operative mortality: 30%."
  );
}

{ // Child-Pugh: SI unit conversions (34 umol/L ~= 1.99 mg/dL -> 1 point; 35 g/L = 3.5 g/dL -> 2 points)
  const r = calculateChildPugh({
    bilirubin: 34, bilirubinUnit: "\u03bcmol/L",
    albumin: 35, albuminUnit: "g/L",
    inr: 1.0, ascites: 1, encephalopathy: 1
  });
  assert.deepEqual([r.points.bilirubin, r.points.albumin], [1, 2]);
  assert.equal(r.score, 6);
}

{ // Child-Pugh: details carry no class-range parenthetical (not in MDCalc's result box)
  const a = calculateChildPugh({ bilirubin: 1.0, albumin: 4.0, inr: 1.0, ascites: 1, encephalopathy: 1 });
  assert.equal(
    a.interpretation.detail,
    "Child Class A. Life Expectancy: 15-20 years. Abdominal surgery peri-operative mortality: 10%."
  );
  const c = calculateChildPugh({ bilirubin: 5.0, albumin: 2.0, inr: 3.0, ascites: 3, encephalopathy: 3 });
  assert.equal(
    c.interpretation.detail,
    "Child Class C. Life Expectancy: 1-3 years. Abdominal surgery peri-operative mortality: 82%."
  );
}

{ // Child-Pugh: incomplete inputs report missing fields
  const r = calculateChildPugh({ bilirubin: 1.0, albumin: 4.0, inr: 1.0, ascites: 1 });
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ["Encephalopathy"]);
}

{ // FIB-4: 55y, AST 45, ALT 40, PLT 180 -> 2475/(180*sqrt(40)) = 2.174 -> indeterminate
  const r = calculateFib4({ ageYears: 55, ast: 45, alt: 40, platelets: 180 });
  assert.equal(r.complete, true);
  approx(r.index, 2.174, 0.005);
  assert.equal(r.interpretation.band, "indeterminate");
  assert.equal(r.interpretation.headline, "2.17 points");
  assert.match(r.interpretation.detail, /Further investigation needed/);
  assert.match(r.interpretation.detail, /Ishak 2-3/);
}

{ // FIB-4: low and high bands
  const low = calculateFib4({ ageYears: 40, ast: 30, alt: 35, platelets: 250 });
  approx(low.index, 0.811, 0.005);
  assert.equal(low.interpretation.band, "low");
  assert.equal(low.interpretation.headline, "0.81 points");
  assert.match(low.interpretation.detail, /Advanced fibrosis excluded/);
  assert.match(low.interpretation.detail, /Ishak 0-1/);
  const high = calculateFib4({ ageYears: 60, ast: 90, alt: 50, platelets: 120 });
  approx(high.index, 6.365, 0.005);
  assert.equal(high.interpretation.band, "high");
  assert.equal(high.interpretation.headline, "6.36 points");
  assert.match(high.interpretation.detail, /METAVIR stage F3-F4/);
  assert.match(high.interpretation.detail, /Ishak 4-6/);
}

{ // FIB-4: age <35 or >65 attaches the caution note
  const r = calculateFib4({ ageYears: 30, ast: 30, alt: 35, platelets: 250 });
  assert.match(r.interpretation.detail, /use with caution/);
}

{ // FIB-4: incomplete and non-positive inputs are rejected
  const missing = calculateFib4({ ageYears: 55, ast: 45, platelets: 180 });
  assert.equal(missing.complete, false);
  assert.ok(missing.missing.some((m) => m.includes("ALT")));
  const zeroAlt = calculateFib4({ ageYears: 55, ast: 45, alt: 0, platelets: 180 });
  assert.equal(zeroAlt.complete, false);
}

{ // FENa: 100*(10*1.0)/(140*80) = 0.089 -> 0.1%, prerenal
  assert.ok(Math.abs(fenaPercent({ serumSodium: 140, serumCreatinine: 1.0, urineSodium: 10, urineCreatinine: 80 }) - 0.0893) < 0.001);
  const r = calculateFena({ serumSodium: 140, serumCreatinine: 1.0, urineSodium: 10, urineCreatinine: 80 });
  assert.equal(r.complete, true);
  assert.equal(r.percent, 0.1);
  assert.equal(r.interpretation.band, "low");
  assert.equal(r.interpretation.headline, "0.1%");
  assert.match(r.interpretation.detail, /^Prerenal\./);
  assert.match(r.interpretation.detail, /contrast-induced nephropathy will often look pre-renal/);
}

{ // FENa: intrinsic case >2%
  // 100*(50*2.5)/(138*25) = 3.62 -> 3.6%
  const r = calculateFena({ serumSodium: 138, serumCreatinine: 2.5, urineSodium: 50, urineCreatinine: 25 });
  assert.equal(r.percent, 3.6);
  assert.equal(r.interpretation.band, "high");
  assert.equal(r.interpretation.headline, "3.6%");
  assert.match(r.interpretation.detail, /^Intrinsic\./);
}

{ // FENa: borderline 1.975% rounds to 2.0% but bands on the unrounded value
  const r = calculateFena({ serumSodium: 135, serumCreatinine: 2.0, urineSodium: 40, urineCreatinine: 30 });
  assert.equal(r.percent, 2);
  assert.equal(r.interpretation.band, "indeterminate");
  assert.equal(r.interpretation.headline, "2.0%");
  assert.match(r.interpretation.detail, /^Indeterminate\./);
}

{ // FENa: incomplete and non-positive inputs are rejected
  const missing = calculateFena({ serumSodium: 140, serumCreatinine: 1.0, urineSodium: 10 });
  assert.equal(missing.complete, false);
  assert.deepEqual(missing.missing, ["Urine creatinine"]);
  const zero = calculateFena({ serumSodium: 140, serumCreatinine: 1.0, urineSodium: 10, urineCreatinine: 0 });
  assert.equal(zero.complete, false);
}

{ // CrCl: no height -> actual body weight; male 65y 80kg Cr 1.0 -> 83.3 mL/min
  const r = calculateCrcl({ sex: "male", ageYears: 65, weight: 80, creatinine: 1.0 });
  assert.equal(r.complete, true);
  assert.equal(r.crcl, 83.3);
  assert.equal(r.weightMethod, "actual");
  assert.equal(r.range, null);
  assert.equal(r.interpretation.headline, "83 mL/min");
  assert.match(r.interpretation.detail, /original Cockcroft-Gault: 83 mL\/min/);
  assert.match(r.interpretation.detail, /no height provided/);
}

{ // CrCl: female factor 0.85 -> 70.8 mL/min
  const r = calculateCrcl({ sex: "female", ageYears: 65, weight: 80, creatinine: 1.0 });
  assert.equal(r.crcl, 70.8);
  assert.equal(r.interpretation.headline, "71 mL/min");
}

{ // CrCl: normal BMI uses ideal body weight, range uses actual
  // male 50y 80kg 180cm: BMI 24.7 -> IBW 75.0kg -> 78.1; actual -> 83.3
  const sel = selectWeightKg({ sex: "male", actualKg: 80, heightCm: 180 });
  assert.equal(sel.method, "ideal");
  approx(sel.weightKg, 75.0, 0.1);
  assert.equal(sel.rangeKg, 80);
  const r = calculateCrcl({ sex: "male", ageYears: 50, weight: 80, creatinine: 1.2, height: 180 });
  assert.equal(r.crcl, 78.1);
  assert.equal(r.weightMethod, "ideal");
  assert.deepEqual(r.range, { low: 78.1, high: 83.3 });
  assert.equal(r.interpretation.headline, "78 mL/min");
  assert.match(r.interpretation.detail, /for normal weight patient, using ideal body weight of 75 kg \(165 lbs\)/);
  assert.match(r.interpretation.detail, /original Cockcroft-Gault: 83 mL\/min/);
  assert.match(r.interpretation.detail, /78\.1-83\.3 mL\/min/);
  assert.match(r.interpretation.detail, /This range uses IBW and actual body weight/);
}

{ // CrCl: BMI >= 25 uses adjusted body weight, range uses ideal
  // female 60y 110kg 165cm: BMI 40.4 -> IBW 56.9kg, ABW 78.1kg -> 67.1; IBW -> 48.9
  const ibw = idealBodyWeightKg("female", 165);
  approx(ibw, 56.9, 0.1);
  const r = calculateCrcl({ sex: "female", ageYears: 60, weight: 110, creatinine: 1.1, height: 165 });
  assert.equal(r.weightMethod, "adjusted");
  assert.equal(r.crcl, 67.1);
  assert.deepEqual(r.range, { low: 48.9, high: 67.1 });
  assert.equal(r.interpretation.headline, "67 mL/min");
  assert.match(r.interpretation.detail, /modified for overweight patient, using adjusted body weight of 78 kg \(172 lbs\)/);
  assert.match(r.interpretation.detail, /original Cockcroft-Gault: 94 mL\/min/);
  assert.match(r.interpretation.detail, /48\.9-67\.1 mL\/min/);
  assert.match(r.interpretation.detail, /This range uses IBW and adjusted body weight/);
}

{ // CrCl: underweight BMI < 18.5 uses actual body weight, no range
  const r = calculateCrcl({ sex: "male", ageYears: 70, weight: 45, creatinine: 0.9, height: 178 });
  approx(r.bmi, 14.2, 0.1);
  assert.equal(r.weightMethod, "actual");
  assert.equal(r.range, null);
  assert.equal(r.crcl, 48.6);
}

{ // CrCl: unit conversions match (lb, umol/L, in) at equal height
  const base = calculateCrcl({ sex: "male", ageYears: 65, weight: 80, creatinine: 1.0, height: 180 });
  const converted = calculateCrcl({
    sex: "male", ageYears: 65,
    weight: 176.37, weightUnit: "lb",
    creatinine: 88.4, creatinineUnit: "\u03bcmol/L",
    height: 70.87, heightUnit: "in"
  });
  approx(converted.crcl, base.crcl, 0.2);
  assert.equal(converted.weightMethod, base.weightMethod);
}

{ // CrCl: incomplete inputs report missing fields
  const r = calculateCrcl({ ageYears: 65, weight: 80, creatinine: 1.0 });
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ["Sex"]);
}

console.log("im hepatorenal batch tests passed");
