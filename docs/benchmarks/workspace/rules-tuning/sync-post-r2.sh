#!/bin/bash
# Sync current worktree deid source -> benchmark pipeline + site bundle,
# then run the post-change full 1000-text hybrid benchmark.
set -e
REPO=/home/hatch/workspace/prerounding/repo
RT=/home/hatch/workspace/deid-benchmark/rules-tuning
SITE=/home/hatch/workspace/deid-benchmark/site

cp "$REPO/src/vault/deid.js" "$RT/pipeline/deid.js"
cp "$REPO/src/patient-context/deid-client.js" "$RT/pipeline/deid-client.js"
cp "$REPO/src/patient-context/deid-model-options.js" "$RT/pipeline/deid-model-options.js"
cp "$REPO/src/patient-context/deid-service.js" "$RT/pipeline/deid-service.js"
cp "$REPO/src/patient-context/deid-worker.js" "$RT/pipeline/deid-worker.js"
cp "$RT/pipeline/deid.js" "$SITE/src/vault/deid.js"
cd "$SITE" && ../node_modules/.bin/esbuild src/vault/deid.js --bundle --format=esm --outfile=src/vault/deid.bundle.js
cd "$RT"
echo "synced; bundle rebuilt"
grep -c "addKnownPatientIdentityEntities\|modelScoreThresholdForLabel\|CLINICAL_TERM_STOPLIST" "$SITE/src/vault/deid.bundle.js"
