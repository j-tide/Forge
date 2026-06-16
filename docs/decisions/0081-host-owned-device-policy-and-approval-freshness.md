# ADR 0081 — Host-owned remote device policy and approval freshness

Status: Accepted on 2026-09-25 for P7-07's local Host and loopback protocol.
Private HTTPS and physical phone acceptance remain unverified.

## 2026-09-26 same-Project policy revision fence

Project membership alone cannot detect a narrowed operation grant: the device
may retain the same Project while losing `task:draft` or `task:approve`. The
authenticated session bootstrap now exposes the **persisted** paired-device
policy revision. The mobile UI treats session ID, Project grant and this
revision as read identities; it clears Host-derived text and fences old read
responses whenever they change. The mobile SSE request binds its original
revision in `X-Forge-Policy-Revision`; each Host poll compares that value with
the current SQLite revision. A stale stream closes, and its reconnect receives
`REMOTE_POLICY_CHANGED`/403. The client then reloads the current Host session
and projections. The header is only a staleness guard, never a claimed grant;
authorization always comes from Host storage. Older clients without the header
remain subject to per-request Project/operation checks, while the current
mobile app always sends it.

This was exercised against a newly installed macOS arm64 internal DMG and its
bundled Python Host: Desktop narrowed a paired device to read-only without
removing its Project, the connected Chromium page automatically removed the
previously read Host message, and a later Desktop revocation cleared its PWA
shell cache/Worker and denied the old cookie. A separate installed-app offline
approval check sent no POST and did not replay after reconnect. These local
checks do not prove private HTTPS, physical phone or full public Run controls.

## Context

An authenticated remote session identifies a device, but it must not imply
authority to perform every operation. P7-05's public write contracts also
cannot be executed by renaming them to local Host methods: some omit required
decision, provenance and compare-and-swap fields. P7-07 requires a stored,
revocable operation grant and a fresh version/hash check for approvals.

## Decision

Additive SQLite schema 34 stores an operation scope set and revision per
paired device. Existing devices upgrade to the empty set (read-only). The
Desktop's local pairing confirmation displays exact requested Project IDs and
operation scopes before Host approval. A browser cannot mint its own grant.
The Host re-reads the persisted device, current Project list and required
operation scope for every write; it does not trust client-supplied identity or
capabilities. Local-only `devices.pair.narrow` is a subset-only revision CAS;
`devices.pair.revoke` invalidates all device sessions in one transaction.
Both record an audit event. Desktop Main confirms revocation natively.

For `tasks.approve`, the Host checks the public approval ID, Project, draft,
expected revision, scope hash, action digest, current contract and expiry
against the current SQLite state. A stale request returns 409. A fresh request
still returns 403: the public command omits the local decision and reason, and
P7-05 lacks an atomic write/idempotency mapping. The freshness check is a
preflight only; any future positive dispatch must repeat it inside the same
transaction as the approval decision. Local dangerous operations such as
arbitrary shell, plugin and credential actions remain outside the remote
method allowlist. Neither pairing nor a scope grant is a blanket approval.

Revoked tokens return `REMOTE_AUTH_REVOKED`/403; unknown tokens retain 401.
The authenticated SSE poll and read/command handlers re-read the current
Project grant, so shrinking it closes an old stream and rejects old-Project
commands even when a caller holds a previously authenticated identity.
Normal Desktop startup still does not expose a network listener.

## Evidence and limits

Real schema33→34 migration preserved an approved device, Project and session,
defaulting its operations to read-only with an online backup. SQLite tests
cover subset-only CAS, stale policy revision, expansion rejection, audit and
restart persistence. A real draft/approval revision and digest preflight
returns 409 after editing; a fresh approval is deliberately not executed.
Host local commands plus authenticated loopback HTTP prove that Project
narrowing closes SSE and rejects an old-Project command, and local device
revocation closes a second stream and rejects its cookie's write with 403.
macOS arm64 Electron smoke uses schema 34; Windows/Intel and private HTTPS
remain unverified. P7-08 owns the user-facing device-management page; P7-05
still owns exact positive public writes. T097/T099 retain physical-phone
verification for P7-10 rather than being reported as complete from loopback.
