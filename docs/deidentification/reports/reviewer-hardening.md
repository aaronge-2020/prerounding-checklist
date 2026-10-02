# Reviewer Hardening Package — De-identification Manuscript

**Date:** 2026-10-01
**Coordinator batch:** five parallel streams, each delivered as its own section file (listed below). This file assembles one condensed section per stream plus the coordinator's headline findings and manuscript inclusion recommendations.

**Standing constraints (all streams):** no new held out evaluations of our system or variants — frozen prediction archives reused, never regenerated; scoring the three SOTA models on held out data was explicitly allowed. No tuning. No rule changes. No manuscript edits. No API based LLM baselines (Aaron rejected these on privacy grounds: the whole point of the work is privacy). Everything reproducible: seeds, versions, dates, file paths.

---

## Headline findings (one per stream)

1. **Frozen D1 through D12 rules lift every SOTA model to about 0.86.** On the frozen held out 100 notes, the rule layer raises StanfordAIMI 0.507 to 0.876, Longformer 0.372 to 0.859, and OBI-BERT 0.112 to 0.856. StanfordAIMI plus rules is a statistical tie with our system (0.8756 vs 0.8718, paired p = 1.0); per type F1s converge to near identical values across all base models. The honest headline is that the rule layer, not the base model, explains roughly 90 percent of our 0.872. The asymmetry a reviewer will press on: the rules were written against MedDeID dev notes, so they are an in distribution component and the SOTA models received them as a gift.

2. **Technetium-I rescore: the explicit 15 to 8 remap was numerically a no-op** (0.5273 to 0.5273) because the scorer already handled granularity. The real gaps are boundary conventions (gold annotates the bare numeral "24" where we emit "24 years"; gold splits addresses into street, city, and ZIP where we merge them) plus gold injection noise (11.7 percent of gold AGE spans sit inside phone numbers or MRNs). Character recall is 0.9971. The 0.527 must never be quoted without the convention analysis.

3. **MIMIC-IV real text stability study: design only, no data touched.** A pre registered no gold robustness protocol on 200 MIMIC-IV-Note discharge summaries: near duplicate pair agreement, within note entity consistency, and redaction density drift. Aaron's remaining step is signing the MIMIC-IV-Note specific DUA (his PhysioNet credentialed account is already done as of 2026-09-29). Recommendation: GO as a robustness supplement, never as accuracy evidence.

4. **Leave one rule group out ablation (dev 200).** Marginal ΔF1 ranking: D3 labeled IDs -0.0770, D4 facilities -0.0527, D6 label corrections -0.0441, D2 provider names -0.0405, D1 clinical ages -0.0301, D10 home addresses -0.0294, D5 relative names -0.0185, D7 locations -0.0135, D9 relative relabel -0.0121, D8 DOB relabel -0.0112, D12 name filter -0.0050, D11 org filter -0.0043. Four groups each carry more than 0.04 F1. D12 and D11 are precision filters whose small deltas understate their false positive reduction. D6 off is a lower bound (part of D6 is baked into the base for all configs).

5. **Residual error analysis (held out 100; 70 FNs, 78 FPs, verified).** 40 percent of FNs are "caught but mistyped" (redacted, wrong type, privacy safe); 26 percent are boundary errors (mostly rule fixable; two facility truncations leak genuinely identifying fragments); 34 percent are genuine misses (a mix of easy rule gaps and genuinely hard cases). All 31 pure FPs are over redaction, the privacy safe direction. A realistic ceiling on this exact span type sensitive metric is about 0.93 to 0.95.

---

## Stream 1 — Do the frozen D1 through D12 rules lift SOTA models too?

**Full section:** `reviewer-hardening-stream1.md`

**Question:** Is our system's 0.872 held out F1 driven by the Stanford clinical base model or by the D1 through D12 rule layer?

**Method:** The browser hybrid pipeline was traced step by step in `deid.js` and replicated in Node, substituting SOTA spans for base model spans at exactly the point the real pipeline consumes them, with zero rule code altered. SOTA seeds without rules reproduce the published base held out F1s to 4 decimals, so the conversion is lossless. Frozen ours archive `meddeid/out/stanford_trackd_test2.json` reused throughout; no our-system held out eval re-run. Bootstrap 95% CIs (seed 42); paired ΔF1 tests with Holm Bonferroni k = 3.

