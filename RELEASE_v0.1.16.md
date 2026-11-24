# AppLauncher v0.1.16 — PWA-Core pilot

First consumer of PWA-Core v0.1.0, pinned at `shared/pwa-core`. The shared updater, offline messaging and worker generator replace duplicate source implementations. Published runtime asset paths, cache namespaces, profile API bypass, offline group classification, host API and app storage stay unchanged. The core's independent version appears in the dependency tree. Strict pin checks and the full release integration gate include the shared core. The production coordinator does not track Core main automatically; its reviewed pin is intentional. PWA-GoogleDrive and the other apps are not changed by this release.

Publish the PWA-Core repository and v0.1.0 tag before applying this patch. The patch requires AppLauncher v0.1.15. Test hosted update, offline app downloads, reader packs and profile operations on iPhone before migrating standalone apps.
