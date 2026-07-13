/** Read a real crashed Codex Run in an isolated installed app without restarting an Agent. */
/* global window */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(root, 'output', 'qa'));
const sourceArg = process.env.FORGE_INTERRUPTED_SOURCE_DB;
const dmg = process.env.FORGE_INTERRUPTED_READBACK_DMG;
const tag = process.env.FORGE_INTERRUPTED_READBACK_TAG || 'desktop-interrupted-readback-20260926';
if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(tag)) throw new Error('Invalid screenshot tag');
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !sourceArg ||
    !dmg || !existsSync(dmg)) {
  throw new Error('Require macOS arm64, an existing QA database and an internal DMG');
}
const source = realpathSync(sourceArg);
if (!source.startsWith(`${qaRoot}${sep}`) || !source.endsWith(`${sep}forge.sqlite`)) {
  throw new Error('Readback only accepts an existing output/qa Forge SQLite database');
}
const liveReadonly = process.env.FORGE_INTERRUPTED_ORIGINAL_READONLY === '1';
const verifyRestoreRefusal = process.env.FORGE_INTERRUPTED_RESTORE_REFUSAL === '1';
if (liveReadonly && verifyRestoreRefusal) {
  throw new Error('Restore refusal requires a disposable writable SQLite copy');
}
const fixture = liveReadonly ? dirname(dirname(dirname(source))) :
  mkdtempSync(join(qaRoot, 'desktop-interrupted-readback-'));
const dataRoot = liveReadonly ? fixture : join(fixture, 'isolated-app-data');
const database = liveReadonly ? source : join(dataRoot, 'Forge', 'production', 'forge.sqlite');
const restoreBackup = join(fixture, 'interrupted-backup.sqlite');
if (liveReadonly && (dirname(source) !== join(dataRoot, 'Forge', 'production') ||
    !dataRoot.startsWith(`${qaRoot}${sep}`))) {
  throw new Error('Read-only preview requires a standard isolated QA data directory');
}
if (!liveReadonly) mkdirSync(join(dataRoot, 'Forge', 'production'), { recursive: true });
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(mount);
function command(executable, argv) {
  return execFileSync(executable, argv, { encoding: 'utf8', timeout: 30_000 }).trim();
}
function inspection() {
  return JSON.parse(command('python3', ['-c',
    "import json,sqlite3,sys; db=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(json.dumps({'integrity':db.execute('PRAGMA quick_check').fetchone()[0], 'runs':db.execute('SELECT run_id,state FROM runs').fetchall(), 'leases':db.execute('SELECT state FROM run_workspace_leases').fetchall()}))",
    database]));
}
if (!liveReadonly) command('python3', ['-c',
  "import sqlite3,sys; source=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); destination=sqlite3.connect(sys.argv[2]); source.backup(destination); destination.close(); source.close()",
  source, database]);
if (verifyRestoreRefusal) command('python3', ['-c',
  "import sqlite3,sys; source=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); destination=sqlite3.connect(sys.argv[2]); source.backup(destination); destination.close(); source.close()",
  database, restoreBackup]);
