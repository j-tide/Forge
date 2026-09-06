# Forge brand assets

Created on 2026-09-28 using the built-in imagegen tool. This is an original Forge identity; no upstream artwork was used. The mark combines two angled strokes into an F with a diagonal negative-space join. The app tile uses the same visual identity with a silver-white / icy-blue frosted surface.

- `forge-mark.png`: canonical transparent symbol. React and Vue use its alpha silhouette with theme foreground colors, including dark mode.
- `forge-app-icon.png`: canonical application tile used for favicon, Dock / Finder, Windows ICO, Linux and web app icons.
- `assets.json`: canonical source hashes, dimensions and derived outputs.
- `prompts.json`: imagegen prompt set and selected outputs.
- `exports/`: web app sizes and platform template tray formats.

Regenerate only native sizes and file formats with `python3 apps/desktop/resources/generate-preview-icon.py`; verify with the same command plus `--check`. This converter uses Pillow and macOS iconutil, does not redraw the logo, and does not require a global package installation. Keep both canonical PNG files together when updating the identity. macOS tray templates are monochrome and preserve the mark's alpha silhouette.

The original Forge repository receives copies of these same assets for its existing UI and future package builds. Previously published application bundles and historical screenshots are retained as historical evidence. Third-party provider and feature icons, source attribution and AGPL notices are unchanged.
