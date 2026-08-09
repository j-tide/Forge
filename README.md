# Forge Glass Preview

Forge Glass Preview is a separate desktop preview derived from [Aperant](https://github.com/AndyMik90/Aperant) `v2.8.0-beta.6`. It explores a glass-style interface while retaining the Aperant application code as its starting point. It is not an official Aperant release, and it is separate from the Python Host–based Forge application in the sibling `Forge` repository.

This preview uses its own application ID, product name, user-data directory, project data directory (`.forge-glass-preview/`), and Claude profile directory (`~/.forge-glass-preview/claude-profiles/`). It does not import existing Aperant `.auto-claude/` task data or `~/.claude-profiles/` accounts. The provider CLI's own `~/.claude` login may still be read when you explicitly use that provider. Its updater is disabled and its package scripts do not publish releases. Error reporting is off by default and requires both user opt-in and a preview-specific DSN. These safeguards let the preview coexist with installed Forge and Aperant apps; use a disposable repository for your first task run.

The UI in this repository starts from Aperant's existing workflows. It is **not** connected to the sibling Forge Python Host, and it does not migrate Forge's SQLite projects, tasks, approvals, or runs. The current package is an internal UI preview, not a completed Forge product or an official Aperant build.

## Build locally

The repository declares Node.js 24 or newer and npm 10 or newer. From the repository root:

```sh
npm ci
npm run dev
```

For checks and a local package:

```sh
npm run lint
npm run test
npm run build
npm run package:mac
```

Use `package:win` or `package:linux` on the corresponding platform. A successful local package is a preview artifact, not a published release. On the verified macOS arm64 machine, `package:mac` stalled while fetching the DMG helper. The internal package was built with `electron-builder --mac dir --publish never --config.mac.identity=-` and `CSC_IDENTITY_AUTO_DISCOVERY=false`, then wrapped using macOS `ditto` and `hdiutil`; it is ad-hoc signed and unnotarized.

## Verified preview scope

On macOS arm64 (2026-09-27), the Electron window loaded the Forge Glass Preview welcome view in both light and dark themes from isolated test profiles. See the [light](docs/screenshots/forge-glass-preview-light.png) and [dark](docs/screenshots/forge-glass-preview-dark.png) screenshots. `npm run lint`, Desktop typecheck, 4,632 unit tests, and `npm run build` passed. The local `.app` opened with its own user-data identity, and the internal ZIP and ad-hoc DMG were verified. The DMG is **not notarized**. These checks do not prove a full agent task, Windows operation, Python Host integration, or a production release.

The upstream dependency tree still has **33 production npm audit findings (10 high, 9 moderate, 14 low)** as of 2026-09-27. Review and remediation are required before a public release. The preview also keeps the upstream optional provider-usage polling behavior once an account is explicitly configured; it does not make paid model calls during the empty-shell checks above.

## Origin and license

The exact upstream source revision, modification date, and derivative changes are recorded in [UPSTREAM.md](UPSTREAM.md). The original [GNU Affero General Public License v3.0](LICENSE) and existing copyright notices are retained. The upstream project and its maintainers are credited; this preview is independently modified.
