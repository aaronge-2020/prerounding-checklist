// SOFA (Sequential Organ Failure Assessment) Score.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "SOFA (Sequential Organ Failure Assessment) Score"
// (MDCalc calc 691) one-to-one:
//   - the same 6 organ systems in the same input order: PaO2, FiO2,
//     on mechanical ventilation (incl. CPAP), platelets, GCS,
//     bilirubin, mean arterial pressure OR vasoactive agents, creatinine
//     (or urine output)
//   - MDCalc result wording (observed live 2026-09-26): "N points" /
//     "Initial SOFA Scores ≤9 predict ≤33.3% mortality (see Evidence for
//     details)" — the parenthetical is omitted in-app since there is no
//     Evidence tab to point at.
//     MDCalc writes "1 points" (plural) even for a score of 1, and this
//     module always uses "points" too.
//   - MDCalc input labels (observed live 2026-09-26): "PaO2", "FiO2"
//     (percent, e.g. 40 — entering 0.4 is rejected with "Too low"),
//     "On mechanical ventilation" (sublabel "Including CPAP"),
//     "Platelets, ×10³/µL", "Glasgow Coma Scale" (sublabel "If on
//     sedatives, estimate assumed GCS off sedatives"),
//     "Bilirubin, mg/dL (μmol/L)",
//     "Mean arterial pressure OR administration of vasoactive agents
//     required" (sublabel "Listed doses are in units of mcg/kg/min"),
//     "Creatinine, mg/dL (μmol/L) (or urine output)".
//     Renal urine-output bands appear only inside the renal options
//     ("or UOP <500 mL/day", "or UOP <200 mL/day"); this module keeps the
//     equivalent numeric creatinine + optional urine-output fields.
//   - cardiovascular option labels (verbatim):
//     "No hypotension 0"; "MAP <70 mmHg +1";
//     "DOPamine ≤5 or DOBUTamine (any dose) +2";
//     "DOPamine >5, EPINEPHrine ≤0.1, or norEPINEPHrine ≤0.1 +3";
//     "DOPamine >15, EPINEPHrine >0.1, or norEPINEPHrine >0.1 +4".
// Reference: Vincent JL et al. The SOFA (Sepsis-related Organ Failure
// Assessment) score to describe organ dysfunction/failure. Intensive Care
// Med. 1996;22(7):707-10.
//
// NOTE: Cardiovascular stays manual: the binding layer cannot disambiguate
// vasoactive therapy, and a partial MAP pull would be misleading.

export const SOFA_INPUTS = [
  {
    key: "pao2",
    label: "PaO2",
    type: "number",
    unit: "mmHg",
    min: 0,
    max: 800,
    step: 1,
    placeholder: "e.g. 85",
    hint: "Use the most abnormal value over the last 24 hours."
  },
  {
    key: "fio2",
    label: "FiO2",
    type: "number",
    unit: "%",
    min: 21,
    max: 100,
    step: 1,
    placeholder: "21\u2013100",
    hint: "Enter as a percent: 21 = room air, 100 = 100% oxygen."
  },
  {
    key: "mechanicalVentilation",
    label: "On mechanical ventilation",
    type: "radio",
    options: [
      { value: 0, label: "No" },
      { value: 1, label: "Yes" }
    ],
    hint: "Including CPAP. Respiratory scores of 3-4 require respiratory support."
  },
  {
    key: "platelets",
    label: "Platelets, \u00d710\u00b3/\u00b5L",
    type: "number",
    min: 0,
    max: 2000,
    step: 1,
    placeholder: "e.g. 120"
  },
  {
    key: "gcs",
    label: "Glasgow Coma Scale",
    type: "number",
    min: 3,
    max: 15,
    step: 1,
    placeholder: "3\u201315",
    hint: "If on sedatives, estimate assumed GCS off sedatives."
  },
  {
    key: "bilirubin",
    label: "Bilirubin",
    type: "number",
    unit: "mg/dL",
    min: 0,
    max: 60,
    step: 0.1,
    placeholder: "e.g. 1.4"
  },
  {
    key: "cardiovascular",
    label: "Mean arterial pressure OR administration of vasoactive agents required",
    type: "radio",
    options: [
      { value: 0, label: "No hypotension 0" },
      { value: 1, label: "MAP <70 mmHg +1" },
      { value: 2, label: "DOPamine \u22645 or DOBUTamine (any dose) +2" },
      { value: 3, label: "DOPamine >5, EPINEPHrine \u22640.1, or norEPINEPHrine \u22640.1 +3" },
      { value: 4, label: "DOPamine >15, EPINEPHrine >0.1, or norEPINEPHrine >0.1 +4" }
    ],
    hint: "Listed doses are in units of mcg/kg/min. Stays manual: vasoactive therapy cannot be auto-pulled."
  },
  {
    key: "creatinine",
    label: "Creatinine",
    type: "number",
    unit: "mg/dL",
    min: 0,
    max: 30,
    step: 0.1,
    placeholder: "e.g. 1.1"
  },
  {
    key: "urineOutput",
    label: "Urine output",
    type: "number",
    unit: "mL/day",
    min: 0,
    max: 10000,
    step: 1,
    placeholder: "Optional",
    required: false,
    hint: "Optional. Only used if it worsens the renal score."
  }
];

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scoreRespiration(pao2, fio2, ventilated) {
  const ratio = pao2 / fio2;
  if (ventilated && ratio < 100) return 4;
  if (ventilated && ratio < 200) return 3;
  if (ratio < 300) return 2;
  if (ratio < 400) return 1;
  return 0;
}

