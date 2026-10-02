#!/usr/bin/env python3
"""Judge the WS4 edge-case suite.

PASS: every expected span is covered >=80% by a predicted entity (hybrid mode).
expect_absent spans: PASS iff no predicted entity overlaps them at all.
Writes results-edge/edge_judgment.json and prints a PASS/FAIL table.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "results-edge" / "raw_hybrid.json"
EXP = ROOT / "data-edge" / "expected.json"
OUT = ROOT / "results-edge" / "edge_judgment.json"

COVER = 0.8  # fraction of expected span that must be covered


def overlap(a0, a1, b0, b1):
    return max(0, min(a1, b1) - max(a0, b0))


def main():
    preds = {d["id"]: d for d in json.load(open(RAW))}
    expected = json.load(open(EXP))
    rows = []
    for cid, spec in expected.items():
        d = preds[cid]
        ents = d["entities"]
        fails, notes = [], []
        for e in spec["expected"]:
            span_len = e["end"] - e["start"]
            best = max([overlap(e["start"], e["end"], p["start"], p["end"])
                        for p in ents] + [0])
            cov = best / span_len
            ok = cov >= COVER
            if not ok:
                fails.append(f"expected {e['value']!r} ({e['note']}) uncovered "
                             f"(best {cov:.0%})")
            notes.append(f"{e['value']!r}: {'covered' if ok else 'MISSED'} "
                         f"{cov:.0%}")
        for e in spec["expect_absent"]:
            ov = max([overlap(e["start"], e["end"], p["start"], p["end"])
                      for p in ents] + [0])
            if ov > 0:
                fails.append(f"over-redaction: {e['value']!r} ({e['note']}) "
                             f"flagged")
                notes.append(f"{e['value']!r}: FLAGGED (should be absent)")
            else:
                notes.append(f"{e['value']!r}: correctly absent")
        rows.append({
            "id": cid,
            "pass": not fails,
            "ms": round(d["ms"], 1),
            "n_pred": len(ents),
            "detail": "; ".join(notes),
            "failures": fails,
        })
    json.dump(rows, open(OUT, "w"), indent=2)
    npass = sum(r["pass"] for r in rows)
    print(f"{npass}/{len(rows)} edge cases PASS (hybrid mode)\n")
    for r in rows:
        mark = "PASS" if r["pass"] else "FAIL"
        print(f"{mark}  {r['id']:22s} {r['detail']}")
        for f in r["failures"]:
            print(f"        -> {f}")


if __name__ == "__main__":
    main()
