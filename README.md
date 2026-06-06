# Pre-Rounding Checklist Builder

Privacy-first browser app for inpatient pre-rounding. The app helps turn pasted chart context into a de-identified rounds workspace, bedside checklist, OpenEvidence prompt handoffs, and guideline-backed clinical workups.

## What The App Does

- Starts from either a local encrypted census vault or a single-patient workspace.
- Accepts chart notes, labs, handoff text, medication orders, and MAR context.
- De-identifies pasted text locally in the browser before prompts are copied elsewhere.
- Builds a structured workflow: chart info -> checklist -> bedside findings -> final update.
- Supports validated clinical-intent workups, evidence retrieval, and medical knowledge review proposals.
- Keeps accepted medical knowledge as JSON source files under `medical-knowledge/`.

## Repo Map

- `index.html`: the browser app UI and workflow wiring.
- `deid.js`, `deid-worker.js`: local de-identification pipeline.
- `labs.js`, `checklist.js`, `continuity.js`, `census.js`: shared workflow modules.
- `clinical-intents.js`: validated and partial clinical intent registry.
- `complaint-cds.js`: complaint/workup selection and formatting logic.
- `evidence.js`: evidence catalog ranking and recommended bedside checklist logic.
- `medical-knowledge/`: reviewed source-of-truth clinical knowledge JSON.
- `medical-knowledge-db.js`: generated app bundle built from `medical-knowledge/`.
- `scripts/`: tests, generators, validators, and build helpers.
- `reports/`: generated review reports for clinical workup expansion.

## Medical Knowledge Workflow

Edit clinical content in `medical-knowledge/`, not in `medical-knowledge-db.js`.

```bash
npm run build:medical-knowledge
npm run test:medical-knowledge
```

Endocrine workup expansion has a separate generator/install path:

```bash
npm run generate:endocrine-workups
npm run install:endocrine-workups
npm run build:medical-knowledge
npm run test:endocrine-knowledge
```

The generated endocrine modules are marked `review_ready`, not automatically validated clinical intents.

## Validation

Run the focused checks after changing app wiring or clinical content:

```bash
npm run test:syntax
npm run test:clinical-intents
npm run test:complaint-cds
npm run test:medical-knowledge
npm run test:endocrine-knowledge
```

Use broader tests when touching de-identification, labs, evidence ranking, or census storage.

## Safety Notes

- Do not commit patient identifiers, raw chart text, or raw proprietary guideline text.
- Keep source provenance compact: source IDs, citations, URLs, dates, and section notes.
- Treat generated workups as clinical-review candidates until a reviewer promotes them.
- Review every copied prompt/output before pasting into an external clinical AI tool.
