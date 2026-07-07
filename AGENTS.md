# AGENTS.md

Purpose: let an agent answer "where is X" and "what should I run" without grepping or reading `index.html` end to end. Read this file first. If it doesn't answer your question, use the generated symbol maps below before falling back to search.

## Token-Saving Rules

1. Start with this file. Do not begin by recursively searching the repo.
2. For symbol lookups inside `index.html`'s inline script, grep `docs/index-html-js-symbol-map.md` for the name, then `Read index.html` at that exact line (small offset/limit) — see "index.html Structure" below. Do not grep `index.html` itself for a function name; the file is too large and the match will usually not tell you where the function ends.
3. For CSS lookups, use `docs/index-html-css-region-map.md` (covers `styles.css`, extracted from `index.html`'s former inline stylesheet) to find the selector-prefix range, then read that range directly.
4. Prefer Serena symbolic tools for the smaller first-party `.js` modules (everything except `index.html`, `styles.css`, and `medical-knowledge-db.js`) — they're small enough (under ~11k lines, most under 3.5k) for normal symbolic navigation.
5. On this Windows workspace, prefer `npm.cmd run <script>` if plain `npm run <script>` is blocked.

## Do Not Grow The Monoliths Further

`index.html` (~25k lines) and `styles.css` (~14.9k lines) got this large because past sessions pasted new code wherever was convenient instead of creating new modules. Do not repeat that pattern:

1. **New feature logic goes in a new `.js` module**, imported by `index.html`'s `<script type="module">`, not pasted into the inline script. The inline script should only gain the few lines needed to call into the new module. Same idea for CSS: prefer a scoped block or, for anything nontrivial, consider whether it belongs in a new stylesheet rather than appended to `styles.css`.
2. **Before editing `index.html` or `styles.css`, check size first** (`wc -l index.html styles.css` or PowerShell equivalent) and mention the before/after line count if the change is nontrivial (more than ~50 lines). If a change would add more than ~150 lines to either file, stop and propose extracting it into a new module instead of asking forgiveness after the fact.
3. **Keep new code contiguous by feature.** Never scatter a feature's functions across the file just because there was space nearby — either put them in a new module or in one clearly-bounded region, and say where.
4. **No sprawling single-session pastes.** If a task looks like it needs a large new chunk of code (a new panel, a new workflow, a big generated dataset), default to a new file and a plan, not a single giant diff appended to an existing monolith. Ask the user before writing anything past a few hundred lines if it wasn't explicitly scoped.
5. After any `index.html`/`styles.css` edit, regenerate the symbol/CSS maps (`npm run build:index-html-symbol-map`, `npm run build:index-html-css-map`) so the maps don't silently drift stale.

If you're the user reading this: the most reliable way to stop a session from doing this is to say up front "put this in a new module, don't append to index.html/styles.css" for any new feature, and to ask for a line-count diff before accepting a large change.

## Do Not Re-Read

| Path | Why | Check this instead |
|---|---|---|
| `medical-knowledge-db.js` | Generated bundle, ~407k lines / ~24 MB | Source JSON in `medical-knowledge/`; rebuild with `npm run build:medical-knowledge` |
| `index.html` (whole file, sequentially) | ~24.9k lines: ~1.7k lines DOM, ~23.1k lines inline JS. CSS was extracted to `styles.css` (~14.9k lines) — see below | `docs/index-html-js-symbol-map.md`, `docs/index-html-css-region-map.md`, or the line ranges in "index.html Structure" below |
| `styles.css` (whole file, sequentially) | ~14.9k lines, extracted from `index.html`'s former inline `<style>` block | `docs/index-html-css-region-map.md` for a selector-prefix table of contents |
| `reports/*.json`, `reports/clinical-workup-audit-*.md` | Generated audit output, large | `reports/README.md` or the `*-latest.md` file for the relevant report |
| `scripts/hand-polish-clinical-pathway-trees.js` (8.1k lines), `scripts/iterate-clinical-workups.js` (3.6k lines), `scripts/install-endocrine-workups.js`, `scripts/generate-endocrine-workups.js` | Large generators/auditors | Their `--check`/report output, or a symbol overview instead of a full read |
| `node_modules/`, `python-deid/venv/`, `models/`, `vendor/` | Dependencies, local model files, vendored browser bundles | Not app source; `scripts/check-syntax.js` verifies vendor scripts are actually wired up |
| `evidence.js` (11.3k lines) — read fully only when necessary | Second-largest first-party file; no symbol map exists for it yet | Grep for the specific export/function name first; see "Recommended Next Split" at the end of this file |

## index.html Structure

As of the CSS extraction, `index.html` has two physical parts. Line numbers drift as the file is edited — regenerate the maps (below) rather than trusting a stale number.

1. **DOM body**: from `<body>` through the vendor `<script src="...">` tags, currently around lines 15-1762 (~1.7k lines). This is plain markup; grep for the element `id` you care about (`data-view="..."` attributes mark the top-level app views: `vaultAccess`, `intake`, `workspace`, `workup`, `bedside`, `evidence`, `deid`, `handoff`, `studio`, `final`, `privacy`).
2. **Inline module script**: `<script type="module">` currently at lines 1763-24960 (~23.1k lines — this is almost the entire app's client-side logic: Workup Studio, evidence panel, de-id UI wiring, vault, QR/phone handoff, layout, etc., all in one script, not organized into sub-sections). Symbol lookup: `docs/index-html-js-symbol-map.md` (1000+ entries, name → line → heuristic feature tag).

CSS lives in `styles.css` (a standalone stylesheet loaded via `<link rel="stylesheet" href="./styles.css">` in `<head>`), not inline in `index.html`. Table of contents: `docs/index-html-css-region-map.md`. CSS is written in mostly feature-contiguous runs, so a selector-prefix range is a reasonable place to jump to directly.

Regenerate either map after an edit:
- `npm run build:index-html-symbol-map`
- `npm run build:index-html-css-map`

**Important caveat**: functions belonging to the same feature are *not* generally contiguous in the inline script — the file grew by pasting new code wherever was convenient, not by feature section. The table below gives the min/max line span per feature tag so you know roughly which part of the file to expect something in, but the exhaustive per-function table in `docs/index-html-js-symbol-map.md` is the only reliable per-symbol coordinate.

| Feature area (heuristic tag) | Approx. line span | Function count |
|---|---|---|
| Workup Studio & Contribution (authoring UI, review, GitHub issue handoff) | 2386-20894 | 255 |
| Checklist / Complaint CDS / Clinical Intent | 1777-24938 | 196 |
| QR / Phone Handoff | 9788-23594 | 121 |
| Patient Roster / Admission | 3015-19223 | 40 |
| Evidence & Physical Exam | 4747-23446 | 31 |
| De-identification & Vault (crypto, encrypt/decrypt) | 2099-20664 | 28 |
| Service Preferences & Picker | 3138-3459 | 23 |
| Lab Timeline | 3154-21881 | 16 |
| Clinical Pathway Graph (cytoscape trees) | 4997-12697 | 15 |
| Generic Utilities (search/filter/parse/format/validate) | 4811-22307 | 13 |
| Layout & Navigation Chrome | 3712-11065 | 9 |
| Supabase & Auth (browser side is direct REST fetch, not the JS SDK) | 4094-6181 | 5 |
| Continuity (day-over-day carry-forward) | 14398-15031 | 4 |
| Notes / H&P / Discharge / Presentation | 4359-23211 | 3 |
| General/App State (uncategorized) | scattered | ~272 |

## Module Dependency Map

First-party `.js` modules and what they import from each other (verified from source, not inferred):

```
index.html (browser entry, <script type="module">)
├── deid.js                     (no first-party imports)
├── complaint-cds.js            → medical-knowledge-db.js
├── checklist.js                → checklist-organ-system-schema.js
├── clinical-intents.js         → medical-knowledge-db.js
├── open-evidence-workflows.js  → open-evidence-results.js
├── open-evidence-results.js    (no first-party imports)
├── continuity.js               → labs.js
├── workup-authoring.js         (no first-party imports)
├── workup-contribution.js      (no first-party imports)
├── physical-exam-catalog.js    (no first-party imports)
└── vendor/zstd-wasm/index.web.js, vendor/qr-zstd-dictionary.js

Not wired into index.html (Node-side / test-only today):
├── embedding-recall.js  → complaint-cds.js, evidence.js
├── workup-report.js     → medical-knowledge-db.js
└── evidence.js          (no first-party imports; loads data/evidence/*.csv itself)
    used by: embedding-recall.js, scripts/evidence-eval.js, scripts/iterate-clinical-workups.js
```

Consequence for editing: changing `complaint-cds.js` or `clinical-intents.js` behavior can affect `embedding-recall.js` even though `embedding-recall.js` isn't loaded by the browser app — check its tests too if you touch either file. `evidence.js` and `labs.js` have no reverse dependents inside `index.html` directly; they're reached only through `continuity.js` (labs) or not at all in the browser bundle (evidence — evidence retrieval in the running app goes through `complaint-cds.js`/`checklist.js`, not `evidence.js`; confirm this hasn't changed before assuming it).

## Project In One Screen

Privacy-first static browser app for inpatient pre-rounding. Pasted chart context becomes a de-identified rounds workspace, bedside checklist, OpenEvidence prompt handoffs, and guideline-backed clinical workups.

- Patient vault data stays encrypted/browser-local; raw chart text is not stored in the vault.
- Structured-only de-identification can run fully in the browser; an optional local Python path exists separately (see below).
- Supabase is only for Workup Studio authoring/review and public reviewed workup catalog hydration — never patient data. The browser talks to Supabase via direct REST `fetch` (CSP `connect-src` allows `*.supabase.co`), not the `@supabase/supabase-js` SDK; the SDK is only used Node-side in `utils/supabase/node.js` and `scripts/`.
- Medical knowledge is reviewed JSON under `medical-knowledge/`, bundled into `medical-knowledge-db.js` by `npm run build:medical-knowledge`.

## High-Value Files

- `index.html`: static app UI DOM and all client-side workflow logic (inline module script). See "index.html Structure" above before opening it.
- `styles.css`: all app CSS, loaded via `<link>` from `index.html`. See `docs/index-html-css-region-map.md`.
- `deid.js`: browser de-id pipeline. Key exports: `createDeidentifier`, `deidentifyTextStructuredOnly`. Regex/structured PHI detection, optional model entities, date generalization, identity aliases, residual PHI warnings, clinical false-positive guards.
- `labs.js`: lab timeline parser — analyte aliases, value/unit/timestamp extraction, timeline events, prompt formatting.
- `checklist.js`: checklist prompt/parse/validate, local checklist construction from workups, bedside/exam item expansion, organ-system grouping, traceability audits.
- `continuity.js`: continuity case/day model, carry-forward blocks, daily input normalization, smart update classification, continuity prompt builders.
- `clinical-intents.js`: validated/staged clinical intent registry — resolves free text to intents, aliases/avoid/suppress rules, validated intent context.
- `complaint-cds.js`: complaint/workup selection — evaluates complaint modules, modifier add-ons, partitions history/safety/exam/tests/red flags, formats CDS reports.
- `evidence.js`: evidence retrieval/recommendation engine — loads CSV catalog, ranks candidates, builds recommended exam checklists, audits domain coverage, catalog gaps.
- `embedding-recall.js`: browser embedding retrieval plus staged clinical knowledge-pack validation/activation gate (name is misleading — it's also the knowledge-pack gate). Not wired into `index.html` today.
- `open-evidence-workflows.js` / `open-evidence-results.js`: OpenEvidence task registry/prompt builders (with prompt limits, same-conversation enforcement) and paste-back/result parsing for rounds, med safety, discharge readiness, blind spots, guideline exceptions, workup patches.
- `workup-authoring.js`: Workup Studio authoring data model — normalized snapshots, section patches, change sets, export rows, no-patient-data validation.
- `workup-contribution.js`: community contribution schema/validation and GitHub issue / chat-AI handoff prompt builders for submitting new workups.
- `physical-exam-catalog.js`: loads the physical exam maneuver catalog for the browser app.
- `workup-report.js`: compact clinical workup/report formatting. Not wired into `index.html` today (test-only).
- `checklist-organ-system-schema.js`: organ-system grouping schema used by `checklist.js`.
- `clinical-intents.js`, `complaint-cds.js`, `evidence.js`, and `medical-knowledge/` are tightly coupled for clinical workup behavior — check them together.

## Generated And Source Data

- `medical-knowledge/`: source of truth. `manifest.json` (included files), `source-registry.json` (provenance), `complaint-modules/*.json` (reviewed modules; `complaint-modules/endocrine/*.json` is generated/installed with active `mvp` status), `schema/*.schema.json`, `templates/`.
- `medical-knowledge-db.js`: generated from the above — never hand-edit.
- `data/evidence/`: evidence CSVs, source registry rows, tag dictionary, catalog gaps, accepted additions, eval fixtures — used by `evidence.js` and evidence tests.
- `data/physical-exam/`: `physical_exam_reference.csv` (source of truth) and `physical_exam_evidence_overlay.csv` (generated by `npm run build:evidence`).
- `data/clinical-guard-*.json`, `data/clinical-guard-export.js`: de-id clinical guard vocabularies, installed by `scripts/apply-clinical-guard-vocabulary.js`.
- `data/test-notes/`: synthetic clinical notes for local testing — keep PHI-free.
- `models/`: local ONNX de-id model files — do not scan.

## Supabase And Backend Scope

- Migrations live in `supabase/migrations/`, applied in filename order; read the latest one for current schema shape rather than assuming.
- `utils/supabase/env.js`: env/default config helpers. `utils/supabase/node.js`: Node-side Supabase client (SDK usage is confined to this file and `scripts/`).
- `docs/supabase-workup-authoring.md`: deploy/maintainer workflow — read before touching Supabase scripts or migrations.
- Never put a service-role key into browser UI. Service-role keys are for local/CI import/export/deploy commands only.

## Python De-Identification Path

- `python-deid/bridge.js`: Node bridge — checks local Python availability, calls the Python CLI.
- `python-deid/deid_pipeline.py`: optional local Presidio/spaCy/transformers de-id pipeline with clinical guard lists and custom recognizers. `python-deid/run_deid.py` is its CLI wrapper.
- `python-deid/venv/`: local virtualenv — do not scan.
- The browser path in `deid.js` is the default app path; the Python path is optional local tooling, not part of the shipped app.

## Script Catalog

- `scripts/apply-clinical-guard-vocabulary.js`: installs generated clinical guard words/phrases into `deid.js`, writes `data/clinical-guard-export.js`.
- `scripts/build-clinical-guard-vocabulary.js`: builds clinical guard vocabulary from RxNorm/fallback medication lists and medical abbreviations/conditions.
- `scripts/build-medical-knowledge-db.js`: reads `medical-knowledge/`, validates modules/source registry, derives support items, writes `medical-knowledge-db.js`.
- `scripts/build-mesh-vocabulary.js`: downloads/parses MeSH vocabulary into clinical guard words/phrases.
- `scripts/build-physical-exam-evidence.js`: builds the physical exam evidence overlay CSV from the reference CSV and curated inference rules.
- `scripts/build-qr-zstd-dictionary.js`: builds the QR zstd dictionary/metadata from representative workup payloads and medical knowledge sources.
- `scripts/check-qr-dictionary.js`: checks whether the QR dictionary is stale relative to workup library changes.
- `scripts/check-supabase-auth-readiness.js`: verifies public catalog readiness and, unless `--public-only`, deployment credentials/service-role readiness.
- `scripts/check-syntax.js`: syntax/import smoke check for core files, package script targets, CSP/module expectations, loaded vendor scripts.
- `scripts/deid-adversarial.js`, `scripts/deid-fixtures.js`: shared de-id fixtures/adversarial runner used by de-id tests/benchmarks.
- `scripts/deploy-supabase-workup-authoring.js`: one-command Supabase authoring deploy — pushes config/migrations, imports current workups, optionally grants reviewer, reruns readiness checks.
- `scripts/download-deid-models.js`: downloads local de-id model artifacts into `models/`.
- `scripts/evidence-eval.js`: evidence retrieval evaluation runner — loads catalog/eval CSVs, computes pass/fail metrics, writes reports.
- `scripts/export-medical-knowledge.js`: exports approved Supabase/local snapshot change sets back to `medical-knowledge/`, then runs build/test unless skipped.
- `scripts/generate-endocrine-workups.js` / `scripts/install-endocrine-workups.js`: generate then install the endocrine workup dataset into `medical-knowledge/complaint-modules/endocrine/`.
- `scripts/grant-workup-access.js`: grants reviewer/admin or delegated author access in Supabase for Workup Studio.
- `scripts/hand-polish-clinical-pathway-trees.js`: large pathway-tree generation/polish/check script — use `--check` for validation, don't read it fully.
- `scripts/import-medical-knowledge.js`: seeds Supabase authoring tables from local JSON when a service-role key is present, otherwise writes a local dry-run snapshot.
- `scripts/iterate-clinical-workups.js`: audits validated clinical workups (intents, evidence, module coverage, traceability, gaps, suppressions, readiness); writes markdown/json reports.
- `scripts/gen-index-html-symbol-map.js` / `scripts/gen-index-html-css-region-map.js`: regenerate the two `docs/index-html-*-map.md` lookup tables used above — rerun after editing `index.html`'s inline script or `styles.css`.
- `scripts/README.md`: short command grouping reference.

## Focused Validation Recipes

- Changed `deid.js`, clinical guard data, `python-deid/`, or model handling: `npm run test:syntax`, `npm run test:deid`, optionally `npm run benchmark:deid`.
- Changed `labs.js`: `npm run test:labs`, `npm run test:core`.
- Changed checklist construction/parsing: `npm run test:checklist`, `npm run test:clinical-intents`, `npm run test:complaint-cds`.
- Changed `clinical-intents.js`, `complaint-cds.js`, or `evidence.js`: `npm run test:clinical-intents`, `npm run test:complaint-cds`, `npm run test:evidence-suite`. Also check `embedding-recall.js` tests (`npm run test:embedding`) since it imports `complaint-cds.js`/`evidence.js` even though it's not wired into `index.html`.
- Changed `data/evidence/`: `npm run test:syntax`, `npm run test:evidence-suite`, `npm run test:clinical-intents`.
- Changed `medical-knowledge/` JSON: `npm run build:medical-knowledge`, `npm run test:medical-knowledge`, then `npm run test:complaint-cds` and `npm run test:clinical-intents`.
- Changed endocrine generator/installed modules: `npm run refresh:endocrine-workups`, or at minimum `npm run build:medical-knowledge && npm run test:endocrine-knowledge`.
- Changed Workup Studio authoring code: `npm run test:workup-authoring`, `npm run test:workup-studio-auth`, `npm run test:workup-studio-ui`.
- Changed Supabase migrations/config/scripts: `npm run check:supabase-public`, `npm run test:supabase-config`, relevant catalog race/refresh/empty tests.
- Changed OpenEvidence workflows/results: `npm run test:open-evidence`; also `npm run test:complaint-cds` if workup prompts changed.
- Changed `styles.css` or the inline JS in `index.html`: `npm run test:syntax`, `npm run test:clinical-ui`, `npm run test:desktop-ui` for layout/responsive work, and regenerate the affected map (`npm run build:index-html-symbol-map` / `npm run build:index-html-css-map`).
- Changed QR sharing/compression: `npm run test:qr-optimizer`, `npm run check:qr-dictionary`.
- `npm test` runs everything (`test:core && test:clinical && test:evidence-suite`); use the targeted commands above during iteration and `npm test` before finishing.

## Test File Map

- `tests/test-deid.js`, `tests/benchmark-deid.js`, `tests/audit-deid-on-notes.js`: de-id logic, performance, synthetic-note audit.
- `tests/test-labs.js`: lab timeline parsing.
- `tests/test-checklist.js`: checklist parser/builder/traceability.
- `tests/test-vault-entry.js`, `tests/test-vault-state-machine.js`: vault entry behavior and state transitions.
- `tests/test-continuity.js`: continuity case/day workflow.
- `tests/test-clinical-intents.js`: clinical intent registry and resolution.
- `tests/test-complaint-cds.js`: complaint CDS/workup output.
- `tests/test-medical-knowledge-db.js`: generated bundle and source medical knowledge.
- `tests/test-endocrine-knowledge.js`: endocrine module coverage/quality.
- `tests/test-embedding-recall.js`, `tests/benchmark-embedding-models.js`: embedding recall, knowledge-pack validation, model benchmark.
- `tests/test-open-evidence-workflows.js`: OpenEvidence prompts/result handling.
- `tests/test-evidence.js`, `tests/test-evidence-eval.js`, `tests/test-evidence-adversarial.js`: evidence ranking/catalog logic, eval runner, adversarial retrieval.
- `tests/test-clinical-workup-quality.js`, `tests/test-clinical-intent-workup-audit.js`: clinical workup quality regression, validated intent/workup audit.
- `tests/audit-clinical-pathway-trees.js`, `tests/audit-clinical-cutoff-gaps.js`: pathway tree audit, cutoff-gap audit.
- `tests/test-workup-authoring.js`, `tests/test-workup-studio-auth.js`, `tests/test-workup-studio-ui.js`: authoring model, Workup Studio auth, Workup Studio UI.
- `tests/test-supabase-config.js`, `tests/test-supabase-catalog-race.js`, `tests/test-supabase-catalog-refresh.js`, `tests/test-supabase-catalog-empty.js`: Supabase config/defaults, catalog race/refresh/empty-fail-closed behavior.
- `tests/test-clinical-ui-browser.js`, `tests/test-desktop-responsive-ui.js`: Playwright browser UI regression and desktop/responsive regression — these are what actually exercise `index.html` end to end.
- `tests/test-qr-zstd-dictionary.js`, `tests/test-qr-zstd-library-coverage.js`: QR dictionary behavior and zstd library coverage.
- `tests/test-soap-1.js`, `tests/test-date-temp.js`, `tests/fix-tests-temp.js`: small/temp legacy helpers — confirm before assuming they're part of the main suite.
- `tests/fixtures/`: small text fixtures (currently lab parser examples).

## GitHub Actions

- `.github/workflows/deploy-pages.yml`: GitHub Pages deployment.
- `.github/workflows/supabase-public-catalog-readiness.yml`: scheduled/push/manual public catalog readiness check without secrets.
- `.github/workflows/supabase-workup-authoring.yml`: deploy Workup Studio Supabase authoring when relevant files change or run manually.

## Safety And Clinical Content Rules

- Keep PHI out of the repo — only synthetic notes and de-identified examples.
- Do not commit raw copyrighted guideline text unless license permits it; commit compact extracted recommendations, source IDs, citations, dates, section references.
- LLM-generated modules are review candidates until reviewed/promoted.
- Every clinical recommendation item should have source traceability.
- Prefer institution-specific pathways only when explicitly selected by the user.
- Keep medical content as data in JSON/CSV; keep ranking, validation, and UI behavior in JS.
- Workup section edits should stay atomic: one history question, exam maneuver, safety check, diagnostic test, reference threshold, red flag, or management change per edit.

## Where To Look First

- App startup/UI behavior: symbol map → `index.html` line range → the imported module it calls into.
- De-id behavior: `deid.js`, then `data/clinical-guard-*`, then `python-deid/` only for the optional Python path.
- Lab parsing: `labs.js`, `tests/fixtures/`, `tests/test-labs.js`.
- Checklist output: `checklist.js`, `complaint-cds.js`, `evidence.js`.
- Clinical intent matching: `clinical-intents.js`.
- Workup selection: `complaint-cds.js` and `medical-knowledge/complaint-modules/`.
- Evidence recommendations: `evidence.js` and `data/evidence/`.
- Medical knowledge source changes: `medical-knowledge/`, then rebuild the generated bundle.
- Workup authoring: `workup-authoring.js`, `docs/supabase-workup-authoring.md`, Supabase scripts.
- Community workup contribution flow: `workup-contribution.js`.
- OpenEvidence prompt/result behavior: `open-evidence-workflows.js`, `open-evidence-results.js`.
- Embedding retrieval or staged knowledge packs: `embedding-recall.js` (not wired into the browser app today).
- QR sharing/compression: `vendor/qr-zstd-dictionary.js`, `scripts/build-qr-zstd-dictionary.js`, QR tests.
- Physical exam maneuvers and evidence overlays: `data/physical-exam/physical_exam_reference.csv` and `physical_exam_evidence_overlay.csv`.
- Presentation and note style conventions: `docs/presentation-note-standard.md`.

## Recommended Next Split

CSS has been extracted to `styles.css`. `index.html`'s ~23k-line inline JS module script is now the largest remaining monolith — the 1000+ functions in it are not organized by feature and are not yet split into ES modules. Check `git log` for recent `index.html` extraction commits before assuming this file is still one big inline script; regenerate `docs/index-html-js-symbol-map.md` if it isn't. `evidence.js` (11.3k lines) is the next largest single first-party file and has no symbol map yet — if it becomes a frequent point of confusion, generate one following the same pattern as `scripts/gen-index-html-symbol-map.js`.
