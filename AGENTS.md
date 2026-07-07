# AGENTS.md

Purpose: give future agents enough project context to avoid broad searches, repeated file reads, and accidental scans of generated or vendored files. Read this file first in every new chat before using search tools.

## Token-Saving Rules

1. Start with this file, `README.md`, and the relevant section below. Do not begin by recursively searching the repo.
2. For code discovery, prefer Serena symbolic tools first when available.
3. Avoid `grep`, `rg`, and broad recursive shell search unless symbolic tools are unavailable, fail, or are unsuitable for the file type. If shell search is required, scope it to the exact file or directory listed here.
4. Do not read these files in full unless the task directly requires it:
   - `medical-knowledge-db.js`: generated bundle, about 24 MB.
   - `index.html`: large static app shell and UI wiring.
   - `reports/*.json` and `reports/clinical-workup-audit-*.md`: generated/large audit outputs.
   - `scripts/hand-polish-clinical-pathway-trees.js`, `scripts/install-endocrine-workups.js`, `scripts/iterate-clinical-workups.js`, `scripts/generate-endocrine-workups.js`: large generators/auditors; use symbol overview or targeted reads.
   - `node_modules/`, `python-deid/venv/`, `models/`, `vendor/`: dependencies, local model files, and browser bundles.
5. If you need to know whether a script exists, read `package.json` first. It already maps most commands to exact files.
6. If you need app wiring, inspect the import block in `index.html` around the module script instead of scanning the whole file.
7. Treat `medical-knowledge/` JSON as source of truth. Treat root `medical-knowledge-db.js` as generated output.
8. For clinical or PHI-related tasks, preserve privacy constraints. Do not commit patient identifiers, raw chart text, or raw proprietary guideline text.
9. On this Windows workspace, prefer `npm.cmd run <script>` if normal `npm run <script>` wrapper execution is blocked.

## Project In One Screen

This is a privacy-first static browser app for inpatient pre-rounding. It turns pasted chart context into a de-identified rounds workspace, bedside checklist, OpenEvidence prompt handoffs, and guideline-backed clinical workups.

The app is local-first by default:

- Patient vault data stays encrypted/browser-local.
- Raw chart text is not stored in the vault.
- Structured-only de-identification can run fully in the browser.
- Supabase is only for Workup Studio authoring/review and public reviewed workup catalog hydration, not patient data.
- Medical knowledge is maintained as reviewed JSON under `medical-knowledge/` and bundled into `medical-knowledge-db.js`.

## High-Value Files

### App Shell

- `index.html`: static app UI, CSS, DOM, workflow state, Workup Studio UI, vault UI, QR/workup sharing UI, and imports for the root modules. It is large. Use targeted reads.
- `favicon.ico`, `assets/`: icons and app imagery.
- `vendor/`: local browser bundles loaded by `index.html`; `scripts/check-syntax.js` verifies vendored JS is actually loaded.
- `docs/presentation-note-standard.md`: canonical standard for how H&Ps, oral presentations, and follow-up notes should be written and delivered.
- `data/physical-exam/physical_exam_reference.csv`: source-of-truth physical exam maneuver reference.
- `data/physical-exam/physical_exam_evidence_overlay.csv`: generated overlay used by the app and tests.

### Core Runtime Modules

