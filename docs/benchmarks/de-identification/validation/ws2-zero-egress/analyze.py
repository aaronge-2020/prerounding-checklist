#!/usr/bin/env python3
"""Analyze ws2 CDP captures into a host inventory.

For each capture: list every remote host contacted, request counts, methods,
URL paths, uploaded-byte totals, and whether any request body contained one of
the synthetic PHI strings (notes.synthetic.json). Prints a summary and writes
<capture>.inventory.json.
"""
import json, os, sys
from urllib.parse import urlparse
from collections import defaultdict

WS2 = os.path.expanduser("~/workspace/deid-validation/ws2-zero-egress")
NOTES = json.load(open(os.path.join(WS2, "notes.synthetic.json")))
PHI = NOTES["phi_strings"]
LOCAL_HOSTS = {"127.0.0.1:8904", "127.0.0.1", "localhost:8904", "localhost"}

def load(name):
    with open(os.path.join(WS2, "captures", name)) as f:
        return json.load(f)

def phi_hits(text):
    if not text:
        return []
    return [s for s in PHI if s in text]

def inventory(cap):
    reqs = cap["requests"]
    by_host = defaultdict(list)
    for r in reqs:
        by_host[r["host"]].append(r)
    rows = []
    for host in sorted(by_host):
        rs = by_host[host]
        remote = host not in LOCAL_HOSTS
        paths = defaultdict(int)
        methods = defaultdict(int)
        up_bytes = 0
        hits = set()
        for r in rs:
            try:
                p = urlparse(r["url"]).path or "/"
            except Exception:
                p = r["url"][:80]
            if len(p) > 90:
                p = p[:90] + "..."
            paths[p] += 1
            methods[r["method"]] += 1
            pd = r.get("postData") or {}
            up_bytes += pd.get("bytes", 0) or 0
            for h in phi_hits(pd.get("text") or ""):
                hits.add(h)
        rows.append({
            "host": host, "remote": remote, "requests": len(rs),
            "methods": dict(methods), "uploaded_bytes": up_bytes,
            "phi_strings_in_bodies": sorted(hits),
            "paths": dict(sorted(paths.items(), key=lambda kv: -kv[1])[:25]),
        })
    return rows, len(reqs)

def main():
    for name in ["cold.cdp.json", "warm.cdp.json", "send.cdp.json"]:
        p = os.path.join(WS2, "captures", name)
        if not os.path.exists(p):
            print(f"--- {name}: MISSING")
            continue
        cap = load(name)
        rows, total = inventory(cap)
        json.dump(rows, open(p.replace(".cdp.json", ".inventory.json"), "w"), indent=1)
        print(f"=== {name}: {total} requests, {len(cap['responses'])} responses, {len(cap['failures'])} failures")
        for r in rows:
            tag = "REMOTE" if r["remote"] else "local "
            print(f"  [{tag}] {r['host']}: {r['requests']} req, methods={r['methods']}, up={r['uploaded_bytes']}B, phi_hits={r['phi_strings_in_bodies']}")
            for path, n in list(r["paths"].items())[:8]:
                print(f"         {n}x {path}")
        print()

if __name__ == "__main__":
    main()
