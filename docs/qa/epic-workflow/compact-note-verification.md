# Compact Epic note review — 2026-10-12

The previous card layout clipped long text inside fixed-height inputs and required scrolling to reach destinations. Review now uses content-sized editable sections, a sticky section index, and collapsed empty optional fields. Populated optional sections remain visible. The original is available in a read-only disclosure during the active import session.

Manual browser checks used the actual local app and synthetic notes at 1280×900 and 390×844:

- Dragged a selected exam sentence from HPI to the section index; source range was removed and existing exam text preserved.
- Undo restored both fields; keyboard Enter and phone-width destination taps performed the same move.
- Selected text in the original was copied; the original remained unchanged.
- A 40-line HPI expanded to its full 936-pixel content height without internal scrolling. Shortening the field reduced its height.
- Section index navigation focused the destination; optional Family history opened and accepted edits.
- Phone-width review had document width and scroll width of 390 pixels, with fully visible field contents.
- Save & write note loaded and verified Stanford, saved successfully, and opened the existing writing workspace. Existing objective sources remained present.
- Reopening import showed the saved Family history as a populated section and no raw-original element.

Screenshots: `compact-note-desktop.jpg`, `compact-note-mobile.jpg`.

Targeted UI, exact-range mapping, syntax, and module-boundary checks passed. Changed modules have no lint errors (four preexisting presentation warnings). CI covers the new content-height and section-index interaction regressions alongside existing vault, import, writing, and guided-demo checks.
