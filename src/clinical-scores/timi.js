/**
 * TIMI Risk Score for UA/NSTEMI.
 *
 * Predicts 14-day risk of adverse outcomes (all-cause mortality, new or
 * recurrent MI, or severe recurrent ischemia requiring urgent
 * revascularization) in unstable angina / NSTEMI.
 *
 * Verified against MDCalc's current TIMI UA/NSTEMI calculator on 2026-09-26:
 * https://www.mdcalc.com/calc/111/timi-risk-score-ua-nstemi
 * (original study: Antman et al., JAMA 2000;284:835-842)
 *
 * MDCalc displays the 14-day risk as a whole percent (41%, not 40.9%) and
 * writes "1 points" (plural) for a 1-point score; both are matched here.
 *
 * All inputs are manual: every criterion is history/ECG/lab based (no
 * supported pull descriptors for these).
 */

// 14-day risk of all-cause mortality, new/recurrent MI, or severe recurrent
// ischemia requiring urgent revascularization — MDCalc's displayed whole
// percentages.
const RISK_PERCENT_14_DAY = {
  0: 5,
  1: 5,
  2: 8,
  3: 13,
  4: 20,
  5: 26,
  6: 41,
  7: 41
};

function yesNoOptions() {
  return [
    { value: 1, label: "Yes" },
    { value: 0, label: "No" }
  ];
}

const timiDefinition = {
  verifiedOn: "2026-09-26",
  id: "timi",
  title: "TIMI Risk Score for UA/NSTEMI",
  mdcalcId: "111",
  mdcalcUrl: "https://www.mdcalc.com/calc/111/timi-risk-score-ua-nstemi",
  subtitle: "14-day risk in unstable angina / NSTEMI.",
  reference: "Antman EM et al. The TIMI risk score for unstable angina/non-ST elevation MI: a method for prognostication and therapeutic decision making. JAMA. 2000;284(7):835-42.",
  calculate: calculateTimi,
  inputs: [
    {
      key: "age65",
      label: "Age ≥65",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "cadRiskFactors",
      label: "≥3 CAD risk factors",
      hint: "Hypertension, hypercholesterolemia, diabetes, family history of CAD, or current smoker.",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "knownCad",
      label: "Known CAD (stenosis ≥50%)",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "asaUse",
      label: "ASA use in past 7 days",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "severeAngina",
      label: "Severe angina (≥2 episodes in 24 hrs)",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "stChanges",
      label: "EKG ST changes ≥0.5mm",
      type: "radio",
      options: yesNoOptions()
    },
    {
      key: "positiveMarker",
      label: "Positive cardiac marker",
      type: "radio",
      options: yesNoOptions()
    }
  ]
};

/**
 * Score TIMI UA/NSTEMI. All inputs are point values, so the score is their sum.
 */
function calculateTimi(inputs) {
  const missing = timiDefinition.inputs
    .filter((field) => inputs[field.key] === undefined || inputs[field.key] === null || inputs[field.key] === "")
    .map((field) => field.label);

  if (missing.length > 0) {
    return {
      complete: false,
      missing,
      score: null,
      riskPercent14Day: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: "Answer: " + missing.join(", ") + "."
      }
    };
  }

  const score = timiDefinition.inputs
    .map((field) => Number(inputs[field.key]))
    .reduce((sum, value) => sum + value, 0);

  const riskPercent14Day = RISK_PERCENT_14_DAY[score];
  const band = score <= 1 ? "low" : score <= 4 ? "moderate" : "high";

  const detail =
    riskPercent14Day +
    "% risk at 14 days of: all-cause mortality, new or recurrent MI, or severe recurrent ischemia requiring urgent revascularization.";

  return {
    complete: true,
    missing: [],
    score,
    riskPercent14Day,
    interpretation: {
      band,
      headline: score + " points",
      detail
    }
  };
}

export { timiDefinition, calculateTimi };
