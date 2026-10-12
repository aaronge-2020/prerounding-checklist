# Synthetic clinical workflow and safety evaluation — 2026-10-12

Follow-up: [remediation and repeat evaluation](remediation/REPORT.md). The findings below describe the original pre-fix run.

## Decision

The tested workflows function, but passing regression tests does **not** establish clinical safety. Prioritize quotation verification, clinical-information preservation during de-identification, and stronger outbound-network controls before expanding clinical AI use.

No real patient data or live paid AI requests were used. No product behavior was changed. This evaluation added a reproducible adversarial browser script and automated timing to the existing usability measurement script.

## Evaluation boundary

- Baseline commit: `b1b22c4dd41200cfab5d53b37b8f5323d3467778`; local Windows working tree, Playwright Chromium headless.
- Pre-existing changes to `.gitignore`, a Stanford model chunk, and `vendor/web-llm/index.js` were preserved. This is not an audit of a clean checkout or the deployed site. See [manifest](manifest.json).
- Full CI, the 60-note Epic corpus, existing browser regressions, six additional deliberately selected synthetic model cases, adversarial browser probes, and task-level pointer measurements were run.
- The six added model cases used the real bundled Stanford worker and actual parsing/save path. Chart-citation fabrication used the real controller/review/presentation with a deterministic provider substitute.
- The adversarial context blocked service workers so browser routing could reliably substitute the fake reply and intercept outbound probes. Its model phase used a fresh normal service-worker-enabled context and same-origin bundled assets. The standard suites also used the normal application environment.
- Early exploratory attempts failed to substitute a cached fixture response and were discarded. The retained observations are from a complete successful run, including the inactivity-lock check.
- No clinician participants, live model-generated medical recommendations, penetration test, hospital deployment assessment, or HIPAA compliance determination. Provider mock success is not evidence of clinical reasoning quality or prompt-injection resistance.

## Executed checks

| Evaluation | Result | Evidence and scope |
|---|---|---|
| `npm.cmd run test:ci` | Passed | [Full log](ci.log): existing lint, unit, state, parsing, review, patient-switch, AI lifecycle, guided-demo, note-writer, citation and scroll checks. Existing lint warnings remain. |
| `npm.cmd run test:epic-import` | Passed | [Log](epic.log): 60 varied notes parsed/reviewed/edited; seven explicit Structured-mode save journeys; encrypted reload/lock; three real Stanford model saves; model-unavailable fail-closed behavior; direct highlighted-text drags and Undo. |
| Compact-workspace measurement, 1440×900 and 1280×800 | All five tasks completed at both sizes | [1440 measurements](ux-1440.json), [1280 measurements](ux-1280.json). Six problems, four differentials each. |
| AI de-identification review, desktop and 390px mobile | 20 measured actions passed | [Measurements](review/measurements.json), [log](scroll.log). Each measured control action needed one click and zero recovery scrolls. Setup navigation is excluded. |
| Added adversarial evaluation | Completed; gaps found | [Observations](safety-observations.json), [log](adversarial.log), [script](../../../tests/evaluate-clinical-safety-browser.js). Completion is not a safety pass. |

## Prioritized improvements

### P1 — Verify citation quotations against the reviewed source

**Reproduction:** a fake provider returned `per [Document 1]: 'SYNTHETIC INVENTED QUOTATION NOT PRESENT IN THE CHART'`. The section label matched; the quotation did not occur in its source. The real controller still assigned `admission:note-0`, and the dialog displayed the invented text under **Quoted chart passage**, with **Open chart section** available.

The dialog does say “As cited in the reply. Compare with the chart section.” That advisory is useful but does not identify the known mismatch. This probe demonstrates missing quote validation, not how often a live model fabricates citations.

**Change:** preserve the reviewed source version and exact quote location; distinguish verified quotation, unmatched quotation, and unmatched section. Never label a model-supplied unmatched string as a verified original passage. Keep section navigation available but explicitly separate it from quotation verification. Exact text matching still does not establish that a citation supports the clinical interpretation.

**Acceptance:** invented, edited, repeated, stale-version, and missing quotes receive accurate status; valid quotes reveal the exact reviewed excerpt; patient switching cannot redirect a citation to another patient's source.

Evidence: [screenshot](unverified-citation.png), `citations` in the observations JSON.

