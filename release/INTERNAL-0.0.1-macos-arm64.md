# Forge 0.0.1 internal QA notes · macOS arm64

**INTERNAL / ADHOC / UNNOTARIZED — not a public release or v1.0 acceptance.**

Artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.dmg`
SHA-256: `a3bc0a9816dbc03a44b249305a708e8d51f5ceaf124cd820d3c5acba1e3187d9`

This exact installed app completed one disposable project through trust, message, manual Draft/revision, human approval to TODO, explicit Codex Start, isolated file changes, Verify, read-only Review, per-criterion evidence, Owner final acceptance, Done and restart readback. A separate long command was cancelled without later file writes. Done did not merge, push or deploy. See [internal QA evidence](../docs/demo/p6-internal-macos-package.md) and [user guide](../docs/user-guide/internal-macos-arm64.md).

Bundled: Electron/Vue UI, CPython Host, production Python dependencies, SQLite and builtin plugin resources. External: Git, authenticated Codex CLI and any authorized network/proxy setup. Finder CLI discovery and a fresh account are unverified. The package does not contain the later P6-07 Windows staging or P6-08 offline update preflight code.

Public release blockers: Developer ID/signing/notarization and T111–T113; Windows/macOS Intel; signed installed-app upgrade/rollback and credential continuity; Claude as a second real Executor; remaining P6-09 security/evaluation cases. No upload, public publication, certificate creation or notarization was performed. P6-06 through P6-10 retain their formal BLOCKED status as applicable, and the full P6 Phase Gate is not met.
