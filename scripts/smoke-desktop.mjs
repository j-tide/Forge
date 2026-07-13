import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const electronBinary = requireDesktop('electron');
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const smokeDataDir = mkdtempSync(join(tmpdir(), 'forge-desktop-smoke-'));
const rendererProfile = join(smokeDataDir, 'renderer-profile');
mkdirSync(rendererProfile);
const knowledgeFixture = join(smokeDataDir, 'knowledge fixture');
mkdirSync(join(knowledgeFixture, 'docs'), { recursive: true });
const knowledgeText = '# Fixture guide\n日期筛选 uses start_date; only local sources are imported.\n';
writeFileSync(join(knowledgeFixture, 'docs', 'guide.md'), knowledgeText);
writeFileSync(join(knowledgeFixture, 'package.json'), JSON.stringify({ scripts: {
  test: 'node -e "require(\'fs\').writeFileSync(\'script-ran.txt\',\'bad\')"',
} }));
process.once('exit', () => rmSync(smokeDataDir, { recursive: true, force: true }));

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

function parseColor(color) {
  const hex = color.trim().match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1];
    const channels = [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16));
    return { channels, alpha: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1 };
  }
  const channels = color.match(/[\d.]+/g)?.map(Number);
  assert.ok(channels?.length === 3 || channels?.length === 4,
    `Expected a computed RGB color, received ${color}`);
  return { channels: channels.slice(0, 3), alpha: channels[3] ?? 1 };
}

function visibleColor(foreground, background) {
  const top = parseColor(foreground);
  const underneath = parseColor(background);
  assert.equal(underneath.alpha, 1, `Visible backing must be opaque: ${background}`);
  return `rgb(${top.channels.map((channel, index) =>
    Math.round(channel * top.alpha + underneath.channels[index] * (1 - top.alpha))).join(', ')})`;
}

