# Forge Python plugin authoring boundary (development preview)

Forge currently loads only the locked, trusted `forge.executor.codex@0.0.2`
bundle shipped with the Python Host. This is **not** an installer for arbitrary
third-party plugins. The public `PluginContext` and manifest contract are
available for controlled adapter development; production admission of a new
package needs an explicit trusted bundle/lock update and platform testing.

## Manifest and package

Use the closed `forge_spec_v1.0/contracts/plugin-manifest.schema.json` reference
as the source for `id`, SemVer `version`, `forgeApiRange`, `execution`,
`contributes`, `requires`, `requestedPermissions`, `configSchema` and
`supportedPlatforms`. The current built-in Codex manifest is at
`python/src/forge/builtin_plugins/codex.manifest.json`. API `1.0.0` accepts
`^1.0.0`; only actually tested platforms should be declared. A manifest
claim does not make a capability available or authorize an action.

Discovery reads the fixed bundled allowlist, validates the manifest and
checks exact bytes against `plugins.lock.json` before importing entry code.
Entry and config paths must stay within the bundle. Unsupported API/platform,
unknown permission, duplicate contribution, changed file or missing service
fails before activation. The current lock is a build-integrity check, not
third-party package signing or a malicious-code sandbox.

## Lifecycle and dependencies

An entry exports `create_plugin()`, returning a `ForgePlugin` with asynchronous
`activate(context)` and `dispose()`. Declare required services in the
manifest and access only those via `context.require_service()`. Register an
`ExecutorAdapter`, `ModelProvider`, or Tool with the corresponding public
method. Keep every listener or owned process in a `Disposable` tracked through
the context. Activation stages contributions; they become visible only when
every declared contribution is valid. On failure, Forge disposes the plugin
and tracked resources in reverse order. An active Run locks the plugin's exact
version and content hash; deactivation drains its Run lease before removal.

ModelProvider is separate from Coding Executor. Core/Host owns Task and Run
state transitions; an adapter only returns standard events and results. The
Renderer never imports plugin code. Current production Host verification is
the owned `ProjectCommandVerifier`; declaring `verifiers` in a manifest does
not yet register or replace that service. This remains a P4-10 gap, and no
plugin should claim production verifier replacement today.

Tool registration is not permission to invoke. `ToolRegistry` requires a
one-shot Core/Policy grant bound to tool, Project, Run, Attempt, permission and
expiry. Input/output have closed JSON Schemas, size and time bounds. Tool
output remains untrusted and cannot approve an action. Arbitrary external MCP
servers are not connected in v1.

## Diagnostics and testing

Use `pnpm validate:contracts`, `pnpm py:check`, `pnpm lint`, `pnpm typecheck`,
`pnpm test`, `pnpm build` and `pnpm smoke:desktop`. Plugin tests in
`python/tests/test_plugin_manifest.py`, `test_plugin_scope.py`,
`test_plugins.py`, `test_tool_registry.py` and
`test_plugin_fault_isolation.py` cover pre-import rejection, ten lifecycle
cycles, partial activation rollback, locked Run draining, tool permissions,
safe fault reporting and Host Project/Board availability after activation
failure. A fixture is contract evidence, never a substitute for a second
real Executor completing the same approved TODO.

The Desktop plugin page reads only `plugin.inspectBundled`. A failure record
contains stable code, plugin ID, phase, UTC time and optional Run ID; it does
not expose raw exception text or credentials. No arbitrary plugin control,
secret entry, shell command or general Host method is available to Renderer.

## Current release limit

P4-05 Claude remains BLOCKED without an authorized Anthropic API Key and paid
test budget. T041's two distinct real Executors and full P4/multi-Executor
release gate remain open. Windows x64, macOS Intel, packaged Desktop and
malicious third-party plugin isolation are unverified. See
`docs/decisions/0052-claude-sdk-api-key-gate.md` and
`docs/deferred-verification.json`.
