# Compact workspaces: design and measured verification

Date: 2026-10-12. Baseline: `e842e65e1b65817ccb9fe9b824176b756bad674f`.

The ImageGen reference is [design-reference.png](design-reference.png). The implementation follows its horizontal navigation, fixed source pane, persistent section index, full-width writer, note outline, and compact differential rows. The real app retains its existing actions, data model and privacy language; illustrative controls or clinical claims invented by the image were not added.

Actual desktop views: [writer](after-1440-writer.png), [Epic import](after-1440-import.png). [Phone writer](after-390-writer.png). Before views and both viewport measurements are stored alongside these files.

## Measurement method

`npm.cmd run test:compact-metrics` runs a real Chromium browser with a synthetic admission draft containing six problems and four differentials each. `UX_WIDTH=1280` selects 1280x800; the default is 1440x900. The importer uses the synthetic `hp-01.md` fixture.

Counts are exact for these scripted workflows, not a human usability study. Setup, viewport changes, initial scroll reset, and moving the pointer to (0,0) before each task are excluded. Each task starts at the top except returning to the one-liner, which starts where the disposition edit ended. Editing is verified against the resulting field value.

Measurements use explicit mouse moves, clicks and wheel calls, not Playwright's automatic click-to-scroll. A pointer move is one repositioning to a different coordinate; mouse movement during a wheel gesture is not synthesized. Pointer distance is the sum of straight-line distances between those coordinates, rounded to CSS pixels. Wheel calls are capped at 600 pixels each. `wheelDeltaPx` in JSON is the requested cumulative wheel delta, not a measurement of actual scroll displacement. Keyboard entry (including End/Enter for the native section menu) is excluded from mouse counts.

The before writer used wheel navigation. The after writer uses the new outline plus a click in the target field. Import used the existing Go to section menu before and the new section index after. This reports the index's extra scroll honestly; the original menu remains available after the redesign. Native menus can also be operated entirely by keyboard.

## Exact action counts

Each entry is **clicks / pointer moves / wheel gestures**. Distance is before -> after in CSS pixels.

### 1440 x 900

| Action | Before | After | Pointer distance |
|---|---:|---:|---:|
| Edit fourth differential in sixth problem | 1 / 2 / 12 | 2 / 2 / 0 | 1894 -> 1587 |
| Edit disposition at end of note | 1 / 2 / 13 | 2 / 2 / 0 | 2272 -> 974 |
| Return to one-liner and edit | 1 / 2 / 12 | 2 / 2 / 0 | 2219 -> 472 |
| Open final preview | 1 / 1 / 0 | 1 / 1 / 0 | 490 -> 539 |
| Reach and edit Other note content in Epic import | 2 / 2 / 0 | 2 / 3 / 1 | 1926 -> 1297 |

### 1280 x 800

| Action | Before | After | Pointer distance |
|---|---:|---:|---:|
| Edit fourth differential in sixth problem | 1 / 2 / 12 | 2 / 2 / 0 | 1679 -> 1480 |
| Edit disposition at end of note | 1 / 2 / 13 | 2 / 2 / 0 | 2006 -> 1009 |
| Return to one-liner and edit | 1 / 2 / 12 | 2 / 2 / 0 | 1949 -> 472 |
| Open final preview | 1 / 1 / 0 | 1 / 1 / 0 | 490 -> 539 |
| Reach and edit Other note content in Epic import | 2 / 2 / 0 | 2 / 3 / 1 | 1702 -> 1229 |

A single-line differential shrank from 162 to 58 pixels (64% less height). The six-problem editor shrank from 7,533 to 4,554 pixels (40% less content height), within a bounded scroll pane. Outline navigation removes the 12-13 wheel gestures required for the measured late-note fields, at the cost of one additional click. Multiline content grows naturally; these heights are fixture-specific.

## Feature coverage and validation boundary

- Full `npm.cmd run test:ci`: lint, pure modules, vault/state, de-identification, parser variants, prompt assembly, scores, clinical data, local-model contracts, AI/RAG lifecycle, guided tour, real browser vault/redaction/review journeys, mocked AI suggestions and citation inspection. Includes the new compact writer and smart-exam browser tests.
- `npm.cmd run test:epic-import`: fixed-height layout and all 21 admission / 16 progress destinations; real selection, handle drag, copy, heading transfer, keyboard/mobile, Undo, cancelled/external/stale drops; scroll retention; 60 varied notes; seven Structured-mode save journeys, encrypted reload/lock; three real bundled Stanford model saves and a fail-closed model-error journey.
- Guided writing step: permits editing and exports without the dim overlay, reveals compact-menu destinations, and does not steal focus or scroll from clinical-data search during its delayed spotlight update.
- New writer regression: live outline labels and problem order, every section target, opening collapsed Plan through a problem link, add/edit/reorder/remove differentials and problems, known/unknown etiology, Clinical data/Write/Preview tabs, download, and real editing at 1440, 1280, 1041, 768 and 390 widths with no horizontal page overflow.
- Smart exam: inserting templates, multiple findings, normal/abnormal exclusivity, custom findings, scroll stability, and clipboard output. The test now uses the HTTP app harness and the current editable exam markup, without entering an unrelated locked tour stage.
- Existing review browser journeys cover saved-source selection, trends and filtering, optional section visibility, linked-data refresh, preserving clinician edits, encrypted reload, patient switching, AI cancellation and suggestion decisions. Citation tests cover hover excerpts, click details, keyboard dismissal, source links and persisted references.

AI provider responses are mocked in browser regressions; this does not prove live provider availability or clinical correctness. The real Stanford test records a known model limitation: it redacts an isolated NKDA value. No real patient data or external paid AI calls are used. The suite covers the named workflows and existing regression contracts, not every possible browser/device/content combination.
