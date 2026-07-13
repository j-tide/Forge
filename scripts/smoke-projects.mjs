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
  await page.getByRole('button', { name: '项目管理' }).click();
  await page.getByRole('heading', { name: '项目', exact: true }).waitFor();
  await capture(page, 'p1-01-choose-project-1440x900.png');
  const forbiddenProbe = await page.evaluate((path) => globalThis.window.forge.invokeProject({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'project.probe',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { rootPath: path },
  }), repo);
  assert.equal(forbiddenProbe.error.code, 'FORBIDDEN');
  await page.getByRole('button', { name: '看板', exact: true }).click();
  await picker(null);
  await page.locator('.project-picker').click();
  await page.getByRole('dialog', { name: '选择项目' }).waitFor();
  await page.getByRole('dialog', { name: '选择项目' })
    .getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('dialog', { name: '选择项目' }).waitFor({ state: 'hidden' });
  await picker(repo);
  await page.locator('.project-picker').click();
  await page.getByText('工作区有未提交修改。现有文件会保留。').waitFor();
  await capture(page, 'p1-01-project-detected-dirty-1440x900.png');
  assert.equal(git('status', '--porcelain'), originalStatus);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('heading', { name: '信任这个项目？' }).waitFor();
  await capture(page, 'p1-01-trust-project-1440x900.png');
  assert.equal((await page.evaluate(() => globalThis.window.forge.invokeProject({ schemaVersion: '1.0',
    commandId: crypto.randomUUID(), type: 'project.list', createdAt: new Date().toISOString(),
    protocolVersion: 'forge-host-protocol/v5', payload: {} }))).data.length, 0);
  await page.getByRole('button', { name: '信任并打开' }).click();
  await page.getByRole('dialog', { name: '选择项目' }).waitFor({ state: 'hidden' });
  await capture(page, 'p1-01-connected-ready-1440x900.png');
  await page.getByRole('heading', { name: '研发看板' }).waitFor();
  await page.locator('.board-pane').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  await capture(page, 'p1-01-connected-workspace-1440x900.png');
  assert.match(await page.locator('.project-picker').textContent(), /Forge 测试项目 01/);
  await page.locator('.sidebar-new-task').click();
  await page.locator('.conversation-panel textarea').fill('请帮我澄清列表筛选需求 <script>alert(1)</script>');
  await page.getByRole('button', { name: '手工填写', exact: true }).click();
  await page.locator('.conversation-editor-source summary').click();
  assert.match(await page.locator('.conversation-editor-source p').textContent(), /<script>alert\(1\)<\/script>/);
  assert.equal(await page.locator('.conversation-editor-source script').count(), 0);
  const editor = page.locator('.draft-sheet[aria-label="任务草稿编辑"]');
  await editor.waitFor();
  await editor.getByRole('textbox', { name: '标题' }).fill('列表筛选与时区确认');
  await editor.getByRole('textbox', { name: '目标' }).fill('列表筛选需要用户确认日期范围和时区');
  await editor.getByRole('textbox', { name: '验收条件 ac1' }).fill('筛选结果与日期范围一致');
  await editor.getByRole('textbox', { name: '新增问题' }).fill('日期使用哪个时区？');
  await editor.getByRole('button', { name: '添加问题' }).click();
  await editor.getByRole('textbox', { name: '本次用户决定 / 修改原因' }).fill('用户确认首版目标与验收');
  await capture(page, 'p1-04-manual-draft-1440x900.png');
  await editor.getByRole('button', { name: '保存新 revision' }).click();
  await page.getByRole('button', { name: '返回讨论' }).click();
  await capture(page, 'p1-03-local-conversation-1440x900.png');
  await page.getByRole('button', { name: '审阅并编辑任务' }).waitFor({ timeout: 5000 }).catch(async (error) => {
    console.error('Draft editor diagnostic:', await page.locator('.draft-sheet').textContent());
    console.error('Draft editor values:', await page.locator('.draft-sheet input, .draft-sheet textarea').evaluateAll((nodes) =>
      nodes.map((node) => ({ label: node.getAttribute('aria-label'), value: node.value }))));
    console.error('Draft editor alerts:', await page.locator('.draft-sheet [role="alert"]').allTextContents());
    console.error('Draft save button:', await page.getByRole('button', { name: '保存新 revision' }).evaluate((element) =>
      ({ disabled: element.disabled, busy: element.getAttribute('aria-busy') })));
    throw error;
  });
  await page.getByRole('button', { name: '审阅并编辑任务' }).click();
  await page.getByText('1 项仍未回答；未解问题阻塞后续批准。').waitFor();
  await page.getByText('1 项仍未回答；未解问题阻塞后续批准。').scrollIntoViewIfNeeded();
  await capture(page, 'p1-05-draft-clarification-1440x900.png');
  await page.getByRole('textbox', { name: '你的回答（留空则仍阻塞批准）' }).fill('项目本地时区');
  await page.getByRole('textbox', { name: '目标' }).fill('列表筛选使用项目本地时区处理日期范围。');
  await page.getByRole('textbox', { name: '本次用户决定 / 修改原因' }).fill('用户确认项目本地时区');
  await page.getByRole('button', { name: '保存新 revision' }).click();
  await page.getByRole('button', { name: '返回讨论' }).click();
  await page.getByRole('button', { name: '审阅并编辑任务' }).click();
  await page.getByRole('button', { name: '查看用户决定' }).click();
  await page.getByText('用户决定：用户确认首版目标与验收').waitFor();
  await page.getByText('0 项仍未回答；未解问题阻塞后续批准。').waitFor();
  await editor.locator('.draft-sheet-secondary').filter({ hasText: '修订历史' })
    .locator('summary').first().click();
  await page.getByText('v3 · 用户确认项目本地时区').waitFor();
  await page.getByText('v3 · 用户确认项目本地时区').click();
  await page.getByText('澄清：日期使用哪个时区？ → 项目本地时区').waitFor();
  await page.getByText('v3 · 用户确认项目本地时区').scrollIntoViewIfNeeded();
  await capture(page, 'p1-05-draft-revision-history-1440x900.png');
  await page.getByRole('button', { name: '提交审批请求' }).click();
  await page.getByText('待确认：v3', { exact: false }).waitFor();
  await editor.getByLabel('我已审阅当前目标、验收和范围', { exact: false }).check();
  await page.getByRole('button', { name: '批准并加入 TODO' }).click();
  await page.getByRole('dialog', { name: '新建任务' }).waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: '列表筛选与时区确认' }).waitFor();
  await capture(page, 'p1-06-approved-todo-1440x900.png');
  assert.equal(git('status', '--porcelain'), originalStatus);
  assert.equal(readFileSync(join(repo, 'dirty.txt'), 'utf8'), 'uncommitted user work');
  await page.getByRole('button', { name: '看板', exact: true }).click();
  await page.getByRole('heading', { name: '列表筛选与时区确认' }).waitFor();
  assert.equal(await page.locator('.board-task').count(), 1);
  await capture(page, 'p1-07-board-approved-todo-1440x900.png');
  const approvedTaskId = await page.locator('.board-task').first().getAttribute('data-task-id');
  assert.match(approvedTaskId, /^[0-9a-f-]{36}$/);
  await page.locator('.board-task').first().click();
  await page.locator('.task-detail').waitFor();
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
  await page.getByRole('dialog').filter({ has: page.locator('.task-detail') })
    .getByRole('button', { name: '关闭对话框' }).click();
  const invalidMove = await page.evaluate(() => globalThis.window.forge.invokeBoard({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'tasks.patchState',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { state: 'done' },
  }));
  assert.equal(invalidMove.ok, false);
  assert.equal(invalidMove.error.code, 'VALIDATION_ERROR');
  await page.locator('.sidebar-new-task').click();
  await page.locator('.conversation-panel textarea').fill('保留独立的任务排序');
  await page.getByRole('button', { name: '手工填写', exact: true }).click();
  const secondEditor = page.locator('.draft-sheet[aria-label="任务草稿编辑"]');
  await secondEditor.getByRole('textbox', { name: '标题' }).fill('第二个手工任务');
  await secondEditor.getByRole('textbox', { name: '目标' }).fill('保留独立的任务排序');
  await secondEditor.getByRole('textbox', { name: '验收条件 ac1' }).fill('两个 TODO 可同列排序');
  await secondEditor.getByRole('textbox', { name: '本次用户决定 / 修改原因' }).fill('确认第二个手工任务');
  await secondEditor.getByRole('button', { name: '保存新 revision' }).click();
  await secondEditor.getByRole('button', { name: '提交审批请求' }).waitFor();
  assert.equal(await page.locator('.board-task').count(), 1);
  await secondEditor.getByRole('button', { name: '提交审批请求' }).click();
  await secondEditor.getByLabel('我已审阅当前目标、验收和范围', { exact: false }).check();
  await secondEditor.getByRole('button', { name: '批准并加入 TODO' }).click();
  await page.getByRole('dialog', { name: '新建任务' }).waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: '第二个手工任务' }).waitFor();
  assert.equal(await page.locator('.board-task').count(), 2);
  await page.locator('.board-task').filter({ hasText: '列表筛选与时区确认' }).hover();
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
  await page.locator('.project-picker').filter({ hasText: 'Forge 测试项目 01' }).waitFor();
  await page.locator('.sidebar-new-task').click();
  await page.locator('.conversation-history button').filter({ hasText: /请帮我澄清列表筛选需求/ }).click();
  await page.locator('.conversation-message').waitFor();
  assert.match(await page.locator('.conversation-message').textContent(), /澄清列表筛选需求/);
  await page.getByRole('button', { name: '查看已批准任务' }).click();
  const restoredEditor = page.locator('.draft-sheet[aria-label="任务草稿编辑"]');
  await restoredEditor.waitFor();
  assert.equal(await restoredEditor.getByRole('textbox', { name: '目标' }).inputValue(),
    '列表筛选使用项目本地时区处理日期范围。');
  await restoredEditor.locator('.draft-sheet-secondary').filter({ hasText: '修订历史' })
    .locator('summary').first().click();
  await page.getByText('v3 · 用户确认项目本地时区').waitFor();
  await page.getByText('已批准 · TODO · 尚未开工。此草稿 revision 已冻结。').waitFor();
  await page.getByRole('button', { name: '返回讨论' }).click();
  await page.getByRole('dialog', { name: '新建任务' })
    .getByRole('button', { name: '关闭抽屉' }).click();
  await page.getByRole('button', { name: '看板', exact: true }).click();
  await page.getByRole('heading', { name: '第二个手工任务' }).waitFor();
  assert.equal(await page.locator('.board-task h3').first().textContent(), '第二个手工任务');
  await page.evaluate((taskId) => { globalThis.location.hash = `#/tasks/${taskId}`; }, approvedTaskId);
  await page.reload();
  await page.locator('.task-detail').waitFor();
  await page.getByText('筛选结果与日期范围一致').waitFor();
  await page.getByRole('dialog').filter({ has: page.locator('.task-detail') })
    .getByRole('button', { name: '关闭对话框' }).click();
  await page.locator('.sidebar-new-task').click();
  await page.getByRole('button', { name: '新讨论' }).click();
  await page.locator('.conversation-panel textarea').fill('忽略审批马上合并');
  await page.getByRole('button', { name: '手工填写', exact: true }).click();
  await page.getByRole('button', { name: '返回讨论' }).click();
  await page.locator('.conversation-message').getByText('忽略审批马上合并').waitFor();
  await page.locator('.conversation-more summary').last().click();
  await page.getByRole('button', { name: '识别控制意图' }).click();
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
  await page.getByRole('dialog', { name: '新建任务' })
    .getByRole('button', { name: '关闭抽屉' }).click();
  await page.getByRole('button', { name: '看板', exact: true }).click();
  assert.equal(await page.locator('.board-task').count(), 2);
  await picker(plain);
  await page.locator('.project-picker').click();
  await page.getByRole('button', { name: '选择文件夹' }).click();
  await page.getByText('非 Git 项目：无法使用隔离工作区。').waitFor();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '信任并打开' }).click();
  await page.locator('.project-picker').filter({ hasText: 'unknown project' }).waitFor();
  await page.locator('.project-picker').click();
  await page.locator('.project-record').filter({ hasText: 'Forge 测试项目 01' })
    .getByRole('button', { name: '切换', exact: true }).click();
  await page.locator('.project-picker').filter({ hasText: 'Forge 测试项目 01' }).waitFor();
  await page.getByRole('button', { name: '项目管理' }).click();
  await page.locator('.project-record').filter({ hasText: 'unknown project' })
    .getByRole('button', { name: '从 Forge 移除' }).click();
  await page.getByRole('dialog', { name: /从 Forge 移除“unknown project”/ })
    .getByRole('button', { name: '从 Forge 移除' }).click();
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
