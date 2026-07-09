# Improvement Plan (autonomous execution tracker)

Started: 2026-07-08

This file is the single source of truth for a long-running, multi-session improvement
effort on this repo. Each work session (human or agent) MUST:
1. Read this file first to see what's done, in-progress, and next.
2. Pick up the next unblocked item in priority order (top to bottom within a section
   unless a dependency says otherwise).
3. Implement it fully (code + tests where applicable), run relevant targeted tests
   (NOT the full suite — see AGENTS.md rule 6), and commit with a clear message.
4. Update this file's checkbox and add a one-line note (date + what landed, or why
   skipped/blocked) before ending the session.
5. If genuinely blocked on a decision only the repo owner can make (e.g. a clinical
   safety feature needing sign-off, a destructive migration, a UX direction call),
   mark the item `BLOCKED` with a one-line reason and move to the next item instead
   of stopping the whole run.

Do not re-plan from scratch each session — trust this list and the checkboxes.
Do not batch unrelated items into one commit.

## Sequencing notes

- Items 1-2 (script split, state refactor) are the biggest and most invasive —
  land them behind small, verifiable increments (one feature module at a time),
  not as one giant rewrite commit. Run existing Playwright tests after each slice
  even though rule 6 says skip full suite by default — for these two items it's
  worth the cost since they touch the whole app; use judgment.
- Item 3 (lint/format) should land early since it makes every subsequent diff
  easier to review. Do it before deep-diving into 1-2, or in parallel on files
  not yet touched by the split.
- Items 15-16 (medication dose validation, lab reference ranges) are clinical
  decision-support features. Implement conservatively (flagging/warnings only,
  no auto-corrections or blocking actions), write tests, and mark them
  `BLOCKED — needs clinical sign-off before enabling by default` if there's any
  ambiguity about clinical correctness of a range/threshold. Do not guess at
  medical thresholds; use well-established, cited reference ranges only.
- Security items (9-14) are high value and low risk — good candidates for
  early wins alongside item 3.

## Status legend
`[ ]` not started · `[~]` in progress · `[x]` done · `BLOCKED` needs human input

---

## Architecture & Code Quality

- [ ] 1. Split `index.html`'s ~17,400-line inline script into ES modules
      (bedside checklist ~6000 lines, phone handoff ~3500 lines, Workup Studio UI
      ~4000 lines, OpenEvidence task UI ~1000 lines).
- [ ] 2. Refactor the state object (40+ mutable fields) into a reducer/pub-sub
      pattern; stop hand-maintaining `vaultPayload()`/`normalizeState()` lists.
- [ ] 3. Add ESLint + Prettier (or equivalent) config and fix the worst offenders
      (mixed tabs/spaces, silent `.catch(() => {})`).
- [ ] 4. Add `@ts-check` + JSDoc annotations to inline script and large modules
      (complaint-cds.js, deid.js, checklist.js).
- [ ] 5. Eliminate silent error swallowing (`_loadDeidModel()` ~L1740, vault save
      ~L3083, de-id ops ~L11145/11200/11236) — surface errors to UI/logging.
- [ ] 6. Fix stale docs: README.md (evidence.js, deid-worker.js, test:evidence-suite
      references), data/README.md, and add a staleness check for the generated
      symbol maps.
- [ ] 7. Add unit tests for functions extracted from index.html in item #1.
- [ ] 8. Add CI test runner (GitHub Actions) on push/PR, not just deploy checks.

## Security & PHI

- [ ] 9. Show residual PHI warnings from `scanResidualPhi` (deid.js:2472) to users;
      `applyDeidResult()` (index.html:11047) currently ignores them.
- [ ] 10. Add vault auto-lock after inactivity (e.g. 15 min) with re-prompt.
- [ ] 11. Add vault backup/export (encrypted JSON file) + confirmation dialog on
      `deleteVault()` (~L3644).
- [ ] 12. Wire `flushVaultSave()` to `pagehide`/`beforeunload` so pending encrypted
      writes aren't lost on tab close.
- [ ] 13. Strengthen CSP: reduce `unsafe-inline` exposure where possible, consider
      `require-trusted-types-for 'script'`, tighten `connect-src` allowlist, add
      `report-uri`/reporting endpoint.
- [ ] 14. Wire up `scripts/apply-clinical-guard-vocabulary.js` into the deid.js
      build/import path (currently dormant).

## Clinical Safety

- [ ] 15. Medication dose range validation (flag-only; cite reference ranges;
      mark BLOCKED if thresholds need clinical sign-off).
- [ ] 16. Lab reference range / critical value / trend checking in labs.js
      (flag-only; cite reference ranges).
- [ ] 17. Bedside clinical decision audit log (what was checked, when, by whom;
      exportable report), mirroring Workup Studio's change-set audit trail.

## UX & Performance

- [ ] 18. Add loading indicators/toasts (currently only sr-only `setStatus()`).
- [ ] 19. Debounce `renderChecklist()` on search input (index.html:19970).
- [ ] 20. Lazy-load medical-knowledge-db.js (~3.3MB) instead of blocking `<script>`.
- [ ] 21. Audit zxing-browser vs jsQR duplication; drop one if redundant.
- [ ] 22. Add `prefers-reduced-motion` support in styles.css.
- [ ] 23. Add dark mode (`prefers-color-scheme`) support.

## Accessibility

- [ ] 24. Wire `handleResizeKeydown` (~L3278) to the sidebar resize handles.

## Dependency Management

- [ ] 25. Track `@huggingface/transformers` (CDN-loaded, index.html:1634) in
      package.json for npm audit/version pinning.

---

## Session log

- 2026-07-08: Plan created; recurring scheduled agent set up to execute items in
  order, checking in periodically. No items started yet.
