# AppLauncher v0.1.5

- Register Ascendant v0.1.0 as an independent, lazy-loaded app under `apps/ascendant`, including its original tile artwork and offline shell assets.
- Keep the workspace at three evenly spaced columns on mobile and desktop.
- Preserve Cíyán and WorldGen pins and existing host API.
- Chronicle is intentionally not registered; it is a README-only future project.

Publish the supplied Ascendant repository to `https://github.com/tanner-voas/Ascendant.git` before deploying this launcher commit. After applying the patch, run `git submodule sync --recursive` and `git submodule update --init --recursive`. The gitlink pins the exact initial Ascendant commit. Build/test with `python3 build.py && npm test`.
