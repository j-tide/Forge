# Contributing to Forge

Forge is a single Electron + React + TypeScript application rooted in this repository. Use Node.js 24+, npm 10+, Git, and the platform tools needed by native dependencies. Source provenance and license requirements are recorded in [UPSTREAM.md](UPSTREAM.md) and [LICENSE](LICENSE).

## Setup

Run these commands from the repository root:

```sh
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run postinstall
npm run dev
```

The postinstall entry point is `scripts/build/postinstall.cjs`. Native builds on macOS need Xcode Command Line Tools; Windows may need Visual Studio C++ Build Tools. Do not replace the pinned lockfile with an unreviewed dependency update.

## Source layout

| Directory | Responsibility |
| --- | --- |
| `src/main/` | Electron services, domain IPC, Agent lifecycle, terminals, accounts, and platform integration. |
| `src/main/ai/` | TypeScript Workers, model adapters, sessions, orchestration, tools, security, memory, and worktrees. |
| `src/preload/` | The `electronAPI` bridge exposed through contextBridge. |
| `src/renderer/` | React components, contexts, hooks, Zustand stores, utilities, and styles. |
| `src/shared/` | Types, constants, locales, state machines, and shared utilities. |
| `resources/`, `prompts/` | Application assets and runtime prompts. |
| `scripts/build/`, `scripts/dev/`, `scripts/checks/` | Build/native tooling, local launchers, and static checks. |
| `tests/tooling/`, `tests/ui/`, `tests/e2e/` | Tool regressions, actual desktop checks, and Playwright scenarios. |

Most unit and integration tests are colocated with their modules in `src/`. See [development guidance](docs/development.md) for entry points and current runtime boundaries.

## Code and verification

Follow existing component patterns, use TypeScript strict mode, keep Renderer access behind the public Preload API, and preserve project/account scoping. Saved data, preferences, application identity, legal notices, and existing user projects must survive changes.

```sh
npm run check:i18n
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` runs Node tooling regressions and Vitest. `npm start` launches the compiled application; run `npm run build` first. Use `npm run lint:fix` for deliberate Biome fixes and inspect the resulting changes.

Run meaningful regression tests for changed behavior. UI, native modules, installation, actual provider calls, OAuth, and additional platforms require their own evidence. Do not describe mocks, fixture accounts, or historical releases as proof of a complete online workflow.

Automatic pre-commit hooks are not assumed: run the commands above explicitly before requesting review. The active [desktop-quality workflow](.github/workflows/desktop-quality.yml) checks the root application; Linux CI does not replace macOS or Windows installation evidence.

## Changes and pull requests

- Keep each change focused and explain the user-visible problem, resulting behavior, and actual validation.
- Describe new feature or architecture proposals before changing the product boundary.
- Include screenshots when they clarify UI behavior and list material unverified paths.
- Explain AI assistance and how you checked the implementation; redact credentials and private local data from examples and logs.
- Write concise commit messages and keep distinct functional changes independently reviewable.

Use this repository’s [issues](https://github.com/j-tide/Forge/issues) for bugs, proposals, or setup questions. Bug reports should include the version, platform, reproduction steps, expected result, and relevant redacted errors.

## Repository and release

The integration branch is `main` in [j-tide/Forge](https://github.com/j-tide/Forge). Do not reset another contributor’s work, rewrite published history, remove upstream attribution, or enable automatic publishing/updating.

Commit, push, merge, tag, and publish only within explicit authorization. A normal push does not authorize a release. Packaging and publication requirements are in [docs/releasing.md](docs/releasing.md), and implementation results are in [docs/implementation-status.md](docs/implementation-status.md).

Contributions retain applicable copyright and source notices and are distributed under AGPL-3.0.
