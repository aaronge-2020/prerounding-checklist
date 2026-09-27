/**
 * COVID-GRAM risk score for critical illness in hospitalized COVID-19.
 *
 * Ten-variable LASSO logistic regression (Liang W et al., JAMA Intern Med
 * 2020): chest X-ray abnormality, age, hemoptysis, dyspnea, unconsciousness,
 * number of comorbidities, cancer history, neutrophil-to-lymphocyte ratio,
 * LDH, and direct bilirubin. Probability = exp(sum(beta*X)) /
 * (1 + exp(sum(beta*X))).
 *
 * The paper publishes odds ratios (Table 3); beta is the natural log of
 * the odds ratio (the paper's stated formula uses sum(beta*X), and the
 * intercept row is listed as "Constant 0.001", i.e. exp(beta0) = 0.001):
 *   X-ray abnormality (yes vs no): OR 3.39 -> beta 1.2208299214
 *   Age, per year: OR 1.03 -> beta 0.0295588022
 *   Hemoptysis (yes vs no): OR 4.53 -> beta 1.5107219395
 *   Dyspnea (yes vs no): OR 1.88 -> beta 0.6312717768
 *   Unconsciousness (yes vs no): OR 4.71 -> beta 1.5496879080
 *   No. of comorbidities: OR 1.60 -> beta 0.4700036292
 *   Cancer history (yes vs no): OR 4.07 -> beta 1.4036429995
 *   Neutrophil to lymphocyte ratio: OR 1.06 -> beta 0.0582689081
 *   Lactate dehydrogenase, per U/L: OR 1.002 -> beta 0.0019980027
 *   Direct bilirubin, per umol/L: OR 1.15 -> beta 0.1397619424
 *   Constant (intercept): OR 0.001 -> beta -6.9077552790
 *
 * Internal bootstrap validation mean AUC 0.88 (95% CI 0.85-0.91); the paper
 * defines no low/high risk bands, so the result is reported as a
 * calculated probability.
 *
 * Patient bindings: numeric age (demographic ageYears) only. NLR, LDH, and
 * direct bilirubin are labs with no supported pull kind and stay manual;
 * the binary clinical features stay manual.
 */

function finiteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Published odds ratios from Table 3 of the paper; beta = ln(OR).
// The "Constant" row is exp(beta0), so beta0 = ln(0.001).
const COVIDGRAM_ODDS_RATIOS = {
  intercept: 0.001,
  xrayAbnormality: 3.39,
  age: 1.03,
  hemoptysis: 4.53,
  dyspnea: 1.88,
  unconsciousness: 4.71,
  comorbidityCount: 1.6,
  cancerHistory: 4.07,
  nlr: 1.06,
  ldh: 1.002,
  directBilirubin: 1.15
};

const COVIDGRAM_COEFFICIENTS = Object.fromEntries(
  Object.entries(COVIDGRAM_ODDS_RATIOS).map(([key, or]) => [key, Math.log(or)])
);

function logisticProbability(linearPredictor) {
  const exp = Math.exp(linearPredictor);
  return exp / (1 + exp);
}