function colorLuminance(rgb) {
  const { channels, alpha } = parseColor(rgb);
  assert.equal(alpha, 1, `Contrast requires a visible opaque color, received ${rgb}`);
  const [red, green, blue] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function colorContrast(foreground, background) {
  const values = [colorLuminance(foreground), colorLuminance(background)]
    .sort((left, right) => left - right);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

function blurPixels(filter) {
  return Number(filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? 0);
}

function maxDurationMs(value) {
  return Math.max(...value.split(',').map((part) => {
    const duration = part.trim();
    return Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
  }));
}

function noNonessentialMotion(style) {
  return (style.animationName === 'none' || maxDurationMs(style.animationDuration) <= 16) &&
    maxDurationMs(style.transitionDuration) <= 16;
}

async function readThemeSurfaces(page, screenshotVariant = '') {
  await page.locator('.board-empty-workspace').waitFor({ state: 'visible' });
  const shell = await page.evaluate(() => {
    const required = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Theme smoke selector missing: ${selector}`);
      return element;
    };
    const background = (selector) => getComputedStyle(required(selector)).backgroundColor;
    const foreground = (selector) => getComputedStyle(required(selector)).color;
    const filter = (selector) => getComputedStyle(required(selector)).backdropFilter;
    const root = getComputedStyle(required('.app-shell'));
    return {
      canvas: background('.app-shell'),
      canvasToken: root.getPropertyValue('--forge-color-canvas').trim(),
      accent: root.getPropertyValue('--forge-color-accent').trim(),
      sidebar: background('.app-shell .forge-icon-rail'),
      sidebarFilter: filter('.app-shell .forge-icon-rail'),
      topbar: background('.topbar'),
      projectPicker: background('.project-picker'),
      content: background('.shell-content'),
      boardSurface: background('.board-empty-workspace'),
      boardSurfaceFilter: filter('.board-empty-workspace'),
      topbarText: foreground('.topbar-brand strong'),
    };
  });
  await page.locator('.sidebar-new-task').click();
  await page.locator('.forge-overlay .forge-drawer:has(> .new-work-content)').waitFor();
  const drawer = await page.evaluate(() => {
    const element = document.querySelector('.forge-overlay .forge-drawer:has(> .new-work-content)');
    const heading = element?.querySelector('h2');
    if (!element || !heading) throw new Error('New Task drawer is missing');
    return {
      background: getComputedStyle(element).backgroundColor,
      heading: getComputedStyle(heading).color,
      colorScheme: getComputedStyle(element).colorScheme,
      scrim: getComputedStyle(element.parentElement).backgroundColor,
      scrimFilter: getComputedStyle(element.parentElement).backdropFilter,
    };
  });
  if (process.env.FORGE_THEME_SCREENSHOT_DIR) {
    mkdirSync(process.env.FORGE_THEME_SCREENSHOT_DIR, { recursive: true });
    await page.waitForFunction(() => {
      const panel = document.querySelector('.new-work-content');
      const status = panel?.querySelector('.composer-model-status');
      const problem = panel?.querySelector('.conversation-model-problem');
      return Boolean(status) || Boolean(problem && !problem.textContent?.includes('正在连接模型'));
    }, undefined, { timeout: 15_000 });
    const theme = await page.locator('.app-shell').getAttribute('data-theme');
    await page.screenshot({ path: join(process.env.FORGE_THEME_SCREENSHOT_DIR,
      `forge-glass-20260927-${theme}${screenshotVariant}-new-task.png`) });
  }
  await page.getByRole('button', { name: '关闭抽屉' }).click();
  await page.locator('.forge-overlay .forge-drawer').waitFor({ state: 'hidden' });
  const canvas = visibleColor(shell.canvas, shell.canvasToken);
  const topbar = visibleColor(shell.topbar, canvas);
  const scrim = visibleColor(drawer.scrim, canvas);
  const drawerSurface = visibleColor(drawer.background, scrim);
  assert.ok(colorContrast(shell.topbarText, topbar) >= 4.5,
    `Topbar text contrast: ${JSON.stringify(shell)}`);
  assert.ok(colorContrast(drawer.heading, drawerSurface) >= 4.5,
    `New Task drawer heading contrast: ${JSON.stringify(drawer)}`);
  const dangerButton = await page.evaluate(() => {
    const button = document.createElement('button');
    button.className = 'forge-button forge-button--danger';
    document.querySelector('.app-shell')?.append(button);
    const style = getComputedStyle(button);
    const colors = { foreground: style.color, background: style.backgroundColor };
    button.remove();
    return colors;
  });
  assert.ok(colorContrast(dangerButton.foreground, dangerButton.background) >= 4.5,
    `Danger button text contrast: ${JSON.stringify(dangerButton)}`);
  return { shell, drawer, dangerButton, visible: { canvas, topbar, drawerSurface } };
}

function assertGlassSurfaces(theme, reducedTransparency) {
  const { shell, drawer } = theme;
  for (const [surface, background, filter] of [
    ['sidebar', shell.sidebar, shell.sidebarFilter],
    ['empty board', shell.boardSurface, shell.boardSurfaceFilter],
  ]) {
    if (reducedTransparency) {
      assert.ok(parseColor(background).alpha >= 0.98,
        `${surface} should use a solid fallback: ${background}`);
      assert.ok(blurPixels(filter) <= 0.1,
        `${surface} should not blur with reduced transparency: ${filter}`);
    } else {
      assert.ok(parseColor(background).alpha < 0.98,
        `${surface} should retain its frosted surface: ${background}`);
      assert.ok(blurPixels(filter) >= 4,
        `${surface} should use visible backdrop blur: ${filter}`);
    }
  }
  if (reducedTransparency) {
    assert.ok(blurPixels(drawer.scrimFilter) <= 0.1,
      `Dialog scrim should not blur with reduced transparency: ${drawer.scrimFilter}`);
  } else {
    assert.ok(blurPixels(drawer.scrimFilter) >= 4,
      `Dialog scrim should blur by default: ${drawer.scrimFilter}`);
  }
}

function assertCoolPalette(theme, name) {
  const [red, green, blue] = parseColor(theme.visible.canvas).channels;
  assert.ok(blue >= red + 5 && blue >= green + 3,
    `${name} canvas should use the cool silver/blue or blue-gray palette: ${theme.visible.canvas}`);
  const [accentRed, accentGreen, accentBlue] = parseColor(theme.shell.accent).channels;
  assert.ok(accentBlue >= accentRed + 20 && accentBlue >= accentGreen + 12,
    `${name} accent should use restrained blue rather than olive/yellow: ${theme.shell.accent}`);
}

async function readMotionStyles(page) {
  const card = await page.evaluate(() => {
    const element = document.createElement('div');
    element.className = 'forge-card forge-card--interactive';
    element.textContent = 'Motion check';
    document.querySelector('.app-shell')?.append(element);
    const style = getComputedStyle(element);
    const values = { animationName: style.animationName, animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration };
    element.remove();
    return values;
  });
  await page.locator('.sidebar-new-task').click();
  const drawerLocator = page.locator('.forge-overlay .forge-drawer:has(> .new-work-content)');
  await drawerLocator.waitFor();
  assert.equal(await drawerLocator.isVisible(), true, 'New Task remains visible with motion preferences');
  const drawer = await drawerLocator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { animationName: style.animationName, animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration };
  });
  await page.getByRole('button', { name: '关闭抽屉' }).click();
  await drawerLocator.waitFor({ state: 'hidden' });
  await page.locator('.project-picker').click();
  const dialogLocator = page.locator('.forge-overlay .forge-dialog');
  await dialogLocator.waitFor();
  assert.equal(await dialogLocator.isVisible(), true, 'Project picker remains visible with motion preferences');
  const dialog = await dialogLocator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { animationName: style.animationName, animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration };
  });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await dialogLocator.waitFor({ state: 'hidden' });
  return { card, drawer, dialog };
}

function assertReducedMotion(styles, source) {
  for (const [part, style] of Object.entries(styles)) {
    assert.ok(noNonessentialMotion(style),
      `${source} should disable ${part} animation and transition: ${JSON.stringify(style)}`);
  }
}

async function assertResponsiveLayout(page, width, height, screenshotName) {
  await page.setViewportSize({ width, height });
  const layout = await page.evaluate(() => {
    const required = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Layout smoke selector missing: ${selector}`);
      return element;
    };
    const bounds = (selector) => {
      const rect = required(selector).getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: rect.width, height: rect.height };
    };
    const quickNavIcon = required('.quick-nav-trigger span:first-child');
    return { viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      shell: bounds('.app-shell'), sidebar: bounds('.forge-icon-rail'),
      board: bounds('.board-view'), emptyBoard: bounds('.board-empty-workspace'),
      action: bounds('.board-empty-workspace-actions button'),
      quickNavIcon: { label: quickNavIcon.textContent?.trim(),
        width: quickNavIcon.getBoundingClientRect().width } };
  });
  assert.equal(layout.viewport.width, width);
  assert.equal(layout.viewport.height, height);
  assert.ok(layout.documentWidth <= width + 1, `Desktop document overflows: ${JSON.stringify(layout)}`);
  assert.ok(layout.shell.left >= -1 && layout.shell.right <= width + 1,
    `AppShell overflows: ${JSON.stringify(layout)}`);
  assert.ok(layout.sidebar.width >= 55 && layout.board.width >= 480,
    `Desktop layout lost a usable sidebar or board: ${JSON.stringify(layout)}`);
  assert.ok(layout.emptyBoard.right <= width + 1 &&
    layout.emptyBoard.left >= layout.sidebar.right - 1,
  `Empty workspace escapes the content area: ${JSON.stringify(layout)}`);
  assert.ok(layout.action.left >= layout.emptyBoard.left &&
    layout.action.right <= layout.emptyBoard.right &&
    layout.action.bottom <= height + 1,
  `Empty workspace action is clipped: ${JSON.stringify(layout)}`);
  if (width <= 1100) {
    assert.ok(layout.quickNavIcon.label && layout.quickNavIcon.width >= 8,
      `Narrow window must keep a visible quick-navigation icon: ${JSON.stringify(layout)}`);
  }
  await page.locator('.sidebar-new-task').click();
  const drawer = page.locator('.forge-overlay .forge-drawer:has(> .new-work-content)');
  await drawer.waitFor();
  await drawer.evaluate((element) => Promise.all(element.getAnimations()
    .map((animation) => animation.finished.catch(() => undefined))));
  const drawerBounds = await drawer.boundingBox();
  assert.ok(drawerBounds && drawerBounds.x >= -1 &&
    drawerBounds.x + drawerBounds.width <= width + 1,
  `New Task drawer overflows ${width}×${height}: ${JSON.stringify(drawerBounds)}`);
  await page.getByRole('button', { name: '关闭抽屉' }).click();
  await drawer.waitFor({ state: 'hidden' });
  if (process.env.FORGE_THEME_SCREENSHOT_DIR && screenshotName) {
    await page.screenshot({ path: join(process.env.FORGE_THEME_SCREENSHOT_DIR, screenshotName) });
  }
  return layout;
}

