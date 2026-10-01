import { createPatientRecord, normalizeDay } from "../../app/state/vault.js?v=20260921-medication-card-v4";
import { normalizeSourceCapture } from "../../patient-context/source-captures.js?v=20260921-medication-card-v4";
import { parsePrimaryTeamNote } from "../../patient-context/primary-team-note-parser.js?v=20260925-one-liner-v1";

export const DEMO_PATIENT_ID = "demo_patient_guided_case";
export const DEMO_DAY_ID = "demo_day_guided_case";
export const DEMO_ADMISSION_DATE = "2026-07-17";
export const DEMO_ASSESSMENT = `61-year-old man with known coronary artery disease, prior LAD drug-eluting stent, hypertension, hyperlipidemia, type 2 diabetes, obesity, and former tobacco use admitted with a high-risk NSTEMI. His ischemic chest pain has improved with nitroglycerin, high-sensitivity troponin peaked at 364 ng/L and is now downtrending, and ECG continues to show lateral ST depressions without ST elevation. He remains hemodynamically stable without arrhythmia or clinical heart failure. Echocardiography shows mildly reduced LVEF of 48% with anterior-wall hypokinesis. He is awaiting early invasive coronary angiography.`;

export const DEMO_PLAN_PROBLEMS = Object.freeze([
  Object.freeze({
    id: "demo_problem_nstemi",
    problem: "NSTEMI / coronary artery disease",
    keyContext: "Typical exertional chest pressure with dynamic troponin elevation, persistent lateral ischemic changes, and prior LAD PCI; pain is now improved and troponin is downtrending.",
    etiologyStatus: "known",
    knownEtiology: "Acute coronary syndrome from presumed plaque rupture in established atherosclerotic coronary disease.",
    differentials: [],
    diagnosticPlan: "Continue telemetry and repeat ECG for recurrent pain or clinical change. Trend troponin to confirm decline. Coronary angiography is planned today; review anatomy and intervention results with Cardiology.",
    therapeuticPlan: "Continue aspirin 81 mg daily, ticagrelor 90 mg twice daily, therapeutic unfractionated heparin until angiography, atorvastatin 80 mg nightly, and metoprolol as hemodynamics allow. Use sublingual nitroglycerin for recurrent pain, maintain NPO status, and escalate urgently for refractory pain, instability, or new ST elevation."
  }),
  Object.freeze({
    id: "demo_problem_lv_dysfunction",
    problem: "Mild ischemic left-ventricular systolic dysfunction",
    keyContext: "TTE shows LVEF 48% with mild anterior-wall hypokinesis; the patient is warm, euvolemic, and without dyspnea, orthopnea, edema, or oxygen requirement.",
    etiologyStatus: "known",
    knownEtiology: "Most consistent with myocardial stunning or ischemic cardiomyopathy in the setting of NSTEMI.",
    differentials: [],
    diagnosticPlan: "Follow volume status, intake/output, daily weight, renal function, and potassium. Repeat echocardiography after revascularization and guideline-directed therapy according to the Cardiology follow-up plan.",
    therapeuticPlan: "Continue metoprolol and lisinopril as blood pressure and renal function permit. No diuresis is indicated while clinically euvolemic. Provide heart-failure warning-sign and medication-adherence education."
  }),
  Object.freeze({
    id: "demo_problem_diabetes",
    problem: "Type 2 diabetes mellitus",
    keyContext: "Mild inpatient hyperglycemia with stable renal function; home metformin and empagliflozin are held around acute illness and iodinated contrast exposure.",
    etiologyStatus: "known",
    knownEtiology: "Established type 2 diabetes mellitus.",
    differentials: [],
    diagnosticPlan: "Check bedside glucose before meals and at bedtime and review the most recent hemoglobin A1c. Continue daily metabolic panels around contrast exposure.",
    therapeuticPlan: "Use correctional insulin while NPO. Avoid hypoglycemia. Resume the outpatient regimen only after oral intake and renal function are stable and there is no ongoing contraindication after angiography."
  })
]);