**Results (frozen 100 note held out set):**

| Variant | Exact F1 | Paired Δ vs ours | p (Holm, k=3) |
|---|---|---|---|
| Ours (Stanford + D1 through D12, frozen) | 0.8718 | — | — |
| StanfordAIMI + rules | 0.8756 | -0.0039 | 1.0000 |
| Longformer-NemPII + rules | 0.8586 | +0.0131 | 0.4768 |
| OBI-BERT i2b2 + rules | 0.8559 | +0.0158 | 0.0396 |

Every SOTA model gains enormously (+0.37, +0.49, +0.74). No SOTA plus rules variant significantly beats our system; all three land within 0.016 of it. Per type, all three models converge to nearly identical scores matching ours type for type (DOB 0 to 1.00, ADDRESS 0 to 0.96 to 0.97, MRN 0 to 0.48 up to 0.93, AGE 0 to 0.03 up to 0.94, OCCUPATION 0 to 1.00). Massive FP cleanup too (OBI-BERT ID: 1 tp / 172 fp becomes 86 tp / 2 fp).

**Honest interpretation:** this answers the "weak base model" reviewer objection and sharpens it. Even the published SOTA checkpoints need this rule layer to reach 0.86 on MedDeID style notes, and with the rules they merely tie our system. But the reviewer will then correctly pivot to "your rules are fit to this synthetic distribution," which must be conceded upfront. The held out numbers are still legitimate generalization of the rule layer *within* this synthetic distribution; generalization *across* distributions (i2b2 2014) is stated future work, not claimed here.

**Limitations:** SOTA spans skip the B2 per label score thresholds and span constraining that our Stanford base predictions passed through (direction of bias likely small, disclosed). Rules are in distribution, SOTA base models are out of distribution. The 300 note secondary mixes dev with held out.

**Artifacts:** `models-survey/out/sota_rules/` (merged predictions, evals, paired test).

---

## Stream 2 — Technetium-I schema remap and rescore

**Full section:** `reviewer-hardening-stream2.md`

**Task:** Fix the label schema mapping between our 15 PHI types and the Technetium-I gold schema (realized as 8 types: NAME, ID, DATE, DOB, AGE, PHONE, EMAIL, LOCATION; DOB is sampler derived), rescore the 1,500 note sample, and diagnose the remaining zero F1 types.

**Method:** Deterministic type remap of predictions toward the gold schema (gold untouched; OCCUPATION explicitly dropped with 0 instances; DOB to DATE rejected because gold keeps DOB separate and our DOB is already exact). Rescored with the unmodified `score_ta.py`; the original scores were backed up and restored byte identical afterward.

**Results:** The explicit remap is numerically a no-op: exact F1 0.5273 [0.5256, 0.5293] before and after, identical to 4 decimals; character recall 0.9971 [0.9967, 0.9975]. The scorer's built in `TC_GROUPS` already implemented exactly this granularity handling. The stream's real result is the corrected diagnosis:

- **AGE exact F1 = 0.0** is boundary convention plus gold injection noise, not detection failure: gold annotates the bare numeral ("24") while we emit the full phrase ("24 years"); overlap F1 for AGE is 0.8931 with overlap precision 1.0000. Separately, 434 of 3,718 gold AGE spans (11.7 percent) are nested inside other gold spans (age digits labeled inside phone numbers, MRNs, street numbers).
- **LOCATION exact F1 = 0.0** is granularity convention: gold splits each address into street, city, ZIP; we emit one coarse ADDRESS span. Character recall for LOCATION is 1.0000; overlap precision 0.9993. Any address level system faces the same ceiling.
- **NAME exact F1 = 0.3616** is two convention effects with zero genuine misses: gold splits "Sarah" plus "Garcia" while we emit "Sarah Garcia" (every gold NAME span overlaps at least one of our predictions), and all 1,500 "Dr. X" provider name occurrences in the notes are unannotated in gold, so provider name redaction is penalized as false positives. That is a schema coverage artifact.
- **DATE (F1 0.8840)** is the only non convention gap: exact recall 1.0000, precision 0.7922 from DATE typed spans the template gold does not annotate.

