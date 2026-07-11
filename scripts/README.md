# Scripts

The maintained scripts support the static local-first app:

- `check-syntax.js`: syntax and local-only static guardrails used by `npm.cmd run test:syntax`.
- `deid-fixtures.js` and `deid-adversarial.js`: synthetic inputs used by `tests/test-deid.js`.
- `build-name-dictionary.js`: regenerates the structured de-identification name dictionary from local source inputs.
- `build-clinical-guard-vocabulary.js` and `apply-clinical-guard-vocabulary.js`: regenerate the clinical-term guard vocabulary imported by the app.
- `download-deid-models.js`: optional offline/self-hosted downloader for local model source files. It is not part of CI or GitHub Pages deployment. The normal user workflow is Quick De-ID's **Download and install** control; use the script only when preparing a manual folder for an offline or managed-device deployment.

Run `npm.cmd run test:ci` after changing maintained source or scripts.
