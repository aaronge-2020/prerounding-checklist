/**
 * QRISK3 10-year cardiovascular disease risk (Hippisley-Cox et al., BMJ 2017).
 *
 * Pure client-side port of the LGPLv3 Python implementation at
 * https://github.com/cpi-2718/qrisk3 (itself ported from the ClinRisk
 * QRISK3-2017 algorithm, https://qrisk.org).
 *
 * The module implements the full sex-specific Cox proportional-hazards
 * equations: fractional-polynomial age/BMI terms, centered continuous
 * predictors, ethnicity + smoking coefficients, binary risk-factor terms,
 * and all age interaction terms. 10-year risk = 100 * (1 - S0^exp(a)).
 *
 * Verified 2026-09-27 against the reference Python implementation run
 * locally (7 test vectors, both sexes, ages 28-80, risks 0.17%-99.999%);
 * JS output matches the Python output to <1e-6 percentage points.
 *
 * Scope notes:
 * - Valid for ages 25-84 (the model's derivation range). Out-of-range age,
 *   non-positive SBP/BMI/cholesterol ratio are rejected as incomplete,
 *   mirroring the Python implementation's input validation.
 * - Erectile dysfunction is a male-only term (the female equation does not
 *   use it); for female patients it is not required and is ignored.
 * - BMI is derived from weight + height inputs (numberWithUnit, kg/cm
 *   base units).
 *
 * No DOM, no storage, no network. Coefficients are baked in as constants.
 */

// Coefficients below are transcribed verbatim (full published precision) from
// the reference implementation; the extra digits parse to the same float64
// Python's float() produces for the identical literal, so the disable is
// about literal length, not numeric behavior (verified <1e-6 pp, 2026-09-27).
/* eslint-disable no-loss-of-precision */

// 10-year baseline survival S(10) by sex.
const SURVIVOR_FEMALE = 0.988876402378082;
const SURVIVOR_MALE = 0.977268040180206;

// Ethnicity coefficients by QRISK3 ethnicity code (index 1 unused).
const ETHRISK_FEMALE = [
  0, // 0: White or not stated
  0, // 1: (not used)
  0.2804031433299542500000000, // 2: Indian
  0.5629899414207539800000000, // 3: Pakistani
  0.2959000085111651600000000, // 4: Bangladeshi
  0.0727853798779825450000000, // 5: Other Asian
  -0.1707213550885731700000000, // 6: Black Caribbean
  -0.3937104331487497100000000, // 7: Black African
  -0.3263249528353027200000000, // 8: Chinese
  -0.1712705688324178400000000 // 9: Other ethnic group
];
const ETHRISK_MALE = [
  0, // 0: White or not stated
  0, // 1: (not used)
  0.2771924876030827900000000, // 2: Indian
  0.4744636071493126800000000, // 3: Pakistani
  0.5296172991968937100000000, // 4: Bangladeshi
  0.0351001591862990170000000, // 5: Other Asian
  -0.3580789966932791900000000, // 6: Black Caribbean
  -0.4005648523216514000000000, // 7: Black African
  -0.4152279288983017300000000, // 8: Chinese
  -0.2632134813474996700000000 // 9: Other ethnic group
];

// Smoking coefficients by smoking category (0 non, 1 ex, 2 light, 3 moderate, 4 heavy).
const SMOKE_FEMALE = [
  0,
  0.1338683378654626200000000,
  0.5620085801243853700000000,
  0.6674959337750254700000000,
  0.8494817764483084700000000
];
const SMOKE_MALE = [
  0,
  0.1912822286338898300000000,
  0.5524158819264555200000000,
  0.6383505302750607200000000,
  0.7898381988185801900000000
];

/**
 * Female linear predictor (log hazard ratio sum), ported term-by-term from
 * the reference Python `_cvd_female_raw`. Fractional polynomials:
 * age: (age/10)^-2 and (age/10); BMI: (bmi/10)^-2 and (bmi/10)^-2*ln(bmi/10).
 */