**Honest interpretation:** on 1,500 stratified template generated discharge summaries, the frozen system achieves near complete detection level coverage (character recall 0.9971; DOB, EMAIL, ID, PHONE exact F1 at or above 0.994). The 0.527 exact span micro F1 is reproducible and tightly bounded but dominated by annotation conventions, not failures to find PHI. The initial hypothesis (AGE and LOCATION zeros are a label schema artifact) was wrong in mechanism; the type mapping was already correct, and the zeros are boundary and granularity artifacts. Template generated notes, gold by construction, unreviewed; 1,500 note sample of 74,700; gold DOB is sampler derived.

**Artifacts:** `technetium-asq/remap_tc_types.py`, `technetium-asq/out/tc_stanford_remapped.json`, `technetium-asq/technetium_scores_remapped.json`, `technetium-asq/technetium_scores.json` (untouched, md5 verified).

---

## Stream 3 — Real text stability study design (MIMIC-IV-Note)

**Full section:** `reviewer-hardening-stream3.md`

**STATUS — DROPPED 2026-10-01 by Aaron's decision.** Aaron's objection: MIMIC-IV-Note is already de-identified, so an accuracy validation is impossible without surrogate PHI reinjection, and the no-gold stability design measures agreement on already-redacted text. The surrogate-reinjection alternative was offered and declined. No DUA signature needed. The design below is preserved for the record only and must not appear in the manuscript.

**Access path (verified 2026-09-30):** MIMIC-IV-Note v2.2, 331,794 discharge summaries plus 2,321,355 radiology reports, Beth Israel Deaconess Medical Center; PHI replaced with exactly three underscores; PhysioNet credentialed data flow. Aaron's CITI plus credentialing reported done 2026-09-29. Remaining step: sign the MIMIC-IV-Note specific DUA (credentialing alone does not unlock it; typically 24 to 48 h approval). Then download `discharge.csv.gz` only.

**Design:** Population is discharge summaries only (long form narratives, maximal real world messiness; radiology reports excluded as too templated). Sampling: pre registered seed, 200 discharge summaries in a 100 patient by 2 note stratified scheme so copy forward pairs always exist; pre registered exclusions (notes under 500 characters, pure addenda). System runs exactly once per note plus the pair runs, no tuning passes.

**Three no gold metrics (exact definitions in the section file):**
- **M1, near duplicate pair agreement:** for each patient pair with token set Jaccard at or above 0.5, agreement equals intersection over union of redacted spans within aligned identical text windows. Report median, IQR, percent of pairs at or above 0.90; pre registered success criterion is at least 80 percent of pairs at or above 0.90.
- **M2, within note entity consistency:** for strings redacted at least once and occurring at least twice, consistency rate is occurrences redacted with identical span and type over total occurrences; micro average over all repeated strings.
- **M3, redaction density drift:** spans per 1,000 tokens and PHI type distribution vs MedDeID dev 200. A drift check, not a quality claim.

Bootstrap 95% CIs, 10k note level resamples, seed 20260930; all three metrics pre registered before any inference. Sample size justification: n = 200 gives tight CIs for the claims made; 10 to 15 min of compute; not sized for accuracy estimation, which is impossible without gold.

**Honest limitations:** no accuracy claim is possible; the three underscore placeholders distort the input distribution (rules built for real PHI fire on placeholders, so this is a weaker signal, disclosed explicitly); the notes carry residue of someone else's de-identification pipeline, which may inflate apparent robustness; single institution, US only.

**GO recommendation:** with scope kept exactly as designed. Cheap, pre registrable, directly answers the reviewer's real text question at the only level honest without gold. Must be framed in the manuscript as a robustness and stability supplement, never as accuracy evidence. Data handling plan: download only, sample, delete the rest; no note text leaves the machine; no data committed to any repo.

---

## Stream 4 — Leave one rule group out ablation (Track D, D1 through D12)

**Full section:** `reviewer-hardening-stream4.md`

