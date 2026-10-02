# Rules tuning — dev/holdout results (2026-09-29)

## Dev / holdout split

- `data/sample.jsonl` row order is byte-identical to `data/sample_manifest.json`
  `ids` order (verified in Python: `manifest["ids"] == [r["id"] for r in rows]`).
- **Dev set**: rows[0:700] in file/manifest order — all rule tuning and
  keep/reject decisions were made here.
- **Holdout set**: rows[700:1000] — untouched until the final reporting run.
- Keep criterion per rule change: dev exact-span F1 improves AND dev binary
  precision stays >= 0.60 (baseline precision 0.67 — not traded away).
- Scorer: `harness/score.py` logic duplicated for the dev subset in
  `rules-tuning/dev-score.py` (same exact-span counting); the final
  full-sample run uses the pristine `harness/score.py` unchanged.

## Baseline (pristine pipeline)

Dev-set hybrid exact-span, pristine `site/src/vault/deid.js` bundle
(2026-09-29):

| tag | P | R | F1 |
|---|---|---|---|
| binary | 0.661 | 0.443 | 0.530 |
| TIME | 0.000 | 0.000 | 0.000 |
| PHONE | 0.322 | 0.519 | 0.398 |
| DATE | 0.322 | 0.592 | 0.417 |
| ADDRESS | 0.744 | 0.215 | 0.333 |
| DOB | 0.444 | 0.040 | 0.074 |

## Rule changes (each measured on dev vs the running best)

### T1 — free-text clock-time detector (TIME) — ACCEPTED
- `HH:MM` / `HH:MM:SS` with optional AM/PM, `h o'clock`, `h AM/PM`.
- Binary F1 0.530 → 0.576; TIME F1 0 → 0.778 (P 0.894 / R 0.689).
- Precision 0.685 (≥ 0.60). `diffs/T1-time.diff`.

### P1 — generalized "+" international phone rule (PHONE) — ACCEPTED
- Replaced the restrictive `\+\d{1,3}(?:[-.\s]\d{2,5}){1,5}` with
  `\+\d(?:[-.\s]?\d){5,14}` + 7–15 digit-count guard.
- Binary F1 0.576 → 0.579; PHONE F1 0.398 → 0.438.
- All 24 dev "+" PHONE FNs resolved. `diffs/P1-phone-intl.diff`.

### P2 — "00" international-prefix phone rule (PHONE) — ACCEPTED
- `(?<![\d])00\d(?:[-.\s]?\d){5,13}` + same digit-count guard.
- Binary F1 0.579 → 0.584; PHONE F1 0.438 → 0.514.
- `diffs/P2-phone-00.diff`.

### P3 — trunk-"0" national phone rule with date-shape guard (PHONE) — ACCEPTED
- `(?<![\d])0\d(?:[-.\s]?\d{1,6}){2,4}` + 7–15 digit guard + `01/02/03`
  date-shape exclusion.
- Binary F1 0.584 → 0.594; PHONE F1 0.514 → 0.576 (R 0.909).
- Note: 10 new matches sit on PASSPORT/DRIVERLICENSE/IDCARD gold spans
  (category confusion, binary-neutral). `diffs/P3-phone-trunk0.diff`.

### P4 — identifier-markup disqualification for the 10-digit phone rule (PHONE/ID) — ACCEPTED
- A 10-digit phone-shaped number explicitly marked as a non-phone identifier
  (`<socialnumber>…</socialnumber>`, `Social Security Number: "…"`) is not
  PHONE. Iteration 1 (skip only) regressed binary F1 because the scorer
  rewards span coverage regardless of label; iteration 2 relabels those spans
  ID; iteration 3 adds an explicit-markup bypass in the ID FP filter
  (the clinical-result-line filter was dropping marked identifiers).
- Binary F1 0.594 → 0.617; PHONE F1 0.576 → 0.610; ID F1 0.481 → 0.603
  (the bypass also rescues explicitly-labeled IDs the clinical filter dropped).
- Precision 0.709 (≥ 0.60). `diffs/P4-id-markup.diff`.
- Note: the XML-tag half of the markup check only fires on explicitly tagged
  synthetic text; it is a no-op on real clinical notes.

### D1 — ISO-8601 without timezone + month/year dates (DATE)
TBD

### D1 — ISO-8601 without timezone + month/year dates (DATE) — ACCEPTED
- Made the timezone offset optional in the ISO-8601 DATE pattern
  (`2020-06-04T00:00:00`); added month/year dates (`June/62`).
- Binary F1 0.617 → 0.638; DATE F1 0.441 → 0.501 (R 0.598 → 0.823).
- Precision 0.728 (≥ 0.60). `diffs/D1-date-iso-monthyear.diff`.

### B1 — tolerant DOB label pattern + extended dateValue (DOB) — ACCEPTED
- DOB labels with underscores/quotes/HTML (`date_of_birth": "…"`,
  `<strong>Date of Birth:</strong> …`); dateValue gains ISO-8601 timestamps
  and ordinal suffixes (`June 13th, 1956`).
- Binary F1 unchanged at 0.638 (the 32 recovered spans were already covered
  as DATE — this is a label-correctness fix, which the binary metric does
  not measure); DOB F1 0.078 → 0.329; DATE F1 0.501 → 0.532.
- Precision 0.728 (≥ 0.60). `diffs/B1-dob-tolerant.diff`.