- `deid.js`: browser de-identification pipeline. Main exports include `createDeidentifier` and `deidentifyTextStructuredOnly`. Handles regex/structured PHI detection, optional model entities, date generalization, identity aliases, residual PHI warnings, and clinical false-positive guards.
- `labs.js`: lab timeline parser. Normalizes analyte aliases, extracts values/units/timestamps from pasted lab text/tables, builds timeline events, and formats lab chronology prompt blocks.
- `checklist.js`: checklist prompt, parsing, validation, local checklist construction from workups, bedside/exam item expansion, organ-system grouping, and traceability audits.
- `continuity.js`: local continuity case/day model, carry-forward blocks, daily input normalization, smart update classification, and continuity prompt builders.
- `clinical-intents.js`: validated and staged clinical intent registry. Resolves user text into intent matches, handles aliases/avoid labels/suppress rules, and builds validated intent context.
- `complaint-cds.js`: complaint/workup selection and formatting. Evaluates complaint modules, adds modifier-specific add-ons, partitions history/safety/exam/tests/red flags, and formats complaint CDS reports.
- `evidence.js`: evidence retrieval and recommendation engine. Loads CSV catalog data, ranks candidates, builds recommended exam checklists, audits domain coverage, manages catalog gaps, and validates evidence rows.
- `embedding-recall.js`: browser embedding retrieval plus staged clinical knowledge-pack validation/activation. Despite the name, this is also the staged knowledge-pack gate.
- `open-evidence-workflows.js`: OpenEvidence task registry and prompt builders. Enforces prompt limits and same-conversation requirements.
- `open-evidence-results.js`: OpenEvidence paste-back/result parsing and normalization for rounds, medication safety, discharge readiness, blind spots, guideline exceptions, and workup section patches.
- `workup-authoring.js`: Workup Studio authoring data model. Builds normalized authoring snapshots, section patches, change sets, export rows, and no-patient-data validation.
- `workup-report.js`: compact clinical workup/report formatting.
- `checklist-organ-system-schema.js`: organ-system grouping schema used by checklist grouping.
- `clinical-intents.js`, `complaint-cds.js`, `evidence.js`, and `medical-knowledge/` are tightly coupled. For clinical workup behavior, inspect these together before editing.

## Generated And Source Data

- `medical-knowledge/`: source-of-truth reviewed clinical knowledge.
  - `manifest.json`: lists included knowledge files.
  - `source-registry.json`: provenance/source records.
  - `complaint-modules/*.json`: reviewed complaint/diagnosis modules.
  - `complaint-modules/endocrine/*.json`: generated/installed endocrine modules with active `mvp` status.
  - `schema/*.schema.json`: JSON contracts.
  - `templates/`: module starter and guideline extraction prompt.
- `medical-knowledge-db.js`: generated app bundle. Rebuild from JSON using `npm run build:medical-knowledge`; do not hand-edit.
- `data/evidence/`: evidence retrieval CSVs, source registry rows, tag dictionary, catalog gaps, accepted catalog additions, and eval fixtures used by `evidence.js` and evidence tests.
- `data/physical-exam/`: physical exam reference CSV and generated physical exam overlay.
- `data/clinical-guard-*.json` and `data/clinical-guard-export.js`: de-id clinical guard vocabularies.
- `data/test-notes/`: synthetic clinical notes for local testing. Keep PHI-free.
- `reports/`: generated audit/provenance reports. Many are large; read the README or latest small markdown summary first.
- `models/`: local ONNX de-id model files. Do not scan.

## Supabase And Backend Scope

- `supabase/migrations/202606110001_workup_authoring.sql`: base authoring schema.
- `supabase/migrations/202606110002_workup_author_assignments.sql`: delegated author access.
- `supabase/migrations/202606150001_public_workup_catalog_read.sql`: public reviewed catalog read surface.
- `supabase/migrations/202606150002_public_catalog_reviewed_only.sql`: reviewed-only public catalog hardening.
- `supabase/migrations/202606160001_phone_handoff_mailbox.sql`: phone handoff mailbox migration.
- `utils/supabase/env.js`: Supabase env/default config helpers.
- `utils/supabase/node.js`: Node-side Supabase client helper.
- `docs/supabase-workup-authoring.md`: deploy and maintainer workflow. Read before changing Supabase scripts or migrations.

Never put a Supabase service-role key into browser UI. Service-role keys are only for local/CI import/export/deploy commands.

## Python De-Identification Path

- `python-deid/bridge.js`: Node bridge. Checks local Python availability and calls the Python CLI.
- `python-deid/deid_pipeline.py`: optional local Presidio/spaCy/transformers de-id pipeline with clinical guard lists and custom recognizers.
- `python-deid/run_deid.py`: CLI wrapper for the Python pipeline.
- `python-deid/setup.ps1`: local setup helper.
- `python-deid/requirements.txt`: Presidio, torch, transformers, spaCy.
- `python-deid/venv/`: local virtualenv; do not scan.

The browser path in `deid.js` is the default app path. The Python path is optional local tooling.

## Script Catalog

Use this section before opening `scripts/`.

