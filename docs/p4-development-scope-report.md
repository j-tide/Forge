# P4 development-scope acceptance report

Date: 2026-09-24
Platform: macOS arm64 development Desktop
Gate: **OPEN / NOT PASSED**
P4-05: **BLOCKED**
P4-10: **BLOCKED** (applicable single-Executor checks exercised)

## Current real evidence

- Python Host remains the only business Runtime. Electron/Vue use fixed
  Preload/Main/stdio methods; no general Renderer-to-plugin or tool channel.
- P4-01～04 manifest inspection, resource lifecycle, exact package lock,
  immutable Run lease and read-only config form passed earlier real tests.
- P4-06 selected versioned Developer/Reviewer Profiles ran a disposable Codex
  project and fixed-snapshot read-only Review. Unsupported model was rejected
  rather than silently replaced.
- P4-07 Codex ModelProvider delivered real structured/text/usage events,
  separately from the Coding Executor. Human approval still entered TODO.
- P4-08 T076～T080 local ToolRegistry/MCP fixtures passed; no arbitrary MCP
  server or tool authorization was enabled.
- P4-09 T040 activation failure was injected into a real Host with a real
  Project/Board read path: the plugin failed, Project/Board/health remained
  readable, and only sanitized plugin/Run diagnostics reached Desktop.
- P4-10 local locked-context replacement fixture disposed the old adapter
  and resources, then resolved a fresh fixture without altering Task/Core
  state code. It is a Registry contract test, **not** a second real Executor.
- `pnpm test:p3-live` passed six independent local scenarios and real Codex
  development/Verify, then its first online Review returned no structured
  result. The script correctly failed instead of promoting inconclusive to
  success. A single bounded direct retry of the same real Desktop/Python Host
  fixture then completed Codex development, passed Verify and structured
  Review, gained explicit human acceptance, kept source clean until a
  separate local merge, and exited successfully. Development Run
  `31f78df5-79e8-4cb4-9f57-2c39a8dc7085`; Review
  `d73ad1c7-5856-4d5e-bbf2-c5cd29b40425`; final decision
  `538842f3-cb80-4571-afc8-0065099f3b0b`. Logs:
  `/tmp/forge-p4-10-codex-live.log` and `/tmp/forge-p4-10-codex-retry.log`.
  This is one Codex Executor, not multi-Executor evidence.

## Preserved acceptance cases

| Test ID | Current result | Later owner / trigger |
| --- | --- | --- |
| T041 | **DEFERRED_VERIFICATION**. Only Codex completed the approved TODO. | Resume P4-05 after a legal Anthropic API Key and bounded paid test authorization; P4-10 must then run two genuinely different Executors on the same TODO. |
| T042 | Codex Profile unsupported-model rejection tested. Claude part **DEFERRED_VERIFICATION**. | P4-05 online adapter, then P4-10 comparison. |
| T043 | Codex cancellation and cross-process continuation have prior real Python app-server evidence. Claude declarations/cancel/resume **DEFERRED_VERIFICATION**. | P4-05 online, P4-10 comparison. |
| T044 | Codex fake-success text without required structured result is rejected in unit tests and the first current Review retry correctly failed. Claude mapping **DEFERRED_VERIFICATION**. | P4-05 online, P4-10. |
| T045 | Missing Claude credential is shown unavailable; no login or model call was attempted. Mid-Run credential loss **DEFERRED_VERIFICATION**. | P4-05 live adapter and P4-10 failure run after explicit authorization. |
| T116, T117, T119, T120 | **DEFERRED_VERIFICATION**. Formal multi-role budget/holdout/eval aggregation does not yet exist. | P6-09, with original IDs/references intact. |
| T118 | **DEFERRED_VERIFICATION**. Prompt-policy offline eval, gray release and rollback do not yet exist. | P9-06. |

Production `ProjectCommandVerifier` remains Host-owned. The public plugin
manifest declares a `verifiers` contribution slot, but PluginContext does not
yet register or replace a production verifier. Thus the verifier-swap part of
P4-10 is also **not passed**. The local adapter lifecycle fixture cannot be
presented as that replacement. P5 workflow template development may use the
existing verified Host verifier; it must not claim generic verifier plugin
replacement or ship full P4 compatibility.

## Development-only release boundary

The user's narrow authorization permits P5 tasks that do not need a second
real Executor after applicable P4 checks. `docs/development-dependency-exceptions.json`
allows exactly the canonical `P4-10 → P5-01` scheduling edge for development.
Neither P4-05 nor P4-10 is DONE; P4 Phase Gate and multi-Executor product
release remain open. No Claude API Key was requested, borrowed or used, and
no Anthropic call or fee was incurred. Later legal credentials plus explicit
budget are the only trigger to resume the Claude-dependent evidence. Do not
repeatedly probe the absent key on each subsequent task.
