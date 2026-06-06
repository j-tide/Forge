# ADR 0021: Scheduled Executor request and upstream event gate

Status: Accepted for P2-03 · 2026-09-24

## Decision

- Preserve the existing P0-05 spike request so the read-only Refiner and diagnostic tests remain compatible. Add a strict `scheduledExecutorRunRequestSchema` that requires Attempt ID, lease epoch/ID, approved Contract revision, ContextBundle ID, Profile revision and output schema ID. The existing `executorRunRequestSchema` can parse this optional attempt block for the Codex adapter; future production Scheduler calls must use the scheduled schema. No secret bytes or arbitrary shell command grant enters the public request.
- `ExecutorEventGate` validates every public event's schema, run ID, exact next sequence, first `run.started` and terminal state. Host Registry validates before publishing to business listeners. On malformed output it emits a standardized `EXECUTOR_PROTOCOL_ERROR` failure, requests provider cancellation and stops forwarding the provider stream. A diagnostic listener cannot interrupt the adapter.
- The Codex stdio connection now rejects malformed/oversized JSON-RPC envelopes and invalid responses; known message-delta, token-usage and approval notifications are schema checked before normalization. Unknown raw provider objects never become Forge UI/Core events. Codex app-server remains the primary first adapter under ADR 0004; the older blueprint's SDK-first preference remains superseded by that measured decision.

## Limits and deferred acceptance

P2-03 defines the public boundary and validates fixture upstream output; it does not start a production Attempt. P2-04 must pass a scheduled request into the Codex write adapter and re-probe cancellation/resume. P2-05 must make protocol failures terminal in the Run state machine, reject false success and handle authentication failure. P4-06 owns Profile/model compatibility selection and P4-10 owns the two-real-adapter comparison. T041–T045 retain their original Test IDs as `DEFERRED_VERIFICATION`; no fixture is reported as two-provider or full Run acceptance.

The Host protocol and Renderer bridge are unchanged. No dependency, credential path, model call or execution authority was added. Windows x64, macOS Intel and packaged app execution are unverified.
