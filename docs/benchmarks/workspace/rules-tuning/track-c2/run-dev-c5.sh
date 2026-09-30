#!/bin/bash
# ClinicalE5 dev-set iteration. Usage: run-dev-c5.sh <pipeline.js> <tag>
# Builds site bundle from the given pipeline copy, runs dev shards (rows 0-699)
# on harness-clinicale5.html, assembles, scores. Benchmark-dir only.
set -e
PIPE="$1"; TAG="$2"
RT=/home/hatch/workspace/deid-benchmark/rules-tuning
TC2=$RT/track-c2
SITE=/home/hatch/workspace/deid-benchmark/site
cp "$PIPE" "$SITE/src/vault/deid.js"
cd "$SITE" && ../node_modules/.bin/esbuild src/vault/deid.js --bundle --format=esm --outfile=src/vault/deid.bundle.js >/dev/null 2>&1
cd "$RT"
OUT="$TC2/dev-out-$TAG"
mkdir -p "$OUT"
node "$TC2/dev-driver-c5.mjs" --shard 0 --nshards 2 --out "$OUT" --tag "$TAG" > "$OUT/shard0.log" 2>&1 &
P0=$!
node "$TC2/dev-driver-c5.mjs" --shard 1 --nshards 2 --out "$OUT" --tag "$TAG" > "$OUT/shard1.log" 2>&1 &
P1=$!
wait $P0; wait $P1
node "$RT/assemble.mjs" --out "$OUT" --tag "$TAG" --final "$TC2/raw_dev_$TAG.json"
python3 "$RT/dev-score.py" "$TC2/raw_dev_$TAG.json" "$TAG"
