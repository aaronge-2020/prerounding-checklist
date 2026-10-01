# EXPERIMENTS.md — experiment map

All paths below are relative to `docs/deidentification/` in this repository.

Every experiment behind the manuscript's numbers, where it lives, the exact
protocol, and what it proved. Metrics throughout: exact span micro F1
(primary) and character recall (label agnostic companion, immune to type
mapping and boundary convention differences).

## 1. MedDeID primary benchmark — `eval/`

- **Data:** 300 MedDeID synthetic clinical notes (see DATA.md). Split: dev 200
  / frozen held out 100, stratified by (document_type, locale), split seed
  `20260930`, IDs in `eval/split.json`. (Note text itself is excluded from git; see DATA.md.)
- **Protocol:** pre registered in `evaluation-framework.md` before any
  comparator ran: metrics, label mappings, model configs, and statistical
  tests fixed up front. Held out freeze: the 100 note test set was evaluated
  exactly twice during development, then frozen.
- **System under test:** Stanford clinical NER base model plus the frozen
  deterministic rule layer D1-D12 (source:
  `src/vault/deid.js` in this repo, plus `src/vault/deid/`). D1 clinical ages; D2 provider names with
  credentials and role anchors; D3 labeled clinical IDs; D4 care facility
  names; D5 relative/contact names; D6 facility phrase test plus remap and
  suppression filters; D7 locality/place names; D8 DATE to DOB relabel; D9
  name type relabels; D10 home address spans; D11 medical department
  ORGANIZATION suppression; D12 hallucinated name suppression.
- **Headline result (frozen held out 100):** our system F1 0.8718 (95 percent
  CI 0.8442 to 0.8977), character recall 0.9532.
- **What it proved:** the hybrid of a browser runnable base model and a small
  clinical rule layer reaches 0.87 exact span F1 on held out synthetic notes.
- **Reproduce:** score with `eval/score_dev.py` / `eval/score_test.py`; per-experiment result summaries (F1, CIs, per-type breakdowns) are committed in `eval/`.

## 2. Full size server side comparator evaluation — `reports/sota-full-eval.md`

- **Data:** the identical frozen held out 100 notes. Our archived predictions
  were reused, not regenerated.
- **Comparators (run as published, no rules):** StanfordAIMI
  stanford-deidentifier (F1 0.5065, char recall 0.8764), RiggsMed
  deid-LONGFORMER-NemPII (F1 0.3723, char recall 0.7247), OBI
  deid_bert_i2b2 (F1 0.1119, char recall 0.7049).
- **Statistics:** paired bootstrap over notes, 10,000 resamples, seed
  `20260930`; Holm Bonferroni correction across the three paired comparisons.
  All three favored our system at corrected p less than 0.0001.
- **Same distribution disclosure:** the published models' 0.96 to 0.99 i2b2
  scores are in distribution results on their training corpora; MedDeID is
  out of distribution for them and same distribution for our rule layer.
  Their published scores are not challenged. MedDeID's own reference
  (0.8911) is reported as a same distribution reference, not a universal
  ceiling.
- **What it proved:** on this out of distribution generalization test, the
  hybrid system beats the three public full size checkpoints by a wide
  paired margin.
- **Full writeup:** `reports/sota-full-eval.md`; model survey in `reports/real-sota-survey.md`.

## 3. Reviewer hardening batch — `reports/reviewer-hardening.md`

Five workstreams, run 2026-10-01 after the primary results were frozen.
Per stream detail lives in `reports/reviewer-hardening-stream1.md` through `reports/reviewer-hardening-stream5.md`. Held out 100 never touched.

### Stream 1 — comparator plus rules fairness evaluation

- **Question:** how much of our lead is the base model versus the rule layer?
- **Method:** applied our D1-D12 rule layer on top of each full size
  comparator's raw spans on the frozen held out 100, then rescored.
- **Result:** StanfordAIMI plus rules 0.8756, Longformer plus rules 0.859,
  OBI plus rules 0.856. StanfordAIMI plus rules versus our system (0.8718):
  paired p = 1.0, a statistical tie. The rule layer explains roughly 90
  percent of our final exact span F1.
- **Required caveats (disclosed with the numbers):** D1-D12 were developed
  using MedDeID dev notes, so adding them gives the out of distribution
  comparators a same distribution component; and the comparator merge
  skipped our base model's B2 thresholds and span constraints (fidelity
  caveat).
- **What it proved:** the rules, not the choice of base model, drive the
  results; any of the tested base models plus the rules reaches ~0.86.

### Stream 2 — Technetium-I schema remap rescore

- **Question:** is our low Technetium-I exact score (0.5273) a mapping
  artifact?
- **Method:** explicit schema remapping from our 15 types to Technetium's 7
  coarse types (`external/remap_tc_types.py`), then rescore the 1,500 note sample.
- **Result:** unchanged: exact span F1 0.5273, character recall 0.9971,
  overlap F1 0.7948. The gap is boundary conventions and annotation noise
  (bare numeral versus full age phrase; split versus merged addresses),
  not missed coverage. About 11.7 percent of Technetium gold AGE spans were
  nested inside phone numbers or medical record numbers.
- **What it proved:** near perfect character coverage on a second synthetic
  corpus; the exact span deficit is conventions, not capability.
- **Reporting rule:** never quote 0.5273 without the 0.9971 character recall
  and the convention analysis.

### Stream 3 — MIMIC-IV real text stability study: DROPPED

