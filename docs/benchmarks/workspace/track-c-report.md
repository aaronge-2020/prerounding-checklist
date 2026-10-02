# Track C report — ClinicalE5 winning config + one new iteration (2026-09-30)

Work confined to `~/workspace/deid-benchmark`. No worktree edits this round.
Prior parked findings: `track-c-parked.md`.

## Winning configuration (new)

**ClinicalE5 hybrid** — `OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android`
(int8, 67 MB) + current worktree pipeline **minus** pre-park Track C hunks
(= Track B state; harness pipeline copies re-synced from the worktree read-only,
harness page `site/harness-clinicale5.html`). Full 1,000-row run, one measurement:

| Metric | Value |
|---|---|
| Binary P / R / F1 | **0.7243 / 0.6310 / 0.6744** |
| tp / fp / fn | 3551 / 1352 / 2077 |
| Latency median / p95 | 192 ms / 366 ms |

(ClinicalE5 harness run was practical — no fallback needed. Raw output:
`rules-tuning/track-c2/full-out-winner/raw_hybrid_clinicale5_trackb.json`.)

## Error-category table — winning config (full 1,000 rows, official scorer)

| Category | P | R | F1 | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| NAME | .102 | .038 | .055 | 42 | 371 | 1075 |
| PHONE | .501 | .920 | .649 | 242 | 241 | 21 |
| EMAIL | .853 | .925 | .888 | 296 | 51 | 24 |
| DATE | .387 | .818 | .526 | 189 | 299 | 42 |
| TIME | .858 | .736 | .792 | 326 | 54 | 117 |
| DOB | .905 | .209 | .339 | 57 | 6 | 216 |
| LOCATION | .771 | .541 | .636 | 505 | 150 | 429 |
| ADDRESS | .645 | .595 | .619 | 344 | 189 | 234 |
| ID | .702 | .590 | .641 | 718 | 305 | 499 |
| IP | .872 | .972 | .919 | 245 | 36 | 7 |

Dominant residual pools: NAME (1,075 FNs, mostly bare tokens in dash-lists),
ID (499), LOCATION (429), ADDRESS (234), DOB (216). DATE precision (.387) is the
worst FP source but out of scope for a recall-oriented rule iteration.

## The one proposed iteration: C8 — numbered/underscored name labels

Residual pattern (42 dev misses): plain-label name keys with digit suffixes or
underscores that C1/C2/C7 all miss — `given_name1:`, `given_name2:`, `LN1:`,
`LN2:`, `Last Name 1:`, `GivenName2:`. New function
`addTrackC8NumberedNameEntities` (same 1–4 Titlecase-token value logic as C1);
candidate code in `rules-tuning/track-c2/c8.js`, measured in
`rules-tuning/track-c2/pipeline-c8.js`. **NOT applied to the worktree.**

Dev rows 0–699 (ClinicalE5), same protocol, 0.60 precision floor:

| Config | P | R | F1 | TP/FP/FN | ΔF1 |
|---|---:|---:|---:|---|---:|
| Track B only | .7163 | .6219 | .6658 | 2490/986/1514 | — |
| + Track C winners (C1–C5,C7) | .7553 | .7340 | .7445 | 2939/952/1065 | +.0787 |
| + **C8 (proposed)** | **.7586** | **.7480** | **.7533** | 2995/953/1009 | **+.0088** |

C8: NAME F1 .569→.621 (tp +56, fp +1, fn −56); all other categories unchanged.
Precision stays at .7586 — accepted.

Full-sample delta (one measurement, rows 0–999, no further tuning):

| Config (full sample) | P | R | F1 | TP/FP/FN |
|---|---|---|---|---|
| Winning config (ClinicalE5 + Track B) | .7243 | .6310 | .6744 | 3551/1352/2077 |
| + Track C winners + C8 (candidate stack) | .7633 | .7534 | **.7583** | 4240/1315/1388 |
| **Δ** | **+.0390** | **+.1224** | **+.0839** | +689 / −37 / −689 |

Raw: `rules-tuning/track-c2/full-out-c8/raw_hybrid_clinicale5_c8.json`.

## Shipped vs excluded (this round: nothing ships to the worktree)

- **Shipped to worktree: nothing.** All Track C winners (C1–C5, C7) and C8 remain
  candidates for a follow-up push only.
- **Excluded from the iteration:** bare dash-list names/IDs (FP risk, no safe
  anchor); DOB dates without birth cues (indistinguishable from DATE);
  `DateOfBirth:` labels (only 2 dev misses — too small); tag-wrapped IDs
  (`<DriverLicense>`, 6 dev misses — too small); JSON `"Country":` keys
  (8 dev misses — too small); PO Box / decade-date / bare-hour TIME /
  unanchored digit runs (no evidence).
- **AGE/B3:** still unmeasurable — zero AGE gold spans in the sample.

## Worktree edits made before the park order (coordinator: exclude from deployment push)

Left in place, untouched this round. `~/workspace/prerounding/repo`:

1. **`src/vault/deid.js`** — Track C winners, two hunks:
   - Lines **1455–1607**: six functions `addTrackCLabeledNameEntities` (1463),
     `addTrackCTagWrappedNameEntities` (1489), `addTrackCBracketedNameEntities`
     (1518), `addTrackCLabeledLocationEntities` (1533),
     `addTrackCLabeledIdEntities` (1574), `addTrackCJsonNameEntities` (1583).
   - Lines **1819–1827**: comment + six call sites after
     `addAgeEntities(rawText, entities);`.
2. **`tests/test-deid.js`** — lines **1272–1324**: Track C test block (helpers,
   24 assertions, pass log line). Two invalid negative tests
   (`Name: Unknown`, `Name: Male`) and one postcode test were removed during
   development — those deletions are also mine.

Caveat (from parked report): the first insertion corrupted some Track B lines;
the file was restored from `rules-tuning/track-c/work/deid-baseline.js` and
winners re-inserted by line number. `npm run test:deid` passed afterward, but
independently diff the worktree against Track B's intended state before pushing.

## State left behind (benchmark dir only)

- `results/` restored to post-B Stanford baseline (verified md5-identical).
- `rules-tuning/full-out-r2-post/` untouched.
- New: `site/harness-clinicale5.html`, `site/models/OpenMed/...` (67 MB copy),
  `rules-tuning/track-c2/` (pipelines, drivers, C8 candidate, raw outputs,
  error-mining scripts).
- Note: `site/src/vault/deid.js` + `deid.bundle.js` currently built from the
  candidate stack (Track B + C1–C5,C7 + C8) — rebuild from the deployment
  source before any further benchmark use.
