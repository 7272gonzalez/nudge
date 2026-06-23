#!/bin/bash
# start-nudge.sh — start the Nudge server in the background and open the browser.
# Called by Nudge.app; safe to run multiple times (won't start a second server).

PORT=3456
NODE="/opt/homebrew/bin/node"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

if ! lsof -ti:$PORT > /dev/null 2>&1; then
  cd "$DIR"
  # </dev/null fully detaches stdin so the process doesn't hang waiting for input.
  nohup "$NODE" server.js < /dev/null >> /tmp/nudge.log 2>&1 &
  # Wait up to 5 seconds for the server to be ready.
  for i in $(seq 1 10); do
    sleep 0.5
    lsof -ti:$PORT > /dev/null 2>&1 && break
  done
fi

open "http://localhost:$PORT"
