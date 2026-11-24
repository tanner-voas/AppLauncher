#!/bin/sh
# Guard production against silently publishing old pinned apps after a missed
# GitHub repository_dispatch. Works on exact Git SHAs, not version strings.
set -eu
cd "$(dirname "$0")/.."
stale=0
for path in $(git ls-files --stage apps | awk '$1=="160000"{print $4}') shared/google-drive; do
    pinned="$(git rev-parse "HEAD:$path")" || exit 1
    # Existing checked-out submodule knows the canonical upstream remote.
    # A failed remote lookup must fail closed, not silently bless a stale pin.
    if ! upstream="$(git -C "$path" ls-remote origin refs/heads/main | awk 'NR==1 {print $1}')" || [ -z "$upstream" ]; then
        echo "::error title=Cannot verify upstream::$path: main cannot be checked; production promotion blocked" >&2
        exit 1
    fi
    if [ "$pinned" != "$upstream" ]; then
        echo "::error title=Stale AppLauncher dependency::$path pinned $pinned but upstream is $upstream. Run the matching AppLauncher update Action." >&2
        echo "STALE $path: pinned=$pinned current-main=$upstream" >&2
        stale=1
    else
        echo "CURRENT $path $pinned"
    fi
done
[ "$stale" -eq 0 ] || exit 1
printf 'PASS: all hosted app and shared profile pins match upstream main\n'
