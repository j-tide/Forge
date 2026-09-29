/**
 * Real Electron workspace control walk. Run only when this task owns UI focus.
 * Every interaction records a fresh pre/post DOM and accessibility snapshot.
 * The project, HOME, settings, PTY daemon profile and Git history are disposable.
 * No model account is installed, no production project is opened, no push occurs.
 * Missing prerequisites and conditional controls are reported, never called passed.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect } from '@playwright/test';
import { captureNativeClipboard, restoreNativeClipboard } from './clipboard-fixture-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = await mkdtemp(path.join(tmpdir(), 'forge-workspace-controls-'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(process.env.FORGE_UI_WALK_OUTPUT || path.join(root, `output/playwright/workspace-controls-${runId}`));
const profile = path.join(data, 'profile');
const taskHome = path.join(data, 'home');
const fixture = path.join(data, 'Forge UI fixture');
const newProjectLocation = path.join(data, 'new-project-location');
const executablePath = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const requestedCases = (process.env.FORGE_UI_WALK_CASES || '').split(',').map(name => name.trim()).filter(Boolean);
const stopAfterFailure = process.env.FORGE_UI_WALK_STOP_AFTER_FAILURE !== '0';
const terminalBoundaryFixture = process.env.FORGE_UI_WALK_TERMINAL_BOUNDARIES === '1';
const report = {
  valid: false, completeCoverage: false, recordedAt: new Date().toISOString(), runId,
  platform: process.platform, arch: process.arch, data, fixture, profile,
  scope: 'Aperant-derived preview workspace UI; this does not certify complete online task acceptance',
  realModelCalls: 0, externalWrites: 0, operations: [], cases: [], blocked: [],
  failures: [], screenshots: [], sourceHashes: {}, fixtureSetup: [], inventories: [],
  requestedCases, stopAfterFailure, skippedCases: [], recovery: [], uxFindings: [],
};
const trace = path.join(output, 'operations.jsonl');
report.runnerHash = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
await Promise.all([profile, taskHome, fixture, newProjectLocation, output, path.join(taskHome, '.config')].map(dir => mkdir(dir, { recursive: true })));
await writeFile(path.join(taskHome, '.gitconfig'), '[user]\n\tname = Forge UI QA\n\temail = ui-qa@example.invalid\n[core]\n\thooksPath = /dev/null\n');
await writeFile(trace, '');
await writeFile(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingCompleted: true, language: 'en', theme: 'light', colorTheme: 'forge-glass',
  reduceMotion: true, sentryEnabled: false, autoUpdateEnabled: false,
}));
await mkdir(path.join(fixture, 'src'), { recursive: true });
await writeFile(path.join(fixture, 'README.md'), '# Disposable Forge UI fixture\nNo model calls or external writes.\n');
await writeFile(path.join(fixture, 'package.json'), JSON.stringify({ name: 'forge-ui-fixture', private: true, version: '0.0.0', scripts: { test: 'node --test' } }, null, 2));
await writeFile(path.join(fixture, 'src', 'alpha.ts'), 'export const fixture = true;\n');
await writeFile(path.join(fixture, 'src', '中文文件.ts'), 'export const title = "isolated";\n');
// Reuse a valid repository PNG so browser/native decoding is part of the check.
const png = await readFile(path.join(root, 'apps/desktop/resources/icons/64x64.png'));
await writeFile(path.join(fixture, 'reference.png'), png);
const mcpFailureScript = path.join(data, 'mcp-failure.cjs');
await writeFile(mcpFailureScript, 'process.stderr.write("FORGE_UI_MCP_LOCAL_EXIT_23\\n"); process.exit(23);\n');
const historyDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const fixtureHistoryIds = Array.from({ length: 4 }, (_, index) => `00000000-0000-4000-8000-00000000000${index + 1}`);
if (terminalBoundaryFixture) {
  const today = new Date().toISOString().slice(0, 10);
  const historyTimestamp = new Date().toISOString();
  const sessions = fixtureHistoryIds.map((id, index) => ({ id, title: `Disposable UI shell history ${index + 1}`, cwd: fixture, projectPath: fixture, isCLIMode: false, claudeSessionId: `disposable-ui-placeholder-${index + 1}-not-a-real-cli-session`, outputBuffer: 'DISPOSABLE UI HISTORY FIXTURE. No real CLI/model session exists.\r\n', createdAt: historyTimestamp, lastActiveAt: historyTimestamp, displayOrder: index }));
  const yesterdaySession = { ...sessions[0], id: '00000000-0000-4000-8000-000000000009', title: 'Disposable UI previous-day shell history', createdAt: `${historyDate}T12:00:00.000Z`, lastActiveAt: `${historyDate}T12:00:00.000Z` };
  await mkdir(path.join(profile, 'sessions'), { recursive: true });
  await writeFile(path.join(profile, 'sessions', 'terminals.json'), JSON.stringify({ version: 2, sessionsByDate: { [today]: { [fixture]: sessions }, [historyDate]: { [fixture]: [yesterdaySession] } } }, null, 2));
  report.fixtureSetup.push({ kind: 'explicit-disposable-shell-history-state', path: path.join(profile, 'sessions', 'terminals.json'), sessions: 5, isCLIMode: false, claudeSessionIds: 'Explicit disposable placeholders; no actual CLI history or model session exists', actualCliSessions: 0, actualModelResults: 0, restoreAndInvokeInterceptionRequired: true, productData: false });
}
const fixtureGitOptions = { cwd: fixture, stdio: 'pipe', env: { ...process.env, GIT_CONFIG_GLOBAL: path.join(taskHome, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null' } };
execFileSync('git', ['init', '-b', 'main'], fixtureGitOptions);
execFileSync('git', ['add', '.'], fixtureGitOptions);
execFileSync('git', ['commit', '-m', 'Initialize disposable UI fixture'], fixtureGitOptions);
execFileSync('git', ['branch', 'fixture-alt'], fixtureGitOptions);
execFileSync('git', ['tag', 'v0.0.0'], fixtureGitOptions);
report.fixtureSetup.push({ kind: 'independent-git-fixture', path: fixture, hasRemote: false, productData: false });
for (const file of ['out/main/index.js', 'out/preload/index.mjs', 'out/renderer/index.html']) {
  report.sourceHashes[file] = createHash('sha256').update(await readFile(path.join(root, 'apps/desktop', file))).digest('hex');
}
for (const file of await readdir(path.join(root, 'apps/desktop/out/renderer/assets'))) {
  if (/\.(js|css)$/.test(file)) report.sourceHashes[`out/renderer/assets/${file}`] = createHash('sha256').update(await readFile(path.join(root, 'apps/desktop/out/renderer/assets', file))).digest('hex');
}
const locales = {};
async function t(namespace, key, values = {}) {
  locales[namespace] ??= JSON.parse(await readFile(path.join(root, 'apps/desktop/src/shared/i18n/locales/en', `${namespace}.json`), 'utf8'));
  let value = key.split('.').reduce((current, part) => current?.[part], locales[namespace]);
  assert.equal(typeof value, 'string', `Missing locale ${namespace}:${key}`);
  for (const [name, replacement] of Object.entries(values)) value = value.replaceAll(`{{${name}}}`, String(replacement));
  return value;
}

let app, page, projectId, sequence = 0, currentCase = 'launch';
const covered = new Set();
const seen = new Map();
const controlKey = (item) => `${item.role}|${item.id}|${item.name}`;
async function snapshot() {
  const dom = await page.evaluate(() => {
    const visible = node => !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    const label = node => node.getAttribute('aria-label') ||
      (node.getAttribute('aria-labelledby') || '').split(' ').map(id => document.getElementById(id)?.textContent || '').join(' ').trim() ||
      (node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent?.trim() : '') ||
      node.getAttribute('title') || node.textContent?.trim().replace(/\s+/g, ' ') || node.getAttribute('placeholder') || '';
    const controls = [...document.querySelectorAll('button,a[href],input,textarea,select,[role="button"],[role="combobox"],[role="switch"],[role="checkbox"],[role="radio"],[role="tab"],[role="menuitem"],[role="option"]')]
      .filter(visible).map(node => ({
        tag: node.tagName.toLowerCase(), role: node.getAttribute('role') || (node.tagName === 'BUTTON' ? 'button' : node.tagName === 'TEXTAREA' ? 'textbox' : node.tagName === 'INPUT' ? 'input' : node.tagName.toLowerCase()),
        id: node.id || '', name: label(node).slice(0, 260), disabled: node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true',
        checked: node.getAttribute('aria-checked'), expanded: node.getAttribute('aria-expanded'),
        value: node.type === 'password' ? '[redacted]' : 'value' in node ? String(node.value).slice(0, 500) : undefined,
      }));
    return {
      url: location.href, text: document.querySelector('main')?.innerText?.slice(0, 24000) || document.body.innerText.slice(0, 24000),
      alerts: [...document.querySelectorAll('[role="alert"],[role="alertdialog"]')].filter(visible).map(node => node.innerText.slice(0, 1200)),
      dialogs: [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(visible).map(node => node.innerText.slice(0, 10000)),
      controls, focus: document.activeElement ? label(document.activeElement) : '',
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    };
  });
  dom.aria = await page.locator('body').ariaSnapshot().catch(error => `Unavailable: ${String(error)}`);
  for (const item of dom.controls) seen.set(controlKey(item), { ...item, case: currentCase });
  return dom;
}
async function descriptor(locator) {
  return locator.evaluate(node => ({
    role: node.getAttribute('role') || (node.tagName === 'BUTTON' ? 'button' : node.tagName === 'TEXTAREA' ? 'textbox' : node.tagName === 'INPUT' ? 'input' : node.tagName.toLowerCase()),
    id: node.id || '', name: (node.getAttribute('aria-label') ||
      (node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent?.trim() : '') ||
      node.getAttribute('title') || node.textContent?.trim().replace(/\s+/g, ' ') || node.getAttribute('placeholder') || '').slice(0, 260),
  }));
}
async function action(label, operation, locator, options = {}) {
  const record = { sequence: ++sequence, case: currentCase, label, startedAt: new Date().toISOString(), before: await snapshot() };
  try {
    if (locator) {
      await locator.waitFor({ state: 'visible', timeout: options.timeout || 8000 });
      record.target = await descriptor(locator);
      if (await locator.isDisabled()) {
        record.status = 'blocked-disabled';
        report.blocked.push({ case: currentCase, label, reason: 'Control is disabled in the current genuine fixture state', target: record.target });
        if (options.required) throw new Error(`Required control disabled: ${label}`);
      } else {
        await locator.scrollIntoViewIfNeeded();
        await operation();
        covered.add(controlKey(record.target));
        record.status = 'passed';
      }
    } else { await operation(); record.status = 'passed'; }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (options.assertion && record.status === 'passed') await options.assertion();
  } catch (error) {
    record.status = 'failed'; record.error = String(error);
    report.failures.push({ case: currentCase, label, error: String(error) });
    throw error;
  } finally {
    record.after = await snapshot().catch(error => ({ error: String(error) }));
    record.endedAt = new Date().toISOString();
    report.operations.push({ sequence: record.sequence, case: record.case, label, status: record.status, target: record.target, error: record.error });
    await appendFile(trace, `${JSON.stringify(record)}\n`);
  }
}
const click = (locator, label, options) => action(label, () => locator.click({ timeout: 8000 }), locator, options);
const fill = (locator, value, label, options) => action(label, () => locator.fill(value), locator, options);
const press = (key, label) => action(label, () => page.keyboard.press(key));
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const dialog = () => page.getByRole('dialog').last();
const main = () => page.locator('main');
async function optionalClick(locator, label) {
  if (!await locator.count() || !await locator.first().isVisible()) {
    report.blocked.push({ case: currentCase, label, reason: 'Conditional control is not present in the current genuine fixture state' });
    return false;
  }
  await click(locator.first(), label); return true;
}
async function shot(name) {
  const filename = `${String(sequence).padStart(4, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(output, filename), animations: 'disabled' });
  report.screenshots.push(filename);
}
async function blocked(label, reason) { report.blocked.push({ case: currentCase, label, reason, snapshot: await snapshot() }); }
async function preservingNativeClipboard(label, operation) {
  const saved = await captureNativeClipboard(app);
  if (saved.unsupported.length) {
    await blocked(label, 'The current native clipboard format cannot be faithfully restored; no Copy/Paste or native clipboard write was attempted');
    return false;
  }
  // Delegate real browser clipboard writes and track settlement without logging
  // their payload. A component may start a write without awaiting it; restoration
  // must wait for that write even if a later UI/assertion step fails.
  await page.evaluate(() => {
    const original = navigator.clipboard.writeText;
    const guard = { original, writes: [] };
    window.__forgeNativeClipboardGuard = guard;
    navigator.clipboard.writeText = function (...args) {
      const result = Reflect.apply(original, navigator.clipboard, args);
      guard.writes.push(Promise.resolve(result).then(() => true, () => false));
      return result;
    };
  });
  try { await operation(); return true; }
  finally {
    let settledWrites;
    try {
      settledWrites = await page.evaluate(async () => {
        const guard = window.__forgeNativeClipboardGuard;
        try { return await Promise.all(guard.writes); }
        finally { navigator.clipboard.writeText = guard.original; delete window.__forgeNativeClipboardGuard; }
      });
    } finally {
      // Main remains capable of restoring the native clipboard even if renderer
      // communication fails. An unacknowledged writer settlement still fails the
      // run; never claim the preservation path fully passed in that case.
      await restoreNativeClipboard(app, saved);
      report.fixtureSetup.push({ kind: 'native-clipboard-preservation', case: currentCase, label, writerSettlementConfirmed: !!settledWrites, browserWritesSettled: settledWrites?.length, browserWriteFailures: settledWrites?.filter(value => !value).length, restoredFormatsAndContentsAtVerification: true, originalContentsLogged: false });
    }
  }
}
async function walkWorktreeCopyFeedback(card, expectedPath, label) {
  const copyName = await t('uiWorkspaces', 'worktrees.copyPath');
  const success = await preservingNativeClipboard(`${label} native Copy path`, async () => {
    await click(button(copyName, card), `${label} Copy path with actual native clipboard`);
    await page.getByText(await t('uiWorkspaces', 'worktrees.pathCopied'), { exact: true }).last().waitFor();
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    assert.ok(copied === expectedPath, 'Native worktree copy must match the disposable fixture path');
  });
  report.fixtureSetup.push({ kind: 'worktree-native-copy', label, actualNativeSuccess: success, originalClipboardPayloadLogged: false });
  // This deliberately held and rejected browser transport never writes the OS
  // clipboard. The actual UI button and pending/error/retry pathway are exercised.
  await page.evaluate(() => {
    window.__forgeCopyRefusal = { original: navigator.clipboard.writeText, calls: 0, reject: undefined };
    navigator.clipboard.writeText = () => {
      window.__forgeCopyRefusal.calls += 1;
      return new Promise((_, reject) => { window.__forgeCopyRefusal.reject = reject; });
    };
  });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await click(button(copyName, card), `${label} Copy path controlled refusal attempt ${attempt + 1}`);
      const copying = button(await t('uiWorkspaces', 'worktrees.copyingPath'), card);
      await expect(copying).toBeDisabled();
      await expect(copying).toHaveAttribute('aria-busy', 'true');
      await action(`${label} reject clipboard transport before OS mutation`, () => page.evaluate(() => window.__forgeCopyRefusal.reject(new Error('Disposable UI fixture: native clipboard transport refused before OS mutation'))));
      await page.getByText(await t('uiWorkspaces', 'worktrees.copyFailed'), { exact: true }).last().waitFor();
      await page.getByText(await t('uiWorkspaces', 'worktrees.copyFailureHint'), { exact: true }).last().waitFor();
      await expect(button(copyName, card)).toBeEnabled();
    }
    assert.equal(await page.evaluate(() => window.__forgeCopyRefusal.calls), 2, 'Each actual Copy/retry click must dispatch exactly one refused clipboard Promise');
    await shot(`${label.toLowerCase().replaceAll(' ', '-')}-clipboard-refusal`);
    report.fixtureSetup.push({ kind: 'controlled-clipboard-transport-refusal', label, calls: 2, actualOSWrites: 0, copiedSuccessSimulated: false, originalClipboardPayloadLogged: false });
  } finally {
    await page.evaluate(() => {
      window.__forgeCopyRefusal.reject?.(new Error('Disposable UI fixture cleanup'));
      navigator.clipboard.writeText = window.__forgeCopyRefusal.original;
      delete window.__forgeCopyRefusal;
    });
  }
}
async function walkTabs(scope, prefix) {
  const names = await scope.getByRole('tab').allTextContents();
  for (const name of names) {
    await click(scope.getByRole('tab', { name: name.trim(), exact: true }), `${prefix} tab ${name.trim()}`);
    await shot(`${prefix}-tab-${names.indexOf(name)}`);
  }
}
async function walkSwitches(scope, prefix) {
  const controls = scope.getByRole('switch');
  const count = await controls.count();
  for (let index = 0; index < count; index++) {
    const locator = controls.nth(index);
    if (!await locator.isVisible()) continue;
    if (await locator.isDisabled()) { await click(locator, `${prefix} switch ${index + 1} disabled prerequisite`); continue; }
    const before = await locator.getAttribute('aria-checked');
    await click(locator, `${prefix} switch ${index + 1} toggle`);
    await expect(locator).toBeEnabled({ timeout: 15000 });
    await expect(locator).not.toHaveAttribute('aria-checked', before);
    await click(locator, `${prefix} switch ${index + 1} restore`);
    await expect(locator).toBeEnabled({ timeout: 15000 });
    await expect(locator).toHaveAttribute('aria-checked', before);
  }
}
async function walkCheckboxes(scope, prefix) {
  const controls = scope.getByRole('checkbox');
  for (let index = 0, count = await controls.count(); index < count; index++) {
    const locator = controls.nth(index);
    if (!await locator.isVisible()) continue;
    await click(locator, `${prefix} checkbox ${index + 1} toggle`);
    if (!await locator.isDisabled()) await click(locator, `${prefix} checkbox ${index + 1} restore`);
  }
}
async function walkSelect(locator, prefix) {
  if (!await locator.count() || !await locator.isVisible()) return blocked(prefix, 'Select is conditional and unavailable');
  const wasDisabled = await locator.isDisabled();
  await click(locator, `${prefix} open`);
  // Radix Select marks its trigger aria-hidden while the modal listbox is open;
  // do not resolve an accessibility-role trigger again until the listbox closes.
  if (wasDisabled) return;
  try {
    const options = await page.getByRole('option').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => ({ name: (node.getAttribute('aria-label') || node.innerText).trim().replace(/\s+/g, ' '), disabled: node.getAttribute('aria-disabled') === 'true', selected: node.getAttribute('aria-selected') === 'true' || node.getAttribute('data-state') === 'checked' })));
    if (!options.length) { await press('Escape', `${prefix} close empty options`); return blocked(prefix, 'No options available from real backend'); }
    const search = page.getByRole('searchbox').last();
    if (await search.isVisible()) {
      await fill(search, 'FORGE_UI_WALK_NOT_FOUND', `${prefix} search no matching option`);
      assert.equal(await page.getByRole('option').count(), 0, `${prefix} search must filter unmatched options`);
      await fill(search, '', `${prefix} clear option search`);
    }
    await press('Escape', `${prefix} close initial options`);
    for (const option of options) {
      await click(locator, `${prefix} reopen for ${option.name}`);
      const target = page.getByRole('option', { name: option.name, exact: true }).first();
      await click(target, `${prefix} choose ${option.name}`);
      if (option.disabled) await press('Escape', `${prefix} close disabled option`);
    }
    // Ending every model sweep on Haiku hides the dependent thinking controls.
    // Restore the genuine initial model so the next control remains reachable.
    const originalModel = options.find(option => option.selected && !option.disabled);
    if (originalModel && options.every(option => /^Claude (Opus|Sonnet|Haiku)/.test(option.name)) && options.at(-1)?.name !== originalModel.name) {
      await click(locator, `${prefix} reopen to restore supported initial model`);
      await click(page.getByRole('option', { name: originalModel.name, exact: true }).first(), `${prefix} restore ${originalModel.name}`);
    }
  } finally {
    if (await page.locator('[role="listbox"]:visible').count()) await press('Escape', `${prefix} dismiss remaining listbox`);
  }
}
async function walkSelects(scope, prefix) {
  const list = scope.getByRole('combobox');
  const count = await list.count();
  for (let index = 0; index < count; index++) {
    const locator = list.nth(index);
    if (!await locator.count()) break;
    await walkSelect(locator, `${prefix} select ${index + 1}`);
  }
}
async function closeLayers() {
  const layers = page.locator('[role="dialog"]:visible,[role="alertdialog"]:visible,[role="menu"]:visible,[role="listbox"]:visible');
  for (let iteration = 0; iteration < 8; iteration++) {
    if (!await layers.count()) break;
    const before = await page.locator('body').ariaSnapshot();
    await press('Escape', 'Dismiss transient layer');
    if (await layers.count() && await page.locator('body').ariaSnapshot() === before) {
      const safeDismissal = layers.last().getByRole('button', { name: /^(Cancel|Close|Back|Dismiss)$/ }).first();
      if (await safeDismissal.isVisible() && await safeDismissal.isEnabled()) await click(safeDismissal, 'Dismiss remaining layer through its actual close action');
    }
  }
  assert.equal(await layers.count(), 0, 'Cannot recover a modal layer through normal UI; stop rather than cascade');
  const projectPage = page.locator('section[aria-labelledby="project-settings-page-title"]');
  if (await projectPage.isVisible()) await click(projectPage.getByRole('button', { name: 'Back', exact: true }).first(), 'Close project settings page');
  const applicationPage = page.locator('section[aria-labelledby="settings-page-title"]');
  if (await applicationPage.isVisible()) await click(applicationPage.getByRole('button', { name: 'Back', exact: true }).first(), 'Close application settings page');
}
async function recoverWorkspace() {
  const before = await snapshot();
  await closeLayers();
  if (projectId) {
    const board = page.locator('.forge-glass-sidebar').getByRole('button', { name: await t('navigation', 'items.kanban'), exact: true });
    if (await board.getAttribute('aria-current') !== 'page') await click(board, 'Recover known Kanban workspace');
    await expect(board).toHaveAttribute('aria-current', 'page');
    await page.locator('.forge-glass-board').waitFor({ state: 'visible' });
  }
  report.recovery.push({ case: currentCase, before, after: await snapshot() });
}
async function nav(key) {
  await closeLayers();
  const label = await t('navigation', `items.${key}`);
  const target = page.locator('.forge-glass-sidebar').getByRole('button', { name: label, exact: true });
  await click(target, `Navigate to ${label}`, { required: true });
  await expect(target).toHaveAttribute('aria-current', 'page');
  const state = await snapshot();
  report.inventories.push({ case: currentCase, page: label, controls: state.controls });
  assert.ok(state.scrollWidth <= state.width + 1, `${label} overflows the whole window`);
}
async function segment(name, work) {
  if (name !== 'project-open-and-initialize' && requestedCases.length && !requestedCases.some(selected => name === selected || name.startsWith(selected))) {
    report.skippedCases.push({ name, reason: 'Not selected by FORGE_UI_WALK_CASES; no coverage claimed' });
    return;
  }
  currentCase = name;
  const initialFailures = report.failures.length;
  let failure;
  try { await work(); report.cases.push({ name, status: 'passed', operations: sequence }); }
  catch (error) {
    failure = error;
    if (report.failures.length === initialFailures) report.failures.push({ case: name, error: String(error) });
    report.cases.push({ name, status: 'failed', error: String(error) });
    await shot(`${name}-failure`).catch(() => {});
  } finally {
    try { await recoverWorkspace(); }
    catch (error) {
      report.recoveryError = { case: name, error: String(error), snapshot: await snapshot().catch(() => null) };
      failure ??= error;
      throw error;
    }
    await writeFile(path.join(output, 'evidence.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ segment: name, actions: sequence, failures: report.failures.length, blocked: report.blocked.length }));
  }
  if (failure && stopAfterFailure) throw new Error(`Stopped after ${name}; inspect its first failed action and rerun that scope with FORGE_UI_WALK_CASES. ${String(failure)}`);
}

try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(TOKEN|SECRET|API_KEY|AUTH|COOKIE|CLAUDE|CODEX|OPENAI|ANTHROPIC|GITHUB|GITLAB|AZURE|AWS|GOOGLE|GEMINI|VERTEX|OPENROUTER|ZAI)/i.test(key)));
  Object.assign(env, { HOME: taskHome, CFFIXED_USER_HOME: taskHome, XDG_CONFIG_HOME: path.join(taskHome, '.config'), ZDOTDIR: taskHome, BASH_ENV: '', ENV: '', GIT_CONFIG_GLOBAL: path.join(taskHome, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null', NODE_ENV: 'test', FORGE_GLASS_PREVIEW_USER_DATA_DIR: profile, FORGE_GLASS_PREVIEW_PTY_USER_DATA_DIR: profile, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' });
  app = await electron.launch({ executablePath, args: [path.join(root, 'apps/desktop')], env });
  report.electronPid = app.process().pid;
  await app.firstWindow();
  page = app.windows().find(window => window.url().includes('/renderer/index.html'));
  assert.ok(page, 'Application window missing');
  page.setDefaultTimeout(10000);
  await app.evaluate(({ app: application, BrowserWindow, dialog: nativeDialog, shell, ipcMain }, config) => {
    const { fixturePath, terminalBoundaryFixture: boundaryFixture } = config;
    const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().includes('/renderer/index.html'));
    application.focus({ steal: true }); window?.webContents.closeDevTools(); window?.show(); window?.focus(); window?.webContents.focus();
    globalThis.__forgeUiWalk = { nativePickers: [], externalOpenRequests: [], pickerResponses: [], boundaryCalls: [], ideFailureMode: 'result', heldRestoreIds: [], pendingRestores: [], terminalInputs: [] };
    nativeDialog.showOpenDialog = async (...args) => {
      globalThis.__forgeUiWalk.nativePickers.push(args.map(argument => argument?.title || argument?.properties || typeof argument));
      if (globalThis.__forgeUiWalk.pickerResponses.length) return globalThis.__forgeUiWalk.pickerResponses.shift();
      return { canceled: false, filePaths: [fixturePath] };
    };
    shell.openExternal = async url => { globalThis.__forgeUiWalk.externalOpenRequests.push(url); };
    if (boundaryFixture) {
      // Record Main's actual input boundary, without changing plain-shell behavior.
      // The narrow restoration-failure scope must emit no executor input at all.
      ipcMain.prependListener('terminal:input', (_, id, value) => {
        globalThis.__forgeUiWalk.terminalInputs.push({ id, bytes: Buffer.byteLength(String(value)) });
      });
      for (const channel of ['terminal:invokeClaude', 'terminal:resumeClaude', 'terminal:activateDeferredResume']) {
        ipcMain.removeAllListeners(channel);
        ipcMain.on(channel, (event, ...args) => {
          globalThis.__forgeUiWalk.boundaryCalls.push({ channel, args, outcome: 'simulated transport refusal before command dispatch; no CLI/model invoked' });
          event.sender.send('terminal:output', args[0], '\r\nDISPOSABLE UI BOUNDARY REFUSAL: no CLI/model command was dispatched.\r\n');
          event.sender.send('terminal:claudeExit', args[0]);
        });
      }
      for (const channel of ['terminal:restoreSession', 'terminal:restoreFromDate']) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_, ...args) => {
          globalThis.__forgeUiWalk.boundaryCalls.push({ channel, args, outcome: 'simulated transport refusal before history restore; no PTY/CLI/model restored' });
          if (channel === 'terminal:restoreSession' && globalThis.__forgeUiWalk.heldRestoreIds.includes(args[0]?.id)) {
            return new Promise(resolve => globalThis.__forgeUiWalk.pendingRestores.push({ id: args[0].id, resolve }));
          }
          return { success: false, error: 'Disposable UI fixture: history restore refused before any CLI/model dispatch' };
        });
      }
      ipcMain.removeHandler('task:worktreeOpenInIDE');
      ipcMain.handle('task:worktreeOpenInIDE', (_, ...args) => {
        globalThis.__forgeUiWalk.boundaryCalls.push({ channel: 'task:worktreeOpenInIDE', args, outcome: `simulated ${globalThis.__forgeUiWalk.ideFailureMode} failure; no external editor launched` });
        if (globalThis.__forgeUiWalk.ideFailureMode === 'throw') throw new Error('Disposable UI fixture: editor transport unavailable; no application launched');
        return { success: false, error: 'Disposable UI fixture: configured editor unavailable; no application launched', data: { opened: false } };
      });
    }
  }, { fixturePath: fixture, terminalBoundaryFixture });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.bringToFront();
  await page.locator('.forge-glass-sidebar').waitFor({ timeout: 30000 });
  report.appVersion = await page.evaluate(() => window.electronAPI.getAppVersion());
  report.effectiveUserData = await app.evaluate(({ app: application }) => application.getPath('userData'));
  report.effectiveSystemDirectories = await app.evaluate(({ app: application }) => ({ home: application.getPath('home'), appData: application.getPath('appData'), userData: application.getPath('userData') }));
  assert.equal(report.effectiveUserData, profile, 'Fixture userData isolation failed');
  assert.equal(report.effectiveSystemDirectories.home, taskHome, 'macOS home isolation failed; stop before credential-sensitive controls');
  const providerState = await page.evaluate(() => window.electronAPI.getProviderAccounts());
  assert.ok(providerState.success && providerState.data?.accounts?.length === 0, 'Fixture must have no provider accounts');
  report.providerAccountCount = providerState.data.accounts.length;

  await segment('project-open-and-initialize', async () => {
    await shot('home');
    await click(button('Open Project'), 'Home Open Project');
    await dialog().waitFor();
    await shot('project-picker');
    await click(button('Open existing project folder', dialog()), 'Open existing project folder via native picker');
    await page.waitForFunction(() => !!document.querySelector('.forge-glass-board') || [...document.querySelectorAll('[role="dialog"]')].some(node => /Initialize Forge/.test(node.textContent)));
    assert.ok(await page.locator('[role="dialog"]:visible').count() <= 1, 'Project setup presents overlapping dialogs');
    const initialize = button('Initialize', dialog());
    if (await initialize.count()) {
      await shot('initialize-project');
      await click(initialize, 'Initialize Forge in independent fixture', { required: true });
      await expect(initialize).toBeHidden({ timeout: 30000 });
    } else await optionalClick(button('Initialize Forge', dialog()), 'Initialize Forge');
    // Initialization deliberately offers optional GitHub setup asynchronously.
    // Wait for the settled user entry before operating underlying project controls.
    if (await page.getByRole('heading', { name: 'Connect to GitHub', exact: true }).first().isVisible()) {
      await click(button('Cancel', dialog()), 'Cancel optional GitHub authentication setup');
      await expect(page.getByRole('heading', { name: 'Connect to GitHub', exact: true }).first()).toBeHidden();
    }
    if (await button('Skip for now').count()) await click(button('Skip for now'), 'Skip optional GitHub connection');
    if (await button('Skip for now').count()) await click(button('Skip for now'), 'Skip optional provider connection');
    if (await button('Continue').count()) await click(button('Continue').last(), 'Continue local initialization');
    await page.locator('.forge-glass-board').waitFor({ timeout: 30000 });
    const projects = await page.evaluate(() => window.electronAPI.getProjects());
    assert.equal(projects.success, true); assert.equal(projects.data.length, 1);
    assert.equal(projects.data[0].path, fixture); projectId = projects.data[0].id;
    assert.ok(projects.data[0].autoBuildPath, 'Initialization must be persisted');
    report.projectId = projectId;
    await shot('initialized-board');
  });
  if (!projectId) throw new Error('Real project-opening flow did not finish; dependent workspace paths cannot be claimed walked');

  await segment('project-create-validation-and-native-picker', async () => {
    await click(button('Add project'), 'Open Add Project header action');
    await click(button('Create new project', dialog()), 'Choose Create new project');
    await fill(page.locator('#project-location'), '', 'Clear new project location');
    await click(button('Create Project', dialog()), 'Validate empty new project name');
    await expect(dialog().getByRole('alert')).toHaveText(await t('dialogs', 'addProject.nameRequired'));
    await fill(page.locator('#project-name'), 'Disposable Created Project', 'Fill new project name after validation');
    if (await dialog().getByRole('alert').isVisible()) report.uxFindings.push({ case: currentCase, title: 'New project name error remains after correcting the name', visibleError: await dialog().getByRole('alert').innerText() });
    await click(button('Create Project', dialog()), 'Validate empty new project location');
    await expect(dialog().getByRole('alert')).toHaveText(await t('dialogs', 'addProject.locationRequired'));
    await fill(page.locator('#project-location'), newProjectLocation, 'Fill new project location after validation');
    if (await dialog().getByRole('alert').isVisible()) report.uxFindings.push({ case: currentCase, title: 'New project location error remains after correcting the location', visibleError: await dialog().getByRole('alert').innerText() });
    await app.evaluate(() => globalThis.__forgeUiWalk.pickerResponses.push({ canceled: true, filePaths: [] }));
    await click(button('Browse', dialog()), 'Cancel native new project location picker');
    assert.equal(await page.locator('#project-location').inputValue(), newProjectLocation, 'Cancelled location picker changed the current location');
    await app.evaluate((_, selected) => globalThis.__forgeUiWalk.pickerResponses.push({ canceled: false, filePaths: [selected] }), newProjectLocation);
    await click(button('Browse', dialog()), 'Select independent new project parent through native picker');
    assert.equal(await page.locator('#project-location').inputValue(), newProjectLocation);
    await click(page.locator('#init-git'), 'New project Git initialization off');
    await click(page.locator('#init-git'), 'New project Git initialization on');
    await click(button('Back', dialog()), 'New project form Back');
    await click(button('Create new project', dialog()), 'Return to new project form');
    assert.equal(await page.locator('#project-name').inputValue(), 'Disposable Created Project');
    await click(button('Close', dialog()), 'Close new project draft');
    await click(button('Add project'), 'Reopen Add Project');
    await click(button('Create new project', dialog()), 'Open clean new project draft');
    assert.equal(await page.locator('#project-name').inputValue(), '', 'Reopened new project draft should reset');
    await fill(page.locator('#project-name'), 'UI Created Project', 'Name actual isolated new project');
    await fill(page.locator('#project-location'), newProjectLocation, 'Set actual isolated new project location');
    await shot('new-project-form');
    await click(button('Create Project', dialog()), 'Create real local project folder and Git repository');
    const gitTitle = await t('dialogs', 'gitSetup.title');
    await page.getByRole('heading', { name: gitTitle, exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await page.locator('[role="dialog"]:visible').count(), 1, 'New project Git prerequisite overlaps Forge initialization');
    await click(button(await t('uiIntegrations', 'setup.initializeGit'), dialog()), 'Create real isolated initial Git commit through setup');
    const initTitle = await t('dialogs', 'initialize.title');
    await page.getByRole('heading', { name: initTitle, exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await page.locator('[role="dialog"]:visible').count(), 1, 'New project Forge initialization overlaps Git setup');
    await click(button('Initialize', dialog()), 'Initialize Forge in UI-created project');
    await expect(page.getByRole('heading', { name: initTitle, exact: true })).toBeHidden({ timeout: 30000 });
    if (await page.getByRole('heading', { name: 'Connect to GitHub', exact: true }).first().isVisible()) await click(button('Cancel', dialog()), 'Cancel UI-created project optional GitHub setup');
    await closeLayers();
    const createdPath = path.join(newProjectLocation, 'ui-created-project');
    const projects = await page.evaluate(() => window.electronAPI.getProjects());
    const created = projects.data.find(project => project.path === createdPath);
    assert.ok(created?.autoBuildPath, 'UI-created project initialization did not persist');
    assert.ok(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: createdPath, encoding: 'utf8' }).trim(), 'UI-created Git initial commit missing');
    report.fixtureSetup.push({ kind: 'real-ui-created-project', path: createdPath, initialized: true, productData: false });
    await click(page.getByRole('tab', { name: 'Forge UI fixture', exact: true }), 'Return to original independent fixture project');
  });

  await segment('project-settings-all-sections', async () => {
    const globalBefore = await readFile(path.join(profile, 'settings.json'), 'utf8');
    const gear = page.locator('.forge-glass-project-tabs').getByRole('button', { name: await t('common', 'projectTab.settings'), exact: true });
    await click(gear, 'Open project settings');
    const scope = page.locator('section[aria-labelledby="project-settings-page-title"]');
    await scope.waitFor();
    for (const section of ['general', 'linear', 'github', 'gitlab', 'memory']) {
      await click(scope.locator('nav').getByRole('button', { name: await t('settings', `projectSections.${section}.title`), exact: true }), `Project settings ${section}`);
      await walkSwitches(scope, `Project ${section}`);
      await walkSelects(scope, `Project ${section}`);
      await walkSwitches(scope, `Project ${section} conditional`);
      await shot(`project-settings-${section}`);
      if (section === 'memory') {
        const fields = scope.locator('input:not([type="password"]),textarea');
        for (let index = 0; index < await fields.count(); index++) {
          const field = fields.nth(index);
          if (await field.isVisible() && !await field.isDisabled()) {
            const old = await field.inputValue();
            await fill(field, old, `Memory field ${index + 1} reachable`);
          }
        }
      }
    }
    await click(scope.locator('nav').getByRole('button', { name: await t('settings', 'projectSections.general.title'), exact: true }), 'Return to general settings');
    const firstSwitch = scope.getByRole('switch').first();
    const old = await firstSwitch.getAttribute('aria-checked');
    await click(firstSwitch, 'Change general setting before cancel');
    await click(button('Cancel', scope), 'Cancel project general settings');
    await click(gear, 'Reopen project settings after cancel');
    assert.equal(await scope.getByRole('switch').first().getAttribute('aria-checked'), old, 'Cancelled general state must not persist');
    await click(scope.getByRole('switch').first(), 'Change general setting before save');
    await click(button(await t('settings', 'projectSettings.save'), scope), 'Save project settings');
    await scope.waitFor({ state: 'hidden' });
    await click(gear, 'Reopen project settings after save');
    assert.notEqual(await scope.getByRole('switch').first().getAttribute('aria-checked'), old, 'Saved project state must persist');
    await click(scope.getByRole('switch').first(), 'Restore fixture general setting');
    await click(button(await t('settings', 'projectSettings.save'), scope), 'Save restored project setting');
    assert.equal(await readFile(path.join(profile, 'settings.json'), 'utf8'), globalBefore, 'Project save changed application preferences');
  });

  await segment('task-draft-references-and-options', async () => {
    await nav('kanban');
    await click(button('New Task'), 'Open New Task');
    const scope = dialog(); await scope.waitFor();
    await click(button('Create Task', scope), 'Create Task unavailable before required description');
    await fill(page.locator('#create-description'), 'QA draft for all fields. No model or executor will run. ', 'Fill required task description');
    await fill(page.locator('#create-title'), 'Disposable UI draft A', 'Fill optional task title');
    await optionalClick(button('Browse Files', scope), 'Browse project files');
    await optionalClick(button('Hide Files', scope), 'Hide project files');
    await fill(page.locator('#create-description'), 'QA draft reference @', 'Open file mention autocomplete');
    await page.getByRole('listbox', { name: 'Project Files' }).waitFor();
    await press('ArrowDown', 'File mention keyboard navigation');
    await press('Enter', 'Attach file mention with keyboard');
    await fill(page.locator('#create-description'), `${await page.locator('#create-description').inputValue()} More context for local UI QA.`, 'Extend referenced description');
    const classification = scope.locator('button[aria-controls="create-classification-section"]');
    await click(classification, 'Expand task classification');
    for (const id of ['category', 'priority', 'complexity', 'impact']) await walkSelect(page.locator(`#create-${id}`), `Task ${id}`);
    await walkSelect(scope.getByRole('combobox', { name: await t('settings', 'agentProfile.label'), exact: true }), 'Task agent profile');
    await walkSelects(scope, 'Task visible model configuration');
    const profileSelect = scope.getByRole('combobox', { name: await t('settings', 'agentProfile.label'), exact: true });
    await click(profileSelect, 'Choose preset to reveal task phase configuration');
    await click(page.getByRole('option', { name: /^Balanced/ }), 'Select task balanced preset');
    await click(scope.getByRole('button', { name: new RegExp(`^${await t('settings', 'agentProfile.phaseConfiguration')}`) }), 'Expand task phase configuration');
    const phaseSelects = scope.locator('button[role="combobox"][aria-label]');
    for (let index = 0; index < await phaseSelects.count(); index++) await walkSelect(phaseSelects.nth(index), `Task phase model/thinking ${index + 1}`);
    await click(scope.getByRole('button', { name: new RegExp(`^${await t('settings', 'agentProfile.phaseConfiguration')}`) }), 'Collapse task phase configuration');
    await click(scope.locator('button[aria-controls="git-options-section"]'), 'Expand task Git options');
    await walkSelect(page.locator('#base-branch'), 'Task Git base branch');
    await click(button('On', scope), 'Task automatic branch push off');
    await click(button('Off', scope), 'Task automatic branch push on');
    await click(button('On', scope), 'Leave fixture automatic branch push off');
    await click(scope.locator('button[aria-controls="git-options-section"]'), 'Collapse task Git options');
    await walkCheckboxes(scope, 'Task');
    await walkSwitches(scope, 'Task');
    const imageToggle = scope.locator('button[aria-controls="create-reference-images-section"]');
    await click(imageToggle, 'Expand reference images');
    await action('Paste disposable PNG attachment', async () => {
      await page.locator('#create-description').evaluate((node, base64) => {
        const data = Uint8Array.from(atob(base64), value => value.charCodeAt(0));
        const clipboard = new DataTransfer(); clipboard.items.add(new File([data], 'reference.png', { type: 'image/png' }));
        node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
      }, png.toString('base64'));
    }, page.locator('#create-description'));
    const thumbnail = scope.getByRole('button', { name: /^(screenshot-|pasted-image|reference\.png)/i }).first();
    await thumbnail.waitFor();
    const imageName = await thumbnail.getAttribute('aria-label');
    await click(thumbnail, 'Preview attached PNG');
    await expect.poll(() => page.getByRole('img', { name: imageName, exact: true }).last().evaluate(node => node.complete && node.naturalWidth > 0 && node.naturalHeight > 0)).toBe(true);
    await shot('task-image-preview');
    await click(button('Close preview'), 'Close reference image preview');
    await click(button(`Remove image ${imageName}`, scope), 'Remove reference PNG');
    await optionalClick(scope.getByRole('button', { name: /^Remove reference to / }).first(), 'Remove task file reference');
    await click(button('Capture', scope), 'Open task screenshot capture');
    await shot('task-screen-capture-state');
    await press('Escape', 'Close task screenshot capture');
    await shot('task-options-filled');
    await click(button('Cancel', scope), 'Cancel task into local draft');
    await click(button('New Task'), 'Reopen task draft');
    assert.equal(await page.locator('#create-title').inputValue(), 'Disposable UI draft A', 'Cancel/reopen lost task draft');
    await click(button('Start Fresh', dialog()), 'Discard restored fixture draft');
    assert.equal(await page.locator('#create-title').inputValue(), '');
    await fill(page.locator('#create-description'), 'Independent local draft. Do not start execution.', 'Refill task after clearing draft');
    await fill(page.locator('#create-title'), 'Disposable UI draft A', 'Refill task A title');
    await click(button('Create Task', dialog()), 'Create task A without running');
    await page.getByRole('button', { name: 'Disposable UI draft A', exact: true }).waitFor();
  });

  await segment('task-reference-image-preview-only', async () => {
    await nav('kanban');
    await click(button('New Task'), 'Open task editor for valid image render verification');
    await fill(page.locator('#create-description'), 'Disposable valid PNG rendering check. No task execution.', 'Fill image verification task description');
    const scope = dialog();
    await click(scope.locator('button[aria-controls="create-reference-images-section"]'), 'Expand valid-image reference section');
    await action('Paste valid repository PNG through task clipboard UX', async () => {
      await page.locator('#create-description').evaluate((node, base64) => {
        const data = Uint8Array.from(atob(base64), value => value.charCodeAt(0));
        const clipboard = new DataTransfer(); clipboard.items.add(new File([data], 'valid-reference.png', { type: 'image/png' }));
        node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
      }, png.toString('base64'));
    }, page.locator('#create-description'));
    const thumbnail = scope.getByRole('button', { name: /^screenshot-.*\.png$/ }).first();
    await thumbnail.waitFor();
    const imageName = await thumbnail.getAttribute('aria-label');
    await click(thumbnail, 'Preview valid PNG reference');
    const image = page.getByRole('img', { name: imageName, exact: true }).last();
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0 && node.naturalHeight > 0)).toBe(true);
    report.imageRenderEvidence = await image.evaluate(node => ({ complete: node.complete, width: node.naturalWidth, height: node.naturalHeight }));
    await shot('valid-task-image-preview');
    await click(button('Close preview'), 'Close valid image preview');
    await click(button(`Remove image ${imageName}`, dialog()), 'Remove decoded PNG reference');
    await click(button('Cancel', dialog()), 'Cancel image-verification draft without execution');
  });

  await segment('task-model-thinking-options', async () => {
    await nav('kanban');
    await click(button('New Task'), 'Open task model/thinking dependent controls');
    const scope = dialog();
    const profileSelect = scope.getByRole('combobox', { name: await t('settings', 'agentProfile.label'), exact: true });
    await click(profileSelect, 'Select model/thinking verification profile');
    await click(page.getByRole('option', { name: /^Balanced/ }), 'Use balanced preset for phase thinking controls');
    await click(scope.getByRole('button', { name: new RegExp(`^${await t('settings', 'agentProfile.phaseConfiguration')}`) }), 'Expand model/thinking phase configuration');
    for (let phase = 0; phase < 4; phase++) {
      const controls = scope.locator('button[role="combobox"][aria-label]');
      await click(controls.nth(phase * 2), `Select supported model for phase ${phase + 1}`);
      await click(page.getByRole('option', { name: 'Claude Opus 4.6', exact: true }), `Use Opus for phase ${phase + 1} thinking options`);
      const thinking = controls.nth(phase * 2 + 1);
      await expect(thinking).toBeEnabled();
      await walkSelect(thinking, `Phase ${phase + 1} every thinking level`);
    }
    await shot('task-thinking-supported-model-options');
    await click(button('Cancel', scope), 'Cancel model/thinking verification draft');
  });

  await segment('task-details-edit-delete-and-bulk', async () => {
    await nav('kanban');
    if (!await button('Disposable UI draft A').count()) {
      await click(button('New Task'), 'Create fallback local task A');
      await fill(page.locator('#create-description'), 'Disposable local task details, no model.', 'Fallback description');
      await fill(page.locator('#create-title'), 'Disposable UI draft A', 'Fallback title');
      await click(button('Create Task', dialog()), 'Save fallback local task A');
    }
    await click(button('Disposable UI draft A'), 'Open local task details');
    await walkTabs(dialog(), 'task-details');
    const logs = dialog().getByRole('tab', { name: 'Logs', exact: true });
    await click(logs, 'Inspect task Logs');
    for (const phase of ['Planning', 'Coding', 'QA']) await optionalClick(dialog().getByRole('button', { name: new RegExp(phase, 'i') }), `Task log expand ${phase}`);
    await blocked('Task live execution/review/recovery branches', 'No authorized model account or executed run exists; no synthetic success/review state was seeded');
    await click(button('Edit task', dialog()), 'Open task edit');
    await fill(page.locator('#edit-title'), 'Disposable UI draft A edited', 'Edit title');
    await fill(page.locator('#edit-description'), 'Edited local-only description. No executor runs.', 'Edit description');
    await walkSelects(dialog(), 'Task edit options');
    await click(button('Save Changes', dialog()), 'Save task edit');
    await page.getByRole('heading', { name: 'Disposable UI draft A edited', exact: true }).waitFor();
    await click(button('Delete', dialog()), 'Request task delete');
    await click(page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }), 'Cancel local task deletion');
    await click(button('Close', dialog()).last(), 'Close local task details');
    await click(button('New Task'), 'Create disposable task B');
    await fill(page.locator('#create-description'), 'Second disposable local draft for bulk selection and deletion.', 'Task B description');
    await fill(page.locator('#create-title'), 'Disposable UI draft B', 'Task B title');
    await click(button('Create Task', dialog()), 'Save task B');
    const selects = page.getByRole('checkbox', { name: /Select task:/ });
    await selects.first().waitFor();
    await click(selects.first(), 'Select one task');
    await click(button('Clear Selection'), 'Clear one selected task');
    await click(page.getByRole('checkbox', { name: 'Select all', exact: true }).first(), 'Select all local backlog tasks');
    await click(button('Delete').last(), 'Open bulk task deletion');
    await click(page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }), 'Cancel bulk task deletion');
    await click(button('Clear Selection'), 'Clear bulk selection');
    await click(button('Disposable UI draft B'), 'Open task B for actual local delete');
    await click(button('Delete', dialog()), 'Delete fixture task B');
    await click(page.getByRole('alertdialog').getByRole('button', { name: 'Delete Permanently', exact: true }), 'Confirm actual fixture-only task deletion');
    await button('Disposable UI draft B').waitFor({ state: 'hidden' });
    const tasks = await page.evaluate(id => window.electronAPI.getTasks(id, { forceRefresh: true }), projectId);
    assert.ok(tasks.success && tasks.data.every(task => task.status === 'backlog'), 'Creating/editing local tasks must never auto-run');
    report.taskState = tasks.data.map(task => ({ id: task.id, title: task.title, status: task.status }));
  });

  await segment('board-columns-and-queue', async () => {
    await nav('kanban');
    const board = page.locator('.forge-glass-board');
    const collapseCount = await board.getByRole('button', { name: 'Collapse column', exact: true }).count();
    assert.ok(collapseCount >= 5, 'Expected every confirmed board column');
    for (let index = 0; index < collapseCount; index++) {
      await click(board.getByRole('button', { name: 'Collapse column', exact: true }).nth(index), `Collapse column ${index + 1}`);
      await click(board.getByRole('button', { name: 'Expand column', exact: true }).first(), `Expand column ${index + 1}`);
      const lock = board.getByRole('button', { name: 'Lock column width', exact: true }).nth(index);
      await click(lock, `Lock column ${index + 1}`);
      await click(board.getByRole('button', { name: 'Unlock column width', exact: true }).first(), `Unlock column ${index + 1}`);
    }
    const handles = board.getByRole('separator');
    for (let index = 0; index < await handles.count(); index++) {
      await action(`Keyboard resize column ${index + 1}`, async () => { await handles.nth(index).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); }, handles.nth(index));
    }
    for (let index = 0; index < await board.getByRole('checkbox', { name: 'Select all', exact: true }).count(); index++) {
      await click(board.getByRole('checkbox', { name: 'Select all', exact: true }).nth(index), `Column ${index + 1} Select all`);
      await optionalClick(button('Clear Selection'), `Column ${index + 1} Clear selection`);
    }
    const right = button('Scroll columns right', board), left = button('Scroll columns left', board);
    for (let index = 0; index < 8 && !await right.isDisabled(); index++) await click(right, `Board scroll right ${index + 1}`);
    await shot('last-board-columns');
    for (let index = 0; index < 8 && !await left.isDisabled(); index++) await click(left, `Board scroll left ${index + 1}`);
    await click(button('Refresh Tasks', board), 'Refresh actual task list');
    await click(button('Queue Settings', board), 'Open queue settings');
    await fill(page.locator('#maxParallel'), '0', 'Queue limit lower boundary');
    await click(button('Save', dialog()), 'Queue invalid lower bound save');
    await dialog().getByText('Must be at least 1', { exact: true }).waitFor();
    await fill(page.locator('#maxParallel'), '11', 'Queue limit upper boundary');
    await click(button('Save', dialog()), 'Queue invalid upper bound save');
    await fill(page.locator('#maxParallel'), '2', 'Queue valid parallel limit');
    await click(button('Cancel', dialog()), 'Cancel queue setting change');
    await click(button('Queue Settings', board), 'Reopen queue settings');
    await fill(page.locator('#maxParallel'), '2', 'Queue saved parallel limit');
    await click(button('Save', dialog()), 'Save queue settings');
    await click(button('Queue Settings', board), 'Verify saved queue settings');
    assert.equal(await page.locator('#maxParallel').inputValue(), '2');
    await click(button('Cancel', dialog()), 'Close queue settings verification');
    await blocked('Add All to Queue / Start task', 'No account is configured; starting execution would exceed this UI control fixture scope');
    await optionalClick(button('Archive all done tasks', board), 'Archive all done tasks (empty fixture)');
  });

  await segment('context-tabs-search-refresh', async () => {
    await nav('context');
    await walkTabs(main(), 'context');
    for (const label of ['Project Index', 'Project Structure']) if (await page.getByRole('tab', { name: label, exact: true }).count()) await click(page.getByRole('tab', { name: label, exact: true }), 'Open project index');
    await optionalClick(button('Analyze Project', main()), 'Analyze real local fixture project');
    await optionalClick(button('Refresh', main()), 'Refresh project structure');
    await shot('context-project-index');
    await optionalClick(page.getByRole('tab', { name: /Memories/ }), 'Open context Memories tab');
    const search = main().getByRole('textbox').first();
    if (await search.count()) await fill(search, 'fixture query', 'Search memories query');
    await optionalClick(button('Search memories', main()), 'Search memories with actual unavailable backend');
    for (const filter of ['all', 'patterns', 'errors', 'decisions', 'insights', 'calibration']) {
      await optionalClick(button(await t('common', `memory.filters.${filter}`), main()), `Context memory filter ${filter}`);
    }
    await walkSelects(main(), 'Context memory filters');
    await optionalClick(button('Show all memories', main()), 'Show all memory records');
    await optionalClick(button('Retry', main()), 'Retry memory backend');
    await shot('context-memory-backend');
  });

  await segment('mcp-custom-server-all-controls', async () => {
    await nav('agentTools');
    await walkSwitches(main(), 'MCP project enable');
    await click(button('Add Custom Server', main()), 'Add custom MCP server');
    await fill(page.locator('#name'), 'Disposable Failed MCP', 'MCP server name');
    await fill(page.locator('#description'), 'Disposable local process exit; never install packages or call networks.', 'MCP description');
    await click(page.locator('#type-http'), 'MCP HTTP transport option');
    await fill(page.locator('#url'), 'http://127.0.0.1:9/mcp', 'MCP unavailable local HTTP URL');
    await fill(page.locator('#bearerToken'), 'fixture-invalid-token', 'MCP dummy auth token');
    await click(dialog().getByRole('button', { name: /Additional Headers/ }), 'MCP advanced headers');
    await fill(dialog().getByPlaceholder('Header Name'), 'X-Forge-Fixture', 'MCP header name');
    await fill(dialog().getByPlaceholder('Header Value'), 'ui-walk', 'MCP header value');
    await click(button('Add', dialog()), 'MCP add custom header');
    await click(button('Remove X-Forge-Fixture', dialog()), 'MCP remove custom header');
    await click(page.locator('#type-command'), 'MCP command transport option');
    await fill(page.locator('#command'), 'node', 'MCP safe allowlisted local Node command');
    await fill(page.locator('#args'), mcpFailureScript, 'MCP deterministic local failure script argument');
    await shot('mcp-new-command-form');
    await click(button('Add Server', dialog()), 'Save local MCP fixture server');
    await page.getByText('Disposable Failed MCP', { exact: true }).first().waitFor();
    const card = main().locator('div.group').filter({ has: page.getByText('Disposable Failed MCP', { exact: true }) }).last();
    await click(card.getByRole('button', { name: 'Test', exact: true }), 'Test real local failing MCP connection');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(node => node.textContent.trim() === 'Test' && !node.disabled), undefined, { timeout: 30000 });
    await expect(card.getByText('Server exited with code 23', { exact: true })).toBeVisible();
    report.mcpFailureEvidence = await card.innerText();
    await shot('mcp-test-failure');
    await click(card.getByRole('button', { name: 'Edit', exact: true }), 'Edit custom MCP server');
    await fill(page.locator('#description'), 'Updated local test fixture', 'Edit MCP description');
    await click(button('Cancel', dialog()), 'Cancel MCP edit');
    await click(card.getByRole('button', { name: 'Edit', exact: true }), 'Reopen MCP edit');
    await fill(page.locator('#description'), 'Updated local test fixture', 'Save MCP edited description');
    await click(button('Save', dialog()), 'Save MCP edit');
    const agentCategories = {
      spec: ['spec_gatherer', 'spec_researcher', 'spec_writer', 'spec_critic', 'spec_discovery', 'spec_context', 'spec_validation'],
      build: ['planner', 'coder'], qa: ['qa_reviewer', 'qa_fixer'],
      utility: ['pr_reviewer', 'commit_message', 'merge_resolver', 'insights', 'analysis', 'batch_analysis', 'pr_template_filler'],
      ideation: ['ideation', 'roadmap_discovery'],
    };
    for (const category of Object.keys(agentCategories)) {
      const label = await t('uiAgentTools', `categories.${category}`);
      const header = main().getByRole('button', { name: new RegExp(`^${label}`) }).first();
      if (!await header.count()) { await blocked(`MCP category ${label}`, 'Category header unavailable'); continue; }
      await click(header, `MCP expand category ${label}`);
      await click(header, `MCP restore category ${label}`);
      const firstAgentLabel = await t('uiAgentTools', `agents.${agentCategories[category][0]}.name`);
      if (!await main().getByRole('button').filter({ has: page.getByRole('heading', { name: firstAgentLabel, exact: true, level: 3 }) }).count()) await click(header, `MCP reveal category ${label} agents`);
      for (const id of agentCategories[category]) {
        const agentLabel = await t('uiAgentTools', `agents.${id}.name`);
        const agentHeader = main().getByRole('button').filter({ has: page.getByRole('heading', { name: agentLabel, exact: true, level: 3 }) }).first();
        await click(agentHeader, `Expand MCP agent ${agentLabel}`);
        const localCard = agentHeader.locator('..');
        const removals = await localCard.locator('button[title="Remove"]').count();
        for (let index = 0; index < removals; index++) {
          await click(localCard.locator('button[title="Remove"]').nth(index), `${agentLabel} remove MCP ${index + 1}`);
          await expect(localCard.locator('button[title="Restore"]').first()).toBeEnabled({ timeout: 15000 });
          await click(localCard.locator('button[title="Restore"]').first(), `${agentLabel} restore MCP ${index + 1}`);
        }
        if (await button('Add Server', localCard).count()) {
          await click(button('Add Server', localCard), `${agentLabel} open stage assignment dialog`);
          await press('Escape', `${agentLabel} cancel stage assignment`);
        }
        await click(agentHeader, `Collapse MCP agent ${agentLabel}`);
      }
    }
    const agentName = await t('uiAgentTools', 'agents.spec_gatherer.name');
    const agent = main().getByRole('button', { name: new RegExp(`^${agentName}`) }).first();
    await click(agent, 'Expand actual agent tool assignment');
    const agentCard = agent.locator('..');
    await click(button('Add Server', agentCard), 'Open stage MCP assignment');
    await click(dialog().getByRole('button', { name: /Disposable Failed MCP/ }), 'Assign local custom MCP to stage');
    await optionalClick(agentCard.locator('button[title="Remove"]').last(), 'Remove stage custom MCP assignment');
    await click(agent, 'Collapse agent tool assignment');
    await click(card.getByRole('button', { name: 'Delete', exact: true }), 'Delete local MCP fixture server');
    await page.getByText('Disposable Failed MCP', { exact: true }).waitFor({ state: 'hidden' });
  });

  await segment('insights-no-account-and-history', async () => {
    await nav('insights');
    for (const key of ['architectureQuestion', 'qualityQuestion', 'featuresQuestion', 'securityQuestion']) {
      const suggestion = await t('uiKnowledgeContext', key);
      await click(button(suggestion, main()), `Insights suggestion ${key}`);
      assert.equal(await main().getByPlaceholder('Ask about your codebase...').inputValue(), suggestion);
    }
    await optionalClick(main().locator('button[title="Hide sidebar"]'), 'Hide Insights history sidebar');
    await optionalClick(main().locator('button[title="Show sidebar"]'), 'Show Insights history sidebar');
    const model = main().locator('button[title^="Model:"]');
    await click(model, 'Open Insights model profiles');
    const items = (await page.getByRole('menuitem').allInnerTexts()).map(name => name.trim().replace(/\s+/g, ' '));
    await press('Escape', 'Close initial Insights profile menu');
    for (const name of items) {
      await click(model, `Reopen Insights profile menu ${name.trim()}`);
      await click(page.getByRole('menuitem', { name: name.trim(), exact: true }), `Choose Insights profile ${name.trim()}`);
      if (await dialog().count() && await dialog().isVisible()) {
        await walkSelects(dialog(), 'Insights custom model');
        await click(button('Cancel', dialog()), 'Cancel Insights custom model');
      }
    }
    await fill(main().getByRole('textbox').last(), 'Confirm the no-account failure is visible. This request must never reach a model.', 'Insights no-account question');
    await click(button('Send message', main()), 'Submit Insights with clean isolated HOME and no model account');
    await main().getByRole('alert').waitFor({ timeout: 30000 });
    const noAccountError = await main().getByRole('alert').innerText();
    assert.ok(noAccountError.includes(await t('uiKnowledgeContext', 'generationErrors.auth-required')), 'Insights must display localized account-readiness guidance before any model executor');
    report.insightsNoAccountError = noAccountError;
    if (/apiKey.*parameter|environment variable/i.test(noAccountError)) report.uxFindings.push({ case: currentCase, title: 'Insights exposes SDK credential instructions instead of account setup guidance', visibleError: noAccountError, recommendation: 'Check model readiness before the executor and link the user to normal account configuration' });
    await shot('insights-no-account-error');
    await click(button(await t('uiKnowledgeContext', 'configureAccount'), main().getByRole('alert')), 'Insights no-account guidance opens account settings');
    const accountSettings = page.locator('section[aria-labelledby="settings-page-title"]');
    await accountSettings.waitFor();
    assert.equal(await accountSettings.locator('nav button[aria-current="page"]').innerText(), await t('settings', 'sections.accounts.title'), 'Insights readiness action must select Accounts settings');
    await shot('insights-account-settings-guidance');
    await click(button('Back', accountSettings).first(), 'Back to Insights after account-readiness guidance');
    await main().getByPlaceholder('Ask about your codebase...').waitFor();
    // Real local storage API creates empty, explicitly named fixture conversations.
    // No conversation messages or assistant results are fabricated.
    report.fixtureSetup.push({ kind: 'local-empty-insights-history', purpose: 'Exercise rename/archive/delete menus only', productData: false, fabricatedMessages: 0 });
    const sessions = await page.evaluate(async id => {
      const result = [];
      for (let index = 0; index < 3; index++) {
        const created = await window.electronAPI.newInsightsSession(id);
        if (!created.success || !created.data) throw new Error(created.error || 'Session fixture failed');
        const renamed = await window.electronAPI.renameInsightsSession(id, created.data.id, `UI fixture conversation ${index + 1}`);
        if (!renamed.success) throw new Error(renamed.error || 'Session fixture rename failed');
        result.push(created.data.id);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return result;
    }, projectId);
    report.fixtureHistoryIds = sessions;
    await nav('kanban'); await nav('insights');
    const historyRow = name => main().locator('div[role="button"]').filter({ has: page.getByText(name, { exact: true }) }).first();
    await historyRow('UI fixture conversation 1').waitFor();
    await click(historyRow('UI fixture conversation 1'), 'Switch real local fixture conversation');
    const row = historyRow('UI fixture conversation 1');
    await click(row.getByRole('button', { name: 'More options', exact: true }), 'Open conversation options');
    await click(page.getByRole('menuitem', { name: 'Rename', exact: true }), 'Rename conversation menu action');
    await fill(main().locator('input').first(), 'UI fixture renamed', 'Edit local conversation title');
    await click(button('Cancel', main()), 'Cancel conversation rename');
    await click(row.getByRole('button', { name: 'More options', exact: true }), 'Reopen conversation options');
    await click(page.getByRole('menuitem', { name: 'Rename', exact: true }), 'Reopen rename conversation');
    await fill(main().locator('input').first(), 'UI fixture renamed', 'Save local conversation title');
    await click(button('Save', main()), 'Save conversation rename');
    await click(button('Select', main()), 'Enter history multi-select');
    await click(button('Select all', main()), 'Select all history fixtures');
    await click(button('Clear selection', main()), 'Clear history fixture selection');
    await click(button('Done', main()), 'Exit history multi-select');
    await click(historyRow('UI fixture renamed').getByRole('button', { name: 'More options', exact: true }), 'Open renamed conversation menu');
    await click(page.getByRole('menuitem', { name: 'Archive', exact: true }), 'Archive fixture history');
    await optionalClick(button('Show Archived', main()), 'Show archived conversation filter');
    await optionalClick(historyRow('UI fixture renamed'), 'Open archived fixture conversation');
    if (await historyRow('UI fixture renamed').count()) {
      await click(historyRow('UI fixture renamed').getByRole('button', { name: 'More options', exact: true }), 'Open archived conversation menu');
      await click(page.getByRole('menuitem', { name: 'Unarchive', exact: true }), 'Unarchive local conversation');
    }
    await optionalClick(button('Hide Archived', main()), 'Hide archived conversation filter');
    await click(historyRow('UI fixture conversation 2').getByRole('button', { name: 'More options', exact: true }), 'Open fixture conversation delete menu');
    await click(page.getByRole('menuitem', { name: 'Delete', exact: true }), 'Delete history menu action');
    await click(page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }), 'Cancel local conversation deletion');
    await click(button('New Chat', main()), 'Create new conversation through normal UI');
    await shot('insights-history-controls');
  });

  await segment('roadmap-and-ideation-empty-controls', async () => {
    await nav('roadmap');
    await shot('roadmap-empty');
    await click(button(await t('uiKnowledge', 'generate'), main()), 'Roadmap empty-state generate action');
    if (await page.getByRole('alertdialog').isVisible()) {
      await shot('roadmap-generation-options');
      await click(button(await t('dialogs', 'competitorAnalysis.addKnownCompetitors'), page.getByRole('alertdialog')), 'Open manual competitor form');
      const texts = dialog().getByRole('textbox');
      for (let index = 0; index < await texts.count(); index++) await fill(texts.nth(index), index === 1 ? 'https://example.invalid' : 'Disposable manual competitor', `Manual competitor field ${index + 1}`);
      await walkSelects(dialog(), 'Manual competitor relevance');
      await click(button('Cancel', dialog()), 'Cancel manual competitor form');
      await click(button(await t('dialogs', 'competitorAnalysis.skipAnalysis'), page.getByRole('alertdialog')), 'Roadmap no-account generation without web analysis');
      await page.waitForFunction(() => /No account|No provider|account.*config|provider.*config|API key|authentication|not.*configured/i.test(document.body.innerText), undefined, { timeout: 30000 });
      await shot('roadmap-no-account-result');
      await closeLayers();
    }
    await blocked('Roadmap feature details, conversion and delete branches', 'No real generated roadmap is available without account; feature results were not fabricated');
    await nav('ideation');
    await walkSwitches(main(), 'Ideation enabled category');
    await click(button(await t('uiKnowledgeIdeas', 'configure'), main()), 'Open ideation configuration');
    await walkSwitches(dialog(), 'Ideation configuration');
    await walkSelects(dialog(), 'Ideation configuration');
    await walkCheckboxes(dialog(), 'Ideation configuration');
    await shot('ideation-configuration');
    await click(button('Close', dialog()).first(), 'Close ideation configuration footer');
    await click(button(await t('uiKnowledgeIdeas', 'configure'), main()), 'Reopen ideation configuration');
    await click(button('Close', dialog()).last(), 'Close ideation configuration header');
    await closeLayers();
    await click(button(await t('uiKnowledgeIdeas', 'generate'), main()), 'Ideation no-account generation preflight');
    await shot('ideation-no-account-result');
    await blocked('Ideation generated results, regenerate, dismiss and conversion branches', 'No configured model account; no generated ideas were fabricated');
  });

  await segment('changelog-git-filters-and-generation-options', async () => {
    await nav('changelog');
    await click(button('Refresh', main()), 'Refresh changelog sources');
    await optionalClick(button('Select All', main()), 'Changelog select all completed tasks (empty)');
    await optionalClick(button('Clear', main()), 'Changelog clear task selection');
    const radios = main().getByRole('radio');
    for (let index = 0, count = await radios.count(); index < count; index++) {
      await click(radios.nth(index), `Changelog source mode ${index + 1}`);
      await walkSelects(main(), `Changelog source ${index + 1}`);
      await walkCheckboxes(main(), `Changelog source ${index + 1}`);
      await shot(`changelog-source-${index + 1}`);
    }
    await click(main().getByRole('radio').nth(1), 'Select real local Git history source');
    // History type options may reveal tag/date/count inputs. Revisit each option.
    const history = main().getByRole('combobox').first();
    await click(history, 'Open changelog history filter');
    const historyOptions = await page.getByRole('option').allTextContents();
    await press('Escape', 'Close changelog history options');
    for (const name of historyOptions) {
      await click(history, `Changelog history filter ${name.trim()}`);
      await click(page.getByRole('option', { name: name.trim(), exact: true }), `Choose changelog history ${name.trim()}`);
      await walkSelects(main(), `Changelog ${name.trim()} options`);
      const inputs = main().locator('input');
      for (let index = 0; index < await inputs.count(); index++) {
        const input = inputs.nth(index); if (!await input.isVisible() || await input.isDisabled()) continue;
        const type = await input.getAttribute('type');
        await fill(input, type === 'number' ? '5' : type === 'date' ? '2026-01-01' : '0.0.0', `Changelog ${name.trim()} field ${index + 1}`);
      }
    }
    await click(history, 'Choose recent commits for real fixture preview');
    await click(page.getByRole('option', { name: /Recent.*commits/i }), 'Changelog recent commits');
    await click(button('Load Commits', main()), 'Load actual disposable Git history preview');
    const continueWithCommits = main().getByRole('button', { name: /^Continue(?: |$)/ });
    await continueWithCommits.waitFor();
    await click(continueWithCommits, 'Continue changelog with real commit source');
    await fill(page.locator('#version'), '0.0.1', 'Changelog version');
    await fill(page.locator('#date'), '2026-09-28', 'Changelog date');
    await walkSelects(main(), 'Changelog output configuration');
    await optionalClick(main().getByRole('button', { name: /Advanced/ }), 'Changelog advanced configuration');
    const textarea = main().locator('textarea').first();
    if (await textarea.count() && await textarea.isVisible()) await fill(textarea, 'No remote release. Disposable fixture validation only.', 'Changelog custom instructions');
    await shot('changelog-generation-options');
    await click(main().getByRole('button', { name: /Generate Changelog/ }).last(), 'Changelog no-account generation preflight');
    await shot('changelog-no-account-result');
    await optionalClick(button('Back to Selection', main()), 'Back from changelog generation');
    await blocked('Generated changelog save/release/archive branches', 'No model result or authorized external release; no generated text was fabricated');
  });

  await segment('terminals-real-shell-and-worktree', async () => {
    await nav('worktrees');
    await click(button('Refresh', main()), 'Refresh empty worktree list');
    await shot('worktrees-empty');
    await nav('terminals');
    await page.evaluate(() => {
      window.__forgeUiTerminalOutput = [];
      window.__forgeUiTerminalExit = [];
      window.__forgeUiTerminalUnsub = window.electronAPI.onTerminalOutput((id, data) => window.__forgeUiTerminalOutput.push({ id, data }));
      window.__forgeUiTerminalExitUnsub = window.electronAPI.onTerminalExit((id, exitCode) => window.__forgeUiTerminalExit.push({ id, exitCode }));
    });
    await click(button('New Terminal', main()), 'Create real local shell terminal');
    await page.locator('.xterm-screen').first().waitFor({ timeout: 30000 });
    const terminal = page.locator('.xterm').first();
    await click(terminal, 'Focus actual shell terminal');
    await action('Run local echo through terminal keyboard', async () => { await page.keyboard.type('echo FORGE_UI_WALK_REAL_SHELL'); await page.keyboard.press('Enter'); }, terminal);
    await page.waitForFunction(() => window.__forgeUiTerminalOutput.some(item => item.data.includes('FORGE_UI_WALK_REAL_SHELL')), undefined, { timeout: 15000 });
    await action('Run interruptible local shell command', async () => { await page.keyboard.type('sleep 20'); await page.keyboard.press('Enter'); }, terminal);
    await press('Control+C', 'Interrupt actual shell process');
    await preservingNativeClipboard('Terminal native clipboard paste and copy', async () => {
      await app.evaluate(({ clipboard }) => clipboard.writeText('echo FORGE_UI_WALK_PASTE'));
      await click(terminal, 'Focus terminal before paste');
      await press('Meta+V', 'Paste real clipboard command into terminal');
      await press('Enter', 'Execute local pasted echo command');
      await page.waitForFunction(() => window.__forgeUiTerminalOutput.some(item => item.data.includes('FORGE_UI_WALK_PASTE')), undefined, { timeout: 15000 });
      await press('Meta+C', 'Terminal copy keyboard pathway');
      report.fixtureSetup.push({ kind: 'clipboard', value: 'echo FORGE_UI_WALK_PASTE', productData: false });
    });
    const title = main().locator('span.cursor-text').first();
    await action('Open terminal rename via double click', () => title.dblclick(), title);
    await fill(page.getByRole('textbox', { name: 'Terminal name', exact: true }), 'UI Fixture Shell', 'Rename shell terminal');
    await press('Enter', 'Save terminal rename');
    await click(main().locator('button[title^="Expand terminal"]').first(), 'Expand shell terminal');
    await click(main().locator('button[title^="Collapse terminal"]').first(), 'Collapse shell terminal');
    await click(button('Files', main()), 'Open terminal file browser');
    await optionalClick(main().getByRole('button', { name: /src/ }).first(), 'Expand source folder in terminal files');
    await optionalClick(main().getByText('alpha.ts', { exact: true }).first(), 'Select drag-only fixture file row');
    await optionalClick(main().getByRole('button', { name: 'Collapse src folder', exact: true }), 'Collapse source folder in terminal files');
    await optionalClick(main().getByRole('button', { name: 'Expand src folder', exact: true }), 'Reopen source folder in terminal files');
    await click(button('Files', main()), 'Close terminal file browser');
    await shot('terminal-shell-controls');
    await click(main().getByRole('button', { name: 'Worktree', exact: true }).first(), 'Open terminal worktree selector');
    const search = page.getByPlaceholder('Search worktrees...');
    await fill(search, 'no-such-ui-fixture', 'Worktree selector empty search');
    await fill(search, '', 'Clear worktree search');
    await click(button('New Worktree'), 'Open new terminal worktree form');
    await fill(page.locator('#worktree-name'), 'UI Fixture Tree', 'Worktree sanitized name');
    await walkSelects(dialog(), 'Worktree task and branch options');
    await walkSwitches(dialog(), 'Worktree branch option');
    await click(button('Cancel', dialog()), 'Cancel terminal worktree form');
    await click(main().getByRole('button', { name: 'Worktree', exact: true }).first(), 'Reopen terminal worktree selector');
    await click(button('New Worktree'), 'Reopen worktree create form');
    await fill(page.locator('#worktree-name'), 'ui-fixture-tree', 'Worktree final name');
    await click(button('Create', dialog()), 'Create real Git terminal worktree in independent fixture');
    await dialog().waitFor({ state: 'hidden', timeout: 30000 });
    await nav('worktrees');
    const worktreeHeading = main().getByRole('heading', { name: 'ui-fixture-tree', exact: true, level: 3 });
    await worktreeHeading.waitFor();
    await shot('real-terminal-worktree');
    await click(button('Select', main()), 'Enter worktree selection mode');
    await click(button('Select All', main()), 'Select all actual fixture worktrees');
    await click(button('Delete', main()).first(), 'Open bulk worktree delete confirmation');
    await click(page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }), 'Cancel bulk worktree deletion');
    await click(button('Clear Selection', main()), 'Clear selected fixture worktree');
    await click(button('Done', main()), 'Exit worktree selection mode');
    await preservingNativeClipboard('Worktree native Copy path', async () => {
      await click(button('Copy path', main()).first(), 'Copy real worktree path');
      const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
      assert.ok(copied.startsWith(fixture), 'Copied worktree path escapes independent fixture');
    });
    const worktreeCard = main().locator('.forge-card').filter({ has: page.getByRole('heading', { name: 'ui-fixture-tree', exact: true, level: 3 }) }).last();
    await click(button('Delete', worktreeCard), 'Open real worktree deletion');
    await click(page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }), 'Cancel real worktree deletion');
    await click(button('Delete', worktreeCard), 'Reopen real worktree deletion');
    await click(page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }), 'Delete actual fixture worktree and branch');
    await worktreeHeading.waitFor({ state: 'hidden', timeout: 30000 });
    assert.ok(!execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: fixture, encoding: 'utf8' }).includes('ui-fixture-tree'), 'Worktree must actually disappear from Git');
    await nav('terminals');
    await click(main().locator('button[title^="Close ("]').first(), 'Close actual shell terminal');
    await page.waitForFunction(() => window.__forgeUiTerminalExit.length > 0, undefined, { timeout: 15000 });
    report.terminalEvidence = await page.evaluate(() => ({ outputs: window.__forgeUiTerminalOutput, exits: window.__forgeUiTerminalExit }));
    await page.evaluate(() => { window.__forgeUiTerminalUnsub(); window.__forgeUiTerminalExitUnsub(); });
    await blocked('Invoke Claude, Resume Claude, terminal model identity', 'No model/CLI invocation is authorized by this no-credential UI fixture');
  });

  await segment('terminal-contrast', async () => {
    if (!terminalBoundaryFixture) return blocked('Terminal normal-state text contrast', 'Enable FORGE_UI_WALK_TERMINAL_BOUNDARIES=1 for disposable histories with explicit pre-dispatch restoration refusal');
    report.terminalContrastEvidence = [];
    for (const mode of ['light', 'dark']) {
      await click(page.locator('.forge-glass-sidebar').getByRole('button', { name: await t('settings', 'title'), exact: true }), `Open normal Settings for ${mode} terminal contrast`);
      const scope = page.locator('section[aria-labelledby="settings-page-title"]');
      await scope.waitFor();
      await click(scope.getByRole('navigation').getByRole('button', { name: await t('settings', 'sections.appearance.title'), exact: true }), `Open Appearance for ${mode} contrast`);
      const modeButton = button(await t('uiSettings', `mode.${mode}`), scope);
      await click(modeButton, `Select ${mode} through the normal Appearance control`);
      await expect(modeButton).toHaveAttribute('aria-pressed', 'true');
      await click(button(await t('settings', 'actions.save'), scope), `Save ${mode} appearance in the isolated profile`);
      await scope.waitFor({ state: 'hidden' });
      await nav('terminals');
      assert.equal(JSON.parse(await readFile(path.join(profile, 'settings.json'), 'utf8')).theme, mode, 'Appearance selection must really persist');
      assert.equal(await page.locator('html').evaluate(node => node.classList.contains('dark')), mode === 'dark', 'Rendered theme must match normal Appearance selection');
      for (let index = 0; index < fixtureHistoryIds.length; index++) {
        const retryName = await t('uiTerminal', 'retryInitialization', { name: `Disposable UI shell history ${index + 1}` });
        const retry = main().getByRole('button', { name: retryName, exact: true });
        await expect(retry).toBeEnabled();
      }
      await action(`Settle ${mode} normal unhovered terminal styles`, async () => { await page.mouse.move(1430, 948); await page.waitForTimeout(250); });
      await action(`Measure actual ${mode} Retry, Header title and initialization-error text composite contrast`, async () => {
        const measurements = await page.evaluate(ids => {
          const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('Actual browser Canvas2D color parser unavailable');
          const parseColor = css => {
            if (!CSS.supports('color', css)) throw new Error(`Unsupported rendered CSS color: ${css}`);
            context.clearRect(0, 0, 1, 1); context.fillStyle = css; context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data];
          };
          const luminance = rgb => rgb.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
          const measure = (node, kind, terminalId) => {
            if (!node) throw new Error(`Missing actual terminal ${kind}`);
            if (node.matches(':hover')) throw new Error(`Cannot measure hovered ${kind}`);
            if (node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true') throw new Error(`Cannot measure disabled ${kind} as normal text`);
            const textColor = getComputedStyle(node).color;
            const layers = [];
            let foundOpaqueBackdrop = false;
            for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              if (Number(style.opacity) !== 1 || style.filter !== 'none' || style.mixBlendMode !== 'normal') throw new Error(`Unmodeled opacity/filter/blend in ${kind} backdrop`);
              if (style.backgroundImage !== 'none') throw new Error(`Unmodeled background image in ${kind} backdrop`);
              const rgba = parseColor(style.backgroundColor);
              layers.push({ tag: ancestor.tagName.toLowerCase(), terminalHeader: ancestor.getAttribute('data-terminal-id'), backgroundColor: style.backgroundColor, rgba });
              if (rgba[3] === 255) { foundOpaqueBackdrop = true; break; }
            }
            if (!foundOpaqueBackdrop) throw new Error(`No actual opaque ancestor backdrop for ${kind}`);
            // Compose rendered ancestor colors in the browser, including Header
            // card alpha over the actual fixed terminal canvas background.
            context.clearRect(0, 0, 1, 1);
            for (const layer of [...layers].reverse()) { context.fillStyle = layer.backgroundColor; context.fillRect(0, 0, 1, 1); }
            const compositeBackground = [...context.getImageData(0, 0, 1, 1).data];
            context.fillStyle = textColor; context.fillRect(0, 0, 1, 1);
            const compositeText = [...context.getImageData(0, 0, 1, 1).data];
            const a = luminance(compositeText), b = luminance(compositeBackground);
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            return { kind, terminalId, hovered: false, disabled: false, textColor, textRGBA: parseColor(textColor), compositeBackgroundRGBA: compositeBackground, compositeTextRGBA: compositeText, layers, ratio, requiredRatio: 4.5 };
          };
          return ids.flatMap(id => {
            const header = document.querySelector(`[data-terminal-id="${id}"]`);
            const terminal = header?.parentElement;
            const retry = [...(terminal?.querySelectorAll('button') || [])].find(button => button.getAttribute('aria-label')?.startsWith('Retry terminal '));
            const title = header?.querySelector('span.cursor-text');
            const errorParagraph = terminal?.querySelector('[role="alert"] p');
            return [measure(retry, 'normal-enabled-Retry', id), measure(title, 'normal-Header-title', id), measure(errorParagraph, 'initialization-error-paragraph', id)];
          });
        }, fixtureHistoryIds);
        report.terminalContrastEvidence.push({ mode, profileAppearanceSavedThroughUI: true, colorTheme: 'forge-glass', measurements });
      });
      await shot(`terminal-normal-state-contrast-${mode}`);
    }
    const harness = await app.evaluate(() => ({ calls: globalThis.__forgeUiWalk.boundaryCalls, inputs: globalThis.__forgeUiWalk.terminalInputs }));
    assert.equal(harness.inputs.length, 0, 'Contrast verification must send no executor input');
    assert.ok(harness.calls.every(call => call.channel === 'terminal:restoreSession'), 'Contrast verification must invoke no model/CLI/editor operation');
    report.terminalContrastViolations = report.terminalContrastEvidence.flatMap(theme => theme.measurements.filter(measurement => measurement.ratio < measurement.requiredRatio).map(measurement => ({ mode: theme.mode, ...measurement })));
    report.fixtureSetup.push({ kind: 'normal-light-and-dark-terminal-contrast', measuredControls: 24, initializationErrorParagraphs: 8, minimumTextRatio: Math.min(...report.terminalContrastEvidence.flatMap(theme => theme.measurements.map(measurement => measurement.ratio))), meetsRequiredRatio: report.terminalContrastViolations.length === 0, actualExecutorInputs: 0, actualModelsInvoked: 0, clipboardTouched: false, ordinaryThemeSettingsUsed: true, CSSAlphaComposedOverActualTerminalBackdrop: true });
    // Collect both independent themes before failing, so an unreadable paragraph
    // has its real CSS colors, composite backdrop and screenshots in the report.
    await action('Validate all actual terminal text contrast measurements against4.5', () => {
      assert.equal(report.terminalContrastViolations.length, 0, report.terminalContrastViolations.map(measurement => `${measurement.mode} ${measurement.kind}: actual contrast ${measurement.ratio.toFixed(3)} must be at least4.5`).join('; '));
    });
  });

  await segment('terminal-history-failure', async () => {
    if (!terminalBoundaryFixture) return blocked('Terminal initialization/history failure lifecycle', 'Enable FORGE_UI_WALK_TERMINAL_BOUNDARIES=1 for disposable shell histories and pre-dispatch restore refusal');
    await nav('terminals');
    const headers = main().locator('[data-terminal-id]');
    const originalIds = [...fixtureHistoryIds];
    const retryNames = await Promise.all(originalIds.map((_, index) => t('uiTerminal', 'retryInitialization', { name: `Disposable UI shell history ${index + 1}` })));
    const initializationError = await t('uiTerminal', 'initializationFailed');
    for (const name of retryNames) await expect(main().getByRole('button', { name, exact: true })).toBeEnabled();
    const originalHeaders = await headers.elementHandles();
    const restoreCounts = async () => app.evaluate((_, ids) => Object.fromEntries(ids.map(id => [id, globalThis.__forgeUiWalk.boundaryCalls.filter(call => call.channel === 'terminal:restoreSession' && call.args[0]?.id === id).length])), originalIds);
    const expectedInitialCounts = Object.fromEntries(originalIds.map(id => [id, 1]));
    assert.deepEqual(await restoreCounts(), expectedInitialCounts, 'Each failed initial restoration must make exactly one attempt');
    const preserveOriginalTerminals = async label => {
      assert.deepEqual((await headers.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-terminal-id')))).sort(), [...originalIds].sort(), `${label}: the four original terminal IDs must remain`);
      assert.ok((await Promise.all(originalHeaders.map(node => node.evaluate(element => element.isConnected)))).every(Boolean), `${label}: the original Header DOM nodes must remain connected`);
      await expect(button('History', main())).toBeEnabled();
    };
    const provokeUnrelatedRenders = async label => {
      await click(button('Files', main()), `${label} open file browser to resize unchanged terminals`);
      await click(button('Files', main()), `${label} close file browser`);
      await click(button('History', main()), `${label} open History without restoring`);
      await press('Escape', `${label} cancel History without restoring`);
      for (let index = 0; index < originalIds.length; index++) await click(main().locator(`[data-terminal-id="${originalIds[index]}"]`).locator('..').locator('.xterm'), `${label} focus original terminal ${index + 1} without typing`);
      await preserveOriginalTerminals(label);
    };
    await provokeUnrelatedRenders('Failed initialization');
    const dragHandle = main().getByRole('button', { name: await t('uiTerminal', 'reorderTerminal', { name: 'Disposable UI shell history 1' }), exact: true });
    await click(dragHandle, 'Focus keyboard reorder control while initialization remains failed');
    await action('Keyboard begin reorder without remounting failed terminals', () => dragHandle.press('Space'), dragHandle);
    await action('Keyboard move failed terminal to the next grid position', () => dragHandle.press('ArrowRight'), dragHandle);
    await action('Keyboard commit unchanged terminal identities', () => dragHandle.press('Space'), dragHandle);
    await expect.poll(() => headers.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-terminal-id')))).not.toEqual(originalIds);
    await preserveOriginalTerminals('Keyboard reorder of failed initial sessions');
    await action('Observe initial restoration counters across an idle rendering window', () => page.waitForTimeout(1200));
    assert.deepEqual(await restoreCounts(), expectedInitialCounts, 'Unrelated focus/layout/History/reorder renders must not retry failed initialization');
    for (const id of originalIds) await expect(main().locator(`[data-terminal-id="${id}"]`).locator('..').getByRole('alert')).toContainText(initializationError);
    await shot('failed-terminal-initialization-bounded-before-retry');
    report.fixtureSetup.push({ kind: 'initial-terminal-restore-refusal-no-auto-loop', counts: await restoreCounts(), originalIds, currentDOMNodesRetained: true, unrelatedUIRendersExercised: true, actualExecutorDispatches: 0 });

    const retryId = originalIds[0];
    const retry = main().getByRole('button', { name: retryNames[0], exact: true });
    await action('Hold the next explicit terminal Retry at the pre-dispatch IPC boundary', () => app.evaluate((_, id) => { globalThis.__forgeUiWalk.heldRestoreIds = [id]; }, retryId));
    try {
      await click(retry, 'Retry one failed terminal through its normal UI action');
      const expectedRetryCounts = { ...expectedInitialCounts, [retryId]: 2 };
      await expect.poll(restoreCounts).toEqual(expectedRetryCounts);
      await expect.poll(() => app.evaluate(() => globalThis.__forgeUiWalk.pendingRestores.length)).toBe(1);
      const pendingRetry = { visible: await retry.isVisible() };
      await expect(retry).toBeVisible();
      await expect(retry).toBeDisabled();
      await expect(retry).toHaveAttribute('aria-busy', 'true');
      pendingRetry.disabled = true; pendingRetry.busy = true;
      await provokeUnrelatedRenders('Held explicit Retry');
      await action('Observe a held Retry without an automatic duplicate attempt', () => page.waitForTimeout(1000));
      assert.deepEqual(await restoreCounts(), expectedRetryCounts, 'Pending explicit Retry must dispatch once despite unrelated renders');
      await shot('terminal-initialization-retry-held-before-dispatch');
      await action('Reject the held explicit Retry without creating a PTY or model', () => app.evaluate((_, id) => {
        const pending = globalThis.__forgeUiWalk.pendingRestores.find(request => request.id === id);
        if (!pending) throw new Error('Missing explicit held restoration request');
        globalThis.__forgeUiWalk.pendingRestores = globalThis.__forgeUiWalk.pendingRestores.filter(request => request !== pending);
        globalThis.__forgeUiWalk.heldRestoreIds = [];
        pending.resolve({ success: false, error: 'Disposable UI fixture: explicit terminal retry refused before any PTY/CLI/model dispatch' });
      }, retryId));
      await expect(retry).toBeEnabled();
      await expect(main().locator(`[data-terminal-id="${retryId}"]`).locator('..').getByRole('alert')).toContainText(initializationError);
      await action('Observe explicit Retry failure without another automatic attempt', () => page.waitForTimeout(1200));
      assert.deepEqual(await restoreCounts(), expectedRetryCounts, 'A failed explicit Retry must wait for the next user action');
      await preserveOriginalTerminals('Explicit initialization Retry rejection');
      report.fixtureSetup.push({ kind: 'explicit-terminal-initialization-retry-refusal', id: retryId, counts: await restoreCounts(), pendingRetry, currentDOMNodesRetained: true, actualPTYsCreated: 0, actualExecutorDispatches: 0 });
    } finally {
      await app.evaluate(() => {
        for (const request of globalThis.__forgeUiWalk.pendingRestores) request.resolve({ success: false, error: 'Disposable UI fixture cleanup; no PTY/CLI/model dispatch' });
        globalThis.__forgeUiWalk.pendingRestores = []; globalThis.__forgeUiWalk.heldRestoreIds = [];
      });
    }

    await click(button('History', main()), 'Open Today History containing the same four original IDs');
    report.fixtureHistoryMenu = await page.getByRole('menuitem').allInnerTexts();
    assert.equal(report.fixtureHistoryMenu.length, 2, 'Narrow fixture must expose exactly Today and Yesterday');
    await click(page.getByRole('menuitem').nth(0), 'Select same-ID Today History without replacing original sessions');
    await expect(button('History', main())).toBeEnabled();
    await preserveOriginalTerminals('Same-ID Today History');
    const historyError = main().getByRole('alert').filter({ hasText: await t('uiTerminal', 'restoreFailed') });
    await expect(historyError).toHaveCount(0);
    assert.deepEqual(await restoreCounts(), { ...expectedInitialCounts, [retryId]: 2 }, 'Shared History IDs must not be restored again');
    const failedHistoryId = '00000000-0000-4000-8000-000000000009';
    const missingHistoryCount = async () => app.evaluate((_, id) => globalThis.__forgeUiWalk.boundaryCalls.filter(call => call.channel === 'terminal:restoreSession' && call.args[0]?.id === id).length, failedHistoryId);
    await click(button('History', main()), 'Open Yesterday History with one absent disposable session');
    await click(page.getByRole('menuitem').nth(1), 'Select Yesterday History receiving a real UI restore refusal');
    await expect(historyError).toBeVisible();
    await expect.poll(missingHistoryCount).toBe(1);
    await preserveOriginalTerminals('Missing Yesterday History refusal');
    await click(button(await t('common', 'buttons.retry'), historyError), 'Retry failed Yesterday History while preserving all original terminals');
    await expect(historyError).toBeVisible();
    await expect.poll(missingHistoryCount).toBe(2);
    await provokeUnrelatedRenders('Failed History Retry');
    await action('Observe failed History Retry without unprompted retries', () => page.waitForTimeout(1200));
    assert.equal(await missingHistoryCount(), 2, 'History retry must dispatch once per user attempt');
    assert.deepEqual(await restoreCounts(), { ...expectedInitialCounts, [retryId]: 2 }, 'History failure must not retrigger original initialization');
    await preserveOriginalTerminals('Final failed History Retry');
    await shot('terminal-history-and-initialization-failures-preserve-originals');
    report.terminalFailureEvidence = await app.evaluate(() => ({ boundaryCalls: globalThis.__forgeUiWalk.boundaryCalls, terminalInputs: globalThis.__forgeUiWalk.terminalInputs }));
    assert.equal(report.terminalFailureEvidence.terminalInputs.length, 0, 'No executor input may reach Main in the initialization/history refusal scope');
    assert.ok(report.terminalFailureEvidence.boundaryCalls.every(call => call.channel === 'terminal:restoreSession'), 'This narrow scope must not invoke CLI, models, external editors or bulk restoration');
    report.fixtureSetup.push({ kind: 'history-failure-bounded-retry-and-same-DOM-preservation', originalIds, initialRestoreCounts: await restoreCounts(), missingHistoryRestoreCount: await missingHistoryCount(), sameIDHistoryNoDuplicateRestore: true, currentDOMNodesRetained: true, executorInputsObserved: 0, actualPTYsCreated: 0, actualModelCalls: 0, clipboardTouched: false });

    // The same creation hook must still start a healthy plain local shell.
    // Process identity and cwd are inspected read-only; no shell input is sent.
    const ownedShellProcesses = () => execFileSync('/bin/ps', ['-ax', '-o', 'pid=,ppid=,comm='], { encoding: 'utf8' })
      .trim().split('\n').map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
      .map(match => ({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }))
      .filter(processInfo => processInfo.ppid === report.electronPid && /(?:\/|-)?(?:zsh|bash|sh|fish)$/.test(processInfo.command));
    assert.deepEqual(ownedShellProcesses(), [], 'The four refused restored-session transports must not create actual shells');
    await page.evaluate(() => {
      window.__forgeHealthyShell = { output: [], exits: [] };
      window.__forgeHealthyShellOutputUnsub = window.electronAPI.onTerminalOutput((id, value) => window.__forgeHealthyShell.output.push({ id, bytes: value.length }));
      window.__forgeHealthyShellExitUnsub = window.electronAPI.onTerminalExit((id, exitCode) => window.__forgeHealthyShell.exits.push({ id, exitCode }));
    });
    try {
      await click(main().getByRole('button', { name: /^New Terminal(?: |$)/ }), 'Create one healthy plain shell through the normal New Terminal action');
      await expect(headers).toHaveCount(5);
      const newIds = (await headers.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-terminal-id')))).filter(id => !originalIds.includes(id));
      assert.equal(newIds.length, 1, 'Exactly one new terminal ID must be added');
      const healthyId = newIds[0];
      const healthyHeader = main().locator(`[data-terminal-id="${healthyId}"]`);
      await expect.poll(() => ownedShellProcesses().length).toBe(1);
      const shellProcess = ownedShellProcesses()[0];
      assert.equal(shellProcess.ppid, report.electronPid, 'Healthy shell must belong to this disposable Electron PID');
      const cwdRecords = execFileSync('/usr/sbin/lsof', ['-a', '-p', String(shellProcess.pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).trim().split('\n');
      const kernelCwd = cwdRecords.find(record => record.startsWith('n'))?.slice(1);
      assert.ok(kernelCwd, 'The actual shell process cwd must be available');
      assert.equal(await realpath(kernelCwd), await realpath(fixture), 'The actual shell process cwd must resolve to the independent fixture');
      await expect(healthyHeader.locator('.bg-success')).toHaveCount(1);
      await expect(healthyHeader.locator('..').getByRole('alert')).toHaveCount(0);
      await page.waitForFunction(id => window.__forgeHealthyShell.output.some(entry => entry.id === id && entry.bytes > 0), healthyId);
      assert.deepEqual(await restoreCounts(), { ...expectedInitialCounts, [retryId]: 2 }, 'Creating a healthy fifth terminal must not retry the original failures');
      assert.ok((await Promise.all(originalHeaders.map(node => node.evaluate(element => element.isConnected)))).every(Boolean), 'Healthy shell creation must preserve the four original Header DOM nodes');
      await shot('healthy-plain-shell-with-preserved-failed-sessions');
      await click(healthyHeader.locator('button[title^="Close ("]'), 'Close only the new healthy plain shell through its normal control');
      await expect(healthyHeader).toHaveCount(0);
      await page.waitForFunction(id => window.__forgeHealthyShell.exits.some(entry => entry.id === id), healthyId);
      await expect.poll(() => {
        try { process.kill(shellProcess.pid, 0); return false; }
        catch (error) { if (error.code === 'ESRCH') return true; throw error; }
      }).toBe(true);
      await preserveOriginalTerminals('Healthy fifth shell creation and physical exit');
      report.fixtureSetup.push({ kind: 'real-healthy-plain-shell-create-and-close', terminalId: healthyId, shellPid: shellProcess.pid, parentElectronPid: shellProcess.ppid, shellCommand: shellProcess.command, cwdIsDisposableFixture: true, uiRunningState: true, initializationErrorAbsent: true, outputObserved: true, actualModelCalls: 0, executorInputSent: 0, normalCloseClicked: true, exitEventObserved: true, physicalProcessExitVerified: true, originalHeaderDOMNodesRetained: true });
    } finally {
      await page.evaluate(() => { window.__forgeHealthyShellOutputUnsub(); window.__forgeHealthyShellExitUnsub(); });
    }
    assert.equal(await app.evaluate(() => globalThis.__forgeUiWalk.terminalInputs.length), 0, 'Even the healthy shell check must send no input or model command');
    assert.deepEqual(await restoreCounts(), { ...expectedInitialCounts, [retryId]: 2 }, 'All original failed initial restorations remain bounded at scope end');
  });

  await segment('terminal-toolbar-history-and-refused-boundaries', async () => {
    if (!terminalBoundaryFixture) return blocked('Terminal history and CLI/IDE boundary fixture', 'Enable FORGE_UI_WALK_TERMINAL_BOUNDARIES=1 for explicit disposable history and interception before CLI/model/editor dispatch');
    await nav('terminals');
    await click(button('Settings', main()), 'Terminal toolbar Settings shortcut');
    const settingsPage = page.locator('section[aria-labelledby="settings-page-title"]');
    await settingsPage.waitFor();
    assert.match(await settingsPage.locator('nav button[aria-current="page"]').innerText(), /terminal|font/i, 'Terminal settings shortcut must open its intended section');
    await shot('terminal-settings-shortcut');
    await click(button('Back', settingsPage).first(), 'Back from terminal settings shortcut');
    await expect.poll(() => app.evaluate(() => globalThis.__forgeUiWalk.boundaryCalls.filter(call => call.channel === 'terminal:restoreSession').length)).toBeGreaterThanOrEqual(4);
    report.fixtureSetup.push({ kind: 'renderer-pending-resume-placeholder', ids: fixtureHistoryIds, actualExecutorCommands: 0, prerequisite: 'All Main restore/invoke/resume/deferred channels were refused before project activation; persisted histories remain isCLIMode=false', productData: false });
    await action('Expose explicit pending-resume placeholders after Main refusal proof', () => app.evaluate(({ BrowserWindow }, ids) => {
      const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().includes('/renderer/index.html'));
      for (const id of ids) window.webContents.send('terminal:pendingResume', id);
    }, fixtureHistoryIds));
    await main().locator('span[title="Click to resume previous Claude session"]').first().waitFor();
    const resumesBefore = await app.evaluate(() => globalThis.__forgeUiWalk.boundaryCalls.filter(call => call.channel === 'terminal:activateDeferredResume').length);
    await click(main().locator('span[title="Click to resume previous Claude session"]').first(), 'Select disposable pending CLI session for individual resume boundary');
    await expect.poll(() => app.evaluate(() => globalThis.__forgeUiWalk.boundaryCalls.filter(call => call.channel === 'terminal:activateDeferredResume').length)).toBeGreaterThan(resumesBefore);
    await click(main().locator('button[title="Resume All"]').first(), 'Terminal Resume All refused before any CLI/model command');
    await expect(main().locator('span[title="Click to resume previous Claude session"]')).toHaveCount(0);
    await shot('terminal-resume-boundary-state');
    const headers = main().locator('[data-terminal-id]');
    const originalIds = await headers.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-terminal-id')));
    assert.deepEqual([...originalIds].sort(), [...fixtureHistoryIds].sort(), 'All original disposable shell IDs must be rendered before History checks');
    const originalHeaders = await headers.elementHandles();
    const preserveOriginalTerminals = async label => {
      assert.deepEqual((await headers.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-terminal-id')))).sort(), [...originalIds].sort(), `${label}: original terminal IDs must remain`);
      assert.ok((await Promise.all(originalHeaders.map(node => node.evaluate(element => element.isConnected)))).every(Boolean), `${label}: original terminal header DOM nodes must remain connected`);
      await expect(button('History', main())).toBeEnabled();
    };
    const dragHandle = main().getByRole('button', { name: await t('uiTerminal', 'reorderTerminal', { name: 'Disposable UI shell history 1' }), exact: true });
    await click(dragHandle, 'Click the native accessible terminal reorder handle');
    await action('Keyboard activate terminal reorder handle', () => dragHandle.press('Space'), dragHandle);
    await action('Keyboard move terminal reorder handle to next grid position', () => dragHandle.press('ArrowRight'), dragHandle);
    await action('Keyboard commit terminal reorder handle movement', () => dragHandle.press('Space'), dragHandle);
    await expect.poll(() => headers.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-terminal-id')))).not.toEqual(originalIds);
    await preserveOriginalTerminals('Keyboard reorder');
    report.fixtureSetup.push({ kind: 'actual-keyboard-terminal-reorder', before: originalIds, after: await headers.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-terminal-id'))) });
    await click(button('History', main()), 'Open explicitly disposable terminal History');
    report.fixtureHistoryMenu = await page.getByRole('menuitem').allInnerTexts();
    assert.ok(report.fixtureHistoryMenu.length > 0, 'Disposable terminal history fixture was not surfaced');
    await press('Escape', 'Cancel terminal history menu');
    for (let index = 0; index < report.fixtureHistoryMenu.length; index++) {
      await click(button('History', main()), `Reopen disposable terminal History for date ${index + 1}`);
      await click(page.getByRole('menuitem').nth(index), `Select disposable terminal history date ${index + 1} with restore interception`);
      await expect(button('History', main())).toBeEnabled();
      await preserveOriginalTerminals(`History date ${index + 1}`);
      if (index === 0) {
        await expect(main().getByRole('alert')).toHaveCount(0);
        report.fixtureSetup.push({ kind: 'terminal-history-shared-ID-preservation', originalIds, currentDOMNodesRetained: true });
      } else {
        const failure = main().getByRole('alert');
        await expect(failure).toContainText(await t('uiTerminal', 'restoreFailed'));
        const failedHistoryId = '00000000-0000-4000-8000-000000000009';
        const failedCallsBefore = await app.evaluate((_, id) => globalThis.__forgeUiWalk.boundaryCalls.filter(call => call.channel === 'terminal:restoreSession' && call.args[0]?.id === id).length, failedHistoryId);
        assert.ok(failedCallsBefore > 0, 'Missing history ID must reach the per-session refusal boundary');
        await click(button(await t('common', 'buttons.retry'), failure), 'Retry refused terminal history without losing current sessions');
        await expect.poll(() => app.evaluate((_, id) => globalThis.__forgeUiWalk.boundaryCalls.filter(call => call.channel === 'terminal:restoreSession' && call.args[0]?.id === id).length, failedHistoryId)).toBeGreaterThan(failedCallsBefore);
        await expect(failure).toContainText(await t('uiTerminal', 'restoreFailed'));
        await preserveOriginalTerminals('History retry failure');
        await shot('terminal-history-failure-keeps-original-sessions');
        report.fixtureSetup.push({ kind: 'terminal-history-refused-restore-preserves-sessions', failedHistoryId, originalIds, currentDOMNodesRetained: true, retryClicked: true, actualExecutorDispatches: 0 });
      }
    }
    await page.evaluate(() => {
      window.__forgeBoundaryTerminalOutput = [];
      window.__forgeBoundaryTerminalUnsub = window.electronAPI.onTerminalOutput((id, data) => window.__forgeBoundaryTerminalOutput.push({ id, data }));
    });
    await click(main().getByRole('button', { name: /^New Terminal(?: |$)/ }), 'Create real plain shell for guarded invocation controls');
    await page.locator('.xterm-screen').last().waitFor();
    await button('Invoke Claude in All Terminals', main()).waitFor();
    await click(button('Files', main()), 'Open file browser for keyboard and real drag flow');
    const folder = main().getByRole('button', { name: 'Toggle src folder', exact: true });
    await action('Expand terminal file folder with Enter', () => folder.press('Enter'), folder);
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
    await action('Collapse terminal file folder with Space', () => folder.press('Space'), folder);
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    await click(main().getByRole('button', { name: 'Expand src folder', exact: true }), 'Expand file folder through its internal chevron');
    const sourceFile = main().getByText('alpha.ts', { exact: true }).locator('..');
    await action('Drag actual fixture file into shell without executing it', () => sourceFile.dragTo(page.locator('.xterm').last()), sourceFile);
    await page.waitForFunction(() => window.__forgeBoundaryTerminalOutput.map(item => item.data).join('').includes('src/alpha.ts'), undefined, { timeout: 10000 });
    await click(page.locator('.xterm').last(), 'Focus shell to discard the dragged path');
    await press('Control+U', 'Clear dragged path without Enter or execution');
    await click(button('Files', main()), 'Close file browser after keyboard and drag flow');
    await click(button('Invoke Claude in All Terminals', main()), 'Invoke Claude toolbar transport refused before command dispatch');
    await expect.poll(() => app.evaluate(() => globalThis.__forgeUiWalk.boundaryCalls.filter(call => call.channel === 'terminal:invokeClaude').length)).toBeGreaterThan(0);
    const invokeSingle = main().locator('button[title="Claude"]').last();
    await invokeSingle.waitFor();
    await click(invokeSingle, 'Invoke Claude single-terminal transport refused before command dispatch');
    await main().getByRole('button', { name: 'Worktree', exact: true }).last().waitFor();
    await click(main().getByRole('button', { name: 'Worktree', exact: true }).last(), 'Open guarded IDE fixture worktree selector');
    await click(button('New Worktree'), 'Create isolated worktree for editor boundary');
    await fill(page.locator('#worktree-name'), 'ui-editor-boundary-tree', 'Name real editor-boundary fixture worktree');
    await click(button('Create', dialog()), 'Create actual disposable editor-boundary worktree');
    await dialog().waitFor({ state: 'hidden', timeout: 30000 });
    const openInIde = main().locator('button[title="Open in IDE"]').last();
    await openInIde.waitFor();
    await click(openInIde, 'Open in IDE receiving simulated unavailable-editor result');
    await expect.poll(() => app.evaluate(() => globalThis.__forgeUiWalk.boundaryCalls.filter(call => call.channel === 'task:worktreeOpenInIDE').length)).toBe(1);
    const resultFailureVisible = await page.getByText('Disposable UI fixture: configured editor unavailable; no application launched', { exact: true }).isVisible();
    if (!resultFailureVisible) report.uxFindings.push({ case: currentCase, title: 'Terminal Open in IDE silently ignores a returned failure result', recommendation: 'Inspect IPCResult.success and display its error through the existing destructive toast' });
    await app.evaluate(() => { globalThis.__forgeUiWalk.ideFailureMode = 'throw'; });
    await click(openInIde, 'Open in IDE receiving simulated transport rejection');
    await page.getByText(/Disposable UI fixture: editor transport unavailable/).first().waitFor();
    await shot('terminal-editor-transport-error');
    report.terminalBoundaryEvidence = await app.evaluate(() => globalThis.__forgeUiWalk.boundaryCalls);
    report.boundaryShellOutput = await page.evaluate(() => window.__forgeBoundaryTerminalOutput);
    assert.ok(report.terminalBoundaryEvidence.every(call => /no.*(?:CLI|model|editor)|no application/i.test(call.outcome)), 'Boundary call must explicitly disclose refusal, never online/CLI success');
    await nav('worktrees');
    const card = main().locator('.forge-card').filter({ has: page.getByRole('heading', { name: 'ui-editor-boundary-tree', exact: true, level: 3 }) }).last();
    const terminalTrees = await page.evaluate(projectPath => window.electronAPI.listTerminalWorktrees(projectPath), fixture);
    const copiedTerminalTree = terminalTrees.data?.find(tree => tree.name === 'ui-editor-boundary-tree');
    assert.ok(terminalTrees.success && copiedTerminalTree?.worktreePath?.startsWith(fixture + path.sep), 'Copy fixture must be an actual terminal worktree inside the disposable project');
    await walkWorktreeCopyFeedback(card, copiedTerminalTree.worktreePath, 'Terminal worktree');

    // This real, orphaned Git worktree only renders the task-worktree card branch.
    // No task plan, Agent result, review outcome or execution state is fabricated.
    const orphanName = 'ui-copy-task-worktree';
    const orphanBranch = `forge-glass-preview/${orphanName}`;
    const orphanPath = path.join(fixture, '.forge-glass-preview', 'worktrees', 'tasks', orphanName);
    assert.ok(orphanPath.startsWith(fixture + path.sep));
    await mkdir(path.dirname(orphanPath), { recursive: true });
    execFileSync('git', ['worktree', 'add', '-b', orphanBranch, orphanPath, 'main'], fixtureGitOptions);
    report.fixtureSetup.push({ kind: 'real-disposable-orphan-task-worktree', path: orphanPath, branch: orphanBranch, purpose: 'Walk the separate task Worktrees Copy path control', agentExecuted: false, modelResultFabricated: false });
    try {
      await click(button('Refresh', main()), 'Refresh actual local orphan worktree for separate task-card Copy path');
      const orphanCard = main().locator('.forge-card').filter({ has: page.getByText(orphanName, { exact: true }) }).last();
      await orphanCard.waitFor();
      await walkWorktreeCopyFeedback(orphanCard, orphanPath, 'Task worktree');
    } finally {
      execFileSync('git', ['worktree', 'remove', '--force', orphanPath], fixtureGitOptions);
      execFileSync('git', ['branch', '-D', orphanBranch], fixtureGitOptions);
    }
    await click(button('Refresh', main()), 'Refresh after disposable task-copy Git fixture cleanup');
    await click(button('Delete', card), 'Delete actual editor-boundary fixture worktree');
    await click(page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }), 'Confirm editor-boundary fixture worktree deletion');
    await nav('terminals');
    while (await main().locator('button[title^="Close ("]').count()) await click(main().locator('button[title^="Close ("]').first(), 'Close remaining disposable boundary terminal');
    await page.evaluate(() => window.__forgeBoundaryTerminalUnsub());
  });

  await segment('git-integrations-config-and-unavailable-pages', async () => {
    await nav('kanban');
    await click(page.locator('.forge-glass-project-tabs').getByRole('button', { name: await t('common', 'projectTab.settings'), exact: true }), 'Open Git integration project scope');
    const scope = page.locator('section[aria-labelledby="project-settings-page-title"]');
    for (const section of ['github', 'gitlab']) {
      await click(scope.locator('nav').getByRole('button', { name: await t('settings', `projectSections.${section}.title`), exact: true }), `Configure ${section} project integration`);
      const enable = scope.getByRole('switch').first();
      if (await enable.getAttribute('aria-checked') === 'false') await click(enable, `Enable ${section} in fixture`);
      await walkSwitches(scope, `${section} preferences`);
      await walkSelects(scope, `${section} branch options`);
      for (const input of await scope.locator('input').all()) {
        if (!await input.isVisible() || await input.isDisabled()) continue;
        const id = await input.getAttribute('id');
        const type = await input.getAttribute('type');
        const value = /url|instance/i.test(id || '') ? 'http://127.0.0.1:9' : /repo|project/i.test(id || '') ? 'forge-ui-fixture/does-not-exist' : type === 'password' || /token/i.test(id || '') ? 'forge-ui-invalid-token' : await input.inputValue();
        await fill(input, value, `${section} fixture ${id || 'field'}`);
      }
      await optionalClick(scope.getByRole('button', { name: /Show password|Show token/ }).first(), `${section} reveal dummy token`);
      await optionalClick(scope.getByRole('button', { name: /Hide password|Hide token/ }).first(), `${section} conceal dummy token`);
      await optionalClick(scope.getByRole('button', { name: /Test Connection|Check Connection/ }), `${section} invalid-account connection check`);
      await shot(`${section}-unavailable-connection`);
    }
    await click(button(await t('settings', 'projectSettings.save'), scope), 'Save fixture Git integration metadata');
    for (const key of ['githubIssues', 'githubPRs', 'gitlabIssues', 'gitlabMRs']) {
      const label = await t('navigation', `items.${key}`);
      if (!await page.locator('.forge-glass-sidebar').getByRole('button', { name: label, exact: true }).count()) { await blocked(label, 'Integration entry is conditional and unavailable'); continue; }
      await nav(key);
      await optionalClick(button('Refresh', main()), `${label} refresh unavailable fixture account`);
      await optionalClick(button('Retry', main()), `${label} retry unavailable fixture account`);
      await walkTabs(main(), key);
      await walkSelects(main(), `${label} filters`);
      for (const input of await main().getByRole('textbox').all()) if (await input.isVisible() && !await input.isDisabled()) await fill(input, 'fixture-not-found', `${label} empty search`);
      await shot(`${key}-unavailable`);
      await blocked(`${label} online item actions and writes`, 'No real repository/account is connected; no GitHub/GitLab remote write, issue, PR, merge or release occurred');
    }
  });

  report.nativeHarness = await app.evaluate(() => globalThis.__forgeUiWalk);
  report.coverage = { observedUniqueControls: seen.size, interactedUniqueControls: covered.size, operations: sequence, passed: report.operations.filter(item => item.status === 'passed').length, failed: report.failures.length, blocked: report.blocked.length };
  report.unwalkedObservedControls = [...seen.entries()].filter(([key]) => !covered.has(key)).map(([, item]) => item);
  report.completeCoverage = report.skippedCases.length === 0 && report.unwalkedObservedControls.length === 0 && report.blocked.length === 0 && report.failures.length === 0;
  report.valid = report.failures.length === 0;
} catch (error) {
  report.error = String(error); report.valid = false;
  if (!report.failures.some(failure => failure.case === currentCase)) report.failures.push({ case: currentCase, error: String(error) });
} finally {
  if (app) {
    report.nativeHarness ??= await app.evaluate(() => globalThis.__forgeUiWalk).catch(error => ({ error: String(error) }));
    await app.close().catch(error => { report.cleanupError = String(error); report.valid = false; });
    report.electronClosed = !report.cleanupError;
  }
  report.endedAt = new Date().toISOString();
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(report, null, 2));
  await appendFile(path.join(root, 'output/playwright/workspace-controls-runs.jsonl'), `${JSON.stringify({ runId, output, requestedCases, valid: report.valid, completeCoverage: report.completeCoverage, cases: report.cases, failures: report.failures, operations: sequence, blocked: report.blocked.length, sourceHashes: report.sourceHashes, electronClosed: report.electronClosed })}\n`);
  console.log(JSON.stringify({ valid: report.valid, completeCoverage: report.completeCoverage, output, cases: report.cases.length, operations: sequence, failures: report.failures.length, blocked: report.blocked.length, realModelCalls: report.realModelCalls, externalWrites: report.externalWrites }));
}
if (!report.valid) process.exitCode = 1;
