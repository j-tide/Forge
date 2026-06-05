import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const temporaryRoot = mkdtempSync(join(tmpdir(), 'forge-p1-offline-'));
const repo = join(temporaryRoot, '离线项目 with spaces');
const dataDir = join(temporaryRoot, 'forge-data');
const isolatedCodexHome = join(temporaryRoot, 'empty-codex-home');
const output = resolve('output/playwright');
mkdirSync(repo);
mkdirSync(isolatedCodexHome);
mkdirSync(output, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
git('init', '-q');
git('config', 'user.name', 'Forge Fixture');
git('config', 'user.email', 'forge@example.invalid');
writeFileSync(join(repo, 'package.json'), JSON.stringify({
  name: 'forge-p1-offline-fixture',
  scripts: { test: 'node project-script-that-must-not-run.js' },
}));
writeFileSync(join(repo, 'project-script-that-must-not-run.js'),
  "require('node:fs').writeFileSync('script-ran.txt', 'unsafe');\n");
git('add', '.');
git('commit', '-qm', 'independent fixture');
const originalRevision = git('rev-parse', 'HEAD');
const originalStatus = git('status', '--porcelain');
const launchEnv = { ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_HOST_DATA_DIR: dataDir,
  CODEX_HOME: isolatedCodexHome, OPENAI_API_KEY: '', CODEX_API_KEY: '',
  HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1',
  http_proxy: 'http://127.0.0.1:1', https_proxy: 'http://127.0.0.1:1' };
let app;
async function launch() {
  app = await electron.launch({ executablePath: requireDesktop('electron'),
    args: [desktopDirectory], env: launchEnv });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  return page;
}
async function assertSourceUntouched() {
  assert.equal(git('rev-parse', 'HEAD'), originalRevision);
  assert.equal(git('status', '--porcelain'), originalStatus);
  assert.equal(existsSync(join(repo, 'script-ran.txt')), false);
}
try {
  let page = await launch();
  await page.getByRole('button', { name: /未选择项目/ }).click();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByText('Git repository', { exact: false }).waitFor();
  await page.getByRole('button', { name: '继续查看信任范围' }).click();
  await page.getByRole('button', { name: 'Trust this project' }).click();
  await page.getByText('PROJECT CONNECTED').waitFor();
  await page.getByRole('button', { name: '进入 Forge Workspace' }).click();
  await page.getByRole('heading', { name: 'What do you want to build?' }).waitFor();
  await page.locator('.conversation-panel textarea').fill('给离线项目增加明确的输入校验');
  await page.getByRole('button', { name: '保存输入' }).click();
  await page.getByText('输入已保存在本地会话。', { exact: false }).waitFor();
  await page.getByRole('button', { name: '手工草稿', exact: true }).click();
  await page.getByRole('heading', { name: '待完善草稿' }).waitFor();
  await page.locator('.draft-manual-editor textarea').fill('给离线项目增加明确的输入校验');
  await page.getByRole('button', { name: '保存草稿文字' }).click();
  await page.getByRole('button', { name: /编辑草稿 · v2/ }).click();
  await page.getByRole('textbox', { name: '标题' }).fill('离线输入校验');
  await page.getByRole('textbox', { name: '验收条件 ac1' }).fill('无效输入得到明确错误');
  await page.getByRole('textbox', { name: '本次用户决定 / 修改原因' }).fill('用户确认离线任务范围');
  await page.getByRole('button', { name: '保存新 revision' }).click();
  await page.getByRole('button', { name: /编辑草稿 · v3/ }).click();
  await page.getByRole('button', { name: '提交审批请求' }).click();
  await page.getByLabel('我已审阅当前目标、验收和范围').check();
  await page.getByRole('button', { name: '批准并加入 TODO' }).click();
  await page.getByText('已批准 · TODO · 尚未开工。此草稿 revision 已冻结。').waitFor();
  await page.getByRole('button', { name: '关闭抽屉' }).click();
  await page.getByRole('button', { name: '研发看板' }).click();
  await page.getByRole('heading', { name: '离线输入校验' }).waitFor();
  assert.equal(await page.locator('.board-task').count(), 1);
  const taskId = await page.locator('.board-task').first().getAttribute('data-task-id');
  assert.match(taskId, /^[0-9a-f-]{36}$/);
  await page.screenshot({ path: join(output, 'p1-10-offline-approved-todo-1440x900.png') });
  await assertSourceUntouched();
  await app.close(); app = null;
  page = await launch();
  await page.getByRole('button', { name: '研发看板' }).click();
  await page.getByRole('heading', { name: '离线输入校验' }).waitFor();
  assert.equal(await page.locator('.board-task').first().getAttribute('data-task-id'), taskId);
  await page.locator('.board-task').first().click();
  await page.getByRole('dialog', { name: '任务详情' }).waitFor();
  await page.getByText('无效输入得到明确错误').waitFor();
  await assertSourceUntouched();
  console.log(JSON.stringify({ result: 'pass', mode: 'isolated credentials and unavailable proxy',
    stages: ['trusted-project', 'persisted-message', 'manual-draft', 'human-approval',
      'todo-board', 'desktop-restart', 'task-source-unchanged'],
    screenshot: 'output/playwright/p1-10-offline-approved-todo-1440x900.png' }, null, 2));
} finally {
  await app?.close();
  rmSync(temporaryRoot, { recursive: true, force: true });
}