function femaleLinearPredictor(p) {
  const eth = p.ethnicity;
  const smoke = p.smoking;
  const dage = p.age / 10;
  const age1 = Math.pow(dage, -2) - 0.053274843841791;
  const age2 = dage - 4.332503318786621;
  const dbmi = p.bmi / 10;
  const bmi1 = Math.pow(dbmi, -2) - 0.154946178197861;
  const bmi2 = Math.pow(dbmi, -2) * Math.log(dbmi) - 0.144462317228317;
  const rati = p.ratio - 3.476326465606690;
  const sbp = p.sbp - 123.130012512207030;
  const sbps5 = p.sbpStd - 9.002537727355957;
  const town = p.townsend - 0.392308831214905;
  const t1 = p.diabetes === 1 ? 1 : 0;
  const t2 = p.diabetes === 2 ? 1 : 0;

  let a = 0;

  a += ETHRISK_FEMALE[eth];
  a += SMOKE_FEMALE[smoke];

  a += age1 * -8.1388109247726188000000000;
  a += age2 * 0.7973337668969909800000000;
  a += bmi1 * 0.2923609227546005200000000;
  a += bmi2 * -4.1513300213837665000000000;
  a += rati * 0.1533803582080255400000000;
  a += sbp * 0.0131314884071034240000000;
  a += sbps5 * 0.0078894541014586095000000;
  a += town * 0.0772237905885901080000000;

  a += p.af * 1.5923354969269663000000000;
  a += p.antipsychotic * 0.2523764207011555700000000;
  a += p.corticosteroids * 0.5952072530460185100000000;
  a += p.migraine * 0.3012672608703450000000000;
  a += p.rheumatoidArthritis * 0.2136480343518194200000000;
  a += p.ckd * 0.6519456949384583300000000;
  a += p.smi * 0.1255530805882017800000000;
  a += p.sle * 0.7588093865426769300000000;
  a += p.treatedHypertension * 0.5093159368342300400000000;
  a += t1 * 1.7267977510537347000000000;
  a += t2 * 1.0688773244615468000000000;
  a += p.familyHistory * 0.4544531902089621300000000;

  // age_1 interactions
  a += age1 * (smoke === 1 ? 1 : 0) * -4.7057161785851891000000000;
  a += age1 * (smoke === 2 ? 1 : 0) * -2.7430383403573337000000000;
  a += age1 * (smoke === 3 ? 1 : 0) * -0.8660808882939218200000000;
  a += age1 * (smoke === 4 ? 1 : 0) * 0.9024156236971064800000000;
  a += age1 * p.af * 19.9380348895465610000000000;
  a += age1 * p.corticosteroids * -0.9840804523593628100000000;
  a += age1 * p.migraine * 1.7634979587872999000000000;
  a += age1 * p.ckd * -3.5874047731694114000000000;
  a += age1 * p.sle * 19.6903037386382920000000000;
  a += age1 * p.treatedHypertension * 11.8728097339218120000000000;
  a += age1 * t1 * -1.2444332714320747000000000;
  a += age1 * t2 * 6.8652342000009599000000000;
  a += age1 * bmi1 * 23.8026234121417420000000000;
  a += age1 * bmi2 * -71.1849476920870070000000000;
  a += age1 * p.familyHistory * 0.9946780794043512700000000;
  a += age1 * sbp * 0.0341318423386154850000000;
  a += age1 * town * -1.0301180802035639000000000;

  // age_2 interactions
  a += age2 * (smoke === 1 ? 1 : 0) * -0.0755892446431930260000000;
  a += age2 * (smoke === 2 ? 1 : 0) * -0.1195119287486707400000000;
  a += age2 * (smoke === 3 ? 1 : 0) * -0.1036630639757192300000000;
  a += age2 * (smoke === 4 ? 1 : 0) * -0.1399185359171838900000000;
  a += age2 * p.af * -0.0761826510111625050000000;
  a += age2 * p.corticosteroids * -0.1200536494674247200000000;
  a += age2 * p.migraine * -0.0655869178986998590000000;
  a += age2 * p.ckd * -0.2268887308644250700000000;
  a += age2 * p.sle * 0.0773479496790162730000000;
  a += age2 * p.treatedHypertension * 0.0009685782358817443600000;
  a += age2 * t1 * -0.2872406462448894900000000;
  a += age2 * t2 * -0.0971122525906954890000000;
  a += age2 * bmi1 * 0.5236995893366442900000000;
  a += age2 * bmi2 * 0.0457441901223237590000000;
  a += age2 * p.familyHistory * -0.0768850516984230380000000;
  a += age2 * sbp * -0.0015082501423272358000000;
  a += age2 * town * -0.0315934146749623290000000;

  return a;
}

