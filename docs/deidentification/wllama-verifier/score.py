#!/usr/bin/env python3
"""Score wllama verifier runs on dev-200. Three configs from one checkpoint
file: first (NER+rules), llm (LLM alone), union (first + llm)."""
import json
from pathlib import Path
from collections import Counter, defaultdict

HERE = Path("/home/hatch/workspace/deid-benchmark/wllama-verifier")
MED = Path("/home/hatch/workspace/deid-benchmark/meddeid")
dev_ids = set(json.load(open(MED / "track-d" / "split.json"))["dev_ids"])
gold_all = {g["id"]: g for g in json.load(open(MED / "gold.json"))}
gold = {gid: gold_all[gid] for gid in dev_ids if gid in gold_all}

rows = {}
for line in open(HERE / "checkpoints" / "verifier.jsonl"):
    line = line.strip()
    if line:
        r = json.loads(line)
        rows[r["id"]] = r
print(f"checkpoint rows: {len(rows)} / {len(gold)} dev notes")

def to_set(ents):
    return {(e["start"], e["end"], e["label"]) for e in ents}

def char_recall(gold_spans, pred_set, text):
    gold_chars = set()
    for s in gold_spans:
        gold_chars.update(range(s["begin"], s["end"]))
    if not gold_chars:
        return 1.0, 0, 0
    covered = sum(1 for c in gold_chars if any(a <= c < b for a, b, _ in pred_set))
    return covered / len(gold_chars), covered, len(gold_chars)

configs = {}
for gid, r in rows.items():
    fp = to_set(r["firstPass"])
    llm = to_set(r["llm"])
    configs.setdefault("first", {})[gid] = (fp, r["first_ms"])
    configs.setdefault("llm", {})[gid] = (llm, r["llm_ms"])
    configs.setdefault("union", {})[gid] = (fp | llm, r["first_ms"] + r["llm_ms"])

def prf(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return p, r, 2 * p * r / (p + r) if p + r else 0.0

results = {}
for name, cmap in configs.items():
    tot = Counter()
    rcov = rgold = 0
    lat = []
    for gid, (pset, ms) in cmap.items():
        g = gold[gid]
        gset = {(s["begin"], s["end"], s["type"]) for s in g["spans"]}
        tot["tp"] += len(gset & pset)
        tot["fp"] += len(pset - gset)
        tot["fn"] += len(gset - pset)
        r, c, t_ = char_recall(g["spans"], pset, g.get("text", ""))
        rcov += c
        rgold += t_
        lat.append(ms)
    p, r_, f = prf(tot["tp"], tot["fp"], tot["fn"])
    results[name] = dict(P=p, R=r_, F1=f, tp=tot["tp"], fp=tot["fp"], fn=tot["fn"],
                         char_recall=rcov / rgold if rgold else 0,
                         mean_ms=sum(lat) / len(lat), n=len(cmap))
    d = results[name]
    print(f"{name:6s} n={d['n']}: P={d['P']:.4f} R={d['R']:.4f} F1={d['F1']:.4f} "
          f"(tp={d['tp']} fp={d['fp']} fn={d['fn']}) charR={d['char_recall']:.4f} mean_ms={d['mean_ms']:.0f}")

f, l, u = results["first"], results["llm"], results["union"]
print(f"\ndelta union-first: dF1={u['F1']-f['F1']:+.4f} dCharR={u['char_recall']-f['char_recall']:+.4f}")
print(f"delta llm-first:   dF1={l['F1']-f['F1']:+.4f} dCharR={l['char_recall']-f['char_recall']:+.4f}")

# What does the LLM catch that the first pass misses? (llm-only true positives)
texts = {}
for line in open(MED / "track-d" / "notes-dev.jsonl"):
    r = json.loads(line)
    texts[r["id"]] = r["text"]
llm_only_tp = defaultdict(list)
for gid, r in rows.items():
    fp = to_set(r["firstPass"])
    llm = to_set(r["llm"])
    gset = {(s["begin"], s["end"], s["type"]) for s in gold[gid]["spans"]}
    for s in (llm & gset) - fp:
        llm_only_tp[s[2]].append(texts[gid][s[0]:s[1]])
print("\nLLM-only true positives by type (missed by NER+rules, caught by LLM):")
for t in sorted(llm_only_tp, key=lambda t: -len(llm_only_tp[t])):
    ex = llm_only_tp[t][:4]
    print(f"  {t:15s} n={len(llm_only_tp[t]):3d} e.g. {ex}")

# LLM failure stats
st = Counter()
for r in rows.values():
    s = r.get("llmStats", {})
    st["items"] += s.get("items", 0)
    st["unmatched"] += s.get("unmatched", 0)
    st["ambiguous"] += s.get("ambiguous", 0)
    st["badType"] += s.get("badType", 0)
    st["parseFailed"] += 1 if s.get("parseFailed") else 0
print(f"\nLLM span mapping: items={st['items']} unmatched(dropped)={st['unmatched']} "
      f"ambiguous(>1 occ)={st['ambiguous']} badType={st['badType']} parseFailedNotes={st['parseFailed']}")

json.dump({k: v for k, v in results.items()}, open(HERE / "scores.json", "w"), indent=1)
json.dump({t: {"n": len(v), "examples": v[:8]} for t, v in llm_only_tp.items()},
          open(HERE / "llm_only_tp.json", "w"), indent=1)
print("\nwrote scores.json, llm_only_tp.json")