- A no gold robustness protocol on 200 MIMIC-IV-Note discharge summaries was
  designed (`reports/reviewer-hardening-stream3.md`) but **dropped 2026-10-01**:
  MIMIC-IV notes are already de-identified, so accuracy validation is
  impossible without surrogate PHI reinjection, and the stability design
  measures agreement on already redacted text. The reinjection alternative
  was declined. No data was downloaded and no DUA signature is needed.
  Excluded from the manuscript.

### Stream 4 — rule importance ablations (dev 200)

- **Method:** leave one rule group out, rescore on dev 200. (The temporary
  ablation script lived at `/tmp/ablate/ablate.mjs` and did not survive;
  the method and full ranking are recorded in `reports/reviewer-hardening-stream4.md`; the leave-one-out prediction dumps are committed as `eval/ablation_d1_off.json` through `eval/ablation_d12_off.json`.)
- **Result (F1 change when removed):** D3 -0.0770, D4 -0.0527, D6 -0.0441,
  D2 -0.0405, then D1, D10, D5, D7, D9, D8, D12, D11. D11 and D12 are
  precision filters so raw F1 change understates their value; the D6
  estimate is a documented lower bound.
- **What it proved:** labeled IDs (D3), facilities (D4), and the
  remap/suppression filters (D6) carry the rule layer; no single rule is
  load bearing alone.

### Stream 5 — residual error analysis (frozen held out predictions)

- **Method:** manual categorization of all residual errors in our archived
  held out predictions: 70 false negatives, 78 false positives verified.
- **Result:** 40 percent of false negatives were detected but assigned the
  wrong type (privacy safe despite failing exact typed scoring); 26 percent
  were boundary errors; 34 percent were genuine misses. Two facility
  boundary errors left genuinely identifying fragments exposed; they are
  disclosed as known limitations. All 31 pure false positives were
  overredaction. Estimated ceiling for this strict exact span metric is
  about 0.93 to 0.95, framed as a metric bound, not a system claim.
- **Limitation:** one annotator.
- **What it proved:** the system is privacy safe on the large majority of
  its residual errors; the metric punishes typing and boundary conventions
  harder than it punishes actual exposure.

### Rules alone ablations (dev 200, held out never touched)

- **D1-D12 alone (no base model, no B/C layers):** F1 0.6162 (P 0.9846,
  R 0.4484), character recall 0.4964. Ultra high precision specialists
  covering 7 of 15 gold types; blind to dates, phones, emails, occupations,
  organizations, patient names, MRNs. Predictions:
  `eval/rules_only.json`.
- **Full rule stack alone (all layers B/C/D, no base model):** F1 0.8944
  (P 0.912, R 0.878), character recall 0.9341, versus hybrid 0.9023
  (character recall 0.9771). The B/C layers (phone/email regexes, chrono
  dates, identity graph) closed the type gap; the remaining deficit is
  exactly the open vocabulary recall (novel names, towns, employers with no
  anchor) that no rule can enumerate. Caveats: D1-D12 were tuned on dev 200
  (partly memorization), and a rules only variant can never be validated on
  the frozen held out. Predictions: `eval/rules_full_only.json`.
- **What they proved:** the base model is not redundant. It supplies the
  broad recall foundation, especially for open vocabulary names in free
  narrative; the rules correct the clinical conventions models miss.
  Neither component is dispensable.

## 4. Technetium-I / ASQ-PHI external validation pipeline — `external/`

- **Pipeline:** run in the workspace (drivers per base model, resumable checkpoints); the schema remap and scorer survive here as `external/remap_tc_types.py` and `external/score_ta.py`. Summary scores are committed in `external/`; the 1,500-note sample gold is excluded from git (see DATA.md).
- **Technetium-I:** 1,500 note sample; our system (Stanford base + Track D)
  exact span F1 0.5273, character recall 0.9971. See DATA.md and stream 2
  above for the convention analysis.
- **ASQ-PHI:** 1,051 adversarial synthetic clinical queries (219 hard
  negatives); exact span F1 0.6239, character recall 0.9272. Treat as a
  different clinical query genre, not a replacement for note evaluation.
- **Checkpoints** record per model progress; the full four model matrix
  status should be checked in `checkpoints/` before claiming completion.
- **What it proved:** character level coverage transfers to two further
  synthetic corpora; exact span scores move with schema and genre.

## 5. wllama verifier prototype — `wllama-verifier/`

- **Design:** fully browser local second pass. The existing NER plus D1-D12
  rules run first; then a quantized instruction tuned LLM served by wllama
  (`@wllama/wllama`, WebGPU, worker based inference) rereads the note and
  returns JSON spans, which are mapped back to character offsets with
  documented handling of repeated strings. No remote API: the privacy goal
  of the project forbids it.
- **Evaluation plan (dev 200 only, never the frozen held out):** three
  configurations: NER plus rules; LLM alone; NER plus rules plus LLM
  verifier. Report exact span micro F1, character recall, mean latency, the
  change from adding the verifier, and categories of information caught
  only by the LLM.
- **Status:** prototype under construction (`wllama-verifier/driver.mjs`, `wllama-verifier/score.py`; the browser harness page did not survive as a committed file). `RESULTS.md` does not exist yet. No numbers are reported and none are promised; the manuscript describes the design as an implemented prototype with evaluation pending.
- **What it is for:** a recall safety net aimed at the residual misses
  categorized in stream 5, on the v2 track. The frozen D1-D12 system is
  untouched.

## Directory READMEs

`DATASET.md` and `LABEL_MAPPING.md` document the MedDeID label schema and the mapping to our 15 types. `reports/dataset-survey.md` surveys candidate external datasets and why each was chosen or rejected.
