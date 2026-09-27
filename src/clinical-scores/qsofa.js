// qSOFA (Quick SOFA) Score for Sepsis.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "qSOFA (Quick SOFA) Score for Sepsis"
// (MDCalc calc 2654) one-to-one:
//   - 3 criteria, 1 point each: respiratory rate >= 22/min,
//     systolic blood pressure <= 100 mmHg, altered mentation (GCS < 15)
//   - total = addition of the selected points (0-3)
//   - MDCalc result wording (observed live 2026-09-26):
//       2-3 points: "High risk" / "qSOFA Scores 2-3 are associated with a
//       3- to 14-fold increase in in-hospital mortality. Assess for evidence
//       of organ dysfunction with blood testing including serum lactate and
//       calculation of the full SOFA Score. Patients meeting these qSOFA
//       criteria should have infection considered even if it was previously
//       not."
//       0 points: "Not high risk" / "If sepsis is still suspected, continue
//       to monitor, evaluate, and initiate treatment as appropriate,
//       including serial qSOFA assessments."
//     (1 point was not observed; it follows the 0-point "Not high risk"
//     pattern since >=2 is the positive threshold.)
//   - MDCalc input labels: "Respiratory rate ≥22", "Systolic BP ≤100",
//     "Altered mental status" (toolbar: "Altered mental status Glasgow
//     Coma Scale <15").
// Reference: Seymour CW et al. Assessment of Clinical Criteria for Sepsis:
// For the Third International Consensus Definitions for Sepsis and Septic
// Shock (Sepsis-3). JAMA. 2016;315(8):762-774.
//
// NOTE: the supplied MDCalc calc id 20004 returns 404; the live calculator is
// calc 2654 (verified 2026-09-26). The exact live result-panel headline for
// positive vs negative scores could not be read from fetched page text, so
// the detail wording here is kept to MDCalc's verified advice sentence plus
// the verified about text; live-browser verification of the exact result
// display is still outstanding.

export const QSOFA_INPUTS = [
  {
    key: "respiratoryRate",
    label: "Respiratory rate \u226522",
    type: "number",
    unit: "/min",
    min: 0,
    max: 100,
    step: 1,
    placeholder: "e.g. 24",
    hint: "1 point when \u226522/min.",
    pull: { kind: "vital", match: [/respiratory/i, /\brr\b/i] }
  },
  {
    key: "systolicBp",
    label: "Systolic BP \u2264100",
    type: "number",
    unit: "mmHg",
    min: 0,
    max: 300,
    step: 1,
    placeholder: "e.g. 95",
    hint: "1 point when \u2264100 mmHg.",
    pull: { kind: "vital", match: [/systolic/i] }
  },
  {
    key: "alteredMentalStatus",
    label: "Altered mental status",
    type: "radio",
    options: [
      { value: 0, label: "No (GCS 15)" },
      { value: 1, label: "Yes (GCS <15)" }
    ],
    hint: "1 point when altered."
  }
];

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function thresholdPoint(value, predicate) {
  const number = toFiniteNumber(value);
  if (number === null) return null;
  return predicate(number) ? 1 : 0;
}

export function scoreQsofa(values = {}) {
  const missing = [];
  const points = {};
  const respiratoryRate = thresholdPoint(values.respiratoryRate, (v) => v >= 22);
  const systolicBp = thresholdPoint(values.systolicBp, (v) => v <= 100);
  const alteredMentalStatus = thresholdPoint(values.alteredMentalStatus, (v) => v === 1);
  if (respiratoryRate === null) missing.push("Respiratory rate \u226522");
  else points.respiratoryRate = respiratoryRate;
  if (systolicBp === null) missing.push("Systolic BP \u2264100");
  else points.systolicBp = systolicBp;
  if (alteredMentalStatus === null) missing.push("Altered mental status");
  else points.alteredMentalStatus = alteredMentalStatus;
  const score = Object.values(points).reduce((sum, point) => sum + point, 0);
  return { score, points, complete: missing.length === 0, missing };
}

export function interpretQsofa(score) {
  if (score >= 2) {
    return {
      band: "positive",
      headline: `${score} points`,
      // MDCalc result wording, observed live 2026-09-26.
      detail: "High risk. qSOFA Scores 2-3 are associated with a 3- to 14-fold increase in in-hospital mortality. Assess for evidence of organ dysfunction with blood testing including serum lactate and calculation of the full SOFA Score. Patients meeting these qSOFA criteria should have infection considered even if it was previously not."
    };
  }
  return {
    band: "negative",
    headline: `${score} points`,
    // MDCalc result wording, observed live 2026-09-26 (0-point case;
    // 1 point follows the same pattern since >=2 is the positive threshold).
    detail: "Not high risk. If sepsis is still suspected, continue to monitor, evaluate, and initiate treatment as appropriate, including serial qSOFA assessments."
  };
}

export function calculateQsofa(values = {}) {
  const { score, points, complete, missing } = scoreQsofa(values);
  return {
    complete,
    missing,
    score,
    points,
    interpretation: complete ? interpretQsofa(score) : null
  };
}

export const qsofaDefinition = {
  verifiedOn: "2026-09-26",
  id: "qsofa",
  title: "qSOFA (Quick SOFA) Score for Sepsis",
  subtitle: "Sepsis mortality risk",
  mdcalcId: "2654",
  mdcalcUrl: "https://www.mdcalc.com/calc/2654/qsofa-quick-sofa-score-sepsis",
  reference: "Seymour CW et al. Assessment of Clinical Criteria for Sepsis: For the Third International Consensus Definitions for Sepsis and Septic Shock (Sepsis-3). JAMA. 2016;315(8):762-774.",
  inputs: QSOFA_INPUTS,
  calculate: calculateQsofa
};
