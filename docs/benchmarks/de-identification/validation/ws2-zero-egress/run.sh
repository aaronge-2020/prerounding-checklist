#!/bin/bash
# ws2 zero-egress: reproducible capture runner.
# Runs: cold-cache session -> warm-cache session -> authorized send-path test.
# All note text is synthetic (notes.synthetic.json). The ONLY remote request
# carrying note-derived content is the single parent-authorized OpenAI send
# with the dummy key "sk-test-dummy" (expect HTTP 401).
set -u
WS2="$HOME/workspace/deid-validation/ws2-zero-egress"
PORT="${PORT:-8904}"
PROF_COLD="$WS2/profiles/cold-api"
PROF_SEND="$WS2/profiles/send-ui"

rm -rf "$PROF_COLD" "$PROF_SEND"
mkdir -p "$WS2/captures"

node "$WS2/server.mjs" > "$WS2/captures/server.log" 2>&1 &
SRV=$!
trap "kill $SRV 2>/dev/null" EXIT
sleep 1
curl -s -o /dev/null -w "server: %{http_code}\n" "http://127.0.0.1:$PORT/"

echo "=== cold-cache session (fresh profile, 5 notes via API) ==="
node "$WS2/capture-api.mjs" --session cold --port "$PORT" --profile "$PROF_COLD" --out "$WS2/captures/cold.cdp.json"

echo "=== warm-cache session (same profile, reload, 1 note) ==="
node "$WS2/capture-api.mjs" --session warm --port "$PORT" --profile "$PROF_COLD" --out "$WS2/captures/warm.cdp.json"

echo "=== send-path test (UI review, authorized dummy-key send) ==="
node "$WS2/capture-send-ui.mjs"

echo "=== done ==="
ls -la "$WS2/captures/"