/**
 * Male linear predictor (log hazard ratio sum), ported term-by-term from
 * the reference Python `_cvd_male_raw`. Fractional polynomials:
 * age: (age/10)^-1 and (age/10)^3; BMI: (bmi/10)^-2 and (bmi/10)^-2*ln(bmi/10).
 */
function maleLinearPredictor(p) {
  const eth = p.ethnicity;
  const smoke = p.smoking;
  const dage = p.age / 10;
  const age1 = Math.pow(dage, -1) - 0.234766781330109;
  const age2 = Math.pow(dage, 3) - 77.284080505371094;
  const dbmi = p.bmi / 10;
  const bmi1 = Math.pow(dbmi, -2) - 0.149176135659218;
  const bmi2 = Math.pow(dbmi, -2) * Math.log(dbmi) - 0.141913309693336;
  const rati = p.ratio - 4.300998687744141;
  const sbp = p.sbp - 128.571578979492190;
  const sbps5 = p.sbpStd - 8.756621360778809;
  const town = p.townsend - 0.526304900646210;
  const t1 = p.diabetes === 1 ? 1 : 0;
  const t2 = p.diabetes === 2 ? 1 : 0;

  let a = 0;

  a += ETHRISK_MALE[eth];
  a += SMOKE_MALE[smoke];

  a += age1 * -17.8397816660055750000000000;
  a += age2 * 0.0022964880605765492000000;
  a += bmi1 * 2.4562776660536358000000000;
  a += bmi2 * -8.3011122314711354000000000;
  a += rati * 0.1734019685632711100000000;
  a += sbp * 0.0129101265425533050000000;
  a += sbps5 * 0.0102519142912904560000000;
  a += town * 0.0332682012772872950000000;

  a += p.af * 0.8820923692805465700000000;
  a += p.antipsychotic * 0.1304687985517351300000000;
  a += p.corticosteroids * 0.4548539975044554300000000;
  a += p.erectileDysfunction * 0.2225185908670538300000000;
  a += p.migraine * 0.2558417807415991300000000;
  a += p.rheumatoidArthritis * 0.2097065801395656700000000;
  a += p.ckd * 0.7185326128827438400000000;
  a += p.smi * 0.1213303988204716400000000;
  a += p.sle * 0.4401572174457522000000000;
  a += p.treatedHypertension * 0.5165987108269547400000000;
  a += t1 * 1.2343425521675175000000000;
  a += t2 * 0.8594207143093222100000000;
  a += p.familyHistory * 0.5405546900939015600000000;

  // age_1 interactions
  a += age1 * (smoke === 1 ? 1 : 0) * -0.2101113393351634600000000;
  a += age1 * (smoke === 2 ? 1 : 0) * 0.7526867644750319100000000;
  a += age1 * (smoke === 3 ? 1 : 0) * 0.9931588755640579100000000;
  a += age1 * (smoke === 4 ? 1 : 0) * 2.1331163414389076000000000;
  a += age1 * p.af * 3.4896675530623207000000000;
  a += age1 * p.corticosteroids * 1.1708133653489108000000000;
  a += age1 * p.erectileDysfunction * -1.5064009857454310000000000;
  a += age1 * p.migraine * 2.3491159871402441000000000;
  a += age1 * p.ckd * -0.5065671632722369400000000;
  a += age1 * p.treatedHypertension * 6.5114581098532671000000000;
  a += age1 * t1 * 5.3379864878006531000000000;
  a += age1 * t2 * 3.6461817406221311000000000;
  a += age1 * bmi1 * 31.0049529560338860000000000;
  a += age1 * bmi2 * -111.2915718439164300000000000;
  a += age1 * p.familyHistory * 2.7808628508531887000000000;
  a += age1 * sbp * 0.0188585244698658530000000;
  a += age1 * town * -0.1007554870063731000000000;

  // age_2 interactions
  a += age2 * (smoke === 1 ? 1 : 0) * -0.0004985487027532612100000;
  a += age2 * (smoke === 2 ? 1 : 0) * -0.0007987563331738541400000;
  a += age2 * (smoke === 3 ? 1 : 0) * -0.0008370618426625129600000;
  a += age2 * (smoke === 4 ? 1 : 0) * -0.0007840031915563728900000;
  a += age2 * p.af * -0.0003499560834063604900000;
  a += age2 * p.corticosteroids * -0.0002496045095297166000000;
  a += age2 * p.erectileDysfunction * -0.0011058218441227373000000;
  a += age2 * p.migraine * 0.0001989644604147863100000;
  a += age2 * p.ckd * -0.0018325930166498813000000;
  a += age2 * p.treatedHypertension * 0.0006383805310416501300000;
  a += age2 * t1 * 0.0006409780808752897000000;
  a += age2 * t2 * -0.0002469569558886831500000;
  a += age2 * bmi1 * 0.0050380102356322029000000;
  a += age2 * bmi2 * -0.0130744830025243190000000;
  a += age2 * p.familyHistory * -0.0002479180990739603700000;
  a += age2 * sbp * -0.0000127187419158845700000;
  a += age2 * town * -0.0000932996423232728880000;

  return a;
}

