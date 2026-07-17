import { DEFAULT_CONTEXT_SECTION_LABELS, DEFAULT_DAILY_SECTION_LABELS, createPatientRecord, createTextSection, normalizeDay } from "../../app/state/vault.js";

export const DEMO_PATIENT_ID = "demo_patient_guided_case";
export const DEMO_DAY_ID = "demo_day_guided_case";
export const DEMO_WORKUP_ID = "general-admission";
export const DEMO_ADMISSION_DATE = "2026-07-17";

export const DEMO_CONTEXT_TEXTS = [
  `Patient Information

Patient Name: Daniel Christopher Morgan
Preferred Name: Dan
DOB: 11/22/1964
Age: 61 years
Sex: Male
Gender Identity: Male
MRN: NRM-847295104
FIN: FIN-260717-482913
Encounter ID: ENC-20260717-184209
Admission Date: 07/17/2026
Admission Time: 08:43
Hospital: North River Regional Medical Center
Department: Cardiology
Attending Physician: Dr. Rachel M. Peterson, MD
Primary Care Physician: Dr. Steven H. Wallace
Consulting Cardiologist: Dr. Omar K. Hassan
Insurance: Horizon Choice PPO
Member ID: HC-983441207
Group Number: 440781
Home Address: 4829 Willow Creek Drive, Carmel, IN 46032
Home Phone: (317) 555-4812
Mobile Phone: (317) 555-9073
Email: daniel.morgan.synthetic@example.test
Employer: Midwest Industrial Automation
Occupation: Mechanical Engineer
Marital Status: Married
Emergency Contact: Rebecca Morgan (wife)
Emergency Contact Phone: (317) 555-1848

Chief Complaint

Chest pain with shortness of breath.

History of Present Illness

Daniel Morgan is a 61-year-old male with coronary artery disease status post drug-eluting stent placement to the proximal LAD in 2022, hypertension, hyperlipidemia, type 2 diabetes mellitus, obesity with BMI 34.1 kg/m2, gastroesophageal reflux disease, and obstructive sleep apnea treated with CPAP.

He presents to the emergency department after approximately six hours of progressively worsening substernal chest pressure. Symptoms began while loading heavy equipment into his pickup truck around 6:30 AM. Initially he attributed the discomfort to muscle strain, but the pain became increasingly severe over the next several hours.

The discomfort is crushing substernal pressure rated 8/10 with radiation into the left shoulder, medial left arm, neck, and jaw. It is associated with diaphoresis, nausea, generalized fatigue, and mild shortness of breath. Symptoms partially improved with rest but recurred with minimal exertion.

He reports several brief episodes of exertional chest discomfort over the preceding two weeks while climbing stairs at work, each resolving after several minutes of rest. He did not seek medical attention.

He denies fever, chills, productive cough, pleuritic chest pain, hemoptysis, recent immobilization, calf pain, syncope, abdominal pain, or recent illness. EMS administered aspirin 324 mg and one sublingual nitroglycerin en route with partial improvement.`,
  `Past Medical History

Coronary artery disease
PCI with drug-eluting stent in 2022
Hypertension
Hyperlipidemia
Type 2 diabetes mellitus
Obesity
Obstructive sleep apnea
Gastroesophageal reflux disease

Past Surgical History

Percutaneous coronary intervention in 2022
Laparoscopic cholecystectomy in 2016
Right knee arthroscopy in 2011
Appendectomy in 1988

Home Medications

Aspirin 81 mg daily
Atorvastatin 80 mg nightly
Metoprolol succinate 50 mg daily
Lisinopril 20 mg daily
Metformin ER 1000 mg twice daily
Empagliflozin 25 mg daily
Omeprazole 20 mg daily
Nitroglycerin 0.4 mg SL as needed

Allergies

Penicillin - diffuse urticarial rash
Morphine - severe nausea

Family History

Father died of myocardial infarction at age 57.
Mother has hypertension and chronic kidney disease.
Older brother underwent CABG at age 60.

Social History

Former smoker, 30 pack-years, quit in 2019.
Alcohol: 2-3 beers weekly.
Denies recreational drug use.
Lives with spouse and is independent with all activities of daily living.

Review of Systems

Positive for chest pain, dyspnea, diaphoresis, nausea, and fatigue.
Negative for fever, cough, syncope, hemoptysis, vomiting, leg swelling, dysuria, headache, and focal neurologic deficits.`,
  `Physical Examination

Vital Signs

BP 166/94 mmHg
HR 106 bpm
RR 20/min
Temp 98.7 F
SpO2 95% on room air
Weight 108.4 kg
Height 178 cm
BMI 34.1

General: Mild distress secondary to chest pain.
Cardiovascular: Tachycardic. Regular rhythm. Normal S1/S2. No murmurs, rubs, or gallops.
Respiratory: Clear bilaterally. No wheezing or crackles.
Abdomen: Soft, non-tender, and non-distended.
Extremities: No edema. Peripheral pulses 2+.
Neurologic: Alert and oriented x4. No focal deficits.

Laboratory Results

WBC 9.6 x10^3/uL, reference range 4.0-10.5
RBC 4.74 x10^6/uL, reference range 4.20-5.80
Hemoglobin 14.7 g/dL, reference range 13.5-17.5
Hematocrit 43.8%, reference range 41-53
MCV 92.3 fL, reference range 80-100
MCH 31.0 pg, reference range 27-33
MCHC 33.6 g/dL, reference range 32-36
RDW 13.4%, reference range 11.5-14.5
Platelets 251 x10^3/uL, reference range 150-400
MPV 9.2 fL, reference range 7.5-11.5

Imaging

ECG: Sinus tachycardia, 1 mm ST depressions in V4-V6, and T-wave inversion in leads I and aVL.
Chest X-ray: No acute infiltrate or pleural effusion. Cardiomediastinal silhouette mildly enlarged.`,
  `Assessment

Daniel Morgan is a 61-year-old male with multiple cardiovascular risk factors presenting with high-risk chest pain and rising troponins consistent with non-ST elevation myocardial infarction (NSTEMI). TIMI score indicates elevated risk.

Differential diagnosis considered:
NSTEMI, most likely
Unstable angina
Pulmonary embolism
Aortic dissection, low suspicion
GERD
Musculoskeletal chest pain

Initial Hospital Plan

Admit to telemetry.
Continuous cardiac monitoring.
Serial ECGs and serial troponins.
Initiate IV unfractionated heparin infusion.
Continue aspirin.
Load ticagrelor.
Continue high-intensity statin.
Start nitroglycerin infusion if pain persists.
Cardiology consultation.
Coronary angiography within 24 hours.
Echocardiogram.
NPO after midnight.

De-identified Background Information

Admission date: 07/17/2026.
Admission context: Adult admitted from the emergency department with exertional substernal chest pain radiating to the left arm and jaw, elevated cardiac biomarkers, and ECG changes concerning for NSTEMI.
Medications: Aspirin, IV heparin infusion, high-intensity statin, beta blocker, ACE inhibitor, nitroglycerin as needed, and correctional insulin.
Labs: Serial troponins increased significantly. Renal function remained stable. Mild hyperglycemia noted. CBC without leukocytosis or anemia.
Other: Telemetry admission with cardiology consultation and planned coronary angiography.`
];

