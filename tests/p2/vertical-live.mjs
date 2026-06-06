import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { ForgePersistence } from '../../packages/persistence/dist/index.js';
import { hostProtocolVersion } from '../../packages/contracts/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireDesktop = createRequire(join(root, 'apps/desktop/package.json'));
const requirePersistence = createRequire(join(root, 'packages/persistence/package.json'));
const Database = requirePersistence('better-sqlite3');
const desktopDirectory = join(root, 'apps/desktop');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'forge-p2-vertical-'));
const source = join(temporaryRoot, 'Orders 中文 with spaces');
const dataDir = join(temporaryRoot, 'forge-data');
const output = join(root, 'output/playwright');
let app;
const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();

async function invokeStart(page, projectId, taskId, revision, model) {
  return page.evaluate(async ({ projectId, taskId, revision, model, protocol }) =>
    globalThis.forge.invokeRun({ schemaVersion: '1.0', commandId: crypto.randomUUID(),
      createdAt: new Date().toISOString(), protocolVersion: protocol, type: 'run.start',
      payload: { projectId, taskId, expectedTaskRevision: revision, modelId: model,
        idempotencyKey: crypto.randomUUID() } }),
  { projectId, taskId, revision, model, protocol: hostProtocolVersion });
}

async function approveManual(page, title, goal, inspectDraft = false) {
  await page.getByRole('button', { name: '手工创建任务' }).click();
  const dialog = page.getByRole('dialog', { name: '手工创建任务草稿' });
  await dialog.getByRole('textbox', { name: '任务标题' }).fill(title);
  await dialog.getByRole('textbox', { name: '目标' }).fill(goal);
  await dialog.getByRole('textbox', { name: '验收条件' }).fill('代码与测试文件真实变化，结果可核查');
  await dialog.getByRole('button', { name: '保存手工草稿' }).click();
  await page.getByRole('button', { name: '提交审批请求' }).waitFor();
  if (inspectDraft) {
    const db = new Database(join(dataDir, 'forge.sqlite'), { readonly: true });
    const row = db.prepare('SELECT draft_id,project_id,revision FROM task_drafts ORDER BY rowid DESC LIMIT 1')
      .get();
    db.close();
    assert.ok(row);
    const before = await readdir(join(dataDir, 'workspaces/records')).catch(() => []);
    const rejected = await invokeStart(page, row.project_id, row.draft_id, row.revision, 'gpt-6-luna');
    assert.equal(rejected.ok, false, 'A Draft cannot be started');
    assert.equal(rejected.error.code, 'TASK_NOT_FOUND');
    assert.deepEqual(await readdir(join(dataDir, 'workspaces/records')).catch(() => []), before,
      'Rejected Draft Start must not create a workspace');
  }
  await page.getByRole('button', { name: '提交审批请求' }).click();
  await page.getByLabel('我已审阅当前目标、验收和范围').check();
  await page.getByRole('button', { name: '批准并加入 TODO' }).click();
  await page.getByText('已批准 · TODO · 尚未开工。此草稿 revision 已冻结。').waitFor();
  await page.getByRole('button', { name: '关闭抽屉' }).click();
  const card = page.locator('.board-task').filter({ hasText: title });
  await card.waitFor();
  const taskId = await card.getAttribute('data-task-id');
  assert.match(taskId, /^[0-9a-f-]{36}$/);
  return { card, taskId };
}