const covidgramDefinition = {
  verifiedOn: "2026-09-27",
  id: "covidgram",
  kind: "ai-model",
  title: "COVID-GRAM Critical Illness Risk",
  subtitle: "LASSO logistic model: probability of critical illness in hospitalized COVID-19.",
  reference:
    "Liang W et al. Development and Validation of a Clinical Risk Score to Predict the Occurrence of Critical Illness in Hospitalized Patients With COVID-19. JAMA Intern Med. 2020;180(8):1081-1089.",
  paperUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7218676/",
  codeUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7218676/",
  validationNote:
    "No open code repo; formula transcribed from the open-access paper. All 10 betas derived as ln(OR) from the published Table 3 odds ratios (intercept beta = ln(0.001)); probability via the paper's exp(sum beta*X)/(1+exp(sum beta*X)) formula. Internal bootstrap AUC 0.88 (0.85-0.91).",
  verifiedAgainst:
    "published beta coefficients, Liang et al., JAMA Intern Med 2020 (PMC7218676)",
  calculate: calculateCovidgram,
  inputs: [
    {
      key: "xrayAbnormality",
      label: "Chest X-ray abnormality",
      type: "radio",
      options: [
        { value: 1, label: "Yes" },
        { value: 0, label: "No" }
      ]
    },
    {
      key: "age",
      label: "Age",
      type: "number",
      min: 1,
      max: 120,
      unit: "years",
      placeholder: "e.g. 55",
      pull: { kind: "demographic", field: "ageYears" }
    },
    {
      key: "hemoptysis",
      label: "Hemoptysis",
      type: "radio",
      options: [
        { value: 1, label: "Yes" },
        { value: 0, label: "No" }
      ]
    },
    {
      key: "dyspnea",
      label: "Dyspnea",
      type: "radio",
      options: [
        { value: 1, label: "Yes" },
        { value: 0, label: "No" }
      ]
    },
    {
      key: "unconsciousness",
      label: "Unconsciousness",
      type: "radio",
      options: [
        { value: 1, label: "Yes" },
        { value: 0, label: "No" }
      ]
    },
    {
      key: "comorbidityCount",
      label: "Number of comorbidities",
      type: "number",
      min: 0,
      max: 10,
      step: 1,
      placeholder: "e.g. 1"
    },
    {
      key: "cancerHistory",
      label: "Cancer history",
      type: "radio",
      options: [
        { value: 1, label: "Yes" },
        { value: 0, label: "No" }
      ]
    },
    {
      key: "nlr",
      label: "Neutrophil-to-lymphocyte ratio",
      type: "number",
      min: 0,
      max: 100,
      step: 0.1,
      unit: "ratio",
      placeholder: "e.g. 3.5"
    },
    {
      key: "ldh",
      label: "LDH",
      type: "number",
      min: 0,
      max: 5000,
      unit: "U/L",
      placeholder: "e.g. 280"
    },
    {
      key: "directBilirubin",
      label: "Direct bilirubin",
      hint: "Enter in µmol/L (mg/dL x 17.1 = µmol/L).",
      type: "number",
      min: 0,
      max: 500,
      step: 0.1,
      unit: "µmol/L",
      placeholder: "e.g. 9"
    }
  ]
};

/**
 * COVID-GRAM probability of critical illness via the paper's logistic
 * formula: probability = exp(sum(beta*X)) / (1 + exp(sum(beta*X))).
 */
function calculateCovidgram(inputs) {
  const missing = covidgramDefinition.inputs
    .filter((field) => inputs[field.key] === undefined || inputs[field.key] === null || inputs[field.key] === "")
    .map((field) => field.label);

  if (missing.length > 0) {
    return {
      complete: false,
      missing,
      linearPredictor: null,
      probability: null,
      probabilityPercent: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: "Answer: " + missing.join(", ") + "."
      }
    };
  }

  const x = {
    xrayAbnormality: finiteNumber(inputs.xrayAbnormality),
    age: finiteNumber(inputs.age),
    hemoptysis: finiteNumber(inputs.hemoptysis),
    dyspnea: finiteNumber(inputs.dyspnea),
    unconsciousness: finiteNumber(inputs.unconsciousness),
    comorbidityCount: finiteNumber(inputs.comorbidityCount),
    cancerHistory: finiteNumber(inputs.cancerHistory),
    nlr: finiteNumber(inputs.nlr),
    ldh: finiteNumber(inputs.ldh),
    directBilirubin: finiteNumber(inputs.directBilirubin)
  };

  let linearPredictor = COVIDGRAM_COEFFICIENTS.intercept;
  for (const key of Object.keys(x)) {
    linearPredictor += COVIDGRAM_COEFFICIENTS[key] * x[key];
  }
  const probability = logisticProbability(linearPredictor);
  const probabilityPercent = probability * 100;

  return {
    complete: true,
    missing: [],
    linearPredictor,
    probability,
    probabilityPercent,
    interpretation: {
      band: "calculated",
      headline: probabilityPercent.toFixed(1) + "% predicted probability of critical illness",
      detail:
        "COVID-GRAM 10-variable LASSO logistic model (Liang et al., JAMA Intern Med 2020). " +
        "Internal bootstrap validation AUC 0.88; the paper defines no risk bands."
    }
  };
}

export {
  covidgramDefinition,
  calculateCovidgram,
  COVIDGRAM_COEFFICIENTS,
  COVIDGRAM_ODDS_RATIOS
};
