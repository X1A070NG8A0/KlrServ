#!/usr/bin/env bash
# Usage: scripts/checkpoint.sh <done-chapter> [next-chapter]
# Validates, marks the chapter done in data/progress.yaml, and commits a local
# checkpoint so an interrupt (usage limit, crash) cannot lose finished work.
set -e
cd "$(dirname "$0")/.."
done_ch="$1"; next_ch="$2"
"/c/Program Files/nodejs/node.exe" build.ts --check | grep -E "^(ERRORS|NUMBER MISSES|WARNINGS)"
sed -i -E "s/^(  ${done_ch}): .*/\1: done/" data/progress.yaml
[ -n "$next_ch" ] && sed -i -E "s/^(  ${next_ch}): .*/\1: in-progress/" data/progress.yaml
git add -A data doc/figures scripts site README.md 2>/dev/null
git commit -q -m "Checkpoint: chapter ${done_ch} written in STE" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" 2>/dev/null && git log --oneline -1
