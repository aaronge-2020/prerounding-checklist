# Current status — 2026-10-11 implementation and browser review

This section supersedes the historical handoff below. Do not ask Aaron the resolved questions again.

## Decisions and delivered work

- Aaron chose Stanford until TIDE2 has approved hosting, and per-send prompt edits plus Settings defaults. Local code implements both. Selected-model failures no longer silently switch models.
- Both pushes landed: app pulled through `a6d0532`; benchmark checked out at `e4648723ff1e9c9d66f5f773d8b39daf6cddcbd6`. Benchmark code/results are accessible. The model binaries and restricted evaluation corpus are not available here.
- A&P has editable instructions/input, model, optional temperature, web-search choice, exact request preview, copy without an API key, reset input, and encrypted default instructions. Preview and network transport share one builder. Manually edited input is authoritative.
- Checklist fill and workup formatting were removed in `0781a1d`; their original prompt-plan slots are obsolete. No retired authoring features were reintroduced into read-only Cheat Sheets.
- Fixed duplicate declarations/imports and a wrong relative import that prevented the freshly pushed app from starting. Removed CURB65's incorrect age-to-BUN and BUN-to-confusion bindings; inputs remain manual pending validated autofill.
- Manuscript master revised with authorized Google Docs editing and checked by export. It now separates the 1,281-note sweep from the 1,381-note Stanford verification, uses verified scores and incremental results, removes unsupported SOTA claims, and explicitly leaves funding/ethics/author approvals pending. Old exact-span comparison tables are withheld pending rescoring. Legacy bibliography still needs a full source audit.
- TIDE2 hosting preparation: see `tide2-upload.md` and `scripts/prepare-tide2-upload.py`. Actual evaluated bytes/provenance are still needed; Aaron/Posada must execute hosting.

## Validation performed

Manual browser checks used a synthetic vault only: startup and locked boundary; persisted Settings default after reload; keyless request inspection/copy; manual input retention; changed consult question/reset; web-search request toggling; Stanford worker self-test and actual synthetic inference; APGAR maximum inputs returned 10; on-device chat without an installed model disabled Send. No paid API call was made.

Targeted request-inspector, A&P, model options/packs, UI boundaries, Cheat Sheets and local-LLM tests passed. Runtime syntax check passed. The broader workspace is **not green**: lint reports widespread existing violations; state test expects schema 6 but implementation returns 5; prompt tests import a retired checklist function; clinical-score tests expect unimplemented lab pulls. No production deployment of this change is claimed. Local browser verification is not live-site verification.

## Remaining work and prerequisites

1. Establish artifact identity between bundled Stanford q8 files and the evaluated Stanford ONNX (conversion revisions, hashes, parity test). Browser readiness proves execution, not equivalence to published benchmark numbers. Resolve broader checks before deployment.
2. Approved TIDE2 hosting remains external-owner work. Never mirror the conversion elsewhere.
3. Incremental research: do not repeat the perfect-correction simulation. Obtain restricted corpus/scorer and exact Stanford/TIDE2 artifacts, then run incomplete/noisy-correction experiments and matched strong-base evaluation. The successful refinement log skipped a health-monitor check. Persistent rule storage and production UI integration remain unvalidated; do not promote research rules into the product's detector. Follow AGENTS model-only boundaries.
4. Synthetic Stanford smoke detected age and a date/time span, retained the procedure correctly, but missed “Test Patient.” Date replacements deliberately retain historical year/time under current policy; decide the intended disclosure policy before treating it as a scoring defect. This is not full error-review coverage.
5. Clinician reviewer sessions, physical low-end hardware tests, dedicated timing runs, and i2b2 access remain outstanding. No clinician review or external follow-up was performed in this pass. Use the validation protocol in `validation-next-steps.md`.
6. Native calculator forms work in the sampled case; patient autofill needs correction and unit-aware tests. Local chat/parser unit checks pass, but the browser has no installed chat model, so real local generation remains unverified. Historical goal IDs do not establish that the original goals are complete.
7. Senior/corresponding author acceptance, funding, author clearance, clinical error review, ethics determination, and Posada rescoring remain pending. The manuscript is an internal draft, not approved for publication.

---

## Historical handoff (superseded where noted above)

# Unfinished work: pre-rounding app + de-identification manuscript
Compiled 2026-10-11 ~18:35 EDT for handoff to a stronger agent. Everything below is unfinished or undecided. Completed work is omitted except where it is the baseline the next agent must not redo.

## A. Pre-rounding app (repo: aaronge-2020/prerounding-checklist, ~/workspace/prerounding/repo)

### A1. De-identification model deployment decision — UNMADE
- Aaron's standing decision (2026-10-10): "Wait for full results, then deploy the winner." The full website-model sweep is done.
- Verified results on 1,281 SHIELD test notes: TIDE2 F2 0.9313 (strongest), real Stanford F2 0.8280 (second). Batch v2 rules added nothing to either (+0.0004 Stanford, +0.0 TIDE2).
- Live site still has TIDE2 as default with Stanford as fallback (src/patient-context/deid-model-options.js, src/vault/deid/model-config.js). That ranking was set using an older, suspect Stanford file — but the new verified numbers happen to agree with it.
- Aaron never answered whether to leave the site unchanged. **Next agent: ask Aaron, then deploy or confirm.**

