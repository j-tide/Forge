# Upstream provenance and modifications

Forge Glass Preview is a derivative of the Aperant desktop application. Renaming this preview does not change its origin or license.

| Item | Value |
| --- | --- |
| Upstream project | [Aperant](https://github.com/AndyMik90/Aperant) (formerly Auto Claude) |
| Upstream Git URL | `https://github.com/AndyMik90/Aperant.git` |
| Imported tag | `v2.8.0-beta.6` |
| Imported commit | `cba7a0270ec794a14ac71615bc6c48085807ede6` |
| Modification dates | 2026-09-27 and 2026-09-28 |
| License | GNU Affero General Public License v3.0; see [LICENSE](LICENSE) |

The upstream tag resolves to the imported commit in this repository's Git history. The original source and history remain available; the preview does not claim to be an original implementation of Aperant's code. Existing copyright and license notices remain in place, and `LICENSE` is preserved unchanged.

Changes initiated on 2026-09-27 for this derivative:

- Introduced the **Forge Glass Preview** application identity, a separate user-data directory, and profile-specific PTY sockets, so the preview can coexist with installed Forge and Aperant apps without migrating their data.
- Replaced the upstream desktop visual treatment with a glass-style preview while retaining the application's existing workflows. Preview icon assets were newly rendered from the Forge project's faceted F geometry and a new silver-blue glass surface; they do not reuse Aperant logo artwork.
- Disabled upstream application and source update paths, removed the upstream release publishing target from packaging, and guarded inherited release workflows against running in this preview. Windows installation builds native modules locally instead of downloading upstream release assets.
- Made error reporting opt-in through derivative-specific configuration instead of inheriting the upstream DSN or default telemetry preference.
- Isolated project task data, worktree names, global memories and Claude profile configuration from installed Aperant data. Existing upstream data is neither imported nor removed.
- Removed automatic Google Fonts requests on the renderer's initial load and removed the now-unused `electron-updater` runtime dependency.

This preview is not maintained or released by the Aperant maintainers. Upstream documentation, screenshots, download links, and release channels describe Aperant itself, not this derivative.

Changes on 2026-09-28 for `0.1.0-preview.2`:

- Added Simplified Chinese translations across the desktop interface, native dialogs, notifications and application-owned error feedback. Provider output, source code, commands, paths, model identifiers and user-authored text retain their original form.
- Added immediately persisted Chinese / English language buttons in Settings. New profiles default to Chinese; explicit existing language preferences remain intact, including legacy French settings. No provider authentication or runtime architecture was changed.
- Added locale completeness, interpolation and actual Electron switch/restart checks. Release timestamps record the real modification date; Git commit dates follow the user's requested synthetic schedule.

## Unreleased Forge branding changes — 2026-09-28

- Product-facing copy, native application name, OAuth completion page, review messages, and diagnostics use Forge. Upstream sponsorship and community promotions were removed from normal navigation and repository templates.
- The npm workspace and desktop package are named `forge-desktop-workspace` and `forge-desktop`; the native product name is Forge. The bundle ID and existing isolated user-data directory stay unchanged, so renaming the display name does not replace or hide saved projects.
- Built-in tool names use `mcp__forge__`; legacy configuration identifiers retain explicit compatibility mappings. API profile files are now written beneath the existing user-data directory's `forge/` subdirectory, with missing-file fallback to the previous name and private file permissions. Existing files are not deleted.
- Historical data exclusion rules, authentication parameters, and saved memory database namespaces remain where changing them would alter safety or existing user data. GitHub/GitLab fork operations remain real functionality.
- The original license, copyright and source provenance remain intact and available from the application's source/license notice. No claim of independent upstream authorship or completed Forge Python Host integration is made.
- This is an unpublished working-tree build based on 0.1.0-preview.2, not a replacement for that release's existing assets.

## Original Forge logo — 2026-09-28

- Replaced the earlier preview F with a newly generated original Forge mark and matching silver-blue application tile. The canonical PNGs and imagegen prompt set are under `apps/desktop/resources/branding/`; platform assets are size/format conversions of those images, not upstream artwork.
- One accessible brand component serves expanded/collapsed navigation, welcome, onboarding, About and settings. Its alpha silhouette uses theme foreground colors in light/dark modes. Favicon and bundled macOS/Windows/Linux icons use the matching app tile.
- The original Forge UI, web app icons and tray/package resources receive the same assets. Historical releases and third-party provider/function icons are retained. This visual change does not claim a runtime migration or new business capability.

## Forge repository delivery — 0.1.0-preview.3 (2026-09-28)

The complete derivative desktop project is delivered under `desktop/` in [j-tide/Forge](https://github.com/j-tide/Forge/tree/main/desktop), with its npm lockfile, AGPL LICENSE, notices, build scripts and imported history retained. The pre-existing Forge Python Host/specification project remains separately rooted and unchanged in ownership; placing the projects in one repository does not integrate their runtimes or migrate user data. The sibling worktree remains a preparation/history reference. Product repository links and the source button now point to Forge. Automatic upstream publishing, updates and telemetry remain disabled as previously documented.

This version releases the branding/profile-compatibility and original Logo changes described above. Preview data directory and app ID remain stable. Git commit dates continue the user's requested synthetic schedule with1–3day intervals; actual development and validation occurred on2026-09-28. Current testing/build/platform limitations appear in the corresponding release notes; prior releases are historical evidence, not overwritten.

## Repository cleanup — 2026-09-28 (source cleanup, not a release)

- Removed the unused standalone design demo, extracted IPC text fragments, temporary research/one-time instructions, an empty redundant lockfile, and inactive nested review configuration.
- Removed inherited nested `.github/` automation and its unused release helpers after integration into Forge. Active quality workflows remain at the Forge repository root; publishing still requires explicit authorization and updater channels remain disabled.
- Production application code, npm dependencies, license/copyright notices, this provenance record, runtime prompts, actual release assets/screenshots and historical acceptance evidence remain. This cleanup does not integrate the Python Host or change user data.