async function setSwitch(page, name, checked) {
  const control = page.getByRole('switch', { name });
  if ((await control.getAttribute('aria-checked')) !== String(checked)) await control.click();
  assert.equal(await control.getAttribute('aria-checked'), String(checked));
}

async function assertDocumentAppearance(page) {
  const appearance = await page.evaluate(() => ({
    shell: {
      theme: document.querySelector('.app-shell')?.getAttribute('data-theme'),
      reduceTransparency: document.querySelector('.app-shell')?.getAttribute('data-reduce-transparency'),
      reduceMotion: document.querySelector('.app-shell')?.getAttribute('data-reduce-motion'),
    },
    root: {
      theme: document.documentElement.getAttribute('data-theme'),
      reduceTransparency: document.documentElement.getAttribute('data-reduce-transparency'),
      reduceMotion: document.documentElement.getAttribute('data-reduce-motion'),
    },
  }));
  assert.deepEqual(appearance.root, appearance.shell,
    `Teleported surfaces must use the same theme and accessibility choices: ${JSON.stringify(appearance)}`);
}

async function waitGone(pid) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!alive(pid)) return;
    await delay(100);
  }
  throw new Error('Owned Host PID remains after Desktop exit: ' + pid);
}

function launchDesktop(dataDir = smokeDataDir) {
  return electron.launch({
    executablePath: electronBinary,
    args: [desktopDirectory, `--user-data-dir=${rendererProfile}`],
    env: { ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_HOST_DATA_DIR: dataDir },
  });
}

