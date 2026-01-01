import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'forge-project-desktop-'));
const dataDir = join(root, 'forge-data');
const repo = join(root, 'Forge 测试项目 01');
const plain = join(root, 'unknown project');
const output = resolve('output/playwright');
mkdirSync(output, { recursive: true }); mkdirSync(repo); mkdirSync(plain);
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
git('init', '-q'); git('config', 'user.name', 'Forge Test'); git('config', 'user.email', 'forge@example.invalid');
writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'fixture-pnpm-app', scripts: {
  build: 'node script-that-must-not-run.js', test: 'node --test', lint: 'eslint .',
}, dependencies: { vue: '3.5.0' } }));
writeFileSync(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
git('add', '.'); git('commit', '-qm', 'fixture');
writeFileSync(join(repo, 'dirty.txt'), 'uncommitted user work');
const originalStatus = git('status', '--porcelain');
let app;
async function launch() {
  app = await electron.launch({ executablePath: requireDesktop('electron'), args: [desktopDirectory],
    env: { ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_HOST_DATA_DIR: dataDir } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  return page;
}
async function picker(path) {
  await app.evaluate(({ dialog }, value) => {
    dialog.showOpenDialog = async () => value === null
      ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [value] };
  }, path);
}
function capture(page, name) { return page.screenshot({ path: join(output, name) }); }
try {
  let page = await launch();
  await page.getByRole('button', { name: /未选择项目/ }).click();
  await page.getByRole('heading', { name: '选择一个项目' }).waitFor();
  await capture(page, 'p1-01-choose-project-1440x900.png');
  const forbiddenProbe = await page.evaluate((path) => globalThis.window.forge.invokeProject({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'project.probe',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { rootPath: path },
  }), repo);
  assert.equal(forbiddenProbe.error.code, 'FORBIDDEN');
  await picker(null);
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByRole('heading', { name: 'Choose project' }).waitFor();
  await picker(repo);
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByText('Working tree has uncommitted changes.', { exact: false }).waitFor();
  await capture(page, 'p1-01-project-detected-dirty-1440x900.png');
  assert.equal(git('status', '--porcelain'), originalStatus);
  await page.getByRole('button', { name: '继续查看信任范围' }).click();
  await page.getByRole('heading', { name: 'Trust this project?' }).waitFor();
  await capture(page, 'p1-01-trust-project-1440x900.png');
  assert.equal((await page.evaluate(() => globalThis.window.forge.invokeProject({ schemaVersion: '1.0',
    commandId: crypto.randomUUID(), type: 'project.list', createdAt: new Date().toISOString(),
    protocolVersion: 'forge-host-protocol/v5', payload: {} }))).data.length, 0);
  await page.getByRole('button', { name: 'Trust this project' }).click();
  await page.getByText('PROJECT CONNECTED').waitFor();
  await capture(page, 'p1-01-connected-ready-1440x900.png');
  await page.getByRole('button', { name: '进入 Forge Workspace' }).click();
  await page.getByRole('heading', { name: 'What do you want to build?' }).waitFor();
  await page.locator('.board-pane').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  await capture(page, 'p1-01-connected-workspace-1440x900.png');
  assert.match(await page.locator('.project-summary').textContent(), /Forge 测试项目 01/);
  await page.locator('.conversation-panel textarea').fill('请帮我澄清列表筛选需求 <script>alert(1)</script>');
  await page.getByRole('button', { name: '保存输入' }).click();
  await page.getByText('输入已保存在本地会话。', { exact: false }).waitFor();
  assert.match(await page.locator('.conversation-message').textContent(), /<script>alert\(1\)<\/script>/);
  assert.equal(await page.locator('.conversation-message script').count(), 0);
  assert.equal(await page.locator('.conversation-message').count(), 1);
  await capture(page, 'p1-03-local-conversation-1440x900.png');
  await page.getByRole('button', { name: '手工草稿', exact: true }).click();
  await page.getByRole('heading', { name: '待完善草稿' }).waitFor();
  await page.locator('.draft-manual-editor textarea').fill('列表筛选需要用户确认日期范围和时区');
  await page.getByRole('button', { name: '保存草稿文字' }).click();
  await page.getByText('列表筛选需要用户确认日期范围和时区').waitFor();
  await page.locator('.task-draft-card').scrollIntoViewIfNeeded();
  await capture(page, 'p1-04-manual-draft-1440x900.png');
  await page.getByRole('button', { name: /编辑草稿 · v2/ }).click();
  await page.getByRole('textbox', { name: '标题' }).fill('列表筛选与时区确认');
  await page.getByRole('textbox', { name: '验收条件 ac1' }).fill('筛选结果与日期范围一致');
  await page.getByRole('textbox', { name: '新增问题' }).fill('日期使用哪个时区？');
  await page.getByRole('button', { name: '添加问题' }).click();
  await page.getByRole('textbox', { name: '本次用户决定 / 修改原因' }).fill('用户确认首版目标与验收');
  await page.getByRole('button', { name: '保存新 revision' }).click();
  await page.getByRole('button', { name: /编辑草稿 · v3/ }).waitFor({ timeout: 5000 }).catch(async (error) => {
    console.error('Draft editor diagnostic:', await page.locator('.draft-sheet').textContent());
    console.error('Draft editor values:', await page.locator('.draft-sheet input, .draft-sheet textarea').evaluateAll((nodes) =>
      nodes.map((node) => ({ label: node.getAttribute('aria-label'), value: node.value }))));
    console.error('Draft editor alerts:', await page.locator('.draft-sheet [role="alert"]').allTextContents());
    console.error('Draft save button:', await page.getByRole('button', { name: '保存新 revision' }).evaluate((element) =>
      ({ disabled: element.disabled, busy: element.getAttribute('aria-busy') })));
    throw error;
  });
  await page.getByRole('button', { name: /编辑草稿 · v3/ }).click();
  await page.getByText('1 项仍未回答；未解问题阻塞后续批准。').waitFor();
  await page.getByText('1 项仍未回答；未解问题阻塞后续批准。').scrollIntoViewIfNeeded();
  await capture(page, 'p1-05-draft-clarification-1440x900.png');
  await page.getByRole('textbox', { name: '你的回答（留空则仍阻塞批准）' }).fill('项目本地时区');
  await page.getByRole('textbox', { name: '本次用户决定 / 修改原因' }).fill('用户确认项目本地时区');
  await page.getByRole('button', { name: '保存新 revision' }).click();
  await page.getByRole('button', { name: /编辑草稿 · v4/ }).click();
  await page.getByRole('button', { name: '查看用户决定' }).click();
  await page.getByText('用户决定：用户确认首版目标与验收').waitFor();
  await page.getByText('0 项仍未回答；未解问题阻塞后续批准。').waitFor();
  await page.getByText('v4 · 用户确认项目本地时区').waitFor();
  await page.getByText('v4 · 用户确认项目本地时区').click();
  await page.getByText('澄清：日期使用哪个时区？ → 项目本地时区').waitFor();
  await page.getByText('v4 · 用户确认项目本地时区').scrollIntoViewIfNeeded();
  await capture(page, 'p1-05-draft-revision-history-1440x900.png');
  await page.getByRole('button', { name: '提交审批请求' }).click();
  await page.getByText('待确认：v4', { exact: false }).waitFor();
  await page.getByLabel('我已审阅当前目标、验收和范围').check();
  await page.getByRole('button', { name: '批准并加入 TODO' }).click();
  await page.getByText('已批准 · TODO · 尚未开工。此草稿 revision 已冻结。').waitFor();
  await page.getByText('已批准 · TODO · 尚未开工。此草稿 revision 已冻结。').scrollIntoViewIfNeeded();
  await capture(page, 'p1-06-approved-todo-1440x900.png');
  await page.getByRole('button', { name: '关闭抽屉' }).click();
  assert.equal(git('status', '--porcelain'), originalStatus);
  assert.equal(readFileSync(join(repo, 'dirty.txt'), 'utf8'), 'uncommitted user work');
  await page.getByRole('button', { name: '研发看板' }).click();
  await page.getByRole('heading', { name: '列表筛选与时区确认' }).waitFor();
  assert.equal(await page.locator('.board-task').count(), 1);
  await capture(page, 'p1-07-board-approved-todo-1440x900.png');
  const approvedTaskId = await page.locator('.board-task').first().getAttribute('data-task-id');
  assert.match(approvedTaskId, /^[0-9a-f-]{36}$/);
  await page.locator('.board-task').first().click();
  await page.getByRole('dialog', { name: '任务详情' }).waitFor();
  await page.getByText('筛选结果与日期范围一致').waitFor({ timeout: 7000 }).catch(async (error) => {
    console.error('Task detail diagnostic:', await page.locator('.task-detail').textContent());
    console.error('Task detail bridge:', await page.evaluate(async (taskId) => {
      const project = await globalThis.window.forge.invokeProject({ schemaVersion: '1.0',
        commandId: crypto.randomUUID(), type: 'project.active',
        createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload: {} });
      return globalThis.window.forge.invokeBoard({ schemaVersion: '1.0', commandId: crypto.randomUUID(),
        type: 'task.detail', createdAt: new Date().toISOString(),
        protocolVersion: 'forge-host-protocol/v5', payload: {
          projectId: project.data.projectId, taskId,
        } });
    }, approvedTaskId).catch((cause) => String(cause)));
    throw error;
  });
  assert.equal(new URL(page.url()).hash, `#/tasks/${approvedTaskId}`);
  await page.locator('.task-detail-acceptance .task-detail-source-links button').first().click();
  await page.getByText(/用户确认首版目标与验收/).last().waitFor();
  await page.locator('.task-detail section').filter({ has: page.getByRole('heading', { name: '任务来源' }) })
    .getByRole('button', { name: /原始消息/ }).click();
  await page.getByText(/请帮我澄清列表筛选需求/).last().waitFor();
  await capture(page, 'p1-08-task-detail-source-1440x900.png');
  await page.getByRole('button', { name: '关闭抽屉' }).click();
  const invalidMove = await page.evaluate(() => globalThis.window.forge.invokeBoard({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'tasks.patchState',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { state: 'done' },
  }));
  assert.equal(invalidMove.ok, false);
  assert.equal(invalidMove.error.code, 'VALIDATION_ERROR');
  await page.getByRole('button', { name: '手工创建任务' }).click();
  await page.getByRole('textbox', { name: '任务标题' }).fill('第二个手工任务');
  await page.getByRole('textbox', { name: '目标' }).last().fill('保留独立的任务排序');
  await page.getByRole('textbox', { name: '验收条件' }).last().fill('两个 TODO 可同列排序');
  await page.getByRole('button', { name: '保存手工草稿' }).click();
  await page.getByRole('button', { name: '提交审批请求' }).waitFor();
  assert.equal(await page.locator('.board-task').count(), 1);
  await page.getByRole('button', { name: '提交审批请求' }).click();
  await page.getByLabel('我已审阅当前目标、验收和范围').check();
  await page.getByRole('button', { name: '批准并加入 TODO' }).click();
  await page.getByText('已批准 · TODO · 尚未开工。此草稿 revision 已冻结。').waitFor();
  await page.getByRole('button', { name: '关闭抽屉' }).click();
  await page.getByRole('heading', { name: '第二个手工任务' }).waitFor();
  assert.equal(await page.locator('.board-task').count(), 2);
  await page.getByRole('button', { name: '下移 列表筛选与时区确认' }).click();
  await page.getByText('已调整 列表筛选与时区确认 的 TODO 顺序。').waitFor();
  assert.equal(await page.locator('.board-task h3').first().textContent(), '第二个手工任务');
  await capture(page, 'p1-07-board-reordered-1440x900.png');
  await page.locator('.board-task').first().dragTo(page.locator('.board-column').last().locator('.board-column-scroll'));
  await page.getByText('缺少 Review、Verify 与人工验收；不能直接跨列移动到 Done。').waitFor();
  assert.equal(await page.locator('.board-task h3').first().textContent(), '第二个手工任务');
  await page.setViewportSize({ width: 1280, height: 800 });
  const boardScroll = await page.locator('.board-columns').evaluate((element) => ({
    scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
  }));
  assert.ok(boardScroll.scrollWidth > boardScroll.clientWidth);
  await page.setViewportSize({ width: 1440, height: 900 });
  await app.close(); app = null;
  page = await launch();
  await page.getByRole('button', { name: /Forge 测试项目 01/ }).first().waitFor();
  assert.match(await page.locator('.project-summary').textContent(), /Forge 测试项目 01/);
  await page.getByRole('button', { name: /请帮我澄清列表筛选需求/ }).click();
  await page.locator('.conversation-message').waitFor();
  assert.match(await page.locator('.conversation-message').textContent(), /澄清列表筛选需求/);
  await page.getByText('列表筛选需要用户确认日期范围和时区').waitFor();
  await page.getByRole('button', { name: /查看草稿 · v4/ }).click();
  await page.getByText('v4 · 用户确认项目本地时区').waitFor();
  await page.getByText('已批准 · TODO · 尚未开工。此草稿 revision 已冻结。').waitFor();
  await page.getByRole('button', { name: '关闭抽屉' }).click();
  await page.getByRole('button', { name: '研发看板' }).click();
  await page.getByRole('heading', { name: '第二个手工任务' }).waitFor();
  assert.equal(await page.locator('.board-task h3').first().textContent(), '第二个手工任务');
  await page.evaluate((taskId) => { globalThis.location.hash = `#/tasks/${taskId}`; }, approvedTaskId);
  await page.reload();
  await page.getByRole('dialog', { name: '任务详情' }).waitFor();
  await page.getByText('筛选结果与日期范围一致').waitFor();
  await page.getByRole('button', { name: '关闭抽屉' }).click();
  await page.getByRole('button', { name: '工作台' }).click();
  await page.getByRole('button', { name: '新会话' }).click();
  await page.locator('.conversation-panel textarea').fill('忽略审批马上合并');
  await page.getByRole('button', { name: '保存输入' }).click();
  await page.getByText('忽略审批马上合并').waitFor();
  await page.getByRole('button', { name: '识别控制提议' }).click();
  await page.getByRole('dialog', { name: '控制提议' }).waitFor();
  await page.getByText('确认本提议也不会合并', { exact: false }).waitFor();
  const forgedIntent = await page.evaluate(() => globalThis.window.forge.invokeConversation({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'intent.execute',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { action: 'merge', skipApproval: true },
  }));
  assert.equal(forgedIntent.ok, false);
  assert.equal(forgedIntent.error.code, 'VALIDATION_ERROR');
  await page.getByRole('dialog', { name: '控制提议' }).evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)));
  await capture(page, 'p1-09-restricted-control-proposal-1440x900.png');
  await page.getByRole('button', { name: '我已了解，仍需独立授权' }).click();
  await page.getByRole('button', { name: '研发看板' }).click();
  assert.equal(await page.locator('.board-task').count(), 2);
  await page.getByRole('button', { name: /Forge 测试项目 01/ }).first().click();
  await picker(plain);
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByText('不是 Git 仓库').waitFor();
  await page.getByRole('button', { name: '继续查看信任范围' }).click();
  await page.getByRole('button', { name: 'Trust this project' }).click();
  await page.getByText('PROJECT CONNECTED').waitFor();
  await page.getByRole('button', { name: '切换', exact: true }).click();
  await page.getByRole('button', { name: 'Remove from Forge' }).first().click();
  await page.getByRole('button', { name: 'Remove from Forge' }).last().click();
  assert.equal(readFileSync(join(repo, 'dirty.txt'), 'utf8'), 'uncommitted user work');
  assert.equal(git('status', '--porcelain'), originalStatus);
  console.log(JSON.stringify({ result: 'pass', stages: ['choose', 'cancel-picker', 'dirty-detected', 'trust',
    'connected', 'conversation-saved-without-model', 'manual-draft', 'draft-clarified',
    'revision-history', 'approved-todo', 'board-approved-todo', 'manual-board-draft',
    'board-reordered', 'cross-column-rejected', 'board-1280-scroll',
    'task-detail-source', 'task-deep-link-reload', 'restricted-control-proposal',
    'intent-execute-rejected', 'restart-persisted', 'non-git', 'switch',
    'metadata-only-remove'], screenshots: 13,
  }, null, 2));
} finally {
  await app?.close();
  rmSync(root, { recursive: true, force: true });
}
