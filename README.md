# Preround

Static, server-free browser workspace for inpatient pre-rounding. It keeps de-identified patient packets in an encrypted browser-local vault, organizes hospital-day updates, offers read-only bedside reference sheets, and assembles copy-ready OpenEvidence prompts.

The app does not create accounts, synchronize data, host patient records, infer a clinical timeline, or author clinical notes.

## Workspace

- **Vault / Roster**: create or unlock the local vault; admit, select, archive, export, and restore patients.
- **Hospital Stay**: maintain the admission packet and labeled day-by-day updates in one place. Primary note, Vital signs, and Laboratory results are distinct required-review reminders; medications and consult notes are optional, and missing items never block the clinician from continuing. Standard-format Epic or CPRS vitals, labs, and medication exports receive clean local tables, source-derived abnormal flags, and compact AI-ready text before de-identification and encrypted save. Narrative notes stay opaque even when they quote results.
- **Cheat Sheets**: a read-only, phone-first bedside reference. Search 74 chief-complaint sheets for history questions and exam maneuvers, including how to perform them and why they matter. Fully offline; no patient data involved. Every sheet also opens a fillable worksheet: cards grouped by system, each item's own answer options as single-select chips plus an optional detail, with answers that stay in page memory only and copy out as a prose-style note. The Mental Status Examination sheet's worksheet is curated further, with one labeled field per worksheet bullet, descriptor chips with Mark normal presets, and an optional detail per field.
- **Prompts**: edit prompt text directly and insert labeled smart variables with `@`, including a named guideline-set variable (Settings) for general or OB/Gyn H&Ps and SOAP notes, progress notes, discharge instructions, or your own prompt.
- **Quick De-ID**: process one-off text without saving it to a patient.
- **Settings**: select a medical-service focus, presentation detail, and attending preferences for OpenEvidence prompts; optionally save an OpenAI API key inside the encrypted local vault for per-problem plans and ChatGPT chat.

**External AI privacy boundary:** Consult, remote chat (including tool follow-ups and history compression), and OpenRouter ranking require a final local model scan and explicit approval of the complete outgoing request. Instructions, typed questions, history, and tool-result text are included in this scan. The review scans automatically on opening and shows the current question first. Instructions, earlier conversation, and tool text stay available in expandable sections; sections with residual privacy warnings open automatically. The exact JSON is available under technical request details. Editing the request revokes approval and requires a new local scan. The user must review the exact payload and confirm that their institution permits the provider and configuration; the app cannot verify those arrangements or certify that no identifying information remains. Scan failures, cancellation, patient changes, vault lock, and offline mode block pending sends. Requests do not redirect. OpenAI requests set `store: false`, which is not a guarantee of zero provider retention.

AI Consult defaults to a patient-specific evidence workflow: (1) a reviewed, search-disabled request proposes a focused question from the selected clinical context; (2) the clinician edits, locally scans, and approves that question before a fresh web-enabled request receives it; (3) a separately reviewed, search-disabled request applies retrieved evidence to the approved patient context. The search question can include de-identified clinical details needed for applicability, but the search request never inherits chart text, custom instructions, or chat history. Search is required, and missing search results or source links stop the workflow rather than silently falling back to model knowledge. Final references are restricted to retrieved URLs and metadata; excerpts must occur in the retrieved summary and are labeled as summary excerpts, not verified full-text quotations. Recommendations still require clinician approval before entering the note. Uncheck **Find literature and apply it to this patient** for a consultation without retrieval.

AI Chat also offers a standalone focused evidence question. Consult includes only the selected problem by default; overall assessment, note context/results, and medications are explicit additions. Every external step uses the same final privacy review and is cancelled on patient/packet changes, vault lock, or offline mode. The search provider may reformulate the approved question internally; the app controls the content provided to that request, not the provider's internal query wording.

