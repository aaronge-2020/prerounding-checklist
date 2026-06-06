export const complaintCdsSchemaVersion = "complaint-cds-artifact-v1";

export const complaintSourceRegistry = [
  {
    id: "AHA_ACC_CHEST_PAIN_2021",
    title: "2021 AHA/ACC/ASE/CHEST/SAEM/SCCT/SCMR Guideline for the Evaluation and Diagnosis of Chest Pain",
    source: "AHA/ACC Joint Committee on Clinical Practice Guidelines",
    version: "2021",
    url: "https://professional.heart.org/en/guidelines-statements/2021-ahaaccasechestsaemscctscmr-guideline-for-the-evaluation-and-diagnosis-ofcir0000000000001029",
    date_accessed: "2026-06-06",
    citation: "2021 AHA/ACC multisociety chest pain guideline"
  },
  {
    id: "ADA_HYPERGLYCEMIC_CRISES_2024",
    title: "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report",
    source: "ADA/EASD/JBDS/AACE/DTS consensus panel",
    version: "2024",
    url: "https://diabetesjournals.org/care/article/47/8/1257/156808/Hyperglycemic-Crises-in-Adults-With-Diabetes-A",
    date_accessed: "2026-06-06",
    citation: "2024 Diabetes Care hyperglycemic crises consensus report"
  },
  {
    id: "ADA_STANDARDS_HOSPITAL_2026",
    title: "Diabetes Care in the Hospital: Standards of Care in Diabetes-2026",
    source: "American Diabetes Association Professional Practice Committee",
    version: "2026",
    url: "https://doi.org/10.2337/dc26-S016",
    date_accessed: "2026-06-06",
    citation: "ADA Standards of Care in Diabetes-2026, Section 16"
  },
  {
    id: "AHRQ_CDS_IMPLEMENTATION",
    title: "Clinical Decision Support",
    source: "Agency for Healthcare Research and Quality",
    version: "current",
    url: "https://www.ahrq.gov/cpi/about/otherwebsites/clinical-decision-support/index.html",
    date_accessed: "2026-06-06",
    citation: "AHRQ clinical decision support resources"
  }
];

