#!/usr/bin/env bash
# Create upgrade/<tag> from an official Rakazo tag and cherry-pick our custom commits.
# Stops on the first conflict. Does not deploy and does not migrate a live database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "usage: bash scripts/fork-upgrade-start.sh <official-tag>" >&2
  echo "example: bash scripts/fork-upgrade-start.sh v0.8.0" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash first." >&2
  git status --short >&2
  exit 1
fi

UPSTREAM_URL="https://github.com/elie222/rakazo.git"
if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream "$UPSTREAM_URL"
fi

# Do not fetch every upstream tag: the official `android` tag collides with this fork.
git fetch upstream main --no-tags
git fetch upstream --prune '+refs/tags/v*:refs/tags/v*'

if ! git rev-parse --verify "refs/tags/$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG not found after fetching upstream. Check the name." >&2
  exit 1
fi

if ! git rev-parse --verify upstream/main >/dev/null 2>&1; then
  echo "Missing upstream/main after fetch." >&2
  exit 1
fi

BASE="$(git merge-base HEAD upstream/main)"
mapfile -t CUSTOM_COMMITS < <(git rev-list --reverse "$BASE"..HEAD)
if [[ "${#CUSTOM_COMMITS[@]}" -eq 0 ]]; then
  echo "No custom commits between HEAD and upstream/main. Nothing to replay." >&2
  exit 1
fi

BRANCH="upgrade/${TAG}"
if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  echo "Branch $BRANCH already exists. Delete it only after you are sure it is disposable." >&2
  exit 1
fi

echo "Official tag:     $TAG $(git rev-parse --short "$TAG")"
echo "Custom commits:   ${#CUSTOM_COMMITS[@]}"
git log --oneline --reverse "$BASE"..HEAD
echo
echo "Creating $BRANCH from $TAG and cherry-picking those commits."

git checkout -b "$BRANCH" "$TAG"

if git cherry-pick "${CUSTOM_COMMITS[@]}"; then
  echo
  echo "Cherry-pick finished on $BRANCH."
  echo "Run the checks in docs/fork-upgrade.md before merging to main or deploying."
  exit 0
fi

echo
echo "Stopped on a conflict. Keep official behavior and re-attach our WeCom / Excel / CRM hooks."
echo "Do not rename packages/db/prisma/migrations/20261022120000_wecom_user_binding"
echo
echo "Then:"
echo "  git add <resolved-files>"
echo "  git cherry-pick --continue"
echo
echo "To give up this attempt only:"
echo "  git cherry-pick --abort"
echo "  git checkout -"
echo
echo "Full runbook: docs/fork-upgrade.md"
exit 1
