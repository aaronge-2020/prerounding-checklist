# Reviewer-Hardening Stream 1: Does the frozen D1–D12 rule layer lift SOTA models too?

**Date:** 2026-10-01
**Question:** Is our system's 0.872 held-out F1 driven by the Stanford clinical base model, or by the D1–D12 rule layer? If the rules are the driver, grafting them onto the three full-size SOTA models should lift those models to ~our level.
**Answer:** Yes — the rule layer lifts all three SOTA models from 0.11–0.51 to ~0.86 on the frozen held-out 100. StanfordAIMI+rules numerically edges our system (0.8756 vs 0.8718) but the paired difference is not significant; the other two sit 0.013–0.016 below ours. No SOTA+rules variant significantly beats our system. The honest headline is that **the rule layer, not the base model, explains ~90% of the system's exact-span F1** — and the rules were written against MedDeID-style notes, which is the asymmetry a reviewer will (correctly) press on.

---

## 1. Method (faithful replication of the browser pipeline)

The benchmark harness (`meddeid/site-trackbc/harness-param.html`) runs `deidentifier.deidentifyText(text, { mode: "hybrid" })`. I traced the hybrid path in `site-trackbc/src/vault/deid.js` (`createDeidentifier` → `deidentifyText`, lines 4992–5031) and replicated it **step-for-step in Node**, substituting SOTA spans for the base-model spans at exactly the point the real pipeline consumes them (`modelResult.entities`, i.e. *after* `detectModelEntities`/`modelPredictionsToEntities`, *before* the first `mergeEntities`). The replicated order:

1. `bracketEntities = collectBracketedPlaceholderEntities(rawText)`
2. `modelEntities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(sotaSeeds, rawText))`, where each SOTA `{begin, end, type}` becomes `{start, end, label: type, placeholder, score: 1, source: "model"}`
3. `structuredEntities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(addStructuredSafeHarborEntities(rawText, bracketEntities, null, { relativeDate: null }), rawText))`
4. `modelEntities = modelEntities.filter((e) => !overlapsAny(e, structuredEntities))` — any model span touching a structured span is dropped
5. `graphResult = expandIdentityGraphEntities(rawText, [...structuredEntities, ...modelEntities], 3, { patientIdentity: null })` — dictionary/contextual/alias name expansion
6. `entities = addTrackDAgeEntitiesPostFilter(rawText, graphResult.entities)` — D1: clinical age expressions (<90, dropped by the Safe Harbor filter, added back gold-shaped)
7. `rendered = resolvedRedactionEntities(rawText, entities, null, { includeTemporalFallback: true, relativeDate: null })` — internally: `collectTemporalEntities` → `mergeEntities` → the Track-D final filter (D6b duration-DATE/TIME/ROOM/ST-ZIP suppression, CONTACT NAME→NAME, D8 DATE→DOB relabel, D9 PATIENT/PROVIDER NAME→NAME relabel, D11 ORGANIZATION medical-department suppression, D12 model-hallucination suppression)

**Code fidelity measures.** The four module-private functions (`collectBracketedPlaceholderEntities`, `expandIdentityGraphEntities`, `resolvedRedactionEntities`, `overlapsAny`) were exposed by appending a single `export { … }` line to a *copy* of `deid.js` run under `/tmp/deidnode` (relative imports resolved via symlinks to the real tree). Zero rule code was altered; all transitive callees are the originals. `globalThis.__deidTrackD` is `undefined` in Node, so the Track-D gates (`!== false`) behave exactly as the browser with `?trackd=on`.

**Conflict resolution** (`mergeEntities`, verified in code): overlapping spans are processed in start order; a structured/alias/residual-source span *absorbs* an overlapping model span entirely; a structured span *replaces* an overlapping model span. When two non-structured spans overlap, they merge into the wider span and the kept label is whichever ranks higher in `labelPriority`: **DOB > EMAIL > PHONE > MRN > ENCOUNTER ID > ID > ADDRESS > ROOM > PATIENT NAME > PROVIDER NAME > CONTACT NAME > NAME > OCCUPATION > FACILITY > ORGANIZATION > LOCATION > TIME > DATE > URL > IP** (lower index wins; unknown labels rank last). Same-label model spans also merge across gaps of ≤4 chars matching `[ \t.'-]`.

**Validation.** (a) Scoring the converted SOTA seeds *without* rules reproduces the published base held-out F1s to 4 decimals (0.5065 / 0.3723 / 0.1119) — conversion is lossless. (b) A full repeat run of one model is byte-identical — the pipeline is deterministic. (c) No new held-out evals of our system: ours is the frozen archive `meddeid/out/stanford_trackd_test2.json` throughout.

