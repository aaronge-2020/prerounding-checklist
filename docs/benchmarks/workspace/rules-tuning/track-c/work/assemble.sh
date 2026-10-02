#!/bin/bash
# Assemble the Track C tuning working copy: pristine baseline + candidate
# definitions + flag-guarded calls. Usage: assemble.sh C1|C2|...|BASE (comma-separated, or BASE for none)
# Durable version (2026-09-29): lives in rules-tuning/track-c/work (NOT /tmp).
set -e
RT=/home/hatch/workspace/deid-benchmark/rules-tuning
WORK="$RT/track-c/work"
CANDS="$WORK/trackc-candidates.js"
cp "$WORK/deid-baseline.js" "$RT/pipeline/deid.js"

# 1. split candidates file into flags and definitions
FLAGS=$(grep -E "^const TRACK_C_C[0-9] = " "$CANDS")
DEFS=$(sed -n '/^\/\/ TRACK-C C1 - labeled/,$p' "$CANDS")

# 2. enable requested candidates
for c in $(echo "$1" | tr ',' ' '); do
  FLAGS=$(echo "$FLAGS" | sed "s/const TRACK_C_${c} = false;/const TRACK_C_${c} = true;/")
done

# 3. insert flags, definitions, and calls
python3 - "$RT/pipeline/deid.js" "$FLAGS" "$DEFS" "$WORK/trackc-calls.txt" << 'EOF'
import sys
path, flags, defs, calls_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
src = open(path).read()

anchor = "export function normalizePhiLabel"
assert anchor in src
src = src.replace(anchor, flags + "\n" + anchor, 1)

anchor2 = "export function addStructuredSafeHarborEntities"
assert anchor2 in src
src = src.replace(anchor2, defs + "\n" + anchor2, 1)

calls = "  addAgeEntities(rawText, entities);\n\n" + open(calls_path).read()
old = "  addAgeEntities(rawText, entities);\n"
assert old in src
src = src.replace(old, calls, 1)
open(path, "w").write(src)
print("assembled with:", [l for l in flags.splitlines() if "= true" in l] or ["BASELINE"])
EOF
node --check "$RT/pipeline/deid.js" && echo "syntax OK"
