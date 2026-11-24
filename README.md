# AppLauncher v0.1.12

**v0.1.12:** One release workflow reconciles all app pins, retries concurrent Git changes, and atomically promotes a validated candidate.

**v0.1.11:** Recoverable profile registry.

**v0.1.10:** Stale-dependency release guard and scheduled Ciyan reconciliation. Fixes launcher packaging an older Ciyan after a missed update notification. Strict builds remove any old `dist/` before validation.

**v0.1.9:** Production releases require every registered app to build and pass integration checks. Validated commits are promoted to the `production` branch; the default build is strict (`python3 build.py`) and `--allow-partial` is for local preview only. Cloudflare must build from `production`. See `docs/RELEASING.md`.

**v0.1.6:** Shared safe-area-aware single-row header, matching update symbol with an animated in-place refresh, and a persistent header while scrolling. See `RELEASE_v0.1.6.md`.

The single installed PWA that hosts Ciyan, WorldGen, and Ascendant, with support for additional independent applications.
The UI remains v0.8.16's minimal **My Workspace**: one heading, refresh,
and app tiles. Opening Ciyan preserves its existing Study start page.

**v0.1.4:** The WorldGen tile uses WorldGen's own `icons/icon-192.png`
artwork instead of a placeholder diamond character. AppLauncher packages this
source icon automatically, includes it in its offline cache, and falls back to
the text glyph if the image cannot load. The Cíyán tile is unchanged.


## Repository structure

- `apps/ciyan` — **Git submodule** pinned to Ciyan v0.9.0 (`fd4747a`), preserved from the supplied v0.1.2 repository.
- `apps/worldgen` — **Git submodule** pinned to WorldGen v0.1.0 (`54aa1ef`).
- `apps.json` — registered app metadata, source/build paths, and hosted URLs.
- `launcher.js`, `workspace.css`, `index.html` — PWA launcher and shared host API.
- `pwa-update.js`, `sw.template.js`, `viewport-lock.js` — shared PWA lifecycle.
- `build.py` — combines app bundles with the host, generates the registry and
  content-fingerprinted service worker in `dist/`.
- `.github/workflows/validate-production.yml` — reconciles all pinned applications after any app notification, a main push, a scheduled check, or a manual run.

AppLauncher owns **one** manifest, service worker, and update control. Ciyan
owns its study data, runtime, reader, dictionaries and saved progress.

## Original v0.1.3 repository setup (historical reference; not current deployment instructions)

This full repository is based on the supplied AppLauncher v0.1.2 history (its
`main` tip was `ddbe248`), not the older v0.1.2 snapshot. Both submodules are
already initialized and include their source and local Git histories. You do
**not** need to re-clone them or run `git submodule update --remote`.

1. Create an **empty** GitHub repository `tanner-voas/WorldGen` (without README,
   license, or `.gitignore`). Push the separate WorldGen v0.1.0 repository to it
   first, so AppLauncher's `54aa1ef` submodule commit can resolve remotely.
2. Set a fine-grained GitHub PAT allowing **Contents: Read and write** on
   `tanner-voas/AppLauncher` as the WorldGen repository Actions secret
   `APP_LAUNCHER_DISPATCH_TOKEN`.
3. In this AppLauncher folder, verify `git submodule status`, `python3 build.py`,
   and `npm test`, then run `git push origin main`. The `origin` URL points to
   `https://github.com/tanner-voas/AppLauncher.git` already.
4. Confirm the existing Cloudflare deployment is following the launcher `main`
   branch. Do not change the PWA origin unless you intend to migrate Ciyan's
   browser-local storage.

The existing Ciyan auto-update workflow and its PAT remain unchanged; Ciyan is
already pinned to the v0.9.0 commit supplied with the launcher. Future Ciyan
and WorldGen app pushes can advance their pins independently through the
repository-dispatch workflows.

### Cloudflare Pages (historical)

- Repository: `tanner-voas/AppLauncher`
- Production branch: `main`
- Root: repository root
- Build command: `python3 build.py`
- Output directory: `dist`

### Cloudflare Workers Builds (historical; use docs/RELEASING.md)