function scoreRenal(creatinine, urineOutput) {
  let points;
  if (creatinine >= 5.0) points = 4;
  else if (creatinine >= 3.5) points = 3;
  else if (creatinine >= 2.0) points = 2;
  else if (creatinine >= 1.2) points = 1;
  else points = 0;
  if (urineOutput !== null) {
    if (urineOutput < 200) points = Math.max(points, 4);
    else if (urineOutput < 500) points = Math.max(points, 3);
  }
  return points;
}

export function scoreSofa(values = {}) {
  const missing = [];
  const subscores = {};

  const pao2 = toFiniteNumber(values.pao2);
  const fio2Percent = toFiniteNumber(values.fio2);
  const ventilatedRaw = toFiniteNumber(values.mechanicalVentilation);
  if (pao2 === null) missing.push("PaO2");
  if (fio2Percent === null) missing.push("FiO2");
  if (ventilatedRaw === null) missing.push("On mechanical ventilation");

  const platelets = toFiniteNumber(values.platelets);
  if (platelets === null) missing.push("Platelets");

  const gcs = toFiniteNumber(values.gcs);
  if (gcs === null) missing.push("Glasgow Coma Scale");

  const bilirubin = toFiniteNumber(values.bilirubin);
  if (bilirubin === null) missing.push("Bilirubin");

  const cardiovascular = toFiniteNumber(values.cardiovascular);
  if (cardiovascular === null) missing.push("Mean arterial pressure OR administration of vasoactive agents required");

  const creatinine = toFiniteNumber(values.creatinine);
  if (creatinine === null) missing.push("Creatinine");

  // Urine output is optional: absent means "not supplied", never "missing".
  const rawUrine = values.urineOutput;
  const urineOutput = rawUrine === undefined || rawUrine === null || rawUrine === "" ? null : toFiniteNumber(rawUrine);

  if (missing.length > 0) {
    return { score: null, subscores: {}, complete: false, missing };
  }

  const ventilated = ventilatedRaw === 1;
  // FiO2 is entered as a percent (MDCalc format); convert to a fraction for
  // the PaO2/FiO2 ratio.
  subscores.respiration = scoreRespiration(pao2, fio2Percent / 100, ventilated);
  subscores.coagulation = platelets < 20 ? 4 : platelets < 50 ? 3 : platelets < 100 ? 2 : platelets < 150 ? 1 : 0;
  subscores.liver = bilirubin < 1.2 ? 0 : bilirubin < 2.0 ? 1 : bilirubin < 6.0 ? 2 : bilirubin < 12.0 ? 3 : 4;
  subscores.cardiovascular = cardiovascular;
  subscores.cns = gcs < 6 ? 4 : gcs < 10 ? 3 : gcs < 13 ? 2 : gcs < 15 ? 1 : 0;
  subscores.renal = scoreRenal(creatinine, urineOutput);

  const score = Object.values(subscores).reduce((sum, points) => sum + points, 0);
  return { score, subscores, complete: true, missing };
}

export function interpretSofa(score) {
  return {
    band: "calculated",
    headline: `${score} points`,
    // MDCalc result wording, observed live 2026-09-26.
    detail: "Initial SOFA Scores \u22649 predict \u226433.3% mortality."
  };
}

export function calculateSofa(values = {}) {
  const { score, subscores, complete, missing } = scoreSofa(values);
  return {
    complete,
    missing,
    score,
    subscores,
    interpretation: complete ? interpretSofa(score) : null
  };
}

export const sofaDefinition = {
  verifiedOn: "2026-09-26",
  id: "sofa",
  title: "SOFA (Sequential Organ Failure Assessment) Score",
  subtitle: "ICU organ dysfunction",
  mdcalcId: "691",
  mdcalcUrl: "https://www.mdcalc.com/calc/691/sofa-sequential-organ-failure-assessment-score",
  reference: "Vincent JL et al. The SOFA (Sepsis-related Organ Failure Assessment) score to describe organ dysfunction/failure. Intensive Care Med. 1996;22(7):707-10.",
  inputs: SOFA_INPUTS,
  calculate: calculateSofa
};
