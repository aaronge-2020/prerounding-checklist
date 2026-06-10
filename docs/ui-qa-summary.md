# UI QA Summary

Keep durable UI guidance here. Raw screenshots, contact sheets, old rebuild snapshots, and scratch audit outputs are local artifacts and are intentionally ignored by Git.

## Current Status

- The active app shell is `index.html`; archived rebuild snapshots were removed from the maintained tree.
- The bedside checklist groups parsed rows by organ system through `checklist-organ-system-schema.js`.
- The local patient vault flow replaces the older census module and is covered by `test:vault-entry` and `test:vault-state`.
- Generated visual review files belong in `qa-screenshots/` or `reports/design-qa/`, both local-only.

## Focused Checks

```bash
npm run test:syntax
npm run test:checklist
npm run test:clinical-ui
npm run test:desktop-ui
```

Use these after UI workflow changes, then keep only short reviewer-facing conclusions in tracked docs.
