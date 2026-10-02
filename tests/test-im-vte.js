// Parity tests for the internal-medicine batch B calculators (VTE / pneumonia / pleural).
// Each assertion is checked against the MDCalc calculator it mirrors:
//   Wells DVT -> MDCalc calc 362 (10 criteria, +1 each / -2 alternative dx; <=0 unlikely, 1-2 moderate, >=3 likely)
//   Wells PE  -> MDCalc calc 115 (7 criteria, +3/+3/+1.5/+1.5/+1.5/+1/+1; three-tier + two-tier models)
//   PERC      -> MDCalc calc 347 (8 criteria, +1 each; 0 = PERC negative)
//   CURB-65   -> MDCalc calc 324 (5 criteria, +1 each; 0-1 / 2 / >=3 disposition bands)
//   Light's   -> MDCalc calc 797 (5 numeric inputs; exudative if ANY of 3 criteria met)
import assert from "node:assert/strict";
import test from "node:test";
import { calculateWellsDvt, interpretWellsDvt, WELLS_DVT_INPUTS } from "../src/clinical-scores/wells-dvt.js";
import { calculateWellsPe, interpretWellsPe, WELLS_PE_INPUTS } from "../src/clinical-scores/wells-pe.js";
import { calculatePerc, interpretPerc, PERC_INPUTS } from "../src/clinical-scores/perc.js";
import { calculateCurb65, interpretCurb65, CURB65_INPUTS } from "../src/clinical-scores/curb65.js";
import { calculateLights, interpretLights, LIGHTS_INPUTS } from "../src/clinical-scores/lights.js";
import { wellsDvtDefinition } from "../src/clinical-scores/wells-dvt.js";
import { wellsPeDefinition } from "../src/clinical-scores/wells-pe.js";
import { percDefinition } from "../src/clinical-scores/perc.js";
import { curb65Definition } from "../src/clinical-scores/curb65.js";
import { lightsDefinition } from "../src/clinical-scores/lights.js";

const NO = {
  activeCancer: 0, bedriddenOrSurgery: 0, calfSwelling: 0, collateralVeins: 0,
  entireLegSwollen: 0, localizedTenderness: 0, pittingEdema: 0,
  paralysisOrImmobilization: 0, priorDvt: 0, alternativeDiagnosis: 0
};

test("wells-dvt: scoring and MDCalc order/labels", () => {
  assert.deepEqual(
    WELLS_DVT_INPUTS.map((i) => i.label),
    [
      "Active cancer / Treatment or palliation within 6 months",
      "Bedridden recently >3 days or major surgery within 12 weeks",
      "Calf swelling >3 cm compared to the other leg / Measured 10 cm below tibial tuberosity",
      "Collateral (nonvaricose) superficial veins present",
      "Entire leg swollen",
      "Localized tenderness along the deep venous system",
      "Pitting edema, confined to symptomatic leg",
      "Paralysis, paresis, or recent plaster immobilization of the lower extremity",
      "Previously documented DVT",
      "Alternative diagnosis to DVT as likely or more likely"
    ]
  );
  const none = calculateWellsDvt(NO);
  assert.equal(none.complete, true);
  assert.equal(none.score, 0);
  assert.equal(none.interpretation.band, "unlikely");

  const altOnly = calculateWellsDvt({ ...NO, alternativeDiagnosis: -2 });
  assert.equal(altOnly.score, -2);
  assert.equal(altOnly.interpretation.band, "unlikely");

  const mod1 = calculateWellsDvt({ ...NO, calfSwelling: 1 });
  assert.equal(mod1.score, 1);
  assert.equal(mod1.interpretation.band, "moderate");
  const mod2 = calculateWellsDvt({ ...NO, calfSwelling: 1, pittingEdema: 1 });
  assert.equal(mod2.score, 2);
  assert.equal(mod2.interpretation.band, "moderate");

  const likely = calculateWellsDvt({ ...NO, calfSwelling: 1, pittingEdema: 1, entireLegSwollen: 1 });
  assert.equal(likely.score, 3);
  assert.equal(likely.interpretation.band, "likely");
  assert.equal(likely.interpretation.headline, "3 points");
  assert.equal(likely.interpretation.detail, "High risk group for DVT. \"Likely\" according to Wells' DVT studies.");
  assert.equal(none.interpretation.detail, "Low risk group for DVT. \"Unlikely\" according to Wells' DVT studies.");
  assert.equal(mod1.interpretation.detail, "Moderate risk group for DVT.");

  const max = calculateWellsDvt({
    activeCancer: 1, bedriddenOrSurgery: 1, calfSwelling: 1, collateralVeins: 1,
    entireLegSwollen: 1, localizedTenderness: 1, pittingEdema: 1,
    paralysisOrImmobilization: 1, priorDvt: 1, alternativeDiagnosis: 0
  });
  assert.equal(max.score, 9);

  const partial = calculateWellsDvt({ activeCancer: 1 });
  assert.equal(partial.complete, false);
  assert.equal(partial.missing.length, 9);
  assert.ok(partial.missing.includes("Previously documented DVT"));
});

