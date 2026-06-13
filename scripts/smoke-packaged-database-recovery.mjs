/** Non-destructive recovery drill: open an exported QA SQLite copy in an installed app. */
/* global window */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(root, 'output', 'qa'));
const dmg = process.env.FORGE_RECOVERY_DMG;
const backupArg = process.env.FORGE_RECOVERY_BACKUP;
const projectId = process.env.FORGE_RECOVERY_PROJECT_ID;
const taskId = process.env.FORGE_RECOVERY_TASK_ID;
const runId = process.env.FORGE_RECOVERY_RUN_ID;
if (process.platform !== 'darwin' || process.arch !== 'arm64' ||
  !dmg || !backupArg || !projectId || !taskId || !runId) {
  throw new Error('Recovery drill requires arm64 Mac and explicit DMG, QA backup and IDs');
}
const backup = realpathSync(backupArg);
assert.ok(backup.startsWith(qaRoot + sep) && backup.endsWith('.sqlite'),
  'Only an existing output/qa SQLite export may be used');
assert.ok(existsSync(dmg));
const originalHash = createHash('sha256').update(readFileSync(backup)).digest('hex');
const recoveryRoot = mkdtempSync(join(qaRoot, 'database-recovery-'));
const appData = join(recoveryRoot, 'isolated-app-data');
const database = join(appData, 'Forge', 'production', 'forge.sqlite');
mkdirSync(dirname(database), { recursive:true, mode:0o700 });
copyFileSync(backup, database);
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(mount);
let attached = false;
let app;
function command(name, args) {
  execFileSync(name, args, { stdio:'pipe', timeout:30_000 });
}
async function invoke(page, group, type, payload) {
  const result = await page.evaluate(async ({ group, type, payload }) => {
    const command = { schemaVersion:'1.0', commandId:crypto.randomUUID(), type,
      createdAt:new Date().toISOString(), protocolVersion:'forge-host-protocol/v5', payload };
    return group === 'project' ? window.forge.invokeProject(command) :
      group === 'board' ? window.forge.invokeBoard(command) : window.forge.invokeRun(command);
  }, { group, type, payload });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data;
}
try {
  command('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  attached = true;
  command('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  command('codesign', ['--verify', '--deep', '--strict', installed]);
  command('hdiutil', ['detach', mount]);
  attached = false;
  app = await electron.launch({
    executablePath:join(installed, 'Contents', 'MacOS', 'Forge'), args:[],
    env:{ ...process.env, FORGE_DEV_SERVER_URL:'', FORGE_INTERNAL_TEST_HOME:appData },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button', {name:'Host connected'}).waitFor({timeout:20_000});
  const health = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(health.ok,true);
  assert.equal(health.data.storage.status,'ready');
  assert.equal(health.data.storage.schemaVersion,37);
  const projects = await invoke(page,'project','project.list',{});
  assert.ok(projects.some((project) => project.projectId === projectId));
  const board = await invoke(page,'board','board.snapshot',{projectId});
  assert.ok(board.tasks.some((task) => task.id === taskId && task.state === 'done'));
  const detail = await invoke(page,'board','task.detail',{projectId,taskId});
  assert.ok(detail.detail.runIds.includes(runId));
  const delivery = await invoke(page,'run','deliveries.get',{projectId,taskId});
  assert.ok(delivery?.deliveryId);
  await page.getByRole('button', {name:'研发看板'}).click();
  await page.locator('.board-task').waitFor();
  const screenshot = join(root,'output','playwright','desktop-recovery-drill-20260926-1440x900.png');
  await page.screenshot({path:screenshot});
  const copiedHash = createHash('sha256').update(readFileSync(backup)).digest('hex');
  assert.equal(copiedHash,originalHash,'Recovery drill must never modify the export');
  console.log(JSON.stringify({stage:'packaged-database-recovery',dmg,backup,
    originalHash,recoveryRoot,projectId,taskId,runId,
    deliveryId:delivery.deliveryId,schemaVersion:health.data.storage.schemaVersion,
    screenshot}));
} finally {
  await app?.close();
  if (attached) command('hdiutil',['detach',mount]);
  rmSync(installRoot,{recursive:true,force:true});
}
