# Structured redaction blind-run contract

Run with:

```powershell
node scripts/run-structured-redaction-corpus.js <corpus.json> <output-directory>
```

The input may be JSON containing either an array of cases or an object with a
`cases` array. It may also be a JavaScript module exporting
`makeStructuredDeidComplexCases(count)`, `cases`, or a default case array. Each
case requires a unique string `id` and a `text` string. Optional fields are
`tags`, `admissionDate`, `relativeDate`, and `options`. When `options` is
present it is passed as the third argument to `deidentifyTextStructuredOnly`;
otherwise `relativeDate` is converted to `{ relativeDate }`.

The runner rejects a corpus with fewer than 100 cases, a case shorter than
10,000 JavaScript characters, duplicate IDs, or invalid dates. It deletes and
recreates only the explicitly supplied output directory.

`manifest.json` records corpus-level counts, hashes, requirements, and the
relative filename for each case. Each numbered case file contains:

- the original text, character/byte lengths, and SHA-256 hash;
- the exact structured-only invocation arguments;
- the returned redacted text, entities, entity counts, flags, residual
  warnings, model status, and redaction total;
- redacted text character/byte lengths and SHA-256 hash.

The runner does not read ground-truth annotations, score results, or decide
whether a redaction is correct. Those decisions belong to the independent
grader.
