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
- HPI and physical-exam pulls work. Preview and clipboard match exactly.
- Three lab rows parsed; edited creatinine 1.1 → 1.2 mg/dL saved and displayed as 1.2. Later changing the source to 1.3 preserved a clinician-authored summary, flagged the changed source, and applied 1.3 only on explicit refresh.
- Five vitals displayed; explicitly supplied 37 C becomes 37°C without a missing-unit prompt; SpO2 label is normalized.
- Labeled CT report, date, findings, and impression appear in diagnostic results and the copied final note. Previously saved truncated selections refresh to the full report; edited interpretations remain preserved and flagged for review.
- Two numbered A&P problems remain separate, including a subordinate DVT-prophylaxis bullet before the second problem. Tested by actual Stanford save and writing workspace inspection.
- A second synthetic patient starts with no prior patient sources. Lock removes the protected patient interface.
- Settings contains one OpenRouter key input; console reports no errors during the manual flow.
- Completed the eight-step synthetic rule tutorial: three labeled corrections → proposed rule → explicit session approval → new matching example. This verifies controls and rule application, not clinical effectiveness.
- At 390 × 844, three primary routes remain visible; Tools & settings opens, Settings is reachable, and the menu closes on navigation. Preview/copy fits the viewport.

## Automated checks

52 non-browser test groups passed in the release sweep; subsequent targeted checks cover later changes. Includes 40 narrative-note fixtures, 250 synthetic de-identification cases, adaptation boundaries, encrypted state, request assembly, clinical calculators, and source parsers. Lint: zero errors (existing warnings remain).

The release checks run as independent CI jobs for unit/boundary checks, guided demo, primary-note pull, vault/import, and note writing. Current check results and deployment status are available on [PR #9](https://github.com/aaronge-2020/prerounding-checklist/pull/9). The release remains gated on these checks. This log is not a claim of exhaustive testing or clinical validation.

## Model limitations

Stanford is the interim default. Browser execution does not establish hash/parity equivalence to the evaluated Stanford artifact. No new model binaries were added. TIDE2 remains blocked on the permitted gated Stanford hosting. No unpublished benchmark scores should be attributed to this build. Rule adaptation needs noisy/incomplete reviewer testing and validation on Stanford/TIDE2 before quality claims.

## AI helper refinement — October 11 evening

- Real `gpt-6-luna` structured request succeeded from the app in the browser using only the synthetic cough fixture. Its documentation suggestion was approved and appeared in Preview & copy while the existing HPI, physical exam, laboratory values, and complete CT report remained intact.
- The first browser request encountered a connection failure; the note remained unchanged and retry succeeded. A separate direct API call using the same production request wrapper also returned a valid structured suggestion. No clinical efficacy claim is made from these smoke tests.
- The supplied key was used through a new one-request password field. It was not saved in the vault, source files, or screenshots. Escape/cancel removes the input, reopening it shows blank, and Send is disabled until a key is supplied.
- Fixed missing AI context: consults now use the reviewed HPI/exam and selected objective data from the same note renderer as Preview & copy, respecting edited lab summaries and excluding other plan problems/raw chart sources.
- Added request cancellation, a five-minute response deadline, refusal/incomplete-response errors, and patient/packet/session scoping that discards late results. Chat requests now explicitly set `store: false` as structured requests already did.
- Changed Consult to AI suggestions, collapsed advanced prompt settings, kept send/cancel actions visible, and moved review into a native modal layer. Manual desktop and 390×844 phone checks confirmed the sticky patient bar no longer overlays the dialog, keyboard focus stays in it, Escape closes it, and the document has no horizontal overflow.
- A live request was stopped from the mobile UI; the existing note and approved suggestion remained unchanged. Fixed doubled export bullets discovered during the live approval test.
- Targeted tests cover timeout through response-body reading, cancellation, refusal, incomplete/malformed replies, exact requests, selected-note context, edited summaries, exclusion of other problems, and export bullets. CI browser fixtures additionally cover approval/rejection, edits during a request, stop, and packet switching. Fixtures use a fake key; no paid calls or real credentials run in CI.
- Screenshots: `ai-consult-desktop.jpg`, `ai-consult-mobile.jpg`. Neither contains credentials.
