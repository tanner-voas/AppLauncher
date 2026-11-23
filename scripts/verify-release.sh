#!/bin/sh
# Full integration gate for the pinned AppLauncher release candidate.
set -eu
cd "$(dirname "$0")/.."
# The index records the exact submodule SHAs (including staged updates).
git submodule update --init --recursive
for repo in shared/google-drive apps/ciyan apps/worldgen apps/ascendant; do
    printf '\n=== Testing %s ===\n' "$repo"
    (cd "$repo" && npm test)
done
python3 build.py
npm test
python3 scripts/check-release.py dist/release-manifest.json
