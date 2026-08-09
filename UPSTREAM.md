# Upstream provenance and modifications

Forge Glass Preview is a derivative of the Aperant desktop application. Renaming this preview does not change its origin or license.

| Item | Value |
| --- | --- |
| Upstream project | [Aperant](https://github.com/AndyMik90/Aperant) (formerly Auto Claude) |
| Upstream Git URL | `https://github.com/AndyMik90/Aperant.git` |
| Imported tag | `v2.8.0-beta.6` |
| Imported commit | `cba7a0270ec794a14ac71615bc6c48085807ede6` |
| Modification date | 2026-09-27 |
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
