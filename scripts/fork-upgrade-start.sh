#!/usr/bin/env bash
# Create upgrade/<tag> from an official Rakazo tag and overlay this fork's
# tree difference since its current stable tag. Stops on conflicts.
# Does not deploy and does not migrate a live database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "usage: bash scripts/fork-upgrade-start.sh <official-tag>" >&2
  echo "example: bash scripts/fork-upgrade-start.sh v0.8.0" >&2
  exit 1
fi

if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Tag $TAG is not a stable vX.Y.Z tag." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash first." >&2
  git status --short >&2
  exit 1
fi

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

TAG_LIST="$(mktemp)"
MERGE_ERR="$(mktemp)"
trap 'rm -f "$TAG_LIST" "$MERGE_ERR"' EXIT
git tag --list 'v*' --merged HEAD --sort=-v:refname >"$TAG_LIST"
BASE_TAG="$(pick_stable_tag <"$TAG_LIST" || true)"
if [[ -z "$BASE_TAG" ]]; then
  echo "No stable vX.Y.Z tag is contained in HEAD. Refusing to overlay." >&2
  exit 1
fi

if [[ "$TAG" == "$BASE_TAG" ]]; then
  echo "Already based on $TAG. Nothing to overlay." >&2
  exit 1
fi

if ! git merge-base --is-ancestor "$BASE_TAG" "$TAG"; then
  echo "$BASE_TAG is not an ancestor of $TAG. Refusing to overlay onto an unrelated tag." >&2
  exit 1
fi

ORIGINAL="$(git rev-parse HEAD)"
if ! git merge-base --is-ancestor "$BASE_TAG" "$ORIGINAL"; then
  echo "$BASE_TAG is not contained in HEAD. Refusing to overlay." >&2
  exit 1
fi

BRANCH="upgrade/${TAG}"
if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  echo "Branch $BRANCH already exists. Delete it only after you are sure it is disposable." >&2
  exit 1
fi

PREVIOUS="$(git branch --show-current || true)"

echo "Official tag:     $TAG $(git rev-parse --short "$TAG")"
echo "Fork base tag:    $BASE_TAG $(git rev-parse --short "$BASE_TAG")"
echo "Fork tip:         $(git rev-parse --short "$ORIGINAL")"
echo
echo "Creating $BRANCH from $TAG and applying the tree difference since $BASE_TAG."

# Real merge of the two trees with our stable tag as the base. A plain
# read-tree merge stops on renames that this merge resolves, so use merge-tree.
set +e
MERGE_OUT="$(git merge-tree --write-tree --name-only --merge-base="$BASE_TAG" "$TAG" "$ORIGINAL" 2>"$MERGE_ERR")"
MERGE_CODE=$?
set -e
if [[ "$MERGE_CODE" -ne 0 && "$MERGE_CODE" -ne 1 ]]; then
  echo "Could not compare $BASE_TAG, $TAG, and the fork tip." >&2
  cat "$MERGE_ERR" >&2
  exit 1
fi

TREE="$(printf '%s\n' "$MERGE_OUT" | head -n 1)"
if ! [[ "$TREE" =~ ^[0-9a-f]{40}$ || "$TREE" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Unexpected merge result." >&2
  printf '%s\n' "$MERGE_OUT" >&2
  exit 1
fi
mapfile -t CONFLICTS < <(printf '%s\n' "$MERGE_OUT" | awk 'NR > 1 && NF == 0 { exit } NR > 1 { print }')

if [[ "$MERGE_CODE" -eq 0 && "${#CONFLICTS[@]}" -eq 0 && "$TREE" == "$(git rev-parse "$TAG^{tree}")" ]]; then
  echo "No tree difference between $BASE_TAG and the fork tip."
  exit 0
fi

git checkout -b "$BRANCH" "$TAG"
git read-tree --reset -u "$TREE"

if [[ "$MERGE_CODE" -ne 0 || "${#CONFLICTS[@]}" -gt 0 ]]; then
  if [[ "${#CONFLICTS[@]}" -gt 0 ]]; then
    for conflict_path in "${CONFLICTS[@]}"; do
      git reset -q -- "$conflict_path" || true
    done
  fi
  echo
  echo "Stopped on a conflict. The <<<<<<< $TAG side is official; below ======= is this fork."
  echo "Keep official behavior and re-attach our WeCom / Excel / CRM hooks."
  echo "Do not rename packages/db/prisma/migrations/20261022120000_wecom_user_binding"
  echo
  echo "Conflicted files:"
  if [[ "${#CONFLICTS[@]}" -eq 0 ]]; then
    echo "  (merge reported a conflict but no file list)"
  else
    printf '  %s\n' "${CONFLICTS[@]}"
  fi
  echo
  echo "Then:"
  echo "  git add <resolved-files>"
  echo "  git commit -m \"custom: overlay $TAG on fork work from $BASE_TAG\""
  echo
  echo "To give up this attempt only:"
  echo "  git reset --hard"
  if [[ -n "$PREVIOUS" ]]; then
    echo "  git checkout $PREVIOUS"
  else
    echo "  git switch --detach $ORIGINAL"
  fi
  echo "  git branch -D $BRANCH"
  echo
  echo "Full runbook: docs/fork-upgrade.md"
  exit 1
fi

if ! git diff --quiet; then
  echo "Overlay left unstaged changes. Stopping without a commit." >&2
  git status --short >&2
  exit 1
fi

if git diff --cached --quiet; then
  echo "Overlay produced no staged changes. Stopping without a commit." >&2
  exit 1
fi

git commit -m "custom: overlay $TAG on fork work from $BASE_TAG" \
  -m "Replay the tree difference from $BASE_TAG onto $TAG. Does not deploy a live server."

echo
echo "Overlay committed on $BRANCH."
echo "Run the checks in docs/fork-upgrade.md before merging to main or deploying."
