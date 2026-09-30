#!/usr/bin/env python3
"""Score one survey model's runs with the stock score.py (unchanged).
Usage: python3 score_survey.py --slug <slug> [--skip-hybrid]
1. copies results/load_info_<slug>.json -> results/load_info.json
2. remaps results/raw_<slug>_<mode>.json labels -> results/raw_<mode>.json
3. runs the stock harness/score.py (writes results/results.json)
4. renames results/results.json -> results/results_<slug>.json and restores
   the canonical raw_*.json / results.json files it overwrote.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # models-survey/
RES = os.path.join(ROOT, "results")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--skip-hybrid", action="store_true")
    args = ap.parse_args()

    modes = ["model-only", "hybrid"]
    backups = {}
    for f in ["raw_hybrid.json", "raw_modelonly.json", "results.json", "load_info.json"]:
        p = os.path.join(RES, f)
        if os.path.exists(p):
            # MOVE (not copy): a stale raw_*.json left in place would be
            # silently scored by the stock score.py.
            backups[f] = p + ".bak"
            shutil.move(p, p + ".bak")

    try:
        shutil.copy2(os.path.join(RES, f"load_info_{args.slug}.json"),
                     os.path.join(RES, "load_info.json"))
        for mode in modes:
            src = os.path.join(RES, f"raw_{args.slug}_{mode}.json")
            # stock score.py expects raw_modelonly.json / raw_hybrid.json
            dst = os.path.join(RES, f"raw_{mode.replace('-', '')}.json")
            r = subprocess.run(
                [sys.executable, os.path.join(HERE, "remap_labels.py"),
                 args.slug, src, dst], capture_output=True, text=True)
            print(r.stdout.strip())
            if r.returncode:
                print(r.stderr, file=sys.stderr)
                raise SystemExit("remap failed")
        r = subprocess.run([sys.executable, os.path.join(HERE, "score.py")],
                           capture_output=True, text=True, cwd=HERE)
        print(r.stdout.strip())
        if r.returncode:
            print(r.stderr, file=sys.stderr)
            raise SystemExit("score.py failed")
        shutil.move(os.path.join(RES, "results.json"),
                    os.path.join(RES, f"results_{args.slug}.json"))
        print(f"wrote results/results_{args.slug}.json")
    finally:
        for f, bak in backups.items():
            shutil.move(bak, os.path.join(RES, f))

if __name__ == "__main__":
    main()
