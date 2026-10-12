/**
 * CHA2DS2-VASc Score for Atrial Fibrillation Stroke Risk.
 *
 * Calculates stroke risk for patients with atrial fibrillation.
 * The score should not be applied to valvular atrial fibrillation.
 *
 * Verified against MDCalc (calc 801) on 2026-09-26:
 * https://www.mdcalc.com/calc/801/cha2ds2-vasc-score-atrial-fibrillation-stroke-risk
 *
 * Risk figures are MDCalc's displayed values from the Swedish Atrial
 * Fibrillation Cohort Study (Friberg et al., Eur Heart J 2012): annual
 * ischemic-stroke risk plus the composite stroke/TIA/systemic-embolism risk.
 * MDCalc's anticoagulation guidance lives in its Next Steps tab, not in the
 * result line, so this module's result detail matches the result line only.
 *
 * All inputs are manual: every criterion is history-based (no vital/lab pull
 * descriptors cover PMH, and age uses a 3-tier band, not a numeric age).
 *
 * Note: MDCalc's review notes that sex may warrant removal from the score
 * (CHA2DS2-VA); this module implements CHA2DS2-VASc exactly as on the
 * MDCalc calculator above.
 */

// Annual ischemic-stroke risk (%) and composite stroke/TIA/systemic-embolism
// risk (%), by score — MDCalc's displayed Swedish AF Cohort figures.
const STROKE_RISK_PERCENT = {
  0: { stroke: 0.2, composite: 0.3 },
  1: { stroke: 0.6, composite: 0.9 },
  2: { stroke: 2.2, composite: 2.9 },
  3: { stroke: 3.2, composite: 4.6 },
  4: { stroke: 4.8, composite: 6.7 },
  5: { stroke: 7.2, composite: 10.0 },
  6: { stroke: 9.7, composite: 13.6 },
  7: { stroke: 11.2, composite: 15.7 },
  8: { stroke: 10.8, composite: 15.2 },
  9: { stroke: 12.2, composite: 17.4 }
};

const chadsvascDefinition = {
  verifiedOn: "2026-09-26",
  id: "chadsvasc",
  title: "CHA2DS2-VASc Score",
  mdcalcId: "801",
  mdcalcUrl: "https://www.mdcalc.com/calc/801/cha2ds2-vasc-score-atrial-fibrillation-stroke-risk",
  subtitle: "Stroke risk in atrial fibrillation (not valvular AF).",
  reference: "Friberg L et al. Evaluation of risk stratification schemes for ischaemic stroke and bleeding in 182 678 patients with atrial fibrillation: the Swedish Atrial Fibrillation cohort study. Eur Heart J. 2012;33(12):1500-10.",
  calculate: calculateChadsvasc,
  inputs: [
    {
      key: "age",
      label: "Age",
      type: "radio",
      options: [
        { value: 0, label: "<65" },
        { value: 1, label: "65–74" },
        { value: 2, label: "≥75" }
      ]
    },
    {
      key: "sex",
      label: "Sex",
      type: "radio",
      options: [
        { value: 0, label: "Male" },
        { value: 1, label: "Female" }
      ],
      pull: { kind: "demographic", field: "sex", valueMap: { male: 0, female: 1 } }
    },
    {
      key: "chf",
      label: "Congestive heart failure history",
      type: "radio",
      options: [
        { value: 1, label: "Yes" },
        { value: 0, label: "No" }
      ]
    },
    {
      key: "hypertension",
      label: "Hypertension history",
      type: "radio",
      options: [
        { value: 1, label: "Yes" },
        { value: 0, label: "No" }
      ]
    },
    {
      key: "strokeTiaTe",
      label: "Stroke/TIA/thromboembolism history",
      type: "radio",
      options: [
        { value: 2, label: "Yes" },
        { value: 0, label: "No" }
      ]
    },
    {
      key: "vascularDisease",
      label: "Vascular disease history (prior MI, peripheral artery disease, or aortic plaque)",
      type: "radio",
      options: [
        { value: 1, label: "Yes" },
        { value: 0, label: "No" }
      ]
    },
    {
      key: "diabetes",
      label: "Diabetes history",
      type: "radio",
      options: [
        { value: 1, label: "Yes" },
        { value: 0, label: "No" }
      ]
    }
  ]
};

/**
 * Score CHA2DS2-VASc. All inputs are point values, so the score is their sum.
 */
function calculateChadsvasc(inputs) {
  const missing = chadsvascDefinition.inputs
    .filter((field) => inputs[field.key] === undefined || inputs[field.key] === null || inputs[field.key] === "")
    .map((field) => field.label);

  if (missing.length > 0) {
    return {
      complete: false,
      missing,
      score: null,
      annualStrokeRiskPercent: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: "Answer: " + missing.join(", ") + "."
      }
    };
  }

  const values = chadsvascDefinition.inputs.map((field) => Number(inputs[field.key]));
  const score = values.reduce((sum, value) => sum + value, 0);
  const risk = STROKE_RISK_PERCENT[score];
  const annualStrokeRiskPercent = risk.stroke;
  const strokeTiaSystemicEmbolismRiskPercent = risk.composite;
  const isFemale = Number(inputs.sex) === 1;

  // Risk band drives internal styling only; MDCalc's anticoagulation guidance
  // lives in its Next Steps tab, not in the result line.
  let band;
  const noAnticoag = (!isFemale && score === 0) || (isFemale && score === 1);
  const considerAnticoag = (!isFemale && score === 1) || (isFemale && score === 2);
  if (noAnticoag) {
    band = "low";
  } else if (considerAnticoag) {
    band = "moderate";
  } else {
    band = "high";
  }

  return {
    complete: true,
    missing: [],
    score,
    annualStrokeRiskPercent,
    strokeTiaSystemicEmbolismRiskPercent,
    interpretation: {
      band,
      headline: score + " points",
      detail:
        "Stroke risk was " +
        risk.stroke +
        "% per year in >90,000 patients (the Swedish Atrial Fibrillation Cohort Study) and " +
        risk.composite +
        "% risk of stroke/TIA/systemic embolism."
    }
  };
}

export { chadsvascDefinition, calculateChadsvasc };
