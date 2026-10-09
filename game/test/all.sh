#!/usr/bin/env bash
# Run every non-screenshot test; exits non-zero if any of them fails.
cd "$(dirname "$0")/../.."
fail=0
run() {
  printf '%-14s' "$1"
  if timeout "${2:-260}" node "game/test/$1.js" >/tmp/frutaria-$1.log 2>&1; then
    echo PASS
  else
    echo FAIL; sed -n '1,12p' "/tmp/frutaria-$1.log"; fail=1
  fi
}
run node-smoke 60
run probe 60
run docs-sync 60
run docs-drift 180
run play 300
run upgrade 220
run input 300
run lang 220
exit $fail
