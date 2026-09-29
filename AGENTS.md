# AGENTS.md

Purpose: a compact, current map for future work on this local-first app.

## Non-Negotiable Product Boundaries

1. This is a static, server-free browser app. Do not add accounts, remote patient persistence, synchronization, server APIs, analytics, or public catalog hydration.
2. Patient data belongs only in the encrypted browser-local vault. Raw chart text and active-review originals are never persisted; retain only de-identified text and residual-warning metadata.
3. The locked vault is a fail-closed render boundary. Clear protected DOM and in-memory patient state, force the Vault view, and show only unlock, encrypted restore, or destructive-recovery controls. CSS alone is never a security boundary.
4. The app stores user-labeled admission and hospital-day packets. It does not infer a clinical timeline.
5. Cheat Sheets are a read-only bedside reference: searchable by chief complaint, mobile-first, usable offline, no forms or patient state.
6. For a structural defect, redesign the state/data boundary rather than adding a compatibility patch, heuristic classifier, or silent fallback.

## Start Here

1. Run `npm.cmd run test:ci` on Windows before considering the workspace healthy.
2. Start at `index.html`, then `src/ui/app.js` for composition, followed by the relevant feature module under `src/ui/`. Do not inspect vendored runtimes or model binaries unless the change is specifically about them.
3. Put pure parsing, validation, prompt assembly, and redaction-review normalization in `src/` modules outside DOM/storage code.
4. Keep DOM, browser storage, crypto, clipboard, File System Access, workers, and fetch at UI or persistence edges.
5. The Cheat Sheets reference (`src/ui/cheat-sheets/`) reads `src/data/cheat-sheets.json` locally; it must never read patient state or hit the network.

## Token-Saving Rules

1. **Do not run full test suites** (`npm test` or `npm run test:ci`) unless specifically requested or verifying the final build. The browser/UI tests (`npm run test:local-ui`) are heavy, slow, and dump verbose log outputs that consume massive tokens. Always run targeted unit tests (e.g., `npm run test:deid`, `npm run test:prompts`, `npm run test:cheat-sheets`) to verify your specific changes.
2. **Do not read entire test files** sequentially. If you need to check assertions or structure, use `grep_search` or view specific line ranges.
3. **Minimize command output**: When running tests or build commands, avoid capturing and printing excessive output.
4. **Use `npm.cmd` on Windows**: On this Windows workspace, standard shell scripts and commands might require running `npm.cmd` instead of `npm`.

## Module Map

- `index.html`: shell, restrictive CSP, navigation, confirmation dialogs.
- `styles.css`: visual layout. `.view` owns route scroll; preserve the scroll owners used by Hospital Stay, Cheat Sheets, and the annotated redaction document.
- `src/ui/app.js`: composition, event-routing, and session-bound UI orchestration layer. It owns no persistence format or feature templates; move pure derivation and markup into the scoped modules below, and keep only browser/session interactions at this edge. Do not add new feature markup or browser-transfer behavior here. It maintains session drafts (`sectionDrafts`) so review re-renders do not discard user edits before save.
  - `src/ui/cheat-sheets/` is the read-only bedside reference: `search.js` (ranked local search), `presentation.js` (history/exam cards), `controller.js` (view wiring).
  - `src/ui/redaction/presentation.js` is pure annotated-review and residual-warning markup. Active-tab review state remains in `src/patient-context/review.js`.
  - `src/ui/daily/presentation.js` renders the hospital-day trajectory and progress note sections.
  - `src/ui/deid/presentation.js` renders model status, active download progress, and de-identification controls.
  - `src/ui/deid/model-pack-controller.js` owns the model-pack lifecycle (load/download/import/verify/remove, ensure-selected-ready gate, download progress text).
  - `src/ui/prompts/presentation.js` renders the prompt builder, customized templates, and task registry.
  - `src/ui/quick-deid/presentation.js` renders the standalone text de-identification review playground.
  - `src/ui/scores/presentation.js` is pure MD Calc markup (score cards, calculator forms, result panels).
  - `src/ui/scores/controller.js` owns MD Calc state, patient bindings, and rendering.
  - `src/clinical-scores/` holds pure clinical calculators (Bishop, APGAR, VBAC Flamm, VBAC MFMU 2021, pregnancy due dates) plus the patient auto-fill binding layer.
  - `src/ui/settings/presentation.js` renders user preferences, workspace mirror configuration, and vault controls.
  - `src/ui/vault/presentation.js` renders locked, unlocked, restore, and destruct recovery screens.
