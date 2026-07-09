// @ts-check

export const MEDICATION_SAFETY_RULES = Object.freeze([
  { id: "acetaminophen", names: ["acetaminophen", "tylenol"], unit: "mg", maxSingleDose: 1000, maxDailyDose: 4000 },
  { id: "ibuprofen", names: ["ibuprofen", "advil", "motrin"], unit: "mg", maxSingleDose: 800, maxDailyDose: 3200 },
  { id: "insulin_glargine", names: ["insulin glargine", "glargine", "lantus", "basaglar"], unit: "units", maxSingleDose: 100 },
  { id: "insulin_lispro", names: ["insulin lispro", "lispro", "humalog"], unit: "units", maxSingleDose: 50 },
  { id: "levothyroxine", names: ["levothyroxine", "synthroid"], unit: "mcg", maxSingleDose: 300 },
  { id: "warfarin", names: ["warfarin", "coumadin"], unit: "mg", maxSingleDose: 15 }
]);

const INTERACTION_PAIRS = Object.freeze([
  { left: "warfarin", right: "ibuprofen", severity: "high", message: "warfarin plus NSAID bleeding-risk screen" },
  { left: "warfarin", right: "acetaminophen", severity: "review", message: "warfarin plus repeated/high-dose acetaminophen INR-risk screen" }
]);

function normalizeMedicationText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
}

function ruleMatches(rule, text) {
  const normalized = normalizeMedicationText(text);
  return rule.names.some((name) => normalized.includes(normalizeMedicationText(name)));
}

function parseDoseMentions(text) {
  return [...String(text || "").matchAll(/\b(\d+(?:\.\d+)?)\s*(mcg|micrograms?|mg|milligrams?|units?|u)\b/gi)]
    .map((match) => ({
      value: Number(match[1]),
      unit: match[2].toLowerCase().replace(/^micrograms?$/, "mcg").replace(/^milligrams?$/, "mg").replace(/^u$/, "units").replace(/^unit$/, "units"),
      raw: match[0]
    }))
    .filter((dose) => Number.isFinite(dose.value));
}

function parseAllergyList(allergies = []) {
  if (Array.isArray(allergies)) return allergies.map(normalizeMedicationText).filter(Boolean);
  return String(allergies || "").split(/[,;\n]/).map(normalizeMedicationText).filter(Boolean);
}

/**
 * Performs lightweight medication safety screening on free text.
 *
 * @param {string} medicationText
 * @param {{ allergies?: string[] | string }} options
 * @returns {{ flags: Array<{ type: string, severity: string, medication: string, message: string, detail?: string }> }}
 */
export function screenMedicationSafety(medicationText, options = {}) {
  const text = String(medicationText || "");
  const activeRules = MEDICATION_SAFETY_RULES.filter((rule) => ruleMatches(rule, text));
  const doses = parseDoseMentions(text);
  const allergies = parseAllergyList(options.allergies || "");
  const flags = [];

  for (const rule of activeRules) {
    const matchingDoses = doses.filter((dose) => dose.unit === rule.unit);
    for (const dose of matchingDoses) {
      if (rule.maxSingleDose && dose.value > rule.maxSingleDose) {
        flags.push({
          type: "dose_range",
          severity: "high",
          medication: rule.id,
          message: `${rule.names[0]} dose exceeds screening single-dose range`,
          detail: `${dose.raw} > ${rule.maxSingleDose} ${rule.unit}`
        });
      }
    }
    if (allergies.some((allergy) => rule.names.some((name) => allergy.includes(normalizeMedicationText(name)) || normalizeMedicationText(name).includes(allergy)))) {
      flags.push({
        type: "allergy",
        severity: "high",
        medication: rule.id,
        message: `${rule.names[0]} matches listed allergy/intolerance`
      });
    }
  }

  const activeIds = new Set(activeRules.map((rule) => rule.id));
  for (const pair of INTERACTION_PAIRS) {
    if (activeIds.has(pair.left) && activeIds.has(pair.right)) {
      flags.push({
        type: "interaction",
        severity: pair.severity,
        medication: `${pair.left}+${pair.right}`,
        message: pair.message
      });
    }
  }

  return { flags };
}
