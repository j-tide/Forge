# ADR 0033 · Python Codex app-server Executor

Status: ACCEPTED for MIG-PY-07 on 2026-09-24, within the user-approved Python Core migration.

## Decision

The Python Host owns a Codex `app-server --stdio` child through `ProcessController`. Each Run has one bounded JSON-RPC connection, request IDs, response timeouts, an allowlisted environment, a 1 MiB frame limit and a verified process-group shutdown. Neither Electron Main nor Vue opens the provider connection. The adapter emits only the provider-neutral Pydantic `ExecutorEvent` union; the Host scheduler validates run identity, contiguous sequence and a single terminal event before persistence. Provider errors are mapped to stable Forge codes without forwarding raw diagnostics.

The locked protocol behavior is verified against **codex-cli 0.155.1**. `thread/start` uses `sandbox: "read-only" | "workspace-write"`, while `turn/start` uses `sandboxPolicy.type: "readOnly" | "workspaceWrite"`. The Python adapter checks the CLI version exactly, current login and live `model/list`. Version- and platform-matched Python live evidence, rather than historical Node adapter evidence, controls advertised capability booleans. The current binary comes from the developer's existing Codex installation on `PATH`; no new account, API key, global install or Python dependency is introduced. Packaged binary discovery remains a MIG-PY-09 risk.

The one-node Host development entry continues to pass `approval: never`; it does not silently grant sensitive permissions. The adapter can surface an app-server approval request with ID, summary, capability and expiry. Only a test caller explicitly responds `approve` or `reject`; absent a response, it declines after 120 seconds. The Host has no arbitrary Renderer approval tunnel. A later approved product flow must expose a fixed, audited decision command before enabling on-request approvals in the UI. Unknown interactive requests fail closed.

The authoritative Task Contract example names `standard@1`, while the historical Node development entry accepted `standard`. Python accepts both existing references, freezes the actual contract reference in RunConfig and otherwise leaves the workflow behavior unchanged. This is a backward-compatible mapping, not a change to the read-only specification.

## Real macOS arm64 evidence

`pnpm test:python-codex-live` ran ten independent checks with the existing authenticated 0.155.1 CLI: missing authentication, invalid model, structured output, a real code-edit task, command/file/message/usage streaming, long-command cancellation with no later file, approval accept and reject, continuation across connections and across Python processes, and the Python Host P1 Trust→manual Draft→human Approval→TODO→Run→Handoff path. The coding fixture modified `math.js` and `test.js` in a private Git worktree, passed `node test.js`, left its source working tree unchanged, and produced a real immutable snapshot and Handoff whose acceptance criterion remained `unverified`. Python-only unit tests reject success-looking text without required structured output. `gpt-6-luna` was selected from the live model list, not assumed globally available.

The Python adapter's version-matched evidence declares streaming, resume, interrupt, approval, structured events/output, worktree control, session persistence, model selection, usage reporting and read-only approval enforcement. MCP tool-call events and network policy enforcement remain **false** because no Python live test established them. `available=true` means local CLI/login/model catalog are usable; upstream service availability can still change.

## Limits and follow-up

- T041 dual real adapters remains `DEFERRED_VERIFICATION` to P4-10. T042's Profile-save path remains P4-06; T045's in-flight authentication expiry remains P4-09. Direct adapter and Python Host evidence must not be marked as full canonical Test IDs where those later capabilities are required.
- The existing Desktop still routes P1/P2 business commands to the temporary Node Host. MIG-PY-09 must switch to the sole Python writer and rerun Desktop product acceptance; this ADR does not resume P2-10 or start P3.
- Windows x64, macOS Intel, packaged executable lookup, signing, network sandboxing and recovery of provider children after sudden Host death are unverified. Historical process IDs remain diagnostic evidence only; they are never automatically killed on restart.
