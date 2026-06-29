# Pre-Rounding Checklist Builder

Privacy-first browser app for inpatient pre-rounding. The app helps turn pasted chart context into a de-identified rounds workspace, bedside checklist, OpenEvidence prompt handoffs, and guideline-backed clinical workups.

## What The App Does

- Starts from either a local encrypted de-identified case vault or a single-patient workspace.
- Accepts chart notes, labs, handoff text, medication orders, and MAR context.
- De-identifies pasted text locally in the browser before prompts are copied elsewhere.
- Builds a structured workflow: chart info -> checklist -> bedside findings -> final update.
- Supports validated clinical-intent workups, evidence retrieval, and medical knowledge review proposals.
- Keeps accepted medical knowledge as JSON source files under `medical-knowledge/`.

## Repo Map

- `index.html`: the browser app UI and workflow wiring.
- `deid.js`, `deid-worker.js`: local de-identification pipeline.
- `labs.js`, `checklist.js`, `continuity.js`: shared workflow modules.
- `clinical-intents.js`: validated and partial clinical intent registry.
- `complaint-cds.js`: complaint/workup selection and formatting logic.
- `evidence.js`: evidence catalog ranking and recommended bedside checklist logic.
- `data/`: CSV reference data for physical exam maneuvers, evidence retrieval, source rows, and evidence evaluation.
- `docs/`: maintainer notes that should stay reviewable and hand-edited.
- `medical-knowledge/`: reviewed source-of-truth clinical knowledge JSON.
- `medical-knowledge-db.js`: generated app bundle built from `medical-knowledge/`.
- `scripts/`: tests, generators, validators, and build helpers.
- `vendor/`: local browser bundles used directly by `index.html`; `npm run test:syntax` fails if a vendored `.js` file is no longer loaded.
- `reports/`: validation/provenance reports that need to stay with the repo; routine generated reports are ignored.

## Medical Knowledge Workflow

Reviewed JSON in `medical-knowledge/` is the release artifact, not the preferred authoring surface. Use Workup Studio in the app for section-scoped edits so changing a pathway tree cannot overwrite history questions, exam maneuvers, red flags, tests, or source metadata.

```bash
npm run snapshot:workup-authoring
npm run export:medical-knowledge
npm run build:medical-knowledge
npm run test:medical-knowledge
npm run test:workup-authoring
```

`npm run snapshot:workup-authoring` writes a local authoring snapshot for review. `npm run export:medical-knowledge -- --change-set=path/to/change-set.json` applies reviewed, section-scoped Workup Studio change sets back into the existing JSON module envelopes and then runs the medical knowledge build/test path unless skipped.

The app also has a local Medical knowledge base editor under Tools. Use it to inspect a module, edit recommendation cards, add or remove local items, and save a device-local override that the clinical workup uses immediately. Those local edits stay in the browser until reset. Use Suggest to maintainer to export and stage a review proposal; use Submit source text or clinical script for pasted guideline/pathway material that needs reviewer extraction.

Workup Studio is the maintainer-facing replacement for full-file JSON editing. It has tabs for pathway tree, history, physical exam, safety checks, tests and thresholds, red flags, management/disposition, sources, and review tests. Drafts are saved locally as `workup_change_set_v1` patches. Use GitHub proposals to share them for maintainer review. Patient vault data remains browser-local and is not included in proposals.

GitHub proposal flow:

```bash
npm run snapshot:workup-authoring
npm run export:medical-knowledge -- --change-set=downloads/workup-change-set.json
```

In the app, open Tools -> Workup Studio -> GitHub proposals. Save a draft, then use Open issue or Copy issue body. The issue body contains reviewer checklist text plus the `workup_change_set_v1` JSON. A maintainer applies reviewed JSON with `npm run export:medical-knowledge -- --change-set=...`, runs tests, and merges the resulting PR.

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
npm test
npm run test:syntax
npm run test:clinical-intents
npm run test:complaint-cds
npm run test:medical-knowledge
npm run test:endocrine-knowledge
```

Use `npm run test:evidence-suite` when touching `data/evidence/` or evidence ranking, and `npm run test:core` when touching de-identification, labs, checklist parsing, vault storage, or continuity.

## Security And Privacy

The app is local-first by default: structured-only de-identification runs without model downloads, no analytics/tracking scripts are included, no cloud backend receives patient data by default, and saved vault records are encrypted browser-local patient workspaces. Raw chart text is not saved to the vault. See `SECURITY.md` and `PRIVACY.md` before using or deploying the app with real patient information.

This app can reduce PHI exposure, but it does not by itself certify HIPAA de-identification or satisfy HIPAA obligations for an external AI workflow. Institutional policy, approved tool use, required Business Associate Agreements, and documented risk analysis still govern.

## Safety Notes

- Do not commit patient identifiers, raw chart text, or raw proprietary guideline text.
- Keep source provenance compact: source IDs, citations, URLs, dates, and section notes.
- Treat generated workups as clinical-review candidates until a reviewer promotes them.
- Review every copied prompt/output before pasting into an external clinical AI tool.
