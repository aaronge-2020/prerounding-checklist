# Data Files

Reference data lives here so the repo root stays focused on the browser app modules.

## Folders

- `physical-exam/`: the physical exam maneuver catalog and generated overlay used by the legacy student exam reference flow.
- `evidence/`: retrieval overlay data, source registry rows, tag dictionary rows, priority queue rows, and evaluation fixtures used by `evidence.js` and the evidence test scripts.

## Maintenance

Keep these files PHI-free. After changing exam or evidence CSVs, run:

```bash
npm run test:syntax
npm run test:evidence-suite
npm run test:clinical-intents
```

If a file moves again, update the path constants in `evidence.js`, `index.html`, `scripts/evidence-eval.js`, `scripts/iterate-clinical-workups.js`, and the affected tests.
