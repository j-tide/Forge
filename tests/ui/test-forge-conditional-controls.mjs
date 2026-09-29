/**
 * Conditional UI state QA. Every record in this disposable project is a labelled
 * fixture, never model execution, Forge Host acceptance, or production state.
 * Launch only after this task owns native UI focus. No remote writes are made.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect } from '@playwright/test';
import { walkConditionalBulkPR } from './conditional-bulk-pr-controls.mjs';
import { walkConditionalGitHubOAuthCopy } from './conditional-github-oauth-copy-controls.mjs';
import { walkConditionalFeatures } from './conditional-feature-controls.mjs';
import { walkConditionalInsightsSuggestions } from './conditional-insights-suggestions.mjs';
import { walkConditionalInsightsStream } from './conditional-insights-stream.mjs';
import { walkConditionalOrdinaryEntries } from './conditional-ordinary-entry-controls.mjs';
import { walkConditionalQueueBoundary } from './conditional-queue-boundary-controls.mjs';
import { walkConditionalScreenshotTransport } from './conditional-screenshot-transport-controls.mjs';
import { walkConditionalTaskWorktree } from './conditional-task-worktree-controls.mjs';
import { walkConditionalStagedCopy } from './conditional-staged-copy-controls.mjs';
import { walkConditionalTaskWizardPush } from './conditional-task-wizard-push-controls.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const feedbackImage = await readFile(path.join(root, 'resources/icons/64x64.png'));
const data = await mkdtemp(path.join(tmpdir(), 'forge-conditional-controls-'));
const profile = path.join(data, 'profile');
const taskHome = path.join(data, 'home');
const fixture = path.join(data, 'conditional-ui-fixture');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(process.env.FORGE_UI_CONDITIONAL_OUTPUT || path.join(root, `output/playwright/conditional-controls-${runId}`));
const requestedCases = (process.env.FORGE_UI_CONDITIONAL_CASES || '').split(',').map(name => name.trim()).filter(Boolean);
const stopAfterFailure = process.env.FORGE_UI_CONDITIONAL_STOP_AFTER_FAILURE !== '0';
const report = {
  valid: false, completeCoverage: false, recordedAt: new Date().toISOString(), runId, data, profile, fixture,
  scope: 'Isolated persisted and explicitly synthetic UI fixtures. No executed task/model or complete online task acceptance.',
  operations: [], cases: [], failures: [], blocked: [], screenshots: [], fixtureSetup: [], sourceHashes: {},
  requestedCases, stopAfterFailure, skippedCases: [], recovery: [],
};
await Promise.all([profile, taskHome, fixture, output].map(dir => mkdir(dir, { recursive: true })));
await writeFile(path.join(profile, 'settings.json'), JSON.stringify({ onboardingCompleted: true, language: 'en', theme: 'light', reduceMotion: true, sentryEnabled: false, autoUpdateEnabled: false }));
await writeFile(path.join(fixture, 'README.md'), '# CONDITIONAL UI FIXTURE\nThese are explicit UI states, not model or execution evidence.\n');
const fixtureGit = args => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-c', 'user.name=Forge Conditional UI QA', '-c', 'user.email=ui-qa@example.invalid', ...args], { cwd: fixture, stdio: 'pipe', env: { ...process.env, HOME: taskHome, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' } });
fixtureGit(['init', '-b', 'main']);
fixtureGit(['add', '.']);
fixtureGit(['commit', '-m', 'Initialize explicit conditional UI fixture']);
for (const file of ['out/main/index.js', 'out/preload/index.mjs', 'out/renderer/index.html']) {
  report.sourceHashes[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
}
for (const file of await readdir(path.join(root, 'out/renderer/assets'))) {
  if (/\.(js|css)$/.test(file)) report.sourceHashes[`out/renderer/assets/${file}`] = createHash('sha256').update(await readFile(path.join(root, 'out/renderer/assets', file))).digest('hex');
}
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(TOKEN|SECRET|API_KEY|AUTH|COOKIE|CLAUDE|CODEX|OPENAI|ANTHROPIC|GITHUB|GITLAB|AZURE|AWS|GOOGLE|GEMINI|VERTEX|OPENROUTER|ZAI)/i.test(key)));
Object.assign(env, { HOME: taskHome, CFFIXED_USER_HOME: taskHome, XDG_CONFIG_HOME: path.join(taskHome, '.config'), NODE_ENV: 'test', FORGE_GLASS_PREVIEW_USER_DATA_DIR: profile, FORGE_GLASS_PREVIEW_PTY_USER_DATA_DIR: profile });
let app, page, projectId, sequence = 0, currentCase = 'launch';
const trace = path.join(output, 'operations.jsonl');
await writeFile(trace, '');
const locales = {};
async function t(namespace, key, values = {}) {
  locales[namespace] ??= JSON.parse(await readFile(path.join(root, 'src/shared/i18n/locales/en', `${namespace}.json`), 'utf8'));
  let value = key.split('.').reduce((entry, part) => entry?.[part], locales[namespace]);
  assert.equal(typeof value, 'string', `Missing locale ${namespace}:${key}`);
  for (const [name, replacement] of Object.entries(values)) value = value.replaceAll(`{{${name}}}`, String(replacement));
  return value;
}
const observed = new Map(), covered = new Set();
async function snapshot() {
  const state = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button,a[href],input,textarea,[role="button"],[role="checkbox"],[role="switch"],[role="tab"],[role="combobox"],[role="menuitem"],[role="option"]')].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    const labels = new Map();
    const controls = nodes.map(node => {
      const role = node.getAttribute('role') || node.tagName.toLowerCase();
      const name = node.getAttribute('aria-label') || (node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent?.trim() : '') || node.getAttribute('title') || node.textContent?.trim().replace(/\s+/g, ' ') || node.getAttribute('placeholder') || '';
      const base = `${role}|${node.id}|${name}`;
      const ordinal = (labels.get(base) || 0) + 1; labels.set(base, ordinal);
      return { key: `${base}|${ordinal}`, role, id: node.id, name, ordinal, disabled: node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true', checked: node.getAttribute('aria-checked') };
    });
    return { text: document.body.innerText.slice(0, 30000), controls, dialogs: [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(node => node.getClientRects().length).map(node => node.innerText.slice(0, 18000)) };
  });
  for (const control of state.controls) observed.set(`${currentCase}|${control.key}`, { case: currentCase, ...control });
  state.aria = await page.locator('body').ariaSnapshot();
  return state;
}
async function action(locator, label, operation, interaction = 'other') {
  const entry = { sequence: ++sequence, case: currentCase, label, interaction, before: await snapshot() };
  try {
    if (locator) {
      await locator.waitFor({ state: 'visible', timeout: 10000 });
      entry.target = await locator.evaluate(node => {
        const role = node.getAttribute('role') || node.tagName.toLowerCase();
        const name = node.getAttribute('aria-label') || (node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent?.trim() : '') || node.getAttribute('title') || node.textContent?.trim().replace(/\s+/g, ' ') || node.getAttribute('placeholder') || '';
        const matches = [...document.querySelectorAll(node.tagName.toLowerCase())].filter(item => item.getClientRects().length && (item.getAttribute('role') || item.tagName.toLowerCase()) === role && (item.getAttribute('aria-label') || (item.id ? document.querySelector(`label[for="${CSS.escape(item.id)}"]`)?.textContent?.trim() : '') || item.getAttribute('title') || item.textContent?.trim().replace(/\s+/g, ' ') || item.getAttribute('placeholder') || '') === name);
        return { key: `${role}|${node.id}|${name}|${matches.indexOf(node) + 1}`, role, id: node.id, name };
      });
      if (await locator.isDisabled()) {
        entry.status = 'blocked-disabled';
        report.blocked.push({ case: currentCase, label, target: entry.target, reason: 'Disabled in this explicitly labelled fixture state' });
      } else {
        await locator.scrollIntoViewIfNeeded(); await operation(); entry.status = 'passed';
        covered.add(`${currentCase}|${entry.target.key}`);
      }
    } else { await operation(); entry.status = 'passed'; }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  } catch (error) { entry.status = 'failed'; entry.error = String(error); report.failures.push({ case: currentCase, label, error: String(error) }); throw error; }
  finally {
    entry.after = await snapshot().catch(error => ({ error: String(error) }));
    report.operations.push({ sequence: entry.sequence, case: currentCase, label, interaction, target: entry.target, status: entry.status, error: entry.error });
    await appendFile(trace, `${JSON.stringify(entry)}\n`);
  }
}
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const main = () => page.locator('main');
const dialog = () => page.getByRole('dialog').last();
const click = (locator, label) => action(locator, label, () => locator.click(), 'click');
const fill = (locator, value, label) => action(locator, label, () => locator.fill(value), 'fill');
const press = (key, label) => action(null, label, () => page.keyboard.press(key), 'key');
async function shot(name) { const file = `${String(sequence).padStart(4, '0')}-${name}.png`; await page.screenshot({ path: path.join(output, file), animations: 'disabled' }); report.screenshots.push(file); }
async function blocked(label, reason) { report.blocked.push({ case: currentCase, label, reason, state: await snapshot() }); }
async function closeLayers() {
  const layers = page.locator('[role="dialog"]:visible,[role="alertdialog"]:visible,[role="menu"]:visible,[role="listbox"]:visible');
  for (let i = 0; i < 8 && await layers.count(); i++) {
    const before = await page.locator('body').ariaSnapshot();
    await press('Escape', 'Close fixture UI layer');
    if (await layers.count() && await page.locator('body').ariaSnapshot() === before) {
      const dismiss = layers.last().getByRole('button', { name: /^(Cancel|Close|Back|Dismiss)$/ }).first();
      if (await dismiss.isVisible() && await dismiss.isEnabled()) await click(dismiss, 'Close fixture layer through normal dismissal');
    }
  }
  assert.equal(await layers.count(), 0, 'Cannot recover a UI layer through normal controls; stop');
}
async function nav(key) {
  await closeLayers();
  const target = page.locator('.forge-glass-sidebar').getByRole('button', { name: await t('navigation', `items.${key}`), exact: true });
  await click(target, `Navigate ${key}`);
  await expect(target).toHaveAttribute('aria-current', 'page');
}
function selectedCase(name) {
  if (!requestedCases.length) return true;
  if (requestedCases.some(selected => name === selected || name.startsWith(selected))) return true;
  // A focused feature retry still loads its real persisted fixture through Main.
  if (/fixture-setup/.test(name) && requestedCases.some(selected => selected.startsWith(name.split('-fixture-setup')[0]))) return true;
  return name === 'conditional-changelog-completed-task-fixture' && requestedCases.some(selected => selected.startsWith('conditional-changelog'));
}
async function segment(name, work) {
  if (!selectedCase(name)) { report.skippedCases.push({ name, reason: 'Not selected by FORGE_UI_CONDITIONAL_CASES; no coverage claimed' }); return; }
  currentCase = name; const failureCount = report.failures.length;
  console.log(JSON.stringify({ segment: name, status: 'started', actions: sequence }));
  let failure;
  try { await work(); report.cases.push({ name, status: 'passed' }); }
  catch (error) { failure = error; if (failureCount === report.failures.length) report.failures.push({ case: name, error: String(error) }); report.cases.push({ name, status: 'failed', error: String(error) }); await shot(`${name}-failure`).catch(() => {}); }
  if (failure) {
    try {
      const before = await snapshot(); await nav('kanban'); await page.locator('.forge-glass-board').waitFor();
      report.recovery.push({ case: name, before, after: await snapshot() });
    } catch (error) { report.recoveryError = { case: name, error: String(error) }; throw error; }
  }
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ segment: name, actions: sequence, failures: report.failures.length, blocked: report.blocked.length }));
  if (failure && stopAfterFailure) throw new Error(`Stopped after ${name}; inspect the first failed action and retry with FORGE_UI_CONDITIONAL_CASES. ${String(failure)}`);
}
async function launch() {
  app = await electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [root], env });
  await app.firstWindow(); page = app.windows().find(candidate => candidate.url().includes('/renderer/index.html')); assert.ok(page);
  page.setDefaultTimeout(10000);
  await app.evaluate(({ app: application, BrowserWindow, shell }) => {
    const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().includes('/renderer/index.html'));
    window?.webContents.closeDevTools(); application.focus({ steal: true }); window?.show(); window?.focus(); window?.webContents.focus();
    globalThis.__conditionalExternalRequests = [];
    shell.openExternal = async url => { globalThis.__conditionalExternalRequests.push(url); };
  });
  await page.setViewportSize({ width: 1440, height: 960 }); await page.bringToFront();
  await page.locator('.forge-glass-sidebar').waitFor({ timeout: 30000 });
  const dirs = await app.evaluate(({ app: application }) => ({ home: application.getPath('home'), userData: application.getPath('userData'), envHome: process.env.HOME }));
  assert.equal(dirs.home, taskHome); assert.equal(dirs.envHome, taskHome); assert.equal(dirs.userData, profile);
  report.effectiveDirectories = dirs;
  report.appVersion = await page.evaluate(() => window.electronAPI.getAppVersion());
  const accounts = await page.evaluate(() => window.electronAPI.getProviderAccounts());
  assert.ok(accounts.success && accounts.data.accounts.length === 0, 'No configured provider account is allowed');
  report.providerAccountCountAtLaunch = accounts.data.accounts.length;
}
async function refreshTasks() { await nav('kanban'); await click(button('Refresh Tasks', main()), 'Reload explicit persisted task fixtures'); }
async function createTaskFixture(title, options = {}) {
  const created = await page.evaluate(async ({ projectId, title }) => window.electronAPI.createTask(projectId, title, 'Explicit conditional UI fixture. No model or task run occurred.', { sourceType: 'manual', pushNewBranches: false }), { projectId, title });
  assert.ok(created.success && created.data);
  const task = created.data, specDir = task.specsPath;
  assert.ok(path.resolve(specDir).startsWith(path.resolve(fixture) + path.sep));
  const planPath = path.join(specDir, 'implementation_plan.json');
  const original = JSON.parse(await readFile(planPath, 'utf8'));
  const now = new Date().toISOString();
  const plan = { ...original, feature: title, title, status: options.status || 'human_review', xstateState: options.xstateState || 'human_review', executionPhase: options.executionPhase || 'complete', ...(options.reviewReason ? { reviewReason: options.reviewReason } : {}), phases: [{ phase: 1, name: 'Explicit UI fixture phase', type: 'implementation', subtasks: [{ id: 'fixture-step', title: 'Synthetic UI fixture step', description: 'No executor ran this step.', status: options.subtaskStatus || 'completed' }] }], created_at: now, updated_at: now, final_acceptance: [] };
  if (!options.reviewReason) delete plan.reviewReason;
  await writeFile(planPath, JSON.stringify(plan, null, 2));
  await writeFile(path.join(specDir, 'spec.md'), '# Explicit conditional UI fixture\nThis document renders UI states only. It does not certify online task execution, review, or validation.\n');
  const phases = Object.fromEntries(['planning', 'coding', 'validation'].map(phase => [phase, { phase, status: 'completed', started_at: now, completed_at: now, entries: [
    { timestamp: now, phase, type: 'info', content: `Synthetic ${phase} UI fixture`, detail: 'Explicit expandable fixture detail. No model execution occurred.', collapsed: true },
    { timestamp: now, phase, type: 'tool_start', tool_name: 'Read', tool_input: 'fixture.md', content: 'Synthetic tool start' },
    { timestamp: now, phase, type: 'tool_end', tool_name: 'Read', content: 'Synthetic tool end', detail: 'Synthetic expanded tool output' },
    { timestamp: now, phase, type: 'text', content: 'Synthetic plain fixture text', detail: 'Synthetic expandable plain detail' },
    { timestamp: now, phase, type: 'error', content: 'Synthetic fixture error entry', detail: 'Synthetic expandable error detail' },
  ] }]));
  await writeFile(path.join(specDir, 'task_logs.json'), JSON.stringify({ spec_id: task.specId, created_at: now, updated_at: now, phases }, null, 2));
  report.fixtureSetup.push({ kind: 'persisted-conditional-task-UI-fixture', taskId: task.id, specDir, plan: { status: plan.status, xstateState: plan.xstateState, reviewReason: plan.reviewReason }, realExecution: false });
  return { ...task, title, specDir, planPath };
}
async function withGitUnavailable(work) {
  const saved = path.join(data, 'fixture-git-preflight-held');
  await rename(path.join(fixture, '.git'), saved);
  report.fixtureSetup.push({ kind: 'temporary-missing-Git-preflight', reason: 'Abort before authentication or model execution', project: fixture });
  try { await work(); } finally { await rename(saved, path.join(fixture, '.git')); }
}

try {
  await launch();
  const setup = await page.evaluate(async fixture => {
    const added = await window.electronAPI.addProject(fixture); if (!added.success || !added.data) throw new Error(added.error || 'Fixture add failed');
    const init = await window.electronAPI.initializeProject(added.data.id); if (!init.success) throw new Error(init.error || 'Fixture init failed');
    const branch = await window.electronAPI.updateProjectSettings(added.data.id, { mainBranch: 'main' }); if (!branch.success) throw new Error(branch.error || 'Fixture branch setup failed');
    const tabs = await window.electronAPI.saveTabState({ openProjectIds: [added.data.id], activeProjectId: added.data.id, tabOrder: [added.data.id] }); if (!tabs.success) throw new Error(tabs.error || 'Fixture tab setup failed');
    return added.data.id;
  }, fixture);
  projectId = setup; await app.close(); app = undefined; await launch();
  report.project = (await page.evaluate(() => window.electronAPI.getProjects())).data.find(project => project.id === projectId);
  assert.equal(report.project.path, fixture); report.projectId = projectId;
  assert.equal(report.project.settings.mainBranch, 'main');
  report.fixtureSetup.push({ kind: 'isolated-project-known-main-branch', branch: 'main', reason: 'Prevent GitHub settings auto-detection from changing configuration during synthetic copy verification', productData: false });
  await walkConditionalQueueBoundary({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, action, press, segment, shot, blocked, nav, closeLayers, createTaskFixture, refreshTasks });
  await walkConditionalTaskWizardPush({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, action, press, segment, shot, blocked, nav });
  await page.locator('.forge-glass-board').waitFor({ timeout: 30000 });
  report.fixtureSetup.push({ kind: 'isolated-project-main-api-initialization', projectId, path: fixture, hasRemote: false });
  await page.evaluate(() => {
    window.__conditionalTaskErrors = [];
    window.__conditionalTaskErrorUnsub = window.electronAPI.onTaskError((taskId, error) => window.__conditionalTaskErrors.push({ taskId, error }));
  });

  await segment('conditional-task-review-logs-files-and-failed-feedback', async () => {
    const task = await createTaskFixture('Conditional review fixture', { reviewReason: 'completed' });
    await mkdir(path.join(task.specDir, 'QA_FIX_REQUEST.md'));
    report.fixtureSetup.push({ kind: 'review-write-failure-fixture', path: path.join(task.specDir, 'QA_FIX_REQUEST.md'), reason: 'Directory forces real feedback write failure before QA agent launch' });
    await refreshTasks(); await click(button(task.title), 'Open completed-review UI fixture');
    const tabs = await dialog().getByRole('tab').allTextContents();
    for (const name of tabs) await click(dialog().getByRole('tab', { name: name.trim(), exact: true }), `Task fixture tab ${name}`);
    await click(dialog().getByRole('tab', { name: await t('uiTasks', 'tabs.subtasks', { count: 1 }), exact: true }), 'Open populated fixture subtasks');
    await click(button(await t('tasks', 'subtasks.expandAll'), dialog()), 'Expand every fixture subtask');
    await click(button(await t('tasks', 'subtasks.collapseAll'), dialog()), 'Collapse every fixture subtask');
    const subtask = dialog().getByRole('button', { name: /Synthetic UI fixture step/ });
    await click(subtask, 'Expand individual fixture subtask'); await click(subtask, 'Collapse individual fixture subtask');
    await click(dialog().getByRole('tab', { name: 'Logs', exact: true }), 'Open persisted fixture logs');
    for (const phase of ['planning', 'coding', 'validation']) {
      const label = await t('uiTasks', `phases.${phase}`);
      await click(dialog().getByRole('button', { name: new RegExp(`^${label}`) }), `Expand ${phase} fixture logs`);
      for (const key of ['showOutput', 'hideOutput', 'more', 'less']) {
        const label = await t('uiTasks', `logs.${key}`);
        for (const target of await dialog().getByRole('button', { name: label, exact: true }).all()) if (await target.isVisible()) await click(target, `${phase} ${label}`);
      }
      const errorToggle = dialog().getByText('Synthetic fixture error entry', { exact: true }).locator('..').getByRole('button');
      await click(errorToggle, `${phase} expand icon-only fixture error detail`);
      await click(errorToggle, `${phase} collapse icon-only fixture error detail`);
      await click(dialog().getByRole('button', { name: new RegExp(`^${label}`) }), `Collapse ${phase} fixture logs`);
    }
    await click(dialog().getByRole('tab', { name: 'Files', exact: true }), 'Open real fixture spec files');
    const files = dialog().getByRole('listbox', { name: await t('tasks', 'files.title'), exact: true });
    const fileNames = await files.getByRole('option').allTextContents();
    assert.ok(fileNames.length >= 3, 'Spec fixtures must load through the actual Main file list');
    for (const fileName of fileNames) await click(files.getByRole('option', { name: fileName.trim(), exact: true }), `Read fixture spec file ${fileName.trim()}`);
    await click(button(await t('common', 'buttons.refresh'), dialog()), 'Refresh fixture spec file list');
    await files.getByRole('option', { name: 'spec.md', exact: true }).waitFor();
    const specPath = path.join(task.specDir, 'spec.md'), heldSpec = path.join(data, 'temporarily-held-fixture-spec.md');
    await rename(specPath, heldSpec);
    report.fixtureSetup.push({ kind: 'real-spec-file-read-failure', path: specPath, reason: 'Temporarily absent isolated fixture file; actual read IPC returns error' });
    try {
      await click(files.getByRole('option', { name: 'spec.md', exact: true }), 'Read temporarily missing spec fixture');
      await dialog().getByText(await t('tasks', 'files.errorLoadingContent'), { exact: true }).waitFor();
      await click(button(await t('tasks', 'files.retry'), dialog()), 'Retry missing spec fixture read');
    } finally { await rename(heldSpec, specPath); }
    await click(button(await t('tasks', 'files.retry'), dialog()), 'Retry restored spec fixture read');
    await dialog().getByText('This document renders UI states only.', { exact: false }).waitFor();
    await click(dialog().getByRole('tab', { name: await t('uiTasks', 'tabs.overview'), exact: true }), 'Return to review overview');
    const feedback = dialog().getByPlaceholder(await t('uiTasks', 'review.feedbackPlaceholder'));
    await fill(feedback, 'Keep this explicit QA fixture feedback after genuine write failure.', 'Enter review fixture feedback');
    await action(feedback, 'Paste disposable review image through real paste handler', () => feedback.evaluate((node, base64) => {
      const data = Uint8Array.from(atob(base64), value => value.charCodeAt(0));
      const clipboard = new DataTransfer(); clipboard.items.add(new File([data], 'fixture-feedback.png', { type: 'image/png' }));
      node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
    }, feedbackImage.toString('base64')));
    const attached = dialog().getByRole('img', { name: /^screenshot-/ });
    await attached.waitFor();
    await expect.poll(() => attached.evaluate(node => node.complete && node.naturalWidth === 64 && node.naturalHeight === 64)).toBe(true);
    report.fixtureSetup.push({ kind: 'decoded-feedback-image', source: 'resources/icons/64x64.png', sha256: createHash('sha256').update(feedbackImage).digest('hex'), renderedSize: { width: 64, height: 64 }, realModelExecution: false });
    await click(button(await t('uiTasks', 'review.requestChanges'), dialog()), 'Request Changes real write-failure branch');
    await expect(feedback).toHaveValue('Keep this explicit QA fixture feedback after genuine write failure.');
    await expect(attached).toBeVisible();
    await page.getByText(await t('uiTasks', 'errors.reviewFailed'), { exact: true }).last().waitFor();
    assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), task.id)).data, false);
    await shot('review-failure-retains-feedback');
    await attached.hover(); await click(button(await t('tasks', 'feedback.removeImage'), dialog()), 'Remove preserved review fixture image');
    await click(button('Close', dialog()).last(), 'Close task via footer');
    await click(button(task.title), 'Reopen fixture review before marking local UI record done');
    const heldPlan = path.join(data, 'temporarily-held-fixture-plan.json');
    await rename(task.planPath, heldPlan); await mkdir(task.planPath);
    report.fixtureSetup.push({ kind: 'real-plan-status-persistence-failure', path: task.planPath, reason: 'Directory forces actual Main status write/read failure; no fake success result' });
    try {
      await click(button(await t('taskReview', 'merge.actions.markAsDone'), dialog()), 'Mark Done with actual isolated plan persistence failure');
      await dialog().getByRole('alert').waitFor(); await expect(dialog()).toBeVisible();
    } finally { await rm(task.planPath, { recursive: true }); await rename(heldPlan, task.planPath); }
    await click(button(await t('taskReview', 'merge.actions.markAsDone'), dialog()), 'Mark explicit no-worktree fixture record done');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const saved = JSON.parse(await readFile(task.planPath, 'utf8'));
    assert.equal(saved.status, 'done');
    await click(button('Archive all done tasks', main()), 'Archive explicit completed fixture record');
    const archivedToggle = button(await t('common', 'accessibility.toggleShowArchivedAriaLabel'), main());
    await click(archivedToggle, 'Show archived task fixture');
    await expect(archivedToggle).toHaveAttribute('aria-pressed', 'true');
    await click(button(task.title), 'Open archived fixture task details');
    await click(button('Close', dialog()).first(), 'Close task via header');
    await click(archivedToggle, 'Hide archived fixture tasks');
    await expect(archivedToggle).toHaveAttribute('aria-pressed', 'false');
  });

  await segment('conditional-task-start-resume-stop-and-recovery-preflight', async () => {
    const backlog = await createTaskFixture('Conditional start preflight', { status: 'backlog', xstateState: 'backlog', executionPhase: 'idle', subtaskStatus: 'pending' });
    const planReview = await createTaskFixture('Conditional plan review', { reviewReason: 'plan_review', xstateState: 'plan_review', executionPhase: 'planning', subtaskStatus: 'pending' });
    const incomplete = await createTaskFixture('Conditional incomplete Resume', { executionPhase: 'coding', subtaskStatus: 'pending' });
    const stopped = await createTaskFixture('Conditional Stop fixture', { status: 'in_progress', xstateState: 'coding', executionPhase: 'coding', subtaskStatus: 'in_progress' });
    const stuck = await createTaskFixture('Conditional Recover fixture', { status: 'ai_review', xstateState: 'qa_review', executionPhase: 'qa_review', subtaskStatus: 'in_progress' });
    const cardStuck = await createTaskFixture('Conditional card Recover fixture', { status: 'in_progress', xstateState: 'coding', executionPhase: 'coding', subtaskStatus: 'in_progress' });
    await refreshTasks();
    await click(button(backlog.title), 'Open start fixture');
    await withGitUnavailable(async () => {
      await click(button('Start', dialog()), 'Start task missing-Git preflight');
      await page.waitForFunction(taskId => window.__conditionalTaskErrors.some(entry => entry.taskId === taskId && /Git repository required/.test(entry.error)), backlog.id);
    });
    assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), backlog.id)).data, false);
    await closeLayers(); await click(button(planReview.title), 'Open plan approval fixture');
    await withGitUnavailable(async () => {
      await click(button(await t('uiTasks', 'review.proceedToCoding'), dialog()), 'Proceed to Coding missing-Git preflight');
      await page.waitForFunction(taskId => window.__conditionalTaskErrors.some(entry => entry.taskId === taskId && /Git repository required/.test(entry.error)), planReview.id);
    });
    assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), planReview.id)).data, false);
    await closeLayers(); await refreshTasks(); await click(button(incomplete.title), 'Open incomplete-human-review Resume fixture');
    await withGitUnavailable(async () => {
      await click(button(await t('tasks', 'actions.resume'), dialog()), 'Resume incomplete task missing-Git preflight');
      await page.waitForFunction(taskId => window.__conditionalTaskErrors.some(entry => entry.taskId === taskId && /Git repository required/.test(entry.error)), incomplete.id);
    });
    assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), incomplete.id)).data, false);
    await closeLayers(); await click(button(stopped.title), 'Open synthetic running-state Stop fixture');
    await click(button('Stop', dialog()), 'Stop explicit state with no actual process');
    assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), stopped.id)).data, false);
    await closeLayers(); await refreshTasks(); await click(button(stuck.title), 'Open stuck-state fixture');
    // Exercise the actual 60-second stale-process check. Do not claim a real run stalled.
    await button('Recover', dialog()).last().waitFor({ state: 'visible', timeout: 70000 });
    await withGitUnavailable(async () => {
      await click(button('Recover', dialog()).last(), 'Recover state with missing-Git restart preflight');
      // Wait for the actual IPC response reflected in the UI before restoring
      // Git; otherwise an asynchronous restart could observe restored Git.
      await page.getByText(await t('uiTasks', 'notifications.taskRecovered'), { exact: true }).last().waitFor();
    });
    assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), stuck.id)).data, false);
    await shot('recovery-preflight-state'); await closeLayers();
    const recoveredTitle = await t('uiTasks', 'notifications.taskRecovered');
    await page.getByText(recoveredTitle, { exact: true }).last().waitFor({ state: 'hidden', timeout: 15000 });
    const card = main().locator(`[data-task-id="${cardStuck.id}"]`);
    await button(await t('tasks', 'actions.recover'), card).waitFor({ state: 'visible', timeout: 15000 });
    await withGitUnavailable(async () => {
      await click(button(await t('tasks', 'actions.recover'), card), 'Recover directly from distinct board card via real missing-Git preflight');
      await page.getByText(recoveredTitle, { exact: true }).last().waitFor();
    });
    assert.equal(await page.getByRole('dialog').count(), 0, 'Board card recovery must not open task detail');
    assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), cardStuck.id)).data, false);
    await blocked('Real task execution and live stop/resume/recovery', 'Clicked explicit UI fixtures and genuine preflight refusal; no live executor, online model call or complete task run was performed');
  });

  await segment('conditional-task-card-action-controls', async () => {
    const backlog = await createTaskFixture('Conditional card Start control', { status: 'backlog', xstateState: 'backlog', executionPhase: 'idle', subtaskStatus: 'pending' });
    const incomplete = await createTaskFixture('Conditional card Resume control', { executionPhase: 'coding', subtaskStatus: 'pending' });
    const stopped = await createTaskFixture('Conditional card Stop control', { status: 'in_progress', xstateState: 'coding', executionPhase: 'coding', subtaskStatus: 'in_progress' });
    const done = await createTaskFixture('Conditional card Archive control', { status: 'done', xstateState: 'done' });
    await refreshTasks();
    const card = task => main().locator(`[data-task-id="${task.id}"]`);
    for (const [task, key] of [[backlog, 'start'], [incomplete, 'resume']]) {
      await withGitUnavailable(async () => {
        await click(button(await t('tasks', `actions.${key}`), card(task)), `Card ${key} via actual missing-Git preflight`);
        await page.waitForFunction(taskId => window.__conditionalTaskErrors.some(entry => entry.taskId === taskId && /Git repository required/.test(entry.error)), task.id);
      });
      assert.equal(await page.getByRole('dialog').count(), 0, `Card ${key} must not open task detail`);
      assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), task.id)).data, false);
    }
    await click(button(await t('tasks', 'actions.stop'), card(stopped)), 'Card Stop with explicit state and no actual executor');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), stopped.id)).data, false);
    await click(button(await t('tasks', 'tooltips.archiveTask'), card(done)), 'Archive explicit completed UI fixture through card action');
    await expect(card(done)).toHaveCount(0);
    const metadata = JSON.parse(await readFile(path.join(done.specDir, 'task_metadata.json'), 'utf8'));
    assert.ok(metadata.archivedAt, 'Card Archive must persist actual archived metadata');
    await shot('task-distinct-board-card-actions');
    await blocked('Board card live execution outcomes', 'Distinct card controls used actual preflight refusals and local archive persistence; no model or executor ran');
  });

  await segment('conditional-task-paused-resume-signal', async () => {
    for (const phase of ['rate_limit_paused', 'auth_failure_paused']) {
      const task = await createTaskFixture(`Conditional ${phase} Resume`, { status: 'in_progress', xstateState: 'coding', executionPhase: phase, subtaskStatus: 'in_progress' });
      await refreshTasks(); await click(button(task.title), `Open explicit ${phase} fixture`);
      await click(button(await t('uiTasks', 'actions.resumePausedTask'), dialog()), `Request ${phase} resume through actual Main signal`);
      const signal = JSON.parse(await readFile(path.join(task.specDir, 'RESUME'), 'utf8'));
      assert.equal(signal.resumed_by, 'user'); assert.ok(!Number.isNaN(Date.parse(signal.resumed_at)));
      const saved = JSON.parse(await readFile(task.planPath, 'utf8'));
      assert.equal(saved.executionPhase, phase, 'Writing resume signal must not fabricate a running phase');
      assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), task.id)).data, false);
      report.fixtureSetup.push({ kind: 'real-resume-signal-without-executor', taskId: task.id, signalPath: path.join(task.specDir, 'RESUME'), phase, executionResumed: false });
      await shot(`${phase}-resume-request-only`); await closeLayers();
    }
    await blocked('Live executor acknowledgement of paused resume', 'Actual RESUME signal was written through the normal UI, but no process was present to acknowledge or resume execution');
  });

  await segment('conditional-task-warning-action-controls', async () => {
    const incomplete = await createTaskFixture('Conditional warning Resume control', { executionPhase: 'coding', subtaskStatus: 'pending' });
    const stuck = await createTaskFixture('Conditional warning Recover control', { status: 'ai_review', xstateState: 'qa_review', executionPhase: 'qa_review', subtaskStatus: 'in_progress' });
    await refreshTasks(); await click(button(incomplete.title), 'Open distinct incomplete warning control fixture');
    await withGitUnavailable(async () => {
      await click(button(await t('uiTasks', 'warnings.resume'), dialog()), 'Click warning Resume task via real missing-Git preflight');
      await page.waitForFunction(taskId => window.__conditionalTaskErrors.some(entry => entry.taskId === taskId && /Git repository required/.test(entry.error)), incomplete.id);
    });
    assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), incomplete.id)).data, false);
    await closeLayers(); await refreshTasks(); await click(button(stuck.title), 'Open distinct stuck warning control fixture');
    const recover = button(await t('uiTasks', 'warnings.recover'), dialog());
    await recover.waitFor({ state: 'visible', timeout: 70000 });
    await withGitUnavailable(async () => {
      await click(recover, 'Click warning Recover and restart via real missing-Git preflight');
      await page.getByText(await t('uiTasks', 'notifications.taskRecovered'), { exact: true }).last().waitFor();
    });
    assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), stuck.id)).data, false);
    await shot('task-distinct-warning-action-controls'); await closeLayers();
    await blocked('Warning control live executor outcomes', 'Distinct warning buttons were clicked with genuine missing-Git refusal and no executor present; these are UI fixtures, not resumed/restarted execution');
  });

  await segment('conditional-insights-history-single-and-bulk-actions', async () => {
    const ids = await page.evaluate(async projectId => {
      const ids = [];
      for (let i = 1; i <= 5; i++) { const result = await window.electronAPI.newInsightsSession(projectId); if (!result.success || !result.data) throw new Error(result.error || 'Session fixture failed'); await window.electronAPI.renameInsightsSession(projectId, result.data.id, `Conditional conversation ${i}`); ids.push(result.data.id); }
      return ids;
    }, projectId);
    report.fixtureSetup.push({ kind: 'real-local-empty-insights-sessions', ids, messages: 0, modelExecution: false });
    await nav('insights');
    const row = name => main().locator('div[role="button"]').filter({ has: page.getByText(name, { exact: true }) }).first();
    await row('Conditional conversation 1').waitFor();
    await click(row('Conditional conversation 1').getByRole('button', { name: 'More options', exact: true }), 'Single conversation menu');
    await click(page.getByRole('menuitem', { name: 'Delete', exact: true }), 'Single history Delete');
    await click(page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }), 'Confirm real local empty conversation deletion');
    await page.getByText('Conditional conversation 1', { exact: true }).waitFor({ state: 'hidden' });
    await click(button('Select', main()), 'Enter history bulk selection'); await click(button('Select all', main()), 'Select remaining empty sessions');
    const count = (await page.evaluate(id => window.electronAPI.listInsightsSessions(id), projectId)).data.filter(item => !item.archivedAt).length;
    const toolbarGeometry = await button(`Archive Selected (${count})`, main()).evaluate(node => {
      const toolbar = node.parentElement, sidebar = toolbar.parentElement;
      const rect = value => { const { left, right, width, top, bottom } = value.getBoundingClientRect(); return { left, right, width, top, bottom }; };
      return { sidebar: rect(sidebar), toolbar: rect(toolbar), buttons: [...toolbar.querySelectorAll('button')].map(button => ({ name: button.innerText, ...rect(button) })) };
    });
    assert.equal(Math.round(toolbarGeometry.sidebar.width), 256, 'Verify actual narrow history sidebar geometry');
    for (const target of toolbarGeometry.buttons) {
      assert.ok(target.left >= toolbarGeometry.sidebar.left && target.right <= toolbarGeometry.sidebar.right, 'History actions must fit wholly inside the sidebar, without composer overlap');
    }
    report.historyToolbarGeometry = toolbarGeometry;
    await click(button(`Archive Selected (${count})`, main()), 'Bulk archive empty fixture conversations');
    await click(page.getByRole('alertdialog').getByRole('button', { name: `Archive ${count} Conversation(s)`, exact: true }), 'Confirm real bulk history archive');
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    await click(button('Done', main()), 'Exit history selection'); await click(button('Show Archived', main()), 'Show archived real fixture sessions');
    await click(button('Select', main()), 'Select archived fixture sessions'); await click(button('Select all', main()), 'Select every visible history record');
    const selected = main().getByRole('button', { name: /^Delete Selected \(\d+\)$/ });
    const deleteCount = Number((await selected.textContent()).match(/\((\d+)\)/)[1]);
    await click(selected, 'Bulk delete empty fixture history records');
    await click(page.getByRole('alertdialog').getByRole('button', { name: `Delete ${deleteCount} Conversation(s)`, exact: true }), 'Confirm real bulk history delete');
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    const after = await page.evaluate(id => window.electronAPI.listInsightsSessions(id, true), projectId);
    assert.ok(after.success && !after.data.some(item => ids.includes(item.id))); await shot('history-real-bulk-actions');
  });

  await segment('conditional-insights-new-conversation-and-screenshot-entry', async () => {
    await nav('insights');
    const before = await page.evaluate(id => window.electronAPI.listInsightsSessions(id, true), projectId);
    assert.ok(before.success);
    const beforeIds = new Set(before.data.map(session => session.id));
    await click(button(await t('common', 'accessibility.newConversationAriaLabel'), main()), 'Create empty conversation from distinct history header entry');
    await expect.poll(async () => {
      const after = await page.evaluate(id => window.electronAPI.listInsightsSessions(id, true), projectId);
      assert.ok(after.success);
      return after.data.filter(session => !beforeIds.has(session.id)).length;
    }).toBe(1);
    const current = await page.evaluate(id => window.electronAPI.getInsightsSession(id), projectId);
    assert.ok(current.success && current.data && !beforeIds.has(current.data.id));
    assert.equal(current.data.messages.length, 0, 'New conversation must not invoke a model');
    report.fixtureSetup.push({ kind: 'real-local-empty-conversation-via-history-header', id: current.data.id, modelCalls: 0 });
    const camera = button(await t('common', 'insights.images.screenshotButton'), main());
    await click(camera, 'Open screenshot capture from distinct Insights camera');
    await expect(dialog().getByRole('heading', { name: await t('tasks', 'screenshot.title'), exact: true })).toBeVisible();
    const packaged = await app.evaluate(({ app: application }) => application.isPackaged);
    if (!packaged) {
      await expect(dialog().getByText(await t('tasks', 'screenshot.devMode.title'), { exact: true })).toBeVisible();
      await click(button(await t('common', 'buttons.refresh'), dialog()), 'Screenshot refresh disabled in development preview');
      await click(button(await t('tasks', 'screenshot.capture'), dialog()), 'Screenshot capture disabled in development preview');
      await blocked('Real screenshot source enumeration and capture', 'Main returned its actual development-mode refusal; no screen pixels or platform permission were requested');
    } else {
      await blocked('Real screenshot source selection and capture', 'This control-only fixture does not select or attach pixels from the user desktop; platform capture remains separately unverified');
    }
    await shot('insights-distinct-screenshot-entry-state');
    await click(button(await t('common', 'buttons.cancel'), dialog()), 'Cancel Insights screenshot capture through footer');
    await click(camera, 'Reopen Insights screenshot capture for header dismissal');
    await click(button(await t('common', 'buttons.close'), dialog()).last(), 'Dismiss Insights screenshot capture through header');
    await expect(dialog()).toHaveCount(0);
  });

  await walkConditionalScreenshotTransport({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, action, press, segment, shot, blocked, nav, closeLayers, createTaskFixture, refreshTasks });
  await walkConditionalOrdinaryEntries({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, action, press, segment, shot, blocked, nav, closeLayers, createTaskFixture, refreshTasks });
  await walkConditionalGitHubOAuthCopy({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, action, press, segment, shot, blocked, nav, closeLayers, createTaskFixture, refreshTasks });
  const { walkConditionalInsightsHistoryFailures } = await import('./conditional-insights-history-failures.mjs');
  await walkConditionalInsightsHistoryFailures({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, press, segment, shot, blocked, nav, closeLayers });
  await walkConditionalTaskWorktree({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, press, segment, shot, blocked, nav, closeLayers, createTaskFixture, refreshTasks });
  await walkConditionalStagedCopy({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, press, segment, shot, blocked, nav, closeLayers, createTaskFixture, refreshTasks });
  await walkConditionalBulkPR({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, press, segment, shot, blocked, nav, closeLayers, createTaskFixture, refreshTasks });
  await walkConditionalFeatures({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, press, segment, shot, blocked, nav, closeLayers, refreshTasks });
  currentCase = 'conditional-insights-suggested-fixture-setup';
  await walkConditionalInsightsSuggestions({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, press, segment, shot, blocked, nav, closeLayers });
  currentCase = 'conditional-insights-local-fixture-setup';
  await walkConditionalInsightsStream({ app, page, projectId, fixture, profile, report, t, button, main, dialog, click, fill, press, segment, shot, blocked, nav, closeLayers });
  report.externalOpenRequests = await app.evaluate(() => globalThis.__conditionalExternalRequests);
  report.observedControls = [...observed.values()];
  report.unwalkedObservedControls = [...observed].filter(([key]) => !covered.has(key)).map(([, value]) => value);
  report.coverage = { operations: sequence, observedControlInstances: observed.size, interactedControlInstances: covered.size, failures: report.failures.length, blocked: report.blocked.length };
  report.completeCoverage = report.unwalkedObservedControls.length === 0 && report.blocked.length === 0 && report.failures.length === 0;
  report.valid = report.failures.length === 0;
} catch (error) { report.failures.push({ case: currentCase, error: String(error) }); report.valid = false; }
finally {
  report.observedControls = [...observed.values()];
  report.unwalkedObservedControls = [...observed].filter(([key]) => !covered.has(key)).map(([, value]) => value);
  report.coverage = { operations: sequence, observedControlInstances: observed.size, interactedControlInstances: covered.size, failures: report.failures.length, blocked: report.blocked.length };
  report.interactionCounts = Object.fromEntries(['click', 'fill', 'key', 'other'].map(kind => [kind, report.operations.filter(operation => operation.status === 'passed' && operation.interaction === kind).length]));
  const matrixCases = [...report.cases];
  for (const caseName of new Set(report.operations.map(operation => operation.case))) {
    if (!matrixCases.some(entry => entry.name === caseName)) matrixCases.push({ name: caseName, status: 'setup-only', coverageClaim: 'Fixture setup actions; no complete UX outcome asserted' });
  }
  report.caseMatrix = matrixCases.map(entry => ({ ...entry,
    passedActions: report.operations.filter(operation => operation.case === entry.name && operation.status === 'passed').length,
    actualClicks: report.operations.filter(operation => operation.case === entry.name && operation.status === 'passed' && operation.interaction === 'click').length,
    blocked: report.blocked.filter(blocked => blocked.case === entry.name).length,
    unwalkedObservedControls: report.unwalkedObservedControls.filter(control => control.case === entry.name).length,
  }));
  if (app) { try { await app.close(); report.electronClosed = true; } catch (error) { report.cleanupError = String(error); report.valid = false; } }
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ valid: report.valid, completeCoverage: report.completeCoverage, failures: report.failures.length, blocked: report.blocked.length, interactions: report.interactionCounts, output, data }));
  if (!report.valid) process.exitCode = 1;
}