- `src/app/preferences.js`: handles user preference keys (e.g. current model pack name, dark mode).
- `src/app/state/`: vault records, migrations, AES-GCM persistence, encrypted preferences, and the workspace-folder persistence edge.
  - `persistence.js` implements encrypt/decrypt actions for local storage keys.
  - `vault.js` exposes core vault crud operations (e.g. patients, admission, daily packets).
- `src/patient-context/`: section handling, worker/client/service model integration, model packs, and active-tab redaction reviews.
  - `deid-client.js` is the worker wrapper for model execution.
  - `deid-model-options.js` defines the registry of supported models (e.g. GLiNER, Stanford, OpenMed).
  - `deid-service.js` registers worker lifecycle, CSP-compliant metadata fetching, and inference self-test verification.
  - `deid-worker.js` is the worker script bootstrapping model runner execution.
  - `model-packs.js` defines download plans and URLs.
  - `model-pack-storage.js` manages OPFS files and tracks download progress.
  - `review.js` holds originals and review choices only in memory for the current active tab.
  - `sections.js` provides helper functions to split, update, and manage note sections.
- `src/daily-updates/days.js`: hospital-day CRUD and trajectory source assembly.
- `src/data/cheat-sheets.json`: the 50 read-only bedside reference sheets (history questions + exam maneuvers), bundled with the static site.
- `src/prompts/`: task registry, dynamic variables, templates, and task-specific guideline enforcement.
  - `custom-templates.js`: Custom prompt templates and prompt builders.
  - `natural-language.js`: Helper for parsing natural language and dates.
  - `open-evidence.js`: OpenEvidence query prompts and formatting helper.
- `src/vault/deid.js` and `src/vault/deid/`: existing structured compatibility redactor and model integration support. Do not add new in-house detection heuristics.
  - `deid.js`: Main structured compatibility de-identifier logic.
  - `deid/lexicons.js`: Lexicon arrays for clinical keywords.
  - `deid/model-config.js`: Configuration for custom NLP model mapping.
  - `deid/name-dictionary.js`: Dictionary of names/words for name detection.
  - `deid/name-recall.js`: Recall helpers for names in text.
  - `deid/zones.js`: Structured note parser/builder zones.

## Cheat Sheets

- The reference is a static JSON dataset, not authoring content: `src/data/cheat-sheets.json` is the only source of truth at runtime. Never add patient state, forms, or network calls to it.
- Search ranks title prefix > alias prefix > ID prefix > title substring > alias substring > ID substring > system. Empty search returns all sheets.
- Cards show "Listen for", findings, "How to", and "Why it matters" for each history/exam item. Items whose clinical reasoning is still being reviewed show "Clinical reasoning note pending review."
- The data regression test (`test:cheat-sheets-data`) freezes the full item manifest with a SHA-256 digest; any wording change must be intentional and update the digest.

## De-Identification

