# P6-09 current-scope acceptance audit · 2026-09-25

Status: **PARTIAL / BLOCKED for formal P6-09 and the P6 Phase Gate.** This is an evidence audit of the currently implemented macOS arm64 and single-Codex product, not a certificate that all referenced T001–T095 or T106–T120 cases passed. The canonical Task/Test IDs in `forge_spec_v1.0` remain unchanged. `docs/deferred-verification.json` remains the machine-readable list of outstanding exact case references; no entry was marked `PASSED`.

## Actual current-platform paths

- The installed internal DMG, not the development Desktop, completed Project choose/probe/trust, saved message, manual Draft revision, separate approval to TODO with no auto-start, explicit Codex development in an isolated Worktree, real file changes, snapshot and Diff, command Verify exit 0, independent read-only Review, per-criterion evidence, final Owner acceptance to Done, and restart readback of Task/delivery. A separate long-command Run was cancelled, its owned process exited, and it did not continue writing. Source Git stayed clean and unmerged. Evidence IDs, exact command, screenshots and checksum are in [the installed-app report](demo/p6-internal-macos-package.md). This reuses the same final DMG; no duplicate cloud run was made for this audit.
- P6-05's real active-Run close/tray/safe-quit fixture has T002/T114 current macOS evidence; P6-04's token/path diagnostic export has T115 current development evidence. P6-08's isolated signed-fixture verifier and SQLite v29→v30 staged migration run in Python tests. The existing P3 resilience suite checks T086–T090 migration/backup/fault behavior on disposable databases. None of these establishes a signed installed-app upgrade.
- `pnpm validate:contracts`, `pnpm validate:task-map`, `pnpm py:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm smoke:desktop`, `pnpm smoke:package:mac` and `pnpm test:p3-acceptance` form this scope's repeatable local regression commands. Exit results are recorded in `docs/implementation-status.md`; a suite passing does not convert every authoritative acceptance case into `PASSED`.
- `pnpm test:p3-acceptance` exit 0 on six actual disposable Python/Git/SQLite scenarios: normal delivery, mixed-status board, Review return, failed-check rework, human advisory waiver and killed-Host merge reconciliation. This reruns deterministic local state transitions; it is separate from the installed-app Codex live evidence above.

## Exact known incomplete cases

The following distinct Test IDs are retained as `DEFERRED_VERIFICATION` in the existing manifest; multiple source Task references are preserved: `T003`, `T004`, `T005`, `T024`, `T029`, `T041`, `T042`, `T043`, `T044`, `T045`, `T081`, `T083`, `T084`, `T085`, `T108`, `T110`, `T111`, `T112`, `T113`, `T116`, `T117`, `T118`, `T119`, `T120`.

| Gate | Current evidence | Missing release evidence |
| --- | --- | --- |
| Host/Renderer/platform `T003–T005`, `T108`, `T110` | Current macOS Electron/Python Host and CSS/keyboard tests | Forced Renderer crash, Windows installed-app shortcuts/DPI, physical platform and full Run motion checks |
| Workflow `T029` | Published quick-type run and version locks | Same-fixture full historical/new publication UI comparison |
| Claude/multi-Executor `T041–T045` | Real Codex only; Claude offline CLI probe | Authorized second genuine Executor and its approval/cancel/resume/auth-failure checks |
| Preview/artifact/security `T081`, `T083–T085` | Isolated localhost preview and selected redaction/diagnostic tests | Full credential-reference, native dialog/window and all artifact/permission-intersection assertions |
| Distribution `T111–T113` | Internal arm64 ad-hoc DMG installed-app business loop | Developer ID/notarized fresh-user Mac, signed upgrade/rollback, legitimate credential continuity; Windows signed installer/full task |
| Evaluation `T116–T120` | One real installed Codex Run plus an independent cancelled Run; cancellation is not counted as success | Same-budget single-Agent/workflow comparison, holdout leak check, bad-strategy rollback, complete cost accounting and a formal outcome table; `T118` also belongs to P9-06 |
| Remote `T024` | No current local claim | P7-08 RemoteTransport ability and remote acceptance |

Cases not listed in the deferred manifest are **not automatically passed by this report**. Their earlier task-specific implementation evidence remains in the corresponding implementation status, ADR and phase reports. A separate case-by-case release sign-off, including current code, target platform and installed binaries, is required before claiming full P6-09.

No failed local assertion has been suppressed or transformed into success. No Claude call, new credential, public installer, push or release was attempted. Because Windows/signed update and the above security/evaluation cases remain incomplete, the required “zero unresolved high-risk/data-damage gaps” release claim cannot be made.
