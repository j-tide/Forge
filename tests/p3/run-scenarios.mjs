/** Re-exercise five actual P3 Git/SQLite/process scenarios, optionally the live Desktop chain. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const live = process.argv.includes('--live');
const scenarios = [
  {
    id: 'normal-delivery',
    node: 'tests/test_delivery.py::test_delivery_merge_is_explicit_once_and_restart_reconciles',
  },
  {
    id: 'mixed-status-board',
    node: 'tests/test_delivery.py::test_todo_reorder_ignores_completed_delivery_card',
  },
  {
    id: 'review-return',
    node: 'tests/test_rework.py::test_review_blocker_uses_persisted_handoff_for_new_attempt',
  },
  {
    id: 'failed-check-rework',
    node: 'tests/test_rework.py::test_failed_check_auto_reworks_from_snapshot_then_passes',
  },
  {
    id: 'human-advisory-waiver',
    node: 'tests/test_final_acceptance.py::test_final_acceptance_rechecks_reports_and_never_merges_source',
  },
  {
    id: 'crash-reconcile',
    node: 'tests/test_recovery.py::test_killed_host_never_replays_merge[after]',
  },
];

function execute(program, args, environment = process.env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(program, args, {
      cwd: root, env: environment, stdio: 'inherit', shell: false,
    });
    let stopped = false;
    const stop = () => {
      stopped = true;
      child.kill('SIGINT');
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    child.once('error', rejectRun);
    child.once('close', (code, signal) => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      if (stopped || signal) {
        rejectRun(new Error(`Interrupted: ${program} ${args.join(' ')}`));
      } else {
        resolveRun(code);
      }
    });
  });
}

for (const scenario of scenarios) {
  const code = await execute('uv', ['--directory', 'python', 'run', '--frozen',
    'pytest', '-q', scenario.node]);
  assert.equal(code, 0, `P3 scenario failed: ${scenario.id}`);
  console.log(JSON.stringify({ scenario: scenario.id, result: 'passed',
    evidence: scenario.node }));
}
if (live) {
  const code = await execute('node', ['scripts/smoke-python-vertical-live.mjs'], {
    ...process.env, FORGE_VERTICAL_MERGE_ONLY: '1',
    FORGE_P3_ACCEPTANCE: '1',
    FORGE_VERTICAL_MODEL: process.env.FORGE_VERTICAL_MODEL ?? 'gpt-6-sol',
  });
  assert.equal(code, 0, 'P3 live Desktop→Python Host→Codex chain failed');
  console.log(JSON.stringify({ scenario: 'live-desktop-python-host-codex-delivery',
    result: 'passed', evidence: 'scripts/smoke-python-vertical-live.mjs' }));
  const boardCode = await execute('node', ['tests/p3/board-live.mjs']);
  assert.equal(boardCode, 0, 'P3 mixed-state board Desktop probe failed');
  console.log(JSON.stringify({ scenario: 'live-desktop-board-gates',
    result: 'passed', evidence: 'tests/p3/board-live.mjs' }));
}
