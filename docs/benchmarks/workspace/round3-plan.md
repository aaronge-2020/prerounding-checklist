# Round 3 full-dataset benchmark — plan (updated 2026-09-30)

## Scope (Aaron's call 2026-09-30)

**Dropped from the batch:** RoBERTa i2b2 (thinkingface q8) and the Stanford∪RoBERTa ensemble.

**Rationale (record in round3-full.md):**
- The ensemble is already excluded from shipping (+0.002 F1 for 4× latency — its full-run number wouldn't change any decision).
- RoBERTa is dominated on this synthetic benchmark (0.656, 6× slower) and its fair trial is the clinical i2b2 run once access arrives, not more synthetic rows.
- Neither drop affects the shipping decision.

## New batch

| Model | Layers | Rows |
|---|---|---|
| ClinicalE5-33M int8 (shipping config) | base (9ba7615f rules) → +Track B → +Track B+C (C1–C5,C7,C8) | 0–7945 |
| Stanford (baseline) | base → +Track B → +Track B+C | 0–7945 |
| OpenMed Small int8 | base → +Track B+C | 0–7945 |

- **Dataset:** `data/validation/1english_openpii_8k.jsonl`, rows 0–7945, seed-42 split
- **Scorer:** same exact-span official scorer as rounds 1–2
- **Order:** fastest-first (ClinicalE5 → OpenMed Small → Stanford)
- **Checkpoint/resume:** per-doc; a browser relaunch must not lose progress
- **Time budget:** ~11h total (was ~2 days with RoBERTa/ensemble)
- **Reporting:** incremental as each model×layer completes; don't wait for the whole batch
- **Output:** `models-survey/round3-full.md` (full model × layer table with P/R/F1, latency, CIs); push to `docs/benchmarks/de-identification/` when complete
- **Regressions:** if any layer regresses vs its base, flag explicitly

## Status

**REORDERED 2026-09-30 (Aaron's call):** MedDeID clinical benchmark runs FIRST (300 notes, ~1-2h), then the 7,946-row batch.

### Phase 1: MedDeID clinical benchmark (COMPLETE 2026-09-30)
- Report: `models-survey/meddeid-clinical.md`
- Key finding: ranking flips on clinical text — Stanford (0.534 F1) > RoBERTa (0.523) > OpenMed (0.485) > ClinicalE5 (0.461). ClinicalE5 collapses on provider names (F1 0.074) and over-predicts occupations (189 FP).
- Char recall vs published: Stanford 88.64%, our RoBERTa 88.30% (beats their OBI RoBERTa 86.64%), trails GLiNER 90.27%.
- Regressions flagged: RoBERTa +B+C char recall −0.021 (real); Stanford +B F1 −0.003 (noise).
- Systematic gaps: AGE 0/100 detected (B3 blind spot), ID ~179/243 missed, PHONE over-prediction.

### Phase 2: Full 7,946-row batch (QUEUED — next)
- Dataset: `stighellemans/meddeid-english-synthetic-benchmark` (300 human-validated synthetic clinical notes)
- License: CC BY 4.0 (verified from dataset card — permits benchmarking with attribution)
- Models: ClinicalE5-33M, OpenMed Small, Stanford, RoBERTa i2b2 (RoBERTa included: 300 notes ≈ 26 min, not 23h)
- Layers: base, +Track B, +Track B+C (ClinicalE5, Stanford); base, +Track B+C (OpenMed Small, RoBERTa)
- Scoring: (1) our exact-span P/R/F1 (primary); (2) their character-level label-agnostic recall (vs published: RoBERTa i2b2 86.64%, GLiNER 90.27%, meddeid-english-synth 99.96%)
- Report: `models-survey/meddeid-clinical.md`

### Phase 2: Full 7,946-row batch (QUEUED)

## Layer definitions

- **base:** the 9ba7615f rules state (pre-Track-B)
- **+Track B:** B1 (patient lexicon), B3 (age detector), B4 (clinical stoplist), B5 (boundary repair), B7 (review prioritization); B2 thresholds at zero (no-op)
- **+Track B+C:** base + Track B + C1–C5, C7 (structured-pattern winners) + C8 (numbered-name-labels)

Note: the deployed shipping config is ClinicalE5 + Track B + Track C (all 8 rules), F1 0.7583 on the 1,000-row sample.
