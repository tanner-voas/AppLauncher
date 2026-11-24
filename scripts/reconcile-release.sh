#!/usr/bin/env bash
# Run only in a disposable CI checkout: moves detached HEAD between candidates.
# No force pushes. A concurrent human push must be preserved and retested.
set -euo pipefail
cd "$(dirname "$0")/.."
max_attempts=${RELEASE_MAX_ATTEMPTS:-4}
case "$max_attempts" in ''|*[!0-9]*) exit 2;; esac
((max_attempts >= 1 && max_attempts <= 10)) || exit 2

fetch_main() {
    git fetch --no-tags origin refs/heads/main >&2
    git rev-parse FETCH_HEAD
}
remote_production() {
    local refs
    refs=$(git ls-remote origin refs/heads/production) || return 1
    printf '%s\n' "$refs" | awk 'NR==1 {print $1}'
}
retry() {
    echo "::warning title=Release candidate superseded::$1 (attempt $attempt/$max_attempts)" >&2
    # No artificial delay for local race regression tests; the next fetch is the retry.
}
advance() {
    local path=$1 sha
    git -C "$path" fetch --no-tags origin refs/heads/main
    sha=$(git -C "$path" rev-parse FETCH_HEAD)
    git -C "$path" checkout --detach "$sha"
    git add -- "$path"
}

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
for ((attempt=1; attempt<=max_attempts; attempt++)); do
    base=$(fetch_main)
    echo "=== Reconcile release attempt $attempt/$max_attempts from $base ==="
    git checkout --detach "$base"
    git submodule sync --recursive
    git submodule update --init --recursive
    for path in apps/ciyan apps/worldgen apps/ascendant; do
        advance "$path"
    done
    # The shared library must match Ciyan's committed gitlink, not an independently
    # selected version. A newer shared release still awaiting Ciyan blocks promotion.
    shared=$(git -C apps/ciyan rev-parse HEAD:shared/google-drive)
    git -C shared/google-drive fetch --no-tags origin refs/heads/main
    if ! git -C shared/google-drive cat-file -e "$shared^{commit}"; then
        git -C shared/google-drive fetch --no-tags origin "$shared"
    fi
    git -C shared/google-drive checkout --detach "$shared"
    git add -- shared/google-drive
    git submodule update --init --recursive
    if ! git diff --cached --quiet; then
        git commit -m 'build: reconcile all hosted application and shared profile pins'
    fi
    candidate=$(git rev-parse HEAD)
    if ! sh scripts/check-upstream-pins.sh; then
        retry 'Upstream dependencies are not yet aligned or changed during reconciliation'
        continue
    fi
    production=$(remote_production)
    if [[ "$candidate" == "$base" && "$candidate" == "$production" ]]; then
        echo "Already current: $candidate (no rebuild or promotion needed)"
        if [[ -n ${GITHUB_OUTPUT:-} ]]; then echo 'validated=false' >> "$GITHUB_OUTPUT"; fi
        exit 0
    fi
    # Test the committed candidate, so its release manifest identifies the exact
    # commit that will be deployed, rather than an earlier HEAD plus staged gitlinks.
    if ! sh scripts/verify-release.sh; then
        if [[ $(fetch_main) != "$base" ]]; then
            retry 'Main changed while a candidate was being tested'
            continue
        fi
        echo '::error title=Release validation failed::No production changes were made.' >&2
        exit 1
    fi
    if [[ $(fetch_main) != "$base" ]]; then
        retry 'Main advanced during validation; rebuilding on the new commit'
        continue
    fi
    if ! sh scripts/check-upstream-pins.sh; then
        retry 'An application advanced during validation; rebuilding with new pins'
        continue
    fi
    # Advance both branches together (or neither). A normal fast-forward-only
    # push rejects any competing main write. Never rebase an already-tested
    # candidate or force-push production, since that could bypass validation.
    if ! git push --atomic origin "$candidate:refs/heads/main" "$candidate:refs/heads/production"; then
        if [[ $(fetch_main) != "$base" ]]; then
            retry 'Concurrent push rejected the candidate; preserving upstream work'
            continue
        fi
        echo '::error title=Release promotion failed::Atomic fast-forward push was rejected.' >&2
        exit 1
    fi
    echo "Promoted validated release $candidate to production"
    if [[ -n ${GITHUB_OUTPUT:-} ]]; then
        printf 'validated=true\ncommit=%s\n' "$candidate" >> "$GITHUB_OUTPUT"
    fi
    exit 0
done
echo '::error title=Release reconciliation exhausted::No unvalidated candidate was promoted. Run the workflow again; scheduled reconciliation will also retry.' >&2
exit 1
