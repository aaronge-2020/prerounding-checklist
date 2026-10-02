# Track C — PARKED 2026-09-29 (priority directive from Aaron; stop all source work)

Status when parked: all tuning complete, winners applied to live worktree, one full
1,000-row validation run done, final report delivered to coordinator. Cache tag
`?v=20260929-deid-r2` NOT changed. Nothing committed, nothing pushed.

## Baseline error categories (full 1,000 rows, post-Track-B)

| Category | P | R | F1 | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| NAME |.102 |.038 |.056 | 43 | 377 | 1074 |
| PHONE |.490 |.920 |.639 | 242 | 252 | 21 |
| EMAIL |.900 |.928 |.914 | 297 | 33 | 23 |
| DATE |.377 |.823 |.517 | 190 | 314 | 41 |
| TIME |.920 |.670 |.775 | 297 | 26 | 146 |
| DOB |.905 |.209 |.339 | 57 | 6 | 216 |
| LOCATION | 0 | 0 | 0 | 0 | 3 | 934 |
| ADDRESS |.693 |.512 |.589 | 296 | 131 | 282 |
| ID |.642 |.664 |.653 | 808 | 450 | 409 |
| IP |.942 |.972 |.957 | 245 | 15 | 7 |

## Proposed rules with dev-split numbers (rows 0–699, cumulative)

Baseline dev: P=.7333 / R=.5932 / F1=.6558 (tp=2375, fp=864, fn=1629).
Accept rule: dev exact-span F1 improves AND binary precision stays ≥0.60.

| Stage | P | R | F1 | TP/FP/FN | ΔF1 |
|---|---:|---:|---:|---|---:|
| +C1 labeled names | .7501 | .6389 | .6900 | 2558/852/1446 | +.0342 |
| +C2 tagged names | .7523 | .6446 | .6943 | 2581/850/1423 | +.0043 |
| +C3 bracketed names | .7563 | .6596 | .7046 | 2641/851/1363 | +.0103 |
| +C4 labeled locations | .7590 | .6756 | .7149 | 2705/859/1299 | +.0103 |
| +C5 labeled IDs (initial) | .7607 | .6788 | .7174 | 2718/855/1286 | +.0025 |
| +C5b + C1/C2 bug fixes | .7625 | .6881 | .7234 | 2755/858/1249 | +.0060 |
| +C1 refined (NO C7 — assembler dropped it) | .7671 | .7010 | .7326 | 2807/852/1197 | +.0092 |
| **+C7 JSON name keys (actual C1–C5+C7, "C7b")** | **.7689** | **.7078** | **.7371** | **2834/852/1170** | **+.0045** |

IMPORTANT naming correction: the run labeled `C7-trackc` (F1 .7326) did NOT contain
C7 — `assemble.sh` hardcoded only C1–C5. `C7b-trackc` (F1 .7371) is the first genuine
C1+C2+C3+C4+C5+C7 run. True C7 contribution is F1 .7326 → .7371 (+.0045).

## Shipped (accepted) rules — all 6 live in `src/vault/deid.js`

- C1 `addTrackCLabeledNameEntities` — labeled names: plain / quoted-JSON / markdown-bold /
  compound labels, 1–4 tokens, comma-separated given names.
- C2 `addTrackCTagWrappedNameEntities` — name-specific XML/HTML tags only
  (`firstname`, `last_name_1` …); generic `td`/`span`/`strong` excluded.
- C3 `addTrackCBracketedNameEntities` — single Titlecase in `[...]`; all-caps/numeric
  brackets excluded.
- C4 `addTrackCLabeledLocationEntities` — state/country codes + city Titlecase;
  postcodes excluded (UK-postcode/ID conflict).
- C5 `addTrackCLabeledIdEntities` — SSN/ID-card/passport/driver-license/national-ID/
  case-ID/registration-ID; digit + structural terminator required (`<` accepted for
  HTML-adjacent values); NO unanchored digit runs.
- C7 `addTrackCJsonNameEntities` — JSON name keys + restricted person-role/ID keys;
  1–3 Titlecase tokens, no digits.

## Excluded

- Postcodes from C4; DOB dates without local birth cue; PO Box / decade-date /
  bare-hour TIME / unanchored digit runs (no evidence; revival prohibited); C6 (too narrow).
- AGE/B3: zero AGE gold spans in the 1,000-row sample — unmeasurable here.

## Full-sample validation (1 run, includes holdout rows 700–999 — do NOT re-run for tuning)

Raw: `~/workspace/deid-benchmark/rules-tuning/full-out-trackc-final/raw_hybrid_trackc_final.json`

| Metric | Baseline | Track C final | Δ |
|---|---:|---:|---:|
| Precision | .7411 | .7749 | +.0338 |
| Recall | .6006 | .7127 | +.1121 |
| F1 | .6635 | .7425 | **+.0790** |
| tp/fp/fn | 3380/1181/2248 | 4011/1165/1617 | +631/−16/−631 |

Per-category final: NAME F1 .056→.557 (tp 43→573, fn 1074→544); LOCATION 0→.395
(tp 0→234 at P .936, fn 934→700); ID .653→.668; ADDRESS/PHONE/EMAIL/DATE/TIME/DOB/IP
unchanged. `results/` restored to post-B baseline; Track C output kept separate.

## Bugs fixed during tuning (all in final shipped code)

- C1 continuation regex `/^[ \t]+/y` — `^` blocked sticky matching after token 1.
- C2 broad tag regex consumed nested outer tags — inner capture restricted to `[^<>]{1,120}`.
- C1 markdown expansion dropped optional quote before `:` — restored `["']?`.
- `assemble.sh` now reads `trackc-calls.txt`, supports C7, resets flags before enabling.

## Caveats for coordinator before push

1. A string-replace insertion bug deleted some Track B lines in `src/vault/deid.js`; it was
   detected via `git diff`, the file was restored from
   `rules-tuning/track-c/work/deid-baseline.js` (intact Track B copy) and winners
   re-inserted by line number. `npm run test:deid` passes and the final validation ran
   on the corrected file — but diff the worktree against Track B's expected state
   independently before pushing, since I could not compare against a pristine Track B
   worktree myself.
2. Two invalid negative tests were removed from `tests/test-deid.js` (`Name: Unknown`,
   `Name: Male` — Track B already redacts them) and one invalid postcode-preservation
   test (Track B redacts postcodes as ADDRESS, which is safe).
3. `rules-tuning/full-out-r2-post/` was NOT overwritten; `results/` restored to baseline.
4. Tests: `npm run test:deid` → "De-ID tests passed for 250 synthetic cases plus
   targeted guards. Track C structured-pattern tests passed. quick de-id anchor
   isolation: OK" (last run 2026-09-29, exit 0).
