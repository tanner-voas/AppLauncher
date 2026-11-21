# AppLauncher v0.1.4 — WorldGen launcher icon

The WorldGen launcher tile now uses the existing WorldGen PWA artwork instead of
an abstract Unicode diamond. Its icon is packaged from the pinned WorldGen
submodule's `icons/icon-192.png` even though the WorldGen launcher-module
bundle does not itself contain standalone PWA icons.

The generated app registry records the image URL, and the service worker
precaches the icon alongside other launcher assets. The glyph remains as a
fallback if the image fails to load. Cíyán retains its existing tile artwork.

Missing tile icon files cause only that app to fail packaging; other app tiles,
including Cíyán, remain operational. No app submodule pointers, runtime code,
world data, or save formats change.

Apply to AppLauncher v0.1.3 with `git am`, then run `python3 build.py` and `npm test`.
