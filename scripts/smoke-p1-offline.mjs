import assert from 'node:assert/strict';
/* global document, getComputedStyle, innerWidth */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const temporaryRoot = mkdtempSync(join(tmpdir(), 'forge-p1-offline-'));
const accessibilityMode = process.env.FORGE_P6_A11Y === '1';
const taskTitle = accessibilityMode ? '中文长标题'.repeat(24) : '离线输入校验';
const repo = join(temporaryRoot, accessibilityMode ? 'Forge 测试项目 01 '.repeat(6).trim() : '离线项目 with spaces');
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
  FORGE_MODEL_PROVIDER: 'disabled',
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
  if (accessibilityMode) {
    const trigger = page.getByRole('button', { name: '快速导航' });
    await trigger.focus();
    await page.keyboard.press('Meta+k');
    const dialog = page.getByRole('dialog', { name: '快速导航' });
    await dialog.waitFor();
    await page.screenshot({ path: join(output, 'p6-02-keyboard-nav-1440x900.png') });
    assert.equal(await page.getByLabel('搜索页面').evaluate((input) => input === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.getByRole('button', { name: '关闭对话框' }).evaluate(
      (button) => button === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.getByRole('navigation', { name: '可用页面' }).getByRole('button').last().evaluate(
      (button) => button === document.activeElement), true);
    assert.equal(await page.locator('#app').evaluate((element) => element.inert), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate((button) => button === document.activeElement), true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.match(await page.locator('.compose-pane').evaluate(
      (panel) => getComputedStyle(panel).animationDuration), /0s|1e-05s/);
  }
  const modelCatalog = await page.evaluate(() => globalThis.forge.agentProfileCatalog());
  assert.equal(modelCatalog.modelProviders[0].available, false);
  assert.equal(modelCatalog.modelProviders[0].reason, 'MODEL_PROVIDER_DISABLED');
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
  await page.getByRole('textbox', { name: '标题' }).fill(taskTitle);
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
  await page.getByRole('heading', { name: taskTitle }).waitFor();
  assert.equal(await page.locator('.board-task').count(), 1);
  const taskId = await page.locator('.board-task').first().getAttribute('data-task-id');
  assert.match(taskId, /^[0-9a-f-]{36}$/);
  if (accessibilityMode) {
    assert.equal(await page.locator('.project-picker').getAttribute('title'), basename(repo));
    assert.equal(await page.locator('.board-task').first().getAttribute('title'), taskTitle);
    for (const [width, height] of [[1280, 800], [1600, 1000]]) {
      await page.setViewportSize({ width, height });
      for (const scale of [1, 1.25, 1.5]) {
        const metrics = await page.evaluate((value) => {
          document.body.style.zoom = String(value);
          const picker = document.querySelector('.project-picker')?.getBoundingClientRect();
          const manual = [...document.querySelectorAll('button')].find((item) => item.textContent === '手工创建任务')?.getBoundingClientRect();
          return { viewport: innerWidth, document: document.documentElement.scrollWidth,
            pickerRight: picker?.right, manualRight: manual?.right,
            cardWidth: document.querySelector('.board-task')?.getBoundingClientRect().width };
        }, scale);
        assert.ok(metrics.document <= metrics.viewport, `horizontal page overflow: ${JSON.stringify({ width, scale, metrics })}`);
        assert.ok(metrics.pickerRight <= metrics.viewport && metrics.manualRight <= metrics.viewport && metrics.cardWidth > 0,
          `controls clipped: ${JSON.stringify({ width, scale, metrics })}`);
        console.log(JSON.stringify({ stage: 'a11y-css-scale', width, height, scale, metrics }));
        if (width === 1280 && scale === 1.5) await page.screenshot({
          path: join(output, 'p6-02-board-1280-css-zoom-150.png'),
        });
      }
    }
    await page.evaluate(() => { document.body.style.zoom = ''; });
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.screenshot({ path: join(output, accessibilityMode ?
    'p6-02-long-title-board-1440x900.png' : 'p1-10-offline-approved-todo-1440x900.png') });
  await assertSourceUntouched();
  await app.close(); app = null;
  page = await launch();
  await page.getByRole('button', { name: '研发看板' }).click();
  await page.getByRole('heading', { name: taskTitle }).waitFor();
  assert.equal(await page.locator('.board-task').first().getAttribute('data-task-id'), taskId);
  await page.locator('.board-task').first().click();
  if (accessibilityMode) console.log(JSON.stringify({ stage: 'drawer-focus-before', active: await page.evaluate(() => ({
    tag: document.activeElement?.tagName, className: document.activeElement?.className,
  })) }));
  await page.getByRole('dialog', { name: '任务详情' }).waitFor();
  await page.getByText('无效输入得到明确错误').waitFor();
  if (accessibilityMode) {
    assert.equal(await page.getByRole('dialog', { name: '任务详情' }).locator('h3').textContent(), taskTitle);
    const detailLayout = await page.getByRole('dialog', { name: '任务详情' }).evaluate((drawer) => ({
      width: drawer.clientWidth, scrollWidth: drawer.scrollWidth,
      closeRight: drawer.querySelector('[aria-label="关闭抽屉"]')?.getBoundingClientRect().right,
      viewport: innerWidth,
    }));
    assert.ok(detailLayout.scrollWidth <= detailLayout.width && detailLayout.closeRight <= detailLayout.viewport,
      `long Chinese task clipped its drawer: ${JSON.stringify(detailLayout)}`);
    await page.screenshot({ path: join(output, 'p6-02-long-title-drawer-1440x900.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: '任务详情' }).waitFor({ state: 'hidden' });
    console.log(JSON.stringify({ stage: 'drawer-focus-after', active: await page.evaluate(() => ({
      tag: document.activeElement?.tagName, className: document.activeElement?.className,
    })) }));
    await page.waitForFunction(() => document.querySelector('.board-task') === document.activeElement,
      undefined, { timeout: 3000 });
  }
  await assertSourceUntouched();
  console.log(JSON.stringify({ result: 'pass', mode: 'isolated credentials and unavailable proxy',
    stages: ['trusted-project', 'persisted-message', 'manual-draft', 'human-approval',
      'todo-board', 'desktop-restart', 'task-source-unchanged'],
    screenshot: accessibilityMode ? 'output/playwright/p6-02-long-title-board-1440x900.png' :
      'output/playwright/p1-10-offline-approved-todo-1440x900.png' }, null, 2));
} finally {
  await app?.close();
  rmSync(temporaryRoot, { recursive: true, force: true });
}
