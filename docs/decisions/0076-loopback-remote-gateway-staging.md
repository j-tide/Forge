# ADR 0076 — Explicit loopback staging before remote authorization

Date: 2026-09-25
Status: Accepted for P7-02 development scope; private HTTPS and command gateway not yet enabled

## Context and decision

The user authorized P7/P8 development while keeping P6 distribution gates blocked and explicitly forbade a naked public listener or an authorization shortcut. Forge's only business Runtime remains the Python Host over versioned local stdio; Electron Main stays a system/lifecycle bridge. P7-02 therefore adds a **separate Python static gateway entry point** which is never started by Desktop or Host. A developer must opt in with `--enable-loopback`; it binds `127.0.0.1` on an ephemeral port and serves the built Vue files. The route namespace `/v1/*` exists only as a fail-closed placeholder: reads are unauthorized and writes forbidden. It cannot create a Task, run an Executor, read SQLite or inspect a project.

This deliberately stops short of the future same-origin HTTPS PWA/API in the reference OpenAPI contract. That contract is a specification, not proof of deployment. An explicit private HTTPS front end may later proxy to loopback only after P7-03～P7-07 supply and test single-use pairing, session/Origin/CSRF, per-request project scope, command allowlist, approval freshness and revocation. The certificate/private network/phone are external and currently unverified; transport TLS cannot replace Forge authorization. No public binding, reverse proxy, tunnel or cloud resource is created automatically.

The current staging uses Python's standard-library `ThreadingHTTPServer` for a tiny static allowlist and no business API; it adds no package dependency. If later authenticated API/SSE needs a different server implementation, that is a separate adapter choice and must preserve the same Python Host command boundary rather than moving business logic into the gateway. Errors are path-free, request URLs/cookies are not logged, static traversal/symlink/Host-header checks run before file read, and all writes fail closed.

## Evidence and limits

`python/tests/test_remote_gateway.py` starts a real loopback HTTP server and checks built-style assets, host spoofing, traversal, symlinks, denied API reads/writes and listener cleanup. A separate run served the actual `apps/web/dist` HTML/JS from `127.0.0.1` on an ephemeral port and returned 401/403 for API reads/writes. `lsof` found no listening TCP socket on the currently running installed Demo app or bundled Host. Private HTTPS, mobile access, device credentials, auth and remote command/state semantics remain unimplemented. P7-02 current scope can close without calling T096～T100 passed; those exact cases are deferred to P7-03/04/06/07/09. Full P7 Phase Gate and all P6 formal gates remain open.
