#!/usr/bin/env bash
# Fail when the pull request diff introduces trailing whitespace, a new blank
# line at end of file, or conflict markers.
#
# Usage: scripts/check-pr-whitespace.sh <base-sha> [head-sha]
# Compares the three-dot diff from the merge base of those commits to head,
# which is the pull request change set rather than every difference between
# the two branch tips.

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: scripts/check-pr-whitespace.sh <base-sha> [head-sha]" >&2
  exit 2
fi

base="$1"
head="${2:-HEAD}"

if ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null; then
  echo "base commit not found: ${base}" >&2
  exit 2
fi
if ! git rev-parse --verify --quiet "${head}^{commit}" >/dev/null; then
  echo "head commit not found: ${head}" >&2
  exit 2
fi
git diff --check "${base}...${head}"
