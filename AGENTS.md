# AGENTS.md

Purpose: let an agent answer "where is X" and "what should I run" without grepping or reading `index.html` end to end. Read this file first. If it doesn't answer your question, use the generated symbol maps below before falling back to search.

## Token-Saving Rules

1. Start with this file. Do not begin by recursively searching the repo.
2. For symbol lookups inside `index.html`'s inline script, grep `docs/index-html-js-symbol-map.md` for the name, then `Read index.html` at that exact line (small offset/limit) — see "index.html Structure" below. Do not grep `index.html` itself for a function name; the file is too large and the match will usually not tell you where the function ends.
3. For CSS lookups, use `docs/index-html-css-region-map.md` (covers `styles.css`, extracted from `index.html`'s former inline stylesheet) to find the selector-prefix range, then read that range directly.
4. Prefer Serena symbolic tools for the smaller first-party `.js` modules (everything except `index.html`, `styles.css`, and `medical-knowledge-db.js`) — they're small enough (under ~11k lines, most under 3.5k) for normal symbolic navigation.
5. On this Windows workspace, prefer `npm.cmd run <script>` if plain `npm run <script>` is blocked.
6. **Do not run full test suites** (`npm test` or `npm run test:clinical`) unless explicitly requested. They execute heavy, verbose browser-based Playwright/UI tests that dump thousands of lines of logs, consuming massive tokens. Always run targeted unit tests (e.g., `npm run test:deid` or `node tests/test-labs.js`).
7. **Do not read entire test files** sequentially. If you need to check assertions, use `grep` or read specific line ranges.
8. **Minimize command output**: If a test script is noisy, run it with silent/summary flags or filter the output to show only errors/failures.

## Do Not Grow The Monoliths Further

`index.html` (~20.6k lines) and `styles.css` (~14.3k lines) got this large because past sessions pasted new code wherever was convenient instead of creating new modules. Do not repeat that pattern:

1. **New feature logic goes in a new `.js` module**, imported by `index.html`'s `<script type="module">`, not pasted into the inline script. The inline script should only gain the few lines needed to call into the new module. Same idea for CSS: prefer a scoped block or, for anything nontrivial, consider whether it belongs in a new stylesheet rather than appended to `styles.css`.
2. **Before editing `index.html` or `styles.css`, check size first** (`wc -l index.html styles.css` or PowerShell equivalent) and mention the before/after line count if the change is nontrivial (more than ~50 lines). If a change would add more than ~150 lines to either file, stop and propose extracting it into a new module instead of asking forgiveness after the fact.
3. **Keep new code contiguous by feature.** Never scatter a feature's functions across the file just because there was space nearby — either put them in a new module or in one clearly-bounded region, and say where.
4. **No sprawling single-session pastes.** If a task looks like it needs a large new chunk of code (a new panel, a new workflow, a big generated dataset), default to a new file and a plan, not a single giant diff appended to an existing monolith. Ask the user before writing anything past a few hundred lines if it wasn't explicitly scoped.
5. After any `index.html`/`styles.css` edit, regenerate the symbol/CSS maps (`npm run build:index-html-symbol-map`, `npm run build:index-html-css-map`) so the maps don't silently drift stale.

If you're the user reading this: the most reliable way to stop a session from doing this is to say up front "put this in a new module, don't append to index.html/styles.css" for any new feature, and to ask for a line-count diff before accepting a large change.

## Coding Style: Prefer Pure Functions

Write new logic as pure functions wherever the task allows, and favor a functional style over imperative/stateful code:

1. **Prefer pure functions**: given the same inputs, always return the same output, with no side effects (no mutating arguments, no reading/writing shared/global/module state, no DOM access, no network calls). Push side effects (DOM updates, `state` mutation, network/storage I/O) to thin call sites at the edges, and keep the actual logic (parsing, formatting, validation, ranking, transforms) pure and testable in isolation.
2. **Favor composition over mutation**: build results with `map`/`filter`/`reduce`/spread and return new objects/arrays rather than mutating inputs in place or accumulating into shared variables.
3. **New pure helpers belong in the relevant `.js` module, not the inline script.** This aligns with "Do Not Grow The Monoliths Further" below — pure logic is exactly what's easiest to extract and unit-test, so there's rarely a reason to leave it inline. `src/codecs/phone-transfer-codec.js` and `src/codecs/qr-codec.js` are examples of this pattern already applied (pure codec/crypto helpers extracted; only stateful orchestration stays inline in `index.html`).
4. **It's fine to stay impure at the edges.** Code that inherently needs to touch `state`, the DOM, `localStorage`, or the network (event handlers, render functions, RPC calls) doesn't need to be forced into a pure shape — just keep such code thin and delegate real logic to pure helpers it calls.

## Do Not Re-Read

| Path | Why | Check this instead |
|---|---|---|
| `medical-knowledge-db.js` | Generated bundle, ~60k lines / ~3.3 MB | Source JSON in `medical-knowledge/`; rebuild with `npm run build:medical-knowledge` |
| `index.html` (whole file, sequentially) | ~20.6k lines: ~1.6k lines DOM, ~19k lines inline JS. CSS was extracted to `styles.css` (~14.3k lines) — see below | `docs/index-html-js-symbol-map.md`, `docs/index-html-css-region-map.md`, or the line ranges in "index.html Structure" below |
| `styles.css` (whole file, sequentially) | ~14.3k lines, extracted from `index.html`'s former inline `<style>` block | `docs/index-html-css-region-map.md` for a selector-prefix table of contents |
| `reports/*.json`, `reports/clinical-workup-audit-*.md` | Generated audit output, large | `reports/README.md` or the `*-latest.md` file for the relevant report |
| `scripts/install-endocrine-workups.js`, `scripts/generate-endocrine-workups.js` | Large generators | Their `--check`/report output, or a symbol overview instead of a full read |
| `node_modules/`, `python-deid/venv/`, `models/`, `vendor/` | Dependencies, local model files, vendored browser bundles | Not app source; `scripts/check-syntax.js` verifies vendor scripts are actually wired up |

## index.html Structure

As of the CSS extraction, `index.html` has two physical parts. Line numbers drift as the file is edited — regenerate the maps (below) rather than trusting a stale number.

1. **DOM body**: from `<body>` through the vendor `<script src="...">` tags, currently around lines 15-1634 (~1.6k lines). This is plain markup; grep for the element `id` you care about (`data-view="..."` attributes mark the top-level app views: `vaultAccess`, `intake`, `workspace`, `workup`, `bedside`, `evidence`, `deid`, `handoff`, `studio`, `final`, `privacy`).
2. **Inline module script**: `<script type="module">` currently at lines 1635-20599 (~19k lines — this is almost the entire app's client-side logic: Workup Studio, de-id UI wiring, vault, QR/phone handoff, layout, etc., all in one script, not organized into sub-sections; the standalone evidence-retrieval engine was removed, see "Removed subsystem" below). Symbol lookup: `docs/index-html-js-symbol-map.md` (874 entries as of the last regen, name → line → heuristic feature tag).

CSS lives in `styles.css` (a standalone stylesheet loaded via `<link rel="stylesheet" href="./styles.css">` in `<head>`), not inline in `index.html`. Table of contents: `docs/index-html-css-region-map.md`. CSS is written in mostly feature-contiguous runs, so a selector-prefix range is a reasonable place to jump to directly.

Regenerate either map after an edit:
- `npm run build:index-html-symbol-map`
- `npm run build:index-html-css-map`

**Important caveat**: functions belonging to the same feature are *not* generally contiguous in the inline script — the file grew by pasting new code wherever was convenient, not by feature section. A previous version of this file had a hand-copied "feature area → line span" table here; it went stale (line numbers pointed past the current end of file) and was **removed** rather than re-verified by guesswork. Do not grep `index.html` for a function name — grep `docs/index-html-js-symbol-map.md` instead, which has a per-function `Feature area` column generated by name-keyword matching (itself a heuristic hint, not verified — see the caveat at the top of `scripts/gen-index-html-symbol-map.js`). That per-function table is the only reliably current coordinate source; regenerate it (`npm run build:index-html-symbol-map`) after any `index.html` edit before trusting it.

## Module Dependency Map

First-party `.js` modules and what they import from each other (verified from source, not inferred):

```
index.html (browser entry, <script type="module">)
├── src/vault/deid.js                   → ./deid/model-config.js, ./deid/lexicons.js
├── src/clinical/complaint-cds.js       → ../../medical-knowledge-db.js, ./clinical-intents.js
├── src/clinical/checklist.js           → ./checklist-organ-system-schema.js, ../../prompts/checklist-generation.js (re-export only)
├── src/clinical/clinical-intents.js    → ../../medical-knowledge-db.js
├── src/clinical/continuity.js          → ./labs.js
├── open-evidence-workflows.js          → open-evidence-results.js, prompts/open-evidence/*.js
├── open-evidence-results.js            (no first-party imports)
├── src/workup/workup-authoring.js      (no first-party imports)
├── src/workup/workup-contribution.js   → ../vault/physical-exam-catalog.js; exports cleanString/stringArray used by prompts/chat-ai-workup-handoff.js
├── prompts/chat-ai-workup-handoff.js   → src/workup/workup-contribution.js (cleanString, slugifyContributionId, stringArray, WORKUP_CONTRIBUTION_SCHEMA)
├── src/vault/physical-exam-catalog.js  (no first-party imports; PHYSICAL_EXAM_REFERENCE_PATH/PHYSICAL_EXAM_EVIDENCE_OVERLAY_PATH are browser fetch() paths relative to index.html's page URL, not module-relative — unaffected by this file's own directory)
├── src/codecs/qr-codec.js              → vendor/zstd-wasm/index.web.js, vendor/qr-zstd-dictionary.js
├── src/codecs/phone-transfer-codec.js  → src/codecs/qr-codec.js (base64UrlDecodeBytes)
└── vendor/zstd-wasm/index.web.js, vendor/qr-zstd-dictionary.js

prompts/ (pure prompt-text builders — see "Prompt Files" section below)
├── open-evidence/shared.js                      (no first-party imports)
├── open-evidence/initial-rounds-report.js       → open-evidence/shared.js
├── open-evidence/full-rounds-report.js          → open-evidence/shared.js
├── open-evidence/final-rounds-update.js         → open-evidence/shared.js
├── open-evidence/medication-safety.js           → open-evidence/shared.js
├── open-evidence/teaching-explanation.js        → open-evidence/shared.js
├── open-evidence/discharge-checklist.js         → open-evidence/shared.js
├── open-evidence/attending-discharge-plan.js    → open-evidence/shared.js
├── chat-ai-workup-handoff.js   → ../src/workup/workup-contribution.js
└── checklist-generation.js     (no first-party imports; consumed by src/clinical/checklist.js re-export)
```

`evidence.js`, `embedding-recall.js`, and `workup-report.js` (the standalone evidence-retrieval engine, its embedding-recall consumer, and compact report formatting) were removed along with their tests and scripts (`scripts/evidence-eval.js`, `scripts/iterate-clinical-workups.js`, `tests/test-evidence*.js`, `tests/test-embedding-recall.js`, `tests/benchmark-embedding-models.js`) — evidence retrieval in the running app goes through `src/clinical/complaint-cds.js`/`src/clinical/checklist.js` only now. `src/clinical/labs.js` has no reverse dependents inside `index.html` directly; it's reached only through `src/clinical/continuity.js`.

## Prompt Files

Every LLM/OpenEvidence prompt template lives in its own file under `prompts/`, one prompt per file, so wording can be edited without touching orchestration logic. **If you need to edit what a prompt says to an LLM, find it here first — do not grep `index.html` for it.**

- `prompts/open-evidence/shared.js`: shared text fragments (`EVIDENCE_GUARDRAILS`, `NOTE_STANDARD_GUIDANCE`, `PLAIN_OPEN_EVIDENCE_OUTPUT`) and pure composition helpers (`block`, `taskBoundary`, `sourceContextBlock`, `findingsContextBlock`, `buildPatientPrompt`, `buildSameConversationPrompt`) shared by every OpenEvidence task prompt below.
- `prompts/open-evidence/initial-rounds-report.js`, `full-rounds-report.js`, `final-rounds-update.js`, `medication-safety.js`, `teaching-explanation.js`, `discharge-checklist.js`, `attending-discharge-plan.js`: one file per OpenEvidence task, each exporting a single `xPrompt(context)` function with the task's exact wording. `open-evidence-workflows.js` imports all seven and wires them into the `openEvidenceTasks` registry; it also owns context-compaction (`compactOpenEvidenceContext`, char-limit logic) since that's plumbing, not prompt wording.
- `prompts/chat-ai-workup-handoff.js`: `buildChatAiHandoffPrompt` — the ChatGPT/Claude handoff prompt for drafting/tailoring a workup contribution (schema example, privacy rules, output rules). Imports `cleanString`/`slugifyContributionId`/`stringArray`/`WORKUP_CONTRIBUTION_SCHEMA` from `src/workup/workup-contribution.js`. `index.html` and `tests/test-workup-contribution.js` import it directly from this file, not from `src/workup/workup-contribution.js`.
- `prompts/checklist-generation.js`: `checklistContract`, `checklistPrompt`, `newAdmissionChecklistPrompt`, `buildCleanupPrompt` — the local (non-OpenEvidence) bedside-checklist generation contract. **Not currently wired into `index.html`'s live UI** — still consumed by `scripts/build-qr-zstd-dictionary.js` and `tests/test-checklist.js`/`tests/test-continuity.js`. `src/clinical/checklist.js` re-exports these names for backward compatibility; import from `prompts/checklist-generation.js` directly in new code.

Prompt-building logic that stays *inline* in `index.html` (not extracted, because it's tightly coupled to `state`/DOM/catalog lookups rather than being a static or near-static template): `workupStudioOpenEvidencePrompt()` (~line 6147, Workup Studio section-patch prompt), `patientChecklistPatchPrompt()` (~line 10275, bedside checklist patch prompt). `src/clinical/clinical-intents.js`'s `buildValidatedClinicalIntentPromptBlock`/`buildClinicalIntentRetrievalContext` also stay in place — they're dynamic context-block formatters keyed to the intent schema, not swappable instruction text, and are only ~60 lines tightly coupled to that module's own private helpers.

## Project In One Screen

Privacy-first static browser app for inpatient pre-rounding. Pasted chart context becomes a de-identified rounds workspace, bedside checklist, OpenEvidence prompt handoffs, and guideline-backed clinical workups.

- Patient vault data stays encrypted/browser-local; raw chart text is not stored in the vault.
- Structured-only de-identification can run fully in the browser; an optional local Python path exists separately (see below).
- Supabase is only for Workup Studio authoring/review and public reviewed workup catalog hydration — never patient data. `index.html` imports `createClient` from `@supabase/supabase-js` via CDN ESM (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`) for Workup Studio auth (see `workupStudioSupabase` near line 1797); other catalog reads may still use direct REST `fetch` (CSP `connect-src` allows `*.supabase.co`) — check both when tracing Supabase behavior. The SDK is also used Node-side in `utils/supabase/node.js` and `scripts/`.
- Medical knowledge is reviewed JSON under `medical-knowledge/`, bundled into `medical-knowledge-db.js` by `npm run build:medical-knowledge`.

## High-Value Files

- `index.html`: static app UI DOM and all client-side workflow logic (inline module script). See "index.html Structure" above before opening it.
- `styles.css`: all app CSS, loaded via `<link>` from `index.html`. See `docs/index-html-css-region-map.md`.
- `src/vault/deid.js` (~2.7k lines): browser de-id pipeline. Key exports: `createDeidentifier`, `deidentifyTextStructuredOnly`. Regex/structured PHI detection, optional model entities, date generalization, identity aliases, residual PHI warnings, clinical false-positive guards. Moved into `src/vault/` (was root-level `deid.js`). Imports pure leaf constants from `src/vault/deid/model-config.js` and `src/vault/deid/lexicons.js` (split out — see below); re-exports `MODEL_PROFILES`/`OPENMED_MODEL_ID`/`DEFAULT_DTYPE`/etc. for `tests/benchmark-deid.js`. The remaining ~2.7k lines (false-positive guards, structured/model entity detection, temporal/date handling, name/alias identity graph, orchestration) were **not** split further — a call-graph analysis found a genuine 3-way cycle between the guard functions, structured-entity functions, and name/alias functions (e.g. `isProtectedClinicalEntityFalsePositive` calls `parsePersonName`, which calls guard functions, which are also called by structured-entity functions that call `pushPatternEntity`, which is called back by the name/alias functions). No acyclic 3-way module split exists along those lines; splitting further would require merging those three concerns into one module and only pulling out the (one-way-dependent) temporal logic, which was judged too risky to attempt unattended given this is medical PHI-redaction code — a subtle bug here could leak patient data. See `src/vault/deid/` below for what's already split and how it was verified.
- `src/vault/deid/model-config.js`: leaf module — `DEFAULT_PRIMARY_MODEL_ID`, `DEFAULT_FALLBACK_MODEL_ID`, `OPENMED_MODEL_ID`, `MULTILANG_PII_MODEL_ID`, `I2B2_CLINICALBERT_MODEL_ID`, `DEFAULT_DTYPE`, `MODEL_PROFILES`. No first-party imports. Extracted from `deid.js` lines 1-39.
- `src/vault/deid/lexicons.js`: leaf module — PHI label mapping (`phiLabelMap`) and every clinical-text lexicon `deid.js` uses (`nonNameClinicalWords`, `nonNameClinicalPhrases`, `commonFirstNames`, `clinicalAnchorWords`, `protectedClinicalAcronyms`, medication word lists, name-pattern regex sources, etc.). No first-party imports; all bindings are read-only `const`s built once at module init (no mutable shared state). Extracted from `deid.js` lines 41-686. Verified byte-for-byte identical to the original (diffed programmatically; only difference was 2 collapsed blank lines) before wiring in the import.
- `src/clinical/labs.js`: lab timeline parser — analyte aliases, value/unit/timestamp extraction, timeline events, prompt formatting. Moved into `src/clinical/` (was root-level `labs.js`).
- `src/clinical/checklist.js`: checklist prompt/parse/validate, local checklist construction from workups, bedside/exam item expansion, organ-system grouping, traceability audits. Moved into `src/clinical/` (was root-level `checklist.js`).
- `src/clinical/continuity.js`: continuity case/day model, carry-forward blocks, daily input normalization, smart update classification, continuity prompt builders. Moved into `src/clinical/` (was root-level `continuity.js`).
- `src/clinical/clinical-intents.js`: validated/staged clinical intent registry — resolves free text to intents, aliases/avoid/suppress rules, validated intent context. Moved into `src/clinical/` (was root-level `clinical-intents.js`).
- `src/clinical/complaint-cds.js`: complaint/workup selection — evaluates complaint modules, modifier add-ons, partitions history/safety/exam/tests/red flags, formats CDS reports. Moved into `src/clinical/` (was root-level `complaint-cds.js`).
- `open-evidence-workflows.js` / `open-evidence-results.js`: OpenEvidence task registry (wires prompt builders from `prompts/open-evidence/`, applies prompt char limits, same-conversation enforcement) and paste-back/result parsing for rounds, med safety, discharge readiness, blind spots, guideline exceptions, workup patches. See "Prompt Files" above for where the actual prompt wording lives.
- `src/workup/workup-authoring.js`: Workup Studio authoring data model — normalized snapshots, section patches, change sets, export rows, no-patient-data validation. Moved into `src/workup/` (was root-level `workup-authoring.js`).
- `src/workup/workup-contribution.js`: community contribution schema/validation, GitHub issue body builder. Imports `src/vault/physical-exam-catalog.js`. Exports `cleanString`/`stringArray`/`slugifyContributionId` used by `prompts/chat-ai-workup-handoff.js` for the chat-AI handoff prompt (moved there — see "Prompt Files"). Moved into `src/workup/` (was root-level `workup-contribution.js`).
- `src/vault/physical-exam-catalog.js`: loads the physical exam maneuver catalog for the browser app. Moved into `src/vault/` (was root-level `physical-exam-catalog.js`).
- `src/codecs/qr-codec.js`: QR/phone-handoff binary codec — base64url, BASE42/legacy-BASE45 QR-safe encodings, gzip, minimal CBOR encode/decode, zstd-dictionary compression (via `vendor/zstd-wasm/`). Extracted from `index.html`'s inline script; all consumers remain in `index.html`. Moved into `src/codecs/` (was root-level `qr-codec.js`).
- `src/codecs/phone-transfer-codec.js`: pure phone-handoff transfer-code/payload/mailbox helpers — `randomCode`, `encodePayload`/`decodePayload`, `normalizeTransferCode`, `assertMatchingBundleCode`, `phoneTransferCryptoKey`, `decryptEncryptedPhonePayloadTransferText` (PBKDF2 + AES-GCM), `phoneHandoffMailboxLinkFromText`, `importAesGcmMailboxKey`, `encryptPhoneHandoffMailboxPayload`/`decryptPhoneHandoffMailboxPayload`. Extracted from `index.html`; the stateful phone-handoff orchestration (`state`/`activePatient`-dependent functions like `currentPhonePayload`, `encryptedPhonePayloadTransferText`, mailbox RPC network calls) stays inline since it isn't pure. The compact QR checklist manifest/patch cluster (`expandCompactPhoneHandoffPayloadForQr` and neighbors, ~line 20500) is also NOT extracted — it's tightly coupled to checklist-catalog helpers (`checklistOptionsForItem`, `itemText`, `checklistKind`, `buildPhoneChecklistManifest`) used well beyond phone-handoff, so pulling it out needs a real catalog module boundary, not a mechanical cut. Moved into `src/codecs/` (was root-level `phone-transfer-codec.js`).
- `src/clinical/checklist-organ-system-schema.js`: organ-system grouping schema used by `src/clinical/checklist.js`. Moved into `src/clinical/` (was root-level `checklist-organ-system-schema.js`).
- Clinical-decision-tree node/graph helpers (`sanitizeClinicalPathwayNode`, `titleFromId`, `slugId`, `ensureUniqueTreeId`, `normalizeTreeChildren`, and neighbors) are currently **inline in `index.html`**, not in a separate module — an earlier session extracted them into a standalone `clinical-pathway-graph.js`, but that file does not exist in the current working tree or git history (never committed; likely lost when other uncommitted work was reconciled). Re-verify with `grep -n "function titleFromId" index.html` before assuming either state. `sanitizeClinicalPathwayGraph`/`parseClinicalPathwayGraph`/`feverSepsisFallbackGraph` (callers) read `state.selectedWorkupModuleId` and call `moduleById`/`moduleLabel`, themselves tied to module-scope catalog caches — a future extraction needs to also carve out the workup-catalog lookup layer, not just the pure node helpers, to stay safe.
- `src/clinical/clinical-intents.js`, `src/clinical/complaint-cds.js`, and `medical-knowledge/` are tightly coupled for clinical workup behavior — check them together. **`evidence.js` was removed** (see below) — evidence retrieval now goes through `src/clinical/complaint-cds.js`/`src/clinical/checklist.js` only.

### Removed subsystem: standalone evidence retrieval engine

`evidence.js`, `embedding-recall.js`, and `workup-report.js` — along with their tests (`tests/test-evidence.js`, `tests/test-evidence-eval.js`, `tests/test-evidence-adversarial.js`, `tests/test-embedding-recall.js`, `tests/benchmark-embedding-models.js`) and scripts (`scripts/evidence-eval.js`, `scripts/iterate-clinical-workups.js`, `scripts/hand-polish-clinical-pathway-trees.js`) — were deleted together in the current uncommitted working tree. `package.json`'s `test:clinical` chain no longer references `test:evidence-suite`/`test:embedding`, confirming this was a deliberate, consistent removal, not an accidental partial deletion. **`data/evidence/*.csv` still exists on disk but now has no code reader** — flag this to a human before deleting the data directory, since it may still be wanted for a future reimplementation.

## Generated And Source Data

- `medical-knowledge/`: source of truth. `manifest.json` (included files), `source-registry.json` (provenance), `complaint-modules/*.json` (reviewed modules; `complaint-modules/endocrine/*.json` is generated/installed with active `mvp` status), `schema/*.schema.json`, `templates/`.
- `medical-knowledge-db.js`: generated from the above — never hand-edit.
- `data/evidence/`: evidence CSVs, source registry rows, tag dictionary, catalog gaps, accepted additions, eval fixtures. **Orphaned** — its former reader (`evidence.js`) was removed; nothing in the current codebase reads this directory. Confirm with a human before deleting.
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
- The browser path in `src/vault/deid.js` is the default app path; the Python path is optional local tooling, not part of the shipped app.

## Script Catalog

- `scripts/apply-clinical-guard-vocabulary.js`: installs generated clinical guard words/phrases into `src/vault/deid.js`, writes `data/clinical-guard-export.js`. (Its `--install` mode source-code-inserts an import block into `deid.js` if not already present — the `DEID_FILE` path, the generated import's relative path to `data/clinical-guard-export.js`, and the insertion-point marker were all updated for the `src/vault/deid.js` + `src/vault/deid/lexicons.js` split — the marker is now `export function normalizePhiLabel(entityOrLabel) {` since `medicationClassOrStemPattern`, the old marker text, moved into `lexicons.js` and is now only an imported binding in `deid.js`, not a local declaration. Verified in isolation: spliced the generated import block into a scratch copy of the post-split `deid.js` and confirmed it still loads and its `../../data/clinical-guard-export.js` import resolves. `deid.js` does not currently have this import installed, so this is dormant/optional tooling, not a live dependency — rerun the isolation check above if you change `deid.js`'s import header shape again.)
- `scripts/build-clinical-guard-vocabulary.js`: builds clinical guard vocabulary from RxNorm/fallback medication lists and medical abbreviations/conditions.
- `scripts/build-medical-knowledge-db.js`: reads `medical-knowledge/`, validates modules/source registry, derives support items, writes `medical-knowledge-db.js`.
- `scripts/build-mesh-vocabulary.js`: downloads/parses MeSH vocabulary into clinical guard words/phrases.
- `scripts/build-physical-exam-evidence.js`: builds the physical exam evidence overlay CSV from the reference CSV and curated inference rules. (Overlay output is generated; `data/evidence/` inputs it might have used are orphaned — see "Removed subsystem" above. Verify this script's actual CSV inputs before assuming they still exist.)
- `scripts/build-qr-zstd-dictionary.js`: builds the QR zstd dictionary/metadata from representative workup payloads and medical knowledge sources.
- `scripts/check-qr-dictionary.js`: checks whether the QR dictionary is stale relative to workup library changes.
- `scripts/check-supabase-auth-readiness.js`: verifies public catalog readiness and, unless `--public-only`, deployment credentials/service-role readiness.
- `scripts/check-syntax.js`: syntax/import smoke check for core files, package script targets, CSP/module expectations, loaded vendor scripts.
- `scripts/deid-adversarial.js`, `scripts/deid-fixtures.js`: shared de-id fixtures/adversarial runner used by de-id tests/benchmarks.
- `scripts/deploy-supabase-workup-authoring.js`: one-command Supabase authoring deploy — pushes config/migrations, imports current workups, optionally grants reviewer, reruns readiness checks.
- `scripts/download-deid-models.js`: downloads local de-id model artifacts into `models/`.
- `scripts/export-medical-knowledge.js`: exports approved Supabase/local snapshot change sets back to `medical-knowledge/`, then runs build/test unless skipped.
- `scripts/generate-endocrine-workups.js` / `scripts/install-endocrine-workups.js`: generate then install the endocrine workup dataset into `medical-knowledge/complaint-modules/endocrine/`.
- `scripts/grant-workup-access.js`: grants reviewer/admin or delegated author access in Supabase for Workup Studio.
- `scripts/import-medical-knowledge.js`: seeds Supabase authoring tables from local JSON when a service-role key is present, otherwise writes a local dry-run snapshot.
- `scripts/gen-index-html-symbol-map.js` / `scripts/gen-index-html-css-region-map.js`: regenerate the two `docs/index-html-*-map.md` lookup tables used above — rerun after editing `index.html`'s inline script or `styles.css`.
- `scripts/README.md`: short command grouping reference.

## Focused Validation Recipes

- Changed `src/vault/deid.js`, clinical guard data, `python-deid/`, or model handling: `npm run test:syntax`, `npm run test:deid`, optionally `npm run benchmark:deid`.
- Changed `src/clinical/labs.js`: `npm run test:labs`, `npm run test:core`.
- Changed checklist construction/parsing: `npm run test:checklist`, `npm run test:clinical-intents`, `npm run test:complaint-cds`.
- Changed `src/clinical/clinical-intents.js` or `src/clinical/complaint-cds.js`: `npm run test:clinical-intents`, `npm run test:complaint-cds`.
- Changed `medical-knowledge/` JSON: `npm run build:medical-knowledge`, `npm run test:medical-knowledge`, then `npm run test:complaint-cds` and `npm run test:clinical-intents`.
- Changed endocrine generator/installed modules: `npm run refresh:endocrine-workups`, or at minimum `npm run build:medical-knowledge && npm run test:endocrine-knowledge`.
- Changed Workup Studio authoring code: `npm run test:workup-authoring`, `npm run test:workup-studio-auth`, `npm run test:workup-studio-ui`.
- Changed Supabase migrations/config/scripts: `npm run check:supabase-public`, `npm run test:supabase-config`, relevant catalog race/refresh/empty tests.
- Changed an OpenEvidence prompt file (`prompts/open-evidence/*.js`) or `open-evidence-workflows.js`/`open-evidence-results.js`: `npm run test:open-evidence`; also `npm run test:complaint-cds` if workup prompts changed.
- Changed `prompts/chat-ai-workup-handoff.js` or `src/workup/workup-contribution.js`: `node tests/test-workup-contribution.js` (no dedicated npm script yet).
- Changed `prompts/checklist-generation.js` or `src/clinical/checklist.js`: `npm run test:checklist`, `npm run test:continuity` (both consume the re-exported prompt constants).
- Changed `styles.css` or the inline JS in `index.html`: `npm run test:syntax`, `npm run test:clinical-ui`, `npm run test:desktop-ui` for layout/responsive work, and regenerate the affected map (`npm run build:index-html-symbol-map` / `npm run build:index-html-css-map`).
- Changed QR sharing/compression: `npm run test:qr-optimizer`, `npm run check:qr-dictionary`.
- `npm test` runs everything currently wired (`test:core && test:clinical`); use the targeted commands above during iteration and `npm test` before finishing. (`evidence.js`'s test suite was removed along with the module — see "Removed subsystem" above.)

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
- `tests/test-open-evidence-workflows.js`: OpenEvidence prompt registry/result handling — imports prompt builders indirectly via `open-evidence-workflows.js`, not from `prompts/` directly.
- `tests/test-workup-contribution.js`: workup contribution schema validation, GitHub issue body, and the chat-AI handoff prompt (imports `buildChatAiHandoffPrompt` from `../prompts/chat-ai-workup-handoff.js`). No dedicated `npm run` script — run with `node tests/test-workup-contribution.js`.
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
- De-id behavior: `src/vault/deid.js`, then `data/clinical-guard-*`, then `python-deid/` only for the optional Python path.
- Lab parsing: `src/clinical/labs.js`, `tests/fixtures/`, `tests/test-labs.js`.
- Checklist output: `src/clinical/checklist.js`, `src/clinical/complaint-cds.js`.
- Clinical intent matching: `src/clinical/clinical-intents.js`.
- Workup selection: `src/clinical/complaint-cds.js` and `medical-knowledge/complaint-modules/`.
- Medical knowledge source changes: `medical-knowledge/`, then rebuild the generated bundle.
- Workup authoring: `src/workup/workup-authoring.js`, `docs/supabase-workup-authoring.md`, Supabase scripts.
- Community workup contribution flow: `src/workup/workup-contribution.js` (schema/validation), `prompts/chat-ai-workup-handoff.js` (the handoff prompt itself).
- OpenEvidence prompt/result behavior: `prompts/open-evidence/*.js` (prompt wording), `open-evidence-workflows.js` (task registry/context compaction), `open-evidence-results.js` (paste-back parsing).
- Any LLM/AI prompt wording: `prompts/` — see "Prompt Files" above before grepping `index.html` or any other module.
- QR sharing/compression: `vendor/qr-zstd-dictionary.js`, `scripts/build-qr-zstd-dictionary.js`, QR tests.
- Physical exam maneuvers: `data/physical-exam/physical_exam_reference.csv` and `physical_exam_evidence_overlay.csv`.
- Presentation and note style conventions: `docs/presentation-note-standard.md`.

## Recommended Next Split

CSS has been extracted to `styles.css`. `index.html`'s ~20.6k-line inline JS module script is still the largest remaining monolith — the 800+ functions in it are not organized by feature and are not yet split into ES modules. Check `git log` for recent `index.html` extraction commits before assuming this file is still one big inline script; regenerate `docs/index-html-js-symbol-map.md` if it isn't. Within the currently-tracked first-party `.js` files, `src/vault/deid.js` (~3.4k lines), `src/clinical/complaint-cds.js` (~2.9k lines), and `src/clinical/checklist.js` (~2.6k lines) are the largest single files and have no symbol maps yet — if any becomes a frequent point of confusion, generate one following the same pattern as `scripts/gen-index-html-symbol-map.js`. See "Proposed Directory Reorganization" below for a repo-wide restructuring plan.

## Directory Reorganization (complete)

The repo root used to mix first-party `.js` modules of very different concerns (crypto/codecs, clinical logic, Supabase auth, UI catalogs) as flat siblings. This was restructured in independently-testable slices — one topic directory at a time, full test run after each, `AGENTS.md` updated before moving to the next slice — rather than one large unattended pass, since moving many interdependent modules at once has a large blast radius with no human available to catch a mid-flight mistake.

All planned slices are done:
- `prompts/` — every LLM/OpenEvidence prompt template, one file per prompt (see "Prompt Files" above).
- `src/codecs/` — `qr-codec.js`, `phone-transfer-codec.js`.
- `src/clinical/` — `checklist.js`, `checklist-organ-system-schema.js`, `clinical-intents.js`, `complaint-cds.js`, `continuity.js`, `labs.js`.
- `src/workup/` — `workup-authoring.js`, `workup-contribution.js`.
- `src/vault/` — `deid.js`, `physical-exam-catalog.js`.
- `index.html`, `styles.css`, `medical-knowledge-db.js` stay at root (entry point / generated bundle) — the current Module Dependency Map above reflects the final state.

Every slice was moved with `git mv` (history preserved), had every importer updated (`index.html`, tests, `scripts/*.js`, and any cross-imports between moved modules), and was verified with `test:syntax` plus the tests touching that module's feature area, plus a browser-driven test (`node tests/test-qr-zstd-dictionary.js`, which loads `index.html` in a real headless browser) to confirm actual module resolution, not just syntax-checking. Final full-suite result after all four slices: identical pass/fail set to the pre-reorg baseline — no new failures were introduced by any move.

**Lessons for future moves in this repo** (e.g. if `open-evidence-workflows.js`/`open-evidence-results.js` or `physical-exam-catalog.js`'s catalog-loading logic are split further):
1. Grep for the filename as a bare string literal too (e.g. `"complaint-cds.js"`), not just `import ... from "..."` — `tests/test-medical-knowledge-db.js` had a hidden `readFileSync("complaint-cds.js", ...)` that a pure `import`-statement grep missed, plus a regex checked against file *contents* (`/from\s+["']\.\/medical-knowledge-db\.js["']/`) that also needed updating once the target's own import path changed depth.
2. `scripts/check-syntax.js` hardcodes a `coreFiles` list and a couple of direct `readFileSync` calls — check it for every moved file.
3. Code-generation scripts that write into a moved file's source (e.g. `scripts/apply-clinical-guard-vocabulary.js`, which can insert an import block into `deid.js`) need both their target-file path constant and their generated-code import-path template updated.
4. A file's own string constants that look like paths (e.g. `physical-exam-catalog.js`'s `PHYSICAL_EXAM_REFERENCE_PATH`) may be browser `fetch()` URLs relative to the page (`index.html`), not Node/ESM import paths relative to the module — don't "fix" those; confirm which kind it is first.
5. Always confirm end-to-end with a browser-driven test, not just `test:syntax` — syntax checks don't catch a wrong relative import path that still parses as valid JS.
