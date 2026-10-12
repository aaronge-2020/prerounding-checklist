# Epic note arrangement — 2026-10-11

The import review uses the ImageGen v2 board's two-column hierarchy: selectable original on the left, directly editable section cards on the right, a compact packet bar, optional sections in a disclosure, and a persistent save bar. The board and exact prompt are in `design/ui-workflow-v2/`.

## Manual browser verification

Tested with synthetic notes using the actual browser UI on localhost, including physical pointer drags (not injected drag events).

- Highlighted “Lungs clear on examination.” in HPI and dragged it into Physical exam. Only that occurrence moved; existing exam text remained. Undo restored both fields.
- Highlighted a passage in the read-only original and dragged it into Physical exam. The selected range was copied exactly and the original stayed unchanged. Undo removed the copy.
- Selected a field passage and activated another section heading with Enter. Verified the same move and Undo.
- At 390 px width, selected exam text and tapped the HPI heading; verified transfer and Undo. Document width stayed 390 px with no horizontal overflow.
- Saved corrected sections through “Save & write note.” Bundled Stanford loaded and reached ready state; saving completed and opened the writing workspace. Returning to import showed the corrected exam. Existing clinician draft content, vitals, selected lab, and full CT result remained available.
- Opened the compact add-day control and created a synthetic hospital-day packet. Verified that the new packet opened without admission original text.
- Switched patients: original text and pending selection disappeared. Locked the vault: protected import and note content were removed from the DOM.

Screenshots: `drag-arrange-desktop.jpg`, `drag-arrange-mobile.jpg`. Desktop shows the implemented workflow after a correction; these are browser captures, not generated mockups.

## Regression checks

- Full non-browser unit suite passed. Lint: zero errors, 89 pre-existing warnings.
- Mapping tests cover exact repeated occurrences, destination preservation, immutable source values, stale source snapshots, and invalid ranges.
- Presentation contracts verify editable cards and absence of the destination dropdown and legacy move buttons.
- New browser regression uses an actual pointer gesture and covers original copy, keyboard/tap transfer, Undo, editing after a move, Escape, foreign drop rejection, source replacement, phone-width layout, and touch-scroll cancellation.
- Existing browser flows updated to expand the newly collapsed optional sections / add-day controls. Scroll assertions are retained, with a transition-settle barrier before measuring a subsequent action.
- CI browser checks cover import/vault, note writing and AI request review, primary-note pull, and the guided demo.

This verifies the exercised workflows; it is not a guarantee that every browser/device is free of defects. No new model binary, detector, or rule-learning behavior is included in this UI release.