let electronApp = await launchDesktop();
let ownedPid;
try {
  const page = await electronApp.firstWindow();
  assert.equal(await electronApp.evaluate(({ app }) => app.getPath('userData')),
    realpathSync(rendererProfile));
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: '研发看板' }).waitFor();
  assert.match(await page.title(), /Forge/);
  await page.locator('.board-empty-workspace--project').waitFor({ state: 'visible' });
  if (process.env.FORGE_THEME_SCREENSHOT_DIR) {
    mkdirSync(process.env.FORGE_THEME_SCREENSHOT_DIR, { recursive: true });
    await page.locator('.board-view').evaluate((element) => Promise.all(element.getAnimations()
      .map((animation) => animation.finished.catch(() => undefined))));
    await page.screenshot({ path: join(process.env.FORGE_THEME_SCREENSHOT_DIR,
      'forge-glass-20260927-light-no-project.png') });
  }
  assert.equal(await page.locator('.app-shell').getAttribute('data-theme'), 'light',
    'A fresh Desktop profile should start in the original light glass style');
  await assertDocumentAppearance(page);
  assert.equal(await page.locator('.sidebar-new-task').isVisible(), true);

  const renderer = await page.evaluate(() => ({
    bridgeKeys: Object.keys(window.forge ?? {}),
    platform: window.forge?.platform,
    requireType: typeof window.require,
    processType: typeof window.process,
    ipcRendererType: typeof window.ipcRenderer,
  }));
  assert.deepEqual(renderer.bridgeKeys, ['platform', 'hostStatus', 'hostHealth', 'restartPythonHost', 'pythonHostStatus', 'invokeSystem', 'inspectBundledPlugin', 'setBundledPluginEnabled', 'saveBundledPluginConfig', 'agentProfileCatalog', 'saveAgentProfile', 'invokeWorkflow', 'invokeKnowledge', 'invokeMemory', 'invokeDevicePairing', 'remoteLoopback', 'chooseProjectFolder', 'openAppPreview', 'prepareDiagnostics', 'exportDiagnostics', 'cleanupExpiredArtifacts', 'exportDatabaseBackup', 'databaseProfileStatus', 'restoreDatabaseBackup', 'returnToOriginalData', 'invokeProject', 'invokeConversation', 'invokeDraft', 'invokeApproval', 'invokeBoard', 'invokeRun', 'onConversationEvent', 'onHostStatus', 'onPythonHostStatus']);
  assert.equal(renderer.platform, process.platform);
  assert.equal(renderer.requireType, 'undefined');
  assert.equal(renderer.processType, 'undefined');
  assert.equal(renderer.ipcRendererType, 'undefined');

  const webPreferences = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getLastWebPreferences());
  assert.equal(webPreferences?.contextIsolation, true);
  assert.equal(webPreferences?.nodeIntegration, false);
  assert.equal(webPreferences?.sandbox, true);

  const health = await page.evaluate(() => window.forge.hostHealth());
  if (!health.ok) console.error(JSON.stringify({ stage: 'host-health-failed', health,
    status: await page.evaluate(() => window.forge.pythonHostStatus()) }));
  assert.equal(health.ok, true);
  assert.equal(health.data.status, 'ready');
  assert.equal(health.data.protocolVersion, 'forge-host-protocol/v5');
  assert.equal(health.data.storage.status, 'ready');
  assert.equal(health.data.storage.schemaVersion, 38);
  const pairing = await page.evaluate(() => window.forge.invokeDevicePairing({
    type: 'issue', payload: {},
  }));
  assert.match(pairing.nonce, /^[A-Za-z0-9_-]{40,}$/);
  const pairingInspection = await page.evaluate((pairingId) => window.forge.invokeDevicePairing({
    type: 'inspect', payload: { pairingId },
  }), pairing.pairingId);
  assert.equal(pairingInspection.status, 'pending');
  assert.equal('nonce' in pairingInspection, false);
  const arbitraryPairing = await page.evaluate(async (pairingId) => {
    try { await window.forge.invokeDevicePairing({
      type: 'claim', payload: { pairingId, nonce: 'untrusted' },
    }); return false; } catch { return true; }
  }, pairing.pairingId);
  assert.equal(arbitraryPairing, true);
  assert.equal(health.data.storage.journalMode, 'wal');
  assert.equal(health.data.runtime.platform, process.platform);
  assert.equal(health.data.runtime.arch, process.arch);
  assert.match(health.data.runtime.python, /^3\.12\./);
  assert.equal(health.data.transportVersion, 'forge-local-jsonrpc/v1');
  assert.equal(health.data.version, '0.0.1');
  const plugin = await page.evaluate(() => window.forge.inspectBundledPlugin());
  assert.equal(plugin.pluginId, 'forge.executor.codex');
  assert.equal(plugin.version, '0.0.3');
  assert.equal(plugin.compatible, true);
  assert.equal(plugin.active, true);
  assert.equal(plugin.configRevision, 0);
  assert.equal(plugin.configApplied, true);
  assert.deepEqual(plugin.configSchema.properties.appServerInitializationTimeoutSeconds.minimum, 1);
  const agentCatalog = await page.evaluate(() => window.forge.agentProfileCatalog());
  assert.ok(agentCatalog.executors.some((item) => item.executorId === 'executor.codex'));
  assert.deepEqual(agentCatalog.executors.find((item) => item.executorId === 'executor.claude'), {
    executorId: 'executor.claude', available: false, modelIds: [],
    readOnlyEnforced: false, networkPolicyEnforced: false,
    structuredOutput: false, approval: false,
    reason: 'CLAUDE_NOT_VERIFIED',
  });
  const codex = agentCatalog.executors.find((item) => item.executorId === 'executor.codex');
  if (codex.available && codex.modelIds.length) {
    const modelId = codex.modelIds[0];
    for (const [role, policyProfile, contextProviders] of [
      ['developer', 'workspace-write', ['task-contract', 'project-context']],
      ['reviewer', 'read-only', ['task-contract', 'snapshot-diff']],
    ]) {
      await page.evaluate(({ role, policyProfile, contextProviders, modelId }) =>
        window.forge.saveAgentProfile({
          profile: { schemaVersion: '1.0', id: `profile.smoke.${role}`,
            revision: 1, name: `Smoke ${role}`, role, executorId: 'executor.codex',
            modelId, promptTemplate: `Fixture ${role} responsibilities.`,
            contextProviders, policyProfile,
            limits: { maxTurns: 8, maxSeconds: 600, maxOutputTokens: 4000 } },
          expectedRevision: 0,
        }), { role, policyProfile, contextProviders, modelId });
    }
  }
  await page.getByRole('button', { name: '角色', exact: true }).click();
  await page.getByRole('heading', { name: 'Agent 角色' }).waitFor();
  await page.locator('.agent-connections summary').click();
  await page.getByText('CLAUDE_NOT_VERIFIED').waitFor({ timeout: 30_000 });
  assert.match(await page.locator('.agents-panel').textContent(), /未配置\/未验收/);
  if (codex.available && codex.modelIds.length) {
    await page.locator('.agent-profile').filter({ hasText: 'Smoke developer' })
      .getByRole('button', { name: '编辑' }).click();
    await page.getByLabel('最长运行时间（秒）').fill('420');
    await page.getByRole('checkbox', { name: '允许启动新 Run 时显式检索项目知识与记忆' })
      .uncheck();
    await page.getByRole('button', { name: '保存新版本' }).click();
    await page.getByText('角色配置已保存。新运行会使用所选工作流绑定的版本。').waitFor();
    const edited = await page.evaluate(() => window.forge.agentProfileCatalog());
    const developer = edited.profiles.find((item) => item.id === 'profile.smoke.developer');
    assert.equal(developer?.revision, 2);
    assert.deepEqual(developer.contextProviders, ['task-contract']);
    assert.deepEqual(developer.limits, {
      maxTurns: 8, maxSeconds: 420, maxOutputTokens: 4000,
    });
  }
  if (process.env.FORGE_AGENTS_SCREENSHOT) {
    await page.screenshot({ path: process.env.FORGE_AGENTS_SCREENSHOT });
  }
  await page.getByRole('button', { name: '工作流' }).click();
  await page.getByRole('heading', { name: '工作流', exact: true }).waitFor();
  await page.getByRole('button', { name: '使用快速流程模板' }).click();
  await page.locator('.workflow-detail-section').filter({ hasText: '流程设置' })
    .locator('summary').click();
  await page.getByText('末尾人工验收门禁不可删除').waitFor();
  await page.getByRole('button', { name: '保存草稿' }).click();
  await page.getByText('草稿已保存，可检查后发布。', { exact: false }).waitFor();
  const drafts = await page.evaluate(() => window.forge.invokeWorkflow({
    type: 'list', payload: {},
  }));
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].publishedRevision, null);
  await page.getByRole('button', { name: '发布版本' }).click();
  await page.getByText('发布未通过', { exact: false }).waitFor();
  const rejected = await page.evaluate(() => window.forge.invokeWorkflow({
    type: 'list', payload: {},
  }));
  assert.equal(rejected[0].publishedRevision, null);
  await page.locator('.workflow-detail-section').filter({ hasText: '高级：画布与导入导出' })
    .locator('summary').click();
  await page.getByRole('button', { name: '打开高级画布' }).click();
  await page.getByRole('region', { name: 'Workflow 画布' }).waitFor();
  assert.ok(await page.locator('.forge-flow-node--invalid').count() > 0);
  await page.getByRole('button', { name: '收起高级画布' }).click();
  if (codex.available && codex.modelIds.length) {
    await page.locator('.workflow-node').nth(0).locator('summary').click();
    await page.locator('.workflow-node').nth(0).getByLabel('角色配置')
      .selectOption('profile.smoke.developer');
    await page.locator('.workflow-node').nth(1).locator('summary').click();
    await page.locator('.workflow-node').nth(1).getByLabel('角色配置')
      .selectOption('profile.smoke.reviewer');
    await page.getByRole('button', { name: '保存草稿' }).click();
    await page.getByText('草稿已保存，可检查后发布。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '发布版本' }).click();
    await page.getByText('版本已发布', { exact: false }).waitFor();
    const published = await page.evaluate(() => window.forge.invokeWorkflow({
      type: 'list', payload: {},
    }));
    assert.equal(published[0].draftRevision, 2);
    assert.equal(published[0].publishedRevision, 2);
    const impact = await page.evaluate((workflowId) => window.forge.invokeWorkflow({
      type: 'impact', payload: { workflowId },
    }), drafts[0].workflowId);
    assert.deepEqual(impact.publishedRevisions, [2]);
    assert.deepEqual(impact.frozenRunCounts, {});
    await page.locator('.workflow-impact summary').click();
    await page.locator('.workflow-impact').getByText(
      '新 Run 必须明确选择已发布版本', { exact: false },
    ).waitFor();
    await page.getByLabel('流程名称').fill('Smoke workflow v3');
    await page.getByRole('button', { name: '保存草稿' }).click();
    await page.getByText('草稿已保存，可检查后发布。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '发布版本' }).click();
    await page.getByText('版本已发布', { exact: false }).waitFor();
    const newer = await page.evaluate((workflowId) => window.forge.invokeWorkflow({
      type: 'impact', payload: { workflowId },
    }), drafts[0].workflowId);
    assert.deepEqual(newer.publishedRevisions, [2, 3]);
    if (!(await page.locator('.workflow-impact').evaluate((element) => element.open))) {
      await page.locator('.workflow-impact summary').click();
    }
    const comparison = page.getByRole('region', { name: '已发布版本差异' });
    await comparison.waitFor();
    console.log(JSON.stringify({ stage: 'workflow-version-comparison', text: await comparison.textContent() }));
    await comparison.getByText('v2：', { exact: false }).first().waitFor();
    assert.match(await comparison.textContent(), /Smoke workflow v3/);
  }
  if (process.env.FORGE_WORKFLOW_SCREENSHOT) {
    if (codex.available && codex.modelIds.length) {
      await page.getByRole('region', { name: '已发布版本差异' }).scrollIntoViewIfNeeded();
    }
    await page.screenshot({ path: process.env.FORGE_WORKFLOW_SCREENSHOT });
  }
  await page.getByRole('button', { name: '打开高级画布' }).click();
  await page.getByRole('region', { name: 'Workflow 画布' }).waitFor();
  await page.getByRole('button', { name: '导出画布 JSON' }).click();
  const canvasExport = await page.getByLabel('画布 JSON（最多 256 KB）').inputValue();
  const canvasDocument = JSON.parse(canvasExport);
  assert.equal(canvasDocument.format, 'forge-workflow-canvas/v1');
  assert.equal(canvasDocument.definition.id, drafts[0].workflowId);
  assert.equal(canvasDocument.layout.nodes.length, canvasDocument.definition.nodes.length);
  await page.getByRole('button', { name: '导入画布 JSON 到草稿' }).click();
  await page.getByText('已导入到未保存草稿', { exact: false }).waitFor();
  const afterCanvasImport = await page.evaluate(() => window.forge.invokeWorkflow({
    type: 'list', payload: {},
  }));
  assert.equal(afterCanvasImport[0].publishedRevision, codex.available && codex.modelIds.length ? 3 : null);
  if (process.env.FORGE_CANVAS_SCREENSHOT) {
    await page.getByRole('region', { name: 'Workflow 画布' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.FORGE_CANVAS_SCREENSHOT });
  }
  const invalidWorkflow = await page.evaluate(async () => {
    try { await window.forge.invokeWorkflow({ type: 'shell.execute', payload: {} }); return false; }
    catch { return true; }
  });
  assert.equal(invalidWorkflow, true);
  await page.getByRole('button', { name: '插件' }).click();
  await page.getByRole('heading', { name: '插件与集成' }).waitFor();
  assert.match(await page.locator('.plugins-workspace').textContent(), /Codex 启动握手等待/);
  if (process.env.FORGE_PLUGIN_SCREENSHOT) await page.screenshot({ path: process.env.FORGE_PLUGIN_SCREENSHOT });
  await page.getByRole('button', { name: '看板', exact: true }).click();
  assert.ok(health.data.pid > 0);
  assert.match(health.data.hostId, /^[0-9a-f-]{36}$/);
  ownedPid = health.data.pid;
  assert.equal(alive(ownedPid), true);

  const pythonStatus = await page.evaluate(() => window.forge.pythonHostStatus());
  assert.equal(pythonStatus.health.runtime.python, health.data.runtime.python);
  assert.equal(pythonStatus.health.storage.status, 'ready');
  assert.equal(pythonStatus.health.storage.schemaVersion, 38);
  assert.equal(pythonStatus.health.transportVersion, 'forge-local-jsonrpc/v1');
  assert.equal(pythonStatus.health.pid, pythonStatus.info.pid);
  assert.equal(pythonStatus.info.pid, ownedPid);

  await page.getByRole('button', { name: 'Host connected' }).click();
  const diagnostics = await page.locator('#host-diagnostics').evaluate((element) =>
    Object.fromEntries([...element.querySelectorAll('dt')].map((label) => [label.textContent, label.nextElementSibling?.textContent])));
  assert.equal(diagnostics['Host ID'], health.data.hostId);
  assert.equal(diagnostics['Host Version'], health.data.version);
  assert.equal(diagnostics.Protocol, health.data.protocolVersion);
  assert.equal(diagnostics.PID, String(ownedPid));
  assert.equal(diagnostics.Storage, 'Ready');
  assert.equal(diagnostics.Schema, '38');
  assert.equal(diagnostics['Python Version'], health.data.runtime.python);
  assert.notEqual(diagnostics['Last Health Check'], '—');
  const revisionBeforeRefresh = await page.evaluate(async () => (await window.forge.hostStatus()).revision);
  await page.getByRole('button', { name: '检查健康状态' }).click();
  await page.waitForFunction(async (previous) => (await window.forge.hostStatus()).revision > previous, revisionBeforeRefresh);
  await page.getByRole('button', { name: '关闭 Host 诊断' }).click();
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: /本机访问/ }).click();
  await page.getByRole('heading', { name: '远程连接与设备' }).waitFor();
  await page.getByText('尚无已配对设备').waitFor();
  assert.match(await page.locator('.remote-devices').textContent(),
    /本机浏览器预览未开启/);
  if (process.env.FORGE_REMOTE_DEVICES_SCREENSHOT) {
    await page.locator('.remote-devices').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.FORGE_REMOTE_DEVICES_SCREENSHOT });
  }
  await page.getByRole('button', { name: '看板', exact: true }).click();

  const unknown = await page.evaluate(() => window.forge.invokeSystem({
    schemaVersion: '1.0', commandId: 'smoke-unknown', type: 'shell.any',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload: {},
  }));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'UNKNOWN_COMMAND');
  const forged = await page.evaluate(() => window.forge.invokeSystem({
    schemaVersion: '1.0', commandId: 'smoke-forged', type: 'system.ping',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload: {}, actor: 'owner',
  }));
  assert.equal(forged.ok, false);
  assert.equal(forged.error.code, 'VALIDATION_ERROR');
  const arbitraryRun = await page.evaluate(() => window.forge.invokeRun({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'shell.execute',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { command: 'whoami' },
  }));
  assert.equal(arbitraryRun.ok, false);
  assert.equal(arbitraryRun.error.code, 'VALIDATION_ERROR');

  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: /外观/ }).click();
  await page.getByLabel('界面主题').selectOption('dark');
  await setSwitch(page, '减少透明度', true);
  await setSwitch(page, '减少动效', true);
  assert.equal(await page.locator('.app-shell').getAttribute('data-theme'), 'dark');
  assert.equal(await page.locator('.app-shell').getAttribute('data-reduce-transparency'), 'true');
  assert.equal(await page.locator('.app-shell').getAttribute('data-reduce-motion'), 'true');
  await assertDocumentAppearance(page);
  await page.reload();
  await page.getByRole('button', { name: 'Host connected' }).waitFor();
  const afterReload = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(afterReload.data.hostId, health.data.hostId);
  assert.equal(afterReload.data.pid, ownedPid);
  assert.equal(await page.locator('.app-shell').getAttribute('data-theme'), 'dark');
  assert.equal(await page.locator('.app-shell').getAttribute('data-reduce-transparency'), 'true');
  assert.equal(await page.locator('.app-shell').getAttribute('data-reduce-motion'), 'true');
  await assertDocumentAppearance(page);
  await electronApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, knowledgeFixture);
  await page.locator('.project-picker').click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '信任并打开' }).click();
  await page.getByRole('heading', { name: '研发看板' }).waitFor();
  if (process.env.FORGE_THEME_SCREENSHOT_DIR) await page.setViewportSize({ width: 1440, height: 900 });
  const reducedDark = await readThemeSurfaces(page, '-reduced-transparency');
  assertGlassSurfaces(reducedDark, true);
  assert.ok(colorContrast(reducedDark.drawer.heading, reducedDark.visible.drawerSurface) >= 4.5);
  if (process.env.FORGE_THEME_SCREENSHOT_DIR) {
    mkdirSync(process.env.FORGE_THEME_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.FORGE_THEME_SCREENSHOT_DIR,
      'forge-glass-20260927-dark-reduced-transparency.png') });
  }
  const userReducedMotion = await readMotionStyles(page);
  assertReducedMotion(userReducedMotion, 'Forge setting');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: /外观/ }).click();
  await setSwitch(page, '减少透明度', false);
  await setSwitch(page, '减少动效', false);
  await page.getByRole('button', { name: '看板', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const normalMotion = await readMotionStyles(page);
  assert.ok(maxDurationMs(normalMotion.card.transitionDuration) > 16,
    `Interactive cards should have a restrained transition when motion is enabled: ${JSON.stringify(normalMotion)}`);
  assert.ok(maxDurationMs(normalMotion.drawer.animationDuration) > 16,
    `Drawer should have a restrained entrance when motion is enabled: ${JSON.stringify(normalMotion)}`);
  assert.ok(maxDurationMs(normalMotion.dialog.animationDuration) > 16,
    `Dialog should have a restrained entrance when motion is enabled: ${JSON.stringify(normalMotion)}`);
  const darkTheme = await readThemeSurfaces(page);
  assertGlassSurfaces(darkTheme, false);
  assertCoolPalette(darkTheme, 'Dark');
  if (process.env.FORGE_THEME_SCREENSHOT_DIR) {
    mkdirSync(process.env.FORGE_THEME_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.FORGE_THEME_SCREENSHOT_DIR,
      'forge-glass-20260927-dark.png') });
  }
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: /外观/ }).click();
  assert.equal(await page.getByLabel('界面主题').inputValue(), 'dark');
  await page.getByLabel('界面主题').selectOption('light');
  await page.getByRole('button', { name: '看板', exact: true }).click();
  assert.equal(await page.locator('.app-shell').getAttribute('data-theme'), 'light');
  await assertDocumentAppearance(page);
  const lightTheme = await readThemeSurfaces(page);
  assertGlassSurfaces(lightTheme, false);
  assertCoolPalette(lightTheme, 'Light');
  if (process.env.FORGE_THEME_SCREENSHOT_DIR) {
    await page.screenshot({ path: join(process.env.FORGE_THEME_SCREENSHOT_DIR,
      'forge-glass-20260927-light.png') });
  }
  const wideLayout = await assertResponsiveLayout(page, 1600, 1000,
    'forge-glass-20260927-light-1600x1000.png');
  const narrowLayout = await assertResponsiveLayout(page, 1040, 720,
    'forge-glass-20260927-light-1040x720.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  console.log(JSON.stringify({ stage: 'desktop-responsive-glass-layout',
    wide: { sidebar: wideLayout.sidebar.width, board: wideLayout.board.width,
      emptyWorkspace: wideLayout.emptyBoard.width },
    narrow: { sidebar: narrowLayout.sidebar.width, board: narrowLayout.board.width,
      emptyWorkspace: narrowLayout.emptyBoard.width } }));
  for (const surface of ['canvas', 'topbar', 'drawerSurface']) {
    assert.ok(colorLuminance(lightTheme.visible[surface]) >
      colorLuminance(darkTheme.visible[surface]) + 0.15,
    `${surface} did not visibly switch to light: ${JSON.stringify({ lightTheme, darkTheme })}`);
  }
  assert.equal(lightTheme.drawer.colorScheme, 'light');
  assert.equal(darkTheme.drawer.colorScheme, 'dark');
  await page.reload();
  await page.getByRole('button', { name: 'Host connected' }).waitFor();
  assert.equal(await page.locator('.app-shell').getAttribute('data-theme'), 'light');
  await assertDocumentAppearance(page);
  console.log(JSON.stringify({ stage: 'desktop-light-dark-theme', lightTheme, darkTheme,
    lightPersistsAfterReload: true }));
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: /外观/ }).click();
  await page.getByLabel('界面主题').selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.querySelector('.app-shell')?.getAttribute('data-theme') === 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.querySelector('.app-shell')?.getAttribute('data-theme') === 'dark');
  await page.emulateMedia({ colorScheme: null });
  await page.getByRole('button', { name: '看板', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const osReducedMotion = await readMotionStyles(page);
  assertReducedMotion(osReducedMotion, 'OS preference');
  console.log(JSON.stringify({ stage: 'desktop-glass-motion', normal: normalMotion,
    forgeSetting: userReducedMotion, osPreference: osReducedMotion }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: /外观/ }).click();
  await page.getByLabel('界面主题').selectOption('light');
  await setSwitch(page, '减少透明度', true);
  await page.getByRole('button', { name: '看板', exact: true }).click();
  const reducedLight = await readThemeSurfaces(page, '-reduced-transparency');
  assertGlassSurfaces(reducedLight, true);
  if (process.env.FORGE_THEME_SCREENSHOT_DIR) {
    await page.screenshot({ path: join(process.env.FORGE_THEME_SCREENSHOT_DIR,
      'forge-glass-20260927-light-reduced-transparency.png') });
  }
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: /外观/ }).click();
  await setSwitch(page, '减少透明度', false);
  await page.getByRole('button', { name: '看板', exact: true }).click();

  if (process.env.FORGE_SMOKE_SCREENSHOT) {
    await page.locator('.board-pane').evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: process.env.FORGE_SMOKE_SCREENSHOT });
  }
  await page.getByRole('button', { name: '项目资料' }).click();
  await page.getByRole('button', { name: '导入资料' }).click();
  await page.getByLabel('文件路径').fill('docs/guide.md');
  await page.getByRole('button', { name: '只读导入' }).click();
  await page.getByText('已只读导入 docs/guide.md', { exact: false }).waitFor();
  await page.getByText('第 1–2 行', { exact: false }).waitFor();
  assert.equal(readFileSync(join(knowledgeFixture, 'docs', 'guide.md'), 'utf8'), knowledgeText);
  assert.equal(existsSync(join(knowledgeFixture, 'script-ran.txt')), false);
  const importedKnowledge = await page.evaluate(async () => {
    const active = await window.forge.invokeProject({
      schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'project.active',
      createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
      payload: {},
    });
    if (!active.ok) throw new Error('Project unavailable');
    return window.forge.invokeKnowledge({ type: 'list', payload: {
      projectId: active.data.projectId,
    } });
  });
  assert.equal(importedKnowledge.length, 1);
  assert.equal(importedKnowledge[0].chunkCount, 1);
  const activeForSearch = await page.evaluate(async () => {
    const result = await window.forge.invokeProject({
      schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'project.active',
      createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
      payload: {},
    });
    if (!result.ok) throw new Error('Active project unavailable');
    return result.data;
  });
  const missingContextRun = await page.evaluate((project) => window.forge.invokeRun({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'context.preview',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { projectId: project.projectId, runId: crypto.randomUUID(), query: '日期筛选' },
  }), activeForSearch);
  assert.equal(missingContextRun.ok, false);
  assert.equal(missingContextRun.error.code, 'CONTEXT_RUN_NOT_FOUND');
  await page.getByLabel('搜索项目资料').fill('日期筛选 start_date');
  await page.getByRole('button', { name: '检索', exact: true }).click();
  await page.locator('.knowledge-results').getByText('1 个片段').waitFor();
  const searched = await page.evaluate((project) => window.forge.invokeKnowledge({
    type: 'search', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: '日期筛选 start_date' },
  }), activeForSearch);
  assert.equal(searched.results.length, 1);
  assert.equal(searched.results[0].sourceId, importedKnowledge[0].sourceId);
  assert.match(searched.results[0].text, /start_date/);
  await page.getByRole('button', { name: '提议为项目记忆' }).click();
  await page.getByLabel('主题标识').fill('date.filtering');
  await page.getByRole('button', { name: '保存候选' }).click();
  await page.getByText('已保存候选记忆', { exact: false }).waitFor();
  const candidateList = await page.evaluate((project) => window.forge.invokeMemory({
    type: 'list', payload: { projectId: project.projectId },
  }), activeForSearch);
  assert.equal(candidateList.length, 1);
  assert.equal(candidateList[0].status, 'candidate');
  const notAuthority = await page.evaluate((project) => window.forge.invokeMemory({
    type: 'retrieve', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: 'start_date' },
  }), activeForSearch);
  assert.deepEqual(notAuthority.items, []);
  await page.getByRole('button', { name: '确认记忆' }).click();
  await page.getByLabel('人工决定理由（至少 12 字符）').fill('Current source confirmed by the local project owner');
  await page.getByRole('button', { name: '确认此决定' }).click();
  await page.getByText('已确认该记忆', { exact: false }).waitFor();
  const validatedMemory = await page.evaluate((project) => window.forge.invokeMemory({
    type: 'retrieve', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: 'start_date' },
  }), activeForSearch);
  assert.equal(validatedMemory.items.length, 1);
  assert.equal(validatedMemory.items[0].memoryId, candidateList[0].memoryId);
  if (process.env.FORGE_MEMORY_SCREENSHOT) {
    await page.locator('[aria-label="项目记忆"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.FORGE_MEMORY_SCREENSHOT });
  }
  await page.getByRole('button', { name: '撤销记忆' }).click();
  await page.getByLabel('人工决定理由（至少 12 字符）').fill('Local owner withdraws this project memory now');
  await page.getByRole('button', { name: '确认此决定' }).click();
  await page.getByText('已撤销并清空索引', { exact: false }).waitFor();
  const revokedMemory = await page.evaluate((project) => window.forge.invokeMemory({
    type: 'retrieve', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: 'start_date' },
  }), activeForSearch);
  assert.deepEqual(revokedMemory.items, []);
  const tombstone = await page.evaluate((project) => window.forge.invokeMemory({
    type: 'list', payload: { projectId: project.projectId },
  }), activeForSearch);
  assert.equal(tombstone[0].status, 'revoked');
  assert.equal(tombstone[0].text, '');
  const noMatch = await page.evaluate((project) => window.forge.invokeKnowledge({
    type: 'search', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: 'never_present_here' },
  }), activeForSearch);
  assert.deepEqual(noMatch.results, []);
  if (process.env.FORGE_KNOWLEDGE_SEARCH_SCREENSHOT) {
    await page.locator('.knowledge-tabs button').first().click();
    await page.locator('.knowledge-results').getByText('1 个片段').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.FORGE_KNOWLEDGE_SEARCH_SCREENSHOT });
  }
  await page.locator('.knowledge-tabs button').first().click();
  if (process.env.FORGE_KNOWLEDGE_SCREENSHOT) {
    await page.locator('[aria-label="原文定位"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.FORGE_KNOWLEDGE_SCREENSHOT });
  }
  await page.getByRole('button', { name: '撤销来源' }).click();
  await page.getByRole('button', { name: '确认撤销' }).click();
  await page.getByText('来源已撤销并保留引用墓碑', { exact: false }).waitFor();
  const afterRevoke = await page.evaluate((project) => window.forge.invokeKnowledge({
    type: 'search', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: '日期筛选' },
  }), activeForSearch);
  assert.deepEqual(afterRevoke.results, []);
  assert.equal(readFileSync(join(knowledgeFixture, 'docs', 'guide.md'), 'utf8'), knowledgeText);
  assert.equal(existsSync(join(knowledgeFixture, 'script-ran.txt')), false);
  const arbitraryKnowledge = await page.evaluate(async () => {
    try { await window.forge.invokeKnowledge({ type: 'shell.execute', payload: {} }); return false; }
    catch { return true; }
  });
  assert.equal(arbitraryKnowledge, true);
  const arbitraryMemory = await page.evaluate(async () => {
    try { await window.forge.invokeMemory({ type: 'shell.execute', payload: {} }); return false; }
    catch { return true; }
  });
  assert.equal(arbitraryMemory, true);
  console.log(JSON.stringify({ stage: 'connected', hostId: health.data.hostId, pid: ownedPid,
    version: health.data.version, protocolVersion: health.data.protocolVersion,
    runtime: health.data.runtime, storage: health.data.storage, renderer, webPreferences: {
      contextIsolation: webPreferences.contextIsolation,
      nodeIntegration: webPreferences.nodeIntegration,
      sandbox: webPreferences.sandbox,
    } }, null, 2));
} finally {
  await electronApp.close();
}

