# Tech Stack
- Browser app: static HTML/CSS with inline `<script type="module">` entry in `index.html` plus first-party ES modules under `src/` and `prompts/`.
- JavaScript ESM, Node-based scripts/tests, npm package scripts.
- Supabase browser SDK is imported in `index.html` via CDN ESM for Workup Studio auth; Node-side Supabase helpers/scripts live under `utils/supabase/` and `scripts/`.
- Browser-driven UI tests use Playwright; many full UI suites are verbose/heavy.
- Optional local Python de-id path under `python-deid/`; browser de-id path in `src/vault/deid.js` is default shipped behavior.
- Generated/vendor-heavy paths to avoid scanning: `medical-knowledge-db.js`, `node_modules/`, `models/`, `vendor/`, `python-deid/venv/`, generated reports.