- `scripts/apply-clinical-guard-vocabulary.js`: installs generated clinical guard words/phrases into `deid.js` and writes `data/clinical-guard-export.js`.
- `scripts/build-clinical-guard-vocabulary.js`: builds clinical guard vocabulary from RxNorm/fallback medication lists and medical abbreviations/conditions.
- `scripts/build-medical-knowledge-db.js`: reads `medical-knowledge/`, validates modules/source registry, derives support items, and writes `medical-knowledge-db.js`.
- `scripts/build-mesh-vocabulary.js`: downloads/parses MeSH vocabulary into clinical guard words/phrases.
- `scripts/build-physical-exam-evidence.js`: builds `data/physical-exam/physical_exam_evidence_overlay.csv` from the physical exam reference CSV and curated inference rules.
- `scripts/build-qr-zstd-dictionary.js`: builds QR zstd dictionary and metadata from representative workup payloads and medical knowledge sources.
- `scripts/check-qr-dictionary.js`: checks whether QR dictionary metadata is stale relative to workup library changes.
- `scripts/check-supabase-auth-readiness.js`: verifies public catalog readiness and, unless `--public-only`, deployment credentials/service-role readiness.
- `scripts/check-syntax.js`: syntax/import smoke check for core files, package script targets, CSP/module expectations, and loaded vendor scripts.
- `scripts/deid-adversarial.js`: adversarial de-id fixture runner/helper.
- `scripts/deid-fixtures.js`: de-id fixtures shared by de-id tests/benchmarks.
- `scripts/deploy-supabase-workup-authoring.js`: one-command Supabase authoring deploy. Pushes config/migrations, imports current workups, optionally grants reviewer, and reruns readiness checks.
- `scripts/download-deid-models.js`: downloads local de-id model artifacts into `models/`.
- `scripts/evidence-eval.js`: evidence retrieval evaluation runner. Loads catalog/eval CSVs, computes pass/fail metrics, and writes reports.
- `scripts/export-medical-knowledge.js`: exports approved Supabase/local snapshot change sets back to `medical-knowledge/`, then runs build/test unless skipped.
- `scripts/generate-endocrine-workups.js`: generates endocrine workup dataset and report from embedded source/guideline seed definitions.
- `scripts/grant-workup-access.js`: grants reviewer/admin or delegated author access in Supabase for Workup Studio.
- `scripts/hand-polish-clinical-pathway-trees.js`: large pathway-tree generation/polish/check script. Use `--check` for validation.
- `scripts/import-medical-knowledge.js`: seeds Supabase authoring tables from local JSON when service-role key is present; otherwise writes a local dry-run snapshot.
- `scripts/install-endocrine-workups.js`: installs generated endocrine workups into `medical-knowledge/complaint-modules/endocrine/`, updates manifest/source registry, and writes completion report.
- `scripts/iterate-clinical-workups.js`: audits validated clinical workups across intents, evidence, module coverage, traceability, gaps, suppressions, and readiness; writes markdown/json reports.
- `scripts/README.md`: short command grouping reference.

## NPM Command Map

### Builds And Generators

- `npm run build`: alias for `build:medical-knowledge`.
- `npm run build:medical-knowledge`: regenerate `medical-knowledge-db.js`.
- `npm run import:medical-knowledge`: seed/import authoring data or write dry-run snapshot.
- `npm run export:medical-knowledge`: export approved authoring change sets back to JSON.
- `npm run build:evidence`: rebuild physical exam evidence overlay.
- `npm run build:qr-dictionary`: rebuild QR zstd dictionary.
- `npm run check:qr-dictionary`: detect stale QR dictionary.
- `npm run generate:clinical-pathways`: run pathway tree generation/polish.
- `npm run audit:clinical-pathways`: strict pathway tree audit with report outputs.
- `npm run generate:endocrine-workups`: generate endocrine workup source dataset/report.
- `npm run install:endocrine-workups`: install generated endocrine modules.
- `npm run refresh:endocrine-workups`: generate, install, rebuild medical knowledge, and test endocrine knowledge.
- `npm run build:mesh-vocabulary`: build MeSH clinical guard vocabulary.
- `npm run build:clinical-guard-vocabulary`: build RxNorm/fallback clinical guard vocabulary.
- `npm run apply:clinical-guard-vocabulary`: install generated guard vocabulary into app code.
- `npm run build:clinical-guard-full`: MeSH build, clinical guard build, then apply.

