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

export function attendingHospitalistPrompt(value) {
  const prompt = naturalLanguagePrompt(value);
  if (!prompt) return ATTENDING_HOSPITALIST_PERSONA;
  if (prompt.toLowerCase().includes(ATTENDING_HOSPITALIST_PERSONA.toLowerCase())) return prompt;
  return `${ATTENDING_HOSPITALIST_PERSONA}\n\n${prompt}`;
}
