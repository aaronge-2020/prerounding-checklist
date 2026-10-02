# Stream 4: Leave one rule group out ablation (Track D, D1 through D12)

Date: October 1, 2026. Dev set only: 200 notes from `meddeid/track-d/split.json` (seed 20260930, stratified by document type and locale). No tuning. No changes to the shipped system. No manuscript edits. No held out evaluations.

## Objective

Rank the twelve Track D rule groups by their marginal contribution to exact span F1 on the dev set. Each ablation disables exactly one group and reruns the full hybrid pipeline; the reported delta is F1 with the group off minus F1 with the full stack.

## Method

The browser pipeline cannot be rerun here (no live browser model inference in this stream), so the ablation uses a faithful replication harness that rebuilds the Track D portion of the pipeline on top of the archived base run. The harness is `/tmp/ablate/ablate.mjs`. It imports the rule adders and the merge and false positive filter directly from the shipped `deid.js` (never modified) and replays the Track D delta exactly:

* D2, D3, D4, D5, D7, D10 adders run as exported pure functions of note text, merged D first (the browser push order), then passed through the real `filterLikelyFalsePositiveEntities`. D3 IDs bypass the ID filter via the same `track-d` context the browser uses.
* D1 ages are identified as AGE entities under 90 whose spans match D1 verbatim patterns (the Safe Harbor filter drops every AGE under 90 before D1, so only D1 can produce them; 1 sub 90 AGE not matching D1 patterns was conservatively kept in the D1 off run).
* D6b, D8, D9, D11, D12 final filter clauses are a verbatim copy of the shipped final filter with per clause off guards.
* The seed for each note is the archived base run (`meddeid/out/stanford_base_dev200.json`), partitioned into B/C structured versus model predicted by exact match against the browser's own off run structured set (merge plus filter of B/C patterns). A B/C entity absorbed by a D entity in the on run structured merge and then filtered out is removed (1 case). D entities outrank model entities on overlap via the real merge branches.

Sanity check: the harness full stack scores F1 0.9049 [0.8819, 0.9248] on dev 200 versus the archived browser full stack at 0.9023 [0.8796, 0.9222], a difference of +0.0026. The four residual entity differences were adjudicated against gold: in three of the four, the harness matches gold (true positive) while the archived browser output is a false positive from identity graph overextension or relabeling; in the fourth both are false positives with different wrong labels. The offset is therefore not a replication failure. The harness avoids a small number of identity graph errors the browser makes. The identity graph alias and relabel pass is the one pipeline stage not replicated (its input, the raw model entities, is not archived), which bounds unmodeled D interactions at about 0.003 F1.

Ablation configs: `node /tmp/ablate/ablate.mjs d1` through `d12`. Predictions saved to `meddeid/out/ablation_d1_off.json` through `meddeid/out/ablation_d12_off.json` (dev subset format: id plus entities with begin, end, text, type). Scored with `models-survey/score_eval.py` (bootstrap 10k, seed 42) on the dev ids subset.

Reference points: harness full stack P 0.8949 R 0.9152 F1 0.9049 [0.8819, 0.9248]; archived browser full stack F1 0.9023 [0.8796, 0.9222].

## Ranked results

Delta F1 is F1 with the group off minus harness full F1 (0.9049). All CIs are 95 percent bootstrap.

| Rank | Group | F1 off | Delta F1 | P off | R off | 95 percent CI |
|------|-------|--------|----------|-------|-------|---------------|
| 1 | D3 labeled IDs | 0.8279 | -0.0770 | 0.8193 | 0.8365 | [0.8022, 0.8508] |
| 2 | D4 facilities | 0.8522 | -0.0527 | 0.8427 | 0.8619 | [0.8275, 0.8757] |
| 3 | D6 label corrections | 0.8608 | -0.0441 | 0.8181 | 0.9082 | [0.8384, 0.8808] |
| 4 | D2 provider names | 0.8644 | -0.0405 | 0.8625 | 0.8663 | [0.8399, 0.8867] |
| 5 | D1 clinical ages | 0.8748 | -0.0301 | 0.8890 | 0.8610 | [0.8511, 0.8954] |
| 6 | D10 home addresses | 0.8755 | -0.0294 | 0.8575 | 0.8942 | [0.8514, 0.8971] |
| 7 | D5 relative names | 0.8864 | -0.0185 | 0.8795 | 0.8934 | [0.8634, 0.9071] |
| 8 | D7 locations | 0.8914 | -0.0135 | 0.8826 | 0.9003 | [0.8678, 0.9122] |
| 9 | D9 relative relabel | 0.8928 | -0.0121 | 0.8829 | 0.9030 | [0.8693, 0.9135] |
| 10 | D8 DOB relabel | 0.8937 | -0.0112 | 0.8838 | 0.9038 | [0.8708, 0.9141] |
| 11 | D12 name filter | 0.8999 | -0.0050 | 0.8850 | 0.9152 | [0.8758, 0.9213] |
| 12 | D11 org filter | 0.9006 | -0.0043 | 0.8865 | 0.9152 | [0.8782, 0.9202] |

## Weight carriers

Four groups carry the stack. Removing any one costs more than 0.04 F1.