export const DEMO_DAILY_TEXTS = [
  `HD1 - Hospital Day 1 (07/17/2026)

Interval Events

The patient remained hemodynamically stable overnight with intermittent mild substernal chest discomfort responsive to nitroglycerin. No sustained arrhythmias were observed on continuous telemetry. Cardiology evaluated the patient and recommended early invasive coronary angiography the following morning. The patient remained alert, oriented, and participated in discussions regarding risks, benefits, and expected management.`,
  `New Labs and Results

High-sensitivity troponin peaked at 364 ng/L before beginning to downtrend. Repeat ECG demonstrated persistent lateral ST-segment depression without new ST elevation. Transthoracic echocardiogram showed a left ventricular ejection fraction of approximately 48% with mild hypokinesis of the anterior wall and no significant valvular abnormalities.`,
  `Medication Changes

Dual antiplatelet therapy was initiated with a ticagrelor loading dose followed by maintenance dosing. Continuous unfractionated heparin infusion was maintained with therapeutic monitoring. Home metformin was temporarily held because of anticipated coronary angiography with iodinated contrast. Sliding-scale insulin was initiated for inpatient glycemic management.`,
  `Patient-Reported Symptoms

The patient reported improved chest discomfort, decreasing from 8/10 at presentation to 2/10 by evening. Mild fatigue persisted, but nausea and diaphoresis resolved. He denied shortness of breath at rest, palpitations, dizziness, or recurrent severe chest pain.`,
  `Other

The patient remained NPO after midnight in preparation for coronary angiography. Fall precautions and continuous telemetry were maintained. Nursing staff provided education regarding acute coronary syndrome, medication adherence, smoking cessation reinforcement, and expected inpatient treatment course.`
];

function sections(labels, texts, prefix) {
  return labels.map((label, index) => createTextSection(label, { id: `demo_${prefix}_${index}`, text: texts[index] || "" }));
}

export function createDemoPatient() {
  const day = normalizeDay({
    id: DEMO_DAY_ID,
    date: DEMO_ADMISSION_DATE,
    label: "HD1 - NSTEMI admission",
    sections: sections(DEFAULT_DAILY_SECTION_LABELS, DEMO_DAILY_TEXTS, "daily"),
    checklistSnapshot: null,
    answers: {},
    quickNotes: []
  }, 0);
  return createPatientRecord("Demo patient · Synthetic NSTEMI case", {
    id: DEMO_PATIENT_ID,
    metadata: { demo: true, synthetic: true },
    contextSections: sections(DEFAULT_CONTEXT_SECTION_LABELS, DEMO_CONTEXT_TEXTS, "context"),
    days: [day]
  });
}
