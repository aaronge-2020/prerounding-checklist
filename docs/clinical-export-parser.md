# Clinical export parser contract

The Hospital Stay source composer accepts broad chart blocks. Parsing is a local preprocessing step before de-identification, not a clinical interpretation step.

## Processing boundary

1. Decode clipboard transport artifacts such as CRLF line endings, numeric HTML entities, nonbreaking spaces, and literal tab entities.
2. Recognize a supported export from repeated structural evidence rather than requiring every header or field.
3. Produce an editable, session-only structured preview.
4. Preserve any unconsumed non-layout text in a labeled unparsed section.
5. Send the reviewed structured text through the selected local de-identification model before encrypted-vault storage.

Raw pasted text and the structured preview remain in active-tab memory only. They are cleared after save, packet switching, patient switching, or vault lock.

## Supported structures

- Epic results grouped by copied collection timestamp. A missing timestamp is stated as not included; labels containing colons and copied flag legends remain intact.
- Epic MAR medication blocks with optional dose, frequency, route, start, end, instructions, and administration events. Section provenance such as `Completed Medications` and `Other Encounter` is retained.
- Epic vital-sign rows with repeated field labels and sparse clipboard columns. Multiple copied values are retained in source order, and visibly truncated values remain truncated and are labeled as such.
- CPRS inpatient-order or medication-administration reports, CPRS laboratory and vital-sign tables, and generic tab- or pipe-delimited lab or medication tables.

## Safety invariants

- Missing lines produce missing fields, never inferred values.
- The parser does not infer a hospital day, reconcile timestamps, interpret medication status codes, or decide which encounter is current.
- Narrative assessment and plan text is not reorganized.
- A weak or ambiguous match stays plain text.
- A partially recognized export retains unparsed content instead of silently dropping it or auto-classifying the source.
- Committed fixtures are synthetic.

The public entry point is `parseClinicalExport()` in `src/patient-context/clinical-export-parser.js`. Epic-specific recognition is isolated in `src/patient-context/epic-clinical-export-parser.js`; parsers return the same result contract so the UI and de-identification boundary do not depend on a vendor-specific layout.
