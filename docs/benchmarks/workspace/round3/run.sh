#!/bin/bash
# Round 3 sequential runner: 8 configs, fastest-first, 3 attempts each.
# Checkpoint-resume makes retries and runtime restarts safe.
# Scores each completed config immediately (incremental results).
set -u
cd ~/workspace/deid-benchmark/round3
export NOTES_FILE="$PWD/notes_full.jsonl"

# Start the static server if it isn't already listening.
if ! curl -s -o /dev/null --max-time 3 "http://127.0.0.1:8905/harness-param.html"; then
  echo "starting round3 server on 8905"
  nohup node server.mjs > server.log 2>&1 &
  sleep 2
fi

CLINICALE5="OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android"
OPENMED="Wismut/openmed-onnx/small"
STANFORD="onnx-community/stanford-deidentifier-base-ONNX"

run_config() {
  local tag="$1" model="$2" dtype="$3" layer="$4"
  local ok=0
  for attempt in 1 2 3; do
    echo "=== START $tag attempt=$attempt $(date -u) ==="
    node driver.mjs --model "$model" --dtype "$dtype" --layer "$layer" --tag "$tag" --port 8905 --batch 10 > "out/${tag}.run.log" 2>&1
    code=$?
    echo "=== END $tag attempt=$attempt exit=$code $(date -u) ==="
    if [ $code -eq 0 ] && [ -f "out/${tag}.json" ]; then ok=1; break; fi
    sleep 15
  done
  if [ $ok -ne 1 ]; then
    echo "FAILED after 3 attempts: $tag (see out/${tag}.run.log)"
    return 1
  fi
  echo "--- scoring $tag ---"
  python3 score.py "$tag" | tee "out/${tag}.score.txt"
}

# Fastest-first: ClinicalE5 -> OpenMed Small -> Stanford
run_config clinicale5_base    "$CLINICALE5" int8 base
run_config clinicale5_trackb  "$CLINICALE5" int8 trackb
run_config clinicale5_trackbc "$CLINICALE5" int8 trackbc
run_config openmed_base       "$OPENMED"    int8 base
run_config openmed_trackbc    "$OPENMED"    int8 trackbc
run_config stanford_base      "$STANFORD"   q8   base
run_config stanford_trackb    "$STANFORD"   q8   trackb
run_config stanford_trackbc   "$STANFORD"   q8   trackbc

echo "ALL ROUND3 CONFIGS COMPLETE $(date -u)"