test("wells-pe: scoring, fractional points, both models", () => {
  assert.deepEqual(
    WELLS_PE_INPUTS.map((i) => i.label),
    [
      "Clinical signs and symptoms of DVT",
      "PE is #1 diagnosis OR equally likely",
      "Heart rate >100",
      "Immobilization at least 3 days OR surgery in the previous 4 weeks",
      "Previous, objectively diagnosed PE or DVT",
      "Hemoptysis",
      "Malignancy w/ treatment within 6 months or palliative"
    ]
  );
  const none = calculateWellsPe({
    dvtSigns: 0, peMostLikely: 0, heartRateOver100: 0, immobilizationOrSurgery: 0,
    priorVte: 0, hemoptysis: 0, malignancy: 0
  });
  assert.equal(none.score, 0);
  assert.equal(none.interpretation.band, "low");
  assert.equal(none.interpretation.headline, "0 points");

  const half = calculateWellsPe({
    dvtSigns: 0, peMostLikely: 0, heartRateOver100: 1.5, immobilizationOrSurgery: 0,
    priorVte: 0, hemoptysis: 0, malignancy: 0
  });
  assert.equal(half.score, 1.5);
  assert.equal(half.interpretation.headline, "1.5 points");

  const mod = calculateWellsPe({
    dvtSigns: 0, peMostLikely: 0, heartRateOver100: 1.5, immobilizationOrSurgery: 1.5,
    priorVte: 0, hemoptysis: 0, malignancy: 0
  });
  assert.equal(mod.score, 3);
  assert.equal(mod.interpretation.band, "moderate");
  assert.match(mod.interpretation.detail, /"PE Unlikely" and had a 3% incidence of PE/);

  const boundary4 = interpretWellsPe(4);
  assert.equal(boundary4.band, "moderate");
  assert.match(boundary4.detail, /PE Unlikely/);
  const likely = interpretWellsPe(4.5);
  assert.equal(likely.band, "moderate");
  assert.match(likely.detail, /PE Likely/);

  const high = interpretWellsPe(7.5);
  assert.equal(high.band, "high");
  assert.equal(high.headline, "7.5 points");
  assert.match(high.detail, /High risk group: 40\.6% chance of PE in an ED population/);
  assert.match(high.detail, /"PE Likely" and had a 28% incidence of PE/);
  assert.match(none.interpretation.detail, /Low risk group: 1\.3% chance of PE in an ED population/);

  const max = calculateWellsPe({
    dvtSigns: 3, peMostLikely: 3, heartRateOver100: 1.5, immobilizationOrSurgery: 1.5,
    priorVte: 1.5, hemoptysis: 1, malignancy: 1
  });
  assert.equal(max.score, 12.5);
  assert.equal(max.interpretation.band, "high");

  const partial = calculateWellsPe({ dvtSigns: 3 });
  assert.equal(partial.complete, false);
  assert.equal(partial.missing.length, 6);
});

