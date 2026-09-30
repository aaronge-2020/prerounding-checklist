#!/bin/bash
# Sample peak RSS of the Chromium process tree during a benchmark run.
# Usage: rss_peak.sh <output_file>  — run in background, kill when done.
OUT="$1"
peak=0
while true; do
  total=0
  for pid in $(pgrep -f "chrome.*headless" 2>/dev/null); do
    rss=$(awk '/VmRSS/{print $2}' /proc/$pid/status 2>/dev/null)
    total=$((total + ${rss:-0}))
  done
  if [ "$total" -gt "$peak" ]; then peak=$total; fi
  echo "$(date +%s) $total $peak" >> "$OUT"
  sleep 5
done
