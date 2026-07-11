# Local Prerounding Workspace

Static, server-free browser workspace for inpatient pre-rounding. It keeps de-identified patient packets in an encrypted browser-local vault, organizes hospital-day updates, builds bedside checklists, and assembles copy-ready OpenEvidence prompts.

The app does not create accounts, synchronize data, host patient records, infer a clinical timeline, or author clinical notes.

## Workspace

- **Vault / Roster**: create or unlock the local vault; admit, select, archive, export, and restore patients.
- **Hospital Stay**: maintain the admission packet and labeled day-by-day updates in one place.
- **Workups**: create, edit, import, export, order, and explicitly convert local workups into a checklist. A saved BYOK option can format a reviewed, de-identified OpenEvidence draft into workup JSON; manual ChatGPT formatting remains available as the fallback.
- **Checklist**: answer grouped History and Physical Exam items on a laptop or phone; transfer answers with an encrypted local bundle.
- **OpenEvidence Prompts**: edit prompt text directly and insert labeled smart variables with `@`. Admission and daily-progress prompts always include `Guidelines.md`.
- **Quick De-ID**: process one-off text without saving it to a patient.
- **Settings**: select a medical-service focus, presentation detail, and attending preferences for OpenEvidence prompts; optionally save an OpenAI API key inside the encrypted local vault for explicit workup-formatting requests.

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

Stanford clinical de-identification is bundled with the public static build. The Quick De-ID model library can also enable larger models without sending chart text anywhere:

1. In Quick De-ID, select **Download and install** for the target model.
2. The app downloads the model weights from a revision-pinned publisher URL into the browser's local storage. It never sends patient text with that request.
3. The app runs a synthetic local-worker self-test before marking the model ready. All later inference reads the local browser copy.

OpenAI Privacy Filter and Ettin use the browser's private filesystem so large weights can resume after an interrupted download. GLiNER uses same-origin Cache Storage because its tokenizer adapter requires a local URL. The model library shows progress, supports cancellation/resume where supported, and requests persistent storage to reduce browser eviction. Imported model files never enter the encrypted patient vault.

Optional network operations are the user-initiated model-weight download from the pinned source shown on the model card and the explicitly confirmed BYOK workup-formatting request to OpenAI's API. The BYOK key is kept inside the AES-GCM encrypted browser vault and is never displayed after it is saved; the user must confirm that the pasted draft is de-identified before each request. The model runtime and all de-identification requests remain local. **Import folder** remains available for offline, managed-device, or browser-compatibility workflows. For a self-hosted copy, the helper can download supported source files into a local folder:

```powershell
node scripts/download-deid-models.js --model=openai/privacy-filter
```

Use the equivalent model identifier for an offline folder workflow, then import the folder in the app. The automatic Ettin download uses a pinned browser-ready ONNX export; OpenAI Privacy Filter requires a browser with WebGPU. When an optional pack is missing or fails self-test, the app fails closed and asks the user to select an available model or Structured only; it never silently presents fallback redaction as the selected model result.

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
npm.cmd run test:openai-workup
npm.cmd run test:deid-model-options
npm.cmd run test:local-ui
```

## Deployment

Pushing `main` runs CI and deploys GitHub Pages. The deployment workflow publishes the static shell, `Guidelines.md`, `assets/`, `data/`, `models/`, `src/`, and `vendor/`. It checks out the tracked baseline model assets through Git LFS before building the Pages artifact.