try {
  await mkdir(source);
  await cp(join(root, 'fixtures/orders'), source, { recursive: true });
  git('init', '-q');
  git('config', 'user.name', 'Forge Fixture');
  git('config', 'user.email', 'forge@example.invalid');
  git('add', '.');
  git('commit', '-qm', 'baseline');
  const sourceHead = git('rev-parse', 'HEAD');
  const sourceStatus = git('status', '--porcelain');
  await mkdir(output, { recursive: true });
  app = await electron.launch({ executablePath: requireDesktop('electron'),
    args: [desktopDirectory], env: { ...process.env, FORGE_DEV_SERVER_URL: '',
      FORGE_HOST_DATA_DIR: dataDir } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: /未选择项目/ }).click();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, source);
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByText('Git repository', { exact: false }).waitFor();
  await page.getByRole('button', { name: '继续查看信任范围' }).click();
  await page.getByRole('button', { name: 'Trust this project' }).click();
  await page.getByText('PROJECT CONNECTED').waitFor();
  await page.getByRole('button', { name: '进入 Forge Workspace' }).click();
  await page.getByRole('button', { name: '研发看板' }).click();

  const goal = 'In this isolated fixture, update src/order-total.js to reject non-finite prices and negative or non-integer quantities with TypeError. Add tests/invalid.test.mjs covering those cases, then run npm test.';
  const success = await approveManual(page, 'Validate order totals', goal, true);
  assert.equal(git('rev-parse', 'HEAD'), sourceHead);
  assert.equal(git('status', '--porcelain'), sourceStatus);
  await success.card.click();
  await page.getByRole('dialog', { name: '任务详情' }).waitFor();
  await page.getByRole('combobox', { name: 'Codex 模型' }).waitFor({ timeout: 30_000 });
  const models = await page.getByRole('combobox', { name: 'Codex 模型' })
    .locator('option').allTextContents();
  assert.ok(models.length > 0, 'Codex probe must report a real available model');
  const chosenModel = models.includes('gpt-6-luna') ? 'gpt-6-luna' : models[0];
  await page.getByRole('combobox', { name: 'Codex 模型' }).selectOption(chosenModel);
  await page.getByRole('button', { name: '明确启动开发' }).click();
  try {
    await page.getByText('已冻结 CodeSnapshot', { exact: false }).waitFor({ timeout: 90_000 });
  } catch (error) {
    console.error('Run inspector after start:', await page.locator('.run-inspector').textContent());
    await page.screenshot({ path: join(output, 'p2-10-debug-1440x900.png') });
    throw error;
  }
  await page.screenshot({ path: join(output, 'p2-10-success-1440x900.png') });
  await page.getByRole('tab', { name: 'diff' }).click();
  await page.getByText('TypeError', { exact: false }).first().waitFor();
  await page.locator('.forge-drawer').evaluate((panel) => { panel.scrollTop = panel.scrollHeight; });
  await page.screenshot({ path: join(output, 'p2-10-diff-1440x900.png') });
  await page.getByRole('button', { name: '关闭抽屉' }).click();

  const cancellation = await approveManual(page, 'Inspect long command cancellation',
    'Run node scripts/hold-open.mjs as a command in the isolated workspace, wait for it to finish, then add a comment to src/order-total.js. Do not skip running the command.');
  await cancellation.card.click();
  await page.getByRole('dialog', { name: '任务详情' }).waitFor();
  await page.getByRole('combobox', { name: 'Codex 模型' }).waitFor({ timeout: 30_000 });
  await page.getByRole('combobox', { name: 'Codex 模型' }).selectOption(chosenModel);
  await page.getByRole('button', { name: '明确启动开发' }).click();
  await page.getByText('command.started', { exact: true }).waitFor({ timeout: 90_000 });
  const concurrentStorage = new ForgePersistence(dataDir);
  await concurrentStorage.open(); concurrentStorage.migrate();
  const activeProjectId = concurrentStorage.activeProject()?.projectId;
  assert.ok(activeProjectId);
  const taskRevision = concurrentStorage.taskDetail(activeProjectId, cancellation.taskId)
    .detail.contract.revision;
  concurrentStorage.close();
  const overlap = await invokeStart(page, activeProjectId, cancellation.taskId,
    taskRevision, chosenModel);
  assert.equal(overlap.ok, false, 'Second writer must be rejected while first Run is active');
  assert.equal(overlap.error.code, 'RUN_CONFLICT');
  await page.getByRole('button', { name: '停止此 Run' }).click();
  await page.locator('.run-head').getByText('cancelled', { exact: true })
    .waitFor({ timeout: 30_000 });
  await page.screenshot({ path: join(output, 'p2-10-cancelled-1440x900.png') });

  assert.equal(git('rev-parse', 'HEAD'), sourceHead);
  assert.equal(git('status', '--porcelain'), sourceStatus);
  await app.close(); app = null;

  const storage = new ForgePersistence(dataDir);
  await storage.open(); storage.migrate();
  const project = storage.activeProject();
  assert.ok(project);
  const successRun = storage.listTaskRuns(project.projectId, success.taskId)[0];
  const stoppedRun = storage.listTaskRuns(project.projectId, cancellation.taskId)[0];
  assert.equal(successRun?.state, 'succeeded');
  assert.equal(stoppedRun?.state, 'cancelled');
  const handoff = storage.getDevelopmentHandoff(project.projectId, successRun.runId);
  assert.ok(handoff);
  assert.deepEqual(handoff.snapshot.files.map((file) => file.path).sort(),
    ['src/order-total.js', 'tests/invalid.test.mjs']);
  assert.ok(handoff.stepResult.acceptanceResults.every((item) => item.status === 'unverified'));
  assert.equal(storage.getDevelopmentHandoff(project.projectId, stoppedRun.runId), null);
  const successEvidence = storage.inspectRun(project.projectId, successRun.runId, 0, 100);
  const stoppedEvidence = storage.inspectRun(project.projectId, stoppedRun.runId, 0, 100);
  assert.ok(successEvidence.diff?.files.length);
  assert.ok(stoppedEvidence.observations.some((item) => item.type === 'run.cancelled'));
  assert.ok(stoppedEvidence.observations.some((item) => item.type === 'command.started'));
  storage.close();
  const records = await readdir(join(dataDir, 'workspaces/records'));
  const matched = [];
  for (const name of records) {
    if (!name.endsWith('.json')) continue;
    const record = JSON.parse(await readFile(join(dataDir, 'workspaces/records', name), 'utf8'));
    if (record.ownerRunId === successRun.runId) matched.push(record);
  }
  assert.equal(matched.length, 1);
  const code = await readFile(join(matched[0].rootPath, 'src/order-total.js'), 'utf8');
  assert.match(code, /TypeError/);
  const testOut = execFileSync('npm', ['test'], { cwd: matched[0].rootPath, encoding: 'utf8' });
  assert.match(testOut, /pass/);
  console.log(JSON.stringify({ result:'pass', model:chosenModel, sourceUnchanged:true,
    successRunId:successRun.runId, successState:successRun.state,
    snapshotId:handoff.snapshot.snapshotId, changedFiles:handoff.snapshot.files.map((file)=>file.path),
    cancelledRunId:stoppedRun.runId, cancelledState:stoppedRun.state,
    draftStartRejected:'TASK_NOT_FOUND', concurrentStartRejected:overlap.error.code,
    cancelledExecutionTrace:true,
    formalAcceptance:'unverified', screenshots:[
      'output/playwright/p2-10-success-1440x900.png',
      'output/playwright/p2-10-diff-1440x900.png',
      'output/playwright/p2-10-cancelled-1440x900.png'] }, null, 2));
} finally {
  await app?.close();
  await rm(temporaryRoot, { recursive: true, force: true });
}
