# AppLauncher production release policy (v0.1.12)

**Production is a different Git branch from development.** AppLauncher `main` accepts candidate changes. The `Validate and promote production` GitHub Action runs all app tests, produces the complete strict build, verifies source commit provenance and module fingerprints, and fast-forwards `production` only after every check passes. Cloudflare must deploy **`production`**, not `main`, for this guarantee to apply.

## One-time Cloudflare setup (required)

In Cloudflare Workers & Pages → `applauncher` → Settings → Builds, set the production/deployment branch to `production`. Keep the project and Worker name `applauncher`, the same origin and the `PROFILES` service binding. Configure:

- Build command: `git submodule update --init --recursive && python3 build.py`
- Deploy command: `npx wrangler deploy`

Run GitHub Actions → **Validate and promote production** → Run workflow on `main` to create the initial `production` branch, then select that branch in Cloudflare. **Until Cloudflare builds from `production`, its direct `main` integration bypasses the test gate**, although strict packaging still rejects broken app bundles.

## Updating apps

App notifications, direct pushes to `main`, manual runs and scheduled checks all trigger **Validate and promote production**. The workflow reads the latest launcher `main`, reconciles every hosted app to its upstream `main`, aligns the shared library to Ciyan's gitlink, commits the candidate locally, checks freshness, and runs every app test and the strict combined build. It rechecks main and upstream pins after validation. If another push superseded the candidate, it starts over and validates the new candidate; it never force-pushes or promotes a rebased but untested commit. A normal atomic Git push advances `main` and `production` together (or neither). If an app is broken, the workflow fails and the previous production remains unchanged. The successfully tested bundle is retained for 30 days. A scheduled run with already-current production skips rebuilding.

All dispatch types are preserved; no PAT changes or manual submodule pointer updates are needed. The one workflow replaces the three separate dependency updater workflows. GitHub may coalesce pending runs, but each run reconciles all apps, so it does not depend on a particular event surviving.

## Safe rollback

If production behaves incorrectly despite passing tests, in Cloudflare select `applauncher` → Deployments → the most recent known-good Worker version → Rollback. This is immediate and does not require force-pushing Git branches. Record that deployment's AppLauncher commit/release manifest. Revert or repair the bad `main` commit, run the validator and ensure the new known-good candidate promotes before restoring normal Cloudflare deployment. Cloudflare rollback is operational; it does **not** automatically reset the Git `production` branch. Avoid force-pushing `production` and never clear browser storage during rollback.

## Testing locally

`python3 build.py` requires all three apps, pinned submodules and matching Ciyan/shared GoogleDrive revisions. `sh scripts/verify-release.sh` runs the full gate. For an intentionally incomplete local checkout only, run `python3 build.py --allow-partial` to preview disabled tiles; such a bundle is rejected by the manifest verifier and is not a production artifact.

## Stale-pinned app diagnosis

Check **Validate and promote production** in GitHub Actions. A failed build, an unavailable upstream, or a persistent mismatched shared-library pin is an explicit failure. A concurrent main push causes bounded retries against a fresh checkout; a scheduled run (every 15 minutes, best-effort) or a manual run can retry if those attempts are exhausted. Ciyan must first consume the current shared-library release before a combined release is eligible. The exact app commits and versions are visible in `dist/release-manifest.json`. If notification delivery fails, inspect the app notifier and its `APP_LAUNCHER_DISPATCH_TOKEN`; the scheduled reconciliation is an independent fallback.
