/** Resume a retained, real packaged Developer fixture at its Review gate. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron as electron } from 'playwright-core';

const repository = resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = process.env.FORGE_REVIEW_RESUME_ROOT;
const dmg = process.env.FORGE_REVIEW_RESUME_DMG;
if (!root || !isAbsolute(root) || !root.startsWith(join(repository, 'output', 'qa') + sep)
    || !dmg || !isAbsolute(dmg) || !existsSync(dmg)) {
  throw new Error('Use an existing output/qa fixture and an absolute internal DMG path');
}
const database = join(root, 'isolated-app-data', 'Forge', 'production', 'forge.sqlite');
const source = join(root, 'Forge fixture 空格');
assert.ok(existsSync(database) && existsSync(join(source, '.git')));
const fixture = JSON.parse(execFileSync('python3', ['-c', `
import json, pathlib, sqlite3, sys
p=pathlib.Path(sys.argv[1]); db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True)
one=lambda sql: db.execute(sql).fetchone()[0]
run=one("SELECT run_id FROM runs WHERE state='succeeded' ORDER BY created_at LIMIT 1")
print(json.dumps(dict(projectId=one('SELECT project_id FROM projects LIMIT 1'),
 taskId=one('SELECT task_id FROM tasks LIMIT 1'), runId=run,
 snapshotId=db.execute('SELECT snapshot_id FROM code_snapshots WHERE run_id=?',(run,)).fetchone()[0],
 reviewerId=one("SELECT profile_id FROM agent_profiles WHERE json_extract(profile_json,'$.role')='reviewer' ORDER BY revision DESC LIMIT 1"),
 reviewerRevision=one("SELECT revision FROM agent_profiles WHERE json_extract(profile_json,'$.role')='reviewer' ORDER BY revision DESC LIMIT 1"),
 presetId=one('SELECT preset_id FROM command_presets WHERE approval_hash IS NOT NULL ORDER BY revision DESC LIMIT 1'))))
`, database], { encoding: 'utf8' }));
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
const sourceHead = git('rev-parse', 'HEAD');
assert.equal(git('status', '--porcelain'), '');
const installRoot = await mkdtemp(join(repository, 'build', 'macos', 'qa-install-'));
const mountRoot = await mkdtemp(join(tmpdir(), 'forge-review-resume-'));
const mount = join(mountRoot, 'mount');
const installed = join(installRoot, 'Forge INTERNAL.app');
let mounted = false;
let desktop;

function native(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.stdout}`);
}

async function invoke(page, type, payload) {
  const reply = await page.evaluate(({ type, payload }) => globalThis.forge.invokeRun({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type,
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload,
  }), { type, payload });
  assert.equal(reply.ok, true, `${type}: ${JSON.stringify(reply)}`);
  return reply.data;
}

async function until(read, done, limit = 480) {
  let value;
  for (let step = 0; step < limit; step += 1) {
    value = await read();
    if (done(value)) return value;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for real Host state: ${JSON.stringify(value)}`);
}

async function board(page, projectId) {
  const reply = await page.evaluate((id) => globalThis.forge.invokeBoard({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'board.snapshot',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { projectId: id },
  }), projectId);
  assert.equal(reply.ok, true, JSON.stringify(reply));
  return reply.data;
}

async function closeSafely(app) {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1);
      return { response: options.buttons?.length === 2 ? 1 : 2 };
    };
  }).catch(() => undefined);
  await app.close();
}

try {
  await mkdir(mount);
  native('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  mounted = true;
  native('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  native('hdiutil', ['detach', mount]);
  mounted = false;
  native('codesign', ['--verify', '--deep', '--strict', installed]);
  const executable = join(installed, 'Contents', 'MacOS', 'Forge');
  const environment = { ...process.env, FORGE_DEV_SERVER_URL: '',
    FORGE_INTERNAL_TEST_HOME: join(root, 'isolated-app-data') };
  desktop = await electron.launch({ executablePath: executable, args: [], env: environment });
  let page = await desktop.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  const modelId = process.env.FORGE_REVIEW_RESUME_MODEL || 'gpt-6-luna';
  const existingJobs = await invoke(page, 'run.reviewJobs', {
    projectId: fixture.projectId, taskId: fixture.taskId,
  });
  const review = existingJobs.find((item) => item.developmentRunId === fixture.runId
    && item.snapshotId === fixture.snapshotId) ?? await invoke(page, 'run.reviewStart', {
    projectId: fixture.projectId, taskId: fixture.taskId,
    developmentRunId: fixture.runId, expectedSnapshotId: fixture.snapshotId,
    modelId, profileId: fixture.reviewerId, profileRevision: fixture.reviewerRevision,
    idempotencyKey: crypto.randomUUID(),
  });
  const firstJob = await until(() => invoke(page, 'run.reviewJob', {
    projectId: fixture.projectId, reviewRunId: review.reviewRunId,
  }), (job) => job.state !== 'running');
  assert.equal(firstJob.state, 'completed', JSON.stringify(firstJob));
  const firstReports = await invoke(page, 'run.reviewReports', {
    projectId: fixture.projectId, taskId: fixture.taskId,
  });
  const first = firstReports.find((item) => item.reviewId === firstJob.reportId);
  assert.equal(first?.status, 'changes_requested', JSON.stringify(firstReports));
  assert.ok(first.reworkHandoff?.issues?.length);
  console.log(JSON.stringify({ stage: 'initial-review', reviewRunId: review.reviewRunId,
    status: first.status, issues: first.issues.length }));

  const cycle = await until(() => invoke(page, 'run.reworkCycles', {
    projectId: fixture.projectId, taskId: fixture.taskId,
  }), (cycles) => cycles.some((entry) => entry.triggerKind === 'review'
    && entry.sourceSnapshotId === fixture.snapshotId && entry.nextRunId), 120);
  const nextRunId = cycle.find((entry) => entry.triggerKind === 'review'
    && entry.sourceSnapshotId === fixture.snapshotId).nextRunId;
  console.log(JSON.stringify({ stage: 'rework-reserved', nextRunId }));
  const nextRun = await until(() => invoke(page, 'run.inspect', {
    projectId: fixture.projectId, runId: nextRunId, afterCursor: 0, limit: 100,
  }), (view) => ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(view.run.state));
  assert.equal(nextRun.run.state, 'succeeded', JSON.stringify(nextRun));
  console.log(JSON.stringify({ stage: 'rework-run', state: nextRun.run.state }));
  const handoff = await until(() => invoke(page, 'run.handoff', {
    projectId: fixture.projectId, runId: nextRunId,
  }), (value) => value?.snapshot != null, 90);
  assert.ok(handoff?.snapshot && !handoff.snapshot.noChange);
  assert.notEqual(handoff.snapshot.snapshotId, fixture.snapshotId);
  console.log(JSON.stringify({ stage: 'rework-handoff', snapshotId: handoff.snapshot.snapshotId }));
  const jobs = await until(() => invoke(page, 'run.reviewJobs', {
    projectId: fixture.projectId, taskId: fixture.taskId,
  }), (items) => items.some((item) => item.developmentRunId === nextRunId
    && item.snapshotId === handoff.snapshot.snapshotId && item.state !== 'running'));
  const followupJob = jobs.find((item) => item.developmentRunId === nextRunId
    && item.snapshotId === handoff.snapshot.snapshotId);
  assert.equal(followupJob.state, 'completed', JSON.stringify(followupJob));
  console.log(JSON.stringify({ stage: 'followup-review-job', state: followupJob.state }));
  const followupReports = await invoke(page, 'run.reviewReports', {
    projectId: fixture.projectId, taskId: fixture.taskId,
  });
  const approved = followupReports.find((item) => item.developmentRunId === nextRunId
    && item.snapshotId === handoff.snapshot.snapshotId);
  assert.equal(approved?.status, 'approved', JSON.stringify(followupReports));
  console.log(JSON.stringify({ stage: 'followup-review-report', status: approved.status }));
  const locks = JSON.parse(execFileSync('python3', ['-c', `
import json,pathlib,sqlite3,sys
p=pathlib.Path(sys.argv[1]); c=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True)
print(json.dumps(c.execute('SELECT profile_id,profile_revision FROM review_jobs WHERE task_id=? ORDER BY rowid',(sys.argv[2],)).fetchall()))
`, database, fixture.taskId], { encoding: 'utf8' }));
  assert.deepEqual(locks, [
    [fixture.reviewerId, fixture.reviewerRevision],
    [fixture.reviewerId, fixture.reviewerRevision],
  ]);
  const workspace = join(root, 'isolated-app-data', 'Forge', 'production',
    'workspaces', 'trees', handoff.snapshot.workspaceId);
  execFileSync(process.execPath, ['test.js'], { cwd: workspace, timeout: 20_000 });
  execFileSync(process.execPath, ['--input-type=module', '-e',
    "import assert from 'node:assert/strict'; import {add} from './math.js'; assert.throws(()=>add('1',2),TypeError);"],
  { cwd: workspace, timeout: 20_000 });
  assert.equal(git('rev-parse', 'HEAD'), sourceHead);
  assert.equal(git('status', '--porcelain'), '');
  await page.reload();
  await page.getByRole('button', { name: '看板', exact:true }).click();
  await page.locator('.board-task').filter({ hasText: 'Validate add' }).click();
  await page.getByRole('tab',{name:'运行',exact:true}).click();
  await page.getByText('Review 与问题历史').waitFor({ timeout: 15_000 });
  await page.getByText('最近报告：approved', { exact: false }).waitFor({ timeout: 15_000 });
  const reworkPanel = page.locator('section[aria-label="有限返工记录"]');
  await page.getByRole('tab',{name:'审查与验收',exact:true}).click();
  await reworkPanel.getByText('第 1 次返工', { exact: false }).waitFor({ timeout: 15_000 });
  await reworkPanel.scrollIntoViewIfNeeded();
  const screenshot = join(repository, 'output', 'playwright',
    'desktop-review-rework-resumed-20260926-1440x900.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: screenshot });
  console.log(JSON.stringify({ stage: 'packaged-review-rework-resumed',
    initialRunId: fixture.runId, initialReviewId: review.reviewRunId,
    reworkRunId: nextRunId, nextSnapshotId: handoff.snapshot.snapshotId,
    followupReviewId: approved.reviewId, reviewerProfile: fixture.reviewerId,
    sourceClean: true, screenshot }));
  const existingChecks = await invoke(page, 'run.verifyJobs', {
    projectId: fixture.projectId, taskId: fixture.taskId,
  });
  const verify = existingChecks.find((item) => item.developmentRunId === nextRunId
    && item.snapshotId === handoff.snapshot.snapshotId && item.kind === 'test')
    ?? await invoke(page, 'run.verifyStart', {
      projectId: fixture.projectId, taskId: fixture.taskId,
      developmentRunId: nextRunId, expectedSnapshotId: handoff.snapshot.snapshotId,
      kind: 'test', presetId: fixture.presetId, idempotencyKey: crypto.randomUUID(),
    });
  const check = await until(() => invoke(page, 'run.verifyJob', {
    projectId: fixture.projectId, verificationId: verify.verificationId,
  }), (job) => job.state !== 'running', 120);
  assert.equal(check.state, 'completed', JSON.stringify(check));
  const report = await invoke(page, 'run.verifyReport', {
    projectId: fixture.projectId, verificationId: check.verificationId,
  });
  assert.equal(report.status, 'passed', JSON.stringify(report));
  assert.equal(report.exitCode, 0);
  const matrix = page.locator('section[aria-label="逐条验收矩阵"]');
  await matrix.getByRole('button', { name: '刷新真实证据' }).click();
  await matrix.getByLabel('当前快照报告（自动项验证必选）')
    .selectOption(report.reportId);
  await matrix.getByLabel('判断依据 / 未验证说明 / 风险接受原因').fill(
    'The corrected snapshot passed the approved fixture test and independent Review.');
  await matrix.getByRole('button', { name: '记录本快照的判断' }).click();
  let acceptance = await invoke(page, 'run.finalAcceptance', {
    projectId: fixture.projectId, taskId: fixture.taskId,
  });
  assert.equal(acceptance.status, 'ready', JSON.stringify(acceptance));
  const finalPanel = page.locator('section[aria-label="人类最终验收"]');
  await finalPanel.getByRole('button', { name: '重新读取交付' }).click();
  await finalPanel.getByLabel('最终验收依据').fill(
    'I checked the corrected code, Review finding resolution, test result and AC evidence.');
  await finalPanel.getByLabel('我已检查当前快照与报告，并明确接受这一交付。').check();
  await finalPanel.getByRole('button', { name: '接受当前版本' }).click();
  acceptance = await invoke(page, 'run.finalAcceptance', {
    projectId: fixture.projectId, taskId: fixture.taskId,
  });
  assert.equal(acceptance.status, 'accepted', JSON.stringify(acceptance));
  const delivery = await invoke(page, 'deliveries.get', {
    projectId: fixture.projectId, taskId: fixture.taskId,
  });
  assert.equal(delivery.snapshotId, handoff.snapshot.snapshotId);
  assert.equal((await board(page, fixture.projectId)).tasks.find((item) =>
    item.id === fixture.taskId)?.state, 'done');
  await finalPanel.scrollIntoViewIfNeeded();
  const acceptedScreenshot = join(repository, 'output', 'playwright',
    'desktop-review-rework-accepted-20260926-1440x900.png');
  await page.screenshot({ path: acceptedScreenshot });
  await closeSafely(desktop);
  desktop = undefined;
  desktop = await electron.launch({ executablePath: executable, args: [], env: environment });
  page = await desktop.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  assert.equal((await board(page, fixture.projectId)).tasks.find((item) =>
    item.id === fixture.taskId)?.state, 'done');
  assert.equal(git('rev-parse', 'HEAD'), sourceHead);
  assert.equal(git('status', '--porcelain'), '');
  console.log(JSON.stringify({ stage: 'packaged-review-rework-accepted',
    reviewRunId: review.reviewRunId, reworkRunId: nextRunId,
    verificationId: report.verificationId, deliveryId: delivery.deliveryId,
    restoredState: 'done', sourceClean: true, screenshot: acceptedScreenshot }));
} finally {
  if (desktop) await closeSafely(desktop).catch(() => undefined);
  if (mounted) native('hdiutil', ['detach', mount]);
  await rm(installRoot, { recursive: true, force: true });
  await rm(mountRoot, { recursive: true, force: true });
}
