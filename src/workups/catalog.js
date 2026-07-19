import { CORE_ADMISSION_WORKUPS } from "./admission-core.js";

const FOUNDATION_WORKUPS = [
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
