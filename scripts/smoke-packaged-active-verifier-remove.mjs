/** Installed Python Host runs an approved check while Desktop refuses Project archive. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron as electron } from 'playwright-core';
/* global window */

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dmg = process.env.FORGE_ACTIVE_VERIFIER_DMG;
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !dmg || !existsSync(dmg)) {
  throw new Error('Require macOS arm64 and an explicit, existing internal DMG');
}
const tag = process.env.FORGE_ACTIVE_VERIFIER_TAG || 'desktop-active-verifier';
if (!/^[a-z0-9][a-z0-9-]{0,50}$/.test(tag)) throw new Error('Invalid QA tag');
const qaRoot = mkdtempSync(join(root, 'output', 'qa', 'desktop-active-verifier-'));
const appData = join(qaRoot, 'isolated-app-data');
const dataDir = join(appData, 'Forge', 'production');
const mount = join(qaRoot, 'mounted-dmg');
const installed = join(qaRoot, 'Forge INTERNAL.app');
const screenshot = join(root, 'output', 'playwright', `${tag}-remove-blocked-1440x900.png`);
let app;
let attached = false;

function command(bin, args, options = {}) {
  return execFileSync(bin, args, { cwd: root, encoding: 'utf8', timeout: 30_000,
    ...options }).trim();
}
async function until(read, timeoutMs = 35_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await delay(100);
  }
  throw new Error('Timed out waiting for an actual verifier process/result');
}
async function invoke(page, group, type, payload) {
  return page.evaluate(async ({ group, type, payload }) => {
    const envelope = { schemaVersion: '1.0', commandId: crypto.randomUUID(), type,
      createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload };
    return group === 'project' ? window.forge.invokeProject(envelope) :
      window.forge.invokeRun(envelope);
  }, { group, type, payload });
}

try {
  // Reuse the real Git/SQLite/Handoff fixture builder. Only fixture construction
  // uses source-tree Python; the check below runs inside the installed bundle.
  const builder = `import asyncio, json, sys\nfrom pathlib import Path\n`
    + `from unittest.mock import patch\nsys.path.insert(0, sys.argv[2])\n`
    + `import test_verifier_project as support\n`
    + `async def prepare():\n`
    + `    with patch.object(support.sys, 'executable', '/usr/bin/python3'):\n`
    + `        source, head, storage, project_id, task_id, run_id, snapshot_id, preset, verifier, _ = await support.fixture(Path(sys.argv[1]), mode='hold')\n`
    + `    assert preset is not None\n`
    + `    await verifier.shutdown()\n    storage.close()\n`
    + `    return dict(source=str(source), head=head, projectId=str(project_id), taskId=str(task_id), developmentRunId=str(run_id), snapshotId=str(snapshot_id), presetId=str(preset.presetId))\n`
    + `print(json.dumps(asyncio.run(prepare())))\n`;
  const seeded = JSON.parse(command('uv', ['--directory', join(root, 'python'), 'run',
    '--frozen', 'python', '-c', builder, qaRoot, join(root, 'python', 'tests')]));
  mkdirSync(dataDir, { recursive: true });
  cpSync(join(qaRoot, 'data', 'forge.sqlite'), join(dataDir, 'forge.sqlite'));
  mkdirSync(mount);
  command('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  attached = true;
  command('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  command('hdiutil', ['detach', mount]);
  attached = false;
  command('codesign', ['--verify', '--deep', '--strict', installed]);
  app = await electron.launch({ executablePath: join(installed, 'Contents', 'MacOS', 'Forge'),
    args: [], env: { ...process.env, FORGE_DEV_SERVER_URL: '',
      FORGE_INTERNAL_TEST_HOME: appData } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  const start = await invoke(page, 'run', 'run.verifyStart', {
    projectId: seeded.projectId, taskId: seeded.taskId,
    developmentRunId: seeded.developmentRunId,
    expectedSnapshotId: seeded.snapshotId, kind: 'test', presetId: seeded.presetId,
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal(start.ok, true, JSON.stringify(start));
  const verificationId = start.data.verificationId;
  const journal = join(dataDir, 'process-records');
  const owned = await until(() => {
    if (!existsSync(journal)) return null;
    for (const name of readdirSync(journal).filter((item) => item.endsWith('.json'))) {
      const record = JSON.parse(readFileSync(join(journal, name), 'utf8'));
      if (record.runId !== verificationId || record.status !== 'running') continue;
      try { process.kill(record.pid, 0); return record; }
      catch { return null; }
    }
    return null;
  }, 10_000);
  await page.getByRole('button', { name: '项目', exact: true }).click();
  const projectCard = page.locator('.saved-project').filter({ hasText: 'Forge 验证 fixture with spaces' });
  await projectCard.getByRole('button', { name: 'Remove from Forge' }).click();
  const dialog = page.getByRole('dialog', { name: /Remove .* from Forge/ });
  await dialog.getByRole('button', { name: 'Remove from Forge' }).click();
  await dialog.getByText('项目还有正在进行的开发、审查、验证、返工或合并。',
    { exact: false }).waitFor();
  assert.equal(await dialog.isVisible(), true);
  await page.screenshot({ path: screenshot });
  const projects = await invoke(page, 'project', 'project.list', {});
  assert.equal(projects.ok, true, JSON.stringify(projects));
  assert.ok(projects.data.some((item) => item.projectId === seeded.projectId));
  const report = await until(async () => {
    const job = await invoke(page, 'run', 'run.verifyJob', {
      projectId: seeded.projectId, verificationId,
    });
    assert.equal(job.ok, true, JSON.stringify(job));
    if (job.data.state !== 'completed') return null;
    const response = await invoke(page, 'run', 'run.verifyReport', {
      projectId: seeded.projectId, verificationId,
    });
    assert.equal(response.ok, true, JSON.stringify(response));
    return response.data;
  });
  assert.equal(report.status, 'passed');
  assert.equal(report.exitCode, 0);
  assert.equal(command('git', ['-C', seeded.source, 'rev-parse', 'HEAD']), seeded.head);
  assert.equal(command('git', ['-C', seeded.source, 'status', '--porcelain']), '');
  console.log(JSON.stringify({ stage: 'packaged-active-verifier-project-archive-refused',
    dmg, qaRoot, screenshot, verificationId, commandPid: owned.pid,
    reportStatus: report.status, sourceClean: true, projectRetained: true }));
} finally {
  await app?.close();
  if (attached) command('hdiutil', ['detach', mount]);
  // Only the test-owned installed copy is removed; the fixture DB/Git evidence stays.
  if (existsSync(installed)) rmSync(installed, { recursive: true, force: true });
  writeFileSync(join(qaRoot, 'artifact.txt'), `${dmg}\n`);
}
