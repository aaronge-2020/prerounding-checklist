# Scripts

The maintained scripts support the static local-first app:

- `check-syntax.js`: syntax and local-only static guardrails used by `npm.cmd run test:syntax`.
- `deid-fixtures.js` and `deid-adversarial.js`: synthetic inputs used by `tests/test-deid.js`.
- `build-name-dictionary.js`: regenerates the structured de-identification name dictionary from local source inputs.
- `build-clinical-guard-vocabulary.js` and `apply-clinical-guard-vocabulary.js`: regenerate the clinical-term guard vocabulary imported by the app.
- `download-deid-models.js`: operator-only installer for optional local model packs. It is not part of CI or GitHub Pages deployment.

Run `npm.cmd run test:ci` after changing maintained source or scripts.
