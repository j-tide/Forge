/** Prove an installed INTERNAL app opens a QA backup but cannot write to it. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
/* global window */

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(root, 'output', 'qa'));
const dmg = process.env.FORGE_READ_ONLY_DMG;
const sourceArg = process.env.FORGE_READ_ONLY_SOURCE_DB;
const tag = process.env.FORGE_READ_ONLY_TAG || 'desktop-read-only-history-20260926';
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !dmg ||
    !existsSync(dmg) || !sourceArg) {
  throw new Error('Require macOS arm64, an explicit INTERNAL DMG and a QA SQLite source');
}
const source = realpathSync(sourceArg);
if (!source.startsWith(`${qaRoot}${sep}`) || !source.endsWith(`${sep}forge.sqlite`)) {
  throw new Error('Only an existing Forge output/qa SQLite source may be inspected');
}
const fixture = mkdtempSync(join(qaRoot, 'desktop-read-only-history-'));
const dataRoot = join(fixture, 'isolated-app-data');
const database = join(dataRoot, 'Forge', 'production', 'forge.sqlite');
mkdirSync(join(dataRoot, 'Forge', 'production'), { recursive: true });
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(mount);
function command(executable, args) {
  return execFileSync(executable, args, { encoding: 'utf8', timeout: 30_000 }).trim();
}
function projectRows() {
  return JSON.parse(command('python3', ['-c',
    "import json,sqlite3,sys; db=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(json.dumps(db.execute('SELECT project_id,archived_at FROM projects ORDER BY project_id').fetchall()))",
    database]));
}
command('python3', ['-c',
  "import sqlite3,sys; source=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); destination=sqlite3.connect(sys.argv[2]); source.backup(destination); destination.close(); source.close()",
  source, database]);
const before = projectRows();
assert.equal(before.length, 1, 'Expected one retained real Project');
assert.equal(before[0][1], null, 'Source Project must remain active');
let attached = false;
let app;
try {
  command('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  attached = true;
  command('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  command('codesign', ['--verify', '--deep', '--strict', installed]);
  command('hdiutil', ['detach', mount]);
  attached = false;
  app = await electron.launch({ executablePath: join(installed, 'Contents', 'MacOS', 'Forge'),
    args: [], env: { ...process.env, FORGE_DEV_SERVER_URL: '',
      FORGE_INTERNAL_TEST_HOME: dataRoot, FORGE_PYTHON_DB_READ_ONLY: '1' } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  await page.getByText('历史数据只读', { exact: false }).first().waitFor();
  const invoke = async (type, payload) => page.evaluate(async ({ type, payload }) =>
    window.forge.invokeProject({ schemaVersion: '1.0', commandId: crypto.randomUUID(),
      type, createdAt: new Date().toISOString(),
      protocolVersion: 'forge-host-protocol/v5', payload }), { type, payload });
  const listed = await invoke('project.list', {});
  assert.equal(listed.ok, true);
  assert.equal(listed.data.length, 1);
  const project = listed.data[0];
  assert.equal(project.projectId, before[0][0]);
  const removal = await invoke('project.remove', {
    projectId: project.projectId, expectedRevision: project.revision,
  });
  assert.equal(removal.ok, false,
    `Read-only installed Host accepted a Project write: ${JSON.stringify(removal)}`);
  assert.equal(removal.error?.code, 'DATABASE_READ_ONLY',
    `Expected the Host's read-only command rejection: ${JSON.stringify(removal)}`);
  assert.deepEqual(projectRows(), before, 'Read-only Project write changed SQLite');
  assert.equal(command('sqlite3', [database, 'PRAGMA quick_check;']), 'ok');
  await page.getByRole('button', { name: '研发看板' }).click();
  assert.equal(await page.getByRole('button', { name: '手工创建任务' }).count(), 0);
  await page.locator('.board-task').first().waitFor();
  await page.locator('.board-task').first().click();
  await page.locator('.task-detail').waitFor();
  await page.getByText('历史只读数据集；新运行和证据写入已关闭', { exact: false }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: '明确启动开发', disabled: false }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '合并当前交付' }).count(), 0);
  const screenshot = join(root, 'output', 'playwright',
    `${tag}-1440x900.png`);
  await page.screenshot({ path: screenshot });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '项目', exact: true }).click();
  await page.getByText('历史项目记录').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Remove from Forge' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Choose folder' }).count(), 0);
  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await page.getByText('已保存 Profile').waitFor();
  assert.equal(await page.getByRole('button', { name: '新建 Profile' }).count(), 0);
  await page.getByRole('button', { name: '插件' }).click();
  await page.getByText('Codex 执行能力').waitFor();
  assert.equal(await page.getByRole('button', { name: '停用 Codex 插件' }).count(), 0);
  await page.getByRole('button', { name: '项目资料' }).click();
  await page.getByText('检索已导入资料').waitFor();
  assert.equal(await page.getByRole('button', { name: '只读导入' }).count(), 0);
  await page.getByRole('button', { name: '工作流' }).click();
  await page.getByRole('heading', { name: '线性配置' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '保存草稿' }).count(), 0);
  await page.getByRole('button', { name: '设置' }).click();
  assert.equal(await page.getByRole('button', { name: '选择位置并导出数据库备份' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '选择备份并恢复到独立数据集' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '开启本机浏览器预览' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '创建一次性配对' }).count(), 0);
  assert.equal(await page.locator('.remote-devices').count(), 0);
  await page.locator('.utility-view').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
  const settingsScreenshot = join(root, 'output', 'playwright', `${tag}-settings-1440x900.png`);
  await page.screenshot({ path: settingsScreenshot });
  const projectsScreenshot = join(root, 'output', 'playwright', `${tag}-projects-1440x900.png`);
  await page.getByRole('button', { name: '项目', exact: true }).click();
  await page.getByText('历史项目记录').waitFor();
  await page.screenshot({ path: projectsScreenshot });
  console.log(JSON.stringify({ stage: 'packaged-read-only-history', dmg, fixture,
    projectId: project.projectId, removalError: removal.error?.code,
    projectUnchanged: true, quickCheck: 'ok', screenshot, projectsScreenshot,
    settingsScreenshot }));
} finally {
  await app?.close();
  if (attached) command('hdiutil', ['detach', mount]);
  rmSync(installRoot, { recursive: true, force: true });
}