### A2. TIDE2 model hosting — BLOCKED
- The fp16 ONNX (873MB) is NOT on Stanford's gated Hugging Face repo yet. Dr. Posada's permission terms: even ONNX conversions may only be hosted there.
- Until uploaded, the app cannot serve its default model from an allowed location. **Next agent: prepare the upload; Aaron or Posada must execute the actual hosting request.**

### A3. Incremental learning system — research done, NOT productized
- SMART goal ACHIEVED 2026-10-11 (verifier-confirmed): after 40 simulated corrections, F2 0.5348 → 0.6362 (+0.1014), within 0.0058 of batch v2 at matched N=40 (0.6420). Code: ~/workspace/deid-models/incremental/ (pushed to aaronge-2020/deidentification-benchmark).
- Gaps before this touches the product:
  1. Simulation assumes perfect, complete corrections. No test with noisy/incomplete clinician corrections.
  2. Rule store is in-memory only — no persistence across sessions.
  3. Proven on GLiNER (weak base, lots of headroom) only — not on the product's Stanford/TIDE2 bases.
  4. No UI integration: uncertainty triage flags, review ranking, and health monitor are built as modules, not wired into the app.
- **Next agent: do NOT rerun the simulation loop. Start from the gaps above.**

### A4. Known de-id detection gaps (never fixed)
- Age detection, "Test Patient"-style placeholders, date-before-"at {time}", procedure-as-name/address false positives.

### A5. Validation still owed (highest value first)
- Real reviewer sessions with clinicians. Real low-end device testing. Dedicated timing re-run. i2b2 corpus access — follow-up to Dr. Uzuner sent 2026-10-10, no reply; window ends Oct 13.

### A6. Feature goals needing Aaron or work
- **Prompt control for generate buttons** (goal_6e0985564c3f): plan done; ONE open question Aaron never answered — per-send prompt editing only, or per-send plus a Settings editor for the three default instruction blocks?
- **MD Calc native calculators** (goal_1f116740ce5a): flagged user_action_required; verify what remains.
- **Prerounding app bug fixes** (goal_929c1c9ff03d): open-ended; any Aaron-filed report not confirmed live is still open.
- **Local LLM parser and chat** (goal_0c0508be3bb7): user_action_required.
- Note editor flexible layout: parked, no attention needed.

### A7. Completed 2026-10-11 ~18:41 EDT
- Push completed: local work + docs/benchmarks/ merged and pushed to prerounding-checklist main as commit 68eb31503af6bfaeb66804e8cc3e2ad80fa55759 (62 files, verified on remote). docs/benchmarks/ needed no changes (already in sync).

## B. De-identification manuscript
- Master: Google Doc 12Os83S_F7nrh-FImnrSn5MwDegwUO8SV7uvR9l5U-WQ ("Browser-Local De-identification of Clinical Text — Manuscript Draft"); markdown mirror ~/workspace/deid-manuscript/manuscript-draft.md (last regenerated Oct 9 — STALE, see B6).

### Approvals and admin — ALL OPEN
1. **Senior/corresponding author:** Dr. Nitin Seam's formal OK still open (first chat Oct 9).
2. **Clinical error review:** not done.
3. **Funding:** unresolved.
4. **Author clearance:** not obtained.

### B5. Reproducibility blocker
- TIDE2 ONNX hosting (same as A2). The manuscript's headline numbers depend on a model readers cannot download yet.

### B6. Manuscript content is stale — needs a rewrite pass, not a fresh draft
The Oct 9 draft predates all of this verified work:
- Real Stanford re-verification: F2 0.8287 on 1,381 SHIELD notes (the old 0.7007/0.8013 figures came from a suspect file — never cite them).
- 8-model website sweep (website_model_matrix.json): batch v2 mean delta +0.101, but zero gain on strong clinical models.
- Four verified enhancements: cleanlab token-quality (5/5), philter safe-patterns via phileas-redact (5/5), small-text active learning (5/5, 220% error-coverage lift), BOND-style pseudo-label gate (verified after fix round).
- Incremental learning system + SMART goal (A3) — the strongest new story.
- **Framing correction:** the original "automatic rules make weak models state of the art" claim is NOT supported by the verified numbers. Honest framing: training-free adaptation lifts weak/mismatched models substantially but does not close the gap to purpose-built clinical models; the incremental-from-corrections system is the forward-looking contribution.
- Table 4 (SOTA head-to-head) used old strict exact-span scoring; Posada rescoring still pending.
- ~/workspace/deid-manuscript/results-table-verified.md (Oct 11) has the verified numbers to integrate.

### B7. Completed 2026-10-11 ~18:39 EDT
- Push completed: ~/workspace/deid-models/ (code + results, no model binaries) pushed to aaronge-2020/deidentification-benchmark main as commit e4648723ff1e9c9d66f5f773d8b39daf6cddcbd6 (620 files, 51.4MB, verified on remote).

## Standing rules the next agent must honor
- Never send email or any external message unless Aaron physically clicks the approval prompt. Text approval in chat is not enough.
- Reuse maintained libraries/packages and authors' official code before reimplementing (Aaron's standing philosophy).
- Independent verifier must be a separate agent, blind to the builder's notes.
- Every citation Aaron receives must be clickable.
- Never claim a result without direct evidence; never present a historical/reconstructed number as a fresh measurement.
- Old Stanford 0.7007/0.8013 figures are from a suspect file — do not cite as model performance.