function yesNoOptions(label) {
  return {
    key: label.key,
    label: label.text,
    type: "radio",
    options: [
      { value: 1, label: "Yes" },
      { value: 0, label: "No" }
    ],
    hint: label.hint
  };
}

const qrisk3Definition = {
  verifiedOn: "2026-09-27",
  id: "qrisk3",
  kind: "ai-model",
  title: "QRISK3 10-Year CVD Risk",
  subtitle: "10-year risk of heart attack or stroke (no prior CVD, not on statins).",
  reference: "Hippisley-Cox J, Coupland C, Brindle P. Development and validation of QRISK3 risk prediction algorithms to estimate future risk of cardiovascular disease: prospective cohort study. BMJ. 2017;357:j2099.",
  paperUrl: "https://doi.org/10.1136/bmj.j2099",
  codeUrl: "https://github.com/cpi-2718/qrisk3",
  validationNote: "QRISK3 was derived and validated in a large prospective UK primary-care cohort (QResearch) with external validation in independent UK cohorts (Hippisley-Cox et al., BMJ 2017). This module ports the open-source LGPLv3 Python implementation's full sex-specific Cox equations and matches its outputs to <1e-6 percentage points on local test vectors.",
  verifiedAgainst: "reference Python implementation (cpi-2718/qrisk3), local execution",
  disclaimer:
    "IMPORTANT DISCLAIMER:\n" +
    "\n" +
    "This implementation is based on QRISK3-2017 (https://qrisk.org).\n" +
    "The original algorithm can be found at http://svn.clinrisk.co.uk/opensource/qrisk2\n" +
    "\n" +
    "ClinRisk Ltd. stress that it is the responsibility of the end user to check that the source that they receive produces the same results as the original code found at https://qrisk.org.\n" +
    "\n" +
    "Inaccurate implementations of risk scores can lead to wrong patients being given the wrong treatment.\n" +
    "\n" +
    "All medical decisions need to be taken by a patient in consultation with their doctor. The authors and sponsors accept no responsibility for clinical use or misuse of this score.",
  calculate: calculateQrsk3,
  inputs: [
    {
      key: "age",
      label: "Age",
      type: "number",
      min: 25,
      max: 84,
      unit: "years",
      hint: "QRISK3 is validated for ages 25-84.",
      pull: { kind: "demographic", field: "ageYears" }
    },
    {
      key: "sex",
      label: "Sex",
      type: "radio",
      options: [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" }
      ]
    },
    {
      key: "ethnicity",
      label: "Ethnicity",
      type: "select",
      options: [
        { value: 0, label: "White or not stated" },
        { value: 2, label: "Indian" },
        { value: 3, label: "Pakistani" },
        { value: 4, label: "Bangladeshi" },
        { value: 5, label: "Other Asian" },
        { value: 6, label: "Black Caribbean" },
        { value: 7, label: "Black African" },
        { value: 8, label: "Chinese" },
        { value: 9, label: "Other ethnic group" }
      ]
    },
    {
      key: "townsend",
      label: "Townsend deprivation score",
      type: "number",
      step: 0.1,
      hint: "Enter 0 if unknown."
    },
    {
      key: "smoking",
      label: "Smoking status",
      type: "select",
      options: [
        { value: 0, label: "Non-smoker" },
        { value: 1, label: "Ex-smoker" },
        { value: 2, label: "Light (<10/day)" },
        { value: 3, label: "Moderate (10-19/day)" },
        { value: 4, label: "Heavy (\u226520/day)" }
      ]
    },
    {
      key: "diabetes",
      label: "Diabetes",
      type: "select",
      options: [
        { value: 0, label: "None" },
        { value: 1, label: "Type 1" },
        { value: 2, label: "Type 2" }
      ]
    },
    {
      key: "sbp",
      label: "Systolic BP",
      type: "number",
      min: 1,
      max: 300,
      unit: "mmHg",
      pull: { kind: "vital", match: [/systolic/i] }
    },
    {
      key: "sbpStd",
      label: "Systolic BP variability (SD)",
      type: "number",
      min: 0,
      max: 100,
      unit: "mmHg",
      hint: "Standard deviation of recent readings. Enter 0 if unknown."
    },
    {
      key: "cholHdlRatio",
      label: "Cholesterol/HDL ratio",
      type: "number",
      min: 0.1,
      max: 30,
      step: 0.1,
      hint: "Total cholesterol divided by HDL cholesterol."
    },
    {
      key: "weight",
      label: "Weight",
      type: "numberWithUnit",
      units: ["kg", "lb"],
      toBase: { kg: 1, lb: 1 / 2.20462 },
      baseUnit: "kg",
      min: 20,
      max: 400,
      step: 0.1,
      pull: { kind: "vital", match: [/weight/i], preferUnit: "kg" }
    },
    {
      key: "height",
      label: "Height",
      type: "numberWithUnit",
      units: ["cm", "in"],
      toBase: { cm: 1, in: 2.54 },
      baseUnit: "cm",
      min: 100,
      max: 250,
      step: 0.5,
      pull: { kind: "vital", match: [/height/i], preferUnit: "cm" }
    },
    yesNoOptions({ key: "atrialFibrillation", text: "Atrial fibrillation" }),
    yesNoOptions({ key: "atypicalAntipsychotic", text: "Atypical antipsychotic medication" }),
    yesNoOptions({ key: "corticosteroids", text: "Corticosteroids" }),
    yesNoOptions({ key: "migraine", text: "Migraine" }),
    yesNoOptions({ key: "rheumatoidArthritis", text: "Rheumatoid arthritis" }),
    yesNoOptions({ key: "chronicKidneyDisease", text: "Chronic kidney disease (stage 3, 4 or 5)" }),
    yesNoOptions({ key: "severeMentalIllness", text: "Severe mental illness" }),
    yesNoOptions({ key: "systemicLupus", text: "Systemic lupus erythematosus" }),
    yesNoOptions({ key: "treatedHypertension", text: "Blood pressure treatment" }),
    yesNoOptions({
      key: "erectileDysfunction",
      text: "Erectile dysfunction",
      hint: "Males only - ignored for female patients."
    }),
    yesNoOptions({ key: "familyHistoryCvd", text: "Family history of CVD (1st degree relative <60)" })
  ]
};

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

