# Round-2 de-identification model benchmarks

HYBRID mode only: each candidate model runs inside the app's actual de-id
pipeline (model + the shipped deterministic rules — structured safe-harbor
rules, temporal handling, identity expansion; review gate excluded).
Same 1,000-text sample (`data/sample.jsonl`, seed 42,
ai4privacy/pii-masking-300k English validation), same strict exact-span
scorer (`harness/score.py` logic), all inference inside headless Chromium via
onnxruntime-web (wasm, threaded). Model-only mode was not re-run in round 2.

## Recommendation

**Adopt OpenMed-PII-ClinicalE5-Small-33M-v1 (int8) as the default model.**
It has the highest strict exact-span F1 (0.672), the highest recall (0.629),
the lowest latency (390 ms/doc median), the smallest download (67 MiB), and
the fastest load (4 s). The app's current OpenMed Small is a close second
(F1 0.670, best precision at 0.765) and also beats the Stanford baseline.
The Stanford+RoBERTa ensemble is rejected: +0.002 F1 for 4× latency and
2.8 GB RAM.

## Pipeline re-sync (read this before comparing with round 1)

The benchmark harness vendors its own copies of the app pipeline
(`site/src/vault/deid.js`, `site/src/vault/deid/*`, bundled to
`deid.bundle.js`; same under `models-survey/site/`). Before round 2, every
copy was re-synced from the live repo source —
`aaronge-2020/prerounding-checklist` @ `9ba7615f` ("Apply de-identification
winning rules + BILOU label fix", the `?v=20260929-deid-rules` pipeline),
verified against the remote tree (`bae545c16eade346d87297128d041e465702010a`),
**not** from the shared worktree (which carried an unrelated uncommitted
edit at sync time). Compared with the pipeline round 1 measured, the
re-synced pipeline contains:

- the BILOU label fix (`^[BIUL]-` instead of `^[BI]-`), so BILOU-encoded
  models (the obi i2b2 family) are no longer silently dropped;
- the 10 winning rules from the rules-tuning pass (free-text clock times,
  international/trunk phone rules, tolerant DOB labels, address
  units/buildings, explicit numeric dates, plus the trunk-phone date guard
  and the folded-clock-time no-double-redact fixes);
- the `LOC → LOCATION` lexicon mapping and updated model-config notes.

Round-1 numbers (comparison.md, tuned-Stanford hybrid 0.537) were measured
against the pre-rules pipeline and are **not directly comparable** to round-2
numbers. The round-2 baseline below is the re-synced pipeline with the
Stanford default model.

A note on the baseline number: the rules-tuning pass reported a winning
hybrid of **0.7469 / 0.6031 / 0.6673** for the tuned pipeline. Re-running the
committed `9ba7615f` pipeline verbatim (byte-verified against the remote
blobs; three independent full runs, entity-identical across all 1,000 texts)
gives hybrid exact-span **P 0.7407 / R 0.6006 / F1 0.6633**. The gap is real
and deterministic, not measurement noise: between the tuning's winning
measurement and the commit, the DOB-with-separators and decades DATE rules
were removed (DATE −21 true positives), the folded-clock-time no-double-redact
guard was added (TIME −18 true positives), and the wider-span overlap fix
landed (ADDRESS +83 false positives, via overlap resolution). Net effect:
−0.004 F1. The committed code is the shipped pipeline, so round 2 uses the
measured **0.741 / 0.601 / 0.663** as its baseline; every candidate below is
scored against that same pipeline, so the comparisons are apples-to-apples.

## Candidates

| # | Candidate | Artifact benchmarked | Size MiB | Notes |
|---|---|---|---|---|
| 1 | obi/deid_roberta_i2b2 (RoBERTa, i2b2 2014) | thinkingface/deid_roberta_i2b2_q (community q8 ONNX conversion; id2label verified byte-identical to obi's 45-label BILOU schema) | 341.8 | app registry lists obi/deid_roberta_i2b2 as an offline PyTorch reference (browserRunnable: false) — no first-party ONNX exists |
| 2 | OpenMed Small (app's OPENMED_SMALL_MODEL_ID = Wismut/openmed-onnx/small) | Wismut/openmed-onnx @ 763dff8d (app-pinned revision), small/model_int8.onnx | 172.1 | run with the app's shipped config: dtype int8, wasm, aggregation simple |
| 3 | OpenMed-PII-ClinicalE5-Small-33M-v1 | OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android (official ONNX export), model_int8.onnx | 67.1 | loaded without heroics, so tested |
| 4 | Ensemble (Stanford default + best RoBERTa, span union) | report-only | 447.3 combined | — |
| 5 | StanfordAIMI/stanford-deidentifier-with-radiology-reports-and-i2b2 | not benchmarked | — | PyTorch-only; no onnx-community conversion exists; optimum export not attempted (see follow-ups) |

## Results (exact-span P/R/F1, hybrid)

| Model | P | R | F1 | Median ms/doc | p95 ms/doc | Load s | Size MiB | Verdict |
|---|---|---|---|---|---|---|---|---|
| Stanford deidentifier, re-synced pipeline (baseline) | 0.741 | 0.601 | **0.663** | 825 | 1528 | 11.0 | 105.5 | baseline |
| obi/deid_roberta_i2b2 (via thinkingface q8) | 0.708 | 0.611 | 0.656 | 5238 | 12833 | 15.4 | 341.8 | below baseline; higher recall, far slower |
| OpenMed Small (int8) | 0.765 | 0.595 | **0.670** | 623 | 1485 | 18.6 | 172.1 | **beats baseline**; best precision |
| OpenMed-PII-ClinicalE5-Small-33M-v1 (int8) | 0.722 | 0.629 | **0.672** | 390 | 892 | 4.0 | 67.1 | **best F1, recall, speed, size** |
| Ensemble: Stanford ∪ RoBERTa | 0.677 | 0.653 | 0.665 | 3441 | 7221 | 9.2 | 447.3 | **not recommended**; +0.002 F1 for 4× latency, 2.8 GB RAM |

## Per-category exact-span F1 (hybrid)

| Category | Stanford | RoBERTa i2b2 | OpenMed Small | ClinicalE5 Small |
|---|---|---|---|---|
| NAME | 0.056 | 0.047 | 0.049 | 0.055 |
| PHONE | 0.638 | 0.607 | 0.664 | 0.649 |
| EMAIL | 0.914 | 0.888 | 0.890 | 0.888 |
| DATE | 0.517 | 0.519 | 0.530 | 0.523 |
| DOB | 0.339 | 0.339 | 0.339 | 0.339 |
| TIME | 0.775 | 0.775 | 0.790 | 0.779 |
| ADDRESS | 0.589 | 0.589 | 0.648 | 0.619 |
| LOCATION | 0.000 | 0.418 | 0.620 | 0.634 |
| ID | 0.653 | 0.627 | 0.623 | 0.640 |
| IP | 0.957 | 0.957 | 0.919 | 0.919 |

The standout is LOCATION: the Stanford default emits no location entities at
all (F1 0.000), while the OpenMed models find them well (0.620–0.634) and the
RoBERTa i2b2 model moderately (0.418, via the `LOC → LOCATION` lexicon
mapping the re-synced pipeline added). NAME is poor for every model
(0.047–0.056) — strict exact-span name matching is dominated by the
pipeline's deterministic identity-expansion rules, not the model. EMAIL and IP
are rule-dominated and uniformly strong.

## What the numbers mean, per candidate

**obi/deid_roberta_i2b2** (F1 0.656) — the i2b2-2014 RoBERTa is the model the
app registry already lists as an offline reference, and this round finally
measures it in a browser: via the community q8 ONNX conversion
(`thinkingface/deid_roberta_i2b2_q`), whose 45-label BILOU id2label was
verified identical to obi's. The re-synced pipeline's BILOU fix is what makes
this run possible at all — round 1's pipeline silently dropped BILOU labels.
It recalls slightly more than the Stanford baseline (0.611 vs 0.601) but
precision falls further (0.708 vs 0.741, +239 false positives), so F1 lands
below baseline. It is also by far the slowest candidate: 5.2 s median per
document (p95 12.8 s) and a 342 MiB download. Not a replacement on its own.

**OpenMed Small** (F1 0.670) — the app's own `OPENMED_SMALL_MODEL_ID`
(`Wismut/openmed-onnx/small`, app-pinned revision `763dff8d`, int8, wasm),
run exactly as the app configures it. It beats the Stanford baseline on F1
(+0.006) with the best precision of the round (0.765, 155 fewer false
positives than baseline) at a small recall cost (0.595 vs 0.601). It is also
faster than the baseline (623 ms vs 825 ms median). Its edge comes largely
from LOCATION (F1 0.620 vs Stanford's 0.000) and ADDRESS (0.648 vs 0.589).

**OpenMed-PII-ClinicalE5-Small-33M-v1** (F1 0.672) — the official 33M-parameter
ONNX export, int8. The best overall: highest F1 (+0.009 over baseline),
highest recall (0.629, +191 true positives vs baseline), fastest (390 ms
median, p95 892 ms), smallest download (67 MiB), fastest load (4 s). LOCATION
F1 0.634 and TIME recall lead the round. The precision/recall trade favors
recall more than OpenMed Small does (0.722 vs 0.765 precision), but the net F1
is the highest measured.

## Ensemble detail — not recommended

The ensemble loads the Stanford default and the RoBERTa i2b2 model, runs each
text through the full hybrid pipeline twice, and unions the entity spans
(deduped by character offset, higher model score wins). Results:

- Hybrid exact-span: **P 0.677 / R 0.653 / F1 0.665** (tp 3677, fp 1754, fn 1951)
- vs Stanford baseline (0.741 / 0.601 / 0.663): +297 true positives, but +571
  false positives. Net **+0.002 F1**.
- Latency: 3.4 s median per document (p95 7.2 s) — Stanford 637 ms + RoBERTa
  2.7 s per doc, run sequentially.
- Cost: 447 MB combined download; 9.2 s load; **2.8 GiB peak Chromium RSS**
  with both models resident (441 MB JS heap after load).
- The union notably degrades ID precision (F1 0.599 vs baseline 0.653, 767
  false positives) and LOCATION (F1 0.320 vs RoBERTa-alone 0.418) — the two
  models' disagreements add noise faster than they add signal.

**Recommendation: reject.** Two thousandths of F1 is not worth 4× latency,
2.8 GB of RAM, and a 447 MB download — especially when the single
ClinicalE5-Small model beats the ensemble outright (F1 0.672) at 390 ms/doc
and 67 MB. If recall is ever the priority, ClinicalE5's 0.629 recall at a
fraction of the cost dominates the ensemble's 0.653.

## Follow-ups

- StanfordAIMI/stanford-deidentifier-with-radiology-reports-and-i2b2
  (revision `d9b30bc3`, 2026-09-29): ships only `pytorch_model.bin` (BERT,
  8 BIO labels) — no ONNX artifact, and no onnx-community conversion of this
  checkpoint exists. A local optimum export was not attempted: the box has no
  PyTorch/optimum toolchain installed, and a from-scratch install plus
  400 MB+ model download during active benchmarking was not a
  "straightforward attempt". Its published 98.9 is a relaxed span-core
  metric, not comparable to the strict exact-span scores above.
- The 0.004 F1 gap between the tuning's reported winning number (0.6673) and
  the committed pipeline's measured 0.6633 is documented above; if the
  removed DOB/decades rules are wanted back, that is a product decision, not
  a benchmark artifact.

## Reproducibility

- Round-2 harness: `models-survey/harness/survey2_driver.mjs` (checkpoint
  resume + browser-relaunch resilience, `--dtype` passthrough),
  `models-survey/harness/score_round2.py` (stock `harness/score.py` counting,
  hybrid mode only), `models-survey/site/survey2.html` (round-1 survey.html +
  `?dtype=`), `models-survey/site/survey2_ensemble.html`.
- Raw outputs: `models-survey/results-round2/raw_<slug>_hybrid.json`
  (1000 docs each); per-slug scores:
  `models-survey/results-round2/results_<slug>.json`.
- Survey server ran on port 8903 (main harness server on 8902).
- Latency caveat: the box is shared with concurrent work. The baseline's
  latencies were measured during a concurrent full run and are likely
  inflated; all candidate latencies were measured on an otherwise idle box
  and are directly comparable with each other.