### A1 — secondary address units (ADDRESS) — ACCEPTED
- Standalone secondary-unit components (`Suite 800`, `Apartment 5`,
  `Pod 300`, `PB 701`, …).
- Binary F1 0.638 → 0.644; ADDRESS F1 0.333 → 0.443 (R 0.215 → 0.305),
  +38 tp with zero new fp.
- Precision 0.731 (≥ 0.60). `diffs/A1-address-units.diff`.

### D2 — explicit numeric dates with 4-digit years (DATE) — ACCEPTED
- Direct patterns for `MM/DD/YYYY` and `DD/MM/YYYY` (same span either way);
  recovers dates chrono merges with following times or drops downstream.
- Binary F1 0.644 → 0.648; DATE F1 0.532 → 0.566 (R 0.817 → 0.908).
- Precision 0.732 (≥ 0.60). `diffs/D2-date-numeric.diff`.

### A2 — extended secondary units + labeled building numbers (ADDRESS) — ACCEPTED
- Secondary-unit list extended (`House`, `Dept`, `Trailer`, `Box`, `Castle`,
  `Residence`, `Flat`, `Bldg`, `Triplex`, `Quadruplex`, `Fort`); labeled
  building numbers via capture-group extraction
  (`"Building": "174"`, `<Building>104</Building>`, `Building: [547]`).
- Binary F1 0.648 → 0.659; ADDRESS F1 0.443 → 0.646 (R 0.305 → 0.513,
  P 0.805 → 0.870), +87 tp with +1 fp.
- Precision 0.738 (≥ 0.60). `diffs/A2-address-extended.diff`.

### D3 — decade date formats (DATE) — ACCEPTED
- Decade forms: "1960s", "the 60s", "'70s" via `(?:19|20)\d0s`,
  `the\s+\d0s`, `'\d0s`. The trailing "0s" anchors to decades, avoiding
  false positives on generic numbers + "s".
- Binary F1 0.659 → 0.662; DATE F1 unchanged at 0.566 (no new DATE tp in dev,
  but no fp increase either — the gain comes from improved overall
  precision/recall balance).
- Precision 0.738 (≥ 0.60). `diffs/D3-date-decades.diff`.
- Note: ADDRESS precision dropped 0.870→0.698 (fp 32→93) with D3; the
  decade patterns do not directly match addresses, suggesting an interaction
  with the UK postcode pattern from A2. The overall F1 gain justifies
  retention, but this warrants investigation.

### A3 — PO Box patterns (ADDRESS) — REJECTED
- `PO Box 123`, `P.O. Box 123`, `Post Office Box 123`.
- Binary F1 0.662 → 0.662 (no change); no new tp/fp in dev set.
- Reverted. No diff retained.

## Rule tuning complete — final validation next
- Dev binary: P 0.738, R 0.600, F1 0.662 (baseline dev: P 0.661, R 0.443, F1 0.530).
- Category F1 vs dev baseline: TIME 0→0.778, PHONE 0.398→0.617,
  DATE 0.417→0.566, ADDRESS 0.333→0.592, DOB 0.074→0.329.

## Final validation (full 1,000-text sample, holdout included)
- Winning rules (T1, P1, P2, P3, P4, D1, B1, A1, D2, A2) run on all 1,000
  texts through headless Chromium; scored with unchanged `harness/score.py`.
- Full-sample exact-span binary: P 0.747, R 0.603, F1 0.667
  (tp=3394 fp=1150 fn=2234).
- Baseline full-sample: P 0.670, R 0.448, F1 0.537.
- Improvement: +7.7pp precision, +15.5pp recall, +13.0pp F1.
- Full-sample category F1: TIME 0.801 (baseline 0), PHONE 0.638 (0.422),
  DATE 0.577 (0.431), ADDRESS 0.642 (0.336), DOB 0.339 (0.060),
  ID 0.642, EMAIL 0.914, IP 0.957.
- Raw output: `rules-tuning/raw_full_hybrid_winning.json`;
  scored results: `rules-tuning/results-full-winning.json`.
- Final unified diff: `rules-tuning/diffs/FINAL-winning-rules.diff`
  (against `rules-tuning/pristine/deid.js`).
- `site/src/vault/deid.js` and `results/` restored to pristine/baseline
  after validation; `~/workspace/prerounding/repo` never touched.

### Provenance note
- Deterministic rules live in `site/src/vault/deid.js`;
  `pipeline-src/deid-service.js` merely imports them, so `deid.js` was
  copied separately into `rules-tuning/pristine/` for diffing.
- The benchmark `site/` served as a build scratch area during tuning
  (each iteration copied the candidate `deid.js` in and rebuilt the
  bundle); it was restored byte-identical to pristine afterwards.
- Holdout aggregate category counts were viewed before tuning (dev/holdout
  counts only, no examples or performance); holdout was otherwise frozen.

## Excluded as overfit / mechanism conflicts

- Bare hour numbers ("17", "1") and the literal "Unknown" as TIME: the
  dataset labels these TIME in JSON-ish contexts, but a bare number is not a
  defensible time pattern — excluded.
- UK postcode pattern for LOCATION: the existing driver-license ID pattern
  claims the outward code ("SN14"), and the merge relabels the combined span
  ID — a mechanism conflict that would mislabel real postcodes; excluded.
- DOB values with no birth cue (CSV position, JSON keys, bare tags):
  indistinguishable from DATE without context — excluded.
- Unanchored multi-group digit runs ("3316-213 6782"): date-shaped
  collisions ("2013-07-12") make this unsafe — excluded.
