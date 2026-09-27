// Light's Criteria for Exudative Effusions.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Light's Criteria for Exudative Effusions" (MDCalc calc 797)
// one-to-one:
//   - the same 5 numeric inputs in MDCalc's order: total serum protein,
//     pleural fluid protein, serum LDH, pleural fluid LDH, upper limit of
//     normal serum LDH
//   - exudative if ANY one criterion is met:
//       pleural fluid protein / serum protein > 0.5
//       pleural fluid LDH / serum LDH > 0.6
//       pleural fluid LDH > 2/3 x serum LDH upper limit of normal
//     otherwise transudative.
//   - result-box wording verified live on 2026-09-26 (2/2 controlled cases
//     matched).
// Primary reference: Light RW, Macgregor MI, Luchsinger PC, Ball WC Jr.
// Pleural effusions: the diagnostic separation of transudates and exudates.
// Ann Intern Med. 1972;77(4):507-13.

export const LIGHTS_INPUTS = [
  {
    key: "serumProtein",
    label: "Total serum protein",
    type: "number",
    unit: "g/dL",
    min: 0,
    step: 0.1,
    placeholder: "e.g. 6.5"
  },
  {
    key: "pleuralProtein",
    label: "Pleural fluid protein",
    type: "number",
    unit: "g/dL",
    min: 0,
    step: 0.1,
    placeholder: "e.g. 4.2"
  },
  {
    key: "serumLdh",
    label: "Serum LDH",
    type: "number",
    unit: "U/L",
    min: 0,
    step: 1,
    placeholder: "e.g. 200"
  },
  {
    key: "pleuralLdh",
    label: "Pleural fluid LDH",
    type: "number",
    unit: "U/L",
    min: 0,
    step: 1,
    placeholder: "e.g. 350"
  },
  {
    key: "serumLdhUpperLimit",
    label: "Upper limit of normal serum LDH",
    type: "number",
    unit: "U/L",
    min: 0,
    step: 1,
    placeholder: "e.g. 250"
  }
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function calculateLights(values = {}) {
  const missing = [];
  const parsed = {};
  for (const input of LIGHTS_INPUTS) {
    const number = finiteNumber(values[input.key]);
    if (number === null) {
      missing.push(input.label);
      continue;
    }
    parsed[input.key] = number;
  }
  if (missing.length) {
    return { complete: false, missing, exudative: null, criteriaMet: [], interpretation: null };
  }

  const criteriaMet = [];
  const proteinRatio = parsed.pleuralProtein / parsed.serumProtein;
  if (parsed.serumProtein > 0 && proteinRatio > 0.5) {
    criteriaMet.push(`pleural fluid protein / serum protein = ${round2(proteinRatio)} (>0.5)`);
  }
  const ldhRatio = parsed.pleuralLdh / parsed.serumLdh;
  if (parsed.serumLdh > 0 && ldhRatio > 0.6) {
    criteriaMet.push(`pleural fluid LDH / serum LDH = ${round2(ldhRatio)} (>0.6)`);
  }
  const ldhThreshold = (2 / 3) * parsed.serumLdhUpperLimit;
  if (parsed.serumLdhUpperLimit > 0 && parsed.pleuralLdh > ldhThreshold) {
    criteriaMet.push(`pleural fluid LDH ${parsed.pleuralLdh} U/L > 2/3 upper limit of normal (${round2(ldhThreshold)} U/L)`);
  }

  const exudative = criteriaMet.length > 0;
  return {
    complete: true,
    missing: [],
    exudative,
    criteriaMet,
    interpretation: interpretLights(exudative)
  };
}

export function interpretLights(exudative) {
  // MDCalc shows no "Exudative"/"Transudative" headline, no criterion count,
  // and no per-criterion values — just this result sentence (verified live
  // on 2026-09-26). The headline is intentionally empty; note-insertion and
  // score-saving handle headline-less results.
  if (exudative) {
    return {
      band: "exudative",
      headline: "",
      detail: "At least one of Light's Criteria has been met; according to one study, this was 98% sensitive for exudative effusion."
    };
  }
  return {
    band: "transudative",
    headline: "",
    detail: "None of Light's criteria met; suggests likely transudative effusion."
  };
}

export const lightsDefinition = {
  verifiedOn: "2026-09-26", // live MDCalc parity: 2/2 controlled cases matched
  id: "lights",
  title: "Light's Criteria for Exudative Effusions",
  subtitle: "Exudative vs. transudative pleural effusion",
  mdcalcId: "797",
  mdcalcUrl: "https://www.mdcalc.com/calc/797/lights-criteria-for-exudative-effusions",
  reference: "Light RW, Macgregor MI, Luchsinger PC, Ball WC Jr. Pleural effusions: the diagnostic separation of transudates and exudates. Ann Intern Med. 1972;77(4):507-13.",
  inputs: LIGHTS_INPUTS,
  calculate: calculateLights
};
