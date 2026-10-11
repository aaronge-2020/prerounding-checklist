# Validation protocol for unresolved handoff tasks

No results are implied by this protocol. Record actual observations and failures, and retain corpus access restrictions.

## Corrections and incremental research

Use the existing seed-42 train/test split without mining or tuning on test notes. Require the original scorer, corpus authorization and model hashes before running. At matched budgets 10/20/30/40, compare no adaptation, existing batch reference and incremental adaptation for each exact Stanford/TIDE2 artifact. Preserve the published GLiNER reference rather than repeating the completed loop.

Predeclare three correction conditions: complete gold corrections, incomplete corrections sampled independently at 25/50/75% coverage, and noisy corrections at 5/10/20% incorrect labels or spans. Keep missed PHI, rejected false positives and newly marked spans distinct. Repeat sampling with fixed recorded seeds. Report precision, recall, F2, false negatives by label, rule acceptance/rejection and uncertainty across seeds. An average F2 gain cannot override recall loss or label-specific regression. Document whether the health monitor actually ran; a skipped check is not a pass.

Any future persistence must use a versioned schema and encrypted vault edge, bind to base-model/runtime identity, support explicit user review and removal, and survive lock/reload without persisting raw originals or text-bearing rule examples. First classify what each research rule stores; persistence is blocked if a rule retains raw PHI. Current product boundaries prohibit adding an in-house detector, so research-module integration requires a deliberate product decision, not an incidental import.

## Reviewer sessions

Recruit authorized clinicians through the study owner. Use synthetic/de-identified cases until an approved protocol permits otherwise. Present representative age, placeholder, date/time and procedure false-positive cases in randomized order. Record missed PHI, incorrect redactions, time to safe completion, corrections abandoned, and disagreements; have an independent reviewer adjudicate. Do not collect patient originals in issue trackers, analytics or session recordings. Record reviewer consent/clearance and the clinical review decision separately from UI usability feedback.

## Physical-device and timing run

Use a real low-end device, record OS/browser/RAM/CPU, browser model/runtime hashes and power state. Separate cold download, cold load/self-test, warm load and per-note inference. Include small/medium/large synthetic notes, first-run and repeated runs, cancellation, offline reload and interrupted-download recovery. Record median/p95, failures, peak observed memory and whether the device was usable during inference. Browser viewport resizing or desktop throttling is not physical-device evidence. Publish environment and raw timing tables before revising manuscript timing claims.

## Access and approvals

The existing i2b2 follow-up was sent Oct 10, with a stated Oct 13 window. Verify the reply through an authorized channel; do not presume access or send another message without explicit sending authorization. Record Dr. Seam's role acceptance, each author's clearance, funding declaration, ethics determination, clinical error-review signoff and Posada rescoring as separate decisions. None can be replaced by an agent-generated statement.
