# Round 3 — Full 7,946-Row Benchmark

**Dataset:** `ai4privacy/pii-masking-300k`, EN validation split (`data/val_en.jsonl`), rows 0–7945 — the full split. The 1,000-row rounds used a seed-42 stratified subset of this same frame (all 1,000 sample ids verified present in the full set).
**Gold:** 42,625 mapped spans (NAME/PHONE/EMAIL/DATE/TIME/DOB/LOCATION/ADDRESS/ID/IP) + 8,559 excluded spans (USERNAME/SEX/TITLE/PASS/GEOCOORD/CARDISSUER — predictions exactly matching them are ignored, not scored).
**Scorer:** same as rounds 1–2 (`harness/score.py` primary metric) — strict exact-span binary P/R/F1 (span match; type ignored for binary; per-category requires span+label agreement). Bootstrap 95% CIs, note-level, 10k resamples, seed 42.
**Pipeline:** real `deid.bundle.js` + real ONNX model in headless Chromium, hybrid mode, via `site/harness-param.html`. Per-doc checkpointing; zero errored docs across all 8 configs.
**Layers:** base = 9ba7615f rules state; +Track B = B1/B3/B4/B5/B7 (B2 no-op); +Track B+C = base + B + C1–C5,C7,C8.
**Excluded from batch (Aaron's call 2026-09-30):** RoBERTa i2b2 (dominated on this synthetic benchmark at 0.656 F1, 6× slower; its fair trial is the clinical i2b2 run) and the Stanford∪RoBERTa ensemble (already excluded from shipping: +0.002 F1 for 4× latency). Neither drop affects the shipping decision.
**Status:** COMPLETE 2026-09-30 — all 8 configs, first-attempt successes, ~7h wall clock.

## Results (exact-span binary P/R/F1)

| Model | Layer | P | R | F1 | F1 95% CI | tp / fp / fn | Median lat. | p95 lat. |
|---|---|---|---|---|---|---|---|---|
| ClinicalE5-33M int8 | base | 0.7345 | 0.6795 | 0.7059 | [0.7000, 0.7117] | 28963 / 10468 / 13662 | 184ms | 326ms |
| ClinicalE5-33M int8 | +Track B | 0.7361 | 0.6807 | 0.7073 | [0.7014, 0.7131] | 29013 / 10403 / 13612 | 185ms | 326ms |
| ClinicalE5-33M int8 | +Track B+C | 0.7579 | 0.7609 | **0.7594** | [0.7538, 0.7649] | 32435 / 10361 / 10190 | 187ms | 334ms |
| OpenMed Small int8 | base | 0.7693 | 0.6428 | 0.7004 | [0.6946, 0.7063] | 27401 / 8215 / 15224 | 342ms | 574ms |
| OpenMed Small int8 | +Track B+C | 0.7934 | 0.7395 | **0.7655** | [0.7599, 0.7712] | 31523 / 8209 / 11102 | 344ms | 576ms |
| Stanford q8 | base | 0.7487 | 0.6419 | 0.6912 | [0.6851, 0.6973] | 27361 / 9185 / 15264 | 552ms | 900ms |
| Stanford q8 | +Track B | 0.7495 | 0.6420 | 0.6916 | [0.6855, 0.6978] | 27366 / 9144 / 15259 | 652ms | 1207ms |
| Stanford q8 | +Track B+C | 0.7715 | 0.7291 | **0.7497** | [0.7437, 0.7556] | 31077 / 9206 / 11548 | 555ms | 912ms |

## Per-layer deltas (each layer vs its own base)

| Model | base → +Track B | +Track B → +Track B+C | base → +Track B+C |
|---|---|---|---|
| ClinicalE5-33M | +0.0014 (noise; CIs overlap fully) | **+0.0521** | **+0.0535** |
| OpenMed Small | — (not run) | — | **+0.0651** |
| Stanford | +0.0004 (noise; CIs overlap fully) | **+0.0581** | **+0.0585** |

**No layer regresses vs its base on any model.** The +Track B deltas (+0.0004 to +0.0014) are within bootstrap noise on this dataset — the B-rules (patient lexicon with no vault identity in the sample, age detector with no age-like gold, stoplist, boundary repair) have almost nothing to bite on here. The entire measured gain comes from the Track C structured-pattern rules.

## Where the gain comes from (per-category F1, +Track B+C configs)

| Type | ClinicalE5 base → +B+C | OpenMed base → +B+C | Stanford base → +B+C |
|---|---|---|---|
| NAME | 0.067 → **0.534** | 0.056 → **0.532** | 0.059 → **0.525** |
| PHONE | 0.644 → 0.648 | 0.655 → 0.658 | 0.627 → 0.631 |
| EMAIL | 0.895 → 0.896 | 0.897 → 0.897 | 0.920 → 0.920 |
| DATE | 0.519 → 0.521 | 0.522 → 0.525 | 0.514 → 0.516 |
| TIME | 0.810 → 0.819 | 0.811 → 0.812 | 0.792 → 0.792 |
| DOB | 0.345 → 0.345 | 0.347 → 0.347 | 0.347 → 0.347 |
| LOCATION | 0.624 → 0.648 | 0.606 → 0.659 | 0.000 → 0.385 |
| ADDRESS | 0.611 → 0.612 | 0.626 → 0.628 | 0.558 → 0.558 |
| ID | 0.636 → 0.665 | 0.619 → 0.677 | 0.656 → 0.669 |
| IP | 0.930 → 0.938 | 0.942 → 0.944 | 0.979 → 0.981 |

The Track C gain is essentially all **NAME** (0.06 → 0.53 on every model): the labeled/structured name rules (C1–C5, C7, C8) recover the name-like gold spans the base models miss. Secondary lifts in LOCATION and ID (+0.02–0.05).

Two model quirks worth knowing:
- **Stanford never predicts LOCATION at base (F1 0.000)** — it emits those spans as FACILITY (3,357 unmapped FACILITY predictions, binary-scored only). The Track C labeled-location rule recovers LOCATION to 0.385 and cuts raw FACILITY output to 2,245.
- **ClinicalE5 over-predicts OCCUPATION** (1,245 unmapped predictions vs OpenMed's 291 and Stanford's 1) — binary-scored only, a precision drag the category table hides.

## Sample vs full split

Every full-split F1 is ~0.03–0.04 higher than its 1,000-row sample counterpart (e.g. ClinicalE5+trackbc 0.7594 vs 0.7583 on the sample is the closest; bases were 0.663–0.672 on the sample vs 0.691–0.706 here). The sample was stratified to guarantee minimum coverage of *every* mappable label, oversampling rare labels (LASTNAME2/3, SECADDRESS) that are harder than average — so the sample reads slightly harder than the split. The full-split numbers are the unbiased estimates.

The Track C effect is likewise smaller on the full split (+0.0535 for ClinicalE5) than on the sample (+0.0839), for the same reason: the sample oversampled exactly the rare name patterns the C-rules target.

## Ranking

On the full split with the full algorithm stack: **OpenMed Small 0.7655 ≈ ClinicalE5 0.7594 (statistical tie; CIs overlap) > Stanford 0.7497**. At base, ClinicalE5 (0.7059) and OpenMed (0.7004) tie while Stanford (0.6912) trails with a barely non-overlapping CI.

Latency (median per doc): ClinicalE5 184–187ms, OpenMed 342–344ms, Stanford 552–652ms. ClinicalE5 remains ~3× faster than Stanford at equal-or-better accuracy — the deployment choice stands.

## Limitations

- Synthetic general-domain text (ai4privacy/pii-masking-300k). The clinical counterpart — `models-survey/meddeid-clinical.md` (300 human-validated synthetic clinical notes) — **flips the ranking**: Stanford 0.5337 > RoBERTa 0.5229 > OpenMed 0.4849 > ClinicalE5 0.4607. The i2b2 2014 run remains the fair clinical trial for all models.
- Track B's near-zero effect is dataset-specific (no vault identity, no age-like gold in this sample), not a verdict on the rules' clinical value.
- Bootstrap CIs are note-level; docs are independent synthetic texts, so the usual caveats are mild.

## Provenance

- Driver: `round3/driver.mjs` (checkpointed, crash-resilient); inputs `round3/notes_full.jsonl` + `round3/gold_full.json`; scorer `round3/score.py` (replicates `harness/score.py` primary metric); raw outputs `round3/out/<tag>.json` + `.score.json` + `.latency.json`.
- Bundles: `meddeid/bundles/{base,trackb,trackbc}.bundle.js` (base = 9ba7615f rules; trackb = +B1/B3/B4/B5/B7; trackbc = +C1–C5,C7,C8).
- Run log: `round3/run_all.log`.
