# Task Completion
- Run the narrowest relevant validation from `mem:suggested_commands`; do not run full heavy suites unless explicitly asked.
- If `index.html` inline JS changed: run/regenerate `npm run build:index-html-symbol-map` and usually `npm run test:syntax`.
- If `styles.css` changed: run/regenerate `npm run build:index-html-css-map`; for layout work, consider targeted browser UI tests only when necessary.
- If clinical/de-id/medical-knowledge modules changed, run the feature-specific tests listed in `mem:suggested_commands`.
- If unable to run a relevant validation, state the reason and residual risk in the final response.
- Do not commit unless explicitly requested; before any requested commit inspect status, diff, and recent log.