const standardAnswerOptions = [
  { value: "unknown", label: "Unknown" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" }
];

const sourceVersionDates = {
  AHA_ACC_CHEST_PAIN_2021: "2021",
  ADA_HYPERGLYCEMIC_CRISES_2024: "2024",
  ADA_STANDARDS_HOSPITAL_2026: "2026",
  AHRQ_CDS_IMPLEMENTATION: "current"
};

function source(source_id, source_section, evidence_strength = "guideline/consensus", implementation_notes = "") {
  return {
    source_id,
    source_section,
    evidence_strength,
    version_date: sourceVersionDates[source_id] || "current",
    last_reviewed: "2026-06-06",
    clinical_owner: "clinical_content_lead",
    implementation_notes
  };
}

export const complaintModules = [
  {
    id: "chest_pain_v1",
    schema_version: complaintCdsSchemaVersion,
    label: "Chest pain",
    complaint_group: "cardiovascular",
    version: "1.0.0",
    status: "mvp",
    population: { age_group: "adult", setting: "clinician support" },
    triggers: [
      "chest pain",
      "pressure",
      "tightness",
      "angina",
      "acute coronary syndrome",
      "acs",
      "pleuritic chest pain",
      "chest discomfort"
    ],
    differentialBuckets: [
      { id: "acs", label: "ACS or myocardial injury", source: source("AHA_ACC_CHEST_PAIN_2021", "structured chest pain pathways") },
      { id: "pe_pulmonary", label: "PE, pneumothorax, pneumonia, or pleural disease", source: source("AHA_ACC_CHEST_PAIN_2021", "life-threatening nonischemic causes") },
      { id: "aortic", label: "Aortic syndrome or vascular emergency", source: source("AHA_ACC_CHEST_PAIN_2021", "life-threatening causes") },
      { id: "noncardiac", label: "Musculoskeletal, GI, anxiety, or other noncardiac causes after red flags are addressed", source: source("AHA_ACC_CHEST_PAIN_2021", "stable and acute chest pain evaluation") }
    ],
    redFlags: [
      {
        id: "chest_pain_unstable_vitals",
        label: "Unstable vitals or shock physiology",
        action: "Urgent emergency evaluation, monitoring, ECG, and escalation.",
        when: { termsAny: ["hypotension", "shock", "unstable", "diaphoretic", "clammy", "respiratory distress", "hypoxia"] },
        source: source("AHA_ACC_CHEST_PAIN_2021", "initial evaluation of acute chest pain")
      },
      {
        id: "chest_pain_syncope_neuro",
        label: "Syncope, new neurologic deficit, or severe sudden pain",
        action: "Treat as high-risk chest pain until life-threatening causes are excluded.",
        when: { termsAny: ["syncope", "fainted", "neurologic deficit", "facial droop", "aphasia", "worst", "sudden", "tearing"] },
        source: source("AHA_ACC_CHEST_PAIN_2021", "life-threatening causes of chest pain")
      },
      {
        id: "chest_pain_dissection_features",
        label: "Dissection pattern: tearing/ripping pain, back radiation, pulse/BP differential, neuro symptoms",
        action: "Escalate urgently and consider aortic imaging pathway per local protocol.",
        when: { termsAny: ["tearing", "ripping", "radiating to back", "pulse deficit", "blood pressure differential", "aortic dissection"] },
        source: source("AHA_ACC_CHEST_PAIN_2021", "life-threatening nonischemic causes")
      }
    ],
    requiredQuestions: [
      { id: "cp_onset_duration", label: "When did the chest discomfort start, and is it ongoing?", options: standardAnswerOptions, source: source("AHA_ACC_CHEST_PAIN_2021", "symptom characterization") },
      { id: "cp_quality_location_radiation", label: "What does it feel like, where is it, and does it radiate to arm, jaw, back, or shoulder?", options: standardAnswerOptions, source: source("AHA_ACC_CHEST_PAIN_2021", "symptom characterization") },
      { id: "cp_exertional_pattern", label: "Is it exertional, relieved by rest, or similar to prior angina?", options: standardAnswerOptions, source: source("AHA_ACC_CHEST_PAIN_2021", "ischemic symptom assessment") },
      { id: "cp_dyspnea", label: "Any shortness of breath, pleuritic pain, cough, hemoptysis, or oxygen requirement?", options: standardAnswerOptions, source: source("AHA_ACC_CHEST_PAIN_2021", "associated symptoms and alternative emergencies") },
      { id: "cp_diaphoresis_nausea", label: "Any diaphoresis, nausea/vomiting, palpitations, or marked weakness?", options: standardAnswerOptions, source: source("AHA_ACC_CHEST_PAIN_2021", "associated symptoms") },
      { id: "cp_syncope", label: "Any syncope, presyncope, neurologic symptoms, or sudden maximal pain?", options: standardAnswerOptions, source: source("AHA_ACC_CHEST_PAIN_2021", "high-risk features") },
      { id: "cp_cad_risk", label: "Known CAD, prior MI/stent/CABG, diabetes, CKD, smoking, hypertension, or strong family history?", options: standardAnswerOptions, source: source("AHA_ACC_CHEST_PAIN_2021", "risk assessment") },
      { id: "cp_med_toxin", label: "Recent cocaine/stimulant use, anticoagulants, estrogen therapy, or medication changes?", options: standardAnswerOptions, source: source("AHA_ACC_CHEST_PAIN_2021", "risk modifiers and alternative causes") }
    ],
    conditionalQuestions: [
      {
        id: "cp_vte_risk",
        label: "Any unilateral leg swelling, recent surgery/immobility, cancer, prior VTE, pregnancy/postpartum state, or estrogen exposure?",
        options: standardAnswerOptions,
        when: { termsAny: ["pleuritic", "dyspnea", "hypoxia", "leg swelling", "dvt", "pulmonary embolism"], answersAny: [{ id: "cp_dyspnea", value: "yes" }] },
        source: source("AHA_ACC_CHEST_PAIN_2021", "pulmonary embolism as alternative emergency")
      },
      {
        id: "cp_repro_pregnancy",
        label: "If relevant, is pregnancy possible or is the patient postpartum?",
        options: standardAnswerOptions,
        when: { termsAny: ["pregnant", "postpartum", "amenorrhea", "reproductive"] },
        source: source("AHA_ACC_CHEST_PAIN_2021", "patient-specific risk assessment")
      },
      {
        id: "cp_reproducible_tenderness",
        label: "Is the pain reproducible with movement, palpation, position, or meals?",
        options: standardAnswerOptions,
        when: { termsAny: ["sharp", "positional", "reproducible", "after meal", "heartburn", "gerd", "costochondritis"] },
        source: source("AHA_ACC_CHEST_PAIN_2021", "noncardiac symptom features")
      }
    ],
    requiredExam: [
      { id: "cp_vitals", label: "Vital signs including BP, HR, RR, oxygen saturation, and general appearance", source: source("AHA_ACC_CHEST_PAIN_2021", "initial evaluation") },
      { id: "cp_cardiac_exam", label: "Cardiac exam: rhythm, murmurs, gallop, rub, signs of heart failure", source: source("AHA_ACC_CHEST_PAIN_2021", "focused cardiovascular exam") },
      { id: "cp_lung_exam", label: "Pulmonary exam: work of breathing, lung sounds, asymmetry, wheeze/crackles", source: source("AHA_ACC_CHEST_PAIN_2021", "alternative cardiopulmonary emergencies") },
      { id: "cp_perf_pulses", label: "Perfusion and pulses: radial pulses, extremity perfusion, pulse deficit if concern", source: source("AHA_ACC_CHEST_PAIN_2021", "life-threatening causes") }
    ],
    conditionalExam: [
      { id: "cp_jvp_edema", label: "JVP, lower extremity edema, and volume status", when: { termsAny: ["dyspnea", "orthopnea", "edema", "heart failure", "volume overload"], answersAny: [{ id: "cp_dyspnea", value: "yes" }] }, source: source("AHA_ACC_CHEST_PAIN_2021", "heart failure findings") },
      { id: "cp_chest_wall", label: "Chest wall palpation for reproducible tenderness", when: { termsAny: ["reproducible", "movement", "costochondritis", "trauma"], answersAny: [{ id: "cp_reproducible_tenderness", value: "yes" }] }, source: source("AHA_ACC_CHEST_PAIN_2021", "noncardiac causes") },
      { id: "cp_leg_dvt", label: "Unilateral leg swelling/tenderness and calf asymmetry if PE/DVT concern", when: { termsAny: ["leg swelling", "dvt", "pulmonary embolism", "pleuritic", "hypoxia"], answersAny: [{ id: "cp_vte_risk", value: "yes" }] }, source: source("AHA_ACC_CHEST_PAIN_2021", "pulmonary embolism as alternative emergency") },
      { id: "cp_bilateral_bp", label: "Blood pressure in both arms and pulse symmetry if dissection concern", when: { termsAny: ["tearing", "ripping", "back", "pulse deficit", "aortic dissection"] }, source: source("AHA_ACC_CHEST_PAIN_2021", "aortic syndrome concern") }
    ],
    initialTests: [
      { id: "cp_ecg_10_min", label: "12-lead ECG immediately for acute chest pain, ideally within 10 minutes in emergency evaluation", source: source("AHA_ACC_CHEST_PAIN_2021", "ECG for acute chest pain") },
      { id: "cp_troponin", label: "High-sensitivity troponin pathway with serial testing per local protocol", source: source("AHA_ACC_CHEST_PAIN_2021", "cardiac troponin recommendations") },
      { id: "cp_monitoring", label: "Cardiac monitor, IV access, and repeat vitals if acute or unstable", source: source("AHA_ACC_CHEST_PAIN_2021", "initial evaluation and risk stratification") },
      { id: "cp_cxr", label: "Chest X-ray when pulmonary, pneumothorax, mediastinal, or heart failure features are possible", source: source("AHA_ACC_CHEST_PAIN_2021", "evaluation for nonischemic causes") },
      { id: "cp_pe_testing", label: "If PE concern persists, use local PE pathway for D-dimer or CT pulmonary angiography", when: { termsAny: ["pleuritic", "hypoxia", "dvt", "pulmonary embolism"], answersAny: [{ id: "cp_vte_risk", value: "yes" }] }, source: source("AHA_ACC_CHEST_PAIN_2021", "pulmonary embolism as alternative emergency") },
      { id: "cp_pregnancy_test", label: "Pregnancy test when pregnancy is possible and testing/imaging decisions depend on it", when: { answersAny: [{ id: "cp_repro_pregnancy", value: "yes" }] }, source: source("AHA_ACC_CHEST_PAIN_2021", "patient-specific testing considerations") }
    ],
    dispositionRules: [
      { id: "cp_emergency_escalation", label: "Acute chest pain with red flags belongs in emergency/monitored evaluation, not routine outpatient workup.", when: { termsAny: ["ongoing", "unstable", "syncope", "hypotension", "diaphoresis", "hypoxia", "tearing", "stemi"] }, source: source("AHA_ACC_CHEST_PAIN_2021", "structured clinical decision pathways") },
      { id: "cp_structured_pathway", label: "Use a structured chest pain clinical decision pathway and risk stratification rather than gestalt alone.", source: source("AHA_ACC_CHEST_PAIN_2021", "structured clinical decision pathways") }
    ]
  },
  {
    id: "hyperglycemia_possible_dka_v1",
    schema_version: complaintCdsSchemaVersion,
    label: "Hyperglycemia / possible DKA or HHS",
    complaint_group: "endocrine_metabolic",
    version: "1.1.0",
    status: "mvp",
    population: { age_group: "adult", setting: "clinician support" },
    triggers: [
      "hyperglycemia",
      "high blood sugar",
      "dka",
      "diabetic ketoacidosis",
      "hhs",
      "hyperosmolar",
      "hyperosmolarity",
      "euglycemic dka",
      "ketones",
      "anion gap",
      "vomiting in diabetes",
      "sglt2",
      "missed insulin"
    ],
    differentialBuckets: [
      { id: "dka", label: "DKA: diabetes/prior diabetes or glucose >=200 mg/dL, beta-hydroxybutyrate >=3.0 mmol/L or urine ketones >=2+, and pH <7.3 and/or bicarbonate <18 mmol/L; can be euglycemic with SGLT2, pregnancy, fasting, or poor intake", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "DKA diagnostic criteria and euglycemic presentations") },
      { id: "hhs", label: "HHS: glucose >=600 mg/dL, effective osmolality >300 mOsm/kg or total osmolality >320 mOsm/kg, absent significant ketonemia, and no significant acidosis; assess for mixed DKA/HHS", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "HHS diagnostic criteria and mixed DKA/HHS") },
      { id: "trigger", label: "Precipitating illness or barrier: infection, insulin omission/access issue, pump failure, MI/stroke, pancreatitis, glucocorticoids/other medications, pregnancy, alcohol, or other physiologic stress", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "precipitating causes and recurrence prevention") },
      { id: "noncrisis", label: "Hyperglycemia without crisis: persistent inpatient glucose >=180 mg/dL generally needs insulin initiation/intensification, while mild stable T2DM may be managed less intensively per inpatient protocol", source: source("ADA_STANDARDS_HOSPITAL_2026", "inpatient hyperglycemia treatment thresholds") }
    ],
    redFlags: [
      {
        id: "dka_mental_status",
        label: "Altered mental status, confusion, obtundation, seizure, or coma",
        action: "Urgent escalation; assess airway, perfusion, osmolality, acidosis, and high-acuity disposition.",
        when: { termsAny: ["altered mental status", "confusion", "obtunded", "coma", "seizure", "somnolence"] },
        source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "severity and clinical presentation")
      },
      {
        id: "dka_shock_dehydration",
        label: "Hypotension, shock, severe dehydration, poor perfusion, or inability to tolerate PO",
        action: "Urgent volume/perfusion assessment and monitored treatment setting.",
        when: { termsAny: ["hypotension", "shock", "dehydration", "severe dehydration", "poor perfusion", "syncope", "unable to tolerate po", "poor oral intake"] },
        source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "fluid losses and clinical presentation")
      },
      {
        id: "dka_kussmaul_resp",
        label: "Kussmaul respirations, respiratory distress, or severe acidosis concern",
        action: "Assess respiratory compensation and acidosis severity urgently.",
        when: { termsAny: ["kussmaul", "deep breathing", "respiratory distress", "severe acidosis"] },
        source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "clinical presentation")
      },
      {
        id: "dka_euglycemic_risk",
        label: "SGLT2 inhibitor, pregnancy, fasting, or lower glucose with ketotic symptoms",
        action: "Do not exclude DKA based only on glucose; check ketones and acidosis.",
        when: { termsAny: ["sglt2", "empagliflozin", "dapagliflozin", "canagliflozin", "pregnant", "fasting", "euglycemic"] },
        source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "DKA diagnostic criteria and euglycemic presentations")
      },
      {
        id: "dka_potassium_danger",
        label: "Hypokalemia, marked hyperkalemia, ECG changes, severe AKI/ESKD, or inability to monitor electrolytes safely",
        action: "Use monitored protocol care; potassium replacement and ECG monitoring drive timing of insulin, and insulin infusion should be delayed when potassium is <3.5 mmol/L until corrected.",
        when: { termsAny: ["hypokalemia", "low potassium", "k <3.5", "k 3.5", "hyperkalemia", "high potassium", "ecg changes", "arrhythmia", "esrd", "eskd", "severe aki", "renal failure"] },
        source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "potassium monitoring and treatment safety")
      },
      {
        id: "dka_special_population",
        label: "Pregnancy, frailty/older adult, heart failure, advanced kidney disease, or major comorbidity affecting fluids/insulin",
        action: "Escalate early to senior endocrinology and the appropriate specialty team; fluid and insulin plans need individualized monitoring.",
        when: { termsAny: ["pregnant", "pregnancy", "older adult", "frail", "heart failure", "esrd", "eskd", "dialysis", "kidney failure", "ckd", "cirrhosis"] },
        source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "special populations and fluid safety")
      }
    ],
    requiredQuestions: [
      { id: "dka_diabetes_type", label: "Known diabetes type, duration, insulin regimen, pump/CGM use, and last insulin dose?", options: standardAnswerOptions, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "clinical history") },
      { id: "dka_recent_glucose", label: "Recent glucose values, beta-hydroxybutyrate/urine ketones, anion gap, bicarbonate, pH, potassium, creatinine, and osmolality if known?", options: standardAnswerOptions, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "diagnostic criteria and severity classification") },
      { id: "dka_missed_insulin", label: "Missed or reduced insulin, pump/infusion-set failure, empty reservoir, expired insulin, medication access issue, or recent dose change?", options: standardAnswerOptions, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "precipitating causes") },
      { id: "dka_polyuria_polydipsia", label: "Polyuria, polydipsia, weight loss, dehydration, or very dry mouth?", options: standardAnswerOptions, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "clinical presentation") },
      { id: "dka_vomit_abdomen", label: "Vomiting, abdominal pain, poor oral intake, or inability to keep fluids down?", options: standardAnswerOptions, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "clinical presentation") },
      { id: "dka_infection_trigger", label: "Fever, dysuria, cough, wound, line infection, dental/skin infection, chest pain, stroke symptoms, pancreatitis symptoms, steroids, or other trigger?", options: standardAnswerOptions, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "precipitating causes") },
      { id: "dka_mental_status_question", label: "Any confusion, sleepiness, seizure, severe weakness, or inability to participate in care?", options: standardAnswerOptions, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "severity and clinical presentation") },
      { id: "dka_sglt2_pregnancy", label: "SGLT2 inhibitor use, pregnancy/postpartum state, fasting/low-carb intake, alcohol, toxin exposure, or recent surgery?", options: standardAnswerOptions, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "precipitating causes and euglycemic DKA") },
      { id: "dka_comorbidity_fluid_risk", label: "Heart failure, CKD/ESKD, frailty, cirrhosis, pregnancy, or other reason to use smaller fluid boluses and closer electrolyte monitoring?", options: standardAnswerOptions, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "special populations and fluid safety") },
      { id: "dka_treatment_started", label: "What has already been given: fluids, insulin route/rate, potassium/phosphate, dextrose, bicarbonate, antibiotics, and current monitoring level?", options: standardAnswerOptions, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "treatment monitoring") }
    ],
    conditionalQuestions: [
      {
        id: "dka_hhs_features",
        label: "Older adult, glucose near/above 600 mg/dL, profound dehydration, neurologic symptoms, high effective/total osmolality, or suspected mixed DKA/HHS?",
        options: standardAnswerOptions,
        when: { termsAny: ["hhs", "hyperosmolar", "hyperosmolarity", "very high glucose", "glucose 600", "older", "confusion", "dehydration"] },
        source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "HHS diagnosis and presentation")
      },
      {
        id: "dka_infection_source_detail",
        label: "If infection or ischemia is possible, what source is most likely: urinary, pulmonary, skin/foot, line, abdomen, dental, MI, stroke, pancreatitis, or other?",
        options: standardAnswerOptions,
        when: { termsAny: ["infection", "fever", "wound", "dysuria", "cough", "chest pain", "stroke", "pancreatitis"], answersAny: [{ id: "dka_infection_trigger", value: "yes" }] },
        source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "precipitating causes")
      },
      {
        id: "dka_discharge_barriers",
        label: "Before discharge planning: insulin/supply access, ketone strips, glucagon, sick-day plan, mental health/substance use, food/housing insecurity, and follow-up arranged?",
        options: standardAnswerOptions,
        when: { termsAny: ["discharge", "readmission", "recurrent", "access", "homeless", "insurance"], answersAny: [{ id: "dka_missed_insulin", value: "yes" }] },
        source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "prevention, discharge education, and social barriers")
      }
    ],
    requiredExam: [
      { id: "dka_vitals", label: "Vital signs including BP, HR, RR, oxygen saturation, temperature, and weight if available", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "clinical assessment") },
      { id: "dka_hydration", label: "Hydration and volume status: mucous membranes, JVP, skin turgor, edema, urine output context", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "fluid losses and clinical presentation") },
      { id: "dka_resp_pattern", label: "Respiratory pattern and work of breathing, including Kussmaul pattern", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "clinical presentation") },
      { id: "dka_mental_status_exam", label: "Mental status and ability to protect airway/participate in care", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "severity assessment") },
      { id: "dka_perfusion", label: "Perfusion: capillary refill, peripheral pulses, extremity temperature, signs of shock", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "clinical assessment") },
      { id: "dka_abdomen", label: "Abdominal exam for tenderness, guarding, ileus, or alternate trigger", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "clinical presentation") }
    ],
    conditionalExam: [
      { id: "dka_infection_exam", label: "Focused infection source exam: lungs, CVA tenderness, skin/feet/wounds/lines, oropharynx as indicated", when: { termsAny: ["infection", "fever", "wound", "dysuria", "cough"], answersAny: [{ id: "dka_infection_trigger", value: "yes" }] }, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "precipitating causes") },
      { id: "dka_diabetes_foot", label: "Diabetes foot/skin exam when wound, neuropathy, ulcer, infection, or discharge planning is relevant", when: { termsAny: ["foot", "ulcer", "wound", "neuropathy", "cellulitis"], answersAny: [{ id: "dka_infection_trigger", value: "yes" }] }, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "precipitating causes and recurrence prevention") },
      { id: "dka_neuro_screen", label: "Focused neurologic exam when confusion, seizure, focal symptoms, or hyperosmolarity is present", when: { termsAny: ["confusion", "seizure", "focal", "hhs", "hyperosmolar"], answersAny: [{ id: "dka_mental_status_question", value: "yes" }] }, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "severity and HHS features") }
    ],
    initialTests: [
      { id: "dka_poc_glucose", label: "Point-of-care glucose now", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "diagnostic criteria") },
      { id: "dka_beta_hydroxybutyrate", label: "Blood beta-hydroxybutyrate preferred; urine ketones only if blood ketones are unavailable", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "ketosis criterion and monitoring") },
      { id: "dka_bmp_gap", label: "Basic metabolic panel/electrolytes with sodium, potassium, chloride, bicarbonate, BUN, creatinine, glucose, anion gap, and corrected sodium", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "diagnosis and monitoring") },
      { id: "dka_blood_gas", label: "Venous pH/blood gas for acidosis severity; arterial gas only when oxygenation/ventilation concern or local protocol requires it", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "acidosis criterion") },
      { id: "dka_osmolality", label: "Calculate effective osmolality and measure serum osmolality when HHS/mixed crisis, severe dehydration, altered mental status, or very high glucose is possible", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "HHS diagnosis and osmolality monitoring") },
      { id: "dka_ecg_potassium", label: "ECG and potassium-focused monitoring if potassium abnormality, weakness, renal failure, or insulin therapy is expected", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "potassium and treatment monitoring") },
      { id: "dka_cbc_phos_mg", label: "CBC with differential plus magnesium and phosphate when crisis is suspected or insulin therapy is expected", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "initial evaluation and electrolyte monitoring") },
      { id: "dka_trigger_tests", label: "Precipitant workup guided by presentation: urinalysis/culture, blood cultures, chest imaging, viral testing, pregnancy test, lipase, troponin/ECG, neuroimaging, or other source evaluation", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "precipitating causes") },
      { id: "dka_a1c", label: "Hemoglobin A1c if no reliable result in the prior 3 months or if baseline control is unclear", source: source("ADA_STANDARDS_HOSPITAL_2026", "A1c testing in hospitalized patients with diabetes or hyperglycemia") },
      { id: "dka_serial_monitoring", label: "If treating DKA/HHS: glucose every 1-2 h; electrolytes, creatinine, phosphate, beta-hydroxybutyrate, and venous pH about every 4 h until DKA resolves; osmolality every 4 h in HHS", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "treatment monitoring") }
    ],
    dispositionRules: [
      { id: "dka_emergency", label: "Suspected DKA/HHS is not routine outpatient hyperglycemia; use urgent evaluation with protocolized fluids, insulin, electrolyte replacement, and precipitant treatment.", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "treatment setting and severity") },
      { id: "dka_high_acuity", label: "ICU/high-acuity care is appropriate for severe DKA, HHS, shock, altered mental status, critical precipitating illness, severe electrolyte disturbance, or inability to monitor safely.", when: { termsAny: ["hhs", "shock", "hypotension", "coma", "severe acidosis", "altered mental status", "severe potassium", "icu"], answersAny: [{ id: "dka_hhs_features", value: "yes" }, { id: "dka_mental_status_question", value: "yes" }] }, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "severity and treatment setting") },
      { id: "dka_mild_moderate_dka", label: "Uncomplicated mild/moderate DKA may be managed in ED observation or step-down with close nursing, serial labs, and IV or protocolized subcutaneous rapid-acting insulin; severe/complicated DKA and HHS need higher acuity.", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "level of care and subcutaneous insulin option") },
      { id: "dka_potassium_rule", label: "Do not start or continue insulin infusion without potassium-aware protocol monitoring; if K <3.5 mmol/L, replace potassium and delay insulin until K is >3.5 mmol/L.", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "potassium replacement and insulin timing") },
      { id: "dka_euglycemic", label: "If SGLT2/pregnancy/fasting risk exists, evaluate ketones/acidosis even if glucose is <200 mg/dL; stop SGLT2 inhibitor on admission and generally do not restart after DKA without a specialist risk-benefit decision.", when: { answersAny: [{ id: "dka_sglt2_pregnancy", value: "yes" }] }, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "euglycemic DKA and SGLT2 inhibitor management") },
      { id: "dka_hhs_correction", label: "For HHS, avoid overly rapid glucose, sodium, or osmolality correction; monitor neurologic status and osmolality closely.", when: { termsAny: ["hhs", "hyperosmolar", "hyperosmolarity", "very high glucose"], answersAny: [{ id: "dka_hhs_features", value: "yes" }] }, source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "HHS osmolality correction and neurologic complications") },
      { id: "dka_resolution_transition", label: "Transition off IV insulin only after biochemical resolution and clinical stability; use basal-bolus insulin with basal overlap 1-2 h before stopping IV insulin, and do not use anion gap alone as the resolution criterion.", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "resolution criteria and transition to subcutaneous insulin") },
      { id: "dka_discharge_prevention", label: "Before discharge, confirm insulin and diabetes supplies, ketone testing plan, sick-day rules, glucagon when indicated, medication affordability, education, and close follow-up; address recurrent DKA or social/mental-health barriers.", source: source("ADA_HYPERGLYCEMIC_CRISES_2024", "prevention, discharge education, and follow-up") }
    ]
  }
];

