#!/bin/bash
# Sequential MedDeID benchmark runs: 2 models x 3 layers.
# The driver resumes from checkpoints, so retrying a failed config is safe.
cd ~/workspace/deid-benchmark/meddeid
for model in clinicale5 stanford; do
  for layer in base trackb trackbc; do
    tag="${model}_${layer}"
    ok=0
    for attempt in 1 2 3; do
      echo "=== START $tag attempt=$attempt $(date) ==="
      node meddeid-driver.mjs --model "$model" --layer "$layer" > "out/${tag}.run.log" 2>&1
      code=$?
      echo "=== END $tag attempt=$attempt exit=$code $(date) ==="
      if [ $code -eq 0 ]; then ok=1; break; fi
      sleep 10
    done
    if [ $ok -ne 1 ]; then
      echo "FAILED after 3 attempts: $tag (see out/${tag}.run.log)"
    fi
  done
done
echo "ALL CONFIGS COMPLETE $(date)"
