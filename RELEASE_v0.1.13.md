# AppLauncher v0.1.13 — Content security policy

The static asset headers now enforce a same-origin script policy, prohibit framing, embedded objects and base URL changes, allow application workers and necessary blob fonts/audio, and restrict network connections to the launcher origin, Azure speech and jsDelivr fonts. Inline styles remain allowed for current UI rendering. The v0.1.12 race-safe release coordinator and strict build are unchanged. Shared profile account controls arrive through the pinned PWA-GoogleDrive v0.1.7 dependency.

This policy applies to the hosted shell and app modules; separately deployed apps use their own headers. It is defense in depth, not a substitute for escaping imported text.
