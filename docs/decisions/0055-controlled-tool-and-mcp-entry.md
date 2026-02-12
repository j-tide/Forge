# ADR 0055 · Controlled Tool and MCP entry

Date: 2026-09-24
Status: Accepted for P4-08 local contract scope

## Decision

The Python Host owns a `ToolRegistry`. A trusted plugin can declare a tool
through the public PluginContext; registration is staged during activation
and published only after manifest contribution and requested-permission
checks. Duplicate IDs or invalid closed JSON Schemas reject activation and
release staged resources. The current bundled Codex plugin contributes **no**
Forge tools. There is no Renderer tool channel or arbitrary external MCP
server connection.

Tool execution requires a separate Core-issued `ToolPolicyDecision` with
exact tool/project/Run/Attempt/permission scope and expiry. The Registry
mints a one-attempt grant ID and rechecks scope on invoke. Input and output
are bounded, validated against Draft 2020-12 JSON Schema, and remote `$ref`
or open object bags are rejected. A result is tagged `trust=untrusted` and
cannot create an Approval. Timeouts have one attempt, no automatic retry;
unrelated tools remain callable. Audits log stable IDs and permission/code,
never raw tool input, credentials or model text.

`McpSession`/`McpToolProxy` define a fixed tool-call name and text-only result
contract for a local fixture. They do not launch an MCP server or authorize a
connection. An actual external MCP adapter will require explicit service
authorization, process/network ownership, cancellation and credential scope
in a later task. Tool registration is not the grant to execute it.

Python `jsonschema==4.26.0` is now an exact direct dependency; it was already
present transitively and is [MIT, Python 3.10+](https://pypi.org/project/jsonschema/).
Strict mypy uses exact development-only
`types-jsonschema==4.26.0.20260518`
([Apache-2.0, Python 3.10+](https://pypi.org/project/types-jsonschema/)).
Both are fixed in `python/uv.lock`, `versions.lock.json` and the license
inventory. The package brings no native module or install script.

## Verification and limits

T076–T080 local tests reject wrong types and unknown fields before the handler,
preserve tool output as untrusted despite a forged approval sentence, time
out a hanging MCP fixture once while a second tool still responds, reject and
audit foreign Run scope/network permission, and reject duplicate tool IDs
with resource release. No live external MCP integration or third-party
plugin isolation is claimed. macOS arm64 is current verification; Windows
x64, macOS Intel and packaged Desktop remain unverified.