**Objective:** Rank the twelve Track D rule groups by marginal contribution to exact span F1 on the dev 200 set. Each ablation disables exactly one group and reruns the full hybrid pipeline. No tuning, no changes to the shipped system, no held out evaluations.

**Method:** A faithful replication harness (`/tmp/ablate/ablate.mjs`) imports the shipped rule adders, merge, and false positive filter directly from the unmodified `deid.js` and replays the Track D delta, seeded from the archived base run. Sanity check: harness full stack scores 0.9049 vs archived browser 0.9023 (+0.0026); the 4 residual entity diffs were adjudicated against gold and 3 of 4 favor the harness, so the offset is not a replication failure. Unmodeled identity graph interactions bounded at about 0.003 F1. Deltas reported vs the harness full stack for internal consistency.

**Ranked results (ΔF1 vs harness full F1 = 0.9049, dev 200, 95% bootstrap CIs):**

| Rank | Group | ΔF1 |
|---|---|---|
| 1 | D3 labeled IDs | -0.0770 |
| 2 | D4 facilities | -0.0527 |
| 3 | D6 label corrections | -0.0441 |
| 4 | D2 provider names | -0.0405 |
| 5 | D1 clinical ages | -0.0301 |
| 6 | D10 home addresses | -0.0294 |
| 7 | D5 relative names | -0.0185 |
| 8 | D7 locations | -0.0135 |
| 9 | D9 relative relabel | -0.0121 |
| 10 | D8 DOB relabel | -0.0112 |
| 11 | D12 name filter | -0.0050 |
| 12 | D11 org filter | -0.0043 |

**Weight carriers:** four groups each cost more than 0.04 F1. D3 is the single largest contributor (ID F1 collapses 0.953 to 0.493 without it; it also suppresses 103 PHONE FPs). D4 does double duty as facility adder and organization precision guard (without it, ORGANIZATION FPs rise 1 to 52). D6 is almost entirely the DATE duration suppression (without it, DATE FPs rise 20 to 120). D2 recovers more than half of provider mentions the model alone misses or mislabels. In the middle tier, D1 owns AGE (0.969 to 0.029), D10 owns ADDRESS (0.958 to 0.652), D5 plus D9 are the NAME recall engines, D7 is the sole source of all 17 LOCATION TPs, D8 keeps DOB at 1.000. D12 and D11 are precision filters with small overall deltas but clear per type effects (D12: 12 fewer "the" style name FPs; D11: 11 fewer department style ORGANIZATION FPs); the F1 delta understates their value.

**Caveats:** D6 off is a lower bound (D6a and the pre filter D6b application are baked into the base for all configs). Leave one out understates jointly necessary groups. Dev only, no generalization claim. Deltas relative to the harness full stack.

**Artifacts:** predictions `meddeid/out/ablation_d1_off.json` through `ablation_d12_off.json`; harness `/tmp/ablate/ablate.mjs`.

---

## Stream 5 — Residual error analysis (held out FNs and FPs)

**Full section:** `reviewer-hardening-stream5.md`

**Scope:** Archived predictions only (`meddeid/out/stanford_trackd_test2.json`, 100 held out notes vs gold). No new model runs, no held out re evaluation, no tuning, no rule changes. All notes synthetic. Verification: 70 FNs and 78 FPs, matching the reported 0.872 F1 (P 0.866, R 0.878).

**Method:** All 70 FNs and 78 FPs enumerated programmatically; stratified random sample of 48 FNs reviewed with context (seed 7); the top level taxonomy computed over all 70 FNs, not just the sample; the 31 FPs with no gold overlap sampled separately.

