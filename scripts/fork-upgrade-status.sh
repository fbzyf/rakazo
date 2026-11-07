#!/usr/bin/env bash
# Show how far this fork is behind official Rakazo, and which commits are ours.
# Does not change branches or files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UPSTREAM_URL="https://github.com/elie222/rakazo.git"
UPSTREAM_REF="${1:-upstream/main}"

if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream "$UPSTREAM_URL"
  echo "Added remote upstream -> $UPSTREAM_URL"
fi

# Do not fetch every upstream tag: the official `android` tag collides with this fork.
git fetch upstream main --no-tags
git fetch upstream --prune '+refs/tags/v*:refs/tags/v*'

if ! git rev-parse --verify "$UPSTREAM_REF" >/dev/null 2>&1; then
  echo "Missing $UPSTREAM_REF after fetch." >&2
  exit 1
fi

BASE="$(git merge-base HEAD "$UPSTREAM_REF")"
BEHIND="$(git rev-list --count HEAD.."$UPSTREAM_REF")"
AHEAD="$(git rev-list --count "$UPSTREAM_REF"..HEAD)"
LATEST_TAG="$(git describe --tags --abbrev=0 "$UPSTREAM_REF" 2>/dev/null || echo "(none)")"

echo "Current HEAD:     $(git rev-parse --short HEAD) ($(git branch --show-current || echo detached))"
echo "Official:         $UPSTREAM_REF $(git rev-parse --short "$UPSTREAM_REF")"
echo "Shared ancestor:  $(git rev-parse --short "$BASE")"
echo "Behind official:  $BEHIND commits"
echo "Custom commits:   $AHEAD"
echo "Latest official tag on that line: $LATEST_TAG"
echo
echo "Our commits (not in official):"
if [[ "$AHEAD" -eq 0 ]]; then
  echo "  (none)"
else
  git log --oneline "$UPSTREAM_REF"..HEAD
fi
echo
echo "Next: pick a stable tag from 'git tag --list \"v*\" --sort=-v:refname | head',"
echo "then run:  bash scripts/fork-upgrade-start.sh <tag>"
echo "Read docs/fork-upgrade.md before using the result on a live server."
