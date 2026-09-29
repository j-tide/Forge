import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = await mkdtemp(path.join(tmpdir(), 'forge-workspace-ui-'));
const output = process.env.FORGE_QA_OUTPUT_DIR ? path.resolve(process.env.FORGE_QA_OUTPUT_DIR) : path.join(root, 'output/playwright/workspace-redesign');
const executablePath = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const report = { recordedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, modelCalls: 0, cases: [], data, screenshots: [], sourceHashes: {} };
const settingsText = JSON.parse(await readFile(path.join(root, 'apps/desktop/src/shared/i18n/locales/zh-CN/settings.json'), 'utf8'));
await mkdir(output, { recursive: true });
for (const file of ['out/main/index.js', 'out/preload/index.mjs', 'out/renderer/index.html']) {
  report.sourceHashes[file] = createHash('sha256').update(await readFile(path.join(root, 'apps/desktop', file))).digest('hex');
}
for (const asset of await readdir(path.join(root, 'apps/desktop/out/renderer/assets'))) {
  if (!/\.(css|js)$/.test(asset)) continue;
  const file = `out/renderer/assets/${asset}`;
  report.sourceHashes[file] = createHash('sha256').update(await readFile(path.join(root, 'apps/desktop', file))).digest('hex');
}

async function launch(profile) {
  const app = await electron.launch({ executablePath, args: [path.join(root, 'apps/desktop')], env: { ...process.env, NODE_ENV: 'test', FORGE_GLASS_PREVIEW_USER_DATA_DIR: profile } });
  try {
    await app.firstWindow();
    const page = app.windows().find((window) => window.url().startsWith('file:') && window.url().includes('/renderer/index.html'));
    assert.ok(page, 'Application window missing');
    // Test builds open docked DevTools. Close only this fixture's inspector and
    // focus its native window so real hover/wheel events reach the app surface.
    await app.evaluate(({ app: application, BrowserWindow }) => {
      application.focus({ steal: true });
      const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes('/renderer/index.html'));
      window?.webContents.closeDevTools();
      window?.show();
      window?.focus();
      window?.webContents.focus();
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.bringToFront();
    await page.locator('.forge-glass-sidebar').waitFor({ timeout: 20000 });
    return { app, page };
  } catch (error) { await app.close(); throw error; }
}
async function shot(page, name) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
  report.screenshots.push(`${name}.png`);
}
async function auditPage(page, theme, name) {
  const snapshot = await page.locator('main').evaluate((el) => ({
    headings: [...el.querySelectorAll('h1,h2,h3')].filter((node) => node.getClientRects().length > 0).map((node) => node.textContent.trim()),
    text: el.innerText.slice(0, 1800),
    rootWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    alerts: [...el.querySelectorAll('[role="alert"]')].map((node) => node.textContent.trim()),
  }));
  assert.ok(snapshot.text.trim().length > 10, `${name} must render content or a clear empty/unavailable state`);
  assert.ok(snapshot.scrollWidth <= snapshot.rootWidth + 1, `${name} must not overflow the whole application horizontally`);
  await shot(page, `${name}-${theme}`);
  report.cases.push({ theme, case: `navigation-${name}`, ...snapshot });
}
async function inspectContrast(page) {
  return page.evaluate(() => {
    const sample = document.createElement('span');
    document.body.append(sample);
    const colors = {};
    for (const name of ['foreground', 'muted-foreground', 'background', 'card', 'primary', 'primary-foreground', 'destructive', 'destructive-foreground']) {
      sample.style.color = `var(--${name})`;
      colors[name] = getComputedStyle(sample).color;
    }
    sample.remove();
    const luminance = (value) => {
      const c = value.match(/[\d.]+/g).slice(0, 3).map(Number).map((n) => n / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
      return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    };
    const contrast = (a, b) => {
      const [high, low] = [luminance(colors[a]), luminance(colors[b])].sort((a, b) => b - a);
      return (high + .05) / (low + .05);
    };
    return { text: contrast('foreground', 'background'), muted: contrast('muted-foreground', 'card'), primary: contrast('primary-foreground', 'primary'), danger: contrast('destructive-foreground', 'destructive') };
  });
}

try {
  for (const theme of ['light', 'dark']) {
    const profile = path.join(data, theme);
    await mkdir(profile, { recursive: true });
    await writeFile(path.join(profile, 'settings.json'), JSON.stringify({ onboardingCompleted: true, language: 'zh-CN', theme, colorTheme: 'forge-glass', sentryEnabled: false }));
    let { app, page } = await launch(profile);
    let setup;
    try {
      await page.locator('.forge-glass-welcome').waitFor();
      assert.equal(await page.getByText('无限制', { exact: true }).count(), 0, 'No account must not show an unlimited usage claim');
      assert.equal(await page.locator('html').evaluate((el) => el.classList.contains('dark')), theme === 'dark');
      const contrast = await inspectContrast(page);
      for (const [name, ratio] of Object.entries(contrast)) assert.ok(ratio >= 4.5, `${theme} ${name} contrast ${ratio}`);
      await shot(page, `home-${theme}-1440`);
      await page.getByRole('button', { name: '打开项目', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await shot(page, `project-picker-${theme}`);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.locator('.forge-settings-page').waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0, 'Settings must be an in-app page');
      await shot(page, `settings-${theme}`);
      await page.getByRole('switch', { name: '减少动效', exact: true }).click();
      await page.getByRole('switch', { name: '减少透明度', exact: true }).click();
      assert.equal(await page.locator('html').getAttribute('data-reduce-motion'), 'true');
      assert.equal(await page.locator('html').getAttribute('data-reduce-transparency'), 'true');
      const styles = await page.locator('.forge-glass-sidebar').evaluate((el) => ({ blur: getComputedStyle(el).backdropFilter, animation: getComputedStyle(el).animationName }));
      assert.ok(styles.blur === 'none' || styles.blur === 'blur(0px)', `Reduced transparency: ${styles.blur}`);
      assert.equal(styles.animation, 'none');
      await shot(page, `accessibility-${theme}`);
      await page.getByRole('button', { name: '保存设置', exact: true }).click();
      await page.locator('.forge-glass-welcome').waitFor();
      const saved = JSON.parse(await readFile(path.join(profile, 'settings.json'), 'utf8'));
      assert.equal(saved.reduceMotion, true);
      assert.equal(saved.reduceTransparency, true);
      report.cases.push({ theme, case: 'appearance', contrast, styles, persisted: true });

      // Only isolated fixture setup uses public IPC. No task is started and no
      // model, account, executor, fake activity or fabricated success is used.
      const fixture = path.join(data, `Forge UI 测试 ${theme}`);
      await mkdir(fixture, { recursive: true });
      await writeFile(path.join(fixture, 'README.md'), '# Forge UI test fixture\n');
      execFileSync('git', ['init', '-b', 'main'], { cwd: fixture, stdio: 'pipe' });
      execFileSync('git', ['add', 'README.md'], { cwd: fixture, stdio: 'pipe' });
      execFileSync('git', ['-c', 'user.name=Forge UI QA', '-c', 'user.email=ui-qa@example.invalid', 'commit', '-m', 'Initialize isolated UI fixture'], { cwd: fixture, stdio: 'pipe' });
      setup = await page.evaluate(async (fixture) => {
        const added = await window.electronAPI.addProject(fixture);
        if (!added.success || !added.data) throw new Error(added.error || 'Add project failed');
        const initialized = await window.electronAPI.initializeProject(added.data.id);
        if (!initialized.success) throw new Error(initialized.error || 'Initialization failed');
        const tabs = await window.electronAPI.saveTabState({ openProjectIds: [added.data.id], activeProjectId: added.data.id, tabOrder: [added.data.id] });
        if (!tabs.success) throw new Error(tabs.error || 'Save project context failed');
        return added.data.id;
      }, fixture);
      report.cases.push({ theme, case: 'real-project-setup', projectId: setup, fixture });
    } finally { await app.close(); }

    ({ app, page } = await launch(profile));
    try {
      await page.locator('.forge-glass-board').waitFor({ timeout: 20000 });
      assert.equal(await page.locator('html').getAttribute('data-reduce-motion'), 'true');
      assert.equal(await page.locator('html').getAttribute('data-reduce-transparency'), 'true');
      await shot(page, `board-${theme}-1440`);
      await page.mouse.move(300, 300);
      await page.locator('.forge-glass-project-tab [role="tab"]').first().hover();
      const tooltip = page.locator('[data-radix-popper-content-wrapper]').filter({ has: page.getByText(`Forge UI 测试 ${theme}`, { exact: true }) }).last();
      await tooltip.waitFor({ state: 'visible' });
      const tooltipVisibility = await tooltip.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { insideHeader: !!el.closest('.forge-glass-project-tabs'), visibleAtCenter: !!hit && el.contains(hit), height: rect.height };
      });
      assert.equal(tooltipVisibility.insideHeader, false, 'Tooltip must escape the clipped project header');
      assert.equal(tooltipVisibility.visibleAtCenter, true, 'Tooltip must appear above the board rather than behind it');
      await shot(page, `project-tooltip-${theme}`);
      await page.mouse.move(300, 120);
      await page.keyboard.press('Escape');
      await tooltip.waitFor({ state: 'hidden' });
      report.cases.push({ theme, case: 'project-tooltip-layer', ...tooltipVisibility });
      const columns = page.locator('.forge-glass-board-columns');
      const right = page.getByRole('button', { name: '向右查看看板列', exact: true });
      const left = page.getByRole('button', { name: '向左查看看板列', exact: true });
      assert.equal(await left.isDisabled(), true, 'Left edge disables left navigation');
      for (let step = 0; step < 6 && !(await right.isDisabled()); step += 1) {
        const before = await columns.evaluate((el) => el.scrollLeft);
        await right.focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction((before) => document.querySelector('.forge-glass-board-columns').scrollLeft > before, before);
      }
      await page.waitForFunction(() => document.querySelector('[aria-label="向右查看看板列"]').disabled);
      const end = await columns.evaluate((el) => ({ left: el.scrollLeft, width: el.scrollWidth, viewport: el.clientWidth }));
      assert.ok(Math.abs(end.width - end.viewport - end.left) <= 2, 'Right navigation reaches the real final column');
      await shot(page, `board-last-columns-${theme}`);
      for (let step = 0; step < 6 && !(await left.isDisabled()); step += 1) {
        await left.click();
      }
      await page.waitForFunction(() => document.querySelector('.forge-glass-board-columns').scrollLeft === 0);
      report.cases.push({ theme, case: 'keyboard-board-scroll', end });
      await page.getByRole('button', { name: '队列设置', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await shot(page, `queue-settings-${theme}`);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '新建任务', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.locator('#create-title').fill('UI 验收草稿 — 不启动执行器');
      await page.locator('#create-description').fill('验证本地任务保存、布局、键盘打开与详情阅读。此草稿不会运行模型或修改产品代码。');
      await shot(page, `new-task-${theme}-1440`);
      await page.setViewportSize({ width: 1080, height: 760 });
      const bounds = await dialog.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 1081 && bounds.y + bounds.height <= 761, 'Editor overflows window');
      await shot(page, `new-task-${theme}-1080`);
      await page.setViewportSize({ width: 1440, height: 900 });
      await dialog.getByRole('button', { name: '创建任务', exact: true }).click();
      await dialog.waitFor({ state: 'hidden', timeout: 20000 });
      const title = page.getByRole('button', { name: 'UI 验收草稿 — 不启动执行器', exact: true });
      await title.waitFor();
      await title.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('dialog').waitFor();
      await shot(page, `task-detail-${theme}`);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      for (const [label, name] of [['上下文', 'context'], ['项目洞察', 'insights'], ['路线图', 'roadmap'], ['MCP 概览', 'tools'], ['创意探索', 'ideation'], ['更新日志', 'changelog'], ['工作树', 'worktrees'], ['智能体终端', 'terminals']]) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await page.locator('.forge-glass-sidebar').getByRole('button', { name: label, exact: true }).and(page.locator('[aria-current="page"]')).waitFor();
        await auditPage(page, theme, name);
      }
      await page.getByRole('button', { name: '任务看板', exact: true }).click();
      await page.locator('.forge-glass-board').waitFor();

      // Project configuration is a separate scope from application preferences.
      const settingsBeforeProjectSave = await readFile(path.join(profile, 'settings.json'), 'utf8');
      const gear = page.locator('.forge-glass-project-tabs').getByRole('button', { name: '项目设置', exact: true });
      await gear.click();
      await page.getByRole('heading', { name: '项目设置', exact: true }).waitFor();
      const projectPage = page.locator('section[aria-labelledby="project-settings-page-title"]');
      assert.equal(await projectPage.getByRole('button', { name: settingsText.sections.appearance.title, exact: true }).count(), 0, 'Project settings must not contain application appearance preferences');
      for (const section of ['general', 'linear', 'github', 'gitlab', 'memory']) {
        await projectPage.locator('nav').getByRole('button', { name: settingsText.projectSections[section].title, exact: true }).click();
        await auditPage(page, theme, `project-settings-${section}`);
      }
      await projectPage.locator('nav').getByRole('button', { name: settingsText.projectSections.general.title, exact: true }).click();
      await page.keyboard.press('C');
      await page.getByRole('heading', { name: '项目设置', exact: true }).waitFor();
      await projectPage.getByRole('button', { name: '保存项目设置', exact: true }).click();
      await projectPage.waitFor({ state: 'hidden' });
      assert.equal(await readFile(path.join(profile, 'settings.json'), 'utf8'), settingsBeforeProjectSave, 'Saving project settings must not write global preferences');
      assert.equal(await gear.evaluate((el) => el === document.activeElement), true, 'Closing project settings restores trigger focus');
      report.cases.push({ theme, case: 'project-settings-scope', projectId: setup, globalPreferencesUnchanged: true, shortcutBlocked: true, focusRestored: true });

      await page.locator('.forge-glass-sidebar').getByRole('button', { name: '设置', exact: true }).click();
      const appPage = page.locator('section[aria-labelledby="settings-page-title"]');
      await appPage.getByRole('heading', { name: '应用设置', level: 1, exact: true }).waitFor();
      assert.equal(await appPage.getByText('项目设置', { exact: true }).count(), 0, 'Application settings must not contain project settings');
      for (const section of ['appearance', 'display', 'language', 'devtools', 'terminal-fonts', 'agent', 'paths', 'accounts', 'updates', 'notifications', 'debug']) {
        await appPage.locator('nav').getByRole('button', { name: settingsText.sections[section].title, exact: true }).click();
        await auditPage(page, theme, `app-settings-${section}`);
      }
      await appPage.getByRole('button', { name: '返回', exact: true }).click();
      await page.locator('.forge-glass-board').waitFor();
      const tasks = await page.evaluate(async () => {
        const projects = await window.electronAPI.getProjects();
        return window.electronAPI.getTasks(projects.data[0].id, { forceRefresh: true });
      });
      assert.equal(tasks.data.length, 1);
      assert.equal(tasks.data[0].status, 'backlog', 'UI draft must never auto-start');
      report.cases.push({ theme, case: 'project-task-navigation', taskId: tasks.data[0].id, taskStatus: tasks.data[0].status, modelCalls: 0, resized: true, keyboardDetail: true });
    } finally { await app.close(); }
  }
  report.valid = true;
} catch (error) {
  report.valid = false;
  report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally { await writeFile(path.join(output, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`); }
console.log(`Real Electron UI evidence: ${output}`);
