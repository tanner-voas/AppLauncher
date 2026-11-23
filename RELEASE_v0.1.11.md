# AppLauncher v0.1.11 — Recoverable profile identity

Building on v0.1.10's stale-Ciyan release repair, AppLauncher now detects
corrupt shared profile registry metadata before installing the profile manager.
Instead of silently replacing a damaged registry or hiding the profile menu,
it presents the shared fail-closed recovery interface. The user can download
the damaged raw registry and explicitly approve recovery of recognizable
IndexedDB-backed profiles. Existing profile databases are not deleted.

The v0.1.10 production safeguards remain in effect: strict all-app builds,
upstream pin freshness checks, scheduled Ciyan reconciliation, and validated
`production` branch promotion.

Depends on PWA-GoogleDrive v0.1.6 or later for `registry-recovery.js`.