**FN taxonomy:**
- **Bucket A, caught but mistyped (28 of 70, 40.0 percent):** exact span, wrong PHI type label. Bare 7 to 9 digit identifiers labeled PHONE instead of ID or MRN (genuinely ambiguous; redacted either way); family and other names assigned the nearest role bearing label (privacy neutral); role swaps with identical spans; organization to facility relabeling. These are *scoring* errors under the type sensitive metric, not *privacy* errors. A label equivalence map would erase most of this bucket with zero privacy cost.
- **Bucket B, boundary errors (18 of 70, 25.7 percent):** overlapping prediction, span off by a token. The most privacy relevant class: two facility truncations leak genuinely identifying fragments ("OTTERY ST." remains readable; "- Sparrow Eaton" leaks). The rest are deterministic and rule fixable: trailing periods on initialisms, apostrophe split emails, age unit retention, over extension into preceding role words (privacy safe over redaction).
- **Bucket C, genuine misses (24 of 70, 34.3 percent):** no overlapping prediction. Lowercase names in validation and signature blocks, ALL CAPS names, initial form names, single uncommon names, ISO and ordinal dates, one short cued address, two facilities, and two debatable gold items ("day 3 of life" labeled AGE; "Mid Walls" labeled caregiver LOCATION).

**FP patterns:** all 31 pure FPs are over redaction, the privacy safe direction. Relative durations labeled DATE (the known deliberate D6b behavior), clinical and role prose labeled NAME or FACILITY (salutations, "Full PFTs", "labored"), miscellaneous artifacts (one 9 digit number that looks like a genuine identifier gold may have missed, i.e. annotation noise).

**Honest interpretation:** the largest error class (40 percent of FNs) is not a privacy failure and the headline F1 understates real world de identification quality on a privacy weighted metric. Bucket B is the highest privacy value work remaining and is rule fixable. Annotation noise cuts both ways and is non trivial (roughly 5 to 8 metric points of noise estimated from the sample). Headroom: fixable with rules covers most of Bucket B plus roughly half of Bucket C, plus schema normalization of Bucket A (metric repair, not privacy repair) plus annotation noise resolution. A realistic ceiling on this exact span type sensitive metric is on the order of **0.93 to 0.95**; the remainder is irreducible ambiguity (generic organization names, rare single names, annotator judgment calls).

**Limitations:** single annotator; 48 FN sample (top level proportions computed over all 70 and agree closely); synthetic notes only, so error patterns partly reflect synthetic generation artifacts; archived predictions only.

---

## Manuscript inclusion recommendations (coordinator)

These are recommendations only. No manuscript edits were made; integration is a separate decision for Aaron.

1. **Stream 1 (SOTA plus rules): include in main text.** This is the strongest reviewer shield in the package: it preempts the "your base model is weak" objection with a paired, significance tested result, and it reframes the system honestly as rule driven. Suggested shape: one compact table (held out 100, four rows) plus one paragraph, with the asymmetry disclosure stated in the same paragraph (rules were developed on MedDeID dev notes; SOTA models are out of distribution here; cross distribution generalization to i2b2 2014 is stated future work). Do not report the 300 note secondary numbers in main text; they mix dev with held out.

2. **Stream 2 (Technetium-I): include as a supplement, never in main text.** The publishable part is the convention analysis (boundary granularity, gold injection noise, provider name coverage gap), not the 0.527. Report exact F1 0.5273 [0.5256, 0.5293] alongside character recall 0.9971 and overlap F1 0.7948, with the explicit warning that the exact span number must not be quoted without the convention analysis. One table and one paragraph in the supplement is enough.

3. **Stream 3 (MIMIC-IV design): mention only as pre registered future work,** and only the design, with the limitation that no accuracy claim is possible without gold. Run the study first (Aaron signs the DUA), then include the observed numbers framed as a robustness supplement. Do not promise results in the manuscript.

4. **Stream 4 (ablation): include condensed, in Methods or supplement.** The top four groups (D3, D4, D6, D2) plus the precision filter note for D11 and D12 directly answer "which rules matter." A small ranking table with the D6 lower bound caveat is the right shape; dev only, no generalization claim.

5. **Stream 5 (residual errors): include in Discussion or supplement.** Reviewers expect residual error analysis; this one is unusually honest (40 percent of FNs are not privacy failures; the two facility truncation leaks are named as the real residual risk; ceiling estimate 0.93 to 0.95). Report the three bucket taxonomy and the all FPs are over redaction finding. Do not present the ceiling as a claim about real text.

