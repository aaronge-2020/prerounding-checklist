# Preround UI concept and recovery-flow QA

Date: 2026-07-11  
Source truth: `docs/design/preround-ui-concept-board.png`  
Implementation handoff: `docs/design/preround-ui-concept-implementation.md`  
Latest implementation capture: `C:\Users\AARONG~1\AppData\Local\Temp\preround-final-hospital.png`

## Comparison and intentional deviations

The source board and the latest populated Hospital Stay capture were reviewed together. The implementation retains the board's white/off-white canvas, navy primary actions, teal local-assurance signals, slim dividers, compact typography, and explicit workflow hierarchy.

The two intentional usability improvements requested after the concept review are accepted deviations:

- The desktop navigation is icon-first at rest (64 px) and expands to the labeled 178 px rail on hover or keyboard focus. At 390 px it becomes a labeled horizontal route strip so the navigation remains discoverable.
- Each empty or transitional route now exposes a concise “Next step” message; the Hospital Stay view directs the user to add a hospital day before building a workup.

## Visual and interaction coverage

| Surface | Evidence | State reviewed | Result |
| --- | --- | --- | --- |
| Desktop shell and Hospital Stay | 1440 x 900 capture | Icon-only rail, explicit next step, admission fields, de-identification status, sticky save action | Pass |
| Desktop navigation expansion | 1440 x 900 browser check | 64 px/hidden labels at rest; 178 px/labeled after hover | Pass |
| Mobile shell | 390 x 844 browser check | Horizontal labeled navigation, next-step guidance, no document horizontal overflow | Pass |
| Vault recovery | In-app browser interaction | Locked vault, irreversible explanation, disabled confirmation until `DELETE`, removal returns to create-vault state | Pass |
| Workup ordering | Browser workflow test | Pointer drag reorder persists with an accessible arrow-control alternative | Pass |
| Privacy and De-ID boundary | Browser workflow and source review | Local-only cue, explicit model status, residual-warning review affordances | Pass |

## Findings and resolutions

| Severity | Finding | Resolution |
| --- | --- | --- |
| P1 | A forgotten passphrase previously stranded the encrypted local vault. | Added a locked-state recovery path that removes only the encrypted vault record after an explicit `DELETE` confirmation and clears in-memory content before returning to setup. |
| P1 | Native HTML drag events were not reliable in browser automation. | Added a pointer-drag reorder fallback while retaining drag semantics and arrow-button controls; the full workflow test now passes. |
| P1 | The full-width navigation consumed workspace and did not make workflow progression obvious. | Implemented the collapsed, hover/focus-expand desktop rail plus context-specific next-step guidance across the workflow. |
| P2 | The concept's persistent labels conflict with the requested compact navigation. | Accepted the icon-first default as the more usable desktop implementation; titles and ARIA labels retain route discoverability. |

## Final checks

- Latest 1440 x 900 implementation capture has no clipped desktop content or unintended horizontal page overflow.
- Mobile 390 x 844 check: side navigation = 390 px, route labels visible, `overflow = false`, next-step guidance present.
- Desktop hover check: grid changes from `64 px` / hidden labels to `178 px` / visible labels.
- Fresh `127.0.0.1:4174` browser review has no console warnings or errors. A stale `localhost:4173` module-export error is excluded because that older server was not the reviewed build.
- `npm.cmd run test:ci` passed: lint (12 pre-existing warnings, 0 errors), syntax, state, De-ID, prompts, workups, model options, model packs, and browser workflow checks.

## Final result

passed
