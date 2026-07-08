# Core
- Static privacy-first browser app for inpatient pre-rounding; entry UI is `index.html`, styling is `styles.css`, generated medical bundle is `medical-knowledge-db.js`.
- Do not read/grep monoliths wholesale: use `docs/index-html-js-symbol-map.md` for inline JS symbols and `docs/index-html-css-region-map.md` for CSS selector ranges.
- New app logic should go in focused ES modules under `src/` or `prompts/`; avoid growing `index.html`/`styles.css` except small integration/styling changes.
- Raw patient chart text/PHI must not be committed; use only synthetic/de-identified fixtures.
- Medical knowledge source of truth is `medical-knowledge/`; rebuild generated `medical-knowledge-db.js` instead of hand-editing it.
- Major domains: clinical logic in `src/clinical/`, vault/de-id in `src/vault/`, codecs in `src/codecs/`, workup authoring/contributions in `src/workup/`, prompt templates in `prompts/`.
- Supabase is only for Workup Studio authoring/review/public catalog; never patient data or service-role keys in browser UI.
- Read `mem:tech_stack` for runtime/build tools, `mem:conventions` for repo-specific coding rules, `mem:suggested_commands` for targeted commands, and `mem:task_completion` before finishing code changes.