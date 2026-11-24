#!/usr/bin/env bash
# Real local Git remotes, no network, no production credentials or app tests.
# Exercises the CI coordinator with a deterministic validation stub.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export GIT_ALLOW_PROTOCOL=file
export GIT_AUTHOR_NAME='Release test' GIT_AUTHOR_EMAIL='release-test@example.invalid'
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
export RELEASE_MAX_ATTEMPTS=3
unset GITHUB_OUTPUT
make_repo() {
    git init -q --bare --initial-branch=main "$tmp/$1.git"
    git clone -q "$tmp/$1.git" "$tmp/$1"
    printf 'initial\n' > "$tmp/$1/source.txt"
    git -C "$tmp/$1" add .
    git -C "$tmp/$1" commit -qm initial
    git -C "$tmp/$1" push -q origin main
}
for repo in shared ciyan worldgen ascendant launcher; do make_repo "$repo"; done
git -C "$tmp/ciyan" submodule add -q "$tmp/shared.git" shared/google-drive
git -C "$tmp/ciyan" commit -qm 'pin shared'
git -C "$tmp/ciyan" push -q origin main
for path in apps/ciyan apps/worldgen apps/ascendant shared/google-drive; do
    repo=${path##*/}; [[ "$repo" != google-drive ]] || repo=shared
    git -C "$tmp/launcher" submodule add -q "$tmp/$repo.git" "$path"
done
mkdir -p "$tmp/launcher/scripts"
cp "$root/scripts/reconcile-release.sh" "$root/scripts/check-upstream-pins.sh" "$tmp/launcher/scripts/"
cat > "$tmp/launcher/scripts/verify-release.sh" <<'STUB'
#!/bin/sh
set -eu
printf '%s\n' "$(git rev-parse HEAD)" >> "$TEST_ROOT/validated"
sh scripts/check-upstream-pins.sh
if [ -f "$TEST_ROOT/force-failure" ]; then exit 1; fi
if [ -f "$TEST_ROOT/trigger-race" ]; then
    rm "$TEST_ROOT/trigger-race"
    git -C "$TEST_ROOT/human" pull --ff-only -q
    printf 'keep this human commit\n' > "$TEST_ROOT/human/human.txt"
    git -C "$TEST_ROOT/human" add human.txt
    git -C "$TEST_ROOT/human" commit -qm 'human push during tests'
    git -C "$TEST_ROOT/human" push -q origin main
fi
STUB
git -C "$tmp/launcher" add .
git -C "$tmp/launcher" commit -qm 'initial pinned release'
git -C "$tmp/launcher" push -q origin main main:production
git clone -q "$tmp/launcher.git" "$tmp/human"
git clone -q --recurse-submodules "$tmp/launcher.git" "$tmp/ci"
export TEST_ROOT=$tmp
advance_repo() {
    printf '%s\n' "$2" >> "$tmp/$1/source.txt"
    git -C "$tmp/$1" commit -qam "$2"
    git -C "$tmp/$1" push -q origin main
}
advance_repo ciyan 'new Ciyan'
advance_repo worldgen 'new WorldGen'
touch "$tmp/trigger-race"
(cd "$tmp/ci" && bash scripts/reconcile-release.sh) > "$tmp/race.log" 2>&1 || { cat "$tmp/race.log"; exit 1; }
grep -q 'Main advanced during validation' "$tmp/race.log"
main=$(git --git-dir="$tmp/launcher.git" rev-parse main)
prod=$(git --git-dir="$tmp/launcher.git" rev-parse production)
[[ "$main" == "$prod" ]]
[[ $(git --git-dir="$tmp/launcher.git" show "$prod:human.txt") == 'keep this human commit' ]]
[[ $(git --git-dir="$tmp/launcher.git" rev-parse "$prod:apps/ciyan") == $(git -C "$tmp/ciyan" rev-parse HEAD) ]]
[[ $(git --git-dir="$tmp/launcher.git" rev-parse "$prod:apps/worldgen") == $(git -C "$tmp/worldgen" rev-parse HEAD) ]]
[[ $(wc -l < "$tmp/validated") -eq 2 ]]
[[ $(tail -1 "$tmp/validated") == "$prod" ]]
echo 'PASS: concurrent human commit preserved, latest multi-app pins validated and promoted'
(cd "$tmp/ci" && bash scripts/reconcile-release.sh) > "$tmp/noop.log" 2>&1 || { cat "$tmp/noop.log"; exit 1; }
[[ $(wc -l < "$tmp/validated") -eq 2 ]]
grep -q 'Already current' "$tmp/noop.log"
echo 'PASS: already-current scheduled reconciliation skips the full build'
# Race in the narrower window after the final fetch, when the actual push is
# about to happen. The pre-push hook simulates a different writer winning.
advance_repo ciyan 'newer Ciyan'
cat > "$tmp/ci/.git/hooks/pre-push" <<'HOOK'
#!/bin/sh
set -eu
rm "$TEST_ROOT/ci/.git/hooks/pre-push"
git -C "$TEST_ROOT/human" pull --ff-only -q
printf 'keep the second human commit\n' > "$TEST_ROOT/human/human-2.txt"
git -C "$TEST_ROOT/human" add human-2.txt
git -C "$TEST_ROOT/human" commit -qm 'human push at promotion boundary'
git -C "$TEST_ROOT/human" push -q origin main
HOOK
chmod +x "$tmp/ci/.git/hooks/pre-push"
(cd "$tmp/ci" && bash scripts/reconcile-release.sh) > "$tmp/push-race.log" 2>&1 || { cat "$tmp/push-race.log"; exit 1; }
grep -q 'Concurrent push rejected the candidate' "$tmp/push-race.log"
main=$(git --git-dir="$tmp/launcher.git" rev-parse main)
prod=$(git --git-dir="$tmp/launcher.git" rev-parse production)
[[ "$main" == "$prod" ]]
[[ $(git --git-dir="$tmp/launcher.git" show "$prod:human-2.txt") == 'keep the second human commit' ]]
[[ $(git --git-dir="$tmp/launcher.git" rev-parse "$prod:apps/ciyan") == $(git -C "$tmp/ciyan" rev-parse HEAD) ]]
[[ $(wc -l < "$tmp/validated") -eq 4 ]]
[[ $(tail -1 "$tmp/validated") == "$prod" ]]
echo 'PASS: atomic push rejection retries without losing a concurrent human commit'
advance_repo ascendant 'broken app candidate'
touch "$tmp/force-failure"
if (cd "$tmp/ci" && bash scripts/reconcile-release.sh) > "$tmp/fail.log" 2>&1; then cat "$tmp/fail.log"; exit 1; fi
[[ $(git --git-dir="$tmp/launcher.git" rev-parse main) == "$main" ]]
[[ $(git --git-dir="$tmp/launcher.git" rev-parse production) == "$prod" ]]
grep -q 'Release validation failed' "$tmp/fail.log"
echo 'PASS: failed app validation leaves both remote branches unchanged'