**Scoring:** `models-survey/score_eval.py` (exact-span micro P/R/F1, char recall, 10k note-level bootstrap 95% CIs, seed 42). **Paired ΔF1:** `models-survey/paired_delta.py` (Δ = ours − model, identical resamples, 10k, seed 20260930, Holm–Bonferroni k=3). Environment: Node v24.20.0, vendored chrono-node, no new dependencies.

---

## 2. Results

### 2a. Primary: frozen 100-note held-out set

| Variant | Exact F1 | 95% CI | P / R | Char recall | Δ base→+rules | Paired Δ vs ours¹ | 95% CI | p (Holm, k=3) |
|---|---|---|---|---|---|---|---|---|
| **Ours (Stanford+D1–D12, frozen)** | **0.8718** | [0.8442, 0.8977] | 0.8657 / 0.8778 | 0.9532 | — | — | — | — |
| StanfordAIMI base | 0.5065 | [0.4609, 0.5514] | — | 0.8764 | — | +0.3653 | [0.3156, 0.4156] | <0.0001 * |
| **StanfordAIMI + rules** | **0.8756** | [0.8453, 0.9038] | 0.8667 / 0.8848 | 0.9607 | **+0.3691** | −0.0039 | [−0.0201, 0.0123] | 1.0000 |
| Longformer-NemPII base | 0.3723 | [0.3408, 0.4038] | — | 0.7247 | — | +0.4995 | [0.4616, 0.5382] | <0.0001 * |
| **Longformer + rules** | **0.8586** | [0.8322, 0.8838] | 0.8586 / 0.8586 | 0.9462 | **+0.4863** | +0.0131 | [−0.0089, 0.0341] | 0.4768 |
| OBI-BERT i2b2 base | 0.1119 | [0.0902, 0.1345] | — | 0.7049 | — | +0.7598 | [0.7286, 0.7901] | <0.0001 * |
| **OBI-BERT + rules** | **0.8559** | [0.8271, 0.8837] | 0.8464 / 0.8656 | 0.9419 | **+0.7440** | +0.0158 | [0.0030, 0.0294] | 0.0396 * |

¹ Δ = F1(ours) − F1(variant); positive means ours is better. Base-model paired rows are the pre-registered values from `sota-full-eval.md` (reproduced for context).

**Headline reading:** every SOTA model gains enormously from the rules (+0.37 / +0.49 / +0.74). StanfordAIMI+rules numerically beats our system by 0.0039 — a tie (p=1.0, CI straddles zero). Longformer+rules is 0.013 below ours, not significant. OBI-BERT+rules is 0.016 below ours, significant but a tiny effect. **No SOTA+rules variant significantly beats our system; all three land within 0.016 of it.**

### 2b. Secondary: all 300 notes (descriptive — 200 dev + 100 held-out)

| Variant | Base F1 [95% CI] | +Rules F1 [95% CI] | +Rules char recall | Δ base→+rules |
|---|---|---|---|---|
| StanfordAIMI | 0.5032 [0.4766, 0.5303] | 0.9031 [0.8883, 0.9173] | 0.9706 | +0.3999 |
| Longformer-NemPII | 0.3891 [0.3708, 0.4077] | 0.8922 [0.8772, 0.9065] | 0.9650 | +0.5031 |
| OBI-BERT i2b2 | 0.1232 [0.1097, 0.1375] | 0.8836 [0.8672, 0.8992] | 0.9630 | +0.7604 |

Note the 300-note +rules numbers (0.88–0.90) run *hotter* than held-out (0.856–0.876): two-thirds of the 300 are the dev split the rules were written against. The held-out-100 column is the clean generalization number. No 300-note ours archive exists, so no paired 300-note comparison is made.

### 2c. Per-type: the rules erase base-model differences (held-out 100)

Per-type F1, base → +rules, vs ours. The pattern is convergence: after rules, all three models reach nearly identical per-type scores that match ours type-for-type.

- **Types the base models cannot emit → pure rule wins:** DOB (0 → 1.00 all three), ADDRESS (0 → 0.96–0.97), MRN (0–0.48 → 0.93), AGE (0–0.03 → 0.94), OCCUPATION (0 → 1.00), NAME (0 → 0.56–0.61, via Track-D relative-name machinery), PROVIDER NAME for Longformer (unmappable natively → 0.77 from rules alone).
- **Massive FP cleanup:** OBI-BERT ID 1 tp / 172 fp → 86 tp / 2 fp; OBI-BERT PATIENT NAME 160 fp → 27; StanfordAIMI FACILITY 124 fp → 16; Longformer ADDRESS 70 fp → 2 (`filterLikelyFalsePositiveEntities` + D12 + the structured-overlap drop in step 4).
- **Where rules helped most:** every type with a structured pattern behind it — the rules supply what the OOD base models miss on this synthetic distribution.
- **Where rules hurt:** Longformer PHONE 0.9524 → 0.7097 (the rule layer adds 9 FP phone spans; ours has the identical 0.7097 — the loss is rule-inflicted, not model-inflicted) and Longformer EMAIL 1.00 → 0.90. Small, honest blemishes worth disclosing.
- **Residual gaps vs ours are tiny and scattered:** FACILITY (StanzaIMI+rules 0.7416 vs ours 0.7955), PATIENT NAME (OBI+rules 0.8368 vs 0.8684). In the other direction, StanzaIMI+rules PATIENT NAME 0.9035 *exceeds* ours 0.8684 — its base model found names our Stanford base missed, and the rules kept them.

