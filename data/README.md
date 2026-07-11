# Data Directory

Only the structured de-identification vocabulary remains in this directory.

- `clinical-guard-export.js`: browser-imported generated vocabulary.
- `clinical-guard-anchors.json`, `clinical-guard-phrases.json`, and `clinical-guard-words.json`: generator inputs.
- `clinical-guard-mesh-terms.json`: source terminology used by the generator.

When changing the vocabulary, update it through `scripts/build-clinical-guard-vocabulary.js` and `scripts/apply-clinical-guard-vocabulary.js`, then run `npm.cmd run test:deid`.
