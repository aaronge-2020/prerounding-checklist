# Sample-note section pulls

Sample Notes imports presentations as explicitly typed `primary_note` captures. The draft writer previously read only the separate sectioned-note property, so imported presentations appeared absent when pulling sections.

`packetPrimaryNoteSource` now reads either representation. An existing sectioned note remains authoritative; otherwise, exactly one retained de-identified primary-note capture is parsed on read. No duplicate note, migration, raw source persistence, or fixture reload is needed. This also repairs cases already saved in the vault. Multiple primary captures require an explicit selection through the section editor, and captures with skipped de-identification remain blocked.

The parser recognizes the explicit ED Course and Medical Decision Making headings used by the bundled ED examples. Missing sections remain empty; it does not invent one-liners or convert historical findings into today's findings.

Validation uses synthetic data. `test:primary-note-source` checks all nine bundled presentations, source edits, packet isolation, ambiguous sources, privacy metadata, and encrypted persistence. Its browser test imports all nine through Add all, starts with previously saved empty drafts, pulls HPI, assessment and past medical history where present, and verifies drafts survive encrypted reload. The original reader reproduced the empty-HPI failure in the first imported case.

The encounter review panel is now labeled Visit checklist. Its explanation distinguishes chart reminders from copying sections into a draft. Add from chart asks for one action or fact, reminder headings ask a concrete question, and optional evidence and history are collapsed. Saved sources, exact quotation checks, packet-specific answers and encrypted storage are unchanged.
