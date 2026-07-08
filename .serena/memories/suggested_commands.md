# Suggested Commands
- Prefer `npm.cmd run <script>` on Windows if plain `npm run <script>` is blocked.
- Regenerate index JS symbol map after inline `index.html` script edits: `npm run build:index-html-symbol-map`.
- Regenerate CSS map after `styles.css` edits: `npm run build:index-html-css-map`.
- Syntax/import smoke check: `npm run test:syntax` or `node scripts/check-syntax.js`.
- Targeted common tests: `npm run test:deid`, `npm run test:labs`, `npm run test:checklist`, `npm run test:clinical-intents`, `npm run test:complaint-cds`, `npm run test:open-evidence`.
- Workup contribution prompt/schema test has no npm script: `node tests/test-workup-contribution.js`.
- Medical knowledge source changes: `npm run build:medical-knowledge`, then `npm run test:medical-knowledge`, `npm run test:complaint-cds`, `npm run test:clinical-intents`.
- Avoid `npm test` and `npm run test:clinical` unless explicitly requested; they run heavy verbose browser/UI tests.