### Supabase

- `npm run check:supabase-public`: credential-free public catalog readiness check.
- `npm run check:supabase-auth`: public readiness plus local deploy credential checks.
- `npm run grant:workup-access -- --email=<email> --role=reviewer`: grant reviewer/admin profile.
- `npm run grant:workup-access -- --email=<email> --workup=<workup_id> --assigned-by=<reviewer_email>`: delegate one workup.
- `npm run deploy:supabase-workup-authoring -- --reviewer-email=<email>`: deploy migrations/config, import workups, optionally grant reviewer, and check readiness.

### Test Suites

- `npm test`: full grouped regression suite: core, clinical, evidence suite.
- `npm run test:core`: syntax, de-id, labs, checklist, vault entry/state, continuity.
- `npm run test:clinical`: clinical intents, medical knowledge, Workup Studio, Supabase catalog/config, complaint CDS, OpenEvidence, endocrine knowledge, embedding, pathway, UI browser checks.
- `npm run test:evidence-suite`: evidence tests, eval, adversarial evidence, workup quality, intent/workup audit.
- `npm run test:syntax`: fastest structural smoke check.
- `npm run test:deid`: browser de-id logic.
- `npm run test:labs`: lab parser.
- `npm run test:checklist`: checklist parser/builder/audits.
- `npm run test:vault-entry`: vault entry behavior.
- `npm run test:vault-state`: vault state machine.
- `npm run test:continuity`: continuity workflow.
- `npm run test:clinical-intents`: intent registry resolution/validation.
- `npm run test:medical-knowledge`: generated medical knowledge bundle validation.
- `npm run test:workup-authoring`: authoring snapshot/change-set/patch logic.
- `npm run test:workup-studio-auth`: Workup Studio auth behavior.
- `npm run test:workup-studio-ui`: Workup Studio UI behavior.
- `npm run test:supabase-config`: Supabase config helpers and app defaults.
- `npm run test:supabase-catalog-race`: public catalog race handling.
- `npm run test:supabase-catalog-refresh`: catalog refresh/cache behavior.
- `npm run test:supabase-catalog-empty`: empty public catalog fail-closed behavior.
- `npm run test:complaint-cds`: complaint CDS module selection/output.
- `npm run test:open-evidence`: OpenEvidence prompts/results.
- `npm run test:evidence`: evidence catalog/recommendation logic.
- `npm run test:evidence:eval`: evidence eval runner.
- `npm run test:evidence:adversarial`: adversarial evidence retrieval checks.
- `npm run test:workup-quality`: clinical workup quality checks.
- `npm run test:intent-workup-audit`: intent/workup audit.
- `npm run test:clinical-pathways`: pathway generation check, strict pathway audit, and cutoff-gap audit.
- `npm run test:endocrine-knowledge`: endocrine module validation.
- `npm run test:embedding`: embedding recall and knowledge-pack validation.
- `npm run test:clinical-ui`: browser UI regression with Playwright.
- `npm run test:desktop-ui`: responsive desktop UI regression.
- `npm run test:qr-optimizer`: QR dictionary and library coverage.
- `npm run test:qr-library`: QR zstd library coverage only.

### Benchmarks

- `npm run benchmark:deid`: local de-id benchmark.
- `npm run benchmark:deid:large`: de-id benchmark with large fixtures.
- `npm run benchmark:embedding`: embedding model benchmark.

## Focused Validation Recipes

- Changed `deid.js`, clinical guard data, `python-deid/`, or model handling:
  - `npm run test:syntax`
  - `npm run test:deid`
  - optionally `npm run benchmark:deid`
- Changed `labs.js`:
  - `npm run test:labs`
  - `npm run test:core`
- Changed checklist construction/parsing:
  - `npm run test:checklist`
  - `npm run test:clinical-intents`
  - `npm run test:complaint-cds`
- Changed `clinical-intents.js`, `complaint-cds.js`, or `evidence.js`:
  - `npm run test:clinical-intents`
  - `npm run test:complaint-cds`
  - `npm run test:evidence-suite`
