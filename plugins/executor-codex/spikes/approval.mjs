import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, cp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexExecutorAdapter } from '../dist/index.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixture');
const results = [];
for (const decision of ['approve', 'reject']) {
  const root = await mkdtemp(join(tmpdir(), `forge-codex-${decision}-`));
  const adapter = new CodexExecutorAdapter();
  try {
    await cp(fixture, root, { recursive: true });
    execFileSync('git', ['init', '-q', root]);
    const run = await adapter.start({ runId: `spike-${decision}`, taskId: 'fixture-approval', workspace: root,
      goal: 'Execute the exact shell command `printf approved > approval.txt` in the current project. The workspace is read-only. Request approval to run the write command. If approval is declined, do not retry or find another way to write. Report what happened.',
      context: [], permission: 'read-only', approval: 'on-request', maxDurationMs: 120_000 });
    const seen = [];
    const pending = [];
    run.subscribe((event) => {
      seen.push(event);
      if (event.type === 'approval.requested') pending.push(run.respondToApproval(event.approvalId, decision));
    });
    const outcome = await run.completion;
    await Promise.all(pending);
    const requested = seen.filter((event) => event.type === 'approval.requested');
    const resolved = seen.filter((event) => event.type === 'approval.resolved');
    if (decision === 'approve') assert.equal((await readFile(join(root, 'approval.txt'), 'utf8')).trim(), 'approved');
    else await assert.rejects(access(join(root, 'approval.txt')));
    assert.ok(requested.length > 0);
    assert.equal(resolved.length, requested.length);
    results.push({ decision, outcome, requested: requested.length, resolved: resolved.length,
      fileWritten: decision === 'approve' });
  } finally {
    await adapter.dispose();
    await rm(root, { recursive: true, force: true });
  }
}
console.log(JSON.stringify(results, null, 2));
