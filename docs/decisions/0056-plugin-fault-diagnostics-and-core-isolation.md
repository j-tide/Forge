# ADR 0056 · Plugin fault diagnostics and Core isolation

Date: 2026-09-24
Status: Accepted for P4-09 trusted-bundle scope

## Decision

The Python Host's trusted bundled Plugin Registry records a bounded, sanitized
fault history for activation, Run delivery and disposal. Each record has the
plugin ID, phase, stable error code, optional affected Run ID and UTC time.
Raw exception messages, arguments, environment values and stack traces never
cross the Desktop bridge. The existing fixed `plugin.inspectBundled` read-only
method returns these faults alongside manifest/lock diagnostics; the Vue plugin
view displays them without adding a generic Renderer-to-Host command channel.

Activation continues to stage registrations and reverse-dispose them on
failure. It does not publish a half-activated Executor. A disposal error
still revokes contribution handles and cleans the resource scope. Executor
execution exceptions and failed/interrupted Runs identify the owning plugin
and affected Run; a later Core snapshot failure is not misattributed to the
plugin. These faults do not change unrelated Projects or Board reads. The Host logs a stable code and
keeps Project/Core access available when attachment fails. Missing Claude
credentials remain an unavailable Executor state, not a successful plugin
activation or a reason to replace it with Codex under the Claude identity.

This is **fault containment for trusted bundled code**, not an OS isolation
sandbox for malicious third-party Python code. No arbitrary plugin package,
external MCP process, secret store or Renderer write bridge is enabled.
Run outcome authority remains the existing Run/Task state machine; a fault
diagnostic is never evidence that a Run succeeded or an Approval was granted.

## Evidence and limits

T036/T037/T038/T039 retain their existing real resource, rollback, lease and
pre-import tests. P4-09 adds T040 activation-error injection against a real
Host storage/Project read path, disposal failure with safe diagnostics,
unexpected Run delivery impact and a Vue diagnostic rendering test. Actual
third-party plugin process crash and packaged Windows/macOS Intel behavior
remain unverified. The P4-05 second-Executor acceptance and full P4 Gate
remain blocked by the absent authorized Anthropic credential.
