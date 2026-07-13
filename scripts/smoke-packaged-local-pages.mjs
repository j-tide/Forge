/** Read-only page probe of the installed internal app against a DB backup. */
/* global window */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The installed local-page probe is macOS arm64 only');
}
const appPath = join(homedir(), 'Applications', 'Forge INTERNAL Current.app');
const executable = join(appPath, 'Contents', 'MacOS', 'Forge');
const source = join(homedir(), 'Documents', 'Forge Demo Current', 'recorded-acceptance',
  'isolated-app-data', 'Forge', 'production', 'forge.sqlite');
const root = mkdtempSync(join(tmpdir(), 'forge-packaged-local-pages-'));
const target = join(root, 'Forge', 'production', 'forge.sqlite');
const output = resolve('output/playwright');
mkdirSync(dirname(target), { recursive: true });
mkdirSync(output, { recursive: true });
const backup = spawnSync('python3', ['-c',
  'import sqlite3,sys; source=sqlite3.connect(sys.argv[1]); target=sqlite3.connect(sys.argv[2]); source.backup(target); target.close(); source.close()',
  source, target], { encoding: 'utf8' });
assert.equal(backup.status, 0, backup.stderr);
let app;
try {
  app = await electron.launch({ executablePath: executable, args: [],
    env: { ...process.env, FORGE_INTERNAL_TEST_HOME: root, FORGE_DEV_SERVER_URL: '',
      FORGE_MODEL_PROVIDER: 'disabled' } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: '工作流' }).click();
  await page.getByRole('heading', { name: '工作流', exact:true }).waitFor();
  await page.getByText('正在读取或检查…').waitFor({ state: 'hidden' });
  const workflows = await page.evaluate(() => window.forge.invokeWorkflow({
    type: 'presets', payload: {},
  }));
  assert.ok(Array.isArray(workflows) && workflows.length >= 1);
  await page.screenshot({ path: join(output, 'p7-current-packaged-workflows-1440x900.png') });
  await page.getByRole('button', { name: '角色' }).click();
  await page.getByRole('heading', { name: 'Agent 角色' }).waitFor();
  await page.locator('.agents-header').getByRole('button', { name: '新建角色' }).click();
  await page.getByRole('textbox', { name: '名称' }).fill('安装版 Developer');
  await page.getByRole('textbox', { name: '角色职责与提示词' }).fill(
    'Implement the approved Task in the isolated workspace, keep changes within scope.');
  await page.getByRole('button', { name: '保存新版本' }).click();
  await page.getByText('角色配置已保存。', { exact: false }).waitFor();
  await page.locator('.agents-header').getByRole('button', { name: '新建角色' }).click();
  await page.getByRole('textbox', { name: '名称' }).fill('安装版 Reviewer');
  await page.getByLabel('角色', { exact: true }).selectOption('reviewer');
  await page.getByRole('textbox', { name: '角色职责与提示词' }).fill(
    'Inspect the frozen snapshot read-only and report concrete evidence.');
  await page.getByRole('button', { name: '保存新版本' }).click();
  await page.getByText('角色配置已保存。', { exact: false }).waitFor();
  const catalog = await page.evaluate(() => window.forge.agentProfileCatalog());
  const developer = catalog.profiles.find((profile) => profile.name === '安装版 Developer');
  const reviewer = catalog.profiles.find((profile) => profile.name === '安装版 Reviewer');
  assert.ok(developer && reviewer, 'Both real Host Profile versions must be persisted');
  await page.getByRole('button', { name: '工作流' }).click();
  await page.getByRole('heading', { name: '工作流', exact:true }).waitFor();
  await page.getByRole('button', { name: '从快速流程新建' }).click();
  const stages = page.locator('.workflow-node');
  const openDetails = async (details) => {
    if (!await details.evaluate((element) => element.open)) await details.locator('summary').click();
  };
  await openDetails(stages.nth(0).locator('details'));
  await stages.nth(0).getByLabel('角色配置').selectOption(developer.id);
  await openDetails(stages.nth(1).locator('details'));
  await stages.nth(1).getByLabel('角色配置').selectOption(reviewer.id);
  await openDetails(page.locator('.workflow-detail-section').filter({ hasText: '流程设置' }));
  await page.getByRole('textbox', { name: '流程名称' }).fill('安装版 quick 演示流程');
  await openDetails(stages.nth(0).locator('details'));
  await page.getByRole('textbox', { name: '步骤 1 名称' }).fill('开发 · 已编辑');
  await openDetails(page.locator('.workflow-detail-section').filter({ hasText: '高级：画布与导入导出' }));
  await page.getByRole('button', { name: '打开高级画布' }).click();
  await page.getByRole('region', { name: '高级画布编辑' }).waitFor();
  await page.screenshot({ path: join(output, 'p7-current-packaged-workflow-editor-1440x900.png') });
  await page.getByRole('button', { name: '检查能力' }).click();
  await page.getByRole('region', { name: 'Workflow 编译诊断' }).waitFor();
  await page.getByRole('button', { name: '保存草稿' }).click();
  await page.getByText('草稿已保存。保存不会执行 Workflow 或批准任何操作。').waitFor();
  const stored = await page.evaluate(() => window.forge.invokeWorkflow({
    type: 'list', payload: {},
  }));
  const configured = stored.find((record) => record.draft.name === '安装版 quick 演示流程');
  assert.ok(configured, 'The edited Workflow must be persisted in the copied SQLite DB');
  assert.equal(configured.draft.nodes[0].label, '开发 · 已编辑');
  await page.getByRole('button', { name: '发布版本' }).click();
  await page.getByText(/版本已发布|发布被 Host 阻止|发布失败/).waitFor();
  const publishNotice = await page.getByText(/版本已发布|发布被 Host 阻止|发布失败/)
    .textContent();
  const publishDiagnostics = await page.getByRole('region', { name: 'Workflow 编译诊断' })
    .innerText();
  assert.match(publishNotice ?? '', /版本已发布/,
    `${publishNotice ?? 'No publish status'}; ${publishDiagnostics}`);
  const published = await page.evaluate((workflowId) => window.forge.invokeWorkflow({
    type: 'getPublished', payload: { workflowId, revision: 1 },
  }), configured.workflowId);
  assert.equal(published.definition.nodes[0].label, '开发 · 已编辑');
  await page.screenshot({ path: join(output, 'p7-current-packaged-workflow-published-1440x900.png') });
  await page.getByRole('heading', { name: '工作流', exact:true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output,
    'p7-current-packaged-workflow-published-top-1440x900.png') });
  await page.getByRole('button', { name: '项目资料' }).click();
  await page.getByRole('heading', { name: '项目知识' }).waitFor();
  await page.getByRole('heading', { name: '已导入资料' }).waitFor();
  await page.screenshot({ path: join(output, 'p7-current-packaged-knowledge-1440x900.png') });
  console.log(JSON.stringify({ stage: 'packaged-local-pages',
    installedApp: appPath, workflowTemplates: workflows.length,
    editedWorkflowId: configured.workflowId, publishedRevision: published.revision,
    projectBackedKnowledgeEntry: true, isolatedDatabaseBackup: true }));
} finally {
  await app?.close();
  rmSync(root, { recursive: true, force: true });
}
