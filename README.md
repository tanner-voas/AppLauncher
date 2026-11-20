# AppLauncher v0.1.2

The single installed PWA that hosts Ciyan and future independent applications.
The UI remains v0.8.16's minimal **My Workspace**: one heading, refresh,
and app tiles. Opening Ciyan preserves its existing Study start page.

## Repository structure

- `apps/ciyan` — **Git submodule**, tracking `tanner-voas/Ciyan` (pinned commit).
- `apps.json` — registered app metadata, source/build paths, and hosted URLs.
- `launcher.js`, `workspace.css`, `index.html` — PWA launcher and shared host API.
- `pwa-update.js`, `sw.template.js`, `viewport-lock.js` — shared PWA lifecycle.
- `build.py` — combines app bundles with the host, generates the registry and
  content-fingerprinted service worker in `dist/`.
- `.github/workflows/update-ciyan.yml` — updates the pinned submodule in response
  to Ciyan's GitHub dispatch notification or a manual workflow run.

AppLauncher owns **one** manifest, service worker, and update control. Ciyan
owns its study data, runtime, reader, dictionaries and saved progress.

## One-time setup (order matters)

1. Create an empty public GitHub repo named `tanner-voas/AppLauncher`. The zip
   contains an initialized local git repository with an actual Ciyan gitlink
   pinned to `6b55026caf1bfb150d863c07bb4761f9e6e644eb` (v0.8.16).
   Unpack, then push using:

   ```sh
   git remote add origin https://github.com/tanner-voas/AppLauncher.git
   git push -u origin main
   ```

2. Apply the provided **v0.8.17 git-am patch** in the **existing Ciyan** repo.
3. Create a fine-grained GitHub PAT granting **Contents: Read and write** on
   **AppLauncher only**, and add it as Ciyan repository secret
   `APP_LAUNCHER_DISPATCH_TOKEN` (Ciyan → Settings → Secrets and variables → Actions).
4. Push Ciyan `main`. The Ciyan Action dispatches `ciyan-updated`; AppLauncher's
   Action fetches Ciyan `main`, commits its pinned submodule SHA and pushes
   AppLauncher `main`. Cloudflare sees the new AppLauncher commit and builds.
   If the Ciyan push happened before you set the secret, run **Update Ciyan
   submodule** manually from AppLauncher's GitHub Actions page.
5. Connect **AppLauncher**, *not Ciyan*, to your Cloudflare Pages or Workers
   Git integration. Enable automatic deployments on `main`.

### Cloudflare Pages

- Repository: `tanner-voas/AppLauncher`
- Production branch: `main`
- Root: repository root
- Build command: `python3 build.py`
- Output directory: `dist`

### Cloudflare Workers Builds

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
3. Add an AppLauncher workflow handling that submodule's dispatch event, and
   a dispatch workflow in the app repository. Add the same kind of PAT secret.
4. Push AppLauncher to deploy the new tile.

The host never imports an app until selected. Ciyan uses the `__APP_LAUNCHER__`
contract (`runUpdateButton`, `returnToLauncher`) after completing its own save
verification. Future apps can follow the same contract.

## Submodule / deployment guarantees

Each AppLauncher commit locks exact app git SHAs, even with automatic updates.
No branch is silently fetched at Cloudflare build time; `build.py` fails rather
than publishing a partial deployment. A new app commit triggers a pinned update
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
