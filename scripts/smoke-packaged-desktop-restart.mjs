/** Read back a retained disposable Desktop run from a freshly installed copy of its DMG. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
/* global window */

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(root, 'output', 'qa'));
const dmg = process.env.FORGE_PACKAGE_RESTART_DMG;
const dataArg = process.env.FORGE_PACKAGE_RESTART_DATA;
const expectedRunId = process.env.FORGE_PACKAGE_RESTART_RUN_ID;
const expectedWorkflowId = process.env.FORGE_PACKAGE_RESTART_WORKFLOW_ID;
const expectedReviewModelId = process.env.FORGE_PACKAGE_RESTART_REVIEW_MODEL_ID;
const artifactTag = process.env.FORGE_PACKAGE_RESTART_TAG || 'desktop-priority-20260926';
const checkBackup = process.env.FORGE_PACKAGE_RESTART_BACKUP === '1';
const legacyPresetReadback = process.env.FORGE_PACKAGE_RESTART_LEGACY_PRESET === '1';
if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(artifactTag)) {
  throw new Error('Restart screenshot tag must be a short lowercase slug');
}
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !dmg || !dataArg ||
    !expectedRunId || !expectedWorkflowId || !expectedReviewModelId) {
  throw new Error('Require macOS arm64 and explicit DMG, isolated data, Run, Workflow and Review model');
}
const dataRoot = realpathSync(dataArg);
if (!dataRoot.startsWith(`${qaRoot}${sep}`) ||
    !existsSync(join(dataRoot, 'Forge', 'production', 'forge.sqlite'))) {
  throw new Error('Restart smoke only reads an existing Forge output/qa fixture');
}
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(mount);
let attached = false;
let app;
function command(name, args) {
  execFileSync(name, args, { stdio: 'pipe', timeout: 30_000 });
}
async function invoke(page, group, type, payload) {
  const result = await page.evaluate(async ({ group, type, payload }) => {
    const command = { schemaVersion:'1.0', commandId:crypto.randomUUID(), type,
      createdAt:new Date().toISOString(), protocolVersion:'forge-host-protocol/v5', payload };
    return group === 'project' ? window.forge.invokeProject(command) :
      group === 'board' ? window.forge.invokeBoard(command) : window.forge.invokeRun(command);
  }, { group, type, payload });
  assert.equal(result.ok, true, `${type}: ${JSON.stringify(result)}`);
  return result.data;
}
try {
  command('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  attached = true;
  command('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  command('codesign', ['--verify', '--deep', '--strict', installed]);
  command('hdiutil', ['detach', mount]);
  attached = false;
  app = await electron.launch({ executablePath:join(installed, 'Contents', 'MacOS', 'Forge'),
    args:[], env:{ ...process.env, FORGE_DEV_SERVER_URL:'', FORGE_INTERNAL_TEST_HOME:dataRoot,
      ...(process.env.FORGE_RESTART_CHILD_PATH ?
        { PATH:process.env.FORGE_RESTART_CHILD_PATH } : {}) } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width:1440, height:900 });
  await page.getByRole('button', { name:'Host connected' }).waitFor({ timeout:20_000 });
  const projects = await invoke(page, 'project', 'project.list', {});
  assert.equal(projects.length, 1, 'QA fixture must have one Project');
  const projectId = projects[0].projectId;
  const board = await invoke(page, 'board', 'board.snapshot', { projectId });
  assert.equal(board.tasks.length, 1, 'QA fixture must have one Task');
  const task = board.tasks[0];
  assert.equal(task.state, 'done');
  assert.equal(task.boardColumn, 'done');
  const detail = await invoke(page, 'board', 'task.detail',
    { projectId, taskId:task.id });
  assert.ok(detail.detail.runIds.includes(expectedRunId));
  const config = await invoke(page, 'run', 'run.config', { projectId, runId:expectedRunId });
  assert.equal(config.workflow.id, expectedWorkflowId);
  assert.equal(config.workflow.version, '1');
  assert.equal(config.actualNodeId, 'develop');
  assert.equal(config.stageProfiles.length, 1);
  assert.equal(config.stageProfileDetails?.length, 1,
    'Packaged Host must resolve the exact frozen Reviewer revision');
  assert.equal(config.stageProfileDetails[0].id, config.stageProfiles[0].id);
  assert.equal(config.stageProfileDetails[0].version, config.stageProfiles[0].version);
  assert.equal(config.stageProfileDetails[0].modelId, expectedReviewModelId);
  if (config.commandPresetIds?.length) {
    if (!config.commandPresetLocks?.length) {
      assert.equal(legacyPresetReadback,true,
        'Legacy Run lacks a command lock and may only be read with an explicit readback flag');
    } else {
      assert.deepEqual(config.commandPresetLocks.map((item) => item.presetId),
        config.commandPresetIds);
      const presets = await invoke(page, 'project', 'commandPreset.list', {
        projectId, environmentId:config.environmentId,
      });
      const frozen = config.commandPresetLocks[0];
      const current = presets.find((item) => item.presetId === frozen.presetId);
      assert.equal(current?.revision, frozen.revision);
      assert.equal(current?.approvalHash, frozen.approvalHash);
    }
  }
  const persistedReview = JSON.parse(execFileSync('python3', ['-c',
    "import json,sqlite3,sys,pathlib; p=pathlib.Path(sys.argv[1]); db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True); print(json.dumps(db.execute('SELECT profile_id,profile_revision,model_id FROM review_jobs WHERE development_run_id=?',(sys.argv[2],)).fetchone()))",
    join(dataRoot, 'Forge', 'production', 'forge.sqlite'), expectedRunId],
  { encoding:'utf8', timeout:15_000 }));
  assert.equal(persistedReview[0], config.stageProfiles[0].id);
  assert.equal(String(persistedReview[1]), config.stageProfiles[0].version);
  assert.equal(persistedReview[2], expectedReviewModelId);
  const sources = await invoke(page, 'run', 'context.sources',
    { projectId, runId:expectedRunId });
  assert.deepEqual(sources.map((item) => item.kind).sort(),
    ['retrieved_knowledge', 'validated_memory']);
  assert.ok(sources.every((item) => item.status === 'revoked'));
  const delivery = await invoke(page, 'run', 'deliveries.get',
    { projectId, taskId:task.id });
  assert.ok(delivery?.deliveryId);
  await page.getByRole('button', { name:/Forge fixture 空格/ }).click();
  const environmentPanel = page.locator('section[aria-label="项目环境与命令预设"]');
  await environmentPanel.getByRole('heading', {name:'项目环境与验证命令'}).waitFor();
  console.log(JSON.stringify({stage:'restart-environment',
    text:(await environmentPanel.innerText()).slice(0,1200)}));
  await environmentPanel.getByText('已批准', { exact:false }).first().waitFor();
  await environmentPanel.scrollIntoViewIfNeeded();
  const environmentScreenshot = join(root, 'output', 'playwright',
    `${artifactTag}-project-environment-1440x900.png`);
  await page.screenshot({ path:environmentScreenshot });
  await page.getByRole('button', { name:'设置' }).click();
  let backupPath;
  if (checkBackup) {
    const exportRoot = mkdtempSync(join(dataRoot, 'database-export-'));
    backupPath = join(exportRoot, 'forge-backup.sqlite');
    await app.evaluate(({ dialog }, filePath) => {
      const originalSave = dialog.showSaveDialog.bind(dialog);
      const originalMessage = dialog.showMessageBox.bind(dialog);
      dialog.showSaveDialog = (...args) => {
        const options = args.at(-1);
        if (options?.title === 'Export Forge database backup') {
          return Promise.resolve({ canceled:false, filePath });
        }
        return originalSave(...args);
      };
      dialog.showMessageBox = (...args) => {
        const options = args.at(-1);
        if (options?.title === 'Export Forge database backup') {
          return Promise.resolve({ response:1 });
        }
        return originalMessage(...args);
      };
    }, backupPath);
    const backupPanel = page.getByTestId('database-backup');
    await backupPanel.getByRole('button', { name:'选择位置并导出数据库备份' }).click();
    await backupPanel.getByText('数据库备份已导出', { exact:false }).waitFor({ timeout:30_000 });
    const backupBytes = readFileSync(backupPath);
    const digest = createHash('sha256').update(backupBytes).digest('hex');
    assert.ok((await backupPanel.innerText()).includes(digest));
    const inspection = JSON.parse(execFileSync('python3', ['-c',
      "import json,sqlite3,sys; db=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(json.dumps({'integrity':db.execute('PRAGMA quick_check').fetchone()[0], 'projects':db.execute('SELECT count(*) FROM projects').fetchone()[0], 'tasks':db.execute('SELECT count(*) FROM tasks').fetchone()[0]}))",
      backupPath], { encoding:'utf8', timeout:15_000 }));
    assert.deepEqual(inspection, { integrity:'ok', projects:1, tasks:1 });
    await backupPanel.scrollIntoViewIfNeeded();
    await page.screenshot({ path:join(root, 'output', 'playwright',
      `${artifactTag}-backup-1440x900.png`) });
    console.log(JSON.stringify({ stage:'packaged-database-backup', backupPath,
      sizeBytes:backupBytes.length, sha256:digest, ...inspection }));
  }
  const dependencyPanel = page.getByTestId('desktop-dependencies');
  await dependencyPanel.getByText('git version', { exact:false }).waitFor({ timeout:15_000 });
  await dependencyPanel.getByText('版本与登录已检测 · codex-cli 0.155.1').waitFor();
  if (process.env.FORGE_RESTART_CHILD_PATH) {
    const catalog = await page.evaluate(() => window.forge.agentProfileCatalog());
    const codex = catalog.executors.find((item) => item.executorId === 'executor.codex');
    assert.equal(codex?.available, true,
      'Finder-style launch must pass the real Codex executor capability probe');
  }
  const dependencyText = await dependencyPanel.innerText();
  assert.ok(!dependencyText.includes(dataRoot), 'Settings must not expose the QA data path');
  const dependencyScreenshot = join(root, 'output', 'playwright',
    `${artifactTag}-dependencies-1440x900.png`);
  await dependencyPanel.scrollIntoViewIfNeeded();
  await page.screenshot({ path:dependencyScreenshot });
  await page.getByRole('button', { name:'看板', exact:true }).click();
  const taskCard = page.locator('.board-task').filter({ hasText:task.title });
  await taskCard.waitFor();
  const screenshot = join(root, 'output', 'playwright',
    `${artifactTag}-restarted-1440x900.png`);
  await taskCard.scrollIntoViewIfNeeded();
  await page.screenshot({ path:screenshot });
  await taskCard.click();
  await page.getByRole('tab', {name:'运行',exact:true}).click();
  await page.getByRole('tab', {name:'context'}).click();
  await page.getByText('retrieved_knowledge', {exact:false}).first().waitFor();
  await page.getByText('validated_memory', {exact:false}).first().waitFor();
  const contextScreenshot = join(root, 'output', 'playwright',
    `${artifactTag}-context-sources-1440x900.png`);
  await page.getByText('retrieved_knowledge', {exact:false}).first().scrollIntoViewIfNeeded();
  await page.screenshot({path:contextScreenshot});
  const reviewerLabel = page.getByText('本次 Workflow 冻结 Reviewer', { exact:false });
  await reviewerLabel.waitFor({ timeout:10_000 });
  await page.getByText('Fixture Workflow Reviewer', { exact:false }).waitFor();
  await page.getByText('当前任务状态为 done', { exact:false }).waitFor();
  assert.equal(await page.getByText('Codex 开发当前不可用', { exact:false }).count(), 0);
  await page.getByRole('tab', {name:'审查与验收',exact:true}).click();
  const verifyPanel = page.locator('section[aria-label="验证报告"]');
  try {
    await verifyPanel.getByText('test · passed · exit 0', { exact:false }).waitFor();
  } catch (error) {
    console.error(JSON.stringify({ stage:'restart-verify-failed',
      panelText:await verifyPanel.innerText(),
      host:await page.getByRole('button', { name:/Host (connected|unavailable)/ }).innerText() }));
    throw error;
  }
  await verifyPanel.getByRole('button', {name:'查看 stdout 纯文本'}).click();
  await verifyPanel.getByText('Forge fixture test completed', {exact:false}).waitFor();
  await verifyPanel.scrollIntoViewIfNeeded();
  const verifyScreenshot = join(root, 'output', 'playwright',
    `${artifactTag}-verify-report-1440x900.png`);
  await page.screenshot({ path:verifyScreenshot });
  await page.getByRole('tab', {name:'运行',exact:true}).click();
  await reviewerLabel.scrollIntoViewIfNeeded();
  const reviewerScreenshot = join(root, 'output', 'playwright',
    `${artifactTag}-frozen-reviewer-1440x900.png`);
  await page.screenshot({ path:reviewerScreenshot });
  console.log(JSON.stringify({ stage:'packaged-desktop-restart', dmg, projectId,
    finderStylePath:process.env.FORGE_RESTART_CHILD_PATH ?? null,
    taskId:task.id, runId:expectedRunId, workflowId:config.workflow.id,
    sourceKinds:sources.map((item) => item.kind), reviewerId:persistedReview[0],
    reviewModelId:persistedReview[2], deliveryId:delivery.deliveryId,
    taskState:task.state, backupPath, screenshot, reviewerScreenshot,
    environmentScreenshot, verifyScreenshot, dependencyScreenshot,contextScreenshot,
    legacyPresetReadback:config.commandPresetIds?.length > 0 &&
      !config.commandPresetLocks?.length }));
} finally {
  await app?.close();
  if (attached) command('hdiutil', ['detach', mount]);
  rmSync(installRoot, { recursive:true, force:true });
}
