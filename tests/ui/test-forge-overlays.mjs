import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const data = await mkdtemp(path.join(tmpdir(), 'forge-overlay-ui-'));
const output = process.env.FORGE_QA_OUTPUT_DIR ? path.resolve(process.env.FORGE_QA_OUTPUT_DIR) : path.join(root, 'output/playwright/overlay-audit');
const executablePath = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const report = { recordedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, modelRunsStarted: 0, accountFixture: 'Z.AI metadata only; no API key; not provider availability evidence', data, cases: [], sourceHashes: {} };
await mkdir(output, { recursive: true });
for (const asset of await readdir(path.join(root, 'out/renderer/assets'))) {
  if (!/\.(css|js)$/.test(asset)) continue;
  report.sourceHashes[asset] = createHash('sha256').update(await readFile(path.join(root, 'out/renderer/assets', asset))).digest('hex');
}

async function checkOverlay(page, locator, label, theme) {
  await locator.waitFor({ state: 'visible' });
  const state = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { inHeader: Boolean(el.closest('.forge-glass-project-tabs')), centerVisible: Boolean(hit && el.contains(hit)), inViewport: r.x >= 0 && r.y >= 0 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1, bounds: { x: r.x, y: r.y, width: r.width, height: r.height }, overflowY: getComputedStyle(el).overflowY };
  });
  await page.screenshot({ path: path.join(output, `${label}-${theme}.png`), animations: 'disabled' });
  report.cases.push({ theme, label, ...state });
  assert.equal(state.inHeader, false, `${label}: overlay still nested in clipped header`);
  assert.equal(state.centerVisible, true, `${label}: another surface covers overlay`);
  assert.equal(state.inViewport, true, `${label}: overlay exceeds viewport`);
}

