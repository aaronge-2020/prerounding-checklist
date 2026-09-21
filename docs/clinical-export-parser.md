# Clinical export parser contract

The Hospital Stay source composer accepts broad chart blocks. Parsing is a local preprocessing step before de-identification, not a clinical interpretation step.

## Processing boundary

1. Decode clipboard transport artifacts such as CRLF line endings, numeric HTML entities, nonbreaking spaces, and literal tab entities.
2. Respect the selected source type. Primary notes, consult notes, examinations, bedside updates, and other narrative text remain opaque even if they contain result-like lines.
3. Recognize only supported standard-format medication, laboratory, and vital-sign exports from explicit headings or repeated structural evidence.
4. Split a combined Epic paste into independently editable Laboratory results, Medication activity, and Vital signs source sections when those structural boundaries are present.
5. Produce a session-only structured display model for clean tables and numeric trends, plus separate compact AI-ready text that remains editable before de-identification.
6. Preserve any unconsumed non-layout text in a labeled unparsed section.
7. Send every reviewed section through the selected local de-identification model, then add the resulting typed sources to the encrypted vault together.

Raw pasted text and the structured preview remain in active-tab memory only. They are cleared after save, packet switching, patient switching, or vault lock.

## Supported structures

- Epic results grouped by copied collection timestamp or an explicit results heading; labels containing colons and copied flag legends remain intact. Bare `Label: value` lines inside a note are not enough to trigger parsing.
- Epic MAR medication blocks with optional dose, frequency, route, start, end, instructions, and administration events. Section provenance such as `Completed Medications` and `Other Encounter` is retained.
- Epic vital-sign rows with repeated field labels and sparse clipboard columns. Multiple copied values are retained in source order, and visibly truncated values remain truncated and are labeled as such.
- Combined Epic pastes containing any two or all three of laboratory results, MAR, and vitals. Medication and vital-row structures may identify their own standard sections without headings; ambiguous result-like prose remains unparsed chart text.
- CPRS inpatient-order or medication-administration reports, CPRS laboratory and vital-sign tables, and generic tab- or pipe-delimited lab or medication tables.

## Safety invariants

- Missing lines produce missing fields, never inferred values.
- AI-ready text never exceeds the copied source length; when normalization would expand a short standard block, the source text remains the prompt representation while the clean display model is retained.
- Laboratory emphasis is derived only from an explicit copied abnormal flag or a numeric result compared with a supplied numeric reference range. The parser contains no clinical normal-range thresholds.
- Trend lines are shown only when the same named numeric observation has at least two supplied points.
- The parser does not infer a hospital day, reconcile timestamps, interpret medication status codes, or decide which encounter is current.
- Narrative assessment and plan text is not reorganized.
- A weak or ambiguous match stays plain text.
- A partially recognized export retains unparsed content instead of silently dropping it or auto-classifying the source.
- Committed fixtures are synthetic.

The public entry point is `parseClinicalExport()` in `src/patient-context/clinical-export-parser.js`. Epic-specific recognition is isolated in `src/patient-context/epic-clinical-export-parser.js`; parsers return the same result contract so the UI and de-identification boundary do not depend on a vendor-specific layout.
