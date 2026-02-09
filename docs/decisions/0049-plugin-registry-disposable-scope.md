# ADR 0049 · Plugin Registry dependency and disposable scope

Date: 2026-09-24<br>
Status: Accepted for canonical P4-02

## Decision

The Python Host remains the only plugin owner. `PluginRegistry` registers
Host-owned services under unique IDs and records explicit dependencies between
them. It resolves a dependency-first topological order before importing any
allowlisted plugin entry; missing nodes and cycles fail closed. Core service
IDs cannot be overwritten. The current bundled Codex plugin requires only
`process.v1`; no third-party discovery, network installation or dynamic import
path was added.

Each activation receives a fresh `DisposableScope`. Context registration
returns an idempotent `Disposable` and only stages its contribution until
activation succeeds. A plugin may track an owned listener, process or other
disposable; the scope releases resources in exact reverse registration order.
Partial activation failure invokes plugin cleanup and the scope, publishing no
Executor. Deactivation withdraws published contributions before cleanup, then
disposes plugin and scope; repeated disposal is safe. All resources are
attempted even if one disposer fails, and the failure is reported. Host-owned
services remain intact after a failed plugin activation.

The public Python `PluginContext.register_executor` now returns the scoped
Disposable specified by the authoritative `plugin-api.ts`. The existing Codex
plugin may ignore that handle because Registry owns the scope. An optional
Disposable returned by `activate` is also scope-owned. This change does not
permit a plugin to transition Task state, read SQL or gain ungranted services.

## Evidence and limits

T036 has ten real activate/deactivate cycles with live tracked resources and
ten separately owned Python child processes, each waited to exit before the
next cycle. T037 injects failure after partial registration and verifies
reverse cleanup, no published Executor and an intact Host service. Topological
ordering, duplicates, missing services and cycles are tested, including a
cycle refusing activation before entry import. The installed Codex plugin and
Electron/Python Host smoke remain regression checks.

T038's live Run version lock/draining belongs to P4-03. T040's plugin process
crash and affected Task/UI diagnostics belong to P4-09. Both Test IDs and
P4-02 references remain `DEFERRED_VERIFICATION`, not PASSED. This scope is
resource management for trusted bundled plugins, not an OS sandbox against
malicious same-process Python code. Windows x64, macOS Intel and packaged
runtime behavior remain unverified.
