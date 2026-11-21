# AppLauncher v0.1.3 — WorldGen + isolated app failures

## New application

WorldGen v0.1.0 is registered in `apps.json`, pinned as the independent `apps/worldgen` Git submodule, and packaged under `dist/apps/worldgen/`. It exports `app.js` and `styles.css` and does not replace AppLauncher's root PWA identity. Ciyan retains the v0.9.0 commit (`fd4747a`) already pinned in the supplied v0.1.2 AppLauncher repository, along with its root asset and storage locations. Both app submodules are initialized and populated in the downloadable repository.

## Failure isolation

`build.py` processes each app individually. Before its files are copied into the launcher distribution, the app must successfully initialize its source, run `package.py`, produce the expected build directory, and supply valid module and stylesheet entrypoints. Files are staged in a temporary location and checked for collisions. On an individual failure, the app's registry entry includes `status: "failed"` and a sanitized `reason`; the rest of the launcher build completes. The workspace draws a gray, disabled tile labeled **BUILD FAILED**; selecting a failed tile is prevented, even for a direct `?app=...` URL. Failed app assets are not added to the offline precache. A future successful build restores the tile automatically.

Host configuration and shell failures remain fatal. The failure isolation starts at `build.py`, so an external hosting provider that fails **before** invoking the build script (for example while fetching the launcher repo itself) is outside this guarantee.

The two per-app update GitHub Actions workflows now initialize only their own submodule instead of making a single unrelated submodule failure break the update workflow.

## Local validation

```sh
git submodule status
python3 build.py
npm test
```

Tests cover the two-app ready build, version labels, root-asset stability, PWA/service-worker compatibility, launcher navigation and a three-app fixture with one successful app, one deliberately failing package script, and one missing submodule.

## Deployment

Push the new **WorldGen** Git repository to its `main` branch **before** pushing this AppLauncher update. The launcher Git link must resolve to the WorldGen commit on GitHub when Cloudflare checks out the repository. Configure WorldGen's `APP_LAUNCHER_DISPATCH_TOKEN` Actions secret to allow updates to AppLauncher, then push this launcher release to `main`. The existing AppLauncher Cloudflare settings should not need to change.
