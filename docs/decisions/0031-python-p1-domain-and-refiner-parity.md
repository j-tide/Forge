# ADR 0031 · Python P1 domain and read-only refiner parity

Date: 2026-09-24  
Status: Accepted for MIG-PY-05; production cutover remains MIG-PY-09

## Decision

The independent Python Host now implements the P1 Project, Environment, Conversation, Draft, Approval and Board commands over the fixed versioned stdio protocol. The Task service is the combined atomic approval-to-TODO transaction and read-only Board/Task detail projection; there is no separate Task process. The existing SQLite v1–15 schema, hashes, revisions, idempotency keys and task source references remain unchanged. Project trust is explicit, probing does not execute project scripts, approval inserts a TODO but never starts a Run, and project removal archives Forge metadata without deleting user files.

The optional online refiner invokes the already locked and authenticated Codex app-server from the Python Host. It receives a bounded project summary and user text, never a project path or source tree. Its working directory is an isolated temporary directory, with read-only sandbox and approval policy `never`. Tool, command, file-change and approval events are rejected. Classification and structured proposal output are validated by Pydantic before a Draft is persisted; failures leave an editable draft/error rather than fabricating a Task. A real Host subprocess completed online draft generation, clarification revision, human approval, TODO insertion and SQLite restart recovery.

During MIG-PY-05～08, the Desktop still routes P1 business commands to its historical Node Host, while its Python Host reads the shared database **read-only**. The Python P1 services have been exercised against separate temporary writable databases through a real Host stdio process. No user database was migrated or written by the Python Host. Main and Renderer receive neither a database handle nor arbitrary JSON-RPC access. Production routing and exclusive Python writer ownership are MIG-PY-09 gates.

## Limits and follow-up

- The Python P1 services currently use the private `ForgePersistence` database helper from within the Host process. This keeps SQL away from Main/Renderer and preserves one writer per isolated test, but it is not the final typed repository boundary envisioned by ADR 0030. Before production cutover, move SQL into narrow persistence repositories or otherwise enforce a public persistence API, then retest domain invariants.
- The refiner owns a bounded app-server child and terminates that PID on normal completion/cancellation. A general run-scoped process-tree controller and crash cleanup are MIG-PY-06. The refiner does not run project tools.
- This evidence covers macOS arm64 and the existing Codex login. Windows x64, macOS Intel, bundled Python/Codex binaries, installer and signing remain unverified.
- The offline and online P1 Host scenarios are real, but Desktop user flows still take the Node path until MIG-PY-09. This ADR does not claim the final Python-only product acceptance gate has passed.