const plannedComplaintModules = [
  { id: "shortness_of_breath_v1", label: "Shortness of breath", status: "planned" },
  { id: "abdominal_pain_v1", label: "Abdominal pain", status: "planned" },
  { id: "headache_neuro_v1", label: "Headache / acute neurologic complaint", status: "planned" }
];

export function normalizeComplaintText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9+%/.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contextContainsTerm(context, term) {
  const normalized = normalizeComplaintText(term);
  if (!normalized) {
    return false;
  }
  if (!/\s/.test(normalized)) {
    return new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(context);
  }
  return context.includes(normalized);
}

function answerMatches(answerValue, expected = "yes") {
  const answer = String(answerValue || "unknown").toLowerCase();
  if (Array.isArray(expected)) {
    return expected.map((item) => String(item).toLowerCase()).includes(answer);
  }
  return answer === String(expected || "yes").toLowerCase();
}

function answerConditionMatches(answers, condition) {
  if (typeof condition === "string") {
    return answerMatches(answers[condition], "yes");
  }
  return answerMatches(answers[condition.id], condition.value || "yes");
}

export function evaluateComplaintCondition(when, contextText = "", answers = {}) {
  if (!when) {
    return true;
  }
  const context = normalizeComplaintText(contextText);
  let matched = false;

  if (when.termsAny?.length) {
    const ok = when.termsAny.some((term) => contextContainsTerm(context, term));
    if (!ok) {
      return false;
    }
    matched = true;
  }
  if (when.termsAll?.length) {
    const ok = when.termsAll.every((term) => contextContainsTerm(context, term));
    if (!ok) {
      return false;
    }
    matched = true;
  }
  if (when.answersAny?.length) {
    const ok = when.answersAny.some((condition) => answerConditionMatches(answers, condition));
    if (!ok && !matched) {
      return false;
    }
    matched = matched || ok;
  }
  if (when.answersAll?.length) {
    const ok = when.answersAll.every((condition) => answerConditionMatches(answers, condition));
    if (!ok) {
      return false;
    }
    matched = true;
  }
  if (when.not && evaluateComplaintCondition(when.not, context, answers)) {
    return false;
  }
  return matched || Boolean(when.not);
}

