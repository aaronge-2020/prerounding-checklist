# Local Prerounding Workspace

Static, server-free browser workspace for inpatient pre-rounding. It keeps de-identified patient packets in an encrypted browser-local vault, organizes hospital-day updates, builds bedside checklists, and assembles copy-ready OpenEvidence prompts.

The app does not create accounts, synchronize data, host patient records, infer a clinical timeline, or author clinical notes.

## Workspace

- **Vault / Roster**: create or unlock the local vault; admit, select, archive, export, and restore patients.
- **Hospital Stay**: maintain the admission packet and labeled day-by-day updates in one place.
- **Workups**: create, edit, import, export, order, and explicitly convert local workups into a checklist.
- **Checklist**: answer grouped History and Physical Exam items on a laptop or phone; transfer answers with an encrypted local bundle.
- **OpenEvidence Prompts**: edit prompt text directly and insert labeled smart variables with `@`. Admission and daily-progress prompts always include `Guidelines.md`.
- **Quick De-ID**: process one-off text without saving it to a patient.

## Repository Map

- `index.html`: static shell, CSP, navigation, and dialogs.
- `styles.css`: app layout and component styles.
- `src/ui/`: DOM rendering, event wiring, and icons.
- `src/app/state/`: encrypted local vault persistence and state normalization.
- `src/patient-context/`: admission sections and browser-worker de-identification.
- `src/daily-updates/`: hospital-day records and trajectory assembly.
- `src/workups/`: catalog, editable schema, validation, and checklist conversion.
- `src/checklist/`: answers, grouped display helpers, and phone transfer bundles.
- `src/prompts/`: pure OpenEvidence prompt and template functions.
- `src/vault/deid/`: structured redaction rules and local model configuration.
- `data/clinical-guard-*`: generated vocabulary used by the structured redactor.
- `models/onnx-community/` and `models/rtrigoso/`: Git LFS baseline de-identification assets published with the static site.
- `models/openai/`, `models/kalyan-ks/`, and `models/knowledgator/`: optional local-only asset packs, intentionally ignored so large model binaries never enter ordinary Git history or the Pages artifact.

## Local Models

The browser never fetches models from a third party at runtime. The included baseline assets run locally in the browser. Larger optional model packs may be installed beside `index.html` for a self-hosted copy:

```powershell
node scripts/download-deid-models.js --model=openai/privacy-filter
```

Use the equivalent model identifier for the Ettin or GLiNER pack. When an optional pack is missing, the app fails closed and asks the user to select an available model or Structured only; it never silently presents fallback redaction as the selected model result.

## Validation

```powershell
npm.cmd run test:ci
```

Focused commands:

```powershell
npm.cmd run test:state
npm.cmd run test:deid
npm.cmd run test:prompts
npm.cmd run test:workups
npm.cmd run test:deid-model-options
npm.cmd run test:local-ui
```

## Deployment

Pushing `main` runs CI and deploys GitHub Pages. The deployment workflow publishes the static shell, `Guidelines.md`, `assets/`, `data/`, `models/`, `src/`, and `vendor/`. It checks out the tracked baseline model assets through Git LFS before building the Pages artifact.
