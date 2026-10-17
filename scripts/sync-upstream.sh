#!/bin/sh
# Bring the original openGym's new commits into this fork.
#
#   sh scripts/sync-upstream.sh              # fetch, update main, merge into custom, re-apply the name
#   sh scripts/sync-upstream.sh --push       # ...and push main and custom to origin when it went through
#   sh scripts/sync-upstream.sh --dry-run    # only say what is new
#
# It stops, with the merge left open, when two sides changed the same lines: fix the files it lists,
# `git add` them, `git commit`, then run `sh scripts/rebrand.sh` yourself. See docs/FORK.md.
set -eu
cd "$(dirname "$0")/.."
PUSH=0; DRY=0
for a in "$@"; do
  case "$a" in
    --push) PUSH=1 ;;
    --dry-run) DRY=1 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done
UP="${UPSTREAM_REMOTE:-upstream}"; MIRROR="${MIRROR_BRANCH:-main}"; WORK="${WORK_BRANCH:-custom}"

START="$(git rev-parse --abbrev-ref HEAD)"

git fetch "$UP"
NEW="$(git rev-list --count "$MIRROR..$UP/$MIRROR")"
if [ "$NEW" = "0" ]; then echo "Already up to date: nothing new in $UP/$MIRROR."; exit 0; fi
echo "$NEW new commit(s) upstream:"
git log --oneline "$MIRROR..$UP/$MIRROR" | head -30
[ "$DRY" = "1" ] && { echo "(dry run, nothing changed)"; exit 0; }

if [ -n "$(git status --porcelain)" ]; then
  echo "The working tree has uncommitted changes. Commit or stash them first." >&2; exit 1
fi

# main only ever mirrors upstream, so this is always a fast-forward
git checkout "$MIRROR"
git merge --ff-only "$UP/$MIRROR"

git checkout "$WORK"
if ! git merge --no-edit "$MIRROR"; then
  echo
  echo "Conflicts in:"; git diff --name-only --diff-filter=U | sed 's/^/  /'
  echo "Fix them, then: git add <files> && git commit && sh scripts/rebrand.sh"
  echo "(git rerere is on, so the same conflict is resolved for you next time.)"
  exit 1
fi

# new upstream text says "openGym" again
sh scripts/rebrand.sh
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -q -m "Re-apply the myGym name after merging upstream"
fi

(cd frontend && node scripts/check-locales.mjs && node scripts/check-source-strings.mjs) || \
  echo "Locale check reported something: new upstream strings may need a Hungarian/German entry."

if [ "$PUSH" = "1" ]; then
  git push origin "$MIRROR" "$WORK"
else
  echo "Merged. Run the tests, then: git push origin $MIRROR $WORK"
fi
echo "To deploy: docker compose up -d --build   (or sh scripts/dev-deploy.sh for the frontend only)"
git checkout "$START" 2>/dev/null || true