async function applicationWindow(app) {
  await app.firstWindow();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const page = app.windows().find((window) => window.url().startsWith('file:') && window.url().includes('/renderer/index.html'));
    if (page) {
      await focusApplication(app, page);
      return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Forge application window missing: ${app.windows().map((window) => window.url()).join(', ')}`);
}

async function focusApplication(app, page) {
  await page.bringToFront();
  await app.evaluate(({ app: application, BrowserWindow }) => {
    application.focus({ steal: true });
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes('/renderer/index.html'));
    window?.webContents.closeDevTools();
    window?.show();
    window?.focus();
    window?.webContents.focus();
  });
  await page.waitForFunction(() => document.hasFocus(), undefined, { timeout: 5000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function hoverTooltip(app, page, trigger, tooltip, theme) {
  // Electron can hand focus back while the previous window/DevTools is closing.
  // Re-establish native focus after renderer readiness, then perform real pointer
  // leave/enter. A visible tooltip is still required; no keyboard bypass or CSS
  // mutation is used to satisfy this hover test.
  const attempts = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await focusApplication(app, page);
    await page.mouse.move(300, 300, { steps: 3 });
    await trigger.hover();
    try {
      await tooltip.waitFor({ state: 'visible', timeout: 3000 });
      report.hoverReadiness ??= [];
      report.hoverReadiness.push({ theme, attempts: attempt + 1, documentFocused: await page.evaluate(() => document.hasFocus()), triggerHovered: await trigger.evaluate((el) => el.matches(':hover')) });
      return;
    } catch {
      attempts.push(await trigger.evaluate((el) => ({ focused: document.hasFocus(), hovered: el.matches(':hover'), state: el.getAttribute('data-state'), bounds: el.getBoundingClientRect().toJSON() })));
    }
  }
  await page.screenshot({ path: path.join(output, `tooltip-hover-failure-${theme}.png`), animations: 'disabled' });
  await writeFile(path.join(output, `tooltip-hover-failure-${theme}.json`), JSON.stringify(attempts, null, 2));
  throw new Error(`${theme} account tooltip did not open after three focused pointer-enter attempts`);
}

try {
  for (const theme of ['light', 'dark']) {
    const profile = path.join(data, theme);
    await mkdir(profile);
    const accounts = Array.from({ length: 12 }, (_, index) => ({ id: `overlay-ui-fixture-${index}`, provider: 'zai', name: index === 0 ? 'UI fixture — no credentials' : `UI fixture account ${index} — no credentials`, authType: 'api-key', billingModel: 'pay-per-use', createdAt: Date.now(), updatedAt: Date.now() }));
    await writeFile(path.join(profile, 'settings.json'), JSON.stringify({ onboardingCompleted: true, language: 'zh-CN', theme, colorTheme: 'forge-glass', sentryEnabled: false, providerAccounts: accounts, globalPriorityOrder: accounts.map((account) => account.id) }));
    let app = await electron.launch({ executablePath, args: [root], env: { ...process.env, NODE_ENV: 'test', FORGE_GLASS_PREVIEW_USER_DATA_DIR: profile } });
    try {
      const page = await applicationWindow(app);
      await page.setViewportSize({ width: 1080, height: 760 });
      await page.bringToFront();
      await page.locator('.forge-glass-sidebar').waitFor({ timeout: 20000 });
      report.appVersion = await page.evaluate(() => window.electronAPI.getAppVersion());
      const fixture = path.join(data, `Overlay QA ${theme}`);
      await mkdir(fixture);
      await writeFile(path.join(fixture, 'README.md'), '# Overlay QA\n');
      execFileSync('git', ['init', '-b', 'main'], { cwd: fixture, stdio: 'pipe' });
      execFileSync('git', ['add', 'README.md'], { cwd: fixture, stdio: 'pipe' });
      execFileSync('git', ['-c', 'user.name=Forge UI QA', '-c', 'user.email=ui-qa@example.invalid', 'commit', '-m', 'Initialize isolated overlay fixture'], { cwd: fixture, stdio: 'pipe' });
      await page.evaluate(async (fixture) => {
        const project = await window.electronAPI.addProject(fixture);
        if (!project.success || !project.data) throw new Error('Fixture project registration failed');
        const initialized = await window.electronAPI.initializeProject(project.data.id);
        if (!initialized.success) throw new Error('Fixture project initialization failed');
        const tabs = await window.electronAPI.saveTabState({ openProjectIds: [project.data.id], activeProjectId: project.data.id, tabOrder: [project.data.id] });
        if (!tabs.success) throw new Error('Fixture tab persistence failed');
      }, fixture);
      await page.reload();
      await page.locator('.forge-glass-board').waitFor({ timeout: 20000 });
    } finally { await app.close(); }

    app = await electron.launch({ executablePath, args: [root], env: { ...process.env, NODE_ENV: 'test', FORGE_GLASS_PREVIEW_USER_DATA_DIR: profile } });
    try {
      const page = await applicationWindow(app);
      await page.setViewportSize({ width: 1080, height: 760 });
      await page.bringToFront();
      await page.locator('.forge-glass-board').waitFor({ timeout: 20000 }).catch(async (error) => {
        await page.screenshot({ path: path.join(output, `startup-failure-${theme}.png`) });
        await writeFile(path.join(output, `startup-failure-${theme}.txt`), await page.locator('body').innerText());
        throw error;
      });
      const auth = page.locator('.forge-glass-project-tabs button[aria-label]').filter({ hasText: 'Z.AI' });
      const authTooltip = page.locator('[data-radix-popper-content-wrapper]').filter({ has: page.getByText('UI fixture — no credentials', { exact: true }) }).last();
      await hoverTooltip(app, page, auth, authTooltip, theme);
      await checkOverlay(page, authTooltip, 'account-tooltip', theme);
      await page.keyboard.press('Escape');
      await authTooltip.waitFor({ state: 'hidden' });
      const usage = page.getByRole('button', { name: '用量状态', exact: true });
      await usage.click();
      const usagePopover = page.locator('[data-radix-popper-content-wrapper]').filter({ has: page.getByText('UI fixture — no credentials', { exact: true }) }).last();
      await checkOverlay(page, usagePopover, 'usage-popover', theme);
      const usageContent = usagePopover.locator('[role="dialog"]');
      await usageContent.locator('span').filter({ hasText: '用量明细' }).click();
      await usageContent.hover();
      await usageContent.evaluate((el) => { el.dataset.wheelCount = '0'; el.addEventListener('wheel', (event) => { el.dataset.wheelCount = String(Number(el.dataset.wheelCount) + 1); el.dataset.wheelPrevented = String(event.defaultPrevented); }); });
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(500);
      const scrollState = await usageContent.evaluate((el) => ({ role: el.getAttribute('role'), tag: el.tagName, top: el.scrollTop, client: el.clientHeight, scroll: el.scrollHeight, overflow: getComputedStyle(el).overflowY, bounds: el.getBoundingClientRect().toJSON(), wheelCount: el.dataset.wheelCount, wheelPrevented: el.dataset.wheelPrevented, documentFocus: document.hasFocus() }));
      report.cases.push({ theme, label: 'usage-wheel-diagnostic', ...scrollState });
      await page.screenshot({ path: path.join(output, `usage-scrolled-${theme}.png`), animations: 'disabled' });
      await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((el) => el.scrollTop > 0), undefined, { timeout: 5000 });
      const lastAccount = page.getByText('UI fixture account 11 — no credentials', { exact: true });
      const lastBounds = await lastAccount.boundingBox();
      assert.ok(lastBounds && lastBounds.y >= 0 && lastBounds.y + lastBounds.height <= 761, 'Last account must remain reachable inside the viewport');
      const swaps = await usagePopover.getByRole('button', { name: '切换', exact: true }).evaluateAll((buttons) => buttons.map((button) => ({ whiteSpace: getComputedStyle(button).whiteSpace, flexShrink: getComputedStyle(button).flexShrink, width: button.getBoundingClientRect().width })));
      assert.equal(swaps.length, 11, 'Every fixture account must retain its switch action');
      assert.ok(swaps.every((button) => button.whiteSpace === 'nowrap' && button.flexShrink === '0' && button.width > 20), 'Long account names must not collapse or wrap switch buttons');
      report.cases.push({ theme, label: 'usage-scroll-last-account', reachable: true, switchButtons: swaps.length, noWrappedSwitches: true });
      await page.keyboard.press('Escape');
      await usagePopover.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '用量状态', undefined, { timeout: 5000 });
      assert.equal(await usage.evaluate((el) => document.activeElement === el), true, 'Escape must return usage trigger focus');
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.getByRole('button', { name: /智能体设置/ }).click();
      const trigger = page.locator('button[data-state][aria-haspopup="dialog"]').filter({ hasText: /GLM|Sonnet|Opus|Haiku|GPT/i }).first();
      await trigger.waitFor({ timeout: 20000 });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      const search = page.getByPlaceholder('搜索模型…');
      const modelPopover = page.locator('[data-radix-popper-content-wrapper]').filter({ has: search }).last();
      await checkOverlay(page, modelPopover, 'model-picker', theme);
      assert.equal(await search.evaluate((el) => Boolean(el.closest('.forge-settings-page'))), false, 'Model picker must escape settings scroll container');
      await search.fill('nonexistent-ui-fixture');
      await page.getByText('没有匹配的模型', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await modelPopover.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement?.matches('button[data-state][aria-haspopup="dialog"]'), undefined, { timeout: 5000 });
      assert.equal(await trigger.evaluate((el) => document.activeElement === el), true, 'Escape must restore model trigger focus');
    } finally { await app.close(); }
  }
  report.valid = true;
} catch (error) {
  report.valid = false;
  report.error = String(error);
  throw error;
} finally {
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ valid: report.valid, output, cases: report.cases.length, modelRunsStarted: 0 }));
}
