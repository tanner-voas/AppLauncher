# AppLauncher production release policy (v0.1.10)

**Production is a different Git branch from development.** AppLauncher `main` accepts candidate changes. The `Validate and promote production` GitHub Action runs all app tests, produces the complete strict build, verifies source commit provenance and module fingerprints, and fast-forwards `production` only after every check passes. Cloudflare must deploy **`production`**, not `main`, for this guarantee to apply.

## One-time Cloudflare setup (required)

In Cloudflare Workers & Pages → `applauncher` → Settings → Builds, set the production/deployment branch to `production`. Keep the project and Worker name `applauncher`, the same origin and the `PROFILES` service binding. Configure:

- Build command: `git submodule update --init --recursive && python3 build.py`
- Deploy command: `npx wrangler deploy`

Run GitHub Actions → **Validate and promote production** → Run workflow on `main` to create the initial `production` branch, then select that branch in Cloudflare. **Until Cloudflare builds from `production`, its direct `main` integration bypasses the test gate**, although strict packaging still rejects broken app bundles.

## Updating apps

App repos dispatch update events to AppLauncher. The corresponding Action pins the new commit, tests all required apps including the shared profile library, executes the strict build, and tests the combined launcher. If a check fails, it does not push new pointers to `main`. If checks pass, it pushes `main` and dispatches the production validator explicitly (GitHub's default Actions token does not trigger a push workflow). The validator independently tests the committed revision, uploads a 30-day distribution artifact and fast-forwards `production`.

A direct human push to AppLauncher `main` also runs the production validator. Only the validated `production` branch feeds the live PWA. Each `dist/release-manifest.json` identifies source commit SHAs, app versions, module digests and cache name. Neither the manifest nor the cache is a substitute for the tests.

## Safe rollback

If production behaves incorrectly despite passing tests, in Cloudflare select `applauncher` → Deployments → the most recent known-good Worker version → Rollback. This is immediate and does not require force-pushing Git branches. Record that deployment's AppLauncher commit/release manifest. Revert or repair the bad `main` commit, run the validator and ensure the new known-good candidate promotes before restoring normal Cloudflare deployment. Cloudflare rollback is operational; it does **not** automatically reset the Git `production` branch. Avoid force-pushing `production` and never clear browser storage during rollback.

## Testing locally

`python3 build.py` requires all three apps, pinned submodules and matching Ciyan/shared GoogleDrive revisions. `sh scripts/verify-release.sh` runs the full gate. For an intentionally incomplete local checkout only, run `python3 build.py --allow-partial` to preview disabled tiles; such a bundle is rejected by the manifest verifier and is not a production artifact.

## Stale-pinned app diagnosis (v0.1.10)

A successful standalone app deployment does not imply the launcher uses its latest code.
AppLauncher bundles only exact pinned submodule commits. GitHub dispatch notifications
are fast-path updates, and the Ciyan update workflow also runs every 15 minutes
if a notification was missed (GitHub schedules are best-effort). Run
**Update Ciyan and shared Google Drive pointers** manually for immediate recovery.
The production validator runs `scripts/check-upstream-pins.sh` before building and
again immediately before promoting, and fails visibly if ANY required upstream
main commit is newer than its launcher pin. It never quietly promotes a stale
release or replaces a previously working production branch.

Inspect `dist/release-manifest.json` after a build for exact app commits and
versions; this is more reliable than assuming a build is current from its
`success` status. To diagnose a missing update, inspect both the app's notifier
Action (Ciyan: **Notify AppLauncher of Ciyan update**) and AppLauncher's
**Update Ciyan and shared Google Drive pointers** Action. A missing/expired
`APP_LAUNCHER_DISPATCH_TOKEN` can break the fast path.
