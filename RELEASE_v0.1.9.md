# AppLauncher v0.1.9 — validated releases

- Strict by default: every registered app must build and have its entrypoints and pinned commit verified. `--allow-partial` remains for local previews only.
- CI validates app/shared suites and the assembled launcher before promoting the exact commit to `production`; publishes the bundle as a CI artifact.
- `dist/release-manifest.json` records pinned app commits, versions, entrypoint SHA-256 digests and shell-cache identity.
- Escapes fatal launcher messages via `textContent`; documentation separates active release instructions from historical steps.
- Cloudflare must be configured to deploy `production` for the CI quality gate to prevent bad deployments.