test("perc: negative/positive and MDCalc order/labels", () => {
  assert.deepEqual(
    PERC_INPUTS.map((i) => i.label),
    [
      "Age \u226550",
      "HR \u2265100",
      "O\u2082 sat on room air <95%",
      "Unilateral leg swelling",
      "Hemoptysis",
      "Recent surgery or trauma",
      "Prior PE or DVT",
      "Hormone use"
    ]
  );
  const negative = calculatePerc({
    ageAtLeast50: 0, heartRateAtLeast100: 0, o2SatBelow95: 0, unilateralLegSwelling: 0,
    hemoptysis: 0, recentSurgeryOrTrauma: 0, priorPeOrDvt: 0, hormoneUse: 0
  });
  assert.equal(negative.score, 0);
  assert.equal(negative.interpretation.band, "negative");
  assert.equal(negative.interpretation.headline, "0 criteria");
  assert.match(negative.interpretation.detail, /No need for further workup, as <2% chance of PE/);

  const positive = calculatePerc({
    ageAtLeast50: 1, heartRateAtLeast100: 0, o2SatBelow95: 0, unilateralLegSwelling: 0,
    hemoptysis: 0, recentSurgeryOrTrauma: 0, priorPeOrDvt: 0, hormoneUse: 0
  });
  assert.equal(positive.score, 1);
  assert.equal(positive.interpretation.band, "positive");
  assert.equal(positive.interpretation.headline, "1 criteria");
  assert.match(positive.interpretation.detail, /cannot be used to rule out PE/);

  const all = calculatePerc({
    ageAtLeast50: 1, heartRateAtLeast100: 1, o2SatBelow95: 1, unilateralLegSwelling: 1,
    hemoptysis: 1, recentSurgeryOrTrauma: 1, priorPeOrDvt: 1, hormoneUse: 1
  });
  assert.equal(all.score, 8);
  assert.equal(interpretPerc(0).band, "negative");

  const partial = calculatePerc({ ageAtLeast50: 0 });
  assert.equal(partial.complete, false);
  assert.equal(partial.missing.length, 7);
});

test("curb65: scoring, bands, MDCalc labels", () => {
  assert.deepEqual(
    CURB65_INPUTS.map((i) => i.label),
    [
      "Confusion",
      "BUN >19 mg/dL (>7 mmol/L urea)",
      "Respiratory Rate \u226530",
      "Systolic BP <90 mmHg or Diastolic BP \u226460 mmHg",
      "Age \u226565"
    ]
  );
  const zero = calculateCurb65({ confusion: 0, bunOver19: 0, respiratoryRateAtLeast30: 0, lowBloodPressure: 0, ageAtLeast65: 0 });
  assert.equal(zero.score, 0);
  assert.equal(zero.interpretation.band, "low");
  assert.equal(zero.interpretation.headline, "0 points");
  assert.match(zero.interpretation.detail, /1\.5% 30-day mortality/);

  const one = calculateCurb65({ confusion: 1, bunOver19: 0, respiratoryRateAtLeast30: 0, lowBloodPressure: 0, ageAtLeast65: 0 });
  assert.equal(one.interpretation.band, "low");
  assert.equal(one.interpretation.headline, "1 points");
  assert.match(one.interpretation.detail, /Low risk group: 2\.7% 30-day mortality/);

  const two = calculateCurb65({ confusion: 1, bunOver19: 1, respiratoryRateAtLeast30: 0, lowBloodPressure: 0, ageAtLeast65: 0 });
  assert.equal(two.score, 2);
  assert.equal(two.interpretation.band, "moderate");
  assert.match(two.interpretation.detail, /6\.8% 30-day mortality/);

  const three = calculateCurb65({ confusion: 1, bunOver19: 1, respiratoryRateAtLeast30: 1, lowBloodPressure: 0, ageAtLeast65: 0 });
  assert.equal(three.interpretation.band, "high");
  assert.match(three.interpretation.detail, /14\.0% 30-day mortality/);

  const five = calculateCurb65({ confusion: 1, bunOver19: 1, respiratoryRateAtLeast30: 1, lowBloodPressure: 1, ageAtLeast65: 1 });
  assert.equal(five.score, 5);
  assert.equal(five.interpretation.headline, "5 points");
  assert.match(five.interpretation.detail, /Highest risk group: 27\.8% 30-day mortality/);
  assert.match(five.interpretation.detail, /intensive care admission/);

  const partial = calculateCurb65({ confusion: 0 });
  assert.equal(partial.complete, false);
  assert.equal(partial.missing.length, 4);
});

