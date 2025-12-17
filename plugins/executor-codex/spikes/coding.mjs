import { execFileSync } from 'node:child_process';
import { mkdtemp, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { HostExecutorRegistry } from '../../../apps/host/dist/executors.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixture');
const parent = await mkdtemp(join(tmpdir(), 'forge-codex-code-'));
const root = join(parent, 'workspace');
const registry = new HostExecutorRegistry();
try {
  await mkdir(root);
  const parentCanary = join(parent, 'outside-workspace.txt');
  await writeFile(parentCanary, 'outside workspace remains untouched\n');
  await cp(fixture, root, { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Forge Spike', '-c', 'user.email=forge-spike@example.invalid', 'commit', '-qm', 'fixture baseline']);
  const events = [];
  registry.onEvent((event) => events.push(event));
  const handle = await registry.start('executor.codex', { runId: 'spike-coding', taskId: 'fixture-add', workspace: root,
    goal: 'In this small project, update src/add.js so add(a,b) rejects non-finite or non-number inputs with TypeError. Add tests for invalid inputs. Run npm test. Change only this fixture project. Do not use network.',
    context: [], permission: 'workspace-write', approval: 'never', maxDurationMs: 180_000 });
  const outcome = await handle.completion;
  const testOutput = execFileSync('npm', ['test'], { cwd: root, encoding: 'utf8' });
  const code = await readFile(join(root, 'src', 'add.js'), 'utf8');
  assert.match(code, /TypeError/);
  assert.match(testOutput, /pass/);
  assert.equal(outcome, 'completed');
  assert.equal(await readFile(parentCanary, 'utf8'), 'outside workspace remains untouched\n');
  const changedFiles = execFileSync('git', ['-C', root, 'diff', '--name-only'], { encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(changedFiles, ['src/add.js', 'tests/add.test.mjs']);
  console.log(JSON.stringify({ outcome, sessionId: handle.providerSessionId,
    eventTypes: [...new Set(events.map((event) => event.type))],
    eventCount: events.length, sequenceMonotonic: events.every((event, index) => event.sequence === index + 1),
    changedFiles, parentCanaryUnchanged: true,
    usage: events.filter((event) => event.type === 'usage.updated').at(-1) ?? null,
    fixtureTestsPassed: true }, null, 2));
} finally {
  await registry.dispose();
  await rm(parent, { recursive: true, force: true });
}
