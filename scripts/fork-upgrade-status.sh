#!/usr/bin/env bash
# Show how far this fork is behind official Rakazo, and which commits are ours.
# Does not change branches or files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UPSTREAM_URL="https://github.com/elie222/rakazo.git"
UPSTREAM_REF="${1:-upstream/main}"

# First stable vX.Y.Z tag in a version-sorted tag list on stdin.
pick_stable_tag() {
  local tag
  while IFS= read -r tag; do
    if [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      printf '%s\n' "$tag"
      return 0
    fi
  done
  return 1
}

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

# Newest stable tag already in HEAD, and the newest stable tag fetched.
# `git describe` before the fetch above can report an older local tag (v0.3.1
# on a clone that has not fetched v0.8.0) and can also prefer a pre-release.
TAG_LIST="$(mktemp)"
trap 'rm -f "$TAG_LIST"' EXIT
git tag --list 'v*' --merged HEAD --sort=-v:refname >"$TAG_LIST"
BASE_TAG="$(pick_stable_tag <"$TAG_LIST" || true)"
git tag --list 'v*' --sort=-v:refname >"$TAG_LIST"
LATEST_STABLE="$(pick_stable_tag <"$TAG_LIST" || true)"
BASE_TAG="${BASE_TAG:-(unknown)}"
LATEST_STABLE="${LATEST_STABLE:-(none)}"
if [[ "$LATEST_STABLE" != "(none)" ]] && git merge-base --is-ancestor "$LATEST_STABLE" "$UPSTREAM_REF"; then
  EDGE_AHEAD="$(git rev-list --count "${LATEST_STABLE}..${UPSTREAM_REF}")"
else
  EDGE_AHEAD="(unknown)"
fi
if [[ "$BASE_TAG" == "(unknown)" || "$LATEST_STABLE" == "(none)" || "$BASE_TAG" == "$LATEST_STABLE" ]]; then
  UPGRADE_DUE="no"
else
  UPGRADE_DUE="yes"
fi

echo "Current HEAD:     $(git rev-parse --short HEAD) ($(git branch --show-current || echo detached))"
echo "Official:         $UPSTREAM_REF $(git rev-parse --short "$UPSTREAM_REF")"
echo "Shared ancestor:  $(git rev-parse --short "$BASE")"
echo "Behind official:  $BEHIND commits"
echo "Custom commits:   $AHEAD"
echo "Latest official tag on that line: $LATEST_TAG"
echo "Fork base tag:    $BASE_TAG"
echo "Latest stable tag: $LATEST_STABLE"
if [[ "$EDGE_AHEAD" == "(unknown)" ]]; then
  echo "Official main past latest stable tag: (unknown)"
else
  echo "Official main past latest stable tag: $EDGE_AHEAD commits"
fi
echo "Upgrade due:      $UPGRADE_DUE"
echo
echo "Our commits (not in official):"
if [[ "$AHEAD" -eq 0 ]]; then
  echo "  (none)"
else
  git log --oneline "$UPSTREAM_REF"..HEAD
fi
echo
if [[ "$UPGRADE_DUE" == "yes" ]]; then
  echo "Next: bash scripts/fork-upgrade-start.sh $LATEST_STABLE"
else
  echo "Next: no newer stable tag. Official main commits past the stable tag are not an upgrade target."
fi
echo "Behind official counts commits on official main, not whether a stable upgrade is due."
echo "Read docs/fork-upgrade.md before using the result on a live server."
