# P7-10 private remote pilot gate · current status BLOCKED

This is a checkable pilot procedure, not a claim that a phone can connect today. Normal Forge Desktop starts no HTTP listener. Settings can explicitly start the owned Python Host's `127.0.0.1` authenticated preview after native confirmation; the same Desktop/Host pairing path has real isolated Electron and browser HTTP evidence. The separate static `pnpm remote:loopback:static` command still has no Host API. Do not forward either endpoint to a phone or the public Internet as a substitute for the missing private HTTPS adapter.

## What currently has real evidence

- A one-time nonce is claimed once; local Host approval binds a device to explicit Projects and operation scopes. Sessions are hashed at rest, rotated, CSRF-bound and revocable.
- Read-only Project/Board/Task queries and bounded Project-scoped SSE use the Python Host's current SQLite state. Old cursors require a snapshot. Expired, narrowed or revoked sessions stop their stream.
- A device explicitly granted `task:draft` may submit the current empty-attachment `conversations.send`; a device explicitly granted `task:approve` may approve one fresh Task draft through the exact public `tasks.approve` command. Both use Host-owned Project/operation grants, version checks and durable idempotent receipts. Approval creates TODO and never auto-starts a Run. The message has no fabricated model response. Remote rejection, Run, final acceptance and other unmapped writes remain denied.
- A disposable Host/gateway process was killed by its exact test PID: its stream ended and its port refused connections. Restart recovered the authorized Project/Board from SQLite. This does not prove mobile offline rendering.

## Gate before any real phone control

1. Provide an explicitly authorized private network and a trusted HTTPS identity for one stable Host name. Keep the Python gateway bound to loopback behind that boundary. No bare public port, automatic tunnel, certificate bypass or global system security change is allowed.
2. Validate the actual reverse-proxy Host/Origin/Sec-Fetch contract, Secure/HttpOnly/SameSite cookie behavior and TLS certificate on the real phone browser. Reject every other origin and a wrong Project/device.
3. Run one real pairing challenge from that phone, require local confirmation of exact Project and operation scopes, then verify replay, expiry, brute-force limit, logout and device revoke from Desktop.
4. Before enabling other approval or Run actions, finish their lossless public-command mappings and Host-owned basis checks. The approve-only `tasks.approve` mapping now has loopback evidence for one fresh, atomic TODO and a second device's stale 409; this is not a physical-phone concurrent approve/reject test. The local reject method remains remote-forbidden by the canonical command registry. Never expose it by renaming or invent missing fields.
5. Disconnect/reconnect and expire the phone session. The phone must show offline and the last confirmed update, reload a real snapshot before SSE continuation, never queue/replay an approval or Start, and never display a Task as Done from an unconfirmed response. Repeat after sleep and an abrupt Host process exit.
6. Compare Desktop and phone state against the same Python Host/SQLite Project. Record platform/browser/network/certificate details and T096–T100 outcomes. Until every required item has real evidence, P7-10 and the P7 Phase Gate remain **BLOCKED**.

The source of the remaining conditions is tracked in `docs/pdf-feature-operation-map.md`. A real phone/private-network pilot needs the user's device and network action; the current loopback fixture and mobile layout development do not replace it.
