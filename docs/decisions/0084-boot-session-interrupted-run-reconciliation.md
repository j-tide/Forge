# ADR 0084 — Explicit interrupted Run reconciliation after a new boot session

Date: 2026-09-27
Status: Accepted for the Desktop recovery path; physical reboot acceptance pending

## Context

ADR 0044 correctly quarantines an interrupted Run after Host failure. A prior
Host PID, app-server PID or process group cannot prove that Codex child commands
have stopped. The retained lease blocks all new project writers, and a UI
acknowledgement alone must not remove it. This leaves a genuine Desktop recovery
gap after a crash.

## Decision

On a writable Host startup, Forge stores the **current kernel boot-session ID**
with each previously unobserved interrupted Run whose lease is quarantined.
`run.recoveryStatus` returns only the state and bound Run/workspace revisions;
the boot ID, local paths and process PIDs do not cross the Renderer boundary.
Closing/reopening Forge or sleeping/waking the Mac leaves the boot ID unchanged.

An explicit `run.recoveryResolve` is admitted only when all of these hold:

1. The kernel reports a *different* boot-session ID from the persisted
   observation. Missing or malformed identity fails closed. A current-boot
   historical PID is never signalled, adopted or used as proof.
2. The request binds the exact Run revision, worktree UUID and Project. Main
   asks for native confirmation; Host validates the fixed schema again.
3. Host verifies the old record's Run/Attempt/lease identity, managed-root
   containment, symlink safety, Git common directory, branch and worktree
   registration. Unknown journal entries or a current-runtime owned process
   prevent resolution.
4. One SQLite transaction marks only the old lease `released`, increments the
   Run revision and records the boot-based decision. The Run and Attempt remain
   `interrupted`; the old worktree, source repo, snapshots and journal remain
   untouched. A new Run still requires a fresh explicit Start and a different
   isolated worktree.

The installed database gains schema 36 with `run_recovery_observations` and a
nullable `runs.recovery_resolved_at`. The old unique active-project index
included every `interrupted` Run forever; schema 36 replaces it with the same
single-writer constraint that excludes an interrupted Run **only after** its
durable resolution marker. A SQLite trigger refuses that marker without the
matching observation row. The migration does not rewrite Run or Project data,
and unresolved rows keep the previous index behavior. Existing
`run_events.type` has a closed CHECK and is not repurposed for new event names.
An old read-only schema without the new table reports recovery unavailable.
Duplicate resolution reads the existing record without another write. Board
projection returns the unresolved Task to TODO only after durable resolution;
no acceptance or success is inferred.
The data-profile switch safety check discounts **valid** old process records
only for their specifically resolved Run. Damaged or unclassified journals,
other Runs, Review and Verify uncertainty still block switching.

The boot-session approach is intentionally limited to platforms with a
readable kernel identity. On current macOS arm64,
`/usr/sbin/sysctl -n kern.bootsessionuuid` returns a stable UUID. Apple's
[BootSessionUUID definition](https://github.com/apple/darwin-xnu/blob/main/iokit/IOKit/pwr_mgt/IOPM.h)
describes a unique boot cycle that remains the same through sleep, wake and
hibernate. Linux uses the kernel's documented
[`boot_id`](https://www.kernel.org/doc/html/latest/admin-guide/sysctl/kernel.html#random)
for development; Windows remains unsupported and fails closed until real
platform design and testing. The Apple `sysctl` selector was observed on the
current machine; macOS Intel and future OS availability remain unverified.

## Evidence and limits

Real independent Host death, SQLite, Git worktree and process-journal tests
show `interrupted`/`quarantined`; the current boot refuses resolution.
Read-only boot ID calls are stable on the current macOS arm64 host. A unit
injected second boot ID **after the real fixture child exits** exercises
bounded resolution, stale revision, malformed request, symlink rejection,
idempotency, retained Diff, TODO projection, unchanged source Git and profile
safety. The injected second boot is not a physical reboot acceptance and is
never available from environment, Renderer or public commands. A physical
reboot and actual installed-app positive resolution remain pending. No
historical PID is killed, no worktree is removed and no provider call is made.

This does not resolve interrupted Review/Verify jobs, ambiguous provider
outcomes, malformed process journals or other projects' orphan processes.
Those remain fenced. It does not claim Windows, Intel, signed upgrade or
complete P6 acceptance.
