/** Real installed-app to same-Host browser check; loopback only, no model calls. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, chromium } from 'playwright-core';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('Installed mobile loopback smoke requires macOS arm64');
}
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dmg = process.env.FORGE_PACKAGE_SMOKE_DMG;
if (!dmg || !existsSync(dmg)) throw new Error('Set FORGE_PACKAGE_SMOKE_DMG to an existing internal DMG');
const isolated = mkdtempSync(join(tmpdir(), 'Forge installed mobile local '));
const mount = join(isolated, 'mount');
const installed = join(isolated, 'installed', 'Forge INTERNAL.app');
const home = join(isolated, 'home');
const appData = join(home, 'Library', 'Application Support');
const dataDir = join(appData, 'Forge', 'production');
const projectRoot = join(isolated, 'fixture project');
mkdirSync(mount, { recursive: true });
mkdirSync(join(isolated, 'installed'));
mkdirSync(projectRoot);
mkdirSync(home);
mkdirSync(join(isolated, 'empty-codex-home'));

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

let attached = false;
let app;
let browser;
let hostPid;
try {
  run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  attached = true;
  run('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  run('codesign', ['--verify', '--deep', '--strict', installed]);
  run('hdiutil', ['detach', mount]);
  attached = false;
  const fixture = JSON.parse(run('uv', [
    '--directory', join(root, 'python'), 'run', '--frozen', 'python',
    'scripts/seed_remote_device_fixture.py', dataDir, projectRoot,
  ]));
  app = await electron.launch({
    executablePath: join(installed, 'Contents', 'MacOS', 'Forge'),
    args: [], env: { ...process.env, HOME: home,
      CODEX_HOME: join(isolated, 'empty-codex-home'),
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin', FORGE_DEV_SERVER_URL: '',
      FORGE_INTERNAL_TEST_HOME: appData, FORGE_MODEL_PROVIDER: 'disabled',
      OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' },
  });
  const desktop = await app.firstWindow();
  await desktop.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  const health = await desktop.evaluate(() => globalThis.forge.hostHealth());
  assert.equal(health.data.storage.status, 'ready');
  assert.equal(health.data.storage.schemaVersion, 38);
  hostPid = health.data.pid;
  await desktop.locator('.sidebar-new-task').click();
  const newTask = desktop.getByRole('dialog', { name: '新建任务' });
  await newTask.waitFor();
  const content = '来自已安装 Forge 的真实 Host 消息';
  await newTask.getByRole('textbox', { name: '描述你的想法' }).fill(content);
  await newTask.getByRole('button', { name: '手工填写', exact: true }).click();
  const draft = newTask.locator('.draft-sheet[aria-label="任务草稿编辑"]');
  await draft.waitFor();
  await newTask.getByRole('button', { name: '返回讨论' }).click();
  await draft.waitFor({ state: 'hidden' });
  await newTask.locator('.draft-manual-editor textarea').fill('本机安装版与浏览器共享 Host 待办');
  await newTask.getByRole('button', { name: '保存文字' }).click();
  await newTask.getByRole('button', { name: '审阅并编辑任务' }).click();
  await draft.getByRole('textbox', { name: '标题' }).fill('安装版跨端审批测试');
  await draft.getByRole('textbox', { name: '目标' }).fill('由已安装 Desktop 发起，手机布局浏览器显式批准');
  await draft.getByRole('textbox', { name: '验收条件 ac1' }).fill('审批后只进入 TODO，运行次数仍为零');
  await draft.getByRole('textbox', { name: '本次用户决定 / 修改原因' }).fill('用户确认本机安装版独立测试目标');
  await draft.getByRole('button', { name: '保存新 revision' }).click();
  await draft.getByText('修订 v3', { exact: false }).waitFor();
  await draft.getByRole('button', { name: '提交审批请求' }).click();
  await draft.getByText('待确认：v3', { exact: false }).waitFor();
  await newTask.getByRole('button', { name: '关闭抽屉' }).click();
  await desktop.getByRole('button', { name: '设置' }).click();
  await app.evaluate(({ dialog }) => {
    const expected = [
      ['Start Forge local browser preview', 'Start local preview'],
      ['Approve a new Forge device', 'Approve device'],
      ['Revoke Forge device', 'Revoke device'],
    ];
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1);
      const next = expected.shift();
      if (!next || options?.title !== next[0] || options.buttons?.[1] !== next[1]) {
        throw new Error('Unexpected native confirmation in installed-app smoke');
      }
      return { response: 1 };
    };
  });
  await desktop.getByRole('button', { name: '开启本机浏览器预览' }).click();
  const loopback = await desktop.evaluate(() => globalThis.forge.remoteLoopback('inspect'));
  assert.equal(loopback.running, true);
  assert.match(loopback.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(loopback.hostId, health.data.hostId);
  await desktop.getByRole('button', { name: '创建一次性配对' }).click();
  const nonce = await desktop.locator('details').filter({ hasText: '查看临时 nonce' })
    .locator('code').textContent();
  assert.ok(nonce && nonce.length >= 40);

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await context.newPage();
  await mobile.goto(`${loopback.origin}/#/m/account`);
  await mobile.getByRole('textbox', { name: '设备名称' }).fill('Installed app browser fixture');
  await mobile.getByRole('textbox', { name: '一次性配对代码' }).fill(nonce);
  await mobile.getByRole('button', { name: '提交配对请求' }).click();
  await mobile.getByText('等待 Desktop 确认设备').waitFor();
  await desktop.getByRole('button', { name: '检查状态' }).click();
  await desktop.getByText('Installed app browser fixture').waitFor();
  await desktop.locator('.pairing-scope-choices input[value="task:draft"]').check();
  await desktop.locator('.pairing-scope-choices input[value="task:approve"]').check();
  await desktop.getByRole('button', { name: '批准访问 fixture project' }).click();
  await mobile.getByRole('button', { name: '检查确认结果' }).click();
  await mobile.getByText('会话已验证').waitFor();
  await mobile.getByRole('button', { name: '消息', exact: true }).click();
  const conversationOption = mobile.locator('.mobile-message-select option')
    .filter({ hasText: content });
  await conversationOption.waitFor({ state: 'attached' });
  assert.match(await conversationOption.textContent(), /版本 2/);
  await mobile.getByRole('button', { name: '读取 Host 消息' }).click();
  const savedMessage = mobile.locator('.mobile-message-history').getByText(content);
  await savedMessage.waitFor();
  await mobile.locator('.mobile-main').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await savedMessage.scrollIntoViewIfNeeded();
  const screenshot = process.env.FORGE_PACKAGE_MOBILE_SCREENSHOT;
  if (screenshot) await mobile.screenshot({ path: screenshot });
  const unsentChinese = '请在现有项目中核对中文需求、来源与验收条件。'.repeat(18);
  await mobile.getByRole('textbox', { name: '消息内容' }).fill(unsentChinese);
  await mobile.getByRole('button', { name: '保存本机草稿' }).click();
  await mobile.getByText('本机未提交草稿', { exact: false }).waitFor();
  await mobile.setViewportSize({ width: 844, height: 390 });
  await mobile.evaluate(() => new Promise((resolve) =>
    globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))));
  assert.equal(await mobile.locator('.mobile-app').count(), 1,
    'Landscape must retain the explicit mobile route');
  const landscapeInput = mobile.getByRole('textbox', { name: '消息内容' });
  assert.equal(await landscapeInput.inputValue(), unsentChinese);
  assert.equal(await mobile.evaluate(() =>
    globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
  assert.equal(await mobile.locator('.mobile-nav button').evaluateAll((buttons) =>
    buttons.every((button) => button.getBoundingClientRect().height >= 44)), true);
  await landscapeInput.scrollIntoViewIfNeeded();
  await landscapeInput.focus();
  assert.equal(await landscapeInput.evaluate((element) =>
    globalThis.document.activeElement === element), true);
  const landscapeScreenshot = process.env.FORGE_PACKAGE_MOBILE_LANDSCAPE_SCREENSHOT;
  if (landscapeScreenshot) await mobile.screenshot({ path: landscapeScreenshot });
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.reload();
  await mobile.getByText('会话已验证').waitFor();
  await mobile.getByRole('textbox', { name: '消息内容' }).waitFor();
  assert.equal(await mobile.getByRole('textbox', { name: '消息内容' }).inputValue(), unsentChinese);
  await mobile.getByRole('button', { name: '清除本机草稿' }).click();
  await mobile.getByRole('button', { name: '待处理', exact: true }).click();
  await mobile.getByRole('button', { name: '刷新', exact: true }).click();
  await mobile.getByText('安装版跨端审批测试').first().waitFor();
  let approvalPosts = 0;
  mobile.on('request', (request) => {
    if (request.url().endsWith('/v1/commands') && request.method() === 'POST') {
      approvalPosts += 1;
    }
  });
  await mobile.getByRole('button', { name: '查看当前范围' }).click();
  await mobile.getByRole('button', { name: '批准并进入 TODO…' }).click();
  await mobile.getByRole('dialog', { name: '确认批准当前任务草稿' }).waitFor();
  await context.setOffline(true);
  await mobile.getByText('Host 未连接').waitFor();
  assert.equal(await mobile.getByRole('dialog', { name: '确认批准当前任务草稿' })
    .getByRole('button', { name: '最终确认批准' }).isDisabled(), true);
  assert.equal(approvalPosts, 0);
  await context.setOffline(false);
  await mobile.getByText('会话已验证').waitFor({ timeout: 15_000 });
  assert.equal(approvalPosts, 0, 'Reconnect must not replay an offline approval');
  await mobile.getByRole('button', { name: '查看当前范围' }).click();
  await mobile.getByRole('button', { name: '批准并进入 TODO…' }).click();
  // A second same-origin tab can rotate CSRF without updating this Vue tree.
  // The first write must be refused, then a human must review and confirm again.
  const rotated = await mobile.evaluate(async () => {
    const response = await fetch('/v1/session/current', {
      credentials: 'same-origin', headers: { 'X-Forge-Session': '1' },
    });
    return response.status;
  });
  assert.equal(rotated, 200);
  const denied = mobile.waitForResponse((response) => response.url().endsWith('/v1/commands') &&
    response.request().method() === 'POST' && response.status() === 403);
  await mobile.getByRole('dialog', { name: '确认批准当前任务草稿' })
    .getByRole('button', { name: '最终确认批准' }).click();
  await denied;
  await mobile.getByText('本次审批未提交', { exact: false }).waitFor();
  await mobile.getByRole('button', { name: '查看当前范围' }).click();
  await mobile.getByRole('button', { name: '批准并进入 TODO…' }).click();
  await mobile.getByRole('dialog', { name: '确认批准当前任务草稿' })
    .getByRole('button', { name: '最终确认批准' }).click();
  await mobile.getByText(/Host 已确认任务 .* 进入 TODO/).waitFor({ timeout: 10_000 });
  await mobile.getByRole('button', { name: '任务', exact: true }).click();
  await mobile.getByText('安装版跨端审批测试').first().waitFor();
  const todoScreenshot = process.env.FORGE_PACKAGE_MOBILE_TODO_SCREENSHOT;
  if (todoScreenshot) await mobile.screenshot({ path: todoScreenshot });
  await desktop.getByRole('button', { name: '看板', exact:true }).click();
  await desktop.getByRole('heading', { name: '安装版跨端审批测试' }).waitFor();
  assert.equal(await desktop.locator('.board-task').count(), 1);
  await mobile.getByRole('button', { name: '消息', exact: true }).click();
  await mobile.getByRole('button', { name: '读取 Host 消息' }).click();
  await mobile.locator('.mobile-message-history').getByText(content).waitFor();
  await mobile.waitForFunction(async () =>
    (await globalThis.caches.keys()).some((name) => name.startsWith('forge-shell-')));
  await desktop.getByRole('button', { name: '设置' }).click();
  await desktop.getByRole('button', { name: '刷新清单' }).click();
  const pairedDevice = desktop.locator('.remote-device-card').filter({
    hasText: 'Installed app browser fixture',
  });
  await pairedDevice.getByRole('button', { name: '收窄为只读' }).click();
  await desktop.getByText('设备已收窄为只读。').waitFor();
  await mobile.locator('.mobile-message-history').getByText(content)
    .waitFor({ state: 'detached', timeout: 15_000 });
  await mobile.getByText('会话已验证').waitFor();
  const narrowed = await mobile.evaluate(async () => {
    const response = await fetch('/v1/session/current', {
      credentials: 'same-origin', headers: { 'X-Forge-Session': '1' },
    });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(narrowed.status, 200);
  assert.equal(narrowed.body.policyRevision, 2);
  const narrowedScreenshot = process.env.FORGE_PACKAGE_MOBILE_NARROWED_SCREENSHOT;
  if (narrowedScreenshot) await mobile.screenshot({ path: narrowedScreenshot });
  await pairedDevice.getByRole('button', { name: '撤销设备' }).click();
  await desktop.getByText('设备及其会话已撤销；已提交的操作不会回滚。').waitFor();
  await mobile.getByText('Host 未连接').waitFor({ timeout: 15_000 });
  assert.equal(await mobile.locator('.mobile-message-history').getByText(content).count(), 0);
  await mobile.waitForFunction(async () =>
    !(await globalThis.caches.keys()).some((name) => name.startsWith('forge-shell-')) &&
    !(await navigator.serviceWorker.getRegistrations()).some((registration) =>
      registration.active?.scriptURL === `${globalThis.location.origin}/sw.js`));
  const revokedScreenshot = process.env.FORGE_PACKAGE_MOBILE_REVOKED_SCREENSHOT;
  if (revokedScreenshot) await mobile.screenshot({ path: revokedScreenshot });
  const rejectedSession = await mobile.evaluate(async () => {
    const response = await fetch('/v1/session/current', {
      credentials: 'same-origin', headers: { 'X-Forge-Session': '1' },
    });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(rejectedSession.status, 403);
  assert.equal(rejectedSession.body.code, 'REMOTE_AUTH_REVOKED');
  await browser.close(); browser = undefined;
  await desktop.getByRole('button', { name: '关闭本机浏览器预览' }).click();
  assert.equal((await desktop.evaluate(() => globalThis.forge.remoteLoopback('inspect'))).running, false);
  await app.close(); app = undefined;
  assert.equal(alive(hostPid), false);
  const database = join(dataDir, 'forge.sqlite');
  assert.ok(existsSync(database));
  const packagedPython = join(installed, 'Contents', 'Resources', 'forge-python',
    'runtime', 'bin', 'python3.12');
  const persisted = JSON.parse(run(packagedPython, ['-c',
    'import json,sqlite3,sys; db=sqlite3.connect(sys.argv[1]); print(json.dumps({' +
    '"tasks":db.execute("SELECT COUNT(*) FROM tasks WHERE state=?",("todo",)).fetchone()[0],' +
    '"runs":db.execute("SELECT COUNT(*) FROM runs").fetchone()[0]}))', database]));
  assert.deepEqual(persisted, { tasks: 1, runs: 0 });
  console.log(JSON.stringify({ stage: 'installed-app-mobile-loopback',
    packaged: true, bundledHost: true, projectId: fixture.projectId,
    hostSchema: health.data.storage.schemaVersion, messageVisible: true,
    approvalEnteredTodo: true, desktopBoardObserved: true,
    staleCsrfRejectedThenHumanRetried: true,
    chineseDraftSurvivedLandscapeAndReloadWithoutHostSend: true,
    offlineApprovalNeverSubmittedOrReplayed: true,
    deviceNarrowedAndHostTextCleared: true,
    deviceRevokedAndHostTextCleared: true,
    forgePwaCacheAndWorkerCleared: true,
    todoCount: persisted.tasks, runCount: persisted.runs,
    privateHttpsOrPhone: false }));
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (app) await app.close().catch(() => undefined);
  if (hostPid) assert.equal(alive(hostPid), false, 'Owned packaged Host still running');
  if (attached) run('hdiutil', ['detach', mount]);
  rmSync(isolated, { recursive: true, force: true });
}
