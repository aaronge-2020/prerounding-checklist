# Evidence Prompt Workbench Design QA

final result: passed

Source visual truth path:
- `C:\Users\AARONG~1\AppData\Local\Temp\codex-clipboard-328ec3b3-5f2d-478b-8fbe-759b59dc1a87.png`

Implementation screenshot path:
- `C:\Users\Aaron Ge\Documents\GitHub\prerounding-checklist\artifacts\evidence-empty-state.png`

Viewport and state:
- 1680x940 desktop viewport.
- Demo DKA consult loaded through the normal no-save demo flow.
- Evidence tab selected with Final rounds update selected.
- Paste-back answer and imported phone answers are empty by default. This intentionally differs from the populated reference values because the user clarified that counts and pasted content must reflect actual app state, not mock screenshot data.

Required comparison points:
- App shell: left product brand, centered patient title, top actions, persistent vault sidebar, horizontal patient tabs, and bottom safety/status bar match the reference structure.
- Workbench layout: three-column prompt task list, selected prompt editor, and right paste-back rail match the target container model and spacing at desktop size.
- Prompt task list: search, copy/OpenEvidence buttons, selected Final rounds update state, Ready/Waiting chips, row dividers, and scroll behavior match the reference interaction pattern.
- Paste-back rail: empty state is honest by default; pasting valid `APP_PASTE_BACK_JSON` switches the preview to `Concise rounds report ready` and enables `Save rounds report`.
- Imported phone answers: hidden when no imported phone rows exist; real imported rows render as grouped, collapsible, editable answer summaries instead of a fabricated `24 answers` count.

Above-the-fold copy diff:
- Preserved source copy: `Pre-Rounding Checklist Builder`, `Local-first rounds workspace`, `Demo - DKA consult`, `Demo case`, `Open checklist`, `Discharge`, `Lock vault`, `Prompt workbench`, `Prompt tasks`, `Final rounds update`, `Paste-back answer`, `OpenEvidence answer`.
- Intentional runtime copy: the populated reference text in the paste-back textarea, ready card, and imported answer count is replaced by empty-state copy until real data exists.

Functional checks:
- Browser/IAB verification loaded `http://127.0.0.1:5187/index.html?view=evidence&codexDesignQa=1`.
- Empty-state audit reported: selected task `Final rounds update`, empty answer textarea, preview status `empty`, imported row count `0`, imported phone panel hidden.
- Paste-back audit: valid `open_evidence_rounds_pasteback_v1` JSON parsed, preview status changed to `ready`, and `Save rounds report` enabled.
- Save audit: clicking `Save rounds report` stored the concise rounds report to the current patient update and announced success.
- `npm.cmd run test:syntax` passed.
- `npm.cmd run test:open-evidence` passed.

Known non-evidence test issue:
- `npm.cmd run test:desktop-ui` currently fails in `testPhoneBundleRoundTrip` while waiting for the desktop-to-phone QR handoff payload/QR. This is outside the Evidence prompt workbench route changed here and occurs in a worktree with several pre-existing QR/handoff-related dirty files.

No P0/P1/P2 evidence-workbench issues remain.
