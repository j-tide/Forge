# ADR 0054 · Python ModelProvider and Refiner boundary

Date: 2026-09-24
Status: Accepted for P4-07 Codex-only development scope

## Decision

The Python Host owns a public `ModelProvider`/`ModelSession` interface for
model probing, structured generation, incremental text and optional usage.
It is separate from the Coding `ExecutorAdapter`: a model response can propose
a Task Contract, but cannot change Task state, approve work, execute project
scripts or grant tools. The Refiner receives a provider from the trusted
Plugin Registry instead of constructing Codex directly. The locked bundled
Codex contribution now has version `0.0.2` and registers both independent
interfaces. Existing RunConfig plugin hashes remain immutable; an interrupted
Run pinned to older plugin bytes is not silently resumed with a new package.

Codex ModelProvider uses the existing authorized Codex login and app-server
over owned stdio. Its sessions use an isolated temporary directory, read-only
sandbox and `approvalPolicy: never`; command/file/MCP item activity fails the
generation. The existing Refiner keeps source-bound, schema-validated Drafts,
bounded retries and human approval. `FORGE_MODEL_PROVIDER=disabled` removes
only the model selection path: the Coding Executor, manual Draft and board
remain available. No Renderer credential, arbitrary model endpoint, Claude
authentication or external service fallback is added.

The read-only reference `contracts/plugin-api.ts` describes a generic
`maxOutputTokens` request. The pinned Codex app-server `turn/start` docs do
not document an enforceable per-turn token cap. Python's request therefore
accepts that field as optional and rejects a non-null value for Codex rather
than pretending to enforce it. It enforces a real byte ceiling and timeout.
The pinned app-server's `thread/tokenUsage/updated` event is mapped from its
`last.inputTokens` and `last.outputTokens`; usage remains nullable if an event
is absent or malformed, and no count is estimated from text. The production
request rejects a non-null token budget on Codex until it can be enforced.
This is an explicit safe contract narrowing pending a future provider with
an enforceable token budget, not a change to the reference contract.

Official [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server)
documents `model/list`, structured `turn/start`, streamed
`item/agentMessage/delta` and `thread/tokenUsage/updated`. The available
0.155.1 binary and model list are probed at runtime; the app-server's newer
documentation does not replace that pinned binary's real tests.

## Verification and limits

Pure provider fixtures cover substitution, ambiguity, invalid structured
output retry and unavailable service. Registry tests cover registration,
deactivation and disabling ModelProvider while Executor remains registered.
A real Codex model session produced structured JSON, 10 ordered text deltas
and a valid usage event (20,629 input / 15 output tokens), with no tool event;
the real Python Host produced a Task Draft and
the user still had to approve it into TODO. With ModelProvider disabled,
Electron/Desktop persisted a manual Draft, approved it and restored the TODO
after restart, without executing the fixture's unsafe project script.

No additional npm/PyPI package, model credential, database migration or
network server is introduced. Windows x64, macOS Intel, package signing and
actual installer operation remain unverified. Claude ModelProvider and Claude
Executor remain unavailable under ADR 0052; P4 multi-Executor Gate is open.
