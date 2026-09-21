import { CORE_ADMISSION_WORKUPS } from "./admission-core.js";

const FOUNDATION_WORKUPS = [
  {
    schema: "prerounding_workup_v1",
    id: "nstemi-prerounds",
    title: "NSTEMI pre-rounds",
    aliases: ["acute coronary syndrome", "acs", "myocardial infarction", "chest pain"],
    items: [
      { id: "chest-pain-now", kind: "history", system: "cardiovascular", text: "Do you have chest pressure or pain now?", choices: ["No chest discomfort now", "Mild or intermittent chest discomfort", "Persistent or worsening chest discomfort"], select: "one" },
      { id: "nitroglycerin-response", kind: "history", system: "cardiovascular", text: "Did nitroglycerin relieve the chest discomfort?", choices: ["No recurrent pain", "Chest discomfort relieved promptly with nitroglycerin", "Chest discomfort only partly relieved with nitroglycerin", "Chest discomfort not relieved with nitroglycerin"], select: "one" },
      { id: "heart-failure-symptoms", kind: "history", system: "respiratory", text: "Any shortness of breath, orthopnea, or new swelling?", choices: ["No dyspnea, orthopnea, or new swelling", "Exertional dyspnea only", "Orthopnea or nocturnal dyspnea", "Dyspnea at rest or new edema"], select: "one" },
      { id: "rhythm-low-output-symptoms", kind: "history", system: "cardiovascular", text: "Any palpitations, dizziness, or fainting?", choices: ["No palpitations, dizziness, or syncope", "Palpitations without dizziness", "Dizziness or near-syncope", "Syncope"], select: "one" },
      { id: "bleeding-symptoms", kind: "history", system: "hematologic", text: "Any bleeding since antithrombotic therapy started?", choices: ["No bleeding symptoms", "Minor bruising or mucosal bleeding", "Possible gastrointestinal or urinary bleeding", "Active significant bleeding"], select: "one" },
      { id: "ischemic-equivalents", kind: "history", system: "cardiovascular", text: "Any symptoms similar to the presenting episode without chest pain?", choices: ["No ischemic-equivalent symptoms", "Mild fatigue only", "Possible ischemic-equivalent symptoms", "Persistent concerning symptoms"], select: "one" },
      { id: "medication-history", kind: "history", system: "medication", text: "Were cardiac medications taken consistently before admission?", choices: ["Cardiac medications taken consistently without adverse effects", "Occasional missed doses", "Cardiac medications frequently missed or stopped", "Medication adherence unable to be reconciled"], select: "one" },
      { id: "procedure-readiness", kind: "history", system: "general", text: "Is the patient ready for planned coronary angiography?", choices: ["NPO, understands the procedure, and reports no prior contrast reaction", "Has questions about the procedure", "Reports a possible prior contrast reaction", "Fasting status uncertain"], select: "one" },
      { id: "glycemic-symptoms", kind: "history", system: "endocrine", text: "Any symptoms of low or high blood sugar?", choices: ["No hypo- or hyperglycemic symptoms", "Possible hypoglycemic symptoms", "Possible hyperglycemic symptoms", "Glycemic symptoms unable to be assessed"], select: "one" },
      { id: "overall-appearance", kind: "exam", system: "general", text: "Assess general appearance and distress.", choices: ["Comfortable, alert, no diaphoresis or respiratory distress", "Mild discomfort or anxiety", "Diaphoretic or increased work of breathing", "Ill-appearing or altered"], select: "one" },
      { id: "hemodynamics", kind: "exam", system: "cardiovascular", text: "Assess hemodynamic stability and oxygen requirement.", choices: ["Hemodynamically stable without new oxygen need", "Hypertensive or mildly tachycardic", "New oxygen requirement", "Hypotensive or otherwise unstable"], select: "one" },
      { id: "jugular-venous-pressure", kind: "exam", system: "cardiovascular", text: "Assess jugular venous pressure.", choices: ["JVP not elevated", "JVP elevated", "JVP low", "JVP unable to be assessed"], select: "one" },
      { id: "cardiac-auscultation", kind: "exam", system: "cardiovascular", text: "Auscultate the heart.", choices: ["Regular rhythm, no new murmur, gallop, or rub", "Irregular rhythm", "New murmur", "Gallop or rub present"], select: "one" },
      { id: "lung-exam", kind: "exam", system: "respiratory", text: "Auscultate the lungs.", choices: ["Lungs clear throughout, including the bases", "Bibasilar crackles", "Focal diminished sounds or crackles", "Diffuse wheeze or other abnormality"], select: "one" },
      { id: "perfusion-pulses", kind: "exam", system: "cardiovascular", text: "Assess peripheral perfusion and pulse symmetry.", choices: ["Warm, well perfused, symmetric palpable pulses", "Cool extremities or delayed refill", "Asymmetric or diminished pulse", "Pulse not palpable"], select: "one" },
      { id: "edema", kind: "exam", system: "cardiovascular", text: "Assess for peripheral and sacral edema.", choices: ["No peripheral or sacral edema", "Trace edema", "Mild to moderate pitting edema", "Marked edema"], select: "one" },
      { id: "chest-wall", kind: "exam", system: "musculoskeletal", text: "Palpate for reproducible chest-wall tenderness.", choices: ["No reproducible chest-wall tenderness", "Focal reproducible tenderness", "Diffuse tenderness", "Chest-wall exam deferred due to active pain"], select: "one" },
      { id: "calf-exam", kind: "exam", system: "cardiovascular", text: "Assess the calves for asymmetric DVT findings.", choices: ["No calf asymmetry, warmth, or tenderness", "Unilateral swelling", "Calf warmth or tenderness", "Calf exam unable to be assessed"], select: "one" },
      { id: "abdominal-aortic-exam", kind: "exam", system: "gastrointestinal", text: "Perform the focused abdominal and aortic exam.", choices: ["Abdomen soft and nontender without a concerning pulsatile mass", "Abdominal tenderness", "Concerning pulsatile mass or bruit", "Abdominal exam unable to be assessed"], select: "one" },
      { id: "focused-neurologic-exam", kind: "exam", system: "neurologic", text: "Perform a focused neurologic exam.", choices: ["Alert with clear speech and no focal deficit", "Baseline neurologic deficit only", "New focal deficit", "Neurologic exam unable to be assessed"], select: "one" },
      { id: "bleeding-skin-exam", kind: "exam", system: "hematologic", text: "Inspect for active bleeding or significant bruising.", choices: ["No active bleeding or significant bruising", "Minor stable bruising", "Oozing or expanding hematoma", "Active significant bleeding"], select: "one" }
    ]
  },
  {
    schema: "prerounding_workup_v1",
    id: "general-admission",
    title: "General admission",
    aliases: ["new admission", "h&p", "initial rounds"],
    items: [
      {
        id: "presenting_symptoms",
        kind: "history",
        system: "general",
        text: "Clarify the primary symptom timeline, triggers, relieving factors, and associated symptoms.",
        choices: ["Not asked", "Asked, no concern", "Positive", "Unclear"],
        select: "one"
      },
      {
        id: "baseline_function",
        kind: "history",
        system: "functional",
        text: "Document baseline function, living situation, supports, and assistive devices.",
        choices: ["Independent", "Needs help", "Facility-level care", "Unclear"],
        select: "one"
      },
      {
        id: "medication_reconciliation",
        kind: "history",
        system: "medication",
        text: "Reconcile home medications, recent changes, adherence, allergies, OTC products, and supplements.",
        choices: ["Complete", "Partial", "Unable to verify"],
        select: "one"
      },
      {
        id: "general_appearance",
        kind: "exam",
        system: "general",
        text: "General appearance, distress level, mentation, work of breathing, and room-entry impression.",
        choices: ["Normal", "Abnormal", "Not assessed"],
        select: "one"
      },
      {
        id: "focused_exam",
        kind: "exam",
        system: "general",
        text: "Focused exam tied to the presenting problem with relevant positives and negatives.",
        choices: ["Complete", "Partial", "Deferred"],
        select: "one"
      }
    ]
  },
  {
    schema: "prerounding_workup_v1",
    id: "chest-pain",
    title: "Chest pain",
    aliases: ["acs", "troponin", "angina"],
    items: [
      {
        id: "pain_character",
        kind: "history",
        system: "cardiovascular",
        text: "Characterize chest pain using onset, provocation, quality, radiation, severity, timing, and exertional relationship.",
        choices: ["Absent", "Typical", "Atypical", "Unclear"],
        select: "one"
      },
      {
        id: "associated_symptoms",
        kind: "history",
        system: "cardiovascular",
        text: "Ask about dyspnea, diaphoresis, nausea, syncope, palpitations, pleuritic features, and infectious symptoms.",
        choices: ["None", "Present", "Mixed", "Unclear"],
        select: "one"
      },
      {
        id: "cardiopulmonary_exam",
        kind: "exam",
        system: "cardiovascular",
        text: "Assess cardiopulmonary exam including murmurs, volume status, lung findings, pulses, and chest wall tenderness.",
        choices: ["Reassuring", "Abnormal", "Not assessed"],
        select: "one"
      }
    ]
  },
  {
    schema: "prerounding_workup_v1",
    id: "infection-sepsis",
    title: "Infection / sepsis",
    aliases: ["fever", "sepsis", "bacteremia"],
    items: [
      {
        id: "source_review",
        kind: "history",
        system: "infectious",
        text: "Review localizing infectious symptoms across pulmonary, urinary, abdominal, skin/soft tissue, line, and neurologic sources.",
        choices: ["No source", "Likely source", "Multiple possible", "Unclear"],
        select: "one"
      },
      {
        id: "antibiotic_history",
        kind: "history",
        system: "infectious",
        text: "Confirm recent antibiotics, cultures, resistant organisms, allergies, and immunosuppression.",
        choices: ["Reviewed", "Partial", "Unable"],
        select: "one"
      },
      {
        id: "sepsis_exam",
        kind: "exam",
        system: "infectious",
        text: "Assess perfusion, mental status, skin, lines, lungs, abdomen, CVA tenderness, and focal source findings.",
        choices: ["Reassuring", "Abnormal", "Not assessed"],
        select: "one"
      }
    ]
  }
];

// The 50 independently authored workups are packaged in the static app rather
// than fetched from a public catalog. Local overrides still replace a bundled
// entry by stable ID, and the vault remains the only user-data store.
export const BUNDLED_WORKUPS = [...CORE_ADMISSION_WORKUPS, ...FOUNDATION_WORKUPS];
