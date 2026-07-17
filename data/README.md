# Data Directory

Only the structured de-identification vocabulary remains in this directory.

- `clinical-guard-export.js`: browser-imported generated vocabulary.
- `clinical-guard-anchors.json`, `clinical-guard-phrases.json`, and `clinical-guard-words.json`: generator inputs.
- `clinical-guard-mesh-terms.json`: compact offline terminology generated from the official NLM MeSH XML descriptor release. Its metadata records the release URL and SHA-256.

The MeSH source is used courtesy of the U.S. National Library of Medicine. See the [NLM download terms and conditions](https://www.nlm.nih.gov/databases/download/terms_and_conditions.html).

When changing the vocabulary, run `npm.cmd run build:clinical-guard-full`. This downloads MeSH only during the maintainer build; the browser uses the committed generated bundle and makes no terminology network request. Then run `npm.cmd run test:deid`.
