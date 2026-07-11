# AGENTS.md

Purpose: a compact, current map for future work on this local-first app.

## Non-Negotiable Product Boundaries

1. This is a static, server-free browser app. Do not add accounts, remote patient persistence, synchronization, server APIs, analytics, or public catalog hydration.
2. Patient data belongs only in the encrypted browser-local vault. Raw chart text and active-review originals are never persisted; retain only de-identified text and residual-warning metadata.
3. The locked vault is a fail-closed render boundary. Clear protected DOM and in-memory patient state, force the Vault view, and show only unlock, encrypted restore, or destructive-recovery controls. CSS alone is never a security boundary.
4. The app stores user-labeled admission and hospital-day packets. It does not infer a clinical timeline.
5. Workups contain history questions and physical-exam items only. Building a checklist is always explicit.
6. `prerounding_workup_v1.items[].system` is a controlled ID from `src/workups/systems.js`, never a display label, alias, or free-text category.
7. For a structural defect, redesign the state/data boundary rather than adding a compatibility patch, heuristic classifier, or silent fallback.

## Start Here

1. Run `npm.cmd run test:ci` on Windows before considering the workspace healthy.
2. Start at `index.html`, then `src/ui/app.js` for composition, followed by the relevant feature module under `src/ui/`. Do not inspect vendored runtimes or model binaries unless the change is specifically about them.
3. Put pure parsing, validation, prompt assembly, redaction-review normalization, workup conversion, and mirror planning in `src/` modules outside DOM/storage code.
4. Keep DOM, browser storage, crypto, clipboard, File System Access, QR, workers, and fetch at UI or persistence edges.
5. Before a workup-contract change, read `docs/workup-system-contract.md` and the applicable JSON under `workups/admission/`.

## Module Map

- `index.html`: shell, restrictive CSP, navigation, confirmation dialogs, QR vendor.
- `styles.css`: visual layout. `.view` owns route scroll; preserve the scroll owners used by Hospital Stay, Checklist, and the annotated redaction document.
- `src/ui/app.js`: composition, event-routing, and session-bound UI orchestration layer. It owns no persistence format or feature templates; move pure derivation and markup into the scoped modules below, and keep only browser/session interactions at this edge. Do not add new feature markup or browser-transfer behavior here.
  - `src/ui/checklist/presentation.js` is a pure checklist markup/view-model factory.
  - `src/ui/checklist/transfer.js` is the injected browser share/download adapter; it must remain independent of DOM and vault state.
  - `src/ui/redaction/presentation.js` is pure annotated-review and residual-warning markup. Active-tab review state remains in `src/patient-context/review.js`.
  - `src/ui/workups/presentation.js` is pure workup-catalog/editor markup. Workspace mirror, file import, autosave, and drag behavior stay at UI/persistence edges.
- `src/app/state/`: vault records, migrations, AES-GCM persistence, encrypted preferences, and the workspace-folder persistence edge.
  - `workspace-mirror.js` stores an explicitly granted workup-folder handle in IndexedDB and performs only authorized workup writes.
- `src/patient-context/`: section handling, worker/client/service model integration, model packs, and active-tab redaction reviews.
  - `review.js` holds originals and review choices only in memory for the current active tab.
  - `app.js` keeps per-section de-identified edit drafts in a session-only map so review re-renders cannot discard edits; clear those drafts with the review session.
- `src/daily-updates/days.js`: hospital-day CRUD and trajectory source assembly.
- `src/workups/`: pure workup schema, systems, editor conversion, portable libraries, checklist conversion, generated Core 50 runtime catalog, and workspace-mirror plan.
  - `admission-core.js` is generated; do not hand-edit it.
  - `workspace-mirror-plan.js` produces a pure, non-destructive workup-only JSON plan.
- `src/checklist/`: answer state, baseline fill behavior, and phone transfer bundles.
- `src/prompts/`: task registry, dynamic variables, templates, and task-specific guideline enforcement.
- `src/vault/deid.js` and `src/vault/deid/`: existing structured compatibility redactor and model integration support. Do not add new in-house detection heuristics.

## Workups And Workspace Mirroring

