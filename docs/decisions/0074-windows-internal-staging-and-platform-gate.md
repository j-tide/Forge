# ADR 0074 — Windows internal staging and platform gate

Date: 2026-09-25
Status: Development preparation only; P6-07 acceptance blocked

## Decision

The Desktop's packaged Python interpreter path now resolves `runtime/python.exe` on Windows and `runtime/bin/python3.12` on macOS. The internal test data override uses Node's cross-platform `isAbsolute`. `pnpm package:windows:internal` is deliberately restricted to Windows x64: it stages the native Electron 44.4.3 distribution, `app.asar`, Web build, uv-managed CPython 3.12.13, frozen wheel dependencies, production Forge Host/plugins and an explicit **INTERNAL-UNSIGNED** notice. It probes the bundled Python/SQLite/Forge import and creates an internal ZIP. `pnpm smoke:package:windows` is a real Windows installed-directory/Host/Renderer/data-isolation smoke entry. A manual `workflow_dispatch` Windows CI job invokes quality checks, packaging and smoke; it has not been run and does not upload an artifact.

No installer or Authenticode signature is produced. The machine is macOS arm64 with no observed Windows runner, Wine or PowerShell environment. The Windows script's macOS refusal was observed; the Windows build, ZIP creation, packaged Host, actual installer, Squirrel events, UAC, Chinese path and DPI, uninstall retention, signing and full Codex task remain **UNVERIFIED**. Internal ZIP staging is not T111/T112/T113 or P6-07 acceptance. The existing P6-06 internal Mac package and its real product workflow are separate evidence. P6-07 stays **BLOCKED**, not DONE.

Electron's [manual distribution guide](https://www.electronjs.org/docs/latest/tutorial/application-distribution) specifies `resources/app.asar` on Windows, and [code signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing) requires a real Windows signing flow for distribution. [uv's managed Python documentation](https://docs.astral.sh/uv/concepts/python-versions/) describes portable platform builds; this code still requires a Windows x64 execution to establish ABI/packaging compatibility. The Electron [Windows installer project](https://github.com/electron/windows-installer) has an install script to select a bundled 7-Zip binary, so no new unapproved build script or dependency was introduced solely to make an untested installer appear complete. Sources checked 2026-09-25.

## Development dependency edge

The user authorized P6 work independent of missing distribution credentials and target-platform access. The exact `P6-07 → P6-08` edge permits only an **offline, non-cutover update/migration preflight** against signed fixture metadata and isolated SQLite. It does not claim an installed Windows updater, complete installer, UAC behavior, Windows support, or public update readiness. P6-08 must itself keep its signed installed-app upgrade and credential continuity checks blocked until they can run. Process cancellation, permission and data-integrity failures are never covered by this exception. The edge is recorded in `docs/development-dependency-exceptions.json`; the authoritative `Depends on` is unchanged.
