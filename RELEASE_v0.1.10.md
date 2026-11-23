# AppLauncher v0.1.10 — stale Ciyan production pin repair

- Pin Ciyan v0.9.11 (`b90ce7824044ac272555fb5ade5e21cefa786af8`).
- Keep the existing shared PWA-GoogleDrive v0.1.5 pin (`1203fa12ab5a`).
- Add scheduled Ciyan reconciliation as a fallback for missed notifications.
- Refuse production promotion when any pinned app or shared library lags upstream `main`; recheck after the test suite to cover races.
- Remove a previous `dist/` before strict-build preflights so a failed build does not leave a stale bundle.
- Does not require source changes to Ciyan, WorldGen, Ascendant, or shared profile code.

The prior production branch remained on Ciyan `602b54a` (v0.9.10) even though
Ciyan `main` reached `b90ce78` (v0.9.11). Both AppLauncher `main` and
`production` were at `d886a47` and passed their tests because the pinned code
was internally valid but not the latest upstream.