function moduleScore(module, context) {
  const triggerScore = module.triggers.reduce((score, trigger) => (
    contextContainsTerm(context, trigger) ? score + (trigger.includes(" ") ? 18 : 11) : score
  ), 0);
  const labelScore = contextContainsTerm(context, module.label) ? 12 : 0;
  return triggerScore + labelScore;
}

export function selectComplaintModule(inputText, modules = complaintModules) {
  const context = normalizeComplaintText(inputText);
  if (!context) {
    return null;
  }
  const scored = modules
    .map((module) => ({ module, score: moduleScore(module, context) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.module.label.localeCompare(b.module.label));
  return scored[0]?.module || null;
}

function withEvaluation(item, contextText, answers, extra = {}) {
  return {
    ...item,
    triggered: item.when ? evaluateComplaintCondition(item.when, contextText, answers) : Boolean(extra.defaultTriggered),
    included: item.when ? evaluateComplaintCondition(item.when, contextText, answers) : true
  };
}

function includeItems(items = [], contextText, answers) {
  return items
    .map((item) => withEvaluation(item, contextText, answers))
    .filter((item) => item.included);
}

function evaluateRedFlags(items = [], contextText, answers) {
  return items.map((item) => withEvaluation(item, contextText, answers));
}

function uniqueSourceIds(items = []) {
  return Array.from(new Set(items.map((item) => item.source?.source_id).filter(Boolean)));
}

export function evaluateComplaintCds(inputText = "", answers = {}, options = {}) {
  const module = options.module || selectComplaintModule(inputText, options.modules || complaintModules);
  if (!module) {
    return {
      matched: false,
      inputText,
      modules: options.modules || complaintModules,
      plannedModules: plannedComplaintModules,
      message: "No complaint module matched. MVP modules currently cover chest pain and hyperglycemia/possible DKA/HHS."
    };
  }

  const requiredQuestions = includeItems(module.requiredQuestions, inputText, answers);
  const conditionalQuestions = includeItems(module.conditionalQuestions, inputText, answers);
  const requiredExam = includeItems(module.requiredExam, inputText, answers);
  const conditionalExam = includeItems(module.conditionalExam, inputText, answers);
  const initialTests = includeItems(module.initialTests, inputText, answers);
  const dispositionRules = includeItems(module.dispositionRules, inputText, answers);
  const redFlags = evaluateRedFlags(module.redFlags, inputText, answers);
  const triggeredRedFlags = redFlags.filter((item) => item.triggered);
  const allIncluded = [
    ...requiredQuestions,
    ...conditionalQuestions,
    ...requiredExam,
    ...conditionalExam,
    ...initialTests,
    ...dispositionRules,
    ...redFlags,
    ...(module.differentialBuckets || [])
  ];
  const sourceIds = uniqueSourceIds(allIncluded);

  return {
    matched: true,
    inputText,
    module,
    answers,
    redFlags,
    triggeredRedFlags,
    requiredQuestions,
    conditionalQuestions,
    requiredExam,
    conditionalExam,
    focusedExam: [...requiredExam, ...conditionalExam],
    initialTests,
    dispositionRules,
    differentialBuckets: module.differentialBuckets || [],
    sourceIds,
    sources: sourceIds.map((id) => complaintSourceRegistry.find((sourceRow) => sourceRow.id === id)).filter(Boolean),
    plannedModules: plannedComplaintModules
  };
}

export function validateComplaintModules(modules = complaintModules, sources = complaintSourceRegistry) {
  const issues = [];
  const moduleIds = new Set();
  const sourceIds = new Set(sources.map((row) => row.id));
  const itemGroups = ["redFlags", "requiredQuestions", "conditionalQuestions", "requiredExam", "conditionalExam", "initialTests", "dispositionRules", "differentialBuckets"];

  modules.forEach((module) => {
    if (!module.id || moduleIds.has(module.id)) {
      issues.push(`Duplicate or missing module id: ${module.id || "missing"}`);
    }
    moduleIds.add(module.id);
    for (const field of ["schema_version", "label", "version", "status", "triggers"]) {
      if (!module[field] || (Array.isArray(module[field]) && !module[field].length)) {
        issues.push(`${module.id} missing ${field}`);
      }
    }
    itemGroups.forEach((group) => {
      (module[group] || []).forEach((item) => {
        if (!item.id || !item.label) {
          issues.push(`${module.id}.${group} has item missing id or label`);
        }
        if (!item.source?.source_id || !sourceIds.has(item.source.source_id)) {
          issues.push(`${module.id}.${group}.${item.id} has invalid source`);
        }
        for (const field of ["source_section", "version_date", "last_reviewed", "clinical_owner"]) {
          if (!item.source?.[field]) {
            issues.push(`${module.id}.${group}.${item.id} missing source.${field}`);
          }
        }
      });
    });
  });

  return { ok: issues.length === 0, issues };
}

function reportItems(title, items, lines, formatter = (item) => item.label) {
  lines.push("", title);
  if (!items.length) {
    lines.push("- None");
    return;
  }
  items.forEach((item) => {
    lines.push(`- ${formatter(item)} [${item.source?.source_id || "source"}]`);
  });
}

export function formatComplaintCdsReport(result) {
  if (!result?.matched) {
    return `Guideline Complaint CDS\n${result?.message || "No module matched."}\n`;
  }
  const lines = [
    "Guideline Complaint CDS",
    `Input: ${result.inputText || "Not specified"}`,
    `Module: ${result.module.label} (${result.module.id}, v${result.module.version})`,
    `Triggered red flags: ${result.triggeredRedFlags.length}`
  ];
  reportItems("Red flags and escalation cues", result.redFlags, lines, (item) => `${item.triggered ? "TRIGGERED: " : "Screen: "}${item.label}${item.action ? ` - ${item.action}` : ""}`);
  reportItems("Required history", result.requiredQuestions, lines);
  reportItems("Conditional history", result.conditionalQuestions, lines);
  reportItems("Focused physical exam", result.focusedExam, lines);
  reportItems("Immediate tests / next steps", result.initialTests, lines);
  reportItems("Disposition cues", result.dispositionRules, lines);
  reportItems("Differential buckets", result.differentialBuckets, lines);
  lines.push("", "Sources");
  result.sources.forEach((sourceRow) => {
    lines.push(`- ${sourceRow.id}: ${sourceRow.citation}; ${sourceRow.url}`);
  });
  return `${lines.join("\n")}\n`;
}
