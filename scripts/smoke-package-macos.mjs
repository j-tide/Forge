import assert from 'node:assert/strict';
/* global window */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The packaged smoke is macOS arm64 only');
}
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appVersion = JSON.parse(readFileSync(join(root, 'apps', 'desktop', 'package.json'), 'utf8')).version;
const dmg = process.env.FORGE_PACKAGE_SMOKE_DMG || join(root, 'build', 'macos',
  `Forge-${appVersion}-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.dmg`);
assert.ok(existsSync(dmg), 'Run pnpm package:mac:internal first');
const isolated = mkdtempSync(join(tmpdir(), 'Forge package smoke '));
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const mount = join(isolated, 'mount');
const installed = join(installRoot, 'Forge INTERNAL.app');
const home = join(isolated, 'new user home');
const codexHome = join(isolated, 'empty-codex-home');
mkdirSync(mount, { recursive: true });
mkdirSync(home, { recursive: true });
mkdirSync(codexHome, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}${result.stdout}`);
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

let attached = false;
let app;
let hostPid;
let retinaProbe;
try {
  run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  attached = true;
  run('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=4', installed]);
  const marker = JSON.parse(readFileSync(join(installed, 'Contents', 'Resources',
    'FORGE_INTERNAL_TEST_BUILD'), 'utf8'));
  assert.equal(marker.kind, 'internal-qa');
  assert.match(marker.qaId, /^[a-f0-9]{16}$/);
  const bundleId = spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier',
    join(installed, 'Contents', 'Info.plist')], { encoding:'utf8' });
  assert.equal(bundleId.status, 0);
  assert.equal(bundleId.stdout.trim(), `dev.forge.desktop.internal.${marker.qaId}`);
  run('hdiutil', ['detach', mount]);
  attached = false;

  const packagedEnv = { ...process.env, HOME: home, CODEX_HOME: codexHome,
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin', FORGE_DEV_SERVER_URL: '',
    FORGE_INTERNAL_TEST_HOME: join(home, 'Library', 'Application Support'),
    FORGE_HOST_DATA_DIR: join(isolated, 'ignored-dev-override'), FORGE_MODEL_PROVIDER: 'disabled',
    OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' };
  app = await electron.launch({
    executablePath: join(installed, 'Contents', 'MacOS', 'Forge'),
    args: [],
    env: packagedEnv,
  });
  let page = await app.firstWindow();
  try { await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 }); }
  catch (error) {
    console.error('Packaged Host state:', await page.evaluate(() => window.forge?.pythonHostStatus()));
    throw error;
  }
  await page.getByRole('heading', { name: '研发看板' }).waitFor();
  const initialShell = page.locator('.app-shell');
  assert.equal(await initialShell.getAttribute('data-theme'), 'light',
    'A fresh packaged profile must start in the light theme');
  assert.equal(await initialShell.getAttribute('data-reduce-transparency'), 'false');
  assert.equal(await initialShell.getAttribute('data-reduce-motion'), 'false');
  await page.getByRole('button', { name: '设置' }).click();
  assert.equal(await page.getByLabel('界面主题').inputValue(), 'light');
  await page.getByRole('button', { name: '看板', exact: true }).click();
  await page.getByRole('heading', { name: '研发看板' }).waitFor();
  const boardSpacingTag = process.env.FORGE_PACKAGE_BOARD_SPACING_TAG;
  if (boardSpacingTag) {
    assert.match(boardSpacingTag, /^[a-z0-9][a-z0-9-]{0,39}$/);
    await page.getByRole('button', { name: '看板', exact: true }).click();
    for (const [width, height] of [[1440, 900], [1600, 1000]]) {
      await page.setViewportSize({ width, height });
      const spacing = await page.evaluate(() => {
        const content = globalThis.document.querySelector('.shell-content')?.getBoundingClientRect();
        const card = globalThis.document.querySelector('.board-heading')?.getBoundingClientRect();
        return content && card ? card.top - content.top : null;
      });
      assert.ok(spacing !== null && spacing >= 0 && spacing <= 80,
        `Board heading must align with the workspace top, got ${spacing}px`);
      const path = join(root, 'output', 'playwright',
        `${boardSpacingTag}-board-top-${width}x${height}.png`);
      mkdirSync(dirname(path), { recursive: true });
      await page.screenshot({ path });
    }
    await page.getByRole('button', { name: '看板', exact: true }).click();
    await page.getByRole('heading', { name: '研发看板' }).waitFor();
  }
  await page.keyboard.press('Meta+k');
  const quickNav = page.getByRole('dialog', { name: '快速导航' });
  await quickNav.waitFor();
  await page.waitForFunction(() => Boolean(globalThis.document.activeElement
    ?.matches('input.forge-text-input')
    && globalThis.document.activeElement?.closest('[role="dialog"]')));
  await quickNav.getByRole('textbox', { name: '搜索页面' }).fill('项目资料');
  await quickNav.getByRole('button', { name: '项目资料', exact: true }).click();
  await quickNav.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: '项目知识', exact: true }).waitFor();
  await page.keyboard.press('Meta+k');
  await quickNav.waitFor();
  await page.keyboard.press('Escape');
  await quickNav.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '看板', exact: true }).click();
  await page.getByRole('heading', { name: '研发看板' }).waitFor();
  const health = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(health.ok, true);
  assert.equal(health.data.storage.status, 'ready');
  hostPid = health.data.pid;
  const details = await app.evaluate(({ app: electronApp }) => ({
    packaged: electronApp.isPackaged,
    appData: electronApp.getPath('appData'),
    resources: process.resourcesPath,
  }));
  assert.equal(details.packaged, true);
  assert.ok(details.appData.startsWith(home), 'Packaged test must use isolated user data');
  assert.ok(details.resources.startsWith(installed));
  const ownedCommand = spawnSync('ps', ['-p', String(hostPid), '-o', 'command='],
    { encoding: 'utf8' });
  assert.equal(ownedCommand.status, 0);
  assert.ok(ownedCommand.stdout.includes(join(installed, 'Contents', 'Resources',
    'forge-python', 'runtime', 'bin', 'python3.12')));
  assert.ok(!ownedCommand.stdout.includes(join(root, 'python', '.venv')));
  const catalog = await page.evaluate(() => window.forge.agentProfileCatalog());
  const codex = catalog.executors.find((entry) => entry.executorId === 'executor.codex');
  assert.ok(codex, 'Packaged Host did not load its built-in Executor manifest');
  assert.equal(codex.available, false,
    'A clean Finder-style PATH must not claim an unbundled Codex CLI is available');
  const plugin = await page.evaluate(() => window.forge.inspectBundledPlugin());
  assert.equal(plugin.compatible, true);
  assert.deepEqual(plugin.manifest?.contributes.executors, ['executor.codex']);
  assert.deepEqual(plugin.manifest?.contributes.modelProviders, ['model.codex']);
  assert.deepEqual(plugin.manifest?.contributes.tools, []);
  assert.deepEqual(plugin.manifest?.requestedPermissions,
    ['workspace.read', 'workspace.write', 'process.spawn']);
  assert.match(plugin.manifest?.contentHash ?? '', /^[a-f0-9]{64}$/);
  assert.deepEqual(plugin.activeRunRefs, []);
  assert.equal(existsSync(join(installed, 'Contents', 'Resources', 'forge-python',
    'packages', 'forge', 'builtin_plugins', 'plugins.lock.json')), true);
  const preferences = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getLastWebPreferences());
  assert.equal(preferences?.contextIsolation, true);
  assert.equal(preferences?.nodeIntegration, false);
  assert.equal(preferences?.sandbox, true);
  const retinaTag = process.env.FORGE_PACKAGE_RETINA_TAG;
  if (retinaTag) {
    assert.match(retinaTag, /^[a-z0-9][a-z0-9-]{0,39}$/);
    const displayScale = await app.evaluate(({ screen }) =>
      screen.getPrimaryDisplay().scaleFactor);
    const viewport = await page.evaluate(() => ({ ratio: window.devicePixelRatio,
      width: window.innerWidth, height: window.innerHeight }));
    const ratio = viewport.ratio;
    assert.ok(displayScale >= 2 && ratio >= 2,
      `Expected this real Mac Retina display and Renderer to use 2x: ${displayScale}/${ratio}`);
    for (const [name, button, heading] of [
      ['board', '看板', '研发看板'],
      ['settings', '设置', '设置'],
      ['projects', '项目管理', '项目'],
      ['workflows', '工作流', '工作流'],
      ['agents', '角色', 'Agent 角色'],
      ['plugins', '插件', '插件与集成'],
      ['knowledge', '项目资料', '项目知识'],
    ]) {
      await page.getByRole('button', { name: button, exact: true }).click();
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      if (name === 'projects') await page.getByRole('button', { name: '选择文件夹' }).waitFor();
      if (name === 'workflows') await page.getByRole('button', { name: '从快速流程新建' }).waitFor();
      if (name === 'agents') await page.getByRole('button', { name: '新建角色' }).first().waitFor();
      if (name === 'plugins') await page.getByText('Codex 启动握手等待（秒）', { exact: true }).waitFor();
      if (name === 'knowledge') await page.getByText('请先选择项目', { exact: true }).waitFor();
      const animatedSelectors = name === 'board' ? ['.board-pane']
        : name === 'settings' ? ['.utility-view'] : [];
      for (const selector of animatedSelectors) {
        const settledOpacity = await page.locator(selector).evaluate(async (element) => {
          await Promise.all(element.getAnimations().map((animation) => animation.finished));
          return Number(window.getComputedStyle(element).opacity);
        });
        assert.equal(settledOpacity, 1, `${name} visual capture must follow its entrance animation`);
      }
      const dimensions = await page.evaluate(() => ({
        content: globalThis.document.documentElement.scrollWidth, viewport: window.innerWidth,
      }));
      assert.ok(dimensions.content <= dimensions.viewport,
        `${name} overflows on Mac Retina: ${JSON.stringify(dimensions)}`);
      const screenshot = join(root, 'output', 'playwright',
        `${retinaTag}-${name}-retina-native.png`);
      mkdirSync(dirname(screenshot), { recursive: true });
      await page.screenshot({ path: screenshot, scale: 'device' });
      const png = readFileSync(screenshot);
      assert.equal(png.readUInt32BE(16), Math.round(viewport.width * ratio));
      assert.equal(png.readUInt32BE(20), Math.round(viewport.height * ratio));
    }
    retinaProbe = { displayScale, rendererPixelRatio: ratio,
      physicalScreenshot: `${Math.round(viewport.width * ratio)}x${Math.round(viewport.height * ratio)}` };
  }
  const surfacesTag = process.env.FORGE_PACKAGE_SURFACES_TAG;
  if (surfacesTag) {
    assert.match(surfacesTag, /^[a-z0-9][a-z0-9-]{0,39}$/);
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const surface of [
      { button: '项目管理', heading: '项目', name: 'projects' },
      { button: '工作流', heading: '工作流', name: 'workflows' },
      { button: '角色', heading: 'Agent 角色', name: 'agents' },
      { button: '插件', heading: '插件与集成', name: 'plugins' },
      { button: '项目资料', heading: '项目知识', name: 'knowledge' },
    ]) {
      await page.getByRole('button', { name: surface.button, exact: true }).click();
      await page.getByRole('heading', { name: surface.heading, exact: true }).waitFor();
      if (surface.name === 'projects') {
        await page.getByRole('button', { name: '选择文件夹' }).waitFor();
      } else if (surface.name === 'workflows') {
        await page.getByRole('button', { name: '从快速流程新建' }).waitFor();
      } else if (surface.name === 'agents') {
        await page.getByRole('button', { name: '新建角色' }).first().waitFor();
      } else if (surface.name === 'plugins') {
        await page.getByText('Codex 启动握手等待（秒）', { exact: true }).waitFor();
        if (!(await page.getByText('model.codex', { exact: true }).isVisible())) {
          await page.locator('.plugin-diagnostics summary').click();
        }
        await page.getByText('model.codex', { exact: true }).waitFor();
        const control = page.getByRole('button', { name: '停用 Codex 插件' });
        await control.scrollIntoViewIfNeeded();
        assert.equal(await control.isVisible(), true);
        assert.equal(await control.isEnabled(), true);
        const controlsPath = join(root, 'output', 'playwright',
          `${surfacesTag}-plugins-controls-1440x900.png`);
        mkdirSync(join(root, 'output', 'playwright'), { recursive: true });
        await page.screenshot({ path: controlsPath });
        await page.locator('.plugins-page-header').scrollIntoViewIfNeeded();
      } else if (surface.name === 'knowledge') {
        await page.getByText('请先选择项目', { exact: true }).waitFor();
        const eyebrow = await page.locator('.knowledge-kicker').boundingBox();
        const title = await page.getByRole('heading', { name: '项目知识', exact: true }).boundingBox();
        assert.ok(eyebrow && title && title.y - eyebrow.y < 80,
          'Knowledge heading must stay grouped with the page eyebrow');
      }
      for (const width of [1280, 1440, 1600]) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => ({
          content: globalThis.document.documentElement.scrollWidth, viewport: window.innerWidth,
        }));
        assert.ok(dimensions.content <= dimensions.viewport,
          `${surface.name} overflows at ${width}: ${JSON.stringify(dimensions)}`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      const path = join(root, 'output', 'playwright',
        `${surfacesTag}-${surface.name}-1440x900.png`);
      mkdirSync(join(root, 'output', 'playwright'), { recursive: true });
      await page.screenshot({ path });
    }
  }
  const plannerTag = process.env.FORGE_PACKAGE_WORKFLOW_PLANNER_TAG;
  if (plannerTag) {
    assert.match(plannerTag, /^[a-z0-9][a-z0-9-]{0,39}$/);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: '工作流', exact: true }).click();
    await page.getByRole('button', { name: '从标准流程新建' }).click();
    const firstNode = page.locator('.workflow-node').first();
    await firstNode.locator('summary').click();
    assert.equal(await firstNode.locator('select').first().inputValue(), 'planner');
    await firstNode.scrollIntoViewIfNeeded();
    const plannerRoleImage = join(root, 'output', 'playwright',
      `${plannerTag}-standard-planner-role-1440x900.png`);
    mkdirSync(dirname(plannerRoleImage), { recursive: true });
    await page.screenshot({ path: plannerRoleImage });
    await page.getByRole('button', { name: '检查能力' }).click();
    await page.getByText('WORKFLOW_PROFILE_UNAVAILABLE', { exact: false }).first().waitFor();
    await page.locator('[aria-label="Workflow 编译诊断"] .forge-status-tag')
      .filter({ hasText: '需要调整后发布' }).waitFor();
    const plannerImage = join(root, 'output', 'playwright',
      `${plannerTag}-standard-planner-unavailable-1440x900.png`);
    mkdirSync(dirname(plannerImage), { recursive: true });
    await page.screenshot({ path: plannerImage });
  }
  const profileRoleTag = process.env.FORGE_PACKAGE_PROFILE_ROLE_TAG ||
    process.env.FORGE_PACKAGE_PROFILE_READONLY_TAG;
  if (profileRoleTag) {
    assert.match(profileRoleTag, /^[a-z0-9][a-z0-9-]{0,39}$/);
    const profile = {
      schemaVersion: '1.0', id: 'profile.qa.planner', revision: 1,
      name: 'QA Planner', role: 'planner', executorId: 'executor.codex',
      modelId: 'unavailable-model', promptTemplate: 'Plan without changing files.',
      contextProviders: ['task-contract'], policyProfile: 'read-only',
      limits: { maxTurns: 4, maxSeconds: 300, maxOutputTokens: 2000 },
    };
    const saved = await page.evaluate((value) => window.forge.saveAgentProfile({
      profile: value, expectedRevision: 0,
    }), profile);
    assert.equal(saved.role, 'planner');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: '角色', exact: true }).click();
    const row = page.locator('.agent-profile').filter({ hasText: 'QA Planner' });
    await row.getByRole('button', { name: '编辑' }).click();
    const form = page.locator('.agent-form');
    assert.equal(await form.getByLabel('角色', { exact: true }).inputValue(), 'planner');
    assert.equal(await form.getByLabel('权限要求').inputValue(), 'read-only');
    assert.equal(await form.getByRole('button', { name: '保存新版本' }).isDisabled(), true);
    const after = await page.evaluate(() => window.forge.agentProfileCatalog());
    assert.equal(after.profiles.find((item) => item.id === 'profile.qa.planner')?.revision, 1);
    assert.equal(after.profiles.find((item) => item.id === 'profile.qa.planner')?.role, 'planner');
    assert.equal(after.availability.find((item) => item.profileId === 'profile.qa.planner')?.runnable,
      false);
    const path = join(root, 'output', 'playwright',
      `${profileRoleTag}-planner-profile-unavailable-1440x900.png`);
    mkdirSync(dirname(path), { recursive: true });
    await page.screenshot({ path });
  }
  const pluginConfigTag = process.env.FORGE_PACKAGE_PLUGIN_CONFIG_TAG;
  if (pluginConfigTag) {
    assert.match(pluginConfigTag, /^[a-z0-9][a-z0-9-]{0,39}$/);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: '插件', exact: true }).click();
    await page.getByRole('heading', { name: '插件与集成', exact: true }).waitFor();
    await page.locator('#forge-plugin-appServerInitializationTimeoutSeconds').fill('2');
    await page.getByRole('button', { name: '保存配置' }).click();
    await page.getByText('插件设置已保存。退出并重开 Forge 后', { exact: false }).waitFor();
    const pending = await page.evaluate(() => window.forge.inspectBundledPlugin());
    assert.equal(pending.configRevision, 1);
    assert.deepEqual(pending.configValues, { appServerInitializationTimeoutSeconds: 2 });
    assert.equal(pending.configApplied, false);
    assert.equal(pending.restartRequired, true);
    assert.match(await page.locator('.plugins-heading').first()
      .locator('.forge-status-tag').innerText(), /配置待重启/);
    await page.locator('.plugins-page-header').scrollIntoViewIfNeeded();
    const pendingStatusImage = join(root, 'output', 'playwright',
      `${pluginConfigTag}-plugin-config-pending-status-1440x900.png`);
    mkdirSync(dirname(pendingStatusImage), { recursive: true });
    await page.screenshot({ path: pendingStatusImage });
    await page.locator('#forge-plugin-appServerInitializationTimeoutSeconds')
      .scrollIntoViewIfNeeded();
    const pendingImage = join(root, 'output', 'playwright',
      `${pluginConfigTag}-plugin-config-pending-1440x900.png`);
    mkdirSync(dirname(pendingImage), { recursive: true });
    await page.screenshot({ path: pendingImage });

    const originalHostPid = hostPid;
    await app.close();
    app = undefined;
    assert.equal(alive(originalHostPid), false, 'Owned Host remained after package exit');
    app = await electron.launch({ executablePath: join(installed, 'Contents', 'MacOS', 'Forge'),
      args: [], env: packagedEnv });
    page = await app.firstWindow();
    await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
    const restartedHealth = await page.evaluate(() => window.forge.hostHealth());
    assert.equal(restartedHealth.ok, true);
    assert.notEqual(restartedHealth.data.pid, originalHostPid);
    hostPid = restartedHealth.data.pid;
    await page.getByRole('button', { name: '插件', exact: true }).click();
    await page.getByRole('heading', { name: '插件与集成', exact: true }).waitFor();
    await page.locator('#forge-plugin-appServerInitializationTimeoutSeconds')
      .waitFor({ state: 'visible' });
    assert.equal(await page.locator('#forge-plugin-appServerInitializationTimeoutSeconds')
      .inputValue(), '2');
    const applied = await page.evaluate(() => window.forge.inspectBundledPlugin());
    assert.equal(applied.configRevision, 1);
    assert.deepEqual(applied.configValues, pending.configValues);
    assert.equal(applied.configApplied, true);
    assert.equal(applied.restartRequired, false);
    await page.locator('#forge-plugin-appServerInitializationTimeoutSeconds')
      .scrollIntoViewIfNeeded();
    const appliedImage = join(root, 'output', 'playwright',
      `${pluginConfigTag}-plugin-config-applied-1440x900.png`);
    await page.screenshot({ path: appliedImage });
  }
  const restartTag = process.env.FORGE_PACKAGE_RESTART_TAG;
  if (restartTag) {
    assert.match(restartTag, /^[a-z0-9][a-z0-9-]{0,39}$/);
    await page.setViewportSize({ width: 1440, height: 900 });
    const crashedPid = hostPid;
    process.kill(crashedPid, 'SIGKILL');
    await page.getByRole('button', { name: 'Host crashed' }).waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Host crashed' }).click();
    await page.getByRole('button', { name: '重启本地 Host' }).waitFor();
    const crashedImage = join(root, 'output', 'playwright',
      `${restartTag}-host-crashed-1440x900.png`);
    mkdirSync(dirname(crashedImage), { recursive: true });
    await page.screenshot({ path: crashedImage });
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    await page.getByRole('button', { name: '重启本地 Host' }).click();
    await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
    const restoredHealth = await page.evaluate(() => window.forge.hostHealth());
    assert.equal(restoredHealth.ok, true);
    assert.notEqual(restoredHealth.data.pid, crashedPid);
    assert.notEqual(restoredHealth.data.hostId, health.data.hostId);
    assert.equal(alive(crashedPid), false);
    hostPid = restoredHealth.data.pid;
    if (!(await page.locator('#host-diagnostics').isVisible())) {
      await page.getByRole('button', { name: 'Host connected' }).click();
    }
    const recoveredImage = join(root, 'output', 'playwright',
      `${restartTag}-host-restarted-1440x900.png`);
    await page.screenshot({ path: recoveredImage });
  }
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByLabel('界面主题').selectOption('dark');
  await page.getByRole('switch', { name: '减少透明度' }).click();
  await page.getByRole('switch', { name: '减少动效' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Host connected' }).waitFor();
  assert.equal(await page.locator('.app-shell').getAttribute('data-theme'), 'dark');
  assert.equal(await page.locator('.app-shell').getAttribute('data-reduce-transparency'), 'true');
  assert.equal(await page.locator('.app-shell').getAttribute('data-reduce-motion'), 'true');
  const reducedAppearance = await page.locator('.app-shell').evaluate((element) => {
    const computed = globalThis.getComputedStyle(element);
    const rail = element.querySelector('.forge-icon-rail');
    const board = element.querySelector('.board-view');
    return {
      surface: computed.getPropertyValue('--forge-surface-panel').trim(),
      blur: computed.getPropertyValue('--forge-blur-glass').trim(),
      motion: computed.getPropertyValue('--forge-motion-normal').trim(),
      railBackdrop: rail && globalThis.getComputedStyle(rail).backdropFilter,
      boardAnimation: board && globalThis.getComputedStyle(board).animationName,
    };
  });
  assert.equal(reducedAppearance.surface, '#1e2d44');
  assert.equal(reducedAppearance.blur, '0px');
  assert.equal(reducedAppearance.railBackdrop, 'none');
  assert.match(reducedAppearance.motion, /^0(?:s|ms)$/);
  assert.equal(reducedAppearance.boardAnimation, 'none');
  await page.getByRole('button', { name: '设置' }).click();
  assert.equal(await page.getByLabel('界面主题').inputValue(), 'dark');
  if (process.env.FORGE_PACKAGE_APPEARANCE_SCREENSHOT) {
    mkdirSync(dirname(process.env.FORGE_PACKAGE_APPEARANCE_SCREENSHOT), { recursive: true });
    await page.screenshot({ path: process.env.FORGE_PACKAGE_APPEARANCE_SCREENSHOT });
  }
  await page.getByLabel('界面主题').selectOption('system');
  await page.getByRole('switch', { name: '减少透明度' }).click();
  await page.getByRole('switch', { name: '减少动效' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.match(await page.locator('.app-shell').evaluate((element) =>
    globalThis.getComputedStyle(element).getPropertyValue('--forge-motion-normal').trim()),
  /^0(?:s|ms)$/, 'The system reduced-motion preference must work without an app setting');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: '看板', exact: true }).click();
  await page.getByRole('heading', { name: '选择项目，开始工作' }).waitFor();
  await page.locator('.board-view').evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const screenshot = process.env.FORGE_PACKAGE_SMOKE_SCREENSHOT ||
    join(root, 'output', 'playwright', 'p6-06-packaged-home-1440x900.png');
  mkdirSync(join(root, 'output', 'playwright'), { recursive: true });
  await page.screenshot({ path: screenshot });
  await app.close();
  app = undefined;
  let finderCliProbe;
  if (process.env.FORGE_PACKAGE_FINDER_CLI === '1') {
    assert.ok(process.env.HOME, 'A real local HOME is required for the Finder CLI probe');
    const finderEnv = { ...packagedEnv, HOME: process.env.HOME,
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };
    if (process.env.CODEX_HOME) finderEnv.CODEX_HOME = process.env.CODEX_HOME;
    else delete finderEnv.CODEX_HOME;
    app = await electron.launch({
      executablePath: join(installed, 'Contents', 'MacOS', 'Forge'),
      args: [], env: finderEnv,
    });
    page = await app.firstWindow();
    await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
    const finderHealth = await page.evaluate(() => window.forge.hostHealth());
    assert.equal(finderHealth.ok, true);
    const finderHostPid = finderHealth.data.pid;
    const dependencyReply = await page.evaluate(() => window.forge.invokeSystem({
      schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'system.dependencies',
      createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
      payload: {},
    }));
    assert.equal(dependencyReply.ok, true);
    assert.equal(dependencyReply.data.codex.status, 'authenticated',
      'The installed app did not find the locally authenticated Codex CLI');
    const configured = await page.evaluate(() => window.forge.inspectBundledPlugin());
    assert.equal(configured.configApplied, true);
    if (pluginConfigTag) {
      assert.equal(configured.configValues.appServerInitializationTimeoutSeconds, 2);
    }
    const catalogWithCli = await page.evaluate(() => window.forge.agentProfileCatalog());
    const actualExecutor = catalogWithCli.executors.find((entry) =>
      entry.executorId === 'executor.codex');
    assert.equal(actualExecutor?.available, true,
      'The real Codex app-server capability probe did not complete');
    const profileSaveTag = process.env.FORGE_PACKAGE_PROFILE_SAVE_TAG;
    const workflowPublishTag = process.env.FORGE_PACKAGE_WORKFLOW_PUBLISH_TAG;
    const publishedWorkflows = [];
    let savedPlanner;
    if (profileSaveTag) {
      assert.match(profileSaveTag, /^[a-z0-9][a-z0-9-]{0,39}$/);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('button', { name: '角色', exact: true }).click();
      await page.getByRole('button', { name: '新建角色' }).first().click();
      const form = page.locator('.agent-form');
      await form.getByLabel('角色', { exact: true }).selectOption('planner');
      await form.getByLabel('名称').fill('QA Planner role save');
      await form.getByLabel('角色职责与提示词').fill(
        'Inspect the approved Task and Git baseline without modifying files.');
      assert.equal(await form.getByLabel('权限要求').inputValue(), 'read-only');
      assert.ok(await form.getByLabel('模型').inputValue());
      await form.getByRole('button', { name: '保存新版本' }).click();
      await page.getByText('角色配置已保存。新运行会使用所选工作流绑定的版本。').waitFor();
      const firstCatalog = await page.evaluate(() => window.forge.agentProfileCatalog());
      savedPlanner = firstCatalog.profiles.find((item) => item.name === 'QA Planner role save');
      assert.equal(savedPlanner?.role, 'planner');
      assert.equal(savedPlanner.policyProfile, 'read-only');
      assert.equal(savedPlanner.revision, 1);
      await page.locator('.agent-profile').filter({ hasText: 'QA Planner role save' })
        .getByRole('button', { name: '编辑' }).click();
      assert.equal(await form.getByLabel('角色', { exact: true }).inputValue(), 'planner');
      assert.equal(await form.getByLabel('角色', { exact: true }).isDisabled(), true);
      await form.getByLabel('名称').fill('QA Planner role save v2');
      await form.getByLabel('允许启动新 Run 时显式检索项目知识与记忆').check();
      await form.getByRole('button', { name: '保存新版本' }).click();
      await page.waitForFunction(async (profileId) => {
        const catalog = await window.forge.agentProfileCatalog();
        return catalog.profiles.some((item) => item.id === profileId &&
          item.role === 'planner' && item.revision === 2);
      }, savedPlanner.id);
      savedPlanner = (await page.evaluate(() => window.forge.agentProfileCatalog()))
        .profiles.find((item) => item.id === savedPlanner.id);
      await page.locator('.agent-profile').filter({ hasText: 'QA Planner role save v2' })
        .getByRole('button', { name: '编辑' }).click();
      assert.equal(await form.getByLabel('角色', { exact: true }).inputValue(), 'planner');
      assert.equal(await form.getByLabel('权限要求').inputValue(), 'read-only');
      assert.deepEqual(savedPlanner.contextProviders,
        ['task-contract', 'project-context']);
      await form.getByLabel('角色', { exact: true }).scrollIntoViewIfNeeded();
      const image = join(root, 'output', 'playwright',
        `${profileSaveTag}-planner-profile-saved-1440x900.png`);
      mkdirSync(dirname(image), { recursive: true });
      await page.screenshot({ path: image });
    }
    if (workflowPublishTag) {
      assert.match(workflowPublishTag, /^[a-z0-9][a-z0-9-]{0,39}$/);
      assert.ok(savedPlanner, 'Installed Workflow publication needs the saved Planner');
      const modelId = savedPlanner.modelId;
      const makeProfile = (role, policy, providers) => ({
        schemaVersion:'1.0', id:`profile.qa.${role}`, revision:1,
        name:`QA ${role}`, role, executorId:'executor.codex', modelId,
        promptTemplate:`Perform the ${role} stage within its permission profile.`,
        contextProviders:providers, policyProfile:policy,
        limits:{maxTurns:10,maxSeconds:600,maxOutputTokens:12000},
      });
      const developer = await page.evaluate((profile) => window.forge.saveAgentProfile({
        profile, expectedRevision:0,
      }), makeProfile('developer', 'workspace-write',
        ['task-contract', 'project-context']));
      const reviewer = await page.evaluate((profile) => window.forge.saveAgentProfile({
        profile, expectedRevision:0,
      }), makeProfile('reviewer', 'read-only', ['task-contract','snapshot-diff']));
      await page.getByRole('button', { name:'工作流', exact:true }).click();
      for (const preset of ['quick', 'standard', 'strict']) {
        const presetLabel = { quick:'快速流程', standard:'标准流程', strict:'严格流程' }[preset];
        await page.getByRole('button', { name:`从${presetLabel}新建` }).click();
        const roles = preset === 'quick' ? [developer.id, reviewer.id]
          : [savedPlanner.id, developer.id, reviewer.id];
        const nodes = page.locator('.workflow-node');
        const positions = preset === 'strict' ? [0, 2, 3] : roles.map((_, index) => index);
        for (let index=0; index<roles.length; index+=1) {
          await nodes.nth(positions[index]).locator('summary').click();
          await nodes.nth(positions[index]).getByLabel('角色配置')
            .selectOption(roles[index]);
        }
        await page.getByRole('button', { name:'检查能力' }).click();
        await page.getByText('发布预检通过', { exact:false }).waitFor();
        await page.getByRole('button', { name:'保存草稿' }).click();
        await page.getByRole('button', { name:'发布版本' }).click();
        await page.getByText('版本已发布', { exact:false }).waitFor();
        const records = await page.evaluate(() => window.forge.invokeWorkflow({
          type:'list', payload:{},
        }));
        const published = records.find((item) => item.draft.name === {
          quick:'快速研发流程（省略计划，保留 Review、Verify 与人工验收）',
          standard:'标准研发流程',
          strict:'严格研发流程（计划后增加人工门禁）',
        }[preset] && item.publishedRevision === 1);
        assert.ok(published, `${preset} was not published from the installed UI`);
        publishedWorkflows.push({ preset, workflowId:published.workflowId,
          revision:published.publishedRevision });
        if (preset === 'standard' || preset === 'strict') {
          assert.equal(published.draft.start, 'plan');
          assert.equal(published.draft.nodes.find((node) => node.id === 'plan')?.binding,
            savedPlanner.id);
        }
        const image = join(root, 'output', 'playwright',
          `${workflowPublishTag}-${preset}-published-1440x900.png`);
        mkdirSync(dirname(image), { recursive:true });
        await page.locator('[aria-label="Workflow 编译诊断"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path:image });
        if (preset === 'standard' || preset === 'strict') {
          await nodes.first().scrollIntoViewIfNeeded();
          const planImage = join(root, 'output', 'playwright',
            `${workflowPublishTag}-${preset}-plan-binding-1440x900.png`);
          await page.screenshot({ path:planImage });
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const authenticatedStatus = page.getByText('版本与登录已检测', { exact: false });
    await authenticatedStatus.waitFor();
    await authenticatedStatus.scrollIntoViewIfNeeded();
    const finderImage = join(root, 'output', 'playwright',
      `${pluginConfigTag || 'package-macos'}-finder-cli-authenticated-1440x900.png`);
    mkdirSync(dirname(finderImage), { recursive: true });
    await page.screenshot({ path: finderImage });
    finderCliProbe = { codex: dependencyReply.data.codex.status,
      codexVersion: dependencyReply.data.codex.version,
      modelCount: actualExecutor.modelIds.length, configApplied: configured.configApplied,
      configuredTimeoutSeconds: configured.configValues.appServerInitializationTimeoutSeconds,
      screenshot: finderImage, publishedWorkflows };
    await app.close();
    app = undefined;
    assert.equal(alive(finderHostPid), false,
      'Finder-style package probe left its owned Python Host running');
    if (savedPlanner) {
      app = await electron.launch({
        executablePath: join(installed, 'Contents', 'MacOS', 'Forge'),
        args: [], env: finderEnv,
      });
      page = await app.firstWindow();
      await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
      const restarted = await page.evaluate(() => window.forge.agentProfileCatalog());
      const restored = restarted.profiles.find((item) => item.id === savedPlanner.id);
      assert.equal(restored?.role, 'planner');
      assert.equal(restored.policyProfile, 'read-only');
      assert.equal(restored.revision, 2);
      assert.deepEqual(restored.contextProviders,
        ['task-contract', 'project-context']);
      if (publishedWorkflows.length) {
        const persisted = await page.evaluate(() => window.forge.invokeWorkflow({
          type:'list', payload:{},
        }));
        for (const workflow of publishedWorkflows) {
          assert.ok(persisted.some((item) => item.workflowId === workflow.workflowId &&
            item.publishedRevision === workflow.revision),
          `${workflow.preset} publication was not restored`);
        }
      }
      const restartedPid = (await page.evaluate(() => window.forge.hostHealth())).data.pid;
      await app.close();
      app = undefined;
      assert.equal(alive(restartedPid), false, 'Restarted QA Host is still running');
      finderCliProbe.plannerProfile = { id: restored.id, role: restored.role,
        revision: restored.revision };
    }
  }
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=4', installed]);
  const database = join(details.appData, 'Forge', 'production', 'forge.sqlite');
  assert.ok(existsSync(database), 'Isolated packaged Host must create its own database');
  rmSync(installRoot, { recursive: true, force: true });
  assert.ok(existsSync(database), 'Removing the app must retain Forge user data');
  console.log(JSON.stringify({ stage: 'package-macos-internal', packaged: true,
    hostPid, schemaVersion: health.data.storage.schemaVersion,
    bundledPython: true, isolatedHome: true, appRemovalPreservedData: true,
    codexRequiresExternalInstall: true,
    signature: 'ad-hoc, unnotarized', retinaProbe, finderCliProbe }));
} finally {
  if (app) {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
    }).catch(() => undefined);
    await app.close().catch(() => undefined);
  }
  if (hostPid) assert.equal(alive(hostPid), false, 'Owned packaged Host still running');
  if (attached) run('hdiutil', ['detach', mount]);
  rmSync(installRoot, { recursive: true, force: true });
  rmSync(isolated, { recursive: true, force: true });
}
