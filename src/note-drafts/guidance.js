// This is a concise student-facing projection of the editable Admission and
// Progress note standards. It intentionally excludes personas, output/token
// controls, hidden ledgers, hidden reasoning, and internal prompt workflow.
export const STUDENT_GUIDANCE = Object.freeze({
  hp: Object.freeze({
    one_liner: "Summarize who the patient is, why they presented, the leading diagnosis, and current severity or trajectory in one concise sentence.",
    chief_complaint: "Use a short patient-centered phrase for the main reason for presentation.",
    history_of_present_illness: "Tell the story chronologically, then describe how the presenting symptom is doing now. Include relevant bowel, bladder, and ambulation status when known.",
    medications: "Record only the documented medication name, dose, route, and administration times. Do not infer missing regimen details or a course day.",
    allergies: "Record medication allergies and the documented reaction.",
    past_medical_history: "Include conditions that affect the current differential, risk, treatment, or disposition.",
    past_surgical_history: "Include procedures that affect the current presentation or management, with timing when known.",
    family_history: "Include family history only when it changes the differential or management.",
    social_history: "Include substance use, living situation, supports, or other social factors that affect care or disposition.",
    diet_and_exercise: "For relevant vascular, thrombotic, glucose, lipid, or metabolic problems, document the patient’s usual diet, activity, and barriers without adding counseling here.",
    other: "Add relevant admission history that does not fit another field. Leave it blank when there is nothing to add.",
    objective: "Choose only measured, observed, or formally reported findings that support the assessment and plan. Keep calculated summaries clearly distinct from observed results.",
    assessment: "Write one concise synthesis of the presentation and current condition, rather than a comma-separated problem list or plan.",
    plan: "Name clinical problems, order them by decisional importance, and preserve your own reasoning and wording. Do not invent a diagnosis or action.",
    disposition: "State the anticipated destination, active barriers, and observable conditions needed for a safe transition."
  }),
  progress: Object.freeze({
    one_liner: "Summarize the admission anchor, why the patient remains hospitalized, the dominant active problem, and today’s trajectory in one concise sentence.",
    interval_events: "Document acute overnight events and responses first, followed by management-changing events since the prior note. Use “No acute events overnight” only when you have confirmed it.",
    patient_report: "Begin with how the presenting symptom or functional limitation changed since yesterday. Include bowel, bladder, and ambulation status when known.",
    nursing_report: "Record decision-relevant observations or concerns reported by nursing staff, keeping them distinct from the patient’s report.",
    pertinent_symptoms: "Include only symptoms or meaningful negatives that change the differential, severity assessment, plan, or disposition.",
    other: "Add relevant subjective information that does not fit another field. Leave it blank when there is nothing to add.",
    objective: "Choose only current or newly decisive measured, observed, examined, or diagnostic findings. Use a 24-hour vital range and selected laboratory trends rather than copying every result.",
    assessment: "Write one concise current-state synthesis focused on the dominant active problem and trajectory, without embedding the plan.",
    plan: "Name every active clinical problem, order problems by decisional importance, and carry forward only the context needed to understand today’s decisions.",
    disposition: "State the likely destination, no more than the most important active barriers, and observable transition conditions."
  }),
  shared: Object.freeze({
    etiology_known: "State the documented cause or mechanism. If it is not established, use an unknown etiology instead.",
    etiology_unknown: "Rank only diagnoses supported by patient-specific evidence. Do not add entries merely to reach a target count.",
    differential: "Order diagnoses from most to least likely or immediately dangerous. Diagnosis names and ordering remain yours.",
    clues_for: "Optionally add brief patient-specific findings that support this diagnosis.",
    clues_against: "Optionally add brief patient-specific findings that make this diagnosis less likely. This field may be blank.",
    diagnostic_plan: "Document the next diagnostic action and the decision it is intended to inform.",
    therapeutic_plan: "Document the treatment or management action and the patient-specific reason for it.",
    fen: "Record the current diet or nutrition route, relevant fluids, and active electrolyte replacement or goals.",
    vte_prophylaxis: "Record the active prophylaxis and dose, or the documented reason it is held, contraindicated, refused, or unnecessary.",
    code_status: "Record the documented code status. If it is missing or conflicting, identify the need for clarification.",
    medication_regimens: "Use only the documented medication name, dose, route, and administration times. Do not calculate or infer a course day."
  })
});

export const STUDENT_GUIDANCE_EXCLUDED_PATTERNS = Object.freeze([
  /act as an attending/i,
  /return only/i,
  /draft silently/i,
  /hidden (?:ledger|table|reasoning)/i,
  /prompt token/i,
  /output control/i
]);

export function studentGuidance(noteType, sectionId) {
  return STUDENT_GUIDANCE[noteType]?.[sectionId] || STUDENT_GUIDANCE.shared[sectionId] || "";
}

export function containsExcludedGuidanceLanguage(value) {
  return STUDENT_GUIDANCE_EXCLUDED_PATTERNS.some((pattern) => pattern.test(String(value || "")));
}