function incompleteResult(missingLabels) {
  return {
    complete: false,
    missing: missingLabels,
    tenYearCvdRiskPercent: null,
    bmi: null,
    interpretation: {
      band: "incomplete",
      headline: "Incomplete",
      detail: "Answer: " + missingLabels.join(", ") + "."
    }
  };
}

/**
 * Score QRISK3 10-year CVD risk. BMI is derived from weight + height.
 */
function calculateQrsk3(inputs) {
  const sex = inputs.sex;
  // Erectile dysfunction is a male-only term in the model; do not require
  // it for female patients (the female equation never uses it).
  const required = qrisk3Definition.inputs.filter(
    (field) => !(sex === "female" && field.key === "erectileDysfunction")
  );
  const missing = required
    .filter((field) => isMissing(inputs[field.key]))
    .map((field) => field.label);

  if (missing.length > 0) {
    return incompleteResult(missing);
  }

  const age = Number(inputs.age);
  const sbp = Number(inputs.sbp);
  const ratio = Number(inputs.cholHdlRatio);
  const weightKg = Number(inputs.weight) * (inputs.weightUnit === "lb" ? 1 / 2.20462 : 1);
  const heightCm = Number(inputs.height) * (inputs.heightUnit === "in" ? 2.54 : 1);
  const bmi = weightKg / Math.pow(heightCm / 100, 2);

  // Mirror the Python implementation's input validation.
  const rangeProblems = [];
  if (!(age >= 25 && age <= 84)) rangeProblems.push("Age must be between 25 and 84");
  if (!(sbp > 0)) rangeProblems.push("Systolic BP must be positive");
  if (!(ratio > 0)) rangeProblems.push("Cholesterol/HDL ratio must be positive");
  if (!(bmi > 0)) rangeProblems.push("BMI must be positive");
  if (rangeProblems.length > 0) {
    return {
      complete: false,
      missing: [],
      tenYearCvdRiskPercent: null,
      bmi: null,
      interpretation: {
        band: "incomplete",
        headline: "Incomplete",
        detail: rangeProblems.join(". ") + "."
      }
    };
  }

  const isFemale = sex === "female";
  const p = {
    age,
    ethnicity: Number(inputs.ethnicity),
    smoking: Number(inputs.smoking),
    diabetes: Number(inputs.diabetes),
    sbp,
    sbpStd: Number(inputs.sbpStd),
    ratio,
    bmi,
    townsend: Number(inputs.townsend),
    af: Number(inputs.atrialFibrillation),
    antipsychotic: Number(inputs.atypicalAntipsychotic),
    corticosteroids: Number(inputs.corticosteroids),
    migraine: Number(inputs.migraine),
    rheumatoidArthritis: Number(inputs.rheumatoidArthritis),
    ckd: Number(inputs.chronicKidneyDisease),
    smi: Number(inputs.severeMentalIllness),
    sle: Number(inputs.systemicLupus),
    treatedHypertension: Number(inputs.treatedHypertension),
    erectileDysfunction: Number(inputs.erectileDysfunction || 0),
    familyHistory: Number(inputs.familyHistoryCvd)
  };

  const a = isFemale ? femaleLinearPredictor(p) : maleLinearPredictor(p);
  const s0 = isFemale ? SURVIVOR_FEMALE : SURVIVOR_MALE;
  const tenYearCvdRiskPercent = 100 * (1 - Math.pow(s0, Math.exp(a)));

  const band = tenYearCvdRiskPercent >= 20 ? "high" : tenYearCvdRiskPercent >= 10 ? "moderate" : "low";
  const category = band === "high" ? "High risk" : band === "moderate" ? "Moderate risk" : "Low risk";

  return {
    complete: true,
    missing: [],
    tenYearCvdRiskPercent,
    bmi,
    interpretation: {
      band,
      headline: "10-year CVD risk: " + tenYearCvdRiskPercent.toFixed(1) + "%",
      detail:
        category +
        " (<10% low, 10-20% moderate, >20% high). UK guidelines suggest considering statin therapy at \u226510% 10-year CVD risk. " +
        "BMI " +
        bmi.toFixed(1) +
        " kg/m\u00B2."
    }
  };
}

export { qrisk3Definition, calculateQrsk3 };
