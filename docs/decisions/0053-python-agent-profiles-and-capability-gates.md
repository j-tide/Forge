# ADR 0053 · Python Agent Profiles and capability gates

Date: 2026-09-24
Status: Accepted for P4-06 Codex-only development scope

## Decision

The independent Python Host owns versioned Agent Profile records. Schema v25
adds immutable `agent_profiles` revisions and nullable Profile lock columns to
existing Review jobs. Upgrading v24→v25 is additive; the migration runner's
backup/rollback strategy stays in force. Existing RunConfig snapshots, Review
jobs, Tasks, projects and Run evidence are not rewritten. Custom Profile IDs
use the `profile.` namespace and cannot replace the built-in `profile.developer`
or `profile.reviewer` identities. The public JSON shape follows the reference
`agent-profile.schema.json`; the Host adds bounded policy/context/ID checks.

Role, Executor ID and model ID remain separate fields. A Profile revision
stores its prompt, declared context sources, permission policy and limits.
The revision is immutable and hash-locked to a new RunConfig or Review job.
Runtime start probes the actual registered Executor and refuses absent models,
read-only enforcement, network restriction or interactive approval when the
selected Profile requires them. A saved Profile is not itself a capability or
permission grant. Developer execution still requires a trusted active project,
approved TODO and isolated workspace; Reviewer still requires the exact fixed
snapshot, native read-only mode and `approval=never`. The scheduler rebuilds
the expected Developer request from the frozen Profile hash before admitting
it, so an editable UI field cannot bypass the contract.

Electron Main exposes only fixed, sender-checked `agent.profileCatalog` and
`agent.profileSave` methods with strict schemas. Preload exposes those two
methods, not general Host IPC, filesystem or model credentials. Web without
Desktop has no local Profile write path. The Agents view displays Codex only
from its real current probe and always marks Claude unverified/unselectable
until a real Claude Adapter is implemented and authenticated. The product
still has one active Executor. The `profile.` ID restriction and known policy
names are Host admission rules; the reference schema is not modified.

## Verification and limits

Isolated SQLite tests cover v24→v25, CAS revisions, restart and old-data
preservation. Profile tests cover unavailable Executor, missing model,
read-only/network/approval/structured-output gates. An independent Python
Host stdio process saves and lists a Profile with Claude unavailable. A real
Git/process fixture checks a selected Developer Profile and source isolation.
Current platform is macOS arm64. Live Codex and Electron evidence is recorded
in `docs/implementation-status.md` after completion.

This work does not implement Claude. It does not extend Project Trust into
tool approval, automatically approve operations, or make a Profile alone
sufficient to start a Run. Windows x64, macOS Intel, packaged Python/Codex
and real user database upgrade remain unverified.
