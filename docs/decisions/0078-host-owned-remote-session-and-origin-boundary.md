# ADR 0078 — Host-owned remote session and Origin boundary

Status: Accepted for P7-04 development scope (2026-09-25). No Desktop network listener or private HTTPS deployment is enabled.

## Decision

The Python Host remains the sole business/SQLite owner. Additive schema 32 introduces hashed, short-lived device sessions and a one-time pairing delivery marker; schema 31 pairing and all existing Project/Task/Run records remain intact. After a locally approved pairing, its claim secret can deliver exactly one 256-bit session token and independent CSRF token. The server stores only SHA-256 hashes. A 15-minute session may rotate within a fixed 24-hour refresh ceiling; rotation revokes the old token in the same transaction. Explicit revoke persists, and every authentication rereads the current device state and Project allowlist. A lost first response must use its existing cookie to query the session or restart pairing; the same claim secret never issues another session.

An optional HTTP adapter binds only 127.0.0.1. It accepts exact same-origin POSTs for claim/status/refresh/revoke, rejects cross-site Fetch Metadata and Origin, enforces bounded JSON/headers, rate-limits the gateway, and sets a __Host- cookie with Secure, HttpOnly, SameSite=Strict and Path=/. An authenticated current-session GET requires a custom same-origin header before it can issue a new CSRF token. All other /v1 commands remain denied. No CORS wildcard or arbitrary Python Host method exists.

The HTTP handler runs on worker threads, but its callback **must marshal every database action onto the owning Python Host event loop**. The tested callback uses run_coroutine_threadsafe with a finite timeout and invokes the exact RemoteAuthDispatcher methods on that loop. Direct SQLite use from an HTTP thread is prohibited. Normal Desktop startup and the standalone static CLI supply no auth callback and open no authenticated route. A later task must provide explicit local configuration and private HTTPS fronting before phone access; no app-embedded web server is started by this ADR.

## Evidence and limits

Real loopback HTTP + SQLite tests exercise nonce claim/replay, approval-pending without cookie, once-only delivery, cookie flags/no bearer token in JSON, cross-origin rejection, CSRF reject, session bootstrap, refresh/old-token reject, revoke/next request 401, unknown command 403, strict input and rate-limit 429. Separate SQLite tests cover schema31→32 backup/preservation, restart durability, expiry and hash-only storage. Python Host and Electron development smoke reach schema32 with normal startup still listener-free.

The test server is HTTP **only on loopback** and is not phone/private HTTPS evidence. A real TLS origin, proxy identity, second-device browser cookie behavior, CSRF across the proxy, device fingerprint assurance, concurrent remote streams and installed-app integration remain unverified. T096/T098 full private-device cases remain at P7-10; T081–T085 keep their original IDs and the unmatched remote/security portions are deferred to P7-05/07/10. P6 release, Claude and platform gates do not change.
