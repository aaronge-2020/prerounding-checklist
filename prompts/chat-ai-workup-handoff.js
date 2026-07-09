import { WORKUP_CONTRIBUTION_SCHEMA, cleanString, slugifyContributionId, stringArray } from "../src/workup/workup-contribution.js";

function contextBlock(value = "") {
  const text = cleanString(value).slice(0, 1800);
  return text ? `De-identified clinical context.\n${text}` : "De-identified clinical context.\nNo patient-specific context is required for this draft.";
}

export function buildChatAiHandoffPrompt({
  mode = "new_workup",
  model = "ChatGPT",
  title = "",
  workupId = "",
  triggers = [],
  population = "",
  setting = "",
  deidentifiedContext = "",
  currentChecklist = "",
  validatorErrors = [],
  pastedJson = "",
  sourceRecommendations = ""
} = {}) {
  const normalizedTitle = cleanString(title) || "the requested clinical problem";
  const targetId = cleanString(workupId) || slugifyContributionId(normalizedTitle, "new_workup_v1");
  const modeInstruction = {
    new_workup: `Create a new draft workup contribution for ${normalizedTitle}.`,
    tailor_checklist: "Suggest source-backed checklist contribution items for the selected workup.",
    history_questions: `Suggest source-backed history questions for ${normalizedTitle}.`,
    physical_exam: `Suggest physical exam maneuvers for ${normalizedTitle}. Prefer exam_id values from the app's finite physical exam catalog.`,
    convert_text: "Convert the provided free-text suggestions into workup_contribution_v1 JSON.",
    fix_json: "Revise the pasted JSON so it passes the validator errors.",
    format_recommendations: `This is a formatting task only, not a clinical reasoning task. Convert the clinical recommendations below for ${normalizedTitle} into workup_contribution_v1 JSON. Do not add, remove, or change any history question, exam maneuver, or clinical judgment beyond what is explicitly stated in the recommendations. Do not invent citations or source IDs — if a source is not named in the recommendations, use the placeholder value "reviewer_to_confirm_source" and note it in reviewer_notes.`
  }[mode] || `Create a draft workup contribution for ${normalizedTitle}.`;
  const schemaExample = {
    schema: WORKUP_CONTRIBUTION_SCHEMA,
    title: normalizedTitle,
    workup_id: targetId,
    aliases: stringArray(triggers),
    triggers: stringArray(triggers),
    population: population || setting || "adult inpatient or clinician-specified population",
    applicability: {
      setting: setting || "inpatient or clinician-specified setting",
      age_group: population || "adult",
      use_when: ["brief indication"],
      do_not_use_when: ["brief exclusion"]
    },
    history_questions: [
      {
        id: "stable_history_question_id",
        item_type: "history_question",
        label: "Concise question label",
        question: "Focused bedside question?",
        answer_options: ["Yes", "No", "Unknown"],
        ask_when: "When this workup is clinically relevant.",
        diagnostic_purpose: "What this answer helps distinguish.",
        result_changes_management: "How a positive or concerning answer changes action.",
        source_ids: ["source_id_here"]
      }
    ],
    physical_exam_maneuvers: [
      {
        id: "stable_exam_item_id",
        item_type: "physical_exam_maneuver",
        exam_id: "catalog_exam_id_or_blank_if_custom",
        custom_exam: false,
        label: "Concise maneuver label",
        include_when: "When this exam is clinically relevant.",
        diagnostic_target: "Finding or syndrome assessed.",
        result_changes_management: "How abnormal findings change action.",
        source_ids: ["source_id_here"]
      }
    ],
    sources: [
      {
        source_id: "source_id_here",
        citation: "compact citation",
        url_or_doi: "https://example.org/source",
        source_type: "guideline"
      }
    ],
    reviewer_notes: "Reviewer should verify source traceability and exam_id mappings.",
    review_status: "pending_review"
  };
  return [
    `Use ${model} to help prepare a draft for reviewer evaluation, not final clinical guidance.`,
    modeInstruction,
    contextBlock(deidentifiedContext),
    currentChecklist ? `Current checklist or section being edited.\n${String(currentChecklist).slice(0, 3000)}` : "",
    validatorErrors.length ? `Validator errors to fix.\n${validatorErrors.map((issue) => `- ${issue}`).join("\n")}` : "",
    pastedJson ? `Pasted JSON to revise.\n${String(pastedJson).slice(0, 6000)}` : "",
    sourceRecommendations ? `Clinical recommendations to format (do not add to or change this content).\n${String(sourceRecommendations).slice(0, 8000)}` : "",
    "Privacy rules: no raw chart text, patient identifiers, exact dates, room numbers, MRNs, addresses, contact info, or unnecessary demographics.",
    [
      "Required field names — use exactly these, no synonyms:",
      "- history_questions: question (never prompt)",
      "- item_type must exactly match the value shown in the schema below for its section",
      "- source_ids must match a sources[].source_id in the same draft"
    ].join("\n"),
    "Output rules: return exactly one fenced json block, no prose outside it, every item pending_review, every claim source-backed.",
    "Match this schema exactly — field names, item_type values, and section names must be copied as shown, not paraphrased:",
    JSON.stringify(schemaExample, null, 2)
  ].filter(Boolean).join("\n\n");
}
