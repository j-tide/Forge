/** Read a retained successful Run through a fresh package; never start a model. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
/* global window */

const repository = resolve(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(repository, 'output', 'qa'));
const buildRoot = realpathSync(join(repository, 'build', 'macos'));
const sourceArgument = process.env.FORGE_REVIEWER_READBACK_DATA;
const dmgArgument = process.env.FORGE_REVIEWER_READBACK_DMG;
const screenshotArgument = process.env.FORGE_REVIEWER_READBACK_SCREENSHOT;
if (process.platform !== 'darwin' || process.arch !== 'arm64' ||
    !sourceArgument || !dmgArgument) {
  throw new Error('Require macOS arm64, an existing QA data directory and an internal DMG');
}
const source = realpathSync(sourceArgument);
const dmg = realpathSync(dmgArgument);
if (!source.startsWith(`${qaRoot}${sep}`) || !dmg.startsWith(`${buildRoot}${sep}`) ||
    !existsSync(join(source, 'Forge', 'production', 'forge.sqlite'))) {
  throw new Error('Readback accepts only retained Forge QA data and an internal build');
}
const screenshotRoot = realpathSync(join(repository, 'output', 'playwright'));
const screenshot = screenshotArgument ?? join(screenshotRoot,
  'desktop-reviewer-model-20260926-historical-readback-1440x900.png');
if (!isAbsolute(screenshot) || !screenshot.startsWith(`${screenshotRoot}${sep}`)) {
  throw new Error('Screenshot must be inside output/playwright');
}
const acceptanceScreenshot = screenshot.replace(/\.png$/, '-acceptance.png');
const tamperedScreenshot = screenshot.replace(/\.png$/, '-tampered.png');

const isolated = mkdtempSync(join(tmpdir(), 'forge-reviewer-readback-'));
const dataRoot = join(isolated, 'isolated-app-data');
const database = join(dataRoot, 'Forge', 'production', 'forge.sqlite');
const mount = join(isolated, 'mount');
const installed = join(isolated, 'Forge INTERNAL.app');
mkdirSync(dirname(database), { recursive:true });
mkdirSync(mount);
const backup = `import sqlite3, sys\n`
  + `source = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)\n`
  + `target = sqlite3.connect(sys.argv[2])\n`
  + `source.backup(target)\n`
  + `target.close()\nsource.close()\n`;
execFileSync('python3', ['-c', backup,
  join(source, 'Forge', 'production', 'forge.sqlite'), database]);

