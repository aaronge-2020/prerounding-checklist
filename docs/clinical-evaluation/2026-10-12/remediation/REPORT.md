# Remediation and repeat synthetic evaluation

This closes the reproducible defects in the [original evaluation](../REPORT.md). It does not establish clinical effectiveness, general de-identification accuracy, or institutional compliance.

| Finding | Change | Repeat evidence |
|---|---|---|
| Fabricated quote appeared as a chart passage | Exact quotation matching against the approved source snapshot; source fingerprint and all exact ranges retained. Missing quotes, missing sections and duplicate section labels are explicitly unverified. Ambiguous sources do not navigate to an arbitrarily selected section. | The fabricated quotation is now `quote-not-found`; details say **Unverified quotation supplied by AI**. Valid-quote, repeated-quote, changed-source, raw-original exclusion and duplicate-label tests pass. |
| NKDA lost during isolated field inference | Pass each explicit clinical heading with its field value to the existing mature model. Strip only the unchanged known heading; if that boundary changes, fail without saving. No word whitelist, new detector, or silent restoration of detected identifiers. | Both NKDA cases now retain NKDA. All 14 declared clinical strings survive; all 15 declared identifier values are absent from saved section text and literal localStorage snapshots. |
| Offline beacon bypass | Guard fetch, beacon, XHR send/open, WebSocket and EventSource creation. Close tracked remote socket/stream connections when offline mode starts; synchronize the setting across tabs. Correct misleading offline copy. | Synthetic fetch, XHR, WebSocket and EventSource attempts are blocked. Beacon returns false and never reaches the interceptor. Same-origin loading remains allowed deliberately. |
| Browser injection hardening | Remove inline-script permission, externalize the mobile redirect, enforce Trusted Types, and sanitize HTML insertion through pinned, locally bundled DOMPurify. Worker/service-worker URLs use an explicit same-origin resource allowlist. Configure the SDK's supported interpreter mode instead of allowing runtime eval. | Inline script injection and raw HTML assignment are blocked. Hostile AI markup still produces no executed script, active image or JavaScript link. Main workspace, scribe initialization, demo and note-editor paths use sanitized sinks. |
| Parser chose boilerplate/instructions as one-liner | Remove inferred one-liners. Populate only explicitly labeled one-liner sections; leave the existing editable destination available otherwise. Preserve the full HPI. Update the curated demo to provide an explicit one-liner. | Boilerplate and embedded instructions no longer become a synthesized one-liner. Explicit summaries survive parsing and note export. |
| Existing session safeguards | Preserve inactivity locking, protected-DOM clearing and patient/session checks. Reinforce the model instruction that chart content is data, not authorization. | The 15-minute virtual-clock test locks the vault and leaves zero original/structured-note fields. Existing patient-switch, cancellation and fail-closed model tests remain part of CI. |

## Scope of the protection

Offline mode is an application policy, not an air gap. Same-origin assets and explicitly opened external websites can still use a connection. It cannot control operating-system traffic, extensions, or an already compromised browser. Do not describe it as blocking every network request.

Quotation verification establishes that an exact passage occurs in the reviewed snapshot. It does not establish that the passage supports the AI's interpretation. The current chart can differ from that snapshot; the details panel says so. Old replies without verification metadata remain unverified.

The field-context fix addresses a reproduced model error without special-casing NKDA. The small synthetic corpus does not prove zero missed PHI or zero clinical-information loss on other notes. Clinician studies, a frozen independent annotated holdout, institutional security review, deployment-origin separation, device/clipboard/backups, and multi-tab vault behavior remain external or unmeasured work; they are not represented as completed by these changes.

## Verification

Final local results: **all listed suites passed**, with 89 existing lint warnings and zero lint errors. See [CI log](ci.log), [Epic import log](epic.log), [dependency audit](dependency-audit.json), and [runtime manifest](manifest.json).

- `npm.cmd run test:safety`: blocking pure and browser regressions, including six real Stanford-worker cases, fabricated provider output, hostile markup, network probes and inactivity lock.
- `npm.cmd run test:epic-import`: 60-note corpus, seven Structured-mode save journeys, three real Stanford saves, unavailable-model failure handling, highlighted-text dragging and scroll retention.
- `npm.cmd run test:ci`: lint, unit and full browser workflows. The new safety suite is included in local CI and has a dedicated hosted CI job.
- `npm.cmd audit`: zero known dependency vulnerabilities at the time of this change. DOMPurify is pinned and vendored; two existing vulnerable development dependencies were updated within compatible ranges.

Final logs are retained here alongside [structured observations](safety-observations.json) and the [citation screenshot](unverified-citation.png). All content is synthetic. Paid/live external AI generation was not used. Deterministic fake-provider output verifies the application boundary, not live-model compliance or clinical reasoning.

The original evaluation artifacts remain unchanged. `node tests/evaluate-clinical-safety-browser.js --verify` writes repeat evidence here and fails if the reproduced safety requirements regress.
