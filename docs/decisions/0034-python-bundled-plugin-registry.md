# ADR 0034 · Python bundled plugin registry

Status: ACCEPTED for MIG-PY-08 on 2026-09-24, within the user-approved Python Core migration.

## Decision

The Python Host discovers a fixed allowlist of **bundled trusted** plugins. Discovery reads and validates a Pydantic manifest matching the authoritative `plugin-manifest.schema.json` fields; it does not import the entry. Activation checks `forgeApiRange`, platform declaration, requested permission grants, required Host service IDs and contribution IDs before importing the allowlisted module name. Manifest paths never become dynamic Python import paths. Only `forge.executor.codex` is bundled now; third-party process plugins, marketplace installation, hot reload and arbitrary Renderer plugin commands remain outside MIG-PY-08.

The first plugin declares `executor.codex`, `process.v1`, and the explicit `workspace.read`, `workspace.write`, `process.spawn` grants. Its module receives the Host-owned `ProcessController` via `PluginContext.require_service`, creates the Codex adapter and registers it through `PluginContext.register_executor`. Core scheduler, Run/Task services and the production Host entry use the provider-neutral `ExecutorAdapter` protocol and `PluginRegistry.resolve_executor`; they do not import Codex implementation types. This is a trusted same-process plugin, not a security sandbox. The scheduler still validates the exact worktree lease and path before any execution.

Registrations remain staged until activation succeeds. Missing service, unknown or denied permission, API/platform incompatibility, duplicate ID or undeclared contribution fail closed. Activation failure disposes the plugin and publishes no contribution; deactivation removes the contribution before disposal. Host shutdown first cancels active Runs, then disposes plugins and owned processes. The plugin's runtime capability probe is the real app-server probe from ADR 0033; the manifest's `supportedPlatforms` is only a declaration. It currently lists macOS arm64 alone because that is the only platform with Python live Executor evidence.

## Evidence

`pnpm py:check` passes 37 tests, Ruff and strict mypy over 28 source files. Unit cases mutate manifests to reject traversal, unknown fields, duplicate/missing contributions, denied/unknown permissions, incompatible API and absent services; they verify activation, lookup, rollback and idempotent disposal. A new wheel contains the manifest, config schema and Python plugin module. After Registry integration, a real independent Python Host again completed trusted fixture Project→human-approved TODO→Codex Run→immutable Handoff with passing fixture tests and unchanged source working tree. `pnpm test` and dual-Host `pnpm smoke:desktop` passed on macOS arm64. No new dependency, credential, user DB migration or Renderer privilege was added.

## Limits

This is the migration's minimum plugin boundary, not the full P4 Plugin Host. It offers no untrusted third-party execution, project/run scoped grants, service dependency DAG across multiple plugins, plugin management UI or network installation. A second real Executor and replaceability acceptance remain P4. Windows x64, macOS Intel, installed package and signed distribution are unverified. MIG-PY-09 must retire the Node business path and perform Python-only Desktop acceptance before P2-10 resumes.