test("lights: exudative by each criterion, transudative, incomplete", () => {
  assert.deepEqual(
    LIGHTS_INPUTS.map((i) => i.label),
    [
      "Total serum protein",
      "Pleural fluid protein",
      "Serum LDH",
      "Pleural fluid LDH",
      "Upper limit of normal serum LDH"
    ]
  );

  const transudate = calculateLights({
    serumProtein: 6.0, pleuralProtein: 2.0, serumLdh: 200, pleuralLdh: 100, serumLdhUpperLimit: 250
  });
  assert.equal(transudate.complete, true);
  assert.equal(transudate.exudative, false);
  assert.equal(transudate.interpretation.band, "transudative");
  assert.equal(transudate.interpretation.headline, "");
  assert.match(transudate.interpretation.detail, /None of Light's criteria met/);

  const byProtein = calculateLights({
    serumProtein: 6.0, pleuralProtein: 4.0, serumLdh: 200, pleuralLdh: 100, serumLdhUpperLimit: 250
  });
  assert.equal(byProtein.exudative, true);
  assert.equal(byProtein.interpretation.headline, "");
  assert.match(byProtein.interpretation.detail, /At least one of Light's Criteria has been met/);
  assert.equal(byProtein.criteriaMet.length, 1);

  const byLdhRatio = calculateLights({
    serumProtein: 6.0, pleuralProtein: 2.0, serumLdh: 200, pleuralLdh: 150, serumLdhUpperLimit: 250
  });
  assert.equal(byLdhRatio.exudative, true);

  const byLdhAbsolute = calculateLights({
    serumProtein: 6.0, pleuralProtein: 2.0, serumLdh: 300, pleuralLdh: 180, serumLdhUpperLimit: 250
  });
  // LDH ratio 180/300 = 0.6 (not > 0.6); 180 > 2/3 * 250 = 166.67 -> exudative via the third criterion only
  assert.equal(byLdhAbsolute.exudative, true);
  assert.equal(byLdhAbsolute.criteriaMet.length, 1);

  // Boundary: exactly at the thresholds is NOT exudative (strict >).
  const boundary = calculateLights({
    serumProtein: 6.0, pleuralProtein: 3.0, serumLdh: 200, pleuralLdh: 120, serumLdhUpperLimit: 180
  });
  // protein ratio 0.5, LDH ratio 0.6, pleural LDH == 2/3*180 -> none strictly exceed
  assert.equal(boundary.exudative, false);

  const partial = calculateLights({ serumProtein: 6.0 });
  assert.equal(partial.complete, false);
  assert.equal(partial.missing.length, 4);
  assert.ok(partial.missing.includes("Pleural fluid LDH"));
  assert.equal(partial.interpretation, null);

  assert.equal(interpretLights(true).band, "exudative");
  assert.equal(interpretLights(false).band, "transudative");
});

test("definitions carry MDCalc identity metadata", () => {
  assert.equal(wellsDvtDefinition.id, "wells-dvt");
  assert.equal(wellsDvtDefinition.mdcalcId, "362");
  assert.equal(wellsDvtDefinition.mdcalcUrl, "https://www.mdcalc.com/calc/362/wells-criteria-dvt");
  assert.equal(wellsPeDefinition.id, "wells-pe");
  assert.equal(wellsPeDefinition.mdcalcId, "115");
  assert.equal(wellsPeDefinition.mdcalcUrl, "https://www.mdcalc.com/calc/115/wells-criteria-pulmonary-embolism-pe");
  assert.equal(percDefinition.id, "perc");
  assert.equal(percDefinition.mdcalcId, "347");
  assert.equal(percDefinition.mdcalcUrl, "https://www.mdcalc.com/calc/347/perc-rule-pulmonary-embolism");
  assert.equal(curb65Definition.id, "curb65");
  assert.equal(curb65Definition.mdcalcId, "324");
  assert.equal(curb65Definition.mdcalcUrl, "https://www.mdcalc.com/calc/324/curb-65-score-pneumonia-severity");
  assert.equal(lightsDefinition.id, "lights");
  assert.equal(lightsDefinition.mdcalcId, "797");
  assert.equal(lightsDefinition.mdcalcUrl, "https://www.mdcalc.com/calc/797/lights-criteria-for-exudative-effusions");
  for (const definition of [wellsDvtDefinition, wellsPeDefinition, percDefinition, curb65Definition, lightsDefinition]) {
    assert.ok(definition.reference && definition.reference.length > 20, `${definition.id} has a primary reference`);
    assert.ok(typeof definition.calculate === "function", `${definition.id} has a calculate function`);
  }
});

console.log("IM batch B (VTE / pneumonia / pleural) parity tests passed");
