# AppLauncher v0.1.17

- Workspace title and grouped profile, information and refresh buttons; no overflow on ordinary phone widths.
- Preserve the existing strict production branch promotion and Cloudflare Git deployment. No new credentials or configuration.
- Automatically tag source history and dependency-only commits. Versions remain simple in the UI; the dependency dialog includes exact commits.
- Pin the updated applications and shared libraries in the initial workspace migration, so the coordinator need not create a follow-up pin-only commit.
