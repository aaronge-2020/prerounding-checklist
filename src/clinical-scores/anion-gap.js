// Serum Anion Gap.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Anion Gap" (MDCalc calc 1669) one-to-one:
//   - input order and labels: Sodium (mEq/L), Chloride (mEq/L),
//     Bicarbonate (mEq/L), Albumin (g/dL)
//   - MDCalc about text (verified against the live calculator 2026-09-26):
//     "Evaluates states of metabolic acidosis."
//   - formulas (per MDCalc's own Evidence review, mdcalc.scholasticahq.com,
//     "Anion gap: pearls, pitfalls, and practical applications"):
//       Anion gap = Na - (Cl + HCO3)
//       Delta gap = patient's AG - "normal" AG (10 to 12)
//       Albumin corrected AG = AG + [2.5 x (4 - albumin in g/dL)]
//       Albumin corrected delta gap = albumin corrected AG - "normal" AG
//       Delta ratio = delta AG / (24 - HCO3)
//   - MDCalc result display (observed live 2026-09-26):
//       "22.0 mEq/L" (headline) / "Delta gap: 10.0 mEq/L" /
//       "Delta ratio: 1.7; Pure anion gap acidosis" — plus, when albumin is
//       given, "Albumin corrected anion gap; suggests high anion gap
//       acidosis" / "Albumin corrected delta gap: 10.0 mEq/L" /
//       "Albumin corrected delta ratio: 1.7".
//       The delta ratio is always shown (to one decimal); when delta
//       bicarbonate is 0 it displays "-Infinity" (observed with
//       140/105/24/4.0: "Delta ratio: -Infinity; Pure normal anion gap
//       acidosis" and "suggests non-anion gap acidosis").
//   - normal AG baseline of 12 is used for delta gap and delta ratio,
//     consistent with MDCalc's review ("considered to be 10 to 12").
//   - display: anion gap, corrected anion gap, delta gaps, and delta ratios
//     to 1 decimal.
//   - delta-ratio interpretation bands (from MDCalc's Evidence review):
//       <0.4: pure normal-anion-gap acidosis
//       0.4-0.8: mixed high- and normal-anion-gap acidosis
//       0.8-2.0: pure high-anion-gap acidosis
//       >2.0: high-anion-gap acidosis with pre-existing metabolic alkalosis
// Reference: Emmett M, Narins RG. Clinical use of the anion gap.
// Medicine (Baltimore). 1977;56(1):38-54.
//
// NOTE: the supplied MDCalc calc id 1093 returns 404; the live calculator is
// calc 1669 (verified 2026-09-26). Result display verified live 2026-09-26.

export const ANION_GAP_NORMAL_AG = 12;
export const ANION_GAP_NORMAL_BICARB = 24;

export const ANION_GAP_INPUTS = [
  {
    key: "sodium",
    label: "Sodium",
    type: "number",
    unit: "mEq/L",
    min: 0,
    max: 250,
    step: 0.1,
    placeholder: "e.g. 140"
  },
  {
    key: "chloride",
    label: "Chloride",
    type: "number",
    unit: "mEq/L",
    min: 0,
    max: 250,
    step: 0.1,
    placeholder: "e.g. 105"
  },
  {
    key: "bicarbonate",
    label: "Bicarbonate",
    type: "number",
    unit: "mEq/L",
    min: 0,
    max: 100,
    step: 0.1,
    placeholder: "e.g. 24"
  },
  {
    key: "albumin",
    label: "Albumin",
    type: "number",
    unit: "g/dL",
    min: 0,
    max: 10,
    step: 0.1,
    placeholder: "Optional",
    required: false,
    hint: "Optional. Adds the albumin-corrected anion gap, delta gap, and delta ratio."
  }
];

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function toFixed1(value) {
  return round1(value).toFixed(1);
}

// MDCalc displays the delta ratio to one decimal, and shows "-Infinity"
// when the delta bicarbonate is 0 (division by zero).
function formatDeltaRatio(ratio) {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return null;
  if (!Number.isFinite(ratio)) return String(ratio);
  return toFixed1(ratio);
}

