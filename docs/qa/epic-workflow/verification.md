# Epic import and writing workflow — verification log

Synthetic data only. Local browser: http://127.0.0.1:8873/.

## Implemented

- Stable, labeled desktop navigation; three primary mobile routes and a tools disclosure.
- Original Epic note alongside section review. Move selected text or a complete section, restore a source selection, and undo a move without overwriting destination text.
- Review begins at the first populated clinical section. Saved corrections remain separate from the original paste.
- Preserve problem hierarchy in numbered A&P blocks, em-dash titles, and hash-numbered plans. Subordinate plan bullets no longer steal later problems into another section.
- Save & write de-identifies before encrypted persistence. Removed raw-save bypass. Patient/packet checks reject stale asynchronous saves.
- Editable parsed source preview is open before the save action. Explicit C/F temperature units and Epic SpO2 labels survive saved-source parsing.
- Sources / Write / Preview & copy workspace. Preview uses the exact plain-text export builder.
- Correction-derived rules remain in memory, require explicit approval, and clear on lock or patient switch. Legacy plaintext rule cache is discarded. No cross-session clinical-learning efficacy claim.
- Restored room/time detections that benchmark-specific suppressions removed; constrained provider candidates through the existing span-boundary normalization; retained the product's existing age policy instead of the experimental post-filter benchmark override.
- Fixed duplicate OpenRouter settings field and calculator binding defect (sex was attached to the CHA2DS2-VASc age field). Lab autofill requires an exact numeric value and a supported source unit; CURB65 remains manual.

## Manual browser checks

- Locked and reloaded vault exposes only unlock/restore/recovery; synthetic encrypted sources survive unlock.
- Stanford loads, self-tests, and runs actual local inference for physician notes, vitals, labs, and CT report.
- HPI sentence moved to exam; destination content retained; Undo restores both; whole-section move and Undo pass.
- Original-source selection appended to Other note content; unchanged original remains visible.
- Save & write opens writing workspace after model verification and encrypted save.
- HPI pull works. Preview and clipboard match exactly.
- Three lab rows parsed; edited creatinine 1.1 → 1.2 mg/dL saved and displayed as 1.2.
- Five vitals displayed; explicitly supplied 37 C becomes 37°C without a missing-unit prompt; SpO2 label is normalized.
- Labeled CT report, date, findings, and impression appear in diagnostic results.
- At 390 × 844, three primary routes remain visible; Tools & settings opens, Settings is reachable, and the menu closes on navigation. Preview/copy fits the viewport.

## Automated checks

52 non-browser test groups passed in the release sweep; subsequent targeted checks cover later changes. Includes 40 narrative-note fixtures, 250 synthetic de-identification cases, adaptation boundaries, encrypted state, request assembly, clinical calculators, and source parsers. Lint: zero errors (existing warnings remain).

GitHub browser CI and deployed-site smoke checks are pending at this checkpoint. This log is not a claim of exhaustive testing or clinical validation.

## Model limitations

Stanford is the interim default. Browser execution does not establish hash/parity equivalence to the evaluated Stanford artifact. No new model binaries were added. TIDE2 remains blocked on the permitted gated Stanford hosting. No unpublished benchmark scores should be attributed to this build. Rule adaptation needs noisy/incomplete reviewer testing and validation on Stanford/TIDE2 before quality claims.