- Automated detections come from mature local model integrations. Do not train, extend, or substitute an in-house PII detector. The existing Structured option is explicit compatibility fallback, not a quality-equivalent silent substitution.
- Browser model work runs in a worker. A selected model must be downloaded/imported, self-tested with current `LOCAL_MODEL_RUNTIME_VERSION`, and visibly verified before raw text can be saved or processed.
- The supported clinician picker is intentionally small: bundled Stanford clinical deidentifier (default), OpenMed SuperClinical Small (44M int8 CPU/WASM), and GLiNER multi-PII. Unsupported Large/Base/OpenAI Privacy/Ettin options are excluded rather than presented as runnable.
- Model selection and lifecycle are one control in Quick De-ID and Hospital Stay. Show file/byte progress, active loading state, completion, cancellation, and actionable errors. Fail closed; never claim a selected model ran after falling back.
- `model-packs.js` owns pure pinned download plans. `model-pack-storage.js` owns browser storage. A complete user-imported pack must clear stale interrupted OPFS metadata for that model, or it can falsely appear partial.
- Keep all model metadata URL fetching local during inference: `deid-service.js` remaps allowed model metadata to the selected local pack and rejects other external model fetches. The CSP allows Hugging Face only for explicit, pinned model-download actions.
- The worker inference self-test is mandatory before ready state. A load, self-test, or inference failure revokes verification but retains files for explicit retry.
- Quick De-ID and Hospital Stay use one active-tab-only annotated review document. Pending redactions show original struck through beside the safe replacement; accepted redactions show only the safe highlighted replacement and expose Undo on click. Support Confirm all, manual selected-text redaction, residual-flag Redact/Not PHI, and preserving outer/document scroll while focusing the current decision.
- Hospital Stay review is scoped by packet (`context` versus `daily`) and traverses fields in document order. After save, the first pending redaction opens automatically; Accept/Reject advances to the next redaction or next packet field without collapsing the editor. Residual-warning clicks must select the exact flagged range using a text-range anchor, not a whole inline span.
- Edits made while a review is open remain available through `Edit field text` / `Return to redaction review`; input events update the session draft immediately. Do not make a saved review field permanently read-only or force the user back to the top of a route.
- Deduplicate overlapping/nested detector spans into one review choice, retaining the most specific label. Distinct source occurrences remain distinct review choices.

## Prompts And Data

- Documentation-standard text lives as user-editable "guideline sets" (`src/prompts/guideline-sets.js`), each with its own stable `@<name>-guidelines` token - not hardcoded per task. `prompts/*.md` (`Guidelines-admission.md`, `Guidelines-progress.md`, `Discharge_Instructions.md`) are only the seed source, fetched once (and only once per file - see `loadOrMigrateGuidelineSets`/`ensureAdditionalGuidelineSets`) to prefill the first sets; after that, Settings is the source of truth and the seed never re-runs, even if the user deletes a set.
- Prompt variables derive from saved admission fields and the chosen hospital-day sections. `@selected-day` defaults to the latest saved day. `@hospital-stay` is a backward-compatible alias only; do not present it as competing UI.
- Do not persist OpenEvidence output in the vault. Generate/copy only de-identified prompts.

## Tests

```powershell
npm.cmd run test:ci
```

- `test:state`: encrypted vault state and migrations.
- `test:deid`: structured de-identification and review-dedup regression coverage.
- `test:prompts`: task-specific standards, dynamic fields, selected-day prompt scope, and task registry.
- `test:cheat-sheets`: cheat-sheet search ranking and read-only view-model contracts.
- `test:cheat-sheets-data`: frozen per-sheet manifest + SHA-256 digest of every cheat-sheet item.
- `test:guided-demo`: guided demo session flow.
- `test:ui-features`: redaction and note-draft UI module contracts.
- `test:ui-boundaries`: `app.js` size ceiling plus pure-presentation module boundary guardrails.
- `test:deid-model-options` and `test:model-packs`: supported model registry, pinned packs, and stale-import behavior.
- `test:local-ui`: locked-vault boundary, Hospital Stay, model readiness gates, prompts, redaction review, and backend-free network behavior.

## Deployment

- `.github/workflows/ci.yml` runs the smoke suite on pushes and pull requests.
- `.github/workflows/deploy-pages.yml` must publish every runtime file: `assets/`, `data/`, `models/`, `prompts/`, `src/`, and `vendor/`.
- `service-worker.js` remains in the static artifact for imported Cache Storage packs.
- Keep `actions/checkout` configured with `lfs: true` while baseline assets are Git LFS content.
- Cache-sensitive direct imports (UI, worker, model registry, service, storage adapter) use aligned revision query strings. Bump the relevant graph together whenever its model-runtime contract changes.
