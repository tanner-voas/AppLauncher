# AppLauncher v0.1.8 — Profile-manager ownership

- Dispose the launcher's profile click handlers before loading a hosted app.
- Avoid installing the launcher profile UI after a late lazy import when an
  app is already active.
- Reinitialize the home manager on a failed app launch without duplicating
  the home click listener.
- The shared PWA-GoogleDrive v0.1.4 manager also guards against two owners
  registering on the same document.
