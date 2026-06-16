# ADR 0080 — Project-scoped remote SSE invalidation

Status: Accepted on 2026-09-25. P7-06 protocol scope DONE on macOS arm64;
private HTTPS and phone acceptance remain separate.

## 2026-09-26 reconnect deadline and notification isolation

The client now aborts an SSE connection that has not started within 10 seconds,
or a connected stream that receives no bytes for 15 seconds. The Host sends a
five-second heartbeat, so the latter detects a stalled connection while keeping
normal idle streams alive. Each attempt owns its abort controller and deadline;
stopping or replacing a stream invalidates its generation so a late response
cannot report connected or advance the cursor. Timed-out attempts report
`REMOTE_STREAM_TIMEOUT` and use the existing bounded retry delay. Tests cover
unanswered connections, missing heartbeats and late responses after stop.

The in-app notification list remains optional metadata. Its read failure no
longer holds back the authoritative Task/Approval snapshot or event cursor.
Closing notifications, switching Projects and losing the session invalidate
in-flight notification reads. A current 401/403 clears the apparent connected
state; a transient notification error is shown without inventing a new Task
result. This is client behavior and does not grant new remote operations.

## 2026-09-25 client frame hardening

The mobile stream reader now accepts both LF and CRLF SSE frame separators, including delimiters split across network reads. It enforces the 8192-byte frame bound on UTF-8 bytes, rejects malformed UTF-8 and incomplete nonempty frames, and advances its cursor only after the caller confirms a current Host snapshot. Client transport tests exercise CRLF fragmentation and an oversized multibyte frame. This is a local protocol regression check; private-network proxies and physical phones remain unverified.

## Context

P7-06 needs authenticated, reconnectable events without exposing local Host
objects or treating a missed event as a successful remote action. P7-05's
positive write path is still blocked by operation grants and contract mapping.
The existing SQLite `board_events` table records approved TODO and reorder
changes, but does not record Run, Review, Verify or approval lifecycle changes.

## Decision

Additive SQLite schema 33 creates a project-scoped `remote_event_log`. Triggers
append minimal invalidations in the same transaction as committed board, Run,
Run observation, approval, Review, Verify, final acceptance, conversation and
Draft changes. The log contains IDs/kinds/timestamps, never message text,
provider payloads or secrets. It starts empty on upgrade from schema 32: first
connection requires a snapshot rather than inventing earlier events.

The optional loopback gateway exposes `GET /v1/events` for one Project. The
Python Host authenticates the current session and checks its persisted Project
grant on every poll. The durable `p:<seq>` cursor is included in the remote
board snapshot. A client reloads the authoritative projection after a change.
On first connection, future cursor or more than 256 missed changes, the server
emits `resync_required` without an SSE ID. The client reloads a snapshot before
reconnecting with its cursor. A repeated cursor returns no duplicate change.

The gateway has a 30-second stream lifetime, socket write timeout and eight
concurrent stream slots. It releases slots when a client closes. Reads/SSE use
a separate 120-per-10-minute global limiter; pairing and writes retain their
30-per-10-minute global limiter, so ordinary reconnection cannot exhaust the
write abuse budget. Revoked or narrowed sessions close the stream. Ordinary
Desktop startup does not bind a port. This does not authorize any command or
change the local JSON-RPC process boundary.

## Limits and next evidence

The Host/SQLite/HTTP test exercises schema32→33 with old Task retention,
committed conversation, Draft, approval and Run invalidations, Project
filtering, restart durability, expired cursor→real HTTP board snapshot→fresh
cursor, no duplicate replay, Project grant narrowing, revoke, and concurrent
stream cap. T094's cursor expiry→snapshot→fresh replay integration path passed.
These are protocol integration checks, not a phone UI or a second device. No
private HTTPS, browser Secure-cookie behavior or physical phone use has been
verified; those remain for P7-10/P8. The outbox currently has no physical
retention/pruning, though the replay window and response size are bounded.
Long-lived storage retention and full mobile projection/reconnect remain open
product hardening work. No public listener is enabled by this decision.

## P8-08 client and in-app list extension · 2026-09-25

The Web client uses a fixed same-origin `fetch` SSE request because native
`EventSource` cannot send the required `X-Forge-Session` header. It sends only a
validated Project UUID and durable `p:<seq>` cursor. A change triggers a fresh
Host Task/Approval projection; the cursor advances only after the projection
succeeds. A resync response requires a snapshot cursor at or beyond the Host's
requested position. Reconnect is bounded and abortable; unauthorized sessions
stop. Browser `fetch` must be invoked through the global binding instead of a
captured unbound method, as a real Chromium run exposed an Illegal invocation.

The authenticated fixed Project notification path reads up to 20 newest
committed invalidation identities from the same outbox. It applies the current
device Project grant on each read and contains no content or command authority.
The UI loads this list only while connected and never persists it offline.
The normal PWA cache remains static-only. Local Chromium against disposable
Host/SQLite proved live invalidation, page leave/reopen and offline/online
recovery. Private HTTPS and physical phone are still required before claiming
remote product acceptance; T105's duplicate Start also remains open.
