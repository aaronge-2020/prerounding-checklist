# AGENTS.md

Purpose: provide a compact, current map for future work on the local-first app.

## Non-Negotiable Product Boundaries

1. This is a static, server-free browser app. Do not add accounts, remote persistence, data synchronization, server APIs, analytics, or public catalog hydration.
2. Patient data stays in the encrypted browser-local vault. Raw chart text must not be persisted; store only de-identified text plus residual-warning metadata.
3. The app stores user-labeled admission and hospital-day packets. It does not parse clinical events or infer a timeline.
4. The app generates prompts; OpenEvidence writes clinical prose. Do not add a final rounds/update prompt.
5. Workups contain history questions and physical-exam items only. Building a checklist is always explicit.

## Start Here

1. Run `npm.cmd run test:ci` on Windows before considering the workspace healthy.
2. Start at `index.html`, then `src/ui/app.js`; do not read vendored runtimes, model binaries, or generated vocabulary unless a focused change requires them.
3. New behavior belongs in an ES module under `src/`. Keep pure parsing, validation, prompt assembly, workup conversion, and state normalization outside DOM/storage code.
4. Keep DOM, browser storage, crypto, clipboard, file I/O, QR, workers, and fetch at the UI or persistence edge.

## Active Module Map

- `index.html`: app shell, restrictive CSP, navigation, confirmations, local QR vendor.
- `styles.css`: visual layout. Fixed-height route scrolling is intentional; preserve the scroll owners used by Hospital Stay and Checklist.
- `src/ui/app.js`: rendering and event wiring only.
- `src/app/state/`: vault records, migrations, AES-GCM local persistence.
- `src/patient-context/`: admission packet sections, advanced de-identification worker/client/service.
- `src/daily-updates/days.js`: hospital-day CRUD and trajectory source assembly.
- `src/workups/`: schema, bundled catalog, editable draft helpers, and checklist conversion.
- `src/checklist/`: answer state, normal/negative fill behavior, and phone transfer bundles.
- `src/prompts/`: OpenEvidence task registry, template variables, and required-guideline enforcement.
- `src/vault/deid.js` and `src/vault/deid/`: structured redaction rules and model integration.
- `data/clinical-guard-export.js`: generated clinical vocabulary imported by structured de-identification.

## De-Identification

- The structured redactor is always available.
- Browser model work runs in a worker so loading cannot block the UI.
- The tracked baseline ONNX assets under `models/onnx-community/` and `models/rtrigoso/` are Git LFS content and are included in the Pages artifact.
- Optional packs under `models/openai/`, `models/kalyan-ks/`, and `models/knowledgator/` are intentionally ignored. Install them only for a local self-hosted copy with `scripts/download-deid-models.js`; do not commit large binaries as normal Git objects.
- When the user selected a model that cannot load, fail closed. Do not silently fall back to structured output while claiming the selected model ran.

## Prompts And Data

- `Guidelines.md` is the source of truth for admission and daily-progress documentation instructions.
- Admission and daily-progress prompt builders must force-include its full text even if the editable template omits `@guidelines`.
- `@` smart variables map directly to saved admission fields and current hospital-day/checklist context.
- Preserve `schema: "prerounding_workup_v1"` for imported/exported workups.

## Tests

```powershell
npm.cmd run test:ci
```

- `test:state`: encrypted vault state and migrations.
- `test:deid`: structured de-identification regression coverage.
- `test:prompts`: prompt variables, guidelines, teaching, and medication tasks.
- `test:workups`: workup validation, conversion, negative-fill logic, and phone bundle round trip.
- `test:deid-model-options`: local model registry and asset-pack guardrails.
- `test:local-ui`: browser flow for vault, Hospital Stay, workups, desktop/phone checklist, prompts, and backend-free network behavior.

## Deployment

- `.github/workflows/ci.yml` runs the smoke suite on pushes and pull requests.
- `.github/workflows/deploy-pages.yml` deploys `main` to GitHub Pages and must publish every runtime file requested by the app: `Guidelines.md`, `assets/`, `data/`, `models/`, `src/`, and `vendor/`.
- Keep `actions/checkout` configured with `lfs: true` in Pages and CI while baseline model assets remain tracked through Git LFS.
