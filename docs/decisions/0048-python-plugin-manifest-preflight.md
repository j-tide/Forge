# ADR 0048 · Python plugin manifest preflight and API ranges

Date: 2026-09-24<br>
Status: Accepted for canonical P4-01

## Decision

Python Host keeps the P4 plugin trust boundary from ADR 0034: v1 discovers only a
fixed list of plugins bundled with Forge. `forge.plugin_manifest.inspect_manifest`
is a pure preflight that returns a stable list of issue code, field path and safe
message. It reads a bounded manifest and config schema, validates the
authoritative public manifest shape with Pydantic, checks an exact allowlisted
entry, real contained files without symlinks, API range, platform, permissions,
required services, contribution kinds, duplicate ID and supplied config. It
does not import or execute the entry, create plugin services, or mutate the
Registry. Discovery validates static fields; activation repeats full preflight
against current grants/services before its first `import_module`.

The runtime API is `1.0.0`, separate from product or plugin versions. The
currently supported `forgeApiRange` syntax is an exact SemVer or a caret range
with bounded numeric components. Unknown range syntax fails closed rather
than being treated as compatible. The bundled Codex manifest remains `0.0.1`
with `^1.0.0`; its `darwin-arm64` platform declaration remains an explicit
scope, not a Windows/Intel compatibility claim.

For P4-01, the config schema parser accepts only a closed, local object schema
with `additionalProperties: false`, optional simple scalar properties and
required keys. References, nested schemas, arbitrary keywords and open objects
are rejected before entry execution. The shipped Codex schema is the empty
closed object, so this restriction does not change current behavior. P4-04 may
expand the validated grammar when it introduces generated configuration forms;
it must not silently accept unsupported JSON Schema vocabulary.

## Scope and acceptance

T039 is exercised with malformed ID, duplicate ID, incompatible API, wrong
platform, unknown permission, bad source/config and actual Registry activation
under an import sentinel. The rejected plugin publishes no Executor and does
not run entry code. T036/T037 require P4-02's disposable resource scope,
T038 P4-03's run-bound plugin lock/draining, and T040 P4-09's fault isolation.
Their original P4-01 references remain in the read-only task plan and are
tracked as `DEFERRED_VERIFICATION`, never as passed.

This preflight is not a sandbox for trusted Python plugin code. It does not
open arbitrary third-party installation, external-process plugins, TCP, Shell,
Renderer APIs or DB access. There are no new dependencies or SQLite changes.
