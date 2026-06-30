# ADR 0066 · Memory Center UI and confirmation boundary

Status: Accepted for P5-10 development scope, macOS arm64, 2026-09-25.

The shared Vue Knowledge page is the Memory Center. It lists only real Host records, lets a user inspect a saved source chunk, propose an environment-scoped candidate with its exact source reference/hash, edit a candidate with revision CAS and expiry, search current validated memory, confirm/revoke/deprecate via an explicit reasoned dialog, and see a revoked tombstone. A same-subject replacement is shown before confirmation and names the old memory explicitly. No button runs project scripts or a model. Ordinary Web cannot access the Desktop bridge.

Desktop Preload exposes one fixed `invokeMemory` operation; Electron Main checks sender and a closed Zod command union, and the Python Host validates each JSON-RPC payload with strict Pydantic models. The client validates returned records. There is no generic Renderer→Host channel, file API or SQL API. The Host remains the only database writer and authority for candidate promotion, source freshness, index cleanup and audit events.

Memory is guidance, not an acceptance criterion. The UI explains that revocation removes current search/index text but preserves a decision tombstone and never deletes the source repository. Stage Context previews exclude revoked memory, while frozen historical Run inputs are not rewritten. A historical Run using a memory citation cannot yet be displayed because P5-11 owns actual Workflow/Stage Context consumption and source trace persistence. The `T075` historical-Run display branch remains `DEFERRED_VERIFICATION` to P5-11; this task's real UI revoke/index/tombstone path passed. No second Executor, Claude call or P4 release gate claim is implied.