const invalidDataDir = join(smokeDataDir, 'invalid-db');
mkdirSync(invalidDataDir);
writeFileSync(join(invalidDataDir, 'forge.sqlite'), 'not a SQLite database');
electronApp = await launchDesktop(invalidDataDir);
let degradedPid;
try {
  const page = await electronApp.firstWindow();
  await page.getByRole('button', { name: 'Host degraded' }).waitFor({ timeout: 15000 });
  const degraded = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(degraded.ok, true);
  assert.equal(degraded.data.status, 'degraded');
  assert.equal(degraded.data.storage.status, 'unavailable');
  assert.equal(degraded.data.storage.error.code, 'DATABASE_CORRUPT');
  assert.doesNotMatch(JSON.stringify(degraded), new RegExp(invalidDataDir));
  const pythonDegraded = await page.evaluate(() => window.forge.pythonHostStatus());
  assert.equal(pythonDegraded.health.storage.status, 'unavailable');
  assert.equal(pythonDegraded.health.storage.error.code, 'DATABASE_CORRUPT');
  assert.doesNotMatch(JSON.stringify(pythonDegraded), new RegExp(invalidDataDir));
  degradedPid = degraded.data.pid;
  await page.getByRole('button', { name: 'Host degraded' }).click();
  assert.match(await page.locator('#host-diagnostics').textContent(), /Storage\s*Unavailable/);
  assert.match(await page.locator('#host-diagnostics').textContent(), /DATABASE_CORRUPT/);
  console.log(JSON.stringify({ stage: 'storage-degraded', pid: degradedPid,
    hostStatus: degraded.data.status, storage: degraded.data.storage.status,
    error: degraded.data.storage.error.code }, null, 2));
} finally {
  await electronApp.close();
}
if (degradedPid) await waitGone(degradedPid);
if (ownedPid) await waitGone(ownedPid);

