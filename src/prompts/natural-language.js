export function naturalLanguagePrompt(value) {
  return String(value || "")
    .replace(/[\[\]{}<>()]/g, "")
    .replace(/`/g, "")
    .replace(/^\s{0,3}(?:#{1,6}|[-*+])\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/@([a-z][a-z0-9_-]*)/gi, (_, token) => token.replace(/[-_]+/g, " "))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export const ATTENDING_HOSPITALIST_PERSONA = "Act as an attending hospitalist with over 30 years of inpatient experience.";
export const ATTENDING_OBGYN_PERSONA = "Act as an attending obstetrician-gynecologist with over 30 years of inpatient and ambulatory experience.";
export const ATTENDING_SPECIALTY_COACH_PERSONA = "Act as a highly experienced attending physician on the specialty team identified in the prompt.";
export const ATTENDING_SURGEON_PERSONA = "Act as an experienced surgical attending preparing a clinician in training for this patient's operation.";

export function includesSupportedAttendingPersona(value) {
  const normalized = String(value || "").toLowerCase();
  return [ATTENDING_HOSPITALIST_PERSONA, ATTENDING_OBGYN_PERSONA]
    .some((persona) => normalized.includes(persona.toLowerCase()));
}

export function promptPersonaForTask(taskId) {
  if (taskId === "attending_presentation_critique") return ATTENDING_SPECIALTY_COACH_PERSONA;
  if (taskId === "pre_op_prep") return ATTENDING_SURGEON_PERSONA;
  return taskId === "obgyn_history_and_physical" || taskId === "obgyn_soap_note"
    ? ATTENDING_OBGYN_PERSONA
    : ATTENDING_HOSPITALIST_PERSONA;
}

export function includesRequiredAttendingPersona(value, taskId) {
  const persona = promptPersonaForTask(taskId);
  if ([ATTENDING_SPECIALTY_COACH_PERSONA, ATTENDING_OBGYN_PERSONA, ATTENDING_SURGEON_PERSONA].includes(persona)) {
    return String(value || "").toLowerCase().includes(persona.toLowerCase());
  }
  return includesSupportedAttendingPersona(value);
}

export function stripConflictingAttendingPersonas(value, taskId) {
  const text = String(value || "");
  if (![ATTENDING_OBGYN_PERSONA, ATTENDING_SURGEON_PERSONA].includes(promptPersonaForTask(taskId))) return text;
  if (!/\bAct as an attending hospitalist\b/i.test(text)) return text;
  return text
    .replace(/\bAct as an attending hospitalist\b[^.\n]*\.?/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function attendingPromptForTask(value, taskId) {
  const prompt = stripConflictingAttendingPersonas(naturalLanguagePrompt(value), taskId);
  const persona = promptPersonaForTask(taskId);
  if (!prompt) return persona;
  if (includesRequiredAttendingPersona(prompt, taskId)) return prompt;
  return `${persona}\n\n${prompt}`;
}

export function attendingHospitalistPrompt(value) {
  const prompt = naturalLanguagePrompt(value);
  if (!prompt) return ATTENDING_HOSPITALIST_PERSONA;
  if (includesSupportedAttendingPersona(prompt)) return prompt;
  return `${ATTENDING_HOSPITALIST_PERSONA}\n\n${prompt}`;
}
