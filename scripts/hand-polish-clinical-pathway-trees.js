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

const cutoffUnits = "(?:mg/dL|mg/L|g/L|mmol/L|mEq/L|mIU/L|mU/L|ng/mL|pg/mL|ug/L|mg/g|mcg/mg|mm Hg|mL/kg|mg/kg|g/kg|kg/m2|mL/min(?:/1\\.73\\s*m2)?|mL|hours?|days?|weeks?|months?|years?|cm|mm|ms|seconds?|minutes?|breaths/minute|x10\\^9/L|%|C|ULN|LLN|mOsm/kg|bpm|IU/L|U/L|mcg/dL|ug/dL|mcg/day|mcg|g|mg|kg|cycles/year|measurements?|collections?|samples?|percent|percentile)";
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
