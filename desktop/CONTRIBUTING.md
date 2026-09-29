# Contributing to Forge

Thank you for your interest in contributing to Forge! This document provides guidelines and instructions for contributing to the project.

## How to Contribute

| What you want to do | Where to start |
|----------------------|----------------|
| Bug fixes & small improvements | Open a PR directly |
| New features / architecture changes | Describe the proposal in this repository’s issue or pull request before changing architecture |
| Questions & setup help | Use this repository’s issue tracker, with credentials and local paths redacted |

## AI-Assisted Contributions

PRs built with AI tools (Claude, Codex, Copilot, etc.) are welcome here -- given what this project does, it would be odd if they weren't.

That said, we've seen AI-generated PRs that introduce regressions because the contributor didn't verify what the code actually does. To keep quality high, we ask that AI-assisted PRs include the following:

- **Flag it** -- mention AI assistance in the PR description
- **State your testing level** -- untested, lightly tested, or fully tested
- **Share context if you can** -- prompts or session logs help reviewers understand intent
- **Confirm you understand the code** -- you should be able to describe what the PR does and how the underlying code works

AI-assisted PRs go through the same review process as any other contribution. Transparency just helps reviewers know where to look more carefully.

## Table of Contents

- [How to Contribute](#how-to-contribute)
- [AI-Assisted Contributions](#ai-assisted-contributions)
- [License and source notices](#license-and-source-notices)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Pre-commit Hooks](#pre-commit-hooks)
- [Code Style](#code-style)
- [Testing](#testing)
- [Continuous Integration](#continuous-integration)
- [Git Workflow](#git-workflow)
  - [Repository remotes](#repository-remotes)
  - [Current development workflow](#current-development-workflow)
  - [Commit Messages](#commit-messages)
  - [PR Hygiene](#pr-hygiene)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Architecture Overview](#architecture-overview)

## License and source notices

Contributions to Forge are distributed under the repository’s [AGPL-3.0 license](LICENSE). Preserve applicable copyright, attribution, and source notices. Source provenance is recorded in [UPSTREAM.md](UPSTREAM.md).

## Prerequisites

Before contributing, ensure you have the following installed:

- **Node.js 24+** - For the Electron desktop app
- **npm 10+** - Package manager (comes with Node.js)
- **CMake** - Required for building native dependencies (e.g., node-pty)
- **Git** - Version control

### Installing Node.js 24+

**Windows:**
```bash
winget install OpenJS.NodeJS.LTS
```

**macOS:**
```bash
brew install node@24
```

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

**Linux (Fedora):**
```bash
sudo dnf install nodejs npm
```

### Installing CMake

**Windows:**
```bash
winget install Kitware.CMake
```

**macOS:**
```bash
brew install cmake
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt install cmake
```

**Linux (Fedora):**
```bash
sudo dnf install cmake
```

## Quick Start

The fastest way to get started:

```bash
# Clone the repository
git clone https://github.com/j-tide/Forge.git
cd Forge/desktop

# Install all dependencies (cross-platform)
npm run install:all

# Run in development mode
npm run dev

# Or build and run production
npm start
```

## Development Setup

The project is a single Electron desktop application in `apps/desktop/`. All AI agent logic lives in TypeScript using the Vercel AI SDK v6.

From the repository root:

```bash
# Install all dependencies
npm run install:all

# Start development mode (hot reload)
npm run dev
```

`npm run install:all` installs the npm dependencies for `apps/desktop/`.

### Other Useful Commands

```bash
npm start              # Build and run production
npm run build          # Build for production
npm run package        # Package for distribution
npm test               # Run frontend tests
```

<details>
<summary><b>Windows users:</b> If installation fails with node-gyp errors, click here</summary>

Forge does not download upstream native prebuilts. Source builds rebuild native dependencies locally; Windows may require Visual Studio Build Tools:

1. Download [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. Select "Desktop development with C++" workload
3. In "Individual Components", add "MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs"
4. Restart terminal and run `npm install` again

</details>

> **Note:** For regular usage, we recommend downloading the pre-built releases from [GitHub Releases](https://github.com/j-tide/Forge/releases). Running from source is primarily for contributors and those testing unreleased features.

## Pre-commit Hooks

We use Husky + lint-staged to run Biome linting and formatting checks before each commit.

### Setup

Husky is installed automatically when you run `npm install` inside `apps/desktop/`.

### What Runs on Commit

When you commit, the following checks run automatically on staged files:

| Check | Scope | Description |
|-------|-------|-------------|
| **Biome** | `apps/desktop/` | TypeScript/React linter + formatter |
| **typecheck** | `apps/desktop/` | TypeScript type checking |
| **trailing-whitespace** | All files | Removes trailing whitespace |
| **end-of-file-fixer** | All files | Ensures files end with newline |
| **check-yaml** | All files | Validates YAML syntax |
| **check-added-large-files** | All files | Prevents large file commits |

### Running Manually

```bash
cd apps/desktop

# Run linter (Biome)
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Run type checking
npm run typecheck
```

### If a Check Fails

1. **Biome auto-fixes**: Run `npm run lint:fix` in `apps/desktop/`. Stage the changes and commit again.
2. **Type errors**: Resolve TypeScript type issues before committing.

## Code Style

### TypeScript/React

- Use TypeScript strict mode
- Follow the existing component patterns in `apps/desktop/src/`
- Use functional components with hooks
- Prefer named exports over default exports
- Use the UI components from `src/renderer/components/ui/`

```typescript
// Good
export function TaskCard({ task, onEdit }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  ...
}

// Avoid
export default function(props) {
  ...
}
```

### General

- No trailing whitespace
- Use the repository Biome configuration for TypeScript, React and JSON formatting
- End files with a newline
- Keep line length under 100 characters when practical

## Testing

### Frontend Tests

```bash
cd apps/desktop

# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run E2E tests (requires built app)
npm run build
npm run test:e2e

# Run linting
npm run lint

# Run type checking
npm run typecheck
```

### Testing Requirements

Before submitting a PR:

1. **All existing tests must pass**
2. **New features should include tests**
3. **Bug fixes should include a regression test**
4. **Test coverage should not decrease significantly**

## Continuous Integration

The repository has one active workflow: [desktop-quality](../.github/workflows/desktop-quality.yml). Matching Desktop source, workflow, README and AGENTS changes trigger it on pushes and pull requests; it can also be started manually.

| Runner | Checks |
| --- | --- |
| Ubuntu | Frozen npm install, localization references, Biome lint, TypeScript checks, unit tests, Main/Preload/Renderer build |

All checks for a change must pass. This runner does not exercise the native application on macOS or Windows. Desktop UI, native modules, signing, and installation require separate evidence on their actual target platforms; no three-platform CI pass is claimed.

Run these commands from `Forge/desktop`:

```bash
npm run check:i18n
npm run lint
npm run typecheck
npm test
npm run build
```

## Git Workflow

Forge uses isolated change branches against the current integration branch. Imported release automation is disabled.

### Repository remotes

Forge uses an independent repository. Clone the actual repository URL:

```bash
git clone https://github.com/j-tide/Forge.git
cd Forge/desktop
git remote -v
```

`origin` must point to this Forge repository before pushing. The read-only `upstream` remote and [UPSTREAM.md](UPSTREAM.md) record source provenance; they are not a GitHub Fork badge. Do not rewrite history or remove legal notices to change product branding.

### Current development workflow

The current Forge integration branch is `main`; imported Git Flow and automatic release examples are not the active publication process. Create an isolated change branch, run the checks documented above, and provide a focused pull request with actual verification results.

```bash
git fetch origin
git switch -c codex/your-change origin/main
```

Do not reset or clean another developer’s uncommitted work. Commit, push, merge, tag, and publish only when explicitly authorized. Packaging and release steps are documented in [RELEASE.md](RELEASE.md); a normal push must not publish a release or re-enable a disabled updater.

### Commit Messages

Write clear, concise commit messages that explain the "why" behind changes:

```bash
# Good
git commit -m "Add retry logic for failed API calls

Implements exponential backoff for transient failures.
Fixes #123"

# Avoid
git commit -m "fix stuff"
git commit -m "WIP"
```

**Format:**
```
<type>: <subject>

<body>

<footer>
```

- **type**: feat, fix, docs, style, refactor, test, chore
- **subject**: Short description (50 chars max, imperative mood)
- **body**: Detailed explanation if needed (wrap at 72 chars)
- **footer**: Reference issues, breaking changes

### PR Hygiene

**Rebasing:**
- **Rebase onto the current integration branch** before opening a PR and before merge to maintain linear history
- Use `git fetch origin && git rebase origin/main` to sync your branch
- Use `--force-with-lease` when force-pushing rebased branches (safer than `--force`)
- Notify reviewers after force-pushing during active review
- **Exception:** Never rebase after PR is approved and others have reviewed specific commits

**Commit organization:**
- **Squash fixup commits** (typos, "oops", review feedback) into their parent commits
- **Keep logically distinct changes** as separate commits that could be reverted independently
- Each commit should compile and pass tests independently
- No "WIP", "fix tests", or "lint" commits in final PR - squash these

**Before requesting review:**
```bash
# Ensure up-to-date with main
git fetch origin && git rebase origin/main

# Clean up commit history (squash fixups, reword messages)
git rebase -i origin/main

# Force push with safety check
git push --force-with-lease

# Verify everything works
cd apps/desktop && npm test && npm run lint && npm run typecheck
```

**PR size:**
- Keep PRs small (<400 lines changed ideally)
- Split large features into stacked PRs if possible

## Pull Request Process

1. **Create an isolated branch** from the current integration branch

   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style guidelines

3. **Test thoroughly**:
   ```bash
   cd apps/desktop && npm test && npm run lint && npm run typecheck
   ```

4. **Update documentation** if your changes affect:
   - Public APIs
   - Configuration options
   - User-facing behavior

5. **Create the Pull Request**:
   - Use a clear, descriptive title
   - Reference any related issues
   - Describe what changes you made and why
   - Include screenshots for UI changes
   - List any breaking changes

6. **PR Title Format**:
   ```
   <type>: <description>
   ```
   Examples:
   - `feat: Add support for custom prompts`
   - `fix: Resolve memory leak in worker process`
   - `docs: Update installation instructions`

7. **Review Process**:
   - Address reviewer feedback promptly
   - Keep the PR focused on a single concern
   - Squash commits if requested

## Issue Reporting

### Bug Reports

When reporting a bug, include:

1. **Clear title** describing the issue
2. **Environment details**:
   - OS and version
   - Node.js version
   - Forge version
3. **Steps to reproduce** the issue
4. **Expected behavior** vs **actual behavior**
5. **Error messages** or logs (if applicable)
6. **Screenshots** (for UI issues)

### Feature Requests

When requesting a feature:

1. **Describe the problem** you're trying to solve
2. **Explain your proposed solution**
3. **Consider alternatives** you've thought about
4. **Provide context** on your use case

## Architecture Overview

Forge is a single Electron desktop application in `apps/desktop/`.

### Electron Desktop (`apps/desktop/`)

- **AI Agent Layer** (`src/main/ai/`) - Vercel AI SDK v6 agent runtime, providers, tools, security, orchestration
- **Main Process** (`src/main/`) - IPC handlers, agent queue, terminal management, claude-profile
- **Renderer** (`src/renderer/`) - React UI components and Zustand stores
- **Shared** (`src/shared/`) - Types, i18n locales, constants, utilities

The implementation is in the source directories above. Current delivery boundaries are recorded in [AGENTS.md](../AGENTS.md) and [implementation status](docs/implementation-status.md).

---

## Questions?

If you have questions about contributing, feel free to:

1. Open a GitHub issue with the `question` label
2. Review existing issues and discussions

Thank you for contributing to Forge!
