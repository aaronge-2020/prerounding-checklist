#!/bin/bash
# TRACK C resync: copy the FULL deid.js bundle import closure from the live
# worktree into the benchmark site, then rebuild the esbuild bundle.
# Closure (from src/vault/deid.js imports):
#   src/vault/deid.js, src/vault/deid/*.js, src/patient-context/review.js
# (vendor/chrono-node and src/data/clinical-guard-export.js already verified
# byte-identical; other patient-context files are NOT imported by the bundle.)
set -e
REPO=/home/hatch/workspace/prerounding/repo
SITE=/home/hatch/workspace/deid-benchmark/site
RT=/home/hatch/workspace/deid-benchmark/rules-tuning

cp "$REPO/src/vault/deid.js" "$SITE/src/vault/deid.js"
cp "$REPO/src/vault/deid/"*.js "$SITE/src/vault/deid/"
cp "$REPO/src/patient-context/review.js" "$SITE/src/patient-context/review.js"
# working copy for Track C tuning iterations
cp "$REPO/src/vault/deid.js" "$RT/pipeline/deid.js"

cd "$SITE" && ../node_modules/.bin/esbuild src/vault/deid.js --bundle --format=esm --outfile=src/vault/deid.bundle.js
cd "$RT"
echo "resync done; Track-B markers in bundle:"
grep -c "addKnownPatientIdentityEntities\|CLINICAL_TERM_STOPLIST\|reviewEntityConfidence" "$SITE/src/vault/deid.bundle.js"
echo "worktree/site deid.js identical?"; cmp -s "$REPO/src/vault/deid.js" "$SITE/src/vault/deid.js" && echo YES
