# Medical Knowledge Database

This folder is the source of truth for guideline-backed clinical knowledge used by the app.

The browser app imports `medical-knowledge-db.js`, but that file is generated. Do not hand-edit generated medical content in JavaScript. Edit the JSON files here, then run:

```bash
npm run build:medical-knowledge
npm run test:medical-knowledge
```

## Current Structure

- `manifest.json`: database manifest and list of included knowledge files.
- `source-registry.json`: bibliographic/provenance records for guideline sources.
- `complaint-modules/*.json`: complaint or diagnosis modules used by `evaluateComplaintCds`.
- `complaint-modules/endocrine/*.json`: generated endocrine workup modules with `review_ready` status.
- `templates/complaint-module.template.json`: starter file for a new reviewed module.
- `templates/guideline-extraction-prompt.md`: prompt contract for transforming pasted guideline text into a draft module.

## Generated Files

- `../medical-knowledge-db.js`: browser-importable bundle generated from this folder.
- `../reports/endocrine-workups-2026-06-06.json`: source workup dataset used by the endocrine installer.
- `../reports/endocrine-workups-2026-06-06.md`: human-readable generation report.
- `../reports/endocrine-workup-completion-2026-06-06.md`: install/completion report for generated modules.

Do not hand-edit `../medical-knowledge-db.js`; rebuild it from JSON source.

## Useful Commands

```bash
npm run build:medical-knowledge
npm run test:medical-knowledge
npm run generate:endocrine-workups
npm run install:endocrine-workups
npm run test:endocrine-knowledge
```

Use the endocrine generator to refresh the review dataset, then the installer to write `complaint-modules/endocrine/*.json`, update `manifest.json`, update `source-registry.json`, and write the completion report.

## Authoring Model

The intended workflow is:

1. A user pastes a guideline, institutional pathway, or other trusted source into the app.
2. The app asks an LLM to extract a draft `complaint_cds_module` JSON object using the extraction prompt.
3. The app validates the JSON locally.
4. The user or a clinical reviewer accepts, edits, or rejects the draft.
5. Accepted modules are stored as JSON and bundled into `medical-knowledge-db.js`.

Raw source documents, especially copyrighted clinical references, should not be committed here unless the license allows it. Store compact extracted recommendations, source IDs, citations, reviewed dates, and section references instead.

## Safety Rules

- Do not include patient identifiers or raw chart text.
- Do not treat LLM-generated modules as active until reviewed.
- Every recommendation item needs a source reference.
- Prefer institution-specific pathways when the user explicitly chooses one.
- Keep medical content as data; keep ranking/evaluation logic in app code.
- Keep generated `review_ready` modules separate from validated clinical intents until clinician sign-off.
