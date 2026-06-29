# ADR 0059 · Linear Workflow drafts and publish gate

Date: 2026-09-24
Status: Accepted for P5-03 development scope

## Decision

The Desktop Web UI edits the production Workflow DSL as an ordered list. It
starts from a bundled template, supports adding/removing/reordering steps,
selecting actual saved Agent Profiles and a finite failure/rework target, and
shows the Python compiler's field-specific diagnostics. It cannot delete the
terminal human acceptance gate. Ordinary Web has no local Workflow bridge.
The reference HTML is never loaded.

Python Host is the sole owner of drafts and publications. Additive SQLite
schema 26 stores a mutable draft with revision CAS and its content hash.
Published definitions are inserted as immutable rows in
`workflow_revisions`, matching the authoritative SQL contract's main
identifier, revision, name, definition, hash, state and timestamp fields.
An existing project/task/run is not rewritten. Drafts may retain semantic
errors so the user can repair them; the closed Pydantic model still rejects
unknown fields and malformed payloads.

Publishing always recompiles against a fresh snapshot of installed Profile,
Executor and Verifier capabilities. Missing bindings, model, enforced
read-only, unsupported role or command runtime, invalid structure and
unbounded routes prevent publication. Saving or publishing never starts a
Run, never approves an operation and does not grant a plugin permission.
Electron Preload exposes only a fixed `invokeWorkflow` method; Main
validates a discriminated command schema and maps only six named operations
to versioned JSON-RPC stdio. Renderer never receives Node or SQLite access.

P5-05 owns formal old-Run Workflow version freezing and published-version
diff presentation. P5-11 owns custom Workflow execution and runtime attempt
limits. P4-05/P4-10 and the full P4 Gate remain blocked; this work is within
the exact user-authorized single-Executor development exception.

## Evidence and limits

macOS arm64 real Electron→Python Host smoke created a template-based draft
in isolated temporary SQLite, observed missing-profile publication refusal,
bound real saved Codex Developer/Reviewer Profiles, then published revision 2
without a model generation call. A deliberately cyclic draft persisted and
was refused at publication. Restart, revision CAS, immutable published rows,
unknown command/payload rejection, Web unavailability and UI component
behavior have tests. The screenshot is
`output/playwright/p5-03-workflow-desktop.png` from the actual Desktop.
Windows x64, macOS Intel and packaged installation remain unverified.