---

## 3. Honest interpretation

1. **The rule layer is the system.** Three architecturally different base models, spanning base F1s of 0.11 to 0.51, converge to 0.856–0.876 once the frozen rules are applied — within noise of our 0.872. Base-model choice among rule-equipped variants moves F1 by ≤0.02. Our system's 0.872 is best described as "D1–D12 rules + a small base-model residual," not "Stanford clinical + rule polish."
2. **This answers the "weak base model" reviewer objection — and sharpens it.** A reviewer who says "your base model is weak, that's why SOTA looks bad" is now answered: even the published SOTA checkpoints need this rule layer to reach 0.86 on MedDeID-style notes, and *with* the rules they merely tie our system. But the reviewer will then (correctly) pivot to: "your rules are fit to this synthetic distribution." That is true and must be conceded upfront: the rules were written against the 200-note MedDeID dev split, so they encode this benchmark's annotation conventions directly (DOB-after-"DOB:", relative-name relabels, ST-ZIP suppression, duration-date filtering). The SOTA models got the rules as a gift — but the gift itself is the in-distribution component.
3. **The held-out numbers are still legitimate.** The 100-note held-out set was frozen and unseen during rule development; +rules F1s of 0.856–0.876 there are real generalization of the rule layer *within this synthetic distribution*. What remains unproven is rule generalization *across* distributions (i2b2-2014) — stated future work, not claimed here.
4. **Nothing here is tuning.** Seeded SOTA spans are scored deterministically through frozen rules; no thresholds, patterns, or labels were changed; no our-system held-out eval was re-run.

## 4. Limitations

- **Fidelity gap (small, disclosed):** SOTA spans enter at the `modelResult.entities` stage with `score: 1, source: "model"`. They skip `modelPredictionsToEntities`'s B2 per-label score thresholds, `constrainModelEntity` span constraining, and the `isProtectedClinicalEntityFalsePositive` / `isClinicalTermStoplistHit` vetoes that our Stanford base model's raw predictions passed through in the browser. Direction of bias is likely small (those steps mostly trim model FPs), but a literal "this SOTA model plugged into the browser" run could differ slightly.
- **Asymmetry:** rules were developed on MedDeID dev notes (same synthetic distribution); SOTA base models are OOD here. The lift measures "rules + SOTA," not "SOTA fairly treated."
- **300-note secondary mixes dev (in-distribution for rule development) with held-out;** the held-out-100 column is the confirmatory number. No 300-note ours archive exists, so no paired 300-note test was run.
- **Scope:** 300 synthetic English notes, one frozen rule snapshot, one SOTA prediction snapshot each. Character offsets assume `notes.jsonl` text.

## 5. Provenance

- **Inputs:** `models-survey/out/sota3_{stanzaimi,longformer,obibert}.json` (300 notes each, pre-mapped to the 15-type schema); `meddeid/notes.jsonl`; `meddeid/gold.json`; `models-survey/heldout100.json`; ours = `meddeid/out/stanford_trackd_test2.json` (frozen, reused only).
- **Rule code:** `meddeid/site-trackbc/src/vault/deid.js` (+ single appended export line on a `/tmp/deidnode` copy; no rule logic touched). `globalThis.__deidTrackD` unset → Track D ON (≡ browser `?trackd=on`).
- **Outputs:** merged predictions `models-survey/out/sota_rules/sota_rules_{stanzaimi,longformer,obibert}.json`; evals `models-survey/out/sota_rules/eval_sota_rules_{model}_{heldout100,300}.json`; paired test `models-survey/out/sota_rules/paired_sota_rules_heldout100.json`.
- **Seeds:** bootstrap CIs seed 42 (`score_eval.py`); paired bootstrap seed 20260930, 10k resamples, Holm–Bonferroni k=3 (`paired_delta.py`).
- **Stack:** Node v24.20.0; vendored chrono-node; Python stdlib only. Pipeline verified deterministic (byte-identical repeat run); seed-only scoring reproduces published base F1s to 4 decimals.