- The Core 50 authoring source is one JSON file per condition in `workups/admission/`; each remains independently importable as `prerounding_workup_v1`.
- Rebuild the portable transfer artifact with `node scripts/build-admission-workup-library.js`, then rebuild `src/workups/admission-core.js` with `node scripts/build-admission-workup-module.js`.
- The encrypted vault is canonical runtime state. New workups and valid editor changes auto-save there; a portable library import replaces only matching local IDs.
- A user may authorize a workspace folder. Only then mirror local workup overrides to `workups/local/` plus `prerounding-workups.local.json`.
- The mirror is one-way and non-destructive: never write patient data, request permission during an automatic save, delete workspace files, stage/commit, or touch Git configuration. Existing mirror files remain when an override is removed.
- The Core 50 is static app content, not public catalog hydration. It must be present without an import action.

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

## Workup Editor Interaction Rules

- The catalog rail and editor columns are independent scroll surfaces. Keep `workup-item-scroll` constrained to the editor row height and use `scrollbar-gutter: stable`; never let a long condition expand the entire page and hide the footer.
- Workup catalog rows must keep the checkbox and Edit action as separate controls; do not nest a button inside a label. Individual rows can be dragged across system groups, updating the controlled system ID and removing empty groups.
- Keep a visible `Build checklist` action in the editor header as well as the catalog selection area. Selecting workups is not enough; building the checklist must be explicit and must navigate to Checklist.
- The catalog rail uses the vendored Fuse.js 7 search index over workup title, aliases, and ID. Filtering must not re-render the editor or change selected workups; preserve focus while typing and keep clear/no-match states accessible. Keep the explicit `[hidden]` row rule because the catalog row has an author `display` rule that otherwise overrides the browser default.

## Prompts And Data

- `Guidelines-admission.md` is the source for initial admission/HPI prompts; `Guidelines-progress.md` is the source for daily progress notes. `Guidelines.md` is compatibility-only and must not be injected at runtime.
- Admission and daily-progress builders force-include only their task-specific standard, even if an editable template omits `@guidelines`.
- Prompt variables derive from saved admission fields and the chosen hospital-day sections. `@selected-day` defaults to the latest saved day. `@hospital-stay` is a backward-compatible alias only; do not present it as competing UI.
- Do not persist OpenEvidence output in the vault. Generate/copy only de-identified prompts.
- Preserve `schema: "prerounding_workup_v1"` for workups and `schema: "prerounding_workup_library_v1"` for portable libraries.

## Tests

```powershell
npm.cmd run test:ci
```

- `test:state`: encrypted vault state and migrations.
- `test:deid`: structured de-identification and review-dedup regression coverage.
- `test:prompts`: task-specific standards, dynamic fields, selected-day prompt scope, and task registry.
- `test:workups`: workup validation, checklist conversion, baseline fill, and phone round trip.
- `test:ui-features`: pure checklist, phone-transfer, redaction, and workup UI module contracts.
- `test:ui-boundaries`: `app.js` size ceiling plus pure-presentation module boundary guardrails.
- `test:workup-systems`: controlled-system contract and formatter prompt coverage.
- `test:workup-libraries`: all 50 individual workups and generated portable library.
- `test:workup-mirror`: pure mirror plan and File System Access write edge.
- `test:deid-model-options` and `test:model-packs`: supported model registry, pinned packs, and stale-import behavior.
- `test:local-ui`: locked-vault boundary, Hospital Stay, model readiness gates, workups, mobile checklist, prompts, redaction review, and backend-free network behavior.

## Deployment

- `.github/workflows/ci.yml` runs the smoke suite on pushes and pull requests.
- `.github/workflows/deploy-pages.yml` must publish every runtime file: `Guidelines.md`, `Guidelines-admission.md`, `Guidelines-progress.md`, `assets/`, `data/`, `models/`, `src/`, `vendor/`, and `workups/`.
- `service-worker.js` remains in the static artifact for imported Cache Storage packs.
- Keep `actions/checkout` configured with `lfs: true` while baseline assets are Git LFS content.
- Cache-sensitive direct imports (UI, worker, model registry, service, storage adapter) use aligned revision query strings. Bump the relevant graph together whenever its model-runtime contract changes.
