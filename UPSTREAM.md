# Upstream provenance and modifications

Forge Glass Preview is a derivative of the Aperant desktop application. Renaming this preview does not change its origin or license.

| Item | Value |
| --- | --- |
| Upstream project | [Aperant](https://github.com/AndyMik90/Aperant) (formerly Auto Claude) |
| Upstream Git URL | `https://github.com/AndyMik90/Aperant.git` |
| Imported tag | `v2.8.0-beta.6` |
| Imported commit | `cba7a0270ec794a14ac71615bc6c48085807ede6` |
| Original source tree | `c3c44dd2708574d045f2a8cbde9198315807abc9` |
| Attributed import snapshot | [`85337af1936ea8a46fea0f026e0b2c661853953d`](https://github.com/j-tide/Forge/commit/85337af1936ea8a46fea0f026e0b2c661853953d) |
| Modification dates | 2026-09-27, 2026-09-28 and 2026-09-29 |
| License | GNU Affero General Public License v3.0; see [LICENSE](LICENSE) |

The original source and history remain available at the [upstream commit](https://github.com/AndyMik90/Aperant/commit/cba7a0270ec794a14ac71615bc6c48085807ede6). On 2026-09-28, the repository's public history replaced the imported upstream ancestry with the attributed source snapshot above. Its source tree is identical to the upstream tree. The snapshot author records the import operation, not original authorship of the code: AndyMik90 and the upstream contributors retain their authorship and copyright. Existing copyright and license notices remain in place, and `LICENSE` is preserved unchanged. The complete prior repository history is also retained in a verified local Git bundle.

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

The complete derivative desktop project is delivered under `desktop/` in [j-tide/Forge](https://github.com/j-tide/Forge/tree/main/desktop), with its npm lockfile, AGPL LICENSE, notices and build scripts retained. The imported history was initially included at delivery; its later public representation is described below. The pre-existing Forge Python Host/specification project remains separately rooted and unchanged in ownership; placing the projects in one repository does not integrate their runtimes or migrate user data. The sibling worktree remains a preparation/history reference. Product repository links and the source button now point to Forge. Automatic upstream publishing, updates and telemetry remain disabled as previously documented.

This version releases the branding/profile-compatibility and original Logo changes described above. Preview data directory and app ID remain stable. Git commit dates continue the user's requested synthetic schedule with1–3day intervals; actual development and validation occurred on2026-09-28. Current testing/build/platform limitations appear in the corresponding release notes; prior releases are historical evidence, not overwritten.

## Repository cleanup — 2026-09-28 (source cleanup, not a release)

- Removed the unused standalone design demo, extracted IPC text fragments, temporary research/one-time instructions, an empty redundant lockfile, and inactive nested review configuration.
- Removed inherited nested `.github/` automation and its unused release helpers after integration into Forge. Active quality workflows remain at the Forge repository root; publishing still requires explicit authorization and updater channels remain disabled.
- Production application code, npm dependencies, license/copyright notices, this provenance record, runtime prompts, actual release assets/screenshots and historical acceptance evidence remain. This cleanup does not integrate the Python Host or change user data.

## Public import-history consolidation — 2026-09-28

- At the repository owner's request, the 1,105 imported upstream commits are replaced in the public ancestry by one explicitly attributed source-import snapshot. The 110 Forge development commits retain their authors, messages, dates and parent ordering; only their parent hashes are remapped. The latest documentation commit additionally records this change.
- The snapshot has the exact upstream source tree. Original licenses, copyright notices, acknowledgements and the application's source notice remain. This change does not transfer the upstream contributors' authorship to Forge.
- The complete previous main/tag history is backed up in `output/contributors-cleanup-20260928/forge-before-contributors-cleanup.bundle`, verified with `git bundle verify`. Old/new commit and tag mappings are recorded locally in that directory's `rewrite-plan.json`. Backup refs remain local and are not pushed.
- Public release tags retain the same source trees. Published installation packages, corresponding source archives, checksums and publication dates remain unchanged. Earlier release documents describing full imported history record the state at their publication.
- Historical `git-subtree-*` trailers retain their original import hashes. They are historical metadata, not instructions for automatic upstream synchronization. Future source imports require an explicit, attributed operation.
- Git timestamps continue the owner's synthetic schedule from November 2025 to September 27, 2026. Actual consolidation occurred on September 28, 2026; it is not a new product test or release.

## Forge desktop UI and reliability revision — 0.1.0-preview.4 (2026-09-28)

- Redesigned the light and dark workspace, navigation, task forms and reading surfaces; retained the imported workflow behavior and stable preview data identity. Reduced motion/transparency preferences and keyboard focus are preserved.
- Split project configuration from application preferences. Repaired portal/collision behavior for tooltips, popovers, nested menus, model/repository selectors and file references; bounded long menus to the viewport.
- Corrected project/session scoping, failed-save feedback, task-draft branch retention and fail-closed task-deletion checks. Provider model resolution and Insights failures now retain actual configuration and errors instead of false completion.
- Removed user-authorized obsolete reference assets and unused documentation, retaining required test inputs in module fixtures. Original licenses, notices, runtime prompts and historical release artifacts remain.
- This is an explicitly authorized Forge prerelease, not an Aperant-maintained release, not a completed Forge Python Host integration, and not evidence of full business or multi-executor acceptance. Corresponding source is supplied with the release. No automatic upstream publishing or updater was enabled.
- New commits use the actual development/publication date. Previously rewritten synthetic Git dates and historical release evidence remain unchanged; no further history rewrite is part of this publication.

## Forge control and workflow repairs — 0.1.0-preview.5 (2026-09-29)

- Added real provider connection/model tests, bounded endpoint validation and visible failure/retry states. Ollama discovery and memory configuration use the configured service; explicit model selections retain their provider.
- Corrected onboarding completion, project initialization ordering, persistent task options, failed-save handling, archive recovery and roadmap/task state projection. Improved keyboard controls and accessible names.
- Added scoped Insights copy, regenerate, cancel and retry behavior, image normalization and idempotent suggested-task persistence. Terminal restoration waits for acknowledgments and retains current sessions after failure.
- Added isolated UI/control regression tools and retained version-specific verification boundaries. Removed owner-authorized duplicate reports while retaining implementation history and original test evidence.
- This remains an Aperant-derived, explicitly authorized Forge prerelease with corresponding source. The Forge Python Host and project Agent MCP configuration chain remain unintegrated; external authentication, complete online Agent execution and additional platforms are not claimed as accepted. Licenses, copyright, source attribution, disabled automatic publishing/updater channels and existing user-data identity remain unchanged.

## Single Desktop repository — 2026-09-29

- At the repository owner's explicit request, removed the entire previous Forge implementation: the root Vue/Electron desktop, Python and TypeScript cores, Node Host, plugins, contracts, old acceptance material, pnpm workspace and associated build/QA tools. Only the Aperant-derived `desktop/` workspace remains active.
- The current execution path is React Renderer → Preload → Electron Main → TypeScript Agent Workers / Vercel AI SDK. Integration with the removed Python Host is no longer the repository architecture or a pending migration requirement.
- Removed the dual-Desktop/Python-Core diagrams and rewrote current navigation, development guidance and CI around this single workspace. Existing desktop production code, dependencies, user-data identity, copyright and AGPL source obligations are unchanged.
- Versioned release sections above describe their original publication state. Published release tags/assets are unchanged; current documentation does not inherit old Forge acceptance results.
- The verified local original-import bundle and mapping have moved from `output/contributors-cleanup-20260928/` to `.git/forge-import-history/`; they are version-control provenance, not an active product implementation. Current preview.5 validation records moved to `desktop/output/release-preview5/`. No real user settings, project data or databases were removed.

## Root application layout — 2026-09-29

- Following the owner’s request to reorganize the remaining desktop application, moved the Aperant-derived source from `desktop/apps/desktop/` to root `src/` and consolidated its npm manifest and lockfile into one `forge-desktop` application. The previous nested workspace paths are historical locations, not active projects.
- Runtime source is organized as `src/main/`, `src/preload/`, `src/renderer/` and `src/shared/`. Assets and prompts are at `resources/` and `prompts/`; supporting scripts are grouped under `scripts/build/`, `scripts/dev/` and `scripts/checks/`; independent tooling, UI and end-to-end checks are under `tests/`.
- Current guidance is under `docs/`, with root LICENSE, UPSTREAM, CONTRIBUTING and AGENTS files. Existing versioned release records and screenshots retain their original facts and checksums. This layout change does not rewrite published tags/assets or transfer upstream authorship.
- Application identity and real user-data locations remain unchanged. Corresponding-source, copyright and AGPL obligations continue to apply. Earlier sections record the state of those changes when made; root layout is the current development entry point.
