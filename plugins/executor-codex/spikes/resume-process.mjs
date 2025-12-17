import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'forge-codex-process-'));
try {
  await cp(join(here, '..', 'fixture'), root, { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  const child = join(here, 'resume-child.mjs');
  const run = (...args) => JSON.parse(execFileSync(process.execPath, [child, ...args],
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024 }));
  const first = run('start', root);
  const second = run('resume', root, first.providerSessionId);
  assert.notEqual(first.pid, second.pid);
  assert.equal(first.providerSessionId, second.providerSessionId);
  assert.equal(second.outcome, 'completed');
  console.log(JSON.stringify({ processRestartResume: true, firstPid: first.pid,
    secondPid: second.pid, providerSessionId: second.providerSessionId }));
} finally { await rm(root, { recursive: true, force: true }); }
