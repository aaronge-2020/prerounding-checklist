// Fibrosis-4 (FIB-4) Index for Liver Fibrosis.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Fibrosis-4 (FIB-4) Index for Liver Fibrosis" (MDCalc
// calc 2200; the older calc number 3227 is stale and 404s) one-to-one:
//   - the same 4 inputs in MDCalc's order: age, AST, ALT, platelet count
//   - FIB-4 = (age in years x AST in U/L)
//     / (platelet count in 10^9/L x sqrt(ALT in U/L))
//   - MDCalc cautions use in patients <35 or >65 years old (score less
//     reliable); an advisory note is attached for those ages
//   - risk bands from MDCalc's Evidence table (Sterling et al 2006):
//     <1.45 -> "Advanced fibrosis excluded", Ishak stage 0-1;
//     1.45-3.25 -> "Further investigation needed", Ishak stage 2-3;
//     >3.25 -> "Advanced fibrosis (METAVIR stage F3-F4) likely
//     (McPherson 2017)", Ishak stage 4-6
//   - result headline is the index to two decimals with "points";
//     each band carries its "Approximate fibrosis stage" line
//
// Live-verified 2026-09-26 against MDCalc (3 controlled cases including a
// high-band probe, synthetic inputs, no login): all matched, including
// exact wording and cutoffs. MDCalc never uses the words low/indeterminate/
// high; input labels are "Age", "AST", "ALT", "Platelet count".
// Primary reference: Sterling RK et al. Hepatology. 2006;43(6):1317-25.

export const FIB4_INPUTS = [
  {
    key: "ageYears",
    label: "Age",
    type: "number",
    unit: "years",
    min: 12,
    max: 120,
    step: 1,
    placeholder: "e.g. 55",
    pull: { kind: "demographic", field: "ageYears" }
  },
  {
    key: "ast",
    label: "AST",
    hint: "Aspartate aminotransferase",
    type: "number",
    unit: "U/L",
    min: 1,
    step: 1,
    placeholder: "e.g. 45"
  },
  {
    key: "alt",
    label: "ALT",
    hint: "Alanine aminotransferase",
    type: "number",
    unit: "U/L",
    min: 1,
    step: 1,
    placeholder: "e.g. 40"
  },
  {
    key: "platelets",
    label: "Platelet count",
    type: "numberWithUnit",
    units: ["10\u2079/L", "K/\u03bcL"],
    toBase: { "10\u2079/L": 1, "K/\u03bcL": 1 },
    baseUnit: "10\u2079/L",
    min: 1,
    step: 1,
    placeholder: "e.g. 180"
  }
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fib4Band(index) {
  const value = index.toFixed(2);
  if (index < 1.45) {
    return {
      band: "low",
      headline: `${value} points`,
      detail: "Advanced fibrosis excluded. Approximate fibrosis stage: Ishak 0-1 (Sterling et al 2006)."
    };
  }
  if (index <= 3.25) {
    return {
      band: "indeterminate",
      headline: `${value} points`,
      detail: "Further investigation needed. Approximate fibrosis stage: Ishak 2-3 (Sterling et al 2006)."
    };
  }
  return {
    band: "high",
    headline: `${value} points`,
    detail: "Advanced fibrosis (METAVIR stage F3-F4) likely (McPherson 2017). Approximate fibrosis stage: Ishak 4-6 (Sterling et al 2006)."
  };
}

export function calculateFib4(values = {}) {
  const missing = [];
  const ageYears = finiteNumber(values.ageYears);
  if (ageYears === null) missing.push("Age");
  const ast = finiteNumber(values.ast);
  if (ast === null) missing.push("AST");
  const alt = finiteNumber(values.alt);
  if (alt === null || alt <= 0) missing.push("ALT");
  const plateletsValue = finiteNumber(values.platelets);
  if (plateletsValue === null || plateletsValue <= 0) missing.push("Platelet count");

  if (missing.length) {
    return { complete: false, missing, index: null, interpretation: null };
  }

  // K/uL and 10^9/L are the same scale (10^3 per uL = 10^9 per L).
  const platelets = plateletsValue;
  const index = (ageYears * ast) / (platelets * Math.sqrt(alt));
  const interpretation = fib4Band(index);
  const ageNote =
    ageYears < 35 || ageYears > 65
      ? " Note: use with caution in patients <35 or >65 years old, as the score is less reliable in these patients."
      : "";
  return {
    complete: true,
    missing: [],
    index: Math.round(index * 100) / 100,
    interpretation: {
      band: interpretation.band,
      headline: interpretation.headline,
      detail: interpretation.detail + ageNote
    }
  };
}

export const fib4Definition = {
  verifiedOn: "2026-09-26",
  id: "fib4",
  title: "Fibrosis-4 (FIB-4) Index",
  subtitle: "Liver fibrosis, HCV and HBV patients",
  mdcalcId: "2200",
  mdcalcUrl: "https://www.mdcalc.com/calc/2200/fibrosis-4-fib-4-index-liver-fibrosis",
  reference: "Sterling RK et al. Hepatology. 2006;43(6):1317-25.",
  inputs: FIB4_INPUTS,
  calculate: calculateFib4
};