**D3 (labeled clinical identifiers, delta minus 0.0770).** The single largest contributor. ID F1 collapses from 0.953 to 0.493 (141/4/10 becomes 51/5/100 true/false positives/false negatives). D3 also suppresses PHONE false positives: without it, B/C PHONE entities that D3 would have claimed as ID remain PHONE, and PHONE F1 falls from 0.758 to 0.327 on 103 false positives. Anchored IDs (GMC, NHS, accession) are nearly all D3.

**D4 (care facilities, delta minus 0.0527).** FACILITY F1 falls from 0.922 to 0.478 (100/16/1 becomes 39/23/62). Without D4, facility mentions fall back to ORGANIZATION: ORGANIZATION false positives rise from 1 to 52 and ORGANIZATION F1 falls from 0.765 to 0.306. D4 is doing double duty as a facility adder and an organization precision guard.

**D6 (label corrections, delta minus 0.0441).** Almost entirely the DATE duration suppression: without it, DATE false positives rise from 20 to 120 and DATE F1 falls from 0.889 to 0.615. The CONTACT NAME to NAME relabel contributes a smaller recall effect (NAME F1 0.785 to 0.720). Caveat below: this measures only the final filter reapplication, so it understates D6 total.

**D2 (role anchored provider names, delta minus 0.0405).** PROVIDER NAME F1 falls from 0.850 to 0.458 (108/25/13 becomes 52/54/69). The model alone misses or mislabels more than half of provider mentions; role anchors and credential spans recover them.

## Middle tier

**D1 (clinical ages, delta minus 0.0301).** AGE F1 falls from 0.969 to 0.029. All but one AGE true positive on dev is a D1 addition, restored after the Safe Harbor under 90 suppression. Small overall delta only because AGE is a small slice of gold.

**D10 (home addresses, delta minus 0.0294).** ADDRESS F1 falls from 0.958 to 0.652 (68/1/5 becomes 44/18/29). D10 also has small spillover: without it, a few address fragments get labeled PHONE, FACILITY, or names.

**D5 (relative names, delta minus 0.0185).** NAME F1 falls from 0.785 to 0.548 (62/16/18 becomes 37/18/43). The main NAME recall engine alongside D9.

**D7 (locations, delta minus 0.0135).** LOCATION F1 falls from 0.850 to 0.000: all 17 LOCATION true positives are D7, and without it the type vanishes entirely. Small overall delta only because LOCATION is rare in gold (23 entities).

**D9 (relative name relabel, delta minus 0.0121).** NAME F1 falls from 0.785 to 0.667 as 14 relative mentions stay PATIENT or PROVIDER NAME.

**D8 (DOB relabel, delta minus 0.0112).** DOB F1 falls from 1.000 to 0.649; the 13 missed DOBs remain DATE (DATE false positives rise from 20 to 33).

## Near zero contributors

**D12 (name hallucination filter, delta minus 0.0050)** and **D11 (organization filter, delta minus 0.0043)** have the smallest overall deltas, but both are precision filters with clear per type effects: D12 keeps PATIENT NAME F1 at 0.908 versus 0.885 without it (12 fewer false positives from "the", "the GP" style hallucinations); D11 keeps ORGANIZATION F1 at 0.765 versus 0.578 without it (11 fewer false positives from Clinic, Laboratory, Department mentions). Their value is false positive reduction on types the model already recalls well, so the F1 delta understates their precision contribution.

## Caveats

* **D6 is a lower bound.** D6a (the `refineNameLabel` FACILITY narrow suffix rule) and the D6b application inside the false positive filter that runs before the final filter are baked into the base archive for every config, because the Track D flag does not gate them. D6 off disables only the final filter reapplication. The true D6 contribution is larger than minus 0.0441 by an unmeasured amount.
* **Leave one out understates jointly necessary groups.** If two groups cover the same gold entities, removing one shows a small delta even though both are needed. The ranking measures marginal contribution given the other eleven, not standalone value.
* **Identity graph interactions are not modeled.** The harness replicates the adders, merges, and filters exactly but not the identity graph alias and relabel fixpoint (its input, the raw model entities, is not archived). Four residual entity differences versus the browser archive were adjudicated against gold; three favor the harness. Unmodeled D interactions through the identity graph are bounded at about 0.003 F1.
* **Dev only.** All numbers are on the 200 note dev split. No generalization claim is made to the held out 100 or to other data. No tuning was performed; the ablation reuses the shipped rules unchanged.
* **Deltas are relative to the harness full stack** (F1 0.9049), which is internally consistent across configs. The archived browser full stack is 0.9023; the +0.0026 harness offset is documented above.

## Files

* Harness: `/tmp/ablate/ablate.mjs` (imports the shipped `deid.js`; the file itself is never modified)
* Predictions: `~/workspace/deid-benchmark/meddeid/out/ablation_d1_off.json` through `~/workspace/deid-benchmark/meddeid/out/ablation_d12_off.json`
* Scorer: `~/workspace/deid-benchmark/models-survey/score_eval.py`
* Split: `~/workspace/deid-benchmark/meddeid/track-d/split.json` (seed 20260930)
* Reference archives: `~/workspace/deid-benchmark/meddeid/out/stanford_base_dev200.json`, `~/workspace/deid-benchmark/meddeid/out/stanford_trackd_dev200.json`
