/** Read an existing, real Review/rework delivery using a newly built internal DMG. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
/* global window */

const repository = resolve(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(repository, 'output', 'qa'));
const dataArgument = process.env.FORGE_PROFILE_READBACK_DATA;
const dmg = process.env.FORGE_PROFILE_READBACK_DMG;
const artifactTag = process.env.FORGE_PROFILE_READBACK_TAG || 'desktop-profile-context-20260926';
if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(artifactTag)) {
  throw new Error('Readback screenshot tag must be a short lowercase slug');
}
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !dataArgument ||
    !dmg || !existsSync(dmg)) {
  throw new Error('Require macOS arm64, an existing QA data directory and an internal DMG');
}
const dataRoot = realpathSync(dataArgument);
if (!dataRoot.startsWith(`${qaRoot}${sep}`) ||
    !existsSync(join(dataRoot, 'Forge', 'production', 'forge.sqlite'))) {
  throw new Error('Readback is limited to an existing output/qa SQLite fixture');
}
const initialRunId = 'f35fee0c-d37a-442e-9864-9a444a8558e3';
const reworkRunId = '6b7bf94e-80d1-4633-9504-0ad9c6ca03d8';
const installRoot = mkdtempSync(join(repository, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(mount);
let mounted = false;
let app;
function command(name, args) {
  execFileSync(name, args, { stdio:'pipe', timeout:30_000 });
}
async function invoke(page, group, type, payload) {
  const reply = await page.evaluate(async ({ group, type, payload }) => {
    const command = { schemaVersion:'1.0', commandId:crypto.randomUUID(), type,
      createdAt:new Date().toISOString(), protocolVersion:'forge-host-protocol/v5', payload };
    return group === 'project' ? window.forge.invokeProject(command) :
      group === 'board' ? window.forge.invokeBoard(command) : window.forge.invokeRun(command);
  }, { group, type, payload });
  assert.equal(reply.ok, true, `${type}: ${JSON.stringify(reply)}`);
  return reply.data;
}
async function closeSafely() {
  if (!app) return;
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response:1 });
  }).catch(() => undefined);
  await app.close();
  app = undefined;
}
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
  const projects = await invoke(page, 'project', 'project.list', {});
  assert.equal(projects.length, 1);
  const projectId = projects[0].projectId;
  const board = await invoke(page, 'board', 'board.snapshot', { projectId });
  assert.equal(board.tasks.length, 1);
  assert.equal(board.tasks[0].state, 'done');
  const taskId = board.tasks[0].id;
  for (const runId of [initialRunId, reworkRunId]) {
    const config = await invoke(page, 'run', 'run.config', { projectId, runId });
    assert.equal(config.taskId, taskId);
    assert.equal(config.maxDurationMs, 420_000);
  }
  const delivery = await invoke(page, 'run', 'deliveries.get', { projectId, taskId });
  assert.ok(delivery?.deliveryId);
  await page.getByRole('button', { name:'Agents' }).click();
  await page.getByRole('heading', { name:'Agent Profiles' }).waitFor();
  await page.locator('.agent-row').filter({ hasText:'Fixture Developer' }).first()
    .getByRole('button', { name:'编辑' }).click();
  assert.equal(await page.getByLabel('最长运行时间（秒）').inputValue(), '420');
  assert.equal(await page.getByLabel('允许启动新 Run 时显式检索项目知识与记忆').isChecked(), true);
  const agentsScreenshot = join(repository, 'output', 'playwright',
    `${artifactTag}-agents-1440x900.png`);
  await page.getByLabel('最长运行时间（秒）').scrollIntoViewIfNeeded();
  await page.screenshot({ path:agentsScreenshot });
  await page.getByRole('button', { name:'研发看板' }).click();
  await page.locator('.board-task').filter({ hasText:'Validate add' }).click();
  await page.getByRole('button', { name:new RegExp(`^${reworkRunId.slice(0, 8)}`) }).click();
  await page.getByRole('tab', { name:'context' }).click();
  await page.getByText('本次冻结最长运行时间：420 秒。').waitFor({ timeout:15_000 });
  await page.getByText('当前任务状态为 done', { exact:false }).waitFor();
  const screenshot = join(repository, 'output', 'playwright',
    `${artifactTag}-frozen-run-1440x900.png`);
  await page.getByText('本次冻结最长运行时间：420 秒。').scrollIntoViewIfNeeded();
  await page.screenshot({ path:screenshot });
  console.log(JSON.stringify({ stage:'packaged-profile-context-readback',
    projectId, taskId, initialRunId, reworkRunId, frozenSeconds:420,
    deliveryId:delivery.deliveryId, boardState:'done', agentsScreenshot, screenshot }));
} finally {
  await closeSafely();
  if (mounted) command('hdiutil', ['detach', mount]);
  rmSync(installRoot, { recursive:true, force:true });
}
