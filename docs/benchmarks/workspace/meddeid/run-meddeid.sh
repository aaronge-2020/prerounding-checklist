#!/bin/bash
# Sequential MedDeID benchmark runs: 2 models x 2 layers.
# The driver resumes from checkpoints, so retrying a failed config is safe.
cd ~/workspace/deid-benchmark/meddeid

run_config() {
  local tag="$1"; shift
  local ok=0
  for attempt in 1 2 3; do
    echo "=== START $tag attempt=$attempt $(date -u) ==="
    node meddeid_driver.mjs "$@" --tag "$tag" > "out/${tag}.run.log" 2>&1
    code=$?
    echo "=== END $tag attempt=$attempt exit=$code $(date -u) ==="
    if [ $code -eq 0 ]; then ok=1; break; fi
    sleep 15
  done
  if [ $ok -ne 1 ]; then
    echo "FAILED after 3 attempts: $tag (see out/${tag}.run.log)"
  fi
}

# 1. OpenMed Small int8, base (9ba7615f rules)
run_config openmed_base --model Wismut/openmed-onnx/small --dtype int8 --port 8903 --page survey2.html --batch 10
# 2. OpenMed Small int8, +TrackBC (C8 candidate stack)
run_config openmed_trackbc --model Wismut/openmed-onnx/small --dtype int8 --port 8904 --page harness-param.html --batch 10
# 3. RoBERTa i2b2 q8, base
run_config roberta_base --model thinkingface/deid_roberta_i2b2_q --dtype q8 --port 8903 --page survey2.html --batch 5
# 4. RoBERTa i2b2 q8, +TrackBC
run_config roberta_trackbc --model thinkingface/deid_roberta_i2b2_q --dtype q8 --port 8904 --page harness-param.html --batch 5

echo "ALL CONFIGS COMPLETE $(date -u)"