const backupHash = verifyRestoreRefusal ? createHash('sha256').update(readFileSync(restoreBackup)).digest('hex') : null;
const before = inspection();
assert.equal(before.integrity, 'ok');
assert.equal(before.runs.length, 1);
assert.equal(before.runs[0][1], 'interrupted');
assert.deepEqual(before.leases, [['quarantined']]);
let mounted = false;
let app;
async function invoke(page, group, type, payload) {
  const response = await page.evaluate(async ({ group, type, payload }) => {
    const envelope = { schemaVersion:'1.0', commandId:crypto.randomUUID(), type,
      createdAt:new Date().toISOString(), protocolVersion:'forge-host-protocol/v5', payload };
    return group === 'project' ? window.forge.invokeProject(envelope) :
      group === 'board' ? window.forge.invokeBoard(envelope) : window.forge.invokeRun(envelope);
  }, { group, type, payload });
  assert.equal(response.ok, true, `${type}: ${JSON.stringify(response)}`);
  return response.data;
}
try {
  command('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  mounted = true;
  command('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  command('codesign', ['--verify', '--deep', '--strict', installed]);
  command('hdiutil', ['detach', mount]); mounted = false;
  app = await electron.launch({ executablePath:join(installed, 'Contents', 'MacOS', 'Forge'),
    args:[], env:{ ...process.env, FORGE_DEV_SERVER_URL:'',
      FORGE_INTERNAL_TEST_HOME:dataRoot,
      ...(liveReadonly ? { FORGE_PYTHON_DB_READ_ONLY:'1' } : {}) } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width:1440, height:900 });
  await page.getByRole('button', { name:'Host connected' }).waitFor({ timeout:20_000 });
  const [project] = await invoke(page, 'project', 'project.list', {});
  assert.ok(project?.projectId);
  assert.ok(project.rootPath.startsWith(`${qaRoot}${sep}`),
    'Only an existing disposable QA project may be probed');
  const sourceStatus = execFileSync('git', ['status', '--porcelain'], {
    cwd:project.rootPath, encoding:'utf8', timeout:10_000,
    env:{...process.env,GIT_OPTIONAL_LOCKS:'0'} });
  const board = await invoke(page, 'board', 'board.snapshot', { projectId:project.projectId });
  assert.equal(board.tasks.length, 1);
  const task = board.tasks[0];
  const runs = await invoke(page, 'run', 'run.list', {
    projectId:project.projectId, taskId:task.id });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runId, before.runs[0][0]);
  assert.equal(runs[0].state, 'interrupted');
  if (!liveReadonly) {
    const recovery = await invoke(page, 'run', 'run.recoveryStatus', {
      projectId:project.projectId, runId:runs[0].runId });
    assert.equal(recovery.state, 'awaiting_reboot',
      'An installed Host must not treat an old process journal as proof of a reboot');
    assert.equal('bootId' in recovery, false);
    await app.evaluate(({dialog}) => {
      dialog.showMessageBox = async () => ({response:1,checkboxChecked:false});
    });
    const unproven = await page.evaluate(async ({projectId, runId, recovery}) =>
      window.forge.invokeRun({schemaVersion:'1.0', commandId:crypto.randomUUID(),
        type:'run.recoveryResolve', createdAt:new Date().toISOString(),
        protocolVersion:'forge-host-protocol/v5', payload:{projectId, runId,
          expectedRunRevision:recovery.runRevision,
          expectedWorkspaceId:recovery.workspaceId, confirmed:true}}),
    {projectId:project.projectId, runId:runs[0].runId, recovery});
    assert.equal(unproven.ok, false);
    assert.equal(unproven.error.code, 'RUN_RECOVERY_PROOF_REQUIRED');
    const capabilities = await invoke(page, 'run', 'run.capabilities', {
      projectId:project.projectId, taskId:task.id });
    assert.equal(capabilities.available, false);
    assert.ok(capabilities.warnings.includes('RUN_RECOVERY_REQUIRED'));
    const missingWorkspace = await page.evaluate(async ({ projectId, runId }) =>
      window.forge.invokeRun({ schemaVersion:'1.0', commandId:crypto.randomUUID(),
        type:'run.recoveryPreview', createdAt:new Date().toISOString(),
        protocolVersion:'forge-host-protocol/v5', payload:{ projectId, runId } }),
    { projectId:project.projectId, runId:runs[0].runId });
    assert.equal(missingWorkspace.ok, false,
      'A copied database must not make a missing historical worktree look recoverable');
    assert.equal(missingWorkspace.error.code, 'RUN_RECOVERY_EVIDENCE_INVALID');
  }
  await page.getByRole('button', { name:'看板', exact:true }).click();
  await page.locator('.board-task').first().click();
  await page.getByRole('tab',{name:'运行',exact:true}).click();
  await page.getByText('本次 Run 在进程结果无法确认时中断', {
    exact:false }).waitFor({ timeout:12_000 });
  await page.getByText('工作区已隔离', { exact:false }).waitFor();
  if (!liveReadonly) {
    await page.getByText('只关闭 Forge 或让 Mac 睡眠不足', {exact:false}).waitFor();
    assert.equal(await page.getByRole('button', {
      name:'保留旧工作区并允许新 Run',
    }).count(), 0, 'The installed UI exposed recovery on the original boot');
  }
  const start = page.getByRole('button', { name:'明确启动开发' });
  assert.equal(await start.count(), 0,
    'An interrupted active Task must not expose a new Development start action');
  if (liveReadonly) {
    const preview = await invoke(page, 'run', 'run.recoveryPreview', {
      projectId:project.projectId, runId:runs[0].runId });
    assert.equal(preview.basis, 'live-worktree-unverified');
    assert.equal(preview.runId, runs[0].runId);
    assert.equal(preview.diff.capturedAt.length > 10, true);
    assert.equal(JSON.stringify(preview).includes(project.rootPath), false);
    await page.getByRole('button', { name:'查看隔离工作区当前变更' }).click();
    await page.getByText('租约继续隔离', { exact:false }).waitFor();
    await page.getByText('不是冻结快照', { exact:false }).waitFor();
  }
  const screenshot = join(root, 'output', 'playwright', `${tag}-1440x900.png`);
  await page.getByText('工作区已隔离', { exact:false }).scrollIntoViewIfNeeded();
  await page.screenshot({ path:screenshot });
  let restoreScreenshot = null;
  if (verifyRestoreRefusal) {
    const profileBefore = await page.evaluate(() => window.forge.databaseProfileStatus());
    const hostBefore = await page.evaluate(() => window.forge.hostHealth());
    await app.evaluate(({dialog}, path) => {
      dialog.showOpenDialog = async () => ({canceled:false,filePaths:[path]});
      dialog.showMessageBox = async () => ({response:1,checkboxChecked:false});
    }, restoreBackup);
    await page.keyboard.press('Escape');
    await page.locator('.forge-dialog:has(> .task-detail)').waitFor({state:'hidden'});
    await page.getByRole('button', {name:'设置'}).click();
    await page.getByRole('button', {name:'选择备份并恢复到独立数据集'}).click();
    await page.getByText('当前数据集仍有中断的开发、审查或验证记录', {exact:false})
      .waitFor({timeout:20_000});
    const profileAfter = await page.evaluate(() => window.forge.databaseProfileStatus());
    const hostAfter = await page.evaluate(() => window.forge.hostHealth());
    assert.deepEqual(profileAfter, profileBefore, 'Recovery uncertainty changed the data profile');
    assert.equal(hostAfter.data.pid, hostBefore.data.pid,
      'Recovery refusal restarted the owned Host');
    assert.equal(createHash('sha256').update(readFileSync(restoreBackup)).digest('hex'), backupHash,
      'The attempted restore changed the selected backup');
    restoreScreenshot = join(root, 'output', 'playwright', `${tag}-restore-refused-1440x900.png`);
    await page.screenshot({path:restoreScreenshot});
  }
  assert.deepEqual(inspection(), before, 'Installed Host changed interrupted Run or lease');
  assert.equal(execFileSync('git', ['status', '--porcelain'], {
    cwd:project.rootPath, encoding:'utf8', timeout:10_000,
    env:{...process.env,GIT_OPTIONAL_LOCKS:'0'} }), sourceStatus,
  'Installed readback changed the disposable source repository');
  console.log(JSON.stringify({ stage:liveReadonly ? 'packaged-quarantined-preview' :
    'packaged-interrupted-run-readback', dmg,
    runId:runs[0].runId, runState:runs[0].state, leaseState:before.leases[0][0],
    startUnavailable:true, restoreRefused:verifyRestoreRefusal,
    qaFixture:fixture, readonly:liveReadonly, screenshot, restoreScreenshot }));
} finally {
  if (app) {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response:1, checkboxChecked:false });
    }).catch(() => undefined);
    await app.close();
  }
  if (mounted) command('hdiutil', ['detach', mount]);
  rmSync(installRoot, { recursive:true, force:true });
}