- Changed `data/evidence/`:
  - `npm run test:syntax`
  - `npm run test:evidence-suite`
  - `npm run test:clinical-intents`
- Changed `medical-knowledge/` JSON:
  - `npm run build:medical-knowledge`
  - `npm run test:medical-knowledge`
  - relevant clinical tests, usually `npm run test:complaint-cds` and `npm run test:clinical-intents`
- Changed endocrine generator/installed modules:
  - `npm run refresh:endocrine-workups`
  - or at minimum `npm run build:medical-knowledge && npm run test:endocrine-knowledge`
- Changed Workup Studio authoring code:
  - `npm run test:workup-authoring`
  - `npm run test:workup-studio-auth`
  - `npm run test:workup-studio-ui`
- Changed Supabase migrations/config/scripts:
  - `npm run check:supabase-public`
  - `npm run test:supabase-config`
  - relevant catalog race/refresh/empty tests
- Changed OpenEvidence workflows/results:
  - `npm run test:open-evidence`
  - `npm run test:complaint-cds` if workup prompts changed
- Changed UI in `index.html`:
  - `npm run test:syntax`
  - `npm run test:clinical-ui`
  - `npm run test:desktop-ui` for layout/responsive work
- Changed QR sharing/compression:
  - `npm run test:qr-optimizer`
  - `npm run check:qr-dictionary`

## Common Workflows

### Medical Knowledge Edit

1. Edit JSON in `medical-knowledge/`, not `medical-knowledge-db.js`.
2. Rebuild with `npm run build:medical-knowledge`.
3. Run `npm run test:medical-knowledge`.
4. If intent/workup behavior changed, also run `npm run test:clinical-intents` and `npm run test:complaint-cds`.

### Workup Studio Import/Export

1. Read `docs/supabase-workup-authoring.md`.
2. Use `npm run import:medical-knowledge` to seed Supabase or produce a dry-run snapshot.
3. Use Workup Studio to create section-scoped change sets.
4. Use `npm run export:medical-knowledge` to export approved changes back to JSON.
5. Rebuild and test medical knowledge.

### Evidence Retrieval Change

1. Start in `evidence.js` and `data/evidence/`.
2. Use `scripts/evidence-eval.js` only if changing eval behavior.
3. Run `npm run test:evidence-suite`.
4. If changing source rows or registry semantics, inspect generated report output only at the relevant case sections.

### Supabase Deployment Change

1. Read `docs/supabase-workup-authoring.md`.
2. Check migrations under `supabase/migrations/`.
3. Check scripts under `scripts/check-supabase-auth-readiness.js`, `scripts/deploy-supabase-workup-authoring.js`, `scripts/import-medical-knowledge.js`, and `scripts/export-medical-knowledge.js`.
4. Never expose service-role keys to browser code.

## Test File Map

- `tests/test-deid.js`: browser de-identification.
- `tests/benchmark-deid.js`: de-id performance.
- `tests/audit-deid-on-notes.js`: de-id audit against synthetic notes.
- `tests/test-labs.js`: lab timeline parsing.
- `tests/test-checklist.js`: checklist parser/builder/traceability.
- `tests/test-vault-entry.js`: vault entry behavior.
- `tests/test-vault-state-machine.js`: vault state transitions.
- `tests/test-continuity.js`: continuity case/day workflow.
- `tests/test-clinical-intents.js`: clinical intent registry and resolution.
- `tests/test-complaint-cds.js`: complaint CDS/workup output.
- `tests/test-medical-knowledge-db.js`: generated bundle and source medical knowledge.
- `tests/test-endocrine-knowledge.js`: endocrine module coverage/quality.
- `tests/test-embedding-recall.js`: embedding recall and knowledge-pack validation.
- `tests/test-open-evidence-workflows.js`: OpenEvidence prompts and result handling.
- `tests/test-evidence.js`: evidence ranking/catalog logic.
- `tests/test-evidence-eval.js`: evidence eval runner.
- `tests/test-evidence-adversarial.js`: adversarial retrieval checks.
- `tests/test-clinical-workup-quality.js`: clinical workup quality/regression checks.
- `tests/test-clinical-intent-workup-audit.js`: validated intent/workup audit.
- `tests/audit-clinical-pathway-trees.js`: pathway tree audit.
- `tests/audit-clinical-cutoff-gaps.js`: cutoff-gap audit.
- `tests/test-workup-authoring.js`: authoring snapshot/change-set/patch logic.
- `tests/test-workup-studio-auth.js`: Workup Studio auth.
- `tests/test-workup-studio-ui.js`: Workup Studio UI.
- `tests/test-supabase-config.js`: Supabase config/defaults.
- `tests/test-supabase-catalog-race.js`: public catalog race behavior.
- `tests/test-supabase-catalog-refresh.js`: public catalog refresh/cache.
- `tests/test-supabase-catalog-empty.js`: empty catalog fallback/fail-closed behavior.
- `tests/test-clinical-ui-browser.js`: browser UI regression.
- `tests/test-desktop-responsive-ui.js`: desktop/responsive UI regression.
- `tests/test-qr-zstd-dictionary.js`: QR dictionary behavior.
- `tests/test-qr-zstd-library-coverage.js`: QR zstd library coverage.
- `tests/test-soap-1.js`, `tests/test-date-temp.js`, `tests/fix-tests-temp.js`: small/temp legacy helpers; inspect before assuming they are part of the main suite.
- `tests/fixtures/`: small text fixtures, currently lab parser examples.