**Draft on device** in Write note includes model selection, hardware guidance, explicit download/load, progress, cancellation and a mandatory local self-test. The general local-AI catalog has six pinned models. Drafting excludes Qwen3.5 9B after failed baseline/GPU checks; its five choices include Qwen3.5 0.8B/2B/4B and the previous Qwen3 options. 4B is the preferred evaluated drafting model when it fits. Browser RAM hints are not VRAM; enter known dedicated or Apple unified memory for a more useful estimate. Qwen3.5 2B/4B/9B use a 16K context, with conservative additional memory reserves. The context meter shows an estimate before loading, then measures pasted source with the loaded model tokenizer and shows the bounded pass count, output reserve and headroom. Long notes are processed across all source sentences instead of rejecting the whole note or silently cutting the tail. The model selects exact source sentences and typed interview-question IDs; factual prose and question wording are assembled from those trusted inputs. Prior/copied text stays historical/unconfirmed; today's explicitly entered updates are separate and retained. Thinking tags and incomplete model output are rejected/removed before drafting. A locally de-identified preview requires clinician review before applying a section or copying a full draft. See [model review and actual evaluation boundaries](docs/local-model-review.md); runtime self-tests do not establish clinical accuracy. There is no cloud fallback.

Drafting uses one chart representation at a time, preserving imported sections and table context; the working draft is an explicit alternative rather than a duplicate appended source. One-liners organize baseline, relevant history and discrepancies without generic interview questions. Full prechart drafts add status blanks beside selected prior follow-up actions. See [the drafting refinement evaluation](docs/local-note-draft-refinement.md).

## Repository Map

- `index.html`: static shell, CSP, navigation, and dialogs.
- `styles.css`: app layout and component styles.
- `src/ui/`: DOM rendering, event wiring, and icons.
- `src/app/state/`: encrypted local vault persistence and state normalization.
- `src/patient-context/`: admission sections and browser-worker de-identification.
- `src/daily-updates/`: hospital-day records and trajectory assembly.
- `src/data/cheat-sheets.json`: the read-only bedside reference dataset (74 chief-complaint sheets).
- `src/ui/cheat-sheets/`: local search, read-only history/exam cards, and view wiring for the reference.
- `src/prompts/`: pure OpenEvidence prompt and template functions.
- `src/vault/deid/`: structured redaction rules and local model configuration.
- `docs/deidentification/`: evaluation record for the browser-local de-identification system (experiment map, dataset manifest, frozen split, scorers, and committed results).
- `data/clinical-guard-*`: generated vocabulary used by the structured redactor.
- `models/onnx-community/` and `models/rtrigoso/`: Git LFS baseline de-identification assets published with the static site.
- `models/openai/`, `models/kalyan-ks/`, and `models/knowledgator/`: optional local-only asset packs, intentionally ignored so large model binaries never enter ordinary Git history or the Pages artifact.

## Local Models

Stanford clinical de-identification is bundled with the public static build. The Quick De-ID model library can also enable larger models without sending chart text anywhere:

1. In Quick De-ID, select **Download and install** for the target model.
2. The app downloads the model weights from a revision-pinned publisher URL into the browser's local storage. It never sends patient text with that request.
3. The app runs a synthetic local-worker self-test before marking the model ready. All later inference reads the local browser copy.

OpenAI Privacy Filter and Ettin use the browser's private filesystem so large weights can resume after an interrupted download. GLiNER uses same-origin Cache Storage because its tokenizer adapter requires a local URL. The model library shows progress, supports cancellation/resume where supported, and requests persistent storage to reduce browser eviction. Imported model files never enter the encrypted patient vault.

Optional network operations are the user-initiated model-weight download from the pinned source shown on the model card and the explicitly confirmed OpenAI requests (per-problem plans, ChatGPT chat) using the saved key. The BYOK key is kept inside the AES-GCM encrypted browser vault and is never displayed after it is saved; the user must confirm that the pasted draft is de-identified before each request. The model runtime and all de-identification requests remain local. **Import folder** remains available for offline, managed-device, or browser-compatibility workflows. For a self-hosted copy, the helper can download supported source files into a local folder:

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
npm.cmd run test:cheat-sheets
npm.cmd run test:cheat-sheets-data
npm.cmd run test:deid-model-options
npm.cmd run test:local-ui
```

## Deployment

Pushing `main` runs CI and deploys GitHub Pages. The deployment workflow publishes the static shell, `assets/`, `data/`, `models/`, `prompts/`, `src/`, and `vendor/`. It checks out the tracked baseline model assets through Git LFS before building the Pages artifact.
