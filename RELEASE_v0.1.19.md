# AppLauncher v0.1.19

Host Git Manager as the fourth app, pinned to PWA-GitManager v0.1.0. Same-origin `/\_git/v1/` forwards only to the `pwa-git-api` binding; the runner secret/API are never available through the launcher. Exclude Git API paths from service worker caching. Extend the existing release coordinator, upstream checks and test gate to discover all hosted Gitlinks, including Git Manager, without changing the main/production atomic promotion or tag policy. Deploy the new Worker and authorize its Google profile origin first; see PWA-GitManager SETUP.md.
