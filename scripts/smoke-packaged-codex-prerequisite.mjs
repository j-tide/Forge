/** Verify that a packaged Desktop refuses Start when the real Codex CLI has no login. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
/* global window */

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(root, 'output', 'qa'));
const dmgArgument = process.env.FORGE_PACKAGE_PREREQ_DMG;
const dataArgument = process.env.FORGE_PACKAGE_PREREQ_DATA;
const artifactTag = process.env.FORGE_PACKAGE_PREREQ_TAG || 'desktop-codex-diagnostics-20260926';
if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(artifactTag)) {
  throw new Error('Prerequisite screenshot tag must be a short lowercase slug');
}
if (process.platform !== 'darwin' || process.arch !== 'arm64' ||
    !dmgArgument || !dataArgument) {
  throw new Error('Require macOS arm64, an internal DMG and isolated QA data');
}
const dmg = realpathSync(dmgArgument);
const dataRoot = realpathSync(dataArgument);
if (!dmg.startsWith(`${join(root, 'build', 'macos')}${sep}`) ||
    !dataRoot.startsWith(`${qaRoot}${sep}`) ||
    !existsSync(join(dataRoot, 'Forge', 'production', 'forge.sqlite'))) {
  throw new Error('Prerequisite smoke accepts only Forge-owned internal artifacts and QA data');
}
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const codexHome = mkdtempSync(join(tmpdir(), 'forge-empty-codex-home-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
const screenshot = join(root, 'output', 'playwright',
  `${artifactTag}-not-logged-in-1440x900.png`);
const pluginScreenshot = join(root, 'output', 'playwright',
  `${artifactTag}-plugin-unavailable-1440x900.png`);
mkdirSync(mount);
let mounted = false;
let app;
function command(executable, args) {
  execFileSync(executable, args, { stdio: 'pipe', timeout: 30_000 });
}
async function invoke(page, group, type, payload) {
  const reply = await page.evaluate(async ({ group, type, payload }) => {
    const envelope = { schemaVersion: '1.0', commandId: crypto.randomUUID(), type,
      createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload };
    return group === 'project' ? window.forge.invokeProject(envelope) :
      group === 'board' ? window.forge.invokeBoard(envelope) :
        window.forge.invokeRun(envelope);
  }, { group, type, payload });
  assert.equal(reply.ok, true, `${type}: ${JSON.stringify(reply)}`);
  return reply.data;
}
try {
  command('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  mounted = true;
  command('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  command('hdiutil', ['detach', mount]);
  mounted = false;
  command('codesign', ['--verify', '--deep', '--strict', installed]);
  app = await electron.launch({ executablePath: join(installed, 'Contents', 'MacOS', 'Forge'),
    args: [], env: { ...process.env, FORGE_DEV_SERVER_URL: '',
      FORGE_INTERNAL_TEST_HOME: dataRoot, CODEX_HOME: codexHome,
      OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', FORGE_MODEL_PROVIDER: 'disabled' } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  const projects = await invoke(page, 'project', 'project.list', {});
  assert.equal(projects.length, 1);
  const projectId = projects[0].projectId;
  const board = await invoke(page, 'board', 'board.snapshot', { projectId });
  assert.equal(board.tasks.length, 1);
  assert.equal(board.tasks[0].state, 'todo');
  const taskId = board.tasks[0].id;
  await page.getByRole('button', { name: '研发看板' }).click();
  await page.locator('.board-task').first().click();
  await page.getByText('Codex CLI 尚未登录', { exact: false }).waitFor({ timeout: 20_000 });
  const start = page.getByRole('button', { name: '明确启动开发' });
  assert.equal(await start.isDisabled(), true);
  const capability = await invoke(page, 'run', 'run.capabilities', { projectId, taskId });
  assert.equal(capability.available, false);
  assert.ok(capability.warnings.includes('CODEX_NOT_AUTHENTICATED'));
  assert.deepEqual(await invoke(page, 'run', 'run.list', { projectId, taskId }), []);
  await page.locator('.run-start-controls').scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshot });
  await page.keyboard.press('Escape');
  await page.locator('.forge-overlay--drawer').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '插件', exact: true }).click();
  const pluginCapability = page.locator('[aria-label="Codex 执行能力"]');
  await pluginCapability.getByText('当前执行器不可启动', { exact: false }).waitFor();
  assert.match(await pluginCapability.innerText(), /设置 → 本机依赖/);
  assert.match(await page.locator('.plugins-view').innerText(), /已装配/);
  await pluginCapability.scrollIntoViewIfNeeded();
  await page.screenshot({ path: pluginScreenshot });
  console.log(JSON.stringify({ stage: 'packaged-codex-prerequisite',
    projectId, taskId, available: false, reason: 'CODEX_NOT_AUTHENTICATED',
    startDisabled: true, runCount: 0, screenshot, pluginScreenshot }));
} finally {
  if (app) {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
    }).catch(() => undefined);
    await app.close().catch(() => undefined);
  }
  if (mounted) command('hdiutil', ['detach', mount]);
  rmSync(installRoot, { recursive: true, force: true });
  rmSync(codexHome, { recursive: true, force: true });
}