**Cross stream note for the manuscript:** Streams 1 and 4 together make the central claim cohere: the ablation shows which rules carry the system, and the SOTA plus rules experiment shows those rules transfer across base models. Stream 5 bounds what the metric means. Stream 2 bounds what external template data means. Stream 3 is the planned real text complement. Nothing in this package changes the frozen 0.872 held out number or any shipped behavior.

---

## Artifact index

- Stream sections: `~/workspace/deid-benchmark/models-survey/reviewer-hardening-stream1.md` through `reviewer-hardening-stream5.md`
- Stream 1 predictions and evals: `~/workspace/deid-benchmark/models-survey/out/sota_rules/`
- Stream 2 remap script and scores: `~/workspace/deid-benchmark/technetium-asq/remap_tc_types.py`, `~/workspace/deid-benchmark/technetium-asq/out/tc_stanford_remapped.json`, `~/workspace/deid-benchmark/technetium-asq/technetium_scores_remapped.json`
- Stream 4 ablation predictions: `~/workspace/deid-benchmark/meddeid/out/ablation_d1_off.json` through `ablation_d12_off.json`; harness `/tmp/ablate/ablate.mjs` (ephemeral)
- Stream 5 source: `~/workspace/deid-benchmark/meddeid/out/stanford_trackd_test2.json` (frozen archive, reused only)
- Seeds: bootstrap CIs seed 42; paired ΔF1 seed 20260930, 10k resamples, Holm Bonferroni k = 3; stream 5 sampling seed 7; Technetium sample seed 20260930; MedDeID split seed 20260930

---

## Rules alone ablation (no base model)

**Date:** 2026-10-01. **Purpose:** decompose the base-model contribution versus the Track D rule contribution by running the D1-D12 rule layer with zero NER model entities on dev-200.

**Method.** Replicated the hybrid pipeline's entity-production path but called only the Track D generators plus Track D remap/suppression logic: D2/D3/D4/D5/D7/D10 raw-text generators -> mergeEntities (D6a via refineNameLabel) -> filterLikelyFalsePositiveEntities (D6b trackDFilterDecision) -> the final Track D filter block replicated verbatim from resolvedRedactionEntities (deid.js L3492-3560: D6b tail, D8, D9, D11, D12) -> D1 post-filter ages. Excluded: base model, Track B/C generic patterns, chrono temporal fallback, identity-graph expansion, bracket placeholders. Harness: /tmp/rules_only_ablation.mjs (ephemeral); predictions: meddeid/out/rules_only.json. Scored with track-d/score_dev.py. Dev-200 only; the held-out 100 was never touched (a rules-only variant is a new system, so held-out is off limits).

**Results (dev-200, n=200).** Exact-span micro-F1 **0.6162** (P=0.9846, R=0.4484; tp=513, fp=8, fn=631). Character recall **0.4964**.

Per-type exact-span F1 (tp/fp/fn):

| Type | P | R | F1 | tp/fp/fn |
|---|---|---|---|---|
| AGE | 1.000 | 0.940 | 0.969 | 63/0/4 |
| FACILITY | 1.000 | 0.980 | 0.990 | 99/0/2 |
| ID | 1.000 | 0.934 | 0.966 | 141/0/10 |
| ADDRESS | 1.000 | 0.616 | 0.763 | 45/0/28 |
| LOCATION | 1.000 | 0.739 | 0.850 | 17/0/6 |
| NAME | 1.000 | 0.738 | 0.849 | 59/0/21 |
| PROVIDER NAME | 1.000 | 0.736 | 0.848 | 89/0/32 |
| DATE | 0 | 0 | 0 | 0/0/105 |
| DOB | 0 | 0 | 0 | 0/0/25 |
| EMAIL | 0 | 0 | 0 | 0/0/43 |
| MRN | 0 | 0 | 0 | 0/0/57 |
| OCCUPATION | 0 | 0 | 0 | 0/0/25 |
| ORGANIZATION | 0 | 0 | 0 | 0/0/20 |
| PATIENT NAME | 0 | 0 | 0 | 0/8/228 |
| PHONE | 0 | 0 | 0 | 0/0/25 |

