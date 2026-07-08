import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { clinicalIntentRegistry, resolveClinicalIntents } from "../src/clinical/clinical-intents.js";
import { evaluateComplaintCds, isBasicBedsideDataItem } from "../src/clinical/complaint-cds.js";
import { moduleFromWorkup } from "./install-endocrine-workups.js";

const generatedAt = new Date().toISOString();
const accessedDate = "2026-06-06";

const sources = {
  ADA_SOC_2026: ["ADA Standards of Care in Diabetes 2026", "https://professional.diabetes.org/standards-of-care/practice-guidelines-resources"],
  ADA_DIAGNOSIS_2026: ["ADA Diagnosis and Classification of Diabetes 2026", "https://diabetesjournals.org/care/article/49/Supplement_1/S27/163926/2-Diagnosis-and-Classification-of-Diabetes"],
  ADA_HYPERGLYCEMIC_CRISES_2024: ["Hyperglycemic Crises in Adults With Diabetes Consensus Report 2024", "https://diabetesjournals.org/care/article/47/8/1257/156808/Hyperglycemic-Crises-in-Adults-With-Diabetes-A"],
  ATA_HYPOTHYROIDISM_2014: ["ATA Guidelines for the Treatment of Hypothyroidism", "https://www.thyroid.org/professionals/ata-professional-guidelines/"],
  AACE_ATA_HYPOTHYROIDISM_2012: ["AACE/ATA Hypothyroidism in Adults Guideline", "https://www.guidelinecentral.com/guideline/6855/"],
  ATA_HYPERTHYROIDISM_2016: ["ATA Hyperthyroidism and Thyrotoxicosis Guideline", "https://journals.sagepub.com/doi/10.1089/thy.2016.0229"],
  ATA_THYROID_NODULE_DTC_2015: ["ATA Thyroid Nodules and Differentiated Thyroid Cancer Guideline", "https://www.thyroid.org/professionals/ata-professional-guidelines/"],
  ETA_THYROID_NODULE_2023: ["2023 European Thyroid Association Thyroid Nodule Guideline", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10448590/"],
  ATA_THYROID_CANCER_2025: ["ATA Differentiated Thyroid Cancer Guideline Resource", "https://www.thyroid.org/professionals/ata-professional-guidelines/"],
  AACE_OSTEOPOROSIS_2020: ["AACE Clinical Practice Guideline for Postmenopausal Osteoporosis", "https://pro.aace.com/clinical-guidance/2020-clinical-practice-guidelines-diagnosis-and-treatment-postmenopausal"],
  ENDO_OSTEOPOROSIS_2020: ["Endocrine Society Osteoporosis Pharmacologic Management Guideline Update", "https://academic.oup.com/jcem/article/105/3/587/5739968"],
  PHPT_WORKSHOP_2022: ["Fifth International Workshop Primary Hyperparathyroidism Guidelines", "https://onlinelibrary.wiley.com/doi/10.1002/jbmr.4677"],
  HYPOPARA_TASK_FORCE_2022: ["2022 International Task Force Hypoparathyroidism Guidelines", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10118814/"],
  ENDO_VITD_2024: ["Endocrine Society Vitamin D for Prevention of Disease Guideline", "https://www.endocrine.org/clinical-practice-guidelines/vitamin-d-for-prevention-of-disease"],
  NIH_VITD_FACTSHEET: ["NIH ODS Vitamin D Health Professional Fact Sheet", "https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/"],
  ES_ADRENAL_INSUFFICIENCY_2016: ["Endocrine Society Primary Adrenal Insufficiency Guideline", "https://www.endocrine.org/clinical-practice-guidelines/primary-adrenal-insufficiency"],
  ES_CUSHING_DX_2008: ["Endocrine Society Diagnosis of Cushing Syndrome Guideline", "https://academic.oup.com/jcem/article/93/5/1526/2598096"],
  ES_CUSHING_TREATMENT_2015: ["Endocrine Society Treatment of Cushing Syndrome Guideline", "https://www.endocrine.org/clinical-practice-guidelines/treatment-of-cushing-syndrome"],
  ESE_ADRENAL_INCIDENTALOMA_2023: ["European Society of Endocrinology Adrenal Incidentaloma Guideline", "https://academic.oup.com/ejendo/article/189/1/G1/7198474"],
  ES_PRIMARY_ALDO_2025: ["Endocrine Society Primary Aldosteronism Guideline 2025", "https://www.endocrine.org/clinical-practice-guidelines/primary-aldosteronism-2"],
  ES_PHEO_PPGL_2014: ["Endocrine Society Pheochromocytoma/Paraganglioma Guideline", "https://pubmed.ncbi.nlm.nih.gov/24893135/"],
  ES_CAH_2018: ["Endocrine Society Congenital Adrenal Hyperplasia Guideline", "https://pmc.ncbi.nlm.nih.gov/articles/PMC6456929/"],
  PCOS_GUIDELINE_2023: ["2023 International Evidence-based PCOS Guideline", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10755126/"],
  ES_TESTOSTERONE_2018: ["Endocrine Society Testosterone Therapy in Men With Hypogonadism Guideline", "https://doi.org/10.1210/JC.2018-00229"],
  AUA_TESTOSTERONE_2024: ["AUA Testosterone Deficiency Guideline; validity confirmed 2024", "https://www.auanet.org/guidelines-and-quality/guidelines/testosterone-deficiency-guideline"],
  AUA_ED_2018: ["AUA Erectile Dysfunction Guideline", "https://www.auanet.org/guidelines-and-quality/guidelines/erectile-dysfunction-%28ed%29-guideline"],
  MENOPAUSE_SOCIETY_HT_2022: ["The Menopause Society Hormone Therapy Position Statement", "https://www.menopause.org/publications/clinical-practice-materials/the-2022-hormone-therapy-position-statement-of-the-north-american-menopause-society"],
  IMS_MENOPAUSE_2026: ["International Menopause Society Recommendations and Key Messages on Women's Midlife Health and Menopause", "https://www.imsociety.org/statements/ims-recommendations/"],
  ESHRE_POI_2024: ["International Guideline on Premature Ovarian Insufficiency 2024", "https://www.eshre.eu/-/media/sitecore-files/Guidelines/POI/2024/INTERNATIONAL-GUIDELINE-ON-POI_2024_2.pdf"],
  ASRM_AMENORRHEA_2024: ["ASRM Current Evaluation of Amenorrhea Committee Opinion 2024", "https://www.asrm.org/practice-guidance/practice-committee-documents/current-evaluation-of-amenorrhea/"],
  ES_HIRSUTISM_2018: ["Endocrine Society Hirsutism Guideline", "https://www.endocrine.org/clinical-practice-guidelines/hirsutism"],
  ES_HYPERPROLACTINEMIA_2011: ["Endocrine Society Hyperprolactinemia Guideline", "https://www.guidelinecentral.com/guideline/41733/"],
  PITUITARY_PROLACTINOMA_2023: ["Pituitary Society Prolactinoma International Consensus Statement", "https://www.nature.com/articles/s41574-023-00886-5"],
  ES_HYPOPITUITARISM_2016: ["Endocrine Society Hormone Replacement in Hypopituitarism Guideline", "https://www.endocrine.org/clinical-practice-guidelines/hormone-replacement-in-hypopituitarism"],
  ES_ACROMEGALY_2014: ["Endocrine Society Acromegaly Clinical Practice Guideline", "https://www.endocrine.org/clinical-practice-guidelines/acromegaly"],
  PITUITARY_ACROMEGALY_2021: ["Pituitary Society Update to Acromegaly Management Guidelines", "https://pituitarysociety.org/wp-content/uploads/2024/04/A-Pituitary-Society-Update-to-Acromegaly-Management-Guidelines.pdf"],
  ACROMEGALY_DIAGNOSIS_REMISSION_2024: ["Acromegaly Consensus Group Criteria for Diagnosis and Remission", "https://pubmed.ncbi.nlm.nih.gov/37923946/"],
  ACROMEGALY_COMPLICATIONS_2026: ["Acromegaly Consensus Group Complications Update", "https://pmc.ncbi.nlm.nih.gov/articles/PMC13124806/"],
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
  w("Thyroid Disorders", "Hypothyroidism (Underactive Thyroid)", ["ATA_HYPOTHYROIDISM_2014", "AACE_ATA_HYPOTHYROIDISM_2012"],
    ["Fatigue, cold intolerance, constipation, weight gain, depression, menorrhagia.", "Amiodarone, lithium, immune checkpoint inhibitor, pregnancy/fertility context."],
    ["HR/BP, thyroid size/nodules.", "Delayed reflexes, edema, skin/hair.", "Mental status if severe."],
    ["TSH and free T4.", "TPO antibody for autoimmune etiology.", "Pregnancy test when relevant; pituitary/adrenal evaluation if central pattern."],
    refs.thyroid,
    ["Myxedema coma features: hypothermia, bradycardia, hypotension, hypoventilation, hyponatremia, altered mental status."],
    ["High TSH plus low FT4 confirms overt primary hypothyroidism.", "Low FT4 with low/normal TSH triggers central hypothyroidism/pituitary pathway."], ["underactive thyroid"]),
  w("Thyroid Disorders", "Hashimoto's Thyroiditis (Autoimmune Hypothyroidism)", ["ATA_HYPOTHYROIDISM_2014", "AACE_ATA_HYPOTHYROIDISM_2012", "ATA_THYROID_NODULE_DTC_2015", "ETA_THYROID_NODULE_2023"],
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
  w("Thyroid Disorders", "Thyroid Nodules (Benign)", ["ATA_THYROID_NODULE_DTC_2015", "ETA_THYROID_NODULE_2023"],
    ["Growth, dysphagia, dyspnea, hoarseness.", "Radiation exposure, family thyroid cancer/MEN2, hyperthyroid symptoms."],
    ["Thyroid palpation, cervical nodes, voice/airway assessment."],
    ["TSH.", "High-quality thyroid ultrasound with risk stratification.", "FNA when indicated by size/risk system; low TSH prompts radionuclide scan."],
    refs.thyroid.concat(["FNA size thresholds are risk-system-specific; high-risk nodules are sampled at smaller sizes than low-risk nodules."]),
    ["Hard fixed nodule, rapid growth, vocal cord symptoms, suspicious lymph nodes, childhood radiation, MEN2 family history."],
    ["Suspicious ultrasound/Bethesda cytology changes cancer pathway.", "Low TSH with hot nodule shifts to autonomous-function pathway."], ["benign thyroid nodule"]),
  w("Thyroid Disorders", "Thyroid Cancer (Papillary, Follicular, Medullary)", ["ATA_THYROID_CANCER_2025", "ATA_THYROID_NODULE_DTC_2015", "ETA_THYROID_NODULE_2023"],
    ["Compressive symptoms, hoarseness, radiation history, family thyroid cancer/MEN2.", "Diarrhea/flushing if medullary disease possible.", "Prior FNA Bethesda category."],
    ["Thyroid mass and cervical nodal mapping by exam.", "Voice/airway; hyper/hypothyroid signs."],
    ["Neck ultrasound and nodal mapping.", "FNA cytology with Bethesda category.", "TSH/free T4.", "Calcitonin and CEA when medullary thyroid cancer suspected/confirmed.", "RET testing for medullary thyroid cancer."],
    refs.thyroid.concat(["Calcitonin/CEA thresholds are assay-specific; RET positivity changes family screening and surgical planning."]),
    ["Airway compromise, vocal cord paralysis, bulky nodes, rapidly enlarging mass, suspected anaplastic transformation."],
    ["Bethesda V/VI, suspicious nodes, calcitonin/CEA elevation, or RET positivity changes surgical/genetic pathway."], ["papillary thyroid cancer", "follicular thyroid cancer", "medullary thyroid cancer"])
];

const moreDx = [
  w("Bone and Parathyroid Disorders", "Osteoporosis", ["ENDO_OSTEOPOROSIS_2020", "AACE_OSTEOPOROSIS_2020"], ["Fragility fracture, falls, height loss/back pain.", "Glucocorticoids, aromatase inhibitors, androgen deprivation, menopause, calcium/vitamin D intake."], ["Height/weight, kyphosis/spine tenderness, gait/fall risk.", "Dental/jaw risk before antiresorptive therapy."], ["DXA and vertebral imaging when indicated.", "Calcium, phosphorus, creatinine/eGFR, alkaline phosphatase, 25(OH)D, PTH, TSH/CBC/CMP and secondary-cause labs as indicated."], refs.bone, ["New severe back pain, neurologic symptoms, hip fracture, multiple fragility fractures."], ["T-score <= -2.5 or fragility fracture confirms osteoporosis.", "Hip/vertebral fracture or very low T-score changes to high/very-high-risk pathway."]),
  w("Bone and Parathyroid Disorders", "Osteopenia", ["ENDO_OSTEOPOROSIS_2020", "AACE_OSTEOPOROSIS_2020"], ["Fracture/fall risk, menopause, family hip fracture, steroid exposure."], ["Height, gait/balance, spine tenderness/kyphosis."], ["DXA.", "FRAX or validated fracture-risk tool.", "Calcium, creatinine/eGFR, 25(OH)D, and secondary-cause labs when indicated."], refs.bone, ["Fragility fracture despite osteopenic T-score, rapid bone loss, secondary cause signs."], ["Osteopenia plus high fracture risk or fragility fracture can warrant pharmacologic therapy."]),
  w("Bone and Parathyroid Disorders", "Primary Hyperparathyroidism", ["PHPT_WORKSHOP_2022"], ["Kidney stones, fractures, bone pain, constipation, neurocognitive symptoms.", "Lithium/thiazides, calcium/vitamin D, family MEN/FHH."], ["Volume status if hypercalcemic, bone tenderness/fracture signs, neuromuscular weakness."], ["Repeat albumin-corrected/ionized calcium with intact PTH.", "25(OH)D, phosphorus, creatinine/eGFR.", "24-hour urine calcium and Ca/Cr clearance ratio; renal imaging and DXA."], refs.bone.concat(["PHPT: high calcium with elevated or inappropriately normal PTH; FHH often Ca/Cr clearance ratio <0.01 but overlap exists."]), ["Severe hypercalcemia, dehydration, AKI, confusion, pancreatitis."], ["Ca >1 mg/dL above ULN, osteoporosis/fracture, stones, reduced renal function, or age criteria can change to surgical pathway."]),
  w("Bone and Parathyroid Disorders", "Hypoparathyroidism", ["HYPOPARA_TASK_FORCE_2022"], ["Post-neck surgery/radiation, paresthesias, cramps, tetany, seizures.", "Calcium/vitamin D therapy and kidney stones."], ["Neuromuscular irritability, Chvostek/Trousseau when appropriate, mental status if severe."], ["Calcium plus PTH.", "Phosphorus, magnesium, creatinine/eGFR, 25(OH)D.", "24-hour urine calcium during chronic treatment."], refs.bone.concat(["Hypoparathyroidism: low calcium with low or inappropriately normal PTH, often high phosphorus."]), ["Seizure, laryngospasm, arrhythmia/QT prolongation, severe symptomatic hypocalcemia."], ["Symptomatic or severe hypocalcemia changes to urgent calcium replacement and ECG monitoring."]),
  w("Bone and Parathyroid Disorders", "Vitamin D Deficiency / Osteomalacia", ["ENDO_VITD_2024", "NIH_VITD_FACTSHEET"], ["Bone pain, proximal weakness, falls.", "Malabsorption/bariatric surgery, CKD/liver disease, anticonvulsants, diet/sun exposure."], ["Proximal strength, bone tenderness, gait/falls, hypocalcemia signs."], ["25(OH)D when clinically indicated.", "Calcium, phosphorus, alkaline phosphatase, PTH, creatinine/eGFR."], refs.bone.concat(["Osteomalacia pattern can include low/normal calcium, low phosphorus, high alkaline phosphatase, and secondary high PTH."]), ["Severe hypocalcemia symptoms, fracture, profound weakness, malabsorption/high-risk state."], ["Low 25(OH)D with symptoms or osteomalacia labs changes from prevention advice to treatment and etiology evaluation."]),
  w("Adrenal Gland Disorders", "Adrenal Insufficiency", ["ES_ADRENAL_INSUFFICIENCY_2016"], ["Fatigue, weight loss, anorexia, nausea/vomiting, abdominal pain, salt craving.", "Steroid exposure/withdrawal, pituitary disease, autoimmune disease, orthostasis."], ["Orthostatic vitals, volume status, hyperpigmentation in primary AI, mental status if crisis, abdominal exam."], ["8 AM cortisol and ACTH.", "Cosyntropin stimulation test.", "BMP/glucose; renin/aldosterone and 21-hydroxylase Ab if primary suspected."], refs.adrenal, ["Shock, vomiting/dehydration, hypoglycemia, severe hyponatremia/hyperkalemia, altered mental status."], ["Suspected adrenal crisis should be treated urgently; do not delay hydrocortisone for testing if unstable."]),
  w("Adrenal Gland Disorders", "Addison's Disease", ["ES_ADRENAL_INSUFFICIENCY_2016"], ["Salt craving, hyperpigmentation, autoimmune history, weight loss/GI symptoms, orthostasis."], ["Orthostatic vitals, hyperpigmentation including oral mucosa/palmar creases, volume status."], ["8 AM cortisol/ACTH.", "Cosyntropin stimulation.", "Renin/aldosterone.", "21-hydroxylase antibodies."], refs.adrenal, ["Adrenal crisis, severe hyperkalemia, shock, infection."], ["High ACTH plus low cortisol confirms primary pattern; mineralocorticoid deficiency changes therapy to fludrocortisone/salt guidance."], ["primary adrenal insufficiency"]),
  w("Adrenal Gland Disorders", "Cushing's Syndrome", ["ES_CUSHING_DX_2008", "ES_CUSHING_TREATMENT_2015", "ESE_ADRENAL_INCIDENTALOMA_2023"], ["Proximal weakness, easy bruising, purple striae, fractures, infections.", "Exogenous glucocorticoids including injections/creams/inhaled.", "Hypertension, diabetes, mood/sleep changes."], ["BP/BMI/waist, proximal strength, bruising/striae/thin skin, supraclavicular/dorsocervical fat, edema."], ["Exclude exogenous steroids.", "1-mg overnight DST: cortisol >1.8 ug/dL abnormal/sensitive cutoff.", "Late-night salivary cortisol, often two samples.", "24-hour urinary free cortisol, at least two collections.", "ACTH after confirmed hypercortisolism."], ["DST, late-night salivary cortisol, and UFC cutoffs are assay-specific; abnormal screening generally needs confirmation."], ["Severe hypokalemia, uncontrolled hypertension/diabetes, infection, psychosis, VTE."], ["Abnormal screening plus convincing phenotype triggers confirmatory/endocrine pathway; ACTH directs adrenal vs ACTH-dependent workup."]),
  w("Adrenal Gland Disorders", "Hyperaldosteronism (Conn's Syndrome)", ["ES_PRIMARY_ALDO_2025"], ["Resistant/early hypertension, OSA, adrenal incidentaloma.", "Hypokalemia, cramps, weakness, polyuria, medication effects on ARR."], ["Blood pressure severity, volume/edema, weakness if hypokalemic."], ["Aldosterone, renin, and ARR with potassium correction.", "Overt PA example: PRA <0.2 ng/mL/h or DRC <2 mU/L with aldosterone >15 ng/dL by LC-MS/MS or >20 ng/dL by immunoassay.", "Adrenal CT and adrenal vein sampling after biochemical diagnosis."], ["ARR cutoffs are assay/unit/medication-specific; interpret with local lab guidance."], ["Severe hypertension, hypokalemic paralysis, arrhythmia, stroke/ACS symptoms."], ["Suppressed renin with clearly elevated aldosterone changes to PA pathway and targeted therapy/subtyping."], ["primary aldosteronism", "Conn syndrome"]),
  w("Adrenal Gland Disorders", "Pheochromocytoma", ["ES_PHEO_PPGL_2014", "ESE_ADRENAL_INCIDENTALOMA_2023"], ["Episodic headaches, sweating, palpitations, panic-like spells.", "Paroxysmal/resistant hypertension, adrenal incidentaloma, MEN2/VHL/NF1/SDHx history."], ["BP and orthostasis, tachyarrhythmia, volume status, hereditary stigmata if relevant."], ["Plasma free metanephrines or urinary fractionated metanephrines.", "Use proper sampling conditions; supine rest for plasma when possible.", "CT/MRI only after biochemical evidence."], ["Metanephrine intervals are lab and sampling-position-specific; >3x ULN is highly suggestive."], ["Hypertensive crisis, arrhythmia, ACS/stroke symptoms, planned surgery without alpha blockade."], [">3x ULN metanephrines changes to localization/genetic/preoperative alpha-blockade pathway."]),
  w("Adrenal Gland Disorders", "Congenital Adrenal Hyperplasia (CAH)", ["ES_CAH_2018"], ["Neonatal ambiguous genitalia/salt wasting, early pubarche, hirsutism/acne, infertility.", "Family history, glucocorticoid adherence, adrenal crisis history."], ["BP/volume, virilization/genital exam by appropriate specialist, growth/puberty, hyperpigmentation."], ["17-hydroxyprogesterone, often with cosyntropin stimulation.", "Electrolytes, glucose, renin/aldosterone.", "Androgens: testosterone, androstenedione, DHEAS as indicated.", "CYP21A2 genetic testing when diagnosis/family planning unclear."], ["17-OHP thresholds vary by age, gestational age, assay, cycle phase, and timing; morning follicular sampling improves adult NCCAH screening."], ["Salt-wasting crisis, vomiting/dehydration, shock, hypoglycemia."], ["Electrolyte crisis or vomiting changes to emergency steroid/fluid pathway."])
];

const reproductiveDx = [
  w("Reproductive and Gonadal Disorders", "Polycystic Ovary Syndrome (PCOS)", ["PCOS_GUIDELINE_2023"], ["Cycle irregularity, infertility, hirsutism/acne/alopecia.", "Weight/metabolic history, sleep apnea/mood, rapid virilization."], ["BMI/waist/BP, hirsutism/acne/alopecia, acanthosis.", "Pelvic/ultrasound by appropriate clinician if indicated."], ["Pregnancy test.", "Total/free testosterone by reliable assay.", "Exclude mimics: TSH, prolactin, 17-OHP; DHEAS/androstenedione if severe.", "Ovulatory dysfunction criteria; ultrasound or AMH in adults; metabolic screen A1c/OGTT/lipids/BP."], ["Adults: PCOS generally requires 2 of 3 Rotterdam features after excluding mimics: ovulatory dysfunction, hyperandrogenism, PCOM/elevated AMH."], ["Rapid virilization, very high testosterone/DHEAS, pelvic mass, severe abnormal uterine bleeding."], ["Tumor-range androgens or rapid virilization changes to urgent imaging/endocrine evaluation."]),
  w("Reproductive and Gonadal Disorders", "Hypogonadism (Low Testosterone in Men)", ["ES_TESTOSTERONE_2018", "AUA_TESTOSTERONE_2024"], ["Libido, ED, infertility, low energy/mood, muscle loss.", "Puberty history, testicular injury, opioids/anabolic steroids, fertility plans."], ["Testicular size/consistency, body hair/gynecomastia, BMI/waist/BP, visual fields if pituitary concern."], ["Morning total testosterone on two occasions.", "Free testosterone if SHBG altered or total near lower limit.", "LH/FSH.", "Prolactin, iron studies, pituitary evaluation when secondary."], refs.pituitary, ["New severe headache/vision loss, very low T with low/normal LH/FSH, testicular mass, infertility priority."], ["Fertility plans change away from exogenous testosterone; pituitary signs trigger MRI/endocrine referral."]),
  w("Reproductive and Gonadal Disorders", "Menopause / Premature Ovarian Insufficiency", ["ESHRE_POI_2024", "ASRM_AMENORRHEA_2024", "IMS_MENOPAUSE_2026", "MENOPAUSE_SOCIETY_HT_2022"], ["Age, last menstrual period, vasomotor/sleep/mood/genitourinary symptoms.", "Pregnancy possibility, chemo/radiation/surgery, autoimmune/family POI."], ["BP/BMI, estrogen-deficiency signs, thyroid/autoimmune clues, pelvic exam when indicated."], ["Pregnancy test if amenorrhea.", "FSH and estradiol for POI; FSH commonly >25 IU/L in context, repeat if uncertainty.", "TSH/prolactin.", "POI etiology/health: karyotype/FMR1/adrenal-thyroid autoimmunity/DXA as indicated."], refs.pituitary, ["Pregnancy, heavy bleeding, pelvic mass symptoms, POI <40 needing bone/cardiovascular/fertility counseling."], ["POI changes routine menopause counseling to etiologic evaluation, fertility counseling, and bone/cardiovascular prevention."], ["POI", "premature ovarian insufficiency"]),
  w("Reproductive and Gonadal Disorders", "Erectile Dysfunction (Endocrine-related)", ["AUA_ED_2018", "ES_TESTOSTERONE_2018", "AUA_TESTOSTERONE_2024"], ["Onset, libido, morning erections, ejaculation/orgasm.", "Diabetes, vascular disease, depression, medications, sleep apnea."], ["BP/BMI/waist, genital/testicular exam, secondary sex characteristics, vascular/neuro exam when indicated."], ["Morning total testosterone.", "A1c/FPG and lipids.", "TSH/prolactin when low libido, gynecomastia, infertility, or pituitary symptoms."], refs.pituitary.concat(refs.glycemia), ["New ED with chest pain/claudication, neurologic deficit, priapism, severe hypogonadism/pituitary symptoms."], ["Low testosterone changes to hypogonadism pathway; diabetes/ASCVD risk changes cardiovascular management."]),
  w("Reproductive and Gonadal Disorders", "Amenorrhea (Absence of menstruation)", ["ASRM_AMENORRHEA_2024"], ["Primary vs secondary amenorrhea, cycle history, pregnancy risk.", "Weight loss/exercise/stress/eating disorder, galactorrhea, headache/vision, hirsutism/acne/hot flashes."], ["BMI/vitals, pubertal development, hirsutism/acne/galactorrhea, thyroid, pelvic exam when indicated."], ["Pregnancy test first.", "TSH and prolactin.", "FSH and estradiol.", "Androgen testing when hyperandrogenism: testosterone, DHEAS, 17-OHP."], refs.pituitary.concat(refs.thyroid), ["Positive pregnancy with pain/bleeding, visual loss/headache, rapid virilization, vital sign instability/eating disorder."], ["FSH/E2 pattern separates ovarian failure from central/hypothalamic causes and changes imaging/referral."]),
  w("Reproductive and Gonadal Disorders", "Infertility (Hormonal causes)", ["ASRM_AMENORRHEA_2024", "PCOS_GUIDELINE_2023", "ES_TESTOSTERONE_2018"], ["Duration trying, cycle regularity, ovulation symptoms.", "Partner semen history, galactorrhea, thyroid symptoms, hyperandrogenism, prior loss."], ["BMI/BP, thyroid, hirsutism/acne, galactorrhea, testicular exam in male partner if in scope."], ["Pregnancy test if amenorrhea.", "TSH/prolactin.", "FSH/estradiol/AMH/antral follicle count as indicated.", "PCOS and androgen labs.", "Semen analysis; male morning testosterone/LH/FSH if indicated."], refs.pituitary.concat(refs.thyroid), ["Amenorrhea with visual symptoms, POI <40, severe hyperandrogenism, recurrent pregnancy loss needing specialist workup."], ["Anovulation, thyroid/prolactin abnormality, POI pattern, or male factor changes treatment/referral."]),
  w("Reproductive and Gonadal Disorders", "Gynecomastia (Enlarged male breast tissue)", ["ES_TESTOSTERONE_2018", "AUA_TESTOSTERONE_2024", "ES_HYPERPROLACTINEMIA_2011"], ["Duration, pain/tenderness, unilateral mass/nipple discharge.", "Medications, cannabis/alcohol, liver/kidney disease, libido/ED/testicular symptoms."], ["Glandular vs adiposity, breast mass/skin/nipple/nodes, testicular exam, thyroid/liver signs."], ["Total testosterone, LH, FSH, estradiol.", "hCG if suspicious; consider AFP/testicular ultrasound if tumor concern.", "TSH, prolactin, liver/kidney function."], refs.pituitary, ["Hard eccentric breast mass, nipple discharge, skin changes, nodes, testicular mass, rapid progression."], ["Testicular mass/hCG elevation changes to urgent tumor pathway; hypogonadism pattern changes endocrine workup."]),
  w("Reproductive and Gonadal Disorders", "Hirsutism (Excessive hair growth)", ["ES_HIRSUTISM_2018", "PCOS_GUIDELINE_2023"], ["Onset/progression, virilization, menstrual irregularity.", "Acne/alopecia, infertility, medications, family/ethnic hair pattern."], ["Ferriman-Gallwey pattern/severity, virilization signs, acne/alopecia, BMI/BP/acanthosis."], ["Total testosterone and free testosterone when indicated.", "Early morning 17-OHP.", "DHEAS when severe/rapid.", "TSH/prolactin/metabolic PCOS tests when menstrual disturbance."], refs.pituitary, ["Rapid onset, virilization, very high testosterone/DHEAS, pelvic/adrenal mass symptoms."], ["Tumor-range androgens or virilization changes to urgent imaging/endocrine pathway."])
];

const pituitaryDx = [
  w("Pituitary Gland Disorders", "Prolactinoma (Benign pituitary tumor)", ["PITUITARY_PROLACTINOMA_2023", "ES_HYPERPROLACTINEMIA_2011"], ["Galactorrhea, amenorrhea/oligomenorrhea, infertility, low libido/ED.", "Headache/visual symptoms, dopamine antagonist/opioid/metoclopramide use, pregnancy/lactation."], ["Visual fields, galactorrhea/breast exam when appropriate, hypogonadism signs, cranial nerve symptoms."], ["Serum prolactin; repeat/macroprolactin if mild/discordant.", "Pregnancy test, TSH/free T4, renal function.", "Pituitary MRI after persistent unexplained elevation or mass symptoms."], refs.pituitary, ["Visual field deficit, severe headache/apoplexy, cranial nerve palsy, pregnancy with macroadenoma symptoms."], ["Mass effect or macroadenoma changes urgency and ophthalmology/neurosurgery involvement."]),
  w("Pituitary Gland Disorders", "Acromegaly", ["ES_ACROMEGALY_2014", "PITUITARY_ACROMEGALY_2021", "ACROMEGALY_DIAGNOSIS_REMISSION_2024", "ACROMEGALY_COMPLICATIONS_2026"], ["Enlarging hands/feet, ring/shoe size, facial changes.", "Headache/vision, sweating, arthralgia, sleep apnea, diabetes, hypertension, colon polyps."], ["Coarse facial features, macroglossia, jaw spacing, hand/foot enlargement, BP/cardiac signs, visual fields."], ["IGF-1 age/sex-adjusted.", "Oral glucose GH suppression test: failure to suppress below assay cutoff, often <1 ng/mL or lower with modern assays.", "Pituitary MRI after biochemical evidence.", "A1c/BP/OSA/echo/colon risk screening."], refs.pituitary, ["Visual field loss, pituitary apoplexy, severe cardiomyopathy, uncontrolled diabetes/OSA."], ["Elevated IGF-1 plus inadequate GH suppression changes to pituitary MRI/surgical pathway."]),
  w("Pituitary Gland Disorders", "Gigantism", ["ES_ACROMEGALY_2014", "PITUITARY_ACROMEGALY_2021", "ACROMEGALY_DIAGNOSIS_REMISSION_2024", "ACROMEGALY_COMPLICATIONS_2026"], ["Accelerated linear growth, headache/vision, puberty timing, family heights.", "Sweating, sleep apnea, joint pain."], ["Height/weight/growth velocity plotted, pubertal staging, coarse features, visual fields."], ["IGF-1 age/puberty-adjusted.", "GH suppression after oral glucose.", "Bone age and growth assessment.", "Pituitary MRI after biochemical evidence."], ["Pediatric/puberty-specific reference ranges are mandatory; adult cutoffs are not sufficient."], ["Visual symptoms, severe headache, rapid growth acceleration, pituitary apoplexy."], ["Confirmed GH excess before epiphyseal closure changes urgency of pediatric pituitary treatment."]),
  w("Pituitary Gland Disorders", "Hypopituitarism", ["ES_HYPOPITUITARISM_2016"], ["Pituitary surgery/radiation/tumor/apoplexy/head trauma.", "Fatigue, hypotension, cold intolerance, amenorrhea/ED/low libido, polyuria/polydipsia, headache/vision."], ["Orthostatic vitals, visual fields, secondary sex characteristics, thyroid/skin signs, volume status."], ["8 AM cortisol +/- ACTH stimulation.", "Free T4 with TSH.", "LH/FSH with testosterone or estradiol.", "Prolactin, IGF-1 and dynamic GH testing when indicated.", "Pituitary MRI."], refs.adrenal.concat(refs.thyroid, refs.pituitary), ["Adrenal crisis, pituitary apoplexy, visual loss, severe hyponatremia."], ["Central adrenal insufficiency must be addressed before thyroid hormone escalation."]),
  w("Pituitary Gland Disorders", "Diabetes Insipidus", ["ENDOTEXT_DI_2026", "SFE_CDI_2018"], ["24-hour urine volume, nocturia, thirst, access to water.", "Lithium, hypercalcemia, hypokalemia, kidney disease, pituitary surgery/trauma/tumor."], ["Volume status and orthostatic vitals, mental status, mucous membranes, neurologic/pituitary mass signs."], ["Confirm hypotonic polyuria: adult urine volume often >3 L/day or >40-50 mL/kg/day with urine osmolality often <300 mOsm/kg.", "Serum sodium/plasma osmolality.", "Exclude osmotic diuresis: glucose, calcium, potassium, renal function.", "Water deprivation/desmopressin or copeptin-based test."], ["Serum sodium normal about 135-145 mmol/L; SFE inpatient CDI guidance: 146-149 mild, 150-159 moderate, >160 severe hypernatremia.", "Urine osmolality <300 mOsm/kg is hypotonic; >800 often argues against DI."], ["Hypernatremia, inability to drink, impaired consciousness, postoperative pituitary patient without desmopressin access."], ["Hypernatremia or impaired water access changes to urgent monitored fluid/desmopressin pathway."], ["AVP deficiency", "central DI", "nephrogenic DI"]),
  w("Pituitary Gland Disorders", "Cushing's Disease (Pituitary-dependent Cushing's)", ["ES_CUSHING_DX_2008", "ES_CUSHING_TREATMENT_2015", "ES_HYPOPITUITARISM_2016"], ["Cushing phenotype plus headache/vision symptoms.", "Cyclic symptoms, exogenous steroid exclusion, menstrual/hypogonadal symptoms."], ["Cushing phenotype, BP/glucose complications, proximal weakness/skin, visual fields."], ["First confirm endogenous Cushing with UFC, late-night salivary cortisol, or 1-mg DST cortisol >1.8 ug/dL.", "ACTH: normal/high supports ACTH-dependent disease.", "Pituitary MRI.", "Inferior petrosal sinus sampling when MRI equivocal/discordant."], ["Post-1 mg DST cortisol >1.8 ug/dL is a sensitive abnormal screen; late-night salivary and UFC cutoffs are assay-specific."], ["Severe hypercortisolism with infection, hypokalemia, psychosis, VTE, uncontrolled hypertension/diabetes."], ["ACTH-dependent confirmed Cushing plus pituitary localization changes to pituitary surgery pathway; discordance triggers IPSS."])
];

const workups = [...dx, ...moreDx, ...reproductiveDx, ...pituitaryDx];

function resolveAppSupport(row) {
  const query = [row.diagnosis, ...row.aliases].join(" ");
  const result = resolveClinicalIntents(query, clinicalIntentRegistry, { limit: 4, minScore: 24 });
  return result.validatedMatches.map((intent) => ({ intent_id: intent.intent_id, label: intent.label, score: intent.score }));
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function diagnosisModuleId(diagnosis) {
  return `${slug(diagnosis.replace(/\([^)]*\)/g, "").replace(/\//g, " "))}_v1`;
}

function uniqueList(items = []) {
  const seen = new Set();
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function endocrineSafetyTestingAnchor(row = {}) {
  const category = String(row.category || "");
  const diagnosis = String(row.diagnosis || "");
  const text = `${category} ${diagnosis}`.toLowerCase();

  if (/diabetes insipidus/.test(text)) {
    return "Diabetes insipidus safety tests: check serum sodium/osmolality, urine osmolality/specific gravity, urine volume, glucose/calcium/potassium/renal function, and desmopressin, copeptin, or supervised water-deprivation pathway only when stable.";
  }
  if (/gestational diabetes/.test(text)) {
    return "Gestational diabetes safety tests: route the local OGTT strategy with gestational age, review home glucose pattern if available, and check ketones, electrolytes/anion gap, creatinine, and acid-base status for vomiting, dehydration, severe hyperglycemia, or insulin-deficiency symptoms.";
  }
  if (/\b(?:prediabetes|metabolic syndrome)\b/.test(text)) {
    return "Cardiometabolic safety data: confirm A1c/FPG/OGTT classification, document BP/waist/BMI, and check lipids, kidney function, albuminuria when diabetes-range, and liver/fatty-liver context when treatment selection or risk reduction is in scope.";
  }
  if (/diabetes|blood sugar/.test(text)) {
    return "Diabetes safety tests: review POC/plasma glucose trend, BMP with potassium/bicarbonate/anion gap and creatinine, beta-hydroxybutyrate or urine ketones when acutely ill, and UACR/lipids for complication-directed therapy.";
  }

  if (/thyroid cancer|thyroid nodule|nodule/.test(text)) {
    return "Structural thyroid safety workup: use TSH to route radionuclide scan versus FNA pathway, thyroid ultrasound with cervical-node mapping for suspicious nodules/cancer, calcitonin/RET context when medullary cancer or MEN2 is possible, and pregnancy testing before radioiodine decisions.";
  }
  if (/hyperthyroid|graves|thyrotox|thyroid storm/.test(text)) {
    return "Thyrotoxicosis safety data: check TSH, free T4, total T3, TRAb/TSI or RAIU as indicated, ECG for tachyarrhythmia, CBC/liver baseline before antithyroid drugs, and pregnancy testing before radioiodine or teratogenic treatment decisions.";
  }
  if (/hypothyroid|hashimoto|myxedema/.test(text)) {
    return "Hypothyroid safety data: check TSH/free T4 with TPO antibody when autoimmune disease matters, sodium/CK/lipids if severe or symptomatic, ECG/cardiac context for older or cardiac patients, and pregnancy-specific targets when pregnant or fertility planning.";
  }
  if (/thyroid/.test(text)) {
    return "Thyroid safety data: pair TSH/free T4 with syndrome-specific add-ons such as T3, antibodies, ultrasound/FNA, or radionuclide scan, and account for pregnancy, biotin, acute illness, central disease, and medication effects before treatment changes.";
  }

  if (/primary hyperparathyroid|hypoparathyroid|hypercalcemia|hypocalcemia/.test(text)) {
    return "Calcium-PTH safety tests: check corrected or ionized calcium, phosphorus, magnesium, creatinine/eGFR, PTH, 25(OH)D, urine calcium when indicated, and ECG or urgent reassessment for severe symptomatic calcium abnormalities.";
  }
  if (/osteoporosis|osteopenia|vitamin d|osteomalacia|bone|parathyroid/.test(text)) {
    return "Bone-mineral safety tests: check calcium, phosphorus, magnesium, creatinine/eGFR, alkaline phosphatase, 25(OH)D and PTH when indicated, plus DXA/vertebral imaging or fracture-risk assessment to route anti-fracture therapy.";
  }

  if (/cushing/.test(text)) {
    return "Cushing safety tests: use late-night salivary cortisol, 1-mg dexamethasone suppression, or 24-hour urinary free cortisol after excluding exogenous steroids, and assess glucose, BP, potassium, infection/VTE, and bone risk to determine severity and treatment urgency.";
  }
  if (/aldosteron|conn/.test(text)) {
    return "Primary aldosteronism safety tests: check potassium and renal function, aldosterone-renin ratio under interpretable medication/posture/salt conditions, and route confirmatory testing, subtype imaging, and adrenal venous sampling when screening is positive.";
  }
  if (/pheochromocytoma|paraganglioma|ppgl/.test(text)) {
    return "PPGL safety tests: obtain plasma free or urine fractionated metanephrines under appropriate collection conditions, add ECG/cardiac injury testing for crisis symptoms, and reserve imaging/genetic pathway for biochemical framing unless emergency stabilization is needed.";
  }
  if (/adrenal insufficiency|addison|congenital adrenal hyperplasia|cah/.test(text)) {
    return "Adrenal insufficiency safety labs: check sodium, potassium, glucose, bicarbonate, creatinine, morning cortisol/ACTH or cosyntropin testing when stable, and renin/aldosterone or 17-OHP context for mineralocorticoid/CAH decisions; do not delay stress-dose steroids in shock.";
  }
  if (/adrenal/.test(text)) {
    return "Adrenal safety tests: select cortisol/ACTH, aldosterone-renin, metanephrine, or androgen testing based on the syndrome, and pair results with electrolytes, glucose, renal function, BP pattern, medication effects, and crisis features that change disposition.";
  }

  if (/pcos|hirsutism|hyperandrogen/.test(text)) {
    return "Hyperandrogenism/PCOS safety tests: pregnancy test when relevant, total/free testosterone with reliable assay, DHEAS or 17-OHP for mimics, TSH/prolactin as indicated, and A1c/OGTT/lipids for cardiometabolic risk.";
  }
  if (/gynecomastia/.test(text)) {
    return "Gynecomastia safety tests: review medication/substance causes and check testosterone, estradiol, LH/FSH, beta-hCG, prolactin/TSH, liver/kidney function, and testicular evaluation when mass, rapid growth, or malignancy concern exists.";
  }
  if (/menopause|premature ovarian insufficiency|poi/.test(text)) {
    return "POI/menopause safety tests: pregnancy test when uncertain, FSH/estradiol confirmation for POI, TSH/prolactin when cycles are abnormal, and bone/cardiometabolic risk labs that affect hormone therapy and prevention decisions.";
  }
  if (/infertility/.test(text)) {
    return "Infertility hormone safety tests: pregnancy test when relevant, ovulatory timing, TSH/prolactin, LH/FSH with estradiol or testosterone, AMH/ovarian reserve or semen analysis as appropriate, and urgent ectopic/red-flag testing for pain or bleeding.";
  }
  if (/amenorrhea|hypogonadism|erectile dysfunction|gonadal|reproductive/.test(text)) {
    return "Gonadal axis safety tests: pregnancy test when possible, prolactin/TSH, LH/FSH with estradiol or repeated early-morning testosterone, and targeted androgen, semen, bone, or metabolic testing based on syndrome and fertility goals.";
  }

  if (/prolactinoma|hyperprolactin/.test(text)) {
    return "Prolactin/pituitary mass safety tests: repeat fasting prolactin with macroprolactin, medication, pregnancy, TSH, and renal context, obtain pituitary MRI for persistent or mass-effect concern, and check gonadal/adrenal/thyroid axes for macroadenoma.";
  }
  if (/acromegaly|gigantism/.test(text)) {
    return "GH-excess safety tests: check age-adjusted IGF-1, oral-glucose GH suppression when needed, pituitary MRI after biochemical confirmation, and glucose/A1c, sleep apnea, BP/cardiac, colon, and thyroid risk screening.";
  }
  if (/hypopituitarism|pituitary/.test(text)) {
    return "Pituitary safety tests: check 8 AM cortisol/ACTH before thyroid replacement decisions, free T4/TSH, prolactin, IGF-1, LH/FSH with sex steroid, sodium/osmolality, and MRI/visual-field pathway when mass effect is possible.";
  }

  return "Endocrine safety tests: choose syndrome-specific hormone confirmation plus electrolytes, glucose, renal function, pregnancy context, and organ-risk testing only when the result changes classification, disposition, medication safety, or referral urgency.";
}

function deploymentAdditions(row) {
  const diagnosisLower = String(row.diagnosis || "").toLowerCase();
  const isDiabetesPreventionWorkup = /\b(?:prediabetes|metabolic syndrome)\b/i.test(diagnosisLower);
  const isGestationalDiabetesWorkup = /gestational diabetes/i.test(diagnosisLower);
  const shared = {
    questions: [
      "What is the current trajectory, baseline status, prior diagnosis date, and what changed today?",
      "Which medications, supplements, missed doses, recent procedures, acute illnesses, pregnancy/fertility context, or assay-interfering factors could change interpretation?"
    ],
    exam: [
      "Vitals and acuity screen: BP, HR, respiratory status, temperature when acute, weight/BMI or waist when cardiometabolic risk matters.",
      "Targeted complication screen guided by symptoms: volume/perfusion, mental status, skin/mucosa, neuromuscular findings, and organ-system complications."
    ],
    tests: [
      "Compare with prior results and repeat discordant nonurgent endocrine tests using correct timing, local assay, and interference precautions.",
      endocrineSafetyTestingAnchor(row)
    ],
    reference_values: [
      "Use local laboratory intervals and assay-specific cutoffs; endocrine immunoassays are affected by pregnancy, age, sex, acute illness, binding proteins, biotin, and medication effects."
    ],
    red_flags: [
      "Hemodynamic instability, altered mental status, severe electrolyte/glucose abnormality, arrhythmia, airway compromise, or vision threat requires urgent escalation."
    ],
    management_changes: [
      isDiabetesPreventionWorkup
        ? "Markedly abnormal glucose, severe hypertension, pregnancy-context concern, or cardiopulmonary symptoms changes disposition from prevention visit to urgent evaluation."
        : "Unstable physiology, endocrine crisis, pregnancy-critical medication issue, or dangerous electrolyte/glucose abnormality changes disposition to urgent monitored care.",
      "Discordant or borderline endocrine tests should be confirmed and interpreted with timing, assay, medication, pregnancy, and acute illness context before irreversible treatment."
    ]
  };

  const diabetesAdditions = isDiabetesPreventionWorkup
    ? {
        questions: [
          "Ask about weight trajectory, activity, nutrition, sleep apnea, fatty liver, PCOS, prior gestational diabetes, family diabetes/ASCVD history, steroid exposure, and cardiometabolic medications.",
          "Clarify hypertension, dyslipidemia, ASCVD/HF/CKD risk, smoking, pregnancy possibility, and barriers to prevention because these change cardiometabolic risk reduction."
        ],
        exam: [
          "Acanthosis nigricans and anthropometric cardiometabolic phenotype when insulin resistance is suspected.",
          "Cardiovascular risk exam only when symptoms, hypertension, established ASCVD, or heart failure features are present."
        ],
        tests: [
          "A1c or plasma glucose criteria for prediabetes/diabetes classification, with repeat confirmatory testing when asymptomatic or discordant.",
          "Lipids, blood pressure, kidney function, albuminuria when diabetes-range, and liver context when cardiometabolic risk reduction or medication choice is in scope."
        ],
        red_flags: [
          "Diabetes-range glycemia with classic symptoms, severe hypertension, ASCVD symptoms, pregnancy-context hyperglycemia, or dehydration requires escalation beyond routine prevention care."
        ],
        management_changes: [
          "Prediabetes or metabolic syndrome thresholds change prevention intensity, lifestyle intervention, cardiometabolic risk-factor treatment, and surveillance interval.",
          "Diabetes-range glycemia, ASCVD/HF/CKD risk, fatty liver, obstructive sleep apnea, PCOS, or pregnancy context changes diagnostic classification, treatment safety, and referral or follow-up urgency."
        ]
      }
    : isGestationalDiabetesWorkup
      ? {
          questions: [
            "Ask about gestational age, prior gestational diabetes or macrosomia, home glucose pattern if available, vomiting/dehydration, ketone symptoms, fetal growth/polyhydramnios context, and obstetric care plan.",
            "Clarify preexisting diabetes risk, medications, nutrition access, steroid exposure, hypertension or preeclampsia symptoms, and postpartum follow-up barriers."
          ],
          exam: [
            "Volume status, mucous membranes, perfusion, and mental status when vomiting, severe hyperglycemia, ketones, or dehydration are possible.",
            "Pregnancy and hypertension-focused assessment with the obstetric team when blood pressure symptoms, preeclampsia features, or fetal-growth concern exists."
          ],
          tests: [
            "Gestational diabetes screening/diagnostic OGTT using the local one-step or two-step strategy and gestational-age context.",
            "Glucose monitoring plan; ketones, electrolytes, renal function, and acid-base assessment when vomiting, dehydration, severe hyperglycemia, or insulin deficiency is possible."
          ],
          red_flags: [
            "Ketones, vomiting/dehydration, severe hyperglycemia, altered mental status, hypertension/preeclampsia features, or reduced fetal movement requires urgent obstetric/endocrine evaluation."
          ],
          management_changes: [
            "OGTT threshold crossing changes maternal-fetal monitoring, nutrition therapy, glucose monitoring, medication escalation, and delivery/postpartum planning.",
            "Ketones, vomiting/dehydration, severe hyperglycemia, altered mental status, or hypertensive features in pregnancy changes disposition to urgent obstetric/endocrine evaluation."
          ]
        }
      : {
          questions: [
            "Ask about hypoglycemia, hyperglycemia symptoms, sick-day triggers, insulin/medication access, steroid or SGLT2 inhibitor exposure, and recent infection.",
            "Clarify ASCVD, CKD, neuropathy, retinopathy, foot ulcer/wound, pregnancy, meal pattern, and technology use because these change targets and therapy."
          ],
          exam: [
            "Hydration, mucous membranes, orthostasis/perfusion, respiratory pattern, and mental status when acute hyperglycemia, DKA/HHS, or hypoglycemia is possible.",
            "Feet/skin when diabetes complications, neuropathy, infection, ulcer, vascular disease, or discharge safety is relevant."
          ],
          tests: [
            "A1c or plasma glucose criteria for diagnosis/classification, plus CGM/glucometer pattern when available.",
            "CMP/eGFR, urine albumin-creatinine ratio, lipids, and ketones/anion gap/beta-hydroxybutyrate when acute symptoms or insulin deficiency are possible."
          ],
          red_flags: [
            "DKA/HHS physiology, recurrent severe hypoglycemia, vomiting/dehydration, altered mental status, infected foot wound, or pregnancy with hyperglycemia."
          ],
          management_changes: [
            "Ketosis/acidosis, HHS osmolality, or severe hypoglycemia triggers urgent protocolized treatment rather than routine outpatient adjustment.",
            "CKD, albuminuria, ASCVD/HF risk, pregnancy, foot infection, or insulin access barriers change medication choice and follow-up urgency."
          ]
        };

  const byCategory = {
    "Diabetes and Blood Sugar Disorders": diabetesAdditions,
    "Thyroid Disorders": {
      questions: [
        "Ask about palpitations, heat/cold intolerance, weight change, bowel change, tremor, fatigue, mood/cognition, menstrual/fertility context, and neck symptoms.",
        "Ask about amiodarone, lithium, iodine/contrast, immune checkpoint inhibitors, thyroid hormone or antithyroid drugs, biotin, pregnancy/postpartum status, radiation, and family thyroid cancer/MEN2."
      ],
      exam: [
        "Thyroid/neck exam for goiter, nodules, tenderness, asymmetry, bruit, fixation, compressive symptoms, and cervical/supraclavicular nodes when structural concern exists.",
        "Cardiac rhythm/perfusion, tremor, reflex relaxation, skin/hair, edema, and eye/orbitopathy screen when hypo- or hyperthyroid features are present."
      ],
      tests: [
        "TSH with free T4; add T3 for thyrotoxicosis, TPO Ab for autoimmune hypothyroidism, TRAb/TSI for Graves, and thyroid ultrasound/FNA pathway for nodules.",
        "Hold high-dose biotin before susceptible assays when feasible and interpret thyroid labs with pregnancy, acute illness, and central hypothyroidism context."
      ],
      red_flags: [
        "Thyroid storm, myxedema coma, atrial fibrillation/heart failure, vision-threatening orbitopathy, rapidly enlarging neck mass, hoarseness, dysphagia, dyspnea, or suspicious nodes."
      ],
      management_changes: [
        "Suppressed TSH with elevated T4/T3 changes to thyrotoxicosis severity and etiology workup; low FT4 with low/normal TSH triggers central hypothyroidism evaluation.",
        "Suspicious nodule, compressive symptom, abnormal node, calcitonin/RET concern, or high-risk ultrasound feature changes imaging/FNA/surgical referral pathway."
      ]
    },
    "Bone and Parathyroid Disorders": {
      questions: [
        "Ask about fragility fractures, falls, height loss/back pain, stones, calcium/vitamin D intake, malabsorption, kidney disease, medications, and family fracture/endocrine syndromes.",
        "Clarify glucocorticoids, aromatase inhibitors, androgen deprivation, anticonvulsants, bariatric surgery, neck surgery, lithium/thiazides, and symptoms of hypo- or hypercalcemia."
      ],
      exam: [
        "Height, weight, kyphosis, spine/hip tenderness, gait/balance/fall risk, proximal strength, and neuromuscular irritability when calcium disorders are possible.",
        "Volume status and mental status when severe hypercalcemia or symptomatic hypocalcemia is possible."
      ],
      tests: [
        "DXA/vertebral imaging or fracture-risk tool when bone density is in scope; calcium/PTH/phosphorus/magnesium/25(OH)D/renal function for calcium-bone disorders.",
        "24-hour urine calcium and renal imaging when primary hyperparathyroidism, kidney stones, or chronic hypoparathyroidism management is relevant."
      ],
      red_flags: [
        "Hip/vertebral fracture, cord/neurologic symptoms with back pain, severe hypercalcemia with dehydration/AKI/confusion, or symptomatic hypocalcemia with seizure/laryngospasm/arrhythmia."
      ],
      management_changes: [
        "Fragility fracture, very low T-score, high fracture risk, or secondary cause changes therapy intensity and fall-prevention urgency.",
        "Calcium-PTH pattern, renal involvement, stones, osteoporosis, or severe calcium symptoms changes endocrine/surgical pathway."
      ]
    },
    "Adrenal Gland Disorders": {
      questions: [
        "Ask about orthostasis, salt craving, weight loss, nausea/vomiting, abdominal pain, headaches/sweats/palpitations, resistant hypertension, hypokalemia, steroid exposure, and adrenal incidentaloma.",
        "Clarify exogenous glucocorticoids including injections/creams/inhalers, adrenal/pituitary surgery, autoimmune disease, MEN/VHL/NF1/SDHx history, pregnancy, and acute infection."
      ],
      exam: [
        "BP including orthostatics when safe, volume/perfusion, hyperpigmentation or Cushing phenotype, proximal strength, edema, and mental status when crisis is possible.",
        "Assess arrhythmia/tachycardia, hypertensive crisis signs, hypokalemic weakness, and infection trigger when adrenal emergency is possible."
      ],
      tests: [
        "Morning cortisol/ACTH or cosyntropin for adrenal insufficiency; aldosterone-renin ratio with potassium correction for primary aldosteronism; metanephrines for PPGL.",
        "Cushing screening with 1-mg DST, late-night salivary cortisol, or 24-hour UFC after excluding exogenous steroids; adrenal imaging follows biochemical framing except emergency/known incidentaloma context."
      ],
      red_flags: [
        "Adrenal crisis, shock, severe vomiting/dehydration, hypoglycemia, severe hyperkalemia/hyponatremia, hypertensive crisis, arrhythmia, stroke/ACS symptoms, psychosis, infection, or VTE."
      ],
      management_changes: [
        "Suspected adrenal crisis is treated immediately with stress-dose steroids and fluids; testing must not delay treatment when unstable.",
        "Marked metanephrine elevation, suppressed renin with high aldosterone, or confirmed hypercortisolism changes to specialty localization/subtyping and perioperative planning."
      ]
    },
    "Reproductive and Gonadal Disorders": {
      questions: [
        "Ask about cycle pattern, pregnancy possibility, fertility goals, libido/sexual function, galactorrhea, hirsutism/acne/alopecia, hot flashes, medication exposure, and rapid virilization.",
        "Clarify age/puberty timing, eating/exercise/stress, chronic disease, opioids/anabolic steroids, chemotherapy/radiation/surgery, family POI/PCOS, and psychosocial impact."
      ],
      exam: [
        "BP/BMI/waist, hirsutism/acne/alopecia/acanthosis, thyroid, galactorrhea/breast findings when appropriate, secondary sex characteristics, and testicular/genital exam when in scope.",
        "Visual fields/cranial nerve screen when headache, galactorrhea, hypogonadotropic pattern, or pituitary concern is present."
      ],
      tests: [
        "Pregnancy test first when amenorrhea or pregnancy is possible; TSH, prolactin, gonadotropins/estradiol or testosterone/LH/FSH as syndrome-specific anchors.",
        "Androgen testing with reliable assays for hyperandrogenism; metabolic screening for PCOS; semen analysis and partner factors when infertility is in scope."
      ],
      red_flags: [
        "Positive pregnancy with pain/bleeding, rapid virilization, tumor-range androgens, severe abnormal bleeding, visual symptoms/headache, testicular mass, hard breast mass, or priapism."
      ],
      management_changes: [
        "Pregnancy, fertility intent, rapid virilization, tumor-range hormones, or pituitary symptoms changes medication safety, imaging urgency, and referral pathway.",
        "Biochemical hypogonadism, POI, hyperprolactinemia, PCOS, or thyroid disease changes counseling, bone/cardiometabolic prevention, and treatment selection."
      ]
    },
    "Pituitary Gland Disorders": {
      questions: [
        "Ask about headache, visual field loss/diplopia, pituitary surgery/radiation/apoplexy, galactorrhea, libido/fertility/cycle changes, polyuria/polydipsia, growth/acral changes, and adrenal/thyroid symptoms.",
        "Clarify mass-effect symptoms, pregnancy, medication causes of prolactin elevation, traumatic brain injury, childhood cancer history, and access to water/desmopressin when diabetes insipidus is possible."
      ],
      exam: [
        "Visual fields, pupils/EOM/cranial nerves when mass effect is possible; BP/orthostatics, volume status, mental status, and secondary sex/thyroid/adrenal signs.",
        "Acral/facial/tongue/jaw/spacing findings, growth velocity/puberty staging in younger patients, and comorbidity signs such as sleep apnea, hypertension, diabetes, or cardiomyopathy."
      ],
      tests: [
        "Pituitary-axis panel guided by presentation: AM cortisol/ACTH, free T4/TSH, prolactin, IGF-1, LH/FSH with sex steroid, serum/urine osmolality and sodium when DI is possible.",
        "Pituitary MRI after biochemical evidence or mass-effect symptoms; dynamic testing such as cosyntropin, OGTT/GH suppression, water deprivation/desmopressin or copeptin testing when indicated."
      ],
      red_flags: [
        "Pituitary apoplexy, acute severe headache, visual field deficit, cranial nerve palsy, adrenal crisis, severe hypernatremia, inability to drink, or macroadenoma symptoms in pregnancy."
      ],
      management_changes: [
        "Central adrenal insufficiency must be addressed before thyroid hormone escalation; pituitary mass effect changes ophthalmology/neurosurgery urgency.",
        "Confirmed hormone excess/deficiency plus MRI finding changes endocrine, neurosurgical, fertility, and replacement-therapy pathway."
      ]
    }
  };
  const extra = byCategory[row.category] || {};
  return {
    questions: uniqueList([...(row.questions || []), ...shared.questions, ...(extra.questions || [])]),
    exam: uniqueList([...(row.exam || []), ...shared.exam, ...(extra.exam || [])]),
    tests: uniqueList([...(row.tests || []), ...shared.tests, ...(extra.tests || [])]),
    reference_values: uniqueList([...(row.reference_values || []), ...shared.reference_values, ...(extra.reference_values || [])]),
    red_flags: uniqueList([...(row.red_flags || []), ...shared.red_flags, ...(extra.red_flags || [])]),
    management_changes: uniqueList([...(row.management_changes || []), ...shared.management_changes, ...(extra.management_changes || [])]),
    decision_steps: uniqueList([...(row.decision_steps || []), ...guidelineDecisionSupport(row).decision_steps]),
    treatment_options: uniqueList([...(row.treatment_options || []), ...guidelineDecisionSupport(row).treatment_options])
  };
}

function guidelineDecisionSupport(row = {}) {
  const diagnosis = String(row.diagnosis || "");
  const lower = diagnosis.toLowerCase();
  const defaultDecisionSteps = [
    `Confirm that ${diagnosis} is the selected clinical intent, then screen for red flags before routine outpatient testing.`,
    `Order the first-line tests in sequence: ${cleanSupportList(row.tests?.slice(0, 3)) || "use the guideline-specified diagnostic test set"}.`,
    `Interpret numeric results against the workup cutoffs and local assay ranges: ${row.reference_values?.slice(0, 2).join(" ") || "use the listed diagnostic thresholds."}`,
    `If the initial result is equivocal, discordant with the phenotype, or affected by medication, acute illness, pregnancy, age, sex, or assay interference, repeat or confirm using the next guideline test before committing to long-term therapy.`
  ];
  const defaultTreatmentOptions = [
    `Treat unstable presentations first using the urgent escalation rule for ${diagnosis}; draw time-sensitive labs only if doing so does not delay stabilization.`,
    `For confirmed ${diagnosis}, choose therapy based on severity, comorbidities, pregnancy/fertility context, contraindications, patient preference, and local specialty pathway.`,
    `Monitor treatment response with the condition-specific clinical endpoint plus the most relevant labs or imaging listed in this workup.`,
    `Escalate to endocrinology or the relevant specialty when results are severe, discordant, recurrent, treatment-limiting, or require localization, surgery, genetic testing, or high-risk medication.`
  ];
  const s = (decisionSteps, treatmentOptions) => ({
    decision_steps: uniqueList([...decisionSteps, ...defaultDecisionSteps]).slice(0, 8),
    treatment_options: uniqueList([...treatmentOptions, ...defaultTreatmentOptions]).slice(0, 8)
  });

  if (/type 2 diabetes/.test(lower)) return s([
    "Diagnose with A1c >=6.5%, fasting plasma glucose >=126 mg/dL, 2-hour OGTT >=200 mg/dL, or random glucose >=200 mg/dL with classic symptoms; repeat confirmatory testing if asymptomatic.",
    "At diagnosis, classify ASCVD, heart failure, CKD, obesity, hypoglycemia risk, medication access, and pregnancy possibility before selecting therapy.",
    "Screen complications with eGFR, urine albumin-creatinine ratio, lipids, BP, foot neuropathy/perfusion exam, and eye/retinopathy follow-up.",
    "If vomiting, dehydration, weight loss, ketones, acidosis, or very high glucose is present, route to DKA/HHS evaluation instead of routine outpatient titration."
  ], [
    "Begin individualized lifestyle, diabetes education, weight-management, BP/lipid, tobacco, vaccine, kidney, and cardiovascular risk-reduction plan.",
    "Use metformin when appropriate and add GLP-1 RA or SGLT2 inhibitor preferentially when ASCVD, CKD, heart failure, obesity, or cardiorenal risk dominates.",
    "Use insulin when catabolic symptoms, ketosis, severe symptomatic hyperglycemia, or A1c/glucose level suggests insulin deficiency or urgent control is needed.",
    "Titrate therapy to individualized A1c and glucose goals while monitoring hypoglycemia, kidney function, adverse effects, and access."
  ]);
  if (/type 1 diabetes/.test(lower)) return s([
    "If symptomatic hyperglycemia, check glucose, beta-hydroxybutyrate or urine ketones, electrolytes, anion gap, bicarbonate, pH, and osmolality as indicated.",
    "Confirm autoimmune insulin-deficient diabetes with islet autoantibodies and C-peptide interpreted with concurrent glucose when presentation is not classic.",
    "Classify acute DKA/HHS severity before routine chronic diabetes planning; euglycemic DKA remains possible with SGLT2 inhibitor exposure.",
    "After stabilization, screen thyroid/celiac/autoimmune comorbidity and chronic complications according to duration and age."
  ], [
    "Treat DKA/HHS with institutional protocol for IV fluids, insulin, potassium, dextrose transition, precipitant treatment, and monitored disposition.",
    "Use lifelong physiologic basal-bolus insulin or pump therapy with CGM when feasible, plus education on carbohydrate dosing and correction factors.",
    "Prescribe glucagon rescue, sick-day rules, ketone testing, backup basal insulin plan, and supplies before discharge or transition.",
    "Adjust regimen to avoid severe hypoglycemia and address technology access, exercise, meals, pregnancy, renal function, and psychosocial barriers."
  ]);
  if (/prediabetes/.test(lower)) return s([
    "Classify prediabetes with A1c 5.7-6.4%, fasting glucose 100-125 mg/dL, or 2-hour OGTT 140-199 mg/dL after excluding diabetes-range results.",
    "Assess BMI, waist, BP, lipids, fatty liver, sleep apnea, PCOS, prior gestational diabetes, medications, and ASCVD risk.",
    "Repeat diabetes testing on a surveillance interval and sooner if symptoms, steroid exposure, pregnancy, or rising risk appears.",
    "If any confirmatory result reaches diabetes range, switch to the diabetes diagnostic and treatment pathway."
  ], [
    "Offer intensive lifestyle intervention aiming for durable weight loss when appropriate, nutrition quality, physical activity, sleep, and tobacco risk reduction.",
    "Consider metformin for higher-risk adults such as younger age with obesity, prior gestational diabetes, rising A1c, or other strong diabetes-risk features.",
    "Treat BP, lipids, fatty liver risk, sleep apnea, and weight-related comorbidities as part of cardiometabolic risk reduction.",
    "Use shared decision-making for anti-obesity pharmacotherapy or bariatric referral when BMI/comorbidity criteria and patient goals support it."
  ]);
  if (/gestational diabetes/.test(lower)) return s([
    "Confirm pregnancy status and gestational age; screen high-risk patients early for overt diabetes and otherwise test at 24-28 weeks using the local one-step or two-step strategy.",
    "Interpret one-step 75-g OGTT using fasting >=92, 1-hour >=180, or 2-hour >=153 mg/dL; one abnormal value diagnoses GDM in that strategy.",
    "If using two-step testing, route abnormal 50-g screen to diagnostic 100-g OGTT and apply local Carpenter-Coustan or NDDG thresholds.",
    "After delivery, schedule 75-g OGTT at 4-12 weeks and long-term diabetes surveillance."
  ], [
    "Start nutrition therapy, activity as obstetrically appropriate, glucose monitoring, and obstetric fetal-growth coordination.",
    "Add insulin when lifestyle therapy does not meet pregnancy glucose targets or if fasting/postprandial values are persistently above local goals.",
    "Use metformin or glyburide only within local obstetric/endocrine policy and shared decision-making about placental transfer and failure rates.",
    "Escalate vomiting, ketones, dehydration, severe hyperglycemia, hypertension, or fetal/maternal danger signs urgently."
  ]);
  if (/metabolic syndrome/.test(lower)) return s([
    "Apply ATP III-style criteria and count waist, triglycerides, HDL, BP, and fasting glucose abnormalities; three or more supports metabolic syndrome.",
    "Look for secondary contributors and related disease: diabetes, fatty liver, sleep apnea, PCOS, hypothyroidism, medications, and alcohol.",
    "Estimate ASCVD and diabetes risk, then decide whether each risk factor needs lifestyle alone or pharmacologic treatment.",
    "If glycemia reaches diabetes range, route to diabetes diagnosis and complication screening."
  ], [
    "Use intensive lifestyle intervention for weight, waist, diet quality, physical activity, sleep, and alcohol/tobacco risk.",
    "Treat hypertension, dyslipidemia, hypertriglyceridemia, and diabetes/prediabetes according to their individual guideline thresholds.",
    "Consider anti-obesity medication or bariatric referral when BMI criteria and comorbidity burden support it.",
    "Coordinate fatty liver, sleep apnea, PCOS, CKD, and ASCVD prevention follow-up."
  ]);
  if (/hypothyroidism|hashimoto/.test(lower)) return s([
    "Start with TSH and free T4; high TSH with low free T4 supports overt primary hypothyroidism, while low free T4 with low/normal TSH suggests central disease.",
    "Check TPO antibody when autoimmune thyroiditis changes prognosis, pregnancy planning, or etiology; ultrasound is reserved for goiter, nodule, asymmetry, or compressive symptoms.",
    "Before levothyroxine escalation in pituitary disease or severe illness, assess adrenal insufficiency risk.",
    "Screen urgently for myxedema coma physiology when hypothermia, bradycardia, hypotension, hypoventilation, hyponatremia, or altered mental status is present."
  ], [
    "Treat overt primary hypothyroidism with levothyroxine, adjusted for age, cardiac disease, pregnancy, weight, adherence, and interacting medications.",
    "For subclinical hypothyroidism, individualize treatment by TSH level, symptoms, antibodies, pregnancy/fertility context, goiter, and cardiovascular risk.",
    "Use free T4 rather than TSH to titrate central hypothyroidism, after adrenal status is safe.",
    "For suspected myxedema coma, use emergency IV thyroid hormone, stress-dose glucocorticoid coverage, warming, ventilation, sodium/glucose correction, and ICU-level care per local protocol."
  ]);
  if (/hyperthyroidism|graves|thyrotoxicosis/.test(lower)) return s([
    "Confirm thyrotoxicosis with suppressed TSH plus elevated free T4 and/or T3, then determine etiology with TRAb/TSI, uptake scan, Doppler ultrasound, medication/iodine history, or thyroiditis labs.",
    "Differentiate high-uptake hormone overproduction from low-uptake thyroiditis, exogenous hormone, iodine/amiodarone effect, or destructive thyroiditis because treatment differs.",
    "Assess severity with heart rate/rhythm, fever, heart failure, mental status, liver disease, pregnancy, orbitopathy, and thyroid storm features.",
    "For nodular or uncertain disease, evaluate autonomous nodules and malignancy-risk features before definitive therapy."
  ], [
    "Use beta-blocker symptom control when not contraindicated for adrenergic symptoms or tachycardia.",
    "Use antithyroid drugs for Graves/toxic nodular hyperthyroidism when appropriate, with pregnancy trimester, liver disease, agranulocytosis counseling, and baseline labs considered.",
    "Choose radioactive iodine, surgery, or continued medical therapy based on etiology, goiter/nodule features, orbitopathy, pregnancy plans, contraindications, and patient preference.",
    "Treat thyroiditis primarily with supportive care, NSAID or glucocorticoid when indicated, and avoid antithyroid drugs when hormone release rather than synthesis is the mechanism."
  ]);
  if (/thyroid nodules/.test(lower)) return s([
    "Measure TSH first; if TSH is low, obtain radionuclide scan to identify hyperfunctioning nodules before FNA decisions.",
    "If TSH is normal or high, perform high-quality thyroid ultrasound with risk stratification, nodule size, cervical node assessment, and compressive-symptom review.",
    "Apply the local ATA, ACR TI-RADS, or ETA risk-system size thresholds for FNA; high-risk sonographic patterns have lower biopsy thresholds than low-risk patterns.",
    "Use Bethesda cytology, molecular testing when locally appropriate, and ultrasound surveillance intervals to decide repeat FNA, surgery, or observation."
  ], [
    "Observe benign low-risk nodules with ultrasound surveillance and symptom monitoring.",
    "Treat autonomous hyperfunctioning nodules with radioactive iodine, surgery, or ablation according to size, symptoms, pregnancy context, and local expertise.",
    "Refer suspicious cytology, suspicious nodes, rapid growth, compressive symptoms, or high-risk history to thyroid specialist/surgery.",
    "Consider minimally invasive ablation only for selected benign symptomatic nodules in centers with appropriate expertise."
  ]);
  if (/thyroid cancer/.test(lower)) return s([
    "Confirm malignant or suspicious disease with ultrasound mapping, FNA/Bethesda cytology, and node evaluation; check calcitonin/CEA and RET when medullary cancer is suspected.",
    "Risk-stratify by tumor type, size, nodal/distant spread, invasion, cytology/histology, molecular/genetic findings, voice/airway status, and patient goals.",
    "Use cross-sectional imaging, laryngoscopy, or additional staging when bulky, invasive, recurrent, high-risk, or medullary/anaplastic disease is possible.",
    "After initial therapy, monitor dynamic risk using thyroglobulin/antibody or calcitonin/CEA as appropriate plus neck imaging."
  ], [
    "Use active surveillance only for carefully selected very-low-risk papillary microcarcinoma when specialist follow-up is available.",
    "Choose lobectomy versus total thyroidectomy, node dissection, radioactive iodine, and TSH suppression according to risk category and current ATA pathway.",
    "For medullary thyroid cancer, coordinate RET testing, family screening, calcitonin/CEA surveillance, and specialized surgery.",
    "Escalate airway compromise, vocal cord paralysis, bulky nodes, suspected anaplastic transformation, or rapidly enlarging mass urgently."
  ]);
  if (/osteoporosis/.test(lower)) return s([
    "Diagnose osteoporosis by fragility fracture, T-score <= -2.5, or high fracture risk; assess vertebral imaging and secondary causes before therapy selection.",
    "Classify fracture risk as high versus very high using recent fracture, multiple fractures, very low BMD, falls, glucocorticoids, and FRAX or local tool.",
    "Check calcium, 25(OH)D, kidney function, PTH or other secondary-cause labs as indicated before antiresorptive or anabolic therapy.",
    "Reassess BMD and fracture risk after therapy interval, especially after 3-5 years of bisphosphonate exposure."
  ], [
    "Use bisphosphonate first-line for many high-risk patients when renal function, esophageal risk, and adherence permit.",
    "Use anabolic therapy such as teriparatide, abaloparatide, or romosozumab for very-high-risk patients, then follow with antiresorptive therapy.",
    "Use denosumab when appropriate, but plan transition therapy if stopping to avoid rebound vertebral fracture risk.",
    "Ensure calcium/vitamin D adequacy, fall prevention, exercise, smoking/alcohol counseling, dental risk review, and secondary-cause treatment."
  ]);
  if (/osteopenia/.test(lower)) return s([
    "Classify T-score between -1.0 and -2.5 as osteopenia and combine with FRAX or local fracture-risk tool rather than treating T-score alone.",
    "Look for fragility fracture, vertebral compression, glucocorticoid exposure, endocrine causes, malabsorption, CKD, and fall risk.",
    "If fracture risk crosses treatment threshold or a fragility fracture is present, route to osteoporosis treatment pathway.",
    "If below treatment threshold, set surveillance interval and prevention plan based on baseline risk."
  ], [
    "Use lifestyle, fall prevention, weight-bearing/resistance exercise, protein, calcium/vitamin D adequacy, and medication/alcohol/tobacco review.",
    "Start osteoporosis pharmacotherapy if FRAX/local risk threshold, fragility fracture, or progression to osteoporosis occurs.",
    "Treat reversible secondary causes such as hyperthyroidism, hyperparathyroidism, vitamin D deficiency, hypogonadism, malabsorption, or glucocorticoid exposure.",
    "Repeat DXA on an interval driven by risk, prior BMD, age, and treatment decisions."
  ]);
  if (/primary hyperparathyroidism/.test(lower)) return s([
    "Confirm repeated hypercalcemia or high ionized calcium with inappropriately high or nonsuppressed PTH after correcting albumin and vitamin D context.",
    "Assess kidney and skeletal involvement with eGFR/creatinine clearance, 24-hour urine calcium, renal imaging for stones, DXA, and vertebral imaging when indicated.",
    "Differentiate familial hypocalciuric hypercalcemia, medication effects, malignancy, granulomatous disease, and secondary hyperparathyroidism before surgery.",
    "Apply surgical criteria including symptoms, calcium elevation, osteoporosis/fracture, kidney stones, renal impairment, hypercalciuria, and age per guideline."
  ], [
    "Refer surgical candidates for parathyroidectomy with localization imaging used for operative planning, not diagnosis.",
    "For nonsurgical monitoring, follow calcium, renal function, DXA, symptoms, and stone risk; maintain hydration and avoid exacerbating medications when possible.",
    "Use cinacalcet to lower calcium when surgery is not done and hypercalcemia needs control; use antiresorptive therapy for low BMD when appropriate.",
    "Treat severe symptomatic hypercalcemia urgently with fluids, antiresorptive/calcitonin strategies, and specialist input."
  ]);
  if (/hypoparathyroidism/.test(lower)) return s([
    "Confirm hypocalcemia with low or inappropriately normal PTH, then check phosphorus, magnesium, creatinine/eGFR, 25(OH)D, urinary calcium, and postsurgical history.",
    "Classify acute symptomatic hypocalcemia separately from chronic stable disease; ECG/QT, seizure, laryngospasm, or arrhythmia changes urgency.",
    "Identify reversible contributors such as hypomagnesemia, vitamin D deficiency, hungry bone, renal disease, or medication effects.",
    "Monitor chronic therapy by serum calcium target, urinary calcium, kidney function, phosphorus, magnesium, and renal imaging when indicated."
  ], [
    "Treat severe symptomatic hypocalcemia with IV calcium and telemetry per local protocol while correcting magnesium.",
    "Use oral calcium plus active vitamin D such as calcitriol for chronic conventional therapy, targeting low-normal or just-below-normal calcium with symptom control.",
    "Use thiazide and low-sodium strategy for hypercalciuria when appropriate; avoid overtreatment that raises kidney-stone or nephrocalcinosis risk.",
    "Consider PTH replacement pathway when conventional therapy is inadequate or causes complications, subject to availability and specialty oversight."
  ]);
  if (/vitamin d/.test(lower)) return s([
    "Test 25(OH)D when there is an established indication such as bone disease, hypocalcemia, malabsorption, CKD, osteoporosis therapy planning, or osteomalacia concern.",
    "Interpret low 25(OH)D with calcium, phosphorus, alkaline phosphatase, PTH, renal function, symptoms, and fracture/bone pain context.",
    "If osteomalacia is suspected, look for low phosphorus, elevated alkaline phosphatase, secondary hyperparathyroidism, Looser zones, or proximal weakness.",
    "Avoid routine population screening or target chasing in otherwise healthy adults where the 2024 prevention guideline does not support it."
  ], [
    "Replete vitamin D and calcium intake when deficiency is clinically relevant, using local dosing protocols and malabsorption/obesity/medication adjustments.",
    "Treat osteomalacia with vitamin D repletion, calcium/phosphate strategy when indicated, and cause-specific therapy for malabsorption, renal phosphate wasting, or medication effects.",
    "Use age/risk-appropriate empiric supplementation only where guideline groups support it; otherwise follow dietary reference intake.",
    "Monitor calcium, phosphorus, PTH, alkaline phosphatase, 25(OH)D, symptoms, and bone outcomes according to indication and risk."
  ]);
  if (/adrenal insufficiency|addison/.test(lower)) return s([
    "If adrenal crisis is possible, draw cortisol/ACTH only if it does not delay treatment, then give stress-dose hydrocortisone and fluids immediately.",
    "In stable patients, obtain early morning cortisol with ACTH; if indeterminate or suspicious, perform 250 microgram cosyntropin stimulation test.",
    "Interpret cosyntropin peak cortisol using assay-specific cutoff, traditionally <18 ug/dL but often lower with modern assays; high ACTH supports primary adrenal insufficiency.",
    "After primary adrenal insufficiency is confirmed, check renin/aldosterone and 21-hydroxylase antibodies and evaluate etiology; low/normal ACTH routes to pituitary workup."
  ], [
    "Treat adrenal crisis with hydrocortisone 100 mg IV/IM, isotonic fluids with dextrose as needed, and ongoing hydrocortisone about 200 mg per 24 hours per local protocol.",
    "For chronic replacement, use hydrocortisone 15-25 mg/day in divided doses or prednisolone 3-5 mg/day when appropriate; avoid dexamethasone for routine replacement.",
    "Add fludrocortisone 50-100 microgram/day and liberal salt intake when aldosterone deficiency is confirmed, monitoring BP, edema, electrolytes, salt craving, and renin.",
    "Provide sick-day rules, emergency injectable glucocorticoid plan, medical alert identification, perioperative stress dosing, and pregnancy-specific review."
  ]);
  if (/cushing/.test(lower)) return s([
    "Exclude exogenous glucocorticoid exposure first, including injections, creams, inhaled, topical, supplements, and medication interactions.",
    "Screen with one of the recommended first-line tests: 1-mg overnight dexamethasone suppression, late-night salivary cortisol, or 24-hour urinary free cortisol, repeating or confirming abnormal results.",
    "After endogenous hypercortisolism is confirmed, measure ACTH to separate ACTH-independent from ACTH-dependent disease.",
    "Use adrenal imaging for ACTH-independent disease; for ACTH-dependent disease use pituitary MRI and inferior petrosal sinus sampling when imaging and biochemistry are discordant."
  ], [
    "Treat the cause when feasible: transsphenoidal pituitary surgery for Cushing disease, adrenalectomy for unilateral adrenal cortisol excess, or ectopic source-directed therapy.",
    "Control severe hypercortisolism complications urgently, including infection, VTE, psychosis, hypokalemia, hypertension, diabetes, and heart failure.",
    "Use steroidogenesis inhibitors, glucocorticoid receptor blockade, pituitary-directed drugs, radiation, or bilateral adrenalectomy when surgery is delayed, incomplete, impossible, or recurrent.",
    "Provide postoperative adrenal insufficiency monitoring, glucocorticoid replacement/taper, recurrence surveillance, and cardiometabolic/bone risk treatment."
  ]);
  if (/hyperaldosteronism|conn/.test(lower)) return s([
    "Screen hypertensive patients with aldosterone, renin, ARR, and potassium; correct hypokalemia and manage interfering medications when safe.",
    "A positive screen generally requires suppressed renin with inappropriately high aldosterone and elevated ARR; use local assay cutoffs and repeat if medication or potassium confounds results.",
    "If overt biochemical primary aldosteronism is present, confirmatory suppression testing may be unnecessary before PA-specific therapy in selected patients.",
    "After biochemical diagnosis, obtain adrenal CT and decide on adrenal vein sampling for lateralization when surgery is desired and feasible."
  ], [
    "Use unilateral adrenalectomy for lateralizing disease in surgical candidates who desire surgery.",
    "Use mineralocorticoid receptor antagonists such as spironolactone or eplerenone for bilateral disease, nonsurgical candidates, or patients not pursuing surgery.",
    "Correct hypokalemia, monitor renin/aldosterone response, BP, potassium, kidney function, and medication tolerance.",
    "Treat cardiovascular, kidney, sleep apnea, and resistant-hypertension risk aggressively because PA-specific therapy reduces excess risk."
  ]);
  if (/pheochromocytoma/.test(lower)) return s([
    "Test with plasma free metanephrines or urinary fractionated metanephrines using proper sampling conditions; repeat borderline results with optimized preparation.",
    "Marked metanephrine elevation, especially >3 times upper limit, strongly supports PPGL and should route to localization imaging.",
    "Do not proceed to biopsy or surgery for suspected PPGL without biochemical framing and preoperative blockade unless emergent specialist-directed care is required.",
    "Assess hereditary risk, multifocal disease, metastatic disease, and medication/stress confounders."
  ], [
    "Begin alpha-adrenergic blockade and volume/salt preparation before surgery once diagnosis is established; add beta-blocker only after adequate alpha blockade if tachyarrhythmia requires it.",
    "Refer for adrenalectomy or tumor resection with endocrine, anesthesia, and surgical planning.",
    "Use genetic counseling/testing when PPGL is confirmed or hereditary features are present.",
    "Manage hypertensive crisis, arrhythmia, ACS/stroke symptoms, or planned urgent procedure with specialist/ICU-level support."
  ]);
  if (/congenital adrenal hyperplasia/.test(lower)) return s([
    "For suspected classic CAH or crisis, check electrolytes, glucose, cortisol/ACTH context, 17-hydroxyprogesterone, renin/aldosterone, and treat instability immediately.",
    "For nonclassic CAH, screen with early morning follicular 17-hydroxyprogesterone and confirm with cosyntropin-stimulated testing when borderline.",
    "Interpret 17-OHP by age, gestational age, sex, assay, timing, menstrual phase, and glucocorticoid exposure.",
    "Use androgen profile and CYP21A2 genetics when diagnosis, family planning, or genotype-phenotype counseling is needed."
  ], [
    "Treat adrenal crisis or salt-wasting with stress-dose hydrocortisone, fluids, dextrose, electrolyte correction, and mineralocorticoid/salt support as indicated.",
    "Use physiologic glucocorticoid replacement for classic CAH and fludrocortisone when mineralocorticoid deficiency is present.",
    "For nonclassic CAH, treat symptoms such as hirsutism, acne, menstrual dysfunction, or infertility rather than asymptomatic labs alone.",
    "Monitor growth/puberty in younger patients and adult overtreatment risks including Cushingoid effects, bone, metabolic, fertility, and adrenal-rest tumors."
  ]);
  if (/polycystic ovary|hirsutism/.test(lower)) return s([
    "Exclude pregnancy and dangerous mimics first, especially rapid virilization or tumor-range androgens.",
    "Diagnose adult PCOS with two of three Rotterdam features after excluding mimics: ovulatory dysfunction, hyperandrogenism, and PCOM or elevated AMH where guideline-supported.",
    "Measure total/free testosterone with reliable assay; add DHEAS, 17-OHP, TSH, prolactin, and Cushing/acromegaly workup when phenotype suggests.",
    "Assess metabolic risk with BP, BMI/waist, glycemia or OGTT, lipids, sleep apnea, fatty liver, and mood/quality-of-life screening."
  ], [
    "Use lifestyle and weight-management support for metabolic risk and patient goals.",
    "Use combined hormonal contraceptive for cycle control and hyperandrogenic symptoms when pregnancy is not desired and no contraindication exists.",
    "Add antiandrogen such as spironolactone only with reliable contraception and monitoring when hirsutism/acne persists after first-line therapy.",
    "For fertility goals, use ovulation induction pathway such as letrozole-first approaches per reproductive specialist/local guideline."
  ]);
  if (/hypogonadism/.test(lower)) return s([
    "Confirm symptoms plus consistently low morning total testosterone on two separate occasions; check free testosterone when SHBG is altered or total testosterone is borderline.",
    "Measure LH/FSH to classify primary versus secondary hypogonadism; add prolactin, iron studies, pituitary evaluation, or karyotype/testicular workup as indicated.",
    "Assess fertility goals before therapy because exogenous testosterone suppresses spermatogenesis.",
    "Before testosterone therapy, assess prostate/breast risk, hematocrit, untreated severe sleep apnea, heart failure, recent cardiovascular events, and contraindications."
  ], [
    "Treat reversible causes such as obesity, sleep apnea, medications, opioids/anabolic steroid withdrawal, systemic illness, pituitary disease, or hyperprolactinemia.",
    "Use testosterone therapy only for confirmed symptomatic testosterone deficiency without contraindications and with monitoring of symptoms, testosterone level, hematocrit, PSA/prostate risk, and adverse effects.",
    "Use fertility-preserving approaches such as gonadotropins or selective estrogen receptor modulators under specialist care when conception is desired.",
    "Refer severe secondary hypogonadism, pituitary mass symptoms, very low testosterone with low/normal gonadotropins, infertility, or testicular mass urgently."
  ]);
  if (/menopause|premature ovarian insufficiency/.test(lower)) return s([
    "For typical menopause at usual age, diagnose clinically when appropriate; rule out pregnancy or abnormal bleeding causes when indicated.",
    "For POI under age 40, confirm ovarian insufficiency with elevated FSH and low estradiol in the right clinical context, repeating if uncertain.",
    "Evaluate POI causes and consequences with pregnancy test, TSH/prolactin when relevant, karyotype/FMR1/adrenal-thyroid autoimmunity, DXA, and fertility counseling as indicated.",
    "Assess contraindications to hormone therapy, cardiovascular/VTE/breast cancer risk, uterine status, symptom burden, bone risk, and patient preferences."
  ], [
    "Use menopausal hormone therapy for bothersome vasomotor symptoms or POI replacement when benefits outweigh risks and contraindications are absent.",
    "For POI, generally replace estrogen to the usual age of menopause with progestogen if uterus is present, plus bone/cardiovascular and fertility counseling.",
    "Use nonhormonal options for vasomotor symptoms when hormone therapy is contraindicated or declined.",
    "Treat genitourinary symptoms with local vaginal therapy or nonhormonal measures based on severity, contraindications, and preference."
  ]);
  if (/erectile dysfunction/.test(lower)) return s([
    "Assess onset, libido, morning erections, vascular risk, medications, depression, sleep apnea, neurologic symptoms, and cardiovascular exercise tolerance.",
    "Measure morning testosterone when low libido, symptoms of hypogonadism, infertility, or endocrine features are present; screen glycemia and lipids.",
    "If testosterone is low, repeat and classify with LH/FSH and prolactin or pituitary workup when indicated.",
    "Identify red flags such as priapism, penile trauma, neurologic deficit, testicular mass, or unstable cardiovascular symptoms."
  ], [
    "Optimize cardiovascular risk, diabetes, BP/lipids, smoking, alcohol, sleep apnea, mood, and medication contributors.",
    "Use PDE5 inhibitor therapy when not contraindicated, with nitrate/riociguat interaction and cardiac risk review.",
    "Treat confirmed hypogonadism only when symptomatic and safe, avoiding exogenous testosterone when fertility is desired.",
    "Escalate to vacuum device, intraurethral/intracavernosal therapy, penile prosthesis, psychosexual therapy, or urology referral when first-line therapy fails or is contraindicated."
  ]);
  if (/amenorrhea/.test(lower)) return s([
    "Rule out pregnancy first in all pregnancy-capable patients with amenorrhea.",
    "Initial labs include TSH, prolactin, FSH, and estradiol; add androgen testing when hyperandrogenism is present.",
    "Use FSH/estradiol pattern to separate ovarian insufficiency from hypothalamic/pituitary causes, then image pituitary or pelvis when indicated.",
    "Check urgent causes: pregnancy with pain/bleeding, severe eating disorder/vital instability, headache/vision symptoms, or rapid virilization."
  ], [
    "Treat the cause: pregnancy care, thyroid disease, hyperprolactinemia, PCOS/anovulation, functional hypothalamic amenorrhea, POI, or structural outflow disorder.",
    "For functional hypothalamic amenorrhea, prioritize nutrition, weight restoration, exercise reduction, stress care, and bone protection.",
    "For POI, provide hormone replacement when appropriate, fertility counseling, and bone/cardiovascular prevention.",
    "Provide endometrial protection for chronic anovulation when pregnancy is not desired."
  ]);
  if (/infertility/.test(lower)) return s([
    "Confirm duration, age, ovulatory pattern, pregnancy loss history, partner factors, and urgency criteria before endocrine-only testing.",
    "Evaluate ovulation and endocrine causes with pregnancy test when amenorrhea, TSH, prolactin, ovarian reserve markers when indicated, PCOS/androgen labs, and midluteal progesterone when useful.",
    "Include semen analysis and tubal/uterine evaluation rather than assuming an endocrine-only cause.",
    "Escalate earlier for age, POI, severe oligo/azoospermia, amenorrhea, recurrent loss, known tubal disease, or cancer-treatment history."
  ], [
    "Treat thyroid disease, hyperprolactinemia, PCOS/anovulation, hypogonadism, or POI according to cause and pregnancy safety.",
    "Use ovulation induction, typically letrozole for PCOS-related anovulation, in the appropriate reproductive pathway.",
    "Use gonadotropins, dopamine agonists, surgery, ART, or male-factor treatment according to etiology and specialist guidance.",
    "Avoid teratogenic medications and align treatment with pregnancy status, partner context, and patient goals."
  ]);
  if (/gynecomastia/.test(lower)) return s([
    "Distinguish glandular gynecomastia from adiposity and from suspicious breast mass, then assess medications, substances, liver/kidney/thyroid disease, hypogonadism, and testicular symptoms.",
    "Order testosterone, LH/FSH, estradiol, hCG, prolactin, TSH, liver/kidney tests, and testicular ultrasound when tumor or testicular abnormality is suspected.",
    "Urgently evaluate hard eccentric mass, nipple discharge, skin/nodal changes, testicular mass, rapid progression, or elevated hCG/estradiol.",
    "If pubertal, medication-related, or physiologic and low risk, observe with follow-up."
  ], [
    "Stop or substitute causative medication/substance when feasible and treat underlying hypogonadism, thyroid, liver, kidney, or tumor cause.",
    "Use reassurance and observation for mild recent physiologic gynecomastia without red flags.",
    "Consider selective estrogen receptor modulator therapy for painful recent gynecomastia in appropriate patients with specialist input.",
    "Refer for breast imaging, oncology/urology/endocrine, or surgery when malignant, testicular, persistent, severe, or distressing disease is present."
  ]);
  if (/prolactinoma/.test(lower)) return s([
    "Confirm hyperprolactinemia with repeat fasting morning prolactin when mild or discordant; exclude pregnancy, hypothyroidism, kidney disease, medications, chest wall causes, and macroprolactin.",
    "Prolactin in the 15-20 ng/mL range generally excludes hyperprolactinemia in many assays, but use local reference intervals.",
    "Obtain pituitary MRI for persistent unexplained prolactin elevation or mass-effect symptoms.",
    "Assess hypogonadism, fertility goals, visual fields, macroadenoma size, pregnancy, and apoplexy symptoms."
  ], [
    "Use dopamine agonist therapy, usually cabergoline when appropriate, for most symptomatic prolactinomas or macroadenomas.",
    "Monitor prolactin response, tumor size, vision, gonadal recovery, and medication tolerance.",
    "Use surgery or radiation when medication is not tolerated, ineffective, or urgent decompression is required.",
    "Manage pregnancy with specialist plan, especially macroadenoma or visual symptoms."
  ]);
  if (/acromegaly|gigantism/.test(lower)) return s([
    "Screen with age/sex/puberty-adjusted IGF-1 when phenotype suggests GH excess.",
    "Confirm with oral glucose GH suppression testing when IGF-1 is elevated or equivocal; use assay-specific GH nadir cutoffs.",
    "After biochemical confirmation, obtain pituitary MRI and assess visual fields and pituitary axes.",
    "Screen complications including sleep apnea, hypertension, diabetes, cardiomyopathy, colon polyps, arthropathy, thyroid nodules, and in gigantism growth velocity/bone age/puberty."
  ], [
    "Use transsphenoidal surgery as first-line for most resectable pituitary adenomas causing GH excess.",
    "Use somatostatin receptor ligands, pegvisomant, dopamine agonists, or radiotherapy for persistent, unresectable, recurrent, or nonsurgical disease.",
    "Treat comorbidities such as sleep apnea, diabetes, hypertension, cardiomyopathy, colon neoplasia risk, and joint disease.",
    "Monitor IGF-1, GH suppression/remission criteria, MRI, pituitary deficits, and complication surveillance longitudinally."
  ]);
  if (/hypopituitarism/.test(lower)) return s([
    "Assess pituitary mass effect and emergency adrenal status first; check 8 AM cortisol/ACTH or dynamic testing when safe.",
    "Evaluate axes with free T4/TSH, LH/FSH plus sex steroid, prolactin, IGF-1 and GH testing when indicated, and sodium/osmolality if DI is possible.",
    "Obtain pituitary MRI for structural cause, prior tumor follow-up, or multiple axis deficits.",
    "Never start or increase thyroid hormone in suspected central adrenal insufficiency until glucocorticoid status is addressed."
  ], [
    "Replace glucocorticoid deficiency before thyroid hormone, with stress-dose education and emergency steroid plan.",
    "Use levothyroxine for central hypothyroidism titrated to free T4, not TSH.",
    "Replace sex steroids, fertility therapy, desmopressin, or growth hormone selectively based on axis deficit, age, contraindications, and goals.",
    "Treat tumor, apoplexy, visual compromise, or postoperative/radiation complications with endocrine-neurosurgical coordination."
  ]);
  if (/diabetes insipidus/.test(lower)) return s([
    "First confirm hypotonic polyuria: high urine volume with low urine osmolality, then check serum sodium and plasma osmolality.",
    "Exclude osmotic diuresis and reversible nephrogenic contributors: hyperglycemia, hypercalcemia, hypokalemia, kidney disease, lithium, and diuretics.",
    "Differentiate central DI, nephrogenic DI, and primary polydipsia using supervised water deprivation/desmopressin or copeptin-based testing when stable.",
    "In postoperative or impaired-consciousness patients, treat hypernatremia and water access risk as urgent before elective diagnostic testing."
  ], [
    "For central DI, use desmopressin with careful sodium monitoring and education to avoid hyponatremia.",
    "For nephrogenic DI, remove offending drugs when possible, treat hypercalcemia/hypokalemia, use low-solute diet, and consider thiazide/NSAID/amiloride strategies under specialist guidance.",
    "For primary polydipsia, avoid empiric desmopressin unless clearly indicated and address psychiatric, medication, or behavioral drivers.",
    "Treat hypernatremia or inability to drink with monitored fluids, desmopressin if central DI is likely, urine output tracking, and frequent sodium checks."
  ]);
  return s([], []);
}

function cleanSupportList(items = []) {
  return (items || [])
    .map((item) => String(item || "").replace(/\s+/g, " ").replace(/[.;\s]+$/g, "").trim())
    .filter(Boolean)
    .join("; ");
}


function augmentWorkup(row) {
  return {
    ...row,
    ...deploymentAdditions(row)
  };
}

function installedModuleForRow(row) {
  return moduleFromWorkup(row).module;
}

function itemSourceId(item = {}) {
  return item.source?.source_id || item.source_id || "source pending";
}

function optionText(options = []) {
  if (!Array.isArray(options) || !options.length) return "";
  return options
    .map((option) => {
      if (typeof option === "string") return option;
      return option.label || option.value || "";
    })
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" / ");
}

function listText(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).join(" / ");
  return String(value || "").trim();
}

function sourceSuffix(item = {}) {
  const parts = [`Source: ${itemSourceId(item)}`];
  if (Object.prototype.hasOwnProperty.call(item, "LR_plus")) parts.push(`LR+ ${item.LR_plus || "n/a"}`);
  if (Object.prototype.hasOwnProperty.call(item, "LR_minus")) parts.push(`LR- ${item.LR_minus || "n/a"}`);
  if (item.difficulty) parts.push(`difficulty ${item.difficulty}`);
  if (item.time_burden_minutes) parts.push(`${item.time_burden_minutes} min`);
  if (item.equipment_needed) parts.push(`equipment ${item.equipment_needed}`);
  return parts.join("; ");
}

function formatQuestionItem(item = {}) {
  const question = item.text || item.label || "";
  const options = optionText(item.options);
  const management = item.management_implication || item.action || "";
  return [
    question,
    options ? `Options: ${options}.` : "",
    item.diagnostic_purpose ? `Purpose: ${item.diagnostic_purpose}` : "",
    management ? `Management: ${management}` : "",
    `Source: ${itemSourceId(item)}.`
  ].filter(Boolean).join(" ");
}

function formatExamItem(item = {}) {
  return [
    `${item.label}: ${item.technique || item.action || "Perform the specified bedside maneuver."}`,
    item.findings_options?.length ? `Findings: ${listText(item.findings_options)}.` : "",
    item.diagnostic_target ? `Target: ${item.diagnostic_target}` : "",
    item.management_change ? `Management: ${item.management_change}` : item.action ? `Management: ${item.action}` : "",
    sourceSuffix(item)
  ].filter(Boolean).join(" ");
}

function formatSafetyItem(item = {}) {
  return [
    `${item.label}: ${item.action || item.rationale || "Check and document."}`,
    item.rationale ? `Rationale: ${item.rationale}` : "",
    `Source: ${itemSourceId(item)}.`
  ].filter(Boolean).join(" ");
}

function formatSimpleItem(item = {}) {
  const label = item.text || item.label || "";
  return [
    item.action && item.action !== label ? `${label}: ${item.action}` : label,
    item.rationale ? `Rationale: ${item.rationale}` : "",
    `Source: ${itemSourceId(item)}.`
  ].filter(Boolean).join(" ");
}

function rawSeedReportSections(row) {
  return {
    source: "raw_seed_fallback",
    module_id: "",
    basic_bedside_data_safety_checks: [],
    clinical_questions: row.questions || [],
    conditional_history_add_ons: [],
    core_physical_exam_maneuvers: row.exam || [],
    conditional_exam_add_ons: [],
    diagnostic_workup_and_reference_values: row.tests || [],
    reference_ranges_and_diagnostic_thresholds: row.reference_values || [],
    clinical_decision_tree: row.decision_steps || [],
    red_flags: row.red_flags || [],
    results_that_change_management: row.management_changes || [],
    treatment_options: row.treatment_options || []
  };
}

function buildReportSections(row) {
  const module = installedModuleForRow(row);
  if (!module) {
    return rawSeedReportSections(row);
  }
  const result = evaluateComplaintCds(module.label, {}, { module });
  return {
    source: "installed_complaint_cds_module",
    module_id: module.id,
    basic_bedside_data_safety_checks: result.safetyChecks.map(formatSafetyItem),
    clinical_questions: result.requiredQuestions.map(formatQuestionItem),
    conditional_history_add_ons: (module.conditionalQuestions || []).map(formatQuestionItem),
    core_physical_exam_maneuvers: result.requiredExam.map(formatExamItem),
    conditional_exam_add_ons: (module.conditionalExam || []).filter((item) => !isBasicBedsideDataItem(item)).map(formatExamItem),
    diagnostic_workup_and_reference_values: result.initialTests.map(formatSimpleItem),
    reference_ranges_and_diagnostic_thresholds: row.reference_values || [],
    clinical_decision_tree: (result.decisionTrees || []).map(formatSimpleItem),
    red_flags: result.redFlags.map(formatSimpleItem),
    results_that_change_management: result.dispositionRules.map(formatSimpleItem),
    treatment_options: (result.treatmentOptions || []).map(formatSimpleItem)
  };
}

function validate(row) {
  const issues = [];
  const validSources = new Set(Object.keys(sources));
  for (const key of ["category", "diagnosis"]) if (!row[key]) issues.push(`missing ${key}`);
  for (const key of ["source_ids", "questions", "exam", "tests", "reference_values", "red_flags", "management_changes"]) {
    if (!Array.isArray(row[key]) || !row[key].length) issues.push(`missing ${key}`);
  }
  const minimums = { questions: 4, exam: 3, tests: 4, reference_values: 2, red_flags: 2, management_changes: 3, decision_steps: 3, treatment_options: 3 };
  for (const [key, minimum] of Object.entries(minimums)) {
    if ((row[key] || []).length < minimum) {
      issues.push(`${key} has ${row[key]?.length || 0}; expected at least ${minimum}`);
    }
  }
  for (const sourceId of row.source_ids || []) if (!validSources.has(sourceId)) issues.push(`unknown source ${sourceId}`);
  const hasNumericValue = [...row.tests, ...row.reference_values].some((value) => /(?:>=|<=|>|<|\d)/.test(String(value)));
  if (!hasNumericValue) issues.push("missing reference values or thresholds");
  const reportSections = row.report_sections;
  if (reportSections) {
    if (!reportSections.core_physical_exam_maneuvers?.length) issues.push("report missing core physical exam maneuvers");
    if (!reportSections.basic_bedside_data_safety_checks?.length) issues.push("report missing basic bedside data safety checks");
    if (!reportSections.clinical_decision_tree?.length) issues.push("report missing clinical decision tree");
    if (!reportSections.treatment_options?.length) issues.push("report missing treatment options");
    const reportText = JSON.stringify(reportSections);
    if (/Focused physical exam|Vitals and acuity screen|Proximal strength, bone tenderness, gait\/falls, hypocalcemia signs/i.test(reportText)) {
      issues.push("report exposes stale bundled exam wording");
    }
  }
  return issues;
}

function formatList(items) {
  if (!items?.length) return "- None.";
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
    `- Current app installed module support: ${results.filter((row) => row.app_module_id).length}/${results.length}`,
    `- Current app validated-intent matches: ${results.filter((row) => row.app_intent_matches.length).length}/${results.length}`,
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
      `Current app support: installed module ${row.app_module_id}; validated intent matches: ${row.app_intent_matches.length ? row.app_intent_matches.map((match) => `${match.intent_id} (${match.score})`).join("; ") : "none - searchable through installed medical knowledge module"}`,
      `Guidelines: ${row.source_ids.join("; ")}`,
      "",
      "Basic bedside data / safety checks:",
      formatList(row.report_sections.basic_bedside_data_safety_checks),
      "",
      "Clinical questions:",
      formatList(row.report_sections.clinical_questions),
      "",
      "Conditional history add-ons:",
      formatList(row.report_sections.conditional_history_add_ons),
      "",
      "Core physical exam maneuvers:",
      formatList(row.report_sections.core_physical_exam_maneuvers),
      "",
      "Conditional exam add-ons:",
      formatList(row.report_sections.conditional_exam_add_ons),
      "",
      "Diagnostic workup and reference values:",
      formatList(row.report_sections.diagnostic_workup_and_reference_values),
      "",
      "Reference ranges / diagnostic thresholds:",
      formatList(row.report_sections.reference_ranges_and_diagnostic_thresholds),
      "",
      "Clinical decision tree:",
      formatList(row.report_sections.clinical_decision_tree),
      "",
      "Red flags:",
      formatList(row.report_sections.red_flags),
      "",
      "Results that change management:",
      formatList(row.report_sections.results_that_change_management),
      "",
      "Treatment options:",
      formatList(row.report_sections.treatment_options)
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
  const results = workups.map((row) => augmentWorkup(row)).map((row) => {
    const withReportSections = {
      ...row,
      app_module_id: diagnosisModuleId(row.diagnosis),
      app_intent_matches: resolveAppSupport(row),
      report_sections: buildReportSections(row)
    };
    return {
      ...withReportSections,
      quality_issues: validate(withReportSections)
    };
  });
  const reportPath = write(args.out, formatReport(results));
  const jsonPath = write(args.json, `${JSON.stringify({ generated_at: generatedAt, accessed_date: accessedDate, sources, workups: results }, null, 2)}\n`);
  const issueCount = results.reduce((sum, row) => sum + row.quality_issues.length, 0);
  const registryGapCount = results.filter((row) => !row.app_module_id).length;
  process.stdout.write(`Generated ${results.length} endocrine workups: ${reportPath}\n`);
  process.stdout.write(`JSON: ${jsonPath}\n`);
  process.stdout.write(`Quality issues: ${issueCount}; current app installed-module gaps: ${registryGapCount}\n`);
}

main();