export const DEMO_CONTEXT_TEXTS = [
  `Patient Information

Patient Name: Daniel Christopher Morgan
Preferred Name: Dan
DOB year: 1964
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

He presents to the emergency department after approximately six hours of progressively worsening substernal chest pressure. Symptoms began during physical exertion that morning. Initially he attributed the discomfort to muscle strain, but the pain became increasingly severe over the next several hours.

The discomfort is crushing substernal pressure rated 8/10 with radiation into the left shoulder, medial left arm, neck, and jaw. It is associated with diaphoresis, nausea, generalized fatigue, and mild shortness of breath. Symptoms partially improved with rest but recurred with minimal exertion.

He reports several brief episodes of exertional chest discomfort over the preceding two weeks, each resolving after several minutes of rest. He did not seek medical attention.

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

const DEMO_CAPTURE_TIME = "2026-07-17T18:00:00.000Z";

// The demo draft is not hand-written: it is built from the same deterministic
// primary-note parses the tour showcases, so the Draft Note the user reviews
// is the parsed case (admission H&P plus the day-one update), not a stub.
const demoParsedSection = (value) => ({ deidentifiedText: String(value || "").trim() });

// The day-one update keeps its subheadings ("Patient-Reported Symptoms",
// "Other") inside the parser's broader sections, so route them to the right
// progress-note fields by splitting on the exact subheading lines.
function extractSubsection(body, heading, stopHeadings = []) {
  const lines = String(body || "").split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return "";
  const stop = new Set(stopHeadings);
  const collected = [];
  for (const line of lines.slice(start + 1)) {
    if (stop.has(line.trim())) break;
    collected.push(line);
  }
  return collected.join("\n").trim();
}

const DEMO_CLOSING_FEN = "NPO after midnight in preparation for coronary angiography. Maintenance IV fluids while NPO; monitor ins/outs.";
const DEMO_CLOSING_VTE = "Therapeutic heparin infusion for ACS; sequential compression devices while on bed rest.";
const DEMO_CLOSING_DISPOSITION = "Admit to telemetry. Coronary angiography planned today; cardiology consulted.";

function demoNoteDraft(patientId = DEMO_PATIENT_ID) {
  const admission = parsePrimaryTeamNote(DEMO_CONTEXT_TEXTS.join("\n\n"), "hp");
  const daily = parsePrimaryTeamNote(DEMO_DAILY_TEXTS.join("\n\n"), "progress");
  const admissionSections = admission?.sections || {};
  const dailySections = daily?.sections || {};
  const dailyMedications = String(dailySections.medications || "");
  return {
    noteType: "progress",
    patientId,
    hospitalDayId: DEMO_DAY_ID,
    sections: {
      one_liner: demoParsedSection(admissionSections.one_liner),
      interval_events: demoParsedSection(dailySections.interval_events),
      patient_report: demoParsedSection(extractSubsection(dailyMedications, "Patient-Reported Symptoms", ["Other"])),
      other: demoParsedSection(extractSubsection(dailyMedications, "Other")),
      physical_exam: demoParsedSection(admissionSections.physical_exam),
      // Admission H&P sections, carried so the H&P format switch in the
      // review tab stays populated with the same parsed content.
      chief_complaint: demoParsedSection(admissionSections.chief_complaint),
      history_of_present_illness: demoParsedSection(admissionSections.history_of_present_illness),
      medications: demoParsedSection(admissionSections.medications),
      allergies: demoParsedSection(admissionSections.allergies),
      past_medical_history: demoParsedSection(admissionSections.past_medical_history),
      past_surgical_history: demoParsedSection(admissionSections.past_surgical_history),
      family_history: demoParsedSection(admissionSections.family_history),
      social_history: demoParsedSection(admissionSections.social_history)
    },
    objective: {
      // Parsed admission labs and imaging; the objective data blocks
      // (vitals, medications) are auto-selected by the review view itself.
      manual: demoParsedSection(admissionSections.objective)
    },
    closing: {
      fen: demoParsedSection(DEMO_CLOSING_FEN),
      vte_prophylaxis: demoParsedSection(DEMO_CLOSING_VTE),
      code_status: demoParsedSection("Full code."),
      disposition: demoParsedSection(DEMO_CLOSING_DISPOSITION)
    },
    assessment: DEMO_ASSESSMENT,
    problems: DEMO_PLAN_PROBLEMS
  };
}

const DEMO_OBJECTIVE_CAPTURES = Object.freeze([
  {
    id: "demo_vitals",
    sourceKind: "vital_signs",
    label: "Hospital day 1 vital signs",
    deidentifiedText: `Vitals
@ 07/17/26 1800: BP 128/76; Pulse 82; Respiratory rate 16; Temp 37.0; SpO2 97
@ 07/17/26 1400: BP 136/82; Pulse 88; Respiratory rate 18; Temp 37.1; SpO2 96
@ 07/17/26 1000: BP 148/88; Pulse 96; Respiratory rate 18; Temp 37.2; SpO2 96
@ 07/17/26 0845: BP 166/94; Pulse 106; Respiratory rate 20; Temp 37.1; SpO2 95`,
    capturedAt: DEMO_CAPTURE_TIME,
    createdAt: DEMO_CAPTURE_TIME,
    updatedAt: DEMO_CAPTURE_TIME
  },
  {
    id: "demo_labs",
    sourceKind: "laboratory_results",
    label: "Serial cardiac and metabolic labs",
    deidentifiedText: `Labs
@ 07/17/26 1800
High-sensitivity troponin: 312 ng/L; ref 0-19; flag H
Creatinine: 1.0 mg/dL; ref 0.6-1.3
Potassium: 4.2 mmol/L; ref 3.5-5.1
Glucose: 164 mg/dL; ref 70-140; flag H
Hemoglobin: 14.2 g/dL; ref 13.5-17.5

@ 07/17/26 1400
High-sensitivity troponin: 364 ng/L; ref 0-19; flag H
Creatinine: 1.0 mg/dL; ref 0.6-1.3
Potassium: 4.0 mmol/L; ref 3.5-5.1

@ 07/17/26 0900
High-sensitivity troponin: 86 ng/L; ref 0-19; flag H
Creatinine: 1.1 mg/dL; ref 0.6-1.3
Potassium: 4.1 mmol/L; ref 3.5-5.1`,
    capturedAt: DEMO_CAPTURE_TIME,
    createdAt: DEMO_CAPTURE_TIME,
    updatedAt: DEMO_CAPTURE_TIME
  },
  {
    id: "demo_ecg",
    sourceKind: "results",
    label: "ECG interpretation",
    resultCategory: "other",
    resultDate: "Hospital day 1 · 14:15",
    resultContext: "Repeat ECG",
    deidentifiedText: "Sinus rhythm at 86 bpm with persistent 1 mm ST-segment depressions in V4-V6 and T-wave inversions in leads I and aVL; no new ST elevation.",
    capturedAt: DEMO_CAPTURE_TIME,
    createdAt: DEMO_CAPTURE_TIME,
    updatedAt: DEMO_CAPTURE_TIME
  },
  {
    id: "demo_echo",
    sourceKind: "results",
    label: "Transthoracic echocardiogram",
    resultCategory: "imaging",
    resultDate: "Hospital day 1",
    resultContext: "Final interpretation",
    deidentifiedText: "LVEF 48% with mild anterior-wall hypokinesis. Normal right-ventricular size and function. No hemodynamically significant valvular disease or pericardial effusion.",
    capturedAt: DEMO_CAPTURE_TIME,
    createdAt: DEMO_CAPTURE_TIME,
    updatedAt: DEMO_CAPTURE_TIME
  },
  {
    id: "demo_medications",
    sourceKind: "medication_activity",
    label: "Active medication regimens",
    deidentifiedText: `Medications
[Scheduled Medications] aspirin — Dose: 81 mg | Route: PO | Administrations: 0900
[Scheduled Medications] ticagrelor — Dose: 90 mg | Route: PO | Administrations: 0900
[Continuous Infusions] unfractionated heparin — Dose: 12 units/kg/hr | Route: IV | Administrations: 1745
[Scheduled Medications] atorvastatin — Dose: 80 mg | Route: PO | Administrations: 2100`,
    capturedAt: DEMO_CAPTURE_TIME,
    createdAt: DEMO_CAPTURE_TIME,
    updatedAt: DEMO_CAPTURE_TIME
  }
]);

export function createDemoPatient() {
  const day = normalizeDay({
    id: DEMO_DAY_ID,
    date: DEMO_ADMISSION_DATE,
    label: "HD1 - NSTEMI admission",
    sourceCaptures: []
  }, 0);
  return {
    ...createPatientRecord("Demo patient · Synthetic NSTEMI case", {
    id: DEMO_PATIENT_ID,
    metadata: { demo: true, synthetic: true },
    contextSections: [],
    days: [day]
    }),
    noteDrafts: { [DEMO_DAY_ID]: demoNoteDraft() }
  };
}

// Attaches the sample objective captures (vitals, labs, ECG, echo, medications)
// to the demo hospital day. Called when the demo reaches the bedside
// cheat-sheet step, so the note-writing step has objective data without
// requiring any bedside data entry.
export function attachDemoObjectiveData(patient) {
  return {
    ...patient,
    days: (patient?.days || []).map((day) => {
      if (day.id !== DEMO_DAY_ID) return day;
      const demoIds = new Set(DEMO_OBJECTIVE_CAPTURES.map((capture) => capture.id));
      const sourceCaptures = [
        ...(day.sourceCaptures || []).filter((capture) => !demoIds.has(capture.id)),
        ...DEMO_OBJECTIVE_CAPTURES.map((capture) => normalizeSourceCapture(capture, { now: () => DEMO_CAPTURE_TIME }))
      ];
      return { ...day, sourceCaptures };
    })
  };
}