function command(name, args) {
  execFileSync(name, args, { stdio:'pipe', timeout:30_000 });
}
let mounted = false;
let app;
try {
  command('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  mounted = true;
  command('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  command('hdiutil', ['detach', mount]);
  mounted = false;
  command('codesign', ['--verify', '--deep', '--strict', installed]);
  app = await electron.launch({ executablePath:join(installed, 'Contents', 'MacOS', 'Forge'),
    args:[], env:{ ...process.env, FORGE_DEV_SERVER_URL:'', FORGE_INTERNAL_TEST_HOME:dataRoot } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width:1440, height:900 });
  await page.getByRole('button', { name:'Host connected' }).waitFor({ timeout:20_000 });
  const reply = await page.evaluate(async () => {
    const envelope = (type, payload) => ({ schemaVersion:'1.0',
      commandId:crypto.randomUUID(), type, createdAt:new Date().toISOString(),
      protocolVersion:'forge-host-protocol/v5', payload });
    const projects = await window.forge.invokeProject(envelope('project.list', {}));
    if (!projects.ok || projects.data.length !== 1) return { projects };
    const projectId = projects.data[0].projectId;
    const board = await window.forge.invokeBoard(envelope('board.snapshot', { projectId }));
    if (!board.ok || board.data.tasks.length !== 1) return { projects, board };
    const taskId = board.data.tasks[0].id;
    const runs = await window.forge.invokeRun(envelope('run.list', { projectId, taskId }));
    if (!runs.ok || runs.data.length !== 1) return { projects, board, runs };
    const config = await window.forge.invokeRun(envelope('run.config', {
      projectId, runId:runs.data[0].runId }));
    const capabilities = await window.forge.invokeRun(envelope('run.capabilities', {
      projectId, taskId }));
    return { projectId, taskId, board, runs, config, capabilities };
  });
  assert.equal(reply.board?.data?.tasks?.[0]?.state, 'done');
  assert.equal(reply.runs?.data?.[0]?.state, 'succeeded');
  assert.equal(reply.config?.ok, true);
  assert.deepEqual(reply.config.data.stageProfiles, []);
  assert.equal(reply.capabilities?.ok, true);
  assert.equal(reply.capabilities.data.available, true,
    'Reviewer model control requires a genuinely available local Codex capability');
  await page.getByRole('button', { name:'研发看板' }).click();
  await page.locator('.board-task').first().click();
  const reviewer = page.getByLabel('Reviewer 模型');
  await reviewer.waitFor({ timeout:20_000 });
  const modelIds = reply.capabilities.data.modelIds;
  assert.ok(modelIds.length > 0);
  assert.equal(await reviewer.inputValue(), modelIds[0]);
  await reviewer.selectOption(modelIds.at(-1));
  assert.equal(await reviewer.inputValue(), modelIds.at(-1));
  assert.equal(await page.getByLabel('Reviewer Profile').inputValue(), '');
  const reviewButton = page.getByRole('button', { name:'明确启动只读 Review' });
  assert.equal(await reviewButton.isDisabled(), true);
  await page.getByText('此快照已由 Owner 最终接受', { exact:false }).waitFor();
  await page.getByText('逐项判断作为历史保留', { exact:false }).waitFor();
  assert.equal(await page.getByRole('button', { name:'记录本快照的判断' }).count(), 0);
  const gate = await page.evaluate(async ({ projectId, taskId, runId, modelId }) => {
    const envelope = (type, payload) => ({ schemaVersion:'1.0',
      commandId:crypto.randomUUID(), type, createdAt:new Date().toISOString(),
      protocolVersion:'forge-host-protocol/v5', payload });
    const read = (type, payload) => window.forge.invokeRun(envelope(type, payload));
    const list = { projectId, taskId };
    const handoff = await read('run.handoff', { projectId, runId });
    const beforeReview = await read('run.reviewJobs', list);
    const beforeVerify = await read('run.verifyJobs', list);
    const beforeMatrix = await read('run.acceptanceMatrix', list);
    const beforeFinal = await read('run.finalAcceptance', list);
    if (!handoff.ok || !beforeReview.ok || !beforeVerify.ok ||
        !beforeMatrix.ok || !beforeFinal.ok) {
      return { handoff, beforeReview, beforeVerify, beforeMatrix, beforeFinal };
    }
    const source = { projectId, taskId, developmentRunId:runId,
      expectedSnapshotId:handoff.data.snapshot.snapshotId };
    const review = await read('run.reviewStart', { ...source, modelId,
      idempotencyKey:crypto.randomUUID() });
    const verify = await read('run.verifyStart', { ...source, kind:'test',
      presetId:null, idempotencyKey:crypto.randomUUID() });
    const criterion = beforeMatrix.data.criteria[0];
    const acceptance = criterion && await read('run.acceptanceDecide', {
      projectId, taskId, expectedSnapshotId:source.expectedSnapshotId,
      expectedContractRevision:beforeMatrix.data.contractRevision,
      criterionId:criterion.criterion.id, status:'risk_accepted', reportId:null,
      reason:'Attempted to change a criterion after Owner acceptance.',
      idempotencyKey:crypto.randomUUID(),
    });
    const waiver = beforeFinal.data.reviewReportId && await read('run.issueWaive', {
      projectId, taskId, issueId:crypto.randomUUID(),
      expectedSnapshotId:source.expectedSnapshotId,
      expectedReviewId:beforeFinal.data.reviewReportId, expectedIssueRevision:1,
      nonSecurityConfirmed:true,
      reason:'Attempted to waive an issue after Owner acceptance.',
      idempotencyKey:crypto.randomUUID(),
    });
    const afterReview = await read('run.reviewJobs', list);
    const afterVerify = await read('run.verifyJobs', list);
    const afterMatrix = await read('run.acceptanceMatrix', list);
    const afterFinal = await read('run.finalAcceptance', list);
    return { review, verify, acceptance, waiver, beforeReview, beforeVerify,
      beforeMatrix, beforeFinal, afterReview, afterVerify, afterMatrix, afterFinal };
  }, { projectId:reply.projectId, taskId:reply.taskId,
    runId:reply.runs.data[0].runId, modelId:await reviewer.inputValue() });
  assert.equal(gate.review?.ok, false, JSON.stringify(gate));
  assert.equal(gate.review.error.code, 'REVIEW_RESULT_STALE');
  assert.equal(gate.verify?.ok, false, JSON.stringify(gate));
  assert.equal(gate.verify.error.code, 'VERIFY_SOURCE_STALE');
  assert.equal(gate.afterReview?.ok, true);
  assert.equal(gate.afterVerify?.ok, true);
  assert.deepEqual(gate.afterReview.data, gate.beforeReview.data);
  assert.deepEqual(gate.afterVerify.data, gate.beforeVerify.data);
  assert.equal(gate.beforeFinal?.data?.status, 'accepted');
  assert.equal(gate.acceptance?.ok, false, `Acceptance response: ${JSON.stringify(gate.acceptance)}`);
  assert.equal(gate.acceptance.error.code, 'ACCEPTANCE_SOURCE_STALE');
  assert.equal(gate.waiver?.ok, false, `Waiver response: ${JSON.stringify(gate.waiver)}`);
  assert.equal(gate.waiver.error.code, 'ACCEPTANCE_SOURCE_STALE');
  assert.deepEqual(gate.afterMatrix?.data, gate.beforeMatrix.data);
  assert.equal(gate.afterFinal?.data?.status, 'accepted');
  assert.equal(gate.afterFinal.data.basisHash, gate.beforeFinal.data.basisHash);
  await reviewer.scrollIntoViewIfNeeded();
  await page.screenshot({ path:screenshot });
  await page.getByText('逐项判断作为历史保留', { exact:false }).scrollIntoViewIfNeeded();
  await page.screenshot({ path:acceptanceScreenshot });
  const chosenModel = await reviewer.inputValue();

  await app.close();
  app = undefined;
  const tamper = `import sqlite3, sys, uuid, datetime\n`
    + `db = sqlite3.connect(sys.argv[1])\n`
    + `row = db.execute('SELECT project_id,task_id,snapshot_id,contract_revision,criterion_id,status,report_id FROM acceptance_decisions WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1', sys.argv[2:4]).fetchone()\n`
    + `assert row is not None\n`
    + `db.execute('INSERT INTO acceptance_decisions(decision_id,idempotency_key,project_id,task_id,snapshot_id,contract_revision,criterion_id,status,report_id,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', (str(uuid.uuid4()), str(uuid.uuid4()), *row, 'Fixture-only evidence inserted after acceptance.', datetime.datetime.now(datetime.timezone.utc).isoformat()))\n`
    + `db.commit()\ndb.close()\n`;
  execFileSync('python3', ['-c', tamper, database, reply.projectId, reply.taskId]);
  app = await electron.launch({ executablePath:join(installed, 'Contents', 'MacOS', 'Forge'),
    args:[], env:{ ...process.env, FORGE_DEV_SERVER_URL:'', FORGE_INTERNAL_TEST_HOME:dataRoot } });
  const tamperedPage = await app.firstWindow();
  await tamperedPage.setViewportSize({ width:1440, height:900 });
  await tamperedPage.getByRole('button', { name:'Host connected' }).waitFor({ timeout:20_000 });
  const tampered = await tamperedPage.evaluate(async ({ projectId, taskId, snapshotId,
    modelId }) => {
    const envelope = (type, payload) => ({ schemaVersion:'1.0',
      commandId:crypto.randomUUID(), type, createdAt:new Date().toISOString(),
      protocolVersion:'forge-host-protocol/v5', payload });
    const view = await window.forge.invokeRun(envelope('run.finalAcceptance', { projectId, taskId }));
    const board = await window.forge.invokeBoard(envelope('board.snapshot', { projectId }));
    if (!view.ok || !board.ok) return { view, board };
    const retry = await window.forge.invokeRun(envelope('run.finalDecide', {
      projectId, taskId, expectedSnapshotId:snapshotId,
      expectedContractRevision:view.data.contractRevision,
      expectedBasisHash:view.data.basisHash, decision:'accept',
      reason:'Attempted to sign an externally altered basis again.',
      idempotencyKey:crypto.randomUUID(),
    }));
    const beforeRuns = await window.forge.invokeRun(envelope('run.list', { projectId, taskId }));
    const start = await window.forge.invokeRun(envelope('run.start', {
      projectId, taskId, expectedTaskRevision:view.data.contractRevision,
      modelId, idempotencyKey:crypto.randomUUID(),
    }));
    const afterRuns = await window.forge.invokeRun(envelope('run.list', { projectId, taskId }));
    return { view, board, retry, start, beforeRuns, afterRuns };
  }, { projectId:reply.projectId, taskId:reply.taskId,
    snapshotId:gate.beforeMatrix.data.snapshotId, modelId:chosenModel });
  assert.equal(tampered.view?.ok, true);
  assert.equal(tampered.view.data.status, 'unavailable');
  assert.ok(tampered.view.data.blockers.includes('ACCEPTANCE_BASIS_CHANGED'));
  assert.equal(tampered.board?.ok, true);
  assert.notEqual(tampered.board.data.tasks[0]?.state, 'done');
  assert.equal(tampered.retry?.ok, false);
  assert.equal(tampered.retry.error.code, 'ACCEPTANCE_SOURCE_STALE');
  assert.equal(tampered.start?.ok, false);
  assert.equal(tampered.start.error.code, 'RUN_CONFLICT');
  assert.deepEqual(tampered.afterRuns?.data, tampered.beforeRuns?.data);
  await tamperedPage.getByRole('button', { name:'研发看板' }).click();
  await tamperedPage.locator('.board-task').first().click();
  await tamperedPage.getByRole('alert').filter({ hasText:'已接受交付的证据发生变化' })
    .first().scrollIntoViewIfNeeded();
  await tamperedPage.getByText('新运行和证据写入已暂停', { exact:false }).first().waitFor();
  const tamperedReview = tamperedPage.getByRole('button', { name:'明确启动只读 Review' });
  if (await tamperedReview.count()) assert.equal(await tamperedReview.isDisabled(), true);
  assert.equal(await tamperedPage.getByRole('button', { name:'明确启动验证' }).count(), 0);
  assert.equal(await tamperedPage.getByRole('button', { name:'记录本快照的判断' }).count(), 0);
  assert.equal(await tamperedPage.getByRole('button', { name:'明确启动开发' }).count(), 0);
  await tamperedPage.screenshot({ path:tamperedScreenshot });
  console.log(JSON.stringify({ stage:'packaged-accepted-gate-readback',
    projectId:reply.projectId, taskId:reply.taskId,
    historicalRunId:reply.runs.data[0].runId, chosenModel,
    reviewRejected:gate.review.error.code, verifyRejected:gate.verify.error.code,
    acceptanceRejected:gate.acceptance.error.code,
    advisoryWaiverRejected:gate.waiver.error.code,
    tamperedStatus:tampered.view.data.status,
    tamperedRetryRejected:tampered.retry.error.code,
    tamperedRunStartRejected:tampered.start.error.code,
    modelCall:false, screenshot, acceptanceScreenshot, tamperedScreenshot }));
} finally {
  if (app) {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response:1 });
    }).catch(() => undefined);
    await app.close().catch(() => undefined);
  }
  if (mounted) command('hdiutil', ['detach', mount]);
  rmSync(isolated, { recursive:true, force:true });
}