**Which rules fired (dev-200 raw generator counts):** D3 141, D2 104, D4 99, D5 73, D10 45, D7 17 (479 generated); merge dropped 17 overlaps; the FP filter dropped 4; D1 added 63 ages post-filter. D8 fired 0 times (no DATE entities exist without a model - inert as predicted). D9 relabeled 12 PROVIDER NAME -> NAME. D11 dropped 0 (no ORGANIZATION entities - inert). D12 dropped 0 (no hallucinated names - inert). D6b tail dropped 0. The 8 PATIENT NAME false positives come from merge-time refineNameLabel promoting D5 NAME spans (e.g. "NICCI MCMANUS, the patient's spouse") where gold says NAME. D3 emits label "ID" for MRN-valued spans (NHS numbers etc.), so all 57 MRN gold spans mismatch on type by construction - in the full pipeline the MRN type comes from the model/structured layer.

**Interpretation.** This answers "why keep the base model": the D layer is an ultra-high-precision specialist (P=0.985) covering 7 of 15 gold types and 45% of spans, while the base model supplies the 8 types no D rule touches (DATE, DOB, EMAIL, PHONE, OCCUPATION, ORGANIZATION, PATIENT NAME, MRN). Rules-alone F1 (0.6162) slightly exceeds Stanford-base-alone F1 (0.5978) on the same dev-200, but the profiles are complementary, not redundant - the combination reaches 0.9023, far above either alone. Neither component is dispensable: dropping the model loses all date/phone/email/occupation/organization/patient-name coverage; dropping the rules loses the +0.30 F1 the base model cannot reach on its own. Manuscript placement: one sentence in Results or Discussion; the per-type zeros are the honest boundary of the rules' contribution. Nothing here changes the frozen 0.872 held-out number.

## Full rules alone ablation (all layers, no base model)

**Date:** 2026-10-01. **Purpose:** answer "why not just write rules for the other eight types" by running the complete rule stack - Track B/C generic patterns plus D1-D12 - with zero NER model entities on dev-200.

**Method.** Replicated the hybrid pipeline's entity-production path (the hybrid branch of createDeidentifier().deidentifyText) with model entities = [], calling the production functions directly in order: collectBracketedPlaceholderEntities -> addStructuredSafeHarborEntities (Track D generators D2/D3/D4/D5/D7/D10; B/C labeled captured patterns for PATIENT NAME, DOB, MRN, ID, DATE, PHONE, EMAIL, ADDRESS, FACILITY, ROOM, PROVIDER NAME, CONTACT NAME, ORGANIZATION, OCCUPATION; directPatterns phone/email/date/address/organization/provider regexes including SSN, ZIP+4, UK/CA postcodes, NPI, credit-card, license, passport shapes; addAgeEntities; Track C winners; chrono temporal fallback) -> mergeEntities + filterLikelyFalsePositiveEntities (D6a/D6b) -> expandIdentityGraphEntities (rule-based identity graph: dictionary names, exact structured repeats, contextual person names, alias repeats, organization first-word aliases; 3 passes; no patient identity) -> addTrackDAgeEntitiesPostFilter (D1) -> resolvedRedactionEntities (final D6b/D8/D9/D11/D12 filter block, temporal re-merge, date timeline). Three internal functions required `export` added on a scratch copy of deid.js (expandIdentityGraphEntities, collectBracketedPlaceholderEntities, resolvedRedactionEntities); every other call is exported by the production module, so no rule logic was re-implemented or copied. Harness: meddeid/track-d/rules_full_ablation.mjs (durable, with rerun instructions); predictions: meddeid/out/rules_full_only.json. Scored with track-d/score_dev.py; character recall replicates score.py's micro-averaged definition on dev ids. Dev-200 only; the held-out 100 was never touched (a rules-only variant is a new system, so held-out is off limits).

**Results (dev-200, n=200).** Exact-span micro-F1 **0.8944** (P=0.9119, R=0.8776; tp=1004, fp=97, fn=140). Character recall **0.9341**.

Head-to-head on dev-200:

