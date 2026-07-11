# Admission workups

This directory is the canonical source for 50 standalone, import-ready workups. Each `*.workup.json` file is an independent `prerounding_workup_v1` object and contains 10 organized history items plus 10 organized physical-exam items. The files contain no patient data, orders, tests, diagnoses, treatment plans, or remote dependencies.

Every item uses the strict system-ID contract in [docs/workup-system-contract.md](../../docs/workup-system-contract.md). The JSON stores IDs such as `cardiovascular`; the app renders the corresponding clinical label.

## Import

1. Unlock the local vault and open **Workup Studio**.
2. Choose **Import JSON file** and select one `*.workup.json` file.
3. Review or customize the imported checklist, save it as a local workup, then explicitly build a bedside checklist when appropriate.

The numbered filename matches the requested rank. `index.json` gives the full rank-to-file map.

## Portable libraries

The app also supports `prerounding_workup_library_v1`, a portable bundle format for transferring a named collection of workups between users. The generated [Admission Workups: Core 50](../libraries/admission-50-core.workup-library.json) bundle is for one-file transfer; it is assembled from these individual files and is **not** the authoring source.

In Workup Studio, use **Import library** to add every workup in a library to the encrypted local vault, or **Download local library** to share the local workups you have saved. Importing a library replaces only local workups with matching IDs; it does not send data anywhere or build a patient checklist automatically.

## Maintenance

Each individual JSON file is the canonical, editable source. `src/workups/library.js` contains the pure validation, parsing, creation, and merge functions for the portable bundle format. The build script only scans those modular files and writes distribution artifacts:

```powershell
node scripts/build-admission-workup-library.js
node tests/test-admission-workups.js
```

These are clinician-facing prompts to support structured bedside reassessment. They are not diagnostic criteria or treatment instructions and must be used with clinical judgment and local policy.
