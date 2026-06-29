# GitHub Workup Authoring

Workup Studio is local-first. It does not sync drafts to a hosted database.

## Contributor Flow

1. Open the app and go to Tools -> Workup Studio.
2. Select a workup and section.
3. Build or paste reviewed section JSON.
4. Save draft.
5. In GitHub proposals, add a contributor name or GitHub handle.
6. Use Open issue or Copy issue body.

The proposal includes reviewer checklist text and the `workup_change_set_v1` JSON. Do not include patient identifiers, chart text, screenshots, or raw licensed source text in the issue.

## Maintainer Flow

Save the reviewed change-set JSON from the issue or PR discussion, then apply it:

```bash
npm run export:medical-knowledge -- --change-set=downloads/workup-change-set.json
```

The export command writes the reviewed workup JSON envelopes, rebuilds `medical-knowledge-db.js`, and runs `npm run test:medical-knowledge` unless `--skip-build` or `--skip-tests` is passed.

For a dry run, write exported modules elsewhere:

```bash
npm run export:medical-knowledge -- --change-set=downloads/workup-change-set.json --out-dir=tmp/workup-export
```

Then open a PR with the JSON, generated bundle, and any relevant tests.
