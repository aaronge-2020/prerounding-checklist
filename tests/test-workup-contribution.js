import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WORKUP_CONTRIBUTION_SCHEMA,
  buildGithubIssueUrl,
  prepareGithubIssueBody,
  validateWorkupContributionDraft
} from "../src/workup/workup-contribution.js";
import { buildChatAiHandoffPrompt } from "../prompts/chat-ai-workup-handoff.js";
import { physicalExamCatalogFromCsv } from "../src/vault/physical-exam-catalog.js";

const referenceCsv = readFileSync("data/physical-exam/physical_exam_reference.csv", "utf8");
const overlayCsv = readFileSync("data/physical-exam/physical_exam_evidence_overlay.csv", "utf8");
const examCatalog = physicalExamCatalogFromCsv(referenceCsv, overlayCsv);

const validDraft = {
  schema: WORKUP_CONTRIBUTION_SCHEMA,
  title: "Synthetic headache visual symptoms workup",
  workup_id: "synthetic_headache_visual_symptoms_v1",
  aliases: ["headache with visual symptoms"],
  triggers: ["headache", "visual symptoms"],
  population: "adult inpatient",
  applicability: {
    setting: "inpatient",
    age_group: "adult",
    use_when: ["headache with focal visual symptom concern"],
    do_not_use_when: ["screening eye exam without acute symptoms"]
  },
  history_questions: [
    {
      id: "hx_visual_field_change",
      item_type: "history_question",
      label: "Visual field change",
      question: "Have you noticed missing areas, dimming, or loss in your vision?",
      answer_options: ["Yes", "No", "Unknown"],
      ask_when: "headache with visual symptoms",
      diagnostic_purpose: "distinguishes focal visual pathway symptoms from nonspecific headache",
      result_changes_management: "new focal visual symptoms should prompt localization and escalation",
      source_ids: ["source_1"]
    }
  ],
  physical_exam_maneuvers: [
    {
      id: "exam_visual_fields",
      item_type: "physical_exam_maneuver",
      exam_id: "neuro_cranial_nerves_cn_ii_visual_fields",
      include_when: "headache with visual symptoms",
      diagnostic_target: "visual field deficit",
      result_changes_management: "new deficit should prompt urgent localization and escalation",
      custom_exam: false,
      source_ids: ["source_1"]
    }
  ],
  sources: [
    {
      source_id: "source_1",
      citation: "Synthetic guideline-style source for validation testing",
      url_or_doi: "https://example.org/synthetic-headache-validation",
      source_type: "guideline"
    }
  ],
  reviewer_notes: "Synthetic PHI-free validation fixture.",
  review_status: "pending_review"
};

const validation = validateWorkupContributionDraft(validDraft, { examCatalog });
assert.equal(validation.ok, true, validation.issues.join("\n"));
assert.equal(validation.draft.physical_exam_maneuvers[0].label, "Visual fields");
assert.deepEqual(validation.draft.physical_exam_maneuvers[0].findings_options, [
  "Full",
  "Deficit right",
  "Deficit left",
  "Deficit bilateral",
  "Unable"
]);

const promptAliasDraft = JSON.parse(JSON.stringify(validDraft));
delete promptAliasDraft.history_questions[0].question;
promptAliasDraft.history_questions[0].prompt = "Have you noticed a sudden missing area or dimming in your vision?";
const promptAliasValidation = validateWorkupContributionDraft(promptAliasDraft, { examCatalog });
assert.equal(promptAliasValidation.ok, true, promptAliasValidation.issues.join("\n"));
assert.equal(promptAliasValidation.draft.history_questions[0].question, promptAliasDraft.history_questions[0].prompt);
assert.ok(!promptAliasValidation.issues.some((issue) => issue.includes("history_questions[0].prompt")));

const unsupported = validateWorkupContributionDraft({
  ...validDraft,
  raw_chart_text: "synthetic text"
}, { examCatalog });
assert.equal(unsupported.ok, false);
assert.ok(unsupported.issues.some((issue) => issue.includes("unsupported field: raw_chart_text")));
assert.ok(unsupported.issues.some((issue) => issue.includes("possible PHI/raw chart text detected")));

const missingExamId = validateWorkupContributionDraft({
  ...validDraft,
  physical_exam_maneuvers: [{ ...validDraft.physical_exam_maneuvers[0], exam_id: "" }]
}, { examCatalog });
assert.ok(missingExamId.issues.some((issue) => issue.includes("physical exam item missing exam_id")));

const unknownExamId = validateWorkupContributionDraft({
  ...validDraft,
  physical_exam_maneuvers: [{ ...validDraft.physical_exam_maneuvers[0], exam_id: "not_a_catalog_exam" }]
}, { examCatalog });
assert.ok(unknownExamId.issues.some((issue) => issue.includes("unknown exam_id")));

const duplicateItem = validateWorkupContributionDraft({
  ...validDraft,
  history_questions: [
    validDraft.history_questions[0],
    { ...validDraft.history_questions[0], question: "Is the vision loss new?" }
  ]
}, { examCatalog });
assert.ok(duplicateItem.issues.some((issue) => issue.includes("duplicate item ID within section")));

const badSource = validateWorkupContributionDraft({
  ...validDraft,
  sources: [{ source_id: "source_1", citation: "", url_or_doi: "", source_type: "guideline" }]
}, { examCatalog });
assert.ok(badSource.issues.some((issue) => issue.includes("source missing citation")));
assert.ok(badSource.issues.some((issue) => issue.includes("source missing URL or DOI")));

const prose = validateWorkupContributionDraft("Plain-language OpenEvidence answer with bullets only.");
assert.equal(prose.ok, false);
assert.ok(prose.issues.some((issue) => issue.includes("OpenEvidence-style prose pasted where JSON is expected")));

const prompt = buildChatAiHandoffPrompt({
  mode: "new_workup",
  model: "Claude",
  title: "Synthetic headache visual symptoms workup",
  deidentifiedContext: "De-identified HPI only: adult with headache and visual symptoms."
});
assert.ok(prompt.includes("De-identified clinical context."));
assert.ok(prompt.includes(WORKUP_CONTRIBUTION_SCHEMA));
assert.ok(prompt.includes("pending_review"));
assert.ok(prompt.includes('"question": "Focused bedside question?"'));
assert.ok(prompt.includes("history_questions: question (never prompt)"));
assert.ok(prompt.includes('"item_type": "physical_exam_maneuver"'));
assert.ok(!prompt.includes("John Smith"));

const body = prepareGithubIssueBody(validation.draft, validation);
assert.ok(body.includes("## Privacy Attestation"));
assert.ok(body.includes("```json"));
const issueUrl = buildGithubIssueUrl({ draft: validation.draft, validation });
assert.ok(issueUrl.startsWith("https://github.com/aaronge-2020/prerounding-checklist/issues/new?"));
assert.ok(issueUrl.includes("workup-contribution"));