electronApp = await launchDesktop();
try {
  const page = await electronApp.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  const beforeCrash = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(beforeCrash.ok, true);
  const crashPid = beforeCrash.data.pid;
  assert.equal(alive(crashPid), true);
  process.kill(crashPid, 'SIGKILL');
  await page.getByRole('button', { name: 'Host crashed' }).waitFor({ timeout: 10000 });
  const afterCrash = await page.evaluate(() => Promise.all([window.forge.hostStatus(), window.forge.hostHealth()]));
  assert.equal(afterCrash[0].state, 'crashed');
  assert.equal(afterCrash[0].health, null);
  assert.equal(afterCrash[0].info, null);
  assert.equal(afterCrash[1].ok, false);
  assert.equal(afterCrash[1].error.code, 'HOST_EXITED');
  const runAfterCrash = await page.evaluate(() => window.forge.invokeRun({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'run.list',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { projectId: crypto.randomUUID(), taskId: crypto.randomUUID() },
  }));
  assert.equal(runAfterCrash.ok, false);
  assert.equal(runAfterCrash.error.code, 'HOST_EXITED');
  await page.getByRole('button', { name: 'Host crashed' }).click();
  assert.equal(await page.locator('#host-diagnostics dd').first().textContent(), '—');
  await waitGone(crashPid);
  await electronApp.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
  await page.getByRole('button', { name: '重启本地 Host' }).click();
  await page.getByText('已取消重启。').waitFor({ timeout: 10000 });
  assert.equal((await page.evaluate(() => window.forge.hostStatus())).state, 'crashed');
  await electronApp.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  await page.getByRole('button', { name: '重启本地 Host' }).click();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  const restarted = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(restarted.ok, true);
  assert.notEqual(restarted.data.hostId, beforeCrash.data.hostId);
  assert.notEqual(restarted.data.pid, crashPid);
  console.log(JSON.stringify({ stage: 'crash-detected', pid: crashPid, state: afterCrash[0].state,
    error: afterCrash[1].error.code, restartedPid: restarted.data.pid }, null, 2));
} finally {
  await electronApp.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  await electronApp.close();
}
