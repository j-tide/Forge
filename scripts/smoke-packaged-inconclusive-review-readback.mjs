/** Read a retained real inconclusive Review in a new installed internal package. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
/* global window */

const repository = resolve(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(repository, 'output', 'qa'));
const sourceArgument = process.env.FORGE_REVIEW_READBACK_DATA;
const dmg = process.env.FORGE_REVIEW_READBACK_DMG;
const screenshotTag = process.env.FORGE_REVIEW_READBACK_SCREENSHOT_TAG ||
  'desktop-review-diagnostic-20260927';
if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(screenshotTag)) {
  throw new Error('Screenshot tag must be a bounded local build identifier');
}
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !sourceArgument ||
    !dmg || !existsSync(dmg)) {
  throw new Error('Require macOS arm64, a retained QA data root and an internal DMG');
}
const sourceRoot = realpathSync(sourceArgument);
const sourceDb = join(sourceRoot, 'Forge', 'production', 'forge.sqlite');
if (!sourceRoot.startsWith(`${qaRoot}${sep}`) || !existsSync(sourceDb)) {
  throw new Error('Only retained output/qa SQLite data may be read');
}
const expectedReview = '39390ee0-af40-455d-946f-68db6e4ca2ae';
const expectedRun = 'ff9e77ea-689b-461d-b92f-6fabfa10e540';
const installRoot = mkdtempSync(join(repository, 'build', 'macos', 'qa-review-readback-'));
const dataRoot = mkdtempSync(join(qaRoot, 'desktop-review-readback-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
const copiedDb = join(dataRoot, 'Forge', 'production', 'forge.sqlite');
mkdirSync(mount);
mkdirSync(join(dataRoot, 'Forge', 'production'), { recursive: true });
let mounted = false;
let app;
function command(name, args) {
  execFileSync(name, args, { stdio: 'pipe', timeout: 30_000 });
}
async function invoke(page, group, type, payload) {
  const reply = await page.evaluate(async ({ group, type, payload }) => {
    const envelope = { schemaVersion:'1.0', commandId:crypto.randomUUID(), type,
      createdAt:new Date().toISOString(), protocolVersion:'forge-host-protocol/v5', payload };
    return group === 'project' ? window.forge.invokeProject(envelope) :
      group === 'board' ? window.forge.invokeBoard(envelope) : window.forge.invokeRun(envelope);
  }, { group, type, payload });
  assert.equal(reply.ok, true, `${type}: ${JSON.stringify(reply)}`);
  return reply.data;
}
try {
  // Online SQLite backup keeps the retained real QA database bytewise separate
  // from the Host opened by this readback. The original source remains in place.
  command('python3', ['-c',
    'import pathlib,sqlite3,sys; s=sqlite3.connect(pathlib.Path(sys.argv[1]).as_uri()+"?mode=ro",uri=True); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()',
    sourceDb, copiedDb]);
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
  const task = board.tasks.find((item) => item.id);
  assert.ok(task);
  assert.notEqual(task.state, 'done');
  const reports = await invoke(page, 'run', 'run.reviewReports', {
    projectId, taskId:task.id,
  });
  const retained = reports.find((item) => item.reviewId === expectedReview);
  assert.equal(retained?.developmentRunId, expectedRun);
  assert.equal(retained?.status, 'inconclusive');
  assert.equal(retained?.result, null);
  assert.equal(retained?.diagnosticCode, null); // Historical job predates the new code.
  await page.getByRole('button', { name:'研发看板' }).click();
  await page.locator('.board-task').filter({ hasText:task.title }).click();
  await page.getByText('审查结果不足以判定。任务保持未完成').waitFor({ timeout:15_000 });
  const screenshot = join(repository, 'output', 'playwright',
    `${screenshotTag}-inconclusive-1440x900.png`);
  await page.getByText('审查结果不足以判定。任务保持未完成').scrollIntoViewIfNeeded();
  await page.screenshot({ path:screenshot });
  console.log(JSON.stringify({ stage:'packaged-inconclusive-review-readback',
    projectId, taskId:task.id, runId:expectedRun, reviewId:expectedReview,
    reviewStatus:retained.status, taskState:task.state, screenshot }));
} finally {
  if (app) {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response:1 });
    }).catch(() => undefined);
    await app.close();
  }
  if (mounted) command('hdiutil', ['detach', mount]);
  rmSync(installRoot, { recursive:true, force:true });
  rmSync(dataRoot, { recursive:true, force:true });
}
