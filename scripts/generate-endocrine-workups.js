import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { clinicalIntentRegistry, resolveClinicalIntents } from "../clinical-intents.js";

const generatedAt = new Date().toISOString();
const accessedDate = "2026-06-06";

const sources = {
  ADA_SOC_2026: ["ADA Standards of Care in Diabetes 2026", "https://professional.diabetes.org/standards-of-care/practice-guidelines-resources"],
  ADA_DIAGNOSIS_2026: ["ADA Diagnosis and Classification of Diabetes 2026", "https://diabetesjournals.org/care/article/49/Supplement_1/S27/163926/2-Diagnosis-and-Classification-of-Diabetes"],
  ADA_HYPERGLYCEMIC_CRISES_2024: ["Hyperglycemic Crises in Adults With Diabetes Consensus Report 2024", "https://diabetesjournals.org/care/article/47/8/1257/156808/Hyperglycemic-Crises-in-Adults-With-Diabetes-A"],
  AACE_ATA_HYPOTHYROIDISM_2012: ["AACE/ATA Hypothyroidism in Adults Guideline", "https://www.guidelinecentral.com/guideline/6855/"],
  ATA_HYPERTHYROIDISM_2016: ["ATA Hyperthyroidism and Thyrotoxicosis Guideline", "https://journals.sagepub.com/doi/10.1089/thy.2016.0229"],
  ETA_THYROID_NODULE_2023: ["2023 European Thyroid Association Thyroid Nodule Guideline", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10448590/"],
  ATA_THYROID_CANCER_2025: ["ATA Differentiated Thyroid Cancer Guideline Resource", "https://www.thyroid.org/ata-professional-guidelines/"],
  ENDO_OSTEOPOROSIS_2020: ["Endocrine Society Osteoporosis Pharmacologic Management Guideline Update", "https://academic.oup.com/jcem/article/105/3/587/5739968"],
  PHPT_WORKSHOP_2022: ["Fifth International Workshop Primary Hyperparathyroidism Guidelines", "https://onlinelibrary.wiley.com/doi/10.1002/jbmr.4677"],
  HYPOPARA_TASK_FORCE_2022: ["2022 International Task Force Hypoparathyroidism Guidelines", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10118814/"],
  ENDO_VITD_2024: ["Endocrine Society Vitamin D for Prevention of Disease Guideline", "https://www.endocrine.org/clinical-practice-guidelines/vitamin-d-for-prevention-of-disease"],
  NIH_VITD_FACTSHEET: ["NIH ODS Vitamin D Health Professional Fact Sheet", "https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/"],
  ES_ADRENAL_INSUFFICIENCY_2016: ["Endocrine Society Primary Adrenal Insufficiency Guideline", "https://www.endocrine.org/clinical-practice-guidelines/primary-adrenal-insufficiency"],
  ES_CUSHING_DX_2008: ["Endocrine Society Diagnosis of Cushing Syndrome Guideline", "https://academic.oup.com/jcem/article/93/5/1526/2598096"],
  ES_PRIMARY_ALDO_2025: ["Endocrine Society Primary Aldosteronism Guideline 2025", "https://www.endocrine.org/clinical-practice-guidelines/primary-aldosteronism-2"],
  ES_PHEO_PPGL_2014: ["Endocrine Society Pheochromocytoma/Paraganglioma Guideline", "https://pubmed.ncbi.nlm.nih.gov/24893135/"],
  ES_CAH_2018: ["Endocrine Society Congenital Adrenal Hyperplasia Guideline", "https://pmc.ncbi.nlm.nih.gov/articles/PMC6456929/"],
  PCOS_GUIDELINE_2023: ["2023 International Evidence-based PCOS Guideline", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10755126/"],
  ES_TESTOSTERONE_2018: ["Endocrine Society Testosterone Therapy in Men With Hypogonadism Guideline", "https://doi.org/10.1210/JC.2018-00229"],
  AUA_ED_2018: ["AUA Erectile Dysfunction Guideline", "https://www.auanet.org/guidelines-and-quality/guidelines/erectile-dysfunction-%28ed%29-guideline"],
  ESHRE_POI_2024: ["International Guideline on Premature Ovarian Insufficiency 2024", "https://www.eshre.eu/-/media/sitecore-files/Guidelines/POI/2024/INTERNATIONAL-GUIDELINE-ON-POI_2024_2.pdf"],
  ASRM_AMENORRHEA_2024: ["ASRM Current Evaluation of Amenorrhea Committee Opinion 2024", "https://www.asrm.org/practice-guidance/practice-committee-documents/current-evaluation-of-amenorrhea/"],
  ES_HIRSUTISM_2018: ["Endocrine Society Hirsutism Guideline", "https://www.endocrine.org/clinical-practice-guidelines/hirsutism"],
  ES_HYPERPROLACTINEMIA_2011: ["Endocrine Society Hyperprolactinemia Guideline", "https://www.guidelinecentral.com/guideline/41733/"],
  ES_HYPOPITUITARISM_2016: ["Endocrine Society Hormone Replacement in Hypopituitarism Guideline", "https://www.endocrine.org/clinical-practice-guidelines/hormone-replacement-in-hypopituitarism"],
  PITUITARY_ACROMEGALY_2021: ["Pituitary Society Acromegaly Consensus", "https://reference.medscape.com/viewarticle/946489"],
  ENDOTEXT_DI_2026: ["Endotext Diabetes Insipidus/AVP-deficiency Testing", "https://www.ncbi.nlm.nih.gov/books/NBK537591/"],
  SFE_CDI_2018: ["Society for Endocrinology Inpatient Cranial Diabetes Insipidus Guidance", "https://pmc.ncbi.nlm.nih.gov/articles/PMC6013691/"],
  NHLBI_METABOLIC_SYNDROME: ["NHLBI Metabolic Syndrome Diagnosis", "https://www.nhlbi.nih.gov/health/metabolic-syndrome/diagnosis"]
};

const refs = {
  glycemia: [
    "A1c: normal <5.7%; prediabetes 5.7-6.4%; diabetes >=6.5%.",
    "Fasting plasma glucose: normal <100 mg/dL; prediabetes 100-125; diabetes >=126.",
    "2-hour 75-g OGTT: normal <140 mg/dL; prediabetes 140-199; diabetes >=200.",
    "Random plasma glucose >=200 mg/dL with classic symptoms supports diabetes diagnosis."
  ],
  thyroid: [
    "TSH typical adult range about 0.4-4.0 mIU/L; use local lab, pregnancy, and illness context.",
    "Free T4 typical adult range about 0.8-1.8 ng/dL; use local assay.",
    "T3, TRAb/TSI, TPO Ab, and thyroglobulin Ab are assay-specific."
  ],
  bone: [
    "Corrected calcium often about 8.5-10.5 mg/dL; ionized calcium about 1.12-1.32 mmol/L; use local lab.",
    "Intact PTH often about 10-65 pg/mL but assay-specific.",
    "DXA T-score: normal >= -1.0; osteopenia -1.0 to -2.5; osteoporosis <= -2.5.",
    "25(OH)D thresholds vary; many labs flag <20 ng/mL as low and <12 ng/mL as severe deficiency, while 2024 Endocrine Society guidance avoids universal screening/target thresholds for healthy adults."
  ],
  adrenal: [
    "8 AM cortisol <3 ug/dL strongly suggests adrenal insufficiency; >15-18 ug/dL often makes it unlikely, context dependent.",
    "Cosyntropin peak cortisol <18 ug/dL is a traditional abnormal cutoff; modern assays may use about 14-15 ug/dL.",
    "Sodium about 135-145 mmol/L; potassium about 3.5-5.0 mmol/L."
  ],
  pituitary: [
    "Prolactin upper limit often about 20 ng/mL in men and 25 ng/mL in women, but lab, pregnancy, lactation, and macroprolactin matter.",
    "Male total testosterone should be early morning and repeated; lower limit often around 264-300 ng/dL depending assay.",
    "IGF-1, LH/FSH, estradiol, AMH, and pediatric growth labs require age/sex/puberty-specific ranges."
  ],
  pregnancy: [
    "One-step 75-g OGTT for GDM: fasting >=92, 1-hour >=180, or 2-hour >=153 mg/dL.",
    "Two-step approach if used: 50-g screen often >=130-140 mg/dL; 100-g Carpenter-Coustan thresholds fasting 95, 1-hour 180, 2-hour 155, 3-hour 140 mg/dL, usually 2 abnormal values."
  ]
};

function w(category, diagnosis, sourceIds, questions, exam, tests, referenceValues, redFlags, managementChanges, aliases = []) {
  return { category, diagnosis, aliases, source_ids: sourceIds, questions, exam, tests, reference_values: referenceValues, red_flags: redFlags, management_changes: managementChanges };
}

const dx = [
  w("Diabetes and Blood Sugar Disorders", "Type 2 Diabetes Mellitus", ["ADA_SOC_2026", "ADA_DIAGNOSIS_2026"],
    ["Polyuria, polydipsia, weight change, blurred vision, infections.", "ASCVD, CKD, HF, neuropathy, retinopathy, sleep apnea, steroid exposure."],
    ["BP, BMI/waist, volume if symptomatic.", "Foot skin/pulses/monofilament or vibration when neuropathy risk.", "Cardiovascular and thyroid exam when indicated."],
    ["A1c, fasting plasma glucose, or 2-hour OGTT to confirm.", "CMP/eGFR, urine albumin-creatinine ratio, fasting lipids.", "Ketones/anion gap if vomiting, weight loss, dehydration, or acute symptoms."],
    refs.glycemia.concat(["UACR normal <30 mg/g; moderately increased 30-300; severely increased >300."]),
    ["DKA/HHS symptoms, dehydration, vomiting, altered mental status.", "Random glucose >=200 mg/dL with classic symptoms."],
    ["Diabetes-range A1c/FPG/OGTT changes diagnosis and treatment intensity.", "UACR >=30 or reduced eGFR changes kidney-protective therapy."], ["T2DM", "adult-onset diabetes"]),
  w("Diabetes and Blood Sugar Disorders", "Type 1 Diabetes Mellitus", ["ADA_SOC_2026", "ADA_DIAGNOSIS_2026", "ADA_HYPERGLYCEMIC_CRISES_2024"],
    ["Rapid polyuria, polydipsia, weight loss.", "Vomiting, abdominal pain, Kussmaul breathing, confusion.", "Personal/family autoimmune disease."],
    ["Vitals, hydration, mental status.", "Respiratory pattern/Kussmaul concern.", "Abdomen and infection/skin trigger exam."],
    ["A1c/glucose criteria plus ketones/acid-base if symptomatic.", "Beta-hydroxybutyrate, BMP, venous/arterial pH, bicarbonate, anion gap.", "Islet autoantibodies: GAD65, IA-2, ZnT8, insulin Ab if needed; C-peptide with concurrent glucose."],
    refs.glycemia.concat(["DKA: diabetes/hyperglycemia plus ketosis plus metabolic acidosis; glucose may be lower in euglycemic DKA.", "DKA beta-hydroxybutyrate often >=3.0 mmol/L with pH <7.3 or bicarbonate <18 mmol/L."]),
    ["Vomiting, dehydration, hypotension, Kussmaul respirations, altered mental status.", "SGLT2 inhibitor with ketotic symptoms even if glucose is not very high."],
    ["Ketosis plus acidosis requires urgent DKA pathway.", "Positive antibodies or low C-peptide supports autoimmune insulin-deficient diabetes."], ["T1DM", "LADA", "autoimmune diabetes"]),
  w("Diabetes and Blood Sugar Disorders", "Prediabetes", ["ADA_SOC_2026", "ADA_DIAGNOSIS_2026"],
    ["Weight, activity, family history, prior GDM.", "Sleep apnea, fatty liver, PCOS, steroid exposure."],
    ["BP, BMI/waist.", "Acanthosis nigricans and cardiometabolic exam."],
    ["A1c, fasting plasma glucose, or 2-hour 75-g OGTT.", "Lipids, ALT if fatty liver risk, BP/BMI/waist."],
    refs.glycemia,
    ["Diabetes-range glycemia or hyperglycemic symptoms."],
    ["A1c 5.7-6.4, FPG 100-125, or 2-hour OGTT 140-199 triggers prevention and surveillance.", "Diabetes-range values change diagnosis."], []),
  w("Diabetes and Blood Sugar Disorders", "Gestational Diabetes", ["ADA_SOC_2026", "ADA_DIAGNOSIS_2026"],
    ["Gestational age, prior GDM/macrosomia.", "Preexisting diabetes risk and fetal growth/polyhydramnios if known."],
    ["BP and weight.", "Volume status if vomiting/hyperglycemia.", "Pregnancy-focused assessment with OB team."],
    ["Early risk testing if high risk.", "24-28 week one-step 75-g OGTT or local two-step strategy.", "Postpartum 75-g OGTT at 4-12 weeks."],
    refs.pregnancy.concat(refs.glycemia),
    ["Ketones, vomiting/dehydration, severe hyperglycemia.", "Hypertension or preeclampsia features."],
    ["OGTT threshold crossing changes maternal/fetal monitoring and therapy.", "Postpartum abnormal OGTT changes long-term prevention."], ["GDM", "diabetes in pregnancy"]),
  w("Diabetes and Blood Sugar Disorders", "Metabolic Syndrome", ["NHLBI_METABOLIC_SYNDROME", "ADA_SOC_2026"],
    ["Weight/waist trajectory, sleep apnea, activity.", "Family ASCVD/diabetes, PCOS, fatty liver, BP/lipid therapy."],
    ["Waist circumference, BP, BMI.", "Acanthosis and cardiovascular risk exam."],
    ["Waist circumference.", "Fasting triglycerides, HDL, fasting glucose/A1c.", "Blood pressure and medication review."],
    ["Diagnosis commonly requires 3 or more: waist >102 cm men or >88 cm women in ATP III US cut points, TG >=150, HDL <40 men/<50 women, BP >=130/85 or treatment, fasting glucose >=100 or treatment."],
    ["Diabetes-range glycemia, severe hypertension, ASCVD symptoms."],
    ["3 or more criteria shifts to intensive cardiometabolic risk reduction.", "Diabetes thresholds change diagnosis."], []),
  w("Thyroid Disorders", "Hypothyroidism (Underactive Thyroid)", ["AACE_ATA_HYPOTHYROIDISM_2012"],
    ["Fatigue, cold intolerance, constipation, weight gain, depression, menorrhagia.", "Amiodarone, lithium, immune checkpoint inhibitor, pregnancy/fertility context."],
    ["HR/BP, thyroid size/nodules.", "Delayed reflexes, edema, skin/hair.", "Mental status if severe."],
    ["TSH and free T4.", "TPO antibody for autoimmune etiology.", "Pregnancy test when relevant; pituitary/adrenal evaluation if central pattern."],
    refs.thyroid,
    ["Myxedema coma features: hypothermia, bradycardia, hypotension, hypoventilation, hyponatremia, altered mental status."],
    ["High TSH plus low FT4 confirms overt primary hypothyroidism.", "Low FT4 with low/normal TSH triggers central hypothyroidism/pituitary pathway."], ["underactive thyroid"]),
  w("Thyroid Disorders", "Hashimoto's Thyroiditis (Autoimmune Hypothyroidism)", ["AACE_ATA_HYPOTHYROIDISM_2012", "ETA_THYROID_NODULE_2023"],
    ["Hypothyroid symptoms, family autoimmune disease.", "Neck swelling, nodules, compressive symptoms."],
    ["Firm/rubbery goiter, nodules, cervical nodes.", "Bradycardia, skin/reflex signs."],
    ["TSH, free T4, TPO antibody.", "Thyroglobulin antibody as adjunct.", "Ultrasound only for nodule, goiter, or compressive symptoms."],
    refs.thyroid,
    ["Rapidly enlarging thyroid, compressive symptoms, hard fixed nodule, cervical nodes."],
    ["Positive TPO Ab supports autoimmune thyroiditis.", "Suspicious nodule/compressive findings move to ultrasound/FNA pathway."], ["autoimmune hypothyroidism"]),
  w("Thyroid Disorders", "Hyperthyroidism (Overactive Thyroid)", ["ATA_HYPERTHYROIDISM_2016"],
    ["Palpitations, tremor, heat intolerance, weight loss, diarrhea, anxiety, insomnia.", "Iodine/amiodarone, postpartum, neck pain, eye symptoms."],
    ["HR/rhythm, BP, tremor/hyperreflexia.", "Thyroid size/bruit/nodules.", "Eye/orbitopathy and heart failure signs."],
    ["TSH, free T4, total/free T3.", "TRAb/TSI.", "RAIU or Doppler ultrasound when etiology unclear."],
    refs.thyroid,
    ["Thyroid storm: fever, severe tachycardia/AF, heart failure, agitation, GI symptoms, altered mental status."],
    ["Suppressed TSH plus high FT4/T3 confirms overt hyperthyroidism.", "TRAb or uptake pattern changes etiology-specific treatment."], ["overactive thyroid"]),
  w("Thyroid Disorders", "Graves' Disease", ["ATA_HYPERTHYROIDISM_2016"],
    ["Hyperthyroid symptoms, eye irritation/diplopia/vision change.", "Smoking, pregnancy plans, prior antithyroid drug reaction."],
    ["Diffuse goiter/bruit, tachycardia/AF, tremor.", "Lid lag/proptosis/EOM, pretibial myxedema."],
    ["TSH, free T4, T3.", "TRAb/TSI.", "RAIU if TRAb negative, nodular, or unclear."],
    refs.thyroid,
    ["Thyroid storm, vision-threatening orbitopathy, pregnancy with uncontrolled hyperthyroidism."],
    ["TRAb-positive biochemical hyperthyroidism supports Graves.", "Orbitopathy changes radioactive iodine risk and ophthalmology urgency."], []),
  w("Thyroid Disorders", "Thyrotoxicosis", ["ATA_HYPERTHYROIDISM_2016"],
    ["Exogenous thyroid hormone, supplements/biotin.", "Neck pain, viral illness, iodine exposure, amiodarone, postpartum."],
    ["Vitals/rhythm, thyroid tenderness/nodules, tremor.", "Heart failure signs and mental status if severe."],
    ["TSH, free T4, T3.", "TRAb/TSI.", "RAIU: high uptake suggests overproduction; low uptake suggests thyroiditis/exogenous/iodine-related in many cases.", "ESR/CRP if painful thyroid."],
    refs.thyroid,
    ["Storm physiology, AF, heart failure, severe weight loss, altered mental status."],
    ["Low uptake changes management away from antithyroid drugs toward thyroiditis/supportive pathway."], []),
  w("Thyroid Disorders", "Thyroid Nodules (Benign)", ["ETA_THYROID_NODULE_2023"],
    ["Growth, dysphagia, dyspnea, hoarseness.", "Radiation exposure, family thyroid cancer/MEN2, hyperthyroid symptoms."],
    ["Thyroid palpation, cervical nodes, voice/airway assessment."],
    ["TSH.", "High-quality thyroid ultrasound with risk stratification.", "FNA when indicated by size/risk system; low TSH prompts radionuclide scan."],
    refs.thyroid.concat(["FNA size thresholds are risk-system-specific; high-risk nodules are sampled at smaller sizes than low-risk nodules."]),
    ["Hard fixed nodule, rapid growth, vocal cord symptoms, suspicious lymph nodes, childhood radiation, MEN2 family history."],
    ["Suspicious ultrasound/Bethesda cytology changes cancer pathway.", "Low TSH with hot nodule shifts to autonomous-function pathway."], ["benign thyroid nodule"]),
  w("Thyroid Disorders", "Thyroid Cancer (Papillary, Follicular, Medullary)", ["ATA_THYROID_CANCER_2025", "ETA_THYROID_NODULE_2023"],
    ["Compressive symptoms, hoarseness, radiation history, family thyroid cancer/MEN2.", "Diarrhea/flushing if medullary disease possible.", "Prior FNA Bethesda category."],
    ["Thyroid mass and cervical nodal mapping by exam.", "Voice/airway; hyper/hypothyroid signs."],
    ["Neck ultrasound and nodal mapping.", "FNA cytology with Bethesda category.", "TSH/free T4.", "Calcitonin and CEA when medullary thyroid cancer suspected/confirmed.", "RET testing for medullary thyroid cancer."],
    refs.thyroid.concat(["Calcitonin/CEA thresholds are assay-specific; RET positivity changes family screening and surgical planning."]),
    ["Airway compromise, vocal cord paralysis, bulky nodes, rapidly enlarging mass, suspected anaplastic transformation."],
    ["Bethesda V/VI, suspicious nodes, calcitonin/CEA elevation, or RET positivity changes surgical/genetic pathway."], ["papillary thyroid cancer", "follicular thyroid cancer", "medullary thyroid cancer"])
];

const moreDx = [
  w("Bone and Parathyroid Disorders", "Osteoporosis", ["ENDO_OSTEOPOROSIS_2020"], ["Fragility fracture, falls, height loss/back pain.", "Glucocorticoids, aromatase inhibitors, androgen deprivation, menopause, calcium/vitamin D intake."], ["Height/weight, kyphosis/spine tenderness, gait/fall risk.", "Dental/jaw risk before antiresorptive therapy."], ["DXA and vertebral imaging when indicated.", "Calcium, phosphorus, creatinine/eGFR, alkaline phosphatase, 25(OH)D, PTH, TSH/CBC/CMP and secondary-cause labs as indicated."], refs.bone, ["New severe back pain, neurologic symptoms, hip fracture, multiple fragility fractures."], ["T-score <= -2.5 or fragility fracture confirms osteoporosis.", "Hip/vertebral fracture or very low T-score changes to high/very-high-risk pathway."]),
  w("Bone and Parathyroid Disorders", "Osteopenia", ["ENDO_OSTEOPOROSIS_2020"], ["Fracture/fall risk, menopause, family hip fracture, steroid exposure."], ["Height, gait/balance, spine tenderness/kyphosis."], ["DXA.", "FRAX or validated fracture-risk tool.", "Calcium, creatinine/eGFR, 25(OH)D, and secondary-cause labs when indicated."], refs.bone, ["Fragility fracture despite osteopenic T-score, rapid bone loss, secondary cause signs."], ["Osteopenia plus high fracture risk or fragility fracture can warrant pharmacologic therapy."]),
  w("Bone and Parathyroid Disorders", "Primary Hyperparathyroidism", ["PHPT_WORKSHOP_2022"], ["Kidney stones, fractures, bone pain, constipation, neurocognitive symptoms.", "Lithium/thiazides, calcium/vitamin D, family MEN/FHH."], ["Volume status if hypercalcemic, bone tenderness/fracture signs, neuromuscular weakness."], ["Repeat albumin-corrected/ionized calcium with intact PTH.", "25(OH)D, phosphorus, creatinine/eGFR.", "24-hour urine calcium and Ca/Cr clearance ratio; renal imaging and DXA."], refs.bone.concat(["PHPT: high calcium with elevated or inappropriately normal PTH; FHH often Ca/Cr clearance ratio <0.01 but overlap exists."]), ["Severe hypercalcemia, dehydration, AKI, confusion, pancreatitis."], ["Ca >1 mg/dL above ULN, osteoporosis/fracture, stones, reduced renal function, or age criteria can change to surgical pathway."]),
  w("Bone and Parathyroid Disorders", "Hypoparathyroidism", ["HYPOPARA_TASK_FORCE_2022"], ["Post-neck surgery/radiation, paresthesias, cramps, tetany, seizures.", "Calcium/vitamin D therapy and kidney stones."], ["Neuromuscular irritability, Chvostek/Trousseau when appropriate, mental status if severe."], ["Calcium plus PTH.", "Phosphorus, magnesium, creatinine/eGFR, 25(OH)D.", "24-hour urine calcium during chronic treatment."], refs.bone.concat(["Hypoparathyroidism: low calcium with low or inappropriately normal PTH, often high phosphorus."]), ["Seizure, laryngospasm, arrhythmia/QT prolongation, severe symptomatic hypocalcemia."], ["Symptomatic or severe hypocalcemia changes to urgent calcium replacement and ECG monitoring."]),
  w("Bone and Parathyroid Disorders", "Vitamin D Deficiency / Osteomalacia", ["ENDO_VITD_2024", "NIH_VITD_FACTSHEET"], ["Bone pain, proximal weakness, falls.", "Malabsorption/bariatric surgery, CKD/liver disease, anticonvulsants, diet/sun exposure."], ["Proximal strength, bone tenderness, gait/falls, hypocalcemia signs."], ["25(OH)D when clinically indicated.", "Calcium, phosphorus, alkaline phosphatase, PTH, creatinine/eGFR."], refs.bone.concat(["Osteomalacia pattern can include low/normal calcium, low phosphorus, high alkaline phosphatase, and secondary high PTH."]), ["Severe hypocalcemia symptoms, fracture, profound weakness, malabsorption/high-risk state."], ["Low 25(OH)D with symptoms or osteomalacia labs changes from prevention advice to treatment and etiology evaluation."]),
  w("Adrenal Gland Disorders", "Adrenal Insufficiency", ["ES_ADRENAL_INSUFFICIENCY_2016"], ["Fatigue, weight loss, anorexia, nausea/vomiting, abdominal pain, salt craving.", "Steroid exposure/withdrawal, pituitary disease, autoimmune disease, orthostasis."], ["Orthostatic vitals, volume status, hyperpigmentation in primary AI, mental status if crisis, abdominal exam."], ["8 AM cortisol and ACTH.", "Cosyntropin stimulation test.", "BMP/glucose; renin/aldosterone and 21-hydroxylase Ab if primary suspected."], refs.adrenal, ["Shock, vomiting/dehydration, hypoglycemia, severe hyponatremia/hyperkalemia, altered mental status."], ["Suspected adrenal crisis should be treated urgently; do not delay hydrocortisone for testing if unstable."]),
  w("Adrenal Gland Disorders", "Addison's Disease", ["ES_ADRENAL_INSUFFICIENCY_2016"], ["Salt craving, hyperpigmentation, autoimmune history, weight loss/GI symptoms, orthostasis."], ["Orthostatic vitals, hyperpigmentation including oral mucosa/palmar creases, volume status."], ["8 AM cortisol/ACTH.", "Cosyntropin stimulation.", "Renin/aldosterone.", "21-hydroxylase antibodies."], refs.adrenal, ["Adrenal crisis, severe hyperkalemia, shock, infection."], ["High ACTH plus low cortisol confirms primary pattern; mineralocorticoid deficiency changes therapy to fludrocortisone/salt guidance."], ["primary adrenal insufficiency"]),
  w("Adrenal Gland Disorders", "Cushing's Syndrome", ["ES_CUSHING_DX_2008"], ["Proximal weakness, easy bruising, purple striae, fractures, infections.", "Exogenous glucocorticoids including injections/creams/inhaled.", "Hypertension, diabetes, mood/sleep changes."], ["BP/BMI/waist, proximal strength, bruising/striae/thin skin, supraclavicular/dorsocervical fat, edema."], ["Exclude exogenous steroids.", "1-mg overnight DST: cortisol >1.8 ug/dL abnormal/sensitive cutoff.", "Late-night salivary cortisol, often two samples.", "24-hour urinary free cortisol, at least two collections.", "ACTH after confirmed hypercortisolism."], ["DST, late-night salivary cortisol, and UFC cutoffs are assay-specific; abnormal screening generally needs confirmation."], ["Severe hypokalemia, uncontrolled hypertension/diabetes, infection, psychosis, VTE."], ["Abnormal screening plus convincing phenotype triggers confirmatory/endocrine pathway; ACTH directs adrenal vs ACTH-dependent workup."]),
  w("Adrenal Gland Disorders", "Hyperaldosteronism (Conn's Syndrome)", ["ES_PRIMARY_ALDO_2025"], ["Resistant/early hypertension, OSA, adrenal incidentaloma.", "Hypokalemia, cramps, weakness, polyuria, medication effects on ARR."], ["Blood pressure severity, volume/edema, weakness if hypokalemic."], ["Aldosterone, renin, and ARR with potassium correction.", "Overt PA example: PRA <0.2 ng/mL/h or DRC <2 mU/L with aldosterone >15 ng/dL by LC-MS/MS or >20 ng/dL by immunoassay.", "Adrenal CT and adrenal vein sampling after biochemical diagnosis."], ["ARR cutoffs are assay/unit/medication-specific; interpret with local lab guidance."], ["Severe hypertension, hypokalemic paralysis, arrhythmia, stroke/ACS symptoms."], ["Suppressed renin with clearly elevated aldosterone changes to PA pathway and targeted therapy/subtyping."], ["primary aldosteronism", "Conn syndrome"]),
  w("Adrenal Gland Disorders", "Pheochromocytoma", ["ES_PHEO_PPGL_2014"], ["Episodic headaches, sweating, palpitations, panic-like spells.", "Paroxysmal/resistant hypertension, adrenal incidentaloma, MEN2/VHL/NF1/SDHx history."], ["BP and orthostasis, tachyarrhythmia, volume status, hereditary stigmata if relevant."], ["Plasma free metanephrines or urinary fractionated metanephrines.", "Use proper sampling conditions; supine rest for plasma when possible.", "CT/MRI only after biochemical evidence."], ["Metanephrine intervals are lab and sampling-position-specific; >3x ULN is highly suggestive."], ["Hypertensive crisis, arrhythmia, ACS/stroke symptoms, planned surgery without alpha blockade."], [">3x ULN metanephrines changes to localization/genetic/preoperative alpha-blockade pathway."]),
  w("Adrenal Gland Disorders", "Congenital Adrenal Hyperplasia (CAH)", ["ES_CAH_2018"], ["Neonatal ambiguous genitalia/salt wasting, early pubarche, hirsutism/acne, infertility.", "Family history, glucocorticoid adherence, adrenal crisis history."], ["BP/volume, virilization/genital exam by appropriate specialist, growth/puberty, hyperpigmentation."], ["17-hydroxyprogesterone, often with cosyntropin stimulation.", "Electrolytes, glucose, renin/aldosterone.", "Androgens: testosterone, androstenedione, DHEAS as indicated.", "CYP21A2 genetic testing when diagnosis/family planning unclear."], ["17-OHP thresholds vary by age, gestational age, assay, cycle phase, and timing; morning follicular sampling improves adult NCCAH screening."], ["Salt-wasting crisis, vomiting/dehydration, shock, hypoglycemia."], ["Electrolyte crisis or vomiting changes to emergency steroid/fluid pathway."])
];

const reproductiveDx = [
  w("Reproductive and Gonadal Disorders", "Polycystic Ovary Syndrome (PCOS)", ["PCOS_GUIDELINE_2023"], ["Cycle irregularity, infertility, hirsutism/acne/alopecia.", "Weight/metabolic history, sleep apnea/mood, rapid virilization."], ["BMI/waist/BP, hirsutism/acne/alopecia, acanthosis.", "Pelvic/ultrasound by appropriate clinician if indicated."], ["Pregnancy test.", "Total/free testosterone by reliable assay.", "Exclude mimics: TSH, prolactin, 17-OHP; DHEAS/androstenedione if severe.", "Ovulatory dysfunction criteria; ultrasound or AMH in adults; metabolic screen A1c/OGTT/lipids/BP."], ["Adults: PCOS generally requires 2 of 3 Rotterdam features after excluding mimics: ovulatory dysfunction, hyperandrogenism, PCOM/elevated AMH."], ["Rapid virilization, very high testosterone/DHEAS, pelvic mass, severe abnormal uterine bleeding."], ["Tumor-range androgens or rapid virilization changes to urgent imaging/endocrine evaluation."]),
  w("Reproductive and Gonadal Disorders", "Hypogonadism (Low Testosterone in Men)", ["ES_TESTOSTERONE_2018"], ["Libido, ED, infertility, low energy/mood, muscle loss.", "Puberty history, testicular injury, opioids/anabolic steroids, fertility plans."], ["Testicular size/consistency, body hair/gynecomastia, BMI/waist/BP, visual fields if pituitary concern."], ["Morning total testosterone on two occasions.", "Free testosterone if SHBG altered or total near lower limit.", "LH/FSH.", "Prolactin, iron studies, pituitary evaluation when secondary."], refs.pituitary, ["New severe headache/vision loss, very low T with low/normal LH/FSH, testicular mass, infertility priority."], ["Fertility plans change away from exogenous testosterone; pituitary signs trigger MRI/endocrine referral."]),
  w("Reproductive and Gonadal Disorders", "Menopause / Premature Ovarian Insufficiency", ["ESHRE_POI_2024", "ASRM_AMENORRHEA_2024"], ["Age, last menstrual period, vasomotor/sleep/mood/genitourinary symptoms.", "Pregnancy possibility, chemo/radiation/surgery, autoimmune/family POI."], ["BP/BMI, estrogen-deficiency signs, thyroid/autoimmune clues, pelvic exam when indicated."], ["Pregnancy test if amenorrhea.", "FSH and estradiol for POI; FSH commonly >25 IU/L in context, repeat if uncertainty.", "TSH/prolactin.", "POI etiology/health: karyotype/FMR1/adrenal-thyroid autoimmunity/DXA as indicated."], refs.pituitary, ["Pregnancy, heavy bleeding, pelvic mass symptoms, POI <40 needing bone/cardiovascular/fertility counseling."], ["POI changes routine menopause counseling to etiologic evaluation, fertility counseling, and bone/cardiovascular prevention."], ["POI", "premature ovarian insufficiency"]),
  w("Reproductive and Gonadal Disorders", "Erectile Dysfunction (Endocrine-related)", ["AUA_ED_2018", "ES_TESTOSTERONE_2018"], ["Onset, libido, morning erections, ejaculation/orgasm.", "Diabetes, vascular disease, depression, medications, sleep apnea."], ["BP/BMI/waist, genital/testicular exam, secondary sex characteristics, vascular/neuro exam when indicated."], ["Morning total testosterone.", "A1c/FPG and lipids.", "TSH/prolactin when low libido, gynecomastia, infertility, or pituitary symptoms."], refs.pituitary.concat(refs.glycemia), ["New ED with chest pain/claudication, neurologic deficit, priapism, severe hypogonadism/pituitary symptoms."], ["Low testosterone changes to hypogonadism pathway; diabetes/ASCVD risk changes cardiovascular management."]),
  w("Reproductive and Gonadal Disorders", "Amenorrhea (Absence of menstruation)", ["ASRM_AMENORRHEA_2024"], ["Primary vs secondary amenorrhea, cycle history, pregnancy risk.", "Weight loss/exercise/stress/eating disorder, galactorrhea, headache/vision, hirsutism/acne/hot flashes."], ["BMI/vitals, pubertal development, hirsutism/acne/galactorrhea, thyroid, pelvic exam when indicated."], ["Pregnancy test first.", "TSH and prolactin.", "FSH and estradiol.", "Androgen testing when hyperandrogenism: testosterone, DHEAS, 17-OHP."], refs.pituitary.concat(refs.thyroid), ["Positive pregnancy with pain/bleeding, visual loss/headache, rapid virilization, vital sign instability/eating disorder."], ["FSH/E2 pattern separates ovarian failure from central/hypothalamic causes and changes imaging/referral."]),
  w("Reproductive and Gonadal Disorders", "Infertility (Hormonal causes)", ["ASRM_AMENORRHEA_2024", "PCOS_GUIDELINE_2023", "ES_TESTOSTERONE_2018"], ["Duration trying, cycle regularity, ovulation symptoms.", "Partner semen history, galactorrhea, thyroid symptoms, hyperandrogenism, prior loss."], ["BMI/BP, thyroid, hirsutism/acne, galactorrhea, testicular exam in male partner if in scope."], ["Pregnancy test if amenorrhea.", "TSH/prolactin.", "FSH/estradiol/AMH/antral follicle count as indicated.", "PCOS and androgen labs.", "Semen analysis; male morning testosterone/LH/FSH if indicated."], refs.pituitary.concat(refs.thyroid), ["Amenorrhea with visual symptoms, POI <40, severe hyperandrogenism, recurrent pregnancy loss needing specialist workup."], ["Anovulation, thyroid/prolactin abnormality, POI pattern, or male factor changes treatment/referral."]),
  w("Reproductive and Gonadal Disorders", "Gynecomastia (Enlarged male breast tissue)", ["ES_TESTOSTERONE_2018", "ES_HYPERPROLACTINEMIA_2011"], ["Duration, pain/tenderness, unilateral mass/nipple discharge.", "Medications, cannabis/alcohol, liver/kidney disease, libido/ED/testicular symptoms."], ["Glandular vs adiposity, breast mass/skin/nipple/nodes, testicular exam, thyroid/liver signs."], ["Total testosterone, LH, FSH, estradiol.", "hCG if suspicious; consider AFP/testicular ultrasound if tumor concern.", "TSH, prolactin, liver/kidney function."], refs.pituitary, ["Hard eccentric breast mass, nipple discharge, skin changes, nodes, testicular mass, rapid progression."], ["Testicular mass/hCG elevation changes to urgent tumor pathway; hypogonadism pattern changes endocrine workup."]),
  w("Reproductive and Gonadal Disorders", "Hirsutism (Excessive hair growth)", ["ES_HIRSUTISM_2018", "PCOS_GUIDELINE_2023"], ["Onset/progression, virilization, menstrual irregularity.", "Acne/alopecia, infertility, medications, family/ethnic hair pattern."], ["Ferriman-Gallwey pattern/severity, virilization signs, acne/alopecia, BMI/BP/acanthosis."], ["Total testosterone and free testosterone when indicated.", "Early morning 17-OHP.", "DHEAS when severe/rapid.", "TSH/prolactin/metabolic PCOS tests when menstrual disturbance."], refs.pituitary, ["Rapid onset, virilization, very high testosterone/DHEAS, pelvic/adrenal mass symptoms."], ["Tumor-range androgens or virilization changes to urgent imaging/endocrine pathway."])
];

const pituitaryDx = [
  w("Pituitary Gland Disorders", "Prolactinoma (Benign pituitary tumor)", ["ES_HYPERPROLACTINEMIA_2011"], ["Galactorrhea, amenorrhea/oligomenorrhea, infertility, low libido/ED.", "Headache/visual symptoms, dopamine antagonist/opioid/metoclopramide use, pregnancy/lactation."], ["Visual fields, galactorrhea/breast exam when appropriate, hypogonadism signs, cranial nerve symptoms."], ["Serum prolactin; repeat/macroprolactin if mild/discordant.", "Pregnancy test, TSH/free T4, renal function.", "Pituitary MRI after persistent unexplained elevation or mass symptoms."], refs.pituitary, ["Visual field deficit, severe headache/apoplexy, cranial nerve palsy, pregnancy with macroadenoma symptoms."], ["Mass effect or macroadenoma changes urgency and ophthalmology/neurosurgery involvement."]),
  w("Pituitary Gland Disorders", "Acromegaly", ["PITUITARY_ACROMEGALY_2021"], ["Enlarging hands/feet, ring/shoe size, facial changes.", "Headache/vision, sweating, arthralgia, sleep apnea, diabetes, hypertension, colon polyps."], ["Coarse facial features, macroglossia, jaw spacing, hand/foot enlargement, BP/cardiac signs, visual fields."], ["IGF-1 age/sex-adjusted.", "Oral glucose GH suppression test: failure to suppress below assay cutoff, often <1 ng/mL or lower with modern assays.", "Pituitary MRI after biochemical evidence.", "A1c/BP/OSA/echo/colon risk screening."], refs.pituitary, ["Visual field loss, pituitary apoplexy, severe cardiomyopathy, uncontrolled diabetes/OSA."], ["Elevated IGF-1 plus inadequate GH suppression changes to pituitary MRI/surgical pathway."]),
  w("Pituitary Gland Disorders", "Gigantism", ["PITUITARY_ACROMEGALY_2021"], ["Accelerated linear growth, headache/vision, puberty timing, family heights.", "Sweating, sleep apnea, joint pain."], ["Height/weight/growth velocity plotted, pubertal staging, coarse features, visual fields."], ["IGF-1 age/puberty-adjusted.", "GH suppression after oral glucose.", "Bone age and growth assessment.", "Pituitary MRI after biochemical evidence."], ["Pediatric/puberty-specific reference ranges are mandatory; adult cutoffs are not sufficient."], ["Visual symptoms, severe headache, rapid growth acceleration, pituitary apoplexy."], ["Confirmed GH excess before epiphyseal closure changes urgency of pediatric pituitary treatment."]),
  w("Pituitary Gland Disorders", "Hypopituitarism", ["ES_HYPOPITUITARISM_2016"], ["Pituitary surgery/radiation/tumor/apoplexy/head trauma.", "Fatigue, hypotension, cold intolerance, amenorrhea/ED/low libido, polyuria/polydipsia, headache/vision."], ["Orthostatic vitals, visual fields, secondary sex characteristics, thyroid/skin signs, volume status."], ["8 AM cortisol +/- ACTH stimulation.", "Free T4 with TSH.", "LH/FSH with testosterone or estradiol.", "Prolactin, IGF-1 and dynamic GH testing when indicated.", "Pituitary MRI."], refs.adrenal.concat(refs.thyroid, refs.pituitary), ["Adrenal crisis, pituitary apoplexy, visual loss, severe hyponatremia."], ["Central adrenal insufficiency must be addressed before thyroid hormone escalation."]),
  w("Pituitary Gland Disorders", "Diabetes Insipidus", ["ENDOTEXT_DI_2026", "SFE_CDI_2018"], ["24-hour urine volume, nocturia, thirst, access to water.", "Lithium, hypercalcemia, hypokalemia, kidney disease, pituitary surgery/trauma/tumor."], ["Volume status and orthostatic vitals, mental status, mucous membranes, neurologic/pituitary mass signs."], ["Confirm hypotonic polyuria: adult urine volume often >3 L/day or >40-50 mL/kg/day with urine osmolality often <300 mOsm/kg.", "Serum sodium/plasma osmolality.", "Exclude osmotic diuresis: glucose, calcium, potassium, renal function.", "Water deprivation/desmopressin or copeptin-based test."], ["Serum sodium normal about 135-145 mmol/L; SFE inpatient CDI guidance: 146-149 mild, 150-159 moderate, >160 severe hypernatremia.", "Urine osmolality <300 mOsm/kg is hypotonic; >800 often argues against DI."], ["Hypernatremia, inability to drink, impaired consciousness, postoperative pituitary patient without desmopressin access."], ["Hypernatremia or impaired water access changes to urgent monitored fluid/desmopressin pathway."], ["AVP deficiency", "central DI", "nephrogenic DI"]),
  w("Pituitary Gland Disorders", "Cushing's Disease (Pituitary-dependent Cushing's)", ["ES_CUSHING_DX_2008", "ES_HYPOPITUITARISM_2016"], ["Cushing phenotype plus headache/vision symptoms.", "Cyclic symptoms, exogenous steroid exclusion, menstrual/hypogonadal symptoms."], ["Cushing phenotype, BP/glucose complications, proximal weakness/skin, visual fields."], ["First confirm endogenous Cushing with UFC, late-night salivary cortisol, or 1-mg DST cortisol >1.8 ug/dL.", "ACTH: normal/high supports ACTH-dependent disease.", "Pituitary MRI.", "Inferior petrosal sinus sampling when MRI equivocal/discordant."], ["Post-1 mg DST cortisol >1.8 ug/dL is a sensitive abnormal screen; late-night salivary and UFC cutoffs are assay-specific."], ["Severe hypercortisolism with infection, hypokalemia, psychosis, VTE, uncontrolled hypertension/diabetes."], ["ACTH-dependent confirmed Cushing plus pituitary localization changes to pituitary surgery pathway; discordance triggers IPSS."])
];

const workups = [...dx, ...moreDx, ...reproductiveDx, ...pituitaryDx];

function resolveAppSupport(row) {
  const query = [row.diagnosis, ...row.aliases].join(" ");
  const result = resolveClinicalIntents(query, clinicalIntentRegistry, { limit: 4, minScore: 24 });
  return result.validatedMatches.map((intent) => ({ intent_id: intent.intent_id, label: intent.label, score: intent.score }));
}

function validate(row) {
  const issues = [];
  const validSources = new Set(Object.keys(sources));
  for (const key of ["category", "diagnosis"]) if (!row[key]) issues.push(`missing ${key}`);
  for (const key of ["source_ids", "questions", "exam", "tests", "reference_values", "red_flags", "management_changes"]) {
    if (!Array.isArray(row[key]) || !row[key].length) issues.push(`missing ${key}`);
  }
  for (const sourceId of row.source_ids || []) if (!validSources.has(sourceId)) issues.push(`unknown source ${sourceId}`);
  const hasNumericValue = [...row.tests, ...row.reference_values].some((value) => /(?:>=|<=|>|<|\d)/.test(String(value)));
  if (!hasNumericValue) issues.push("missing reference values or thresholds");
  return issues;
}

function formatList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function formatReport(results) {
  const categoryCounts = new Map();
  for (const row of results) categoryCounts.set(row.category, (categoryCounts.get(row.category) || 0) + 1);
  const lines = [
    "# Endocrine Diagnosis Workup Automation Report",
    "",
    `Generated: ${generatedAt}`,
    `Sources accessed/checked: ${accessedDate}`,
    `Diagnoses requested: ${results.length}`,
    `Quality validation: ${results.every((row) => !row.quality_issues.length) ? "pass" : "review required"}`,
    "",
    "Important caveat: reference ranges vary by laboratory, assay, pregnancy status, age, sex, puberty, albumin, and acute illness. The values below are triage/diagnostic anchors, not substitutes for local lab interpretation.",
    "",
    "## Coverage Summary",
    "",
    ...Array.from(categoryCounts.entries()).map(([category, count]) => `- ${category}: ${count}`),
    `- Current app validated-intent matches: ${results.filter((row) => row.app_intent_matches.length).length}/${results.length}`,
    `- Current app registry gaps: ${results.filter((row) => !row.app_intent_matches.length).length}/${results.length}`,
    "",
    "## Guideline Source Registry",
    ""
  ];
  for (const [id, [title, url]] of Object.entries(sources)) {
    lines.push(`- ${id}: ${title}. ${url}`);
  }
  results.forEach((row, index) => {
    lines.push(
      "",
      `## ${index + 1}. ${row.diagnosis}`,
      "",
      `Category: ${row.category}`,
      `Quality status: ${row.quality_issues.length ? "review" : "pass"}`,
      `Current app support: ${row.app_intent_matches.length ? row.app_intent_matches.map((match) => `${match.intent_id} (${match.score})`).join("; ") : "registry gap - needs validated clinical intent/knowledge pack before app recommendations"}`,
      `Guidelines: ${row.source_ids.join("; ")}`,
      "",
      "Clinical questions:",
      formatList(row.questions),
      "",
      "Focused physical exam:",
      formatList(row.exam),
      "",
      "Diagnostic workup and reference values:",
      formatList(row.tests),
      "",
      "Reference ranges / diagnostic thresholds:",
      formatList(row.reference_values),
      "",
      "Red flags:",
      formatList(row.red_flags),
      "",
      "Results that change management:",
      formatList(row.management_changes)
    );
    if (row.quality_issues.length) {
      lines.push("", "Quality issues:", formatList(row.quality_issues));
    }
  });
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const args = { out: "reports/endocrine-workups-2026-06-06.md", json: "reports/endocrine-workups-2026-06-06.json" };
  argv.forEach((arg) => {
    const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
    const value = valueParts.join("=");
    if (key === "out") args.out = value;
    if (key === "json") args.json = value;
  });
  return args;
}

function write(path, text) {
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, "utf8");
  return abs;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = workups.map((row) => ({
    ...row,
    app_intent_matches: resolveAppSupport(row),
    quality_issues: validate(row)
  }));
  const reportPath = write(args.out, formatReport(results));
  const jsonPath = write(args.json, `${JSON.stringify({ generated_at: generatedAt, accessed_date: accessedDate, sources, workups: results }, null, 2)}\n`);
  const issueCount = results.reduce((sum, row) => sum + row.quality_issues.length, 0);
  const registryGapCount = results.filter((row) => !row.app_intent_matches.length).length;
  process.stdout.write(`Generated ${results.length} endocrine workups: ${reportPath}\n`);
  process.stdout.write(`JSON: ${jsonPath}\n`);
  process.stdout.write(`Quality issues: ${issueCount}; current app registry gaps: ${registryGapCount}\n`);
}

main();
