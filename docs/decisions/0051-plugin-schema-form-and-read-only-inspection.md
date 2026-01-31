# ADR 0051 · Plugin schema form and read-only inspection

Date: 2026-09-24  
Status: Accepted for canonical P4-04

## Decision

The Python Host remains the only source for installed plugin state and bundled
configuration Schema. A fixed, parameterless `plugin.inspectBundled` JSON-RPC
method inspects only `forge.executor.codex`; Electron Main exposes one matching
sender-checked IPC method, and Preload exposes one fixed read-only function.
There is no arbitrary Renderer-to-Host command or filesystem access. The Host
preflight checks the bundled lock, platform, API range, permissions and service
references before returning the closed Schema. A bad bundle yields safe issue
codes and no form.

The `@forge/ui` schema form accepts only the bounded scalar object grammar
supported by Python preflight. It emits only declared keys. The only new Schema
annotations are bounded `title`, `description`, and `format: forge-credential-ref`;
unknown vocabulary still fails closed. A credential field is masked and accepts
only an opaque `credential:<id>` reference. Raw key-shaped input fails validation
and is never sent to Host. No credential service or plugin config persistence is
implied. The bundled Codex plugin genuinely declares an empty config object,
so the production page shows that fact and offers no fake Save action. A
synthetic Schema exercises generation and validation in tests without claiming
that the bundled plugin has those settings.

The glass tokens and existing focus/reduced-motion primitives are reused.
T106–T110 remain the authoritative M22 acceptance IDs. P4-04 independently
tests the actual form boundary and actual Desktop plugin state; the broader
Drawer/Dialog, dark-theme contrast, Windows DPI, long card/path and global
motion cases are mapped to the first owning P6 task as
`DEFERRED_VERIFICATION`, never marked passed. Windows/Intel and packaged
application behavior remain unverified.

## Evidence and scope

The real Electron smoke calls the fixed bridge, receives the Python Host's
bundled Codex version/lock-checked Schema, opens the Vue plugin page and checks
there are no invented fields. It also checks Renderer isolation, Host degraded,
crashed and owned-process exit paths. Unit tests reject unknown values,
unsupported field types and raw secret input. An independent Python Host stdio
test rejects plugin inspection parameters. No dependency, SQLite migration,
remote adapter, third-party install or privileged credential capability was
added.