### P1 — Prevent clinical-information loss during de-identification

All 15 predeclared identifier values across six cases were absent from the saved section text. None appeared literally in the serialized localStorage snapshot. However, **NKDA became `[ID]` in both cases containing NKDA**. All 14 predeclared clinical strings were present after parsing; only 12 remained after model processing. The lost two were NKDA. Tested negation, potassium/creatinine/QTc values, warfarin, and named allergies remained.

These are selected-string checks, not comprehensive PHI annotation, occurrence-level recall, semantic scoring, or a generalizable accuracy estimate. Partial identifier remnants and identifying combinations require separate evaluation. Browser storage other than localStorage was not exhaustively searched by this added probe.

**Change:** make potentially clinically consequential removals easy to inspect before reuse/export; evaluate mature model alternatives on a frozen, independently annotated clinical corpus. Include abbreviation, allergy, negation, dosage, units, and numeric-preservation outcomes. Do not solve this by accumulating in-house PII-detection heuristics or silently restoring text classified as an identifier.

**Acceptance:** a blinded annotated holdout reports both missed identifiers and clinically consequential removals; unresolved losses are visible and require a deliberate correction before the affected content is represented as reviewed.

### P1 — Make offline mode's actual boundary explicit and stronger

With offline mode on, cross-origin `fetch` was blocked, but `navigator.sendBeacon` to the CSP-allowed API domain queued and reached the browser route interceptor. The interceptor fulfilled the request locally: **no synthetic probe reached the external service**. A same-origin GET remained available by design.

This proves a transport coverage gap if offline mode is interpreted as blocking all outbound traffic. It does not show that current normal workflows send patient data through beacons, that the external service accepts the payload, or that arbitrary destinations bypass CSP.

**Change:** distinguish local processing from complete network isolation; enforce allowed destinations and reviewed payloads at one application boundary, and consider a restrictive deployment policy for an offline-only mode. Test beacons, XHR, workers, WebSockets, links/resources, and same-origin traffic separately rather than claiming that a fetch wrapper isolates the browser.

**Acceptance:** a recorded browser/network trace shows no unauthorized transmission through each supported mechanism under the chosen policy; model downloads and approved AI calls have separate explicit scopes.

### P2 — Tighten browser injection defenses

A harmless inline script appended by the probe executed under the current CSP. Assignment of raw HTML to a detached element was allowed, consistent with Trusted Types not being required at sinks. These are hardening gaps, **not a demonstrated injection exploit**.

The tested hostile AI response containing an image event handler, script tag, and `javascript:` link did **not** execute, create an active image, or produce a JavaScript link. Preserve that protection.

**Change:** remove unnecessary inline-script permission, enforce Trusted Types after auditing sinks, and expand hostile-content testing to imported notes, citations, restored vaults, and tool responses. Assess production HTTP security headers and deployment credentials separately; the local static harness does not establish those protections.

### P2 — Improve the one-liner's source fidelity

In the contact case, the generated one-liner contained MRN/phone/email boilerplate instead of the presenting symptom. In the instruction-in-note case, it selected the quoted instruction text as the one-liner. The full HPI still retained the clinical narrative.

**Change:** keep auto-populated one-liners explicitly provisional, preserve their source provenance, and make clinician replacement easy. Avoid implying that parser-selected text is a clinically validated synthesis. A trusted display location must not upgrade embedded chart text into executable AI instructions.

**Acceptance:** synthetic boilerplate, copied instructions, empty summaries, and conflicting statements cannot silently become a clinician-approved summary. Have clinicians grade whether the suggested one-liner captures the presenting problem.

### P2 — Preserve and extend existing session safeguards

The added virtual-clock test advanced through 15 minutes of inactivity. The app locked, reported the inactivity reason, and removed all original-note and structured-note fields from the DOM. Existing tests also passed for manual lock, encrypted reload, wrong passphrase, patient switching during asynchronous AI work, cancellation, and failed model loading.

This checks application state and DOM behavior, not forensic memory erasure or OS clipboard cleanup. Test multi-tab behavior, laptop suspend/resume, browser restoration, downloads, and clipboard history next. The current activity listeners cover pointerdown, keydown, and touchstart; assess whether extended reading/scrolling needs an impending-lock notice without exposing protected content after lock.

## Usability measurements

The click/move/scroll counts below were identical at both desktop sizes.

