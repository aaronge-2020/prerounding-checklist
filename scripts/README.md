# Scripts

This folder contains build helpers, generators, benchmarks, audits, and tests.

## Common Commands

- `npm test`: run the main grouped regression suite.
- `npm run test:core`: syntax, de-identification, labs, checklist, vault state, and continuity checks.
- `npm run test:clinical`: clinical intents, medical knowledge, complaint CDS, OpenEvidence, endocrine knowledge, and embedding recall checks.
- `npm run test:evidence-suite`: evidence overlay, evaluation, and adversarial evidence checks.
- `npm run build`: rebuild the generated medical knowledge bundle.
- `npm run snapshot:workup-authoring`: write a local Workup Studio authoring snapshot for review.
- `npm run export:medical-knowledge -- --change-set=path/to/change-set.json`: apply reviewed GitHub proposal change-set JSON to the repo workup files.
- `npm run build:evidence`: rebuild the physical exam overlay from the physical exam reference CSV.
- `npm run refresh:endocrine-workups`: regenerate, install, build, and test endocrine workups.

## File Groups

- `test-*.js`: focused regression tests.
- `build-*.js`: generated artifact builders.
- `generate-*.js` and `install-*.js`: clinical knowledge expansion workflows.
- `benchmark-*.js`: local performance or retrieval benchmarks; outputs go to ignored `benchmark-results/`.
- `*-eval.js` and audit scripts: evaluation runners and reviewer-facing diagnostics.
