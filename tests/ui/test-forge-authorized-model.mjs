import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

// Explicit opt-in: one real model-test request, max_tokens=1. No agent run,
// tool call, chat turn, publication or change to the original profile.
if (process.env.FORGE_ALLOW_PAID_UI_TEST !== '1') {
  throw new Error('This live test requires explicit authorization: FORGE_ALLOW_PAID_UI_TEST=1.');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceFile = process.env.FORGE_LIVE_SOURCE_SETTINGS
  || path.join(homedir(), 'Library/Application Support/Forge Glass Preview/settings.json');
const originalBytes = await readFile(sourceFile);
const original = JSON.parse(originalBytes);
const account = original.providerAccounts?.find((item) => item.provider === 'zai' && item.authType === 'api-key' && item.apiKey);
assert.ok(account, 'A configured Z.AI API-key account is required for this authorized live test.');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const data = await mkdtemp(path.join(tmpdir(), 'forge-authorized-model-'));
const profile = path.join(data, 'profile');
const isolatedHome = path.join(data, 'home');
const output = path.join(root, 'output/playwright/full-ux/live');
await Promise.all([profile, isolatedHome, output].map((dir) => mkdir(dir, { recursive: true })));
const safeAccount = { ...account, name: '授权在线测试', id: 'live-zai-account' };
const settings = {
  onboardingCompleted: true, language: 'zh-CN', theme: 'light', colorTheme: 'forge-glass', sentryEnabled: false,
  providerAccounts: [safeAccount], globalPriorityOrder: [safeAccount.id],
};
const report = {
  recordedAt: new Date().toISOString(), data, provider: 'zai', model: 'glm-5',
  originalProfileUnchanged: false, fixtureCredentialRemoved: false, applicationClosed: false,
  actions: [], cleanupFailures: [], valid: false,
  requestLimit: 'one explicit model test, max_tokens=1, no automatic retries',
};
let app;
let modelVerified = false;
let step = 'write-isolated-profile';
try {
  await writeFile(path.join(profile, 'settings.json'), JSON.stringify(settings), { mode: 0o600 });
  report.endpointOrigin = new URL(account.baseUrl || 'https://api.z.ai').origin;
  step = 'launch';
  app = await electron.launch({
    executablePath: path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [root],
    env: { NODE_ENV: 'test', HOME: isolatedHome, CFFIXED_USER_HOME: isolatedHome, PATH: process.env.PATH,
      XDG_CONFIG_HOME: path.join(isolatedHome, '.config'),
      FORGE_GLASS_PREVIEW_USER_DATA_DIR: profile },
  });
  await app.firstWindow();
  const page = app.windows().find((window) => window.url().includes('/renderer/index.html'));
  assert.ok(page);
  page.setDefaultTimeout(20_000);
  await app.evaluate(({ app: application, BrowserWindow }) => {
    application.focus({ steal: true });
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes('/renderer/index.html'));
    window?.webContents.closeDevTools(); window?.show(); window?.focus();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.forge-glass-sidebar').waitFor();
  report.runtime = await app.evaluate(({ app: application }) => ({
    version: application.getVersion(), packaged: application.isPackaged,
    home: application.getPath('home'), appData: application.getPath('appData'), userData: application.getPath('userData'),
  }));
  assert.equal(report.runtime.userData, profile);
  assert.equal(report.runtime.home, isolatedHome);
  step = 'open-model-test';
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '账户', exact: true }).click();
  const test = page.getByRole('button', { name: '测试 授权在线测试 的模型', exact: true });
  await test.waitFor();
  step = 'single-live-model-test';
  console.log(JSON.stringify({ step, provider: 'zai', model: 'glm-5', maxOutputTokens: 1 }));
  await test.click();
  await page.getByText('所选模型已接受这次最小测试请求。', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, '01-model-test.png'), animations: 'disabled' });
  report.actions.push({ action: 'click-test-model', result: 'model-verified', maxOutputTokens: 1, screenshot: '01-model-test.png' });
  modelVerified = true;
} catch (error) {
  // Never serialize network errors, request headers or credential-bearing state.
  report.failure = error instanceof Error && error.name === 'TimeoutError' ? 'UI result timed out' : 'Live UI verification failed';
  report.failedStep = step;
  const page = app?.windows().find((window) => window.url().includes('/renderer/index.html'));
  if (page) await page.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' }).catch(() => {});
} finally {
  try {
    if (app) {
      await app.close();
      report.applicationClosed = true;
    }
  } catch {
    report.cleanupFailures.push('Application shutdown failed.');
  }
  if (!app || report.applicationClosed) {
    // Delete only this script's mkdtemp fixture, including any profile migration
    // or log copies. Review artifacts outside that directory contain no key.
    try {
      await rm(data, { recursive: true, force: true });
      report.fixtureCredentialRemoved = true;
    } catch {
      report.cleanupFailures.push('Temporary credential fixture removal failed.');
    }
  } else {
    report.cleanupFailures.push('Temporary credential fixture retained because application shutdown was not confirmed.');
  }
  try {
    report.originalProfileUnchanged = digest(await readFile(sourceFile)) === digest(originalBytes);
    if (!report.originalProfileUnchanged) report.cleanupFailures.push('Original credential profile changed.');
  } catch {
    report.cleanupFailures.push('Original credential profile integrity could not be verified.');
  }
  report.valid = modelVerified && report.applicationClosed && report.fixtureCredentialRemoved && report.originalProfileUnchanged;
  if (!report.valid && !report.failure) {
    report.failure = 'Live UI verification cleanup failed';
    report.failedStep = 'cleanup';
  }
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ valid: report.valid, failedStep: report.failedStep, actions: report.actions,
    originalProfileUnchanged: report.originalProfileUnchanged, fixtureCredentialRemoved: report.fixtureCredentialRemoved,
    applicationClosed: report.applicationClosed, cleanupFailures: report.cleanupFailures, output }));
}
if (!report.valid) throw new Error(report.failure || 'Live UI verification failed');
