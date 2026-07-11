# Portable workup libraries

Each `*.workup-library.json` file is a self-contained `prerounding_workup_library_v1` bundle. A library has a stable ID, title, semantic version, description, and an array of independent `prerounding_workup_v1` workups.

Use a library for one-file local transfer between collaborators. Library import merges workups into the encrypted local vault and replaces only same-ID local workups; it never contains patient data, sends data to a server, or builds a checklist automatically.

`admission-50-core.workup-library.json` is generated from the individual canonical sources in `../admission/`. Rebuild it after editing a source workup:

```powershell
node scripts/build-admission-workup-library.js
node tests/test-admission-workups.js
```
