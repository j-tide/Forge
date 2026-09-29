# Forge Release Process

Forge previews are built and published explicitly from this repository. Imported automatic release workflows and their unused helpers have been removed; updater channels remain disabled. A push or version edit does not authorize publication. Active quality checks live in the repository root `.github/workflows/desktop-quality.yml`.

## Before packaging

1. Obtain explicit authorization for the version and publication destination.
2. Use the repository root `package-lock.json` and supported Node.js 24 / npm 10+ environment. Run all commands below from the repository root.
3. Run the actual quality checks:

```sh
npm run check:i18n
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:i18n:desktop
```

Run actual UI checks on their supported desktop platform. For the exact packaged macOS arm64 application, use `FORGE_PACKAGED_APP=/absolute/path/to/Forge.app npm run test:package:desktop`; inspect its recorded cleanup and original-profile checks before treating it as passed.

4. Record the source revision, platform, architecture, dependency risks, and any checks not executed.
5. Preserve [LICENSE](../LICENSE), [UPSTREAM.md](../UPSTREAM.md), applicable copyright notices, and corresponding source. Product branding changes do not alter these requirements.

## Internal macOS package

The current internal preview uses ad hoc signing and is **INTERNAL / ADHOC / UNNOTARIZED**. It is not a Developer ID release. The packaging command must not silently select a certificate from the developer’s keychain:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --mac dir --publish never --config.mac.identity=-
```

Use the resulting application’s actual path and version in any follow-up `ditto` / `hdiutil` commands. The package location and display name can differ from previously published assets; do not overwrite a published version with changed code under the same identity.

For each output, verify:

- The packaged main, preload, renderer, resources, and license/source files match the tested source build.
- The application opens normally and retains the selected language and theme after restart.
- Ad hoc signature and archive/image integrity checks pass for the exact artifact.
- SHA-256 checksums and a corresponding source archive refer to that artifact.
- No local credentials, unredacted environment, or developer-only directories enter the package.

The previous published artifact and its evidence are recorded in [0.1.0-preview.2](releases/0.1.0-preview.2.md). Historical asset names remain unchanged.

## Publication

Only after explicit authorization, publish to this repository’s [Releases](https://github.com/j-tide/Forge/releases). Internal previews remain prereleases. Attach the checksums, corresponding source, actual platform artifacts, and release notes describing tested behavior and outstanding risks.

Do not publish to another project’s release channel, automatically enable the updater, upload a signing key, submit notarization, or describe untested Windows / macOS Intel builds as verified.

## Verification boundaries

A successful UI or language check does not prove complete online task execution, a second executor, or complete product acceptance. The single npm application is rooted in this repository, with runtime source in `src/`; the previous Forge runtimes and their gates have been removed. Keep platform, runtime, security, packaging, and provider acceptance results separate. Document failures and inherited dependency risks instead of replacing them with a generic success statement.
