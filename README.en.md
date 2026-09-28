<div align="center">

<img src="desktop/apps/desktop/resources/icon-256.png" alt="Forge logo" width="96" height="96" />

# Forge

**An open-source desktop workspace for AI-assisted coding**

Organize tasks, configure agents, and follow development activity and code changes across your projects.

[![Preview](https://img.shields.io/badge/preview-0.1.0--preview.4-476b9b?style=flat-square)](https://github.com/j-tide/Forge/releases/tag/v0.1.0-preview.4) [![macOS Apple Silicon](https://img.shields.io/badge/macOS-Apple_Silicon-64748b?style=flat-square)](#download-and-install) [![Desktop CI](https://github.com/j-tide/Forge/actions/workflows/desktop-quality.yml/badge.svg)](https://github.com/j-tide/Forge/actions/workflows/desktop-quality.yml) [![Desktop License](https://img.shields.io/badge/desktop_license-AGPL--3.0-64748b?style=flat-square)](desktop/LICENSE)

[**Download preview**](#download-and-install) · [Features](#features) · [Getting started](#getting-started) · [Development](#local-development) · [Contributing](#contributing)

[简体中文](README.md) / **English**

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="desktop/docs/screenshots/0.1.0-preview.4/home-dark-1440.png" />
  <img src="desktop/docs/screenshots/0.1.0-preview.4/home-light-1440.png" alt="Forge desktop home with project access, task navigation, and a frosted glass interface" width="100%" />
</picture>

<p align="center"><sub>Actual Electron interface · Light and dark themes · 中文 / English</sub></p>

Forge brings projects, tasks, model configuration, and development activity into one desktop application. Start with a local Git project, add files and images as task context, configure agents for each stage, and follow the work through task details, terminals, and worktrees.

> [!NOTE]
> Forge is currently in **preview**. `0.1.0-preview.4` has been verified for the interface, local interactions, and packaged application startup on macOS Apple Silicon. The current derivative desktop **is not yet connected to the Forge Python Host**, and end-to-end online task execution still requires validation. See [Project status](#project-status) for the verified scope.

## Features

| Capability | What you can do in Forge |
| --- | --- |
| **Projects and tasks** | Open local code projects, organize tasks on a board, and inspect progress, subtasks, logs, and files in task details. |
| **Requirements and context** | Describe goals in natural language, reference project files with `@`, attach images, and save task configuration. |
| **Agents and models** | Choose models separately for requirements refinement, planning, development, and quality review; manage provider authentication and execution settings. |
| **Terminals and worktrees** | Inspect command activity, task worktrees, and code changes; check the base branch and review and push options. |
| **Project exploration** | Access analysis and tool configuration through Insights, Roadmap, Ideation, Context, and the MCP overview. |
| **Interface and preferences** | Switch instantly between Chinese and English or light and dark themes. Preferences persist, with keyboard support and options to reduce motion and transparency. |

These are the entry points available in the current desktop. Online models, executors, and external tools each require their own authentication and configuration; the validation scope is documented below.

<details>
<summary><strong>Explore task creation and language settings</strong></summary>

<br />

| Describe and configure a task | Switch language and theme |
| --- | --- |
| ![Forge task creation with requirements, reference images, and stage configuration](desktop/docs/screenshots/0.1.0-preview.4/new-task-light-1440.png) | ![Language settings in Forge's English dark interface](desktop/docs/screenshots/0.1.0-preview.4/settings-language-en-dark-1440.png) |

Screenshots show actual Electron windows running `0.1.0-preview.4`. Projects and tasks labeled “UI 测试” use isolated test data; no online agents were run for these screenshots. Sources and file checksums are available in the [screenshot record](desktop/docs/screenshots/0.1.0-preview.4/screenshots.json).

</details>

## Download and install

Current preview: **0.1.0-preview.4**. Installation packages are available for **macOS Apple Silicon (M-series chips)**.

| Download | Usage |
| --- | --- |
| [**macOS DMG**](https://github.com/j-tide/Forge/releases/download/v0.1.0-preview.4/Forge-0.1.0-preview.4-darwin-arm64-INTERNAL.dmg) | Open the image and drag `Forge.app` to Applications. |
| [macOS ZIP](https://github.com/j-tide/Forge/releases/download/v0.1.0-preview.4/Forge-0.1.0-preview.4-darwin-arm64-INTERNAL.zip) | Extract the archive and open `Forge.app`. |
| [Corresponding source](https://github.com/j-tide/Forge/releases/download/v0.1.0-preview.4/Forge-0.1.0-preview.4-source.tar.gz) | Complete source matching the release tag. |
| [SHA256SUMS](https://github.com/j-tide/Forge/releases/download/v0.1.0-preview.4/SHA256SUMS) | Verify the SHA-256 checksums of downloaded files. |

Verify the download, quit the previous Forge version normally, then open the new version from Finder. See the [release notes](desktop/docs/releases/0.1.0-preview.4.md) for changes, build information, and known issues, or browse [Releases](https://github.com/j-tide/Forge/releases) for earlier versions.

> [!IMPORTANT]
> These are **INTERNAL / ADHOC / UNNOTARIZED** prerelease packages. They use ad-hoc signing and have not completed Developer ID signing or notarization. Follow the macOS security prompts; there is no need to disable Gatekeeper globally.

## Getting started

Project features require **Git**. Model calls require your own valid credentials and a network connection; some executors also require their corresponding CLI. Use a test repository for your first session.

1. **Open a project** — Select a local code directory from the home screen and complete project initialization if prompted.
2. **Configure models** — Set up authentication under Settings → Accounts, then choose providers and models for each stage in Agent Settings. Configure executable locations under Paths when a CLI is required.
3. **Create a task** — Select New Task, describe the goal, reference relevant files, and check the base branch, worktree, review, and push options before saving.
4. **Start explicitly** — Creating a task does not begin execution. Select Start on the board after checking the model configuration and execution options.
5. **Follow the work** — Open task details for progress, logs, and files. Use Agent Terminals and Worktrees to inspect development activity and code changes.

The settings button beside a project tab manages that project; Settings in the lower-left corner manages application preferences. See the [desktop guide](desktop/README.md#操作入口) for a fuller list of entry points.

## Project status

Forge is prioritizing the desktop experience, Python Host integration, and validation of the installed application. The status below applies to **0.1.0-preview.4**; test evidence is retained with each version.

| Area | Current status |
| --- | --- |
| macOS Apple Silicon desktop | Light and dark interfaces, project settings, local task persistence, keyboard interaction, and language/theme restoration after restart have been verified. |
| macOS packages | DMG launch, bundled resource consistency, and ad-hoc signature checks passed. Developer ID signing, notarization, and signed updates remain unverified. |
| Forge Python Host | An independent implementation exists in this repository. The current derivative application in `desktop/` is not yet connected to it. |
| Online tasks and external integrations | End-to-end agent task execution, Claude, external MCP services, and third-party integrations still require validation for this version. |
| Other platforms | Windows and Intel Macs have not completed testing on actual devices. Linux CI covers static checks, unit tests, and builds. |
| Mobile and remote collaboration | New development is deferred. Remote network entry points are disabled by default. |

This version also has documented dependency audit findings. See [open risks in the release notes](desktop/docs/releases/0.1.0-preview.4.md#未关闭风险). Detailed progress and validation evidence are recorded in the [implementation status](docs/implementation-status.md).

## Local development

### Run the desktop application

The current desktop source lives in `desktop/` and uses **Electron + React + TypeScript** in an independent npm workspace.

Prerequisites: **Node.js 24+, npm 10+, and Git**. Building native modules on macOS requires Xcode Command Line Tools. See the [desktop development guide](desktop/README.md#源码开发) for other native dependency requirements.

```sh
git clone https://github.com/j-tide/Forge.git
cd Forge/desktop

# Install locked dependencies
npm ci --ignore-scripts

# Install the Electron runtime and prepare native modules
node node_modules/electron/install.js
npm --workspace apps/desktop run postinstall

# Start the development environment
npm run dev
```

### Checks and builds

Run these commands from `desktop/`. They correspond to the checks in [Desktop CI](.github/workflows/desktop-quality.yml):

```sh
npm run check:i18n
npm run lint
npm run typecheck
npm test
npm run build
```

Changes to desktop interactions also require regression checks in actual Electron windows on macOS:

```sh
npm run test:ui:desktop
npm run test:overlays:desktop
npm run test:files:desktop
npm run test:i18n:desktop
```

These interface checks use isolated test data and do not call online models. Packaging instructions are in the [release development guide](desktop/RELEASE.md).

### Repository layout

```text
Forge/
├── desktop/       # Current derivative desktop: Electron + React, independent npm workspace
├── python/        # Forge Python Host / Core and Python tests
├── apps/          # Original Forge desktop and Vue UI; legacy Node Host migration reference
├── packages/      # Public contracts, client, shared UI, validators, and migration references
├── plugins/       # Original TypeScript plugins retained as migration references
├── tests/         # Original Forge integration tests and acceptance fixtures
└── docs/          # Architecture decisions, implementation records, and validation evidence
```

The approved target architecture puts tasks, approvals, execution, and evidence under the **Python Host**, with desktop communication through versioned **JSON-RPC over stdio**. Integration of the current derivative desktop remains incomplete. See [ADR 0029](docs/decisions/0029-python-core-runtime-architecture.md) and [ADR 0087](docs/decisions/0087-aperant-derived-desktop-base.md) for the architecture and migration boundaries.

<details>
<summary><strong>Develop the Python Host and original Forge workspace</strong></summary>

The repository root is a separate pnpm workspace requiring Node.js `>=22.13.0 <23` and pnpm `12.3.4`. Python requires `3.12+` and uv; tool versions are recorded in [versions.lock.json](versions.lock.json). The root and `desktop/` have different Node requirements and lockfiles, so run commands in the appropriate environment.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm py:check          # Sync Python dependencies; run Ruff, mypy, and pytest
pnpm dev:python-host   # Start the standalone stdio Host
```

The Host reserves standard output for protocol communication. These commands do not connect the current derivative desktop to the Host. See the [Python module inventory](docs/python-core-module-inventory.md) and [migration plan](docs/forge-python-core-migration-plan.md) for module entry points and migration progress.

</details>

## Contributing

Bug reports, documentation improvements, translations, and code contributions are welcome.

- **Report a bug:** Open an [issue](https://github.com/j-tide/Forge/issues) with the version, operating system, reproduction steps, and expected result. Remove credentials and personal information from logs and screenshots.
- **Propose a feature:** Describe the use case and expected behavior. Discuss changes to architecture, permissions, or product states first and record the architecture decision.
- **Submit an improvement:** Keep each PR focused on one problem and include actual verification results. Add screenshots for interface changes and identify any platforms you have not tested.

Read [AGENTS.md](AGENTS.md) before making changes. Run the appropriate checks for the desktop or root workspace, and preserve existing user data, licenses, and source attribution.

## Documentation

The detailed guides and engineering records linked below are primarily in Simplified Chinese.

| Document | Contents |
| --- | --- |
| [Desktop usage and development](desktop/README.md) | Entry points, configuration, data directories, and local development. |
| [Release notes](desktop/docs/releases/0.1.0-preview.4.md) | Changes, screenshots, package checksums, and known issues for this version. |
| [Desktop UI / UX review](docs/desktop-ui-ux-audit.md) | Interface, interaction, keyboard support, and fixes. |
| [Python Core migration plan](docs/forge-python-core-migration-plan.md) | Migration steps and validation boundaries for the independent business runtime. |
| [Architecture decisions](docs/decisions/) | Technical direction, states, permissions, and security rules. |
| [Implementation status](docs/implementation-status.md) | Progress, check results, and outstanding validation by version. |

## Acknowledgments and license

The current Forge desktop is derived from [Aperant](https://github.com/AndyMik90/Aperant) **`v2.8.0-beta.6`** and is licensed under [GNU AGPL-3.0](desktop/LICENSE). We thank AndyMik90 and the upstream contributors. Original copyright, license, and attribution notices are retained. Forge is maintained independently by this project.

See [UPSTREAM.md](desktop/UPSTREAM.md) for the imported version, original commit, and modification history. Each release provides its complete corresponding source. Licensing boundaries for other directories follow their respective notices and [ADR 0087](docs/decisions/0087-aperant-derived-desktop-base.md).
