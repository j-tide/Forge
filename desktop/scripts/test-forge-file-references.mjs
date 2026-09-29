import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin') throw new Error('Native UI verification requires macOS; other platforms are unverified.');
const output = process.env.FORGE_QA_OUTPUT_DIR ? path.resolve(process.env.FORGE_QA_OUTPUT_DIR) : path.join(root, 'output/playwright/file-autocomplete');
const data = await mkdtemp(path.join(os.tmpdir(), 'forge-file-autocomplete-'));
const executablePath = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const report = { valid: false, platform: process.platform, arch: process.arch, recordedAt: new Date().toISOString(), modelCalls: 0, data, fixtures: [], cases: [], sourceHashes: {} };
await mkdir(output, { recursive: true });
for (const file of ['out/main/index.js', 'out/preload/index.mjs', 'out/renderer/index.html']) {
  report.sourceHashes[file] = createHash('sha256').update(await readFile(path.join(root, 'apps/desktop', file))).digest('hex');
}
for (const asset of await readdir(path.join(root, 'apps/desktop/out/renderer/assets'))) {
  if (!/\.(js|css)$/.test(asset)) continue;
  report.sourceHashes[asset] = createHash('sha256').update(await readFile(path.join(root, 'apps/desktop/out/renderer/assets', asset))).digest('hex');
}
async function launch(profile) {
  const app = await electron.launch({ executablePath, args: [path.join(root, 'apps/desktop')], env: { ...process.env, NODE_ENV: 'test', FORGE_GLASS_PREVIEW_USER_DATA_DIR: profile } });
  try {
    await app.firstWindow();
    const page = app.windows().find(window => window.url().startsWith('file:') && window.url().includes('/renderer/index.html'));
    assert.ok(page, 'Forge renderer window missing');
    await app.evaluate(({ app: application, BrowserWindow }) => {
      application.focus({ steal: true });
      const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().includes('/renderer/index.html'));
      window?.webContents.closeDevTools();
      window?.show();
      window?.focus();
      window?.webContents.focus();
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.forge-glass-sidebar').waitFor({ timeout: 20000 });
    report.appVersion = await page.evaluate(() => window.electronAPI.getAppVersion());
    return { app, page };
  } catch (error) { await app.close(); throw error; }
}
try {
  for (const theme of ['light', 'dark']) {
    // Each isolated profile owns its own project fixture: initializeProject
    // correctly refuses to overwrite metadata created by another profile.
    const fixture = path.join(data, `Forge 文件补全 fixture ${theme}`);
    await mkdir(fixture);
    for (const [name, content] of [['README.md', '# UI fixture\n'], ['alpha.ts', '// alpha\n'], ['中文文件.ts', '// unicode file\n'], ['.gitignore', '# Forge data directory\n.forge-glass-preview/\n']]) {
      await writeFile(path.join(fixture, name), content);
    }
    execFileSync('git', ['init', '-b', 'main'], { cwd: fixture, stdio: 'pipe' });
    execFileSync('git', ['add', '.'], { cwd: fixture, stdio: 'pipe' });
    execFileSync('git', ['-c', 'user.name=Forge UI QA', '-c', 'user.email=ui-qa@example.invalid', 'commit', '-m', 'Isolated autocomplete fixture'], { cwd: fixture, stdio: 'pipe' });
    report.fixtures.push({ theme, path: fixture });
    const profile = path.join(data, theme);
    await mkdir(profile);
    await writeFile(path.join(profile, 'settings.json'), JSON.stringify({ onboardingCompleted: true, language: 'en', theme, colorTheme: 'forge-glass', sentryEnabled: false }));
    let { app, page } = await launch(profile);
    let projectId;
    try {
      projectId = await page.evaluate(async fixture => {
        const added = await window.electronAPI.addProject(fixture);
        assertSuccess(added);
        const id = added.data.id;
        assertSuccess(await window.electronAPI.initializeProject(id));
        assertSuccess(await window.electronAPI.saveTabState({ openProjectIds: [id], activeProjectId: id, tabOrder: [id] }));
        return id;
        function assertSuccess(result) { if (!result.success) throw new Error(result.error || 'Fixture IPC setup failed'); }
      }, fixture);
    } finally { await app.close(); }
    ({ app, page } = await launch(profile));
    try {
      await page.locator('.forge-glass-board').waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'New Task', exact: true }).click();
      const editor = page.getByRole('dialog');
      await editor.waitFor();
      const description = page.locator('#create-description');
      await description.fill('Read @');
      const list = page.getByRole('listbox', { name: 'Project Files' });
      await list.waitFor({ state: 'visible' });
      for (const [width, height] of [[1440, 900], [1080, 760]]) {
        await page.setViewportSize({ width, height });
        await list.waitFor({ state: 'visible' });
        await page.waitForTimeout(100);
        const placement = await list.evaluate(el => {
          const content = el.closest('[data-radix-popper-content-wrapper]');
          const rect = content.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, visibleAtCenter: !!hit && content.contains(hit), insideEditor: !!content.closest('.forge-glass-task-modal') };
        });
        assert.equal(placement.insideEditor, false, 'Suggestions must escape clipped editor');
        assert.equal(placement.visibleAtCenter, true, 'Suggestions must be above the task modal');
        assert.ok(placement.x >= 0 && placement.y >= 0 && placement.x + placement.width <= width + 1 && placement.y + placement.height <= height + 1, 'Suggestions must fit the viewport');
        await page.screenshot({ path: path.join(output, `file-autocomplete-${theme}-${width}.png`), animations: 'disabled' });
        report.cases.push({ theme, viewportWidth: width, viewportHeight: height, case: 'popup-placement', ...placement });
      }
      await description.focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowUp');
      assert.equal(await description.evaluate(el => document.activeElement === el), true);
      await page.keyboard.press('Escape');
      await list.waitFor({ state: 'hidden' });
      assert.equal(await editor.isVisible(), true, 'Escape dismisses suggestions, not editor');
      await description.fill('Read @alpha');
      await page.getByRole('option', { name: /alpha.ts/ }).waitFor({ state: 'visible' });
      await page.keyboard.press('Enter');
      assert.equal(await description.inputValue(), 'Read @alpha.ts');
      await list.waitFor({ state: 'hidden' });
      await description.fill('查看 @中文');
      await page.getByRole('option', { name: /中文文件.ts/ }).click();
      assert.equal(await description.inputValue(), '查看 @中文文件.ts');
      await description.fill('Read @missing-no-file');
      await page.getByRole('status').filter({ hasText: 'No files found' }).waitFor();
      await page.keyboard.press('Tab');
      await list.waitFor({ state: 'hidden' });
      assert.equal(await editor.isVisible(), true);
      assert.equal(await description.evaluate(el => document.activeElement === el), false, 'No-result Tab must move focus normally');
      report.cases.push({ theme, case: 'keyboard-selection-escape-unicode-empty', passed: true });
      await page.locator('#create-title').fill(`File reference UI QA ${theme}`);
      await description.fill('Verify selected alpha.ts and 中文文件.ts references. Do not start an executor.');
      await editor.getByRole('button', { name: 'Create Task', exact: true }).click();
      await editor.waitFor({ state: 'hidden', timeout: 20000 });
      const result = await page.evaluate(projectId => window.electronAPI.getTasks(projectId), projectId);
      assert.equal(result.success, true);
      const task = result.data.find(task => task.title === `File reference UI QA ${theme}`);
      assert.ok(task, 'Actual saved task missing');
      const paths = task.metadata.referencedFiles.map(file => file.path).sort();
      assert.deepEqual(paths, ['alpha.ts', '中文文件.ts'].sort());
      assert.equal(task.status, 'backlog', 'UI-only fixture must not start an executor');
      report.cases.push({ theme, case: 'real-task-reference-persistence', paths, taskId: task.id, status: task.status });
    } finally { await app.close(); }
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: fixture, encoding: 'utf8' }), '', 'Tracked source and unrelated files must stay untouched');
  }
  report.valid = true;
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