## GitHub Actions

- `.github/workflows/deploy-pages.yml`: GitHub Pages deployment.
- `.github/workflows/supabase-public-catalog-readiness.yml`: scheduled/push/manual public catalog readiness check without secrets.
- `.github/workflows/supabase-workup-authoring.yml`: deploy Workup Studio Supabase authoring when relevant files change or workflow is manually run.

## Safety And Clinical Content Rules

- Keep PHI out of the repo. Use only synthetic notes and de-identified examples.
- Do not commit raw copyrighted guideline text unless license permits it. Commit compact extracted recommendations, source IDs, citations, dates, and section references.
- LLM-generated modules are review candidates until reviewed/promoted.
- Every clinical recommendation item should have source traceability.
- Prefer institution-specific pathways only when explicitly selected by the user.
- Keep medical content as data in JSON/CSV. Keep ranking, validation, and UI behavior in JS modules.
- Workup section edits should remain atomic: history question, physical exam maneuver, safety check, diagnostic test, reference threshold, red flag, or management change.

## Where To Look First

- App startup or UI behavior: `index.html` targeted section, then imported module.
- De-id behavior: `deid.js`, then `data/clinical-guard-*`, then `python-deid/` only for optional Python path.
- Lab parsing: `labs.js`, `tests/fixtures/`, `tests/test-labs.js`.
- Checklist output: `checklist.js`, `complaint-cds.js`, `evidence.js`.
- Clinical intent matching: `clinical-intents.js`.
- Workup selection: `complaint-cds.js` and `medical-knowledge/complaint-modules/`.
- Evidence recommendations: `evidence.js` and `data/evidence/`.
- Medical knowledge source changes: `medical-knowledge/`, then rebuild generated bundle.
- Workup authoring: `workup-authoring.js`, `docs/supabase-workup-authoring.md`, Supabase scripts.
- OpenEvidence prompt/result behavior: `open-evidence-workflows.js`, `open-evidence-results.js`.
- Embedding retrieval or staged packs: `embedding-recall.js`.
- QR sharing/compression: `vendor/qr-zstd-dictionary.js`, `scripts/build-qr-zstd-dictionary.js`, QR tests.
- Presentation and note style: `docs/presentation-note-standard.md`.
- Physical exam maneuvers and evidence overlays: `data/physical-exam/physical_exam_reference.csv` and `data/physical-exam/physical_exam_evidence_overlay.csv`.

## Current Import Wiring In `index.html`

The main module imports these first-party modules:

- `deid.js`
- `complaint-cds.js`
- `checklist.js`
- `clinical-intents.js`
- `open-evidence-workflows.js`
- `open-evidence-results.js`
- `continuity.js`
- `workup-authoring.js`

It also imports zstd/QR helpers from `vendor/zstd-wasm/index.web.js` and `vendor/qr-zstd-dictionary.js`.

Use this import list to avoid broad discovery when tracing browser behavior.
