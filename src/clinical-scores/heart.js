/**
 * HEART Score for Major Cardiac Events.
 *
 * Risk-stratifies chest pain patients for 6-week risk of major adverse
 * cardiac events (MACE: all-cause mortality, myocardial infarction, or
 * coronary revascularization).
 *
 * Verified against MDCalc (calc 1752) on 2026-09-26:
 * https://www.mdcalc.com/calc/1752/heart-score-major-cardiac-events
 * Risk bands confirmed from MDCalc's result box and Next Steps table.
 *
 * Note on the troponin sentence: MDCalc appends "If troponin is positive,
 * many experts recommend further workup and admission even with a low HEART
 * Score." for a positive troponin with a non-high score (observed at 4
 * points; not shown at 10 points). The display rule is inferred from those
 * two observations.
 *
 * All inputs are manual: history, EKG, and troponin interpretation have no
 * pull descriptors, and age uses a 3-tier band, not a numeric age.
 */

const heartDefinition = {
  verifiedOn: "2026-09-26",
  id: "heart",
  title: "HEART Score",
  mdcalcId: "1752",
  mdcalcUrl:
    "https://www.mdcalc.com/calc/1752/heart-score-major-cardiac-events",
  subtitle:
    "6-week MACE risk in chest pain (MACE: all-cause mortality, MI, or coronary revascularization).",
  reference: "Backus BE et al. A prospective validation of the HEART score for chest pain patients at the emergency department. Int J Cardiol. 2013;168(3):2153-8.",
  calculate: calculateHeart,
  inputs: [
    {
      key: "history",
      label: "History",
      type: "radio",
      options: [
        { value: 0, label: "Slightly suspicious 0" },
        { value: 1, label: "Moderately suspicious +1" },
        { value: 2, label: "Highly suspicious +2" }
      ]
    },
    {
      key: "ecg",
      label: "EKG",
      type: "radio",
      options: [
        { value: 0, label: "Normal 0" },
        { value: 1, label: "Non-specific repolarization disturbance +1" },
        { value: 2, label: "Significant ST deviation +2" }
      ]
    },
    {
      key: "age",
      label: "Age",
      type: "radio",
      options: [
        { value: 0, label: "<45 0" },
        { value: 1, label: "45-64 +1" },
        { value: 2, label: "≥65 +2" }
      ]
    },
    {
      key: "riskFactors",
      label: "Risk factors",
      type: "radio",
      options: [
        { value: 0, label: "No known risk factors 0" },
        { value: 1, label: "1-2 risk factors +1" },
        { value: 2, label: "≥3 risk factors or history of atherosclerotic disease +2" }
      ]
    },
    {
      key: "troponin",
      label: "Initial troponin",
      type: "radio",
      options: [
        { value: 0, label: "≤normal limit 0" },
        { value: 1, label: "1–3× normal limit +1" },
        { value: 2, label: ">3× normal limit +2" }
      ]
    }
  ]
};

/**
 * Score HEART. All inputs are point values, so the score is their sum.
 */
function calculateHeart(inputs) {
  const missing = heartDefinition.inputs
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

  const score = heartDefinition.inputs
    .map((field) => Number(inputs[field.key]))
    .reduce((sum, value) => sum + value, 0);
  const troponinPositive = Number(inputs.troponin) > 0;

  let band;
  let bandName;
  let bandRange;
  let maceRisk;
  if (score <= 3) {
    band = "low";
    bandName = "Low";
    bandRange = "0-3";
    maceRisk = "0.9-1.7%";
  } else if (score <= 6) {
    band = "moderate";
    bandName = "Moderate";
    bandRange = "4-6";
    maceRisk = "12-16.6%";
  } else {
    band = "high";
    bandName = "High";
    bandRange = "7-10";
    maceRisk = "50-65%";
  }

  let detail =
    bandName + " Score (" + bandRange + " points). Risk of MACE of " + maceRisk + ".";
  if (troponinPositive && score <= 6) {
    detail +=
      " If troponin is positive, many experts recommend further workup and admission even with a low HEART Score.";
  }

  return {
    complete: true,
    missing: [],
    score,
    interpretation: {
      band,
      headline: score + " points",
      detail
    }
  };
}

export { heartDefinition, calculateHeart };
