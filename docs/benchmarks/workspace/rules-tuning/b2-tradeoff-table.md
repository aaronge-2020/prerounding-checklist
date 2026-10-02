# B2 threshold tradeoff table (2026-09-29)

One-factor-at-a-time sweep on benchmark dev rows 0–699, approximating the
`modelPredictionsToEntities` per-type score filter by dropping model-source
entities below each threshold from the final hybrid output and re-scoring
(strict exact-span binary metrics). Approximation is optimistic (pre-merge
scores ≤ post-merge max; alias-seeding effects ignored).

Baseline (dev): P=0.7328 R=0.5932 F1=0.6556 (tp=2375 fp=866 fn=1629)

## NAME (NAME, PATIENT NAME, PROVIDER NAME, CONTACT NAME)

| thr  | P      | R      | F1     | tp   | fp  | fn   |
|------|--------|--------|--------|------|-----|------|
| 0    | 0.7328 | 0.5932 | 0.6556 | 2375 | 866 | 1629 |
| 0.5  | 0.7329 | 0.5929 | 0.6555 | 2374 | 865 | 1630 |
| 0.7  | 0.7333 | 0.5927 | 0.6555 | 2373 | 863 | 1631 |
| 0.8  | 0.7331 | 0.5919 | 0.6550 | 2370 | 863 | 1634 |
| 0.9  | 0.7331 | 0.5914 | 0.6547 | 2368 | 862 | 1636 |
| 0.95 | 0.7334 | 0.5909 | 0.6545 | 2366 | 860 | 1638 |
| 0.99 | 0.7331 | 0.5899 | 0.6538 | 2362 | 860 | 1642 |

NAME@0.9 per-category: NAME P=0.090 R=0.035 F1=0.050 (tp=27 fp=274 fn=756)
vs base NAME P=0.109 R=0.043 F1=0.062 (tp=34 fp=278 fn=749).
Verdict: every threshold loses NAME recall (already critically low at 0.043)
for no F1 gain. Keep 0 (recall bias).

## ID (ID, MRN, ENCOUNTER ID)

| thr  | P      | R      | F1     | tp   | fp  | fn   |
|------|--------|--------|--------|------|-----|------|
| 0    | 0.7328 | 0.5932 | 0.6556 | 2375 | 866 | 1629 |
| 0.5  | 0.7359 | 0.5922 | 0.6562 | 2371 | 851 | 1633 |
| 0.7  | 0.7464 | 0.5902 | 0.6591 | 2363 | 803 | 1641 |
| 0.8  | 0.7518 | 0.5884 | 0.6601 | 2356 | 778 | 1648 |
| 0.9  | 0.7571 | 0.5854 | 0.6603 | 2344 | 752 | 1660 |
| 0.95 | 0.7608 | 0.5829 | 0.6601 | 2334 | 734 | 1670 |
| 0.99 | 0.7645 | 0.5772 | 0.6577 | 2311 | 712 | 1693 |

ID@0.9 per-category: ID P=0.747 R=0.626 F1=0.681 (tp=550 fp=186 fn=328)
vs base ID P=0.630 R=0.632 F1=0.631 (tp=555 fp=326 fn=323).
Only threshold with a real F1 gain (+0.005): kills 140 ID FPs at the cost of
5 ID TPs. DECLINED per the recall bias for NAME/ID — a leaked identifier is a
privacy failure, an over-redaction is a usability annoyance. Keep 0.

## DATE (DATE, DOB, TIME, AGE)

| thr   | P      | R      | F1     | tp   | fp  | fn   |
|-------|--------|--------|--------|------|-----|------|
| 0     | 0.7328 | 0.5932 | 0.6556 | 2375 | 866 | 1629 |
| 0.9   | 0.7325 | 0.5917 | 0.6546 | 2369 | 865 | 1635 |
| 0.95  | 0.7324 | 0.5914 | 0.6544 | 2368 | 865 | 1636 |
| 0.99  | 0.7326 | 0.5912 | 0.6543 | 2367 | 864 | 1637 |
| 0.995 | 0.7325 | 0.5909 | 0.6541 | 2366 | 864 | 1638 |

DATE@0.9 per-category: DATE P=0.377 R=0.823 F1=0.517 (tp=135 fp=223 fn=29)
vs base P=0.370 R=0.823 F1=0.510. Negligible; keep 0.

## OTHER (PHONE, EMAIL, LOCATION, ADDRESS, IP)

| thr  | P      | R      | F1     | tp   | fp  | fn   |
|------|--------|--------|--------|------|-----|------|
| 0    | 0.7328 | 0.5932 | 0.6556 | 2375 | 866 | 1629 |
| 0.7  | 0.7336 | 0.5929 | 0.6558 | 2374 | 862 | 1630 |
| 0.9  | 0.7339 | 0.5924 | 0.6556 | 2372 | 860 | 1632 |
| 0.95 | 0.7341 | 0.5924 | 0.6557 | 2372 | 859 | 1632 |
| 0.99 | 0.7341 | 0.5924 | 0.6557 | 2372 | 859 | 1632 |

Negligible; keep 0.

## Conclusion

The stanford model's scores are extremely peaked (nearly all ≥ 0.98), so
score thresholding has almost no discriminative power on this benchmark.
All shipped thresholds remain 0 (mechanism active, filtering disabled).
Re-tune when a less peaked model (e.g. GLiNER) is plugged in.
