# ADR 0052 · Claude Agent SDK preflight and API-key gate

Date: 2026-09-24<br>
Status: Accepted for offline P4-05 and the narrow development dependency exception; live Executor decision pending

## Context and decision

The canonical P4-05 acceptance requires a **second real Executor** to complete
one coding task through the provider-neutral Forge contract. The official
Claude Agent SDK for Python is the intended integration candidate. Its upstream
documentation directs third-party products to API-key authentication rather
than offering claude.ai subscription login or rate limits. The user confirmed
that no Claude API key is currently available and asked to omit that live
acceptance for now. No subscription credential will be borrowed for Forge.

`claude-agent-sdk==0.2.159` is pinned in `python/uv.lock` and the direct
dependency list. An offline probe imports its installed distribution and
launches only its bundled `claude --version` binary under Forge's owned
`ProcessController`; its environment allowlist removes both API-key and OAuth
variables. It records only versions, platform, a boolean key-presence flag,
and `liveVerified=false`. This proves the wheel and CLI can load on the
current macOS arm64 machine. It proves nothing about authentication, network,
models, events, permissions, approval, cancel, resume, sandbox or a delivered
task. The SDK's transitive MCP/uvicorn packages do not create a local Forge
HTTP server; the Desktop ↔ Python Host protocol stays JSON-RPC over stdio.

The Python Host does **not** register or advertise a Claude Executor yet.
Bundled Codex remains the sole active production Executor; no Core or UI
capability claim is changed. When an API key is explicitly available, the
Claude adapter must use the same `ExecutorAdapter`/`ExecutorEvent` boundary,
an isolated Git fixture and an owned process tree. The official SDK spawns its
own CLI subprocess, so a Forge-owned worker process is the candidate boundary
for cancellation and cleanup; that choice requires actual live verification
before activation. No long-running Session, new secret store or Renderer API is
introduced here.

## Evidence and resume condition

`pnpm probe:claude-offline` returned SDK `0.2.159`, bundled Claude Code CLI
`2.1.281`, `darwin/arm64`, `apiKeyConfigured=false`, `liveVerified=false`.
The preflight unit test confirms credential variables are excluded from the
owned child environment, no secret appears in its report, and its process is
gone. The locked Python license inventory includes the new transitive graph;
the SDK code's MIT license and Anthropic commercial service terms are recorded
separately. No online Claude call was made.

P4-05 stays BLOCKED. T041–T045 remain specified or deferred, never PASSED on
this evidence. Resume only after the user configures an authorized Anthropic
API key outside the repository and explicitly authorizes a bounded paid live
fixture. At that time, implement and verify the actual adapter, event mapping,
workspace, cancel/approval/resume/auth failure, and Codex↔Claude replacement
before marking P4-05 DONE. Windows, macOS Intel and packaged
SDK binary behavior remain UNVERIFIED.

## 2026-09-24 authorized development exception

The user explicitly permits P4-06～P4-09 to proceed **only for work that does
not depend on a real Claude run**. This is a development scheduling exception,
not a change to the canonical `P4-05 → P4-06` dependency, P4-05 BLOCKED status,
or the two-real-Executor acceptance. The provider-neutral Executor API and
current Codex path already exist; each downstream task must still verify its
own capability and approval gates. Claude remains unavailable and unselectable
without authorized API credentials and real online verification. No Anthropic
model call or auto approval is authorized. P4-05 has no registered adapter:
only the SDK wheel/CLI version probe and local preflight test exist.

After applicable P4-06～P4-09 work, P4-10 must execute its Codex and
Executor-independent checks but retain its second-real-Executor same-TODO
requirement as `DEFERRED_VERIFICATION`. P4 Phase Gate and full multi-Executor
release remain unpassed. The user also permits P5 tasks independent of the
second Executor after those applicable P4 checks. The only authorized task
edges are recorded in `docs/development-dependency-exceptions.json` and checked
by `pnpm validate:task-map`. This exception does not generalize to other
external providers, costs, credentials, safety gates, or blocked dependencies.