| Config | P | R | F1 | charR |
|---|---|---|---|---|
| D1-D12 only (no B/C layers) | 0.9846 | 0.4484 | 0.6162 | 0.4964 |
| Full rules, no model | 0.9119 | 0.8776 | 0.8944 | 0.9341 |
| Stanford base alone | - | - | 0.5978 | - |
| Base + D1-D12 (hybrid) | 0.8923 | 0.9126 | 0.9023 | 0.9771 |

Per-type exact-span F1, full rules with no model (tp/fp/fn):

| Type | P | R | F1 | tp/fp/fn |
|---|---|---|---|---|
| ADDRESS | 0.986 | 0.932 | 0.958 | 68/1/5 |
| AGE | 1.000 | 0.940 | 0.969 | 63/0/4 |
| DATE | 0.822 | 0.838 | 0.830 | 88/19/17 |
| DOB | 1.000 | 1.000 | 1.000 | 25/0/0 |
| EMAIL | 1.000 | 1.000 | 1.000 | 43/0/0 |
| FACILITY | 0.934 | 0.980 | 0.957 | 99/7/2 |
| ID | 1.000 | 0.934 | 0.966 | 141/0/10 |
| LOCATION | 1.000 | 0.739 | 0.850 | 17/0/6 |
| MRN | 1.000 | 0.912 | 0.954 | 52/0/5 |
| NAME | 0.699 | 0.725 | 0.712 | 58/25/22 |
| OCCUPATION | 0.885 | 0.920 | 0.902 | 23/3/2 |
| ORGANIZATION | 1.000 | 0.650 | 0.788 | 13/0/7 |
| PATIENT NAME | 0.892 | 0.868 | 0.880 | 198/24/30 |
| PHONE | 0.625 | 1.000 | 0.769 | 25/15/0 |
| PROVIDER NAME | 0.968 | 0.752 | 0.847 | 91/3/30 |

**Where the remaining misses live.** No type is at zero - the B/C layers closed the 8-type gap that D-only could not (labeled patterns for DOB/MRN/EMAIL/PHONE/DATE in structured contexts, chrono free-text dates, phone/email regexes, and the identity graph's alias/dictionary name propagation). The weakest recall is exactly the open-vocabulary types: ORGANIZATION 0.650, NAME 0.725, LOCATION 0.739, PROVIDER NAME 0.752. These are types with no enumerable pattern - community organizations (employers, clubs, insurers beyond the labeled patterns), towns appearing in free narrative, and personal names occurring once with no anchor. The rule layers catch them only through labels ("Employer:"), anchors, dictionaries, or repetition (identity-graph alias-repeat and dictionary name recall fired ~26 times on dev-200). A novel name in narrative with no anchor and no repetition is invisible to every rule layer by construction. The base model is the only component that generalizes to unseen names: on dev it added +9 PATIENT NAME, +17 PROVIDER NAME, and +12 DATE true positives over rules alone. The model also costs precision where rules are cleaner - FACILITY 18 FPs hybrid vs 7 rules-alone, PROVIDER NAME 25 vs 3 - model hallucinations the rules would never emit. PHONE is the one type where the rules themselves overfire (P=0.625 both with and without the model).

**Interpretation - would full-coverage rules beat model plus rules?** On dev-200, no: 0.8944 vs 0.9023. The gap is small (+0.008 F1, +0.043 character recall) but it sits entirely in open-vocabulary recall - DATE, PATIENT NAME, PROVIDER NAME - which is precisely the component that cannot be closed by writing more rules, because there is no pattern to write for a name never seen. Two caveats flatter the rules here. First, D1-D12 were tuned on dev-200, so the rules' dev number is partly memorization of dev quirks, while the base model's contribution is learned generalization. Second, a rules-only variant is a new system that can never be validated on the frozen held-out 100, whereas the hybrid's 0.8718 held-out number is the generalization evidence the paper stands on. The honest hierarchy: the B/C generic layers (not the D layer) supply most of the non-D type coverage; the D layer supplies the clinical-convention recall; the base model supplies the open-vocabulary generalization that no rule layer can. Manuscript placement: this ablation is the empirical answer to the "why not rules alone" reviewer question - one compact paragraph in Discussion built on the open-vocabulary argument. Nothing here changes the frozen 0.872 held-out number.