export function scoreAnionGap(values = {}) {
  const missing = [];
  const sodium = toFiniteNumber(values.sodium);
  const chloride = toFiniteNumber(values.chloride);
  const bicarbonate = toFiniteNumber(values.bicarbonate);
  if (sodium === null) missing.push("Sodium");
  if (chloride === null) missing.push("Chloride");
  if (bicarbonate === null) missing.push("Bicarbonate");

  // Albumin is optional: absent means "not supplied", never "missing".
  const rawAlbumin = values.albumin;
  const albumin = rawAlbumin === undefined || rawAlbumin === null || rawAlbumin === "" ? null : toFiniteNumber(rawAlbumin);

  if (missing.length > 0) {
    return { complete: false, missing, result: null };
  }

  const anionGap = round1(sodium - (chloride + bicarbonate));
  const deltaGap = round1(anionGap - ANION_GAP_NORMAL_AG);
  const result = { anionGap, deltaGap };

  // MDCalc always shows the delta ratio alongside the delta gap (observed
  // live 2026-09-26, including the division-by-zero "-Infinity" display).
  const deltaBicarb = ANION_GAP_NORMAL_BICARB - bicarbonate;
  result.deltaRatio = deltaBicarb === 0
    ? (deltaGap === 0 ? NaN : deltaGap / deltaBicarb)
    : deltaGap / deltaBicarb;

  if (albumin !== null) {
    result.correctedAnionGap = round1(anionGap + 2.5 * (4 - albumin));
    result.correctedDeltaGap = round1(result.correctedAnionGap - ANION_GAP_NORMAL_AG);
    result.correctedDeltaRatio = deltaBicarb === 0
      ? (result.correctedDeltaGap === 0 ? NaN : result.correctedDeltaGap / deltaBicarb)
      : result.correctedDeltaGap / deltaBicarb;
  }

  return { complete: true, missing, result };
}

// Delta-ratio interpretation bands (from MDCalc's Evidence review), with
// labels matching MDCalc's result display phrasing.
export function interpretDeltaRatio(deltaRatio) {
  if (deltaRatio === null || deltaRatio === undefined || Number.isNaN(deltaRatio)) return null;
  if (deltaRatio < 0.4) return "Pure normal anion gap acidosis.";
  if (deltaRatio <= 0.8) return "Mixed high and normal anion gap acidosis.";
  if (deltaRatio <= 2.0) return "Pure anion gap acidosis.";
  return "High anion gap acidosis with pre-existing metabolic alkalosis.";
}

export function interpretAnionGap(result) {
  const lines = [`Delta gap: ${toFixed1(result.deltaGap)} mEq/L.`];
  const ratioText = formatDeltaRatio(result.deltaRatio);
  if (ratioText !== null) {
    const interpretation = interpretDeltaRatio(result.deltaRatio);
    lines.push(`Delta ratio: ${ratioText};${interpretation ? ` ${interpretation}` : ""}`);
  }
  if (result.correctedAnionGap !== undefined) {
    const suggests = result.correctedAnionGap > ANION_GAP_NORMAL_AG
      ? "suggests high anion gap acidosis"
      : "suggests non-anion gap acidosis";
    lines.push(`Albumin corrected anion gap ${toFixed1(result.correctedAnionGap)} mEq/L; ${suggests}.`);
    lines.push(`Albumin corrected delta gap: ${toFixed1(result.correctedDeltaGap)} mEq/L.`);
    const correctedRatioText = formatDeltaRatio(result.correctedDeltaRatio);
    if (correctedRatioText !== null) {
      lines.push(`Albumin corrected delta ratio: ${correctedRatioText}.`);
    }
  }
  const deltaRatio = result.deltaRatio;
  const band = deltaRatio === null || deltaRatio === undefined || Number.isNaN(deltaRatio)
    ? "calculated"
    : deltaRatio > 2.0 ? "high-gap-with-alkalosis" : deltaRatio >= 0.8 ? "pure-high-gap" : "mixed-or-normal-gap";
  return {
    band,
    // MDCalc's headline is just the value.
    headline: `${toFixed1(result.anionGap)} mEq/L`,
    detail: lines.join(" ")
  };
}

export function calculateAnionGap(values = {}) {
  const { complete, missing, result } = scoreAnionGap(values);
  return {
    complete,
    missing,
    result,
    interpretation: complete ? interpretAnionGap(result) : null
  };
}

export const anionGapDefinition = {
  verifiedOn: "2026-09-26",
  id: "anion-gap",
  title: "Anion Gap",
  subtitle: "Metabolic acidosis evaluation",
  mdcalcId: "1669",
  mdcalcUrl: "https://www.mdcalc.com/calc/1669/anion-gap",
  reference: "Emmett M, Narins RG. Clinical use of the anion gap. Medicine (Baltimore). 1977;56(1):38-54.",
  inputs: ANION_GAP_INPUTS,
  calculate: calculateAnionGap
};
