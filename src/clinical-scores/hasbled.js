/**
 * HAS-BLED Score for Major Bleeding Risk.
 *
 * Estimates risk of major bleeding for patients on anticoagulation to
 * assess risk-benefit in atrial fibrillation care.
 *
 * Verified against MDCalc (calc 807) on 2026-09-26:
 * https://www.mdcalc.com/calc/807/has-bled-score-major-bleeding-risk
 *
 * Result text is MDCalc's verbatim per-score wording: the Lip 2011 1-year
 * major-bleeding percentage, the Pisters 2010 bleeds-per-100-patient-years
 * figure, and the recommendation sentence. (MDCalc displays 3.72 for a score
 * of 3; the published Pisters table rounds the same cell to 3.74.)
 *
 * Input order, labels, and hints mirror the MDCalc calculator. All inputs
 * are manual: every criterion is history-based (no vital/lab pull
 * descriptors cover PMH or alcohol use).
 */

const MAJOR_BLEEDING_RISK_PERCENT = {
  0: 0.9,
  1: 3.4,
  2: 4.1,
  3: 5.8,
  4: 8.9,
  5: 9.1
  // Scores >5 were too rare to determine risk; likely over 10%.
};

// Pisters 2010 bleeds per 100 patient-years, as displayed by MDCalc.
const PISTERS_BLEEDS_PER_100_PT_YEARS = {
  0: "1.13",
  1: "1.02",
  2: "1.88",
  3: "3.72",
  4: "8.70",
  5: "12.50"
};

// MDCalc's verbatim recommendation sentence per score.
const RECOMMENDATION = {
  0: "Anticoagulation should be considered: Patient has a relatively low risk for major bleeding (~1/100 patient-years).",
  1: "Anticoagulation should be considered: Patient has a relatively low risk for major bleeding (~1/100 patient-years).",
  2: "Anticoagulation can be considered, however patient does have moderate risk for major bleeding (~2/100 patient-years).",
  3: "Alternatives to anticoagulation should be considered: Patient is at high risk for major bleeding.",
  4: "Alternatives to anticoagulation should be considered: Patient is at high risk for major bleeding.",
  5: "Alternatives to anticoagulation should be considered: Patient is at high risk for major bleeding."
};

const RISK_GROUP = {
  0: "Low",
  2: "Moderate",
  3: "High"
};

function yesNoOptions() {
  return [
    { value: 1, label: "Yes" },
    { value: 0, label: "No" }
  ];
}

const hasbledDefinition = {
  verifiedOn: "2026-09-26",
  id: "hasbled",
  title: "HAS-BLED Score",
  mdcalcId: "807",
  mdcalcUrl: "https://www.mdcalc.com/calc/807/has-bled-score-major-bleeding-risk",
  subtitle: "Major bleeding risk on anticoagulation in atrial fibrillation.",
  reference: "Pisters R et al. A novel user-friendly score (HAS-BLED) to assess 1-year risk of major bleeding in patients with atrial fibrillation: the Euro Heart Survey. Chest. 2010;138(5):1093-100.",
  calculate: calculateHasbled,
  inputs: [
    {
      key: "hypertension",
      label: "Hypertension",
      hint: "Uncontrolled, >160 mmHg systolic.",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "renalDisease",
      label: "Renal disease",
      hint: "Dialysis, transplant, Cr >2.26 mg/dL or >200 µmol/L.",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "liverDisease",
      label: "Liver disease",
      hint: "Cirrhosis or bilirubin >2x normal with AST/ALT/AP >3x normal.",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "stroke",
      label: "Stroke history",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "bleeding",
      label: "Prior major bleeding or predisposition to bleeding",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "labileInr",
      label: "Labile INR",
      hint: "Unstable/high INRs, time in therapeutic range <60%.",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "elderly",
      label: "Age >65",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "drugs",
      label: "Medication usage predisposing to bleeding",
      hint: "Aspirin, clopidogrel, NSAIDs.",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "alcohol",
      label: "Alcohol use",
      hint: "≥8 drinks/week.",
      type: "radio",
      options: yesNoOptions()
    }
  ]
};

/**
 * Score HAS-BLED. All inputs are point values, so the score is their sum.
 */
function calculateHasbled(inputs) {
  const missing = hasbledDefinition.inputs
    .filter((field) => inputs[field.key] === undefined || inputs[field.key] === null || inputs[field.key] === "")
    .map((field) => field.label);

  if (missing.length > 0) {
    return {
      complete: false,
      missing,
      score: null,
      majorBleedingRiskPercent: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: "Answer: " + missing.join(", ") + "."
      }
    };
  }

  const score = hasbledDefinition.inputs
    .map((field) => Number(inputs[field.key]))
    .reduce((sum, value) => sum + value, 0);

  const majorBleedingRiskPercent = score > 5 ? null : MAJOR_BLEEDING_RISK_PERCENT[score];
  const riskGroup = score > 5 ? "Very high" : RISK_GROUP[score] || null;

  // MDCalc's verbatim per-score result text.
  let band;
  let detail;
  if (score > 5) {
    band = "very-high";
    detail =
      "Scores greater than 5 were too rare to determine risk, but are likely over 10%. " +
      "Alternatives to anticoagulation should be considered: Patient is at very high risk for major bleeding.";
  } else {
    band = score === 0 ? "low" : score <= 2 ? "moderate" : "high";
    detail =
      "Risk was " +
      MAJOR_BLEEDING_RISK_PERCENT[score] +
      "% in one validation study (Lip 2011) and " +
      PISTERS_BLEEDS_PER_100_PT_YEARS[score] +
      " bleeds per 100 patient-years in another validation study (Pisters 2010). " +
      RECOMMENDATION[score];
  }

  return {
    complete: true,
    missing: [],
    score,
    majorBleedingRiskPercent,
    riskGroup,
    interpretation: {
      band,
      headline: score + " points",
      detail
    }
  };
}

export { hasbledDefinition, calculateHasbled };
