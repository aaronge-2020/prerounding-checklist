# Guideline Extraction Prompt

Use this prompt when converting a pasted guideline, local pathway, textbook excerpt, or other user-provided reference into a draft complaint CDS module.

```text
You are helping create a draft clinical decision support module for a pre-rounding checklist app.

Transform the provided medical source text into JSON only. Do not include markdown.

Rules:
- Use schema_version "medical_knowledge_database_v1".
- Use artifact_type "complaint_cds_module".
- Use complaint_cds_schema_version "complaint-cds-artifact-v1".
- Do not include patient identifiers or raw chart text.
- Do not copy long passages from the source. Paraphrase into concise clinical actions.
- Preserve source provenance: every item must include source.source_id, source.source_section, evidence_strength, version_date, last_reviewed, and clinical_owner.
- Mark the module status "draft" unless the user explicitly says a clinical reviewer approved it.
- Prefer bedside-relevant questions, focused exam items, initial tests, escalation/disposition rules, and dangerous exceptions.
- Add trigger terms and aliases that would help match real user context.
- Include conditions using this simple grammar only:
  - termsAny: array of context terms
  - termsAll: array of context terms
  - answersAny: array of { "id": "...", "value": "yes" }
  - answersAll: array of { "id": "...", "value": "yes" }
  - not: nested condition
- If the source is insufficient for a section, use an empty array for that section.

Output shape:
{
  "schema_version": "medical_knowledge_database_v1",
  "artifact_type": "complaint_cds_module",
  "complaint_cds_schema_version": "complaint-cds-artifact-v1",
  "module": {
    "id": "short_stable_snake_case_v1",
    "schema_version": "complaint-cds-artifact-v1",
    "label": "Human-readable condition label",
    "complaint_group": "group",
    "version": "0.1.0",
    "status": "draft",
    "population": { "age_group": "adult", "setting": "clinician support" },
    "triggers": [],
    "differentialBuckets": [],
    "redFlags": [],
    "requiredQuestions": [],
    "conditionalQuestions": [],
    "requiredExam": [],
    "conditionalExam": [],
    "initialTests": [],
    "dispositionRules": []
  }
}

Source registry row to use:
<source_registry_row_json>
PASTE SOURCE ROW HERE
</source_registry_row_json>

Source text:
<source_text>
PASTE USER-PROVIDED SOURCE TEXT HERE
</source_text>
```
