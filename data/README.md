# Data Files

Reference data lives here so the repo root stays focused on the browser app modules.

## Folders

- `physical-exam/`: the physical exam maneuver catalog and generated overlay used by the legacy student exam reference flow.
- `evidence/`: legacy retrieval overlay data, source registry rows, tag dictionary rows, and evaluation fixtures. The standalone `evidence.js` retrieval engine and its test scripts were removed, so this folder is currently orphaned reference material.

## Maintenance

Keep these files PHI-free. After changing exam or evidence CSVs, run:

```bash
npm run test:syntax
npm run build:evidence
npm run test:clinical-intents
```

If physical-exam files move again, update the path constants in `src/vault/physical-exam-catalog.js`, `scripts/build-physical-exam-evidence.js`, `index.html`, and affected tests. Confirm with a maintainer before deleting `data/evidence/`; no current app code reads it, but it may be useful for a future retrieval reimplementation.
