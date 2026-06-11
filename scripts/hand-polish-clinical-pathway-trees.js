import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const auditDate = "2026-06-11";
const moduleRoot = "medical-knowledge/complaint-modules";
const sourceRegistryPath = "medical-knowledge/source-registry.json";

const genericSourceIds = ["AHRQ_CALIBRATE_DX"];
const evidenceGroups = [
  "clinical_cutoff_criteria",
  "differentialBuckets",
  "initialTests",
  "redFlags",
  "dispositionRules",
  "safetyChecks",
  "requiredQuestions",
  "conditionalQuestions",
  "requiredExam",
  "conditionalExam"
];

const requiredPathwayDomains = [
  "initial assessment",
  "red flags/instability",
  "diagnostic confirmation",
  "mimics/exclusions",
  "severity/risk stratification",
  "first-line management",
  "escalation/emergency actions",
  "contraindications/special populations",
  "monitoring/reassessment",
  "de-escalation/stopping criteria",
  "disposition",
  "follow-up",
  "safety-netting"
];

const contextDomains = [
  "symptoms",
  "exam",
  "vitals",
  "labs",
  "imaging_results",
  "medications",
  "comorbidities",
  "demographics",
  "pregnancy_status",
  "workup_findings"
];

const cutoffUnits = "(?:mg/dL|mg/L|g/L|mmol/L|mEq/L|mIU/L|mU/L|ng/mL|pg/mL|ug/L|mg/g|mcg/mg|mm Hg|mL/kg|mg/kg|g/kg|kg/m2|mL/min(?:/1\\.73\\s*m2)?|mL|hours?|days?|weeks?|months?|years?|cm|mm|ms|seconds?|minutes?|breaths/minute|x10\\^9/L|%|(?:deg\\s*C|degrees?\\s*C|C(?![a-z]))|ULN|LLN|mOsm/kg|bpm|IU/L|U/L|mcg/dL|ug/dL|mcg/day|mcg|g|mg|kg|cycles/year|measurements?|collections?|samples?|percent|percentile)";
const cutoffPattern = new RegExp([
  "(?:(?:>=|<=|>|<|=)|(?:above|below|exceeds?))\\s*(?:the\\s+)?(?:assay\\s+)?(?:ULN|LLN|upper limit of normal|lower limit of normal|reference range)",
  "\\b\\d+(?:\\.\\d+)?\\s*(?:x|times|fold|-fold)\\s*(?:ULN|upper limit of normal)",
  "\\b[A-Z][A-Za-z0-9+/ -]{0,30}\\s*(?:score\\s*)?(?:>=|<=|>|<|=)\\s*-?\\d+(?:\\.\\d+)?\\s*" + cutoffUnits + "?",
  "(?:>=|<=|>|<|=)\\s*-?\\d+(?:\\.\\d+)?\\s*" + cutoffUnits + "?",
  "\\b\\d+(?:\\.\\d+)?\\s*" + cutoffUnits + "\\s*(?:-|to)\\s*\\d+(?:\\.\\d+)?\\s*" + cutoffUnits + "?",
  "\\b\\d+(?:\\.\\d+)?\\s*(?:-|to)\\s*\\d+(?:\\.\\d+)?\\s*" + cutoffUnits,
  "\\b\\d+(?:\\.\\d+)?\\s*" + cutoffUnits,
  "\\b(?:at least|at most|more than|less than|maximum|max|min(?:imum)?|up to)\\s+\\d+(?:\\.\\d+)?\\b",
  "\\b\\d+\\s+or\\s+(?:more|fewer|less)\\b",
  "\\bday\\s+\\d+\\b",
  "\\bage\\s+\\d+\\b",
  "\\b\\d+\\s+(?:principal clinical features|features|benzodiazepine doses|upper UTIs?|lower UTIs?)\\b"
].join("|"), "gi");
const shallowGeneratedItemPattern = /\b(?:source-backed criteria|use the high-risk or confirmed-pathway management option|lower-risk, outpatient, supportive, or safety-net pathway|stabilize or escalate before routine treatment|screen for immediate danger or disposition-changing findings|order focused first-line studies and interpret them in sequence|apply source-backed decision steps)\b/i;

const cahCutoffCriteria = [
  {
    id: "cah_17ohp_reference_range_confirmation",
    label: "CAH diagnostic confirmation: positive newborn screen or symptomatic patient needs 17-OHP above reference range with gestational-age/assay context and cosyntropin profile when borderline",
    criteria_text: "Endocrine Society recommends gestational-age-stratified 17-hydroxyprogesterone screening, early-morning baseline 17-OHP by LC-MS/MS after infancy, and cosyntropin adrenocortical profile when 17-OHP is borderline or first-tier immunoassay screening is positive.",
    cutoffs: ["17-OHP above reference range"],
    data_needed: ["newborn screen result", "gestational age", "assay method", "baseline 17-OHP", "cosyntropin stimulated steroid profile when borderline"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Diagnosis of congenital adrenal hyperplasia recommendations 1.2, 1.3, 3.1-3.3"
  },
  {
    id: "cah_stress_dose_fever_cutoff",
    label: "CAH stress-dose trigger: febrile illness temperature >38.5 C, dehydration gastroenteritis, major surgery with anesthesia, or major trauma",
    criteria_text: "Increase glucocorticoid dosing in CAH patients who require glucocorticoids for febrile illness >38.5 C, gastroenteritis with dehydration, major surgery with general anesthesia, or major trauma; do not increase for everyday emotional stress or minor illness.",
    cutoffs: [">38.5 C"],
    data_needed: ["temperature", "dehydration/vomiting/diarrhea", "major surgery or anesthesia", "major trauma", "current glucocorticoid plan"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Stress dosing recommendations 4.7-4.11"
  },
  {
    id: "cah_nonclassic_stress_cortisol_response",
    label: "Nonclassic CAH major-stress hydrocortisone only if cosyntropin cortisol response is suboptimal <14-18 ug/dL (<400-500 nmol/L) or iatrogenic suppression exists",
    criteria_text: "For nonclassic CAH, hydrocortisone stress dosing for major surgery, trauma, or childbirth is suggested only when cosyntropin cortisol response is suboptimal (<14 to 18 ug/dL or <400 to 500 nmol/L) or iatrogenic adrenal suppression is present.",
    cutoffs: ["<14-18 ug/dL", "<400-500 nmol/L"],
    data_needed: ["cosyntropin peak cortisol", "assay-specific cortisol cutoff", "major surgery/trauma/childbirth status", "iatrogenic glucocorticoid suppression"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Nonclassic congenital adrenal hyperplasia recommendation 5.6"
  },
  {
    id: "cah_monitoring_age_intervals",
    label: "CAH pediatric monitoring: age <=18 months monitor first 3 months of life and every 3 months thereafter; age >18 months evaluate every 4 months",
    criteria_text: "For CAH patients <=18 months, monitor closely in the first 3 months of life and every 3 months thereafter; after 18 months, evaluate every 4 months, with pediatric growth, weight, blood pressure, exam, and biochemical measurements.",
    cutoffs: ["<=18 months", "3 months", ">18 months", "4 months"],
    data_needed: ["age", "last endocrine visit date", "growth velocity", "weight", "blood pressure", "timed hormones"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Monitoring therapy recommendations 4.12-4.16"
  }
];

const acromegalyGigantismCutoffCriteria = [
  {
    id: "gh_excess_igf1_uln_diagnosis",
    label: "GH excess diagnosis: typical phenotype with IGF-1 >1.3 x ULN for age confirms acromegaly/gigantism spectrum",
    criteria_text: "The 2024 Acromegaly Consensus Group states that in a patient with typical features, IGF-1 >1.3 times the upper limit of normal for age confirms the diagnosis; repeat IGF-1 or OGTT is used when results are equivocal.",
    cutoffs: [">1.3 x ULN"],
    data_needed: ["age/sex/puberty-adjusted IGF-1", "assay ULN", "typical GH-excess features", "repeat IGF-1 if equivocal"],
    source_ids: ["ACROMEGALY_DIAGNOSIS_REMISSION_2024"],
    source_section: "Consensus diagnosis criteria"
  },
  {
    id: "gh_excess_ogtt_suppression_cutoffs",
    label: "GH excess OGTT: failure to suppress GH to <1 ng/mL, or <0.4 ng/mL with ultrasensitive assays, supports active disease when IGF-1 is high/equivocal",
    criteria_text: "When IGF-1 results are equivocal, oral glucose tolerance testing can be used; historical Endocrine Society criteria use GH nadir <1 ng/mL for suppression, with lower <0.4 ng/mL cutoffs used by more sensitive assays.",
    cutoffs: ["GH nadir <1 ng/mL", "GH nadir <0.4 ng/mL"],
    data_needed: ["75-g OGTT GH nadir", "GH assay sensitivity", "IGF-1 result", "puberty/diabetes status"],
    source_ids: ["ES_ACROMEGALY_2014", "ACROMEGALY_DIAGNOSIS_REMISSION_2024"],
    source_section: "Biochemical diagnosis and remission criteria"
  }
];

const cushingDiagnosisCutoffCriteria = [
  {
    id: "cushing_initial_test_collection_count",
    label: "Cushing initial testing: use UFC at least 2 measurements, late-night salivary cortisol 2 measurements, 1-mg overnight DST, or 2 mg/day for 48 hours DST",
    criteria_text: "Endocrine Society recommends one high-accuracy initial test: UFC at least two measurements, late-night salivary cortisol two measurements, 1-mg overnight DST, or longer low-dose DST 2 mg/day for 48 hours.",
    cutoffs: ["at least 2 measurements", "2 measurements", "1 mg", "2 mg/day", "48 hours"],
    data_needed: ["UFC collection count", "late-night salivary cortisol count", "dexamethasone dose and timing", "renal function", "pregnancy/antiepileptic context"],
    source_ids: ["ES_CUSHING_DX_2008"],
    source_section: "Initial testing recommendations 3.4.1-3.4.4"
  },
  {
    id: "cushing_dst_lnsf_ufc_positive_cutoffs",
    label: "Cushing positive biochemical screen: UFC > assay ULN, post-1 mg DST cortisol >1.8 ug/dL (50 nmol/L), or late-night salivary cortisol >145 ng/dL (4 nmol/L)",
    criteria_text: "Diagnostic criteria suggesting Cushing syndrome include UFC greater than the assay normal range, serum cortisol >1.8 ug/dL (50 nmol/L) after 1-mg DST, and late-night salivary cortisol >145 ng/dL (4 nmol/L).",
    cutoffs: [">ULN", ">1.8 ug/dL", "50 nmol/L", ">145 ng/dL", "4 nmol/L"],
    data_needed: ["24-hour UFC with assay ULN", "post-DST cortisol", "late-night salivary cortisol", "dexamethasone adherence/interactions"],
    source_ids: ["ES_CUSHING_DX_2008"],
    source_section: "Figure 1 diagnostic criteria"
  }
];

const adultSepsisCutoffCriteria = [
  {
    id: "adult_sepsis_shock_hemodynamic_cutoffs",
    label: "Adult septic shock physiology: vasopressors to maintain MAP >=65 mm Hg with lactate >2 mmol/L after adequate fluids",
    criteria_text: "Route suspected infection to septic shock/monitored-care escalation when vasopressors are needed to maintain MAP >=65 mm Hg and lactate remains >2 mmol/L after adequate fluid resuscitation.",
    cutoffs: ["MAP >=65 mm Hg", "lactate >2 mmol/L"],
    data_needed: ["MAP", "vasopressor requirement", "lactate", "fluid resuscitation status", "infection suspicion"],
    source_ids: ["SSC_SEPSIS_2026"],
    source_section: "Adult sepsis and septic shock hemodynamic targets"
  },
  {
    id: "adult_sepsis_resuscitation_and_lactate_cutoffs",
    label: "Adult sepsis resuscitation: lactate >=4 mmol/L or sepsis-induced hypoperfusion supports immediate resuscitation; initial crystalloid often 30 mL/kg",
    criteria_text: "For suspected sepsis with hypoperfusion or markedly elevated lactate, use immediate resuscitation and reassessment; SSC materials retain 30 mL/kg crystalloid as an initial reference volume for sepsis-induced hypoperfusion/septic shock.",
    cutoffs: ["lactate >=4 mmol/L", "30 mL/kg"],
    data_needed: ["lactate", "blood pressure/perfusion", "weight", "heart failure/renal contraindications", "fluid response"],
    source_ids: ["SSC_SEPSIS_2026"],
    source_section: "Initial resuscitation and lactate-guided reassessment"
  }
];

const thyroidHyperCutoffCriteria = [
  {
    id: "thyrotoxicosis_overt_biochemistry",
    label: "Overt thyrotoxicosis biochemistry: TSH below LLN with free T4 and/or T3 above assay ULN",
    criteria_text: "Classify overt thyrotoxicosis when TSH is below the assay lower limit and free T4 and/or T3 are above the assay upper limit; then determine cause with TRAb, uptake/scan, ultrasound, medication, or thyroiditis context.",
    cutoffs: ["TSH below LLN", "free T4 above ULN", "T3 above ULN"],
    data_needed: ["TSH", "free T4", "total/free T3", "assay reference intervals", "TRAb/TSI or uptake pattern when needed"],
    source_ids: ["ATA_HYPERTHYROIDISM_2016"],
    source_section: "Diagnosis and management of thyrotoxicosis"
  },
  {
    id: "subclinical_hyperthyroid_tsh_suppressed",
    label: "Subclinical hyperthyroidism high-risk stratum: persistent TSH <0.1 mU/L over 3 to 6 months; treat age >65 or cardiac/osteoporosis/symptomatic risk",
    criteria_text: "ATA considers TSH <0.1 mU/L on repeated measurement over 3 to 6 months persistent; treatment is recommended/considered based on age >65 years, cardiac disease, osteoporosis, menopausal status, symptoms, and risk.",
    cutoffs: ["TSH <0.1 mU/L", "3 to 6 months", "age >65 years"],
    data_needed: ["repeat TSH dates", "age", "cardiac disease", "osteoporosis/fracture risk", "symptoms", "thyroiditis/drug exclusion"],
    source_ids: ["ATA_HYPERTHYROIDISM_2016"],
    source_section: "Subclinical hyperthyroidism recommendations 73-76"
  },
  {
    id: "subclinical_hyperthyroid_tsh_low_detectable",
    label: "Subclinical hyperthyroidism low-detectable stratum: persistent TSH 0.1-0.4 mU/L; consider treatment age >=65 or cardiac/osteoporosis/symptoms, otherwise monitor 6-12 months",
    criteria_text: "ATA describes low but detectable TSH 0.1-0.4 mU/L; treatment is considered for age >=65 years or risk factors, while asymptomatic age <65 without cardiac disease/osteoporosis can be observed with 6-12 month monitoring.",
    cutoffs: ["TSH 0.1-0.4 mU/L", "age >=65 years", "age <65 years", "6-12 months"],
    data_needed: ["repeat TSH", "age", "cardiac disease", "osteoporosis", "hyperthyroid symptoms", "follow-up access"],
    source_ids: ["ATA_HYPERTHYROIDISM_2016"],
    source_section: "Subclinical hyperthyroidism recommendations 75-76 and Table 10"
  }
];

const thyroidHypoCutoffCriteria = [
  {
    id: "hypothyroid_replacement_tsh_target",
    label: "Hypothyroid LT4 titration: target TSH typically 0.5 to 3.5 or 4 mIU/L; recheck 4-6 weeks after dose changes",
    criteria_text: "ATA hypothyroidism guideline uses serum TSH to titrate levothyroxine in primary hypothyroidism, with a typical target TSH 0.5 to 3.5 or 4 mIU/L and reassessment 4-6 weeks after dose initiation or change.",
    cutoffs: ["0.5 to 3.5 mIU/L", "4 mIU/L", "4-6 weeks"],
    data_needed: ["TSH", "LT4 dose", "dose-change date", "adherence/absorption interactions", "pregnancy/age/comorbidity context"],
    source_ids: ["ATA_HYPOTHYROIDISM_2014"],
    source_section: "Levothyroxine dosage and TSH target"
  },
  {
    id: "hypothyroid_lt4_adjustment_increment",
    label: "Hypothyroid LT4 adjustment: change by 12.5-25 mcg/day increments and repeat TSH 4-6 weeks; once stable check 4-6 months then yearly",
    criteria_text: "ATA describes dose adjustments of 12.5-25 mcg/day up or down based on TSH, repeat testing in 4-6 weeks until target, then TSH in 4-6 months and yearly once stable.",
    cutoffs: ["12.5-25 mcg/day", "4-6 weeks", "4-6 months"],
    data_needed: ["current LT4 dose", "TSH trend", "weight/age/pregnancy changes", "drug interactions", "last stable TSH date"],
    source_ids: ["ATA_HYPOTHYROIDISM_2014"],
    source_section: "Levothyroxine dosage adjustment"
  },
  {
    id: "hypothyroid_overtreatment_elderly_targets",
    label: "Hypothyroid overtreatment safety: avoid TSH <0.1 mIU/L; consider higher TSH target 4-6 mIU/L in age >70-80 years",
    criteria_text: "ATA recommends avoiding thyroid hormone excess, particularly TSH <0.1 mIU/L in older/postmenopausal patients; in persons >70-80 years, a TSH target of 4-6 mIU/L may be reasonable.",
    cutoffs: ["TSH <0.1 mIU/L", "4-6 mIU/L", "age >70-80 years"],
    data_needed: ["TSH", "age", "postmenopausal status", "atrial fibrillation/osteoporosis risk", "LT4 dose"],
    source_ids: ["ATA_HYPOTHYROIDISM_2014"],
    source_section: "Avoiding iatrogenic thyrotoxicosis and elderly targets"
  }
];

const thyroidNoduleCutoffCriteria = [
  {
    id: "thyroid_nodule_ata_fna_high_intermediate",
    label: "ATA thyroid nodule FNA: high-suspicion or intermediate-suspicion ultrasound pattern meets FNA threshold at >=1 cm",
    criteria_text: "ATA 2015 recommends diagnostic FNA for thyroid nodules >=1 cm with high-suspicion sonographic pattern and >=1 cm with intermediate-suspicion pattern.",
    cutoffs: [">=1 cm"],
    data_needed: ["thyroid ultrasound pattern", "largest nodule dimension", "extrathyroidal extension features", "microcalcifications/margins/shape", "lymph node findings"],
    source_ids: ["ATA_THYROID_NODULE_DTC_2015"],
    source_section: "Recommendation 8 and Table 6"
  },
  {
    id: "thyroid_nodule_ata_fna_low_very_low",
    label: "ATA thyroid nodule FNA: low-suspicion pattern >=1.5 cm; very-low-suspicion/spongiform pattern consider FNA >=2 cm or observe",
    criteria_text: "ATA 2015 recommends FNA at >=1.5 cm for low-suspicion nodules and considers FNA at >=2 cm for very-low-suspicion or spongiform nodules, with observation also reasonable.",
    cutoffs: [">=1.5 cm", ">=2 cm"],
    data_needed: ["thyroid ultrasound pattern", "largest nodule dimension", "spongiform/partially cystic status", "patient preference/follow-up access"],
    source_ids: ["ATA_THYROID_NODULE_DTC_2015"],
    source_section: "Recommendation 8 and Table 6"
  },
  {
    id: "thyroid_nodule_ata_no_fna_cystic",
    label: "ATA thyroid nodule no-biopsy branch: pure cystic nodules have <1% malignancy risk and no FNA unless symptomatic/cosmetic drainage is needed",
    criteria_text: "ATA 2015 Table 6 lists purely cystic nodules as benign pattern with estimated malignancy risk <1% and states no biopsy is required; aspiration may be considered for symptoms or cosmetic drainage.",
    cutoffs: ["<1%"],
    data_needed: ["pure cystic status", "solid component absent", "compressive/cosmetic symptoms", "ultrasound confirmation"],
    source_ids: ["ATA_THYROID_NODULE_DTC_2015"],
    source_section: "Recommendation 8 and Table 6"
  }
];

const testosteroneCutoffCriteria = [
  {
    id: "male_hypogonadism_total_testosterone_cutoffs",
    label: "Male hypogonadism confirmation: symptoms plus repeat fasting morning total testosterone below harmonized 264 ng/dL lower limit; free T if TT 200-400 ng/dL or SHBG altered",
    criteria_text: "Endocrine Society recommends diagnosing hypogonadism only with symptoms/signs and consistently low morning testosterone; CDC-harmonized lower limit is 264 ng/dL, and free testosterone is recommended when TT is near the lower limit such as 200-400 ng/dL or SHBG is altered.",
    cutoffs: ["264 ng/dL", "200-400 ng/dL"],
    data_needed: ["symptoms/signs", "two fasting morning total testosterone values", "SHBG/albumin when indicated", "assay certification/reference range"],
    source_ids: ["ES_TESTOSTERONE_2018"],
    source_section: "Diagnosis of hypogonadism and Figure 1"
  },
  {
    id: "male_hypogonadism_pituitary_imaging_cutoff",
    label: "Male hypogonadism pituitary imaging trigger: severe secondary hypogonadism with serum testosterone <150 ng/dL, persistent hyperprolactinemia, panhypopituitarism, or mass effect",
    criteria_text: "Endocrine Society suggests pituitary imaging when severe secondary hypogonadism is present, for example serum testosterone <150 ng/dL, or with panhypopituitarism, persistent hyperprolactinemia, or headache/visual field mass effect.",
    cutoffs: ["<150 ng/dL"],
    data_needed: ["testosterone", "LH/FSH", "prolactin", "other pituitary hormones", "headache/visual symptoms"],
    source_ids: ["ES_TESTOSTERONE_2018"],
    source_section: "Figure 1 diagnostic evaluation"
  },
  {
    id: "testosterone_therapy_safety_cutoffs",
    label: "Testosterone therapy safety stop/review: PSA >4 ng/mL, PSA >3 ng/mL in high-risk men without urology review, hematocrit >54%, or MI/stroke within last 6 months",
    criteria_text: "Endocrine Society recommends against starting testosterone therapy with prostate cancer risk findings including PSA >4 ng/mL or >3 ng/mL in high-risk men without urologic evaluation, elevated hematocrit; trials defined erythrocytosis as hematocrit >54%, and MI/stroke within 6 months is a contraindication.",
    cutoffs: [">4 ng/mL", ">3 ng/mL", ">54%", "6 months"],
    data_needed: ["PSA", "prostate exam/risk", "hematocrit", "recent MI/stroke history", "fertility plans"],
    source_ids: ["ES_TESTOSTERONE_2018"],
    source_section: "Treatment contraindications and systematic review harms"
  }
];

const hirsutismCutoffCriteria = [
  {
    id: "hirsutism_abnormal_score_androgen_testing",
    label: "Hirsutism workup trigger: abnormal hirsutism score warrants androgen testing; eumenorrheic local hair growth without abnormal score should not trigger broad testing",
    criteria_text: "Endocrine Society suggests androgen testing in all women with an abnormal hirsutism score and suggests against androgen testing for eumenorrheic unwanted local hair growth in the absence of an abnormal hirsutism score.",
    cutoffs: ["above reference range"],
    data_needed: ["modified Ferriman-Gallwey or local hirsutism score", "ethnicity-specific scoring threshold", "menstrual pattern", "androgen assay"],
    source_ids: ["ES_HIRSUTISM_2018"],
    source_section: "Diagnosis recommendations 1.1 and 1.3"
  },
  {
    id: "hirsutism_vte_risk_ocp_cutoff",
    label: "Hirsutism OCP choice modifier: age >39 years or obesity/VTE risk favors lowest effective ethinyl estradiol dose, usually 20 mcg, with low-risk progestin",
    criteria_text: "For hirsute women at higher VTE risk, such as obesity or age over 39 years, Endocrine Society suggests an oral contraceptive with the lowest effective ethinyl estradiol dose, usually 20 mcg, and a low-risk progestin.",
    cutoffs: ["age >39 years", "20 mcg"],
    data_needed: ["age", "BMI/VTE risk factors", "contraception need", "OCP contraindications", "pregnancy status"],
    source_ids: ["ES_HIRSUTISM_2018"],
    source_section: "Pharmacological treatment recommendation 3.4"
  },
  {
    id: "hirsutism_response_interval",
    label: "Hirsutism treatment response: trial pharmacologic therapy for at least 6 months before changing dose, switching, or adding antiandrogen",
    criteria_text: "Endocrine Society suggests a trial of at least 6 months for pharmacologic hirsutism therapy before dose change, switching medication, or adding medication; antiandrogen addition is suggested if patient-important hirsutism remains after 6 months of OCP monotherapy.",
    cutoffs: ["at least 6 months", "6 months"],
    data_needed: ["therapy start date", "OCP/antiandrogen use", "contraception status", "patient-important symptom response", "adverse effects"],
    source_ids: ["ES_HIRSUTISM_2018"],
    source_section: "Pharmacological treatment recommendations 3.5 and 3.7"
  }
];

const prolactinomaCutoffCriteria = [
  {
    id: "hyperprolactinemia_assay_uln_and_normal_anchor",
    label: "Hyperprolactinemia diagnosis: single prolactin above assay ULN confirms when drawn without excessive venipuncture stress; normal values are generally <25 ug/L",
    criteria_text: "Endocrine Society recommends a single prolactin measurement above the assay upper limit to diagnose hyperprolactinemia if venipuncture stress is avoided; normal values are generally lower than 25 ug/L.",
    cutoffs: [">ULN", "<25 ug/L"],
    data_needed: ["serum prolactin", "assay ULN", "venipuncture stress", "pregnancy/lactation status", "medication list"],
    source_ids: ["ES_HYPERPROLACTINEMIA_2011"],
    source_section: "Recommendation 1.1"
  },
  {
    id: "prolactinoma_level_size_cutoffs",
    label: "Prolactinoma probability by prolactin level: >250 ug/L usually indicates prolactinoma; >500 ug/L is diagnostic of macroprolactinoma; macroadenoma >10 mm",
    criteria_text: "Endocrine Society notes prolactin >250 ug/L usually indicates prolactinoma and >500 ug/L is diagnostic of macroprolactinoma; macroprolactinomas are >10 mm and usually have prolactin >250 ug/L.",
    cutoffs: [">250 ug/L", ">500 ug/L", ">10 mm"],
    data_needed: ["prolactin", "pituitary MRI size", "drug causes such as risperidone/metoclopramide", "renal/thyroid status"],
    source_ids: ["ES_HYPERPROLACTINEMIA_2011", "PITUITARY_PROLACTINOMA_2023"],
    source_section: "Diagnosis recommendation 1.1 evidence and Pituitary Society diagnostic algorithm"
  },
  {
    id: "prolactinoma_hook_effect_dilution",
    label: "Hook-effect exclusion: large pituitary tumor with unexpectedly mild prolactin elevation needs repeat assay after 1:100 dilution",
    criteria_text: "When a large macroadenoma has normal or only mildly elevated prolactin, Endocrine Society recommends serial dilution; a 1:100 serum dilution can overcome the hook effect.",
    cutoffs: ["100-fold dilution"],
    data_needed: ["pituitary tumor size", "prolactin level", "assay dilution performed", "visual symptoms/mass effect"],
    source_ids: ["ES_HYPERPROLACTINEMIA_2011"],
    source_section: "Recommendation 1.3"
  }
];

const pheochromocytomaCutoffCriteria = [
  {
    id: "pheo_biochemical_metanephrine_cutoff",
    label: "PPGL biochemical confirmation: plasma free or urinary fractionated metanephrines above assay ULN need follow-up; values about 3-fold ULN are high probability",
    criteria_text: "Endocrine Society recommends plasma free or urinary fractionated metanephrines for initial PPGL testing, with follow-up based on extent of increase and clinical presentation; large elevations such as 3-fold ULN are high probability while borderline results require preanalytical review.",
    cutoffs: [">ULN", "3-fold ULN"],
    data_needed: ["plasma free or urinary fractionated metanephrines", "assay ULN", "supine sampling status", "interfering medications", "clinical presentation"],
    source_ids: ["ES_PHEO_PPGL_2014"],
    source_section: "Biochemical testing recommendations 1.1-1.4"
  },
  {
    id: "pheo_preop_blockade_timing",
    label: "PPGL pre-op preparation: functional tumor needs alpha blockade and high-sodium/fluid preparation for 7 to 14 days before surgery",
    criteria_text: "Endocrine Society recommends preoperative blockade for hormonally functional PPGL and medical treatment for 7 to 14 days to normalize blood pressure/heart rate, with high-sodium diet and fluid intake to prevent postoperative hypotension.",
    cutoffs: ["7 to 14 days"],
    data_needed: ["functional PPGL status", "blood pressure", "heart rate", "alpha blockade start date", "volume/sodium plan"],
    source_ids: ["ES_PHEO_PPGL_2014"],
    source_section: "Perioperative medical management recommendations 4.1-4.2"
  },
  {
    id: "pheo_open_surgery_size_cutoff",
    label: "PPGL surgery approach: open resection for large pheochromocytoma >6 cm or invasive disease; minimally invasive adrenalectomy for most smaller adrenal tumors",
    criteria_text: "Endocrine Society recommends minimally invasive adrenalectomy for most adrenal pheochromocytomas and open resection for large, for example >6 cm, or invasive pheochromocytomas.",
    cutoffs: [">6 cm"],
    data_needed: ["tumor size", "invasion features", "adrenal vs paraganglioma site", "multifocal/metastatic risk", "surgical expertise"],
    source_ids: ["ES_PHEO_PPGL_2014"],
    source_section: "Surgery recommendation 5.1"
  },
  {
    id: "pheo_postop_followup_cutoff",
    label: "PPGL follow-up: biochemical testing 2-4 weeks after surgery and lifelong annual metanephrine testing for recurrence/metastatic disease",
    criteria_text: "Endocrine Society remarks that biochemical testing to document successful removal should occur after recovery, for example 2-4 weeks after surgery, and recommends lifelong annual biochemical testing for recurrent or metastatic PPGL.",
    cutoffs: ["2-4 weeks", "annual"],
    data_needed: ["surgery date", "postoperative recovery status", "metanephrine level", "genetic/metastatic risk", "follow-up owner"],
    source_ids: ["ES_PHEO_PPGL_2014"],
    source_section: "Follow-up recommendation 4.4 remarks"
  }
];

const curatedCutoffCriteria = {
  congenital_adrenal_hyperplasia_v1: cahCutoffCriteria,
  gigantism_v1: acromegalyGigantismCutoffCriteria,
  cushings_disease_v1: cushingDiagnosisCutoffCriteria,
  cushings_syndrome_v1: cushingDiagnosisCutoffCriteria,
  fever_infection_sepsis_v1: adultSepsisCutoffCriteria,
  graves_disease_v1: thyroidHyperCutoffCriteria,
  hyperthyroidism_v1: thyroidHyperCutoffCriteria,
  thyrotoxicosis_v1: thyroidHyperCutoffCriteria,
  hashimotos_thyroiditis_v1: thyroidHypoCutoffCriteria,
  hypothyroidism_v1: thyroidHypoCutoffCriteria,
  thyroid_cancer_v1: [...thyroidNoduleCutoffCriteria, ...thyroidHypoCutoffCriteria.slice(0, 1)],
  thyroid_nodules_v1: thyroidNoduleCutoffCriteria,
  gynecomastia_v1: testosteroneCutoffCriteria,
  hypogonadism_v1: testosteroneCutoffCriteria,
  hirsutism_v1: hirsutismCutoffCriteria,
  prolactinoma_v1: prolactinomaCutoffCriteria,
  pheochromocytoma_v1: pheochromocytomaCutoffCriteria,
  chest_pain_v1: [
    {
      id: "adult_chest_pain_ecg_troponin_timing",
      label: "Acute chest pain ACS screen: 12-lead ECG reviewed within 10 minutes; cardiac troponin measured as soon as possible",
      criteria_text: "For acute chest pain, obtain and interpret an ECG for STEMI within 10 minutes of arrival and measure cardiac troponin as soon as possible when ACS is suspected.",
      cutoffs: ["10 minutes"],
      data_needed: ["arrival time", "12-lead ECG", "cardiac troponin assay and collection time"],
      source_ids: ["AHA_ACC_CHEST_PAIN_2021"],
      source_section: "Setting considerations and ECG recommendations"
    },
    {
      id: "adult_chest_pain_serial_troponin_intervals",
      label: "Serial troponin rule-out/rule-in timing: hs-cTn repeat at 1-3 hours; conventional cTn repeat at 3-6 hours",
      criteria_text: "When serial troponins are needed to exclude myocardial injury, repeat high-sensitivity troponin at 1 to 3 hours after time zero or conventional troponin at 3 to 6 hours.",
      cutoffs: ["1 to 3 hours", "3 to 6 hours"],
      data_needed: ["troponin assay type", "time-zero troponin", "repeat troponin time", "delta troponin"],
      source_ids: ["AHA_ACC_CHEST_PAIN_2021"],
      source_section: "Suspected ACS not including STEMI"
    },
    {
      id: "adult_chest_pain_low_risk_discharge",
      label: "Low-risk chest pain: 30-day death/MACE risk <1%, HEART <3 or EDACS <16 with serial troponins below 99th percentile",
      criteria_text: "Low-risk acute chest pain requires estimated 30-day death or MACE risk <1%; examples include HEART score <3 or EDACS <16 with initial and serial cTn/hs-cTn below the assay 99th percentile and no ischemic ECG change.",
      cutoffs: ["<1%", "HEART <3", "EDACS <16", "99th percentile"],
      data_needed: ["structured chest pain risk score", "ECG ischemia assessment", "initial and serial troponins", "assay 99th percentile"],
      source_ids: ["AHA_ACC_CHEST_PAIN_2021"],
      source_section: "Low-risk acute chest pain"
    },
    {
      id: "adult_chest_pain_aortic_dissection_probability",
      label: "Aortic dissection concern: abrupt severe/ripping pain plus pulse differential plus widened mediastinum gives >80% probability",
      criteria_text: "Abrupt severe ripping chest/back pain, pulse differential, and widened mediastinum on chest radiograph should route to acute aortic syndrome imaging; the guideline slide set reports >80% probability when severe abrupt pain, pulse differential, and widened mediastinum coexist.",
      cutoffs: [">80% probability"],
      data_needed: ["pain onset/quality/radiation", "bilateral pulse/BP exam", "chest radiograph mediastinum assessment", "CTA availability/contraindication"],
      source_ids: ["AHA_ACC_CHEST_PAIN_2021"],
      source_section: "Physical examination and acute aortic syndrome"
    }
  ],
  pediatric_abdominal_pain_vomiting_v1: [
    {
      id: "peds_vomiting_glucose_ketone_thresholds",
      label: "Vomiting metabolic screen: check glucose/ketones when BGL <3 mmol/L or >11 mmol/L; treat hypoglycemia when BGL <2.6 mmol/L",
      criteria_text: "In a vomiting child, consider blood glucose and ketones if BGL is <3 mmol/L or >11 mmol/L; treat as hypoglycemia if BGL is <2.6 mmol/L.",
      cutoffs: ["<3 mmol/L", ">11 mmol/L", "<2.6 mmol/L"],
      data_needed: ["point-of-care glucose", "blood or urine ketones", "hydration/perfusion status"],
      source_ids: ["RCH_VOMITING_CHILD"],
      source_section: "Investigations and treatment"
    },
    {
      id: "peds_vomiting_fluid_resuscitation",
      label: "Vomiting shock resuscitation: sodium chloride 0.9% bolus 10-20 mL/kg",
      criteria_text: "If shock is present in a vomiting child, treat with a 10-20 mL/kg bolus of sodium chloride 0.9% while evaluating the cause.",
      cutoffs: ["10-20 mL/kg"],
      data_needed: ["weight", "perfusion signs", "blood pressure", "heart rate", "fluid contraindications"],
      source_ids: ["RCH_VOMITING_CHILD"],
      source_section: "Treatment"
    },
    {
      id: "peds_vomiting_ondansetron_weight_doses",
      label: "Ondansetron support if age >6 months: 8-15 kg 2 mg, 15-30 kg 4 mg, >30 kg 8 mg",
      criteria_text: "Ondansetron may support oral hydration in children >6 months; suggested initial dose is 2 mg for 8-15 kg, 4 mg for 15-30 kg, and 8 mg for >30 kg.",
      cutoffs: [">6 months", "8-15 kg", "2 mg", "15-30 kg", "4 mg", ">30 kg", "8 mg"],
      data_needed: ["age", "weight", "mental status", "surgical red flags", "QT-prolonging medication context"],
      source_ids: ["RCH_VOMITING_CHILD"],
      source_section: "Antiemetics"
    }
  ],
  pediatric_chest_pain_syncope_v1: [
    {
      id: "peds_chest_pain_low_base_rate_and_targeted_testing",
      label: "Pediatric chest pain testing is targeted: cardiac causes are about 1%; ECG/CXR/troponin only when risk factors or exam findings are present",
      criteria_text: "Most pediatric chest pain is benign; RCH notes cardiac-related causes account for as few as 1% of children with chest pain, so ECG, CXR, and blood tests should be reserved for risk factors on history/exam.",
      cutoffs: ["1%"],
      data_needed: ["risk factor history", "cardiorespiratory exam", "vital signs", "ECG if risk factor present"],
      source_ids: ["RCH_CHEST_PAIN_CHILD"],
      source_section: "Background and assessment"
    },
    {
      id: "peds_chest_syncope_ecg_required_once",
      label: "Pediatric syncope: obtain an ECG at least once; urgent referral for exertional syncope, chest pain/palpitations, abnormal ECG, or family history",
      criteria_text: "An ECG should be obtained in all children with syncope at least once; cardiac syncope concern includes exercise association, no prodrome, chest pain/palpitations, past cardiac disease, or family history of early cardiac death/arrhythmia/sudden death.",
      cutoffs: [],
      data_needed: ["syncope timing/activity", "prodrome", "palpitations/chest pain", "family history", "ECG"],
      source_ids: ["RCH_SYNCOPE_CHILD"],
      source_section: "Investigations and consultation"
    },
    {
      id: "peds_ecg_high_risk_intervals",
      label: "Pediatric ECG high-risk cutoffs: QRS >0.12 sec, QTc >450 ms or <=340 ms, ST shift >2 mm in precordial leads",
      criteria_text: "Pediatric ECG review should flag QRS duration >0.12 seconds, manual QTc outside >340 ms and <=450 ms, or ST elevation/depression above 2 mm in precordial leads as abnormal/high-risk in context.",
      cutoffs: [">0.12 seconds", ">340 ms", "<=450 ms", ">2 mm"],
      data_needed: ["manual ECG intervals", "age", "lead placement/scale", "symptoms and cardiac red flags"],
      source_ids: ["RCH_PEDIATRIC_ECG"],
      source_section: "Basic pediatric ECG interpretation"
    }
  ],
  pediatric_hematology_anemia_bleeding_v1: [
    {
      id: "peds_anemia_age_hb_cutoffs",
      label: "Pediatric anemia is Hb below age cutoff: 2 mo <90 g/L; 2-6 mo <95; 6-24 mo <105; 2-11 y <115; >12 y female <120, male <130",
      criteria_text: "Define anemia by hemoglobin below the lower limit for age: 2 months 90 g/L, 2-6 months 95 g/L, 6-24 months 105 g/L, 2-11 years 115 g/L, and >12 years female 120 g/L or male 130 g/L.",
      cutoffs: ["90 g/L", "95 g/L", "105 g/L", "115 g/L", "120 g/L", "130 g/L"],
      data_needed: ["age", "sex for >12 years", "hemoglobin", "MCV", "reticulocyte count", "blood film"],
      source_ids: ["RCH_ANAEMIA_CHILD"],
      source_section: "Background"
    },
    {
      id: "peds_anemia_admission_cutoff",
      label: "Pediatric anemia red-flag admission: Hb <60 g/L or tachycardia/murmur/heart failure, hemolysis, reticulocytopenia, nucleated RBCs, thrombocytopenia/neutropenia",
      criteria_text: "Consider admission and hematology/paediatric consultation when Hb is <60 g/L or red flags are present, including heart failure signs, hemolysis, reticulocytopenia, nucleated red cells, thrombocytopenia, or neutropenia.",
      cutoffs: ["<60 g/L"],
      data_needed: ["hemoglobin", "heart rate", "cardiac exam", "reticulocyte count", "blood film", "platelets", "neutrophils"],
      source_ids: ["RCH_ANAEMIA_CHILD"],
      source_section: "Management red flags"
    },
    {
      id: "peds_thalassemia_hba2_cutoff",
      label: "Microcytosis mimic: beta-thalassemia trait supported by HbA2 >3.5% on electrophoresis/HPLC after iron deficiency addressed",
      criteria_text: "In microcytic anemia, beta-thalassemia trait is diagnosed on HPLC or hemoglobin electrophoresis with HbA2 >3.5%, noting HbA2 may be masked by iron deficiency.",
      cutoffs: [">3.5%"],
      data_needed: ["MCV", "ferritin", "HPLC or hemoglobin electrophoresis", "family/ethnicity context"],
      source_ids: ["RCH_ANAEMIA_CHILD"],
      source_section: "Microcytic hypochromic anemia"
    }
  ],
  pediatric_msk_limp_hot_joint_v1: [
    {
      id: "peds_limp_no_test_low_risk_review",
      label: "Low-risk limp: no investigations only if no red flags, mild/no discomfort with analgesia, and review plan within 7 days of onset",
      criteria_text: "No investigations are indicated only when history/exam red flags are absent, the child ambulates with mild or no discomfort after simple analgesia, and a review plan exists within 7 days of limp onset if symptoms persist.",
      cutoffs: ["7 days"],
      data_needed: ["duration of limp", "red-flag screen", "ability to weight bear after analgesia", "review access"],
      source_ids: ["RCH_LIMPING_CHILD"],
      source_section: "Investigations"
    },
    {
      id: "peds_limp_escalation_duration_weight_bearing",
      label: "Consult for limp lasting >7 days, inability to weight bear or permit movement after analgesia, systemic illness, malignancy features, or septic arthritis concern",
      criteria_text: "Consult paediatrics/orthopaedics when symptoms last more than 7 days, the child cannot weight bear or permit movement after analgesia, is systemically unwell, has malignancy features, or septic arthritis is suspected.",
      cutoffs: [">7 days"],
      data_needed: ["symptom duration", "weight-bearing status", "range of motion after analgesia", "temperature/systemic features", "CRP/ESR/WCC if obtained"],
      source_ids: ["RCH_LIMPING_CHILD"],
      source_section: "Consultation"
    },
    {
      id: "peds_hip_septic_arthritis_cutoffs",
      label: "Hip septic arthritis support: CRP >=20 mg/L and ultrasound effusion >=7 mm increase specificity/sensitivity for pediatric hip septic arthritis",
      criteria_text: "RCH cites evidence that CRP >=20 mg/L and hip ultrasound effusion >=7 mm has high specificity and sensitivity for pediatric hip septic arthritis; use with clinical suspicion and orthopaedic consultation.",
      cutoffs: [">=20 mg/L", ">=7 mm"],
      data_needed: ["CRP", "hip ultrasound effusion measurement", "fever/systemic illness", "weight-bearing status", "joint range of motion"],
      source_ids: ["RCH_LIMPING_CHILD"],
      source_section: "Reference list and investigations"
    }
  ],
  pediatric_neuro_headache_seizure_ams_v1: [
    {
      id: "peds_headache_red_flag_age",
      label: "Headache imaging/escalation triggers include age <4 years, early-morning/sleep-waking/positional/sudden severe/occipital headache, vomiting, seizure, focal neurologic signs, or progressive pattern",
      criteria_text: "Headache red flags include age <4 years; early morning, waking from sleep, coughing/sneezing/positional trigger, sudden severe, or occipital headache; unexplained vomiting; focal neurologic symptoms; new seizure; developmental regression; meningitis/encephalitis features; significant head injury; or systemic high-risk disorder.",
      cutoffs: ["<4 years"],
      data_needed: ["age", "headache pattern", "vomiting", "neurologic exam", "seizure history", "BP/conscious state"],
      source_ids: ["RCH_HEADACHE_CHILD"],
      source_section: "Assessment red flags"
    },
    {
      id: "peds_seizure_status_timing",
      label: "Active seizure treatment starts when total seizure duration is >=5 minutes or unknown; include prehospital benzodiazepines",
      criteria_text: "Most pediatric seizures resolve within 5 minutes; pharmacologic management should begin when total seizure duration is >=5 minutes or unknown, and prehospital benzodiazepine doses count toward the maximum of 2 benzodiazepine doses.",
      cutoffs: [">=5 minutes", "2 benzodiazepine doses"],
      data_needed: ["seizure start time", "prehospital medication doses", "airway/breathing/circulation status", "weight"],
      source_ids: ["RCH_SEIZURES_ACUTE_2025"],
      source_section: "Key points and active seizure management"
    },
    {
      id: "peds_seizure_medication_doses",
      label: "Seizure dosing: midazolam 0.15 mg/kg IV/IM/IO or 0.3 mg/kg buccal/IN max 10 mg; phenytoin 20 mg/kg max 2 g; levetiracetam 40-60 mg/kg max 4.5 g",
      criteria_text: "RCH acute seizure medication table lists midazolam 0.15 mg/kg IV/IM/IO or 0.3 mg/kg buccal/IN (max 10 mg); second-line phenytoin 20 mg/kg IV/IO (max 2 g) or levetiracetam 40-60 mg/kg IV/IO (max 4.5 g).",
      cutoffs: ["0.15 mg/kg", "0.3 mg/kg", "10 mg", "20 mg/kg", "2 g", "40-60 mg/kg", "4.5 g"],
      data_needed: ["weight", "route availability", "prior benzodiazepines", "phenytoin/Dravet contraindication", "cardiac monitoring"],
      source_ids: ["RCH_SEIZURES_ACUTE_2025"],
      source_section: "Medications used in acute seizures"
    }
  ],
  pediatric_rash_skin_v1: [
    {
      id: "peds_kawasaki_complete_criteria",
      label: "Kawasaki disease: fever >=4 days plus at least 4 principal clinical features; cervical node criterion >=1.5 cm",
      criteria_text: "Complete Kawasaki disease can be diagnosed with fever >=4 days plus at least 4 principal features at any point in illness and no better alternative cause; cervical adenopathy criterion is a cluster of anterior cervical nodes >=1.5 cm.",
      cutoffs: [">=4 days", "4 principal clinical features", ">=1.5 cm"],
      data_needed: ["fever day count", "conjunctivitis", "rash", "extremity changes", "cervical node size", "mucosal changes", "alternative diagnosis review"],
      source_ids: ["RCH_KAWASAKI_DISEASE"],
      source_section: "Clinical features of complete Kawasaki disease"
    },
    {
      id: "peds_kawasaki_echo_risk_cutoffs",
      label: "Kawasaki echo/high-risk cutoffs: coronary aneurysm Z-score >=2.5; EF <55%; fractional shortening <28%; coronary dilation Z-score 2 to 2.5",
      criteria_text: "Incomplete Kawasaki support includes coronary aneurysm Z-score >=2.5 or at least 3 echo features; high-risk includes age <=6 months, right CA/LAD Z-score >=2.5, coronary Z-score >=2, IVIG delay >=10 days, IVIG resistance fever >=38 C at >=36 hours, platelets >=450 x10^9/L, or CRP >=130 mg/L.",
      cutoffs: [">=2.5", "<55%", "<28%", "Z-score 2 to 2.5", "<=6 months", ">=2", ">=10 days", ">=38 C", ">=36 hours", ">=450 x10^9/L", ">=130 mg/L"],
      data_needed: ["echocardiogram Z-scores", "age", "fever onset date", "temperature after IVIG", "platelets", "CRP"],
      source_ids: ["RCH_KAWASAKI_DISEASE"],
      source_section: "Incomplete Kawasaki diagnosis and risk stratification"
    },
    {
      id: "peds_kawasaki_treatment_cutoffs",
      label: "Kawasaki treatment: IVIG 2 g/kg over 8-12 hours plus aspirin 5 mg/kg daily until cardiology review around 6 weeks",
      criteria_text: "Primary Kawasaki therapy is IVIG 2 g/kg as a single infusion over 8-12 hours and aspirin 5 mg/kg orally daily until follow-up cardiology review around 6 weeks post onset.",
      cutoffs: ["2 g/kg", "8-12 hours", "5 mg/kg", "6 weeks"],
      data_needed: ["weight", "diagnosis certainty", "cardiology plan", "aspirin contraindications", "follow-up echo schedule"],
      source_ids: ["RCH_KAWASAKI_DISEASE"],
      source_section: "Treatment"
    }
  ],
  pediatric_respiratory_wheeze_v1: [
    {
      id: "peds_bronchiolitis_diagnosis_age_course",
      label: "Bronchiolitis frame: child <2 years, common peak age 3-6 months, symptoms peak day 3-5, cough resolves in 90% by 3 weeks",
      criteria_text: "NICE frames bronchiolitis as occurring in babies/children <2 years, most commonly in the first year with peak age 3-6 months; symptoms usually peak between days 3 and 5 and cough resolves in 90% within 3 weeks.",
      cutoffs: ["<2 years", "3-6 months", "3-5 days", "90%", "3 weeks"],
      data_needed: ["age", "illness day", "coryzal prodrome", "cough", "wheeze/crackles", "work of breathing"],
      source_ids: ["NICE_BRONCHIOLITIS_NG9"],
      source_section: "Assessment and diagnosis"
    },
    {
      id: "peds_bronchiolitis_referral_admission_oxygen",
      label: "Bronchiolitis referral/admission: RR >60 refer, RR >70 emergency/admit, intake 50-75%, SpO2 <92% refer, SpO2 <90% admit/oxygen if >=6 weeks",
      criteria_text: "Consider referral for RR >60/min, oral intake 50-75% usual, dehydration, or persistent SpO2 <92% in air; immediately refer/admit severe distress such as RR >70/min. Admit/give oxygen for persistent SpO2 <90% if aged >=6 weeks, or <92% if under 6 weeks or underlying conditions.",
      cutoffs: [">60 breaths/minute", ">70 breaths/minute", "50% to 75%", "<92%", "<90%", ">=6 weeks", "<6 weeks"],
      data_needed: ["respiratory rate", "oxygen saturation in air", "age", "feeding percentage", "dehydration", "underlying health conditions"],
      source_ids: ["NICE_BRONCHIOLITIS_NG9"],
      source_section: "Referral, admission, and oxygen supplementation"
    },
    {
      id: "peds_bronchiolitis_discharge_cutoffs",
      label: "Bronchiolitis discharge oxygen: maintain >90% in air for 4 hours including sleep if >=6 weeks; >92% if <6 weeks or underlying condition",
      criteria_text: "Discharge requires clinical stability, adequate oral fluids, and oxygen saturation in air maintained for 4 hours including sleep: >90% for children aged >=6 weeks, or >92% for babies <6 weeks or underlying health conditions.",
      cutoffs: [">90%", "4 hours", ">=6 weeks", ">92%", "<6 weeks"],
      data_needed: ["clinical stability", "oral intake", "oxygen saturation trend in air", "sleep observation", "comorbidity/risk factors"],
      source_ids: ["NICE_BRONCHIOLITIS_NG9"],
      source_section: "When to discharge"
    }
  ],
  pediatric_urinary_uti_pyelonephritis_v1: [
    {
      id: "peds_uti_atypical_recurrent_definitions",
      label: "Atypical/recurrent UTI: failure to respond within 48 hours, non-E. coli, or recurrent pattern of 2 upper UTIs, 1 upper plus lower, or 3 lower UTIs",
      criteria_text: "Atypical UTI includes failure to respond to suitable antibiotics within 48 hours or infection with non-E. coli organisms; recurrent UTI is 2 or more upper UTIs, 1 upper UTI plus 1 or more lower UTIs, or 3 or more lower UTIs.",
      cutoffs: ["48 hours", "2 or more", "1 or more", "3 or more"],
      data_needed: ["organism", "time on antibiotic", "clinical response", "upper/lower UTI history count"],
      source_ids: ["NICE_UTI_UNDER16_NG224"],
      source_section: "Definitions of atypical and recurrent UTI"
    },
    {
      id: "peds_uti_imaging_age_schedule",
      label: "UTI imaging schedule: <6 months first UTI ultrasound within 6 weeks; atypical UTI ultrasound during acute infection; DMSA 4-6 months when indicated",
      criteria_text: "NICE recommends ultrasound within 6 weeks for babies <6 months with first-time UTI responding to treatment; ultrasound during acute infection for atypical UTI; and DMSA scan 4 to 6 months after acute infection when table criteria apply.",
      cutoffs: ["<6 months", "6 weeks", "4 to 6 months"],
      data_needed: ["age", "first/recurrent UTI status", "atypical features", "response within 48 hours", "imaging history"],
      source_ids: ["NICE_UTI_UNDER16_NG224"],
      source_section: "Imaging tests"
    },
    {
      id: "peds_uti_mcug_prophylaxis",
      label: "When MCUG is done, give oral prophylactic antibiotics for 3 days with MCUG on day 2",
      criteria_text: "When a micturating cystourethrogram is performed, NICE recommends oral prophylactic antibiotics for 3 days with the MCUG on the second day.",
      cutoffs: ["3 days", "day 2"],
      data_needed: ["MCUG indication", "antibiotic allergies", "local prophylaxis choice", "procedure date"],
      source_ids: ["NICE_UTI_UNDER16_NG224"],
      source_section: "Imaging tests"
    }
  ],
  polycystic_ovary_syndrome_v1: [
    {
      id: "pcos_irregular_cycle_cutoffs",
      label: "PCOS ovulatory dysfunction: 1 to <3 years post-menarche cycles <21 or >45 days; >=3 years post-menarche cycles <21 or >35 days or <8/year; any cycle >90 days after 1 year",
      criteria_text: "International PCOS guideline defines irregular cycles as normal in the first year post-menarche, <21 or >45 days at 1 to <3 years post-menarche, <21 or >35 days or <8 cycles/year from 3 years post-menarche to perimenopause, any cycle >90 days after 1 year post-menarche, or primary amenorrhea by age 15 or >3 years post-thelarche.",
      cutoffs: ["<21 days", ">45 days", ">35 days", "<8 cycles/year", ">90 days", "age 15", ">3 years post-thelarche"],
      data_needed: ["menarche date", "cycle length", "cycles per year", "thelarche timing", "pregnancy status"],
      source_ids: ["PCOS_GUIDELINE_2023"],
      source_section: "Irregular cycles and ovulatory dysfunction"
    },
    {
      id: "pcos_ultrasound_adult_cutoffs",
      label: "Adult PCOM ultrasound: ovarian volume >=10 mL or follicle number per section >=10 in at least one ovary when follicle count quality is insufficient",
      criteria_text: "For adult PCOM using older technology or insufficient image quality, ovarian volume >=10 mL or follicle number per section >=10 in at least one ovary is the threshold; ultrasound is not recommended for PCOM diagnosis in adolescents.",
      cutoffs: [">=10 mL", ">=10"],
      data_needed: ["age/adolescent status", "ultrasound route", "ovarian volume", "follicle number per section", "dominant follicle/cyst context"],
      source_ids: ["PCOS_GUIDELINE_2023"],
      source_section: "Ultrasound and polycystic ovarian morphology"
    },
    {
      id: "pcos_metformin_bmi_cutoff",
      label: "PCOS treatment modifier: COCP plus metformin offers little additional benefit when BMI <=30 kg/m2; metformin may be most useful in BMI >30 or metabolic risk",
      criteria_text: "The guideline notes COCP plus metformin may offer little additional benefit over COCP or metformin alone in adults with BMI <=30 kg/m2; metformin may be most beneficial with BMI >30 kg/m2, diabetes risk factors, impaired glucose tolerance, or high-risk ethnicity.",
      cutoffs: ["BMI <=30 kg/m2", "BMI >30 kg/m2"],
      data_needed: ["BMI", "diabetes risk factors", "glucose tolerance/A1c", "COCP contraindications", "pregnancy intent"],
      source_ids: ["PCOS_GUIDELINE_2023"],
      source_section: "Metformin and combined oral contraceptive pills"
    }
  ]
};

function complaintModuleFiles(dir = moduleRoot) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return complaintModuleFiles(fullPath);
    return entry.name.endsWith(".json") ? [fullPath] : [];
  });
}

function unique(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = String(item || "").replace(/\s+/g, " ").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

function hasRealCutoff(value = "") {
  const text = cleanText(value);
  if (/(?:(?:>=|<=|>|<|=)|(?:above|below|exceeds?))\s*(?:the\s+)?(?:assay\s+)?(?:ULN|LLN|upper limit of normal|lower limit of normal|reference range)/i.test(text)) return true;
  if (!/\d/.test(text)) return false;
  return new RegExp(cutoffPattern.source, "i").test(text);
}

function shortText(value = "", _max = 280) {
  return cleanText(value);
}

function slug(value = "") {
  return String(value || "node").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 44) || "node";
}

function itemLabel(item = {}) {
  return cleanText(item.label || item.text || item.action || item.management_change || item.diagnostic_target || item.id || "");
}

function itemAction(item = {}, fallback = "") {
  return cleanText(item.action || item.management_change || item.rationale || itemLabel(item) || fallback);
}

function itemSourceIds(item = {}) {
  return unique([
    item.source_id,
    item.source?.source_id,
    ...(Array.isArray(item.source_ids) ? item.source_ids : []),
    ...(Array.isArray(item.sourceIds) ? item.sourceIds : [])
  ]);
}

function sourceIdsForItems(items = [], fallback = []) {
  return unique([...items.flatMap((item) => itemSourceIds(item)), ...fallback, ...genericSourceIds]);
}

function firstItems(module, group, count, fallbackGroups = []) {
  const items = [
    ...(Array.isArray(module[group]) ? module[group] : []),
    ...fallbackGroups.flatMap((name) => Array.isArray(module[name]) ? module[name] : [])
  ];
  const seen = new Set();
  const uniqueItems = items.filter((item, index) => {
    const key = item?.id || `${itemLabel(item)}:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const clinicalItems = uniqueItems.filter((item) => !shallowGeneratedItemPattern.test(`${itemLabel(item)} ${itemAction(item)}`));
  return (clinicalItems.length ? clinicalItems : uniqueItems).slice(0, count);
}

function listLabels(items = [], maxItems = 5) {
  return items.slice(0, maxItems).map((item) => itemLabel(item)).filter(Boolean);
}

function listText(items = [], fallback = "", maxItems = 5) {
  return cleanText(listLabels(items, maxItems).join("; ") || fallback);
}

function arrayText(items = [], fallback = "", maxItems = 6) {
  return cleanText(unique(items).slice(0, maxItems).join("; ") || fallback);
}

function sourceRowsForTree(sourceIds = [], sourceById = new Map()) {
  return unique(sourceIds).map((sourceId) => {
    const source = sourceById.get(sourceId);
    if (!source) {
      return {
        source_id: sourceId,
        title: sourceId,
        url: "",
        url_or_doi: "",
        year: "",
        access_date: auditDate,
        date_accessed: auditDate,
        citation_text: sourceId,
        review_status: "needs_source_resolution"
      };
    }
    return {
      source_id: source.id,
      title: source.title || source.citation || source.id,
      url: source.url || source.url_or_doi || "",
      url_or_doi: source.url_or_doi || source.url || "",
      year: source.year || source.version || "",
      access_date: source.date_accessed || auditDate,
      date_accessed: source.date_accessed || auditDate,
      citation_text: source.citation_text || source.citation || source.title || source.id,
      review_status: source.review_status || source.currency_status || "reviewed_current_for_scope"
    };
  });
}

function criterion({ id, label, criteria_text, cutoffs = [], data_needed = [], source_ids = [], source_section = "", needs_clinical_review = false, reviewer_input_needed = "" }) {
  const realCutoffs = unique(cutoffs).filter(hasRealCutoff);
  return {
    id,
    label: cleanText(label),
    criteria_text: cleanText(criteria_text || label),
    cutoffs: realCutoffs,
    data_needed: unique(data_needed),
    source_ids: unique(source_ids),
    source_section: cleanText(source_section),
    review_status: needs_clinical_review ? "needs_clinical_review" : "source_backed",
    ...(needs_clinical_review ? { needs_clinical_review: true, reviewer_input_needed: cleanText(reviewer_input_needed) } : {})
  };
}

function criteria(ruleId, description, evaluableFrom, sourceIds, extra = {}) {
  return {
    rule_id: ruleId,
    source: "criteria",
    description: cleanText(description),
    evaluable_from: unique(evaluableFrom),
    source_ids: unique(sourceIds),
    ...extra
  };
}

function node({
  id,
  type = "action",
  label,
  edgeLabel = "",
  sourceIds = [],
  criteria: rule,
  action = "",
  endpointType = "",
  missingDataNeeded = [],
  reviewNeededReason = "",
  parallelActions = [],
  requiredData = [],
  guidelineCutoffs = [],
  clinicalCriteria = [],
  monitoringPlan = [],
  children = []
}) {
  const entry = {
    id,
    type,
    label: shortText(label || id, 260),
    edgeLabel: cleanText(edgeLabel),
    source_ids: unique(sourceIds),
    criteria: rule || criteria(`${id}_criteria`, `Apply ${label || id} when the cited condition-specific criteria match the patient context.`, contextDomains, sourceIds),
    action: cleanText(action || label || id),
    children
  };
  if (endpointType) entry.endpoint_type = endpointType;
  if (missingDataNeeded.length) entry.missing_data_needed = unique(missingDataNeeded);
  if (reviewNeededReason) entry.review_needed_reason = cleanText(reviewNeededReason);
  if (parallelActions.length) entry.parallel_actions = parallelActions;
  if (requiredData.length) entry.required_data = unique(requiredData);
  if (guidelineCutoffs.length) entry.guideline_cutoffs = guidelineCutoffs;
  if (clinicalCriteria.length) entry.clinical_criteria = clinicalCriteria;
  if (monitoringPlan.length) entry.monitoring_plan = unique(monitoringPlan);
  return entry;
}

function endpoint(args) {
  return node({ ...args, type: "endpoint", children: [] });
}

function decision(args) {
  return node({ ...args, type: "decision" });
}

function actionNode(args) {
  return node({ ...args, type: "action" });
}

function evidenceText(item = {}) {
  return cleanText([item.label, item.action, item.management_change, item.diagnostic_target, item.rationale].filter(Boolean).join(" "));
}

function extractedCutoffCriteria(module) {
  const rows = [];
  for (const group of evidenceGroups.filter((group) => group !== "clinical_cutoff_criteria")) {
    const items = Array.isArray(module[group]) ? module[group] : [];
    items.forEach((item) => {
      const text = evidenceText(item);
      const cutoffs = unique(text.match(new RegExp(cutoffPattern.source, "gi")) || []).filter(hasRealCutoff);
      if (!cutoffs.length) return;
      rows.push(criterion({
        id: `${group}_${item.id || slug(itemLabel(item))}`,
        label: itemLabel(item),
        criteria_text: text,
        cutoffs,
        data_needed: cutoffs,
        source_ids: itemSourceIds(item),
        source_section: item.source?.source_section || group
      }));
    });
  }
  return rows;
}

function cutoffCriteriaForModule(module) {
  return [
    ...(Array.isArray(module.clinical_cutoff_criteria) ? module.clinical_cutoff_criteria.map(criterion) : []),
    ...extractedCutoffCriteria(module)
  ].filter((row) => row.source_ids?.length && ((row.cutoffs || []).length || row.needs_clinical_review));
}

function sourceThresholdsFromCriteria(rows = []) {
  return rows.flatMap((row) => (row.cutoffs || []).map((cutoff) => ({
    threshold: cutoff,
    evidence_item_id: row.id,
    label: row.label,
    source_ids: row.source_ids,
    review_status: row.review_status || "source_backed"
  })));
}

function buildTraversableContext(module, sourceIds, tests, criteriaRows) {
  const questions = firstItems(module, "requiredQuestions", 5, ["conditionalQuestions"]);
  const exam = firstItems(module, "requiredExam", 5, ["conditionalExam", "safetyChecks"]);
  const redFlags = firstItems(module, "redFlags", 5, ["safetyChecks"]);
  const differential = firstItems(module, "differentialBuckets", 5);
  const treatments = firstItems(module, "dispositionRules", 4, ["treatmentOptions"]);
  return {
    input_modes: ["structured_patient_context", "extractable_note_context", "clinician_selected_workup"],
    active_branch_output: ["active_node_id", "active_branch_label", "missing_data_needed", "terminal_endpoint_id", "review_needed_reason"],
    required_domains: [
      { domain: "symptoms", exact_data_needed: unique(["presenting symptom/diagnosis trigger", "onset/duration/trajectory", ...listLabels(questions, 4)]), source_ids: sourceIdsForItems(questions, sourceIds) },
      { domain: "exam", exact_data_needed: unique(["condition-specific focused exam", ...listLabels(exam, 4)]), source_ids: sourceIdsForItems(exam, sourceIds) },
      { domain: "vitals", exact_data_needed: unique(["blood pressure", "heart rate", "respiratory rate", "oxygen saturation", "temperature", "mental status", "weight when dosing depends on it", ...listLabels(redFlags, 2)]), source_ids: sourceIdsForItems(redFlags, sourceIds) },
      { domain: "labs", exact_data_needed: unique([...listLabels(tests, 6), ...criteriaRows.flatMap((row) => row.data_needed || []).slice(0, 8)]), source_ids: sourceIdsForItems(tests, sourceIds) },
      { domain: "imaging_results", exact_data_needed: unique(["source-directed imaging/ECG/procedure results when indicated", ...listLabels(tests.filter((item) => /imaging|ultrasound|ct|mri|x-ray|ecg|echo|culture|pathology|scan/i.test(itemLabel(item))), 5)]), source_ids: sourceIdsForItems(tests, sourceIds) },
      { domain: "medications", exact_data_needed: ["current medication list", "recent changes/missed doses", "allergies", "contraindications", "drug interactions", "adherence/access barriers"], source_ids: sourceIds },
      { domain: "comorbidities", exact_data_needed: ["major comorbidities", "renal/hepatic/cardiac disease", "immunocompromise/high-risk host factors", "frailty/function", "prior relevant disease/procedure"], source_ids: sourceIds },
      { domain: "demographics", exact_data_needed: ["age band", "pediatric/adult pathway fit", "sex/reproductive context", "weight when dose-based", "pathway applicability"], source_ids: sourceIds },
      { domain: "pregnancy_status", exact_data_needed: ["pregnant/not pregnant/unknown when pregnancy potential exists", "postpartum/lactation status when relevant", "fertility intent when treatment depends on it"], source_ids: sourceIds },
      { domain: "workup_findings", exact_data_needed: unique(["diagnosis confirmation status", "mimics considered", "severity/risk category", "treatment response", "disposition constraints", ...listLabels(differential, 4), ...listLabels(treatments, 4)]), source_ids: sourceIds }
    ],
    missing_data_endpoint_id: "endpoint_missing_context"
  };
}

function buildSyntheticScenarios(prefix, edgeLabels = {}) {
  return [
    { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: "endpoint_missing_context", expected_active_branch: edgeLabels.missingContext },
    { scenario_id: "missing_cutoff_data", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: `${prefix}_missing_cutoff_data_endpoint`, expected_active_branch: edgeLabels.missingCutoff },
    { scenario_id: "urgent_or_high_risk", major_pathway: "escalation_emergency_actions", expected_endpoint_id: `${prefix}_urgent_endpoint`, expected_active_branch: edgeLabels.urgent },
    { scenario_id: "alternate_pathway", major_pathway: "mimics_exclusions", expected_endpoint_id: `${prefix}_alternate_endpoint`, expected_active_branch: edgeLabels.alternate },
    { scenario_id: "special_population_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: `${prefix}_review_endpoint`, expected_active_branch: edgeLabels.review },
    { scenario_id: "worsening_after_treatment", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: `${prefix}_worsening_endpoint`, expected_active_branch: edgeLabels.worsening },
    { scenario_id: "deescalation_ready", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: `${prefix}_deescalate_endpoint`, expected_active_branch: edgeLabels.deescalate },
    { scenario_id: "followup_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: `${prefix}_followup_endpoint`, expected_active_branch: edgeLabels.followup }
  ];
}

function buildCompactClinicalPathwayTree(module, sourceById) {
  const label = module.label || module.id;
  const prefix = slug(module.id || label).replace(/_v1$/g, "");
  const tests = firstItems(module, "initialTests", 8);
  const redFlags = firstItems(module, "redFlags", 6, ["safetyChecks"]);
  const safetyChecks = firstItems(module, "safetyChecks", 5);
  const differentials = firstItems(module, "differentialBuckets", 6);
  const dispositions = firstItems(module, "dispositionRules", 5, ["treatmentOptions"]);
  const treatments = firstItems(module, "treatmentOptions", 5, ["dispositionRules"]);
  const criteriaRows = cutoffCriteriaForModule(module).slice(0, 14);
  const testSources = sourceIdsForItems([...tests, ...safetyChecks], genericSourceIds);
  const redFlagSources = sourceIdsForItems(redFlags, testSources);
  const differentialSources = sourceIdsForItems(differentials, testSources);
  const managementSources = sourceIdsForItems([...dispositions, ...treatments], testSources);
  const cutoffSources = unique([...criteriaRows.flatMap((row) => row.source_ids || []), ...testSources, ...managementSources]);
  const exactDiagnosticData = unique([
    ...criteriaRows.flatMap((row) => row.data_needed || []).slice(0, 12),
    ...listLabels(tests, 8),
    ...criteriaRows.flatMap((row) => row.cutoffs || []).slice(0, 8)
  ]);
  const thresholdExamples = unique(criteriaRows.flatMap((row) => row.cutoffs || [])).slice(0, 10);
  const cutoffSummary = criteriaRows.slice(0, 5).map((row) => `${row.label}: ${(row.cutoffs || []).slice(0, 6).join(", ")}`).join(" | ");
  const thresholdSummary = cutoffSummary || thresholdExamples.join("; ") || "documented diagnostic criteria with clinician review when numeric thresholds are unavailable";
  const shortThresholdSummary = arrayText(thresholdExamples, thresholdSummary, 6);
  const redFlagSummary = listLabels(redFlags, 4).join("; ");
  const safetySummary = listLabels(safetyChecks, 5);
  const treatmentSummary = [...listLabels(treatments, 4), ...listLabels(dispositions, 3)].filter(Boolean).join("; ");
  const activationItems = firstItems(module, "requiredQuestions", 4, ["conditionalQuestions", "requiredExam"]);
  const activationSummary = arrayText([
    ...listLabels(activationItems, 4),
    ...listLabels(redFlags, 2),
    ...listLabels(tests, 2)
  ], `${label} symptoms, exam, vitals, and workup selection`, 7);
  const diagnosticDataSummary = arrayText([
    ...listLabels(tests, 5),
    ...criteriaRows.flatMap((row) => row.data_needed || []).slice(0, 6),
    ...thresholdExamples.slice(0, 4)
  ], `${label} diagnostic, severity, and treatment-safety results`, 10);
  const redFlagBranchSummary = arrayText([
    ...listLabels(redFlags, 4),
    ...thresholdExamples.slice(0, 3),
    ...listLabels(dispositions, 2)
  ], `${label} unstable physiology, danger feature, or monitored-care rule`, 8);
  const alternateBranchSummary = listText(differentials, `${label} exclusion or competing diagnosis`, 5);
  const safetyModifierSummary = arrayText([
    ...listLabels(safetyChecks, 4),
    "pregnancy/postpartum/lactation status",
    "renal/hepatic/cardiac disease",
    "allergy or drug interaction",
    "pediatric/adult applicability",
    "local protocol requirement"
  ], `${label} treatment modifier`, 8);
  const monitoringSummary = arrayText([
    ...thresholdExamples.slice(0, 4),
    ...listLabels(tests, 3),
    ...listLabels(safetyChecks, 3)
  ], `${label} symptoms, vitals, labs/results, adverse effects, and disposition`, 8);
  const deescalationSummary = arrayText([
    ...thresholdExamples.slice(0, 4),
    ...listLabels(dispositions, 3),
    ...listLabels(treatments, 3)
  ], `${label} objective response and diagnosis certainty`, 8);
  const followupSummary = arrayText([
    "pending-result owner",
    "follow-up interval",
    "return precautions",
    ...listLabels(dispositions, 3)
  ], `${label} follow-up ownership and safety net`, 6);
  const edgeLabels = {
    missingContext: `Missing exact ${label} pathway context: symptoms, exam, vitals, labs/results, medications, comorbidities, demographics, pregnancy/applicability, and workup findings`,
    diagnosticData: `Selected ${label} workup or documented findings: ${activationSummary}`,
    classification: `${label} results available for threshold classification: ${diagnosticDataSummary}`,
    missingCutoff: `Missing exact ${label} result(s): ${arrayText(exactDiagnosticData, `${label} threshold/result data`, 8)}`,
    urgent: `${label} danger feature or high-risk cutoff: ${redFlagBranchSummary}`,
    treatment: `${label} treatment/disposition indicated by: ${arrayText([shortThresholdSummary, treatmentSummary], `${label} confirmed or high-risk branch`, 4)}`,
    alternate: `${label} mimic/exclusion better fits: ${alternateBranchSummary}`,
    safetySelected: `${label} treatment selected; check patient-specific modifiers`,
    review: `${label} modifier changes treatment/disposition: ${safetyModifierSummary}`,
    monitoring: `After ${label} therapy or diagnostic plan, trend: ${monitoringSummary}`,
    worsening: `${label} reassessment worsens or contradicts expected response: ${monitoringSummary}`,
    deescalate: `${label} objective response supports narrowing, stopping, tapering, or continuing: ${deescalationSummary}`,
    followup: `${label} stable for discharge/outpatient plan: ${followupSummary}`
  };

  const followupEndpoint = endpoint({
    id: `${prefix}_followup_endpoint`,
    label: `${label}: follow-up ownership and safety-net endpoint`,
    edgeLabel: edgeLabels.followup,
    sourceIds: managementSources,
    criteria: criteria(`${prefix}_followup_criteria`, `Use after ${label} is stable, actionable results have an owner, and return precautions are documented.`, ["symptoms", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], managementSources),
    action: `Document the ${label} diagnosis/risk category, pending-result owner, follow-up interval, and return precautions for worsening symptoms, new danger features, inability to complete treatment, or abnormal pending results.`,
    endpointType: "safety_net_instruction",
    monitoringPlan: ["pending-result owner", "follow-up interval", "return precautions", "access barriers"]
  });

  const deescalateEndpoint = endpoint({
    id: `${prefix}_deescalate_endpoint`,
    label: `${label}: de-escalate, stop, or narrow when objective criteria normalize`,
    edgeLabel: edgeLabels.deescalate,
    sourceIds: managementSources,
    criteria: criteria(`${prefix}_deescalate_criteria`, `Stop, narrow, taper, or de-escalate ${label} treatment only when objective response, diagnosis certainty, and cited stopping criteria support it.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], managementSources, { criteria_options: criteriaRows.slice(0, 8) }),
    action: `Use the active ${label} objective criteria and response trend (${shortText(thresholdExamples.join("; "), 220)}) to stop, narrow, taper, or continue treatment; document what threshold or finding changed.`,
    endpointType: "deescalation_stopping",
    guidelineCutoffs: criteriaRows
  });

  const worseningEndpoint = endpoint({
    id: `${prefix}_worsening_endpoint`,
    label: `${label}: escalate when reassessment worsens or contradicts expected course`,
    edgeLabel: edgeLabels.worsening,
    sourceIds: unique([...redFlagSources, ...managementSources]),
    criteria: criteria(`${prefix}_worsening_criteria`, `Escalate ${label} if symptoms, vitals, critical thresholds, imaging/ECG/procedure results, or treatment response worsen or no longer fit the selected branch.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], unique([...redFlagSources, ...managementSources]), { criteria_options: criteriaRows.slice(0, 8) }),
    action: `Repeat critical ${label} objective data, reassess mimics/complications, and move to ED/admission/specialty review according to the abnormal cutoff or danger feature.`,
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const monitoring = actionNode({
    id: `${prefix}_monitoring_bundle`,
    label: `${label}: concurrent monitoring, response checks, and disposition readiness`,
    edgeLabel: edgeLabels.monitoring,
    sourceIds: managementSources,
    criteria: criteria(`${prefix}_monitoring_criteria`, `Monitor ${label} by trending the same cited threshold/result findings that selected the branch, plus medication adverse effects and disposition constraints.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], managementSources, { criteria_options: criteriaRows.slice(0, 8) }),
    action: `Reassess ${label} using the active thresholds and clinical course; do not close the pathway until response, adverse effects, pending data, and disposition are owned.`,
    parallelActions: unique(["repeat vital signs", "trend objective labs/results", "review treatment response/adverse effects", "confirm disposition and follow-up owner", ...safetySummary]),
    guidelineCutoffs: criteriaRows,
    children: [worseningEndpoint, deescalateEndpoint, followupEndpoint]
  });

  const reviewEndpoint = endpoint({
    id: `${prefix}_review_endpoint`,
    label: `${label}: clinician review for contraindication, special population, or local-policy cutoff`,
    edgeLabel: edgeLabels.review,
    sourceIds: cutoffSources,
    criteria: criteria(`${prefix}_review_criteria`, `Use clinician review when ${label} treatment/disposition depends on pregnancy/postpartum status, pediatric/adult applicability, renal/hepatic/cardiac disease, allergy, drug interaction, procedural risk, guideline conflict, or local protocol.`, ["pregnancy_status", "demographics", "medications", "comorbidities", "allergies", "local_policy", "workup_findings"], cutoffSources),
    action: `Pause non-emergent ${label} treatment choices until the modifier is resolved and the reviewer documents the applicable guideline/local cutoff.`,
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Patient-specific contraindication, special population, guideline conflict, or local policy affects treatment or disposition."
  });

  const safetyDecision = decision({
    id: `${prefix}_treatment_safety_decision`,
    label: `${label}: medication/procedure safety and special-population thresholds resolved?`,
    edgeLabel: edgeLabels.safetySelected,
    sourceIds: cutoffSources,
    criteria: criteria(`${prefix}_safety_decision_criteria`, `Route ${label} management by treatment contraindications, dose/weight/renal/pregnancy constraints, and local protocol dependencies before committing to therapy.`, ["medications", "allergies", "pregnancy_status", "demographics", "comorbidities", "labs", "workup_findings"], cutoffSources, { criteria_options: criteriaRows.filter((row) => /treat|dose|mg|kg|pregnan|bmi|renal|contra/i.test(`${row.label} ${row.criteria_text}`)).slice(0, 8) }),
    action: `Apply ${label}-specific safety modifiers before final treatment/disposition.`,
    children: [reviewEndpoint, monitoring]
  });

  const treatmentBundle = actionNode({
    id: `${prefix}_treatment_bundle`,
    label: `${label}: initiate treatment/disposition for the active threshold-defined branch`,
    edgeLabel: edgeLabels.treatment,
    sourceIds: managementSources,
    criteria: criteria(`${prefix}_treatment_bundle_criteria`, `Use the ${label} treatment branch only when cited diagnostic/severity thresholds are satisfied and required treatment-safety data are available.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "pregnancy_status", "workup_findings"], managementSources, { criteria_options: criteriaRows.slice(0, 10) }),
    action: treatmentSummary || `Treat ${label} according to the active threshold-defined branch and documented severity.`,
    parallelActions: unique([...listLabels(treatments, 5), ...listLabels(dispositions, 3)]),
    guidelineCutoffs: criteriaRows,
    children: [safetyDecision]
  });

  const alternateEndpoint = endpoint({
    id: `${prefix}_alternate_endpoint`,
    label: `${label}: switch to mimic/alternate pathway when threshold/result criteria do not fit`,
    edgeLabel: edgeLabels.alternate,
    sourceIds: differentialSources,
    criteria: criteria(`${prefix}_alternate_criteria`, `Use an alternate pathway when ${label} criteria are absent, a cited mimic better explains the presentation, or objective result data contradict this workup.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"], differentialSources, { criteria_options: criteriaRows.slice(0, 8) }),
    action: `Document why ${label} is not the active pathway and route to the competing diagnosis: ${shortText(listLabels(differentials, 5).join("; "), 320)}.`,
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Competing diagnosis or exclusion changes the active pathway."
  });

  const urgentEndpoint = endpoint({
    id: `${prefix}_urgent_endpoint`,
    label: `${label}: emergency escalation or monitored-care disposition when danger thresholds are met`,
    edgeLabel: edgeLabels.urgent,
    sourceIds: unique([...redFlagSources, ...managementSources]),
    criteria: criteria(`${prefix}_urgent_criteria`, `Escalate ${label} when any condition-specific danger feature, high-risk cutoff, unstable physiology, or monitored-care disposition rule is present.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "mental_status", "workup_findings"], unique([...redFlagSources, ...managementSources]), { criteria_options: criteriaRows.slice(0, 10) }),
    action: redFlagSummary ? `${redFlagSummary}. ${shortText(treatmentSummary, 240)}` : `Escalate ${label} for emergency evaluation or monitored care using the abnormal cutoff or danger feature.`,
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const missingCutoffEndpoint = endpoint({
    id: `${prefix}_missing_cutoff_data_endpoint`,
    label: `Missing data needed: ${label} threshold/results`,
    edgeLabel: edgeLabels.missingCutoff,
    sourceIds: unique([...genericSourceIds, ...cutoffSources]),
    criteria: criteria(`${prefix}_missing_cutoff_data_criteria`, `Route here when ${label} cannot be classified because exact threshold/result data are missing.`, contextDomains, unique([...genericSourceIds, ...cutoffSources]), { missing_any: exactDiagnosticData }),
    action: `Obtain the exact ${label} data needed for threshold-based routing: ${shortText(exactDiagnosticData.join("; "), 420)}.`,
    endpointType: "missing_data_needed",
    missingDataNeeded: exactDiagnosticData
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: `${label}: classify severity and disposition by cited thresholds`,
    edgeLabel: edgeLabels.classification,
    sourceIds: cutoffSources,
    criteria: criteria(`${prefix}_classification_criteria`, `Classify ${label} against cited thresholds and condition-specific rules: ${shortText(thresholdSummary, 520)}`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "demographics", "pregnancy_status", "workup_findings"], cutoffSources, { criteria_options: criteriaRows }),
    action: `Choose the active ${label} branch by matching patient data to: ${shortText(thresholdSummary, 520)}.`,
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingCutoffEndpoint, urgentEndpoint, treatmentBundle, alternateEndpoint]
  });

  const dataBundle = actionNode({
    id: `${prefix}_concurrent_data_bundle`,
    label: `${label}: obtain concurrent diagnostic, severity, and treatment-safety data`,
    edgeLabel: edgeLabels.diagnosticData,
    sourceIds: testSources,
    criteria: criteria(`${prefix}_data_bundle_criteria`, `Obtain ${label} diagnostic/severity/treatment-safety data together rather than as a one-step chain.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "pregnancy_status"], testSources),
    action: `Obtain together: ${shortText([...listLabels(tests, 8), ...safetySummary, ...criteriaRows.flatMap((row) => row.data_needed || []).slice(0, 8)].join("; "), 520)}.`,
    parallelActions: unique([...listLabels(tests, 8), ...safetySummary, ...criteriaRows.flatMap((row) => row.data_needed || []).slice(0, 8)]),
    requiredData: exactDiagnosticData,
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: `Missing data needed: ${label} pathway context`,
    edgeLabel: edgeLabels.missingContext,
    sourceIds: genericSourceIds,
    criteria: criteria("missing_context_criteria", `Route here when the patient context needed to activate ${label} is absent or cannot be extracted.`, contextDomains, genericSourceIds, { missing_any: contextDomains }),
    action: `Before choosing a non-emergency ${label} branch, document: presenting trigger, onset/trajectory, focused exam, vital signs, threshold labs/results, medication/allergy context, comorbidities, demographics, pregnancy/applicability status, and current workup findings.`,
    endpointType: "missing_data_needed",
    missingDataNeeded: contextDomains
  });

  const root = decision({
    id: "root",
    label: `${label}: does patient context support this workup or require exact missing-data routing?`,
    sourceIds: cutoffSources,
    criteria: criteria("activate_workup", `Activate when structured or extractable context matches ${label} triggers or the clinician selects workup ${module.id}.`, ["selected_workup_id", "presenting_symptoms", "problem_list_or_diagnosis", "clinician_selected_module"], cutoffSources),
    action: `Route ${label} using cited diagnostic thresholds/rules, concurrent data bundles, treatment-safety checks, monitoring, de-escalation, follow-up, and safety-net endpoints.`,
    children: [missingContextEndpoint, dataBundle]
  });

  const activationRules = {};
  const allNodeSourceIds = [];
  const collect = (entry) => {
    allNodeSourceIds.push(...(entry.source_ids || []), ...(entry.criteria?.source_ids || []));
    if (entry.criteria) activationRules[entry.id] = entry.criteria;
    for (const child of entry.children || []) collect(child);
  };
  collect(root);
  const sourceThresholds = sourceThresholdsFromCriteria(criteriaRows);
  const finalSourceIds = unique([...cutoffSources, ...allNodeSourceIds, ...sourceThresholds.flatMap((row) => row.source_ids || [])]);

  return {
    schema: "clinical_pathway_tree_v1",
    workupId: module.id,
    workup_id: module.id,
    title: label,
    version: "3.0.0",
    status: "hand_polished_compact_pathway_needs_clinician_review",
    source_ids: finalSourceIds,
    source_metadata: sourceRowsForTree(finalSourceIds, sourceById),
    provenance: {
      generated_by: "scripts/hand-polish-clinical-pathway-trees.js",
      generated_at: `${auditDate}T00:00:00.000Z`,
      update_scope: "clinical_pathway_tree_v1 plus explicit clinical_cutoff_criteria enrichment where needed",
      source_material: "Local module evidence rows, source registry metadata, and targeted guideline/literature review for cutoff gaps",
      review_note: "Compact tree is cutoff-cited and traversable but requires clinician review for local policy, patient-specific contraindications, and source conflicts."
    },
    source_thresholds: sourceThresholds,
    traversable_context: buildTraversableContext(module, finalSourceIds, tests, criteriaRows),
    activationRules,
    root,
    synthetic_patient_scenarios: buildSyntheticScenarios(prefix, edgeLabels),
    audit_requirements: {
      required_domains: requiredPathwayDomains,
      compact_tree_requirements: [
        "no prohibited generic node labels",
        "concurrent diagnostic/treatment bundles instead of long one-step chains",
        "cited thresholds/rules visible in classification and endpoint nodes",
        "all endpoints cite evidence or state needs_clinical_review",
        "missing-data endpoints name exact data needed"
      ]
    }
  };
}

function buildAdultSepsisClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Fever, infection, or sepsis";
  const prefix = "fever_infection_sepsis";
  const ssc = ["SSC_SEPSIS_2026"];
  const maternal = ["SMFM_MATERNAL_SEPSIS_2023"];
  const sourceIds = unique([...ssc, ...maternal, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 8);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 5, ["treatmentOptions"]);

  const criteriaRows = [
    criterion({
      id: "adult_sepsis_screening_and_diagnosis",
      label: "Acutely ill adult: screen with NEWS/NEWS2/MEWS/SIRS rather than qSOFA alone; sepsis is a clinical diagnosis, not a single biomarker rule-out",
      criteria_text: "SSC 2026 recommends NEWS, NEWS2, MEWS, or SIRS over qSOFA as a single sepsis screening tool in hospital; sepsis is a clinical diagnosis and should not be ruled in or ruled out with one biomarker/test.",
      cutoffs: [],
      data_needed: ["suspected infection", "NEWS/NEWS2/MEWS/SIRS elements", "organ dysfunction evidence", "clinician source assessment"],
      source_ids: ssc,
      source_section: "Screening and biomarkers"
    }),
    criterion({
      id: "adult_sepsis_blood_culture_lactate",
      label: "Possible/probable/definite sepsis or shock: collect blood cultures as soon as possible, ideally before antimicrobials, and measure lactate",
      criteria_text: "For adults with possible, probable, or definite sepsis or septic shock, SSC recommends blood cultures as soon as possible and ideally before antimicrobials, and suggests measuring blood lactate.",
      cutoffs: [],
      data_needed: ["blood culture timing", "antimicrobial timing", "initial lactate", "suspected source"],
      source_ids: ssc,
      source_section: "Blood culture and blood lactate"
    }),
    criterion({
      id: "adult_sepsis_fluid_resuscitation",
      label: "Sepsis-induced hypoperfusion or septic shock: at least 30 mL/kg IV crystalloid in first 3 hours with frequent reassessment",
      criteria_text: "SSC 2026 suggests at least 30 mL/kg IV crystalloid in the first 3 hours for adults with sepsis-induced hypoperfusion or septic shock; use actual body weight or adjusted/ideal weight when BMI >30 kg/m2 and reassess frequently.",
      cutoffs: ["30 mL/kg", "3 hours", "BMI >30 kg/m2"],
      data_needed: ["weight", "BMI", "fluid already given", "perfusion assessment", "heart failure/renal disease risk", "fluid responsiveness"],
      source_ids: ssc,
      source_section: "Fluid resuscitation"
    }),
    criterion({
      id: "adult_sepsis_map_vasopressor_targets",
      label: "Septic shock physiology: vasopressors to maintain MAP >=65 mm Hg with lactate >2 mmol/L; treatment target MAP 65 mm Hg, or 60-65 mm Hg initially if age >=65",
      criteria_text: "Route suspected infection to septic shock/monitored-care escalation when vasopressors are needed to maintain MAP >=65 mm Hg and lactate remains >2 mmol/L after adequate fluid resuscitation. SSC 2026 recommends initial MAP target 65 mm Hg in adult septic shock, suggests 60-65 mm Hg in age 65 years or older, and suggests starting vasopressors peripherally rather than delaying for central venous access.",
      cutoffs: ["MAP >=65 mm Hg", "lactate >2 mmol/L", "MAP 65 mm Hg", "age >=65 years", "60-65 mm Hg"],
      data_needed: ["MAP", "lactate", "age", "vasopressor requirement", "fluid resuscitation status", "central/peripheral access", "arterial/noninvasive BP reliability"],
      source_ids: ssc,
      source_section: "Vasopressor administration and mean arterial pressure"
    }),
    criterion({
      id: "adult_sepsis_antibiotic_timing",
      label: "Antimicrobials: septic shock or probable/definite sepsis within 1 hour; possible sepsis without shock rapid investigation then antibiotics within 3 hours if concern persists",
      criteria_text: "SSC 2026 recommends antimicrobials immediately, ideally within 1 hour, for septic shock and probable/definite sepsis without shock; possible sepsis without shock should receive rapid investigation and antibiotics within 3 hours if infection concern persists, while low-likelihood infection without shock can defer antimicrobials with close monitoring.",
      cutoffs: ["1 hour", "3 hours"],
      data_needed: ["shock status", "infection likelihood", "time sepsis first suspected", "cultures obtained/not delayed", "antimicrobial allergies", "local resistance/MDR risk"],
      source_ids: ssc,
      source_section: "Antibiotic initiation"
    }),
    criterion({
      id: "adult_sepsis_source_control",
      label: "Source control: evaluate emergent source-control diagnoses and perform early source control ideally within 6 hours when required",
      criteria_text: "SSC 2026 states adults with sepsis or shock should be rapidly evaluated for source-control diagnoses and suggests early source control, ideally within 6 hours of sepsis or shock diagnosis requiring source control.",
      cutoffs: ["6 hours"],
      data_needed: ["suspected source", "imaging/procedure results", "drainage/debridement/line removal need", "consult availability"],
      source_ids: ssc,
      source_section: "Source control"
    }),
    criterion({
      id: "adult_sepsis_icu_and_respiratory_cutoffs",
      label: "ICU/respiratory escalation: ICU admission within 6 hours when required; oxygen target usually SpO2 90-96%; HFNC if PaO2/FiO2 <200 or SpO2/FiO2 <235",
      criteria_text: "SSC 2026 suggests ICU admission within 6 hours when ICU admission is required, SpO2 practice targets commonly 90-96% in acute hypoxemic respiratory failure, and HFNC for sepsis-associated hypoxemic respiratory failure with PaO2/FiO2 <200 or SpO2/FiO2 <235.",
      cutoffs: ["6 hours", "SpO2 90-96%", "PaO2/FiO2 <200", "SpO2/FiO2 <235"],
      data_needed: ["ICU need", "oxygen requirement", "SpO2", "PaO2/FiO2", "SpO2/FiO2", "work of breathing"],
      source_ids: ssc,
      source_section: "ICU admission, oxygen targets, respiratory support"
    }),
    criterion({
      id: "adult_sepsis_ards_ventilator_cutoffs",
      label: "Sepsis-associated ARDS: low tidal volume 6 mL/kg, plateau pressure <=30 cm H2O, prone ventilation >12 hours/day for moderate-severe ARDS",
      criteria_text: "SSC 2026 recommends low tidal volume ventilation at 6 mL/kg in sepsis-associated ARDS, plateau pressure upper limit 30 cm H2O, and prone ventilation for greater than 12 hours daily in moderate-severe ARDS.",
      cutoffs: ["6 mL/kg", "<=30 cm", ">12 hours"],
      data_needed: ["ARDS status", "ideal body weight", "tidal volume", "plateau pressure", "PaO2/FiO2 severity", "proning eligibility"],
      source_ids: ssc,
      source_section: "Mechanical ventilation"
    }),
    criterion({
      id: "adult_sepsis_serial_lactate_and_deescalation",
      label: "Monitoring/de-escalation: use serial lactate when lactate elevated or shock; de-escalate when cultures/susceptibility or final negative cultures allow; stop empiric therapy if alternate diagnosis strongly suspected",
      criteria_text: "SSC 2026 suggests serial lactate to guide resuscitation in elevated lactate or shock, recommends antimicrobial de-escalation with confirmed microbiology/susceptibility, suggests de-escalation when final cultures identify no pathogen, and advises discontinuing empiric therapy when an alternative diagnosis is demonstrated or strongly suspected.",
      cutoffs: [],
      data_needed: ["repeat lactate", "perfusion trend", "culture results", "susceptibility profile", "source control adequacy", "alternate diagnosis evidence"],
      source_ids: ssc,
      source_section: "Serial lactate and antimicrobial therapy"
    }),
    criterion({
      id: "adult_sepsis_discharge_followup",
      label: "Survivor discharge: written/verbal sepsis diagnosis and treatment summary; follow-up for new physical, cognitive, or emotional impairments",
      criteria_text: "SSC 2026 good-practice statements call for shared discharge planning, written/verbal summary of sepsis diagnosis/treatments/common impairments, and follow-up for new physical, cognitive, or emotional problems after sepsis hospitalization.",
      cutoffs: [],
      data_needed: ["discharge plan", "pending result owner", "new impairments", "follow-up access", "patient/family education"],
      source_ids: ssc,
      source_section: "Hospital discharge and post-hospital evaluation"
    }),
    criterion({
      id: "maternal_sepsis_review",
      label: "Pregnancy/postpartum sepsis: maternal sepsis pathway and obstetric source/fetal considerations require clinician review",
      criteria_text: "Pregnancy or postpartum status changes fever/sepsis evaluation, antimicrobial selection, source control, fetal considerations, and disposition; use maternal sepsis guidance and obstetric consultation.",
      cutoffs: [],
      data_needed: ["pregnancy status", "postpartum status", "gestational age", "obstetric source concern", "fetal/maternal monitoring needs"],
      source_ids: maternal,
      source_section: "Maternal sepsis consult"
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: adult fever/sepsis pathway context",
    edgeLabel: "Missing exact infection/sepsis context: source symptoms, onset, vitals, mental status, perfusion, oxygenation, medications/allergies, comorbidities, immune status, pregnancy/postpartum status, and current workup findings",
    sourceIds,
    criteria: criteria("adult_sepsis_missing_context_criteria", "Route here when the data needed to decide infection likelihood, shock physiology, source, or disposition cannot be extracted.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Obtain and document fever/source symptoms, onset and trajectory, full vital signs, mental status, perfusion/urine output, oxygenation/work of breathing, allergies/recent antimicrobials, immune status, pregnancy/postpartum status, comorbidities, and available labs/imaging before choosing a non-emergency branch.",
    endpointType: "missing_data_needed",
    missingDataNeeded: contextDomains
  });

  const missingSepsisDataEndpoint = endpoint({
    id: `${prefix}_missing_lactate_culture_source_endpoint`,
    label: "Missing data needed: lactate, cultures, source, perfusion, or organ dysfunction",
    edgeLabel: "Cannot classify sepsis urgency until lactate, MAP/BP, perfusion, mental status, oxygenation, organ dysfunction, culture timing, and likely source are known",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_missing_sepsis_data_criteria`, "Route here when suspected infection is present but exact data needed for sepsis/shock, antibiotic timing, source control, or disposition are missing.", contextDomains, ssc, { missing_any: ["blood pressure/MAP", "lactate", "mental status", "perfusion/capillary refill/urine output", "oxygenation", "suspected source", "blood culture timing", "antimicrobial timing"] }),
    action: "Measure lactate, obtain blood cultures as soon as possible and ideally before antimicrobials if this does not delay therapy, repeat vital signs/MAP, assess perfusion and mental status, identify likely source, and document whether shock/probable sepsis/possible sepsis criteria apply.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["blood pressure/MAP", "lactate", "mental status", "perfusion/capillary refill/urine output", "oxygenation", "suspected source", "blood culture timing", "antimicrobial timing"]
  });

  const shockIcuEndpoint = endpoint({
    id: `${prefix}_shock_resuscitation_icu_endpoint`,
    label: "Septic shock or hypoperfusion: resuscitate now and use monitored/ICU pathway",
    edgeLabel: "Shock/hypoperfusion: MAP below target, severe hypotension, lactate >=4 mmol/L, lactate >2 mmol/L with vasopressor need, mottling, altered mentation, hypoxemia, oliguria, or rapid deterioration",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_shock_icu_criteria`, "Use when sepsis-induced hypoperfusion or septic shock is present or strongly suspected.", ["vitals", "labs", "exam", "mental_status", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Begin immediate sepsis resuscitation: obtain cultures/lactate without delaying therapy, give broad-spectrum antimicrobials ideally within 1 hour, administer at least 30 mL/kg IV crystalloid in the first 3 hours when hypoperfusion/shock is present, reassess fluid tolerance frequently, start norepinephrine/peripheral vasopressors if hypotension persists, target MAP 65 mm Hg (or 60-65 mm Hg initially if age >=65), evaluate source control, and arrange monitored/ICU care within 6 hours when ICU admission is required.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["MAP target 65 mm Hg or 60-65 mm Hg if age >=65", "lactate trend", "fluid balance/overload", "perfusion/capillary refill", "urine output", "oxygen requirement", "vasopressor dose", "source control timing"]
  });

  const persistentHypoperfusionEndpoint = endpoint({
    id: `${prefix}_persistent_hypoperfusion_endpoint`,
    label: "Persistent hypoperfusion: reassess fluids, vasopressors, oxygenation, and source control",
    edgeLabel: "After initial therapy: MAP remains below target, lactate remains elevated, capillary refill/perfusion abnormal, escalating oxygen or vasopressor need, or source control not achieved",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_persistent_hypoperfusion_criteria`, "Use when reassessment after initial sepsis therapy shows persistent shock, elevated lactate, worsening oxygenation, or uncontrolled source.", ["vitals", "labs", "exam", "imaging_results", "medications", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Repeat focused exam and lactate, use dynamic measures such as passive leg raise/fluid challenge response to decide additional fluid, avoid reflexive fluids after the initial bolus, titrate vasopressors to MAP target, escalate respiratory support when SpO2/FiO2 or PaO2/FiO2 thresholds are met, and urgently re-evaluate antimicrobial coverage and source control.",
    endpointType: "monitoring_reassessment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["serial lactate", "MAP and vasopressor dose", "dynamic fluid responsiveness", "capillary refill/perfusion", "oxygenation ratios", "source control status"]
  });

  const probableSepsisTreatmentEndpoint = endpoint({
    id: `${prefix}_probable_definite_sepsis_treatment_endpoint`,
    label: "Probable or definite sepsis without shock: cultures, lactate, antimicrobials within 1 hour, and source plan",
    edgeLabel: "Probable/definite infection with organ dysfunction or high-risk trajectory but no current shock: start antimicrobials ideally within 1 hour and define source control need",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_probable_sepsis_criteria`, "Use when infection is probable or definite and acute organ dysfunction or high-risk trajectory is present without current shock.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "comorbidities", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Collect blood cultures as soon as possible and ideally before antibiotics if this does not delay treatment, measure lactate, give empiric antimicrobials immediately and ideally within 1 hour, tailor MDR/anaerobic/antifungal coverage to risk factors and likely source, evaluate source-control diagnoses, and set disposition based on organ dysfunction, oxygen need, lactate/perfusion, and monitoring needs.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["lactate if elevated", "organ dysfunction labs", "culture and susceptibility follow-up", "antibiotic time", "source-control clock"]
  });

  const possibleSepsisRapidEvaluationEndpoint = endpoint({
    id: `${prefix}_possible_sepsis_rapid_eval_endpoint`,
    label: "Possible sepsis without shock: rapid infectious vs noninfectious assessment and 3-hour antibiotic decision",
    edgeLabel: "Possible infection without shock and diagnosis uncertain: investigate rapidly; if concern persists, give antimicrobials within 3 hours from first suspicion",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_possible_sepsis_criteria`, "Use when sepsis is possible but not probable/definite and no shock is present.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Perform rapid assessment for infectious and noninfectious causes, obtain targeted tests and cultures when indicated, reassess vitals/perfusion, and either administer antimicrobials within 3 hours if infection concern persists or defer antimicrobials with close monitoring when infection likelihood is low and shock is absent.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["time first suspected", "repeat vitals", "source-directed tests", "decision by 3 hours", "return/escalation precautions"]
  });

  const mimicEndpoint = endpoint({
    id: `${prefix}_mimic_or_noninfectious_endpoint`,
    label: "Noninfectious mimic or alternate source better explains fever/systemic illness",
    edgeLabel: "Low infection likelihood or alternate diagnosis: drug fever, inflammatory/autoimmune flare, thrombosis/PE, malignancy, transfusion reaction, endocrine crisis, or localized nonseptic syndrome better explains findings",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_mimic_criteria`, "Use when rapid assessment demonstrates or strongly suggests a noninfectious cause or another pathway explains the presentation better than sepsis.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], ssc),
    action: "Document the alternate diagnosis, stop or avoid unnecessary empiric antimicrobials when infection is unconfirmed and an alternative cause is demonstrated or strongly suspected, continue close monitoring if uncertainty remains, and route to the appropriate workup.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Sepsis mimics require clinician confirmation before antimicrobials are withheld or stopped."
  });

  const sourceControlEndpoint = endpoint({
    id: `${prefix}_source_control_endpoint`,
    label: "Source control needed: drainage, debridement, device removal, or procedure",
    edgeLabel: "Anatomic diagnosis needs source control: abscess, obstructed infected urinary/biliary source, necrotizing soft tissue infection, infected line/device, CNS/deep infection, abdominal/pelvic source, septic joint, or empyema",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_source_control_criteria`, "Use when a specific anatomic diagnosis or source requires procedural control.", ["symptoms", "exam", "imaging_results", "cultures", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Activate appropriate surgical/interventional/urologic/IR consultation, obtain imaging if needed without delaying unstable care, and target source control ideally within 6 hours when sepsis or septic shock requires source control.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const deescalateEndpoint = endpoint({
    id: `${prefix}_antimicrobial_deescalation_endpoint`,
    label: "Antimicrobial de-escalation or stopping criteria reached",
    edgeLabel: "Cultures/susceptibility or final negative cultures allow narrowing; adequate source control achieved; or alternate diagnosis demonstrated/strongly suspected",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_deescalation_criteria`, "Use after cultures, susceptibility, clinical response, source control, and alternate diagnosis review determine whether empiric antimicrobials can narrow, stop, or shorten.", ["labs", "cultures", "imaging_results", "medications", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Narrow or discontinue unnecessary empiric antimicrobials when microbiology/susceptibility, final negative cultures, or an alternate diagnosis support it; use shorter therapy after adequate source control where appropriate, and use procalcitonin plus clinical evaluation only when optimal duration remains unclear.",
    endpointType: "deescalation_stopping",
    guidelineCutoffs: criteriaRows
  });

  const probablePersistentEndpoint = endpoint({
    id: `${prefix}_probable_persistent_hypoperfusion_endpoint`,
    label: "Probable sepsis reassessment: worsening perfusion, lactate, oxygenation, or organ dysfunction",
    edgeLabel: "After probable-sepsis treatment: new hypotension, MAP below target, rising/elevated lactate, worsening oxygenation, oliguria, altered mentation, or source-control delay",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_probable_persistent_criteria`, "Use when initially non-shock sepsis worsens or declares hypoperfusion during monitoring.", ["vitals", "labs", "exam", "imaging_results", "medications", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Reclassify as shock/hypoperfusion risk, repeat lactate and perfusion assessment, escalate monitoring, reassess fluids/vasopressors/oxygenation, and revisit source control and antimicrobial adequacy.",
    endpointType: "monitoring_reassessment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["repeat MAP/BP", "repeat lactate", "urine output", "oxygen requirement", "source-control status", "antimicrobial adequacy"]
  });

  const probableDeescalateEndpoint = endpoint({
    id: `${prefix}_probable_antimicrobial_deescalation_endpoint`,
    label: "Probable sepsis: narrow, stop, or shorten antimicrobials when evidence allows",
    edgeLabel: "Probable-sepsis cultures/susceptibility, final negative cultures, clinical response, adequate source control, or alternate diagnosis supports de-escalation",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_probable_deescalation_criteria`, "Use after probable-sepsis treatment when microbiology, source control, response, or alternate diagnosis evidence supports de-escalation.", ["labs", "cultures", "imaging_results", "medications", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Narrow spectrum, discontinue unnecessary empiric agents, or shorten duration after adequate source control; if duration remains unclear, combine clinical evaluation with procalcitonin rather than using procalcitonin alone.",
    endpointType: "deescalation_stopping",
    guidelineCutoffs: criteriaRows
  });

  const probableDischargeEndpoint = endpoint({
    id: `${prefix}_probable_discharge_followup_endpoint`,
    label: "Probable sepsis: lower-acuity disposition, follow-up, and safety net",
    edgeLabel: "Probable-sepsis patient stable for lower-acuity care: hemodynamics/oxygenation stable, source plan owned, antimicrobial plan reconciled, pending cultures assigned",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_probable_discharge_criteria`, "Use when a treated probable-sepsis patient is stable enough for lower-acuity care and follow-up/safety-net requirements are documented.", ["vitals", "labs", "medications", "follow_up_access", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Assign pending culture/result ownership, reconcile antimicrobial dose/duration and allergies, document source follow-up and return precautions, and arrange follow-up for any new impairment or unresolved infection concern.",
    endpointType: "safety_net_instruction",
    monitoringPlan: ["pending cultures", "antimicrobial plan", "source follow-up", "return precautions", "new impairment follow-up"]
  });

  const dischargeEndpoint = endpoint({
    id: `${prefix}_discharge_followup_endpoint`,
    label: "Sepsis survivor disposition, follow-up, and safety-net endpoint",
    edgeLabel: "Stable for discharge or lower acuity: source controlled or owned, hemodynamics/oxygenation stable, antimicrobial plan reconciled, pending results assigned, and sepsis education/follow-up documented",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_discharge_criteria`, "Use when the patient is stable enough for lower acuity care or discharge and post-sepsis needs are addressed.", ["vitals", "labs", "medications", "follow_up_access", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Document sepsis diagnosis/source, treatments received, culture and pending-result owner, antimicrobial plan/duration, new physical/cognitive/emotional impairments, follow-up access, and return precautions for recurrent fever, rigors, confusion, dyspnea, hypotension/syncope, decreased urine output, worsening pain, inability to take antimicrobials, or new rash/purpura.",
    endpointType: "safety_net_instruction",
    monitoringPlan: ["pending culture owner", "antimicrobial reconciliation", "source-control follow-up", "new impairment follow-up", "return precautions"]
  });

  const specialPopulationReview = endpoint({
    id: `${prefix}_special_population_review_endpoint`,
    label: "Clinician review: pregnancy/postpartum, immunocompromise, MDR risk, renal/hepatic dosing, or local sepsis policy",
    edgeLabel: "Treatment/disposition changes because pregnancy/postpartum status, immunocompromise/neutropenia, MDR colonization/prior infection, renal/hepatic dysfunction, antimicrobial allergy, device infection, or local protocol applies",
    sourceIds: unique([...ssc, ...maternal]),
    criteria: criteria(`${prefix}_special_population_criteria`, "Use when patient-specific modifiers change empiric antimicrobials, source-control timing, fetal/maternal monitoring, dosing, or disposition.", ["pregnancy_status", "demographics", "medications", "allergies", "comorbidities", "labs", "local_policy", "workup_findings"], unique([...ssc, ...maternal]), { criteria_options: criteriaRows }),
    action: "Pause non-emergent branching long enough to involve the appropriate clinician/service, but do not delay resuscitation or time-critical antimicrobials/source control; document the modifier, applicable protocol, and reviewer recommendation.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Pregnancy/postpartum, immunocompromise, MDR risk, organ dysfunction dosing, allergies, devices, or local policy changes management."
  });

  const shockReassessmentDecision = decision({
    id: `${prefix}_shock_reassessment_decision`,
    label: "After initial sepsis resuscitation, is shock/perfusion improving enough to narrow intensity?",
    edgeLabel: "Initial crystalloid, antimicrobial, vasopressor, lactate, oxygenation, and source-control response documented",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_shock_reassessment_criteria`, "Route by response after initial shock/hypoperfusion therapy.", ["vitals", "labs", "exam", "imaging_results", "medications", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Classify whether the patient needs ICU/escalation, more resuscitation/source control, antimicrobial de-escalation, or discharge/lower-acuity planning.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [shockIcuEndpoint, persistentHypoperfusionEndpoint, deescalateEndpoint, dischargeEndpoint]
  });

  const shockAction = actionNode({
    id: `${prefix}_shock_resuscitation_action`,
    label: "Septic shock or sepsis-induced hypoperfusion: start concurrent resuscitation, antimicrobials, cultures, lactate, and source control",
    edgeLabel: "Shock/hypoperfusion suspected from hypotension, MAP below 65 mm Hg, lactate elevation, altered mentation, mottling, oliguria, hypoxemia, or rapid worsening",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_shock_action_criteria`, "Use when immediate resuscitation cannot safely wait for full source confirmation.", ["vitals", "labs", "exam", "mental_status", "oxygenation", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Run cultures, lactate, fluids, antibiotics, vasopressors, oxygen/respiratory support, and source-control evaluation concurrently according to shock physiology.",
    parallelActions: ["blood cultures ideally before antibiotics if no delay", "initial lactate and serial lactate if elevated", "at least 30 mL/kg IV crystalloid in first 3 hours when hypoperfusion/shock", "broad antimicrobials ideally within 1 hour", "norepinephrine/vasopressor support for persistent hypotension", "source-control evaluation"],
    guidelineCutoffs: criteriaRows,
    children: [shockReassessmentDecision]
  });

  const probableSepsisAction = actionNode({
    id: `${prefix}_probable_sepsis_action`,
    label: "Probable or definite sepsis without shock: treat within 1 hour and define source/disposition",
    edgeLabel: "Probable/definite infection with organ dysfunction, high-risk host, lactate elevation, hypoxemia, oliguria, altered mentation, or rapidly worsening course but no current shock",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_probable_action_criteria`, "Use when infection is probable/definite without shock but management cannot wait.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "comorbidities", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Give antimicrobials immediately and ideally within 1 hour, measure lactate, collect blood cultures as soon as possible and ideally before antimicrobials if no delay, select source-directed diagnostics, and determine whether source control or higher-acuity disposition is needed.",
    parallelActions: ["blood cultures/lactate", "antimicrobials ideally within 1 hour", "source-directed imaging/tests", "MDR/anaerobic/fungal risk review", "disposition/monitoring decision"],
    guidelineCutoffs: criteriaRows,
    children: [probableSepsisTreatmentEndpoint, sourceControlEndpoint, probablePersistentEndpoint, probableDeescalateEndpoint, probableDischargeEndpoint]
  });

  const possibleSepsisAction = actionNode({
    id: `${prefix}_possible_sepsis_action`,
    label: "Possible sepsis without shock: complete rapid infectious-vs-mimic evaluation before the 3-hour treatment decision",
    edgeLabel: "Possible infection without shock: stable enough for time-limited rapid investigation, with antimicrobials by 3 hours if infection concern persists",
    sourceIds: ssc,
    criteria: criteria(`${prefix}_possible_action_criteria`, "Use for possible sepsis without shock where infection likelihood is uncertain.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], ssc, { criteria_options: criteriaRows }),
    action: "Run a time-limited rapid assessment for infection source and mimics, monitor closely, and document the 3-hour antibiotic decision point.",
    parallelActions: ["repeat vitals/perfusion", "source-directed labs/imaging", "culture only when indicated", "mimic review", "3-hour antimicrobial decision"],
    guidelineCutoffs: criteriaRows,
    children: [possibleSepsisRapidEvaluationEndpoint, mimicEndpoint, specialPopulationReview]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment_bundle`,
    label: "Fever/infection bedside assessment: source, organ dysfunction, perfusion, oxygenation, cultures, lactate, and medication risk",
    edgeLabel: "Fever or suspected infection with enough bedside data to choose shock, probable sepsis, possible sepsis, mimic, or special-population branch",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial fever/infection evaluation requires source symptoms, complete vital signs, mental status, perfusion, oxygenation, organ dysfunction clues, cultures/lactate when sepsis is possible, medication/allergy risks, and host modifiers.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Assess suspected source and mimic probability, measure full vitals including MAP and oxygenation, document mental status/perfusion/urine output, collect cultures/lactate when sepsis is possible, review allergy/recent antimicrobials/MDR risk, and identify pregnancy/postpartum or immunocompromised status.",
    parallelActions: ["full vital signs including MAP", "mental status/perfusion/urine output", "oxygenation/work of breathing", "blood cultures/lactate when sepsis possible", "source-directed tests", "allergy/recent antimicrobial/MDR risk review", "pregnancy/postpartum and immune status"],
    guidelineCutoffs: criteriaRows,
    children: [
      missingSepsisDataEndpoint,
      shockAction,
      probableSepsisAction,
      possibleSepsisAction
    ]
  });

  const root = decision({
    id: "root",
    label: "Fever/infection: choose adult sepsis urgency, infection likelihood, source-control need, and disposition",
    sourceIds,
    criteria: criteria("activate_adult_fever_sepsis", "Activate when adult patient context includes fever, suspected infection, systemic inflammatory symptoms, sepsis concern, shock physiology, or clinician-selected fever/sepsis workup.", ["selected_workup_id", "presenting_symptoms", "vitals", "problem_list_or_diagnosis", "clinician_selected_module"], sourceIds),
    action: "Route adult fever/infection through missing-data, septic shock, probable sepsis, possible sepsis, mimic, special-population review, source control, monitoring, de-escalation, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  const activationRules = {};
  const allNodeSourceIds = [];
  const collect = (entry) => {
    allNodeSourceIds.push(...(entry.source_ids || []), ...(entry.criteria?.source_ids || []));
    if (entry.criteria) activationRules[entry.id] = entry.criteria;
    for (const child of entry.children || []) collect(child);
  };
  collect(root);
  const sourceThresholds = sourceThresholdsFromCriteria(criteriaRows);
  const localEvidenceSourceIds = sourceIdsForItems([...tests, ...redFlags, ...differentials, ...dispositions], sourceIds);
  const finalSourceIds = unique([...sourceIds, ...localEvidenceSourceIds, ...allNodeSourceIds, ...sourceThresholds.flatMap((row) => row.source_ids || [])]);

  return {
    schema: "clinical_pathway_tree_v1",
    workupId: module.id,
    workup_id: module.id,
    title: label,
    version: "4.0.0",
    status: "hand_polished_adult_sepsis_pathway_needs_clinician_review",
    source_ids: finalSourceIds,
    source_metadata: sourceRowsForTree(finalSourceIds, sourceById),
    provenance: {
      generated_by: "scripts/hand-polish-clinical-pathway-trees.js",
      generated_at: `${auditDate}T00:00:00.000Z`,
      update_scope: "clinical_pathway_tree_v1 only",
      source_material: "SSC 2026 adult sepsis recommendations, SMFM maternal sepsis source metadata, and local module evidence rows",
      review_note: "Adult sepsis tree is disease-specific and threshold-cited; local sepsis alert policy, antimicrobial formulary, antibiogram, and source-control pathways still require clinician governance."
    },
    source_thresholds: sourceThresholds,
    traversable_context: buildTraversableContext(module, finalSourceIds, tests, criteriaRows),
    activationRules,
    root,
    synthetic_patient_scenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: "endpoint_missing_context", expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_lactate_source_data", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingSepsisDataEndpoint.id, expected_active_branch: missingSepsisDataEndpoint.edgeLabel },
      { scenario_id: "septic_shock_hypoperfusion", major_pathway: "escalation_emergency_actions", expected_endpoint_id: shockIcuEndpoint.id, expected_active_branch: shockIcuEndpoint.edgeLabel },
      { scenario_id: "possible_sepsis_mimic", major_pathway: "mimics_exclusions", expected_endpoint_id: mimicEndpoint.id, expected_active_branch: mimicEndpoint.edgeLabel },
      { scenario_id: "pregnancy_or_mdr_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: specialPopulationReview.id, expected_active_branch: specialPopulationReview.edgeLabel },
      { scenario_id: "persistent_lactate_or_hypoperfusion", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: persistentHypoperfusionEndpoint.id, expected_active_branch: persistentHypoperfusionEndpoint.edgeLabel },
      { scenario_id: "culture_deescalation_ready", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: deescalateEndpoint.id, expected_active_branch: deescalateEndpoint.edgeLabel },
      { scenario_id: "survivor_discharge_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: dischargeEndpoint.id, expected_active_branch: dischargeEndpoint.edgeLabel }
    ],
    audit_requirements: {
      required_domains: requiredPathwayDomains,
      hand_polished_requirements: [
        "adult sepsis/shock branch uses SSC 2026 timing and hemodynamic thresholds",
        "possible sepsis without shock includes 3-hour rapid evaluation branch",
        "probable/definite sepsis and septic shock include 1-hour antimicrobial branch",
        "source control, serial lactate, MAP, vasopressor, de-escalation, discharge, and special-population decisions are explicit",
        "local antimicrobial formulary, antibiogram, and sepsis alert policy remain clinician-governed"
      ]
    }
  };
}

function buildAdultDkaHhsClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Hyperglycemia / possible DKA or HHS";
  const prefix = "adult_dka_hhs";
  const adaCrisis = ["ADA_HYPERGLYCEMIC_CRISES_2024"];
  const adaHospital = ["ADA_STANDARDS_HOSPITAL_2026"];
  const sourceIds = unique([...adaCrisis, ...adaHospital, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 10);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);

  const criteriaRows = [
    criterion({
      id: "adult_dka_diagnostic_thresholds",
      label: "Adult DKA: diabetes/prior diabetes or glucose >=200 mg/dL, beta-hydroxybutyrate >=3.0 mmol/L or urine ketones >=2+, and pH <7.3 and/or bicarbonate <18 mmol/L",
      criteria_text: "Classify DKA when diabetes/prior diabetes or glucose >=200 mg/dL is present with beta-hydroxybutyrate >=3.0 mmol/L or urine ketones >=2+ and metabolic acidosis with pH <7.3 and/or bicarbonate <18 mmol/L; evaluate acidosis even if glucose is <200 mg/dL when SGLT2 inhibitor, pregnancy, fasting, or poor intake raises euglycemic DKA risk.",
      cutoffs: ["glucose >=200 mg/dL", "beta-hydroxybutyrate >=3.0 mmol/L", "urine ketones >=2+", "pH <7.3", "bicarbonate <18 mmol/L", "glucose <200 mg/dL"],
      data_needed: ["glucose", "diabetes history", "beta-hydroxybutyrate", "urine ketones if blood ketones unavailable", "venous pH", "bicarbonate", "anion gap", "SGLT2 inhibitor/pregnancy/fasting context"],
      source_ids: adaCrisis,
      source_section: "Adult DKA diagnosis and euglycemic DKA"
    }),
    criterion({
      id: "adult_hhs_diagnostic_thresholds",
      label: "Adult HHS: glucose >=600 mg/dL with effective osmolality >300 mOsm/kg or total osmolality >320 mOsm/kg and absent significant ketonemia/acidosis",
      criteria_text: "Classify HHS when glucose >=600 mg/dL is accompanied by effective osmolality >300 mOsm/kg or total osmolality >320 mOsm/kg, absent significant ketonemia, and no significant acidosis; assess for mixed DKA/HHS whenever ketones or acidosis coexist.",
      cutoffs: ["glucose >=600 mg/dL", "effective osmolality >300 mOsm/kg", "total osmolality >320 mOsm/kg"],
      data_needed: ["glucose", "sodium", "effective osmolality", "measured/total osmolality", "beta-hydroxybutyrate", "pH", "bicarbonate", "mental status"],
      source_ids: adaCrisis,
      source_section: "Adult HHS diagnosis and mixed crisis"
    }),
    criterion({
      id: "adult_dka_potassium_insulin_safety",
      label: "Adult DKA/HHS insulin safety: insulin should be delayed when potassium is <3.5 mmol/L and delay insulin until K is >3.5 mmol/L",
      criteria_text: "Before insulin infusion, check potassium and ECG/renal risk; insulin should be delayed when potassium is <3.5 mmol/L, potassium should be replaced with monitored protocol care, and delay insulin until K is >3.5 mmol/L.",
      cutoffs: ["potassium is <3.5 mmol/L", "K <3.5 mmol/L", "K is >3.5 mmol/L"],
      data_needed: ["potassium", "ECG", "renal function", "urine output", "insulin plan", "potassium replacement capacity"],
      source_ids: adaCrisis,
      source_section: "Potassium replacement and insulin safety"
    }),
    criterion({
      id: "adult_dka_hhs_initial_treatment",
      label: "Adult DKA/HHS initial treatment: isotonic fluid, potassium-safe insulin, dextrose when glucose approaches DKA/HHS targets, and serial labs",
      criteria_text: "Treat DKA/HHS with immediate isotonic crystalloid unless fluid-overload risk changes the plan, potassium-aware insulin therapy after safety labs, bedside glucose every 1-2 h, electrolytes/creatinine/phosphate/beta-hydroxybutyrate/venous pH about every 4 h for DKA, and osmolality about every 4 h for HHS.",
      cutoffs: ["1-2 h", "4 h"],
      data_needed: ["volume status", "heart failure/kidney disease", "glucose trend", "potassium", "beta-hydroxybutyrate", "venous pH", "bicarbonate", "osmolality"],
      source_ids: adaCrisis,
      source_section: "Fluids, insulin, and monitoring"
    }),
    criterion({
      id: "adult_dka_hhs_resolution_transition",
      label: "Adult DKA/HHS transition: biochemical resolution and clinical stability with basal insulin overlap 1-2 h before stopping IV insulin; do not use anion gap alone",
      criteria_text: "Transition off IV insulin only after biochemical resolution and clinical stability; use basal-bolus insulin with basal overlap 1-2 h before stopping IV insulin and do not use anion gap alone as the resolution criterion.",
      cutoffs: ["1-2 h"],
      data_needed: ["beta-hydroxybutyrate/ketone trend", "pH", "bicarbonate", "osmolality", "mental status", "oral intake", "basal insulin timing"],
      source_ids: adaCrisis,
      source_section: "Resolution criteria and transition"
    }),
    criterion({
      id: "adult_noncrisis_inpatient_hyperglycemia",
      label: "Adult non-crisis inpatient hyperglycemia: persistent inpatient glucose >=180 mg/dL generally needs insulin initiation or intensification",
      criteria_text: "When DKA/HHS criteria are absent, persistent inpatient glucose >=180 mg/dL generally warrants insulin initiation or intensification, medication reconciliation, nutrition/insulin matching, and follow-up planning; use A1c if no reliable result in the prior 3 months.",
      cutoffs: ["persistent inpatient glucose >=180 mg/dL", "3 months"],
      data_needed: ["repeat glucose", "DKA/HHS exclusion labs", "A1c within prior 3 months", "nutrition status", "current diabetes medications", "hypoglycemia risk"],
      source_ids: adaHospital,
      source_section: "Inpatient hyperglycemia treatment thresholds"
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: adult hyperglycemic-crisis context",
    edgeLabel: "Missing adult DKA/HHS context: diabetes history, recent insulin/SGLT2 exposure, symptoms, full vitals, hydration/perfusion, mental status, pregnancy status, comorbid fluid risk, and available workup findings",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when adult hyperglycemic-crisis pathway activation cannot be determined from extractable patient context.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document diabetes type/history, last insulin and pump/CGM status, SGLT2 inhibitor use, pregnancy/fasting/poor intake, polyuria/polydipsia/vomiting/abdominal pain, full vitals, hydration/perfusion, mental status, renal/cardiac disease, and current glucose/ketone/acid-base/osmolality results before selecting a non-emergency branch.",
    endpointType: "missing_data_needed",
    missingDataNeeded: contextDomains
  });

  const missingCrisisDataEndpoint = endpoint({
    id: `${prefix}_missing_crisis_labs_endpoint`,
    label: "Missing data needed: glucose, ketones, pH/bicarbonate, potassium, renal function, and osmolality",
    edgeLabel: "Cannot distinguish DKA, HHS, mixed crisis, euglycemic DKA, potassium hazard, or non-crisis hyperglycemia until glucose, beta-hydroxybutyrate/ketones, pH, bicarbonate, potassium, creatinine, sodium, osmolality, and mental status are known",
    sourceIds: adaCrisis,
    criteria: criteria(`${prefix}_missing_crisis_labs_criteria`, "Route here when adult hyperglycemia is present but the exact results needed for DKA/HHS classification or insulin safety are unavailable.", contextDomains, adaCrisis, { missing_any: ["glucose", "beta-hydroxybutyrate or urine ketones", "venous pH", "bicarbonate", "potassium", "creatinine/eGFR", "sodium/corrected sodium", "effective or total osmolality", "mental status"] }),
    action: "Obtain point-of-care glucose, serum/capillary beta-hydroxybutyrate or urine ketones, BMP with corrected sodium/potassium/creatinine/bicarbonate/anion gap, venous pH, osmolality when HHS or altered mental status is possible, ECG if potassium risk exists, and precipitant testing guided by symptoms.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["glucose", "beta-hydroxybutyrate or urine ketones", "venous pH", "bicarbonate", "potassium", "creatinine/eGFR", "sodium/corrected sodium", "effective or total osmolality", "mental status", "precipitant assessment"]
  });

  const potassiumHoldEndpoint = endpoint({
    id: `${prefix}_potassium_insulin_hold_endpoint`,
    label: "Potassium hazard: replace potassium and hold insulin until K is safe",
    edgeLabel: "Potassium/ECG/renal hazard: insulin should be delayed when potassium is <3.5 mmol/L, marked hyperkalemia/ECG change is present, or renal failure prevents safe replacement",
    sourceIds: adaCrisis,
    criteria: criteria(`${prefix}_potassium_hold_criteria`, "Use before insulin when potassium or renal/ECG status makes insulin unsafe.", ["labs", "vitals", "medications", "comorbidities", "workup_findings"], adaCrisis, { criteria_options: criteriaRows }),
    action: "Delay insulin until K is >3.5 mmol/L, replace potassium using a monitored protocol, use ECG/cardiac monitoring for severe hypo- or hyperkalemia, reassess renal function and urine output, and use specialist/ICU review when potassium cannot be monitored or replaced safely.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["potassium trend", "ECG", "renal function", "urine output", "insulin start time"]
  });

  const dkaProtocolEndpoint = endpoint({
    id: `${prefix}_dka_protocol_endpoint`,
    label: "Adult DKA confirmed: start fluid, potassium-aware insulin, precipitant treatment, and serial monitoring",
    edgeLabel: "DKA branch: prior diabetes or glucose >=200 mg/dL, beta-hydroxybutyrate >=3.0 mmol/L or urine ketones >=2+, and pH <7.3 and/or bicarbonate <18 mmol/L",
    sourceIds: adaCrisis,
    criteria: criteria(`${prefix}_dka_protocol_criteria`, "Use when adult DKA diagnostic thresholds are met and potassium is safe enough for insulin.", ["symptoms", "vitals", "labs", "medications", "comorbidities", "workup_findings"], adaCrisis, { criteria_options: criteriaRows }),
    action: "Treat as DKA with isotonic fluid resuscitation, potassium-guided insulin after safety labs, glucose checks every 1-2 h, electrolytes/creatinine/phosphate/beta-hydroxybutyrate/venous pH about every 4 h, dextrose-containing fluids as glucose falls per protocol, and source-directed treatment of infection, MI/stroke, pancreatitis, pump failure, missed insulin, medication access, alcohol, or pregnancy-related precipitant.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["glucose every 1-2 h", "potassium and electrolytes about every 4 h", "beta-hydroxybutyrate", "venous pH/bicarbonate", "fluid balance", "precipitant response"]
  });

  const dkaTransitionEndpoint = endpoint({
    id: `${prefix}_dka_transition_discharge_endpoint`,
    label: "Adult DKA resolving: transition to basal-bolus insulin, prevent recurrence, and safety-net",
    edgeLabel: "DKA improving: biochemical resolution, stable vitals/mentation, oral intake possible, precipitant owned, and basal insulin can overlap IV insulin 1-2 h",
    sourceIds: adaCrisis,
    criteria: criteria(`${prefix}_dka_transition_criteria`, "Use when adult DKA has resolved enough to leave IV insulin and move to subcutaneous therapy or lower acuity.", ["vitals", "labs", "medications", "comorbidities", "workup_findings", "follow_up_access"], adaCrisis, { criteria_options: criteriaRows }),
    action: "Transition only after biochemical resolution and clinical stability; give basal insulin overlap 1-2 h before stopping IV insulin, do not rely on anion gap alone, confirm insulin/supplies/ketone testing/sick-day plan/glucagon when indicated, address affordability and recurrent-DKA barriers, and provide return precautions for vomiting, rising ketones, recurrent glucose elevation, confusion, dyspnea, chest pain, syncope, or inability to take fluids/insulin.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["basal overlap 1-2 h", "ketone/acid-base resolution", "oral intake", "insulin access", "follow-up owner", "return precautions"]
  });

  const dkaAction = actionNode({
    id: `${prefix}_dka_action`,
    label: "Adult DKA: classify severity, protect potassium safety, and treat the precipitant",
    edgeLabel: "Adult DKA thresholds met, including prior diabetes or glucose >=200 mg/dL with ketonemia/ketonuria and pH <7.3 and/or bicarbonate <18 mmol/L",
    sourceIds: adaCrisis,
    criteria: criteria(`${prefix}_dka_action_criteria`, "Route here when adult DKA diagnostic thresholds are present or strongly suspected.", ["symptoms", "vitals", "labs", "medications", "comorbidities", "workup_findings"], adaCrisis, { criteria_options: criteriaRows }),
    action: "Run potassium safety, DKA treatment, and transition planning as linked branches; escalate severe acidosis, shock, altered mentation, severe electrolyte disturbance, or inability to monitor to ICU/high-acuity care.",
    parallelActions: ["potassium/ECG safety", "isotonic fluid", "insulin after potassium safety", "serial glucose/ketones/acid-base labs", "precipitant treatment", "transition/discharge prevention"],
    guidelineCutoffs: criteriaRows,
    children: [potassiumHoldEndpoint, dkaProtocolEndpoint, dkaTransitionEndpoint]
  });

  const hhsProtocolEndpoint = endpoint({
    id: `${prefix}_hhs_protocol_endpoint`,
    label: "Adult HHS confirmed: high-acuity fluid-first correction with osmolality and neurologic monitoring",
    edgeLabel: "HHS branch: glucose >=600 mg/dL with effective osmolality >300 mOsm/kg or total osmolality >320 mOsm/kg, minimal ketonemia, and no major acidosis",
    sourceIds: adaCrisis,
    criteria: criteria(`${prefix}_hhs_protocol_criteria`, "Use when adult HHS thresholds are met or mixed DKA/HHS has been excluded.", ["vitals", "labs", "exam", "medications", "comorbidities", "workup_findings"], adaCrisis, { criteria_options: criteriaRows }),
    action: "Treat as HHS with high-acuity monitoring, careful isotonic fluid replacement individualized for age, kidney disease, and heart failure, potassium monitoring before insulin, gradual glucose/sodium/osmolality correction, neurologic checks, precipitant treatment, and osmolality about every 4 h until stable.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["mental status", "effective/total osmolality about every 4 h", "corrected sodium", "glucose", "potassium", "fluid balance", "precipitant response"]
  });

  const hhsTransitionEndpoint = endpoint({
    id: `${prefix}_hhs_resolution_endpoint`,
    label: "Adult HHS improving: de-escalate only after osmolality, cognition, hydration, and precipitant stabilize",
    edgeLabel: "HHS response branch: osmolality falling safely, mental status improving, perfusion restored, electrolyte plan stable, precipitant treated, and nutrition/insulin plan ready",
    sourceIds: adaCrisis,
    criteria: criteria(`${prefix}_hhs_resolution_criteria`, "Use when HHS is improving enough to step down monitoring or transition insulin strategy.", ["vitals", "labs", "exam", "medications", "comorbidities", "workup_findings", "follow_up_access"], adaCrisis, { criteria_options: criteriaRows }),
    action: "Continue monitoring until hydration, osmolality, cognition, potassium, renal function, and precipitant are stable; transition to a sustainable diabetes regimen with education, medication affordability review, follow-up, and safety-net instructions for recurrent confusion, dehydration, vomiting, infection symptoms, chest pain, stroke symptoms, or severe hyperglycemia.",
    endpointType: "deescalation_stopping",
    guidelineCutoffs: criteriaRows
  });

  const hhsAction = actionNode({
    id: `${prefix}_hhs_action`,
    label: "Adult HHS: fluid-first high-acuity pathway with gradual osmolality correction",
    edgeLabel: "Adult HHS thresholds met: glucose >=600 mg/dL and effective osmolality >300 mOsm/kg or total osmolality >320 mOsm/kg, without significant ketoacidosis",
    sourceIds: adaCrisis,
    criteria: criteria(`${prefix}_hhs_action_criteria`, "Route here when adult HHS diagnostic thresholds are met.", ["symptoms", "vitals", "labs", "exam", "medications", "comorbidities", "workup_findings"], adaCrisis, { criteria_options: criteriaRows }),
    action: "Treat HHS as high-risk hyperosmolar crisis with fluid-first correction, potassium/renal safety, delayed or cautious insulin according to protocol, and neurologic/osmolality monitoring.",
    parallelActions: ["fluid deficit assessment", "osmolality trend", "potassium/renal safety", "mental status checks", "precipitant treatment", "transition planning"],
    guidelineCutoffs: criteriaRows,
    children: [hhsProtocolEndpoint, hhsTransitionEndpoint]
  });

  const mixedEndpoint = endpoint({
    id: `${prefix}_mixed_dka_hhs_endpoint`,
    label: "Mixed DKA/HHS: manage as high-acuity combined ketoacidotic and hyperosmolar crisis",
    edgeLabel: "Mixed crisis: DKA ketone/acidosis thresholds coexist with HHS hyperglycemia/osmolality thresholds or altered mentation",
    sourceIds: adaCrisis,
    criteria: criteria(`${prefix}_mixed_criteria`, "Use when adult patient has DKA-level ketones/acidosis plus HHS-level hyperglycemia or osmolality.", ["vitals", "labs", "exam", "medications", "comorbidities", "workup_findings"], adaCrisis, { criteria_options: criteriaRows }),
    action: "Use ICU/high-acuity protocol care, combine DKA insulin/ketone clearance with HHS fluid and osmolality precautions, monitor glucose every 1-2 h and osmolality/electrolytes/acid-base about every 4 h, and involve endocrinology/critical care when mental status, shock, renal failure, or electrolyte instability is present.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const euglycemicSpecialEndpoint = endpoint({
    id: `${prefix}_euglycemic_special_population_endpoint`,
    label: "Euglycemic DKA or special population: stop SGLT2 inhibitor and use clinician-governed fluid/insulin plan",
    edgeLabel: "Ketotic acidosis even if glucose is <200 mg/dL, or pregnancy/frailty/heart failure/advanced kidney disease/SGLT2 exposure changes standard fluid or insulin assumptions",
    sourceIds: adaCrisis,
    criteria: criteria(`${prefix}_euglycemic_special_criteria`, "Use when glucose is lower than typical DKA thresholds but ketotic acidosis or special-population risk changes treatment.", ["symptoms", "vitals", "labs", "medications", "pregnancy_status", "comorbidities", "workup_findings"], adaCrisis, { criteria_options: criteriaRows }),
    action: "Do not dismiss DKA because glucose is <200 mg/dL when SGLT2 inhibitor, pregnancy, fasting, or poor intake is present; stop SGLT2 inhibitor on admission, use dextrose-supported insulin/ketone clearance with potassium monitoring, and obtain endocrinology/obstetric/nephrology/cardiology or ICU input for pregnancy, frailty, heart failure, advanced kidney disease, or inability to monitor safely.",
    endpointType: "clinician_review_handoff",
    guidelineCutoffs: criteriaRows,
    reviewNeededReason: "Euglycemic DKA, pregnancy, SGLT2 inhibitor exposure, major cardiac/renal disease, or local insulin/fluid protocol requires clinician governance."
  });

  const noncrisisEndpoint = endpoint({
    id: `${prefix}_noncrisis_hyperglycemia_endpoint`,
    label: "Hyperglycemia without DKA/HHS: treat persistent inpatient glucose >=180 mg/dL and arrange follow-up",
    edgeLabel: "No DKA/HHS acidosis, ketone, osmolality, shock, or mental-status branch; persistent inpatient glucose >=180 mg/dL or outpatient hyperglycemia still needs diabetes plan",
    sourceIds: adaHospital,
    criteria: criteria(`${prefix}_noncrisis_criteria`, "Use when crisis thresholds are absent and the patient is stable enough for inpatient hyperglycemia or outpatient diabetes management.", ["symptoms", "vitals", "labs", "medications", "comorbidities", "workup_findings", "follow_up_access"], adaHospital, { criteria_options: criteriaRows }),
    action: "Use inpatient hyperglycemia protocol when persistent glucose is >=180 mg/dL, reconcile home diabetes medications and nutrition/insulin timing, check A1c if no reliable value in the prior 3 months, address steroid/enteral/TPN drivers, and safety-net for ketones, vomiting, dehydration, confusion, dyspnea, chest pain, infection, or rising glucose.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows
  });

  const alternateEndpoint = endpoint({
    id: `${prefix}_alternate_endpoint`,
    label: "Alternate diagnosis or mimic: route away from DKA/HHS when objective thresholds contradict crisis",
    edgeLabel: "DKA/HHS thresholds absent or another cause better explains symptoms: starvation/alcohol ketosis, lactic acidosis, renal failure, intoxication, sepsis, pancreatitis, MI/stroke, medication effect, or lab artifact",
    sourceIds: unique([...adaCrisis, ...genericSourceIds]),
    criteria: criteria(`${prefix}_alternate_criteria`, "Use an alternate pathway when adult DKA/HHS thresholds are absent or a competing diagnosis explains the abnormal data.", ["symptoms", "vitals", "labs", "imaging_results", "medications", "comorbidities", "workup_findings"], unique([...adaCrisis, ...genericSourceIds]), { criteria_options: criteriaRows }),
    action: "Document which DKA/HHS criteria are absent, treat the competing diagnosis, continue glucose/ketone/acid-base monitoring if risk persists, and hand off clinician review when metabolic acidosis or altered mental status remains unexplained.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Competing acidosis, hyperosmolarity, intoxication, infection, ischemia, or medication effect changes the active pathway."
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: "Adult hyperglycemic crisis: classify DKA, HHS, mixed crisis, euglycemic DKA, non-crisis hyperglycemia, or mimic",
    edgeLabel: "Adult hyperglycemia labs and bedside severity available for threshold routing",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Classify adult hyperglycemia using glucose, ketones, pH, bicarbonate, potassium, osmolality, mental status, pregnancy/SGLT2 status, and comorbid fluid risk.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Choose the active adult branch from DKA, HHS, mixed crisis, euglycemic/special-population DKA, non-crisis hyperglycemia, or mimic based on exact thresholds and treatment-safety data.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingCrisisDataEndpoint, dkaAction, hhsAction, mixedEndpoint, euglycemicSpecialEndpoint, noncrisisEndpoint, alternateEndpoint]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: "Adult hyperglycemia: obtain crisis labs, severity exam, medication exposure, and precipitant data together",
    edgeLabel: "Adult hyperglycemia, ketotic symptoms, dehydration, altered mentation, suspected DKA/HHS, SGLT2 exposure, or clinician-selected hyperglycemic-crisis workup",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial adult DKA/HHS assessment requires concurrent clinical severity and lab data before a non-emergency branch is selected.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Assess airway/mentation/perfusion/hydration, measure full vitals and weight, obtain glucose, beta-hydroxybutyrate or urine ketones, BMP with potassium/bicarbonate/anion gap/creatinine/corrected sodium, venous pH, osmolality when HHS is possible, ECG for potassium risk, A1c if no reliable result in prior 3 months, pregnancy status when relevant, and source-directed precipitant testing.",
    parallelActions: ["full vital signs and mental status", "glucose and ketones", "BMP with potassium/bicarbonate/anion gap/creatinine/corrected sodium", "venous pH", "osmolality when HHS possible", "ECG if potassium risk", "A1c if no reliable result in prior 3 months", "pregnancy/SGLT2/fasting review", "precipitant testing"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "Adult hyperglycemia: choose DKA/HHS urgency, potassium safety, treatment path, and disposition",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for adult hyperglycemia, suspected DKA/HHS, ketones, acidosis, hyperosmolality, altered mental status, dehydration, SGLT2 inhibitor exposure, pregnancy, or clinician-selected hyperglycemic-crisis workup.", ["selected_workup_id", "presenting_symptoms", "vitals", "labs", "problem_list_or_diagnosis", "clinician_selected_module"], sourceIds),
    action: "Route adult hyperglycemia through missing-data, DKA, HHS, mixed crisis, euglycemic/special-population, potassium safety, monitoring/transition, non-crisis, mimic, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  const activationRules = {};
  const allNodeSourceIds = [];
  const collect = (entry) => {
    allNodeSourceIds.push(...(entry.source_ids || []), ...(entry.criteria?.source_ids || []));
    if (entry.criteria) activationRules[entry.id] = entry.criteria;
    for (const child of entry.children || []) collect(child);
  };
  collect(root);
  const sourceThresholds = sourceThresholdsFromCriteria(criteriaRows);
  const localEvidenceSourceIds = sourceIdsForItems([...tests, ...redFlags, ...differentials, ...dispositions], sourceIds);
  const finalSourceIds = unique([...sourceIds, ...localEvidenceSourceIds, ...allNodeSourceIds, ...sourceThresholds.flatMap((row) => row.source_ids || [])]);

  return {
    schema: "clinical_pathway_tree_v1",
    workupId: module.id,
    workup_id: module.id,
    title: label,
    version: "4.0.0",
    status: "hand_polished_adult_dka_hhs_pathway_needs_clinician_review",
    source_ids: finalSourceIds,
    source_metadata: sourceRowsForTree(finalSourceIds, sourceById),
    provenance: {
      generated_by: "scripts/hand-polish-clinical-pathway-trees.js",
      generated_at: `${auditDate}T00:00:00.000Z`,
      update_scope: "clinical_pathway_tree_v1 only",
      source_material: "ADA 2024 adult hyperglycemic-crises consensus, ADA 2026 hospital standards, and local module evidence rows",
      review_note: "Adult DKA/HHS tree is disease-specific and threshold-cited; local insulin infusion order sets, electrolyte replacement policy, ICU criteria, and SGLT2 restart decisions require clinician governance."
    },
    source_thresholds: sourceThresholds,
    traversable_context: buildTraversableContext(module, finalSourceIds, tests, criteriaRows),
    activationRules,
    root,
    synthetic_patient_scenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_crisis_labs", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingCrisisDataEndpoint.id, expected_active_branch: missingCrisisDataEndpoint.edgeLabel },
      { scenario_id: "adult_dka_potassium_hold", major_pathway: "contraindications_special_populations", expected_endpoint_id: potassiumHoldEndpoint.id, expected_active_branch: potassiumHoldEndpoint.edgeLabel },
      { scenario_id: "adult_dka_protocol", major_pathway: "first_line_management", expected_endpoint_id: dkaProtocolEndpoint.id, expected_active_branch: dkaProtocolEndpoint.edgeLabel },
      { scenario_id: "adult_hhs_protocol", major_pathway: "escalation_emergency_actions", expected_endpoint_id: hhsProtocolEndpoint.id, expected_active_branch: hhsProtocolEndpoint.edgeLabel },
      { scenario_id: "adult_mixed_crisis", major_pathway: "severity_risk_stratification", expected_endpoint_id: mixedEndpoint.id, expected_active_branch: mixedEndpoint.edgeLabel },
      { scenario_id: "adult_hhs_osmolality_monitoring", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: hhsProtocolEndpoint.id, expected_active_branch: hhsProtocolEndpoint.edgeLabel },
      { scenario_id: "adult_hhs_deescalation_ready", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: hhsTransitionEndpoint.id, expected_active_branch: hhsTransitionEndpoint.edgeLabel },
      { scenario_id: "adult_noncrisis_hyperglycemia", major_pathway: "mimics_exclusions", expected_endpoint_id: noncrisisEndpoint.id, expected_active_branch: noncrisisEndpoint.edgeLabel },
      { scenario_id: "adult_transition_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: dkaTransitionEndpoint.id, expected_active_branch: dkaTransitionEndpoint.edgeLabel }
    ],
    audit_requirements: {
      required_domains: requiredPathwayDomains,
      hand_polished_requirements: [
        "adult DKA branch uses glucose, ketone, pH, bicarbonate, potassium, and transition thresholds",
        "adult HHS branch uses glucose and osmolality thresholds with neurologic monitoring",
        "mixed DKA/HHS and euglycemic/SGLT2/pregnancy branches do not fall through routine hyperglycemia",
        "potassium <3.5 mmol/L blocks insulin until corrected",
        "local insulin infusion, electrolyte, ICU, and SGLT2 restart policies remain clinician-governed"
      ]
    }
  };
}

function buildPediatricDkaHhsClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Pediatric DKA, HHS, or hyperglycemic crisis";
  const prefix = "pediatric_dka_hhs";
  const chq = ["CHQ_DKA_HHS_CHILD_2024"];
  const nice = ["NICE_NG18_DKA_CHILD"];
  const rch = ["RCH_DKA_CHILD"];
  const ispad = ["ISPAD_DKA_HHS_2022"];
  const sourceIds = unique([...chq, ...nice, ...rch, ...ispad, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 10);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);

  const criteriaRows = [
    criterion({
      id: "pediatric_dka_diagnostic_thresholds",
      label: "Pediatric DKA: BGL >11 mmol/L with pH <7.3 and/or bicarbonate <18 mmol/L plus moderate/large ketones; NICE uses beta-hydroxybutyrate >3 mmol/L or ketonuria ++",
      criteria_text: "Diagnose pediatric DKA when glucose is >11 mmol/L with acidosis (pH <7.3 and/or bicarbonate <18 mmol/L in CHQ; NICE uses bicarbonate <15 mmol/L) and moderate/large ketonaemia/ketonuria; NICE diagnostic criteria include beta-hydroxybutyrate >3 mmol/L or ketonuria ++ and above.",
      cutoffs: ["11 mmol/L", "pH <7.3", "bicarbonate <18 mmol/L", "bicarbonate <15 mmol/L", "beta-hydroxybutyrate >3 mmol/L"],
      data_needed: ["age", "weight", "glucose", "blood ketones", "urine ketones if blood unavailable", "venous pH", "bicarbonate", "diabetes history", "SGLT2/pregnancy/fasting context"],
      source_ids: unique([...chq, ...nice, ...ispad]),
      source_section: "Pediatric DKA recognition and diagnosis"
    }),
    criterion({
      id: "pediatric_dka_severity_thresholds",
      label: "Pediatric DKA severity: mild pH 7.2-7.3 or HCO3 <18 mmol/L; moderate pH 7.1-7.2 or HCO3 <10 mmol/L; severe pH <7.1 or HCO3 <5 mmol/L",
      criteria_text: "Classify severity by pH and bicarbonate: mild pH 7.2-7.3 or HCO3 <18 mmol/L, moderate pH 7.1-7.2 or HCO3 <10 mmol/L, severe pH <7.1 or HCO3 <5 mmol/L; children younger than 2 years or severe DKA need high-dependency/one-to-one nursing monitoring in NICE.",
      cutoffs: ["7.2-7.3", "18 mmol/L", "7.1-7.2", "10 mmol/L", "pH <7.1", "HCO3 <5 mmol/L", "2 years"],
      data_needed: ["venous pH", "bicarbonate", "age", "level of consciousness", "shock/cardiovascular status", "monitoring capacity"],
      source_ids: unique([...chq, ...nice, ...rch]),
      source_section: "Pediatric DKA severity and transfer criteria"
    }),
    criterion({
      id: "pediatric_hhs_diagnostic_thresholds",
      label: "Pediatric HHS: BGL >33.3 mmol/L, effective osmolality >320 mOsm/kg, ketones <1.1 mmol/L, and pH >7.25 and/or bicarbonate >15 mmol/L",
      criteria_text: "Classify pediatric HHS when BGL >33.3 mmol/L, effective serum osmolality >320 mOsm/kg, absent to mild ketonemia <1.1 mmol/L, and pH >7.25 and/or bicarbonate >15 mmol/L; mixed DKA/HHS requires specialist care.",
      cutoffs: ["33.3 mmol/L", "320 mOsm/kg", "1.1 mmol/L", "pH >7.25", "bicarbonate >15 mmol/L"],
      data_needed: ["glucose", "effective osmolality", "sodium", "ketones", "venous pH", "bicarbonate", "mental status", "fluid deficit"],
      source_ids: unique([...chq, ...ispad]),
      source_section: "Pediatric HHS diagnosis and management"
    }),
    criterion({
      id: "pediatric_dka_fluid_insulin_potassium",
      label: "Pediatric DKA treatment: 0.9% saline 10 mL/kg bolus over 20-30 min if moderate/severe or shock, insulin 1 hour after fluids with no bolus, potassium usually 40 mmol/L",
      criteria_text: "CHQ recommends 0.9% saline 10 mL/kg bolus over 20-30 minutes and repeat to a maximum 20 mL/kg when needed, urgent critical-care advice if shock requires two or more boluses, insulin one hour after fluids with no IV/IM bolus, ideal insulin infusion 0.1 units/kg/hr, and 40 mmol/L potassium chloride in default fluids unless hyperkalemia/anuria requires specialist advice.",
      cutoffs: ["10 mL/kg", "20-30 min", "20 mL/kg", "1 hour", "0.1 units/kg/hr", "40 mmol/L"],
      data_needed: ["weight", "shock/perfusion", "fluid boluses already given", "potassium", "urine output", "insulin start time", "cardiac monitoring"],
      source_ids: unique([...chq, ...nice, ...rch]),
      source_section: "Pediatric fluids, insulin, and potassium"
    }),
    criterion({
      id: "pediatric_dka_glucose_monitoring_transition",
      label: "Pediatric monitoring/transition: add 5% glucose when plasma glucose <14 mmol/L; if glucose <6 mmol/L continue insulin at least 0.05 units/kg/hour when ketosis persists; SC insulin 30 minutes before IV stop",
      criteria_text: "NICE recommends changing to 0.9% saline with 5% glucose and potassium when plasma glucose falls below 14 mmol/L; if glucose falls below 6 mmol/L and ketosis persists, increase glucose and continue insulin at least 0.05 units/kg/hour; start subcutaneous insulin at least 30 minutes before stopping IV insulin.",
      cutoffs: ["14 mmol/L", "6 mmol/L", "0.05 units/kg/hour", "30 minutes"],
      data_needed: ["glucose trend", "ketone trend", "oral intake", "level of consciousness", "nausea/vomiting", "subcutaneous insulin timing"],
      source_ids: nice,
      source_section: "Pediatric glucose fluids and transition"
    }),
    criterion({
      id: "pediatric_cerebral_edema_hypokalemia",
      label: "Pediatric cerebral edema/hypokalemia: neuro checks every 30 minutes if high risk; treat cerebral edema immediately with mannitol 0.5-1 g/kg or hypertonic saline 2.5-5 mL/kg over 10-15 minutes; potassium <3 mmol/L needs critical-care discussion",
      criteria_text: "NICE recommends every-30-minute consciousness/heart-rate monitoring for age under 2 years or severe DKA; suspected cerebral edema requires immediate treatment with mannitol 20% 0.5-1 g/kg over 10-15 minutes or hypertonic sodium chloride 2.7% or 3% 2.5-5 mL/kg over 10-15 minutes. If potassium is below 3 mmol/L, discuss urgent management with pediatric critical care.",
      cutoffs: ["30 minutes", "2 years", "0.5-1 g/kg", "2.5-5 mL/kg", "10-15 minutes", "potassium below 3 mmol/L"],
      data_needed: ["age", "pH", "level of consciousness", "headache/vomiting/bradycardia/rising BP", "sodium/osmolality trend", "potassium", "ECG", "critical-care access"],
      source_ids: nice,
      source_section: "Monitoring, cerebral edema, and hypokalemia"
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: pediatric DKA/HHS context",
    edgeLabel: "Missing pediatric DKA/HHS context: age, weight, diabetes history, insulin/pump access, symptoms, vitals, hydration/perfusion, mental status, pregnancy/SGLT2 exposure when relevant, and current workup findings",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when pediatric hyperglycemic-crisis activation cannot be determined from extractable context.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document age, weight, diabetes history, insulin/pump/CGM and access barriers, vomiting/intake/dehydration trajectory, full vital signs, hydration/perfusion, AVPU or modified GCS, pregnancy/SGLT2 exposure when relevant, and current glucose/ketone/pH/bicarbonate/potassium/osmolality data before selecting a non-emergency branch.",
    endpointType: "missing_data_needed",
    missingDataNeeded: contextDomains
  });

  const missingDataEndpoint = endpoint({
    id: `${prefix}_missing_crisis_data_endpoint`,
    label: "Missing data needed: pediatric glucose, ketones, acid-base, electrolytes, osmolality, neuro status, or weight",
    edgeLabel: "Cannot classify pediatric DKA, HHS, cerebral edema risk, shock route, potassium safety, or transition readiness until glucose, ketones, pH, bicarbonate, potassium, sodium/osmolality, weight, fluid balance, and neuro status are known",
    sourceIds,
    criteria: criteria(`${prefix}_missing_data_criteria`, "Route here when the exact data needed for pediatric DKA/HHS classification or treatment safety are unavailable.", contextDomains, sourceIds, { missing_any: ["age", "weight", "glucose", "blood or urine ketones", "venous pH", "bicarbonate", "potassium", "sodium/effective osmolality", "fluid boluses", "mental status"] }),
    action: "Obtain bedside glucose and blood ketones, venous pH/bicarbonate, electrolytes/urea/creatinine with sodium and potassium, effective osmolality when HHS/mixed crisis is possible, weight, strict fluid balance, AVPU/modified GCS, ECG/cardiac monitoring when potassium risk exists, and senior pediatric/endocrine advice.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["age", "weight", "glucose", "blood or urine ketones", "venous pH", "bicarbonate", "potassium", "sodium/effective osmolality", "fluid boluses", "mental status"]
  });

  const cerebralEdemaEndpoint = endpoint({
    id: `${prefix}_cerebral_edema_endpoint`,
    label: "Cerebral edema suspected: treat immediately before imaging",
    edgeLabel: "Headache, bradycardia or unexpected HR fall, rising BP, recurrent vomiting, agitation/irritability, deteriorating consciousness, respiratory pauses, oculomotor palsy, pupillary abnormality, falling sodium/osmolality, or high-risk age/severe DKA",
    sourceIds: unique([...chq, ...nice]),
    criteria: criteria(`${prefix}_cerebral_edema_criteria`, "Use whenever pediatric DKA neurologic warning signs or cerebral edema signs appear.", ["symptoms", "vitals", "exam", "labs", "workup_findings"], unique([...chq, ...nice]), { criteria_options: criteriaRows }),
    action: "Start cerebral-edema treatment immediately, raise head of bed, give high-flow oxygen, reduce fluids per specialist advice, administer mannitol 20% 0.5-1 g/kg over 10-15 minutes or hypertonic sodium chloride 2.7% or 3% 2.5-5 mL/kg over 10-15 minutes depending on availability, seek pediatric critical-care advice, and do not delay for neuroimaging.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["neurologic status every 30 minutes when high risk", "heart rate/bradycardia", "blood pressure", "sodium/osmolality trend", "oxygenation", "critical-care disposition"]
  });

  const shockBolusEndpoint = endpoint({
    id: `${prefix}_shock_bolus_endpoint`,
    label: "Shock or cardiovascular compromise: 0.9% saline bolus and urgent critical-care route",
    edgeLabel: "Shock, poor perfusion, hypotension, coma, cardiovascular compromise, or need for repeated fluid bolus; two 10 mL/kg boluses or maximum 20 mL/kg requires urgent critical-care advice",
    sourceIds: chq,
    criteria: criteria(`${prefix}_shock_bolus_criteria`, "Use when pediatric DKA/HHS presents with shock or severe perfusion compromise.", ["vitals", "exam", "labs", "workup_findings"], chq, { criteria_options: criteriaRows }),
    action: "Give 0.9% sodium chloride 10 mL/kg over 20-30 minutes for moderate/severe DKA with shock, repeat only as needed to maximum 20 mL/kg, reassess perfusion after each bolus, seek pediatric critical-care/retrieval advice when two or more boluses are required, and evaluate sepsis or other shock causes.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["perfusion", "heart rate/BP", "bolus total mL/kg", "urine output", "senior/PICU contact"]
  });

  const pediatricDkaProtocolEndpoint = endpoint({
    id: `${prefix}_dka_protocol_endpoint`,
    label: "Pediatric DKA confirmed: fluids first, no insulin bolus, potassium-safe infusion, and hourly monitoring",
    edgeLabel: "Pediatric DKA thresholds met: BGL >11 mmol/L, acidosis, and moderate/large ketones; severity and high-risk age determine monitoring location",
    sourceIds: unique([...chq, ...nice, ...rch, ...ispad]),
    criteria: criteria(`${prefix}_dka_protocol_criteria`, "Use when pediatric DKA diagnostic thresholds are met and cerebral edema/shock have been addressed.", ["symptoms", "vitals", "labs", "exam", "medications", "workup_findings"], unique([...chq, ...nice, ...rch, ...ispad]), { criteria_options: criteriaRows }),
    action: "Start pediatric DKA protocol with IV fluids before insulin, no IV or IM insulin bolus, insulin 1 hour after fluids when potassium plan is safe, usual insulin infusion 0.1 units/kg/hr, potassium-containing 0.9% saline when not hyperkalemic/anuric, hourly vitals/glucose/fluid balance/neuro status, continuous ECG in ED, and labs at 2 hours then at least every 4 hours.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["hourly glucose/vitals/fluid balance/neuro status", "continuous ECG in ED", "blood tests at 2 hours then at least every 4 hours", "ketone trend", "potassium every 2 hours in CHQ ED pathway"]
  });

  const potassiumAnuriaEndpoint = endpoint({
    id: `${prefix}_potassium_anuria_endpoint`,
    label: "Potassium danger or anuria: specialist fluid/insulin modification",
    edgeLabel: "K <3.5 mmol/L at diagnosis, potassium below 3 mmol/L during treatment, hyperkalemia, ECG changes, anuria, renal failure, or inability to monitor potassium safely",
    sourceIds: unique([...chq, ...nice]),
    criteria: criteria(`${prefix}_potassium_anuria_criteria`, "Use when potassium, urine output, ECG, or renal status changes pediatric DKA/HHS insulin and fluid safety.", ["labs", "vitals", "exam", "medications", "workup_findings"], unique([...chq, ...nice]), { criteria_options: criteriaRows }),
    action: "Use continuous cardiac monitoring, check potassium at protocol intervals, seek endocrine/critical-care advice for K <3.5 mmol/L at diagnosis or potassium below 3 mmol/L during therapy, avoid potassium-containing fluids in anuria/hyperkalemia until specialist advice, and adjust insulin only with senior direction.",
    endpointType: "clinician_review_handoff",
    guidelineCutoffs: criteriaRows,
    reviewNeededReason: "Potassium, anuria, renal impairment, ECG change, or local potassium-infusion policy changes insulin/fluid safety."
  });

  const pediatricHhsEndpoint = endpoint({
    id: `${prefix}_hhs_specialist_endpoint`,
    label: "Pediatric HHS or mixed DKA/HHS: urgent endocrine/critical-care pathway",
    edgeLabel: "Pediatric HHS thresholds: BGL >33.3 mmol/L, effective osmolality >320 mOsm/kg, ketones <1.1 mmol/L, pH >7.25 and/or bicarbonate >15 mmol/L, or mixed DKA/HHS features",
    sourceIds: unique([...chq, ...ispad]),
    criteria: criteria(`${prefix}_hhs_criteria`, "Use when pediatric HHS or mixed DKA/HHS thresholds are present.", ["vitals", "labs", "exam", "medications", "comorbidities", "workup_findings"], unique([...chq, ...ispad]), { criteria_options: criteriaRows }),
    action: "Treat as pediatric HHS/mixed crisis with urgent pediatric endocrine and critical-care advice, more aggressive but monitored fluid replacement than DKA, osmolality and corrected sodium trend monitoring, delayed/cautious insulin according to specialist guidance, VTE/rhabdomyolysis/AKI surveillance, and high-acuity disposition.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["effective osmolality", "corrected sodium", "mental status", "fluid balance", "potassium", "renal function", "rhabdomyolysis/VTE risk"]
  });

  const transitionEndpoint = endpoint({
    id: `${prefix}_transition_recurrence_endpoint`,
    label: "Pediatric DKA resolving: oral fluids, subcutaneous insulin overlap, education, and recurrence prevention",
    edgeLabel: "DKA improving: ketosis resolving, pH >=7.3, alert, no vomiting, oral fluids tolerated, and subcutaneous insulin can start at least 30 minutes before stopping IV insulin",
    sourceIds: unique([...chq, ...nice, ...rch]),
    criteria: criteria(`${prefix}_transition_criteria`, "Use when pediatric DKA is resolving and transition or discharge planning can start.", ["vitals", "labs", "exam", "medications", "workup_findings", "follow_up_access"], unique([...chq, ...nice, ...rch]), { criteria_options: criteriaRows }),
    action: "Continue IV fluids/insulin until ketosis is resolving, pH has reached 7.3, the child is alert, vomiting has stopped, and oral fluids are tolerated; start subcutaneous insulin at least 30 minutes before stopping IV insulin, or restart pump at least 60 minutes before stopping IV insulin with new cartridge/set/site, identify the precipitant, address nonadherence or access barriers, teach sick-day/ketone rules, and arrange pediatric diabetes follow-up.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["ketone resolution", "pH >=7.3", "oral intake", "SC insulin overlap at least 30 minutes", "pump overlap at least 60 minutes", "recurrence prevention"]
  });

  const glucoseFluidsEndpoint = endpoint({
    id: `${prefix}_glucose_fluids_endpoint`,
    label: "Glucose falling during DKA therapy: add dextrose and continue insulin for ketone clearance",
    edgeLabel: "Treatment glucose branch: plasma glucose <14 mmol/L needs 0.9% saline with 5% glucose and potassium; glucose <6 mmol/L with persisting ketosis needs more glucose and at least 0.05 units/kg/hour insulin",
    sourceIds: nice,
    criteria: criteria(`${prefix}_glucose_fluids_criteria`, "Use during pediatric DKA treatment when glucose falls before ketosis/acidosis has resolved.", ["labs", "medications", "workup_findings"], nice, { criteria_options: criteriaRows }),
    action: "When plasma glucose falls below 14 mmol/L, change to 0.9% sodium chloride with 5% glucose and potassium if appropriate; if glucose falls below 6 mmol/L and ketosis persists, increase glucose concentration and continue insulin at least 0.05 units/kg/hour rather than stopping ketone-clearing insulin without senior advice.",
    endpointType: "monitoring_reassessment",
    guidelineCutoffs: criteriaRows
  });

  const alternateEndpoint = endpoint({
    id: `${prefix}_alternate_endpoint`,
    label: "Alternate pediatric diagnosis or no crisis: route away from DKA/HHS only after thresholds are checked",
    edgeLabel: "DKA/HHS thresholds absent or another diagnosis better explains vomiting, abdominal pain, acidosis, dehydration, altered mental status, or hyperglycemia",
    sourceIds: unique([...chq, ...nice, ...genericSourceIds]),
    criteria: criteria(`${prefix}_alternate_criteria`, "Use an alternate pathway when pediatric DKA/HHS thresholds are absent and another diagnosis better explains the presentation.", ["symptoms", "vitals", "labs", "exam", "imaging_results", "medications", "workup_findings"], unique([...chq, ...nice, ...genericSourceIds]), { criteria_options: criteriaRows }),
    action: "Document which glucose, ketone, pH/bicarbonate, osmolality, and clinical severity criteria are absent; treat the competing diagnosis, continue repeat glucose/ketone checks if symptoms persist, and safety-net for vomiting, dehydration, Kussmaul breathing, altered mental status, rising ketones, or inability to keep fluids/insulin down.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Competing pediatric diagnosis or uncertain metabolic pattern changes the active pathway."
  });

  const dkaAction = actionNode({
    id: `${prefix}_dka_action`,
    label: "Pediatric DKA: severity, shock, potassium, glucose-fluid, and transition decisions",
    edgeLabel: "Pediatric DKA diagnostic thresholds met; classify mild/moderate/severe by pH/bicarbonate and apply age, shock, potassium, cerebral-edema, and monitoring rules",
    sourceIds: unique([...chq, ...nice, ...rch, ...ispad]),
    criteria: criteria(`${prefix}_dka_action_criteria`, "Route here when pediatric DKA diagnostic thresholds are present.", ["symptoms", "vitals", "labs", "exam", "medications", "workup_findings"], unique([...chq, ...nice, ...rch, ...ispad]), { criteria_options: criteriaRows }),
    action: "Run shock bolus, potassium/anuria safety, DKA treatment, glucose-fluid, and transition branches as concurrent pediatric protocol decisions.",
    parallelActions: ["shock/perfusion route", "potassium/anuria safety", "fluids then insulin after 1 hour", "hourly neuro/glucose/vital monitoring", "glucose-containing fluids as glucose falls", "transition/recurrence prevention"],
    guidelineCutoffs: criteriaRows,
    children: [shockBolusEndpoint, potassiumAnuriaEndpoint, pediatricDkaProtocolEndpoint, glucoseFluidsEndpoint, transitionEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: "Pediatric hyperglycemic crisis: classify DKA severity, HHS, cerebral edema, potassium hazard, transition readiness, or mimic",
    edgeLabel: "Pediatric glucose, ketone, pH/bicarbonate, electrolyte, osmolality, weight, fluid, and neurologic data available for threshold routing",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Classify pediatric DKA/HHS using age, weight, glucose, ketones, pH, bicarbonate, potassium, sodium/osmolality, shock/perfusion, mental status, and treatment response.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Choose the active pediatric branch from missing data, cerebral edema, DKA protocol, HHS/mixed crisis, glucose-fluid adjustment, transition/recurrence prevention, potassium hazard, or alternate diagnosis.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingDataEndpoint, cerebralEdemaEndpoint, dkaAction, pediatricHhsEndpoint, alternateEndpoint]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: "Pediatric hyperglycemia: obtain emergency ABCD, weight, neuro status, ketone/acid-base, electrolyte, and osmolality data together",
    edgeLabel: "Child or adolescent with hyperglycemia, ketones, vomiting, abdominal pain, dehydration, Kussmaul breathing, altered mental status, suspected DKA/HHS, pump failure, insulin omission, or clinician-selected pediatric crisis workup",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial pediatric DKA/HHS assessment requires emergency ABCD, neurologic risk, weight-based dosing data, and threshold labs before a non-emergency branch is selected.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Perform ABCD assessment, measure age/weight/full vitals, document AVPU or modified GCS, hydration/perfusion and fluid balance, obtain bedside glucose and blood ketones or urine ketones, venous pH/bicarbonate, electrolytes/urea/creatinine with sodium and potassium, effective osmolality if HHS/mixed crisis possible, ECG/cardiac monitoring for potassium risk, and senior pediatric/endocrine advice.",
    parallelActions: ["ABCD and airway protection", "age/weight/full vital signs", "AVPU or modified GCS", "hydration/perfusion/fluid balance", "glucose and ketones", "venous pH/bicarbonate", "electrolytes with sodium/potassium/renal function", "effective osmolality when HHS possible", "ECG/cardiac monitoring when potassium risk", "senior pediatric/endocrine contact"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "Pediatric DKA/HHS: choose emergency stabilization, protocol treatment, cerebral-edema route, and disposition",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for child/adolescent hyperglycemia, suspected DKA/HHS, ketones, acidosis, dehydration, Kussmaul breathing, altered mental status, shock, SGLT2/pregnancy/fasting risk, pump failure, insulin omission, or clinician-selected pediatric hyperglycemic-crisis workup.", ["selected_workup_id", "presenting_symptoms", "vitals", "labs", "problem_list_or_diagnosis", "clinician_selected_module"], sourceIds),
    action: "Route pediatric DKA/HHS through missing-data, cerebral edema, shock bolus, DKA protocol, HHS/mixed crisis, glucose-fluid adjustment, potassium/anuria review, transition, recurrence prevention, mimic, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  const activationRules = {};
  const allNodeSourceIds = [];
  const collect = (entry) => {
    allNodeSourceIds.push(...(entry.source_ids || []), ...(entry.criteria?.source_ids || []));
    if (entry.criteria) activationRules[entry.id] = entry.criteria;
    for (const child of entry.children || []) collect(child);
  };
  collect(root);
  const sourceThresholds = sourceThresholdsFromCriteria(criteriaRows);
  const localEvidenceSourceIds = sourceIdsForItems([...tests, ...redFlags, ...differentials, ...dispositions], sourceIds);
  const finalSourceIds = unique([...sourceIds, ...localEvidenceSourceIds, ...allNodeSourceIds, ...sourceThresholds.flatMap((row) => row.source_ids || [])]);

  return {
    schema: "clinical_pathway_tree_v1",
    workupId: module.id,
    workup_id: module.id,
    title: label,
    version: "4.0.0",
    status: "hand_polished_pediatric_dka_hhs_pathway_needs_clinician_review",
    source_ids: finalSourceIds,
    source_metadata: sourceRowsForTree(finalSourceIds, sourceById),
    provenance: {
      generated_by: "scripts/hand-polish-clinical-pathway-trees.js",
      generated_at: `${auditDate}T00:00:00.000Z`,
      update_scope: "clinical_pathway_tree_v1 only",
      source_material: "Children's Health Queensland 2024 DKA/HHS guideline, NICE NG18 DKA recommendations, RCH pediatric DKA guideline, ISPAD 2022 DKA/HHS guideline, and local module evidence rows",
      review_note: "Pediatric DKA/HHS tree is disease-specific and threshold-cited; local retrieval/PICU thresholds, fluid calculator/order sets, potassium infusion limits, and formulary-specific cerebral-edema medications require clinician governance."
    },
    source_thresholds: sourceThresholds,
    traversable_context: buildTraversableContext(module, finalSourceIds, tests, criteriaRows),
    activationRules,
    root,
    synthetic_patient_scenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_pediatric_crisis_data", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingDataEndpoint.id, expected_active_branch: missingDataEndpoint.edgeLabel },
      { scenario_id: "pediatric_cerebral_edema", major_pathway: "escalation_emergency_actions", expected_endpoint_id: cerebralEdemaEndpoint.id, expected_active_branch: cerebralEdemaEndpoint.edgeLabel },
      { scenario_id: "pediatric_dka_shock", major_pathway: "red_flags_instability", expected_endpoint_id: shockBolusEndpoint.id, expected_active_branch: shockBolusEndpoint.edgeLabel },
      { scenario_id: "pediatric_dka_protocol", major_pathway: "first_line_management", expected_endpoint_id: pediatricDkaProtocolEndpoint.id, expected_active_branch: pediatricDkaProtocolEndpoint.edgeLabel },
      { scenario_id: "pediatric_hhs_mixed", major_pathway: "severity_risk_stratification", expected_endpoint_id: pediatricHhsEndpoint.id, expected_active_branch: pediatricHhsEndpoint.edgeLabel },
      { scenario_id: "pediatric_potassium_anuria", major_pathway: "contraindications_special_populations", expected_endpoint_id: potassiumAnuriaEndpoint.id, expected_active_branch: potassiumAnuriaEndpoint.edgeLabel },
      { scenario_id: "pediatric_glucose_fluid_reassessment", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: glucoseFluidsEndpoint.id, expected_active_branch: glucoseFluidsEndpoint.edgeLabel },
      { scenario_id: "pediatric_deescalation_transition", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: transitionEndpoint.id, expected_active_branch: transitionEndpoint.edgeLabel },
      { scenario_id: "pediatric_alternate_mimic", major_pathway: "mimics_exclusions", expected_endpoint_id: alternateEndpoint.id, expected_active_branch: alternateEndpoint.edgeLabel },
      { scenario_id: "pediatric_transition_recurrence", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: transitionEndpoint.id, expected_active_branch: transitionEndpoint.edgeLabel }
    ],
    audit_requirements: {
      required_domains: requiredPathwayDomains,
      hand_polished_requirements: [
        "pediatric DKA branch uses glucose, ketone, pH, bicarbonate, age, shock, fluid, insulin, and potassium thresholds",
        "pediatric HHS branch uses glucose, ketone, pH/bicarbonate, and osmolality thresholds",
        "cerebral-edema branch includes immediate treatment doses and avoids imaging delay",
        "glucose-fluid and transition branches include dextrose, insulin-continuation, and subcutaneous overlap thresholds",
        "local retrieval/PICU, fluid calculator, potassium infusion, and formulary policies remain clinician-governed"
      ]
    }
  };
}

function buildAdrenalInsufficiencyClinicalPathwayTree(module, sourceById) {
  const label = module.label || (module.id === "addisons_disease_v1" ? "Addison's disease" : "Adrenal insufficiency");
  const prefix = module.id === "addisons_disease_v1" ? "addisons_disease" : "adrenal_insufficiency";
  const adrenal = ["ES_ADRENAL_INSUFFICIENCY_2016"];
  const sourceIds = unique([...adrenal, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 10);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 5, ["treatmentOptions"]);

  const criteriaRows = [
    criterion({
      id: "adrenal_crisis_immediate_hydrocortisone",
      label: "Adrenal crisis or severe suspected adrenal insufficiency: give hydrocortisone before laboratory confirmation",
      criteria_text: "Severe adrenal insufficiency symptoms or adrenal crisis require immediate IV or IM hydrocortisone at stress dose before diagnostic results are available.",
      cutoffs: ["100 mg", "200 mg/24 hours", "50 mg/m2", "50-100 mg/m2"],
      data_needed: ["shock or severe hypotension", "vomiting or inability to take oral steroids", "altered mental status", "hypoglycemia", "hyponatremia", "hyperkalemia", "fever/infection or major stress", "current steroid exposure"],
      source_ids: adrenal,
      source_section: "Adrenal crisis treatment and prevention recommendations 1.3 and 4.1"
    }),
    criterion({
      id: "cosyntropin_confirmation_primary_ai",
      label: "Confirm adrenal insufficiency when stable: 250 mcg cosyntropin with peak cortisol below 18 ug/dL at 30 or 60 minutes",
      criteria_text: "The standard-dose corticotropin stimulation test uses 250 mcg in adults and children 2 years or older; peak cortisol below 500 nmol/L or 18 ug/dL at 30 or 60 minutes indicates adrenal insufficiency, with assay dependence.",
      cutoffs: ["250 mcg", "age >=2 years", "peak cortisol <18 ug/dL", "500 nmol/L", "30 minutes", "60 minutes"],
      data_needed: ["baseline cortisol", "cosyntropin dose", "30-minute cortisol", "60-minute cortisol", "assay-specific cutoff", "age"],
      source_ids: adrenal,
      source_section: "Diagnostic recommendation 2.1"
    }),
    criterion({
      id: "morning_cortisol_acth_preliminary_primary_ai",
      label: "If cosyntropin cannot be done: morning cortisol below 5 ug/dL with ACTH supports preliminary adrenal insufficiency diagnosis",
      criteria_text: "When corticotropin stimulation is not feasible, morning cortisol below 140 nmol/L or 5 ug/dL with ACTH is a preliminary test until confirmatory testing is available.",
      cutoffs: ["morning cortisol <5 ug/dL", "140 nmol/L"],
      data_needed: ["8 AM or morning cortisol", "plasma ACTH drawn with cortisol", "acute illness status", "exogenous steroid use", "assay method"],
      source_ids: adrenal,
      source_section: "Diagnostic recommendation 2.3"
    }),
    criterion({
      id: "primary_ai_acth_renin_aldosterone",
      label: "Primary adrenal insufficiency pattern: confirmed cortisol deficiency plus ACTH greater than 2-fold ULN and mineralocorticoid assessment",
      criteria_text: "In confirmed cortisol deficiency, plasma ACTH greater than 2-fold the upper limit of the reference range is consistent with primary adrenal insufficiency; renin and aldosterone should be measured to determine mineralocorticoid deficiency.",
      cutoffs: ["ACTH >2-fold ULN"],
      data_needed: ["plasma ACTH", "ACTH assay ULN", "renin", "aldosterone", "sodium", "potassium", "volume status", "21-hydroxylase antibodies or etiology workup"],
      source_ids: adrenal,
      source_section: "Diagnostic recommendations 2.4-2.6"
    }),
    criterion({
      id: "adult_glucocorticoid_replacement_range",
      label: "Adult chronic glucocorticoid replacement: hydrocortisone 15-25 mg/day or prednisolone 3-5 mg/day",
      criteria_text: "Confirmed primary adrenal insufficiency should receive hydrocortisone 15-25 mg/day or cortisone acetate 20-35 mg/day in divided doses; prednisolone 3-5 mg/day once or twice daily is an alternative and dexamethasone is discouraged.",
      cutoffs: ["15-25 mg", "20-35 mg", "3-5 mg/day"],
      data_needed: ["confirmed adrenal insufficiency", "current glucocorticoid regimen", "weight", "postural blood pressure", "energy level", "Cushingoid signs", "adherence/access"],
      source_ids: adrenal,
      source_section: "Adult glucocorticoid replacement recommendations 3.1-3.6"
    }),
    criterion({
      id: "adult_mineralocorticoid_replacement_range",
      label: "Confirmed aldosterone deficiency: fludrocortisone 50-100 mcg/day and do not restrict salt",
      criteria_text: "Adults with primary adrenal insufficiency and confirmed aldosterone deficiency should receive fludrocortisone starting dose 50-100 mcg/day, avoid salt restriction, and be monitored by clinical assessment and electrolytes.",
      cutoffs: ["50-100 mcg/day"],
      data_needed: ["aldosterone deficiency", "renin", "aldosterone", "blood pressure", "postural symptoms", "salt craving", "edema", "sodium", "potassium"],
      source_ids: adrenal,
      source_section: "Mineralocorticoid replacement recommendations 3.7-3.10"
    }),
    criterion({
      id: "pregnancy_child_perioperative_adrenal_stress",
      label: "Pregnancy, children, labor, or major stress require endocrine dosing review and stress-dose planning",
      criteria_text: "Pregnancy requires at least one review per trimester, hydrocortisone preference, third-trimester dose adjustment when clinically needed, and labor dosing like major surgical stress; children use body-surface-area dosing, and major stress uses parenteral hydrocortisone protocols.",
      cutoffs: ["1 review per trimester", "third trimester", "8 mg/m2", "100 mcg/day", "100 mg", "200 mg/24 hours"],
      data_needed: ["pregnancy status", "gestational age", "labor/surgery/trauma status", "age", "body surface area", "pediatric/adult pathway fit", "current oral steroid dose"],
      source_ids: adrenal,
      source_section: "Pregnancy, childhood, and adrenal crisis recommendations 3.14-4.6"
    }),
    criterion({
      id: "adrenal_followup_and_emergency_prevention",
      label: "Crisis prevention: sick-day education, steroid emergency card, medical alert ID, injection kit, and endocrine follow-up at least annually",
      criteria_text: "Adrenal insufficiency management includes education on glucocorticoid adjustment during stress, parenteral self or lay emergency dosing, steroid emergency card, medical alert identification, injection kit, and endocrine follow-up at least annually.",
      cutoffs: ["at least annually", "3 to 4 months"],
      data_needed: ["sick-day rules understood", "emergency injection kit available", "medical alert ID", "steroid card", "last endocrine follow-up", "recent crisis or hospitalization"],
      source_ids: adrenal,
      source_section: "Adrenal crisis prevention and monitoring recommendations 4.3-5.1"
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: `Missing data needed: ${label} crisis risk and diagnostic context`,
    edgeLabel: "Missing exact adrenal data: vitals, volume status, glucose, sodium, potassium, cortisol/ACTH testing, steroid exposure, illness stress, pregnancy status, and current replacement plan",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when adrenal crisis risk, diagnostic status, medication exposure, or replacement-safety information cannot be extracted.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document full vital signs including postural blood pressure when safe, mental status, hydration/perfusion, glucose, sodium, potassium, bicarbonate/renal function, cortisol/ACTH or cosyntropin status, renin/aldosterone when primary disease is possible, exogenous steroid exposure, acute illness or surgery stress, pregnancy status, and current steroid/mineralocorticoid access.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["blood pressure and postural symptoms", "mental status and perfusion", "glucose", "sodium", "potassium", "morning cortisol/ACTH or cosyntropin status", "renin/aldosterone if primary disease possible", "current/recent glucocorticoids", "pregnancy/labor/surgery/infection status"]
  });

  const missingAdrenalDataEndpoint = endpoint({
    id: `${prefix}_missing_adrenal_testing_endpoint`,
    label: "Missing data needed: cortisol, ACTH, cosyntropin, electrolytes, or steroid exposure",
    edgeLabel: "Cannot separate crisis, primary adrenal insufficiency, central adrenal insufficiency, steroid withdrawal, or mimic until cortisol/ACTH timing, cosyntropin result, Na/K/glucose, and recent glucocorticoid exposure are known",
    sourceIds,
    criteria: criteria(`${prefix}_missing_adrenal_testing_criteria`, "Route here when adrenal insufficiency cannot be classified because exact endocrine or safety data are unavailable.", contextDomains, sourceIds, { missing_any: ["8 AM or morning cortisol", "ACTH", "cosyntropin dose and 30/60-minute cortisol", "sodium", "potassium", "glucose", "recent glucocorticoid exposure"] }),
    action: "Obtain paired morning cortisol and ACTH when stable, perform 250 mcg cosyntropin testing with 30- and/or 60-minute cortisol when circumstances allow, check sodium, potassium, glucose, bicarbonate, creatinine, current and recent glucocorticoids, and add renin/aldosterone and 21-hydroxylase antibody testing when primary adrenal insufficiency is suspected.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["8 AM or morning cortisol", "plasma ACTH", "250 mcg cosyntropin 30- or 60-minute cortisol", "sodium", "potassium", "glucose", "renal function/bicarbonate", "recent glucocorticoid exposure", "renin and aldosterone when primary disease is possible"]
  });

  const crisisEndpoint = endpoint({
    id: `${prefix}_adrenal_crisis_endpoint`,
    label: "Adrenal crisis or severe suspected adrenal insufficiency: hydrocortisone, isotonic fluid, dextrose when needed, and monitored care",
    edgeLabel: "Severe branch: shock, marked hypotension, dehydration, vomiting, altered mental status, hypoglycemia, severe hyponatremia/hyperkalemia, infection, trauma, surgery, labor, or missed steroids",
    sourceIds: adrenal,
    criteria: criteria(`${prefix}_crisis_criteria`, "Use when severe adrenal insufficiency symptoms or adrenal crisis features are present or treatment cannot wait for endocrine testing.", ["symptoms", "exam", "vitals", "labs", "medications", "pregnancy_status", "workup_findings"], adrenal, { criteria_options: criteriaRows }),
    action: "Draw cortisol and ACTH first only if this does not delay care, then give hydrocortisone 100 mg IV or IM immediately, provide isotonic saline with dextrose if hypoglycemia is present or intake is poor, continue hydrocortisone 200 mg over 24 hours by infusion or 50 mg every 6 hours, correct potassium/glucose abnormalities, treat the precipitating illness, and use ED/admission/ICU monitoring according to hemodynamics.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["blood pressure/MAP and perfusion", "mental status", "glucose", "sodium and potassium", "fluid balance", "infection or surgical source", "hydrocortisone dosing clock"]
  });

  const primaryConfirmedEndpoint = endpoint({
    id: `${prefix}_primary_confirmed_endpoint`,
    label: "Primary adrenal insufficiency confirmed or highly likely: replace glucocorticoid and mineralocorticoid axes",
    edgeLabel: "Confirmed/likely primary pattern: cosyntropin peak cortisol below 18 ug/dL, morning cortisol below 5 ug/dL when stimulation cannot be done, ACTH above 2-fold ULN, or aldosterone deficiency with high renin",
    sourceIds: adrenal,
    criteria: criteria(`${prefix}_primary_confirmed_criteria`, "Use when primary adrenal insufficiency is confirmed or strongly likely after crisis stabilization.", ["labs", "vitals", "medications", "workup_findings"], adrenal, { criteria_options: criteriaRows }),
    action: "Start chronic replacement after stabilization: hydrocortisone 15-25 mg/day in 2 or 3 divided oral doses, or prednisolone 3-5 mg/day when appropriate; avoid dexamethasone for routine replacement, add fludrocortisone 50-100 mcg/day when aldosterone deficiency is confirmed, avoid salt restriction, and document etiology testing such as 21-hydroxylase antibodies when autoimmune Addison's disease is possible.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["postural blood pressure", "weight and energy level", "salt craving or edema", "sodium", "potassium", "renin/aldosterone trend", "signs of glucocorticoid excess"]
  });

  const borderlineEndpoint = endpoint({
    id: `${prefix}_borderline_assay_review_endpoint`,
    label: "Borderline cortisol or assay-dependent result: endocrine review before excluding adrenal insufficiency",
    edgeLabel: "Indeterminate branch: cortisol timing uncertain, cosyntropin cutoff differs by assay, acute illness alters interpretation, exogenous steroids interfere, or ACTH/mineralocorticoid pattern is discordant",
    sourceIds: adrenal,
    criteria: criteria(`${prefix}_borderline_assay_criteria`, "Use when cortisol/ACTH/cosyntropin data are incomplete, assay-dependent, discordant, or affected by acute illness or steroid exposure.", ["labs", "medications", "comorbidities", "pregnancy_status", "workup_findings"], adrenal, { criteria_options: criteriaRows }),
    action: "Do not stop stress-dose treatment if the patient is unstable. For stable patients, repeat or complete paired morning cortisol/ACTH, document the assay-specific stimulated cortisol threshold, review recent glucocorticoids or estrogen effects, and obtain endocrinology input before labeling adrenal insufficiency absent.",
    endpointType: "clinician_review_handoff",
    guidelineCutoffs: criteriaRows,
    reviewNeededReason: "Assay-specific cortisol thresholds, acute illness physiology, or steroid interference can change interpretation."
  });

  const mimicEndpoint = endpoint({
    id: `${prefix}_mimic_exclusion_endpoint`,
    label: "Mimic or competing adrenal pattern: route to the more specific diagnosis after crisis is excluded",
    edgeLabel: "Adrenal thresholds do not fit or another cause better explains hypotension, electrolyte changes, weight loss, hyperpigmentation, vomiting, fatigue, or hypoglycemia",
    sourceIds: sourceIdsForItems(differentials, sourceIds),
    criteria: criteria(`${prefix}_mimic_criteria`, "Use when the cortisol/ACTH/mineralocorticoid pattern does not support this adrenal pathway or a competing diagnosis is more likely.", ["symptoms", "exam", "vitals", "labs", "medications", "comorbidities", "workup_findings"], sourceIdsForItems(differentials, sourceIds), { criteria_options: criteriaRows }),
    action: `Document which adrenal data do not support ${label}, then route to the competing pathway such as exogenous glucocorticoid withdrawal, central adrenal insufficiency, sepsis/dehydration, renal disease, medication-related hyperkalemia or hyponatremia, gastrointestinal illness, thyroid disease, or other endocrine emergency.`,
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "A competing diagnosis or central-vs-primary adrenal pattern changes treatment sequencing."
  });

  const specialPopulationEndpoint = endpoint({
    id: `${prefix}_special_population_endpoint`,
    label: "Pregnancy, child, labor, surgery, or major stress: endocrine-governed dosing branch",
    edgeLabel: "Modifier branch: pregnancy, third trimester symptoms, active labor, child/adolescent dosing, surgery/anesthesia, trauma, ICU illness, or inability to use the local stress-dose protocol",
    sourceIds: adrenal,
    criteria: criteria(`${prefix}_special_population_criteria`, "Use when pregnancy, pediatric status, labor, major surgery, trauma, or local perioperative policy changes replacement or stress-dose decisions.", ["demographics", "pregnancy_status", "medications", "vitals", "labs", "workup_findings"], adrenal, { criteria_options: criteriaRows }),
    action: "Use clinician review for dosing details: pregnancy needs at least one review per trimester and hydrocortisone preference; active labor or major surgery uses major-stress hydrocortisone dosing; children require body-surface-area dosing such as hydrocortisone 8 mg/m2/day for chronic primary adrenal insufficiency and 50 mg/m2 initial crisis dosing; local order sets should define perioperative taper and monitoring.",
    endpointType: "clinician_review_handoff",
    guidelineCutoffs: criteriaRows,
    reviewNeededReason: "Pregnancy, pediatric body-surface dosing, and perioperative protocols require local endocrine governance."
  });

  const monitoringEndpoint = endpoint({
    id: `${prefix}_monitoring_reassessment_endpoint`,
    label: "Adrenal therapy monitoring: reassess hemodynamics, electrolytes, glucose, volume, and steroid adverse effects",
    edgeLabel: "After hydrocortisone or chronic replacement: hypotension, glucose, sodium, potassium, edema, salt craving, weight, energy, infection source, or oral intake still needs active reassessment",
    sourceIds: adrenal,
    criteria: criteria(`${prefix}_monitoring_criteria`, "Use after acute or chronic adrenal treatment decisions to confirm physiologic response and medication safety.", ["symptoms", "exam", "vitals", "labs", "medications", "workup_findings"], adrenal, { criteria_options: criteriaRows }),
    action: "Trend blood pressure including postural symptoms, perfusion, glucose, sodium, potassium, renal function, weight, edema/salt craving, energy level, infection or stressor control, oral intake, and signs of glucocorticoid excess; escalate care if hypotension, hypoglycemia, electrolyte instability, vomiting, or mental-status changes persist.",
    endpointType: "monitoring_reassessment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["blood pressure and postural symptoms", "glucose", "sodium", "potassium", "renal function/fluid balance", "edema or salt craving", "mental status", "oral intake and precipitating stressor"]
  });

  const transitionEndpoint = endpoint({
    id: `${prefix}_transition_safety_endpoint`,
    label: "Adrenal crisis resolving: transition to oral regimen, emergency kit, and sick-day safety plan",
    edgeLabel: "Improving branch: hemodynamics stable, glucose/electrolytes improving, precipitating illness controlled, oral intake possible, and outpatient steroid access confirmed",
    sourceIds: adrenal,
    criteria: criteria(`${prefix}_transition_criteria`, "Use when adrenal crisis physiology has resolved enough to move from parenteral stress dosing to a documented oral and safety-net plan.", ["vitals", "labs", "medications", "follow_up_access", "workup_findings"], adrenal, { criteria_options: criteriaRows }),
    action: "Taper from hydrocortisone 200 mg/24 hours to an oral physiologic regimen only when stable and eating, restart or initiate mineralocorticoid replacement when primary aldosterone deficiency applies, provide sick-day rules, emergency injection kit, steroid emergency card or medical alert ID, confirm medication access, assign endocrine follow-up at least annually, and give return precautions for vomiting, fever, syncope, severe weakness, confusion, or inability to keep steroids down.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["oral steroid access", "fludrocortisone need", "sick-day rule comprehension", "emergency injection kit", "medical alert ID", "follow-up date", "return precautions"]
  });

  const chronicAction = actionNode({
    id: `${prefix}_chronic_replacement_action`,
    label: "Confirmed adrenal insufficiency: combine glucocorticoid plan, mineralocorticoid decision, monitoring, and crisis prevention",
    edgeLabel: "Stable confirmed/likely branch: crisis excluded or treated, cortisol deficiency established, primary-vs-central pattern reviewed, and replacement plan can be made",
    sourceIds,
    criteria: criteria(`${prefix}_chronic_replacement_criteria`, "Route stable confirmed or highly likely adrenal insufficiency to replacement, mineralocorticoid assessment, monitoring, and safety education together.", ["labs", "vitals", "medications", "comorbidities", "pregnancy_status", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Address chronic replacement, fludrocortisone need, special-population modifiers, follow-up, and emergency prevention as one plan.",
    parallelActions: ["hydrocortisone or prednisolone regimen", "renin/aldosterone and fludrocortisone decision", "pregnancy/pediatric/surgery dosing review", "clinical and electrolyte monitoring", "sick-day rules and emergency kit"],
    guidelineCutoffs: criteriaRows,
    children: [primaryConfirmedEndpoint, specialPopulationEndpoint, monitoringEndpoint, transitionEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: `${label}: choose crisis treatment, endocrine confirmation, replacement, mimic, or review branch`,
    edgeLabel: "Adrenal vitals, cortisol/ACTH or cosyntropin data, electrolytes, steroid exposure, renin/aldosterone status, and stress/pregnancy modifiers are available for routing",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Classify adrenal urgency and replacement needs using hemodynamics, cortisol/ACTH testing, cosyntropin response, sodium, potassium, glucose, steroid exposure, renin/aldosterone status, and special-population modifiers.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Choose from adrenal crisis treatment, missing endocrine data, primary adrenal insufficiency replacement, borderline assay review, special-population review, monitoring/transition, or competing diagnosis.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingAdrenalDataEndpoint, crisisEndpoint, chronicAction, borderlineEndpoint, mimicEndpoint]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: `${label}: assess crisis physiology and endocrine confirmation data together`,
    edgeLabel: "Patient has hypotension, volume depletion, vomiting, fatigue/weight loss, hyperpigmentation, hypoglycemia, hyponatremia, hyperkalemia, suspected steroid withdrawal, autoimmune Addison's disease, or clinician-selected adrenal evaluation",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial adrenal assessment requires immediate crisis screen plus paired endocrine and electrolyte data when the patient is stable enough for testing.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Check ABCs, full vitals, postural blood pressure when safe, mental status, hydration/perfusion, glucose, sodium, potassium, bicarbonate, renal function, current/recent glucocorticoids, infection/surgery/labor stress, and pregnancy status; if stable, obtain paired morning cortisol/ACTH, cosyntropin testing, and renin/aldosterone plus etiology testing when primary disease is possible.",
    parallelActions: ["ABCs and hemodynamic assessment", "glucose/electrolytes/renal function", "current and recent steroid exposure", "paired morning cortisol and ACTH when stable", "250 mcg cosyntropin with 30/60-minute cortisol when feasible", "renin/aldosterone and 21-hydroxylase antibodies when primary disease suspected", "pregnancy/labor/surgery/infection stress assessment"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: `${label}: route by adrenal crisis physiology, cortisol confirmation, replacement needs, and safety planning`,
    sourceIds,
    criteria: criteria(`${prefix}_activate`, `Activate for suspected ${label}, adrenal crisis concern, Addison's disease history, glucocorticoid withdrawal, unexplained hypotension, hyponatremia, hyperkalemia, hypoglycemia, vomiting, hyperpigmentation, autoimmune adrenal disease, or clinician-chosen adrenal evaluation.`, ["selected_workup_id", "presenting_symptoms", "vitals", "labs", "problem_list_or_diagnosis", "clinician_selected_module"], sourceIds),
    action: `Route ${label} through crisis treatment, cortisol/ACTH/cosyntropin confirmation, primary-vs-central pattern review, glucocorticoid and mineralocorticoid replacement, special-population dosing, monitoring, transition, follow-up, and sick-day safety endpoints.`,
    children: [missingContextEndpoint, initialAssessment]
  });

  const activationRules = {};
  const allNodeSourceIds = [];
  const collect = (entry) => {
    allNodeSourceIds.push(...(entry.source_ids || []), ...(entry.criteria?.source_ids || []));
    if (entry.criteria) activationRules[entry.id] = entry.criteria;
    for (const child of entry.children || []) collect(child);
  };
  collect(root);
  const sourceThresholds = sourceThresholdsFromCriteria(criteriaRows);
  const localEvidenceSourceIds = sourceIdsForItems([...tests, ...redFlags, ...differentials, ...dispositions], sourceIds);
  const finalSourceIds = unique([...sourceIds, ...localEvidenceSourceIds, ...allNodeSourceIds, ...sourceThresholds.flatMap((row) => row.source_ids || [])]);

  return {
    schema: "clinical_pathway_tree_v1",
    workupId: module.id,
    workup_id: module.id,
    title: label,
    version: "4.0.0",
    status: "hand_polished_adrenal_insufficiency_pathway_needs_clinician_review",
    source_ids: finalSourceIds,
    source_metadata: sourceRowsForTree(finalSourceIds, sourceById),
    provenance: {
      generated_by: "scripts/hand-polish-clinical-pathway-trees.js",
      generated_at: `${auditDate}T00:00:00.000Z`,
      update_scope: "clinical_pathway_tree_v1 only",
      source_material: "Endocrine Society 2016 Primary Adrenal Insufficiency guideline and local module evidence rows",
      review_note: "Adrenal insufficiency/Addison's tree is threshold-cited and patient-traversable; local perioperative order sets, pediatric body-surface dosing details, assay-specific cortisol cutoffs, formulary substitutions, and pregnancy care pathways require clinician governance."
    },
    source_thresholds: sourceThresholds,
    traversable_context: buildTraversableContext(module, finalSourceIds, tests, criteriaRows),
    activationRules,
    root,
    synthetic_patient_scenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_adrenal_testing", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingAdrenalDataEndpoint.id, expected_active_branch: missingAdrenalDataEndpoint.edgeLabel },
      { scenario_id: "adrenal_crisis", major_pathway: "escalation_emergency_actions", expected_endpoint_id: crisisEndpoint.id, expected_active_branch: crisisEndpoint.edgeLabel },
      { scenario_id: "primary_ai_replacement", major_pathway: "first_line_management", expected_endpoint_id: primaryConfirmedEndpoint.id, expected_active_branch: primaryConfirmedEndpoint.edgeLabel },
      { scenario_id: "primary_ai_severity_pattern", major_pathway: "severity_risk_stratification", expected_endpoint_id: primaryConfirmedEndpoint.id, expected_active_branch: primaryConfirmedEndpoint.edgeLabel },
      { scenario_id: "borderline_cortisol_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: borderlineEndpoint.id, expected_active_branch: borderlineEndpoint.edgeLabel },
      { scenario_id: "mimic_or_central_pattern", major_pathway: "mimics_exclusions", expected_endpoint_id: mimicEndpoint.id, expected_active_branch: mimicEndpoint.edgeLabel },
      { scenario_id: "monitoring_after_replacement", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: monitoringEndpoint.id, expected_active_branch: monitoringEndpoint.edgeLabel },
      { scenario_id: "crisis_transition", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: transitionEndpoint.id, expected_active_branch: transitionEndpoint.edgeLabel },
      { scenario_id: "followup_sick_day_safety", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: transitionEndpoint.id, expected_active_branch: transitionEndpoint.edgeLabel }
    ],
    audit_requirements: {
      required_domains: requiredPathwayDomains,
      hand_polish_requirements: [
        "crisis branch gives hydrocortisone 100 mg immediately and 200 mg/24 hours continuation",
        "diagnostic branch includes 250 mcg cosyntropin, 30/60-minute peak cortisol below 18 ug/dL, morning cortisol below 5 ug/dL fallback, and ACTH greater than 2-fold ULN",
        "replacement branch includes hydrocortisone 15-25 mg/day, prednisolone 3-5 mg/day alternative, and fludrocortisone 50-100 mcg/day when aldosterone deficient",
        "pregnancy, pediatric, labor, perioperative, assay-specific, and local-protocol items route to clinician review",
        "transition endpoint includes sick-day rules, emergency injection kit, steroid card/medical alert, follow-up, and return precautions"
      ]
    }
  };
}

function buildHypopituitarismClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Hypopituitarism";
  const prefix = "hypopituitarism";
  const hypopit = ["ES_HYPOPITUITARISM_2016"];
  const adrenal = ["ES_ADRENAL_INSUFFICIENCY_2016"];
  const sourceIds = unique([...hypopit, ...adrenal, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 10);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 5, ["treatmentOptions"]);

  const criteriaRows = [
    criterion({
      id: "central_ai_morning_cortisol_bands",
      label: "Central adrenal insufficiency: 8-9 AM cortisol below 3 ug/dL supports diagnosis; above 15 ug/dL usually excludes it",
      criteria_text: "Endocrine Society hypopituitarism guidance recommends 8-9 AM serum cortisol as first-line testing for central adrenal insufficiency; cortisol below 3 ug/dL indicates adrenal insufficiency and above 15 ug/dL likely excludes it.",
      cutoffs: ["8-9 AM", "cortisol <3 ug/dL", "cortisol >15 ug/dL"],
      data_needed: ["8-9 AM cortisol", "recent glucocorticoid exposure", "acute illness status", "ACTH if primary/central distinction needed", "assay method"],
      source_ids: hypopit,
      source_section: "Central adrenal insufficiency diagnostic recommendations"
    }),
    criterion({
      id: "central_ai_stimulation_indeterminate",
      label: "Central adrenal insufficiency: dynamic testing when morning cortisol is 3-15 ug/dL",
      criteria_text: "When morning cortisol is between 3 and 15 ug/dL, dynamic adrenal testing is used; peak cortisol below 18.1 ug/dL at 30 or 60 minutes indicates adrenal insufficiency, with assay dependence.",
      cutoffs: ["3-15 ug/dL", "peak cortisol <18.1 ug/dL", "30 minutes", "60 minutes"],
      data_needed: ["8-9 AM cortisol", "cosyntropin or dynamic test result", "30-minute cortisol", "60-minute cortisol", "assay-specific cutoff", "recent pituitary insult timing"],
      source_ids: hypopit,
      source_section: "Central adrenal insufficiency diagnostic recommendations"
    }),
    criterion({
      id: "suspected_secondary_adrenal_crisis",
      label: "Suspected secondary adrenal crisis: immediate hydrocortisone 50-100 mg",
      criteria_text: "Patients suspected of adrenal crisis due to secondary adrenal insufficiency should receive immediate parenteral hydrocortisone 50-100 mg.",
      cutoffs: ["50-100 mg"],
      data_needed: ["shock or severe hypotension", "vomiting or inability to take oral steroids", "altered mental status", "hyponatremia", "hypoglycemia", "pituitary disease history", "current steroid replacement"],
      source_ids: hypopit,
      source_section: "Central adrenal insufficiency replacement recommendations"
    }),
    criterion({
      id: "central_hypothyroidism_free_t4_sequence",
      label: "Central hypothyroidism: evaluate adrenal insufficiency before levothyroxine and titrate by free T4, not TSH",
      criteria_text: "Patients with central hypothyroidism should be evaluated for adrenal insufficiency before L-T4 therapy; if adrenal evaluation cannot be completed, empiric glucocorticoid therapy is recommended before starting L-T4. L-T4 dosing is adjusted to avoid low or elevated free T4 levels because TSH is unreliable.",
      cutoffs: ["free T4 below reference range", "free T4 within target range"],
      data_needed: ["free T4", "TSH", "morning cortisol or adrenal testing", "current glucocorticoid replacement", "pregnancy or estrogen therapy", "cardiac risk"],
      source_ids: hypopit,
      source_section: "Central hypothyroidism and hormone interaction recommendations"
    }),
    criterion({
      id: "desmopressin_di_sodium_safety",
      label: "Central diabetes insipidus: individualized DDAVP with deliberate polyuria periods and sodium monitoring when adipsic",
      criteria_text: "DDAVP schedules for diabetes insipidus should be individualized; patients must be educated about overdose and hyponatremia risk, should periodically experience a phase of polyuria at least weekly, and adipsic DI requires frequent weighing and serum sodium monitoring.",
      cutoffs: ["at least weekly"],
      data_needed: ["polyuria/nocturia", "serum sodium", "urine output", "urine osmolality or specific gravity", "thirst/adipsia", "DDAVP schedule", "weight trend", "postoperative status"],
      source_ids: hypopit,
      source_section: "Diabetes insipidus recommendations 2.15-2.18"
    }),
    criterion({
      id: "growth_hormone_replacement_starting_doses",
      label: "Adult GH deficiency replacement: start 0.2-0.4 mg/day if age below 60 and 0.1-0.2 mg/day if age above 60",
      criteria_text: "Adults with proven growth hormone deficiency and no contraindications can receive GH replacement starting at 0.2-0.4 mg/day when younger than 60 years and 0.1-0.2 mg/day when older than 60 years, titrated to keep IGF-1 below the upper limit of normal and reduced for side effects.",
      cutoffs: ["0.2-0.4 mg/day", "age <60 years", "0.1-0.2 mg/day", "age >60 years", "IGF-1 below ULN"],
      data_needed: ["proven GH deficiency", "age", "IGF-1 and assay ULN", "active malignancy/tumor status", "side effects", "glucose status", "current estrogen therapy"],
      source_ids: hypopit,
      source_section: "Growth hormone deficiency recommendations 2.11-2.14"
    }),
    criterion({
      id: "pituitary_replacement_interactions",
      label: "Hormone interaction safety: GH can unmask central hypothyroidism and glucocorticoids can unmask DI",
      criteria_text: "HPA axis function should be checked before and after starting GH in selected patients, GH can lower free T4 below reference range requiring L-T4, estrogen changes require free T4 monitoring, and starting glucocorticoids may reveal diabetes insipidus.",
      cutoffs: ["free T4 below reference range"],
      data_needed: ["GH start or dose change", "free T4 trend", "estrogen therapy change", "glucocorticoid start", "new polyuria", "serum sodium", "urine output"],
      source_ids: hypopit,
      source_section: "Replacement hormone interactions recommendations 2.19-2.26"
    }),
    criterion({
      id: "postoperative_and_overreplacement_monitoring",
      label: "Pituitary surgery and overreplacement: stress-dose steroids before surgery when adrenal insufficiency exists, then taper and retest HPA axis",
      criteria_text: "Pituitary surgery requires stress-dose steroids in adrenal insufficiency before surgery, tapered dosing after surgery before repeat HPA-axis testing, and monitoring to avoid glucocorticoid and thyroid hormone overreplacement.",
      cutoffs: ["stress-dose steroids before surgery", "avoid low or elevated fT4"],
      data_needed: ["pituitary surgery timing", "preoperative adrenal function", "current steroid dose", "postoperative cortisol plan", "free T4 trend", "fracture/cardiometabolic risk"],
      source_ids: hypopit,
      source_section: "Pituitary surgery and overreplacement recommendations 3.5-3.7 and 2.27-2.31"
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: pituitary axis, mass-effect, adrenal, thyroid, sodium, and medication context",
    edgeLabel: "Missing exact hypopituitarism data: headache/vision/cranial nerves, 8-9 AM cortisol, free T4/TSH, sodium/osmolality/urine output, prolactin, IGF-1, LH/FSH/sex steroid, MRI/visual fields, surgery/radiation history, pregnancy status, and current replacement therapy",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when pituitary mass-effect risk, adrenal reserve, thyroid status, water balance, gonadal/GH/prolactin axis, or medication history cannot be extracted.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document headache timing, visual acuity/fields, diplopia or cranial nerve palsy, mental status, vitals, 8-9 AM cortisol, sodium, glucose, serum/urine osmolality and urine output if DI is possible, free T4/TSH, prolactin, IGF-1, LH/FSH with testosterone or estradiol as applicable, pituitary MRI/visual-field status, pregnancy/fertility context, prior surgery/radiation, and current glucocorticoid/thyroid/DDAVP/GH/sex-steroid therapy.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["headache/vision/cranial nerve findings", "8-9 AM cortisol", "free T4 and TSH", "serum sodium", "urine output/osmolality when DI possible", "prolactin", "IGF-1", "LH/FSH with sex steroid", "pituitary MRI or visual-field status", "current hormone replacement medications"]
  });

  const missingPituitaryDataEndpoint = endpoint({
    id: `${prefix}_missing_axis_data_endpoint`,
    label: "Missing data needed: adrenal-first endocrine panel, DI safety data, or pituitary imaging",
    edgeLabel: "Cannot route adrenal crisis, central hypothyroidism, DI, gonadal/GH deficiency, apoplexy, or tumor monitoring until axis labs, sodium/water-balance data, and sellar imaging/visual data are known",
    sourceIds,
    criteria: criteria(`${prefix}_missing_axis_data_criteria`, "Route here when the exact endocrine axis or mass-effect data needed for safe sequencing are unavailable.", contextDomains, sourceIds, { missing_any: ["8-9 AM cortisol", "free T4", "TSH", "serum sodium", "urine output/osmolality when DI possible", "prolactin", "IGF-1", "LH/FSH and sex steroid", "pituitary MRI/visual fields"] }),
    action: "Obtain 8-9 AM cortisol before thyroid escalation when stable, sodium and glucose, free T4/TSH, serum/urine osmolality and urine output if DI is possible, prolactin, IGF-1, LH/FSH plus testosterone or estradiol, pregnancy test when relevant, pituitary MRI, formal visual fields when optic chiasm risk exists, and medication history including glucocorticoids, opioids, dopamine agents, immune checkpoint inhibitors, and estrogen.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["8-9 AM cortisol", "free T4/TSH", "serum sodium", "urine output and urine osmolality/specific gravity", "prolactin", "IGF-1", "LH/FSH plus testosterone or estradiol", "pregnancy status when relevant", "pituitary MRI", "visual fields when chiasm risk exists", "current hormone and interacting medications"]
  });

  const apoplexyCrisisEndpoint = endpoint({
    id: `${prefix}_apoplexy_or_adrenal_crisis_endpoint`,
    label: "Pituitary apoplexy or secondary adrenal crisis: hydrocortisone now, urgent MRI/visual assessment, endocrine-neurosurgical disposition",
    edgeLabel: "Emergency branch: sudden severe headache, visual loss, visual-field defect, ophthalmoplegia/cranial nerve palsy, reduced consciousness, meningism, severe hypotension, vomiting, hypoglycemia, or severe hyponatremia",
    sourceIds: unique([...hypopit, ...adrenal]),
    criteria: criteria(`${prefix}_apoplexy_crisis_criteria`, "Use when mass-effect symptoms, pituitary apoplexy concern, or secondary adrenal crisis features require emergency treatment and monitored disposition.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], unique([...hypopit, ...adrenal]), { criteria_options: criteriaRows }),
    action: "Treat first-risk physiology: give hydrocortisone 50-100 mg immediately when secondary adrenal crisis is suspected, draw cortisol/ACTH first only if this does not delay care, correct hypoglycemia or severe hyponatremia cautiously, obtain urgent pituitary MRI or CT if MRI unavailable, perform visual acuity/fields and cranial nerve assessment, and arrange same-day endocrine plus neurosurgical/ophthalmology review with monitored or inpatient disposition.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["blood pressure/perfusion", "mental status", "glucose", "sodium", "visual acuity and fields", "cranial nerve findings", "MRI/CT completion", "hydrocortisone timing"]
  });

  const centralAiEndpoint = endpoint({
    id: `${prefix}_central_ai_endpoint`,
    label: "Central adrenal insufficiency: replace glucocorticoid before thyroid hormone escalation",
    edgeLabel: "Adrenal branch: 8-9 AM cortisol below 3 ug/dL, indeterminate 3-15 ug/dL needing dynamic test, peak stimulated cortisol below 18.1 ug/dL, or adrenal status unknown before L-T4",
    sourceIds: hypopit,
    criteria: criteria(`${prefix}_central_ai_criteria`, "Use when central adrenal insufficiency is diagnosed, indeterminate, or must be covered before thyroid hormone is started.", ["labs", "medications", "vitals", "workup_findings"], hypopit, { criteria_options: criteriaRows }),
    action: "Start or confirm physiologic glucocorticoid replacement before levothyroxine escalation; use the lowest tolerable hydrocortisone dose chronically, teach stress dosing, and complete dynamic adrenal testing when morning cortisol is 3-15 ug/dL or recent pituitary injury makes basal testing unreliable.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["symptoms of underreplacement", "weight/BP/metabolic effects", "stress-dose plan", "repeat adrenal testing date", "L-T4 timing only after adrenal coverage"]
  });

  const centralHypothyroidEndpoint = endpoint({
    id: `${prefix}_central_hypothyroid_endpoint`,
    label: "Central hypothyroidism: titrate levothyroxine by free T4 after adrenal coverage",
    edgeLabel: "Thyroid branch: free T4 below reference range with low or inappropriately normal TSH, but adrenal reserve has been covered or excluded",
    sourceIds: hypopit,
    criteria: criteria(`${prefix}_central_hypothyroid_criteria`, "Use when central hypothyroidism is present and adrenal insufficiency has been excluded or glucocorticoid therapy has been started.", ["labs", "medications", "comorbidities", "pregnancy_status", "workup_findings"], hypopit, { criteria_options: criteriaRows }),
    action: "Use free T4 rather than TSH to adjust levothyroxine, avoid both low and elevated free T4, reassess free T4 after estrogen or GH changes, use extra caution with cardiac disease or older age, and document that adrenal insufficiency was treated or excluded before thyroid hormone escalation.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["free T4 target range", "symptoms", "cardiac tolerance", "estrogen/GH changes", "adrenal coverage status"]
  });

  const diEndpoint = endpoint({
    id: `${prefix}_di_ddavp_safety_endpoint`,
    label: "Central diabetes insipidus: DDAVP plan with sodium, thirst, weight, and overdose safeguards",
    edgeLabel: "DI branch: polyuria/nocturia, hypernatremia or high-normal sodium, dilute urine, postoperative DI, adipsia, DDAVP use, hyponatremia risk, or new polyuria after glucocorticoids",
    sourceIds: hypopit,
    criteria: criteria(`${prefix}_di_criteria`, "Use when central diabetes insipidus or DDAVP safety affects the active hypopituitarism branch.", ["symptoms", "labs", "medications", "comorbidities", "workup_findings"], hypopit, { criteria_options: criteriaRows }),
    action: "Individualize DDAVP schedule, educate about overdose and hyponatremia risk, ensure at least weekly medication-wearoff polyuria unless specialist-directed otherwise, monitor serum sodium and weight more closely in adipsic DI, attempt at least one DDAVP discontinuation trial during weeks to months after pituitary surgery when safe, and use emergency medical identification.",
    endpointType: "monitoring_reassessment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["serum sodium", "urine output/nocturia", "thirst/adipsia", "weight", "DDAVP timing", "weekly polyuria interval", "postoperative recovery trial", "emergency bracelet/necklace"]
  });

  const gonadalGhProlactinEndpoint = endpoint({
    id: `${prefix}_gonadal_gh_prolactin_endpoint`,
    label: "Gonadal, GH, and prolactin axes: confirm deficiency, contraindications, fertility goals, and tumor context",
    edgeLabel: "Stable axis branch: adrenal and thyroid sequencing addressed, then LH/FSH-sex steroid, prolactin, IGF-1/dynamic GH testing, fertility intent, age, tumor activity, and contraindications guide treatment",
    sourceIds: hypopit,
    criteria: criteria(`${prefix}_gonadal_gh_prolactin_criteria`, "Use for stable outpatient-style replacement decisions after emergency, adrenal, thyroid, and DI safety have been addressed.", ["labs", "medications", "demographics", "pregnancy_status", "comorbidities", "workup_findings"], hypopit, { criteria_options: criteriaRows }),
    action: "Evaluate LH/FSH with testosterone or estradiol, prolactin, IGF-1 and dynamic GH testing when indicated, pregnancy/fertility goals, tumor status, contraindications, and cardiometabolic or bone risk; if proven adult GH deficiency has no contraindication, start GH 0.2-0.4 mg/day when age is below 60 years or 0.1-0.2 mg/day when age is above 60 years, then titrate to keep IGF-1 below ULN and reduce for side effects.",
    endpointType: "clinician_review_handoff",
    guidelineCutoffs: criteriaRows,
    reviewNeededReason: "Sex-steroid, fertility, GH, tumor, and prolactin management depends on reproductive goals, tumor type/activity, contraindications, and local endocrine protocols."
  });

  const mimicEndpoint = endpoint({
    id: `${prefix}_mimic_exclusion_endpoint`,
    label: "Mimic or alternate pituitary-axis explanation: route after adrenal crisis and apoplexy are excluded",
    edgeLabel: "Alternate branch: primary thyroid/adrenal/gonadal disease, medication effect, pregnancy/lactation physiology, renal or osmotic polyuria, hyperglycemia, hypercalcemia, infection, malignancy, or nonpituitary sellar disease fits better",
    sourceIds: sourceIdsForItems(differentials, sourceIds),
    criteria: criteria(`${prefix}_mimic_criteria`, "Use when pituitary-axis results or imaging do not support hypopituitarism or a competing diagnosis explains the abnormalities better.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "pregnancy_status", "workup_findings"], sourceIdsForItems(differentials, sourceIds), { criteria_options: criteriaRows }),
    action: "Document which pituitary axis or imaging findings argue against hypopituitarism, treat emergency adrenal risk if still uncertain, then route to the competing primary endocrine, medication, renal/osmotic, pregnancy/lactation, inflammatory, infectious, malignant, or other sellar pathway.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Primary gland disease, medication effect, physiologic state, or nonpituitary sellar pathology changes the active pathway."
  });

  const monitoringEndpoint = endpoint({
    id: `${prefix}_monitoring_interactions_endpoint`,
    label: "Replacement monitoring: prevent adrenal, thyroid, DDAVP, GH, and postoperative interaction harms",
    edgeLabel: "Monitoring branch: GH start, estrogen change, glucocorticoid start, DDAVP use, postoperative status, pituitary surgery, radiation, or overreplacement risk changes labs and symptoms",
    sourceIds: hypopit,
    criteria: criteria(`${prefix}_monitoring_criteria`, "Use after any hormone replacement or pituitary surgery/radiation plan to detect hormone interactions, underreplacement, overreplacement, and water-balance complications.", ["symptoms", "exam", "vitals", "labs", "medications", "imaging_results", "workup_findings"], hypopit, { criteria_options: criteriaRows }),
    action: "Monitor free T4 after GH or estrogen changes, monitor for new polyuria/DI after glucocorticoid therapy, avoid glucocorticoid overreplacement, avoid low or elevated free T4, check sodium and weight on DDAVP or adipsic DI, reassess HPA axis after pituitary surgery when tapering steroids, and repeat MRI/visual evaluation according to tumor or postoperative plan.",
    endpointType: "monitoring_reassessment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["free T4", "morning cortisol or HPA retesting", "sodium", "urine output/weight", "IGF-1 and GH side effects", "visual fields/MRI", "fracture/cardiometabolic risks", "overreplacement symptoms"]
  });

  const followupEndpoint = endpoint({
    id: `${prefix}_followup_safety_endpoint`,
    label: "Hypopituitarism follow-up: emergency steroid/DI safety, pending-result ownership, and specialty review",
    edgeLabel: "Stable branch: emergency physiology excluded or treated, hormone sequence documented, medication access confirmed, pending labs/imaging owned, and safety instructions can be delivered",
    sourceIds,
    criteria: criteria(`${prefix}_followup_criteria`, "Use when hypopituitarism management is stable enough for disposition and longitudinal endocrine follow-up.", ["vitals", "labs", "medications", "follow_up_access", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Confirm hydrocortisone stress-dose plan when adrenal insufficiency is present, emergency identification for adrenal insufficiency or DI, DDAVP overdose and hyponatremia instructions, thyroid dose follow-up using free T4, owner and timing for pituitary MRI/visual fields and axis labs, medication access, and return precautions for severe headache, vision change, diplopia, syncope, vomiting, confusion, severe polyuria/thirst, or inability to take steroids.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["pending labs/imaging owner", "endocrinology follow-up", "stress-dose steroid plan", "DDAVP safety instructions", "free T4 monitoring", "return precautions", "medication access"]
  });

  const replacementAction = actionNode({
    id: `${prefix}_replacement_sequence_action`,
    label: "Stable hypopituitarism: sequence adrenal, thyroid, DI, gonadal, GH, monitoring, and follow-up decisions",
    edgeLabel: "Stable branch: no immediate apoplexy or crisis physiology, and enough endocrine axis data exist to apply hormone-sequencing rules",
    sourceIds,
    criteria: criteria(`${prefix}_replacement_sequence_criteria`, "Route stable hypopituitarism through hormone replacement sequencing and monitoring after emergency features have been excluded.", ["labs", "medications", "imaging_results", "pregnancy_status", "comorbidities", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Address adrenal coverage before thyroid hormone, central hypothyroid dosing by free T4, DI/DDAVP sodium safety, gonadal/GH/prolactin decisions, monitoring interactions, and safety-net follow-up as concurrent endocrine tasks.",
    parallelActions: ["adrenal coverage before L-T4", "free T4-guided thyroid replacement", "DDAVP and sodium safety", "gonadal/GH/prolactin axis review", "MRI/visual/tumor follow-up", "emergency steroid and DI safety instructions"],
    guidelineCutoffs: criteriaRows,
    children: [centralAiEndpoint, centralHypothyroidEndpoint, diEndpoint, gonadalGhProlactinEndpoint, monitoringEndpoint, followupEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: "Hypopituitarism: choose apoplexy/crisis, adrenal-first sequence, DI safety, replacement, mimic, or follow-up branch",
    edgeLabel: "Pituitary symptoms, visual findings, cortisol, free T4/TSH, sodium/water-balance data, pituitary MRI/visual results, medications, and special-population modifiers are available for routing",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Classify hypopituitarism by emergency mass effect, central adrenal reserve, thyroid status, DI/water balance, remaining pituitary axes, medications, pregnancy/fertility status, imaging, and treatment response.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Choose from emergency apoplexy/adrenal crisis, missing axis data, stable hormone-sequencing plan, DI safety, gonadal/GH/prolactin review, monitoring, follow-up, or competing diagnosis.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingPituitaryDataEndpoint, apoplexyCrisisEndpoint, replacementAction, mimicEndpoint]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: "Hypopituitarism: assess mass effect and endocrine axes with adrenal safety first",
    edgeLabel: "Patient has known pituitary disease, surgery/radiation, immune checkpoint inhibitor exposure, postpartum pituitary injury, headache/vision symptoms, fatigue, amenorrhea/low libido, polyuria, hyponatremia, low free T4 with non-elevated TSH, or clinician-chosen pituitary evaluation",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial hypopituitarism assessment requires emergency mass-effect screen and endocrine axes that allow safe replacement sequencing.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Assess severe headache, vision, visual fields, ocular motility, and pituitary MRI need; measure blood pressure, measure heart rate, and document mental status. Obtain 8-9 AM cortisol before thyroid escalation when stable, free T4/TSH, sodium/glucose, serum and urine osmolality with urine output if DI is possible, prolactin, IGF-1, LH/FSH with sex steroid, pregnancy status when relevant, medication/surgery/radiation history, and current hormone access.",
    parallelActions: ["measure blood pressure", "measure heart rate", "document mental status", "headache/vision/cranial nerve assessment", "8-9 AM cortisol before thyroid escalation when stable", "free T4 and TSH", "sodium/glucose and DI water-balance data", "prolactin/IGF-1/LH/FSH/sex steroid panel", "pituitary MRI and visual fields when indicated", "medication/surgery/radiation/pregnancy context"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "Hypopituitarism: route by apoplexy/adrenal crisis risk, pituitary-axis labs, hormone sequencing, DI safety, and disposition",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for known or suspected hypothalamic-pituitary disease, pituitary mass/surgery/radiation, apoplexy symptoms, postpartum pituitary injury, unexplained multi-axis hormone deficiency, central hypothyroidism, central adrenal insufficiency, central DI, hypogonadotropic hypogonadism, GH deficiency, or clinician-chosen pituitary evaluation.", ["selected_workup_id", "presenting_symptoms", "vitals", "labs", "imaging_results", "problem_list_or_diagnosis", "clinician_selected_module"], sourceIds),
    action: "Route hypopituitarism through emergency apoplexy/adrenal crisis treatment, missing axis data, adrenal-before-thyroid sequencing, central hypothyroid dosing by free T4, DDAVP and sodium safety, gonadal/GH/prolactin review, monitoring interactions, follow-up, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  const activationRules = {};
  const allNodeSourceIds = [];
  const collect = (entry) => {
    allNodeSourceIds.push(...(entry.source_ids || []), ...(entry.criteria?.source_ids || []));
    if (entry.criteria) activationRules[entry.id] = entry.criteria;
    for (const child of entry.children || []) collect(child);
  };
  collect(root);
  const sourceThresholds = sourceThresholdsFromCriteria(criteriaRows);
  const localEvidenceSourceIds = sourceIdsForItems([...tests, ...redFlags, ...differentials, ...dispositions], sourceIds);
  const finalSourceIds = unique([...sourceIds, ...localEvidenceSourceIds, ...allNodeSourceIds, ...sourceThresholds.flatMap((row) => row.source_ids || [])]);

  return {
    schema: "clinical_pathway_tree_v1",
    workupId: module.id,
    workup_id: module.id,
    title: label,
    version: "4.0.0",
    status: "hand_polished_hypopituitarism_pathway_needs_clinician_review",
    source_ids: finalSourceIds,
    source_metadata: sourceRowsForTree(finalSourceIds, sourceById),
    provenance: {
      generated_by: "scripts/hand-polish-clinical-pathway-trees.js",
      generated_at: `${auditDate}T00:00:00.000Z`,
      update_scope: "clinical_pathway_tree_v1 only",
      source_material: "Endocrine Society 2016 Hormone Replacement in Hypopituitarism guideline, Endocrine Society 2016 Primary Adrenal Insufficiency guideline for crisis dosing support, and local module evidence rows",
      review_note: "Hypopituitarism tree is threshold-cited and patient-traversable; pituitary apoplexy surgical timing, tumor-specific therapy, fertility plans, postoperative protocols, and local DDAVP/steroid order sets require clinician governance."
    },
    source_thresholds: sourceThresholds,
    traversable_context: buildTraversableContext(module, finalSourceIds, tests, criteriaRows),
    activationRules,
    root,
    synthetic_patient_scenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_axis_data", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingPituitaryDataEndpoint.id, expected_active_branch: missingPituitaryDataEndpoint.edgeLabel },
      { scenario_id: "pituitary_apoplexy_or_secondary_crisis", major_pathway: "escalation_emergency_actions", expected_endpoint_id: apoplexyCrisisEndpoint.id, expected_active_branch: apoplexyCrisisEndpoint.edgeLabel },
      { scenario_id: "central_adrenal_first", major_pathway: "first_line_management", expected_endpoint_id: centralAiEndpoint.id, expected_active_branch: centralAiEndpoint.edgeLabel },
      { scenario_id: "central_thyroid_and_di_risk", major_pathway: "severity_risk_stratification", expected_endpoint_id: centralHypothyroidEndpoint.id, expected_active_branch: centralHypothyroidEndpoint.edgeLabel },
      { scenario_id: "axis_contraindication_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: gonadalGhProlactinEndpoint.id, expected_active_branch: gonadalGhProlactinEndpoint.edgeLabel },
      { scenario_id: "mimic_or_primary_gland_disease", major_pathway: "mimics_exclusions", expected_endpoint_id: mimicEndpoint.id, expected_active_branch: mimicEndpoint.edgeLabel },
      { scenario_id: "replacement_interaction_monitoring", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: monitoringEndpoint.id, expected_active_branch: monitoringEndpoint.edgeLabel },
      { scenario_id: "postoperative_taper_or_ddavp_trial", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: monitoringEndpoint.id, expected_active_branch: monitoringEndpoint.edgeLabel },
      { scenario_id: "followup_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel }
    ],
    audit_requirements: {
      required_domains: requiredPathwayDomains,
      hand_polish_requirements: [
        "emergency branch treats secondary adrenal crisis with hydrocortisone 50-100 mg and urgent visual/imaging/specialty disposition",
        "adrenal branch uses 8-9 AM cortisol below 3 ug/dL, above 15 ug/dL, and 3-15 ug/dL dynamic-testing range",
        "central hypothyroidism branch requires adrenal evaluation or empiric glucocorticoid before L-T4 and uses free T4 instead of TSH for titration",
        "DI branch includes DDAVP overdose/hyponatremia education, at least weekly medication wearoff polyuria, sodium/weight monitoring, postoperative discontinuation trial, and emergency identification",
        "GH branch includes 0.2-0.4 mg/day below age 60, 0.1-0.2 mg/day above age 60, IGF-1 below ULN titration, and contraindication review"
      ]
    }
  };
}

function buildGestationalDiabetesClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Gestational Diabetes";
  const prefix = "gestational_diabetes";
  const adaSoc = ["ADA_SOC_2026"];
  const adaDx = ["ADA_DIAGNOSIS_2026"];
  const cdc = ["CDC_DIABETES_TESTING_2024", "CDC_NDPP_LIFESTYLE_2024"];
  const sourceIds = unique([...adaSoc, ...adaDx, ...cdc, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 12);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);
  const safetyChecks = firstItems(module, "safetyChecks", 6);

  const criteriaRows = [
    criterion({
      id: "gdm_screening_timing",
      label: "Gestational diabetes screening timing: early overt-diabetes testing when high risk, otherwise routine 24-28 week screening",
      criteria_text: "Pregnant patients without known diabetes are screened for gestational diabetes at 24-28 weeks; high-risk patients can be tested earlier for overt type 1 or type 2 diabetes rather than labeling early hyperglycemia as routine GDM.",
      cutoffs: ["24-28 weeks", "first 15 weeks"],
      data_needed: ["gestational age", "prior diabetes status", "risk factors", "early pregnancy A1c/glucose", "local one-step or two-step strategy"],
      source_ids: unique([...adaSoc, ...adaDx, "CDC_DIABETES_TESTING_2024"]),
      source_section: "GDM timing and early pregnancy testing"
    }),
    criterion({
      id: "gdm_one_step_75g_thresholds",
      label: "One-step GDM diagnosis: 75-g OGTT fasting >=92, 1-hour >=180, or 2-hour >=153 mg/dL; one abnormal value diagnoses GDM",
      criteria_text: "The one-step 75-g OGTT diagnoses gestational diabetes when fasting glucose is >=92 mg/dL, 1-hour glucose is >=180 mg/dL, or 2-hour glucose is >=153 mg/dL.",
      cutoffs: ["75-g", "fasting >=92 mg/dL", "1-hour >=180 mg/dL", "2-hour >=153 mg/dL", "1 abnormal value"],
      data_needed: ["75-g OGTT fasting glucose", "75-g OGTT 1-hour glucose", "75-g OGTT 2-hour glucose", "gestational age", "fasting status"],
      source_ids: adaDx,
      source_section: "Gestational diabetes one-step diagnostic strategy"
    }),
    criterion({
      id: "gdm_two_step_carpenter_coustan",
      label: "Two-step GDM diagnosis: 50-g screen threshold 130-140 mg/dL, then 100-g OGTT Carpenter-Coustan thresholds with usually 2 abnormal values",
      criteria_text: "A two-step strategy uses a 50-g glucose challenge screen, commonly positive at 130-140 mg/dL by local policy, followed by a 100-g OGTT; Carpenter-Coustan thresholds are fasting 95, 1-hour 180, 2-hour 155, and 3-hour 140 mg/dL, with usually 2 abnormal values needed.",
      cutoffs: ["50-g", "130-140 mg/dL", "100-g", "fasting 95 mg/dL", "1-hour 180 mg/dL", "2-hour 155 mg/dL", "3-hour 140 mg/dL", "2 abnormal values"],
      data_needed: ["50-g screen result and local threshold", "100-g OGTT fasting glucose", "100-g OGTT 1-hour glucose", "100-g OGTT 2-hour glucose", "100-g OGTT 3-hour glucose", "number of abnormal values"],
      source_ids: unique([...adaDx, "CDC_DIABETES_TESTING_2024"]),
      source_section: "Gestational diabetes two-step diagnostic strategy"
    }),
    criterion({
      id: "gdm_overt_diabetes_thresholds",
      label: "Overt diabetes in pregnancy: A1c >=6.5%, fasting glucose >=126 mg/dL, 2-hour OGTT >=200 mg/dL, or random glucose >=200 mg/dL with symptoms",
      criteria_text: "Diabetes-range testing in early pregnancy should be classified as overt diabetes rather than gestational diabetes when standard diabetes thresholds are met and confirmed when needed.",
      cutoffs: ["A1c >=6.5%", "fasting glucose >=126 mg/dL", "2-hour OGTT >=200 mg/dL", "random glucose >=200 mg/dL"],
      data_needed: ["A1c", "fasting plasma glucose", "2-hour 75-g OGTT glucose", "random plasma glucose", "classic hyperglycemia symptoms", "repeat confirmation if asymptomatic"],
      source_ids: unique([...adaDx, "CDC_DIABETES_TESTING_2024"]),
      source_section: "Overt diabetes diagnostic thresholds"
    }),
    criterion({
      id: "gdm_treatment_glucose_targets",
      label: "GDM treatment targets: fasting glucose <95 mg/dL, 1-hour postprandial <140 mg/dL, or 2-hour postprandial <120 mg/dL",
      criteria_text: "Gestational diabetes treatment targets commonly use fasting glucose <95 mg/dL, 1-hour postprandial <140 mg/dL, or 2-hour postprandial <120 mg/dL; local obstetric protocols determine which postprandial timing is used.",
      cutoffs: ["fasting <95 mg/dL", "1-hour <140 mg/dL", "2-hour <120 mg/dL"],
      data_needed: ["home fasting glucose log", "1-hour postprandial glucose log", "2-hour postprandial glucose log", "hypoglycemia events", "nutrition therapy response", "local monitoring schedule"],
      source_ids: adaSoc,
      source_section: "Management of diabetes in pregnancy glycemic targets"
    }),
    criterion({
      id: "gdm_medication_escalation",
      label: "GDM medication escalation: nutrition/activity first; insulin preferred when glucose targets are not met",
      criteria_text: "Use medical nutrition therapy and physical activity first; if fasting or postprandial targets are not met after a monitored trial, insulin is preferred because metformin and glyburide cross the placenta and require clinician review when used.",
      cutoffs: ["fasting <95 mg/dL", "1-hour <140 mg/dL", "2-hour <120 mg/dL"],
      data_needed: ["glucose log duration", "percentage above target", "nutrition plan", "physical activity plan", "hypoglycemia risk", "insulin access", "metformin/glyburide counseling"],
      source_ids: adaSoc,
      source_section: "Pregnancy pharmacologic treatment"
    }),
    criterion({
      id: "gdm_obstetric_emergency_triggers",
      label: "Pregnancy hyperglycemia escalation: ketones, vomiting/dehydration, severe hyperglycemia, altered mental status, preeclampsia features, or reduced fetal movement",
      criteria_text: "Ketones, vomiting/dehydration, severe hyperglycemia, altered mental status, hypertensive/preeclampsia features, or reduced fetal movement require urgent obstetric/endocrine evaluation rather than routine outpatient GDM adjustment.",
      cutoffs: ["random glucose >=200 mg/dL", "blood pressure >=140/90 mm Hg", "blood pressure >=160/110 mm Hg"],
      data_needed: ["ketones", "bicarbonate/anion gap", "glucose", "hydration/oral intake", "mental status", "blood pressure", "preeclampsia symptoms", "fetal movement"],
      source_ids: unique([...adaSoc, ...adaDx, "CDC_DIABETES_TESTING_2024"]),
      source_section: "Pregnancy acute escalation and hypertensive-feature routing"
    }),
    criterion({
      id: "gdm_postpartum_followup",
      label: "Postpartum after GDM: 75-g OGTT at 4-12 weeks, then lifelong diabetes/prediabetes screening every 1-3 years",
      criteria_text: "After gestational diabetes, perform postpartum 75-g OGTT at 4-12 weeks and continue lifelong screening every 1-3 years; if prediabetes is found, intensive lifestyle prevention and metformin consideration depend on risk profile.",
      cutoffs: ["75-g", "4-12 weeks", "1-3 years"],
      data_needed: ["delivery date", "postpartum 75-g OGTT result", "breastfeeding status", "contraception plan", "future pregnancy plans", "prediabetes/diabetes result", "follow-up access"],
      source_ids: unique([...adaSoc, ...adaDx, "CDC_NDPP_LIFESTYLE_2024"]),
      source_section: "Postpartum diabetes screening and prevention"
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: gestational age, glucose strategy, obstetric symptoms, vitals, and postpartum status",
    edgeLabel: "Missing exact pregnancy diabetes data: gestational age, prior diabetes status, one-step or two-step strategy, OGTT values, home glucose log, ketones/acid-base status when ill, blood pressure, fetal symptoms, medications, and postpartum timing",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when the pregnancy diabetes context needed to choose screening, treatment, escalation, or postpartum follow-up is unavailable.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document gestational age, prior diabetes status, early pregnancy A1c/glucose if high risk, local one-step or two-step strategy, exact OGTT values, home fasting and postprandial glucose log, current weight and blood pressure, ketones/electrolytes/anion gap when vomiting or severely hyperglycemic, fetal movement or obstetric symptoms, current medications, delivery date if postpartum, and follow-up access.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["gestational age", "prior diabetes status", "local one-step or two-step strategy", "OGTT values", "home glucose log", "ketones/anion gap if ill", "blood pressure", "fetal movement/obstetric symptoms", "current medications", "postpartum delivery date"]
  });

  const missingOgttEndpoint = endpoint({
    id: `${prefix}_missing_ogtt_log_endpoint`,
    label: "Missing data needed: OGTT values, home glucose log, ketones, blood pressure, or postpartum OGTT timing",
    edgeLabel: "Cannot classify GDM, overt diabetes, medication escalation, urgent pregnancy risk, or postpartum follow-up until OGTT values, glucose log, ketones/acid-base status when ill, BP, and postpartum timing are known",
    sourceIds,
    criteria: criteria(`${prefix}_missing_ogtt_criteria`, "Route here when exact GDM diagnostic or treatment-routing data are missing.", contextDomains, sourceIds, { missing_any: ["gestational age", "75-g or 100-g OGTT values", "50-g screen result if two-step strategy", "fasting and postprandial glucose log", "ketones/acid-base data when ill", "blood pressure", "postpartum OGTT date"] }),
    action: "Obtain the local screening strategy result: 75-g fasting/1-hour/2-hour values, or 50-g screen threshold plus 100-g fasting/1-hour/2-hour/3-hour values; add home fasting and postprandial glucose logs, ketones/electrolytes/anion gap if symptomatic or vomiting, blood pressure and preeclampsia symptom screen, and postpartum 75-g OGTT timing if delivered.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["75-g fasting/1-hour/2-hour values", "50-g screen and local threshold", "100-g fasting/1-hour/2-hour/3-hour values", "fasting and postprandial glucose log", "ketones/electrolytes/anion gap when ill", "blood pressure", "postpartum 75-g OGTT date"]
  });

  const urgentEndpoint = endpoint({
    id: `${prefix}_urgent_obstetric_endocrine_endpoint`,
    label: "Pregnancy diabetes emergency: ketone/acidosis, dehydration, severe hyperglycemia, preeclampsia feature, or fetal concern",
    edgeLabel: "Emergency branch: ketones, vomiting or dehydration, altered mental status, severe hyperglycemia, acid-base abnormality, blood pressure >=140/90 with symptoms or >=160/110, reduced fetal movement, or inability to keep insulin/fluids down",
    sourceIds,
    criteria: criteria(`${prefix}_urgent_criteria`, "Use when pregnancy hyperglycemia has DKA/acidosis risk, dehydration, hypertensive/preeclampsia features, altered mental status, or fetal concern.", ["symptoms", "exam", "vitals", "labs", "medications", "pregnancy_status", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Send for urgent obstetric/endocrine evaluation, check glucose, serum or urine ketones, electrolytes, bicarbonate/anion gap, creatinine, mental status, hydration, blood pressure and preeclampsia symptoms, fetal status per gestational age/local protocol, and treat possible DKA or hypertensive emergency before routine GDM titration.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["ketones and anion gap", "glucose trend", "hydration and oral intake", "blood pressure", "preeclampsia symptoms", "fetal movement/status", "insulin access"]
  });

  const diagnosticEndpoint = endpoint({
    id: `${prefix}_diagnostic_confirmation_endpoint`,
    label: "GDM or overt diabetes classification: apply the selected OGTT/diabetes thresholds",
    edgeLabel: "Diagnostic branch: 24-28 week screening due, one-step 75-g threshold crossed, two-step screen/100-g threshold crossed, or early pregnancy diabetes-range value suggests overt diabetes",
    sourceIds: unique([...adaDx, "CDC_DIABETES_TESTING_2024"]),
    criteria: criteria(`${prefix}_diagnostic_criteria`, "Use when gestational age and OGTT or overt-diabetes data are available for classification.", ["pregnancy_status", "labs", "symptoms", "workup_findings"], unique([...adaDx, "CDC_DIABETES_TESTING_2024"]), { criteria_options: criteriaRows }),
    action: "Classify with the local strategy: one-step 75-g OGTT fasting >=92, 1-hour >=180, or 2-hour >=153 mg/dL diagnoses GDM; two-step testing uses local 50-g screen threshold 130-140 mg/dL followed by 100-g OGTT Carpenter-Coustan values fasting 95, 1-hour 180, 2-hour 155, 3-hour 140 mg/dL with usually 2 abnormal values. Early pregnancy A1c >=6.5%, fasting >=126 mg/dL, 2-hour >=200 mg/dL, or random >=200 mg/dL with symptoms routes as overt diabetes in pregnancy.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows
  });

  const treatmentEndpoint = endpoint({
    id: `${prefix}_nutrition_insulin_endpoint`,
    label: "GDM treatment: nutrition/activity, glucose monitoring, then insulin if fasting or postprandial targets remain high",
    edgeLabel: "Treatment branch: GDM confirmed and no emergency physiology; fasting or postprandial glucose targets guide nutrition, activity, insulin, and obstetric monitoring",
    sourceIds: adaSoc,
    criteria: criteria(`${prefix}_treatment_criteria`, "Use when GDM is diagnosed and the patient is stable enough for outpatient-style therapy or obstetric co-management.", ["labs", "medications", "pregnancy_status", "comorbidities", "workup_findings"], adaSoc, { criteria_options: criteriaRows }),
    action: "Start medical nutrition therapy, appropriate physical activity, and fasting/postprandial monitoring; escalate when values remain above fasting <95 mg/dL, 1-hour <140 mg/dL, or 2-hour <120 mg/dL targets. Prefer insulin when medication is needed; metformin or glyburide requires clinician counseling because they cross the placenta and local obstetric policy may differ.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["fasting glucose", "1-hour or 2-hour postprandial glucose", "hypoglycemia", "weight gain", "nutrition adherence", "insulin dose/access", "obstetric monitoring plan"]
  });

  const mimicEndpoint = endpoint({
    id: `${prefix}_mimic_or_overt_diabetes_endpoint`,
    label: "Pregnancy glucose mimic or overt pregestational diabetes: route away from routine GDM plan",
    edgeLabel: "Alternate branch: early diabetes-range value, type 1/type 2 diabetes, steroid or stress hyperglycemia, DKA/HHS, renal disease, infection, hypoglycemia/drug effect, or secondary endocrine cause fits better",
    sourceIds: sourceIdsForItems(differentials, sourceIds),
    criteria: criteria(`${prefix}_mimic_criteria`, "Use when glucose results or clinical context indicate overt diabetes, a hyperglycemic crisis, or another cause rather than routine gestational diabetes.", ["symptoms", "vitals", "labs", "medications", "comorbidities", "pregnancy_status", "workup_findings"], sourceIdsForItems(differentials, sourceIds), { criteria_options: criteriaRows }),
    action: `Document why routine GDM is not the active pathway and route to the more specific diagnosis: ${listText(differentials, "overt type 1/type 2 diabetes, steroid/stress hyperglycemia, DKA/HHS, renal disease, infection, medication effect, or secondary endocrine cause", 5)}.`,
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Pregnancy hyperglycemia may represent overt diabetes, hyperglycemic crisis, medication effect, or another diagnosis requiring a different pathway."
  });

  const postpartumEndpoint = endpoint({
    id: `${prefix}_postpartum_followup_endpoint`,
    label: "Postpartum GDM: 75-g OGTT, prevention plan, lifelong screening, and future-pregnancy safety-net",
    edgeLabel: "Postpartum branch: delivered after GDM, 4-12 week 75-g OGTT due or abnormal, breastfeeding/contraception/future pregnancy counseling needed, or long-term diabetes prevention follow-up due",
    sourceIds: unique([...adaSoc, ...adaDx, "CDC_NDPP_LIFESTYLE_2024"]),
    criteria: criteria(`${prefix}_postpartum_criteria`, "Use after delivery or when GDM history changes future diabetes prevention and screening.", ["pregnancy_status", "labs", "medications", "follow_up_access", "workup_findings"], unique([...adaSoc, ...adaDx, "CDC_NDPP_LIFESTYLE_2024"]), { criteria_options: criteriaRows }),
    action: "Order or document postpartum 75-g OGTT at 4-12 weeks, classify normal/prediabetes/diabetes using nonpregnant thresholds, screen every 1-3 years lifelong, connect to a diabetes prevention program when prediabetes or high risk persists, review breastfeeding, contraception and medication compatibility, and safety-net for hyperglycemia symptoms before the next pregnancy.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["postpartum 75-g OGTT date/result", "1-3 year rescreening interval", "prediabetes/diabetes classification", "prevention program referral", "future pregnancy plan", "medication compatibility"]
  });

  const managementAction = actionNode({
    id: `${prefix}_management_action`,
    label: "Gestational diabetes: combine diagnostic classification, treatment targets, obstetric modifiers, and postpartum plan",
    edgeLabel: "Stable pregnancy branch: OGTT or glucose-log data available, emergency features absent, and maternal-fetal management can be selected",
    sourceIds,
    criteria: criteria(`${prefix}_management_criteria`, "Route stable pregnancy hyperglycemia through diagnostic thresholds, treatment targets, medication safety, fetal/obstetric modifiers, monitoring, and postpartum prevention.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Use diagnostic thresholds, glucose targets, medication safety, obstetric co-management, and postpartum prevention as one plan.",
    parallelActions: ["classify by one-step or two-step OGTT", "set fasting and postprandial glucose targets", "nutrition/activity and insulin escalation", "blood pressure and fetal symptom safety", "postpartum 75-g OGTT and prevention"],
    guidelineCutoffs: criteriaRows,
    children: [diagnosticEndpoint, treatmentEndpoint, postpartumEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: "Gestational diabetes: choose missing-data, emergency, diagnostic, treatment, mimic, or postpartum branch",
    edgeLabel: "Gestational age, OGTT values, home glucose log, ketones/acid-base status, blood pressure, fetal symptoms, medication context, and postpartum status are available",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Classify pregnancy hyperglycemia by gestational age, selected OGTT strategy, glucose thresholds, emergency symptoms, treatment response, medication constraints, and postpartum timing.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Choose from missing OGTT/glucose-log data, obstetric/endocrine emergency, GDM/overt-diabetes diagnosis, stable treatment, postpartum prevention, or competing diagnosis.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingOgttEndpoint, urgentEndpoint, managementAction, mimicEndpoint]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: "Gestational diabetes: collect gestational age, OGTT strategy, glucose log, ketone risk, blood pressure, weight, and fetal symptoms together",
    edgeLabel: "Pregnant or postpartum patient with GDM risk, abnormal glucose screen, diabetes-range value, hyperglycemia symptoms, prior GDM, obesity/PCOS/family history, or clinician-chosen pregnancy diabetes evaluation",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial GDM assessment requires pregnancy timing, exact glucose thresholds, acute illness safety, blood pressure/fetal assessment, and medication context.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: `Measure blood pressure, measure heart rate, measure current weight, document mental status, and document fetal symptoms when gestational age applies. Obtain gestational age, prior diabetes/GDM status, local one-step or two-step strategy, exact OGTT or screen values, fasting/postprandial glucose log, ketones/electrolytes/anion gap if vomiting or severely hyperglycemic, medication/allergy list, nutrition/activity plan, and postpartum delivery date if delivered. Local evidence reminders: ${listText([...tests, ...redFlags, ...dispositions, ...safetyChecks], "pregnancy diabetes tests, red flags, disposition rules, and safety checks", 12)}.`,
    parallelActions: ["measure blood pressure", "measure heart rate", "measure current weight", "document mental status", "gestational age and fetal symptom review", "one-step or two-step OGTT values", "fasting/postprandial glucose log", "ketones/electrolytes/anion gap when ill", "medication and insulin access review", "postpartum OGTT timing"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "Gestational diabetes: route by pregnancy timing, OGTT thresholds, glucose targets, urgent obstetric risk, and postpartum prevention",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for pregnancy or postpartum context with GDM screening need, abnormal glucose challenge/OGTT, diabetes-range early pregnancy value, home glucose elevations, prior GDM, or clinician-chosen pregnancy diabetes evaluation.", ["clinician_selected_module", "pregnancy_status", "gestational_age", "labs", "presenting_symptoms", "problem_list_or_diagnosis"], sourceIds),
    action: "Route pregnancy hyperglycemia through missing-data, emergency obstetric/endocrine evaluation, one-step or two-step diagnostic thresholds, treatment targets, insulin/medication safety, postpartum OGTT, prevention, follow-up, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: "hand_polished_gestational_diabetes_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: "ADA Standards of Care in Diabetes 2026, ADA Diagnosis and Classification of Diabetes 2026, CDC Diabetes Testing, CDC National DPP resources, and local module evidence rows",
    reviewNote: "Gestational diabetes tree is threshold-cited and patient-traversable; local one-step versus two-step strategy, medication formulary, fetal surveillance, delivery timing, and obstetric hypertensive-emergency protocols require clinician governance.",
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_ogtt_values", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingOgttEndpoint.id, expected_active_branch: missingOgttEndpoint.edgeLabel },
      { scenario_id: "gdm_dka_or_preeclampsia_risk", major_pathway: "escalation_emergency_actions", expected_endpoint_id: urgentEndpoint.id, expected_active_branch: urgentEndpoint.edgeLabel },
      { scenario_id: "one_step_or_two_step_diagnosis", major_pathway: "severity_risk_stratification", expected_endpoint_id: diagnosticEndpoint.id, expected_active_branch: diagnosticEndpoint.edgeLabel },
      { scenario_id: "stable_gdm_treatment", major_pathway: "first_line_management", expected_endpoint_id: treatmentEndpoint.id, expected_active_branch: treatmentEndpoint.edgeLabel },
      { scenario_id: "medication_or_obstetric_policy_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: treatmentEndpoint.id, expected_active_branch: treatmentEndpoint.edgeLabel },
      { scenario_id: "overt_diabetes_or_mimic", major_pathway: "mimics_exclusions", expected_endpoint_id: mimicEndpoint.id, expected_active_branch: mimicEndpoint.edgeLabel },
      { scenario_id: "glucose_log_monitoring", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: treatmentEndpoint.id, expected_active_branch: treatmentEndpoint.edgeLabel },
      { scenario_id: "postpartum_deescalation", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: postpartumEndpoint.id, expected_active_branch: postpartumEndpoint.edgeLabel },
      { scenario_id: "postpartum_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: postpartumEndpoint.id, expected_active_branch: postpartumEndpoint.edgeLabel }
    ],
    handPolishRequirements: [
      "diagnostic branch includes 75-g one-step fasting 92, 1-hour 180, 2-hour 153 mg/dL and two-step Carpenter-Coustan thresholds",
      "treatment branch includes fasting <95, 1-hour <140, and 2-hour <120 mg/dL targets",
      "emergency branch routes ketones/acidosis, vomiting/dehydration, severe hyperglycemia, hypertensive features, and fetal concerns",
      "postpartum branch includes 75-g OGTT at 4-12 weeks and lifelong 1-3 year screening"
    ]
  });
}

function buildDiabetesMellitusClinicalPathwayTree(module, sourceById, diabetesType) {
  const isType1 = diabetesType === "type1";
  const label = module.label || (isType1 ? "Type 1 Diabetes Mellitus" : "Type 2 Diabetes Mellitus");
  const prefix = isType1 ? "type_1_diabetes" : "type_2_diabetes";
  const diag = ["ADA_DIAGNOSIS_2026", "CDC_DIABETES_TESTING_2024"];
  const soc = ["ADA_SOC_2026"];
  const crisis = ["ADA_HYPERGLYCEMIC_CRISES_2024", "ADA_STANDARDS_HOSPITAL_2026"];
  const sourceIds = unique([...diag, ...soc, ...crisis, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 12);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);
  const safetyChecks = firstItems(module, "safetyChecks", 6);

  const criteriaRows = [
    criterion({
      id: `${prefix}_diabetes_diagnostic_thresholds`,
      label: "Diabetes diagnosis: A1c >=6.5%, fasting glucose >=126 mg/dL, 2-hour OGTT >=200 mg/dL, or random glucose >=200 mg/dL with symptoms",
      criteria_text: "Diabetes is diagnosed by A1c >=6.5%, fasting plasma glucose >=126 mg/dL, 2-hour 75-g OGTT glucose >=200 mg/dL, or random plasma glucose >=200 mg/dL with classic symptoms; asymptomatic results need confirmation.",
      cutoffs: ["A1c >=6.5%", "fasting glucose >=126 mg/dL", "2-hour OGTT >=200 mg/dL", "random glucose >=200 mg/dL"],
      data_needed: ["A1c", "fasting plasma glucose", "2-hour 75-g OGTT glucose", "random plasma glucose", "classic symptoms", "repeat confirmatory test if asymptomatic"],
      source_ids: diag,
      source_section: "Diabetes diagnostic criteria"
    }),
    criterion({
      id: `${prefix}_prediabetes_thresholds_for_mimic`,
      label: "Prediabetes range is not diabetes: A1c 5.7-6.4%, fasting glucose 100-125 mg/dL, or 2-hour OGTT 140-199 mg/dL",
      criteria_text: "Prediabetes thresholds are A1c 5.7-6.4%, fasting glucose 100-125 mg/dL, or 2-hour 75-g OGTT glucose 140-199 mg/dL; these route away from a confirmed diabetes treatment branch unless other diabetes-range data exist.",
      cutoffs: ["A1c 5.7-6.4%", "fasting glucose 100-125 mg/dL", "2-hour OGTT 140-199 mg/dL"],
      data_needed: ["A1c", "fasting plasma glucose", "2-hour OGTT glucose", "symptoms", "repeat confirmation"],
      source_ids: diag,
      source_section: "Prediabetes diagnostic criteria"
    }),
    criterion({
      id: `${prefix}_dka_hhs_red_flags`,
      label: "Hyperglycemic crisis check: DKA has ketosis plus pH <7.3 or bicarbonate <18 mmol/L; beta-hydroxybutyrate often >=3.0 mmol/L",
      criteria_text: "Vomiting, dehydration, Kussmaul respirations, altered mental status, severe hyperglycemia, or insulin deficiency symptoms require DKA/HHS assessment; DKA requires diabetes/hyperglycemia plus ketosis and metabolic acidosis, commonly beta-hydroxybutyrate >=3.0 mmol/L with pH <7.3 or bicarbonate <18 mmol/L.",
      cutoffs: ["beta-hydroxybutyrate >=3.0 mmol/L", "pH <7.3", "bicarbonate <18 mmol/L"],
      data_needed: ["glucose", "beta-hydroxybutyrate or urine ketones", "venous pH", "bicarbonate", "anion gap", "osmolality", "mental status", "volume status", "SGLT2 inhibitor use"],
      source_ids: crisis,
      source_section: "Hyperglycemic crises diagnostic criteria"
    }),
    criterion({
      id: `${prefix}_glycemic_goals_and_hypoglycemia`,
      label: "Most nonpregnant adults: A1c goal <7%; hypoglycemia level 1 <70 mg/dL and level 2 <54 mg/dL require treatment-plan review",
      criteria_text: "For many nonpregnant adults, a reasonable A1c goal is <7% if safely achieved; level 1 hypoglycemia is glucose <70 mg/dL and level 2 is <54 mg/dL, with severe hypoglycemia requiring assistance regardless of value.",
      cutoffs: ["A1c <7%", "glucose <70 mg/dL", "glucose <54 mg/dL"],
      data_needed: ["A1c", "CGM/glucose log", "hypoglycemia frequency", "severe hypoglycemia needing assistance", "pregnancy status", "frailty/comorbidity context"],
      source_ids: soc,
      source_section: "Glycemic goals and hypoglycemia"
    }),
    criterion({
      id: `${prefix}_kidney_albuminuria_thresholds`,
      label: "Kidney risk: UACR >=30 mg/g or eGFR <60 mL/min/1.73 m2 changes kidney-protective therapy and follow-up",
      criteria_text: "Diabetes kidney risk assessment includes eGFR and urine albumin-creatinine ratio; UACR >=30 mg/g or eGFR <60 mL/min/1.73 m2 changes kidney-protective therapy, medication safety, and monitoring.",
      cutoffs: ["UACR >=30 mg/g", "eGFR <60 mL/min/1.73 m2"],
      data_needed: ["eGFR", "UACR", "potassium", "blood pressure", "ACEi/ARB use", "SGLT2 inhibitor eligibility", "pregnancy status"],
      source_ids: soc,
      source_section: "Chronic kidney disease and risk management"
    }),
    ...(isType1 ? [
      criterion({
        id: "type1_autoimmune_classification",
        label: "Autoimmune insulin-deficient diabetes: diabetes plus islet autoantibody positivity or low C-peptide supports type 1/LADA classification",
        criteria_text: "Type 1 diabetes classification uses clinical insulin deficiency, DKA risk, islet autoantibodies such as GAD65, IA-2, ZnT8 or insulin autoantibody when appropriate, and C-peptide interpreted with concurrent glucose.",
        cutoffs: ["glucose >=200 mg/dL"],
        data_needed: ["islet autoantibodies", "C-peptide with concurrent glucose", "DKA history", "weight loss/catabolic symptoms", "age/onset tempo", "family autoimmune history"],
        source_ids: unique([...diag, ...soc]),
        source_section: "Type 1 diabetes classification"
      }),
      criterion({
        id: "type1_insulin_essential",
        label: "Type 1 diabetes treatment: physiologic insulin is required; never stop basal insulin during illness without clinician direction",
        criteria_text: "People with type 1 diabetes require insulin therapy; acute illness, vomiting, pump failure, insulin omission, or SGLT2 inhibitor use requires ketone assessment and sick-day insulin safety rather than stopping basal insulin.",
        cutoffs: ["glucose <70 mg/dL", "glucose <54 mg/dL"],
        data_needed: ["basal insulin access", "bolus/correction plan", "pump/CGM status", "ketone plan", "hypoglycemia history", "glucagon access", "sick-day rules"],
        source_ids: unique([...soc, ...crisis]),
        source_section: "Type 1 pharmacologic therapy and sick-day safety"
      })
    ] : [
      criterion({
        id: "type2_initial_insulin_thresholds",
        label: "Type 2 diabetes severe hyperglycemia: consider insulin when A1c >10%, glucose >=300 mg/dL, catabolism, symptoms, or ketosis are present",
        criteria_text: "Type 2 diabetes with A1c >10%, glucose >=300 mg/dL, catabolic symptoms, symptomatic hyperglycemia, or ketosis should route to insulin or urgent evaluation rather than slow outpatient titration.",
        cutoffs: ["A1c >10%", "glucose >=300 mg/dL"],
        data_needed: ["A1c", "plasma glucose", "weight loss/catabolism", "polyuria/polydipsia", "ketones", "medication access", "insulin feasibility"],
        source_ids: unique([...soc, ...crisis]),
        source_section: "Pharmacologic treatment escalation"
      }),
      criterion({
        id: "type2_cardiorenal_medication_selection",
        label: "Type 2 diabetes cardiorenal branch: ASCVD, heart failure, CKD, UACR >=30 mg/g, or eGFR <60 changes GLP-1/SGLT2 and ACEi/ARB decisions",
        criteria_text: "In type 2 diabetes, ASCVD, heart failure, CKD, albuminuria, or reduced eGFR changes medication selection toward cardiorenal risk-reducing therapy independent of baseline A1c in many patients; pregnancy and eGFR restrictions require clinician review.",
        cutoffs: ["UACR >=30 mg/g", "eGFR <60 mL/min/1.73 m2", "eGFR >=20 mL/min/1.73 m2"],
        data_needed: ["ASCVD status", "heart failure status", "eGFR", "UACR", "pregnancy status", "SGLT2/GLP-1 contraindications", "cost/access"],
        source_ids: soc,
        source_section: "Cardiovascular and kidney risk management"
      })
    ])
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: `Missing data needed: ${label} diagnosis, crisis screen, medication safety, kidney/cardiovascular risk, and follow-up context`,
    edgeLabel: `Missing exact ${label} data: A1c/glucose criteria, symptoms, ketones/acid-base status when ill, diabetes type evidence, medications/insulin access, kidney/cardiovascular risk, pregnancy status, vitals, and follow-up access`,
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, `Route here when the data needed to safely classify and manage ${label} cannot be extracted.`, contextDomains, sourceIds, { missing_any: contextDomains }),
    action: `Document A1c, fasting or random glucose, 2-hour OGTT if used, symptoms, glucose/CGM pattern, ketones, bicarbonate/pH/anion gap when ill, kidney function, UACR, lipids, blood pressure, heart rate, weight, mental status, current medications including insulin/SGLT2 use, hypoglycemia history, pregnancy status, diabetes type evidence, complication screen, medication access, and follow-up access.`,
    endpointType: "missing_data_needed",
    missingDataNeeded: ["A1c and plasma glucose data", "classic symptoms", "ketones and acid-base data when ill", "current medications/insulin access", "eGFR and UACR", "blood pressure", "weight", "mental status", "pregnancy status", "diabetes type evidence", "hypoglycemia history", "follow-up access"]
  });

  const missingDiabetesDataEndpoint = endpoint({
    id: `${prefix}_missing_diabetes_data_endpoint`,
    label: "Missing data needed: diagnostic thresholds, ketones/acid-base, medication access, kidney risk, or hypoglycemia history",
    edgeLabel: "Cannot choose confirmed diabetes, crisis, insulin/medication, kidney/cardiovascular, mimic, or follow-up branch until exact glucose/A1c, ketone/acid-base, medication, kidney, and safety data are known",
    sourceIds,
    criteria: criteria(`${prefix}_missing_diabetes_data_criteria`, `Route here when exact ${label} threshold or treatment-safety data are unavailable.`, contextDomains, sourceIds, { missing_any: ["A1c", "fasting/random glucose or OGTT", "ketones/anion gap/pH/bicarbonate when symptomatic", "current medication and insulin access", "eGFR", "UACR", "hypoglycemia history"] }),
    action: "Obtain A1c and plasma glucose criteria, repeat confirmatory test if asymptomatic, check beta-hydroxybutyrate or urine ketones plus bicarbonate/pH/anion gap when vomiting, dehydrated, losing weight, using SGLT2 inhibitors, or acutely ill, and document eGFR, UACR, BP, lipids, current medications, pregnancy status, hypoglycemia episodes, and access barriers.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["A1c", "fasting/random glucose or OGTT", "repeat confirmation if asymptomatic", "ketones/anion gap/pH/bicarbonate when symptomatic", "current medication and insulin access", "eGFR", "UACR", "BP/lipids", "hypoglycemia history", "pregnancy status"]
  });

  const crisisEndpoint = endpoint({
    id: `${prefix}_crisis_hypoglycemia_endpoint`,
    label: `${label}: DKA/HHS, severe hypoglycemia, dehydration, altered mental status, or infected foot wound needs urgent protocol care`,
    edgeLabel: "Emergency branch: ketosis/acidosis, vomiting, dehydration, Kussmaul respirations, altered mental status, severe hyperglycemia, severe hypoglycemia requiring assistance, SGLT2 ketotic symptoms, pregnancy hyperglycemia, or infected foot wound",
    sourceIds: unique([...crisis, ...soc]),
    criteria: criteria(`${prefix}_crisis_criteria`, `Use when ${label} has hyperglycemic crisis physiology, severe hypoglycemia, infected foot, pregnancy hyperglycemia, or unstable vital signs.`, ["symptoms", "exam", "vitals", "labs", "medications", "pregnancy_status", "workup_findings"], unique([...crisis, ...soc]), { criteria_options: criteriaRows }),
    action: "Route to ED/urgent monitored protocol: check glucose, beta-hydroxybutyrate or urine ketones, venous pH, bicarbonate, anion gap, electrolytes, creatinine, osmolality when HHS possible, ECG/potassium risk, infection/foot source, pregnancy status, mental status, and treat DKA/HHS or severe hypoglycemia before routine outpatient adjustment.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["glucose", "ketones", "pH/bicarbonate/anion gap", "potassium", "osmolality if HHS possible", "mental status", "volume status", "infection/foot findings", "hypoglycemia recurrence"]
  });

  const diagnosisEndpoint = endpoint({
    id: `${prefix}_diagnosis_classification_endpoint`,
    label: `${label}: confirm diabetes-range result and classify type before durable treatment choices`,
    edgeLabel: `Diagnostic branch: A1c/glucose threshold meets diabetes range or ${isType1 ? "autoimmune/insulin-deficient features need type 1/LADA confirmation" : "type 2 phenotype requires type 1/LADA and secondary-cause exclusions"}`,
    sourceIds: unique([...diag, ...soc]),
    criteria: criteria(`${prefix}_diagnosis_classification_criteria`, `Use when ${label} diagnostic thresholds and type-classification data are available.`, ["symptoms", "labs", "medications", "comorbidities", "demographics", "pregnancy_status", "workup_findings"], unique([...diag, ...soc]), { criteria_options: criteriaRows }),
    action: isType1
      ? "Confirm diabetes-range A1c/glucose and classify autoimmune insulin-deficient diabetes using presentation tempo, DKA/ketosis, weight loss/catabolic symptoms, islet autoantibodies, C-peptide interpreted with concurrent glucose, family/autoimmune history, and age; do not delay insulin when insulin deficiency or ketosis is present."
      : "Confirm diabetes-range A1c/glucose, repeat if asymptomatic, and classify likely type 2 diabetes while excluding type 1/LADA, steroid/stress hyperglycemia, pancreatic disease, pregnancy, monogenic diabetes, and DKA/HHS physiology; use phenotype, medications, ketones, C-peptide/autoantibodies when uncertain.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows
  });

  const treatmentEndpoint = endpoint({
    id: `${prefix}_treatment_endpoint`,
    label: isType1 ? "Type 1 diabetes: basal-bolus or pump insulin, ketone sick-day plan, glucagon, and hypoglycemia prevention" : "Type 2 diabetes: lifestyle, metformin or first-line comorbidity-directed therapy, and insulin when severe hyperglycemia/catabolism is present",
    edgeLabel: isType1
      ? "Treatment branch: type 1 diabetes confirmed or strongly likely, crisis excluded or treated, insulin access and hypoglycemia safety can be planned"
      : "Treatment branch: type 2 diabetes confirmed, crisis excluded or treated, A1c/glucose severity and cardiorenal comorbidities guide medication intensity",
    sourceIds: unique([...soc, ...crisis]),
    criteria: criteria(`${prefix}_treatment_criteria`, `Use when ${label} is confirmed/likely and treatment-safety data are available.`, ["labs", "medications", "comorbidities", "pregnancy_status", "workup_findings"], unique([...soc, ...crisis]), { criteria_options: criteriaRows }),
    action: isType1
      ? "Start or continue physiologic insulin with basal coverage plus mealtime/correction strategy or pump plan, ensure CGM/glucose monitoring and ketone testing, prescribe glucagon when severe hypoglycemia risk exists, teach sick-day rules and never stopping basal insulin without clinician direction, and set individualized A1c and hypoglycemia targets."
      : "Start individualized therapy with lifestyle and weight plan, DSMES, metformin when appropriate, and GLP-1/SGLT2 or other cardiorenal risk-reducing therapy when ASCVD/HF/CKD risk fits; consider insulin when A1c >10%, glucose >=300 mg/dL, catabolic symptoms, symptomatic hyperglycemia, or ketosis are present.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["A1c", "glucose/CGM pattern", "hypoglycemia", "medication access", "renal function", "weight", "sick-day plan", "follow-up interval"]
  });

  const riskModifierEndpoint = endpoint({
    id: `${prefix}_risk_modifier_review_endpoint`,
    label: isType1 ? "Type 1 modifiers: pregnancy, pump failure, SGLT2 use, recurrent hypoglycemia, access barriers, or uncertain LADA need clinician review" : "Type 2 modifiers: CKD/albuminuria, ASCVD/HF, pregnancy, eGFR limits, hypoglycemia risk, or cost/access changes therapy",
    edgeLabel: isType1
      ? "Modifier branch: pregnancy, recurrent severe hypoglycemia, pump/CGM failure, SGLT2-associated ketosis, low insulin access, or uncertain autoimmune classification"
      : "Modifier branch: UACR >=30, eGFR <60 or SGLT2 threshold review, ASCVD/HF, pregnancy, frailty, eGFR <30 metformin concern, hypoglycemia-prone regimen, or medication cost/access barrier",
    sourceIds: soc,
    criteria: criteria(`${prefix}_risk_modifier_criteria`, `Use when ${label} treatment depends on comorbidity, pregnancy, device, medication-safety, or access constraints.`, ["labs", "medications", "comorbidities", "pregnancy_status", "demographics", "workup_findings"], soc, { criteria_options: criteriaRows }),
    action: isType1
      ? "Escalate to endocrinology/diabetes technology review for pregnancy, recurrent level 2 hypoglycemia <54 mg/dL or severe hypoglycemia, pump failure, SGLT2-associated ketosis risk, unreliable insulin access, or uncertain type 1/LADA classification; document backup basal insulin, ketone supplies, glucagon, and device failure plan."
      : "Use clinician review for eGFR-restricted drugs, UACR >=30 mg/g kidney protection, eGFR <60 mL/min/1.73 m2 monitoring, eGFR >=20 mL/min/1.73 m2 SGLT2 eligibility, ASCVD/HF selection, pregnancy-compatible therapy, frailty/hypoglycemia goals, and cost/access barriers.",
    endpointType: "clinician_review_handoff",
    guidelineCutoffs: criteriaRows,
    reviewNeededReason: "Comorbidities, pregnancy, kidney function, hypoglycemia risk, device reliability, and medication access can change therapy and disposition."
  });

  const followupEndpoint = endpoint({
    id: `${prefix}_monitoring_followup_endpoint`,
    label: `${label}: monitoring, complication screening, de-escalation, and safety-net follow-up`,
    edgeLabel: "Follow-up branch: crisis absent/resolved, treatment plan active, A1c/glucose/hypoglycemia/kidney data have an owner, and complication screening or prevention plan is due",
    sourceIds,
    criteria: criteria(`${prefix}_followup_criteria`, `Use when ${label} can leave the acute branch with monitoring, complication screening, de-escalation, and safety-net instructions.`, ["labs", "medications", "follow_up_access", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Assign follow-up for A1c/glucose review, hypoglycemia and medication side effects, eGFR/UACR and BP/lipids, eye/foot/kidney complication screening, vaccines/prevention needs, DSMES/nutrition support, medication access, and return precautions for vomiting, ketones, dehydration, confusion, severe hypoglycemia, foot infection, pregnancy hyperglycemia, or inability to take insulin/medications.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["A1c/glucose log", "hypoglycemia", "eGFR/UACR", "BP/lipids", "eye/foot/kidney screening", "medication access", "DSMES/nutrition", "return precautions"]
  });

  const mimicEndpoint = endpoint({
    id: `${prefix}_mimic_endpoint`,
    label: `${label}: route to prediabetes, alternate diabetes type, stress/steroid hyperglycemia, pregnancy, or endocrine mimic when thresholds do not fit`,
    edgeLabel: "Alternate branch: prediabetes-range results only, discordant test, steroid/stress hyperglycemia, type 1/LADA versus type 2 mismatch, pregnancy hyperglycemia, pancreatic/monogenic diabetes, hypoglycemia/drug effect, or secondary endocrine cause fits better",
    sourceIds: sourceIdsForItems(differentials, sourceIds),
    criteria: criteria(`${prefix}_mimic_criteria`, `Use when ${label} thresholds are absent, discordant, or another diagnosis explains the glucose pattern better.`, ["symptoms", "vitals", "labs", "medications", "comorbidities", "pregnancy_status", "workup_findings"], sourceIdsForItems(differentials, sourceIds), { criteria_options: criteriaRows }),
    action: `Document which diabetes thresholds or type-classification findings are absent, then route to the appropriate alternate pathway: ${listText(differentials, "prediabetes, alternate diabetes type, steroid/stress hyperglycemia, pregnancy hyperglycemia, pancreatic/monogenic diabetes, hypoglycemia/drug effect, renal disease, infection, or secondary endocrine cause", 5)}.`,
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Glucose thresholds, diabetes type, medication effect, pregnancy, or another endocrine/acute illness cause changes the active pathway."
  });

  const managementAction = actionNode({
    id: `${prefix}_management_action`,
    label: `${label}: combine diagnostic classification, acute crisis safety, treatment, modifiers, monitoring, and follow-up`,
    edgeLabel: `${label} stable branch: diagnostic thresholds available, crisis physiology absent or treated, and treatment-safety data can guide management`,
    sourceIds,
    criteria: criteria(`${prefix}_management_criteria`, `Route stable ${label} through classification, treatment, comorbidity modifiers, complication monitoring, and safety-net follow-up.`, contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: `Use diagnostic classification, treatment intensity, medication/device safety, kidney/cardiovascular risk, hypoglycemia prevention, and follow-up as one plan. Local evidence reminders: ${listText([...tests, ...redFlags, ...dispositions, ...safetyChecks], `${label} tests, red flags, disposition rules, and safety checks`, 12)}.`,
    parallelActions: ["diagnostic and type classification", "DKA/HHS and hypoglycemia safety", "treatment intensity and medication access", "kidney/cardiovascular risk modifiers", "complication monitoring", "follow-up and return precautions"],
    guidelineCutoffs: criteriaRows,
    children: [diagnosisEndpoint, treatmentEndpoint, riskModifierEndpoint, followupEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: `${label}: choose missing-data, crisis, confirmed diabetes, modifier, follow-up, or mimic branch`,
    edgeLabel: "A1c/glucose thresholds, symptoms, ketones/acid-base status, medication context, kidney/cardiovascular risk, pregnancy status, hypoglycemia history, and access barriers are available",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, `Classify ${label} by diagnostic glucose thresholds, crisis physiology, diabetes type evidence, treatment severity, medication contraindications, comorbid risk, and follow-up safety.`, contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: `Choose from missing diabetes data, DKA/HHS/severe hypoglycemia emergency, confirmed ${label} management, comorbidity/modifier review, follow-up safety net, or alternate pathway.`,
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingDiabetesDataEndpoint, crisisEndpoint, managementAction, mimicEndpoint]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: `${label}: collect A1c/glucose, crisis labs, diabetes type evidence, medication safety, vitals, weight, kidney/cardiovascular data, and access barriers`,
    edgeLabel: `${label} evaluation: diabetes-range test, hyperglycemia symptoms, abnormal glucose pattern, ketosis risk, hypoglycemia, medication adjustment need, complication concern, or clinician-chosen diabetes workup`,
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, `Initial ${label} assessment requires diagnostic thresholds, acute crisis safety, medication context, comorbid risk, and follow-up access before nonurgent therapy changes.`, contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: `Measure blood pressure, measure heart rate, measure current weight, and document mental status. Obtain A1c, fasting/random glucose or OGTT result, symptoms, glucose/CGM log, ketones plus bicarbonate/pH/anion gap when acutely ill, eGFR, UACR, lipids, medication list, insulin or SGLT2 exposure, pregnancy status, hypoglycemia history, diabetes type evidence, foot/infection symptoms, and access barriers.`,
    parallelActions: ["measure blood pressure", "measure heart rate", "measure current weight", "document mental status", "A1c and plasma glucose criteria", "ketones/acid-base labs when symptomatic", "medication and insulin access", "eGFR/UACR/lipids", "pregnancy and hypoglycemia screen", "diabetes type evidence"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: `${label}: route by diagnostic glucose thresholds, crisis risk, diabetes type, treatment safety, complications, and follow-up`,
    sourceIds,
    criteria: criteria(`${prefix}_activate`, `Activate for known or suspected ${label}, diabetes-range A1c/glucose, symptoms of hyperglycemia, ketones/acidosis concern, medication titration, hypoglycemia, kidney/cardiovascular complication risk, or clinician-chosen diabetes evaluation.`, ["clinician_selected_module", "presenting_symptoms", "problem_list_or_diagnosis", "labs", "medications", "workup_findings"], sourceIds),
    action: `Route ${label} through missing-data, DKA/HHS or severe hypoglycemia escalation, diagnostic/type classification, treatment intensity, medication-safety modifiers, monitoring, de-escalation, follow-up, and safety-net endpoints.`,
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: isType1 ? "hand_polished_type_1_diabetes_pathway_needs_clinician_review" : "hand_polished_type_2_diabetes_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: isType1
      ? "ADA Standards of Care in Diabetes 2026, ADA Diagnosis and Classification of Diabetes 2026, 2024 hyperglycemic crises consensus report, CDC Diabetes Testing, and local module evidence rows"
      : "ADA Standards of Care in Diabetes 2026, ADA Diagnosis and Classification of Diabetes 2026, ADA hospital care guidance, 2024 hyperglycemic crises consensus report, CDC Diabetes Testing, and local module evidence rows",
    reviewNote: isType1
      ? "Type 1 diabetes tree is threshold-cited and patient-traversable; insulin pump/CGM settings, pregnancy glycemic targets, LADA classification, SGLT2 use, and local sick-day protocols require clinician governance."
      : "Type 2 diabetes tree is threshold-cited and patient-traversable; drug formulary, eGFR-specific prescribing, ASCVD/HF/CKD sequencing, pregnancy-compatible therapy, and local insulin protocols require clinician governance.",
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_diabetes_data", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingDiabetesDataEndpoint.id, expected_active_branch: missingDiabetesDataEndpoint.edgeLabel },
      { scenario_id: "dka_hhs_or_severe_hypoglycemia", major_pathway: "escalation_emergency_actions", expected_endpoint_id: crisisEndpoint.id, expected_active_branch: crisisEndpoint.edgeLabel },
      { scenario_id: "diagnosis_and_type_classification", major_pathway: "severity_risk_stratification", expected_endpoint_id: diagnosisEndpoint.id, expected_active_branch: diagnosisEndpoint.edgeLabel },
      { scenario_id: "stable_diabetes_treatment", major_pathway: "first_line_management", expected_endpoint_id: treatmentEndpoint.id, expected_active_branch: treatmentEndpoint.edgeLabel },
      { scenario_id: "pregnancy_kidney_access_modifier", major_pathway: "contraindications_special_populations", expected_endpoint_id: riskModifierEndpoint.id, expected_active_branch: riskModifierEndpoint.edgeLabel },
      { scenario_id: "alternate_glucose_pathway", major_pathway: "mimics_exclusions", expected_endpoint_id: mimicEndpoint.id, expected_active_branch: mimicEndpoint.edgeLabel },
      { scenario_id: "monitoring_after_treatment", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel },
      { scenario_id: "deescalation_or_goal_adjustment", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel },
      { scenario_id: "followup_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel }
    ],
    handPolishRequirements: isType1 ? [
      "diagnostic branch includes A1c/glucose diabetes thresholds and autoimmune/C-peptide classification",
      "emergency branch includes DKA beta-hydroxybutyrate, pH, bicarbonate, SGLT2, vomiting/dehydration, and altered mental status routing",
      "treatment branch includes insulin requirement, basal safety, glucagon, ketone sick-day rules, and hypoglycemia levels",
      "modifier branch covers pregnancy, pump failure, recurrent severe hypoglycemia, access barriers, and uncertain LADA classification"
    ] : [
      "diagnostic branch includes A1c/glucose diabetes thresholds and alternate-type exclusions",
      "emergency branch includes DKA/HHS, severe hypoglycemia, dehydration, altered mental status, and infected foot routing",
      "treatment branch includes A1c >10% or glucose >=300 mg/dL insulin escalation and cardiorenal medication selection",
      "modifier branch covers eGFR/UACR, ASCVD/HF/CKD, pregnancy, hypoglycemia, frailty, and cost/access barriers"
    ]
  });
}

function buildPrediabetesClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Prediabetes";
  const prefix = "prediabetes";
  const diag = ["ADA_DIAGNOSIS_2026", "CDC_DIABETES_TESTING_2024"];
  const prevention = ["ADA_SOC_2026", "CDC_NDPP_LIFESTYLE_2024"];
  const sourceIds = unique([...diag, ...prevention, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 10);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);
  const safetyChecks = firstItems(module, "safetyChecks", 6);

  const criteriaRows = [
    criterion({
      id: "prediabetes_thresholds",
      label: "Prediabetes diagnosis: A1c 5.7-6.4%, fasting glucose 100-125 mg/dL, or 2-hour 75-g OGTT 140-199 mg/dL",
      criteria_text: "Prediabetes is diagnosed by A1c 5.7-6.4%, fasting plasma glucose 100-125 mg/dL, or 2-hour 75-g OGTT glucose 140-199 mg/dL.",
      cutoffs: ["A1c 5.7-6.4%", "fasting glucose 100-125 mg/dL", "2-hour OGTT 140-199 mg/dL"],
      data_needed: ["A1c", "fasting plasma glucose", "2-hour 75-g OGTT", "repeat confirmation if discordant/asymptomatic"],
      source_ids: diag,
      source_section: "Prediabetes diagnostic criteria"
    }),
    criterion({
      id: "prediabetes_diabetes_thresholds",
      label: "Diabetes-range values: A1c >=6.5%, fasting glucose >=126 mg/dL, 2-hour OGTT >=200 mg/dL, or random glucose >=200 mg/dL with symptoms",
      criteria_text: "Diabetes-range values move the patient out of a prediabetes-only prevention pathway and into diabetes confirmation and treatment.",
      cutoffs: ["A1c >=6.5%", "fasting glucose >=126 mg/dL", "2-hour OGTT >=200 mg/dL", "random glucose >=200 mg/dL"],
      data_needed: ["A1c", "fasting plasma glucose", "2-hour OGTT glucose", "random plasma glucose", "classic symptoms", "repeat confirmation"],
      source_ids: diag,
      source_section: "Diabetes diagnostic criteria"
    }),
    criterion({
      id: "prediabetes_lifestyle_targets",
      label: "Prediabetes prevention: intensive lifestyle program targeting at least 7% weight loss and at least 150 minutes/week moderate activity",
      criteria_text: "Adults with prediabetes should be referred to an intensive lifestyle behavior change program modeled on the Diabetes Prevention Program, with goals of at least 7% weight loss and at least 150 minutes/week of moderate-intensity physical activity.",
      cutoffs: ["at least 7%", "at least 150 minutes/week"],
      data_needed: ["current weight", "BMI", "activity minutes/week", "nutrition access", "DPP/lifestyle program access", "readiness/barriers"],
      source_ids: prevention,
      source_section: "Prevention or delay of type 2 diabetes"
    }),
    criterion({
      id: "prediabetes_metformin_high_risk",
      label: "Prediabetes metformin consideration: age 25-59 years, BMI >=35 kg/m2, fasting glucose >=110 mg/dL, A1c >=6.0%, or prior GDM",
      criteria_text: "Metformin for diabetes prevention can be considered in high-risk adults with prediabetes, especially age 25-59 years, BMI >=35 kg/m2, fasting plasma glucose >=110 mg/dL, A1c >=6.0%, or prior gestational diabetes.",
      cutoffs: ["age 25-59 years", "BMI >=35 kg/m2", "fasting glucose >=110 mg/dL", "A1c >=6.0%"],
      data_needed: ["age", "BMI", "fasting glucose", "A1c", "history of gestational diabetes", "eGFR", "B12 risk", "pregnancy status"],
      source_ids: ["ADA_SOC_2026"],
      source_section: "Metformin prevention"
    }),
    criterion({
      id: "prediabetes_ndpp_eligibility",
      label: "CDC National DPP eligibility: age >=18, BMI >=25 or >=23 if Asian American, not pregnant, no type 1/type 2 diabetes, plus prediabetes-range result, prior GDM, or risk test >=5",
      criteria_text: "CDC National DPP lifestyle change program eligibility requires age 18 years or older, BMI 25 or higher (23 or higher if Asian American), no prior type 1/type 2 diabetes, not pregnant, and a qualifying prediabetes-range test, prior gestational diabetes, or risk test score of 5 or higher.",
      cutoffs: ["age >=18 years", "BMI >=25", "BMI >=23", "risk test >=5"],
      data_needed: ["age", "BMI", "Asian American status if relevant", "pregnancy status", "diabetes diagnosis status", "prediabetes test within past year", "prior GDM", "risk test score"],
      source_ids: ["CDC_NDPP_LIFESTYLE_2024"],
      source_section: "National DPP eligibility"
    }),
    criterion({
      id: "prediabetes_surveillance",
      label: "Prediabetes surveillance: test for type 2 diabetes at least yearly",
      criteria_text: "Adults and children diagnosed with prediabetes should be tested for type 2 diabetes every year; normal results after screening can generally be retested every 3 years.",
      cutoffs: ["every year", "every 3 years"],
      data_needed: ["last A1c/glucose date", "current result", "risk factors", "follow-up access"],
      source_ids: unique([...diag, ...prevention]),
      source_section: "Surveillance interval"
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: prediabetes thresholds, BMI/waist/BP, pregnancy status, medication risk, and prevention access",
    edgeLabel: "Missing exact prediabetes data: A1c/FPG/OGTT, symptoms, BMI/weight/waist, BP/lipids, pregnancy status, prior GDM, diabetes-range exclusion, medication causes, and lifestyle/metformin eligibility",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when glycemic classification or prevention eligibility cannot be determined.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document A1c, fasting glucose or 2-hour OGTT, classic symptoms, current weight/BMI and waist circumference, blood pressure, lipids, pregnancy status, prior GDM, medications such as glucocorticoids, kidney/liver context, activity level, nutrition access, DPP availability, metformin contraindications, and follow-up access.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["A1c", "fasting glucose or 2-hour OGTT", "classic symptoms", "BMI/weight", "waist circumference", "blood pressure", "lipids", "pregnancy status", "prior GDM", "medication causes", "DPP access", "metformin safety data"]
  });

  const missingGlycemiaEndpoint = endpoint({
    id: `${prefix}_missing_glycemia_endpoint`,
    label: "Missing data needed: A1c/FPG/OGTT, diabetes symptoms, BMI, pregnancy status, or DPP/metformin eligibility",
    edgeLabel: "Cannot separate normal, prediabetes, diabetes, pregnancy hyperglycemia, medication effect, or prevention intensity until glycemic and risk data are known",
    sourceIds,
    criteria: criteria(`${prefix}_missing_glycemia_criteria`, "Route here when exact prediabetes or diabetes-range data are unavailable.", contextDomains, sourceIds, { missing_any: ["A1c", "fasting glucose", "2-hour OGTT", "symptoms", "BMI", "pregnancy status", "prior GDM", "DPP/metformin eligibility"] }),
    action: "Obtain A1c, fasting plasma glucose or 75-g 2-hour OGTT when needed, repeat discordant/asymptomatic results, check symptoms, BMI/weight, waist, BP/lipids, pregnancy status, prior GDM, medication causes, and data for DPP eligibility or metformin prevention.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["A1c", "fasting glucose", "2-hour OGTT", "repeat confirmation if discordant", "symptoms", "BMI/weight", "pregnancy status", "prior GDM", "DPP eligibility", "metformin safety"]
  });

  const diabetesRangeEndpoint = endpoint({
    id: `${prefix}_diabetes_range_endpoint`,
    label: "Diabetes-range or symptomatic hyperglycemia: leave prevention-only branch and confirm diabetes pathway",
    edgeLabel: "Escalation branch: A1c >=6.5%, fasting glucose >=126 mg/dL, 2-hour OGTT >=200 mg/dL, random glucose >=200 mg/dL with symptoms, dehydration, pregnancy hyperglycemia, severe hypertension, or ASCVD symptoms",
    sourceIds: diag,
    criteria: criteria(`${prefix}_diabetes_range_criteria`, "Use when diabetes-range values or unstable symptoms require diagnostic confirmation or urgent diabetes/cardiometabolic evaluation.", ["symptoms", "vitals", "labs", "pregnancy_status", "workup_findings"], diag, { criteria_options: criteriaRows }),
    action: "Confirm diabetes according to A1c/glucose thresholds, assess for symptoms, dehydration, pregnancy hyperglycemia, ketones if clinically ill, and cardiopulmonary or severe hypertension red flags, then route to the diabetes or urgent cardiometabolic pathway rather than prevention-only counseling.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["repeat diabetes confirmation", "symptoms", "dehydration/ketones if ill", "blood pressure", "pregnancy status", "cardiopulmonary symptoms"]
  });

  const preventionEndpoint = endpoint({
    id: `${prefix}_lifestyle_prevention_endpoint`,
    label: "Prediabetes confirmed: DPP-style lifestyle plan, weight/activity goals, and yearly glycemic surveillance",
    edgeLabel: "Prediabetes branch: A1c 5.7-6.4%, fasting 100-125 mg/dL, or 2-hour OGTT 140-199 mg/dL without diabetes-range values or acute symptoms",
    sourceIds: prevention,
    criteria: criteria(`${prefix}_prevention_criteria`, "Use when prediabetes thresholds are met and diabetes-range or urgent features are absent.", ["labs", "vitals", "demographics", "comorbidities", "pregnancy_status", "follow_up_access"], prevention, { criteria_options: criteriaRows }),
    action: "Refer to an intensive DPP-style lifestyle program, set at least 7% weight-loss and at least 150 minutes/week moderate activity goals when appropriate, address sleep/OSA/fatty-liver/PCOS and cardiovascular risk factors, and retest for diabetes at least yearly.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["weight/BMI", "activity minutes/week", "A1c/FPG/OGTT interval", "blood pressure", "lipids", "liver/OSA/PCOS risks", "program access"]
  });

  const metforminEndpoint = endpoint({
    id: `${prefix}_metformin_review_endpoint`,
    label: "High-risk prediabetes: consider metformin only after renal, pregnancy, B12, and preference review",
    edgeLabel: "Metformin branch: age 25-59 years, BMI >=35 kg/m2, fasting glucose >=110 mg/dL, A1c >=6.0%, prior GDM, rising glycemia, or lifestyle program unavailable/insufficient",
    sourceIds: ["ADA_SOC_2026"],
    criteria: criteria(`${prefix}_metformin_criteria`, "Use when high-risk prediabetes features make metformin prevention a clinician-review option.", ["labs", "demographics", "pregnancy_status", "medications", "comorbidities", "workup_findings"], ["ADA_SOC_2026"], { criteria_options: criteriaRows }),
    action: "Review metformin prevention for high-risk prediabetes, especially age 25-59 years, BMI >=35 kg/m2, fasting glucose >=110 mg/dL, A1c >=6.0%, or prior GDM; confirm eGFR safety, pregnancy plans, GI tolerance, B12 risk, patient preference, and continued lifestyle intervention.",
    endpointType: "clinician_review_handoff",
    guidelineCutoffs: criteriaRows,
    reviewNeededReason: "Metformin prevention requires individualized renal, pregnancy, B12, tolerance, and preference review."
  });

  const mimicEndpoint = endpoint({
    id: `${prefix}_mimic_endpoint`,
    label: "Normal glycemia, medication/stress effect, pregnancy, or endocrine mimic: avoid labeling as prediabetes without repeatable thresholds",
    edgeLabel: "Alternate branch: normal repeated tests, acute illness/steroid hyperglycemia, pregnancy-context hyperglycemia, lab interference, hypoglycemia/drug effect, renal/hepatic disease, or secondary endocrine cause fits better",
    sourceIds: sourceIdsForItems(differentials, sourceIds),
    criteria: criteria(`${prefix}_mimic_criteria`, "Use when prediabetes thresholds are absent, discordant, nonrepeatable, or explained by another condition.", ["symptoms", "vitals", "labs", "medications", "pregnancy_status", "comorbidities", "workup_findings"], sourceIdsForItems(differentials, sourceIds), { criteria_options: criteriaRows }),
    action: `Document why prediabetes is not the active diagnosis and route to the more specific pathway: ${listText(differentials, "normal glycemia, diabetes, medication/stress hyperglycemia, pregnancy, hypoglycemia/drug effect, renal/hepatic disease, or secondary endocrine cause", 5)}.`,
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Discordant glycemia, medication effects, pregnancy, or another diagnosis changes classification."
  });

  const followupEndpoint = endpoint({
    id: `${prefix}_followup_safety_endpoint`,
    label: "Prediabetes follow-up: yearly testing, cardiometabolic risk ownership, and safety-net for diabetes symptoms",
    edgeLabel: "Follow-up branch: prevention plan chosen, diabetes-range values absent, risk-factor treatment and surveillance owner documented",
    sourceIds,
    criteria: criteria(`${prefix}_followup_criteria`, "Use when prediabetes prevention and surveillance can be assigned.", ["labs", "vitals", "follow_up_access", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Assign yearly diabetes testing, BP/lipid/weight follow-up, lifestyle program or nutrition/activity support, medication review, and return precautions for polyuria, polydipsia, weight loss, blurry vision, random glucose >=200 mg/dL symptoms, pregnancy hyperglycemia, dehydration, or cardiopulmonary symptoms.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["yearly A1c/FPG/OGTT", "weight/BMI/waist", "BP/lipids", "lifestyle program attendance", "metformin review if high risk", "return precautions"]
  });

  const managementAction = actionNode({
    id: `${prefix}_management_action`,
    label: "Prediabetes: combine threshold classification, prevention intensity, metformin review, risk-factor treatment, and surveillance",
    edgeLabel: "Stable prevention branch: prediabetes-range glycemia confirmed, diabetes-range and emergency features absent, prevention eligibility data available",
    sourceIds,
    criteria: criteria(`${prefix}_management_criteria`, "Route prediabetes through lifestyle prevention, high-risk metformin review, mimics, monitoring, and safety-net follow-up.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: `Use prevention thresholds, DPP eligibility, metformin risk criteria, cardiometabolic risk factors, and surveillance as one plan. Local evidence reminders: ${listText([...tests, ...redFlags, ...dispositions, ...safetyChecks], "prediabetes tests, red flags, disposition rules, and safety checks", 12)}.`,
    parallelActions: ["classify A1c/FPG/OGTT range", "refer to lifestyle prevention", "review weight/activity goals", "consider high-risk metformin", "treat BP/lipid/weight risks", "schedule yearly testing"],
    guidelineCutoffs: criteriaRows,
    children: [preventionEndpoint, metforminEndpoint, followupEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: "Prediabetes: choose missing-data, diabetes-range escalation, prevention, metformin-review, mimic, or follow-up branch",
    edgeLabel: "A1c/FPG/OGTT, symptoms, BMI/waist/BP/lipids, pregnancy status, prior GDM, medication context, and follow-up access are available",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Classify by prediabetes thresholds, diabetes-range exclusions, prevention eligibility, high-risk metformin criteria, medication/pregnancy mimics, and follow-up access.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Choose from missing glycemic data, diabetes-range escalation, prevention plan, metformin review, alternate diagnosis, or follow-up safety net.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingGlycemiaEndpoint, diabetesRangeEndpoint, managementAction, mimicEndpoint]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: "Prediabetes: collect glycemic thresholds, weight/BMI/waist, BP/lipids, pregnancy/prior GDM, medication causes, and prevention access",
    edgeLabel: "Prediabetes evaluation: abnormal A1c/FPG/OGTT, metabolic risk, prior GDM, overweight/obesity, PCOS/fatty liver/OSA, medication hyperglycemia, or clinician-chosen prevention workup",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial prediabetes assessment requires exact glycemic classification, cardiometabolic risk data, mimics, and prevention eligibility.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Measure blood pressure, measure heart rate, measure current weight, measure waist circumference, and document mental status. Obtain A1c, fasting glucose or 75-g OGTT when needed, symptoms, BMI, waist, lipids, pregnancy status, prior GDM, activity minutes/week, nutrition and DPP access, medication/steroid exposure, kidney function for metformin safety, and follow-up barriers.",
    parallelActions: ["measure blood pressure", "measure heart rate", "measure current weight", "measure waist circumference", "document mental status", "A1c/FPG/OGTT classification", "BMI and activity assessment", "lipids and cardiometabolic risk", "pregnancy/prior GDM review", "DPP/metformin eligibility"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "Prediabetes: route by A1c/FPG/OGTT thresholds, diabetes exclusion, prevention eligibility, metformin criteria, and follow-up",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for prediabetes-range A1c/FPG/OGTT, elevated diabetes risk, prior GDM, metabolic syndrome risk, abnormal screening, or clinician-chosen prevention evaluation.", ["clinician_selected_module", "labs", "vitals", "demographics", "problem_list_or_diagnosis", "workup_findings"], sourceIds),
    action: "Route prediabetes through missing-data, diabetes-range escalation, DPP-style lifestyle intervention, high-risk metformin review, mimics/exclusions, surveillance, follow-up, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: "hand_polished_prediabetes_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: "ADA Standards of Care in Diabetes 2026, ADA Diagnosis and Classification of Diabetes 2026, CDC Diabetes Testing, CDC National DPP resources, and local module evidence rows",
    reviewNote: "Prediabetes tree is threshold-cited and patient-traversable; local lifestyle program availability, metformin prevention governance, pregnancy context, and cardiometabolic risk treatment require clinician review.",
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_glycemia", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingGlycemiaEndpoint.id, expected_active_branch: missingGlycemiaEndpoint.edgeLabel },
      { scenario_id: "diabetes_range_or_urgent_symptoms", major_pathway: "escalation_emergency_actions", expected_endpoint_id: diabetesRangeEndpoint.id, expected_active_branch: diabetesRangeEndpoint.edgeLabel },
      { scenario_id: "prediabetes_threshold_classification", major_pathway: "severity_risk_stratification", expected_endpoint_id: preventionEndpoint.id, expected_active_branch: preventionEndpoint.edgeLabel },
      { scenario_id: "lifestyle_prevention", major_pathway: "first_line_management", expected_endpoint_id: preventionEndpoint.id, expected_active_branch: preventionEndpoint.edgeLabel },
      { scenario_id: "metformin_or_pregnancy_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: metforminEndpoint.id, expected_active_branch: metforminEndpoint.edgeLabel },
      { scenario_id: "mimic_or_normal_glycemia", major_pathway: "mimics_exclusions", expected_endpoint_id: mimicEndpoint.id, expected_active_branch: mimicEndpoint.edgeLabel },
      { scenario_id: "prevention_monitoring", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel },
      { scenario_id: "deescalate_to_surveillance", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel },
      { scenario_id: "followup_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel }
    ],
    handPolishRequirements: [
      "classification includes A1c 5.7-6.4%, FPG 100-125, and 2-hour OGTT 140-199 mg/dL",
      "diabetes escalation includes A1c >=6.5%, FPG >=126, 2-hour OGTT >=200, and random >=200 mg/dL with symptoms",
      "prevention includes at least 7% weight loss and at least 150 minutes/week activity targets",
      "metformin review includes age 25-59, BMI >=35, FPG >=110, A1c >=6.0, and prior GDM"
    ]
  });
}

function buildMetabolicSyndromeClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Metabolic Syndrome";
  const prefix = "metabolic_syndrome";
  const nhlbi = ["NHLBI_METABOLIC_SYNDROME"];
  const diag = ["CDC_DIABETES_TESTING_2024", "ADA_DIAGNOSIS_2026"];
  const soc = ["ADA_SOC_2026", "CDC_NDPP_LIFESTYLE_2024"];
  const sourceIds = unique([...nhlbi, ...diag, ...soc, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 10);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);
  const safetyChecks = firstItems(module, "safetyChecks", 6);

  const criteriaRows = [
    criterion({
      id: "metabolic_syndrome_three_of_five",
      label: "Metabolic syndrome diagnosis: 3 or more of 5 cardiometabolic criteria",
      criteria_text: "Metabolic syndrome is diagnosed when at least 3 of 5 criteria are present: abdominal obesity, elevated triglycerides, low HDL cholesterol, elevated blood pressure, and elevated fasting glucose or treatment for high glucose.",
      cutoffs: ["3 or more", "5 criteria"],
      data_needed: ["waist circumference", "triglycerides", "HDL cholesterol", "blood pressure", "fasting glucose", "medication treatment status"],
      source_ids: nhlbi,
      source_section: "Metabolic syndrome diagnostic criteria"
    }),
    criterion({
      id: "metabolic_syndrome_waist_cutoffs",
      label: "Abdominal obesity criterion: waist >40 inches in men or >35 inches in women, with race/ethnicity-specific cutoffs when applicable",
      criteria_text: "NHLBI describes abdominal obesity as waist circumference more than 40 inches for men and 35 inches for women, while noting that different values may be used depending on race and ethnicity.",
      cutoffs: [">40 inches", ">35 inches"],
      data_needed: ["waist circumference", "sex", "race/ethnicity-specific cutoff if applicable", "BMI", "measurement method"],
      source_ids: nhlbi,
      source_section: "Waist criterion"
    }),
    criterion({
      id: "metabolic_syndrome_bp_cutoff",
      label: "Blood pressure criterion: consistently >=130/85 mm Hg or treated hypertension",
      criteria_text: "Blood pressure consistently 130/85 mm Hg or higher, or treatment for hypertension, counts as one metabolic syndrome criterion.",
      cutoffs: [">=130/85 mm Hg", "130/85 mmHg"],
      data_needed: ["systolic BP", "diastolic BP", "repeat BP", "hypertension medication"],
      source_ids: nhlbi,
      source_section: "Blood pressure criterion"
    }),
    criterion({
      id: "metabolic_syndrome_glucose_cutoffs",
      label: "Glucose criterion: fasting glucose 100-125 mg/dL is prediabetes; >=126 mg/dL may indicate diabetes or treatment for high glucose",
      criteria_text: "Fasting glucose between 100-125 mg/dL indicates high blood sugar/prediabetes; fasting glucose 126 mg/dL or higher may indicate diabetes and changes the active pathway.",
      cutoffs: ["fasting glucose 100-125 mg/dL", "fasting glucose >=126 mg/dL"],
      data_needed: ["fasting glucose", "A1c if available", "diabetes medications", "classic symptoms", "repeat confirmation"],
      source_ids: unique([...nhlbi, ...diag]),
      source_section: "Blood sugar criterion"
    }),
    criterion({
      id: "metabolic_syndrome_lipid_cutoffs",
      label: "Lipid criteria: HDL <40 mg/dL in men or <50 mg/dL in women; triglycerides >=150 mg/dL or treatment",
      criteria_text: "Low HDL cholesterol is lower than 40 mg/dL for men or lower than 50 mg/dL for women; triglycerides consistently more than 150 mg/dL, or treatment for high triglycerides, count toward metabolic syndrome.",
      cutoffs: ["HDL <40 mg/dL", "HDL <50 mg/dL", "triglycerides >=150 mg/dL", "triglycerides >150 mg/dL"],
      data_needed: ["HDL cholesterol", "triglycerides", "lipid medication", "fasting status", "sex"],
      source_ids: nhlbi,
      source_section: "Cholesterol and triglyceride criteria"
    }),
    criterion({
      id: "metabolic_syndrome_diabetes_and_ascvd_red_flags",
      label: "Escalate beyond routine prevention for diabetes-range glycemia, severe hypertension, ASCVD symptoms, pregnancy hyperglycemia, dehydration, or altered mental status",
      criteria_text: "Metabolic syndrome is a risk-factor diagnosis; diabetes-range glycemia, severe hypertension, cardiopulmonary/ASCVD symptoms, pregnancy-context hyperglycemia, dehydration, or altered mental status require urgent diagnostic or acute-care routing.",
      cutoffs: ["A1c >=6.5%", "fasting glucose >=126 mg/dL", "random glucose >=200 mg/dL", "blood pressure >=180/120 mm Hg"],
      data_needed: ["A1c", "fasting/random glucose", "classic symptoms", "blood pressure", "chest pain/dyspnea/neuro symptoms", "pregnancy status", "hydration/mental status"],
      source_ids: unique([...diag, ...soc, ...nhlbi]),
      source_section: "Escalation criteria"
    }),
    criterion({
      id: "metabolic_syndrome_prevention_targets",
      label: "Risk reduction: DPP-style activity/weight plan, BP/lipid/glucose treatment, and surveillance based on active criteria",
      criteria_text: "Management focuses on treating each active criterion, diabetes prevention when prediabetes is present, weight/activity counseling, BP/lipid risk reduction, and surveillance for diabetes and cardiovascular disease.",
      cutoffs: ["at least 150 minutes/week", "at least 7%"],
      data_needed: ["active criteria count", "BMI/weight", "activity minutes/week", "blood pressure", "lipids", "glucose/A1c", "ASCVD risk", "sleep apnea/fatty liver/PCOS context"],
      source_ids: unique([...soc, ...nhlbi, "CDC_NDPP_LIFESTYLE_2024"]),
      source_section: "Treatment and risk reduction"
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: waist, BP, fasting glucose/A1c, HDL, triglycerides, medications, symptoms, and risk context",
    edgeLabel: "Missing exact metabolic-syndrome data: waist/sex/race context, BP, fasting glucose or A1c, HDL, triglycerides, medication treatment status, BMI/weight, pregnancy status, ASCVD symptoms, and follow-up access",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when the five metabolic syndrome criteria or escalation context cannot be extracted.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document waist circumference with sex and race/ethnicity context, blood pressure, fasting glucose and/or A1c, HDL, triglycerides, medication treatment for BP/lipids/glucose, BMI/current weight, heart rate and mental status, pregnancy status, ASCVD symptoms, sleep apnea/fatty-liver/PCOS context, current medications, and follow-up access.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["waist circumference with sex/race context", "blood pressure", "fasting glucose or A1c", "HDL cholesterol", "triglycerides", "BP/lipid/glucose medications", "BMI/weight", "pregnancy status", "ASCVD symptoms", "follow-up access"]
  });

  const missingCriteriaEndpoint = endpoint({
    id: `${prefix}_missing_criteria_endpoint`,
    label: "Missing data needed: the five metabolic syndrome criteria and emergency exclusions",
    edgeLabel: "Cannot count criteria or route urgent diabetes/BP/ASCVD risks until waist, BP, fasting glucose, HDL, triglycerides, treatment status, symptoms, and pregnancy context are known",
    sourceIds,
    criteria: criteria(`${prefix}_missing_criteria_criteria`, "Route here when exact metabolic syndrome criteria or escalation exclusions are unavailable.", contextDomains, sourceIds, { missing_any: ["waist circumference", "blood pressure", "fasting glucose", "HDL cholesterol", "triglycerides", "medication treatment status", "ASCVD symptoms", "pregnancy status"] }),
    action: "Measure waist circumference, blood pressure, heart rate, weight/BMI, and mental status; obtain fasting glucose or A1c, HDL, triglycerides, medication treatment history, ASCVD symptom screen, pregnancy status, and prior diabetes/prediabetes history before counting criteria.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["waist circumference", "blood pressure", "fasting glucose/A1c", "HDL cholesterol", "triglycerides", "medication treatment status", "ASCVD symptoms", "pregnancy status", "weight/BMI"]
  });

  const urgentEndpoint = endpoint({
    id: `${prefix}_urgent_cardiometabolic_endpoint`,
    label: "Urgent cardiometabolic route: diabetes-range symptomatic hyperglycemia, severe BP, ASCVD symptoms, pregnancy hyperglycemia, dehydration, or altered mental status",
    edgeLabel: "Escalation branch: A1c >=6.5%, fasting glucose >=126 mg/dL or random glucose >=200 mg/dL with symptoms, BP around >=180/120 mm Hg or end-organ symptoms, chest pain, dyspnea, neurologic symptoms, pregnancy hyperglycemia, dehydration, or altered mental status",
    sourceIds: unique([...diag, ...soc, ...nhlbi]),
    criteria: criteria(`${prefix}_urgent_criteria`, "Use when metabolic syndrome workup reveals diabetes-range symptomatic glycemia, severe hypertension, ASCVD symptoms, pregnancy concern, or unstable physiology.", ["symptoms", "exam", "vitals", "labs", "pregnancy_status", "workup_findings"], unique([...diag, ...soc, ...nhlbi]), { criteria_options: criteriaRows }),
    action: "Route to urgent diabetes, hypertension, cardiovascular, or pregnancy evaluation before routine metabolic-syndrome counseling; check glucose, ketones/acid-base if ill, repeat BP with end-organ symptom assessment, ECG/troponin or stroke evaluation when symptoms fit, pregnancy status, and disposition needs.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["blood pressure and end-organ symptoms", "glucose/A1c", "ketones/acid-base if ill", "ASCVD symptoms", "pregnancy status", "mental status", "disposition"]
  });

  const diagnosisEndpoint = endpoint({
    id: `${prefix}_criteria_count_endpoint`,
    label: "Metabolic syndrome confirmed when 3 or more criteria are present",
    edgeLabel: "Criteria branch: at least 3 of waist, triglyceride, HDL, BP, and fasting glucose/treatment criteria are present",
    sourceIds: nhlbi,
    criteria: criteria(`${prefix}_criteria_count_criteria`, "Use when all five criteria can be counted.", ["exam", "vitals", "labs", "medications", "demographics", "workup_findings"], nhlbi, { criteria_options: criteriaRows }),
    action: "Count all five criteria: waist >40 inches in men or >35 inches in women unless race/ethnicity-specific threshold applies, triglycerides >=150 mg/dL or treated, HDL <40 mg/dL in men or <50 mg/dL in women or treated, BP >=130/85 mm Hg or treated, and fasting glucose >=100 mg/dL or treated. Document the exact criteria present and whether the count is 3 or more.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows
  });

  const riskReductionEndpoint = endpoint({
    id: `${prefix}_risk_reduction_endpoint`,
    label: "Metabolic syndrome management: treat active BP, lipid, glucose, weight, activity, and sleep/fatty-liver risks",
    edgeLabel: "Management branch: metabolic syndrome confirmed or near-threshold high-risk pattern without urgent diabetes/BP/ASCVD symptoms",
    sourceIds: unique([...nhlbi, ...soc, "CDC_NDPP_LIFESTYLE_2024"]),
    criteria: criteria(`${prefix}_risk_reduction_criteria`, "Use when active criteria can be targeted with outpatient risk reduction and surveillance.", ["vitals", "labs", "medications", "comorbidities", "follow_up_access", "workup_findings"], unique([...nhlbi, ...soc, "CDC_NDPP_LIFESTYLE_2024"]), { criteria_options: criteriaRows }),
    action: "Treat each active criterion: weight and waist reduction plan, at least 150 minutes/week activity when safe, nutrition plan, BP treatment, lipid/ASCVD risk management, prediabetes/diabetes surveillance, sleep apnea/fatty-liver/PCOS assessment when relevant, and medication review for secondary causes.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["waist/BMI/weight", "blood pressure", "fasting glucose/A1c", "HDL/triglycerides", "activity minutes", "ASCVD risk", "sleep apnea/fatty liver/PCOS", "medication effects"]
  });

  const mimicEndpoint = endpoint({
    id: `${prefix}_mimic_endpoint`,
    label: "Mimic or fewer than 3 criteria: avoid metabolic syndrome label and treat the active abnormality",
    edgeLabel: "Alternate branch: fewer than 3 criteria, race/ethnicity waist threshold changes classification, pregnancy or medication effect, secondary endocrine disease, acute illness, or isolated lipid/BP/glucose abnormality better explains findings",
    sourceIds: sourceIdsForItems(differentials, sourceIds),
    criteria: criteria(`${prefix}_mimic_criteria`, "Use when metabolic syndrome criteria are not met or another diagnosis explains the findings better.", ["exam", "vitals", "labs", "medications", "pregnancy_status", "comorbidities", "workup_findings"], sourceIdsForItems(differentials, sourceIds), { criteria_options: criteriaRows }),
    action: `Document the criteria count and route to the active abnormality or competing diagnosis: ${listText(differentials, "isolated hypertension, dyslipidemia, prediabetes/diabetes, medication effect, pregnancy, secondary endocrine cause, or acute illness", 5)}.`,
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Criteria count, waist threshold choice, pregnancy, medication effect, or secondary disease changes classification."
  });

  const followupEndpoint = endpoint({
    id: `${prefix}_followup_safety_endpoint`,
    label: "Metabolic syndrome follow-up: criteria trend, ASCVD prevention, diabetes surveillance, and urgent symptom safety-net",
    edgeLabel: "Follow-up branch: no urgent symptoms, active criteria and risk-factor owners documented, surveillance interval and return precautions assigned",
    sourceIds,
    criteria: criteria(`${prefix}_followup_criteria`, "Use when metabolic syndrome or component risks have an outpatient prevention and monitoring owner.", ["labs", "vitals", "medications", "follow_up_access", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Assign follow-up for waist/weight, BP, fasting glucose/A1c, HDL/triglycerides, ASCVD risk, sleep/fatty-liver/OSA/PCOS context, medication adherence/adverse effects, and safety-net for chest pain, dyspnea, neurologic symptoms, BP emergency symptoms, diabetes symptoms, dehydration, or pregnancy hyperglycemia.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["criteria count trend", "weight/waist", "BP", "glucose/A1c", "HDL/triglycerides", "ASCVD risk", "diabetes surveillance", "return precautions"]
  });

  const managementAction = actionNode({
    id: `${prefix}_management_action`,
    label: "Metabolic syndrome: count five criteria, target each active risk factor, and assign surveillance",
    edgeLabel: "Stable metabolic branch: waist, BP, fasting glucose, HDL, triglycerides, and treatment status are available and urgent symptoms are absent",
    sourceIds,
    criteria: criteria(`${prefix}_management_criteria`, "Route metabolic syndrome through criteria count, component treatment, mimic review, monitoring, and safety-net follow-up.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: `Count criteria and treat active risks rather than using the label alone. Local evidence reminders: ${listText([...tests, ...redFlags, ...dispositions, ...safetyChecks], "metabolic syndrome tests, red flags, disposition rules, and safety checks", 12)}.`,
    parallelActions: ["count 5 criteria", "treat weight/waist risk", "treat BP risk", "treat lipid risk", "classify glucose risk", "assign ASCVD/diabetes surveillance"],
    guidelineCutoffs: criteriaRows,
    children: [diagnosisEndpoint, riskReductionEndpoint, followupEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: "Metabolic syndrome: choose missing-data, urgent cardiometabolic, criteria-count, risk-reduction, mimic, or follow-up branch",
    edgeLabel: "Waist, BP, fasting glucose/A1c, HDL, triglycerides, medications, symptoms, pregnancy status, and follow-up access are available",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Classify by the five metabolic syndrome criteria, diabetes/hypertension/ASCVD red flags, treatment status, secondary causes, and follow-up access.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Choose from missing criteria, urgent cardiometabolic escalation, criteria count, component risk reduction, alternate diagnosis, or follow-up safety net.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingCriteriaEndpoint, urgentEndpoint, managementAction, mimicEndpoint]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: "Metabolic syndrome: measure waist, BP, weight, mental status, fasting glucose/A1c, HDL, triglycerides, medications, and ASCVD symptoms",
    edgeLabel: "Metabolic syndrome evaluation: central obesity, hypertension, dyslipidemia, prediabetes/diabetes risk, fatty liver/OSA/PCOS, medication effect, or clinician-chosen cardiometabolic workup",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial metabolic syndrome assessment requires all five criteria plus urgent symptom exclusions and secondary-cause context.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Measure waist circumference, blood pressure, heart rate, current weight, and mental status. Obtain fasting glucose or A1c, HDL, triglycerides, medication/treatment status for BP/lipids/glucose, pregnancy status, ASCVD symptom screen, sleep apnea/fatty-liver/PCOS context, secondary endocrine or medication causes, and follow-up access.",
    parallelActions: ["measure waist circumference", "measure blood pressure", "measure heart rate", "measure current weight", "document mental status", "fasting glucose/A1c", "HDL and triglycerides", "medication treatment status", "ASCVD symptom screen", "secondary cause and pregnancy review"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "Metabolic syndrome: route by five criteria, urgent cardiometabolic exclusions, component treatment, and surveillance",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for central obesity, elevated BP, dyslipidemia, prediabetes/high glucose, cardiometabolic risk clustering, fatty liver/OSA/PCOS risk, or clinician-chosen metabolic syndrome evaluation.", ["clinician_selected_module", "vitals", "labs", "exam", "problem_list_or_diagnosis", "workup_findings"], sourceIds),
    action: "Route metabolic syndrome through missing-data, urgent cardiometabolic escalation, five-criterion diagnosis, active risk-factor treatment, mimic review, monitoring, follow-up, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: "hand_polished_metabolic_syndrome_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: "NHLBI Metabolic Syndrome Diagnosis, CDC Diabetes Testing, ADA Standards of Care in Diabetes 2026, CDC National DPP resources, and local module evidence rows",
    reviewNote: "Metabolic syndrome tree is threshold-cited and patient-traversable; race/ethnicity waist cutoffs, ASCVD-risk calculations, lipid/BP medication choices, pregnancy, and secondary-cause workup require clinician governance.",
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_five_criteria", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingCriteriaEndpoint.id, expected_active_branch: missingCriteriaEndpoint.edgeLabel },
      { scenario_id: "urgent_cardiometabolic_risk", major_pathway: "escalation_emergency_actions", expected_endpoint_id: urgentEndpoint.id, expected_active_branch: urgentEndpoint.edgeLabel },
      { scenario_id: "three_of_five_criteria", major_pathway: "severity_risk_stratification", expected_endpoint_id: diagnosisEndpoint.id, expected_active_branch: diagnosisEndpoint.edgeLabel },
      { scenario_id: "risk_reduction_plan", major_pathway: "first_line_management", expected_endpoint_id: riskReductionEndpoint.id, expected_active_branch: riskReductionEndpoint.edgeLabel },
      { scenario_id: "waist_threshold_or_secondary_cause_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: mimicEndpoint.id, expected_active_branch: mimicEndpoint.edgeLabel },
      { scenario_id: "fewer_than_three_or_mimic", major_pathway: "mimics_exclusions", expected_endpoint_id: mimicEndpoint.id, expected_active_branch: mimicEndpoint.edgeLabel },
      { scenario_id: "component_monitoring", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel },
      { scenario_id: "criteria_improve_surveillance", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel },
      { scenario_id: "followup_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel }
    ],
    handPolishRequirements: [
      "diagnostic branch requires 3 or more of 5 criteria",
      "criteria include waist >40 inches men/>35 inches women, BP >=130/85, glucose >=100, HDL <40 men/<50 women, and triglycerides >=150",
      "urgent branch routes diabetes-range glycemia, severe hypertension, ASCVD symptoms, pregnancy hyperglycemia, dehydration, and altered mental status",
      "management targets each active component and assigns diabetes/ASCVD surveillance"
    ]
  });
}

function finalizeClinicalPathwayTree({
  module,
  sourceById,
  label,
  version,
  status,
  sourceIds,
  criteriaRows,
  tests,
  redFlags,
  differentials,
  dispositions,
  root,
  sourceMaterial,
  reviewNote,
  syntheticScenarios,
  handPolishRequirements
}) {
  const activationRules = {};
  const allNodeSourceIds = [];
  const collect = (entry) => {
    allNodeSourceIds.push(...(entry.source_ids || []), ...(entry.criteria?.source_ids || []));
    if (entry.criteria) activationRules[entry.id] = entry.criteria;
    for (const child of entry.children || []) collect(child);
  };
  collect(root);
  const sourceThresholds = sourceThresholdsFromCriteria(criteriaRows);
  const localEvidenceSourceIds = sourceIdsForItems([...tests, ...redFlags, ...differentials, ...dispositions], sourceIds);
  const finalSourceIds = unique([...sourceIds, ...localEvidenceSourceIds, ...allNodeSourceIds, ...sourceThresholds.flatMap((row) => row.source_ids || [])]);

  return {
    schema: "clinical_pathway_tree_v1",
    workupId: module.id,
    workup_id: module.id,
    title: label,
    version,
    status,
    source_ids: finalSourceIds,
    source_metadata: sourceRowsForTree(finalSourceIds, sourceById),
    provenance: {
      generated_by: "scripts/hand-polish-clinical-pathway-trees.js",
      generated_at: `${auditDate}T00:00:00.000Z`,
      update_scope: "clinical_pathway_tree_v1 only",
      source_material: sourceMaterial,
      review_note: reviewNote
    },
    source_thresholds: sourceThresholds,
    traversable_context: buildTraversableContext(module, finalSourceIds, tests, criteriaRows),
    activationRules,
    root,
    synthetic_patient_scenarios: syntheticScenarios,
    audit_requirements: {
      required_domains: requiredPathwayDomains,
      hand_polish_requirements: handPolishRequirements
    }
  };
}

function enrichModule(module) {
  const curatedRows = curatedCutoffCriteria[module.id] || [];
  if (!curatedRows.length) return module;
  const existing = Array.isArray(module.clinical_cutoff_criteria) ? module.clinical_cutoff_criteria : [];
  const byId = new Map(existing.map((row) => [row.id, row]));
  curatedRows.forEach((row) => byId.set(row.id, criterion(row)));
  return {
    ...module,
    clinical_cutoff_criteria: [...byId.values()],
    clinical_cutoff_review: {
      status: "source_backed_cutoff_enrichment_added",
      reviewed_on: auditDate,
      review_note: "Cutoff rows were added because the prior module evidence did not expose enough explicit guideline thresholds for pathway traversal."
    }
  };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const sourceRegistry = JSON.parse(readFileSync(sourceRegistryPath, "utf8"));
  const sources = Array.isArray(sourceRegistry) ? sourceRegistry : sourceRegistry.sources || [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const changed = [];

  for (const file of complaintModuleFiles()) {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const original = JSON.stringify(raw, null, 2);
    const baseModule = raw.module || raw;
    const module = enrichModule(baseModule);
    const clinicalPathway = module.id === "fever_infection_sepsis_v1"
      ? buildAdultSepsisClinicalPathwayTree(module, sourceById)
      : module.id === "hyperglycemia_possible_dka_v1"
        ? buildAdultDkaHhsClinicalPathwayTree(module, sourceById)
        : module.id === "pediatric_dka_hhs_hyperglycemia_v1"
          ? buildPediatricDkaHhsClinicalPathwayTree(module, sourceById)
          : ["addisons_disease_v1", "adrenal_insufficiency_v1"].includes(module.id)
            ? buildAdrenalInsufficiencyClinicalPathwayTree(module, sourceById)
            : module.id === "hypopituitarism_v1"
              ? buildHypopituitarismClinicalPathwayTree(module, sourceById)
              : module.id === "gestational_diabetes_v1"
                ? buildGestationalDiabetesClinicalPathwayTree(module, sourceById)
                : module.id === "type_1_diabetes_mellitus_v1"
                  ? buildDiabetesMellitusClinicalPathwayTree(module, sourceById, "type1")
                  : module.id === "type_2_diabetes_mellitus_v1"
                    ? buildDiabetesMellitusClinicalPathwayTree(module, sourceById, "type2")
                    : module.id === "prediabetes_v1"
                      ? buildPrediabetesClinicalPathwayTree(module, sourceById)
                      : module.id === "metabolic_syndrome_v1"
                        ? buildMetabolicSyndromeClinicalPathwayTree(module, sourceById)
                        : buildCompactClinicalPathwayTree(module, sourceById);
    const nextModule = { ...module, clinical_pathway_tree_v1: clinicalPathway };
    const nextRaw = raw.module ? { ...raw, module: nextModule } : nextModule;
    const next = `${JSON.stringify(nextRaw, null, 2)}\n`;
    if (`${original}\n` !== next) {
      changed.push(file);
      if (!checkOnly) writeFileSync(file, next, "utf8");
    }
  }

  if (checkOnly && changed.length) {
    throw new Error(`clinical_pathway_tree_v1 is stale in ${changed.length} modules. Run npm run generate:clinical-pathways.`);
  }

  console.log(`${checkOnly ? "Verified" : "Hand-polished"} compact clinical_pathway_tree_v1 for ${complaintModuleFiles().length} complaint modules${changed.length ? ` (${changed.length} changed)` : ""}.`);
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
