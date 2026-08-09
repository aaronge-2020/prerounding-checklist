import { CORE_ADMISSION_WORKUPS } from "./admission-core.js";

const FOUNDATION_WORKUPS = [
  {
    schema: "prerounding_workup_v1",
    id: "nstemi-prerounds",
    title: "NSTEMI pre-rounds",
    aliases: ["acute coronary syndrome", "acs", "myocardial infarction", "chest pain"],
    items: [
      { id: "chest-pain-now", kind: "history", system: "cardiovascular", text: "Are you having chest pressure or pain now, and has it recurred overnight or with minimal activity?", choices: ["No chest discomfort now", "Mild or intermittent discomfort", "Persistent or worsening discomfort"], select: "one" },
      { id: "nitroglycerin-response", kind: "history", system: "cardiovascular", text: "If chest discomfort recurred, did rest or nitroglycerin relieve it, and how quickly?", choices: ["No recurrent pain", "Relieved promptly", "Only partly relieved", "Not relieved"], select: "one" },
      { id: "heart-failure-symptoms", kind: "history", system: "respiratory", text: "Any dyspnea at rest, orthopnea, waking short of breath, new cough, or leg swelling?", choices: ["None", "Exertional dyspnea only", "Orthopnea or nocturnal dyspnea", "Dyspnea at rest or new edema"], select: "one" },
      { id: "rhythm-low-output-symptoms", kind: "history", system: "cardiovascular", text: "Any palpitations, racing heartbeat, dizziness, near-syncope, or syncope overnight?", choices: ["None", "Palpitations only", "Dizziness or near-syncope", "Syncope"], select: "one" },
      { id: "bleeding-symptoms", kind: "history", system: "hematologic", text: "Since starting heparin and dual antiplatelet therapy, any nosebleed, gum bleeding, blood in urine or stool, black stool, vomiting blood, or new bruising?", choices: ["No bleeding symptoms", "Minor bruising or mucosal bleeding", "Possible gastrointestinal or urinary bleeding", "Active significant bleeding"], select: "one" },
      { id: "ischemic-equivalents", kind: "history", system: "cardiovascular", text: "Any recurrent nausea, sweating, unusual fatigue, jaw or arm discomfort, or shortness of breath without chest pain?", choices: ["No ischemic-equivalent symptoms", "Mild fatigue only", "Possible ischemic-equivalent symptoms", "Persistent concerning symptoms"], select: "one" },
      { id: "medication-history", kind: "history", system: "medication", text: "Before admission, were aspirin, statin, beta blocker, and other cardiac medicines taken consistently, and were there recent missed doses or adverse effects?", choices: ["Taken consistently without adverse effects", "Occasional missed doses", "Frequently missed or stopped", "Unable to reconcile"], select: "one" },
      { id: "procedure-readiness", kind: "history", system: "general", text: "Confirm fasting status and ask whether the patient understands the planned coronary angiography and has remaining questions or prior contrast reactions.", choices: ["NPO, understands, no prior reaction", "Has questions about procedure", "Possible prior contrast reaction", "Fasting status uncertain"], select: "one" },
      { id: "glycemic-symptoms", kind: "history", system: "endocrine", text: "With oral diabetes medicines held and insulin used in hospital, any shakiness, sweating, confusion, marked thirst, or frequent urination?", choices: ["No hypo- or hyperglycemic symptoms", "Possible hypoglycemic symptoms", "Possible hyperglycemic symptoms", "Unable to assess"], select: "one" },
      { id: "overall-appearance", kind: "exam", system: "general", text: "Assess distress, diaphoresis, pallor, alertness, ability to speak comfortably, and work of breathing from the bedside.", choices: ["Comfortable, alert, no diaphoresis or respiratory distress", "Mild discomfort or anxiety", "Diaphoretic or increased work of breathing", "Ill-appearing or altered"], select: "one" },
      { id: "hemodynamics", kind: "exam", system: "cardiovascular", text: "Recheck blood pressure in both arms when clinically appropriate, heart rate, rhythm, oxygen saturation, and temperature; note hypotension, persistent hypertension, tachycardia, or new oxygen need.", choices: ["Hemodynamically stable without new oxygen need", "Hypertensive or mildly tachycardic", "New oxygen requirement", "Hypotensive or otherwise unstable"], select: "one" },
      { id: "jugular-venous-pressure", kind: "exam", system: "cardiovascular", text: "Estimate jugular venous pressure with the head of bed at 30 to 45 degrees and assess hepatojugular reflux if volume status remains uncertain.", choices: ["JVP not elevated", "JVP elevated", "JVP low", "Unable to assess"], select: "one" },
      { id: "cardiac-auscultation", kind: "exam", system: "cardiovascular", text: "Auscultate rate and rhythm plus S1 and S2; listen specifically for a new systolic murmur, S3 or S4, and pericardial rub.", choices: ["Regular rhythm, no new murmur, gallop, or rub", "Irregular rhythm", "New murmur", "Gallop or rub present"], select: "one" },
      { id: "lung-exam", kind: "exam", system: "respiratory", text: "Auscultate anterior and posterior lung fields, including the bases, for crackles, diminished breath sounds, or wheeze suggesting congestion or another pulmonary process.", choices: ["Clear throughout including bases", "Bibasilar crackles", "Focal diminished sounds or crackles", "Diffuse wheeze or other abnormality"], select: "one" },
      { id: "perfusion-pulses", kind: "exam", system: "cardiovascular", text: "Assess skin temperature, capillary refill, and radial and pedal pulses; compare pulses side to side before planned arterial access.", choices: ["Warm, well perfused, symmetric palpable pulses", "Cool extremities or delayed refill", "Asymmetric or diminished pulse", "Pulse not palpable"], select: "one" },
      { id: "edema", kind: "exam", system: "cardiovascular", text: "Inspect the sacrum and lower legs and palpate for pitting edema as part of the volume-status examination.", choices: ["No peripheral or sacral edema", "Trace edema", "Mild to moderate pitting edema", "Marked edema"], select: "one" },
      { id: "chest-wall", kind: "exam", system: "musculoskeletal", text: "Palpate the chest wall to determine whether the presenting discomfort is reproducible, without using reproducibility alone to exclude ischemia.", choices: ["No reproducible chest-wall tenderness", "Focal reproducible tenderness", "Diffuse tenderness", "Deferred due to active pain"], select: "one" },
      { id: "calf-exam", kind: "exam", system: "cardiovascular", text: "Inspect and palpate both calves for unilateral swelling, warmth, or tenderness when considering thromboembolic alternatives.", choices: ["No calf asymmetry, warmth, or tenderness", "Unilateral swelling", "Calf warmth or tenderness", "Unable to assess"], select: "one" },
      { id: "abdominal-aortic-exam", kind: "exam", system: "gastrointestinal", text: "Examine the abdomen for tenderness and, when appropriate, an expansile pulsatile mass or abdominal bruit that would raise concern for an aortic process.", choices: ["Soft, nontender, no concerning pulsatile mass", "Abdominal tenderness", "Concerning pulsatile mass or bruit", "Unable to assess"], select: "one" },
      { id: "focused-neurologic-exam", kind: "exam", system: "neurologic", text: "Document mental status, speech, facial symmetry, and bilateral arm and leg strength before anticoagulation and invasive angiography.", choices: ["Alert with clear speech and no focal deficit", "Baseline neurologic deficit only", "New focal deficit", "Unable to assess"], select: "one" },
      { id: "bleeding-skin-exam", kind: "exam", system: "hematologic", text: "Inspect IV sites, exposed skin, and oral or nasal mucosa for active bleeding, expanding hematoma, petechiae, or significant ecchymosis.", choices: ["No active bleeding or significant bruising", "Minor stable bruising", "Oozing or expanding hematoma", "Active significant bleeding"], select: "one" }
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
