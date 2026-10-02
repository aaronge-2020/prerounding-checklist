#!/bin/bash
# One dev-set iteration: sync working copy -> site, rebuild bundle, run both
# shards, assemble, score. Usage: run-dev.sh <tag>
# Leaves the pristine pipeline-src/ untouched; only site/src/vault/deid.js
# (the harness build input) is swapped, and it is restored at the end.
set -e
TAG="$1"
RT=/home/hatch/workspace/deid-benchmark/rules-tuning
SITE=/home/hatch/workspace/deid-benchmark/site
cp "$RT/pipeline/deid.js" "$SITE/src/vault/deid.js"
cd "$SITE" && ../node_modules/.bin/esbuild src/vault/deid.js --bundle --format=esm --outfile=src/vault/deid.bundle.js >/dev/null 2>&1
cd "$RT"
OUT="dev-out-$TAG"
mkdir -p "$OUT"
node dev-driver.mjs --shard 0 --nshards 2 --out "$OUT" --tag "$TAG" > "$OUT/shard0.log" 2>&1 &
P0=$!
node dev-driver.mjs --shard 1 --nshards 2 --out "$OUT" --tag "$TAG" > "$OUT/shard1.log" 2>&1 &
P1=$!
wait $P0; wait $P1
node assemble.mjs --out "$OUT" --tag "$TAG" --final "raw_dev_$TAG.json"
python3 dev-score.py "raw_dev_$TAG.json" "$TAG"