- Repository: `tanner-voas/AppLauncher`; branch `main`.
- Build command: `python3 build.py`
- Deploy command: `npx --yes wrangler@4 deploy`
- `wrangler.jsonc` **name** is set to `applauncher` for a separate Worker,
  matching the Cloudflare project name. This deploys independently from the
  existing `ciyan` Worker, so do not change it back unless intentionally
  migrating production hosting later. The new `applauncher.tannervoas.workers.dev`
  origin has its **own browser storage**: Ciyan progress stored on the old
  `ciyan.tannervoas.workers.dev` origin does not automatically transfer.
  Use Ciyan's own backup/import tools if migrating saved data later.

To build locally:

```sh
git submodule update --init --recursive
python3 build.py
python3 -m http.server 8765 --directory dist
```

## Adding another application

1. Make its own Git repository, with a `package.py` that emits an app-only
   distribution directory; namespace its IndexedDB/Cache Storage names.
2. Register its Git submodule under `apps/<id>` and add one entry to `apps.json`.
   For **new** apps, set `destination` to `apps/<id>` and `module`/`stylesheet`
   to URLs under that directory. **Only Ciyan** uses root URLs for backwards
   compatibility with existing installations.
3. Extend the common AppLauncher reconciliation workflow and script for the new submodule, and
   a dispatch workflow in the app repository. Add the same kind of PAT secret.
4. Push AppLauncher to deploy the new tile.

The host never imports an app until selected. Ciyan uses the `__APP_LAUNCHER__`
contract (`runUpdateButton`, `returnToLauncher`) after completing its own save
verification. Future apps can follow the same contract.

## Submodule / deployment guarantees

Each AppLauncher commit locks exact app git SHAs, even with automatic updates.
No branch is silently fetched during packaging at Cloudflare build time.
As of v0.1.3, local preview builds support **isolating individual app packaging failures** via `python3 build.py --allow-partial`: the launcher
still produces a valid bundle, its successful apps stay available, and the
failed app remains listed as a gray, disabled `BUILD FAILED` tile. Only its
own packaged assets are excluded from precaching. Failures in the launcher
itself (invalid registry, corrupted host assets, etc.) remain fatal. The
external Git host must still fetch the AppLauncher repository itself. App
submodule checkout is deferred to `build.py`, which catches failures per app.
Production workflows initialize all submodules, run all app tests and the combined launcher tests, then promote only verified commits.

**WorldGen v0.1.0** is integrated as `apps/worldgen` using its own independent
repository. It packages a standalone PWA separately. Its interactive first
four layers cover Voronoi geometry, tectonic plates, terrain elevation and
sea level. Future layers are listed but deliberately disabled.
 A new app commit triggers a pinned update
commit in AppLauncher, making deployment history auditable and revertible.

The AppLauncher combined output **preserves Ciyan root asset URLs and
`ciyan-mandarin`/font databases**, so users do not need to remove the installed
PWA. The existing Ciyan manifest identity (`./`) and icon are retained.
The generated service worker fingerprints actual app files, so Ciyan-only
updates create a new worker cache. Shell cache cleanup intentionally does
**not** delete reader-content caches or IndexedDB.

GitHub Actions `GITHUB_TOKEN` cannot dispatch another repository; the
fine-grained PAT is required for the Ciyan → AppLauncher notification.
If Cloudflare's Git integration doesn't build from the automated submodule
commit, recheck production branch/build filters and GitHub App access.

### Ascendant (v0.1.5 launcher)

Ascendant is a classless 5v5 tactical battleground prototype with its own repo and standalone PWA. It is loaded only when its tile is selected. It stores roster setup under `ascendant.setup.v1`. Chronicle remains a separate future project and is not registered in the workspace.

## Shared PWA infrastructure

The launcher pins `PWA-Core` in `shared/pwa-core`. Its build copies the shared updater and offline client to the existing published paths, and generates the worker with the same cache namespaces. PWA-Core updates are explicit reviewed pin changes, not automatic upstream-main tracking. The recursive version dialog reports the actual pin. Run `git submodule update --init --recursive` before local builds; strict release validation tests the core as well as all applications.