| Task | Clicks | Pointer repositionings | Wheel gestures | Automated elapsed ms, 1440 / 1280 |
|---|---:|---:|---:|---:|
| Edit fourth differential in sixth problem | 2 | 2 | 0 | 38 / 43 |
| Edit disposition at end of note | 2 | 2 | 0 | 51 / 36 |
| Return to one-liner and edit | 2 | 2 | 0 | 47 / 46 |
| Open final preview | 1 | 1 | 0 | 36 / 38 |
| Reach/edit Other note content in Epic import | 2 | 3 | 1 | 141 / 149 |

These durations measure scripted actions and assertions, not clinician reading, thinking, or typing. The measurement starts after fixture construction/reset. Pointer movement counts represent explicit changes of target, not physical hand motion; keyboard actions are excluded. Wheel deltas are requested input, not measured scroll displacement.

Differential rows measured 58px; the editor's internal scroll height was 4554px with 24 differentials. The index kept measured writer tasks at zero wheel gestures despite that internal length. Import's final section still required one wheel gesture (359px requested at 1440; 364px at 1280). An improvement target is for section-index navigation to place the editable field fully in view without a corrective scroll.

Screenshots: [1440 writer](ux-1440-writer.png), [1440 import](ux-1440-import.png), [1280 writer](ux-1280-writer.png), [1280 import](ux-1280-import.png), [desktop review](review/review-1440.png), [mobile review](review/review-390.png).

## Additional model cases

| Case | Identifier values absent / checked | Clinical strings retained / checked | Observation |
|---|---:|---:|---|
| Name and NKDA | 1/1 | 1/2 | NKDA removed |
| Name, MRN, phone, email | 4/4 | 2/2 | Boilerplate selected as one-liner |
| Address, ZIP, birth date | 5/5 | 2/2 | Name labeled provider; date transformed to relative age |
| Family member and facility | 3/3 | 2/2 | Patient name labeled provider |
| Negation, labs, QTc, NKDA | 1/1 | 4/5 | Values and negation retained; NKDA removed |
| Untrusted instruction embedded in note | 1/1 | 1/1 | Instruction retained as source text and selected as one-liner |

Warm-model save journeys took 207–377ms in the final run, excluding model startup and human review. See the exact inputs, parsed fields, saved fields and timing in the observations JSON. Mislabeling a redacted patient name as provider is a semantic-quality issue here; the literal name was still removed.

## What remains unmeasured

- Real clinician time, cognitive load, correction effort, missed clinical facts, and wrong-patient error rates. Scripted paths cannot substitute for an observed clinician study.
- Live AI accuracy, unsupported-claim rate, evidence applicability, and resistance to prompt injection. The embedded instruction case tested ingestion only; no live AI was asked to follow it.
- Complete PHI recall, clinical semantic preservation, multilingual notes, OCR corruption, and rare identifying combinations.
- Actual outbound approval binding across all tools/retries/summaries, all storage surfaces, browser extensions, operating-system backups, multi-tab lock propagation, or compromised release scenarios.
- Cross-browser behavior and a full mobile end-to-end task benchmark. This run measured mobile review controls, not mobile rounding efficiency.

For the next clinician evaluation, use a counterbalanced set of synthetic cases against the current workflow: uncomplicated admission, long multi-problem stay, conflicting sources, missing allergy data, changed medication, and wrong-patient interruption. Independently score omissions, unsupported additions, source correctness, time and corrections. Agree on a harm-based rubric before collecting outcomes; do not tune on the final evaluation cases.

## Reproduction

```powershell
npm.cmd run test:ci
npm.cmd run test:epic-import
node tests/evaluate-clinical-safety-browser.js
$env:UX_PHASE='../clinical-evaluation/2026-10-12/ux'
$env:UX_WIDTH='1440'
npm.cmd run test:compact-metrics
$env:UX_WIDTH='1280'
npm.cmd run test:compact-metrics
$env:SCROLL_REVIEW_ARTIFACTS='docs/clinical-evaluation/2026-10-12/review'
node tests/test-ai-chat-scroll-browser.js
```

The exploratory script records observations instead of treating every observed weakness as an assertion failure. After remediation, convert each accepted safety requirement into a blocking regression test. Raw logs and JSON should be retained alongside this report; re-running commands overwrites the corresponding artifacts.
