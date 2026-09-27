// Child-Pugh Score for Cirrhosis Mortality.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Child-Pugh Score for Cirrhosis Mortality" (MDCalc calc 340)
// one-to-one:
//   - the same 5 inputs in MDCalc's order: bilirubin (total), albumin, INR,
//     ascites, encephalopathy, each scored 1-3 points
//   - Bilirubin: <2 mg/dL (<34.2 umol/L) = 1, 2-3 mg/dL (34.2-51.3) = 2,
//     >3 mg/dL (>51.3) = 3
//   - Albumin: >3.5 g/dL (>35 g/L) = 1, 2.8-3.5 g/dL (28-35) = 2,
//     <2.8 g/dL (<28) = 3
//   - INR: <1.7 = 1, 1.7-2.3 = 2, >2.3 = 3
//   - Ascites: Absent = 1, Slight = 2, Moderate = 3
//   - Encephalopathy: No Encephalopathy = 1, Grade 1-2 = 2, Grade 3-4 = 3
//   - Class A = 5-6 points, Class B = 7-9 points, Class C = 10-15 points
//   - result: "N points" / "Child Class X" / per-class middle line /
//     "Abdominal surgery peri-operative mortality: ...%"
//
// Live-verified 2026-09-26 against MDCalc (3 controlled cases, one per
// class, synthetic inputs, no login): all matched on score, class, and
// exact result-box wording. MDCalc shows life expectancy (A, C) or the
// transplant-evaluation line (B) plus peri-operative mortality — NOT
// 1-year/3-year survival percentages. MDCalc labels the 5th input
// "Encephalopathy".
// Primary references: Pugh RN et al. Br J Surg. 1973;60:646-9;
// D'Amico G et al. J Hepatol. 2006;44:217-31.

export const CHILD_PUGH_MAX_SCORE = 15;

export const CHILD_PUGH_INPUTS = [
  {
    key: "bilirubin",
    label: "Bilirubin (Total)",
    type: "numberWithUnit",
    units: ["mg/dL", "\u03bcmol/L"],
    toBase: { "mg/dL": 1, "\u03bcmol/L": 1 / 17.1 },
    baseUnit: "mg/dL",
    min: 0.1,
    step: 0.1,
    placeholder: "e.g. 2.0"
  },
  {
    key: "albumin",
    label: "Albumin",
    type: "numberWithUnit",
    units: ["g/dL", "g/L"],
    toBase: { "g/dL": 1, "g/L": 1 / 10 },
    baseUnit: "g/dL",
    min: 0.5,
    step: 0.1,
    placeholder: "e.g. 3.0"
  },
  {
    key: "inr",
    label: "INR",
    type: "number",
    min: 0.5,
    step: 0.1,
    placeholder: "e.g. 1.5"
  },
  {
    key: "ascites",
    label: "Ascites",
    type: "radio",
    options: [
      { value: 1, label: "Absent +1" },
      { value: 2, label: "Slight +2" },
      { value: 3, label: "Moderate +3" }
    ]
  },
  {
    key: "encephalopathy",
    label: "Encephalopathy",
    type: "radio",
    options: [
      { value: 1, label: "No Encephalopathy +1" },
      { value: 2, label: "Grade 1-2 +2" },
      { value: 3, label: "Grade 3-4 +3" }
    ]
  }
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function childPughComponentPoints({ bilirubinMgDl, albuminGDl, inr, ascites, encephalopathy }) {
  const bilirubin = bilirubinMgDl > 3 ? 3 : bilirubinMgDl >= 2 ? 2 : 1;
  const albumin = albuminGDl > 3.5 ? 1 : albuminGDl >= 2.8 ? 2 : 3;
  const inrPoints = inr > 2.3 ? 3 : inr >= 1.7 ? 2 : 1;
  return { bilirubin, albumin, inr: inrPoints, ascites, encephalopathy };
}

// Result-box wording per MDCalc, live-verified 2026-09-26 (all synthetic
// inputs, no login). All three classes observed verbatim:
//   A: "N points" / "Child Class A" / "Life Expectancy: 15-20 years" /
//      "Abdominal surgery peri-operative mortality: 10%"
//   B: "N points" / "Child Class B" / "Indication for transplant evaluation" /
//      "Abdominal surgery peri-operative mortality: 30%"
//      (Class B shows NO life-expectancy line — the transplant-evaluation
//      line appears in its place.)
//   C: "N points" / "Child Class C" / "Life Expectancy: 1-3 years" /
//      "Abdominal surgery peri-operative mortality: 82%"
// MDCalc no longer displays 1-year/3-year survival percentages anywhere in
// the output.
function childPughClass(score) {
  if (score <= 6) return { letter: "A", band: "compensated", middleLine: "Life Expectancy: 15-20 years.", periOpMortality: "10%" };
  if (score <= 9) return { letter: "B", band: "significant dysfunction", middleLine: "Indication for transplant evaluation.", periOpMortality: "30%" };
  return { letter: "C", band: "decompensated", middleLine: "Life Expectancy: 1-3 years.", periOpMortality: "82%" };
}

export function calculateChildPugh(values = {}) {
  const missing = [];
  const bilirubinValue = finiteNumber(values.bilirubin);
  if (bilirubinValue === null) missing.push("Bilirubin (Total)");
  const albuminValue = finiteNumber(values.albumin);
  if (albuminValue === null) missing.push("Albumin");
  const inr = finiteNumber(values.inr);
  if (inr === null) missing.push("INR");
  const ascites = finiteNumber(values.ascites);
  if (ascites === null) missing.push("Ascites");
  const encephalopathy = finiteNumber(values.encephalopathy);
  if (encephalopathy === null) missing.push("Encephalopathy");

  if (missing.length) {
    return { complete: false, missing, points: null, score: null, interpretation: null };
  }

  const bilirubinMgDl = bilirubinValue * (values.bilirubinUnit === "\u03bcmol/L" ? 1 / 17.1 : 1);
  const albuminGDl = albuminValue * (values.albuminUnit === "g/L" ? 1 / 10 : 1);
  const points = childPughComponentPoints({
    bilirubinMgDl,
    albuminGDl,
    inr,
    ascites,
    encephalopathy
  });
  const score = points.bilirubin + points.albumin + points.inr + points.ascites + points.encephalopathy;
  const klass = childPughClass(score);
  // MDCalc's result box shows only these lines; the class-range parenthetical
  // some references print (5-6 = A, 7-9 = B, 10-15 = C) does not appear.
  const detail =
    `Child Class ${klass.letter}. ${klass.middleLine} ` +
    `Abdominal surgery peri-operative mortality: ${klass.periOpMortality}.`;
  return {
    complete: true,
    missing: [],
    points,
    score,
    interpretation: {
      band: klass.letter === "A" ? "compensated" : klass.letter === "B" ? "significant-dysfunction" : "decompensated",
      headline: `${score} points`,
      detail
    }
  };
}

export const childPughDefinition = {
  verifiedOn: "2026-09-26", // all three classes live-verified verbatim
  id: "child-pugh",
  title: "Child-Pugh Score",
  subtitle: "Cirrhosis mortality",
  mdcalcId: "340",
  mdcalcUrl: "https://www.mdcalc.com/calc/340/child-pugh-score-cirrhosis-mortality",
  reference: "Pugh RN et al. Br J Surg. 1973;60:646-9.",
  inputs: CHILD_PUGH_INPUTS,
  calculate: calculateChildPugh
};
