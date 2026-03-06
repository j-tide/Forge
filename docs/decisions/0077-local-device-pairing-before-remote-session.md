# ADR 0077 — Local device pairing before any remote session

Status: Accepted for P7-03 development scope (2026-09-25). Remote access remains disabled.

## Decision

The Python Host owns device pairing records in additive SQLite schema 31. A local Desktop-only, fixed Preload/Main method may issue, inspect and decide a pairing. The issue response contains a 256-bit one-time nonce; SQLite stores only SHA-256. Claim consumes it once and returns a separate 256-bit claim secret, also stored only as a hash. A ten-minute expiry and five failed attempts per pairing reject stale/replayed/guessing requests. The local user sees the claimed device label, network summary and **device-reported** fingerprint, selects existing trusted Project IDs and must press Approve in both Vue and a native Main confirmation. The Host atomically checks the claimed state, expiry and Project IDs before creating an approved device record. There is no session yet.

The Host exposes devices.pair.issue/inspect/decide only over its owned local stdio channel. The Renderer has no claim method and no arbitrary Host IPC. The claim service method is reserved for a later same-origin gateway that must first enforce Origin, request size and source rate limits; P7-04 owns that network gate and session delivery. The current loopback static gateway still returns 401/403 on every API request, including pairing. Desktop startup opens no listener.

The Settings UI labels this as local lifecycle preparation, hides the short-lived nonce behind a disclosure and explicitly says no HTTPS phone address/session exists. The shipped internal Demo predates this source change and continues on schema 30 in its isolated data directory. No existing Project, Task or Run rows are modified; SQLite's existing pre-upgrade online backup and transactional migration apply to schema 30→31.

## Evidence and limits

Actual SQLite tests cover hashed storage, one-time claim, replay, expiry, failed-attempt ceiling, local approve/reject, Project scope validation, restart durability and additive schema 30→31 with preserved metadata. A real Python Host stdio test accepts only local methods and rejects devices.pair.claim; real Electron smoke checks the fixed bridge, schema31 and Renderer Node isolation. This is **not** a completed phone pairing or T096 over HTTPS. Full T096 HTTP/device replay remains at P7-04; T097/T098/T099/T100 retain later owners. Device self-reported fingerprint is a human comparison hint, not a cryptographic device identity. No private HTTPS endpoint, browser cookie, CSRF token, authenticated stream, phone or second platform has been verified.

Only a later authenticated private gateway may call the service's claim method. It must not turn the current static gateway into an unauthenticated command channel. Public network exposure remains forbidden without the P7-04–07 gates and actual target-device tests.
