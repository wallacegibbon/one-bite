#!/usr/bin/env bash
# Rewrite the initial commit messages from Chinese to English.
# filter-branch feeds the original message on stdin and sets $GIT_COMMIT to the
# ORIGINAL hash, so tools/msg-filter.sh can map old hash -> new message.
set -e
cd "$(dirname "$0")/.."
chmod +x tools/msg-filter.sh

FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter "bash '$(pwd)/tools/msg-filter.sh'" -- --all

git for-each-ref --format='%(refname)' refs/original | xargs -r -n1 git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now --quiet || true

echo "--- rewritten history ---"
git log --format='%h  %s'
