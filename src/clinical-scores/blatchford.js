// Glasgow-Blatchford Bleeding Score (GBS).
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Glasgow-Blatchford Bleeding Score (GBS)"
// (MDCalc calc 518) one-to-one:
//   - the same input order: Hemoglobin, BUN, Initial systolic BP, Sex,
//     Heart rate >=100, Melena present, Recent syncope, Hepatic disease
//     history, Cardiac failure present
//   - the same point values:
//     BUN (mg/dL): <18.2 = 0, 18.2-22.4 = 2, 22.4-28 = 3, 28-70 = 4, >=70 = 6
//     hemoglobin men: >=13 = 0, 12-13 = 1, 10-12 = 3, <10 = 6
//     hemoglobin women: >=12 = 0, 10-12 = 1, <10 = 6
//     systolic BP: >=110 = 0, 100-109 = 1, 90-99 = 2, <90 = 3
//     heart rate >=100 = 1, melena = 1, syncope = 2,
//     hepatic disease = 2, cardiac failure = 2
//   - total = addition of the selected points (0-23)
//   - MDCalc result wording (observed live 2026-09-26):
//       0 points: "A GBS of 0 is a "Low Risk" GI bleed, and is highly
//       sensitive (99.6% in a 2007 retrospective study) for predicting
//       which patients did not require any "medical intervention": blood
//       transfusion, endoscopy, or surgery. This was confirmed in a 2009
//       Lancet study where patients with a score of 0 were actually
//       discharged and had no GI bleeding mortality at 6 month followup"
//       >0 points: "A GBS greater than zero suggests a "High Risk" GI bleed
//       that is likely to require "medical intervention": transfusion,
//       endoscopy, or surgery. A higher GBS also correlated with a higher
//       likelihood of needing intervention (scores ≥6 are associated with
//       >50% risk of needing intervention)"
//     plus MDCalc management text: "Initial management should always focus
//     on hemodynamic resuscitation prior to risk stratification."
//   - MDCalc input labels (observed live 2026-09-26): "Hemoglobin", "BUN",
//     "Initial systolic BP", "Sex", "Heart rate ≥100", "Melena present",
//     "Recent syncope", "Hepatic disease history", "Cardiac failure
//     present".
// Reference: Blatchford O, Murray WR, Blatchford M. Prediction of need for
// treatment of upper gastrointestinal haemorrhage by clinical and laboratory
// features. Lancet. 2000;355(9218):1118-21.
//
// NOTE: the supplied MDCalc calc id 2713 returns 404; the live calculator is
// calc 518 (verified 2026-09-26).

export const BLATCHFORD_INPUTS = [
  {
    key: "hemoglobin",
    label: "Hemoglobin",
    type: "number",
    unit: "g/dL",
    min: 0,
    max: 25,
    step: 0.1,
    placeholder: "e.g. 11.2"
  },
  {
    key: "bun",
    label: "BUN",
    type: "number",
    unit: "mg/dL",
    min: 0,
    max: 250,
    step: 0.1,
    placeholder: "e.g. 24"
  },
  {
    key: "systolicBp",
    label: "Initial systolic BP",
    type: "number",
    unit: "mmHg",
    min: 0,
    max: 300,
    step: 1,
    placeholder: "e.g. 105",
    pull: { kind: "vital", match: [/systolic/i] }
  },
  {
    key: "sex",
    label: "Sex",
    type: "radio",
    options: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" }
    ],
    hint: "Hemoglobin scoring is sex-specific.",
    pull: { kind: "demographic", field: "sex" }
  },
  {
    key: "heartRate",
    label: "Heart rate \u2265100",
    type: "number",
    unit: "/min",
    min: 0,
    max: 250,
    step: 1,
    placeholder: "e.g. 98",
    hint: "1 point when \u2265100/min.",
    pull: { kind: "vital", match: [/pulse/i, /heart rate/i, /\bhr\b/i] }
  },
  {
    key: "melena",
    label: "Melena present",
    type: "radio",
    options: [
      { value: 0, label: "No" },
      { value: 1, label: "Yes" }
    ]
  },
  {
    key: "syncope",
    label: "Recent syncope",
    type: "radio",
    options: [
      { value: 0, label: "No" },
      { value: 1, label: "Yes" }
    ]
  },
  {
    key: "hepaticDisease",
    label: "Hepatic disease history",
    type: "radio",
    options: [
      { value: 0, label: "No" },
      { value: 1, label: "Yes" }
    ]
  },
  {
    key: "cardiacFailure",
    label: "Cardiac failure present",
    type: "radio",
    options: [
      { value: 0, label: "No" },
      { value: 1, label: "Yes" }
    ]
  }
];

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scoreBun(bun) {
  if (bun < 18.2) return 0;
  if (bun < 22.4) return 2;
  if (bun < 28) return 3;
  if (bun < 70) return 4;
  return 6;
}

