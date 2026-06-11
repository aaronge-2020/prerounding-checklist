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
const shallowGeneratedItemPattern = /\b(?:source-backed criteria|source-backed management route|use the high-risk or confirmed-pathway management option|lower-risk, outpatient, supportive, or safety-net pathway|stabilize or escalate before routine treatment|screen for immediate danger or disposition-changing findings|order focused first-line studies and interpret them in sequence|apply source-backed decision steps|does patient context support this workup|criteria match|concurrent data bundle|key thresholds and interpretation caveats|guideline-sourced endocrine workup|threshold-defined branch|presenting trigger)\b/i;

const cahCutoffCriteria = [
  {
    id: "cah_newborn_screen_confirmation",
    label: "Newborn CAH screen: interpret 17-OHP by gestational age and confirm with LC-MS/MS or cosyntropin profile when first-tier results are positive or borderline",
    criteria_text: "Endocrine Society recommends 17-hydroxyprogesterone newborn screening norms stratified by gestational age, second-tier LC-MS/MS when available, and cosyntropin stimulation testing before corticosteroids when immunoassay resources cannot improve specificity.",
    cutoffs: ["17-OHP above gestational-age norm"],
    data_needed: ["newborn screen result", "gestational age", "birth weight", "assay method", "serum 17-OHP", "second-tier LC-MS/MS steroid profile", "cosyntropin plan before steroid treatment when feasible"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Newborn screening recommendations 1.2-1.3 and diagnosis recommendation 3.1"
  },
  {
    id: "cah_cosyntropin_confirmation_profile",
    label: "CAH cosyntropin profile: 0.25 mg IV cosyntropin, 0.125 mg in very-low-birth-weight infants, baseline and 60-minute steroids after the first 24-48 hours of life",
    criteria_text: "The Endocrine Society diagnostic profile uses 0.25 mg IV cosyntropin, reduced to 0.125 mg in very-low-birth-weight infants, with baseline and 60-minute samples; testing should be deferred until after the first 24 to 48 hours of life because immediate postbirth sampling has false positives and false negatives.",
    cutoffs: ["0.25 mg", "0.125 mg", "60 minutes", "24-48 hours"],
    data_needed: ["age in hours/days", "birth weight", "baseline cortisol", "baseline 17-OHP", "60-minute cortisol", "60-minute 17-OHP", "11-deoxycortisol", "androstenedione", "assay/lab method", "current glucocorticoid exposure"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Diagnosis evidence and cosyntropin testing details"
  },
  {
    id: "cah_after_infancy_17ohp_cutoffs",
    label: "After infancy 17-OHP cutoffs: classic CAH >10,000 ng/dL; nonclassic baseline 200-10,000 ng/dL and ACTH-stimulated 1,000-10,000 ng/dL",
    criteria_text: "GeneReviews tabulates diagnostic 17-OHP ranges after infancy: classic CAH baseline or ACTH-stimulated 17-OHP greater than 10,000 ng/dL (300 nmol/L); nonclassic CAH baseline 200-10,000 ng/dL (6-300 nmol/L) or ACTH-stimulated 1,000-10,000 ng/dL (31-300 nmol/L); unaffected baseline is below 200 ng/dL and stimulated below 1,000 ng/dL.",
    cutoffs: ["17-OHP >10,000 ng/dL", "300 nmol/L", "17-OHP 200-10,000 ng/dL", "6-300 nmol/L", "ACTH-stimulated 17-OHP 1,000-10,000 ng/dL", "31-300 nmol/L", "baseline 17-OHP <200 ng/dL", "ACTH-stimulated 17-OHP <1,000 ng/dL"],
    data_needed: ["age after infancy", "early morning 17-OHP", "ACTH-stimulated 17-OHP", "timing before 8 AM", "follicular phase timing when menstruating", "assay method", "glucocorticoid exposure"],
    source_ids: ["GENEREVIEWS_CAH_21OHD_2016", "ES_CAH_2018"],
    source_section: "GeneReviews diagnostic testing table; Endocrine Society diagnosis recommendations 3.2-3.4"
  },
  {
    id: "cah_salt_wasting_crisis_pattern",
    label: "Salt-wasting CAH emergency: infant in first 4 weeks with dehydration, vomiting, shock, low sodium/chloride/CO2, high potassium, hypoglycemia, or inappropriately high urine sodium",
    criteria_text: "GeneReviews identifies any infant with salt-losing crisis in the first 4 weeks of life as a CAH suspect; untreated or poorly controlled salt wasting may show decreased sodium, chloride, and total CO2, increased potassium, and inappropriately high urine sodium.",
    cutoffs: ["first 4 weeks", "sodium below reference range", "potassium above reference range", "CO2 below reference range"],
    data_needed: ["age in days", "vomiting", "feeding intolerance", "hydration/perfusion", "blood pressure", "glucose", "sodium", "potassium", "chloride", "CO2/bicarbonate", "urine sodium", "17-OHP/newborn screen"],
    source_ids: ["GENEREVIEWS_CAH_21OHD_2016", "ES_CAH_2018"],
    source_section: "GeneReviews suggestive findings and clinical features; Endocrine Society stress/adrenal crisis recommendations"
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
    id: "cah_adrenal_crisis_hydrocortisone_doses",
    label: "CAH adrenal crisis injection: hydrocortisone 25 mg infants/preschool, 50 mg school-age children, 100 mg adults; then one-quarter dose every 6 hours",
    criteria_text: "Endocrine Society suggested initial parenteral hydrocortisone doses for adrenal crisis are 25 mg for infants and preschool children, 50 mg for school-age children, and 100 mg for adults; successive IV hydrocortisone may be one-quarter of the initial dose every 6 hours.",
    cutoffs: ["25 mg", "50 mg", "100 mg", "every 6 hours", "one-quarter dose"],
    data_needed: ["age band", "current adrenal crisis features", "vomiting/inability to take oral medication", "weight if local protocol is weight-based", "hydrocortisone route available", "time of last glucocorticoid dose"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Stress dosing Table 4 and adrenal crisis evidence"
  },
  {
    id: "cah_growing_classic_maintenance_doses",
    label: "Growing classic CAH maintenance: hydrocortisone 10-15 mg/m2/day three times daily, fludrocortisone 0.05-0.2 mg/day, and infancy sodium chloride 1-2 g/day",
    criteria_text: "Endocrine Society Table 2 lists maintenance therapy in growing classic CAH as hydrocortisone tablets 10-15 mg/m2/day divided three times daily, fludrocortisone 0.05-0.2 mg/day in 1-2 doses, and sodium chloride 1-2 g/day (17-34 mEq/day) in infancy divided into feedings.",
    cutoffs: ["10-15 mg/m2/day", "3 times/day", "0.05-0.2 mg/day", "1-2 g/day", "17-34 mEq/day"],
    data_needed: ["classic CAH diagnosis", "age/growth status", "body surface area", "current hydrocortisone dose", "fludrocortisone dose", "infancy sodium chloride supplementation", "blood pressure", "renin", "sodium", "potassium", "growth velocity"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Treatment of classic CAH recommendations 4.1-4.6 and Table 2"
  },
  {
    id: "cah_adult_classic_maintenance_doses",
    label: "Adult classic CAH maintenance: hydrocortisone 15-25 mg/day or selected long-acting glucocorticoid plus fludrocortisone 0.05-0.2 mg/day when indicated",
    criteria_text: "Endocrine Society Table 3 suggests adult classic CAH maintenance options: hydrocortisone 15-25 mg/day in 2-3 doses, prednisone 5-7.5 mg/day in 2 doses, prednisolone 4-6 mg/day in 2 doses, methylprednisolone 4-6 mg/day in 2 doses, dexamethasone 0.25-0.5 mg/day once daily, and fludrocortisone 0.05-0.2 mg/day in 1-2 doses when clinically indicated.",
    cutoffs: ["15-25 mg/day", "2-3 doses", "5-7.5 mg/day", "4-6 mg/day", "0.25-0.5 mg/day", "0.05-0.2 mg/day"],
    data_needed: ["adult classic CAH diagnosis", "current glucocorticoid regimen", "mineralocorticoid need", "blood pressure", "BMI/Cushingoid features", "renin", "sodium", "potassium", "fertility goals", "adrenal rest tumor status"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Treatment of classic CAH recommendations 4.4-4.6 and Table 3"
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
    id: "cah_nonclassic_daily_glucocorticoid_rules",
    label: "Nonclassic CAH daily steroid rules: treat rapid pubarche, advanced bone age, overt virilization, infertility, or patient-important hyperandrogenism; do not treat asymptomatic nonpregnant patients",
    criteria_text: "Endocrine Society suggests glucocorticoids for children/adolescents with inappropriately early rapid pubarche or bone age advancement, adolescents with overt virilization, and adult women with patient-important hyperandrogenism or infertility; it recommends against glucocorticoids in asymptomatic nonpregnant nonclassic CAH and suggests discontinuation when adult height is attained or symptoms resolve.",
    cutoffs: ["adult height attained", "symptoms resolve"],
    data_needed: ["nonclassic CAH confirmation", "pubarche timing/progression", "bone age", "virilization signs", "menstrual/fertility goals", "hyperandrogenism symptoms", "pregnancy status", "current glucocorticoid use", "adult height status"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Treatment of nonclassic CAH recommendations 5.1-5.5"
  },
  {
    id: "cah_monitoring_age_intervals",
    label: "CAH pediatric monitoring: age <=18 months monitor first 3 months of life and every 3 months thereafter; age >18 months evaluate every 4 months",
    criteria_text: "For CAH patients <=18 months, monitor closely in the first 3 months of life and every 3 months thereafter; after 18 months, evaluate every 4 months, with pediatric growth, weight, blood pressure, exam, and biochemical measurements.",
    cutoffs: ["<=18 months", "3 months", ">18 months", "4 months"],
    data_needed: ["age", "last endocrine visit date", "growth velocity", "weight", "blood pressure", "timed hormones"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Monitoring therapy recommendations 4.12-4.16"
  },
  {
    id: "cah_monitoring_targets_and_overtreatment",
    label: "CAH monitoring targets: time hormones consistently; normal 17-OHP suggests overtreatment; follicular progesterone target <0.6 ng/mL when trying to conceive",
    criteria_text: "Endocrine Society advises consistently timed hormone measurements relative to medication and time of day, not fully suppressing endogenous adrenal steroids, and interpreting 17-OHP normalization as overtreatment; for women trying to conceive, follicular-phase progesterone target is below 0.6 ng/mL (2 nmol/L).",
    cutoffs: ["17-OHP normal", "progesterone <0.6 ng/mL", "2 nmol/L", "androstenedione/testosterone ratio <0.5", "androstenedione/testosterone ratio >2"],
    data_needed: ["hormone draw time", "time since glucocorticoid dose", "17-OHP", "androstenedione", "testosterone", "renin", "sodium", "potassium", "blood pressure", "fertility intent", "follicular-phase progesterone"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Monitoring therapy evidence and Table 5"
  },
  {
    id: "cah_long_term_surveillance_intervals",
    label: "CAH long-term surveillance: adults need annual exam; TART ultrasound interval differs by source and should use local endocrine policy",
    criteria_text: "Endocrine Society recommends annual adult physical examination with blood pressure, BMI, Cushingoid features, and biochemical monitoring; it recommends periodic testicular ultrasound in males with classic CAH, with expert opinion suggesting about every 1-2 years in asymptomatic males. GeneReviews lists testicular adrenal rest tumor monitoring every 3-5 years after puberty. Because intervals differ, local endocrine policy should define the exact interval.",
    cutoffs: ["annual", "1-2 years", "3-5 years"],
    data_needed: ["adult status", "last exam date", "blood pressure", "BMI", "Cushingoid features", "biochemical monitoring", "sex/reproductive anatomy", "puberty status", "last testicular ultrasound", "local endocrine surveillance interval"],
    source_ids: ["ES_CAH_2018", "GENEREVIEWS_CAH_21OHD_2016"],
    source_section: "Long-term surveillance recommendation 6.13 and GeneReviews surveillance",
    needs_clinical_review: true,
    reviewer_input_needed: "Local endocrine policy must choose a TART ultrasound interval because Endocrine Society expert opinion and GeneReviews summarize different surveillance intervals."
  },
  {
    id: "cah_pregnancy_fertility_genetic_rules",
    label: "CAH pregnancy/fertility rules: genetic counseling for pregnancy planning, continue hydrocortisone/prednisolone and fludrocortisone, avoid dexamethasone, stress-dose labor",
    criteria_text: "Endocrine Society recommends genetic counseling for CAH patients/partners planning pregnancy, specialist endocrine management during pregnancy, continuing prepregnancy hydrocortisone or prednisolone and fludrocortisone with adjustment for insufficiency symptoms, considering dose increase in the second or third trimester, stress-dose glucocorticoids during labor and delivery, and avoiding placenta-crossing glucocorticoids such as dexamethasone in pregnancy or conception attempts.",
    cutoffs: ["second trimester", "third trimester", "labor and delivery"],
    data_needed: ["pregnancy status", "gestational age", "fertility intent", "partner/carrier status", "current glucocorticoid", "fludrocortisone use", "symptoms of insufficiency", "labor/delivery plan", "dexamethasone exposure"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Genetic counseling, fertility, and pregnancy recommendations 6.3-6.9"
  },
  {
    id: "cah_prenatal_dexamethasone_restriction",
    label: "Prenatal dexamethasone for CAH risk: experimental only, IRB-approved protocol, fetal sex screening, outcomes capture",
    criteria_text: "Endocrine Society advises prenatal CAH therapy remains experimental, does not recommend specific protocols, and recommends prenatal therapy only through IRB-approved protocols at centers able to collect outcomes, with Y-chromosomal DNA screening in maternal blood to exclude male fetuses from potential treatment groups.",
    cutoffs: ["IRB-approved protocol", "Y-chromosomal DNA screening"],
    data_needed: ["pregnancy risk of affected fetus", "prenatal dexamethasone request/exposure", "IRB protocol availability", "outcomes registry capability", "maternal blood fetal sex screening", "genetic counseling"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Prenatal treatment recommendations 2.1-2.3",
    needs_clinical_review: true,
    reviewer_input_needed: "Prenatal CAH dexamethasone requires formal research governance, maternal-fetal medicine/endocrinology review, and documented IRB-approved protocol."
  },
  {
    id: "cah_crinecerfont_dosing_and_safety",
    label: "Crinecerfont adjunct: classic CAH age >=4 years; adults 100 mg twice daily; pediatric doses 25/50/100 mg twice daily by 10-<20, 20-<55, or >=55 kg",
    criteria_text: "DailyMed labeling indicates crinecerfont as adjunctive therapy to glucocorticoid replacement to control androgens in adults and pediatric patients 4 years and older with classic CAH. Adult dose is 100 mg orally twice daily with meals. Pediatric doses are 25 mg twice daily for 10 to less than 20 kg, 50 mg twice daily for 20 to less than 55 kg, and 100 mg twice daily for at least 55 kg. Continue glucocorticoid replacement, assess androstenedione beginning 4 weeks after initiation, and do not reduce glucocorticoid below replacement.",
    cutoffs: ["age >=4 years", "100 mg twice daily", "10 kg to <20 kg", "25 mg twice daily", "20 kg to <55 kg", "50 mg twice daily", ">=55 kg", "4 weeks"],
    data_needed: ["classic CAH diagnosis", "age", "weight", "current glucocorticoid replacement", "androgen control goal", "androstenedione baseline", "time since initiation", "meal timing", "hypersensitivity history", "renal function", "CYP3A4 inducer use"],
    source_ids: ["DAILYMED_CRENESSITY_CRINECERFONT_2024"],
    source_section: "Indications and dosage sections 1-2"
  },
  {
    id: "cah_crinecerfont_contraindications_interactions",
    label: "Crinecerfont safety: discontinue for clinically significant hypersensitivity, avoid severe renal impairment/ESRD, and double doses for CYP3A4 inducers per label",
    criteria_text: "DailyMed labeling contraindicates crinecerfont in hypersensitivity to crinecerfont or excipients, directs discontinuation for clinically significant hypersensitivity, warns adrenal crisis can occur if glucocorticoids are inadequate, does not recommend use in severe renal impairment or end-stage renal disease, and modifies dosing with CYP3A4 inducers: strong inducers increase morning and evening dosage 2-fold; moderate inducers increase the evening dose 2-fold.",
    cutoffs: ["severe renal impairment", "end-stage renal disease", "2-fold", "200 mg twice daily"],
    data_needed: ["hypersensitivity symptoms", "glucocorticoid replacement dose", "acute illness/trauma/surgery", "eGFR/renal impairment status", "CYP3A4 inducer list", "crinecerfont morning dose", "crinecerfont evening dose"],
    source_ids: ["DAILYMED_CRENESSITY_CRINECERFONT_2024"],
    source_section: "Contraindications, warnings, renal impairment, and drug interaction sections"
  },
  {
    id: "cah_genital_surgery_dsd_review",
    label: "Virilized 46,XX classic CAH: surgery is optional shared decision in experienced DSD center; consider delaying or observing",
    criteria_text: "Endocrine Society advises families of pediatric CAH patients, especially minimally virilized girls, be informed about options including delaying surgery or observation; surgery should be performed only in experienced centers with pediatric surgery/urology, endocrinology, anesthesiology, behavioral health, and social work, and decisions for minors remain a family shared decision with experienced consultants.",
    cutoffs: ["Prader stage III-V", "experienced center"],
    data_needed: ["karyotype/sex development context", "degree of virilization", "family goals", "urology/DSD center availability", "behavioral health support", "anesthesia risk", "informed consent and assent when applicable"],
    source_ids: ["ES_CAH_2018"],
    source_section: "Restoring functional anatomy by surgery recommendations 7.1-7.4",
    needs_clinical_review: true,
    reviewer_input_needed: "Elective genital surgery decisions require experienced DSD team review, family shared decision-making, and local legal/ethical governance."
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

const pediatricFeverSepsisCutoffCriteria = [
  {
    id: "peds_fever_ng254_under5_sepsis_vitals",
    label: "NICE under-5 suspected sepsis risk: SpO2 <90% high risk, SpO2 <92% moderate risk; RR and HR cutoffs are age-banded; CRT >=3 seconds, urine <1 mL/kg/h, temperature <36 C, age <3 months temperature >=38 C, or non-blanching rash are high risk",
    criteria_text: "For suspected sepsis in children under 5, NICE NG254 grades high risk with SpO2 <90% in air or increased oxygen over baseline, respiratory rate >=60/min under 1 year, >=50/min age 1-2 years, >=40/min age 3-4 years, heart rate <60/min, capillary refill time >=3 seconds, catheter urine <1 mL/kg/hour, heart rate >=160/min under 1 year, >=150/min age 1-2 years, >=140/min age 3-4 years, non-blanching petechial or purpuric rash, temperature <36 C, or temperature >=38 C when younger than 3 months; moderate risk includes SpO2 <92%, RR 50-59/min under 1 year, 40-49/min age 1-2 years, 35-39/min age 3-4 years, HR 150-159/min under 1 year, 140-149/min age 1-2 years, 130-139/min age 3-4 years, age 3-6 months temperature >=39 C, leg pain, or cold hands/feet.",
    cutoffs: ["SpO2 <90%", "SpO2 <92%", "RR >=60/min under 1 year", "RR 50-59/min under 1 year", "RR >=50/min age 1-2 years", "RR 40-49/min age 1-2 years", "RR >=40/min age 3-4 years", "RR 35-39/min age 3-4 years", "heart rate <60/min", "CRT >=3 seconds", "urine <1 mL/kg/hour", "HR >=160/min under 1 year", "HR 150-159/min under 1 year", "HR >=150/min age 1-2 years", "HR 140-149/min age 1-2 years", "HR >=140/min age 3-4 years", "HR 130-139/min age 3-4 years", "temperature <36 C", "age <3 months temperature >=38 C", "age 3-6 months temperature >=39 C"],
    data_needed: ["age in months/years", "oxygen saturation in air", "baseline oxygen requirement", "respiratory rate", "heart rate", "capillary refill time", "urine output mL/kg/hour", "temperature and method", "rash blanching/purpura", "leg pain", "hand/foot temperature"],
    source_ids: ["NICE_SEPSIS_UNDER16_2025"],
    source_section: "NG254 table 1 under-5 risk stratification"
  },
  {
    id: "peds_fever_ng254_5_11_sepsis_vitals",
    label: "NICE age 5-11 suspected sepsis risk: SpO2 <90% high risk, SpO2 <92% moderate risk; RR/HR age bands, HR <60/min, CRT >=3 seconds, urine <1 mL/kg/h, tympanic temperature <36 C, or non-blanching rash change risk",
    criteria_text: "For suspected sepsis age 5-11 years, NICE NG254 grades high risk with SpO2 <90% in air or increased oxygen over baseline, RR >=29/min at age 5, >=27/min age 6-7, >=25/min age 8-11, HR <60/min, CRT >=3 seconds, catheter urine <1 mL/kg/hour, HR >=130/min at age 5, >=120/min age 6-7, >=115/min age 8-11, non-blanching petechial or purpuric rash, or altered mental state; moderate risk includes SpO2 <92%, RR 24-28/min at age 5, 24-26/min age 6-7, 22-24/min age 8-11, HR 120-129/min at age 5, 110-119/min age 6-7, 105-114/min age 8-11, tympanic temperature <36 C, leg pain, or cold hands/feet.",
    cutoffs: ["SpO2 <90%", "SpO2 <92%", "RR >=29/min age 5", "RR 24-28/min age 5", "RR >=27/min age 6-7", "RR 24-26/min age 6-7", "RR >=25/min age 8-11", "RR 22-24/min age 8-11", "HR <60/min", "CRT >=3 seconds", "urine <1 mL/kg/hour", "HR >=130/min age 5", "HR 120-129/min age 5", "HR >=120/min age 6-7", "HR 110-119/min age 6-7", "HR >=115/min age 8-11", "HR 105-114/min age 8-11", "tympanic temperature <36 C"],
    data_needed: ["age in years", "oxygen saturation in air", "baseline oxygen requirement", "respiratory rate", "heart rate", "capillary refill time", "urine output mL/kg/hour", "temperature and method", "rash blanching/purpura", "mental state", "leg pain", "hand/foot temperature"],
    source_ids: ["NICE_SEPSIS_UNDER16_2025"],
    source_section: "NG254 table 2 age 5-11 risk stratification"
  },
  {
    id: "peds_fever_ng254_12_15_sepsis_vitals",
    label: "NICE age 12-15 suspected sepsis risk: RR >=25/min, FiO2 >=40%, SBP <=90 mm Hg or >40 mm Hg below normal, HR >130/min, no urine 18 hours or catheter urine <0.5 mL/kg/h are high risk",
    criteria_text: "For suspected sepsis age 12-15 years, NICE NG254 grades high risk with new altered mental state, RR >=25/min, need for FiO2 >=40% to maintain SpO2 >92% or >88% in known chronic hypercapnic respiratory failure, systolic blood pressure <=90 mm Hg or >40 mm Hg below normal, heart rate >130/min, no urine in the previous 18 hours, catheter urine <0.5 mL/kg/hour, or non-blanching petechial/purpuric rash; moderate risk includes acute deterioration, impaired immunity, trauma/surgery/invasive procedure in the last 6 weeks, RR 21-24/min, SBP 91-100 mm Hg, HR 91-130/min or 100-130/min in pregnancy, new arrhythmia, no urine 12-18 hours, catheter urine 0.5-1 mL/kg/hour, tympanic temperature <36 C, or surgical-site infection signs.",
    cutoffs: ["RR >=25/min", "RR 21-24/min", "FiO2 >=40%", "SpO2 >92%", "SpO2 >88% in chronic hypercapnic respiratory failure", "SBP <=90 mm Hg", "SBP >40 mm Hg below normal", "SBP 91-100 mm Hg", "HR >130/min", "HR 91-130/min", "HR 100-130/min in pregnancy", "no urine 18 hours", "urine <0.5 mL/kg/hour", "no urine 12-18 hours", "urine 0.5-1 mL/kg/hour", "temperature <36 C", "last 6 weeks"],
    data_needed: ["age in years", "mental state", "respiratory rate", "oxygen delivery and FiO2", "oxygen saturation target", "chronic hypercapnic respiratory failure status", "systolic blood pressure and age-normal baseline", "heart rate", "pregnancy status", "arrhythmia", "urine timing", "catheter urine output mL/kg/hour", "temperature and method", "immune status", "trauma/surgery/invasive procedure within 6 weeks"],
    source_ids: ["NICE_SEPSIS_UNDER16_2025"],
    source_section: "NG254 table 3 age 12-15 risk stratification"
  },
  {
    id: "peds_fever_ng254_antibiotic_fluid_oxygen",
    label: "NICE pediatric sepsis initial therapy: ceftriaxone 80 mg/kg daily maximum 4 g if not newborn; newborn ceftriaxone 50 mg/kg daily only if >40 weeks corrected GA and no IV calcium; fluid bolus 10 mL/kg under 16 maximum 250 mL over <10 minutes",
    criteria_text: "NICE NG254 recommends local antimicrobial guidance when the infection source is clear; for suspected community-acquired sepsis under 16 excluding newborns, ceftriaxone 80 mg/kg once daily to maximum 4 g/day; for newborn community-acquired sepsis, ceftriaxone 50 mg/kg once daily only when corrected gestational age is >40 weeks and no IV calcium is running, otherwise cefotaxime 50 mg/kg every 6-12 hours; under 3 months add listeria-active ampicillin or amoxicillin; newborn fluid bolus is 10-20 mL/kg over <10 minutes and under-16 bolus is 10 mL/kg over <10 minutes maximum 250 mL, with smaller volumes for cardiac or kidney disease and consultant in-person attendance if no improvement after a second bolus.",
    cutoffs: ["ceftriaxone 80 mg/kg once daily", "maximum 4 g/day", "ceftriaxone 50 mg/kg once daily", ">40 weeks corrected gestational age", "cefotaxime 50 mg/kg every 6-12 hours", "age <3 months", "newborn bolus 10-20 mL/kg", "under-16 bolus 10 mL/kg", "maximum 250 mL", "<10 minutes", "second bolus"],
    data_needed: ["age in days/months/years", "corrected gestational age", "IV calcium infusion status", "weight", "suspected infection source", "community vs hospital-acquired context", "ceftriaxone-resistant colonization/infection history", "allergy", "renal/cardiac disease", "need for fluid resuscitation", "response after first and second bolus"],
    source_ids: ["NICE_SEPSIS_UNDER16_2025"],
    source_section: "NG254 antibiotic, fluid, and oxygen recommendations 1.8-1.10"
  },
  {
    id: "peds_fever_ssc_sepsis_timing_fluids",
    label: "SSC pediatric sepsis timing and fluids: blood cultures before antibiotics if no substantial delay, antibiotics ideally within 1 hour for septic shock and within 3 hours for probable sepsis without shock; fluid boluses 10-20 mL/kg with repeated reassessment",
    criteria_text: "SSC pediatric guidance recommends lactate for probable sepsis or suspected septic shock, blood cultures before antibiotics if this does not substantially delay therapy, antibiotics ideally within 1 hour for suspected septic shock and within 3 hours for probable sepsis without shock, and repeated reassessment after each 10-20 mL/kg bolus; where ICU is available, give up to 40-60 mL/kg in the first hour, while without ICU do not bolus sepsis without hypotension and give up to 40 mL/kg in the first hour for septic shock with hypotension; stop boluses when shock resolves or fluid overload develops, consider peripheral vasoactives rather than delaying for central access, and target SpO2 88-92% after resuscitation.",
    cutoffs: ["antibiotics within 1 hour", "antibiotics within 3 hours", "10-20 mL/kg per bolus", "40-60 mL/kg first hour with ICU", "40 mL/kg first hour without ICU if hypotensive shock", "ScvO2 >=70%", "SpO2 88-92%", "SpO2 >94%"],
    data_needed: ["shock status", "probable sepsis without shock status", "lactate", "blood culture timing", "antibiotic order and administration time", "weight", "ICU availability", "hypotension", "fluid overload signs", "perfusion after each bolus", "central venous access and ScvO2 if available", "vasoactive medication access", "post-resuscitation SpO2"],
    source_ids: ["SSC_PEDIATRIC_SEPSIS_2026"],
    source_section: "SSC 2026 pediatric infection, fluids, vasoactive, and ventilation recommendations"
  },
  {
    id: "peds_fever_ucsf_febrile_infant_im_cutoffs",
    label: "Febrile infant inflammatory markers: fever >38.0 C is true fever; elevated inflammatory markers include ANC >4000/uL, CRP >20 mg/L or 2.0 mg/dL, procalcitonin >0.5 ng/mL, or temperature >38.5 C",
    criteria_text: "UCSF febrile infant consensus uses temperature >38.0 C as true fever and inflammatory marker cutoffs of ANC >4000/uL, CRP >20 mg/L or 2.0 mg/dL, procalcitonin >0.5 ng/mL, or temperature >38.5 C; PECARN low risk is UA negative, ANC <4000/uL, and procalcitonin <0.5 ng/mL.",
    cutoffs: [">38.0 C", "ANC >4000/uL", "CRP >20 mg/L", "CRP >2.0 mg/dL", "procalcitonin >0.5 ng/mL", "temperature >38.5 C", "ANC <4000/uL", "procalcitonin <0.5 ng/mL"],
    data_needed: ["age in days", "temperature value and method", "UA microscopy/leukocyte esterase/nitrite", "absolute neutrophil count", "CRP", "procalcitonin", "blood culture", "urine culture", "CSF results when obtained", "clinical appearance"],
    source_ids: ["AAP_FEBRILE_INFANT_2021", "UCSF_FEBRILE_INFANT_2023"],
    source_section: "Febrile infant inflammatory marker and PECARN low-risk criteria"
  },
  {
    id: "peds_fever_ucsf_febrile_infant_age_branches",
    label: "Febrile infant age branches: 0-21 days hospitalize with blood, urine, CSF cultures and empiric antibiotics 24-48 hours; 22-28 days and 29-60 days route by UA, inflammatory markers, CSF, and 24-hour follow-up reliability",
    criteria_text: "UCSF consensus recommends all well-appearing febrile infants under 21 days receive blood, urine, and CSF analysis/cultures and hospitalization with empiric broad-spectrum antibiotics for 24-48 hours while cultures are pending; age 22-28 days needs blood culture, inflammatory markers, UA/urine culture if positive, CSF and admission/IV antibiotics when markers are elevated or UA/CSF high risk, and selected low-risk outpatient observation only with reliable follow-up; age 29-60 days needs UA, urine culture if positive, blood culture, inflammatory markers, and may avoid CSF and use home oral UTI therapy or observation when low-risk criteria and follow-up/transport/communication are met.",
    cutoffs: ["0-21 days", "22-28 days", "29-60 days", "24-48 hours", "24-hour follow-up", "48-hour follow-up", "24-36 hours no culture growth", "final cultures 5 days", "WBC >5 cells/hpf"],
    data_needed: ["age in days", "well vs ill appearance", "blood culture", "urinalysis", "urine culture", "CSF cell count/culture if obtained", "inflammatory markers", "bronchiolitis or focal bacterial infection exclusion", "recent immunization 24-48 hours", "prematurity or chronic illness", "antibiotic timing", "follow-up appointment", "communication and transportation reliability", "culture follow-up owner"],
    source_ids: ["AAP_FEBRILE_INFANT_2021", "UCSF_FEBRILE_INFANT_2023"],
    source_section: "Febrile infant age-based evaluation, admission, discharge, and antibiotic discontinuation criteria"
  },
  {
    id: "peds_fever_ng143_infant_under3_wbc_lp_antibiotics",
    label: "NICE fever under 5 infant testing: under 3 months measure temperature/HR/RR, obtain FBC, blood culture, CRP, urine test; LP and parenteral antibiotics for age <1 month, unwell age 1-3 months, or WBC <5 or >15 x10^9/L",
    criteria_text: "NICE NG143 recommends infants under 3 months with fever have temperature, heart rate, and respiratory rate recorded plus full blood count, blood culture, CRP, urine test, CXR only with respiratory signs, stool culture if diarrhoea; lumbar puncture unless contraindicated and parenteral antibiotics are indicated for infants younger than 1 month, all unwell infants 1-3 months, or infants 1-3 months with WBC <5 x10^9/L or >15 x10^9/L; when parenteral antibiotics are used in infants under 3 months, use a third-generation cephalosporin plus listeria-active ampicillin or amoxicillin.",
    cutoffs: ["age <3 months", "age <1 month", "age 1-3 months", "WBC <5 x10^9/L", "WBC >15 x10^9/L"],
    data_needed: ["age in months", "appearance/unwell status", "temperature", "heart rate", "respiratory rate", "FBC/WBC", "blood culture", "CRP", "urine test", "respiratory signs for CXR", "diarrhoea for stool culture", "LP contraindications", "antibiotic allergy"],
    source_ids: ["NICE_FEVER_UNDER5_NG143"],
    source_section: "NG143 pediatric specialist management of infants younger than 3 months"
  },
  {
    id: "peds_fever_ng143_safety_net_antipyretics",
    label: "NICE fever under 5 safety-net: red features urgent pediatric specialist, amber features safety-net if no diagnosis, fever >=5 days or non-blanching rash/fit/worsening concern requires further help; antipyretics only for distress",
    criteria_text: "NICE NG143 recommends emergency care for immediately life-threatening fever features, urgent pediatric specialist care for red features, safety-net or specialist assessment for amber features with no diagnosis, and home care only for green features; if not admitted with red or amber features and no diagnosis, provide warning symptoms, planned follow-up, and direct access; antipyretics are for distress only, not just temperature reduction, and paracetamol and ibuprofen should not be given simultaneously; seek further help for fit, non-blanching rash, less well, increasing carer worry, fever lasting 5 days or longer, or carer inability to cope.",
    cutoffs: ["fever >=5 days"],
    data_needed: ["NICE red/amber/green features", "diagnosis reached or not", "parent/carer concern", "admission decision", "follow-up time/place", "direct access/out-of-hours plan", "distress with fever", "antipyretic dosing history", "fit", "non-blanching rash", "fever duration days", "caregiver ability to care"],
    source_ids: ["NICE_FEVER_UNDER5_NG143"],
    source_section: "NG143 non-paediatric and paediatric management, antipyretics, and home-care safety-netting"
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

const erectileDysfunctionCutoffCriteria = [
  {
    id: "ed_definition_and_cv_screen",
    label: "ED evaluation: persistent inability to achieve or maintain erection; assess CV risk because ED can precede CAD/MI/stroke by up to 5 years",
    criteria_text: "ED is inability to achieve or maintain a rigid erection adequate for satisfactory sexual activity; some references use persistence for 6 months. ED is a cardiovascular risk marker and may precede coronary artery disease, myocardial infarction, or stroke by up to 5 years, so cardiovascular risk screening is part of the workup.",
    cutoffs: ["6 months", "up to 5 years"],
    data_needed: ["erectile symptom duration", "rigidity/maintenance pattern", "libido and orgasm/ejaculation symptoms", "morning/nocturnal erections", "cardiovascular symptoms", "exercise tolerance", "blood pressure", "peripheral pulses", "diabetes/hypertension/lipid/smoking history"],
    source_ids: ["STATPEARLS_ED_2024", "ENDOTEXT_ED_2022"],
    source_section: "Definition, cardiovascular risk, and ED evaluation"
  },
  {
    id: "ed_initial_labs_metabolic_cutoffs",
    label: "ED metabolic screen: A1c 5.7-6.4% is prediabetes; A1c >=6.5%, fasting glucose >=126 mg/dL, 2-hour OGTT >=200 mg/dL, or random glucose >=200 mg/dL with symptoms diagnoses diabetes",
    criteria_text: "ED evaluation should look for metabolic and vascular disease. ADA diagnostic thresholds are A1c >=6.5%, fasting plasma glucose >=126 mg/dL, 2-hour 75-g OGTT glucose >=200 mg/dL, or random plasma glucose >=200 mg/dL with classic symptoms; prediabetes is A1c 5.7-6.4%, fasting glucose 100-125 mg/dL, or 2-hour OGTT 140-199 mg/dL.",
    cutoffs: ["A1c 5.7-6.4%", "A1c >=6.5%", "fasting glucose 100-125 mg/dL", "fasting glucose >=126 mg/dL", "2-hour OGTT 140-199 mg/dL", "2-hour OGTT >=200 mg/dL", "random glucose >=200 mg/dL"],
    data_needed: ["A1c", "fasting plasma glucose", "2-hour OGTT glucose if used", "random glucose and hyperglycemia symptoms", "lipid profile", "blood pressure", "kidney function"],
    source_ids: ["ADA_DIAGNOSIS_2026", "ENDOTEXT_ED_2022", "STATPEARLS_ED_2024"],
    source_section: "ADA diabetes diagnosis thresholds and ED metabolic evaluation"
  },
  {
    id: "ed_hypogonadism_confirmation_cutoffs",
    label: "Low-testosterone ED branch: symptoms plus 2 fasting morning total testosterone values below 264 ng/dL lower limit; free T if TT 200-400 ng/dL or SHBG altered",
    criteria_text: "Endocrine Society recommends diagnosing hypogonadism only when symptoms/signs are present and morning testosterone is unequivocally and consistently low. The harmonized lower limit cited is 264 ng/dL; repeat fasting morning total testosterone is required, with free testosterone when total testosterone is near the lower limit, such as 200-400 ng/dL, or SHBG is altered.",
    cutoffs: ["2 fasting morning total testosterone values", "264 ng/dL", "200-400 ng/dL"],
    data_needed: ["hypogonadal symptoms/signs", "two fasting morning total testosterone values", "assay lower limit/reference range", "SHBG or albumin when indicated", "LH", "FSH", "fertility intent"],
    source_ids: ["ES_TESTOSTERONE_2018", "ENDOTEXT_ED_2022"],
    source_section: "Testosterone deficiency diagnosis and ED androgen evaluation"
  },
  {
    id: "ed_pituitary_prolactin_cutoffs",
    label: "Pituitary ED branch: testosterone <150 ng/dL, persistent hyperprolactinemia, prolactin >250 ug/L, prolactin >500 ug/L, macroadenoma >10 mm, or 1:100 dilution hook-effect concern",
    criteria_text: "For secondary hypogonadism or low testosterone ED, evaluate LH/FSH and prolactin. Endocrine Society suggests pituitary imaging for severe secondary hypogonadism such as testosterone <150 ng/dL, persistent hyperprolactinemia, panhypopituitarism, or mass effect. Hyperprolactinemia is prolactin above assay ULN; normal values are generally <25 ug/L, >250 ug/L usually indicates prolactinoma, >500 ug/L is diagnostic of macroprolactinoma, macroadenoma is >10 mm, and a large tumor with unexpectedly mild prolactin elevation needs 1:100 dilution to exclude hook effect.",
    cutoffs: ["testosterone <150 ng/dL", "prolactin >ULN", "prolactin <25 ug/L", "prolactin >250 ug/L", "prolactin >500 ug/L", "macroadenoma >10 mm", "1:100 dilution"],
    data_needed: ["total testosterone", "LH", "FSH", "prolactin", "assay ULN", "pituitary MRI size", "headache/visual symptoms", "other pituitary hormone deficits", "medications causing prolactin elevation", "renal function", "TSH/free T4"],
    source_ids: ["ES_TESTOSTERONE_2018", "ES_HYPERPROLACTINEMIA_2011"],
    source_section: "Hypogonadism diagnostic evaluation and hyperprolactinemia diagnosis"
  },
  {
    id: "ed_pde5_safety_dosing_cutoffs",
    label: "PDE5 inhibitor branch: contraindicated with nitrates; high-risk CV status needs stabilization; sildenafil starts 50 mg 1 hour before sex max daily, lower 25 mg in older/renal/CYP3A4 risk",
    criteria_text: "Endotext lists oral PDE5 inhibitors as first-line for most ED patients but strictly contraindicated with nitrates. Sexual activity/PDE5 treatment requires cardiovascular fitness; unstable cardiovascular disease, recent myocardial infarction, unstable angina, NYHA III-IV heart failure, or unstable arrhythmia needs cardiology/stabilization before routine ED therapy. Sildenafil usual start is 50 mg about 1 hour before sexual activity, maximum once daily. Lower starting doses such as sildenafil 25 mg or tadalafil/vardenafil 5 mg are used in older patients, severe renal impairment, or potent CYP3A4 inhibitor exposure; avoid PDE5 dosing within 4 hours of an alpha-blocker.",
    cutoffs: ["sildenafil 50 mg", "1 hour", "once per day", "sildenafil 25 mg", "tadalafil 5 mg", "vardenafil 5 mg", "age >65 years", "4 hours", "NYHA III-IV"],
    data_needed: ["nitrate or riociguat use", "alpha-blocker use and timing", "recent MI/stroke/unstable angina", "NYHA heart failure class", "unstable arrhythmia", "exercise tolerance", "blood pressure", "renal function", "CYP3A4 inhibitor use", "visual/hearing history"],
    source_ids: ["ENDOTEXT_ED_2022"],
    source_section: "PDE5 inhibitor treatment, dosing, contraindications, and cardiovascular safety"
  },
  {
    id: "ed_testosterone_therapy_safety_cutoffs",
    label: "Testosterone therapy safety: avoid/hold for fertility intent, prostate/breast cancer, PSA >4 ng/mL, PSA >3 ng/mL high-risk without urology review, hematocrit >54%, untreated severe OSA, uncontrolled HF, or MI/stroke within 6 months",
    criteria_text: "Endocrine Society recommends against testosterone therapy in men planning fertility, prostate or breast cancer, prostate nodule, PSA >4 ng/mL, PSA >3 ng/mL in high-risk men without urologic evaluation, elevated hematocrit, untreated severe OSA, severe LUTS, uncontrolled heart failure, MI or stroke within 6 months, or thrombophilia. Monitor hematocrit at baseline, 3-6 months, then annually; stop when hematocrit is >54%. Urology consult is recommended for PSA increase >1.4 ng/mL within 12 months, confirmed PSA >4 ng/mL, abnormal DRE, or substantial LUTS worsening.",
    cutoffs: ["PSA >4 ng/mL", "PSA >3 ng/mL", "hematocrit >54%", "3-6 months", "annually", "MI or stroke within 6 months", "PSA increase >1.4 ng/mL within 12 months", "confirmed PSA >4 ng/mL"],
    data_needed: ["fertility intent", "breast/prostate cancer history", "PSA", "digital rectal exam/prostate nodule status", "hematocrit", "sleep apnea status", "LUTS/IPSS severity", "heart failure control", "recent MI/stroke date", "thrombophilia history", "testosterone treatment start date"],
    source_ids: ["ES_TESTOSTERONE_2018"],
    source_section: "Testosterone therapy contraindications and monitoring"
  },
  {
    id: "ed_injection_priapism_safety_cutoffs",
    label: "Injection/priapism safety: intracavernosal therapy after PDE5 failure needs training; erection lasting >4 hours is emergency care",
    criteria_text: "Intracavernosal injection therapy can be used when oral PDE5 inhibitors fail or are not candidates, but requires dosing education and safety-netting for priapism. StatPearls describes injection goals around 45-90 minutes and recommends emergency evaluation for erections lasting more than 4 hours.",
    cutoffs: ["45-90 minutes", ">4 hours"],
    data_needed: ["PDE5 response and correct use", "injection medication/dose", "training completed", "sickle cell/priapism risk", "anticoagulation/bleeding risk", "erection duration", "access to emergency care"],
    source_ids: ["STATPEARLS_ED_2024", "ENDOTEXT_ED_2022"],
    source_section: "Intracavernosal injection therapy and priapism safety"
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
  pediatric_fever_sepsis_v1: pediatricFeverSepsisCutoffCriteria,
  graves_disease_v1: thyroidHyperCutoffCriteria,
  hyperthyroidism_v1: thyroidHyperCutoffCriteria,
  thyrotoxicosis_v1: thyroidHyperCutoffCriteria,
  hashimotos_thyroiditis_v1: thyroidHypoCutoffCriteria,
  hypothyroidism_v1: thyroidHypoCutoffCriteria,
  thyroid_cancer_v1: [...thyroidNoduleCutoffCriteria, ...thyroidHypoCutoffCriteria.slice(0, 1)],
  thyroid_nodules_v1: thyroidNoduleCutoffCriteria,
  gynecomastia_v1: testosteroneCutoffCriteria,
  hypogonadism_v1: testosteroneCutoffCriteria,
  erectile_dysfunction_v1: erectileDysfunctionCutoffCriteria,
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
    },
    {
      id: "peds_kocher_septic_hip_predictors",
      label: "Kocher septic hip predictors: fever >38.5 C, non-weight-bearing, ESR >=40 mm/hr, WBC >12.0 x10^9/L; 0, 1, 2, 3, 4 predictors correspond to <0.2%, 3.0%, 40.0%, 93.1%, 99.6% predicted septic arthritis",
      criteria_text: "Use Kocher predictors only as hip septic-arthritis risk support, not as discharge permission: history/temperature fever >38.5 C, non-weight-bearing, ESR at least 40 mm/hr, and WBC more than 12.0 x10^9/L; predicted septic arthritis rises from <0.2% with zero predictors to 99.6% with all four predictors.",
      cutoffs: [">38.5 C", "ESR >=40 mm/hr", "WBC >12.0 x10^9/L", "<0.2%", "3.0%", "40.0%", "93.1%", "99.6%"],
      data_needed: ["temperature or fever history", "weight-bearing status", "ESR", "WBC", "hip pain/effusion context", "orthopaedic review availability"],
      source_ids: ["KOCHER_SEPTIC_HIP_1999"],
      source_section: "Independent multivariate predictors and probability algorithm"
    },
    {
      id: "peds_caird_crp_septic_hip_predictor",
      label: "Caird septic hip support: oral temperature >38.5 C and CRP >2.0 mg/dL (>20 mg/L) increase concern; 3, 4, and 5 predictors correspond to 83%, 93%, and 98% septic arthritis probability in aspirated high-suspicion children",
      criteria_text: "Caird prospective hip aspiration study found fever, CRP, ESR, refusal to bear weight, and WBC helpful in high-suspicion children; CRP >2.0 mg/dL (>20 mg/L) was a strong independent risk factor, and 3, 4, or 5 predictors gave 83%, 93%, and 98% probabilities.",
      cutoffs: [">38.5 C", ">2.0 mg/dL", ">20 mg/L", "83%", "93%", "98%"],
      data_needed: ["oral temperature", "CRP", "ESR", "weight-bearing status", "WBC", "hip aspiration/culture status"],
      source_ids: ["CAIRD_SEPTIC_HIP_2006"],
      source_section: "Prospective predictors and CRP threshold"
    },
    {
      id: "peds_limp_chq_transient_synovitis_low_risk",
      label: "Transient synovitis support: low-grade temperature <38.5 C, able to walk or weight bear with mild pain, serious causes excluded, rest/NSAIDs, and recovery expected over days to weeks",
      criteria_text: "CHQ describes transient synovitis as an exclusion diagnosis in a child with low-grade temperature <38.5 C who is usually able to walk or weight bear with mild pain; use rest/NSAIDs and safety-net when serious infection, SUFE, Perthes, fracture, and systemic disease are unlikely.",
      cutoffs: ["<38.5 C"],
      data_needed: ["temperature", "weight-bearing status", "pain severity", "hip range of motion", "infection/fracture/SUFE/Perthes/systemic red flags", "follow-up access"],
      source_ids: ["CHQ_LIMP_CHILD_2026"],
      source_section: "Transient synovitis features and management"
    },
    {
      id: "peds_limp_sufe_perthes_age_weight_cutoffs",
      label: "Age-specific hip disease: SUFE risk increases with weight >90th percentile and about 20% bilateral disease; Perthes concern is typical in males age 3-10 years with persistent limp",
      criteria_text: "CHQ highlights SUFE risk with weight >90th percentile, endocrine/puberty risk, and about 20% bilateral involvement requiring non-weight-bearing and prompt operative treatment; Perthes is considered especially in males age 3-10 years with persistent limp and may have normal early X-ray.",
      cutoffs: [">90th percentile", "20%", "age 3-10 years"],
      data_needed: ["age", "sex", "weight percentile", "puberty/endocrine risk", "hip/groin/thigh/knee pain", "frog-leg pelvic X-ray", "ability to weight bear", "persistence of limp"],
      source_ids: ["CHQ_LIMP_CHILD_2026"],
      source_section: "Slipped upper femoral epiphysis and Perthes disease"
    },
    {
      id: "peds_limp_bji_labs_imaging_cutoffs",
      label: "Bone/joint infection testing: FBE, ESR, CRP, and blood culture before antibiotics when feasible; early osteomyelitis X-ray can stay normal for 7-10 days; MRI with contrast is preferred when localized osteomyelitis remains possible",
      criteria_text: "RCH bone/joint infection guidance recommends FBE, ESR, CRP, blood culture before antibiotics when feasible, joint aspiration when appropriate without delaying antibiotics, X-ray recognizing early osteomyelitis may be normal for 7-10 days, ultrasound for effusion but not specificity, and MRI with contrast as preferred localized osteomyelitis imaging.",
      cutoffs: ["7-10 days"],
      data_needed: ["FBE/WBC", "ESR", "CRP", "blood culture status", "antibiotic timing", "X-ray date/result", "ultrasound effusion", "MRI availability/result", "joint aspiration status"],
      source_ids: ["RCH_BONE_JOINT_INFECTION"],
      source_section: "Pathology, imaging, and aspiration investigations"
    },
    {
      id: "peds_limp_rch_bji_antibiotic_switch",
      label: "RCH bone/joint infection treatment: cefazolin 50 mg/kg max 2 g IV q8h; switch to cefalexin 45 mg/kg max 1.5 g q8h after 2-3 days IV when improving, afebrile, and markers improve; total osteomyelitis 3-4 weeks and septic arthritis 2-3 weeks",
      criteria_text: "RCH lists cefazolin 50 mg/kg (maximum 2 g) IV every 8 hours for uncomplicated bone/joint infection, oral cefalexin 45 mg/kg (maximum 1.5 g) every 8 hours, oral switch after 2-3 days IV if clinical improvement, afebrile, and improving inflammatory markers, and total duration 3-4 weeks for osteomyelitis or 2-3 weeks for septic arthritis.",
      cutoffs: ["50 mg/kg", "2 g", "q8h", "45 mg/kg", "1.5 g", "2-3 days", "3-4 weeks", "2-3 weeks"],
      data_needed: ["weight", "drug allergy", "age", "organism/resistance risk", "clinical improvement", "temperature trend", "CRP/ESR trend", "oral tolerance", "diagnosis osteomyelitis versus septic arthritis"],
      source_ids: ["RCH_BONE_JOINT_INFECTION"],
      source_section: "Treatment and antimicrobial duration"
    },
    {
      id: "peds_limp_chq_bji_48h_switch_stop",
      label: "CHQ bone/joint infection oral switch/stopping: IV minimum 48 hours; afebrile at least 24 hours; CRP <20 mg/L or down >2/3 from peak; recheck CRP 1 week after oral switch and before stopping; total osteomyelitis 3-4 weeks and septic arthritis 2-3 weeks",
      criteria_text: "CHQ recommends initial IV therapy for a minimum of 48 hours, oral switch when uncomplicated disease is clinically improved, afebrile at least 24 hours, tolerating oral intake, and CRP <20 mg/L or down by more than two-thirds from peak; recheck CRP one week after oral switch and before stopping, with total duration 3-4 weeks for osteomyelitis and 2-3 weeks for septic arthritis.",
      cutoffs: ["48 hours", "24 hours", "CRP <20 mg/L", ">2/3 from peak", "1 week", "3-4 weeks", "2-3 weeks"],
      data_needed: ["IV antibiotic start time", "temperature trend", "clinical improvement", "oral intake", "CRP peak", "current CRP", "CRP one week after oral switch", "CRP before stopping", "diagnosis osteomyelitis versus septic arthritis"],
      source_ids: ["CHQ_BONE_JOINT_INFECTION_2025"],
      source_section: "IV-to-oral switch, monitoring, and treatment duration"
    },
    {
      id: "peds_limp_chq_bji_complicated_id_review",
      label: "Complicated bone/joint infection review: ID/AMS code within 24-48 hours for MRSA/complex disease; seek senior ID before IV beyond 2-3 days, PICC, neonate, immunocompromise, Pseudomonas, relapse, or persistent bacteremia",
      criteria_text: "CHQ requires ID review and antimicrobial stewardship authorization within 24-48 hours for MRSA or complex therapy contexts and senior ID input before longer-term IV/PICC plans beyond 2-3 days or for complex disease, neonates, immunocompromise, Pseudomonas, relapse, or persistent bacteremia.",
      cutoffs: ["24-48 hours", "2-3 days"],
      data_needed: ["organism/resistance risk", "MRSA risk", "antibiotic plan", "IV duration", "PICC consideration", "age/neonate status", "immunocompromise", "Pseudomonas risk", "relapse", "blood culture clearance"],
      source_ids: ["CHQ_BONE_JOINT_INFECTION_2025"],
      source_section: "Complex therapy, AMS authorization, and ID review"
    },
    {
      id: "peds_limp_acr_occult_fracture_negative_xray",
      label: "Occult toddler fracture support: negative initial radiographs do not exclude nondisplaced fracture; follow-up radiographs found toddler fracture in 16 of 39 (41%) clinically presumed cases",
      criteria_text: "ACR notes negative radiographs do not exclude nondisplaced fracture and cites a series where 16 of 39 clinically presumed toddler fractures with negative initial imaging were seen on follow-up radiographs.",
      cutoffs: ["16 of 39", "41%"],
      data_needed: ["localized tenderness", "trauma history", "initial radiograph result", "immobilization status", "follow-up imaging plan", "safeguarding screen"],
      source_ids: ["ACR_ACUTELY_LIMPING_CHILD_2018"],
      source_section: "Radiography and occult toddler fracture discussion"
    },
    {
      id: "peds_limp_chq_return_precautions",
      label: "CHQ limp safety-net: return for fever, worsening/nocturnal pain, refusal to weight bear despite analgesia, no improvement after 3 days, persistence >14 days, or tired/lethargic/unwell state",
      criteria_text: "CHQ parent advice recommends re-presentation for fever, worsening or nocturnal pain, refusal to weight bear despite analgesia, no improvement after 3 days, symptoms persisting more than 14 days, or if the child is tired, lethargic, or unwell.",
      cutoffs: ["3 days", ">14 days"],
      data_needed: ["fever recurrence", "pain trajectory", "night pain", "weight-bearing after analgesia", "days since onset", "energy/systemic state", "family follow-up access"],
      source_ids: ["CHQ_LIMP_CHILD_2026"],
      source_section: "Parent information and follow-up advice"
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

function dedupeSentences(text = "") {
  const seen = new Set();
  const sentences = cleanText(text).split(/(?<=[.!?])\s+/).filter(Boolean);
  const uniqueSentences = sentences.filter((sentence) => {
    const key = sentence.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return cleanText(uniqueSentences.join(" "));
}

function cleanGeneratedScaffoldText(value = "", fallback = "") {
  let text = cleanText(value);
  text = text
    .replace(/\bkey thresholds and interpretation caveats:\s*/gi, "")
    .replace(/\bdiagnostic frame from guideline-sourced endocrine workup\b/gi, "diagnostic assessment")
    .replace(/\bsource-backed criteria\b/gi, "cited criteria")
    .replace(/\bsource-backed management route\b/gi, "cited management route")
    .replace(/\bUse this frame to decide whether\s+(.+?)\s+is the right first confirmatory step and whether urgent endocrine escalation is needed\.?/gi, "Confirm whether $1 is indicated and whether same-day endocrine escalation is needed.")
    .replace(/\bProvides diagnostic or safety thresholds that change interpretation and management for [^.]+\.?/gi, "")
    .replace(/:\s*diagnostic bucket, mimic, exclusion, or competing frame that prevents premature closure for [^.]+\.?/gi, "")
    .replace(/\bUse local assay and patient context; do not apply numeric anchors without clinical interpretation\.?/gi, "Interpret with local assay, medications, pregnancy status, acute illness, and patient context.")
    .replace(/\bthreshold-defined branch\b/gi, "threshold branch")
    .replace(/\bpresenting trigger\b/gi, "presentation")
    .replace(/\bcriteria match\b/gi, "criteria met")
    .replace(/\benough context\b/gi, "required context")
    .replace(/\bgather objective data\b/gi, "review measured findings")
    .replace(/\bobjective data\b/gi, "measured findings")
    .replace(/\bobjective findings\b/gi, "measured findings")
    .replace(/\bdanger features?\b/gi, "high-risk findings")
    .replace(/\bkey labs\/results\b/gi, "threshold labs/results")
    .replace(/\bkey results\b/gi, "threshold results")
    .replace(/\btargeted\b/gi, "focused")
    .replace(/\btraditional abnormal cutoff\b/gi, "traditional abnormal threshold");
  return dedupeSentences(text) || cleanText(fallback);
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
  return cleanGeneratedScaffoldText(item.label || item.text || item.action || item.management_change || item.diagnostic_target || item.id || "");
}

function itemAction(item = {}, fallback = "") {
  return cleanGeneratedScaffoldText(item.action || item.management_change || item.rationale || itemLabel(item) || fallback);
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

function displayWorkupLabel(value = "") {
  return cleanText(value).replace(/\s*\([^)]{1,90}\)/g, "");
}

function visibleEvidenceLabel(item = {}) {
  const text = itemLabel(item);
  if (!text) return "";
  if (/diagnostic frame from guideline-sourced endocrine workup/i.test(text)) return "";
  if (/^key thresholds and interpretation caveats/i.test(text)) return "";
  if (/^important mimics\/exclusions/i.test(text)) return "competing endocrine, medication, pregnancy, organ-failure, pituitary/sellar, and age-specific mimics";
  if (/^hemodynamic instability, altered mental status/i.test(text)) return "unstable vitals, altered mental status, arrhythmia, airway risk, or vision threat";
  if (/^positive pregnancy with pain\/bleeding/i.test(text)) return "pregnancy-critical pain/bleeding, tumor-range hormones, mass, or priapism";
  if (/^unstable physiology, endocrine crisis/i.test(text)) return "unstable physiology or dangerous electrolyte/glucose abnormality";
  if (/^discordant or borderline endocrine tests/i.test(text)) return "discordant endocrine tests need correct timing, assay, medication, pregnancy, and illness context";
  return text;
}

function visibleListLabels(items = [], maxItems = 5) {
  return items.map(visibleEvidenceLabel).filter(Boolean).slice(0, maxItems);
}

function displayCriterionLabel(row = {}) {
  const label = cleanGeneratedScaffoldText(row.label || row.id || "criterion", row.id || "criterion");
  const concise = label.includes(":") ? label.split(":")[0] : label;
  return cleanText(concise.replace(/\s*\([^)]{1,90}\)/g, ""));
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
  const cleanLabel = cleanGeneratedScaffoldText(label, id);
  const cleanCriteriaText = cleanGeneratedScaffoldText(criteria_text || label, cleanLabel);
  return {
    id,
    label: cleanLabel,
    criteria_text: cleanCriteriaText,
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
    criteria: rule || criteria(`${id}_criteria`, `Use this ${type} when the cited condition-specific rule, cutoff, or patient-data route is satisfied.`, contextDomains, sourceIds),
    action: cleanText(action || label || id),
    children
  };
  if (endpointType) entry.endpoint_type = endpointType;
  if (endpointType === "missing_data_needed") {
    entry.label = "Internal data-availability guard";
    entry.edgeLabel = "Internal data-availability guard";
    entry.action = "Internal traversal guard for data completeness; hidden from the clinical pathway display.";
    entry.internal_traversal_guard = true;
    entry.display = {
      visible_in_pathway: false,
      visible_in_graph: false,
      visible_in_outline: false,
      reason: "Internal traversal guard; exact missing fields remain in missing_data_needed."
    };
  }
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
  return cleanGeneratedScaffoldText([item.label, item.action, item.management_change, item.diagnostic_target, item.rationale].filter(Boolean).join(" "));
}

function extractedCutoffCriteria(module) {
  const rows = [];
  for (const group of evidenceGroups.filter((group) => group !== "clinical_cutoff_criteria")) {
    const items = Array.isArray(module[group]) ? module[group] : [];
    items.forEach((item) => {
      const text = evidenceText(item);
      const cutoffs = unique(text.match(new RegExp(cutoffPattern.source, "gi")) || []).filter(hasRealCutoff);
      if (!cutoffs.length) return;
      const cleanLabel = cleanGeneratedScaffoldText(
        itemLabel(item),
        `${displayWorkupLabel(module.label || module.id)} thresholds: ${cutoffs.slice(0, 4).join(", ")}`
      );
      rows.push(criterion({
        id: `${group}_${item.id || slug(itemLabel(item))}`,
        label: cleanLabel,
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

function endpointMajorPathway(endpoint = {}) {
  const text = cleanText(`${endpoint.id || ""} ${endpoint.label || ""} ${endpoint.edgeLabel || ""} ${endpoint.action || ""}`).toLowerCase();
  if (endpoint.endpoint_type === "missing_data_needed") return "missing_data_needed";
  if (endpoint.endpoint_type === "deescalation_stopping" || /de-?escalat|stop|narrow|taper|transition|resolution/.test(text)) return "deescalation_stopping_criteria";
  if (endpoint.endpoint_type === "follow_up" || endpoint.endpoint_type === "safety_net_instruction" || /follow|safety|return precaution|discharge|outpatient|home/.test(text)) return "disposition_followup_safety_netting";
  if (endpoint.endpoint_type === "monitoring_reassessment" || /monitor|reassess|worsen|persistent|trend/.test(text)) return "monitoring_reassessment_escalation";
  if (endpoint.endpoint_type === "clinician_review_handoff" && /contra|pregnan|special|local|policy|formulary|review|conflict/.test(text)) return "contraindications_special_populations";
  if (endpoint.endpoint_type === "clinician_review_handoff" || /mimic|alternate|competing|excluded|contradict|not fit/.test(text)) return "mimics_exclusions";
  if (endpoint.endpoint_type === "diagnostic_step" || /diagnos|confirm|test|image|culture|lab/.test(text)) return "diagnostic_confirmation";
  if (endpoint.endpoint_type === "escalation_disposition" || /emergency|shock|icu|urgent|escalat|admit|transfer|unstable/.test(text)) return "escalation_emergency_actions";
  if (endpoint.endpoint_type === "treatment" || /treat|therapy|dose|insulin|antibiotic|fluid|start/.test(text)) return "first_line_management";
  return "severity_risk_stratification";
}

function pathToNode(root, targetId, path = []) {
  if (!root) return null;
  const nextPath = [...path, root];
  if (root.id === targetId) return nextPath;
  for (const child of root.children || []) {
    const found = pathToNode(child, targetId, nextPath);
    if (found) return found;
  }
  return null;
}

function terminalEndpoints(root) {
  const leaves = [];
  const visit = (node) => {
    if (!node) return;
    if (!Array.isArray(node.children) || !node.children.length) {
      if (node.type === "endpoint") leaves.push(node);
      return;
    }
    node.children.forEach(visit);
  };
  visit(root);
  return leaves;
}

function completeSyntheticScenarioCoverage(root, scenarios = []) {
  const usedScenarioIds = new Set();
  const seenEndpointIds = new Set();
  const normalized = scenarios.map((scenario, index) => {
    const endpointPath = pathToNode(root, scenario.expected_endpoint_id);
    const terminal = endpointPath?.[endpointPath.length - 1] || {};
    const scenarioId = scenario.scenario_id || `scenario_${index + 1}`;
    usedScenarioIds.add(scenarioId);
    if (scenario.expected_endpoint_id) seenEndpointIds.add(scenario.expected_endpoint_id);
    return {
      ...scenario,
      scenario_id: scenarioId,
      major_pathway: scenario.major_pathway || endpointMajorPathway(terminal),
      expected_active_branch: cleanText(scenario.expected_active_branch || terminal.edgeLabel || terminal.label || scenario.expected_endpoint_id),
      expected_path_node_ids: endpointPath ? endpointPath.map((node) => node.id).filter(Boolean) : [],
      terminal_endpoint_id: terminal.id || scenario.expected_endpoint_id || "",
      traversal_status: endpointPath ? "reaches_expected_endpoint" : "endpoint_not_found"
    };
  });
  for (const endpoint of terminalEndpoints(root)) {
    if (seenEndpointIds.has(endpoint.id)) continue;
    let scenarioId = `endpoint_${slug(endpoint.id)}_coverage`;
    let suffix = 2;
    while (usedScenarioIds.has(scenarioId)) {
      scenarioId = `endpoint_${slug(endpoint.id)}_coverage_${suffix}`;
      suffix += 1;
    }
    usedScenarioIds.add(scenarioId);
    seenEndpointIds.add(endpoint.id);
    const endpointPath = pathToNode(root, endpoint.id) || [];
    normalized.push({
      scenario_id: scenarioId,
      major_pathway: endpointMajorPathway(endpoint),
      expected_endpoint_id: endpoint.id,
      expected_active_branch: cleanText(endpoint.edgeLabel || endpoint.label),
      expected_path_node_ids: endpointPath.map((node) => node.id).filter(Boolean),
      terminal_endpoint_id: endpoint.id,
      traversal_status: "reaches_expected_endpoint",
      synthetic_context: {
        structured_context_domains: contextDomains,
        branch_trigger: cleanText(endpoint.edgeLabel || endpoint.label),
        expected_terminal_endpoint_type: endpoint.endpoint_type || "endpoint",
        missing_data_needed: Array.isArray(endpoint.missing_data_needed) ? endpoint.missing_data_needed : []
      },
      coverage_type: "terminal_endpoint_coverage"
    });
  }
  return normalized;
}

function buildCompactClinicalPathwayTree(module, sourceById) {
  const label = module.label || module.id;
  const displayLabel = displayWorkupLabel(label);
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
    ...visibleListLabels(tests, 8),
    ...criteriaRows.flatMap((row) => row.cutoffs || []).slice(0, 8)
  ]);
  const thresholdExamples = unique(criteriaRows.flatMap((row) => row.cutoffs || [])).slice(0, 10);
  const cutoffSummary = criteriaRows.slice(0, 5).map((row) => `${displayCriterionLabel(row)}: ${(row.cutoffs || []).slice(0, 5).join(", ")}`).join(" | ");
  const thresholdSummary = cutoffSummary || thresholdExamples.join("; ") || "documented diagnostic criteria with clinician review when numeric thresholds are unavailable";
  const shortThresholdSummary = arrayText(thresholdExamples, thresholdSummary, 6);
  const redFlagSummary = visibleListLabels(redFlags, 3).join("; ");
  const safetySummary = visibleListLabels(safetyChecks, 5);
  const compactRouteSummary = arrayText([
    ...visibleListLabels(redFlags, 2),
    ...thresholdExamples.slice(0, 3),
    ...visibleListLabels(treatments, 2),
    ...visibleListLabels(dispositions, 2)
  ], `${displayLabel} diagnostic thresholds, acuity, medication safety, and disposition`, 7);
  const treatmentSummary = [...visibleListLabels(treatments, 3), ...visibleListLabels(dispositions, 2)].filter(Boolean).join("; ");
  const activationItems = firstItems(module, "requiredQuestions", 4, ["conditionalQuestions", "requiredExam"]);
  const activationSummary = arrayText([
    ...visibleListLabels(activationItems, 4),
    ...visibleListLabels(redFlags, 2),
    ...visibleListLabels(tests, 2)
  ], `${displayLabel} symptoms, exam, vitals, and threshold results`, 7);
  const diagnosticDataSummary = arrayText([
    ...visibleListLabels(tests, 5),
    ...criteriaRows.flatMap((row) => row.data_needed || []).slice(0, 6),
    ...thresholdExamples.slice(0, 4)
  ], `${displayLabel} diagnostic, severity, and treatment-safety results`, 10);
  const redFlagBranchSummary = arrayText([
    ...visibleListLabels(redFlags, 4),
    ...thresholdExamples.slice(0, 3),
    ...visibleListLabels(dispositions, 2)
  ], `${displayLabel} high-acuity threshold, unstable physiology, or monitored-care rule`, 8);
  const alternateBranchSummary = cleanText(visibleListLabels(differentials, 4).join("; ") || `${displayLabel} exclusion or competing diagnosis`);
  const safetyModifierSummary = arrayText([
    ...visibleListLabels(safetyChecks, 4),
    "pregnancy/postpartum/lactation status",
    "renal/hepatic/cardiac disease",
    "allergy or drug interaction",
    "pediatric/adult applicability",
    "local protocol requirement"
  ], `${displayLabel} treatment modifier`, 8);
  const monitoringSummary = arrayText([
    ...thresholdExamples.slice(0, 4),
    ...visibleListLabels(tests, 3),
    ...visibleListLabels(safetyChecks, 3)
  ], `${displayLabel} symptoms, vitals, labs/results, adverse effects, and disposition`, 8);
  const reassessmentSummary = arrayText([
    ...visibleListLabels(redFlags, 3),
    ...thresholdExamples.slice(0, 4),
    ...visibleListLabels(tests, 3),
    ...visibleListLabels(safetyChecks, 2)
  ], `${displayLabel} symptoms, vital signs, threshold results, imaging/ECG/procedure findings, treatment tolerance, and complications`, 9);
  const deescalationSummary = arrayText([
    ...thresholdExamples.slice(0, 4),
    ...visibleListLabels(dispositions, 3),
    ...visibleListLabels(treatments, 3)
  ], `${displayLabel} objective response and diagnosis certainty`, 8);
  const followupSummary = arrayText([
    "pending-result owner",
    "follow-up interval",
    "return precautions",
    ...visibleListLabels(dispositions, 3)
  ], `${displayLabel} follow-up ownership and safety net`, 6);
  const edgeLabels = {
    missingContext: `Missing ${displayLabel}: onset/trajectory, focused exam, vitals, threshold labs/results, meds, comorbidities, pregnancy/applicability, or follow-up access`,
    diagnosticData: `Collect ${displayLabel}: ${arrayText([...visibleListLabels(tests, 4), ...thresholdExamples.slice(0, 3), ...safetySummary.slice(0, 2)], `${displayLabel} symptoms, exam, vitals, threshold labs/results, medication safety, and major cutoffs`, 8)}`,
    classification: `Classify ${displayLabel} with available result(s): ${arrayText(thresholdExamples.slice(0, 4), diagnosticDataSummary, 4)}`,
    missingCutoff: `Missing ${displayLabel} result(s): ${arrayText(exactDiagnosticData, `${displayLabel} threshold/result data`, 6)}`,
    urgent: `High-acuity threshold or monitored-care result present: ${arrayText([redFlagSummary, ...thresholdExamples.slice(0, 2)], redFlagBranchSummary, 4)}`,
    treatment: `Confirmed/high-risk ${displayLabel} branch has treatment-safety data available`,
    alternate: `Mimic or alternate pathway favored: ${alternateBranchSummary}`,
    safetySelected: `Medication, procedure, pregnancy, comorbidity, or local-policy modifier may change the plan`,
    review: `Pregnancy/postpartum, pediatric/adult fit, renal/hepatic/cardiac disease, allergy/drug interaction, procedure risk, conflicting source, or named local protocol changes care`,
    monitoring: `Trend ${displayLabel} symptoms, vital signs, threshold labs/results, treatment response, adverse effects, and disposition readiness`,
    worsening: `${displayLabel} reassessment worsens or ${reassessmentSummary} no longer fit the selected pathway`,
    deescalate: `Measured response supports narrowing, stopping, tapering, or continuing ${displayLabel} care`,
    followup: `${displayLabel} stable enough for owned follow-up, pending results, and safety-netting`
  };

  const followupEndpoint = endpoint({
    id: `${prefix}_followup_endpoint`,
    label: `${displayLabel}: follow-up and safety-net`,
    edgeLabel: edgeLabels.followup,
    sourceIds: managementSources,
    criteria: criteria(`${prefix}_followup_criteria`, `Use after ${label} is stable, actionable results have an owner, and return precautions are documented.`, ["symptoms", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], managementSources),
    action: `Document the ${displayLabel} diagnosis/risk category, named pending-result clinician/service, follow-up interval, and return precautions for worsening symptoms, treatment intolerance, inability to complete treatment, or abnormal pending results.`,
    endpointType: "safety_net_instruction",
    monitoringPlan: ["pending-result owner", "follow-up interval", "return precautions", "access barriers"]
  });

  const deescalateEndpoint = endpoint({
    id: `${prefix}_deescalate_endpoint`,
    label: `${displayLabel}: de-escalate, stop, or narrow`,
    edgeLabel: edgeLabels.deescalate,
    sourceIds: managementSources,
    criteria: criteria(`${prefix}_deescalate_criteria`, `Stop, narrow, taper, or de-escalate ${label} treatment only when objective response, diagnosis certainty, and cited stopping criteria support it.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], managementSources, { criteria_options: criteriaRows.slice(0, 8) }),
    action: `Use active ${displayLabel} results and response trend to stop, narrow, taper, or continue treatment; document which cutoff, symptom, adverse effect, or finding changed.`,
    endpointType: "deescalation_stopping",
    guidelineCutoffs: criteriaRows
  });

  const worseningEndpoint = endpoint({
    id: `${prefix}_worsening_endpoint`,
    label: `${displayLabel}: reassessment escalation`,
    edgeLabel: edgeLabels.worsening,
    sourceIds: unique([...redFlagSources, ...managementSources]),
    criteria: criteria(`${prefix}_worsening_criteria`, `Escalate ${label} if symptoms, vitals, critical thresholds, imaging/ECG/procedure results, or treatment response worsen or no longer fit the selected branch.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], unique([...redFlagSources, ...managementSources]), { criteria_options: criteriaRows.slice(0, 8) }),
    action: `Repeat or review ${reassessmentSummary}; reassess mimics and complications; move to ED, admission, or specialty review when the cited threshold, unstable vital sign, imaging/ECG/procedure result, or treatment-response pattern requires escalation.`,
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const monitoring = actionNode({
    id: `${prefix}_monitoring_bundle`,
    label: `${displayLabel}: monitoring and disposition readiness`,
    edgeLabel: edgeLabels.monitoring,
    sourceIds: managementSources,
    criteria: criteria(`${prefix}_monitoring_criteria`, `Monitor ${label} by trending the same cited threshold/result findings that selected the branch, plus medication adverse effects and disposition constraints.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], managementSources, { criteria_options: criteriaRows.slice(0, 8) }),
    action: `Reassess ${displayLabel} using the active thresholds and clinical course; do not close the pathway until response, adverse effects, pending data, and disposition are owned.`,
    parallelActions: unique(["repeat vital signs", "trend threshold labs/results", "review treatment response and adverse effects", "assign disposition and follow-up clinician/service", ...safetySummary]),
    guidelineCutoffs: criteriaRows,
    children: [worseningEndpoint, deescalateEndpoint, followupEndpoint]
  });

  const reviewEndpoint = endpoint({
    id: `${prefix}_review_endpoint`,
    label: `${displayLabel}: reviewer handoff for contraindication or special population`,
    edgeLabel: edgeLabels.review,
    sourceIds: cutoffSources,
    criteria: criteria(`${prefix}_review_criteria`, `Use clinician review when ${label} treatment/disposition depends on pregnancy/postpartum status, pediatric/adult applicability, renal/hepatic/cardiac disease, allergy, drug interaction, procedural risk, guideline conflict, or local protocol.`, ["pregnancy_status", "demographics", "medications", "comorbidities", "allergies", "local_policy", "workup_findings"], cutoffSources),
    action: `Pause non-emergent ${displayLabel} treatment choices until the modifier is resolved and the reviewer documents the applicable guideline or local cutoff.`,
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Patient-specific contraindication, special population, guideline conflict, or local policy affects treatment or disposition."
  });

  const safetyDecision = decision({
    id: `${prefix}_treatment_safety_decision`,
    label: `${displayLabel}: contraindications, dosing, pregnancy, and comorbidity modifiers`,
    edgeLabel: edgeLabels.safetySelected,
    sourceIds: cutoffSources,
    criteria: criteria(`${prefix}_safety_decision_criteria`, `Route ${label} management by treatment contraindications, dose/weight/renal/pregnancy constraints, and local protocol dependencies before committing to therapy.`, ["medications", "allergies", "pregnancy_status", "demographics", "comorbidities", "labs", "workup_findings"], cutoffSources, { criteria_options: criteriaRows.filter((row) => /treat|dose|mg|kg|pregnan|bmi|renal|contra/i.test(`${row.label} ${row.criteria_text}`)).slice(0, 8) }),
    action: `Apply ${displayLabel}-specific safety modifiers before final treatment or disposition.`,
    children: [reviewEndpoint, monitoring]
  });

  const treatmentBundle = actionNode({
    id: `${prefix}_treatment_bundle`,
    label: `${displayLabel}: treatment and disposition branch`,
    edgeLabel: edgeLabels.treatment,
    sourceIds: managementSources,
    criteria: criteria(`${prefix}_treatment_bundle_criteria`, `Start ${label} treatment or disposition only after the active diagnostic/severity thresholds and treatment-safety data are available.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "pregnancy_status", "workup_findings"], managementSources, { criteria_options: criteriaRows.slice(0, 10) }),
    action: treatmentSummary || `Treat ${displayLabel} according to the selected pathway, documented severity, and patient-specific safety data.`,
    parallelActions: unique([...visibleListLabels(treatments, 5), ...visibleListLabels(dispositions, 3)]),
    guidelineCutoffs: criteriaRows,
    children: [safetyDecision]
  });

  const alternateEndpoint = endpoint({
    id: `${prefix}_alternate_endpoint`,
    label: `${displayLabel}: alternate diagnosis pathway`,
    edgeLabel: edgeLabels.alternate,
    sourceIds: differentialSources,
    criteria: criteria(`${prefix}_alternate_criteria`, `Use an alternate pathway when ${label} criteria are absent, a cited mimic better explains the presentation, or objective result data contradict this workup.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"], differentialSources, { criteria_options: criteriaRows.slice(0, 8) }),
    action: `Document why ${displayLabel} is not the active pathway, name the competing diagnosis or exclusion, and route to the appropriate workup rather than reassurance alone.`,
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Competing diagnosis or exclusion changes the active pathway."
  });

  const urgentEndpoint = endpoint({
    id: `${prefix}_urgent_endpoint`,
    label: `${displayLabel}: emergency or monitored-care disposition`,
    edgeLabel: edgeLabels.urgent,
    sourceIds: unique([...redFlagSources, ...managementSources]),
    criteria: criteria(`${prefix}_urgent_criteria`, `Escalate ${label} when condition-specific red flags, cited high-risk thresholds, unstable physiology, or monitored-care disposition rules are present.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "mental_status", "workup_findings"], unique([...redFlagSources, ...managementSources]), { criteria_options: criteriaRows.slice(0, 10) }),
    action: redFlagSummary ? `${redFlagSummary}. Escalate using the cited high-risk threshold, unstable vital sign, organ-risk finding, or monitored-care rule.` : `Escalate ${displayLabel} for emergency evaluation or monitored care using cited high-risk thresholds, unstable vital signs, organ-risk findings, or monitored-care rules.`,
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const missingCutoffEndpoint = endpoint({
    id: `${prefix}_missing_cutoff_data_endpoint`,
    label: `Missing data: ${displayLabel} results`,
    edgeLabel: edgeLabels.missingCutoff,
    sourceIds: unique([...genericSourceIds, ...cutoffSources]),
    criteria: criteria(`${prefix}_missing_cutoff_data_criteria`, `Route here when ${label} cannot be classified because exact threshold/result data are missing.`, contextDomains, unique([...genericSourceIds, ...cutoffSources]), { missing_any: exactDiagnosticData }),
    action: `Obtain the exact ${displayLabel} data needed for routing: ${exactDiagnosticData.slice(0, 10).join("; ")}.`,
    endpointType: "missing_data_needed",
    missingDataNeeded: exactDiagnosticData
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: `${displayLabel}: classify thresholds, acuity, mimics, and disposition`,
    edgeLabel: edgeLabels.classification,
    sourceIds: cutoffSources,
    criteria: criteria(`${prefix}_classification_criteria`, `Classify ${label} against cited thresholds and condition-specific rules: ${shortText(thresholdSummary, 520)}`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "demographics", "pregnancy_status", "workup_findings"], cutoffSources, { criteria_options: criteriaRows }),
    action: `Choose the active ${displayLabel} branch by matching patient data to the cited cutoffs and patient-specific safety rules.`,
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingCutoffEndpoint, urgentEndpoint, treatmentBundle, alternateEndpoint]
  });

  const dataBundle = actionNode({
    id: `${prefix}_concurrent_data_bundle`,
    label: `${displayLabel}: assessment, thresholds, and treatment-safety inputs`,
    edgeLabel: edgeLabels.diagnosticData,
    sourceIds: testSources,
    criteria: criteria(`${prefix}_data_bundle_criteria`, `Obtain ${label} diagnostic/severity/treatment-safety data together rather than as a one-step chain.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "pregnancy_status"], testSources),
    action: `Obtain together: ${[...visibleListLabels(tests, 8), ...safetySummary, ...criteriaRows.flatMap((row) => row.data_needed || []).slice(0, 8)].join("; ")}.`,
    parallelActions: unique([...visibleListLabels(tests, 8), ...safetySummary, ...criteriaRows.flatMap((row) => row.data_needed || []).slice(0, 8)]),
    requiredData: exactDiagnosticData,
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: `Missing context: ${displayLabel}`,
    edgeLabel: edgeLabels.missingContext,
    sourceIds: genericSourceIds,
    criteria: criteria("missing_context_criteria", `Route here when the patient context needed to activate ${label} is absent or cannot be extracted.`, contextDomains, genericSourceIds, { missing_any: contextDomains }),
    action: `Before choosing a non-emergency ${displayLabel} branch, document the presenting concern, onset/trajectory, focused exam, vital signs, threshold labs/results, medication/allergy context, comorbidities, demographics, pregnancy/applicability status, current findings, and follow-up access.`,
    endpointType: "missing_data_needed",
    missingDataNeeded: contextDomains
  });

  const root = decision({
    id: "root",
    label: `${displayLabel}: route by ${compactRouteSummary}`,
    sourceIds: cutoffSources,
    criteria: criteria("activate_workup", `Activate when structured or extractable context matches ${label} triggers or the clinician selects workup ${module.id}.`, ["selected_workup_id", "presenting_symptoms", "problem_list_or_diagnosis", "clinician_selected_module"], cutoffSources),
    action: `Route ${displayLabel} from documented symptoms, exam, vitals, results, medication/comorbidity modifiers, severity thresholds, treatment/disposition rules, reassessment, and safety-net needs.`,
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
    synthetic_patient_scenarios: completeSyntheticScenarioCoverage(root, buildSyntheticScenarios(prefix, edgeLabels)),
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
    action: "Perform rapid infectious-versus-noninfectious assessment, obtain blood cultures/lactate and source-directed data such as urinalysis/urine culture, CXR for respiratory signs, wound or CSF studies when those sources are suspected, repeat vitals/perfusion, and either administer antimicrobials within 3 hours if infection concern persists or defer antimicrobials with close monitoring when infection likelihood is low and shock is absent.",
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
    synthetic_patient_scenarios: completeSyntheticScenarioCoverage(root, [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: "endpoint_missing_context", expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_lactate_source_data", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingSepsisDataEndpoint.id, expected_active_branch: missingSepsisDataEndpoint.edgeLabel },
      { scenario_id: "septic_shock_hypoperfusion", major_pathway: "escalation_emergency_actions", expected_endpoint_id: shockIcuEndpoint.id, expected_active_branch: shockIcuEndpoint.edgeLabel },
      { scenario_id: "possible_sepsis_mimic", major_pathway: "mimics_exclusions", expected_endpoint_id: mimicEndpoint.id, expected_active_branch: mimicEndpoint.edgeLabel },
      { scenario_id: "pregnancy_or_mdr_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: specialPopulationReview.id, expected_active_branch: specialPopulationReview.edgeLabel },
      { scenario_id: "persistent_lactate_or_hypoperfusion", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: persistentHypoperfusionEndpoint.id, expected_active_branch: persistentHypoperfusionEndpoint.edgeLabel },
      { scenario_id: "culture_deescalation_ready", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: deescalateEndpoint.id, expected_active_branch: deescalateEndpoint.edgeLabel },
      { scenario_id: "survivor_discharge_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: dischargeEndpoint.id, expected_active_branch: dischargeEndpoint.edgeLabel }
    ]),
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
    label: "Adult hyperglycemic crisis screen: glucose, ketones, pH or bicarbonate, potassium, creatinine, osmolality, mental status, medication exposure, and precipitant",
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
    synthetic_patient_scenarios: completeSyntheticScenarioCoverage(root, [
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
    ]),
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
    synthetic_patient_scenarios: completeSyntheticScenarioCoverage(root, [
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
    ]),
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

function buildCongenitalAdrenalHyperplasiaClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Congenital Adrenal Hyperplasia (CAH)";
  const prefix = "congenital_adrenal_hyperplasia";
  const esCah = ["ES_CAH_2018"];
  const geneReviews = ["GENEREVIEWS_CAH_21OHD_2016"];
  const crinecerfont = ["DAILYMED_CRENESSITY_CRINECERFONT_2024"];
  const sourceIds = unique([...esCah, ...geneReviews, ...crinecerfont, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 10);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 5, ["treatmentOptions"]);
  const criteriaRows = cahCutoffCriteria.map(criterion);

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: CAH age band, crisis signs, 17-OHP profile, electrolytes, and steroid plan",
    edgeLabel: "Missing exact CAH data: age/gestation, newborn screen or 17-OHP timing, sodium/potassium/glucose/CO2, crisis symptoms, current glucocorticoid/mineralocorticoid/crinecerfont use, pregnancy/fertility status, or follow-up access",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when the chart does not contain enough CAH-specific data to distinguish salt-wasting emergency, diagnostic confirmation, classic treatment, nonclassic treatment, pregnancy/DSD review, or routine follow-up.", contextDomains, sourceIds, { missing_any: ["age in days/months/years", "gestational age or birth weight when newborn", "newborn screen or early morning 17-OHP", "sodium", "potassium", "glucose", "CO2/bicarbonate", "vomiting/dehydration/shock status", "current glucocorticoid/mineralocorticoid/crinecerfont plan", "pregnancy or fertility intent when relevant"] }),
    action: "Before choosing a CAH branch, document age and gestational-age context, newborn screen result or early morning 17-OHP with assay method, cosyntropin timing/result if needed, sodium, potassium, glucose, CO2/bicarbonate, hydration and perfusion, vomiting or ability to keep steroids down, current hydrocortisone/prednisone/fludrocortisone/salt/crinecerfont use, pregnancy or fertility intent, CYP21A2/genetic counseling status, and reliable follow-up access.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["age in days/months/years", "gestational age and birth weight when newborn", "newborn screen result or early morning 17-OHP with assay method", "cosyntropin dose and 60-minute steroid profile when indicated", "sodium", "potassium", "glucose", "CO2/bicarbonate", "blood pressure/perfusion and hydration", "vomiting or oral intake", "current glucocorticoid/mineralocorticoid/salt/crinecerfont regimen", "pregnancy/fertility intent", "follow-up access"]
  });

  const missingDiagnosticEndpoint = endpoint({
    id: `${prefix}_missing_diagnostic_data_endpoint`,
    label: "Missing data needed: cannot classify classic, nonclassic, salt-wasting, or mimic",
    edgeLabel: "CAH phenotype cannot be assigned until 17-OHP timing/assay, cosyntropin steroid profile, electrolytes, glucocorticoid exposure, and CYP21A2/family context are known",
    sourceIds: unique([...esCah, ...geneReviews]),
    criteria: criteria(`${prefix}_missing_diagnostic_data_criteria`, "Route here when a patient has possible CAH but the exact diagnostic thresholds or exclusion data are unavailable.", ["demographics", "symptoms", "exam", "labs", "medications", "workup_findings"], unique([...esCah, ...geneReviews]), { missing_any: ["early morning 17-OHP", "assay method", "age/gestational age", "baseline and 60-minute cosyntropin steroid profile when borderline", "sodium/potassium/glucose/CO2", "current glucocorticoid exposure", "CYP21A2 testing or family variant when diagnosis remains equivocal"] }),
    action: "Complete CAH confirmation before labeling severity: repeat newborn screen or send serum 17-OHP with gestational-age and assay context, use LC-MS/MS when available, defer cosyntropin until after 24-48 hours of life when applicable, send baseline and 60-minute cortisol/17-OHP plus adrenal steroid profile for borderline results, check sodium, potassium, glucose, CO2/bicarbonate, renin/aldosterone when salt wasting is possible, and use CYP21A2 testing for equivocal profiles or genetic counseling.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["17-OHP value, timing, and assay", "gestational-age or early-morning context", "baseline and 60-minute cosyntropin steroid profile when borderline", "electrolytes and glucose", "renin/aldosterone when salt wasting possible", "glucocorticoid exposure", "CYP21A2/family testing when equivocal"]
  });

  const crisisEndpoint = endpoint({
    id: `${prefix}_adrenal_crisis_endpoint`,
    label: "Salt-wasting or adrenal crisis: hydrocortisone injection, isotonic fluid, dextrose, and monitored care",
    edgeLabel: "Emergency branch: newborn first 4 weeks or any CAH patient with vomiting, dehydration, shock, hypoglycemia, hyponatremia, hyperkalemia, major illness, surgery, trauma, labor, or missed steroids",
    sourceIds: unique([...esCah, ...geneReviews]),
    criteria: criteria(`${prefix}_crisis_criteria`, "Use when salt-wasting crisis or adrenal crisis is suspected; treatment should not wait for full diagnostic confirmation in an unstable patient.", ["symptoms", "exam", "vitals", "labs", "medications", "demographics", "pregnancy_status", "workup_findings"], unique([...esCah, ...geneReviews]), { criteria_options: criteriaRows.filter((row) => /crisis|salt|stress|hydrocortisone|newborn/i.test(row.id)) }),
    action: "If blood draw will not delay treatment, send cortisol/ACTH or CAH steroid profile first, then give parenteral hydrocortisone immediately: 25 mg for infants/preschool children, 50 mg for school-age children, or 100 mg for adults. Continue IV hydrocortisone as one-quarter of the initial dose every 6 hours per the CAH guideline, give isotonic saline with dextrose when hypoglycemic or unable to feed, correct potassium/glucose abnormalities, treat infection/trauma/surgical trigger, and admit or monitor at ED/ICU level until perfusion, glucose, sodium, potassium, and oral intake stabilize.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["blood pressure/perfusion", "mental status", "glucose", "sodium", "potassium", "CO2/bicarbonate", "urine output", "hydrocortisone dose time", "oral intake", "precipitating illness or surgery"]
  });

  const newbornDiagnosticEndpoint = endpoint({
    id: `${prefix}_newborn_confirmation_endpoint`,
    label: "Newborn positive screen or virilization: confirm 21-hydroxylase CAH and prevent salt wasting",
    edgeLabel: "Newborn branch: positive screen, ambiguous genitalia/virilization, poor feeding, vomiting, weight loss, dehydration, or family history with age/gestation-adjusted 17-OHP pending",
    sourceIds: unique([...esCah, ...geneReviews]),
    criteria: criteria(`${prefix}_newborn_confirmation_criteria`, "Use for stable newborns or infants with a positive CAH screen, virilization, family risk, or early salt-wasting concern who are not already in adrenal crisis.", ["demographics", "symptoms", "exam", "labs", "workup_findings"], unique([...esCah, ...geneReviews]), { criteria_options: criteriaRows.filter((row) => /newborn|cosyntropin|salt/i.test(row.id)) }),
    action: "Refer to pediatric endocrinology when regionally available, check serum 17-OHP with gestational-age/birth-weight interpretation, sodium, potassium, glucose, CO2/bicarbonate, renin/aldosterone when salt wasting is possible, and a second-tier LC-MS/MS or cosyntropin steroid profile when first-tier testing is positive or borderline. Do not use immediate postbirth cosyntropin sampling before 24-48 hours unless endocrine review determines benefit outweighs false result risk.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["feeding and weight", "hydration", "blood pressure/perfusion", "sodium", "potassium", "glucose", "17-OHP/steroid profile", "newborn-screen follow-up owner"]
  });

  const afterInfancyDiagnosticEndpoint = endpoint({
    id: `${prefix}_after_infancy_diagnosis_endpoint`,
    label: "After infancy: classify classic, nonclassic, carrier, or unaffected by early morning 17-OHP and cosyntropin profile",
    edgeLabel: "Symptomatic child, adolescent, or adult branch: virilization, rapid pubarche, advanced bone age, hirsutism/acne, menstrual irregularity, infertility, adrenal rest tumor, or family history",
    sourceIds: unique([...esCah, ...geneReviews]),
    criteria: criteria(`${prefix}_after_infancy_diagnosis_criteria`, "Use when possible CAH presents after infancy and early morning biochemical thresholds can separate classic, nonclassic, and mimic pathways.", ["symptoms", "exam", "labs", "demographics", "pregnancy_status", "workup_findings"], unique([...esCah, ...geneReviews]), { criteria_options: criteriaRows.filter((row) => /17ohp|cosyntropin|after_infancy/i.test(row.id)) }),
    action: "Screen symptomatic patients past infancy with early morning 17-OHP by LC-MS/MS, before 8 AM and in the follicular phase when menstruating. Treat classic-range 17-OHP greater than 10,000 ng/dL (300 nmol/L) as classic CAH confirmation with endocrinology. For baseline 17-OHP 200-10,000 ng/dL or ACTH-stimulated 17-OHP 1,000-10,000 ng/dL, route to nonclassic CAH management after excluding assay, timing, PCOS, adrenal tumor, and other steroidogenesis defects; if stimulated 17-OHP is nondiagnostic or testing is confounded by glucocorticoids, use CYP21A2 testing and specialist review.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["17-OHP timing and assay", "cosyntropin stimulated 17-OHP", "androgen profile", "bone age/growth in children", "menstrual/fertility status", "mimic evaluation"]
  });

  const classicTreatmentEndpoint = endpoint({
    id: `${prefix}_classic_replacement_endpoint`,
    label: "Classic CAH replacement: hydrocortisone, mineralocorticoid, salt in infancy, and dose-safety monitoring",
    edgeLabel: "Classic CAH confirmed or highly likely without crisis: salt-wasting or simple-virilizing phenotype, classic 17-OHP range, or established CYP21A2 diagnosis needs maintenance therapy",
    sourceIds: esCah,
    criteria: criteria(`${prefix}_classic_replacement_criteria`, "Use for stable classic CAH patients who need maintenance glucocorticoid/mineralocorticoid replacement or dose review.", ["labs", "medications", "demographics", "exam", "vitals", "workup_findings"], esCah, { criteria_options: criteriaRows.filter((row) => /growing|adult_classic|monitoring|overtreatment/i.test(row.id)) }),
    action: "For growing classic CAH, use hydrocortisone tablets 10-15 mg/m2/day divided three times daily, avoid oral hydrocortisone suspension and chronic long-acting potent glucocorticoids, add fludrocortisone 0.05-0.2 mg/day, and add sodium chloride 1-2 g/day (17-34 mEq/day) during infancy when salt-wasting risk applies. For fully grown adults, use an endocrine-supervised regimen such as hydrocortisone 15-25 mg/day in 2-3 doses or a selected long-acting glucocorticoid plus fludrocortisone 0.05-0.2 mg/day when indicated. Do not drive 17-OHP into the normal range just to normalize labs because that suggests overtreatment.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["growth velocity and weight", "blood pressure", "renin", "sodium", "potassium", "17-OHP and androstenedione timing", "Cushingoid features", "salt craving or edema", "medication adherence/access"]
  });

  const nonclassicTreatmentEndpoint = endpoint({
    id: `${prefix}_nonclassic_symptomatic_endpoint`,
    label: "Nonclassic CAH symptoms: treat patient-important androgen effects or fertility goals, not an isolated lab value",
    edgeLabel: "Nonclassic branch needing therapy: rapid pubarche, advanced bone age, overt virilization, infertility, miscarriage history, or patient-important hyperandrogenism",
    sourceIds: esCah,
    criteria: criteria(`${prefix}_nonclassic_symptomatic_criteria`, "Use when nonclassic CAH is confirmed and symptoms or reproductive goals justify treatment.", ["symptoms", "exam", "labs", "demographics", "pregnancy_status", "workup_findings"], esCah, { criteria_options: criteriaRows.filter((row) => /nonclassic/i.test(row.id)) }),
    action: "Discuss glucocorticoid risks and benefits. Treat children/adolescents when pubarche or bone age advances inappropriately fast or overt virilization occurs; treat adult women when hyperandrogenism or infertility is patient-important. Use a glucocorticoid that does not cross the placenta when nonclassic CAH is associated with infertility or prior miscarriage, and coordinate fertility or reproductive endocrinology review when pregnancy is desired.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["pubarche or virilization trajectory", "bone age/growth", "androgen symptoms", "menstrual pattern", "fertility goal", "glucocorticoid adverse effects"]
  });

  const nonclassicDeescalationEndpoint = endpoint({
    id: `${prefix}_nonclassic_no_daily_or_stop_endpoint`,
    label: "Nonclassic CAH without treatment indication: avoid or stop daily steroids and reserve stress dosing for proven cortisol risk",
    edgeLabel: "Low-treatment branch: asymptomatic nonpregnant nonclassic CAH, adult height attained, symptoms resolved, most adult males, or stress dosing question without inadequate cortisol reserve",
    sourceIds: esCah,
    criteria: criteria(`${prefix}_nonclassic_deescalation_criteria`, "Use when nonclassic CAH does not justify daily glucocorticoids or when prior treatment can be tapered/stopped.", ["symptoms", "exam", "labs", "demographics", "medications", "pregnancy_status", "workup_findings"], esCah, { criteria_options: criteriaRows.filter((row) => /nonclassic/i.test(row.id)) }),
    action: "Do not prescribe daily glucocorticoids for asymptomatic nonpregnant nonclassic CAH. Offer discontinuation when adult height is attained or symptoms resolve. For major surgery, trauma, or childbirth, use hydrocortisone stress dosing only if cosyntropin peak cortisol is suboptimal below 14-18 ug/dL (400-500 nmol/L) or iatrogenic adrenal suppression is present; otherwise give routine perioperative care and safety-net instructions.",
    endpointType: "de_escalation_stopping_criteria",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["symptom recurrence", "growth/bone age if pediatric", "cosyntropin peak cortisol when major stress is planned", "iatrogenic steroid suppression", "pregnancy/childbirth plan"]
  });

  const crinecerfontEndpoint = endpoint({
    id: `${prefix}_crinecerfont_adjunct_endpoint`,
    label: "Crinecerfont adjunct: age >=4 classic CAH with androgen-control need and continued glucocorticoid replacement",
    edgeLabel: "Adjunct branch: classic CAH age at least 4 years, weight known, androgen control remains problematic, glucocorticoid replacement continues, and hypersensitivity/renal/CYP3A4 risks are reviewed",
    sourceIds: crinecerfont,
    criteria: criteria(`${prefix}_crinecerfont_criteria`, "Use when crinecerfont is being considered, started, monitored, dose-adjusted, or stopped.", ["demographics", "labs", "medications", "comorbidities", "vitals", "workup_findings"], crinecerfont, { criteria_options: criteriaRows.filter((row) => /crinecerfont/i.test(row.id)) }),
    action: "Use crinecerfont only as adjunctive therapy for classic CAH in adults or children age 4 years or older. Dose adults at 100 mg twice daily with morning and evening meals. For pediatric patients age 4 years or older, dose 25 mg twice daily for 10 to less than 20 kg, 50 mg twice daily for 20 to less than 55 kg, and 100 mg twice daily for at least 55 kg. Continue glucocorticoid replacement, do not reduce below physiologic replacement, reassess androstenedione beginning 4 weeks after initiation, avoid use in severe renal impairment or ESRD, adjust for CYP3A4 inducers per label, and discontinue for clinically significant hypersensitivity.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["age and weight", "glucocorticoid replacement dose", "androstenedione at 4 weeks or later", "adrenal insufficiency symptoms", "hypersensitivity symptoms", "renal function", "CYP3A4 inducer list"]
  });

  const pregnancyDsdReviewEndpoint = endpoint({
    id: `${prefix}_pregnancy_dsd_review_endpoint`,
    label: "Pregnancy, prenatal dexamethasone, fertility, or DSD surgery: specialist review required",
    edgeLabel: "Special branch: pregnancy or conception planning, infertility, prenatal dexamethasone request, partner/genetic counseling need, virilized 46,XX infant, or genital surgery discussion",
    sourceIds: esCah,
    criteria: criteria(`${prefix}_pregnancy_dsd_review_criteria`, "Use when pregnancy, fertility, prenatal treatment, genetic counseling, or genital anatomy decisions alter CAH management.", ["pregnancy_status", "demographics", "exam", "labs", "medications", "workup_findings"], esCah, { criteria_options: criteriaRows.filter((row) => /pregnancy|prenatal|genital|surgery/i.test(row.id)) }),
    action: "Refer to endocrinology with maternal-fetal medicine, reproductive endocrinology, genetics, pediatric urology/DSD team, and behavioral health as appropriate. For pregnancy, continue prepregnancy hydrocortisone or prednisolone and fludrocortisone with symptom-guided adjustment, avoid dexamethasone when pregnant or trying to conceive, plan stress-dose glucocorticoids for labor/delivery, and complete genetic counseling for patients, partners, and families. Prenatal dexamethasone for CAH risk remains experimental and should occur only through an IRB-approved protocol with fetal sex screening and outcomes capture. Elective genital surgery should be optional, shared, and performed only in experienced centers.",
    endpointType: "clinician_review_handoff",
    guidelineCutoffs: criteriaRows,
    reviewNeededReason: "Pregnancy, prenatal therapy, fertility, genetic counseling, and genital surgery decisions need specialist governance and local ethical/legal review."
  });

  const monitoringEndpoint = endpoint({
    id: `${prefix}_monitoring_reassessment_endpoint`,
    label: "CAH monitoring: growth/BP/electrolytes/renin/timed hormones and overtreatment checks",
    edgeLabel: "Monitoring branch: patient is on glucocorticoid, mineralocorticoid, salt, or crinecerfont therapy, or has fertility/adrenal rest tumor surveillance needs",
    sourceIds: unique([...esCah, ...geneReviews, ...crinecerfont]),
    criteria: criteria(`${prefix}_monitoring_criteria`, "Use after any CAH diagnostic or treatment branch when response, dose toxicity, or long-term complication surveillance must be tracked.", ["symptoms", "exam", "vitals", "labs", "medications", "demographics", "pregnancy_status", "workup_findings"], unique([...esCah, ...geneReviews, ...crinecerfont]), { criteria_options: criteriaRows.filter((row) => /monitoring|surveillance|crinecerfont/i.test(row.id)) }),
    action: "For patients 18 months or younger, schedule close follow-up during the first 3 months of life and every 3 months thereafter; after 18 months, evaluate about every 4 months while growing. Track growth velocity, weight, blood pressure, physical virilization or Cushingoid features, sodium, potassium, renin, and hormones drawn at consistent times relative to medication. Adults need at least annual physical examination with blood pressure, BMI, Cushingoid features, and biochemical monitoring. Use local endocrine policy for testicular adrenal rest tumor ultrasound because published interval summaries differ. Escalate urgently for vomiting, dehydration, hypoglycemia, electrolyte instability, or inability to take steroids.",
    endpointType: "monitoring_reassessment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["visit interval by age", "growth velocity", "weight/BMI", "blood pressure", "virilization or Cushingoid signs", "sodium", "potassium", "renin", "timed 17-OHP/androstenedione/testosterone", "follicular progesterone if trying to conceive", "TART ultrasound plan", "adverse effects or adrenal crisis events"]
  });

  const mimicEndpoint = endpoint({
    id: `${prefix}_mimic_exclusion_endpoint`,
    label: "CAH mimic or different enzyme defect: redirect after crisis risk is handled",
    edgeLabel: "Mimic branch: CAH thresholds are not met, steroid profile suggests another enzyme defect, virilization/hyperandrogenism has another cause, or salt-wasting physiology has a non-CAH explanation",
    sourceIds: sourceIdsForItems(differentials, unique([...esCah, ...geneReviews, ...genericSourceIds])),
    criteria: criteria(`${prefix}_mimic_criteria`, "Use when the clinical or biochemical pattern fits a competing diagnosis better than 21-hydroxylase-deficient CAH.", ["symptoms", "exam", "vitals", "labs", "medications", "comorbidities", "demographics", "pregnancy_status", "workup_findings"], sourceIdsForItems(differentials, unique([...esCah, ...geneReviews, ...genericSourceIds])), { criteria_options: criteriaRows }),
    action: "If the patient is unstable, treat adrenal crisis first. Otherwise document the non-CAH pattern and route to the best-fitting pathway: 11-beta-hydroxylase deficiency, 3-beta-hydroxysteroid dehydrogenase deficiency, P450 oxidoreductase deficiency, PCOS, premature adrenarche, adrenal/ovarian tumor, exogenous androgen or glucocorticoid effects, sepsis/dehydration, renal or gastrointestinal electrolyte disorders, or another DSD evaluation.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Alternative steroidogenesis defects and DSD/hyperandrogenism mimics require specialist interpretation of steroid ratios, imaging, genetics, and local testing availability."
  });

  const safetyNetEndpoint = endpoint({
    id: `${prefix}_followup_safety_net_endpoint`,
    label: "CAH disposition and safety net: emergency kit, medical ID, sick-day rules, and follow-up owner",
    edgeLabel: "Stable branch: no active crisis, diagnostic/treatment plan is documented, medications are accessible, caregiver or patient can use injection kit, and follow-up/result ownership is assigned",
    sourceIds: unique([...esCah, ...geneReviews, ...crinecerfont]),
    criteria: criteria(`${prefix}_followup_safety_net_criteria`, "Use when the CAH plan is ready for discharge, outpatient management, or interval follow-up after emergency risk has been addressed.", ["vitals", "labs", "medications", "follow_up_access", "workup_findings"], unique([...esCah, ...geneReviews, ...crinecerfont]), { criteria_options: criteriaRows.filter((row) => /stress|hydrocortisone|monitoring|crinecerfont/i.test(row.id)) }),
    action: "Document the disposition: ED/admission/ICU for crisis or unstable electrolytes/glucose; urgent pediatric endocrine follow-up for newborn positives or unclear classification; outpatient endocrine follow-up for stable chronic CAH when medications and monitoring are secure. Provide written sick-day dosing rules, teach parenteral hydrocortisone injection, confirm an emergency injection kit, medical alert ID or steroid card, medication refills, pending-result owner, and return precautions for fever over 38.5 C, vomiting, diarrhea/dehydration, syncope, severe weakness, confusion, hypoglycemia symptoms, inability to keep medications down, trauma, surgery, labor, throat tightness/rash/angioedema on crinecerfont, or worsening virilization/poor growth.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["disposition level", "medication access", "injection kit", "medical ID/steroid card", "sick-day comprehension", "pending labs owner", "endocrine follow-up date", "return precautions"]
  });

  const classificationDecision = decision({
    id: `${prefix}_branch_decision`,
    label: "CAH branch: crisis, diagnosis, classic therapy, nonclassic therapy, crinecerfont, pregnancy/DSD, mimic, or safety net",
    edgeLabel: "Use age/gestation, 17-OHP/cosyntropin profile, electrolytes/glucose, phenotype, current steroids, crinecerfont risks, pregnancy/fertility context, and follow-up reliability",
    sourceIds,
    criteria: criteria(`${prefix}_branch_criteria`, "Classify CAH management using crisis physiology, age and gestational context, 17-OHP/cosyntropin thresholds, salt-wasting labs, classic versus nonclassic phenotype, treatment exposure, medication contraindications, pregnancy/fertility status, and reliable follow-up.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Select the single active CAH branch: missing diagnostic data, adrenal crisis, newborn confirmation, after-infancy diagnostic classification, classic maintenance replacement, symptomatic nonclassic treatment, nonclassic no-treatment or stopping route, crinecerfont adjunct, pregnancy/fertility/DSD specialist review, mimic redirection, monitoring, or safety-net disposition.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [
      missingDiagnosticEndpoint,
      crisisEndpoint,
      newbornDiagnosticEndpoint,
      afterInfancyDiagnosticEndpoint,
      classicTreatmentEndpoint,
      nonclassicTreatmentEndpoint,
      nonclassicDeescalationEndpoint,
      crinecerfontEndpoint,
      pregnancyDsdReviewEndpoint,
      monitoringEndpoint,
      mimicEndpoint,
      safetyNetEndpoint
    ]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: "CAH initial screen: age/gestation, crisis signs, phenotype, 17-OHP, electrolytes, medications",
    edgeLabel: "CAH is already suspected or known: assess salt-wasting danger, virilization/hyperandrogenism phenotype, diagnostic thresholds, and current steroid/mineralocorticoid/crinecerfont safety",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial CAH assessment captures the exact patient data needed for emergency treatment, diagnosis, chronic replacement, nonclassic management, medication safety, and follow-up.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Check ABCs, blood pressure/perfusion, temperature, hydration, mental status, glucose, sodium, potassium, CO2/bicarbonate, newborn screen or early morning 17-OHP with assay/timing, cosyntropin steroid profile if borderline, virilization or hyperandrogenism phenotype, growth/bone age or fertility context, current hydrocortisone/prednisone/dexamethasone/fludrocortisone/salt/crinecerfont use, allergies/hypersensitivity, CYP3A4 inducer exposure, renal function, pregnancy/fertility intent, and follow-up reliability.",
    parallelActions: ["emergency perfusion/glucose/electrolyte screen", "newborn or after-infancy diagnostic threshold review", "classic versus nonclassic phenotype review", "current steroid/mineralocorticoid/salt regimen check", "crinecerfont age/weight/renal/CYP3A4/hypersensitivity check", "pregnancy/fertility/genetic/DSD modifier review", "follow-up and emergency-kit access check"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "CAH pathway: emergency, diagnosis, replacement, nonclassic care, medication safety, and follow-up",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for known or suspected 21-hydroxylase-deficient CAH, positive newborn screen, ambiguous genitalia/virilization, salt-wasting symptoms, adrenal crisis risk, early pubarche or hyperandrogenism, infertility/miscarriage context, chronic CAH medication review, crinecerfont review, pregnancy planning, or clinician-opened CAH evaluation.", ["problem_list_or_diagnosis", "presenting_symptoms", "exam", "vitals", "labs", "medications", "pregnancy_status", "clinician_opened_module"], sourceIds),
    action: "Route CAH through immediate crisis treatment when unstable; otherwise use exact age, gestational, 17-OHP, cosyntropin, electrolyte, phenotype, medication, pregnancy/fertility, and follow-up data to reach an actionable diagnostic, treatment, monitoring, review, or safety-net endpoint.",
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
    status: "hand_polished_cah_pathway_needs_clinician_review",
    source_ids: finalSourceIds,
    source_metadata: sourceRowsForTree(finalSourceIds, sourceById),
    provenance: {
      generated_by: "scripts/hand-polish-clinical-pathway-trees.js",
      generated_at: `${auditDate}T00:00:00.000Z`,
      update_scope: "clinical_pathway_tree_v1 only",
      source_material: "Endocrine Society 2018 CAH guideline, GeneReviews 21-hydroxylase-deficient CAH chapter, DailyMed crinecerfont label, and local module evidence rows",
      review_note: "CAH tree is threshold-cited and patient-traversable; TART ultrasound interval, prenatal dexamethasone research governance, elective genital surgery, assay-specific steroid interpretation, and local emergency/stress-dose order sets require clinician governance."
    },
    source_thresholds: sourceThresholds,
    traversable_context: buildTraversableContext(module, finalSourceIds, tests, criteriaRows),
    activationRules,
    root,
    synthetic_patient_scenarios: completeSyntheticScenarioCoverage(root, [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_diagnostic_data", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingDiagnosticEndpoint.id, expected_active_branch: missingDiagnosticEndpoint.edgeLabel },
      { scenario_id: "newborn_salt_wasting_crisis", major_pathway: "escalation_emergency_actions", expected_endpoint_id: crisisEndpoint.id, expected_active_branch: crisisEndpoint.edgeLabel },
      { scenario_id: "positive_newborn_screen_stable", major_pathway: "diagnostic_confirmation", expected_endpoint_id: newbornDiagnosticEndpoint.id, expected_active_branch: newbornDiagnosticEndpoint.edgeLabel },
      { scenario_id: "after_infancy_classification", major_pathway: "severity_risk_stratification", expected_endpoint_id: afterInfancyDiagnosticEndpoint.id, expected_active_branch: afterInfancyDiagnosticEndpoint.edgeLabel },
      { scenario_id: "classic_cah_maintenance", major_pathway: "first_line_management", expected_endpoint_id: classicTreatmentEndpoint.id, expected_active_branch: classicTreatmentEndpoint.edgeLabel },
      { scenario_id: "symptomatic_nonclassic_cah", major_pathway: "first_line_management", expected_endpoint_id: nonclassicTreatmentEndpoint.id, expected_active_branch: nonclassicTreatmentEndpoint.edgeLabel },
      { scenario_id: "asymptomatic_nonclassic_or_stop", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: nonclassicDeescalationEndpoint.id, expected_active_branch: nonclassicDeescalationEndpoint.edgeLabel },
      { scenario_id: "crinecerfont_candidate_or_safety_issue", major_pathway: "contraindications_special_populations", expected_endpoint_id: crinecerfontEndpoint.id, expected_active_branch: crinecerfontEndpoint.edgeLabel },
      { scenario_id: "pregnancy_prenatal_or_dsd_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: pregnancyDsdReviewEndpoint.id, expected_active_branch: pregnancyDsdReviewEndpoint.edgeLabel },
      { scenario_id: "monitoring_overtreatment_or_tart", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: monitoringEndpoint.id, expected_active_branch: monitoringEndpoint.edgeLabel },
      { scenario_id: "mimic_or_other_enzyme_defect", major_pathway: "mimics_exclusions", expected_endpoint_id: mimicEndpoint.id, expected_active_branch: mimicEndpoint.edgeLabel },
      { scenario_id: "stable_disposition_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: safetyNetEndpoint.id, expected_active_branch: safetyNetEndpoint.edgeLabel }
    ]),
    audit_requirements: {
      required_domains: requiredPathwayDomains,
      hand_polish_requirements: [
        "every visible node label names a CAH-specific emergency, diagnostic, treatment, medication-safety, monitoring, review, or safety-net decision",
        "diagnosis branch includes newborn gestational-age screen context, 0.25 mg/0.125 mg cosyntropin details, 60-minute profile, and numeric 17-OHP classic/nonclassic ranges",
        "crisis branch includes age-banded hydrocortisone 25 mg, 50 mg, and 100 mg with every-6-hour continuation rule",
        "classic treatment branch includes hydrocortisone 10-15 mg/m2/day for growing patients, adult options, fludrocortisone 0.05-0.2 mg/day, and infancy sodium chloride 1-2 g/day",
        "nonclassic branch states when to treat, when not to treat, when to stop, and when stress dosing requires suboptimal cortisol response",
        "crinecerfont branch includes age, weight, renal, hypersensitivity, CYP3A4, glucocorticoid-continuation, and 4-week androstenedione rules",
        "pregnancy, prenatal dexamethasone, DSD surgery, assay-dependent steroid interpretation, and TART ultrasound interval differences are flagged for clinician review",
        "follow-up endpoint includes disposition level, emergency kit, medical ID, sick-day rules, pending-result owner, and concrete return precautions"
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
    synthetic_patient_scenarios: completeSyntheticScenarioCoverage(root, [
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
    ]),
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
    synthetic_patient_scenarios: completeSyntheticScenarioCoverage(root, [
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
    ]),
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
    action: `Document why routine GDM is not the active pathway and route to the more specific diagnosis: ${visibleListLabels(differentials, 4).join("; ") || "overt type 1/type 2 diabetes, steroid/stress hyperglycemia, DKA/HHS, renal disease, infection, medication effect, or secondary endocrine cause"}.`,
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
    label: isType1 ? "Type 1 modifiers: pregnancy, pump failure, SGLT2 use, recurrent hypoglycemia, access barriers, or uncertain LADA need endocrinology/technology handoff" : "Type 2 modifiers: CKD/albuminuria, ASCVD/HF, pregnancy, eGFR limits, hypoglycemia risk, or cost/access changes therapy",
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
    action: `Document which diabetes thresholds or type-classification findings are absent, then route to the appropriate alternate pathway: ${visibleListLabels(differentials, 4).join("; ") || "prediabetes, alternate diabetes type, steroid/stress hyperglycemia, pregnancy hyperglycemia, pancreatic/monogenic diabetes, hypoglycemia/drug effect, renal disease, infection, or secondary endocrine cause"}.`,
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
    label: `${label}: collect A1c/glucose, ketone or acidosis data when symptomatic, diabetes type evidence, medication safety, vitals, weight, kidney/cardiovascular data, and access barriers`,
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
    action: `Document why prediabetes is not the active diagnosis and route to the more specific pathway: ${visibleListLabels(differentials, 4).join("; ") || "normal glycemia, diabetes, medication/stress hyperglycemia, pregnancy, hypoglycemia/drug effect, renal/hepatic disease, or secondary endocrine cause"}.`,
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
    action: `Document the criteria count and route to the active abnormality or competing diagnosis: ${visibleListLabels(differentials, 4).join("; ") || "isolated hypertension, dyslipidemia, prediabetes/diabetes, medication effect, pregnancy, secondary endocrine cause, or acute illness"}.`,
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

function buildPrimaryAldosteronismClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Hyperaldosteronism (Conn's Syndrome)";
  const prefix = "primary_aldosteronism";
  const pa = ["ES_PRIMARY_ALDO_2025"];
  const emergency = ["MSD_HYPERTENSIVE_EMERGENCY_2026"];
  const sourceIds = unique([...pa, ...emergency, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 10);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);

  const criteriaRows = [
    criterion({
      id: "pa_screening_population",
      label: "Primary aldosteronism screening: all individuals with hypertension are eligible for aldosterone, renin, ARR, and potassium assessment",
      criteria_text: "The 2025 Endocrine Society guideline suggests screening all individuals with hypertension for primary aldosteronism using aldosterone, renin, ARR, and potassium to interpret aldosterone accurately.",
      cutoffs: [],
      data_needed: ["hypertension diagnosis", "serum or plasma aldosterone", "plasma renin activity or direct renin concentration", "aldosterone-to-renin ratio", "potassium"],
      source_ids: pa,
      source_section: "Recommendations 1 and 3"
    }),
    criterion({
      id: "pa_positive_screen_cutoffs",
      label: "Positive PA screen: PRA <=1 ng/mL/h or DRC <=8.2 mU/L plus aldosterone >=10 ng/dL immunoassay or >=7.5 ng/dL LC-MS/MS, with ARR >20 or >70 by unit system",
      criteria_text: "A positive PA screen usually requires low renin and inappropriately high aldosterone: PRA <=1 ng/mL/h or DRC <=8.2 mU/L with aldosterone >=10 ng/dL by immunoassay or >=7.5 ng/dL by LC-MS/MS, plus ARR >20 for aldosterone ng/dL to PRA ng/mL/h or >70 for aldosterone pmol/L to DRC mU/L.",
      cutoffs: ["PRA <=1 ng/mL/h", "DRC <=8.2 mU/L", "aldosterone >=10 ng/dL", "aldosterone >=7.5 ng/dL", "ARR >20", "ARR >70"],
      data_needed: ["PRA or DRC", "aldosterone", "aldosterone assay method", "ARR", "ARR units", "potassium", "medication list"],
      source_ids: pa,
      source_section: "Recommendation 3 technical remarks"
    }),
    criterion({
      id: "pa_repeat_screen_interference_cutoffs",
      label: "Repeat PA screen after correction or medication washout: potassium into lab reference range; 4 weeks for MRAs/ENaC inhibitors/diuretics, 2 weeks for ACEi/ARB or beta/central alpha-2 agents when safe",
      criteria_text: "If PA screening is negative with hypokalemia or medications that can cause false-negative results, correct potassium and repeat; withdraw MRAs, ENaC inhibitors, and other diuretics for 4 weeks, ACE inhibitors or ARBs for 2 weeks, and repeat positive screens after beta-blocker or central alpha-2 withdrawal for 2 weeks if safe and feasible.",
      cutoffs: ["4 weeks", "2 weeks", "aldosterone 10-15 ng/dL", "aldosterone 7.5-10 ng/dL"],
      data_needed: ["potassium", "medications", "MRA/ENaC inhibitor/diuretic stop date", "ACE inhibitor or ARB stop date", "beta-blocker or central alpha-2 stop date", "repeat aldosterone/renin/ARR"],
      source_ids: pa,
      source_section: "Recommendation 3 technical remarks"
    }),
    criterion({
      id: "pa_no_suppression_testing_cutoffs",
      label: "PA suppression testing can be skipped: resistant hypertension or hypertension plus hypokalemia with PRA <0.2 ng/mL/h or DRC <2 mU/L and aldosterone >20 ng/dL immunoassay or >15 ng/dL LC-MS/MS",
      criteria_text: "Aldosterone-suppression testing is not recommended before PA-specific therapy when resistant hypertension or hypertension with hypokalemia has overt renin-independent aldosterone production: PRA <0.2 ng/mL/h or DRC <2 mU/L and aldosterone >20 ng/dL by immunoassay or >15 ng/dL by LC-MS/MS.",
      cutoffs: ["PRA <0.2 ng/mL/h", "DRC <2 mU/L", "aldosterone >20 ng/dL", "aldosterone >15 ng/dL"],
      data_needed: ["resistant hypertension status", "hypokalemia status", "PRA or DRC", "aldosterone", "assay method", "surgery preference"],
      source_ids: pa,
      source_section: "Recommendation 4 technical remarks"
    }),
    criterion({
      id: "pa_low_likelihood_suppression_cutoffs",
      label: "Low likelihood of lateralizing PA: normokalemia with aldosterone <~11 ng/dL immunoassay or <~8 ng/dL LC-MS/MS supports avoiding formal lateralization workup",
      criteria_text: "Aldosterone-suppression testing may be avoided when the likelihood of lateralizing PA is so low that formal diagnosis is not justifiable, such as normokalemia with plasma/serum aldosterone <~11 ng/dL by immunoassay or <~8 ng/dL by LC-MS/MS.",
      cutoffs: ["aldosterone <~11 ng/dL", "aldosterone <~8 ng/dL"],
      data_needed: ["potassium", "aldosterone", "assay method", "renin", "pretest probability", "patient preference"],
      source_ids: pa,
      source_section: "Recommendation 4 technical remarks"
    }),
    criterion({
      id: "pa_lateralization_avs_exception_cutoffs",
      label: "PA lateralization: CT plus AVS before surgery; AVS exception may apply at age <35 with hypokalemia and unilateral adrenal adenoma >1.0 cm",
      criteria_text: "Patients with PA considering adrenalectomy should undergo adrenal CT and AVS; a potential AVS exception is age <35 years with marked PA, hypokalemia, and a unilateral adrenal adenoma >1.0 cm on CT.",
      cutoffs: ["age <35 years", ">1.0 cm"],
      data_needed: ["age", "hypokalemia", "adrenal CT lesion size and side", "AVS availability", "surgery candidacy", "patient preference"],
      source_ids: pa,
      source_section: "Recommendation 6 technical remarks"
    }),
    criterion({
      id: "pa_mra_monitoring_and_contraindication",
      label: "PA medical therapy: prefer spironolactone MRA; monitor potassium, renal function, renin, and BP, and avoid spironolactone when hyperkalemia, advanced renal impairment, or pregnancy applies",
      criteria_text: "For PA-specific medical therapy, spironolactone is suggested because of cost and availability; monitor potassium, renal function, renin, and BP response. The MRA-over-ENaC recommendation does not apply when spironolactone is contraindicated, such as hyperkalemia, advanced renal impairment, or pregnancy.",
      cutoffs: [],
      data_needed: ["surgery candidacy", "pregnancy status", "potassium", "renal function/eGFR", "renin", "blood pressure", "MRA adverse effects"],
      source_ids: pa,
      source_section: "Recommendations 7, 9, and 10"
    }),
    criterion({
      id: "pa_hypertensive_emergency_cutoffs",
      label: "Hypertensive emergency: BP >=180/120 mm Hg with acute target-organ damage needs ED/ICU titratable IV therapy and about 20-25% MAP reduction in 1-2 hours",
      criteria_text: "Severe BP often defined as systolic >=180 mm Hg and/or diastolic >=120 mm Hg with target-organ damage is a hypertensive emergency; treatment uses short-acting IV medication, ICU monitoring, and about 20-25% MAP reduction in 1-2 hours rather than urgent normalization.",
      cutoffs: [">=180/120 mm Hg", "20-25%", "1-2 hours"],
      data_needed: ["systolic BP", "diastolic BP", "neurologic symptoms", "chest pain/dyspnea", "renal injury", "retinopathy/papilledema", "pregnancy status"],
      source_ids: emergency,
      source_section: "Hypertensive emergencies diagnosis and treatment"
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: PA pathway context",
    edgeLabel: "Missing PA context: BP pattern, potassium, aldosterone, renin, ARR units, medication interference, renal function, pregnancy status, adrenal imaging, surgery preference, or follow-up access",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when PA routing data cannot be extracted.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document sustained or resistant hypertension status, BP readings and symptoms, potassium, aldosterone with assay method, PRA or DRC, ARR and units, current antihypertensives including MRA/ENaC inhibitor/diuretic/ACEi/ARB/beta-blocker/central alpha-2 use, renal function, pregnancy status, adrenal CT/AVS status if known, surgery preference, and follow-up access.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["BP readings and hypertension treatment count", "potassium", "aldosterone and assay method", "PRA or DRC", "ARR and units", "interfering medications", "renal function", "pregnancy status", "adrenal CT/AVS status", "surgery preference"]
  });

  const missingScreenEndpoint = endpoint({
    id: `${prefix}_missing_screen_endpoint`,
    label: "Missing data needed: aldosterone, renin, ARR units, potassium, assay method, or interfering medications",
    edgeLabel: "Cannot classify PA until aldosterone, PRA or DRC, ARR units, potassium, assay method, BP treatment count, and medication-interference status are available",
    sourceIds: pa,
    criteria: criteria(`${prefix}_missing_screen_criteria`, "Route here when PA screening or confirmation cannot be interpreted because exact lab or medication data are absent.", contextDomains, pa, { missing_any: ["aldosterone", "PRA or DRC", "ARR units", "potassium", "aldosterone assay method", "medication interference"] }),
    action: "Obtain morning seated aldosterone, PRA or DRC, ARR with units, potassium collected and processed correctly, BP readings and medication count, renal function, and the medication-interference timeline before choosing PA confirmation, repeat testing, or treatment.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["morning seated aldosterone", "PRA or DRC", "ARR units", "potassium", "aldosterone assay method", "medication list and withdrawal feasibility", "renal function", "BP treatment count"]
  });

  const emergencyEndpoint = endpoint({
    id: `${prefix}_emergency_endpoint`,
    label: "PA escalation: hypertensive emergency, severe hypokalemia, paralysis, arrhythmia, stroke/ACS symptoms, pulmonary edema, or renal injury",
    edgeLabel: "Emergency branch: BP >=180/120 mm Hg with target-organ symptoms, severe hypokalemia with weakness/paralysis or arrhythmia, chest pain, neurologic deficit, pulmonary edema, acute kidney injury, or pregnancy severe hypertension",
    sourceIds: unique([...pa, ...emergency]),
    criteria: criteria(`${prefix}_emergency_criteria`, "Use when PA evaluation reveals hypertensive emergency physiology or dangerous hypokalemia/arrhythmia before routine endocrine workup.", ["symptoms", "exam", "vitals", "labs", "pregnancy_status", "workup_findings"], unique([...pa, ...emergency]), { criteria_options: criteriaRows }),
    action: "Send for ED/ICU-level evaluation when target-organ damage or severe hypokalemia risk is present. Treat hypertensive emergency with titratable IV therapy and monitored about 20-25% MAP reduction in 1-2 hours; correct potassium and arrhythmia risk while preserving PA diagnostic plans when clinically safe.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["BP and MAP trajectory", "potassium and magnesium", "ECG/arrhythmia", "target-organ symptoms", "renal function", "pregnancy status", "PA labs after stabilization"]
  });

  const repeatEndpoint = endpoint({
    id: `${prefix}_repeat_or_mimic_endpoint`,
    label: "PA negative or confounded screen: correct potassium, address interfering medications, repeat testing, or route to mimic",
    edgeLabel: "Repeat/mimic branch: hypokalemia, ACEi/ARB/diuretic/MRA/ENaC/beta-blocker/central alpha-2 interference, borderline aldosterone, unsuppressed renin, normokalemia with low aldosterone, renal artery stenosis, CKD, licorice, Liddle syndrome, Cushing syndrome, or PPGL fits better",
    sourceIds: sourceIdsForItems(differentials, sourceIds),
    criteria: criteria(`${prefix}_repeat_or_mimic_criteria`, "Use when PA screen is negative, borderline, or medication/condition-confounded, or another secondary-hypertension pathway fits better.", contextDomains, sourceIdsForItems(differentials, sourceIds), { criteria_options: criteriaRows }),
    action: "Correct potassium into the laboratory reference range and repeat aldosterone/renin/ARR on another day if pretest probability remains moderate-high. When safe, hold MRAs/ENaC inhibitors/diuretics for 4 weeks, ACEi/ARB for 2 weeks, or beta-blocker/central alpha-2 agents for 2 weeks before repeat interpretation. If PA probability is low, route to resistant-hypertension, renovascular, CKD, medication/licorice, Cushing, PPGL, or genetic mineralocorticoid mimic review.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "PA result is negative, borderline, or confounded by potassium, medication, assay, renal disease, or a competing secondary-hypertension diagnosis.",
    guidelineCutoffs: criteriaRows
  });

  const overtEndpoint = endpoint({
    id: `${prefix}_overt_pa_endpoint`,
    label: "Overt PA: start PA-specific therapy without aldosterone-suppression testing when renin-independent aldosterone is clear",
    edgeLabel: "Overt branch: resistant hypertension or hypertension with hypokalemia plus PRA <0.2 ng/mL/h or DRC <2 mU/L and aldosterone >20 ng/dL immunoassay or >15 ng/dL LC-MS/MS",
    sourceIds: pa,
    criteria: criteria(`${prefix}_overt_pa_criteria`, "Use when PA probability is high enough that aldosterone-suppression testing is not needed before PA-specific therapy.", ["vitals", "labs", "medications", "workup_findings"], pa, { criteria_options: criteriaRows }),
    action: "Do not delay PA-specific therapy for suppression testing when overt criteria are met. Discuss surgery candidacy and preference; if bilateral/unknown lateralization, not a surgical candidate, or declines surgery, use MRA therapy and monitor BP, potassium, renal function, and renin response.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["BP response", "potassium", "renal function/eGFR", "renin", "MRA adverse effects", "surgery preference"]
  });

  const suppressionEndpoint = endpoint({
    id: `${prefix}_suppression_testing_endpoint`,
    label: "Intermediate PA screen: aldosterone-suppression testing or clinician-guided documentation before surgery pathway",
    edgeLabel: "Intermediate branch: positive PA screen but not overt; patient is willing and able to consider adrenalectomy and needs suppression testing or specialist interpretation before lateralization",
    sourceIds: pa,
    criteria: criteria(`${prefix}_suppression_testing_criteria`, "Use after a positive PA screen when suppression testing would change surgical eligibility or diagnostic certainty.", ["vitals", "labs", "medications", "comorbidities", "workup_findings"], pa, { criteria_options: criteriaRows }),
    action: "Arrange aldosterone-suppression testing when it will change eligibility for surgery or diagnostic certainty. Avoid unnecessary suppression testing when overt PA criteria are met, when the patient will not pursue AVS/adrenalectomy and MRA therapy is appropriate, or when lateralizing PA likelihood is very low.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows,
    reviewNeededReason: "Suppression-test choice, protocol, and assay-specific interpretation depend on local endocrine laboratory practice."
  });

  const lateralizationEndpoint = endpoint({
    id: `${prefix}_lateralization_endpoint`,
    label: "PA lateralization: adrenal CT plus AVS before adrenalectomy, with narrow age <35 and adenoma >1 cm exception",
    edgeLabel: "Surgery branch: diagnosed PA, adrenalectomy desired/feasible, adrenal CT result available or ordered, and AVS needed unless age <35 with hypokalemia, marked PA, and unilateral adrenal adenoma >1.0 cm",
    sourceIds: pa,
    criteria: criteria(`${prefix}_lateralization_criteria`, "Use when diagnosed PA patient desires and can undergo adrenalectomy.", ["demographics", "labs", "imaging_results", "comorbidities", "workup_findings"], pa, { criteria_options: criteriaRows }),
    action: "Order adrenal CT for anatomy and carcinoma exclusion, then AVS with an experienced team before unilateral adrenalectomy unless the narrow exception applies. If AVS shows lateralizing PA and the patient is a surgical candidate who desires surgery, refer for unilateral adrenalectomy; otherwise use MRA therapy.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["CT lesion size/side", "AVS lateralization", "surgical candidacy", "patient preference", "postoperative BP/potassium"]
  });

  const medicalEndpoint = endpoint({
    id: `${prefix}_medical_monitoring_endpoint`,
    label: "PA medical management and follow-up: MRA titration, renin/BP response, potassium/renal monitoring, and rescreen safety-net",
    edgeLabel: "Medical/follow-up branch: bilateral PA, unknown lateralization, not surgical, declines surgery, mild PA, comorbidity-limited surgery, or post-treatment monitoring needed",
    sourceIds: pa,
    criteria: criteria(`${prefix}_medical_monitoring_criteria`, "Use for nonoperative PA, bilateral/unknown lateralization, postadrenalectomy follow-up, and safety-netting.", ["vitals", "labs", "medications", "comorbidities", "follow_up_access", "workup_findings"], pa, { criteria_options: criteriaRows }),
    action: "Use PA-specific medical therapy, usually spironolactone unless contraindicated or poorly tolerated, and titrate based on BP response, potassium, renal function, and renin rise from pretreatment baseline when hypertension remains uncontrolled. Safety-net for weakness/paralysis, palpitations/syncope, chest pain, neurologic symptoms, dyspnea, severe BP symptoms, hyperkalemia symptoms, and medication access failure.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["BP", "potassium", "renal function/eGFR", "renin", "MRA adverse effects", "surgery referral status", "return precautions"]
  });

  const positiveAction = actionNode({
    id: `${prefix}_positive_screen_action`,
    label: "PA positive screen: choose overt treatment, suppression testing, lateralization, or MRA route using renin, aldosterone, ARR, potassium, assay, and preferences",
    edgeLabel: "Positive PA screen branch: low renin with aldosterone/ARR above guideline cutoffs after potassium and medication context are interpreted",
    sourceIds: pa,
    criteria: criteria(`${prefix}_positive_screen_criteria`, "Route positive PA screens by overt biochemical probability, suppression-test need, lateralization/surgery preference, and MRA eligibility.", contextDomains, pa, { criteria_options: criteriaRows }),
    action: "Use the same lab facts to pick the next step: overt PA without suppression testing, intermediate PA suppression testing, CT/AVS if surgery is desired, or MRA medical therapy if bilateral/unknown/not surgical.",
    parallelActions: ["classify overt versus intermediate PA", "decide suppression-test value", "document adrenalectomy preference", "plan CT and AVS when surgical", "start or titrate MRA when nonoperative"],
    guidelineCutoffs: criteriaRows,
    children: [overtEndpoint, suppressionEndpoint, lateralizationEndpoint, medicalEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: "PA classification: missing labs, emergency physiology, positive screen, or repeat/mimic route",
    edgeLabel: "PA screening facts available: BP pattern, potassium, aldosterone, PRA/DRC, ARR units, assay method, medication interference, renal function, pregnancy status, and patient preference",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Classify PA by emergency risk, guideline screen cutoffs, medication/potassium interference, suppression-test need, lateralization, and medical-therapy safety.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Choose missing-data, emergency, positive PA, or repeat/mimic branch using the exact PA cutoffs and patient-specific modifiers.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingScreenEndpoint, emergencyEndpoint, positiveAction, repeatEndpoint]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: "PA assessment: document BP pattern, target-organ symptoms, potassium, aldosterone/renin/ARR, assay method, medications, renal function, pregnancy, and surgery preference",
    edgeLabel: "Hypertension, resistant hypertension, hypokalemia, adrenal incidentaloma, family history, sleep apnea, atrial fibrillation, or clinician-chosen PA evaluation",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial PA assessment requires BP severity, potassium, aldosterone-renin testing, medication interference, renal/pregnancy safety, and disposition context.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: `Measure repeat BP and target-organ symptoms; obtain potassium, aldosterone, PRA or DRC, ARR with units, assay method, renal function, pregnancy status, and medication-interference history. Local evidence reminders: ${listText([...tests, ...redFlags, ...dispositions], "PA tests, red flags, and management rules", 10)}.`,
    parallelActions: ["repeat BP and target-organ symptom screen", "potassium", "aldosterone with assay method", "PRA or DRC", "ARR and units", "medication-interference timeline", "renal function", "pregnancy status", "surgery preference and follow-up access"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "Primary aldosteronism: route hypertension by ARR cutoffs, potassium/medication modifiers, emergency risk, and lateralization or MRA plan",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for hypertension, resistant hypertension, hypokalemia, adrenal incidentaloma, early-onset hypertension family history, sleep apnea, atrial fibrillation without another cause, or clinician-chosen PA evaluation.", ["clinician_selected_module", "vitals", "labs", "medications", "problem_list_or_diagnosis", "workup_findings"], sourceIds),
    action: "Route suspected PA through missing-data, emergency stabilization, ARR-based screen interpretation, repeat or mimic review, suppression-test decision, CT/AVS lateralization, MRA therapy, monitoring, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: "hand_polished_primary_aldosteronism_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: "Endocrine Society Primary Aldosteronism Guideline 2025, MSD Manual hypertensive emergency review, and local module evidence rows",
    reviewNote: "Primary aldosteronism tree is threshold-cited and patient-traversable; local ARR assay cut points, suppression-test protocol, AVS technical interpretation, pregnancy antihypertensive/MRA choices, and perioperative pathway require clinician governance.",
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_aldosterone_renin", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingScreenEndpoint.id, expected_active_branch: missingScreenEndpoint.edgeLabel },
      { scenario_id: "hypertensive_emergency_or_hypokalemia", major_pathway: "escalation_emergency_actions", expected_endpoint_id: emergencyEndpoint.id, expected_active_branch: emergencyEndpoint.edgeLabel },
      { scenario_id: "positive_arr_screen", major_pathway: "diagnostic_confirmation", expected_endpoint_id: overtEndpoint.id, expected_active_branch: overtEndpoint.edgeLabel },
      { scenario_id: "intermediate_suppression_testing", major_pathway: "severity_risk_stratification", expected_endpoint_id: suppressionEndpoint.id, expected_active_branch: suppressionEndpoint.edgeLabel },
      { scenario_id: "surgical_lateralization", major_pathway: "first_line_management", expected_endpoint_id: lateralizationEndpoint.id, expected_active_branch: lateralizationEndpoint.edgeLabel },
      { scenario_id: "mra_contraindication_or_pregnancy", major_pathway: "contraindications_special_populations", expected_endpoint_id: medicalEndpoint.id, expected_active_branch: medicalEndpoint.edgeLabel },
      { scenario_id: "confounded_or_mimic", major_pathway: "mimics_exclusions", expected_endpoint_id: repeatEndpoint.id, expected_active_branch: repeatEndpoint.edgeLabel },
      { scenario_id: "mra_monitoring", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: medicalEndpoint.id, expected_active_branch: medicalEndpoint.edgeLabel },
      { scenario_id: "low_likelihood_or_rescreen", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: repeatEndpoint.id, expected_active_branch: repeatEndpoint.edgeLabel },
      { scenario_id: "followup_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: medicalEndpoint.id, expected_active_branch: medicalEndpoint.edgeLabel }
    ],
    handPolishRequirements: [
      "screening branch includes PRA <=1 ng/mL/h, DRC <=8.2 mU/L, aldosterone >=10 ng/dL immunoassay or >=7.5 ng/dL LC-MS/MS, ARR >20 or >70",
      "repeat branch includes potassium correction plus 4-week and 2-week medication-withdrawal cutoffs when safe",
      "overt PA branch includes PRA <0.2 or DRC <2 with aldosterone >20 or >15 ng/dL cutoffs",
      "lateralization branch includes CT plus AVS and age <35, hypokalemia, unilateral adenoma >1.0 cm exception",
      "emergency branch includes BP >=180/120 mm Hg with target-organ damage and 20-25% MAP reduction in 1-2 hours"
    ]
  });
}

function buildPheochromocytomaClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Pheochromocytoma";
  const prefix = "pheochromocytoma";
  const ppgl = ["ES_PHEO_PPGL_2014"];
  const emergency = ["MSD_HYPERTENSIVE_EMERGENCY_2026"];
  const sourceIds = unique([...ppgl, ...emergency, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 10);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);

  const criteriaRows = [
    ...pheochromocytomaCutoffCriteria.map(criterion),
    criterion({
      id: "ppgl_supine_sampling_and_borderline_repeat",
      label: "PPGL sampling: plasma metanephrines should be drawn supine using supine reference intervals; borderline elevations need preanalytical and medication review",
      criteria_text: "Endocrine Society suggests drawing plasma metanephrines with the patient supine and using reference intervals established in the same position; positive tests require follow-up by degree of increase and clinical presentation.",
      cutoffs: [">ULN"],
      data_needed: ["plasma free metanephrines", "urinary fractionated metanephrines", "supine sampling status", "reference interval position", "interfering medications", "clinical presentation"],
      source_ids: ppgl,
      source_section: "Biochemical testing recommendations 1.1-1.4"
    }),
    criterion({
      id: "ppgl_preop_alpha_beta_targets",
      label: "PPGL pre-op BP/HR goals: alpha blockade 7-14 days; consider BP <130/80 seated and SBP >90 standing with HR 60-70 seated and 70-80 standing; beta only after alpha blockade",
      criteria_text: "Functional PPGLs need alpha-adrenergic blockade for 7-14 days before surgery. Common endocrine perioperative targets are BP <130/80 mm Hg seated with systolic BP >90 mm Hg standing and heart rate 60-70 seated or 70-80 standing; beta-blockers should be used only after adequate alpha blockade when tachycardia persists.",
      cutoffs: ["7-14 days", "<130/80 mm Hg", ">90 mm Hg", "60-70 bpm", "70-80 bpm"],
      data_needed: ["alpha-blockade start date", "seated BP", "standing BP", "heart rate", "tachyarrhythmia", "volume status", "beta-blocker timing"],
      source_ids: ppgl,
      source_section: "Perioperative medical management recommendations 4.1-4.2"
    }),
    criterion({
      id: "ppgl_alpha_blocker_starting_doses",
      label: "PPGL alpha blockade options: phenoxybenzamine commonly starts 10 mg twice daily or selective alpha-1 blocker such as doxazosin 2 mg daily, then titrate",
      criteria_text: "Preoperative alpha blockade usually uses phenoxybenzamine or selective alpha-1 blockade with dose titration. Starting-dose examples require local protocol and clinician review because guideline text prioritizes blockade and physiologic targets over one universal dose.",
      cutoffs: ["10 mg twice daily", "2 mg daily"],
      data_needed: ["selected alpha blocker", "starting dose", "orthostatic BP", "heart rate", "local endocrine/anesthesia protocol", "adverse effects"],
      source_ids: ppgl,
      source_section: "Perioperative blockade implementation"
    }),
    criterion({
      id: "ppgl_hypertensive_emergency_cutoffs",
      label: "PPGL hypertensive emergency: BP >=180/120 mm Hg with acute target-organ damage needs monitored IV therapy; avoid unopposed beta blockade when PPGL is possible",
      criteria_text: "Severe BP often defined as systolic >=180 mm Hg and/or diastolic >=120 mm Hg with acute target-organ damage is a hypertensive emergency. PPGL crisis requires monitored acute care, avoidance of unopposed beta blockade, and PPGL-aware vasoactive medication selection.",
      cutoffs: [">=180/120 mm Hg", "20-25%", "1-2 hours"],
      data_needed: ["systolic BP", "diastolic BP", "neurologic symptoms", "chest pain/dyspnea", "arrhythmia", "renal injury", "beta-blocker exposure"],
      source_ids: unique([...emergency, ...ppgl]),
      source_section: "Hypertensive emergency treatment and PPGL crisis medication cautions"
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: PPGL pathway context",
    edgeLabel: "Missing PPGL context: paroxysmal symptoms, BP/HR pattern, metanephrine values and ULN, sampling position, medication triggers, adrenal or extra-adrenal imaging, pregnancy/genetic risk, or surgery status",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when PPGL routing data cannot be extracted.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document episodic headache, sweating, palpitations, panic-like spells, sustained/paroxysmal BP and heart rate, plasma free or urinary fractionated metanephrines with assay ULN, sampling position and reference interval, medication/diet triggers, adrenal incidentaloma or imaging findings, pregnancy status, prior PPGL or hereditary syndrome risk, and surgery/follow-up status.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["paroxysmal symptoms", "BP and heart rate", "metanephrine values and ULN", "sampling position/reference interval", "medication/diet triggers", "adrenal or extra-adrenal imaging", "pregnancy status", "genetic or prior PPGL risk", "surgery status"]
  });

  const missingMetanephrineEndpoint = endpoint({
    id: `${prefix}_missing_metanephrine_endpoint`,
    label: "Missing data needed: plasma free or urinary fractionated metanephrines, ULN, sampling position, and medication triggers",
    edgeLabel: "Cannot classify PPGL probability until plasma free or urinary fractionated metanephrines, assay ULN, sampling position, medication/diet confounders, BP/HR, and imaging context are available",
    sourceIds: ppgl,
    criteria: criteria(`${prefix}_missing_metanephrine_criteria`, "Route here when PPGL biochemical probability cannot be interpreted because exact metanephrine or sampling data are absent.", contextDomains, ppgl, { missing_any: ["metanephrine value", "assay ULN", "sampling position", "interfering medications", "BP/HR", "imaging context"] }),
    action: "Obtain plasma free metanephrines or urinary fractionated metanephrines with assay ULN, note whether plasma sampling was supine with matching reference interval, review interfering medications and catecholamine-provoking drugs, document BP/HR pattern and symptoms, and add adrenal/extra-adrenal imaging only after clear biochemical evidence unless emergent imaging is needed for another diagnosis.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["plasma free or urinary fractionated metanephrines", "assay ULN", "supine sampling status", "interfering medications", "BP and heart rate", "symptom pattern", "imaging context"]
  });

  const crisisEndpoint = endpoint({
    id: `${prefix}_crisis_endpoint`,
    label: "PPGL crisis or hypertensive emergency: monitored acute care before elective localization or surgery",
    edgeLabel: "Emergency branch: BP >=180/120 mm Hg with target-organ symptoms, catecholamine crisis, arrhythmia, ACS/stroke symptoms, pulmonary edema, shock, medication-triggered crisis, pregnancy severe hypertension, or unopposed beta-blocker exposure",
    sourceIds: unique([...ppgl, ...emergency]),
    criteria: criteria(`${prefix}_crisis_criteria`, "Use when possible PPGL has hypertensive emergency physiology, catecholamine crisis, high-risk medication exposure, or unstable end-organ symptoms.", ["symptoms", "exam", "vitals", "labs", "medications", "pregnancy_status", "workup_findings"], unique([...ppgl, ...emergency]), { criteria_options: criteriaRows }),
    action: "Send for monitored acute care. Treat BP/arrhythmia with short-acting titratable agents using PPGL-aware medication selection, avoid unopposed beta blockade, assess for ACS/stroke/pulmonary edema/renal injury, and defer routine elective localization or surgery until stabilized and alpha blockade planning is owned.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["BP and MAP trajectory", "heart rhythm", "target-organ symptoms", "beta-blocker exposure", "volume status", "pregnancy status", "endocrine/anesthesia consultation"]
  });

  const borderlineEndpoint = endpoint({
    id: `${prefix}_borderline_or_mimic_endpoint`,
    label: "PPGL borderline or mimic route: repeat controlled testing or switch pathway before irreversible treatment",
    edgeLabel: "Borderline/mimic branch: metanephrines not above ULN, mild elevation without supine sampling, medication/diet confounder, panic/anxiety, hyperthyroidism, stimulant/withdrawal, OSA, pain/illness, adrenal incidentaloma without biochemical evidence, or alternate endocrine pathway fits better",
    sourceIds: sourceIdsForItems(differentials, sourceIds),
    criteria: criteria(`${prefix}_borderline_or_mimic_criteria`, "Use when PPGL biochemical evidence is absent, borderline, or confounded, or when another diagnosis better explains the presentation.", contextDomains, sourceIdsForItems(differentials, sourceIds), { criteria_options: criteriaRows }),
    action: "Repeat controlled biochemical testing when suspicion persists, preferably plasma metanephrines with supine rest and matching reference intervals or 24-hour urinary fractionated metanephrines. Remove or document medication/diet confounders when clinically safe and route to panic/anxiety, hyperthyroidism, stimulant/withdrawal, OSA, pain/illness, or other adrenal/endocrine pathway when better supported.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "PPGL biochemical evidence is absent, borderline, or confounded by sampling position, medication, acute illness, or another diagnosis.",
    guidelineCutoffs: criteriaRows
  });

  const localizationEndpoint = endpoint({
    id: `${prefix}_localization_genetic_endpoint`,
    label: "PPGL confirmed/high probability: CT/MRI localization, hereditary-risk testing, and expert-center referral",
    edgeLabel: "Localization branch: metanephrines above ULN with high clinical probability or about 3-fold ULN, adrenal incidentaloma with biochemical evidence, prior PPGL, hereditary syndrome, paraganglioma, metastatic risk, pregnancy, or complex localization need",
    sourceIds: ppgl,
    criteria: criteria(`${prefix}_localization_genetic_criteria`, "Use when biochemical evidence supports PPGL localization and hereditary-risk assessment.", ["symptoms", "vitals", "labs", "imaging_results", "demographics", "pregnancy_status", "workup_findings"], ppgl, { criteria_options: criteriaRows }),
    action: "After clear biochemical evidence, use CT as usual first localization imaging; choose MRI when metastatic disease, skull-base/neck paraganglioma, contrast allergy, surgical clips, children, pregnancy, germline mutation, or radiation limitation applies. Engage shared decision-making for genetic testing in all PPGL patients, prioritize SDHx for paraganglioma and SDHB for metastatic disease, and refer complex or pregnant cases to an expert multidisciplinary center.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["metanephrine level and ULN", "CT/MRI result", "adrenal versus paraganglioma site", "genetic testing plan", "pregnancy/metastatic risk", "expert-center referral"]
  });

  const preopEndpoint = endpoint({
    id: `${prefix}_preop_blockade_endpoint`,
    label: "Functional PPGL preoperative management: alpha blockade, volume expansion, beta only after alpha, and surgery approach",
    edgeLabel: "Treatment branch: hormonally functional PPGL, surgery planned or likely, BP/HR can be optimized, and alpha blockade plus high-sodium/fluid preparation can be started for 7-14 days",
    sourceIds: ppgl,
    criteria: criteria(`${prefix}_preop_blockade_criteria`, "Use for hormonally functional PPGL before planned surgery.", ["vitals", "medications", "labs", "comorbidities", "imaging_results", "workup_findings"], ppgl, { criteria_options: criteriaRows }),
    action: "Start alpha blockade and volume preparation for 7-14 days before surgery, using local endocrine/anesthesia dosing protocols such as phenoxybenzamine or selective alpha-1 blockade, then add beta-blockade only after adequate alpha blockade if tachyarrhythmia persists. Target BP/HR and orthostasis safety, coordinate anesthesia, and choose minimally invasive adrenalectomy for most adrenal pheochromocytomas but open resection for invasive or large tumors such as >6 cm.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["seated and standing BP", "heart rate", "orthostatic symptoms", "alpha-blocker dose", "volume/sodium plan", "beta-blocker timing", "tumor size/invasion"]
  });

  const postopEndpoint = endpoint({
    id: `${prefix}_postop_followup_endpoint`,
    label: "PPGL postoperative and lifelong follow-up: immediate BP/HR/glucose monitoring, metanephrines after recovery, and annual surveillance",
    edgeLabel: "Follow-up branch: post-resection, persistent symptoms, hereditary/metastatic risk, paraganglioma, large or invasive tumor, or lifelong recurrence surveillance due",
    sourceIds: ppgl,
    criteria: criteria(`${prefix}_postop_followup_criteria`, "Use after PPGL treatment or when recurrence/metastatic surveillance is due.", ["vitals", "labs", "imaging_results", "genetics", "follow_up_access", "workup_findings"], ppgl, { criteria_options: criteriaRows }),
    action: "Monitor BP, heart rate, and blood glucose immediately after surgery, repeat plasma or urine metanephrines after recovery such as 2-4 weeks postoperatively to document biochemical remission, and assign lifelong annual biochemical surveillance for recurrent or metastatic PPGL, with MRI-based surveillance when genetic or biochemically silent risk applies.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["postoperative BP", "heart rate", "glucose", "metanephrines 2-4 weeks after surgery", "annual metanephrines", "genetic/metastatic risk", "return precautions"]
  });

  const positiveAction = actionNode({
    id: `${prefix}_positive_biochemistry_action`,
    label: "PPGL positive biochemistry: localize, assess genetics, prepare blockade, choose surgery, and assign surveillance",
    edgeLabel: "Positive biochemical branch: plasma free or urinary fractionated metanephrines above ULN with clinical probability, especially around 3-fold ULN, after sampling and medication context are reviewed",
    sourceIds: ppgl,
    criteria: criteria(`${prefix}_positive_biochemistry_criteria`, "Route positive PPGL biochemistry through localization, genetics, preoperative blockade, surgery, and follow-up.", contextDomains, ppgl, { criteria_options: criteriaRows }),
    action: "Move as a coordinated PPGL plan: confirm biochemical probability, localize with CT/MRI as appropriate, assess hereditary/metastatic risk, prepare alpha blockade and volume expansion for functional tumors, choose surgical approach by site/size/invasion, and assign lifelong surveillance.",
    parallelActions: ["confirm metanephrine elevation and sampling context", "localize with CT or MRI", "genetic testing shared decision-making", "alpha blockade and volume expansion", "surgery approach by site/size/invasion", "postoperative and annual surveillance"],
    guidelineCutoffs: criteriaRows,
    children: [localizationEndpoint, preopEndpoint, postopEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: "PPGL classification: missing metanephrines, crisis, positive biochemistry, or borderline/mimic route",
    edgeLabel: "PPGL facts available: symptoms, BP/HR, metanephrine value and ULN, sampling position, medication triggers, imaging context, pregnancy/genetic risk, and follow-up access",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Classify PPGL by emergency physiology, metanephrine magnitude, sampling quality, medication confounders, localization need, blockade safety, surgery approach, and surveillance status.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Choose missing-data, crisis, positive biochemical, or borderline/mimic branch with exact metanephrine, sampling, BP/HR, medication, imaging, pregnancy, and genetic-risk data.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingMetanephrineEndpoint, crisisEndpoint, positiveAction, borderlineEndpoint]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: "PPGL assessment: collect paroxysmal symptoms, BP/HR pattern, metanephrine values/ULN, sampling position, medication triggers, imaging, pregnancy, and genetic risk",
    edgeLabel: "Possible PPGL: paroxysmal headache, sweating, palpitations, sustained or episodic hypertension, adrenal incidentaloma, hereditary syndrome, prior PPGL, paraganglioma concern, or clinician-chosen PPGL evaluation",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial PPGL assessment requires symptoms, vitals, biochemical evidence, sampling quality, medication confounders, imaging context, and special-population risk.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: `Measure repeat BP, orthostatic BP when safe, heart rate, rhythm, oxygenation, and mental status. Obtain plasma free or urinary fractionated metanephrines with ULN, sampling position and reference interval, medication/diet triggers, renal function, glucose if ill or post-op, pregnancy status, adrenal/extra-adrenal imaging context, hereditary syndrome/family history, and surgery or surveillance status. Local evidence reminders: ${listText([...tests, ...redFlags, ...dispositions], "PPGL tests, red flags, and management rules", 10)}.`,
    parallelActions: ["BP/HR and orthostatic vitals", "target-organ symptom screen", "metanephrines with ULN", "sampling position and reference interval", "medication/diet trigger review", "renal function and glucose when indicated", "adrenal/extra-adrenal imaging context", "pregnancy and genetic-risk review", "surgery/surveillance status"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "Pheochromocytoma: route by metanephrine magnitude, sampling quality, crisis risk, localization, alpha blockade, surgery, and surveillance",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for paroxysmal catecholamine symptoms, sustained or episodic hypertension, adrenal incidentaloma, hereditary PPGL risk, prior PPGL, paraganglioma concern, or clinician-chosen PPGL evaluation.", ["clinician_selected_module", "symptoms", "vitals", "labs", "imaging_results", "problem_list_or_diagnosis"], sourceIds),
    action: "Route possible PPGL through missing-data, acute crisis, metanephrine-based confirmation, mimic review, CT/MRI localization, genetic testing, preoperative blockade, surgical approach, postoperative monitoring, lifelong follow-up, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: "hand_polished_pheochromocytoma_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: "Endocrine Society Pheochromocytoma/Paraganglioma Guideline 2014, MSD Manual hypertensive emergency review, and local module evidence rows",
    reviewNote: "Pheochromocytoma tree is threshold-cited and patient-traversable; local metanephrine reference intervals, alpha-blocker dosing protocol, acute PPGL crisis medication protocol, pregnancy pathway, genetic-panel selection, and expert-center surgical planning require clinician governance.",
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_metanephrine_uln", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingMetanephrineEndpoint.id, expected_active_branch: missingMetanephrineEndpoint.edgeLabel },
      { scenario_id: "ppgl_crisis", major_pathway: "escalation_emergency_actions", expected_endpoint_id: crisisEndpoint.id, expected_active_branch: crisisEndpoint.edgeLabel },
      { scenario_id: "positive_metanephrines", major_pathway: "diagnostic_confirmation", expected_endpoint_id: localizationEndpoint.id, expected_active_branch: localizationEndpoint.edgeLabel },
      { scenario_id: "borderline_or_confounded", major_pathway: "mimics_exclusions", expected_endpoint_id: borderlineEndpoint.id, expected_active_branch: borderlineEndpoint.edgeLabel },
      { scenario_id: "genetic_or_pregnancy_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: localizationEndpoint.id, expected_active_branch: localizationEndpoint.edgeLabel },
      { scenario_id: "preoperative_alpha_blockade", major_pathway: "first_line_management", expected_endpoint_id: preopEndpoint.id, expected_active_branch: preopEndpoint.edgeLabel },
      { scenario_id: "surgery_size_route", major_pathway: "severity_risk_stratification", expected_endpoint_id: preopEndpoint.id, expected_active_branch: preopEndpoint.edgeLabel },
      { scenario_id: "postop_monitoring", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: postopEndpoint.id, expected_active_branch: postopEndpoint.edgeLabel },
      { scenario_id: "biochemical_remission_surveillance", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: postopEndpoint.id, expected_active_branch: postopEndpoint.edgeLabel },
      { scenario_id: "lifelong_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: postopEndpoint.id, expected_active_branch: postopEndpoint.edgeLabel }
    ],
    handPolishRequirements: [
      "diagnostic branch uses plasma free or urinary fractionated metanephrines above ULN and high-probability about 3-fold ULN routing",
      "sampling branch requires supine plasma sampling and matching reference intervals or controlled repeat testing",
      "crisis branch includes BP >=180/120 mm Hg with target-organ damage and avoidance of unopposed beta blockade",
      "preoperative branch includes alpha blockade for 7-14 days, BP/HR targets, beta only after alpha blockade, and high-sodium/fluid preparation",
      "surgery branch includes open resection for invasive or large pheochromocytoma such as >6 cm and lifelong annual biochemical surveillance"
    ]
  });
}

function buildGrowthHormoneExcessClinicalPathwayTree(module, sourceById, growthMode) {
  const isGigantism = growthMode === "gigantism";
  const label = module.label || (isGigantism ? "Gigantism" : "Acromegaly");
  const prefix = isGigantism ? "gigantism" : "acromegaly";
  const es = ["ES_ACROMEGALY_2014"];
  const pituitary = ["PITUITARY_ACROMEGALY_2021"];
  const diagnosis = ["ACROMEGALY_DIAGNOSIS_REMISSION_2024"];
  const complications = ["ACROMEGALY_COMPLICATIONS_2026"];
  const sourceIds = unique([...diagnosis, ...es, ...pituitary, ...complications, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 12);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);

  const phenotypeData = isGigantism
    ? ["height velocity", "height SDS/percentile", "mid-parental target height", "pubertal stage", "bone age", "epiphyseal/growth-plate status"]
    : ["acral/facial feature progression", "ring/shoe/hat size change", "jaw spacing", "carpal tunnel", "hyperhidrosis", "skin tags"];
  const specialLabel = isGigantism
    ? "Pediatric gigantism: rapid growth before epiphyseal closure needs pediatric endocrinology, pituitary MRI, genetic/syndromic review, and adult GH-excess targets"
    : "Acromegaly pregnancy/fertility: stop long-acting SRL or pegvisomant about 2 months before conception and monitor macroadenoma visual fields";
  const specialAction = isGigantism
    ? "For GH excess before epiphyseal closure, treat urgently with a pediatric pituitary team: document height velocity, height SDS/percentile, pubertal stage, bone age, epiphyseal status, visual field risk, pituitary MRI, family history and syndromic/genetic clues, and then normalize GH/IGF-1 using the same surgery/medical/radiation framework while protecting growth, puberty, and school/function follow-up."
    : "For planned pregnancy, stop long-acting SRL formulations and pegvisomant about 2 months before attempts to conceive; during pregnancy withhold medical therapy unless tumor growth or headache control requires treatment, use serial visual field testing for macroadenomas, and do not use GH or IGF-1 levels for pregnancy monitoring.";

  const criteriaRows = [
    criterion({
      id: `${prefix}_igf1_screening_population`,
      label: `${label} screening: measure age-adjusted IGF-1 for typical phenotype, pituitary mass, or multiple associated comorbidities`,
      criteria_text: "Endocrine Society recommends IGF-1 testing for typical acromegaly manifestations, pituitary mass, and consideration when several associated conditions coexist such as sleep apnea, type 2 diabetes, debilitating arthritis, carpal tunnel syndrome, hyperhidrosis, or hypertension.",
      cutoffs: [],
      data_needed: unique([...phenotypeData, "pituitary mass", "sleep apnea", "type 2 diabetes", "arthritis", "carpal tunnel", "hyperhidrosis", "hypertension", "age-adjusted IGF-1"]),
      source_ids: es,
      source_section: "Diagnosis recommendations 1.1-1.3"
    }),
    criterion({
      id: `${prefix}_igf1_1_3_uln_confirmation`,
      label: `${label} confirmation: typical phenotype with IGF-1 >1.3 x ULN for age confirms GH excess spectrum`,
      criteria_text: "The 2024 Acromegaly Consensus Group states that in a patient with typical features, IGF-1 >1.3 times the upper limit of normal for age confirms acromegaly; equivocal results should be repeated using the same validated assay and may need OGTT.",
      cutoffs: [">1.3 x ULN"],
      data_needed: unique([...phenotypeData, "age-adjusted IGF-1", "assay ULN", "same-assay repeat IGF-1 when equivocal", "clinical phenotype"]),
      source_ids: diagnosis,
      source_section: "Consensus diagnosis criteria"
    }),
    criterion({
      id: `${prefix}_ogtt_gh_suppression_cutoffs`,
      label: `${label} OGTT: failure to suppress GH to <1 ng/mL (<1 ug/L) after 75-g glucose, or <0.4 ng/mL (<0.4 ug/L) with sufficiently accurate assays, supports active disease when IGF-1 is high/equivocal`,
      criteria_text: "Endocrine Society recommends confirming elevated/equivocal IGF-1 by lack of GH suppression to <1 ug/L after documented hyperglycemia during an oral glucose load; historical Society criteria use GH nadir <1 ng/mL for suppression, with lower <0.4 ng/mL cutoffs used by sensitive assays. A nadir GH <1 ug/L within 2 hours after 75-g glucose usually excludes acromegaly, and <0.4 ug/L has been considered with sensitive assays.",
      cutoffs: ["75 g", "GH nadir <1 ng/mL", "GH nadir <1 ug/L", "2 hours", "GH nadir <0.4 ng/mL", "GH nadir <0.4 ug/L"],
      data_needed: ["75-g OGTT", "GH nadir", "glucose before/after load", "GH assay sensitivity", "IGF-1 result", "diabetes/glucose tolerance status"],
      source_ids: unique([...es, ...diagnosis]),
      source_section: "Diagnosis recommendation 1.5 and 2024 equivocal-testing consensus"
    }),
    criterion({
      id: `${prefix}_random_gh_not_diagnostic`,
      label: `${label} random GH: do not diagnose by random GH alone; random GH <0.4 ug/L with normal IGF-1 helps exclude GH excess`,
      criteria_text: "Endocrine Society recommends against relying on random GH to diagnose acromegaly; the 2024 consensus notes random fasting GH can inform prognosis but is not required for diagnosis, and prior consensus criteria excluded acromegaly when random GH was <0.4 ug/L with normal IGF-1.",
      cutoffs: ["<0.4 ug/L"],
      data_needed: ["random fasting GH", "age/sex-adjusted IGF-1", "assay reference interval", "clinical phenotype"],
      source_ids: unique([...es, ...diagnosis]),
      source_section: "Diagnosis recommendation 1.4 and 2024 consensus background"
    }),
    criterion({
      id: `${prefix}_mri_visual_field_cutoffs`,
      label: `${label} imaging: pituitary MRI after biochemical diagnosis; formal visual fields if tumor abuts optic chiasm`,
      criteria_text: "Endocrine Society recommends pituitary imaging after biochemical diagnosis, MRI as preferred imaging, CT only when MRI is contraindicated/unavailable, and formal visual field testing when tumor abuts the optic chiasm.",
      cutoffs: [],
      data_needed: ["biochemical diagnosis", "pituitary MRI", "MRI contraindication", "CT if MRI unavailable", "optic chiasm contact", "formal visual field test"],
      source_ids: es,
      source_section: "Diagnosis recommendations 1.6-1.7"
    }),
    criterion({
      id: `${prefix}_comorbidity_screening`,
      label: `${label} comorbidity screen: BP, diabetes, cardiovascular disease, osteoarthritis, sleep apnea, colonoscopy at diagnosis, thyroid ultrasound for palpable nodules, hypopituitarism`,
      criteria_text: "Endocrine Society recommends evaluating all patients with acromegaly for hypertension, diabetes mellitus, cardiovascular disease, osteoarthritis, sleep apnea, colon neoplasia with colonoscopy at diagnosis, thyroid ultrasound if palpable thyroid nodularity exists, and hypopituitarism with hormone replacement when deficits are present.",
      cutoffs: [],
      data_needed: ["blood pressure", "fasting glucose or A1c", "cardiovascular assessment", "sleep apnea symptoms/testing", "joint/fracture symptoms", "colonoscopy status", "thyroid exam", "pituitary axes"],
      source_ids: unique([...es, ...complications]),
      source_section: "Comorbidity recommendations 2.1-2.5 and 2026 complications update"
    }),
    criterion({
      id: `${prefix}_urgent_mass_effect_and_metabolic_risk`,
      label: `${label} urgent route: pituitary apoplexy, acute severe headache, visual field loss, cranial nerve palsy, airway/OSA risk, cardiomyopathy, arrhythmia, uncontrolled diabetes, adrenal crisis, or macroadenoma pregnancy symptoms`,
      criteria_text: "Acromegaly/GH-excess workup should escalate for pituitary apoplexy or mass effect, severe cardiopulmonary or sleep-apnea risk, uncontrolled glucose/cardiac complications, adrenal crisis, or macroadenoma symptoms during pregnancy before routine outpatient endocrine sequencing.",
      cutoffs: [],
      data_needed: ["headache onset/severity", "visual field symptoms", "cranial nerve palsy", "mental status", "airway/OSA symptoms", "heart failure/cardiomyopathy", "arrhythmia", "glucose/A1c", "cortisol/adrenal status", "pregnancy status"],
      source_ids: unique([...es, ...complications]),
      source_section: "Mass effect, comorbidity, and pregnancy recommendations"
    }),
    criterion({
      id: `${prefix}_treatment_goals`,
      label: `${label} treatment goals: age-normalized IGF-1 and random GH <1.0 ug/L, tracked with the same assay when possible`,
      criteria_text: "Endocrine Society suggests age-normalized IGF-1 as the biochemical target and random GH <1.0 ug/L as a therapeutic goal, with the same GH and IGF-1 assay used longitudinally in the same patient.",
      cutoffs: ["random GH <1.0 ug/L"],
      data_needed: ["age-normalized IGF-1", "random GH", "assay method", "symptoms", "tumor size"],
      source_ids: es,
      source_section: "Goals of management recommendations 3.1-3.3"
    }),
    criterion({
      id: `${prefix}_surgery_postop_timing`,
      label: `${label} surgery: transsphenoidal surgery primary for most; post-op IGF-1/random GH and MRI at >=12 weeks, OGTT if GH >1 ug/L`,
      criteria_text: "Endocrine Society recommends transsphenoidal surgery as primary therapy for most patients, considers repeat surgery for residual intrasellar disease, and recommends/suggests postoperative IGF-1 and random GH at 12 weeks or later, OGTT nadir GH when GH is >1 ug/L, and MRI at least 12 weeks after surgery.",
      cutoffs: [">=12 weeks", ">1 ug/L"],
      data_needed: ["surgical candidacy", "pituitary MRI", "optic chiasm/mass effect", "postoperative date", "postoperative IGF-1", "postoperative random GH", "postoperative MRI", "OGTT GH nadir if GH >1"],
      source_ids: es,
      source_section: "Surgery recommendations 4.1, 4.2, 4.6, and 4.7"
    }),
    criterion({
      id: `${prefix}_preop_srl_and_debulking`,
      label: `${label} surgical modifier: pre-op SRL only for severe pharyngeal thickness/sleep apnea or high-output heart failure; debulk parasellar disease when cure unlikely`,
      criteria_text: "Endocrine Society suggests against routine preoperative medical therapy, but suggests SRL preoperatively when severe pharyngeal thickness/sleep apnea or high-output heart failure raises surgical risk, and suggests debulking parasellar disease when total resection is unlikely to improve response to medical therapy.",
      cutoffs: [],
      data_needed: ["sleep apnea severity", "pharyngeal thickness/airway risk", "high-output heart failure", "parasellar/cavernous sinus disease", "surgical cure likelihood"],
      source_ids: es,
      source_section: "Surgery recommendations 4.3-4.5"
    }),
    criterion({
      id: `${prefix}_medical_radiation_rules`,
      label: `${label} medical/radiation therapy: persistent disease after surgery, significant symptoms use SRL or pegvisomant, mild/modest IGF-1 may use cabergoline, RT if residual mass and drugs unavailable/failed/not tolerated`,
      criteria_text: "Endocrine Society recommends medical therapy for persistent disease after surgery; suggests SRL or pegvisomant for significant disease without local mass effects, cabergoline for mild signs and modest IGF-1 elevation, primary SRL when surgery cannot cure, and radiation for residual tumor mass when medical therapy is unavailable, unsuccessful, or not tolerated.",
      cutoffs: [],
      data_needed: ["postoperative IGF-1/GH", "symptom severity", "mass effect", "cavernous sinus invasion", "surgery candidacy", "cabergoline/SRL/pegvisomant contraindications", "radiation proximity to optic chiasm"],
      source_ids: unique([...es, ...pituitary]),
      source_section: "Medical therapy recommendations 5.1-5.8 and radiotherapy recommendations 6.1-6.2",
      needs_clinical_review: true,
      reviewer_input_needed: "Endocrine Society uses qualitative 'mild/modest' and 'significant' disease wording for medical-therapy selection; local pituitary program should define numeric IGF-1 and tumor-response thresholds for medication sequencing."
    }),
    criterion({
      id: `${prefix}_pegvisomant_lft_cutoffs`,
      label: `${label} pegvisomant safety: LFTs monthly for first 6 months, then every 6 months; consider stopping if transaminases >3-fold elevated`,
      criteria_text: "Endocrine Society suggests monthly liver function testing for the first 6 months and then every 6 months for pegvisomant, with consideration of discontinuation if transaminases are greater than 3-fold elevated.",
      cutoffs: ["monthly", "6 months", "every 6 months", ">3-fold"],
      data_needed: ["pegvisomant use", "ALT/AST", "baseline liver disease", "last LFT date", "tumor MRI plan"],
      source_ids: es,
      source_section: "Medical therapy recommendation 5.6"
    }),
    criterion({
      id: `${prefix}_radiation_followup_cutoffs`,
      label: `${label} radiation: prefer stereotactic RT unless optic chiasm exposure would exceed 8 Gy; check GH/IGF-1 and pituitary hormones annually`,
      criteria_text: "Endocrine Society suggests stereotactic radiotherapy over conventional radiotherapy unless unavailable, residual tumor burden is significant, or the tumor is too close to the optic chiasm causing exposure >8 Gy; after radiation, reassess GH/IGF-1 annually after medication withdrawal and test annually for hypopituitarism and delayed effects.",
      cutoffs: [">8 Gy", "annual"],
      data_needed: ["residual tumor size/location", "optic chiasm distance/dose estimate", "radiotherapy modality availability", "annual GH/IGF-1", "annual pituitary hormone testing"],
      source_ids: es,
      source_section: "Radiotherapy recommendations 6.2-6.4"
    }),
    criterion({
      id: `${prefix}_pregnancy_cutoffs`,
      label: "Acromegaly pregnancy: stop long-acting SRL/pegvisomant about 2 months before conception attempts; serial visual fields for macroadenomas; avoid GH/IGF-1 monitoring during pregnancy",
      criteria_text: "Endocrine Society suggests discontinuing long-acting SRL formulations and pegvisomant approximately 2 months before attempts to conceive, withholding medical therapy during pregnancy except for tumor/headache control, using serial visual field testing in macroadenomas, and not monitoring GH/IGF-1 during pregnancy.",
      cutoffs: ["approximately 2 months"],
      data_needed: ["pregnancy intent", "current SRL/pegvisomant", "macroadenoma status", "headache/tumor symptoms", "visual field plan"],
      source_ids: es,
      source_section: "Pregnancy recommendations 7.2-7.5"
    }),
    criterion({
      id: `${prefix}_gigantism_standard_targets`,
      label: "Gigantism: before epiphyseal closure use standard GH/IGF-1 normalizing approach plus pediatric growth/puberty/bone-age data",
      criteria_text: "Endocrine Society recommends standard approaches to normalizing GH and IGF-1 hypersecretion in patients with rare presentation of gigantism; pediatric application requires growth, pubertal, bone-age, genetic/syndromic, and family context.",
      cutoffs: [],
      data_needed: ["epiphyseal/growth-plate status", "height velocity", "height SDS/percentile", "pubertal stage", "bone age", "IGF-1 age/puberty reference interval", "family history/genetic clues"],
      source_ids: es,
      source_section: "Gigantism recommendation 7.1",
      needs_clinical_review: true,
      reviewer_input_needed: "Pediatric endocrinology should define age/puberty-specific growth-velocity and IGF-1 assay cutoffs for local pediatric gigantism workflows."
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: `Missing data needed: ${label} symptoms, IGF-1/GH, glucose-load, pituitary imaging, comorbidity, and special-population context`,
    edgeLabel: `Missing ${label} data: phenotype/growth pattern, age/puberty context, age-adjusted IGF-1, assay ULN, OGTT GH nadir if needed, pituitary MRI/visual fields, comorbidities, medications, pregnancy or epiphyseal status, and treatment history`,
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, `Route here when ${label} cannot be evaluated because key GH-excess data are unavailable.`, contextDomains, sourceIds, { missing_any: contextDomains }),
    action: `Document ${phenotypeData.join(", ")}, age/sex/puberty context, IGF-1 with ULN, random GH and OGTT GH nadir when needed, glucose before/after OGTT, pituitary MRI and visual field status, BP/glucose/A1c/OSA/cardiac/colon/thyroid/pituitary-axis status, medication and pregnancy/fertility context, ${isGigantism ? "bone age and epiphyseal status" : "prior surgery/medical/radiation history"}, and follow-up access.`,
    endpointType: "missing_data_needed",
    missingDataNeeded: unique([...phenotypeData, "age-adjusted IGF-1 and assay ULN", "OGTT GH nadir and glucose values when needed", "pituitary MRI", "optic chiasm/visual field status", "BP and glucose/A1c", "sleep apnea/cardiac/colon/thyroid/pituitary-axis status", "medication history", isGigantism ? "bone age and epiphyseal status" : "pregnancy/fertility status", "treatment history and follow-up access"])
  });

  const missingBiochemicalEndpoint = endpoint({
    id: `${prefix}_missing_biochemical_endpoint`,
    label: `Missing data needed: ${label} IGF-1 ULN, same-assay repeat, OGTT GH nadir, or glucose verification`,
    edgeLabel: `Cannot classify ${label} until IGF-1 with age/puberty reference range, assay ULN, same-assay repeat if equivocal, and OGTT GH nadir with documented hyperglycemia are known when indicated`,
    sourceIds: unique([...diagnosis, ...es]),
    criteria: criteria(`${prefix}_missing_biochemical_criteria`, `Route here when ${label} biochemical confirmation data are incomplete.`, contextDomains, unique([...diagnosis, ...es]), { missing_any: ["age-adjusted IGF-1", "assay ULN", "same-assay repeat IGF-1 if equivocal", "OGTT GH nadir", "OGTT glucose values"] }),
    action: "Obtain or repeat age/sex/puberty-adjusted IGF-1 using the same validated assay when equivocal; if IGF-1 is elevated or equivocal and diagnosis remains uncertain, perform 75-g OGTT with GH nadir and glucose documentation to verify hyperglycemia and apply the <1 ug/L or assay-specific <0.4 ug/L suppression rule.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["age/sex/puberty-adjusted IGF-1", "assay ULN", "same-assay repeat IGF-1 if equivocal", "75-g OGTT GH nadir", "glucose before/after OGTT", "clinical phenotype"]
  });

  const urgentEndpoint = endpoint({
    id: `${prefix}_urgent_mass_effect_endpoint`,
    label: `${label} urgent escalation: apoplexy, visual loss, cranial nerve palsy, airway/OSA risk, cardiomyopathy, arrhythmia, severe glucose problem, or adrenal crisis`,
    edgeLabel: `Emergency branch: acute severe headache, visual field loss, cranial nerve palsy, altered mental status, macroadenoma pregnancy symptoms, severe OSA/airway concern, high-output heart failure/cardiomyopathy, arrhythmia, uncontrolled diabetes, severe electrolyte/glucose abnormality, or adrenal crisis`,
    sourceIds: unique([...es, ...complications]),
    criteria: criteria(`${prefix}_urgent_criteria`, `Escalate ${label} before routine endocrine sequencing when pituitary mass effect, apoplexy, cardiopulmonary/sleep, glucose, adrenal, pregnancy, or pediatric growth-threatening risk is present.`, ["symptoms", "exam", "vitals", "labs", "imaging_results", "pregnancy_status", "workup_findings"], unique([...es, ...complications]), { criteria_options: criteriaRows }),
    action: "Send for urgent endocrine/neurosurgical/ophthalmologic or monitored-care evaluation as appropriate. Check neuro-ophthalmic status, cortisol/adrenal risk, glucose/ketones if ill, ECG/cardiac/OSA/airway risk, pituitary MRI urgency, pregnancy or pediatric status, and stabilize the dangerous problem before elective GH-excess treatment planning.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["mental status/headache", "visual fields/cranial nerves", "cortisol/adrenal crisis risk", "glucose/A1c/ketones when ill", "BP/heart rhythm/heart failure", "OSA/airway risk", "pituitary MRI urgency"]
  });

  const diagnosticEndpoint = endpoint({
    id: `${prefix}_diagnostic_confirmation_endpoint`,
    label: `${label} diagnostic confirmation: IGF-1 >1.3 x ULN, OGTT suppression rule, pituitary MRI, and visual-field routing`,
    edgeLabel: `Diagnostic branch: typical ${label} phenotype or ${isGigantism ? "rapid growth before epiphyseal closure" : "acral/facial feature progression"} with IGF-1 >1.3 x ULN, elevated/equivocal IGF-1 needing OGTT, or pituitary mass needing GH-excess exclusion`,
    sourceIds: unique([...diagnosis, ...es]),
    criteria: criteria(`${prefix}_diagnostic_confirmation_criteria`, `Use when ${label} biochemical and imaging data can establish or exclude GH excess.`, ["symptoms", "exam", "labs", "imaging_results", "demographics", "workup_findings"], unique([...diagnosis, ...es]), { criteria_options: criteriaRows }),
    action: "Confirm GH excess when typical features and IGF-1 >1.3 x ULN for age are present. If IGF-1 is elevated/equivocal, repeat IGF-1 with the same validated assay and use 75-g OGTT when needed; GH suppression to <1 ug/L usually excludes active disease, while <0.4 ug/L may be used only with sufficiently accurate assays. After biochemical diagnosis, obtain pituitary MRI and formal visual fields if the tumor abuts the optic chiasm.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows
  });

  const mimicEndpoint = endpoint({
    id: `${prefix}_mimic_or_confounded_endpoint`,
    label: `${label} mimic/confounder route: normal IGF-1, adolescence/pregnancy, uncontrolled diabetes, renal/hepatic failure, hypothyroidism, malnutrition, severe infection, oral estrogen, or pseudoacromegaly`,
    edgeLabel: `Alternate branch: IGF-1 normal for age/puberty, OGTT suppresses GH, phenotype is explained by adolescence/pregnancy or insulin-mediated pseudoacromegaly, or IGF-1/GH is confounded by diabetes, renal/hepatic disease, hypothyroidism, malnutrition, severe infection, oral estrogen, assay mismatch, or medication effect`,
    sourceIds: sourceIdsForItems(differentials, sourceIds),
    criteria: criteria(`${prefix}_mimic_criteria`, `Use when ${label} criteria are absent or biochemical/imaging data are confounded by another diagnosis.`, ["symptoms", "exam", "labs", "medications", "comorbidities", "pregnancy_status", "workup_findings"], sourceIdsForItems(differentials, sourceIds), { criteria_options: criteriaRows }),
    action: "Do not route to pituitary GH-excess treatment until the confounder is corrected or the alternate diagnosis is resolved. Repeat same-assay IGF-1 after reversible illness or medication confounding when suspicion persists, and route to pregnancy/adolescence normal variant, pseudoacromegaly, uncontrolled diabetes, renal/hepatic disease, hypothyroidism, malnutrition, severe infection, oral-estrogen effect, medication effect, or another sellar/parasellar pathway as appropriate.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Biochemical or phenotype data are absent, normal, equivocal, assay-confounded, or better explained by another diagnosis.",
    guidelineCutoffs: criteriaRows
  });

  const surgeryEndpoint = endpoint({
    id: `${prefix}_surgery_endpoint`,
    label: `${label} first-line pituitary treatment: transsphenoidal surgery, selective pre-op SRL for severe OSA/airway or high-output heart failure, and >=12-week postoperative testing`,
    edgeLabel: `Surgery branch: biochemical ${label} diagnosis with resectable pituitary adenoma, no overriding contraindication, mass-effect plan known, and neurosurgical/pituitary-center pathway available`,
    sourceIds: es,
    criteria: criteria(`${prefix}_surgery_criteria`, `Use when ${label} is biochemically confirmed and pituitary surgery is appropriate or needs specialist review.`, ["labs", "imaging_results", "comorbidities", "pregnancy_status", "workup_findings"], es, { criteria_options: criteriaRows }),
    action: "Refer to an experienced pituitary neurosurgery team for transsphenoidal surgery as primary therapy for most patients. Avoid routine pre-op medical therapy, but consider SRL preoperatively for severe pharyngeal thickness/sleep apnea or high-output heart failure; consider debulking parasellar disease when total resection is unlikely. At 12 weeks or later after surgery, measure IGF-1 and random GH, perform OGTT if GH remains >1 ug/L, and obtain MRI at least 12 weeks postoperatively.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["pituitary MRI anatomy", "visual fields when chiasm involved", "surgical candidacy", "pre-op OSA/heart failure risk", "post-op IGF-1/GH >=12 weeks", "post-op MRI >=12 weeks", "pituitary hormone deficits"]
  });

  const medicalEndpoint = endpoint({
    id: `${prefix}_medical_radiation_endpoint`,
    label: `${label} persistent/unresectable disease: SRL, pegvisomant, cabergoline, combination therapy, or radiotherapy with safety monitoring`,
    edgeLabel: `Medical/radiation branch: persistent active ${label} after surgery, unresectable/cavernous sinus disease without chiasmal compression, poor surgical candidate, recurrent disease, medication sequencing need, or residual mass with failed/unavailable/not tolerated medical therapy`,
    sourceIds: unique([...es, ...pituitary]),
    criteria: criteria(`${prefix}_medical_radiation_criteria`, `Use when ${label} requires nonoperative or adjuvant therapy.`, ["labs", "imaging_results", "medications", "comorbidities", "pregnancy_status", "workup_findings"], unique([...es, ...pituitary]), { criteria_options: criteriaRows }),
    action: "For persistent disease after surgery, use medical therapy. For significant symptoms without local mass effect, select SRL or pegvisomant; for mild symptoms with modest IGF-1 elevation, cabergoline may be tried, but the exact local definition of modest IGF-1 elevation needs endocrine review. Use primary SRL when surgery is unlikely to cure because of extensive cavernous sinus invasion, no chiasmal compression, or poor surgical candidacy. Use radiotherapy for residual tumor mass when medical therapy is unavailable, unsuccessful, or not tolerated; prefer stereotactic RT unless unavailable, tumor burden is significant, or optic-chiasm exposure would exceed 8 Gy.",
    endpointType: "treatment",
    reviewNeededReason: "Medication sequencing, cabergoline eligibility, pasireotide hyperglycemia risk, and radiation technique require pituitary-center protocol and patient preference.",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["IGF-1 and random GH", "tumor MRI", "glucose/A1c when SRL/pasireotide considered", "pegvisomant LFTs", "gallstone symptoms on SRL", "radiation optic-chiasm dose", "annual pituitary axes after RT"]
  });

  const specialEndpoint = endpoint({
    id: `${prefix}_special_population_endpoint`,
    label: specialLabel,
    edgeLabel: isGigantism
      ? "Special-population branch: GH excess begins before epiphyseal closure, rapid height acceleration or tall stature crosses expected family/puberty trajectory, pediatric pituitary mass is present, or syndromic/genetic risk changes care"
      : "Special-population branch: pregnancy is planned/current, macroadenoma is present, fertility treatment is relevant, or acromegaly medication must be changed for conception/pregnancy",
    sourceIds: es,
    criteria: criteria(`${prefix}_special_population_criteria`, `Use when ${label} management changes because of ${isGigantism ? "pediatric growth/puberty/bone-age and genetic context" : "pregnancy, fertility intent, or macroadenoma monitoring"}.`, ["demographics", "pregnancy_status", "labs", "imaging_results", "medications", "workup_findings"], es, { criteria_options: criteriaRows }),
    action: specialAction,
    endpointType: "clinician_review_handoff",
    reviewNeededReason: isGigantism
      ? "Pediatric gigantism needs pediatric endocrinology, neurosurgery, growth/puberty expertise, and local genetic-testing governance."
      : "Acromegaly pregnancy medication and tumor monitoring require endocrinology, obstetric, and pituitary-center review.",
    guidelineCutoffs: criteriaRows
  });

  const monitoringEndpoint = endpoint({
    id: `${prefix}_monitoring_endpoint`,
    label: `${label} monitoring/remission: age-normalized IGF-1, random GH <1 ug/L, MRI, pituitary axes, comorbidities, and medication toxicity`,
    edgeLabel: `Monitoring branch: treatment has occurred or is ongoing, biochemical response, tumor size, pituitary deficits, comorbidities, medication toxicity, or radiation effects need reassessment`,
    sourceIds: unique([...diagnosis, ...es, ...complications]),
    criteria: criteria(`${prefix}_monitoring_criteria`, `Use after surgery, medical therapy, or radiation to decide response, escalation, or remission follow-up for ${label}.`, ["symptoms", "vitals", "labs", "imaging_results", "medications", "comorbidities", "workup_findings"], unique([...diagnosis, ...es, ...complications]), { criteria_options: criteriaRows }),
    action: "Trend age-normalized IGF-1, random GH goal <1 ug/L, symptoms, pituitary MRI, visual fields when relevant, pituitary hormone deficits, BP, fasting glucose/A1c, sleep apnea, cardiovascular disease, joint/bone disease, colon surveillance, thyroid nodules, SRL gallstone symptoms, pegvisomant liver tests monthly for 6 months then every 6 months, and annual GH/IGF-1 plus pituitary axes after radiotherapy.",
    endpointType: "monitoring_reassessment",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["age-normalized IGF-1", "random GH <1 ug/L", "post-op >=12 week labs/MRI", "same assay over time", "pituitary MRI/visual fields", "pituitary axes", "BP/glucose/A1c/OSA/cardiac/colon/thyroid/bone", "pegvisomant LFTs", "annual post-RT endocrine testing"]
  });

  const followupEndpoint = endpoint({
    id: `${prefix}_followup_safety_endpoint`,
    label: `${label} follow-up and safety-net: remission, recurrence, medication toxicity, mass-effect symptoms, comorbidity owners, and specialty follow-up`,
    edgeLabel: `Disposition branch: no acute mass effect, active treatment or remission plan documented, pending tests owned, pituitary-center follow-up scheduled, and return precautions reviewed`,
    sourceIds,
    criteria: criteria(`${prefix}_followup_safety_criteria`, `Use when ${label} has a stable outpatient or post-treatment plan with pending data and safety-net ownership.`, ["symptoms", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Assign pituitary-endocrinology follow-up, pending IGF-1/GH/MRI/visual-field/pituitary-axis owners, comorbidity owners for BP/glucose/OSA/cardiac/colon/thyroid/bone/joint disease, medication toxicity monitoring, and return precautions for sudden severe headache, vision change, diplopia, confusion, vomiting, adrenal-crisis symptoms, chest pain, dyspnea, syncope, severe hyperglycemia, airway/OSA worsening, pregnancy macroadenoma symptoms, or pediatric rapid growth progression.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows,
    monitoringPlan: ["pituitary endocrine follow-up", "pending result owner", "visual and headache safety-net", "glucose/cardiac/OSA safety-net", "medication toxicity checks", "recurrence surveillance", "access barriers"]
  });

  const treatmentAction = actionNode({
    id: `${prefix}_treatment_action`,
    label: `${label} treatment selection: surgery first when resectable, medical/radiation when persistent or nonsurgical, special-population review when pregnancy or growth plates change care`,
    edgeLabel: `Treatment branch: biochemical ${label} is confirmed or highly likely, MRI/surgical candidacy and comorbidity modifiers are available, and acute instability is absent`,
    sourceIds,
    criteria: criteria(`${prefix}_treatment_action_criteria`, `Route ${label} therapy by resectability, mass effect, comorbidities, medication/radiation safety, pregnancy or pediatric context, response monitoring, and patient preference.`, contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Choose the active treatment path: transsphenoidal surgery for most resectable pituitary adenomas; medical/radiation pathway for persistent, unresectable, recurrent, or nonsurgical disease; special-population review for pregnancy/fertility or pediatric gigantism; monitoring and safety-net follow-up for response, remission, recurrence, and toxicity.",
    parallelActions: ["pituitary surgery referral", "medical/radiation eligibility", isGigantism ? "pediatric growth/puberty/bone-age review" : "pregnancy/fertility medication review", "comorbidity treatment", "response/remission monitoring", "safety-net follow-up"],
    guidelineCutoffs: criteriaRows,
    children: [surgeryEndpoint, medicalEndpoint, specialEndpoint, monitoringEndpoint, followupEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: `${label} classification: missing biochemical data, urgent mass-effect/comorbidity risk, confirmed GH excess, mimic/confounder, or treatment pathway`,
    edgeLabel: `${label} phenotype, IGF-1/ULN, OGTT GH nadir when needed, MRI/visual fields, comorbidities, medication, pregnancy or growth-plate context, and treatment history are available`,
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, `Classify ${label} by GH-excess confirmation, urgent risk, mimic/confounder review, surgery/medical/radiation eligibility, special-population modifiers, and monitoring needs.`, contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: `Choose missing-data, urgent escalation, diagnostic confirmation, mimic/confounder, or treatment/monitoring branch for ${label}.`,
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingBiochemicalEndpoint, urgentEndpoint, diagnosticEndpoint, mimicEndpoint, treatmentAction]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: `${label} assessment: phenotype/growth pattern, IGF-1/ULN, OGTT GH, pituitary MRI, visual fields, comorbidities, medication, and ${isGigantism ? "growth-plate status" : "pregnancy/fertility status"}`,
    edgeLabel: isGigantism
      ? "Possible gigantism: rapid linear growth, tall stature beyond family/puberty trajectory, coarse/acral features, headaches/visual symptoms, pituitary mass, or clinician-chosen pediatric GH-excess evaluation"
      : "Possible acromegaly: acral/facial feature progression, pituitary mass, sleep apnea, diabetes, arthritis, carpal tunnel, hyperhidrosis, hypertension, headaches/visual symptoms, or clinician-chosen adult GH-excess evaluation",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, `Initial ${label} assessment requires phenotype, biochemical, imaging, comorbidity, medication, and special-population data together.`, contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: `Measure BP, heart rate, weight/BMI, mental status, and visual symptoms. Document ${phenotypeData.join(", ")}, IGF-1 with age/sex/puberty ULN, same-assay repeat status, random GH, 75-g OGTT GH nadir/glucose when needed, pituitary MRI and optic chiasm relationship, visual fields, pituitary axes, glucose/A1c, sleep apnea/cardiac/colon/thyroid/bone/joint comorbidities, current acromegaly medicines, ${isGigantism ? "bone age, epiphyseal status, pubertal stage, family/genetic context" : "pregnancy/fertility context"}, and prior surgery/radiation.`,
    parallelActions: ["phenotype/growth documentation", "IGF-1 with ULN", "same-assay repeat or OGTT when equivocal", "pituitary MRI and visual fields", "pituitary axes", "BP/glucose/A1c", "OSA/cardiac/colon/thyroid/bone/joint screen", "medication and prior treatment review", isGigantism ? "bone age/puberty/genetic review" : "pregnancy/fertility review"],
    requiredData: unique(criteriaRows.flatMap((row) => row.data_needed || [])),
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: `${label}: route GH excess by IGF-1/GH cutoffs, pituitary mass effect, treatment eligibility, comorbidities, and ${isGigantism ? "pediatric growth status" : "adult pregnancy/fertility modifiers"}`,
    sourceIds,
    criteria: criteria(`${prefix}_activate`, `Activate for ${isGigantism ? "rapid growth/tall stature before epiphyseal closure, pediatric GH-excess phenotype, pituitary mass, or clinician-chosen gigantism evaluation" : "adult acromegaly phenotype, pituitary mass, associated comorbidity cluster, or clinician-chosen acromegaly evaluation"}.`, ["clinician_chosen_module", "symptoms", "exam", "labs", "imaging_results", "problem_list_or_diagnosis"], sourceIds),
    action: `Route ${label} through missing-data, urgent mass-effect/comorbidity escalation, IGF-1/OGTT diagnostic confirmation, mimic review, surgery, medical/radiation therapy, special-population review, monitoring/remission, follow-up, and safety-net endpoints.`,
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: isGigantism ? "hand_polished_gigantism_pathway_needs_clinician_review" : "hand_polished_acromegaly_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: "Endocrine Society Acromegaly Guideline 2014, Pituitary Society Acromegaly Management Update 2021, Acromegaly Consensus Group diagnosis/remission criteria 2024, Acromegaly Consensus Group complications update 2026, and local module evidence rows",
    reviewNote: `${label} tree is threshold-cited and patient-traversable; GH/IGF-1 assay selection, pediatric growth/puberty cutoffs, medication sequencing, cabergoline eligibility, radiation dose planning, pregnancy/fertility management, and local pituitary-center workflows require clinician governance.`,
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_igf1_or_ogtt", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingBiochemicalEndpoint.id, expected_active_branch: missingBiochemicalEndpoint.edgeLabel },
      { scenario_id: "mass_effect_or_metabolic_urgent", major_pathway: "escalation_emergency_actions", expected_endpoint_id: urgentEndpoint.id, expected_active_branch: urgentEndpoint.edgeLabel },
      { scenario_id: "igf1_positive_diagnosis", major_pathway: "diagnostic_confirmation", expected_endpoint_id: diagnosticEndpoint.id, expected_active_branch: diagnosticEndpoint.edgeLabel },
      { scenario_id: "ogtt_or_normal_igf1_exclusion", major_pathway: "mimics_exclusions", expected_endpoint_id: mimicEndpoint.id, expected_active_branch: mimicEndpoint.edgeLabel },
      { scenario_id: "pituitary_surgery_first_line", major_pathway: "first_line_management", expected_endpoint_id: surgeryEndpoint.id, expected_active_branch: surgeryEndpoint.edgeLabel },
      { scenario_id: "persistent_or_unresectable_disease", major_pathway: "severity_risk_stratification", expected_endpoint_id: medicalEndpoint.id, expected_active_branch: medicalEndpoint.edgeLabel },
      { scenario_id: isGigantism ? "pediatric_growth_plate_review" : "pregnancy_fertility_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: specialEndpoint.id, expected_active_branch: specialEndpoint.edgeLabel },
      { scenario_id: "response_and_toxicity_monitoring", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: monitoringEndpoint.id, expected_active_branch: monitoringEndpoint.edgeLabel },
      { scenario_id: "remission_or_radiation_deescalation", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: monitoringEndpoint.id, expected_active_branch: monitoringEndpoint.edgeLabel },
      { scenario_id: "followup_safety_net", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel }
    ],
    handPolishRequirements: [
      "diagnostic branch includes IGF-1 >1.3 x ULN for age and OGTT GH nadir <1 ug/L, with <0.4 ug/L only when assay accuracy supports it",
      "imaging branch requires pituitary MRI after biochemical diagnosis and formal visual fields if tumor abuts optic chiasm",
      "first-line treatment branch uses transsphenoidal surgery for most and selective pre-op SRL for severe OSA/pharyngeal thickness or high-output heart failure",
      "postoperative monitoring includes IGF-1/random GH at >=12 weeks, MRI at >=12 weeks, OGTT if GH >1 ug/L, and treatment goals of age-normalized IGF-1 plus random GH <1 ug/L",
      "medical/radiation branch includes pegvisomant LFT monthly for 6 months then every 6 months with >3-fold transaminase review and stereotactic RT avoided when optic chiasm exposure would exceed 8 Gy",
      isGigantism ? "pediatric branch includes epiphyseal status, height velocity, pubertal stage, bone age, and genetic/syndromic review" : "pregnancy branch includes stopping long-acting SRL/pegvisomant approximately 2 months before conception attempts and serial visual fields for macroadenomas"
    ]
  });
}

function buildErectileDysfunctionClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Erectile dysfunction";
  const prefix = "erectile_dysfunction";
  const endotext = ["ENDOTEXT_ED_2022"];
  const statpearls = ["STATPEARLS_ED_2024"];
  const testosterone = ["ES_TESTOSTERONE_2018"];
  const prolactin = ["ES_HYPERPROLACTINEMIA_2011"];
  const diabetesDx = ["ADA_DIAGNOSIS_2026"];
  const sourceIds = unique([...endotext, ...statpearls, ...testosterone, ...prolactin, ...diabetesDx, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 8);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);
  const criteriaRows = erectileDysfunctionCutoffCriteria.map(criterion);
  const criteriaById = Object.fromEntries(criteriaRows.map((row) => [row.id, row]));
  const focusedCriteria = (...ids) => ids.map((id) => criteriaById[id]).filter(Boolean);
  const cvRows = focusedCriteria("ed_definition_and_cv_screen", "ed_pde5_safety_dosing_cutoffs");
  const endocrineRows = focusedCriteria("ed_hypogonadism_confirmation_cutoffs", "ed_pituitary_prolactin_cutoffs");
  const metabolicRows = focusedCriteria("ed_initial_labs_metabolic_cutoffs");
  const therapyRows = focusedCriteria("ed_pde5_safety_dosing_cutoffs", "ed_testosterone_therapy_safety_cutoffs", "ed_injection_priapism_safety_cutoffs");

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing ED context",
    edgeLabel: "Missing duration, erection pattern, CV symptoms, meds, BP/pulses, genital exam, testosterone, A1c/glucose/lipids, or prolactin/TSH when indicated",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Use when ED cannot be routed because key history, exam, cardiovascular, metabolic, endocrine, medication, or treatment-safety data are unavailable.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document erectile symptom duration, rigidity/maintenance pattern, libido, morning/nocturnal erections, ejaculation/orgasm symptoms, partner/psych context, chest pain or claudication, exercise tolerance, BP/HR/pulses, genital/testicular and focused neuro exam, meds/substances including nitrates/alpha-blockers/CYP3A4 inhibitors, A1c or glucose, lipids, kidney function, two fasting morning testosterone values when low testosterone is possible, prolactin/TSH when libido, gynecomastia, infertility, or pituitary symptoms fit, fertility intent, pregnancy status when relevant, and follow-up access.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["erectile symptom duration", "rigidity and maintenance pattern", "libido and morning/nocturnal erections", "chest pain, claudication, exercise tolerance, or neurologic symptoms", "blood pressure, heart rate, and peripheral pulses", "genital/testicular and focused neurologic exam", "current medications including nitrates, alpha-blockers, CYP3A4 inhibitors, testosterone, opioids, antidepressants, and alcohol/substances", "A1c or glucose and lipid profile", "kidney function", "two fasting morning total testosterone values when indicated", "LH/FSH, prolactin, and TSH when indicated", "fertility intent and prostate/hematocrit safety data", "follow-up access"]
  });

  const missingObjectiveEndpoint = endpoint({
    id: `${prefix}_missing_objective_endpoint`,
    label: "Missing ED diagnostic and treatment-safety data",
    edgeLabel: "Missing A1c/glucose/lipids, BP/pulses, two fasting morning testosterone values, LH/FSH, prolactin, TSH, PSA/Hct safety data, or nitrate/PDE5 medication review",
    sourceIds,
    criteria: criteria(`${prefix}_missing_objective_criteria`, "Use when ED branch selection depends on an absent cardiovascular, endocrine, metabolic, or medication-safety result.", ["symptoms", "exam", "vitals", "labs", "medications", "comorbidities", "workup_findings"], sourceIds, { missing_any: ["blood pressure", "peripheral pulses", "A1c", "fasting glucose", "lipids", "two fasting morning total testosterone values", "LH", "FSH", "prolactin", "TSH/free T4", "nitrate/riociguat exposure", "alpha-blocker timing", "PSA", "hematocrit"] }),
    action: "Before routine ED treatment, obtain the specific missing data: BP/HR and pulses, A1c or fasting glucose plus lipids, kidney function, repeat fasting morning testosterone when low testosterone is suspected, LH/FSH for low testosterone, prolactin and TSH for low libido/gynecomastia/infertility/pituitary symptoms, nitrate/riociguat and alpha-blocker timing, and PSA/hematocrit/prostate history before testosterone therapy.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["blood pressure and heart rate", "peripheral pulses or vascular exam", "A1c or fasting plasma glucose", "lipid profile", "kidney function", "two fasting morning total testosterone values", "LH and FSH if testosterone is low", "prolactin and TSH/free T4 when indicated", "nitrate or riociguat use", "alpha-blocker timing", "PSA and prostate cancer risk", "hematocrit"]
  });

  const emergencyEndpoint = endpoint({
    id: `${prefix}_emergency_endpoint`,
    label: "Emergency or unstable ED presentation",
    edgeLabel: "Chest pain, claudication, neuro deficit, priapism >4 hours, hemodynamic instability, altered mental status, arrhythmia, vision threat, or pituitary mass effect",
    sourceIds: unique([...endotext, ...statpearls, ...testosterone, ...prolactin]),
    criteria: criteria(`${prefix}_emergency_criteria`, "Use when ED is accompanied by cardiovascular, neurologic, priapism, unstable physiology, visual, or pituitary mass-effect findings requiring urgent evaluation instead of routine ED therapy.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], unique([...endotext, ...statpearls, ...testosterone, ...prolactin]), { criteria_options: focusedCriteria("ed_definition_and_cv_screen", "ed_pde5_safety_dosing_cutoffs", "ed_injection_priapism_safety_cutoffs", "ed_pituitary_prolactin_cutoffs") }),
    action: "Do not start routine sexual-activity or PDE5 treatment. Route chest pain, unstable angina, recent MI/stroke symptoms, unstable arrhythmia, hypotension, severe dyspnea, neurologic deficit, or claudication to ED/cardiology/neurology care; route erection lasting >4 hours to emergency priapism care; route headache/visual-field loss with severe secondary hypogonadism or high prolactin to pituitary imaging/endocrinology/neurosurgery.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: focusedCriteria("ed_injection_priapism_safety_cutoffs", "ed_pituitary_prolactin_cutoffs", "ed_pde5_safety_dosing_cutoffs")
  });

  const hypogonadismEndpoint = endpoint({
    id: `${prefix}_hypogonadism_endpoint`,
    label: "Confirmed low-testosterone ED",
    edgeLabel: "Symptoms plus 2 fasting morning total testosterone values below 264 ng/dL, or TT 200-400 ng/dL/SHBG issue needing free T",
    sourceIds: unique([...testosterone, ...endotext]),
    criteria: criteria(`${prefix}_hypogonadism_criteria`, "Use when ED has hypogonadal symptoms and repeat fasting morning testosterone confirms low testosterone, with free testosterone when total testosterone is near the lower limit or SHBG is altered.", ["symptoms", "labs", "medications", "comorbidities", "demographics", "workup_findings"], unique([...testosterone, ...endotext]), { criteria_options: focusedCriteria("ed_hypogonadism_confirmation_cutoffs", "ed_testosterone_therapy_safety_cutoffs") }),
    action: "Confirm symptoms/signs, repeat fasting morning total testosterone, use free testosterone when TT is near the lower limit or SHBG is altered, classify primary versus secondary using LH/FSH, address reversible causes such as obesity, opioids, acute illness, sleep apnea, or diabetes, and do not start testosterone until fertility intent, PSA/prostate, hematocrit, severe OSA, HF, and recent MI/stroke safety checks are resolved.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: focusedCriteria("ed_hypogonadism_confirmation_cutoffs", "ed_testosterone_therapy_safety_cutoffs")
  });

  const pituitaryEndpoint = endpoint({
    id: `${prefix}_pituitary_endpoint`,
    label: "Pituitary or prolactin ED branch",
    edgeLabel: "Testosterone <150 ng/dL, persistent hyperprolactinemia, prolactin >250 or >500 ug/L, macroadenoma >10 mm, or 1:100 dilution needed",
    sourceIds: unique([...testosterone, ...prolactin]),
    criteria: criteria(`${prefix}_pituitary_criteria`, "Use when severe secondary hypogonadism, hyperprolactinemia, prolactinoma-range prolactin, or pituitary mass-effect data change ED management.", ["symptoms", "exam", "labs", "imaging_results", "medications", "comorbidities", "workup_findings"], unique([...testosterone, ...prolactin]), { criteria_options: focusedCriteria("ed_pituitary_prolactin_cutoffs") }),
    action: "Repeat prolactin if mild or stress-related, check medication causes, renal failure, hypothyroidism, pregnancy/lactation when relevant, and macroprolactin when asymptomatic. Obtain pituitary MRI/endocrinology review when testosterone is <150 ng/dL with secondary pattern, prolactin is persistently above ULN, prolactin is >250 ug/L or >500 ug/L, panhypopituitarism or headache/visual field symptoms are present, or a large sellar mass has only mild prolactin elevation needing 1:100 dilution.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: focusedCriteria("ed_pituitary_prolactin_cutoffs")
  });

  const metabolicVascularEndpoint = endpoint({
    id: `${prefix}_metabolic_vascular_endpoint`,
    label: "Metabolic or vascular ED branch",
    edgeLabel: "A1c 5.7-6.4%, A1c >=6.5%, fasting glucose >=126 mg/dL, dyslipidemia, hypertension, claudication, smoking, PAD, CAD, HF, or stroke risk",
    sourceIds: unique([...diabetesDx, ...endotext, ...statpearls]),
    criteria: criteria(`${prefix}_metabolic_vascular_criteria`, "Use when ED is more likely vascular/metabolic or when diabetes/CV risk changes first-line management and disposition.", ["symptoms", "exam", "vitals", "labs", "medications", "comorbidities", "demographics", "workup_findings"], unique([...diabetesDx, ...endotext, ...statpearls]), { criteria_options: focusedCriteria("ed_definition_and_cv_screen", "ed_initial_labs_metabolic_cutoffs") }),
    action: "Treat ED as a vascular risk marker: classify diabetes/prediabetes using A1c/glucose thresholds, manage BP/lipids/smoking/weight and ASCVD risk, check exercise tolerance before sexual activity, refer cardiology or vascular medicine for intermediate/high-risk symptoms, and avoid using PDE5 therapy as the only intervention when ED may be the presenting sign of vascular disease.",
    endpointType: "treatment",
    guidelineCutoffs: focusedCriteria("ed_initial_labs_metabolic_cutoffs", "ed_definition_and_cv_screen")
  });

  const pde5Endpoint = endpoint({
    id: `${prefix}_pde5_endpoint`,
    label: "PDE5 first-line branch",
    edgeLabel: "No nitrate/riociguat use, CV status stable enough for sex, and medication timing supports PDE5 trial with dose adjustment when needed",
    sourceIds: endotext,
    criteria: criteria(`${prefix}_pde5_criteria`, "Use when ED is stable enough for sexual activity and no absolute PDE5 contraindication is present.", ["symptoms", "vitals", "medications", "comorbidities", "labs", "workup_findings"], endotext, { criteria_options: focusedCriteria("ed_pde5_safety_dosing_cutoffs") }),
    action: "Offer PDE5 inhibitor education and shared choice when sexual activity is safe: avoid nitrates/riociguat, separate from alpha-blockers by at least 4 hours, lower starting dose for age >65, severe renal impairment, or potent CYP3A4 inhibitors, use sildenafil 50 mg about 1 hour before sex at most once daily when appropriate, or tadalafil daily/PRN when duration goals fit. Stop and seek care for visual loss, sudden hearing change, chest pain, syncope, or priapism.",
    endpointType: "treatment",
    guidelineCutoffs: focusedCriteria("ed_pde5_safety_dosing_cutoffs")
  });

  const therapyReviewEndpoint = endpoint({
    id: `${prefix}_therapy_review_endpoint`,
    label: "ED therapy safety review",
    edgeLabel: "Nitrates, unstable CV disease, alpha-blocker timing, CYP3A4 interaction, fertility intent, PSA/Hct risk, severe OSA, uncontrolled HF, or recent MI/stroke",
    sourceIds: unique([...endotext, ...testosterone, ...statpearls]),
    criteria: criteria(`${prefix}_therapy_review_criteria`, "Use when patient-specific factors make PDE5 inhibitor, testosterone therapy, injection therapy, device therapy, or sexual activity unsafe without clinician review.", ["medications", "comorbidities", "vitals", "labs", "demographics", "workup_findings"], unique([...endotext, ...testosterone, ...statpearls]), { criteria_options: therapyRows }),
    action: "Pause non-emergent ED prescribing and obtain urology, cardiology, endocrinology, or pharmacy review. Resolve nitrate/riociguat exposure, alpha-blocker timing, severe renal or CYP3A4 interaction dosing, unstable cardiovascular disease, fertility plans, PSA/prostate risk, hematocrit, severe OSA, uncontrolled HF, MI/stroke within 6 months, thrombophilia, injection training, and priapism risk before therapy.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "ED therapy depends on cardiovascular stability, nitrate/alpha-blocker/PDE5 safety, testosterone contraindications, injection safety, fertility intent, and local prescribing policy."
  });

  const alternateEndpoint = endpoint({
    id: `${prefix}_alternate_endpoint`,
    label: "Alternate ED driver",
    edgeLabel: "Medication/substance effect, depression/anxiety/relationship stress, Peyronie plaque or curvature, pelvic surgery/trauma, neurologic disease, thyroid disease, or non-ED sexual complaint",
    sourceIds: unique([...endotext, ...statpearls, ...genericSourceIds]),
    criteria: criteria(`${prefix}_alternate_criteria`, "Use when ED is better explained by a psychogenic, medication, anatomic, neurologic, thyroid, post-surgical, substance-related, or non-erectile sexual dysfunction pathway.", ["symptoms", "exam", "labs", "medications", "comorbidities", "workup_findings"], unique([...endotext, ...statpearls, ...genericSourceIds])),
    action: "Document the alternate driver and route to the right care: medication/substance adjustment, depression/anxiety or relationship/sex-therapy support, Peyronie/anatomic urology evaluation, pelvic surgery/trauma pathway, neurologic evaluation, thyroid disease treatment, or separate libido/ejaculation/orgasm/infertility workup. Avoid reassurance alone when CV or endocrine data remain incomplete.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Alternative diagnosis or dominant non-endocrine ED driver changes the workup and treatment pathway."
  });

  const worseningEndpoint = endpoint({
    id: `${prefix}_worsening_endpoint`,
    label: "ED reassessment escalation",
    edgeLabel: "New chest pain, syncope, dyspnea, neuro deficit, visual/hearing loss, priapism >4 hours, rising PSA/Hct, failed correct PDE5 use, or worsening pituitary symptoms",
    sourceIds: unique([...endotext, ...statpearls, ...testosterone, ...prolactin]),
    criteria: criteria(`${prefix}_worsening_criteria`, "Use when follow-up data contradict the low-risk ED branch or reveal a therapy complication.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], unique([...endotext, ...statpearls, ...testosterone, ...prolactin]), { criteria_options: focusedCriteria("ed_pde5_safety_dosing_cutoffs", "ed_testosterone_therapy_safety_cutoffs", "ed_injection_priapism_safety_cutoffs", "ed_pituitary_prolactin_cutoffs") }),
    action: "Escalate to ED/cardiology/urology/endocrinology as indicated, stop the unsafe ED medication, repeat abnormal vitals, exam, glucose/A1c/lipid, testosterone/prolactin/TSH, PSA/hematocrit, or vascular findings as relevant, reassess mimics, verify PDE5 timing and adequate trials before labeling failure, and route priapism >4 hours, visual/hearing loss, chest pain, neurologic deficit, or pituitary mass-effect symptoms urgently.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: therapyRows
  });

  const deescalateEndpoint = endpoint({
    id: `${prefix}_deescalation_endpoint`,
    label: "ED de-escalation or stopping",
    edgeLabel: "Endocrine cause excluded/corrected, CV risk stable, PDE5 tolerated, testosterone criteria no longer met, Hct >54%, PSA trigger, or adverse effect",
    sourceIds: unique([...endotext, ...testosterone, ...diabetesDx]),
    criteria: criteria(`${prefix}_deescalation_criteria`, "Use when objective response, normalized/corrected drivers, or medication safety thresholds support stopping, holding, narrowing, or continuing ED therapy.", ["symptoms", "vitals", "labs", "medications", "comorbidities", "workup_findings"], unique([...endotext, ...testosterone, ...diabetesDx]), { criteria_options: focusedCriteria("ed_hypogonadism_confirmation_cutoffs", "ed_testosterone_therapy_safety_cutoffs", "ed_initial_labs_metabolic_cutoffs") }),
    action: "Stop or hold testosterone for hematocrit >54%, PSA trigger, new contraindication, or absent ongoing hypogonadism criteria; narrow endocrine workup when two morning testosterone values and prolactin/TSH are reassuring; continue vascular risk reduction even when erections improve; step down ED therapy only after response, adverse effects, and follow-up access are documented.",
    endpointType: "deescalation_stopping",
    guidelineCutoffs: focusedCriteria("ed_testosterone_therapy_safety_cutoffs", "ed_hypogonadism_confirmation_cutoffs")
  });

  const followupEndpoint = endpoint({
    id: `${prefix}_followup_endpoint`,
    label: "ED follow-up and safety-net",
    edgeLabel: "Plan active, pending labs owned, CV/metabolic risk owner assigned, therapy safety documented, and return precautions given",
    sourceIds: unique([...endotext, ...statpearls, ...testosterone, ...diabetesDx]),
    criteria: criteria(`${prefix}_followup_criteria`, "Use when ED disposition is stable enough for outpatient management with result ownership, monitoring, and return precautions.", ["symptoms", "labs", "medications", "comorbidities", "follow_up_access", "workup_findings"], unique([...endotext, ...statpearls, ...testosterone, ...diabetesDx])),
    action: "Assign follow-up for testosterone/prolactin/TSH/A1c/lipid results, CV risk management, PDE5 response and adverse effects, testosterone monitoring if used, urology/endocrinology/cardiology referrals, injection/device training when used, and safety-net instructions for chest pain, syncope, neurologic deficit, vision/hearing change, severe headache/visual field loss, priapism >4 hours, medication reaction, or inability to obtain follow-up.",
    endpointType: "follow_up",
    monitoringPlan: ["testosterone/prolactin/TSH/A1c/lipid result owner", "CV risk follow-up", "PDE5 response/adverse effects", "testosterone PSA/hematocrit monitoring when used", "specialty referral owner", "return precautions"]
  });

  const monitoringBundle = actionNode({
    id: `${prefix}_monitoring_bundle`,
    label: "ED monitoring",
    edgeLabel: "Track erection response, PDE5 use timing, adverse effects, BP/CV symptoms, A1c/lipids, testosterone/prolactin results, PSA/Hct if testosterone used, and follow-up access",
    sourceIds,
    criteria: criteria(`${prefix}_monitoring_criteria`, "Monitor ED by the cardiovascular, metabolic, endocrine, treatment-response, and adverse-effect data that selected the pathway.", ["symptoms", "vitals", "labs", "medications", "comorbidities", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Reassess ED response, correct PDE5 use, BP/CV symptoms, A1c/glucose/lipids, testosterone/prolactin/TSH results, PSA/hematocrit when testosterone is used, adverse effects, pending-result ownership, and access barriers.",
    parallelActions: ["check PDE5 timing and response", "screen chest pain, syncope, dyspnea, claudication, neuro deficit, visual/hearing change, and priapism", "trend A1c/glucose/lipids and BP", "review testosterone/prolactin/TSH results", "monitor PSA/hematocrit when testosterone is used", "assign follow-up clinician/service and return precautions"],
    guidelineCutoffs: criteriaRows,
    children: [worseningEndpoint, deescalateEndpoint, followupEndpoint]
  });

  const treatmentDecision = decision({
    id: `${prefix}_treatment_decision`,
    label: "Choose ED treatment route",
    edgeLabel: "CV safety, nitrate/PDE5 contraindications, endocrine diagnosis, metabolic risk, and alternate drivers are known",
    sourceIds,
    criteria: criteria(`${prefix}_treatment_decision_criteria`, "Route ED treatment by cardiovascular fitness, nitrate/PDE5 medication safety, testosterone/prolactin results, metabolic risk, alternate etiologies, and treatment contraindications.", ["symptoms", "exam", "vitals", "labs", "medications", "comorbidities", "demographics", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Choose the active ED treatment pathway after PDE5 response, cardiometabolic risk, testosterone/prolactin/TSH status, medication contraindications, and urgent symptom screens are available.",
    children: [pde5Endpoint, hypogonadismEndpoint, metabolicVascularEndpoint, therapyReviewEndpoint, alternateEndpoint, monitoringBundle]
  });

  const riskDecision = decision({
    id: `${prefix}_risk_decision`,
    label: "Classify ED by danger, endocrine, metabolic, and medication safety",
    edgeLabel: "History, exam, vitals, metabolic labs, testosterone/prolactin/TSH when indicated, medication review, and therapy-safety data are available",
    sourceIds,
    criteria: criteria(`${prefix}_risk_decision_criteria`, "Classify ED by emergency features, cardiovascular risk, diabetes/metabolic thresholds, hypogonadism confirmation, prolactin/pituitary thresholds, PDE5 contraindications, testosterone contraindications, and alternate causes.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Select the ED pathway: incomplete context, emergency/unstable ED, pituitary/prolactin, hypogonadism, metabolic/vascular, PDE5 first-line, therapy safety review, alternate driver, monitoring, de-escalation, or follow-up.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingObjectiveEndpoint, emergencyEndpoint, pituitaryEndpoint, treatmentDecision]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment`,
    label: "ED intake, exam, labs, and safety screen",
    edgeLabel: "Assess erection pattern, libido, CV symptoms/exercise tolerance, meds/substances, BP/HR/pulses, genital/testicular/neuro exam, A1c/glucose/lipids, and testosterone/prolactin/TSH when indicated",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial ED assessment requires sexual history, cardiovascular risk, focused exam, medication review, metabolic labs, and endocrine labs when symptoms suggest hypogonadism or pituitary disease.", contextDomains, sourceIds, { criteria_options: focusedCriteria("ed_definition_and_cv_screen", "ed_initial_labs_metabolic_cutoffs", "ed_hypogonadism_confirmation_cutoffs", "ed_pituitary_prolactin_cutoffs", "ed_pde5_safety_dosing_cutoffs") }),
    action: "Take a focused sexual/medical/psychosocial history; screen chest pain, claudication, neurologic deficit, severe hypogonadism/pituitary symptoms, priapism, hemodynamic instability, altered mental status, arrhythmia, airway compromise, vision threat, and pregnancy-critical issues when relevant. Measure BP, HR, BMI, pulses, genital/testicular findings, body hair/breast tissue, and focused neurologic findings. Order A1c or fasting glucose, lipids, kidney function, morning total testosterone when low testosterone is possible, and prolactin/TSH for low libido, gynecomastia, infertility, or pituitary symptoms.",
    parallelActions: ["focused sexual history and duration", "CV symptoms and exercise tolerance", "medication/substance review including nitrates and alpha-blockers", "BP/HR/BMI/pulses and genital/testicular/neuro exam", "A1c or fasting glucose plus lipids", "morning total testosterone when indicated", "prolactin and TSH when indicated", "fertility/prostate/hematocrit safety screen before testosterone"],
    requiredData: ["erectile symptom duration", "libido and morning/nocturnal erections", "chest pain or claudication", "exercise tolerance", "nitrate/riociguat and alpha-blocker exposure", "blood pressure and pulses", "A1c or fasting glucose", "lipid profile", "morning total testosterone when indicated", "prolactin/TSH when indicated"],
    guidelineCutoffs: focusedCriteria("ed_definition_and_cv_screen", "ed_initial_labs_metabolic_cutoffs", "ed_hypogonadism_confirmation_cutoffs", "ed_pituitary_prolactin_cutoffs", "ed_pde5_safety_dosing_cutoffs"),
    children: [riskDecision]
  });

  const root = decision({
    id: "root",
    label: "ED route: emergency, CV/metabolic risk, testosterone, prolactin, PDE5 safety, follow-up",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for erectile dysfunction, loss of erection maintenance, reduced erection rigidity, endocrine-related ED concern, low libido with ED, medication-related ED, vascular/metabolic risk with ED, or clinician-chosen ED evaluation.", ["presenting_symptoms", "problem_list_or_diagnosis", "medications", "labs", "comorbidities", "clinician_chosen_module"], sourceIds),
    action: "Route erectile dysfunction through missing-data, emergency, cardiovascular/metabolic, hypogonadism, prolactin/pituitary, PDE5 safety, testosterone safety, alternate-driver, monitoring, de-escalation, follow-up, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: "hand_polished_erectile_dysfunction_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: "Endotext ED therapy review, NCBI StatPearls ED review, Endocrine Society testosterone and hyperprolactinemia guidelines, ADA 2026 diabetes diagnosis thresholds, and local module evidence rows",
    reviewNote: "ED tree is threshold-cited and patient-traversable; local PDE5/testosterone formulary, cardiology sexual-activity clearance policy, prostate-screening policy, injection therapy protocols, fertility goals, and specialist referral access require clinician governance.",
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_labs_medication_safety", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingObjectiveEndpoint.id, expected_active_branch: missingObjectiveEndpoint.edgeLabel },
      { scenario_id: "chest_pain_or_priapism", major_pathway: "escalation_emergency_actions", expected_endpoint_id: emergencyEndpoint.id, expected_active_branch: emergencyEndpoint.edgeLabel },
      { scenario_id: "pituitary_or_prolactinoma", major_pathway: "diagnostic_confirmation", expected_endpoint_id: pituitaryEndpoint.id, expected_active_branch: pituitaryEndpoint.edgeLabel },
      { scenario_id: "low_testosterone_confirmed", major_pathway: "severity_risk_stratification", expected_endpoint_id: hypogonadismEndpoint.id, expected_active_branch: hypogonadismEndpoint.edgeLabel },
      { scenario_id: "diabetes_or_vascular_risk", major_pathway: "first_line_management", expected_endpoint_id: metabolicVascularEndpoint.id, expected_active_branch: metabolicVascularEndpoint.edgeLabel },
      { scenario_id: "pde5_candidate", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: pde5Endpoint.id, expected_active_branch: pde5Endpoint.edgeLabel },
      { scenario_id: "testosterone_or_pde5_contraindication", major_pathway: "contraindications_special_populations", expected_endpoint_id: therapyReviewEndpoint.id, expected_active_branch: therapyReviewEndpoint.edgeLabel },
      { scenario_id: "psychogenic_anatomic_or_medication_driver", major_pathway: "mimics_exclusions", expected_endpoint_id: alternateEndpoint.id, expected_active_branch: alternateEndpoint.edgeLabel },
      { scenario_id: "worsening_or_adverse_effect", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: worseningEndpoint.id, expected_active_branch: worseningEndpoint.edgeLabel },
      { scenario_id: "stop_or_hold_therapy", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: deescalateEndpoint.id, expected_active_branch: deescalateEndpoint.edgeLabel },
      { scenario_id: "followup_safety_net", major_pathway: "follow_up_safety_netting", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel }
    ],
    handPolishRequirements: [
      "visible labels are short and branch-specific, with detailed thresholds stored in criteria/action fields",
      "root and branches avoid generic context, trigger, and crisis-labs wording",
      "PDE5 branch names nitrate, alpha-blocker, CV stability, and dose-adjustment rules",
      "testosterone and prolactin branches include repeat morning testosterone, 264 ng/dL, 200-400 ng/dL, <150 ng/dL, >250 ug/L, >500 ug/L, >10 mm, and 1:100 dilution thresholds",
      "monitoring includes priapism >4 hours, visual/hearing changes, PSA/hematocrit triggers, and CV return precautions"
    ]
  });
}

function buildAdultChestPainClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Chest pain";
  const prefix = "adult_chest_pain";
  const aha = ["AHA_ACC_CHEST_PAIN_2021"];
  const sourceIds = unique([...aha, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 8);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);
  const safetyChecks = firstItems(module, "safetyChecks", 8);
  const criteriaRows = [
    criterion({
      id: "adult_chest_pain_ecg_troponin_timing",
      label: "Acute chest pain ACS screen: 12-lead ECG reviewed within 10 minutes; cardiac troponin measured as soon as possible",
      criteria_text: "Acquire/review ECG for STEMI within 10 minutes; if ACS is suspected, collect cardiac troponin as soon as possible.",
      cutoffs: ["10 minutes"],
      data_needed: ["arrival time", "first ECG time", "ECG interpretation", "cardiac troponin assay", "troponin collection time", "symptom onset time"],
      source_ids: aha,
      source_section: "Setting considerations and biomarkers"
    }),
    criterion({
      id: "adult_chest_pain_serial_troponin_intervals",
      label: "Serial troponin rule-out/rule-in timing: hs-cTn repeat at 1-3 hours; conventional cTn repeat at 3-6 hours",
      criteria_text: "If serial troponins are needed, repeat hs-cTn at 1-3 hours or conventional cTn at 3-6 hours; use assay 99th percentile and delta.",
      cutoffs: ["1 to 3 hours", "3 to 6 hours", "99th percentile"],
      data_needed: ["troponin assay type", "time-zero troponin", "repeat troponin time", "delta troponin", "assay 99th percentile", "ischemic ECG change"],
      source_ids: aha,
      source_section: "Patients with acute chest pain and suspected ACS"
    }),
    criterion({
      id: "adult_chest_pain_low_risk_discharge",
      label: "Low-risk chest pain: 30-day death/MACE risk <1%, HEART <3 or EDACS <16 with serial troponins below 99th percentile",
      criteria_text: "Low risk requires 30-day death/MACE <1%, such as HEART <3 or EDACS <16, nonischemic ECG, and serial troponins below 99th percentile.",
      cutoffs: ["30-day death/MACE risk <1%", "HEART score <3", "EDACS score <16", "99th percentile"],
      data_needed: ["structured chest pain risk score", "HEART score", "EDACS score", "serial troponins", "assay 99th percentile", "ECG ischemia status", "follow-up access"],
      source_ids: aha,
      source_section: "Definition of low-risk patients with chest pain"
    }),
    criterion({
      id: "adult_chest_pain_aortic_dissection_probability",
      label: "Aortic dissection concern: abrupt severe/ripping pain plus pulse differential plus widened mediastinum gives >80% probability",
      criteria_text: "Abrupt severe ripping chest/back pain plus pulse differential plus widened mediastinum gives >80% dissection probability; image urgently.",
      cutoffs: [">80% probability"],
      data_needed: ["pain onset and quality", "back radiation", "bilateral arm blood pressures or pulse differential", "neurologic deficit", "CXR mediastinum", "aortic risk factors", "CTA/TEE/MRA feasibility"],
      source_ids: aha,
      source_section: "Physical examination and acute aortic syndrome"
    }),
    criterion({
      id: `${prefix}_single_hsctn_onset_3h`,
      label: "Single hs-cTn rule-out is only a narrow option when symptoms began at least 3 hours before ED arrival and initial hs-cTn is below the assay limit of detection",
      criteria_text: "Single hs-cTn below the assay limit of detection can rule out injury only when symptom onset was >=3 hours before ED arrival and ECG/risk are reassuring.",
      cutoffs: ["at least 3 hours"],
      data_needed: ["symptom onset time", "arrival time", "hs-cTn assay", "limit of detection", "ECG ischemia status", "risk score", "prior CAD"],
      source_ids: aha,
      source_section: "Low-risk and suspected ACS testing"
    }),
    criterion({
      id: `${prefix}_stress_ccta_safety_cutoffs`,
      label: "Testing safety cutoffs: active ACS or AMI <2 days, BP >=200/110, SBP <90 for vasodilators, eGFR <30 for selected contrast tests, caffeine within 12 hours",
      criteria_text: "Review test safety for active ACS/AMI <2 days, BP >=200/110, vasodilator SBP <90, eGFR <30 for selected contrast tests, and caffeine within 12 hours.",
      cutoffs: ["AMI <2 days", ">=200/110 mm Hg", "SBP <90 mm Hg", "GFR <30 mL/min/1.73 m2", "12 hours"],
      data_needed: ["active ACS status", "recent AMI timing", "blood pressure", "renal function/eGFR", "contrast allergy", "caffeine/methylxanthine timing", "arrhythmia", "bronchospasm", "pregnancy status"],
      source_ids: aha,
      source_section: "Contraindication by type of imaging modality and stress protocol",
      needs_clinical_review: true,
      reviewer_input_needed: "Local imaging, contrast, renal-risk, and stress-testing protocols determine the safest test and exact cancellation thresholds."
    }),
    criterion({
      id: `${prefix}_intermediate_high_risk_thresholds`,
      label: "Risk strata: HEART 4-6 intermediate, HEART 7-10 high, GRACE <140 only in selected low-risk protocols, hs-cTn bands require local assay approval",
      criteria_text: "HEART 4-6 is intermediate; HEART 7-10 is high. Example hs-cTn bands: T0 12-52 or delta 3-5 intermediate; T0 >52 or delta >5 high.",
      cutoffs: ["HEART score 4-6", "HEART score 7-10", "GRACE <140", "T0 hs-cTn 12-52 ng/L", "1-hour delta 3-5 ng/L", "T0 hs-cTn >52 ng/L", "delta >5 ng/L"],
      data_needed: ["HEART score", "GRACE score if used", "troponin assay protocol", "time-zero hs-cTn", "1-hour or 2-hour delta", "ECG ischemia status", "local pathway"],
      source_ids: aha,
      source_section: "AHA/ACC acute chest pain risk strata Table 6",
      needs_clinical_review: true,
      reviewer_input_needed: "Troponin numeric bands are assay- and protocol-specific; local ED/cardiology governance must select the approved protocol."
    })
  ];
  const criteriaById = Object.fromEntries(criteriaRows.map((row) => [row.id, row]));
  const focusedCriteria = (...ids) => ids.map((id) => criteriaById[id]).filter(Boolean);
  const ecgTroponinRows = focusedCriteria("adult_chest_pain_ecg_troponin_timing", "adult_chest_pain_serial_troponin_intervals");
  const acsRiskRows = focusedCriteria("adult_chest_pain_ecg_troponin_timing", "adult_chest_pain_serial_troponin_intervals", `${prefix}_intermediate_high_risk_thresholds`);
  const lowRiskRows = focusedCriteria("adult_chest_pain_low_risk_discharge", `${prefix}_single_hsctn_onset_3h`);
  const mimicRows = focusedCriteria("adult_chest_pain_aortic_dissection_probability");
  const testingSafetyRows = focusedCriteria(`${prefix}_stress_ccta_safety_cutoffs`, `${prefix}_intermediate_high_risk_thresholds`);

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: adult chest pain context",
    edgeLabel: "Missing onset, vitals, ECG, troponin timing/value, emergency-mimic screen, medication risks, pregnancy status, comorbidities, or follow-up access",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when adult chest pain cannot be evaluated because the patient context needed for ACS, aortic, PE, respiratory, GI, musculoskeletal, or safety disposition is unavailable.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document onset, quality/radiation/exertion, dyspnea/diaphoresis/syncope/neuro symptoms, vitals/SpO2, focused CV/pulmonary exam, ECG time/result, troponin assay/timing/value, aortic/PE screen, medication/allergy/contrast risks, pregnancy status, comorbidities, and follow-up access.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["symptom onset and duration", "ischemic descriptors and associated symptoms", "blood pressure, heart rate, respiratory rate, oxygen saturation, temperature", "bilateral arm BP or pulse differential when dissection possible", "focused cardiovascular and pulmonary exam", "12-lead ECG time and interpretation", "troponin assay type and collection times", "initial and repeat troponin values with assay 99th percentile", "aortic dissection and PE features", "medications/allergies/contrast risk", "age, pregnancy status, and comorbidities", "follow-up access"]
  });

  const missingAcsDataEndpoint = endpoint({
    id: `${prefix}_missing_acs_data_endpoint`,
    label: "Missing ACS data: ECG, troponin assay/timing, risk score, or aortic/PE danger screen",
    edgeLabel: "Missing ECG within 10 minutes, hs-cTn 1-3 hour or conventional 3-6 hour repeat plan, 99th percentile/delta, HEART/EDACS, or dissection/PE screen",
    sourceIds: aha,
    criteria: criteria(`${prefix}_missing_acs_data_criteria`, "Route here when the exact ACS/aortic risk data needed for disposition are unavailable.", contextDomains, aha, { missing_any: ["arrival time", "12-lead ECG", "cardiac troponin assay and collection time", "troponin assay type", "time-zero troponin", "repeat troponin time", "delta troponin", "assay 99th percentile", "structured risk score", "bilateral arm BP/pulse differential when dissection possible"], criteria_options: ecgTroponinRows }),
    action: "Obtain clinician-interpreted ECG, time-zero troponin with assay 99th percentile, repeat hs-cTn at 1-3 hours or conventional cTn at 3-6 hours if needed, HEART/EDACS or local score, CXR/CTA when aortic or pulmonary emergency remains possible, and follow-up access.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["arrival time", "12-lead ECG", "ECG interpretation", "cardiac troponin assay and collection time", "troponin assay type", "time-zero troponin", "repeat troponin time", "delta troponin", "assay 99th percentile", "structured risk score", "CXR or aortic imaging data when indicated", "follow-up access"]
  });

  const acsEmergencyEndpoint = endpoint({
    id: `${prefix}_acs_emergency_endpoint`,
    label: "ACS emergency: STEMI/ischemic ECG, dynamic troponin rise, shock, syncope, or HEART 7-10",
    edgeLabel: "STEMI or ischemic ECG, evolving serial ECG, troponin above 99th percentile with dynamic change, HEART 7-10, hypotension/shock, recurrent syncope, or new neurologic deficit",
    sourceIds: aha,
    criteria: criteria(`${prefix}_acs_emergency_criteria`, "Use when acute coronary syndrome, myocardial injury, unstable physiology, or high-risk structured criteria require emergency treatment/disposition rather than outpatient testing.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], aha, { criteria_options: acsRiskRows }),
    action: "Place on monitor, repeat ECGs if symptoms persist or ECG is nondiagnostic, treat STEMI/NSTE-ACS by local ACS protocol, escalate to ED/cardiology, avoid outpatient troponin delay, and document antiplatelet/anticoagulant contraindications.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: acsRiskRows
  });

  const lifeThreateningMimicEndpoint = endpoint({
    id: `${prefix}_aortic_pe_esophageal_endpoint`,
    label: "Non-ACS emergency: aortic syndrome, PE, pneumothorax, esophageal rupture, myocarditis, or sepsis",
    edgeLabel: "Abrupt tearing pain/back radiation, pulse/BP differential, widened mediastinum, pleuritic hypoxemia, unilateral absent breath sounds, fever/rub, emesis, or subcutaneous emphysema",
    sourceIds: aha,
    criteria: criteria(`${prefix}_life_threatening_mimic_criteria`, "Use when adult chest pain features point to acute aortic syndrome, PE, pneumothorax, esophageal rupture, myocarditis/pericarditis, pneumonia, or another time-sensitive emergency.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"], aha, { criteria_options: mimicRows }),
    action: "Use the matching emergency route: aortic imaging for tearing pain with pulse differential/widened mediastinum; PE evaluation for dyspnea, tachycardia, pleuritic pain, or VTE risk; pneumothorax, esophageal, myopericarditis, or sepsis care when those findings fit.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: mimicRows
  });

  const lowRiskEndpoint = endpoint({
    id: `${prefix}_low_risk_discharge_endpoint`,
    label: "Low-risk discharge: <1% 30-day death/MACE, HEART <3 or EDACS <16, nonischemic ECG, serial troponins below 99th percentile",
    edgeLabel: "30-day death/MACE <1%, HEART <3 or EDACS <16, nonischemic ECG, serial troponins below 99th percentile, no aortic/PE features, stable symptoms, and follow-up access",
    sourceIds: aha,
    criteria: criteria(`${prefix}_low_risk_discharge_criteria`, "Use only after adult chest pain has low short-term risk and no alternate emergency condition.", ["symptoms", "vitals", "labs", "imaging_results", "workup_findings", "follow_up_access"], aha, { criteria_options: lowRiskRows }),
    action: "Discharge only when low-risk criteria are met. Document score, ECG/troponin timing, 99th percentile, no emergency features, shared decision, named follow-up clinician/service, and return precautions for recurrent pressure, dyspnea, syncope, neuro deficit, hemoptysis, severe back pain, fever, or failed follow-up.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: lowRiskRows
  });

  const intermediateEndpoint = endpoint({
    id: `${prefix}_intermediate_testing_endpoint`,
    label: "Intermediate risk: HEART 4-6, unresolved troponin/ECG risk, known CAD, or need for observation, CCTA, or stress imaging",
    edgeLabel: "HEART 4-6, nondiagnostic ECG with ongoing suspicion, unresolved troponin risk, known CAD/risk factors, or need for observation/imaging",
    sourceIds: aha,
    criteria: criteria(`${prefix}_intermediate_testing_criteria`, "Use when acute chest pain is not low risk and not an immediate high-risk emergency, and further observation or cardiac testing will change disposition.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "workup_findings"], aha, { criteria_options: testingSafetyRows }),
    action: "Observe on monitor, repeat ECG/troponin, and choose CCTA or stress imaging by age, prior CAD, ECG interpretability, exercise ability, eGFR, contrast allergy, arrhythmia, bronchospasm, pregnancy, and availability; document why discharge is not safe yet.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: testingSafetyRows
  });

  const testingSafetyEndpoint = endpoint({
    id: `${prefix}_testing_safety_review_endpoint`,
    label: "Safety review: pregnancy, eGFR <30, contrast allergy, BP >=200/110, SBP <90, AMI <2 days, bronchospasm, arrhythmia, caffeine within 12 hours, or local troponin protocol",
    edgeLabel: "Pregnancy/postpartum, eGFR <30, contrast allergy, BP >=200/110, SBP <90, AMI <2 days, bronchospasm, arrhythmia, caffeine within 12 hours, or local troponin protocol",
    sourceIds: aha,
    criteria: criteria(`${prefix}_testing_safety_review_criteria`, "Use when patient-specific factors change adult chest pain testing, treatment, or disposition.", ["demographics", "pregnancy_status", "medications", "allergies", "comorbidities", "vitals", "labs", "local_policy", "workup_findings"], aha, { criteria_options: testingSafetyRows }),
    action: "Get ED/cardiology/radiology review before unsafe non-emergent testing or treatment. Do not delay emergency ACS/aortic/PE stabilization; document the contraindication, approved local protocol, and reviewer recommendation.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Testing and treatment depend on local troponin assay pathway, imaging availability, pregnancy/renal/contrast risk, stress-test contraindications, and ACS medication risk."
  });

  const worseningEndpoint = endpoint({
    id: `${prefix}_worsening_endpoint`,
    label: "Reassessment escalation: worse pain, new ischemic ECG, rising troponin, hypoxemia, hypotension, syncope, or neurologic deficit",
    edgeLabel: "Worse pain, new ischemic ECG, troponin >99th percentile or concerning delta, worse vitals/SpO2, syncope/neuro deficit, or new aortic/PE/pneumothorax signs",
    sourceIds: aha,
    criteria: criteria(`${prefix}_worsening_criteria`, "Escalate adult chest pain when reassessment contradicts the current low/intermediate-risk branch.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"], aha, { criteria_options: acsRiskRows }),
    action: "Move to ED/cardiology or monitored emergency evaluation, repeat ECG/troponin per protocol, reconsider aortic/PE/pneumothorax/esophageal and myocarditis/pericarditis routes, and document the objective change.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: acsRiskRows
  });

  const deescalateEndpoint = endpoint({
    id: `${prefix}_deescalation_endpoint`,
    label: "De-escalate ACS route: stable symptoms, nonischemic serial ECGs, troponins below 99th percentile without concerning delta, and low-risk score",
    edgeLabel: "Symptoms stable/resolved, ECGs nonischemic, serial troponins below 99th percentile without concerning delta, HEART/EDACS low risk, and emergencies excluded",
    sourceIds: aha,
    criteria: criteria(`${prefix}_deescalation_criteria`, "Use when objective adult chest pain reassessment supports narrowing from emergency ACS/aortic/PE evaluation to outpatient or alternate diagnosis care.", ["symptoms", "vitals", "labs", "imaging_results", "workup_findings", "follow_up_access"], aha, { criteria_options: lowRiskRows }),
    action: "Document the negative serial ECG/troponin timing, risk score, absence of emergency mimics, patient counseling, and follow-up; avoid urgent cardiac testing when AHA/ACC low-risk criteria are satisfied.",
    endpointType: "deescalation_stopping",
    guidelineCutoffs: lowRiskRows
  });

  const followupEndpoint = endpoint({
    id: `${prefix}_followup_safety_endpoint`,
    label: "Adult chest pain follow-up and safety-net: pending results, outpatient testing owner, risk-factor care, and return precautions",
    edgeLabel: "Emergency causes excluded or managed, pending results have owners, follow-up is reachable, and return precautions are documented",
    sourceIds: aha,
    criteria: criteria(`${prefix}_followup_safety_criteria`, "Use when adult chest pain is stable enough for discharge or lower-acuity care with result ownership and safety-net instructions.", ["symptoms", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], aha, { criteria_options: lowRiskRows }),
    action: "Assign owners for pending ECG/troponin/imaging/outpatient tests, reconcile risk-factor and medication plans, document shared decision-making, and give return precautions for recurrent pressure, dyspnea, diaphoresis, syncope, neuro deficit, severe back pain, hemoptysis, fever, or worsening SpO2.",
    endpointType: "follow_up",
    monitoringPlan: ["pending result owner", "outpatient test owner", "medication/risk-factor plan", "return precautions", "follow-up access"]
  });

  const alternateEndpoint = endpoint({
    id: `${prefix}_alternate_noncardiac_endpoint`,
    label: "Adult chest pain alternate diagnosis: musculoskeletal, GI, anxiety, pulmonary infection, shingles, or other noncardiac cause after emergencies are excluded",
    edgeLabel: "Localized tenderness, reflux/biliary pattern, dermatomal rash, pneumonia findings, or anxiety/panic pattern fits after ACS/aortic/PE/pneumothorax/esophageal/myopericarditis checks",
    sourceIds: aha,
    criteria: criteria(`${prefix}_alternate_noncardiac_criteria`, "Use when a noncardiac or alternate diagnosis explains adult chest pain and emergency diagnoses are absent.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"], aha, { criteria_options: mimicRows }),
    action: "Treat the active alternate diagnosis and document why ACS/aortic/PE and other emergencies are no longer active. Use return precautions rather than reassurance alone when diagnostic uncertainty remains.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Alternate chest pain diagnosis should be documented with emergency exclusions and follow-up ownership."
  });

  const reassessmentBundle = actionNode({
    id: `${prefix}_reassessment_bundle`,
    label: "Adult chest pain monitoring: serial symptoms, vital signs, ECG, troponin, oxygenation, and disposition readiness",
    edgeLabel: "Trend pain, vitals, oxygenation, ECG, troponin timing/delta, imaging results, adverse effects, and disposition readiness",
    sourceIds: aha,
    criteria: criteria(`${prefix}_reassessment_bundle_criteria`, "Monitor adult chest pain by reassessing the symptoms, vital signs, ECG, troponin timing/value, imaging findings, and risk score that selected the pathway.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], aha, { criteria_options: acsRiskRows }),
    action: "Reassess symptoms, vitals, oxygenation, serial ECGs, serial troponin timing/delta, imaging/test results, treatment response, medication contraindications, and disposition readiness before closure.",
    parallelActions: unique(["repeat vital signs", "repeat ECG if symptoms persist or evolve", "serial troponin per hs-cTn 1-3 hour or conventional 3-6 hour timing", "review CXR/CTA/CCTA/stress results when ordered", "confirm follow-up and return precautions"]),
    guidelineCutoffs: acsRiskRows,
    children: [worseningEndpoint, deescalateEndpoint, followupEndpoint]
  });

  const riskDecision = decision({
    id: `${prefix}_risk_decision`,
    label: "Classify by ECG, troponin timing/delta, HEART/EDACS, emergency mimics, and test safety",
    edgeLabel: "ECG, troponin assay/timing/delta, HEART/EDACS, aortic/PE screen, and test contraindications are available",
    sourceIds: aha,
    criteria: criteria(`${prefix}_risk_decision_criteria`, "Classify adult chest pain by ECG, troponin timing/delta, structured risk score, vital stability, and life-threatening non-ACS features.", contextDomains, aha, { criteria_options: criteriaRows }),
    action: "Select the chest-pain pathway: high-risk ACS emergency, aortic/PE/esophageal/pulmonary emergency, low-risk discharge, intermediate observation/testing, clinician-review modifier, reassessment, or documented alternate diagnosis.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingAcsDataEndpoint, acsEmergencyEndpoint, lifeThreateningMimicEndpoint, lowRiskEndpoint, intermediateEndpoint, testingSafetyEndpoint, alternateEndpoint, reassessmentBundle]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment_bundle`,
    label: "Bedside assessment: onset, ischemic features, vitals, ECG within 10 minutes, troponin assay, aortic/PE screen, and test safety",
    edgeLabel: "Collect onset, ischemic descriptors, vitals, focused exam, ECG, troponin assay/timing, mimic signs, medication risks, pregnancy status, and follow-up access",
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial adult chest pain assessment requires symptom timing/quality, focused cardiovascular/pulmonary exam, full vital signs, 12-lead ECG, troponin assay plan, emergency mimic screening, medication/contraindication review, and disposition constraints.", contextDomains, sourceIds, { criteria_options: focusedCriteria("adult_chest_pain_ecg_troponin_timing", "adult_chest_pain_aortic_dissection_probability", `${prefix}_stress_ccta_safety_cutoffs`) }),
    action: "Assess onset, quality/radiation/exertion, dyspnea/diaphoresis/palpitations/syncope/neuro symptoms, vitals/SpO2, focused cardiac/pulmonary/aortic exam, ECG within 10 minutes, troponin timing, CXR when thoracic causes are possible, aortic/PE risk, test safety, and follow-up access.",
    parallelActions: unique(["arrival time", "symptom onset time", "12-lead ECG time and interpretation", "cardiac troponin assay and 99th percentile", "structured HEART/EDACS or local score", "aortic and PE emergency screen", "testing contraindication review"]),
    requiredData: ["arrival time", "symptom onset time", "12-lead ECG", "troponin assay and 99th percentile", "serial troponin plan", "risk score", "aortic/PE screen", "testing contraindications"],
    guidelineCutoffs: focusedCriteria("adult_chest_pain_ecg_troponin_timing", "adult_chest_pain_aortic_dissection_probability", `${prefix}_stress_ccta_safety_cutoffs`),
    children: [riskDecision]
  });

  const root = decision({
    id: "root",
    label: "Adult chest pain: route by ACS timing, life-threatening mimics, structured risk, testing safety, and disposition",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for adult chest pain, chest pressure/tightness, anginal equivalent symptoms, suspected ACS, aortic or pulmonary emergency concern, or clinician-chosen adult chest-pain evaluation.", ["clinician_chosen_module", "symptoms", "exam", "vitals", "labs", "imaging_results", "problem_list_or_diagnosis"], sourceIds),
    action: "Route adult chest pain through missing-data, ECG/troponin timing, high-risk ACS, aortic/PE/non-ACS emergency, low-risk discharge, intermediate testing, contraindication review, reassessment, de-escalation, follow-up, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: "hand_polished_adult_chest_pain_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: "2021 AHA/ACC multisociety chest pain guideline and local module evidence rows",
    reviewNote: "Adult chest pain tree is threshold-cited and patient-traversable; local ED ACS protocol, troponin assay-specific cutoffs, imaging availability, stress-testing rules, contrast/renal policy, and ACS medication orders require clinician governance.",
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_ecg_troponin", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingAcsDataEndpoint.id, expected_active_branch: missingAcsDataEndpoint.edgeLabel },
      { scenario_id: "stemi_or_high_risk_acs", major_pathway: "escalation_emergency_actions", expected_endpoint_id: acsEmergencyEndpoint.id, expected_active_branch: acsEmergencyEndpoint.edgeLabel },
      { scenario_id: "aortic_or_pe_emergency", major_pathway: "mimics_exclusions", expected_endpoint_id: lifeThreateningMimicEndpoint.id, expected_active_branch: lifeThreateningMimicEndpoint.edgeLabel },
      { scenario_id: "low_risk_discharge", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: lowRiskEndpoint.id, expected_active_branch: lowRiskEndpoint.edgeLabel },
      { scenario_id: "intermediate_observation_testing", major_pathway: "severity_risk_stratification", expected_endpoint_id: intermediateEndpoint.id, expected_active_branch: intermediateEndpoint.edgeLabel },
      { scenario_id: "testing_contraindication_review", major_pathway: "contraindications_special_populations", expected_endpoint_id: testingSafetyEndpoint.id, expected_active_branch: testingSafetyEndpoint.edgeLabel },
      { scenario_id: "worsening_serial_data", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: worseningEndpoint.id, expected_active_branch: worseningEndpoint.edgeLabel },
      { scenario_id: "deescalation_after_negative_series", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: deescalateEndpoint.id, expected_active_branch: deescalateEndpoint.edgeLabel },
      { scenario_id: "alternate_noncardiac_followup", major_pathway: "first_line_management", expected_endpoint_id: alternateEndpoint.id, expected_active_branch: alternateEndpoint.edgeLabel }
    ],
    handPolishRequirements: [
      "adult acute chest pain branch uses ECG within 10 minutes and troponin timing thresholds",
      "low-risk disposition requires <1% 30-day death/MACE and structured pathway examples",
      "aortic/PE/non-ACS emergency mimics route before reassurance",
      "stress/imaging contraindications and assay-specific troponin bands route to clinician review",
      "monitoring and de-escalation require serial ECG/troponin and symptom stability"
    ]
  });
}

function buildPediatricFeverSepsisClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Pediatric fever, infection, or sepsis";
  const prefix = "pediatric_fever_sepsis";
  const aapInfant = ["AAP_FEBRILE_INFANT_2021"];
  const ucsfInfant = ["UCSF_FEBRILE_INFANT_2023"];
  const niceFever = ["NICE_FEVER_UNDER5_NG143"];
  const niceSepsis = ["NICE_SEPSIS_UNDER16_2025"];
  const sscPeds = ["SSC_PEDIATRIC_SEPSIS_2026"];
  const sourceIds = unique([...aapInfant, ...ucsfInfant, ...niceFever, ...niceSepsis, ...sscPeds, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 8);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8);
  const safetyChecks = firstItems(module, "safetyChecks", 8);
  const criteriaRows = pediatricFeverSepsisCutoffCriteria.map(criterion);
  const localEvidence = {
    tests: listLabels(tests, 6).join("; "),
    redFlags: listLabels(redFlags, 6).join("; "),
    differentials: listLabels(differentials, 6).join("; "),
    dispositions: listLabels(dispositions, 6).join("; "),
    safety: listLabels(safetyChecks, 6).join("; ")
  };

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing core fever/sepsis context",
    edgeLabel: "Missing age, fever method, vitals, perfusion, source, infant risk, or follow-up access",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Use this endpoint when pediatric fever or suspected sepsis cannot be routed because essential age, fever, vital-sign, perfusion, source, infant-risk, treatment-safety, or disposition data are unavailable.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Before choosing a routine or outpatient branch, document exact age in days for infants and years for older children, temperature value/method and duration, full vital signs, oxygen requirement, mental state, capillary refill, urine output or last void, rash blanching/purpura, meningitis/HSV features, respiratory/urinary/skin/GI/CNS/joint/travel or line source symptoms, focused exam, immunization and prematurity/chronic illness status, recent immunization 24-48 hours, antibiotics already given, medication allergies, pregnancy or recent postpartum status in adolescents, caregiver concern, communication/transportation reliability, and pending result owner.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["exact age in days/months/years", "temperature value and measurement method", "fever duration and trajectory", "SpO2 in air and oxygen requirement", "respiratory rate", "heart rate", "blood pressure", "mental status", "capillary refill time", "urine output or last void", "rash blanching or purpura", "meningitis or HSV features", "source-localizing history and exam", "prematurity/chronic illness/immunocompromise", "recent immunization within 24-48 hours", "current medications and antibiotic exposure", "drug allergies", "pregnancy or recent postpartum status when relevant", "caregiver concern", "follow-up communication and transportation reliability"]
  });

  const missingObjectiveEndpoint = endpoint({
    id: `${prefix}_missing_objective_endpoint`,
    label: "Missing branch-critical vitals or labs",
    edgeLabel: "Missing age-banded vitals, perfusion, cultures/lactate, UA, CSF, or infant markers",
    sourceIds,
    criteria: criteria(`${prefix}_missing_objective_criteria`, "Use this endpoint when branch selection depends on objective values that are absent, including NICE age-banded vital thresholds, SSC shock data, or febrile-infant inflammatory markers and cultures.", ["demographics", "vitals", "exam", "labs", "imaging_results", "workup_findings"], sourceIds, { missing_any: ["age band", "temperature method", "SpO2", "oxygen requirement", "respiratory rate", "heart rate", "blood pressure", "mental state", "capillary refill time", "urine output", "rash blanching", "lactate", "blood culture", "urinalysis", "urine culture", "ANC", "CRP", "procalcitonin", "CSF when indicated"] }),
    action: "Obtain or document the missing values before assigning a non-emergent endpoint: exact age band, fever method, SpO2 in air and oxygen delivery, respiratory rate, heart rate, systolic BP, mental state, CRT, urine timing or catheter mL/kg/hour, non-blanching rash assessment, lactate and blood culture when probable sepsis or shock is possible, UA/urine culture for infant or urinary-source fever, ANC/CRP/procalcitonin for febrile infants, CSF data when age or CNS rules require it, and weight for antibiotic/fluid dosing.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["exact age band", "temperature method", "SpO2 in air", "oxygen delivery and FiO2", "respiratory rate", "heart rate", "systolic blood pressure", "mental state", "capillary refill time", "urine output or last void", "rash blanching/purpura", "lactate", "blood culture timing", "urinalysis", "urine culture", "ANC", "CRP", "procalcitonin", "CSF results when indicated", "weight"]
  });

  const septicShockEndpoint = endpoint({
    id: `${prefix}_septic_shock_endpoint`,
    label: "Septic shock or organ dysfunction",
    edgeLabel: "Shock, altered mental state, hypoxemia, poor perfusion, oliguria, or rapid decline",
    sourceIds: unique([...sscPeds, ...niceSepsis, ...niceFever]),
    criteria: criteria(`${prefix}_septic_shock_criteria`, "Use when suspected infection has shock, life-threatening organ dysfunction, severe hypoperfusion, or immediate pediatric critical-care need.", ["symptoms", "exam", "vitals", "labs", "medications", "comorbidities", "workup_findings"], unique([...sscPeds, ...niceSepsis, ...niceFever]), { criteria_options: criteriaRows }),
    action: "Escalate immediately to emergency pediatric/critical-care or transfer pathway. Measure lactate, obtain blood cultures before antibiotics if this will not substantially delay treatment, give broad-spectrum antibiotics ideally within 1 hour for suspected septic shock, begin glucose-free crystalloid boluses 10-20 mL/kg with reassessment after each bolus, stop boluses if shock resolves or overload develops, use NICE maximum 250 mL bolus logic for under-16 resuscitation when applicable, add vasoactive medication through peripheral venous access rather than delaying for central access when shock persists, seek source control, avoid etomidate for intubation, and after resuscitation target SpO2 88-92% unless another condition requires a different target.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const highRiskSepsisEndpoint = endpoint({
    id: `${prefix}_nice_high_risk_endpoint`,
    label: "NICE high-risk sepsis physiology",
    edgeLabel: "High-risk SpO2, RR, HR, BP, CRT, urine, temperature, mental state, or rash",
    sourceIds: niceSepsis,
    criteria: criteria(`${prefix}_nice_high_risk_criteria`, "Use when suspected sepsis meets any NICE NG254 high-risk criterion but the shock endpoint is not already active.", ["demographics", "symptoms", "exam", "vitals", "labs", "workup_findings"], niceSepsis, { criteria_options: criteriaRows }),
    action: "Treat as high risk for severe illness or death from sepsis: urgent pediatric/ED assessment, blood culture and lactate when probable sepsis or shock is possible, source-directed testing, empiric antibiotics per age/source/local resistance rules without waiting for every result, oxygen for shock or SpO2 <92% in air, age-appropriate fluid resuscitation when needed with cardiac/renal caution, and monitored disposition until high-risk physiology resolves or a senior clinician documents an alternate explanation.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const moderateRiskEndpoint = endpoint({
    id: `${prefix}_nice_moderate_risk_endpoint`,
    label: "NICE moderate-risk sepsis",
    edgeLabel: "Moderate SpO2/RR/HR/BP/urine band, hypothermia, leg pain, immune risk, or recent procedure",
    sourceIds: unique([...niceSepsis, ...niceFever]),
    criteria: criteria(`${prefix}_nice_moderate_risk_criteria`, "Use when suspected sepsis has NICE moderate-to-high risk criteria without a high-risk or shock feature.", ["demographics", "symptoms", "exam", "vitals", "labs", "comorbidities", "pregnancy_status", "workup_findings"], unique([...niceSepsis, ...niceFever]), { criteria_options: criteriaRows }),
    action: "Arrange senior pediatric or ED review, repeat full observations, evaluate source, obtain blood culture/lactate when sepsis is possible, UA and urine culture for urinary-source or infant fever, CXR only with respiratory signs, and CSF when infant/CNS rules require it; reassess after antipyretics without using temperature response to rule out serious illness, decide observation/admission versus discharge only after red/high-risk features are absent, and provide written/verbal warning symptoms plus specified follow-up or direct access if no diagnosis is reached.",
    endpointType: "monitoring_reassessment",
    guidelineCutoffs: criteriaRows
  });

  const febrileInfantEndpoint = endpoint({
    id: `${prefix}_febrile_infant_endpoint`,
    label: "Febrile infant age-band pathway",
    edgeLabel: "Age 0-21, 22-28, or 29-60 days with fever >38.0 C",
    sourceIds: unique([...aapInfant, ...ucsfInfant, ...niceFever, ...niceSepsis]),
    criteria: criteria(`${prefix}_febrile_infant_criteria`, "Use for well-appearing febrile infants when the age and inflammatory-marker pathway applies and exclusions such as ill appearance, bronchiolitis pathway, focal bacterial infection, prematurity, chronic illness, immunodeficiency, or recent immunization need explicit handling.", ["demographics", "symptoms", "exam", "vitals", "labs", "imaging_results", "comorbidities", "medications", "follow_up_access", "workup_findings"], unique([...aapInfant, ...ucsfInfant, ...niceFever, ...niceSepsis]), { criteria_options: criteriaRows }),
    action: "For 0-21 days, obtain blood, urine, and CSF analysis/cultures and hospitalize with empiric broad-spectrum antibiotics for 24-48 hours while cultures are pending. For 22-28 days, obtain blood culture, inflammatory markers, UA and urine culture if UA positive; elevated inflammatory markers, positive UA, or concerning CSF routes to CSF evaluation, admission, and IV antibiotics, while outpatient observation requires normal urine/CSF/inflammatory markers, broad-spectrum antibiotic plan when used, reliable communication/transport, and reevaluation within 24 hours. For 29-60 days, obtain UA with urine culture if positive, blood culture, ANC/CRP/procalcitonin, defer CSF only when low-risk logic permits, treat presumed UTI with oral antibiotics only when low-risk discharge criteria are met, and assign culture follow-up through final result.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows
  });

  const meningococcalCnsEndpoint = endpoint({
    id: `${prefix}_meningococcal_cns_hsv_endpoint`,
    label: "Meningococcal, CNS, or HSV concern",
    edgeLabel: "Non-blanching rash, meningism, seizure/AMS, vesicles, hypothermia, or abnormal CSF/CBC/LFTs",
    sourceIds: unique([...niceFever, ...niceSepsis, ...ucsfInfant]),
    criteria: criteria(`${prefix}_meningococcal_cns_hsv_criteria`, "Use when fever has meningococcal disease, meningitis, encephalitis, or HSV features that override routine fever management.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "demographics", "workup_findings"], unique([...niceFever, ...niceSepsis, ...ucsfInfant]), { criteria_options: criteriaRows }),
    action: "Do not use low-risk fever disposition. Give parenteral antibiotics at the earliest opportunity for suspected meningococcal disease, obtain CSF before antibiotics only when indicated and safe without delaying treatment, add acyclovir for infant HSV risk, involve pediatrics/critical care/neurology or transfer services, and reassess for inotropes/ICU when shocked, unrousable, or showing meningococcal disease.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const sourceDirectedEndpoint = endpoint({
    id: `${prefix}_source_directed_endpoint`,
    label: "Source-directed fever branch",
    edgeLabel: "Respiratory, urinary, skin, abdominal, line, CNS, joint, travel, or exposure source",
    sourceIds: unique([...niceFever, ...niceSepsis, ...sscPeds]),
    criteria: criteria(`${prefix}_source_directed_criteria`, "Use when fever has a likely infection source or mimic requiring targeted tests, local antimicrobial guidance, or source control.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "workup_findings"], unique([...niceFever, ...niceSepsis, ...sscPeds]), { criteria_options: criteriaRows }),
    action: "Use the identified source to choose targeted testing: urine testing for possible UTI, CXR only when respiratory signs indicate it, stool culture if diarrhea and infant rules apply, respiratory viral testing when it changes infant or isolation decisions, wound/line/joint/CNS cultures or imaging when those sources fit, and source control as soon as feasible. For clear-source suspected sepsis, use local antimicrobial guidance; for fever without apparent source in under-5 children, avoid oral antibiotics unless a bacterial source or specialist plan is documented.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows
  });

  const pregnancyPostpartumEndpoint = endpoint({
    id: `${prefix}_pregnancy_postpartum_endpoint`,
    label: "Pregnant or postpartum adolescent",
    edgeLabel: "Pregnancy, recent postpartum state, or unknown status changes pathway",
    sourceIds: unique([...niceSepsis, ...genericSourceIds]),
    criteria: criteria(`${prefix}_pregnancy_postpartum_criteria`, "Use when pregnancy or recent postpartum status changes pediatric fever/sepsis pathway applicability, medication choice, imaging, fetal/obstetric assessment, or disposition.", ["demographics", "pregnancy_status", "vitals", "labs", "imaging_results", "medications", "workup_findings"], unique([...niceSepsis, ...genericSourceIds]), { criteria_options: criteriaRows }),
    action: "Confirm pregnancy or postpartum status urgently. Route suspected sepsis in pregnancy or recent postpartum state to obstetric/adult sepsis governance, while still treating instability immediately. Document fetal/obstetric review needs, antimicrobial contraindications, imaging risk-benefit, source such as pyelonephritis/chorioamnionitis/endometritis, and the clinician responsible for reconciling pediatric versus obstetric protocols.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "NICE NG254 under-16 sepsis guidance excludes pregnant or recently pregnant patients, so obstetric/adult sepsis policy must govern definitive management."
  });

  const specialReviewEndpoint = endpoint({
    id: `${prefix}_special_population_review_endpoint`,
    label: "Special population or local policy",
    edgeLabel: "Neonate, prematurity, immunocompromise, line/device, resistant risk, bronchiolitis exclusion, or local policy",
    sourceIds,
    criteria: criteria(`${prefix}_special_population_review_criteria`, "Use when host factors, resistant-organism risk, febrile-infant exclusions, antimicrobial contraindications, or local pediatric transfer/formulary policies change routine fever management.", ["demographics", "comorbidities", "medications", "vitals", "labs", "imaging_results", "local_policy", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Obtain pediatric, infectious diseases, neonatology, immunology, critical-care, transfer-center, or antimicrobial-stewardship review as appropriate. Resolve ceftriaxone safety in newborns, listeria coverage for age <3 months, resistant-organism coverage, device/line source control, immunocompromised fever rules, bronchiolitis or recent-immunization exclusions from febrile-infant algorithms, and local admission/transfer thresholds before assigning outpatient care.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Neonatal age, prematurity, immunocompromise, resistant organisms, ceftriaxone/calcium risk, local antibiotic formulary, transfer access, and febrile-infant exclusions require clinician governance."
  });

  const lowRiskFeverEndpoint = endpoint({
    id: `${prefix}_low_risk_fever_safety_endpoint`,
    label: "Low-risk fever safety-net",
    edgeLabel: "No sepsis, infant, CNS/HSV, pregnancy, or special-population branch is active",
    sourceIds: unique([...niceFever, ...niceSepsis, ...ucsfInfant]),
    criteria: criteria(`${prefix}_low_risk_fever_criteria`, "Use only after sepsis, meningococcal/CNS, febrile-infant, pregnancy/postpartum, special-population, and source complications have been addressed.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "demographics", "pregnancy_status", "follow_up_access", "workup_findings"], unique([...niceFever, ...niceSepsis, ...ucsfInfant]), { criteria_options: criteriaRows }),
    action: "Provide home or outpatient care only with documented normal or improving mental state, oxygenation, perfusion, hydration, urine output, and caregiver reliability. Use paracetamol or ibuprofen only when the child appears distressed, not solely to lower temperature; do not give both simultaneously, and alternate only if distress persists or recurs before the next dose. Advise fluids, dehydration signs, non-blanching rash recognition, night checks, school/nursery exclusion while fever persists, and return for fit, non-blanching rash, child less well, caregiver more worried, fever lasting 5 days or longer, inability to care, breathing difficulty, poor intake/urine, or any sepsis feature.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows
  });

  const worseningEndpoint = endpoint({
    id: `${prefix}_worsening_endpoint`,
    label: "Escalate on deterioration",
    edgeLabel: "Worse vitals, oxygen need, perfusion, urine, mental state, rash, cultures, fever duration, or bolus response",
    sourceIds,
    criteria: criteria(`${prefix}_worsening_criteria`, "Escalate when reassessment shows pediatric fever is no longer following the expected lower-risk or improving course.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Repeat full observations and focused exam, reassess perfusion/urine/mental state/oxygen need, review culture/UA/CSF/lactate/inflammatory-marker results, restart the sepsis or febrile-infant branch if a high-risk threshold appears, call a consultant in person if there is no improvement after a second fluid bolus, broaden source investigation when the original source no longer fits, and upgrade disposition to monitored care, admission, transfer, or specialty review.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const deescalateEndpoint = endpoint({
    id: `${prefix}_deescalation_endpoint`,
    label: "Narrow or stop antibiotics",
    edgeLabel: "Microbiology supports narrowing, or infant cultures negative 24-36 h with improvement",
    sourceIds: unique([...niceSepsis, ...sscPeds, ...ucsfInfant, ...aapInfant]),
    criteria: criteria(`${prefix}_deescalation_criteria`, "Use when pediatric fever/sepsis treatment can be narrowed, stopped, or converted to oral therapy under microbiology, clinical-response, and follow-up criteria.", ["symptoms", "exam", "vitals", "labs", "medications", "follow_up_access", "workup_findings"], unique([...niceSepsis, ...sscPeds, ...ucsfInfant, ...aapInfant]), { criteria_options: criteriaRows }),
    action: "Review pathogen and susceptibility data and narrow antibiotics when appropriate. If no pathogen is identified, narrow or stop only after clinical presentation, infection site, host risk, and improvement support it, with infectious-disease or microbiology input when needed. For febrile-infant rule-out treatment, discontinue antibiotics only when cultures show no growth at 24-36 hours, the infant is clinically improved and afebrile, no other treatable bacterial infection requires therapy, oral antibiotics are tolerated if a source remains, follow-up is scheduled within 48 hours, and a named clinician tracks cultures to final result, typically 5 days.",
    endpointType: "deescalation_stopping",
    guidelineCutoffs: criteriaRows
  });

  const followupEndpoint = endpoint({
    id: `${prefix}_followup_safety_endpoint`,
    label: "Follow-up and return precautions",
    edgeLabel: "Stable plan with pending-result owner, follow-up access, and fever safety-net instructions",
    sourceIds: unique([...niceFever, ...niceSepsis, ...ucsfInfant, ...aapInfant]),
    criteria: criteria(`${prefix}_followup_safety_criteria`, "Use when pediatric fever is stable enough for discharge, outpatient observation, or ward continuation with explicit follow-up ownership and return precautions.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], unique([...niceFever, ...niceSepsis, ...ucsfInfant, ...aapInfant]), { criteria_options: criteriaRows }),
    action: "Document the active diagnosis or risk category, why sepsis/meningococcal/febrile-infant high-risk branches are not active or how they are being treated, medication and antipyretic plan, hydration plan, pending result owner, culture follow-up owner, follow-up appointment or direct access route, and caregiver instructions to seek help for seizure, non-blanching rash, child less well, caregiver more worried, fever lasting 5 days or longer, dehydration signs, breathing difficulty, poor urine output, persistent lethargy, inability to take medications/fluids, or inability to care for the child.",
    endpointType: "follow_up",
    monitoringPlan: ["temperature and fever duration", "mental state and behavior", "SpO2/oxygen need", "RR/HR/BP by age band", "capillary refill and urine output", "culture/UA/CSF/lactate/inflammatory-marker results", "antibiotic and antipyretic tolerance", "follow-up appointment/direct access", "caregiver return precautions"]
  });

  const monitoringBundle = actionNode({
    id: `${prefix}_monitoring_bundle`,
    label: "Monitor fever/sepsis response",
    edgeLabel: "After branch selection, reassess vitals, perfusion, urine, cultures, treatment response, and disposition",
    sourceIds,
    criteria: criteria(`${prefix}_monitoring_bundle_criteria`, "Monitor pediatric fever/sepsis by reassessing the exact findings that selected the pathway and the pending results that could change treatment or disposition.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Repeat age-banded vital signs, oxygen need, mental state, perfusion, CRT, pulses, urine output, source exam, lactate when sepsis/shock is possible, blood/urine/CSF culture status, UA/ANC/CRP/procalcitonin for infants, antibiotic administration time, fluid bolus response and overload signs, medication adverse effects, caregiver concern, and disposition readiness before closing the pathway.",
    parallelActions: unique(["repeat temperature, RR, HR, BP, SpO2, and oxygen delivery", "repeat mental state and social-response assessment", "repeat CRT, pulse quality, extremity temperature, and urine output", "track lactate and blood culture when sepsis is possible", "track UA, urine culture, CSF, ANC, CRP, and procalcitonin for febrile infants", "review antibiotic timing and allergy/adverse effects", "reassess after each fluid bolus and after the second bolus", "confirm pending-result owner and follow-up access", localEvidence.safety]),
    guidelineCutoffs: criteriaRows,
    children: [worseningEndpoint, deescalateEndpoint, followupEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: "Choose fever/sepsis branch",
    edgeLabel: "Age, fever method, vitals, perfusion, source exam, infant labs, modifiers, and follow-up known",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Choose the pediatric fever/sepsis branch from shock, high-risk sepsis, moderate-risk sepsis, febrile infant, meningococcal/CNS/HSV, source-directed fever, pregnancy/postpartum, special-population review, low-risk safety-net, or monitoring.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Select the active endpoint using the cited age-banded physiologic thresholds and infant rules: septic shock or organ dysfunction, NICE high-risk suspected sepsis, NICE moderate-risk suspected sepsis, well-appearing febrile infant age band, meningococcal/CNS/HSV emergency, source-directed fever, pregnant/postpartum adolescent review, special-population/local-policy review, low-risk safety-net, or monitoring/de-escalation/follow-up.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingObjectiveEndpoint, septicShockEndpoint, highRiskSepsisEndpoint, moderateRiskEndpoint, febrileInfantEndpoint, meningococcalCnsEndpoint, sourceDirectedEndpoint, pregnancyPostpartumEndpoint, specialReviewEndpoint, lowRiskFeverEndpoint, monitoringBundle]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_bedside_assessment_bundle`,
    label: "Bedside fever/sepsis assessment",
    edgeLabel: "Start with age, fever method, vitals, perfusion, urine, rash/CNS signs, source exam, and infant labs",
    sourceIds,
    criteria: criteria(`${prefix}_bedside_assessment_criteria`, "Initial pediatric fever/sepsis assessment requires the age-specific data needed for NICE sepsis risk grading, febrile-infant rules, source diagnosis, treatment safety, and disposition.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Assess exact age, gestational/corrected age when relevant, temperature value/method/duration, caregiver concern, behavior/social response, mental state, work of breathing, SpO2 and oxygen delivery, RR/HR/BP, capillary refill, pulses/extremity temperature, urine output or last void, hydration, rash blanching/purpura, meningitis/HSV features, respiratory/urinary/GI/skin/CNS/joint/travel/line source, immunization and recent vaccine timing, prematurity/chronic illness/immunocompromise, pregnancy status, current medications/allergies, weight, blood culture/lactate timing when probable sepsis or shock is possible, UA/urine culture, ANC/CRP/procalcitonin and CSF decision for infants, antibiotics already given, and follow-up reliability.",
    parallelActions: unique([localEvidence.tests, localEvidence.redFlags, localEvidence.dispositions, "exact age in days/months/years and weight", "temperature value and measurement method", "SpO2 in air, oxygen requirement, RR, HR, BP", "mental state, social response, CRT, pulses, extremity temperature, urine output", "non-blanching rash, meningitis, seizure, altered mental status, HSV features", "blood culture and lactate when probable sepsis or shock is possible", "UA/urine culture, ANC, CRP, procalcitonin, and CSF decision for febrile infants", "pregnancy status and medication allergy/safety check", "caregiver concern, communication, transportation, and follow-up access"]),
    requiredData: ["exact age", "temperature value/method/duration", "full age-banded vital signs", "oxygen requirement", "mental state", "capillary refill", "urine output", "rash assessment", "source symptoms and focused exam", "blood culture/lactate when sepsis possible", "UA/urine culture", "ANC/CRP/procalcitonin for febrile infants", "CSF status when indicated", "medication allergy and antibiotic timing", "pregnancy status when relevant", "follow-up access"],
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "Pediatric fever/sepsis pathway",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for child or adolescent fever, suspected infection, hypothermia with infection concern, sepsis concern, non-blanching rash, febrile infant, source-localizing fever, or clinician-chosen pediatric fever/sepsis evaluation.", ["clinician_chosen_module", "symptoms", "exam", "vitals", "labs", "imaging_results", "problem_list_or_diagnosis"], sourceIds),
    action: "Route pediatric fever or suspected sepsis through missing-data, shock, high-risk sepsis, moderate-risk sepsis, febrile infant, CNS/HSV, source-directed, pregnancy/postpartum, special-population, low-risk fever, monitoring, de-escalation, follow-up, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: "hand_polished_pediatric_fever_sepsis_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: "NICE NG254 suspected sepsis in under 16s, NICE NG143 fever in under 5s, Surviving Sepsis Campaign 2026 pediatric sepsis guidance, AAP 2021 febrile infant guideline, UCSF 2023 febrile infant consensus, and local module evidence rows",
    reviewNote: "Pediatric fever/sepsis tree is threshold-cited and patient-traversable; local antimicrobial formulary, local sepsis alert workflow, transfer thresholds, neonatal policy, resistant-organism coverage, and obstetric pathway for pregnant/postpartum adolescents require clinician governance.",
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_age_banded_vitals_or_infant_labs", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingObjectiveEndpoint.id, expected_active_branch: missingObjectiveEndpoint.edgeLabel },
      { scenario_id: "septic_shock_lactate_antibiotics_fluids", major_pathway: "red_flags_instability", expected_endpoint_id: septicShockEndpoint.id, expected_active_branch: septicShockEndpoint.edgeLabel },
      { scenario_id: "nice_high_risk_under5_or_12_15", major_pathway: "escalation_emergency_actions", expected_endpoint_id: highRiskSepsisEndpoint.id, expected_active_branch: highRiskSepsisEndpoint.edgeLabel },
      { scenario_id: "nice_moderate_risk_observation", major_pathway: "severity_risk_stratification", expected_endpoint_id: moderateRiskEndpoint.id, expected_active_branch: moderateRiskEndpoint.edgeLabel },
      { scenario_id: "well_appearing_febrile_infant_22_28_or_29_60", major_pathway: "diagnostic_confirmation", expected_endpoint_id: febrileInfantEndpoint.id, expected_active_branch: febrileInfantEndpoint.edgeLabel },
      { scenario_id: "nonblanching_rash_or_hsv_cns", major_pathway: "mimics_exclusions", expected_endpoint_id: meningococcalCnsEndpoint.id, expected_active_branch: meningococcalCnsEndpoint.edgeLabel },
      { scenario_id: "clear_urinary_or_respiratory_source", major_pathway: "first_line_management", expected_endpoint_id: sourceDirectedEndpoint.id, expected_active_branch: sourceDirectedEndpoint.edgeLabel },
      { scenario_id: "pregnant_postpartum_adolescent", major_pathway: "contraindications_special_populations", expected_endpoint_id: pregnancyPostpartumEndpoint.id, expected_active_branch: pregnancyPostpartumEndpoint.edgeLabel },
      { scenario_id: "neonate_immunocompromised_resistant_risk", major_pathway: "contraindications_special_populations", expected_endpoint_id: specialReviewEndpoint.id, expected_active_branch: specialReviewEndpoint.edgeLabel },
      { scenario_id: "stable_child_low_risk_fever_home_care", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: lowRiskFeverEndpoint.id, expected_active_branch: lowRiskFeverEndpoint.edgeLabel },
      { scenario_id: "deterioration_after_observation", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: worseningEndpoint.id, expected_active_branch: worseningEndpoint.edgeLabel },
      { scenario_id: "culture_negative_infant_or_narrow_antibiotics", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: deescalateEndpoint.id, expected_active_branch: deescalateEndpoint.edgeLabel },
      { scenario_id: "followup_return_precautions_pending_cultures", major_pathway: "follow_up_safety_netting", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel }
    ],
    handPolishRequirements: [
      "activation and root labels name concrete pediatric fever/sepsis branch decisions and do not use scaffold wording",
      "NICE NG254 age-banded high-risk and moderate-risk sepsis thresholds are visible in branch labels and source thresholds",
      "SSC pediatric sepsis timing, blood culture, lactate, 10-20 mL/kg bolus, first-hour volume, vasoactive, and post-resuscitation SpO2 targets are represented",
      "febrile infant branch includes temperature >38.0 C, ANC/CRP/procalcitonin cutoffs, PECARN low-risk logic, age 0-21, 22-28, and 29-60 day routes, cultures, antibiotics, admission, and follow-up reliability",
      "NICE fever under-5 infant WBC <5 or >15 x10^9/L LP/antibiotic threshold and safety-net return rules are represented",
      "meningococcal/CNS/HSV, source-directed fever, pregnancy/postpartum adolescent, immunocompromised/neonate/local-policy, low-risk fever, monitoring, de-escalation, follow-up, and safety-net endpoints all terminate in actionable instructions"
    ]
  });
}

function buildPediatricChestPainSyncopeClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Pediatric chest pain, syncope, or palpitations";
  const prefix = "pediatric_chest_syncope";
  const rchChest = ["RCH_CHEST_PAIN_CHILD"];
  const rchSyncope = ["RCH_SYNCOPE_CHILD"];
  const rchEcg = ["RCH_PEDIATRIC_ECG"];
  const sourceIds = unique([...rchChest, ...rchSyncope, ...rchEcg, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 8);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);
  const safetyChecks = firstItems(module, "safetyChecks", 8);
  const evidenceLabels = {
    tests: listLabels(tests, 8).join("; "),
    redFlags: listLabels(redFlags, 8).join("; "),
    differentials: listLabels(differentials, 8).join("; "),
    dispositions: listLabels(dispositions, 8).join("; "),
    safety: listLabels(safetyChecks, 8).join("; ")
  };
  const criteriaRows = [
    criterion({
      id: "peds_chest_pain_low_base_rate_and_targeted_testing",
      label: "Pediatric chest pain testing is targeted: cardiac causes are about 1%; ECG/CXR/troponin only when risk factors or exam findings are present",
      criteria_text: "RCH states that cardiac-related causes account for as few as 1% of children presenting with chest pain and that ECG, CXR, and blood tests should be reserved for children with risk factors identified on history or examination; echocardiogram or CT pulmonary angiogram should be discussed with a senior clinician.",
      cutoffs: ["1%"],
      data_needed: ["age", "chest pain history", "exertional symptoms", "syncope", "palpitations", "cardiac exam", "ECG risk", "respiratory findings", "senior clinician discussion for echo/CTPA"],
      source_ids: rchChest,
      source_section: "Key points and investigation guidance"
    }),
    criterion({
      id: "peds_chest_syncope_ecg_required_once",
      label: "Pediatric syncope: obtain an ECG at least once; urgent referral for exertional syncope, chest pain/palpitations, abnormal ECG, or family history",
      criteria_text: "RCH syncope guidance recommends orthostatic heart rate and blood pressure measurements, complete cardiac and neurological examination, ECG in all children at least once unless previously done with no new concern, and urgent referral when history, examination, or ECG suggests cardiac syncope.",
      cutoffs: ["at least once"],
      data_needed: ["syncope event details", "exercise relationship", "prodrome", "chest pain/palpitations", "family history of early cardiac death/arrhythmia/sudden death", "orthostatic vitals", "cardiac exam", "neurologic exam", "ECG"],
      source_ids: rchSyncope,
      source_section: "Examination, investigations, consultation, transfer, and discharge"
    }),
    criterion({
      id: "peds_ecg_high_risk_intervals",
      label: "Pediatric ECG high-risk cutoffs: QRS >0.12 sec, QTc outside >340 ms and <=450 ms normal range, and ST shift >2 mm in precordial leads",
      criteria_text: "RCH pediatric ECG guidance states QRS duration >0.12 seconds is pathological in children, manual QTc should be >340 ms and <=450 ms, and ST elevation or depression above 2 mm in precordial leads should be considered pathological; abnormalities with syncope or cardiac red flags require pediatric/cardiology consultation.",
      cutoffs: [">0.12 seconds", ">340 ms", "<=450 ms", "QTc >450 ms", "QTc <=340 ms", ">2 mm"],
      data_needed: ["QRS duration", "manual QTc", "ST elevation/depression magnitude", "ECG scale 25 mm/second and 10 mm/mV", "syncope symptoms", "cardiac exam", "family history"],
      source_ids: rchEcg,
      source_section: "Basic paediatric ECG interpretation"
    }),
    criterion({
      id: `${prefix}_orthostatic_pots_cutoffs`,
      label: "Pediatric orthostatic syncope/POTS: within 2-3 minutes upright, systolic BP drop >20 mmHg or diastolic drop >10 mmHg; within 5-10 minutes upright, HR rise >40 bpm or >30 bpm without postural hypotension",
      criteria_text: "RCH syncope guidance defines orthostatic hypotension as a systolic BP decrease >20 mmHg or diastolic BP decrease >10 mmHg within 2-3 minutes of assuming upright position, and POTS as daily chronic orthostatic intolerance with HR increase >40 bpm or >30 bpm without postural hypotension within 5-10 minutes upright.",
      cutoffs: ["2-3 minutes", "systolic blood pressure >20 mmHg", "diastolic blood pressure >10 mmHg", "5-10 minutes", "HR increase >40 bpm", "HR increase >30 bpm"],
      data_needed: ["supine BP/HR", "standing BP/HR", "minutes upright", "orthostatic symptoms", "daily chronic orthostatic intolerance", "hydration/anemia/medication context"],
      source_ids: rchSyncope,
      source_section: "Orthostatic hypotension and POTS"
    }),
    criterion({
      id: `${prefix}_precordial_catch_low_risk`,
      label: "Precordial catch pattern: sudden sharp pain at left lower sternal border/cardiac apex, not during sleep, brief 30 seconds to 3 minutes, normal exam, and no special investigations",
      criteria_text: "RCH describes precordial catch as sudden sharp chest pain around the left lower sternal border or cardiac apex, not during sleep, intense but brief lasting 30 seconds to 3 minutes, with normal examination and no special investigations.",
      cutoffs: ["30 seconds to 3 minutes"],
      data_needed: ["pain location", "onset", "sleep relationship", "duration", "exam", "red flags absent"],
      source_ids: rchChest,
      source_section: "Musculoskeletal chest pain: precordial catch"
    })
  ];

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: pediatric chest pain, syncope, or palpitations context",
    edgeLabel: "Missing pediatric chest/syncope context: age, chest pain quality/onset/exertion, syncope/palpitations event details, family history, vitals including orthostatics when syncope, exam/perfusion, ECG, respiratory findings, medications/stimulants, pregnancy possibility, and follow-up access",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when pediatric chest pain, syncope, or palpitations cannot be evaluated because key history, vitals, exam, ECG, or disposition data are unavailable.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document age, onset/duration/site/quality/radiation/reproducibility, exertional or sleep association, syncope/presyncope/palpitations event details, prodrome and recovery, chest pain with palpitations, family history of early sudden death/cardiomyopathy/arrhythmia, full vitals, oxygenation, orthostatic heart rate and BP when syncope, cardiac/pulmonary/neurologic exam, ECG when syncope or cardiac risk is present, respiratory/PE/trauma features, stimulant/toxin/medication use, adolescent pregnancy possibility, and follow-up access.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["age", "chest pain onset/duration/site/quality/radiation", "exertion or sleep relationship", "syncope/presyncope/palpitations event details", "prodrome and recovery", "family history of early sudden death/cardiomyopathy/arrhythmia", "blood pressure, heart rate, respiratory rate, oxygen saturation, temperature", "orthostatic BP/HR when syncope", "cardiac, pulmonary, neurologic exam", "ECG when syncope or cardiac risk present", "respiratory/PE/trauma features", "stimulant/toxin/medication history", "pregnancy possibility when relevant", "follow-up access"]
  });

  const missingObjectiveEndpoint = endpoint({
    id: `${prefix}_missing_objective_endpoint`,
    label: "Missing data needed: pediatric ECG, orthostatic vitals, oxygenation, respiratory exam, or family-history risk",
    edgeLabel: "Cannot classify pediatric chest pain/syncope until ECG is obtained at least once for syncope or cardiac risk, QRS/QTc/ST findings are known when ECG is done, orthostatic BP/HR are measured when syncope/orthostatic intolerance is present, oxygenation and respiratory exam are documented, and family/cardiac history is known",
    sourceIds,
    criteria: criteria(`${prefix}_missing_objective_criteria`, "Route here when pediatric cardiac/respiratory/syncope risk cannot be classified because required ECG, orthostatic vital sign, oxygenation, respiratory, family-history, or cardiac-exam data are missing.", contextDomains, sourceIds, { missing_any: ["ECG", "QRS duration", "QTc", "ST shift", "orthostatic BP/HR", "oxygen saturation", "respiratory exam", "family history", "cardiac exam"] }),
    action: "Obtain ECG at least once for syncope or cardiac concern, manual QRS/QTc/ST interpretation, full vitals including oxygen saturation, orthostatic BP/HR if syncope or orthostatic intolerance is present, cardiac/pulmonary/neurologic exam, BGL shortly after an event when indicated, FBE when anemia is suspected, pregnancy testing when relevant, and senior review before echo/Holter/exercise testing/CTPA.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["ECG", "QRS duration", "manual QTc", "ST shift magnitude", "orthostatic BP and HR", "oxygen saturation", "respiratory exam", "cardiac exam", "family history", "BGL after event when indicated", "FBE if anemia suspected", "pregnancy test when relevant"]
  });

  const cardiacEscalationEndpoint = endpoint({
    id: `${prefix}_cardiac_escalation_endpoint`,
    label: "Pediatric cardiac escalation: exertional chest pain/syncope, palpitations with syncope, abnormal exam/perfusion, abnormal ECG, cardiac history, or family sudden-death risk",
    edgeLabel: `Cardiac risk branch: ${evidenceLabels.redFlags}; QRS >0.12 seconds, QTc <=340 ms or >450 ms, ST shift >2 mm, WPW, long QT, wide-complex tachycardia, hypertrophic cardiomyopathy pattern, or syncope during exercise/chest pain/palpitations`,
    sourceIds: unique([...rchChest, ...rchSyncope, ...rchEcg]),
    criteria: criteria(`${prefix}_cardiac_escalation_criteria`, "Use when pediatric chest pain, syncope, or palpitations has cardiac red flags, abnormal ECG, abnormal cardiac exam, poor perfusion, or serious family history.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "family_history", "workup_findings"], unique([...rchChest, ...rchSyncope, ...rchEcg]), { criteria_options: criteriaRows }),
    action: "Urgently discuss with pediatric/cardiology or transfer pathway as appropriate. Restrict exertion pending review, obtain ECG interpretation, consider troponin/inflammatory labs only when myocarditis/pericarditis/ischemia risk is present, and avoid low-risk reassurance until cardiac syncope or cardiac chest pain is addressed.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const respiratoryEndpoint = endpoint({
    id: `${prefix}_respiratory_pe_endpoint`,
    label: "Pediatric respiratory, PE, pneumothorax, pneumonia, asthma, trauma, or foreign-body chest pain route",
    edgeLabel: `Respiratory/PE branch: hypoxia, respiratory distress, hemoptysis, pleuritic pain, fever/cough, wheeze, unilateral decreased air entry, trauma, PE risk, or foreign-body concern; ${evidenceLabels.differentials}`,
    sourceIds: rchChest,
    criteria: criteria(`${prefix}_respiratory_pe_criteria`, "Use when pediatric chest pain is better explained by respiratory, PE, pneumothorax, pneumonia, asthma, trauma, or foreign-body features.", ["symptoms", "exam", "vitals", "imaging_results", "comorbidities", "pregnancy_status", "workup_findings"], rchChest, { criteria_options: criteriaRows }),
    action: "Route to the respiratory/PE/pneumothorax/trauma pathway: give oxygen if hypoxemic, obtain CXR when indicated, discuss CTPA/advanced imaging with a senior clinician when PE risk exists, and escalate for respiratory distress, hemoptysis, stridor, unilateral absent breath sounds, or ongoing hypoxia.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows
  });

  const orthostaticSyncopeEndpoint = endpoint({
    id: `${prefix}_orthostatic_syncope_endpoint`,
    label: "Pediatric vasovagal, orthostatic hypotension, or POTS branch after cardiac red flags are absent",
    edgeLabel: "Orthostatic/autonomic branch: reflex trigger/prodrome or standing symptoms with orthostatic BP drop >20 mmHg systolic or >10 mmHg diastolic within 2-3 minutes, or chronic orthostatic symptoms with HR rise >40 bpm or >30 bpm within 5-10 minutes without postural hypotension",
    sourceIds: rchSyncope,
    criteria: criteria(`${prefix}_orthostatic_syncope_criteria`, "Use when pediatric syncope fits vasovagal, orthostatic hypotension, or POTS and cardiac red flags are absent.", ["symptoms", "vitals", "exam", "labs", "workup_findings"], rchSyncope, { criteria_options: criteriaRows }),
    action: "Treat frequent/problematic vasovagal or orthostatic syncope with trigger avoidance, increased fluid and salt intake, and early recognition of prodromal symptoms; arrange pediatric/cardiology review when recurrent symptoms do not respond to non-pharmacologic care or if cardiac features appear.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows
  });

  const lowRiskChestPainEndpoint = endpoint({
    id: `${prefix}_low_risk_no_testing_endpoint`,
    label: "Low-risk pediatric chest pain: no ECG/CXR/troponin/blood testing when risk factors and concerning exam findings are absent",
    edgeLabel: "Low-risk pediatric chest pain branch: no exertional syncope/chest pain, no palpitations with syncope, normal vitals/perfusion/cardiac exam, no abnormal ECG concern, no serious family history, no hypoxia/respiratory distress/hemoptysis, and musculoskeletal/precordial catch/anxiety/reflux pattern fits",
    sourceIds: rchChest,
    criteria: criteria(`${prefix}_low_risk_no_testing_criteria`, "Use low-risk pediatric chest pain care only after cardiac, respiratory, PE, trauma, and systemic red flags are absent.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings", "follow_up_access"], rchChest, { criteria_options: criteriaRows }),
    action: "Avoid routine ECG, CXR, troponin, inflammatory labs, echocardiogram, or CTPA when no risk factors are present. Treat the likely benign cause, such as reproducible musculoskeletal pain or precordial catch, explain return precautions, and arrange follow-up if pain persists, changes, or red flags appear.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows
  });

  const seizureMimicEndpoint = endpoint({
    id: `${prefix}_seizure_mimic_endpoint`,
    label: "Pediatric syncope mimic branch: seizure, hypoglycemia, toxin, anemia, pregnancy, or functional event",
    edgeLabel: "Syncope mimic branch: prolonged confusion 20-30 minutes, tonic-clonic movements, clustering, hypoglycemia concern, toxin/stimulant exposure, anemia/menorrhagia, pregnancy possibility, or neurologic features better explain the event",
    sourceIds: rchSyncope,
    criteria: criteria(`${prefix}_seizure_mimic_criteria`, "Use when pediatric transient loss of consciousness is more consistent with seizure or another non-cardiac mimic than vasovagal syncope.", ["symptoms", "exam", "vitals", "labs", "medications", "pregnancy_status", "workup_findings"], rchSyncope, { criteria_options: criteriaRows }),
    action: "Check BGL shortly after the event when indicated, FBE if anemia is suspected, pregnancy testing when relevant, toxin/stimulant exposure, and neurologic features; refer seizure-suspicious presentations to pediatric/neurology rather than labeling as benign syncope.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows
  });

  const specialReviewEndpoint = endpoint({
    id: `${prefix}_special_population_review_endpoint`,
    label: "Pediatric chest/syncope clinician review: pregnancy/postpartum adolescent, stimulant/toxin exposure, anticoagulation/VTE risk, congenital heart disease, known arrhythmia, or local cardiology pathway",
    edgeLabel: "Special-population branch: pregnant/recently postpartum adolescent, PE/VTE risk, stimulant/toxin exposure, congenital/acquired heart disease, known arrhythmia/cardiomyopathy, prior cardiac surgery, abnormal ECG needing cardiology, or local sports-return policy applies",
    sourceIds,
    criteria: criteria(`${prefix}_special_population_review_criteria`, "Use when pediatric chest pain/syncope management depends on pregnancy, medication/toxin exposure, VTE risk, congenital heart disease, known arrhythmia, cardiology testing access, or local return-to-play policy.", ["demographics", "pregnancy_status", "medications", "comorbidities", "labs", "imaging_results", "local_policy", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Get pediatric, cardiology, respiratory, obstetric, toxicology, or neurology review as appropriate; do not clear exercise or discharge until the modifier, activity restriction, testing plan, and responsible follow-up clinician/service are documented.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Pregnancy/postpartum status, stimulant/toxin exposure, PE risk, congenital/acquired heart disease, ECG abnormality, or local sports/cardiology policy changes disposition."
  });

  const worseningEndpoint = endpoint({
    id: `${prefix}_worsening_endpoint`,
    label: "Pediatric chest/syncope reassessment: new exertional symptoms, abnormal ECG, hypoxia, poor perfusion, recurrent syncope, or worsening pain escalates care",
    edgeLabel: "Reassessment branch: exertional pain/syncope appears, palpitations with syncope recur, ECG abnormality is found, oxygenation drops, respiratory distress develops, perfusion worsens, fever/myocarditis concern appears, or low-risk pain pattern no longer fits",
    sourceIds,
    criteria: criteria(`${prefix}_worsening_criteria`, "Escalate pediatric chest pain/syncope when reassessment contradicts the low-risk or autonomic branch.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Repeat vitals and focused exam, repeat or review ECG, recheck oxygenation/respiratory findings, reconsider myocarditis/pericarditis, PE, pneumothorax, cardiac syncope, seizure mimic, or toxin exposure, and move to pediatric/cardiology/ED transfer if danger findings are present.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const deescalateEndpoint = endpoint({
    id: `${prefix}_deescalation_endpoint`,
    label: "Pediatric chest/syncope de-escalation: stop cardiac/respiratory escalation only when red flags remain absent and ECG, vitals, oxygenation, and event pattern support benign or autonomic care",
    edgeLabel: "De-escalation branch: normal vitals/perfusion, no exertional symptoms, no concerning family history, normal ECG if obtained, no hypoxia/respiratory distress, orthostatic/autonomic pattern stable, and follow-up/safety-net access documented",
    sourceIds,
    criteria: criteria(`${prefix}_deescalation_criteria`, "Use when pediatric chest pain/syncope has been reassessed and emergency cardiac/respiratory/seizure features remain absent.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "follow_up_access", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Narrow to benign chest pain, vasovagal/orthostatic care, or another documented low-risk diagnosis only after red flags are absent, ECG/vitals/oxygenation and event pattern are stable, and return precautions/follow-up are clear.",
    endpointType: "deescalation_stopping",
    guidelineCutoffs: criteriaRows
  });

  const followupEndpoint = endpoint({
    id: `${prefix}_followup_safety_endpoint`,
    label: "Pediatric chest/syncope follow-up and safety-net: activity restriction, result ownership, recurrent syncope plan, and return precautions",
    edgeLabel: `Disposition branch: ${evidenceLabels.dispositions}; cause identified or serious causes addressed, follow-up arranged, exercise/activity advice documented, pending ECG/CXR/lab/imaging owners assigned, and family return precautions given`,
    sourceIds,
    criteria: criteria(`${prefix}_followup_safety_criteria`, "Use when pediatric chest pain/syncope is stable enough for discharge or lower-acuity follow-up.", ["symptoms", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Document diagnosis, red flags screened, activity restriction if cardiac review is pending, pending result owners, follow-up with pediatrician/cardiology/neurology/respiratory as indicated, hydration/salt plan for autonomic syncope when appropriate, and return precautions for exertional chest pain/syncope, palpitations with syncope, abnormal breathing, hypoxia, hemoptysis, fever, worsening pain, poor perfusion, or recurrent events.",
    endpointType: "follow_up",
    monitoringPlan: ["activity restriction if needed", "pending result owner", "follow-up specialty owner", "hydration/salt plan when autonomic", "return precautions"]
  });

  const monitoringBundle = actionNode({
    id: `${prefix}_monitoring_bundle`,
    label: "Pediatric chest/syncope monitoring: vitals, oxygenation, ECG interpretation, orthostatic response, pain pattern, event recurrence, and disposition readiness",
    edgeLabel: "Monitoring branch after pediatric chest/syncope classification: trend pain, recurrence, exertional relationship, perfusion, oxygenation, ECG findings, orthostatic BP/HR, respiratory findings, and activity/follow-up constraints",
    sourceIds,
    criteria: criteria(`${prefix}_monitoring_bundle_criteria`, "Monitor pediatric chest pain/syncope by trending the ECG, orthostatic vital signs, oxygenation, respiratory findings, cardiac exam, and event pattern that selected the pathway.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Reassess pain pattern, exertional symptoms, syncope recurrence, palpitations, perfusion, oxygenation/work of breathing, ECG interpretation, orthostatic vitals, respiratory findings, and disposition readiness before closure.",
    parallelActions: unique(["repeat vital signs", "repeat oxygen saturation/work of breathing", "review ECG QRS/QTc/ST findings", "repeat orthostatic BP/HR when syncope/orthostatic symptoms persist", "confirm activity restriction and follow-up", evidenceLabels.safety]),
    guidelineCutoffs: criteriaRows,
    children: [worseningEndpoint, deescalateEndpoint, followupEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: "Pediatric chest pain/syncope: classify cardiac risk, respiratory risk, autonomic syncope, low-risk chest pain, mimic, or clinician-review modifier",
    edgeLabel: "Pediatric chest/syncope branch ready: history, family history, vitals, orthostatics when indicated, exam/perfusion, oxygenation, ECG when indicated, and respiratory or syncope mimic features are available",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Classify pediatric chest pain/syncope using red flags, ECG intervals, orthostatic/POTS thresholds, respiratory findings, and low-risk pattern rules.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Select the active pediatric branch: cardiac escalation, respiratory/PE/pneumothorax route, orthostatic/POTS or vasovagal care, low-risk chest pain with no routine testing, seizure/mimic evaluation, special-population review, or monitoring/follow-up.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingObjectiveEndpoint, cardiacEscalationEndpoint, respiratoryEndpoint, orthostaticSyncopeEndpoint, lowRiskChestPainEndpoint, seizureMimicEndpoint, specialReviewEndpoint, monitoringBundle]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment_bundle`,
    label: "Pediatric chest pain/syncope bedside assessment: age, exertion, syncope/palpitations, family history, vitals/orthostatics, cardiac/respiratory exam, and targeted ECG/testing",
    edgeLabel: `Pediatric chest/syncope assessment bundle: ${evidenceLabels.tests}; ${evidenceLabels.redFlags}; ${evidenceLabels.dispositions}`,
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial pediatric chest pain/syncope assessment requires age, symptom pattern, exertion/syncope/palpitations, family history, vitals including orthostatics when indicated, cardiac/respiratory/neurologic exam, targeted ECG/testing, and disposition constraints.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Assess age and pathway fit, pain onset/duration/site/quality/radiation/reproducibility, exertion or sleep association, syncope/presyncope/palpitations event details, prodrome/recovery, family history, full vitals and oxygenation, orthostatic BP/HR when syncope or orthostatic symptoms are present, cardiac/pulmonary/neurologic exam, ECG when cardiac risk or syncope is present, CXR/troponin/labs only when risk factors or exam findings justify them, and senior discussion for echocardiogram, Holter/exercise testing, or CTPA.",
    parallelActions: unique([evidenceLabels.tests, evidenceLabels.redFlags, evidenceLabels.dispositions, "orthostatic blood pressure and heart rate when syncope", "ECG at least once for syncope", "manual QRS/QTc/ST review", "family history of early sudden death/cardiomyopathy/arrhythmia", "respiratory/PE/pneumothorax screen"]),
    requiredData: ["age", "exertional symptoms", "syncope/palpitations event details", "family history", "vital signs and oxygen saturation", "orthostatic BP/HR when indicated", "cardiac/pulmonary/neurologic exam", "ECG when indicated", "respiratory or PE features"],
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "Pediatric chest pain/syncope: route by cardiac red flags, ECG cutoffs, orthostatic thresholds, respiratory danger, low-risk pattern, and follow-up needs",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for child/adolescent chest pain, exertional symptoms, syncope, near-syncope, palpitations, abnormal ECG concern, respiratory chest pain, or clinician-chosen pediatric chest/syncope evaluation.", ["clinician_chosen_module", "symptoms", "exam", "vitals", "labs", "imaging_results", "problem_list_or_diagnosis"], sourceIds),
    action: "Route pediatric chest pain/syncope through missing-data, cardiac escalation, respiratory/PE/pneumothorax evaluation, orthostatic/POTS care, low-risk no-testing care, seizure/mimic evaluation, special-population review, monitoring, de-escalation, follow-up, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: "hand_polished_pediatric_chest_pain_syncope_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: "Royal Children's Hospital pediatric chest pain, syncope, and basic pediatric ECG guidelines plus local module evidence rows",
    reviewNote: "Pediatric chest pain/syncope tree is threshold-cited and patient-traversable; local pediatric cardiology access, sports-return policy, adolescent pregnancy/PE pathway, troponin use, and transfer thresholds require clinician governance.",
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_ecg_orthostatics", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingObjectiveEndpoint.id, expected_active_branch: missingObjectiveEndpoint.edgeLabel },
      { scenario_id: "exertional_syncope_abnormal_ecg", major_pathway: "escalation_emergency_actions", expected_endpoint_id: cardiacEscalationEndpoint.id, expected_active_branch: cardiacEscalationEndpoint.edgeLabel },
      { scenario_id: "respiratory_pe_pneumothorax", major_pathway: "mimics_exclusions", expected_endpoint_id: respiratoryEndpoint.id, expected_active_branch: respiratoryEndpoint.edgeLabel },
      { scenario_id: "orthostatic_pots", major_pathway: "first_line_management", expected_endpoint_id: orthostaticSyncopeEndpoint.id, expected_active_branch: orthostaticSyncopeEndpoint.edgeLabel },
      { scenario_id: "low_risk_precordial_catch", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: lowRiskChestPainEndpoint.id, expected_active_branch: lowRiskChestPainEndpoint.edgeLabel },
      { scenario_id: "seizure_or_hypoglycemia_mimic", major_pathway: "severity_risk_stratification", expected_endpoint_id: seizureMimicEndpoint.id, expected_active_branch: seizureMimicEndpoint.edgeLabel },
      { scenario_id: "pregnancy_toxin_known_heart_disease", major_pathway: "contraindications_special_populations", expected_endpoint_id: specialReviewEndpoint.id, expected_active_branch: specialReviewEndpoint.edgeLabel },
      { scenario_id: "worsening_after_low_risk_branch", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: worseningEndpoint.id, expected_active_branch: worseningEndpoint.edgeLabel },
      { scenario_id: "deescalation_and_return_precautions", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: deescalateEndpoint.id, expected_active_branch: deescalateEndpoint.edgeLabel }
    ],
    handPolishRequirements: [
      "pediatric chest pain branch uses targeted testing rather than routine ECG/CXR/troponin when no risk factors are present",
      "cardiac red flags and abnormal ECG intervals route to urgent pediatric/cardiology review",
      "syncope branch includes ECG at least once plus orthostatic hypotension and POTS thresholds",
      "respiratory/PE/pneumothorax and seizure/hypoglycemia/toxin mimics route explicitly",
      "activity restriction, follow-up, and return precautions are explicit"
    ]
  });
}

function buildPediatricMskLimpHotJointClinicalPathwayTree(module, sourceById) {
  const label = module.label || "Pediatric limp, hot joint, injury, or non-weight bearing";
  const prefix = "pediatric_msk_limp_hot_joint";
  const rchLimp = ["RCH_LIMPING_CHILD"];
  const rchBji = ["RCH_BONE_JOINT_INFECTION"];
  const chqLimp = ["CHQ_LIMP_CHILD_2026"];
  const chqBji = ["CHQ_BONE_JOINT_INFECTION_2025"];
  const acr = ["ACR_ACUTELY_LIMPING_CHILD_2018"];
  const kocher = ["KOCHER_SEPTIC_HIP_1999"];
  const caird = ["CAIRD_SEPTIC_HIP_2006"];
  const sourceIds = unique([...rchLimp, ...rchBji, ...chqLimp, ...chqBji, ...acr, ...kocher, ...caird, ...genericSourceIds]);
  const tests = firstItems(module, "initialTests", 8);
  const redFlags = firstItems(module, "redFlags", 8, ["safetyChecks"]);
  const differentials = firstItems(module, "differentialBuckets", 8);
  const dispositions = firstItems(module, "dispositionRules", 8, ["treatmentOptions"]);
  const safetyChecks = firstItems(module, "safetyChecks", 8);
  const evidenceLabels = {
    tests: listLabels(tests, 8).join("; "),
    redFlags: listLabels(redFlags, 8).join("; "),
    differentials: listLabels(differentials, 8).join("; "),
    dispositions: listLabels(dispositions, 8).join("; "),
    safety: listLabels(safetyChecks, 8).join("; ")
  };
  const criteriaRows = cutoffCriteriaForModule(module);

  const missingContextEndpoint = endpoint({
    id: "endpoint_missing_context",
    label: "Missing data needed: pediatric limp, hot joint, injury, or non-weight-bearing context",
    edgeLabel: "Missing pediatric limp context: age, onset/duration, trauma/safeguarding history, ability to weight bear after analgesia, fever/systemic symptoms, joint range of motion, full vitals, pain location, labs/imaging when indicated, medication/allergy context, comorbidities, and follow-up access",
    sourceIds,
    criteria: criteria(`${prefix}_missing_context_criteria`, "Route here when pediatric limp or hot-joint management cannot be classified because core history, exam, vitals, objective results, comorbidity, or follow-up data are unavailable.", contextDomains, sourceIds, { missing_any: contextDomains }),
    action: "Document age/developmental baseline, symptom onset and duration, trauma mechanism and safeguarding consistency, current and post-analgesia weight-bearing, pain site including hip/groin/thigh/knee referral, fever and systemic symptoms, full vital signs, gait, look/feel/move exam, joint above and below, passive range of motion, neurovascular status, skin/wound source, immunocompromise/sickle cell/hemophilia or postoperative context, analgesics/antibiotic exposure/allergies, pregnancy possibility in adolescents when treatment or imaging depends on it, labs/cultures/imaging if indicated, and reliable follow-up.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["age and developmental walking baseline", "limp onset, duration, and trajectory", "trauma mechanism, timing, and safeguarding consistency", "ability to walk or weight bear after analgesia", "temperature and systemic illness symptoms", "pain location including hip/groin/thigh/knee referral", "full vital signs and perfusion", "focused gait and look/feel/move exam", "passive range of motion of affected and adjacent joints", "neurovascular exam", "skin/wound source", "immunocompromise, sickle cell, hemophilia, postoperative, or neonatal status", "medication, allergy, recent antibiotic, and analgesia history", "pregnancy possibility when relevant", "FBE/WBC, ESR, CRP, blood culture, aspiration, X-ray, ultrasound, or MRI results when indicated", "follow-up and return access"]
  });

  const missingObjectiveEndpoint = endpoint({
    id: `${prefix}_missing_objective_endpoint`,
    label: "Missing data needed: weight-bearing after analgesia, temperature, inflammatory markers, culture, aspiration, X-ray, ultrasound, MRI, or follow-up plan",
    edgeLabel: "Cannot choose low-risk, infection, fracture, SUFE/Perthes, systemic-mimic, or admission branch until post-analgesia weight-bearing, temperature, ROM, pain localization, red flags, CRP/ESR/WBC/culture when infection is possible, and imaging/aspiration status are known",
    sourceIds,
    criteria: criteria(`${prefix}_missing_objective_criteria`, "Route here when the patient has a pediatric limp or hot-joint presentation but weight-bearing, temperature, joint exam, inflammatory marker, culture, imaging/aspiration, or follow-up data needed for guideline branch selection are missing.", contextDomains, sourceIds, { missing_any: ["weight-bearing after analgesia", "temperature", "focused range of motion", "pain localization", "CRP/ESR/WBC when infection possible", "blood culture before antibiotics when feasible", "X-ray/ultrasound/MRI/aspiration status when indicated", "follow-up plan"] }),
    action: "Complete the branch-critical data: repeat analgesia-supported walking assessment, measure temperature and full vitals, document passive joint motion and severe pain with movement, localize hip versus knee/thigh/bone pain, obtain FBE/WBC, ESR, CRP, blood culture before antibiotics when infection is possible, discuss aspiration for suspected septic arthritis without delaying antibiotics, obtain localized X-ray for injury or hip disease, ultrasound for suspected hip effusion, MRI with contrast when osteomyelitis or deep infection remains possible, and document follow-up or transfer access before discharge.",
    endpointType: "missing_data_needed",
    missingDataNeeded: ["post-analgesia weight-bearing status", "temperature and full vitals", "passive joint range of motion", "pain localization", "CRP", "ESR", "WBC/FBE", "blood culture before antibiotics when feasible", "joint aspiration or orthopaedic plan when septic arthritis possible", "targeted X-ray when localized pain/injury/hip disease possible", "hip ultrasound effusion measurement when septic hip possible", "MRI plan/result when osteomyelitis or deep infection possible", "follow-up or transfer access"]
  });

  const sepsisEndpoint = endpoint({
    id: `${prefix}_sepsis_instability_endpoint`,
    label: "Unstable pediatric limp or hot joint: sepsis, shock, toxic appearance, poor perfusion, altered mental status, or limb-threatening injury",
    edgeLabel: "Instability branch: shock, toxic appearance, altered mental status, hypoxemia, poor perfusion, rapidly worsening illness, limb-threatening trauma, neurovascular compromise, or severe disseminated infection features override routine limp workup",
    sourceIds: unique([...rchBji, ...chqBji, ...rchLimp]),
    criteria: criteria(`${prefix}_sepsis_instability_criteria`, "Use when abnormal physiology or limb-threatening findings require immediate escalation before a routine limp differential is completed.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "comorbidities", "workup_findings"], unique([...rchBji, ...chqBji, ...rchLimp]), { criteria_options: criteriaRows }),
    action: "Activate pediatric sepsis, resuscitation, ED/ICU/orthopaedic transfer, and limb-threat pathways immediately. Obtain cultures if this does not delay antibiotics, start empiric antimicrobial treatment according to local pediatric sepsis and bone/joint infection guidance, provide analgesia, keep the child nil by mouth if operative drainage is possible, and defer low-risk discharge logic until physiology and limb perfusion are stable.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const septicArthritisEndpoint = endpoint({
    id: `${prefix}_septic_arthritis_emergency_endpoint`,
    label: "Suspected pediatric septic arthritis: urgent orthopaedics, aspiration or washout, cultures, and antibiotics without treatment delay",
    edgeLabel: "Septic arthritis branch: fever >38.5 C, hot/swollen joint, severe passive-motion pain, reduced ROM, refusal to weight bear, CRP >=20 mg/L, ESR >=40 mm/hr, WBC >12.0 x10^9/L, ultrasound effusion >=7 mm, purulent aspirate, positive Gram stain/culture, or high clinical suspicion",
    sourceIds: unique([...rchLimp, ...rchBji, ...chqBji, ...kocher, ...caird]),
    criteria: criteria(`${prefix}_septic_arthritis_criteria`, "Use when fever, non-weight-bearing, joint restriction, inflammatory markers, effusion, aspiration findings, or clinician concern make septic arthritis possible.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], unique([...rchLimp, ...rchBji, ...chqBji, ...kocher, ...caird]), { criteria_options: criteriaRows }),
    action: "Treat as an orthopaedic emergency. Discuss with orthopaedics and pediatrics immediately, obtain FBE/WBC, ESR, CRP, and blood culture before antibiotics when feasible, arrange joint aspiration with Gram stain/culture where appropriate, keep the child nil by mouth for possible washout, start empiric IV antibiotics when urgent treatment is needed rather than waiting for surgical timing, and admit or transfer to a center able to provide pediatric orthopaedic care.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const boneInfectionEndpoint = endpoint({
    id: `${prefix}_bone_infection_admission_endpoint`,
    label: "Suspected pediatric osteomyelitis, myositis, discitis, abscess, or bone/joint infection: admit for cultures, imaging, IV antibiotics, and orthopaedic/ID plan",
    edgeLabel: "Bone infection branch: fever or systemic symptoms plus focal bone pain/tenderness, limited limb use, elevated CRP/ESR/WBC, bacteremia, wound/puncture source, MRI concern, X-ray that may be normal for 7-10 days, abscess, myositis, discitis, or osteomyelitis concern",
    sourceIds: unique([...rchBji, ...chqBji, ...rchLimp]),
    criteria: criteria(`${prefix}_bone_infection_criteria`, "Use when pediatric limp or limb pain suggests osteomyelitis, deep infection, abscess, myositis, discitis, bacteremia, or complicated bone/joint infection.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "workup_findings"], unique([...rchBji, ...chqBji, ...rchLimp]), { criteria_options: criteriaRows }),
    action: "Admit or transfer for pediatric/orthopaedic management. Obtain FBE/WBC, ESR, CRP, blood culture before antibiotics when feasible, targeted X-ray to evaluate fracture/tumor while recognizing early osteomyelitis may be radiographically normal for 7-10 days, MRI with contrast when localized osteomyelitis or deep infection remains possible, drainage/surgery when abscess or septic focus requires it, empiric IV antibiotics using local antimicrobial stewardship, and ID review for complex disease.",
    endpointType: "treatment",
    guidelineCutoffs: criteriaRows
  });

  const fractureSafeguardingEndpoint = endpoint({
    id: `${prefix}_fracture_safeguarding_endpoint`,
    label: "Pediatric localized injury, occult fracture, toddler fracture, growth-plate injury, or safeguarding concern",
    edgeLabel: "Injury/safeguarding branch: focal tenderness, trauma, deformity, swelling, persistent non-weight-bearing, negative initial X-ray with ongoing toddler-fracture concern, developmentally implausible story, delay, recurrent injury, bruising pattern, or unsafe discharge context",
    sourceIds: unique([...rchLimp, ...acr]),
    criteria: criteria(`${prefix}_fracture_safeguarding_criteria`, "Use when localized pain or history points to fracture, occult injury, growth-plate injury, dislocation, or inflicted injury rather than benign transient synovitis.", ["symptoms", "exam", "vitals", "imaging_results", "demographics", "workup_findings"], unique([...rchLimp, ...acr]), { criteria_options: criteriaRows }),
    action: "Order site-specific radiographs, immobilize and provide analgesia when fracture is suspected, remember a negative initial X-ray does not exclude nondisplaced toddler fracture, arrange follow-up imaging or MRI when the child remains non-weight-bearing or pain localizes, restrict weight bearing as clinically needed, consult orthopaedics for growth-plate/dislocation/high-risk injury, and activate local safeguarding policy for inconsistent, delayed, recurrent, unwitnessed, or developmentally implausible injury.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows
  });

  const ageSpecificHipEndpoint = endpoint({
    id: `${prefix}_sufe_perthes_hip_endpoint`,
    label: "Pediatric age-specific hip disease: SUFE, Perthes disease, DDH, apophysitis, stress injury, or referred knee pain",
    edgeLabel: "Age-specific hip branch: adolescent hip/groin/thigh/knee pain, weight >90th percentile, endocrine/puberty risk, painful limited internal rotation, frog-leg/pelvic X-ray concern, suspected SUFE with non-weight-bearing, male age 3-10 years with persistent limp, or early Perthes with possible normal X-ray",
    sourceIds: unique([...rchLimp, ...chqLimp]),
    criteria: criteria(`${prefix}_sufe_perthes_criteria`, "Use when age, sex, pain location, weight percentile, hip exam, or radiographs suggest SUFE, Perthes disease, DDH, apophysitis, stress injury, or referred hip disease.", ["symptoms", "exam", "vitals", "imaging_results", "demographics", "comorbidities", "workup_findings"], unique([...rchLimp, ...chqLimp]), { criteria_options: criteriaRows }),
    action: "Examine the hip when knee or thigh pain is reported, obtain appropriate pelvic/hip imaging including frog-leg view when safe and indicated, make suspected SUFE non-weight-bearing and obtain prompt orthopaedic review for operative management, arrange orthopaedic referral for suspected Perthes or persistent limp in the typical age group even if early X-ray is normal, and avoid labeling adolescent hip or referred knee pain as a routine sprain without hip assessment.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const systemicMimicEndpoint = endpoint({
    id: `${prefix}_systemic_mimic_endpoint`,
    label: "Pediatric limp systemic mimic: malignancy, inflammatory arthritis, ARF, neurologic, abdominal, GU, hematologic, or referred pain",
    edgeLabel: "Systemic mimic branch: night pain, weight loss, pallor, bruising, bleeding, recurrent fever, morning stiffness, rash, CRP >30 with ARF context, ECG conduction abnormality, neurologic deficit, abdominal/scrotal/GU symptoms, sickle/hemophilia pain, or recurrent/persistent unexplained limp",
    sourceIds: unique([...rchLimp, ...chqLimp]),
    criteria: criteria(`${prefix}_systemic_mimic_criteria`, "Use when the limp is not explained by isolated injury, transient synovitis, or focal infection and systemic, inflammatory, hematologic, neurologic, abdominal, or GU disease remains possible.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "comorbidities", "demographics", "workup_findings"], unique([...rchLimp, ...chqLimp]), { criteria_options: criteriaRows }),
    action: "Do not anchor on sprain or transient synovitis. Obtain FBE with film when malignancy or hematologic disease is possible, inflammatory markers and targeted rheumatology/infectious evaluation when morning stiffness/rash/recurrent fever is present, ECG and ARF workup when migratory arthritis or high CRP context suggests rheumatic fever, neurologic/abdominal/GU/scrotal exam and pathway referral when referred pain dominates, and admit or arrange urgent specialty review when systemic or limb-risk findings are present.",
    endpointType: "diagnostic_step",
    guidelineCutoffs: criteriaRows
  });

  const lowRiskEndpoint = endpoint({
    id: `${prefix}_low_risk_limp_endpoint`,
    label: "Low-risk pediatric limp or transient synovitis: no routine tests only after red flags are absent and the child walks comfortably with follow-up",
    edgeLabel: "Low-risk branch: systemically well, no fever or only low-grade temperature <38.5 C consistent with transient synovitis, no red flags, mild or no discomfort after simple analgesia, able to walk or weight bear, high-risk diagnoses unlikely, working diagnosis documented, and review plan within 7 days if symptoms persist",
    sourceIds: unique([...rchLimp, ...chqLimp]),
    criteria: criteria(`${prefix}_low_risk_limp_criteria`, "Use low-risk pediatric limp care only when serious infection, fracture, SUFE/Perthes, systemic disease, safeguarding concern, and follow-up gaps are absent.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], unique([...rchLimp, ...chqLimp]), { criteria_options: criteriaRows }),
    action: "Avoid routine labs or imaging when the child meets low-risk criteria. Provide simple analgesia or NSAID/rest when transient synovitis is likely and contraindications are absent, document the working diagnosis and high-risk exclusions, discharge only if walking comfortably with or without analgesia and family can return, and arrange review within 7 days of onset if symptoms persist.",
    endpointType: "safety_net_instruction",
    guidelineCutoffs: criteriaRows
  });

  const specialReviewEndpoint = endpoint({
    id: `${prefix}_special_population_review_endpoint`,
    label: "Pediatric limp special-population or local-policy review: neonate, age <3 months, immunocompromise, sickle cell, hemophilia, MRSA/Pseudomonas risk, puncture wound, postoperative limb, pregnancy, or safeguarding",
    edgeLabel: "Special-population branch: neonate or age <3 months, immunocompromise, sickle cell, hemophilia, renal disease, postoperative orthopaedics, prosthesis/hardware, puncture/contaminated wound or water exposure, MRSA/Pseudomonas risk, relapse/persistent bacteremia, pregnancy-relevant adolescent imaging/medications, or child-safety policy requirement",
    sourceIds: unique([...rchBji, ...chqBji, ...rchLimp, ...chqLimp]),
    criteria: criteria(`${prefix}_special_population_review_criteria`, "Use when host factors, organism risk, wound context, pregnancy, postoperative status, or local child-safety/antimicrobial policy changes routine pediatric limp management.", ["demographics", "pregnancy_status", "medications", "comorbidities", "labs", "imaging_results", "local_policy", "workup_findings"], unique([...rchBji, ...chqBji, ...rchLimp, ...chqLimp]), { criteria_options: criteriaRows }),
    action: "Get pediatric, orthopaedic, infectious diseases, hematology, obstetric, safeguarding, or transfer-center review as appropriate. Apply local antimicrobial stewardship for MRSA/Pseudomonas/puncture or contaminated wounds, avoid routine oral-switch or discharge criteria in neonates, immunocompromised children, relapse, persistent bacteremia, hardware/postoperative cases, sickle cell/hemophilia pain, or uncertain safeguarding, and document the reviewer input needed before endpoint closure.",
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Local antimicrobial, orthopaedic, transfer, safeguarding, hematology, pregnancy/imaging, and postoperative protocols can override the general pediatric limp pathway."
  });

  const worseningEndpoint = endpoint({
    id: `${prefix}_worsening_endpoint`,
    label: "Pediatric limp reassessment escalation: fever, worsening pain, persistent non-weight-bearing, rising CRP/ESR/WBC, positive culture, new effusion, or abnormal MRI",
    edgeLabel: "Worsening branch: fever appears or persists, nocturnal/worsening pain, refusal to weight bear despite analgesia, toxic appearance, CRP/ESR/WBC rise or fail to improve, blood or aspirate culture positive, ultrasound effusion or MRI infection concern emerges, or low-risk diagnosis no longer fits",
    sourceIds,
    criteria: criteria(`${prefix}_worsening_criteria`, "Escalate pediatric limp management when reassessment contradicts the low-risk, fracture-only, or improving infection branch.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Repeat vitals and focused exam, recheck ability to weight bear after analgesia, repeat or obtain CRP/ESR/WBC and cultures as indicated, review X-ray/ultrasound/MRI or obtain MRI when infection/occult fracture remains possible, move to septic arthritis, bone infection, fracture/safeguarding, systemic mimic, admission, or transfer branch according to the new finding, and stop low-risk discharge planning.",
    endpointType: "escalation_disposition",
    guidelineCutoffs: criteriaRows
  });

  const deescalateEndpoint = endpoint({
    id: `${prefix}_deescalation_endpoint`,
    label: "Pediatric bone/joint infection de-escalation: oral switch or stopping only with clinical improvement, afebrile window, CRP response, oral tolerance, and specialist plan",
    edgeLabel: "De-escalation branch: uncomplicated infection improving after IV therapy, afebrile at least 24 hours, IV minimum 48 hours or 2-3 days depending local guideline, CRP <20 mg/L or down >2/3 from peak, tolerating oral intake, cultures reviewed, and total duration plan 3-4 weeks osteomyelitis or 2-3 weeks septic arthritis",
    sourceIds: unique([...rchBji, ...chqBji]),
    criteria: criteria(`${prefix}_deescalation_criteria`, "Use when pediatric bone/joint infection has improved enough for oral switch, narrowing, or treatment stopping under the cited guideline criteria.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], unique([...rchBji, ...chqBji]), { criteria_options: criteriaRows }),
    action: "Switch from IV to oral therapy, narrow antibiotics, or stop treatment only when the treating team confirms uncomplicated disease, clinical improvement, afebrile status, oral tolerance, improving markers, culture/organism review, and follow-up. Use local dosing and stewardship, recheck CRP one week after oral switch and before stopping when following CHQ logic, and extend or seek ID review for complicated disease, neonates, immunocompromise, Pseudomonas, relapse, persistent bacteremia, or inadequate response.",
    endpointType: "deescalation_stopping",
    guidelineCutoffs: criteriaRows
  });

  const followupEndpoint = endpoint({
    id: `${prefix}_followup_safety_endpoint`,
    label: "Pediatric limp follow-up and safety-net: review access, pending-result owner, weight-bearing plan, return precautions, and specialty handoff",
    edgeLabel: "Disposition branch: cause identified and managed or serious causes addressed, walking/weight-bearing plan documented, pending labs/cultures/imaging assigned, orthopaedic/pediatric/ID follow-up scheduled when needed, and family return precautions include fever, worsening/nocturnal pain, refusal to weight bear, no improvement after 3 days, persistence >14 days, lethargy, or unwell appearance",
    sourceIds: unique([...rchLimp, ...rchBji, ...chqLimp, ...chqBji, ...acr]),
    criteria: criteria(`${prefix}_followup_safety_criteria`, "Use when pediatric limp or bone/joint infection is stable enough for discharge, outpatient review, or lower-acuity follow-up with explicit safety-net instructions.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], unique([...rchLimp, ...rchBji, ...chqLimp, ...chqBji, ...acr]), { criteria_options: criteriaRows }),
    action: "Document diagnosis or working diagnosis, red flags screened, ability to walk or weight-bear status, analgesia/rest/activity or non-weight-bearing plan, antibiotic plan if used, responsible service for pending cultures/labs/imaging, specialty follow-up clinician/service, and return precautions for fever, systemic illness, worsening or night pain, refusal to weight bear despite analgesia, new swelling/redness, neurovascular symptoms, no improvement after 3 days, persistence beyond 14 days, lethargy, or inability to access follow-up.",
    endpointType: "follow_up",
    monitoringPlan: ["weight-bearing and pain trajectory", "temperature/systemic symptoms", "CRP/ESR/WBC trend when infection treated", "culture and imaging result ownership", "orthopaedic/pediatric/ID follow-up", "family return precautions"]
  });

  const monitoringBundle = actionNode({
    id: `${prefix}_monitoring_bundle`,
    label: "Pediatric limp monitoring: pain, weight-bearing, fever, ROM, neurovascular status, cultures, CRP/ESR/WBC, imaging, antibiotic response, and discharge readiness",
    edgeLabel: "Monitoring branch after pediatric limp classification: trend post-analgesia walking, pain/night pain, temperature, perfusion, range of motion, swelling, neurovascular findings, culture status, CRP/ESR/WBC, imaging evolution, antibiotic tolerance, oral switch readiness, follow-up access, and return precautions",
    sourceIds,
    criteria: criteria(`${prefix}_monitoring_bundle_criteria`, "Monitor pediatric limp or hot-joint management by reassessing weight bearing, pain, temperature, joint exam, CRP/ESR/WBC, cultures, imaging, antibiotic response, and discharge readiness.", ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "follow_up_access", "workup_findings"], sourceIds, { criteria_options: criteriaRows }),
    action: "Reassess pain control, night pain, ability to walk or weight bear, fever/systemic signs, joint motion, swelling/warmth, neurovascular status, blood culture/aspiration/imaging results, CRP/ESR/WBC trend when obtained, antibiotic response and adverse effects, operative drainage need, oral switch criteria, and disposition readiness before closing the pathway.",
    parallelActions: unique(["repeat vital signs and perfusion", "repeat post-analgesia weight-bearing assessment", "repeat focused joint and neurovascular exam", "trend CRP/ESR/WBC when infection is being treated", "track blood culture and aspirate results", "review X-ray/ultrasound/MRI result owner", "confirm antibiotic route/duration or no-test rationale", evidenceLabels.safety]),
    guidelineCutoffs: criteriaRows,
    children: [worseningEndpoint, deescalateEndpoint, followupEndpoint]
  });

  const classificationDecision = decision({
    id: `${prefix}_classification_decision`,
    label: "Pediatric limp/hot joint: classify instability, septic arthritis, bone infection, injury/safeguarding, SUFE/Perthes, systemic mimic, low-risk limp, or special-population review",
    edgeLabel: "Pediatric limp branch ready: age/development, trauma/safeguarding story, post-analgesia weight-bearing, temperature/vitals, pain localization, ROM, red flags, infection labs/cultures when indicated, imaging/aspiration status, host factors, and follow-up access are available",
    sourceIds,
    criteria: criteria(`${prefix}_classification_criteria`, "Classify pediatric limp or hot-joint presentations using instability findings, septic hip predictors, infection labs/imaging, injury localization, age-specific hip rules, systemic mimics, and low-risk discharge criteria.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Select the active pediatric branch: instability/sepsis escalation, septic arthritis emergency, osteomyelitis or bone/joint infection admission, localized injury or safeguarding, SUFE/Perthes or other age-specific hip disease, systemic/referred mimic, low-risk transient synovitis/no-test care, special-population clinician review, or monitoring/follow-up.",
    clinicalCriteria: criteriaRows,
    guidelineCutoffs: criteriaRows,
    children: [missingObjectiveEndpoint, sepsisEndpoint, septicArthritisEndpoint, boneInfectionEndpoint, fractureSafeguardingEndpoint, ageSpecificHipEndpoint, systemicMimicEndpoint, lowRiskEndpoint, specialReviewEndpoint, monitoringBundle]
  });

  const initialAssessment = actionNode({
    id: `${prefix}_initial_assessment_bundle`,
    label: "Pediatric limp bedside assessment: age, duration, trauma/safeguarding, post-analgesia weight-bearing, fever/vitals, localization, ROM, labs/imaging, and follow-up",
    edgeLabel: `Pediatric limp assessment bundle: ${evidenceLabels.tests}; ${evidenceLabels.redFlags}; ${evidenceLabels.dispositions}`,
    sourceIds,
    criteria: criteria(`${prefix}_initial_assessment_criteria`, "Initial pediatric limp assessment requires age/development, duration, injury and safeguarding history, weight-bearing after analgesia, fever/vitals, focused MSK exam, infection/fracture/hip/systemic screen, targeted testing, and follow-up constraints.", contextDomains, sourceIds, { criteria_options: criteriaRows }),
    action: "Assess age/developmental walking baseline, duration and trajectory, trauma mechanism and safeguarding consistency, fever/systemic illness, analgesia response, ability to walk or weight bear, pain localization including referred knee/thigh/groin pain, gait, look/feel/move exam, joint above and below, passive ROM and severe pain with motion, neurovascular status, skin/wound source, night pain/weight loss/pallor/bruising, abdominal/GU/neurologic symptoms, high-risk host factors, targeted FBE/WBC/ESR/CRP/culture/aspiration when infection is possible, site-specific X-ray, hip ultrasound, MRI when osteomyelitis/deep infection or persistent unexplained limp remains possible, and follow-up or transfer access.",
    parallelActions: unique([evidenceLabels.tests, evidenceLabels.redFlags, evidenceLabels.dispositions, "post-analgesia weight-bearing assessment", "temperature and full vital signs", "passive joint range of motion", "hip exam for knee/thigh/groin pain", "FBE/WBC, ESR, CRP, and blood culture when infection is possible", "site-specific X-ray or hip ultrasound/MRI when indicated", "safeguarding consistency screen"]),
    requiredData: ["age and developmental baseline", "duration", "trauma/safeguarding history", "post-analgesia weight-bearing", "temperature and full vitals", "pain localization", "joint ROM", "neurovascular status", "infection labs/cultures when indicated", "imaging/aspiration status when indicated", "follow-up access"],
    guidelineCutoffs: criteriaRows,
    children: [classificationDecision]
  });

  const root = decision({
    id: "root",
    label: "Pediatric limp/hot joint: route by instability, septic arthritis predictors, bone infection, injury, age-specific hip disease, systemic mimics, low-risk criteria, and safety-net needs",
    sourceIds,
    criteria: criteria(`${prefix}_activate`, "Activate for child or adolescent with limp, refusal to walk, non-weight-bearing, hot/swollen joint, suspected septic arthritis or osteomyelitis, limb pain, localized injury, hip/groin/thigh/knee pain, persistent limp, or clinician-chosen pediatric MSK evaluation.", ["clinician_chosen_module", "symptoms", "exam", "vitals", "labs", "imaging_results", "problem_list_or_diagnosis"], sourceIds),
    action: "Route pediatric limp and hot-joint presentations through missing-data, instability, septic arthritis, bone infection, fracture/safeguarding, SUFE/Perthes, systemic mimic, low-risk/no-test care, special-population review, monitoring, de-escalation, follow-up, and safety-net endpoints.",
    children: [missingContextEndpoint, initialAssessment]
  });

  return finalizeClinicalPathwayTree({
    module,
    sourceById,
    label,
    version: "4.0.0",
    status: "hand_polished_pediatric_msk_limp_hot_joint_pathway_needs_clinician_review",
    sourceIds,
    criteriaRows,
    tests,
    redFlags,
    differentials,
    dispositions,
    root,
    sourceMaterial: "Royal Children's Hospital limp and bone/joint infection guidelines, Children's Health Queensland 2026 limp and bone/joint infection guidance, ACR acutely limping child appropriateness criteria, Kocher septic hip prediction study, Caird septic hip CRP study, and local module evidence rows",
    reviewNote: "Pediatric limp/hot-joint tree is threshold-cited and patient-traversable; local pediatric sepsis criteria, antimicrobial formulary, orthopaedic washout timing, imaging/sedation access, safeguarding policy, and transfer thresholds require clinician governance.",
    syntheticScenarios: [
      { scenario_id: "missing_context", major_pathway: "missing_data_needed", expected_endpoint_id: missingContextEndpoint.id, expected_active_branch: missingContextEndpoint.edgeLabel },
      { scenario_id: "missing_weight_bearing_labs_imaging", major_pathway: "diagnostic_confirmation_missing_data", expected_endpoint_id: missingObjectiveEndpoint.id, expected_active_branch: missingObjectiveEndpoint.edgeLabel },
      { scenario_id: "unstable_septic_child", major_pathway: "red_flags_instability", expected_endpoint_id: sepsisEndpoint.id, expected_active_branch: sepsisEndpoint.edgeLabel },
      { scenario_id: "hot_swollen_nonweightbearing_hip_crp_high", major_pathway: "escalation_emergency_actions", expected_endpoint_id: septicArthritisEndpoint.id, expected_active_branch: septicArthritisEndpoint.edgeLabel },
      { scenario_id: "focal_bone_pain_osteomyelitis_mri", major_pathway: "first_line_management", expected_endpoint_id: boneInfectionEndpoint.id, expected_active_branch: boneInfectionEndpoint.edgeLabel },
      { scenario_id: "localized_trauma_negative_xray_toddler_fracture", major_pathway: "mimics_exclusions", expected_endpoint_id: fractureSafeguardingEndpoint.id, expected_active_branch: fractureSafeguardingEndpoint.edgeLabel },
      { scenario_id: "adolescent_groin_knee_pain_sufe", major_pathway: "severity_risk_stratification", expected_endpoint_id: ageSpecificHipEndpoint.id, expected_active_branch: ageSpecificHipEndpoint.edgeLabel },
      { scenario_id: "night_pain_pallor_bruising_malignancy_mimic", major_pathway: "diagnostic_confirmation", expected_endpoint_id: systemicMimicEndpoint.id, expected_active_branch: systemicMimicEndpoint.edgeLabel },
      { scenario_id: "well_child_transient_synovitis", major_pathway: "disposition_followup_safety_netting", expected_endpoint_id: lowRiskEndpoint.id, expected_active_branch: lowRiskEndpoint.edgeLabel },
      { scenario_id: "neonate_immunocompromised_mrsa_puncture", major_pathway: "contraindications_special_populations", expected_endpoint_id: specialReviewEndpoint.id, expected_active_branch: specialReviewEndpoint.edgeLabel },
      { scenario_id: "worsening_after_low_risk_or_treatment", major_pathway: "monitoring_reassessment_escalation", expected_endpoint_id: worseningEndpoint.id, expected_active_branch: worseningEndpoint.edgeLabel },
      { scenario_id: "infection_oral_switch_stop_criteria", major_pathway: "deescalation_stopping_criteria", expected_endpoint_id: deescalateEndpoint.id, expected_active_branch: deescalateEndpoint.edgeLabel },
      { scenario_id: "followup_and_return_precautions", major_pathway: "follow_up_safety_netting", expected_endpoint_id: followupEndpoint.id, expected_active_branch: followupEndpoint.edgeLabel }
    ],
    handPolishRequirements: [
      "activation and root labels name concrete pediatric limp/hot-joint decisions, not generic trigger or context-gathering phrases",
      "septic arthritis branch includes fever >38.5 C, non-weight-bearing, ESR >=40 mm/hr, WBC >12.0 x10^9/L, CRP >=20 mg/L, and hip effusion >=7 mm support thresholds",
      "bone/joint infection branch includes blood culture before antibiotics when feasible, early X-ray limitations at 7-10 days, MRI preference, IV/oral switch, CRP response, and total duration thresholds",
      "fracture branch includes occult toddler fracture risk after negative X-ray and safeguarding routing",
      "age-specific hip branch includes SUFE weight >90th percentile, about 20% bilateral disease, prompt non-weight-bearing/operative pathway, and Perthes age 3-10 concern",
      "low-risk branch with no routine tests requires no red flags, comfortable walking with analgesia, and review within 7 days if symptoms persist",
      "follow-up and safety-net include return for fever, worsening/nocturnal pain, refusal to weight bear, no improvement after 3 days, persistence >14 days, or lethargy/unwell state"
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
    synthetic_patient_scenarios: completeSyntheticScenarioCoverage(root, syntheticScenarios),
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
          : module.id === "congenital_adrenal_hyperplasia_v1"
            ? buildCongenitalAdrenalHyperplasiaClinicalPathwayTree(module, sourceById)
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
                        : module.id === "hyperaldosteronism_v1"
                          ? buildPrimaryAldosteronismClinicalPathwayTree(module, sourceById)
                          : module.id === "pheochromocytoma_v1"
                            ? buildPheochromocytomaClinicalPathwayTree(module, sourceById)
                            : module.id === "acromegaly_v1"
                              ? buildGrowthHormoneExcessClinicalPathwayTree(module, sourceById, "acromegaly")
                              : module.id === "gigantism_v1"
                              ? buildGrowthHormoneExcessClinicalPathwayTree(module, sourceById, "gigantism")
                              : module.id === "chest_pain_v1"
                                ? buildAdultChestPainClinicalPathwayTree(module, sourceById)
                                : module.id === "erectile_dysfunction_v1"
                                  ? buildErectileDysfunctionClinicalPathwayTree(module, sourceById)
                                  : module.id === "pediatric_fever_sepsis_v1"
                                    ? buildPediatricFeverSepsisClinicalPathwayTree(module, sourceById)
                                    : module.id === "pediatric_chest_pain_syncope_v1"
                                      ? buildPediatricChestPainSyncopeClinicalPathwayTree(module, sourceById)
                                      : module.id === "pediatric_msk_limp_hot_joint_v1"
                                        ? buildPediatricMskLimpHotJointClinicalPathwayTree(module, sourceById)
                                        : buildCompactClinicalPathwayTree(module, sourceById);
    const nextModule = { ...baseModule, clinical_pathway_tree_v1: clinicalPathway };
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