function scoreHemoglobin(hemoglobin, sex) {
  if (sex === "male") {
    if (hemoglobin < 10) return 6;
    if (hemoglobin < 12) return 3;
    if (hemoglobin < 13) return 1;
    return 0;
  }
  if (hemoglobin < 10) return 6;
  if (hemoglobin < 12) return 1;
  return 0;
}

function scoreSystolicBp(sbp) {
  if (sbp < 90) return 3;
  if (sbp < 100) return 2;
  if (sbp < 110) return 1;
  return 0;
}

export function scoreBlatchford(values = {}) {
  const missing = [];
  const points = {};

  const hemoglobin = toFiniteNumber(values.hemoglobin);
  const bun = toFiniteNumber(values.bun);
  const systolicBp = toFiniteNumber(values.systolicBp);
  const sex = values.sex === "male" || values.sex === "female" ? values.sex : null;
  const heartRate = toFiniteNumber(values.heartRate);
  const melena = toFiniteNumber(values.melena);
  const syncope = toFiniteNumber(values.syncope);
  const hepaticDisease = toFiniteNumber(values.hepaticDisease);
  const cardiacFailure = toFiniteNumber(values.cardiacFailure);

  if (hemoglobin === null) missing.push("Hemoglobin");
  if (bun === null) missing.push("BUN");
  if (systolicBp === null) missing.push("Initial systolic BP");
  if (sex === null) missing.push("Sex");
  if (heartRate === null) missing.push("Heart rate \u2265100");
  if (melena === null) missing.push("Melena present");
  if (syncope === null) missing.push("Recent syncope");
  if (hepaticDisease === null) missing.push("Hepatic disease history");
  if (cardiacFailure === null) missing.push("Cardiac failure present");

  if (missing.length > 0) {
    return { score: null, points: {}, complete: false, missing };
  }

  points.bun = scoreBun(bun);
  points.hemoglobin = scoreHemoglobin(hemoglobin, sex);
  points.systolicBp = scoreSystolicBp(systolicBp);
  points.heartRate = heartRate >= 100 ? 1 : 0;
  points.melena = melena === 1 ? 1 : 0;
  points.syncope = syncope === 1 ? 2 : 0;
  points.hepaticDisease = hepaticDisease === 1 ? 2 : 0;
  points.cardiacFailure = cardiacFailure === 1 ? 2 : 0;

  const score = Object.values(points).reduce((sum, point) => sum + point, 0);
  return { score, points, complete: true, missing };
}

export function interpretBlatchford(score) {
  if (score === 0) {
    return {
      band: "low-risk",
      headline: "0 points",
      // MDCalc result wording, observed live 2026-09-26.
      detail: "A GBS of 0 is a \"Low Risk\" GI bleed, and is highly sensitive (99.6% in a 2007 retrospective study) for predicting which patients did not require any \"medical intervention\": blood transfusion, endoscopy, or surgery. This was confirmed in a 2009 Lancet study where patients with a score of 0 were actually discharged and had no GI bleeding mortality at 6 month followup."
    };
  }
  return {
    band: "admit",
    headline: `${score} points`,
    // MDCalc result wording, observed live 2026-09-26, plus the verified
    // MDCalc management sentence.
    detail: "A GBS greater than zero suggests a \"High Risk\" GI bleed that is likely to require \"medical intervention\": transfusion, endoscopy, or surgery. A higher GBS also correlated with a higher likelihood of needing intervention (scores \u22656 are associated with >50% risk of needing intervention). Initial management should always focus on hemodynamic resuscitation prior to risk stratification."
  };
}

export function calculateBlatchford(values = {}) {
  const { score, points, complete, missing } = scoreBlatchford(values);
  return {
    complete,
    missing,
    score,
    points,
    interpretation: complete ? interpretBlatchford(score) : null
  };
}

export const blatchfordDefinition = {
  verifiedOn: "2026-09-26",
  id: "blatchford",
  title: "Glasgow-Blatchford Bleeding Score (GBS)",
  subtitle: "Upper GI bleed risk",
  mdcalcId: "518",
  mdcalcUrl: "https://www.mdcalc.com/calc/518/glasgow-blatchford-bleeding-score-gbs",
  reference: "Blatchford O, Murray WR, Blatchford M. Prediction of need for treatment of upper gastrointestinal haemorrhage by clinical and laboratory features. Lancet. 2000;355(9218):1118-21.",
  inputs: BLATCHFORD_INPUTS,
  calculate: calculateBlatchford
};
