/**
 * Actual Electron settings/onboarding control walk. All writes use a temporary
 * profile; every click/fill/key action is recorded with its fresh locator's
 * pre-state and the resulting UI state. External login, native shell dispatch,
 * downloads and non-loopback HTTP are intercepted and reported as such.
 * Local HTTP /models responses test the actual free connection-probe handler.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect } from '@playwright/test';
import { captureNativeClipboard, restoreNativeClipboard } from './clipboard-fixture-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const data = await mkdtemp(path.join(tmpdir(), 'forge-settings-control-walk-'));
const isolatedHome = path.join(data, 'home');
const isolatedConfig = path.join(isolatedHome, '.config');
await mkdir(isolatedConfig, { recursive: true });
const runId = process.env.FORGE_SETTINGS_WALK_RUN_ID || '';
assert.ok(!runId || /^[a-z0-9_-]+$/i.test(runId), 'Run ID is a safe directory name');
const output = path.join(root, 'output/playwright/settings-controls', runId);
const selectedSections = new Set((process.env.FORGE_SETTINGS_WALK_SECTIONS || '').split(',').map(value => value.trim()).filter(Boolean));
const sectionNames = ['appearance', 'display', 'language', 'devtools', 'terminal-fonts', 'paths', 'notifications', 'debug', 'updates', 'accounts', 'agent', 'onboarding'];
for (const selected of selectedSections) assert.ok(sectionNames.includes(selected), `Unknown walk scope ${selected}`);
const selected = name => !selectedSections.size || selectedSections.has(name);
await mkdir(output, { recursive: true });
const locales = {};
for (const namespace of ['settings', 'uiSettings', 'common', 'onboarding']) {
  locales[namespace] = JSON.parse(await readFile(path.join(root, `src/shared/i18n/locales/en/${namespace}.json`), 'utf8'));
}
function t(namespace, key, values = {}) {
  const value = key.split('.').reduce((item, part) => item?.[part], locales[namespace]);
  assert.equal(typeof value, 'string', `Missing English fixture label ${namespace}:${key}`);
  return value.replace(/{{(.*?)}}/g, (_, name) => String(values[name.trim()] ?? `{{${name}}}`));
}
const providers = [
  ['anthropic', 'Anthropic'], ['openai', 'OpenAI'], ['google', 'Google AI'], ['openrouter', 'OpenRouter'],
  ['zai', 'Z.AI'], ['xai', 'xAI'], ['mistral', 'Mistral'], ['groq', 'Groq'],
  ['amazon-bedrock', 'AWS Bedrock'], ['azure', 'Azure OpenAI'], ['ollama', 'Ollama'], ['openai-compatible', 'Custom Endpoint'],
];
const selectedAgentProviders = new Set((process.env.FORGE_SETTINGS_WALK_AGENT_PROVIDERS || '').split(',').map(value => value.trim()).filter(Boolean));
for (const provider of selectedAgentProviders) assert.ok(provider === 'mixed' || providers.some(([id]) => id === provider), `Unknown agent provider ${provider}`);
const report = {
  recordedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, data, output,
  selectedSections: selectedSections.size ? [...selectedSections] : sectionNames,
  selectedAgentProviders: selectedAgentProviders.size ? [...selectedAgentProviders] : [...providers.map(([id]) => id), 'mixed'],
  scope: 'Application settings and six-step setup wizard in the actual local Electron build',
  boundaries: ['Temporary HOME and profile only', 'Fake fixture keys only', 'Free loopback HTTP connection probes only', 'OAuth/terminal authentication returns an intercepted failure', 'Shell dispatch and native directory dialog are intercepted', 'No model inference, installer, or download permitted'],
  actions: [], inventories: [], cases: [], failures: [], unsupported: [], sourceHashes: {}, modelRunsStarted: 0,
  clipboard: { captures: 0, blocked: 0, restored: 0 },
};
for (const asset of await readdir(path.join(root, 'out/renderer/assets'))) {
  if (/\.(js|css)$/.test(asset)) report.sourceHashes[asset] = createHash('sha256').update(await readFile(path.join(root, 'out/renderer/assets', asset))).digest('hex');
}
let fixtureMode = 'success';
const requests = [];
const server = createServer((request, response) => {
  const method = request.method;
  requests.push({ method, pathname: new URL(request.url, 'http://localhost').pathname, mode: fixtureMode });
  if (method !== 'GET') { response.writeHead(405).end(); return; }
  if (fixtureMode === 'timeout') return;
  if (fixtureMode === 'slow-success') { setTimeout(() => response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'fixture-model' }] })), 350); return; }
  if (fixtureMode === 'disconnect') { request.socket.destroy(); return; }
  if (fixtureMode === 'malformed') { response.writeHead(200, { 'Content-Type': 'application/json' }).end('{malformed'); return; }
  if (fixtureMode === 'wrong-shape') { response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ hello: true })); return; }
  if (fixtureMode === 'html') { response.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>Fixture login page</html>'); return; }
  if (fixtureMode === 'oversize') { response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [], padding: 'x'.repeat(1_100_000) })); return; }
  if (fixtureMode === 'redirect') { response.writeHead(302, { Location: '/redirected-fixture' }).end(); return; }
  const status = Number(fixtureMode);
  if (Number.isInteger(status) && status >= 400) { response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'Fixture failure only' } })); return; }
  if (request.url.includes('/api/tags')) {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ models: [
      { name: 'fixture-llm:latest', model: 'fixture-llm:latest', size: 1_000_000, details: { family: 'fixture', parameter_size: '1M', quantization_level: 'F16' } },
      { name: 'nomic-embed-text:fixture', model: 'nomic-embed-text:fixture', size: 1_000_000, details: { family: 'nomic-bert', parameter_size: '1M', quantization_level: 'F16' } },
    ] })); return;
  }
  if (request.url.includes('/api/version')) { response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ version: '0.0.0-ui-fixture' })); return; }
  response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'fixture-model' }, { id: 'fixture-model-2' }] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
const fixturePath = path.join(data, 'Selected safe directory');
await mkdir(fixturePath);
const profile = path.join(data, 'profile');
await mkdir(profile);
const fixtureAccounts = providers.map(([provider, name], index) => ({
  id: `settings-walk-${provider}`, provider, name: `QA ${name}`, authType: 'api-key', billingModel: 'pay-per-use',
  ...(provider !== 'ollama' ? { apiKey: 'fixture-key-never-valid' } : {}), baseUrl: endpoint,
  ...(provider === 'amazon-bedrock' ? { region: 'us-east-1' } : {}),
  ...(provider === 'openai-compatible' ? { customModels: [{ id: 'fixture-model', label: 'Fixture Model' }, { id: 'fixture-model-2', label: 'Fixture Model 2' }] } : {}),
  createdAt: Date.now() + index, updatedAt: Date.now() + index,
}));
for (const provider of ['anthropic', 'openai']) fixtureAccounts.push({
  id: `settings-walk-${provider}-oauth`, provider, name: `QA OAuth ${provider}`, authType: 'oauth', billingModel: 'subscription',
  ...(provider === 'anthropic' ? { claudeProfileId: 'fixture-no-auth-profile' } : {}), email: `${provider}@example.invalid`,
  usage: { sessionUsagePercent: 50, weeklyUsagePercent: 71 }, createdAt: Date.now(), updatedAt: Date.now(),
});
await writeFile(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingCompleted: true, language: 'en', theme: 'light', colorTheme: 'forge-glass', uiScale: 100,
  sentryEnabled: false, reduceMotion: false, reduceTransparency: false, preferredIDE: 'vscode', preferredTerminal: 'system', preferredCLI: 'claude-code',
  ollamaBaseUrl: endpoint,
  providerAccounts: fixtureAccounts, globalPriorityOrder: fixtureAccounts.map(account => account.id),
}));
const env = {
  ...process.env, NODE_ENV: 'test', HOME: isolatedHome, CFFIXED_USER_HOME: isolatedHome,
  XDG_CONFIG_HOME: isolatedConfig, FORGE_GLASS_PREVIEW_USER_DATA_DIR: profile,
};
for (const name of Object.keys(env)) if (/(API_KEY|ACCESS_KEY|SECRET|TOKEN|COOKIE|CREDENTIAL)/i.test(name)) delete env[name];
let app;
let page;
let pendingClipboardSnapshot;
let scope = 'startup';
const settings = () => page.locator('.forge-settings-page');
const button = name => page.getByRole('button', { name, exact: true });
const settingsButton = name => settings().getByRole('button', { name, exact: true });
const dialog = () => page.getByRole('dialog').filter({ has: page.locator('#account-name,#oauth-account-name') }).last();
const dialogButton = name => dialog().getByRole('button', { name, exact: true });
const safeText = text => String(text ?? '').replace(/fixture-key-never-valid/g, '[fixture-key]').slice(0, 160);
async function controlState(locator) {
  return locator.evaluate(element => {
    const identities = globalThis.__forgeWalkElementIdentities ??= { ids: new WeakMap(), nextId: 1 };
    if (!identities.ids.has(element)) identities.ids.set(element, identities.nextId++);
    const rect = element.getBoundingClientRect();
    const labels = element.labels ? [...element.labels].map(label => label.textContent?.trim()).join(' ') : '';
    return {
      elementId: identities.ids.get(element),
      tag: element.tagName, role: element.getAttribute('role'), name: element.getAttribute('aria-label') || labels || element.getAttribute('title') || element.textContent?.trim().slice(0, 160),
      id: element.id || undefined, type: element.getAttribute('type'), disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
      checked: element.getAttribute('aria-checked'), pressed: element.getAttribute('aria-pressed'), expanded: element.getAttribute('aria-expanded'),
      value: element.type === 'password' ? '[redacted]' : element.value, visible: Boolean(rect.width && rect.height),
      bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    };
  });
}
async function uiState() {
  return page.evaluate(() => ({
    language: document.documentElement.lang, theme: document.documentElement.className,
    headings: [...document.querySelectorAll('h1,h2,h3,h4')].filter(e => e.getBoundingClientRect().width).map(e => e.textContent?.trim()).slice(0, 35),
    alerts: [...document.querySelectorAll('[role="alert"],[role="status"]')].filter(e => e.getBoundingClientRect().width).map(e => e.textContent?.trim().slice(0, 250)).slice(0, 10),
    dialogs: [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(e => e.getBoundingClientRect().width).map(e => e.textContent?.trim().slice(0, 700)),
    switches: [...document.querySelectorAll('[role="switch"]')].filter(e => e.getBoundingClientRect().width).map(e => ({ id: e.id, checked: e.getAttribute('aria-checked'), disabled: e.getAttribute('data-disabled') != null })),
  }));
}
async function shot(name) { await page.screenshot({ path: path.join(output, `${name.replace(/[^a-z0-9-]/gi, '-')}.png`), animations: 'disabled' }); }
async function inventory(label, locator = settings()) {
  const controls = await locator.locator('button, input, select, textarea, summary, a[href], label:has(input[type="file"]), [role="button"], [role="combobox"], [role="switch"], [role="tab"], [role="option"], [role="menuitem"], [tabindex]:not([tabindex="-1"])').evaluateAll(elements => {
    const identities = globalThis.__forgeWalkElementIdentities ??= { ids: new WeakMap(), nextId: 1 };
    return elements.filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height).map(e => {
      if (!identities.ids.has(e)) identities.ids.set(e, identities.nextId++);
      const owner = e.closest('[role="dialog"],[role="alertdialog"],section,nav,fieldset');
      const titleId = owner?.getAttribute('aria-labelledby');
      const ownerTitle = titleId ? document.getElementById(titleId)?.textContent?.trim() : owner?.getAttribute('aria-label') || owner?.querySelector('h1,h2,h3,h4,legend')?.textContent?.trim();
      return {
        elementId: identities.ids.get(e), tag: e.tagName, role: e.getAttribute('role'), id: e.id || undefined,
        name: e.getAttribute('aria-label') || e.getAttribute('title') || (e.labels && [...e.labels].map(l => l.textContent?.trim()).join(' ')) || e.textContent?.trim().slice(0, 160),
        type: e.getAttribute('type'), disabled: e.matches(':disabled') || e.getAttribute('aria-disabled') === 'true', context: ownerTitle,
      };
    });
  });
  report.inventories.push({ scope, label, controls });
}
async function action(kind, name, locatorFactory, operation, verify) {
  const item = { number: report.actions.length + 1, scope, kind, name, status: 'pending' };
  report.actions.push(item);
  try {
    const locator = locatorFactory();
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    await expect(locator).toBeEnabled({ timeout: 20000 });
    await locator.scrollIntoViewIfNeeded();
    item.before = await controlState(locator);
    assert.equal(item.before.disabled, false, `${name} must be enabled`);
    await operation(locator);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (verify) await verify();
    item.postState = await uiState();
    item.status = 'passed';
    if (item.number % 100 === 0) {
      console.log(`Walk progress ${item.number}: ${scope} / ${name}`);
      await writeFile(path.join(output, 'evidence.partial.json'), JSON.stringify(report, null, 2));
    }
  } catch (error) { item.status = 'failed'; item.error = String(error); throw error; }
}
const click = (name, factory, verify) => action('click', name, factory, locator => locator.click(), verify);
const fill = (name, factory, value, verify) => action('fill', name, factory, locator => locator.fill(value), verify);
const press = (name, factory, key, verify) => action('keyboard', `${name}: ${key}`, factory, locator => locator.press(key), verify);
async function preservedCopy(name, factory, verify) {
  const snapshot = await captureNativeClipboard(app);
  report.clipboard.captures++;
  if (snapshot.unsupported.length) {
    report.clipboard.blocked++;
    report.unsupported.push({ scope, control: name, reason: 'Copy was not clicked because the original native clipboard contains formats without proven lossless restoration.', formats: snapshot.unsupported });
    return;
  }
  pendingClipboardSnapshot = snapshot;
  try { await click(name, factory, verify); }
  finally {
    await restoreNativeClipboard(app, snapshot);
    pendingClipboardSnapshot = undefined;
    report.clipboard.restored++;
    report.cases.push({ scope, name: `${name}: original supported native clipboard restored and verified`, formats: snapshot.formats, passed: true });
  }
}
async function toggle(name, factory, desired) {
  const initial = await factory().getAttribute('aria-checked');
  if (desired !== undefined && initial === String(desired)) desired = !desired;
  await click(name, factory, async () => assert.notEqual(await factory().getAttribute('aria-checked'), initial));
}
async function allSelectOptions(name, factory) {
  if (await factory().isDisabled()) {
    report.cases.push({ scope, name, disabled: true, reason: 'Control is unavailable for the selected model/configuration; no forced click.' });
    return [];
  }
  await click(`${name}: open options`, factory);
  const names = await page.getByRole('option').allTextContents();
  assert.ok(names.length > 0, `${name} exposes options`);
  await press(`${name}: close initial menu`, () => page.getByRole('option').first(), 'Escape');
  for (let index = 0; index < names.length; index++) {
    const text = names[index];
    await click(`${name}: open for ${text.trim()}`, factory);
    await click(`${name}: ${text.trim()}`, () => page.getByRole('option').nth(index));
    assert.equal(await factory().getAttribute('data-state'), 'closed');
  }
  report.cases.push({ scope, name, optionsClicked: names.length });
  return names;
}
async function openSettings() {
  if (!await settings().count()) await click('Open application settings', () => button(t('settings', 'title')));
  await settings().waitFor();
}
async function nav(section) {
  scope = `settings/${section}`;
  await openSettings();
  await click(`Navigate ${section}`, () => settings().getByRole('navigation').getByRole('button', { name: t('settings', `sections.${section}.title`), exact: true }));
  await inventory(section);
}
async function closeSettings(kind = 'cancel') {
  await click(`Settings ${kind}`, () => kind === 'back' ? settingsButton(t('common', 'buttons.back')) : kind === 'save' ? settingsButton(t('settings', 'actions.save')) : settingsButton(t('common', 'buttons.cancel')),
    () => settings().waitFor({ state: 'hidden' }));
}
async function section(name, work) {
  if (!selected(name)) return;
  console.log(`Walking ${name}`);
  try { await nav(name); await work(); await shot(`settings-${name}`); report.cases.push({ scope, name: 'Section walk completed', passed: true }); }
  catch (error) {
    report.failures.push({ scope, error: String(error) });
    await shot(`failure-${name}`).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    console.log(`Section ${name} failed: ${error}`);
  }
  await writeFile(path.join(output, 'evidence.partial.json'), JSON.stringify(report, null, 2));
}
async function interceptBoundaries() {
  await app.evaluate(({ dialog: nativeDialog, shell, ipcMain, session }, { fixturePath, fontExportPath }) => {
    globalThis.__forgeSettingsWalk = { dispatches: [], authAttempts: [], blockedFetches: [], downloads: [], dialogResponses: ['cancel', 'success'], externalResponses: [] };
    const log = globalThis.__forgeSettingsWalk;
    session.defaultSession.on('will-download', (event, item) => {
      const filename = item.getFilename();
      if (filename !== 'terminal-font-settings.json') {
        event.preventDefault();
        log.downloads.push({ filename, state: 'blocked-unexpected-download' });
        return;
      }
      item.setSavePath(fontExportPath);
      item.once('done', (_event, state) => log.downloads.push({ filename, state, target: fontExportPath }));
    });
    shell.openExternal = async url => {
      const response = log.externalResponses.shift() ?? 'success';
      log.dispatches.push({ kind: 'openExternal', url, response });
      if (response === 'failure') throw new Error('UI audit fixture: native external dispatch failure');
    };
    shell.openPath = async target => { log.dispatches.push({ kind: 'openPath', path: target }); return ''; };
    nativeDialog.showOpenDialog = async (...args) => {
      const response = log.dialogResponses.shift() ?? 'success';
      log.dispatches.push({ kind: 'showOpenDialog', response, options: args.at(-1) });
      return { canceled: response === 'cancel', filePaths: response === 'cancel' ? [] : [fixturePath] };
    };
    for (const channel of ['codex-auth-login', 'claude:authLoginSubprocess', 'claude:profileAuthenticate']) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, async () => { log.authAttempts.push(channel); return { success: false, error: 'UI audit fixture: external authentication deliberately intercepted' }; });
    }
    for (const channel of ['ollama:install', 'ollama:pullModel']) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, async () => { log.dispatches.push({ kind: 'download-or-installer-intercepted', channel }); return { success: false, error: 'UI audit fixture: download deliberately intercepted' }; });
    }
    // Preserve the actual registered connection handler for free probes. Only
    // the explicit paid/model mode is intercepted at the IPC execution boundary.
    const actualProbe = ipcMain._invokeHandlers.get('provider-accounts:test-connection');
    if (typeof actualProbe !== 'function') throw new Error('Actual provider connection handler missing');
    ipcMain.removeHandler('provider-accounts:test-connection');
    ipcMain.handle('provider-accounts:test-connection', async (event, provider, config) => {
      if (config?.mode === 'model') {
        log.dispatches.push({ kind: 'model-test-intercepted', provider, model: config.model });
        return { success: true, data: { success: false, code: 'network', error: 'UI audit fixture: inference deliberately intercepted' } };
      }
      return actualProbe(event, provider, config);
    });
    const actualFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      // Native fetch accepts strings, URL instances and Request instances.
      // Provider probes pass URL objects; reading only Request.url would throw
      // before the real local handler could contact its fixture endpoint.
      const url = new URL(typeof input === 'string' ? input : input.href ?? input.url);
      const method = (init?.method ?? input.method ?? 'GET').toUpperCase();
      if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
        log.blockedFetches.push({ method, origin: url.origin, pathname: url.pathname });
        throw new Error('UI audit fixture blocked non-loopback network');
      }
      if (method !== 'GET') {
        log.blockedFetches.push({ method, origin: url.origin, pathname: url.pathname });
        throw new Error('UI audit fixture blocked inference/write request');
      }
      return actualFetch(input, init);
    };
  }, { fixturePath, fontExportPath: path.join(output, 'terminal-font-settings-export.json') });
}
async function waitPersist(key, expected) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const saved = JSON.parse(await readFile(path.join(profile, 'settings.json'), 'utf8'));
    if (JSON.stringify(saved[key]) === JSON.stringify(expected)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.deepEqual(JSON.parse(await readFile(path.join(profile, 'settings.json'), 'utf8'))[key], expected, `Persisted ${key}`);
}
async function appearance() {
  const original = (await page.locator('html').getAttribute('class')) || '';
  for (const mode of ['dark', 'system', 'light']) await click(`Appearance mode ${mode}`, () => settingsButton(t('uiSettings', `mode.${mode}`)), async () => assert.equal(await settingsButton(t('uiSettings', `mode.${mode}`)).getAttribute('aria-pressed'), 'true'));
  await click('Expand color theme choices', () => settings().locator('summary'));
  const themeNames = await settings().locator('details button').allTextContents();
  for (let index = 0; index < themeNames.length; index++) await click(`Color theme ${themeNames[index].trim()}`, () => settings().locator('details button').nth(index), async () => assert.equal(await settings().locator('details button').nth(index).getAttribute('aria-pressed'), 'true'));
  await click('Collapse color theme choices', () => settings().locator('summary'));
  for (const id of ['reduceMotion', 'reduceTransparency']) await toggle(`Appearance ${id}`, () => settings().getByRole('switch', { name: t('settings', `accessibility.${id}.label`), exact: true }));
  await shot('appearance-preview-before-cancel');
  await closeSettings();
  assert.equal((await page.locator('html').getAttribute('class')) || '', original, 'Cancel restores live appearance preview');
  await waitPersist('theme', 'light');
  await waitPersist('colorTheme', 'forge-glass');
  await nav('appearance');
  await toggle('Reduce motion saved on', () => settings().getByRole('switch', { name: t('settings', 'accessibility.reduceMotion.label'), exact: true }));
  await closeSettings('save');
  await waitPersist('reduceMotion', true);
  await nav('appearance');
  await toggle('Reduce motion saved off', () => settings().getByRole('switch', { name: t('settings', 'accessibility.reduceMotion.label'), exact: true }));
  await closeSettings('save');
  await nav('appearance');
}
async function display() {
  for (const value of [125, 150, 100]) await click(`Scale preset ${value}%`, () => settings().getByRole('button', { name: new RegExp(`^${value}%`) }));
  await click('Decrease scale', () => settings().getByTitle(t('uiSettings', 'decreaseScale', { step: 5 })));
  await click('Increase scale', () => settings().getByTitle(t('uiSettings', 'increaseScale', { step: 5 })));
  await click('Increase scale pending change', () => settings().getByTitle(t('uiSettings', 'increaseScale', { step: 5 })));
  await click('Apply pending scale', () => settings().getByTitle(t('uiSettings', 'text002')));
  await click('Reset scale', () => settings().getByTitle(t('uiSettings', 'text001')));
  const slider = () => settings().locator('input[type="range"]');
  await press('Scale slider', slider, 'Home', async () => assert.equal(await slider().inputValue(), '75'));
  assert.equal(await settings().getByTitle(t('uiSettings', 'decreaseScale', { step: 5 })).isDisabled(), true);
  await press('Scale slider', slider, 'End', async () => assert.equal(await slider().inputValue(), '200'));
  assert.equal(await settings().getByTitle(t('uiSettings', 'increaseScale', { step: 5 })).isDisabled(), true);
  await click('Reset maximum scale', () => settings().getByTitle(t('uiSettings', 'text001')));
  await allSelectOptions('Log order', () => settings().getByRole('combobox', { name: t('settings', 'logOrder.label'), exact: true }));
  await allSelectOptions('GPU acceleration', () => settings().getByRole('combobox', { name: t('settings', 'gpuAcceleration.label'), exact: true }));
}
async function language() {
  await click('Switch to Chinese', () => button('中文 简体中文'), async () => assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN'));
  await waitPersist('language', 'zh-CN');
  await click('Switch to English', () => button('English English'), async () => assert.equal(await page.locator('html').getAttribute('lang'), 'en'));
  await waitPersist('language', 'en');
}
async function devtools() {
  await click('Detect installed tools again', () => settingsButton(t('settings', 'devtools.detectAgain')));
  await settingsButton(t('settings', 'devtools.detectAgain')).waitFor();
  for (const key of ['ide', 'terminal', 'cli']) {
    await allSelectOptions(`Preferred ${key}`, () => settings().getByRole('combobox', { name: t('settings', `devtools.${key}.label`), exact: true }));
    const custom = () => settings().locator(`#custom-${key}-path`);
    await fill(`Custom ${key} path`, custom, path.join(data, `safe-${key}`));
    const browse = () => custom().locator('..').getByRole('button');
    await app.evaluate(() => { globalThis.__forgeSettingsWalk.dialogResponses = ['cancel', 'success']; });
    await click(`Browse ${key} cancel`, browse);
    assert.equal(await custom().inputValue(), path.join(data, `safe-${key}`));
    await click(`Browse ${key} safe selection`, browse);
    assert.equal(await custom().inputValue(), fixturePath);
  }
  for (const id of ['auto-name-claude-terminals', 'yolo-mode']) {
    await toggle(`Toggle ${id} on/off`, () => settings().locator(`#${id}`));
    await toggle(`Restore ${id}`, () => settings().locator(`#${id}`));
  }
}
async function fonts() {
  await inventory('terminal fonts all panels');
  await click('Font family picker', () => settings().getByRole('combobox').first());
  const fontChoices = await page.getByRole('option').allTextContents();
  await press('Font picker initial close', () => page.getByRole('option').first(), 'Escape');
  for (const font of fontChoices) {
    await click(`Font picker for ${font.trim()}`, () => settings().getByRole('combobox').first());
    await click(`Font family ${font.trim()}`, () => page.getByRole('option', { name: font.trim(), exact: true }));
  }
  await click('Font family search branch', () => settings().getByRole('combobox').first());
  await fill('Font no-result search', () => page.getByPlaceholder(t('settings', 'terminalFonts.fontConfig.searchFont')), 'nonexistent-font-fixture');
  await page.getByText(t('settings', 'terminalFonts.fontConfig.noFonts'), { exact: true }).waitFor();
  await press('Close font no-result search', () => page.getByPlaceholder(t('settings', 'terminalFonts.fontConfig.searchFont')), 'Escape');
  for (const title of ['decreaseFontSize', 'increaseFontSize', 'decreaseFontWeight', 'increaseFontWeight']) {
    const params = { step: title.includes('Weight') ? 100 : 1 };
    await click(title, () => settings().getByTitle(t('settings', `terminalFonts.fontConfig.${title}`, params)));
  }
  for (const name of ['Font Size', 'Line Height', 'Letter Spacing', 'Scrollback Limit']) {
    const slider = () => settings().getByRole('slider', { name, exact: true });
    await press(`${name} min`, slider, 'Home');
    await press(`${name} max`, slider, 'End');
    await press(`${name} decrease`, slider, 'ArrowLeft');
  }
  const weight = () => settings().getByRole('spinbutton');
  await fill('Font weight direct input clamp', weight, '950');
  assert.equal(await weight().inputValue(), '900');
  await fill('Font weight restore', weight, '400');
  await allSelectOptions('Cursor style', () => settings().getByRole('combobox').last());
  await toggle('Cursor blinking off', () => settings().getByRole('switch').first());
  await toggle('Cursor blinking on', () => settings().getByRole('switch').first());
  await fill('Cursor color', () => settings().locator('input[type="color"]'), '#336699');
  await click('Reset cursor color', () => settingsButton(t('settings', 'terminalFonts.cursorConfig.resetColor')));
  for (const preset of ['presetMinimal', 'presetStandard', 'presetExtended', 'presetMaximum']) await click(`Scrollback ${preset}`, () => settings().getByRole('button', { name: new RegExp(`${t('settings', `terminalFonts.performanceConfig.${preset}`)}$`) }));
  for (const direction of ['decrease', 'increase']) await click(`${direction} scrollback`, () => settings().getByRole('button', { name: new RegExp(`^${direction} scrollback`, 'i') }));
  for (const name of ['VS Code', 'IntelliJ IDEA', 'macOS Terminal', 'Ubuntu Terminal']) await click(`Built-in preset ${name}`, () => settings().getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }));
  await click('Reset terminal fonts OS defaults', () => settingsButton(t('settings', 'terminalFonts.presets.resetButton')));
  await fill('Custom preset name', () => settings().getByRole('textbox', { name: t('settings', 'terminalFonts.presets.presetNameLabel'), exact: true }), 'UI walk preset');
  await click('Save custom font preset', () => settings().getByTitle(t('settings', 'terminalFonts.presets.savePreset')));
  await fill('Duplicate preset name', () => settings().getByRole('textbox', { name: t('settings', 'terminalFonts.presets.presetNameLabel'), exact: true }), 'UI walk preset');
  await click('Duplicate preset validation', () => settings().getByTitle(t('settings', 'terminalFonts.presets.savePreset')));
  await page.getByText(t('settings', 'terminalFonts.presets.duplicateName'), { exact: true }).waitFor();
  await click('Apply custom font preset', () => settings().getByTitle(t('settings', 'terminalFonts.presets.applyPreset')));
  await click('Delete custom font preset', () => settings().getByTitle(t('settings', 'terminalFonts.presets.deletePreset')));
  assert.equal(await settings().getByTitle(t('settings', 'terminalFonts.presets.deletePreset')).count(), 0);
  await fill('Keyboard custom preset name', () => settings().getByRole('textbox', { name: t('settings', 'terminalFonts.presets.presetNameLabel'), exact: true }), 'UI keyboard preset');
  await press('Save font preset with Enter', () => settings().getByRole('textbox', { name: t('settings', 'terminalFonts.presets.presetNameLabel'), exact: true }), 'Enter', () => settings().getByText('UI keyboard preset', { exact: true }).waitFor());
  await click('Delete keyboard font preset', () => settings().getByTitle(t('settings', 'terminalFonts.presets.deletePreset')));
  const fontSettings = { fontFamily: ['SF Mono', 'monospace'], fontSize: 14, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0, cursorStyle: 'bar', cursorBlink: false, cursorAccentColor: '#224466', scrollback: 10000 };
  for (const [name, bytes, expected] of [
    ['malformed', '{broken', 'importFailed'], ['out-of-range', JSON.stringify({ ...fontSettings, fontSize: 200 }), 'importFailed'],
    ['too-large', ' '.repeat(11000), 'fileTooLarge'], ['valid', JSON.stringify(fontSettings), 'importSuccess'],
  ]) {
    const notices = () => page.getByText(t('settings', `terminalFonts.importExport.${expected}`), { exact: true });
    const previousNotice = await notices().count() ? await notices().last().elementHandle() : null;
    const previousSettings = await page.evaluate(() => localStorage.getItem('terminal-font-settings'));
    await action('file-import', `Import font settings ${name}`, () => settings().locator('label').filter({ hasText: t('settings', 'terminalFonts.import') }), async () => {
      // Playwright filechooser still begins with the actual visible Import control.
      const chooserPromise = page.waitForEvent('filechooser');
      await settings().locator('label').filter({ hasText: t('settings', 'terminalFonts.import') }).click();
      await (await chooserPromise).setFiles({ name: `${name}.json`, mimeType: 'application/json', buffer: Buffer.from(bytes) });
    }, async () => {
      await expect(notices()).toHaveCount(1);
      if (previousNotice) await expect.poll(() => previousNotice.evaluate(element => element.isConnected).catch(() => false)).toBe(false);
      if (name !== 'valid') assert.equal(await page.evaluate(() => localStorage.getItem('terminal-font-settings')), previousSettings, 'Rejected import retains the persisted font configuration');
    });
  }
  await action('download', 'Export terminal fonts JSON', () => settingsButton(t('settings', 'terminalFonts.export')), async locator => {
    await locator.click();
    const target = path.join(output, 'terminal-font-settings-export.json');
    await expect.poll(async () => (await app.evaluate(() => globalThis.__forgeSettingsWalk.downloads)).find(download => download.filename === 'terminal-font-settings.json')?.state, { timeout: 15000 }).toBe('completed');
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), fontSettings);
    report.cases.push({ scope, name: 'Export content verified', target });
  });
  await preservedCopy('Copy terminal fonts JSON', () => settingsButton(t('settings', 'terminalFonts.copy')), async () => {
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    const expectedCopy = await readFile(path.join(output, 'terminal-font-settings-export.json'), 'utf8');
    assert.ok(copied === expectedCopy, 'Font clipboard copy must match the already-validated exported fixture settings');
  });
}
async function paths() {
  const before = JSON.parse(await readFile(path.join(profile, 'settings.json'), 'utf8'));
  const fields = ['pythonPath', 'gitPath', 'githubCLIPath', 'gitlabCLIPath', 'claudePath', 'autoBuildPath'];
  for (const id of fields) await fill(`Draft path ${id}`, () => settings().locator(`#${id}`), id === 'autoBuildPath' ? '.forge-ui-walk' : path.join(data, id));
  await closeSettings();
  const cancelled = JSON.parse(await readFile(path.join(profile, 'settings.json'), 'utf8'));
  for (const id of fields) assert.equal(cancelled[id], before[id], `${id} Cancel retains persisted setting`);
  await nav('paths');
  await fill('Save local Git path', () => settings().locator('#gitPath'), '/usr/bin/git');
  await withPersistenceFailure(async () => {
    await click('Settings Save actual temporary filesystem failure', () => settingsButton(t('settings', 'actions.save')));
    await settings().getByRole('alert').waitFor();
    assert.equal(await settings().isVisible(), true, 'Failed settings save retains the page');
    assert.equal(await settings().locator('#gitPath').inputValue(), '/usr/bin/git', 'Failed settings save retains the draft');
  });
  await closeSettings('save');
  await waitPersist('gitPath', '/usr/bin/git');
  await nav('paths');
}
async function notifications() {
  const switches = settings().getByRole('switch');
  assert.equal(await switches.count(), 4);
  for (let index = 0; index < 4; index++) {
    await toggle(`Notification switch ${index + 1}`, () => settings().getByRole('switch').nth(index));
    await toggle(`Restore notification switch ${index + 1}`, () => settings().getByRole('switch').nth(index));
  }
}
async function debug() {
  await toggle('Error reporting preference on', () => settings().getByRole('switch', { name: t('settings', 'debug.errorReporting.label'), exact: true }));
  await waitPersist('sentryEnabled', true);
  await toggle('Error reporting preference off', () => settings().getByRole('switch', { name: t('settings', 'debug.errorReporting.label'), exact: true }));
  await waitPersist('sentryEnabled', false);
  await click('Open logs folder intercepted dispatch', () => settingsButton(t('settings', 'debug.openLogsFolder')));
  await click('Load real local debug info', () => settingsButton(t('settings', 'debug.loadInfo')));
  await settings().getByText(t('settings', 'debug.systemInfo'), { exact: true }).waitFor();
  await preservedCopy('Copy real local debug info', () => settingsButton(t('settings', 'debug.copyDebugInfo')), async () => {
    const copy = await app.evaluate(({ clipboard }) => clipboard.readText());
    assert.ok(copy.length > 50, 'Debug clipboard report contains system diagnostics');
    assert.equal(/fixture-key-never-valid/.test(copy), false, 'Debug diagnostics must omit even fake account secrets');
  });
}
function providerHeader(providerId, owner = settings) {
  const name = locales.uiSettings.providerNames?.[providerId] ?? providers.find(([id]) => id === providerId)[1];
  return owner().getByText(name, { exact: true }).locator('xpath=ancestor::button[1]');
}
function providerBlock(providerId, owner = settings) { return providerHeader(providerId, owner).locator('..'); }
function card(name, owner = settings) { return owner().getByText(name, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]'); }
async function createAndRemoveApiFixture(providerId, owner = settings, context = 'Settings') {
  const name = `${context} added ${providerId}`;
  await fill(`${context} ${providerId} new API account name`, () => dialog().locator('#account-name'), name);
  await fill(`${context} ${providerId} new fake API key`, () => dialog().locator('#account-apikey'), 'fixture-key-never-valid');
  if (await dialog().locator('#account-baseurl').count()) await fill(`${context} ${providerId} new local endpoint`, () => dialog().locator('#account-baseurl'), endpoint);
  const testLabel = t('settings', providerId === 'zai' ? 'providers.connection.testModel' : 'providers.connection.test');
  await click(`${context} ${providerId} new fixture connection check`, () => dialogButton(testLabel));
  await dialog().locator('[role="status"],[role="alert"]').waitFor({ timeout: 15000 });
  await click(`${context} ${providerId} save new API fixture`, () => dialogButton(t('settings', 'providers.dialog.add')), () => dialog().waitFor({ state: 'hidden' }));
  await owner().getByText(name, { exact: true }).waitFor();
  await click(`${context} ${providerId} delete new API fixture`, () => card(name, owner).getByRole('button', { name: t('settings', 'providers.card.delete'), exact: true }));
  await click(`${context} ${providerId} confirm new fixture deletion`, () => page.getByRole('alertdialog').getByRole('button', { name: t('settings', 'providers.dialog.delete'), exact: true }));
  await owner().getByText(name, { exact: true }).waitFor({ state: 'hidden' });
}
async function connectionProbe(mode, expected) {
  fixtureMode = mode;
  await click(`Free local connection probe ${mode}`, () => dialogButton(t('settings', 'providers.connection.test')));
  await dialog().getByText(t('settings', `providers.connection.${expected ? 'success' : 'failure'}`), { exact: true }).waitFor({ timeout: 15000 });
  const result = await dialog().locator('[role="status"],[role="alert"]').allTextContents();
  report.cases.push({ scope, name: `Free local probe ${mode}`, success: expected, result: result.map(safeText), actualHandler: true });
  assert.ok(result.length > 0);
  if (!expected) assert.equal(result.join(' ').includes('fixture-key-never-valid'), false, 'Probe errors must redact secrets');
  await shot(`provider-probe-${mode}`);
}
async function customAccount() {
  const block = () => providerBlock('openai-compatible');
  await click('Custom endpoint Add API Key', () => block().getByRole('button', { name: t('settings', 'providers.section.addApiKey'), exact: true }));
  await click('Close custom endpoint empty dialog with X', () => dialog().getByRole('button', { name: 'Close', exact: true }));
  await click('Reopen custom endpoint Add API Key', () => block().getByRole('button', { name: t('settings', 'providers.section.addApiKey'), exact: true }));
  await inventory('Custom account empty dialog', dialog());
  assert.equal(await dialogButton(t('settings', 'providers.dialog.add')).isDisabled(), true, 'Empty account cannot save');
  assert.equal(await dialogButton(t('settings', 'providers.connection.test')).isDisabled(), true, 'Empty connection cannot test');
  await fill('Custom account name', () => dialog().getByLabel(t('settings', 'providers.dialog.fields.name'), { exact: true }), 'UI created endpoint');
  await fill('Custom account fake API key', () => dialog().getByLabel(t('settings', 'providers.dialog.fields.apiKey'), { exact: true }), 'fixture-key-never-valid');
  await fill('Custom endpoint invalid URL', () => dialog().locator('#account-baseurl'), 'invalid url');
  assert.equal(await dialogButton(t('settings', 'providers.dialog.add')).isDisabled(), true, 'Invalid endpoint cannot save');
  assert.equal(await dialogButton(t('settings', 'providers.connection.test')).isDisabled(), true, 'Invalid endpoint cannot issue a probe');
  await expect(dialog().locator('#account-baseurl')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog().locator('#account-baseurl-error')).toHaveText(t('settings', 'providers.dialog.urlValidation.invalid-url'));
  report.cases.push({ scope, name: 'Malformed endpoint blocks save and probe with linked inline error', passed: true });
  await fill('Custom endpoint loopback URL', () => dialog().locator('#account-baseurl'), endpoint);
  assert.equal(await dialog().getByRole('alert').count(), 0, 'Changing endpoint clears stale test failure');
  await fill('Model ID', () => dialog().getByLabel(t('settings', 'providers.dialog.fields.modelId'), { exact: true }), 'qa-extra-model');
  await fill('Model label', () => dialog().getByLabel(t('settings', 'providers.dialog.fields.modelLabel'), { exact: true }), 'QA extra model');
  await click('Add custom model', () => dialogButton(t('settings', 'providers.dialog.addModel')));
  await fill('Duplicate custom model ID', () => dialog().getByLabel(t('settings', 'providers.dialog.fields.modelId'), { exact: true }), 'qa-extra-model');
  await dialog().getByText(t('settings', 'providers.dialog.duplicateModel'), { exact: true }).waitFor();
  assert.equal(await dialogButton(t('settings', 'providers.dialog.addModel')).isDisabled(), true);
  await click('Remove custom model', () => dialogButton(t('settings', 'providers.dialog.removeModel', { name: 'QA extra model' })));
  assert.equal(await dialog().getByText(t('settings', 'providers.dialog.duplicateModel'), { exact: true }).count(), 0);
  await fill('Restore custom model label', () => dialog().getByLabel(t('settings', 'providers.dialog.fields.modelLabel'), { exact: true }), 'QA extra model');
  await click('Re-add custom model', () => dialogButton(t('settings', 'providers.dialog.addModel')));
  for (const [field, modelId, label] of [['modelId', 'keyboard-id-model', 'keyboard-id-model'], ['modelLabel', 'keyboard-label-model', 'Keyboard label model']]) {
    await fill(`Keyboard ${field} model ID`, () => dialog().getByLabel(t('settings', 'providers.dialog.fields.modelId'), { exact: true }), modelId);
    if (field === 'modelLabel') await fill('Keyboard model display name', () => dialog().getByLabel(t('settings', 'providers.dialog.fields.modelLabel'), { exact: true }), label);
    await press(`Add custom model from ${field}`, () => dialog().getByLabel(t('settings', `providers.dialog.fields.${field}`), { exact: true }), 'Enter', () => dialogButton(t('settings', 'providers.dialog.removeModel', { name: label })).waitFor());
    await click(`Remove keyboard custom model ${label}`, () => dialogButton(t('settings', 'providers.dialog.removeModel', { name: label })));
  }
  for (const [mode, expected] of [['success', true], ['401', false], ['403', false], ['429', false], ['400', false], ['422', false], ['404', false], ['405', false], ['500', false], ['malformed', false], ['wrong-shape', false], ['html', false], ['oversize', false], ['redirect', false], ['disconnect', false], ['timeout', false]]) await connectionProbe(mode, expected);
  fixtureMode = 'success';
  await connectionProbe('success', true);
  await fill('Change name clears successful test', () => dialog().locator('#account-name'), 'UI created endpoint renamed');
  assert.equal(await dialog().getByRole('status').count(), 0, 'Any form change clears a stale successful test');
  fixtureMode = 'slow-success';
  await click('Start delayed free probe for stale-result check', () => dialogButton(t('settings', 'providers.connection.test')));
  await fill('Change account while connection check is in flight', () => dialog().locator('#account-name'), 'UI stale response draft');
  await page.waitForTimeout(600);
  assert.equal(await dialog().locator('[role="status"],[role="alert"]').count(), 0, 'A response for the prior form revision must not mark the edited form as checked');
  report.cases.push({ scope, name: 'Actual delayed probe result discarded after form revision', success: true });
  fixtureMode = 'success';
  await fill('Restore created endpoint name after stale check', () => dialog().locator('#account-name'), 'UI created endpoint renamed');
  await withPersistenceFailure(async () => {
    await click('Account save actual temporary filesystem failure', () => dialogButton(t('settings', 'providers.dialog.add')));
    await page.getByText(t('settings', 'providers.dialog.toast.error'), { exact: true }).first().waitFor();
    assert.equal(await dialog().locator('#account-name').inputValue(), 'UI created endpoint renamed', 'Failed account save preserves form');
  });
  await click('Save custom account', () => dialogButton(t('settings', 'providers.dialog.add')), () => dialog().waitFor({ state: 'hidden' }));
  await settings().getByText('UI created endpoint renamed', { exact: true }).waitFor();
  const created = () => card('UI created endpoint renamed');
  await click('Show created fake key', () => created().getByRole('button', { name: t('settings', 'providers.card.showKey'), exact: true }));
  await click('Hide created fake key', () => created().getByRole('button', { name: t('settings', 'providers.card.hideKey'), exact: true }));
  await click('Edit created account', () => created().getByRole('button', { name: t('settings', 'providers.card.edit'), exact: true }));
  await fill('Edit account draft name', () => dialog().locator('#account-name'), 'Cancelled renamed account');
  await click('Cancel edited account', () => dialogButton(t('settings', 'providers.dialog.cancel')), () => dialog().waitFor({ state: 'hidden' }));
  assert.equal(await settings().getByText('Cancelled renamed account', { exact: true }).count(), 0);
  await click('Edit created account for save', () => created().getByRole('button', { name: t('settings', 'providers.card.edit'), exact: true }));
  await fill('Edit account saved name', () => dialog().locator('#account-name'), 'UI edited endpoint');
  await click('Save edited account', () => dialogButton(t('settings', 'providers.dialog.save')), () => dialog().waitFor({ state: 'hidden' }));
  const edited = () => card('UI edited endpoint');
  await click('Delete account opens confirmation', () => edited().getByRole('button', { name: t('settings', 'providers.card.delete'), exact: true }));
  await click('Cancel account deletion', () => page.getByRole('alertdialog').getByRole('button', { name: t('settings', 'providers.dialog.cancel'), exact: true }));
  await settings().getByText('UI edited endpoint', { exact: true }).waitFor();
  await click('Delete account confirm again', () => edited().getByRole('button', { name: t('settings', 'providers.card.delete'), exact: true }));
  await click('Confirm delete account', () => page.getByRole('alertdialog').getByRole('button', { name: t('settings', 'providers.dialog.delete'), exact: true }));
  await settings().getByText('UI edited endpoint', { exact: true }).waitFor({ state: 'hidden' });
}
async function accounts() {
  for (const [providerId] of providers) {
    await click(`${providerId}: collapse provider section`, () => providerHeader(providerId));
    await click(`${providerId}: expand provider section`, () => providerHeader(providerId));
    const accountName = fixtureAccounts.find(account => account.provider === providerId).name;
    const fixtureCard = () => card(accountName);
    if (providerId !== 'ollama') {
      await click(`${providerId}: show fake key`, () => fixtureCard().getByRole('button', { name: t('settings', 'providers.card.showKey'), exact: true }));
      await click(`${providerId}: hide fake key`, () => fixtureCard().getByRole('button', { name: t('settings', 'providers.card.hideKey'), exact: true }));
    }
    await click(`${providerId}: edit account`, () => fixtureCard().getByRole('button', { name: t('settings', 'providers.card.edit'), exact: true }));
    await inventory(`${providerId} edit dialog`, dialog());
    if (providerId === 'amazon-bedrock') await allSelectOptions('AWS regions', () => dialog().getByRole('combobox'));
    if (providerId === 'openai-compatible') for (const modelName of ['Fixture Model', 'Fixture Model 2']) await click(`Remove edited fixture model ${modelName} then discard`, () => dialogButton(t('settings', 'providers.dialog.removeModel', { name: modelName })));
    if (providerId === 'zai') {
      await allSelectOptions('ZAI test models', () => dialog().getByRole('combobox', { name: t('settings', 'providers.connection.model'), exact: true }));
      await click('ZAI explicit model test intercepted before inference', () => dialogButton(t('settings', 'providers.connection.testModel')));
      await dialog().getByText(t('settings', 'providers.connection.failure'), { exact: true }).waitFor();
      report.unsupported.push({ scope, control: 'ZAI Test model', reason: 'Clicked with model IPC boundary deliberately intercepted. No paid inference/quota verification.' });
    }
    await click(`${providerId}: close edit dialog`, () => dialogButton(t('settings', 'providers.dialog.cancel')));
    const deleteName = t('settings', 'providers.card.delete');
    await click(`${providerId}: delete confirmation`, () => fixtureCard().getByRole('button', { name: deleteName, exact: true }));
    await click(`${providerId}: cancel fixture deletion`, () => page.getByRole('alertdialog').getByRole('button', { name: t('settings', 'providers.dialog.cancel'), exact: true }));
    if (providerId === 'zai') await allSelectOptions('Saved ZAI card test models', () => fixtureCard().getByRole('combobox', { name: t('settings', 'providers.connection.model'), exact: true }));
    const testName = t('settings', providerId === 'zai' ? 'providers.connection.testModelAccount' : 'providers.connection.testAccount', { name: accountName });
    await click(`${providerId}: test saved account${providerId === 'zai' ? ' (intercepted model)' : ''}`, () => fixtureCard().getByRole('button', { name: testName, exact: true }));
    // Provider-specific metadata protocols differ. Require a visible terminal
    // result without treating this local fixture as provider availability.
    await fixtureCard().locator('[role="status"],[role="alert"]').waitFor({ timeout: 15000 });
    const block = () => providerBlock(providerId);
    if (providerId !== 'ollama') {
      const addButtons = await block().getByRole('button').filter({ has: page.locator('svg.lucide-plus') }).allTextContents();
      for (const addName of addButtons) {
        await click(`${providerId}: ${addName.trim()}`, () => block().getByRole('button', { name: addName.trim(), exact: true }));
        await inventory(`${providerId} ${addName.trim()} dialog`, dialog());
        if (await dialog().locator('#account-apikey').count()) {
          await createAndRemoveApiFixture(providerId);
          continue;
        }
        if (addName === t('settings', 'providers.section.addClaudeCode') || addName === t('settings', 'providers.section.addCodexSubscription')) {
          await fill(`${providerId}: OAuth fixture name`, () => dialog().locator('#oauth-account-name'), `UI OAuth ${providerId}`);
          const authName = t('settings', providerId === 'openai' ? 'providers.dialog.codexAuthenticate' : 'providers.dialog.oauthAuthenticate');
          await click(`${providerId}: authenticate intercepted`, () => dialogButton(authName));
          await dialog().getByText(new RegExp('UI audit fixture: external authentication deliberately intercepted')).waitFor();
          await click(`${providerId}: retry intercepted authentication`, () => dialogButton(authName));
          await dialog().getByText(new RegExp('UI audit fixture: external authentication deliberately intercepted')).waitFor();
          if (providerId === 'anthropic') {
            await click('Anthropic terminal fallback intercepted', () => dialogButton(t('settings', 'providers.dialog.oauthFallback')));
            await page.getByText('UI audit fixture: external authentication deliberately intercepted', { exact: true }).first().waitFor();
          }
          report.unsupported.push({ scope, control: `${providerId} OAuth successful completion`, reason: 'External authentication was intercepted before launching browser/CLI. Success, real quota and credential persistence require an authenticated account and are unverified.' });
        }
        await click(`${providerId}: Cancel ${addName.trim()}`, () => dialogButton(t('settings', 'providers.dialog.cancel')));
      }
    } else {
      await fill('Ollama custom invalid URL', () => block().getByLabel(t('settings', 'providers.ollama.connection.customUrl'), { exact: true }), 'invalid-url');
      await click('Ollama test and save invalid URL', () => block().getByRole('button', { name: t('settings', 'providers.ollama.connection.testAndSave'), exact: true }));
      await block().getByRole('alert').filter({ hasText: t('settings', 'providers.ollama.connection.invalidUrl') }).waitFor();
      await fill('Ollama custom loopback URL', () => block().getByLabel(t('settings', 'providers.ollama.connection.customUrl'), { exact: true }), endpoint);
      fixtureMode = 'disconnect';
      await click('Ollama disconnected local endpoint failure branch', () => block().getByRole('button', { name: t('settings', 'providers.ollama.connection.testAndSave'), exact: true }));
      await expect(block().getByRole('status').last()).toContainText(new RegExp(`${t('settings', 'providers.ollama.connection.notInstalled')}|${t('settings', 'providers.ollama.connection.unreachable')}`), { timeout: 15000 });
      const install = block().getByRole('button', { name: t('settings', 'providers.ollama.connection.install'), exact: true });
      if (await install.count()) {
        await click('Ollama Install link intercepted', () => block().getByRole('button', { name: t('settings', 'providers.ollama.connection.install'), exact: true }));
        await click('Ollama Learn more link intercepted', () => block().getByRole('button', { name: t('settings', 'providers.ollama.connection.learnMore'), exact: true }));
      } else report.unsupported.push({ scope, control: 'Ollama installation empty state links', reason: 'This host reports Ollama installed; branch not present.' });
      fixtureMode = 'success';
      // The real metadata IPC deliberately deduplicates same-URL requests for
      // two seconds. Let the prior disconnected fixture expire so the recovery
      // click must issue a fresh GET and cannot reuse the prior result.
      await page.waitForTimeout(2100);
      report.cases.push({ scope, name: 'Ollama recovery probe waits real two-second metadata deduplication window', milliseconds: 2100 });
      await click('Ollama test and save local fixture metadata', () => block().getByRole('button', { name: t('settings', 'providers.ollama.connection.testAndSave'), exact: true }));
      await block().getByText(t('settings', 'providers.ollama.connection.connected'), { exact: true }).waitFor();
    }
  }
  await customAccount();
  for (const providerId of ['anthropic', 'openai']) {
    const oauthCard = () => card(`QA OAuth ${providerId}`);
    await click(`${providerId}: test saved OAuth card metadata only`, () => oauthCard().getByRole('button', { name: t('settings', 'providers.connection.testAccount', { name: `QA OAuth ${providerId}` }), exact: true }));
    await oauthCard().locator('[role="status"],[role="alert"]').waitFor({ timeout: 15000 });
    await click(`${providerId}: delete saved OAuth fixture confirmation`, () => oauthCard().getByRole('button', { name: t('settings', 'providers.card.delete'), exact: true }));
    await click(`${providerId}: cancel saved OAuth fixture deletion`, () => page.getByRole('alertdialog').getByRole('button', { name: t('settings', 'providers.dialog.cancel'), exact: true }));
    await click(`${providerId}: re-authenticate fixture card intercepted`, () => oauthCard().getByRole('button', { name: t('settings', 'providers.card.reauth'), exact: true }));
    await page.getByText(t('settings', 'providers.toast.reauthFailed'), { exact: true }).first().waitFor();
    await click(`${providerId}: edit saved OAuth fixture`, () => oauthCard().getByRole('button', { name: t('settings', 'providers.card.edit'), exact: true }));
    await click(`${providerId}: reauthenticate saved OAuth edit intercepted`, () => dialogButton(t('settings', providerId === 'openai' ? 'providers.dialog.codexReauthenticate' : 'providers.dialog.oauthReauthenticate')));
    await dialog().getByText(new RegExp('UI audit fixture: external authentication deliberately intercepted')).waitFor();
    if (providerId === 'anthropic') await click('Anthropic saved OAuth edit terminal fallback intercepted', () => dialogButton(t('settings', 'providers.dialog.oauthFallback')));
    await click(`${providerId}: test saved OAuth metadata only`, () => dialogButton(t('settings', 'providers.connection.test')));
    await dialog().getByRole('alert').waitFor();
    await click(`${providerId}: save OAuth fixture metadata only`, () => dialogButton(t('settings', 'providers.dialog.save')), () => dialog().waitFor({ state: 'hidden' }));
    await click(`${providerId}: reopen saved OAuth fixture for Cancel`, () => oauthCard().getByRole('button', { name: t('settings', 'providers.card.edit'), exact: true }));
    await click(`${providerId}: cancel saved OAuth fixture edit`, () => dialogButton(t('settings', 'providers.dialog.cancel')));
  }
  const switches = () => settings().getByRole('switch');
  // Account auto-switch panel appears only with two or more fixture accounts.
  if (await switches().first().getAttribute('aria-checked') === 'true') await toggle('Disable master account switching baseline', () => switches().first());
  await toggle('Enable master account switching', () => switches().first());
  await page.getByRole('tab', { name: t('settings', 'accounts.priority.tabs.default'), exact: true }).waitFor();
  if (await switches().nth(1).getAttribute('aria-checked') !== 'true') await toggle('Enable proactive monitoring baseline', () => switches().nth(1));
  for (const id of ['session-threshold', 'weekly-threshold']) {
    const original = Number(await settings().locator(`#${id}`).inputValue());
    await press(`${id} minimum`, () => settings().locator(`#${id}`), 'Home', async () => assert.equal(await settings().locator(`#${id}`).inputValue(), '0'));
    await press(`${id} minimum clamp`, () => settings().locator(`#${id}`), 'ArrowLeft', async () => assert.equal(await settings().locator(`#${id}`).inputValue(), '0'));
    await press(`${id} maximum`, () => settings().locator(`#${id}`), 'End', async () => assert.equal(await settings().locator(`#${id}`).inputValue(), '99'));
    await press(`${id} maximum clamp`, () => settings().locator(`#${id}`), 'ArrowRight', async () => assert.equal(await settings().locator(`#${id}`).inputValue(), '99'));
    for (let value = 99; value > original; value--) await press(`${id} restore ${value - 1}`, () => settings().locator(`#${id}`), 'ArrowLeft');
    await press(`${id} lower`, () => settings().locator(`#${id}`), 'ArrowLeft');
    await press(`${id} restore`, () => settings().locator(`#${id}`), 'ArrowRight');
  }
  for (const index of [1, 2, 3]) {
    await toggle(`Account switching option ${index}`, () => switches().nth(index));
    await toggle(`Restore account switching option ${index}`, () => switches().nth(index));
  }
  for (const key of ['crossProvider', 'default']) {
    await click(`Account priority ${key} tab`, () => page.getByRole('tab', { name: t('settings', `accounts.priority.tabs.${key}`), exact: true }));
    const panel = () => page.getByRole('tabpanel');
    await inventory(`Priority ${key}`, panel());
    for (const name of [...fixtureAccounts.map(account => account.name), fixtureAccounts[0].name]) {
      const activate = () => panel().getByRole('button', { name: `${t('settings', 'accounts.priority.setActive')}: ${name}`, exact: true });
      if (await activate().count()) await click(`Priority ${key} make ${name} active`, activate);
    }
    for (const account of fixtureAccounts) await click(`Priority ${key} focus drag handle ${account.name}`, () => panel().getByRole('button', { name: account.name, exact: true }));
    const orderKey = key === 'default' ? 'globalPriorityOrder' : 'crossProviderPriorityOrder';
    const priorOrder = JSON.parse(await readFile(path.join(profile, 'settings.json'), 'utf8'))[orderKey];
    assert.ok(priorOrder?.length >= 2, 'Priority fixture includes multiple persisted accounts');
    const handle = () => panel().locator('[role="button"][aria-roledescription="sortable"]').first();
    await press(`Priority ${key} start keyboard reorder`, handle, 'Space');
    await press(`Priority ${key} keyboard move down`, handle, 'ArrowDown');
    await press(`Priority ${key} finish keyboard reorder`, handle, 'Space');
    await waitPersist(orderKey, [priorOrder[1], priorOrder[0], ...priorOrder.slice(2)]);
    report.cases.push({ scope, name: `Priority ${key} keyboard reorder persisted`, firstTwoSwapped: true });
  }
  await toggle('Disable master account switching restore', () => switches().first());
}
async function modelPicker(name, factory, allOptions = false) {
  await click(`${name}: open`, factory);
  const popover = () => page.getByRole('dialog').filter({ has: page.getByPlaceholder(t('settings', 'modelSelect.searchPlaceholder')) }).last();
  await popover().waitFor();
  await inventory(name, popover());
  await fill(`${name}: no-result search`, () => popover().getByPlaceholder(t('settings', 'modelSelect.searchPlaceholder')), 'no-match-fixture-xyz');
  await popover().getByText(t('settings', 'modelSelect.noResults'), { exact: true }).waitFor();
  await fill(`${name}: clear search`, () => popover().getByPlaceholder(t('settings', 'modelSelect.searchPlaceholder')), '');
  const choices = await popover().locator('button[data-model-option]:enabled').allTextContents();
  if (!choices.length) {
    report.unsupported.push({ scope, control: `${name} catalog options`, reason: 'This provider exposes no enabled catalog option in the current fixture; its available manual model entry is exercised separately.' });
  } else {
    await click(`${name}: model ${choices[0].trim()}`, () => popover().locator('button[data-model-option]:enabled').first());
    if (allOptions) for (let index = 1; index < choices.length; index++) {
      const text = choices[index];
      await click(`${name}: reopen`, factory);
      await click(`${name}: model ${text.trim()}`, () => popover().locator('button[data-model-option]:enabled').nth(index));
    }
  }
  report.cases.push({ scope, name, modelsClicked: choices.length ? allOptions ? choices.length : 1 : 0, catalogOptions: choices.length });
  if (choices.length) await click(`${name}: manual model entry`, factory);
  const manual = () => popover().getByLabel(t('uiSettings', 'missing_modelSelect_customModel'), { exact: true });
  if (allOptions && await popover().locator('select').count()) {
    const options = await popover().locator('select option').evaluateAll(elements => elements.map(element => ({ label: element.textContent, value: element.value })));
    for (const option of options) await action('select', `${name}: manual provider ${option.label}`, () => popover().locator('select'), locator => locator.selectOption(option.value));
  }
  await fill(`${name}: custom model ID`, manual, 'ui-fixture-manual-model');
  await click(`${name}: Use custom model`, () => popover().getByRole('button', { name: t('uiSettings', 'missing_modelSelect_useCustomModel'), exact: true }));
  if (!choices.length) {
    await expect(factory()).toContainText('ui-fixture-manual-model');
    report.cases.push({ scope, name: `${name}: manual model selected from empty catalog`, passed: true });
    return;
  }
  await click(`${name}: restore catalog model after manual-entry branch`, factory);
  if (allOptions) {
    await press(`${name}: keyboard enter model list`, () => popover().getByPlaceholder(t('settings', 'modelSelect.searchPlaceholder')), 'ArrowDown', async () => {
      assert.notEqual(await page.locator(':focus').getAttribute('data-model-option'), null, 'ArrowDown from model search focuses an actual option');
    });
    await press(`${name}: keyboard select focused model`, () => page.locator(':focus'), 'Enter', () => popover().waitFor({ state: 'hidden' }));
  } else await click(`${name}: restore first catalog model`, () => popover().locator('button[data-model-option]:enabled').first());
}
async function agents() {
  const ordered = [...new Set(fixtureAccounts.map(account => account.provider))].sort();
  ordered.splice(ordered.indexOf('anthropic'), 1);
  ordered.unshift('anthropic');
  for (const providerId of ordered) {
    if (selectedAgentProviders.size && !selectedAgentProviders.has(providerId)) continue;
    const name = providers.find(([id]) => id === providerId)[1];
    if (ordered.indexOf(providerId) < 3) await click(`Agent provider ${name}`, () => settingsButton(name));
    else {
      await click(`Agent overflow for ${name}`, () => settings().locator('button[aria-haspopup="menu"]'));
      await click(`Agent provider menu ${name}`, () => page.getByRole('menuitem', { name, exact: true }));
    }
    await inventory(`Agent ${name}`);
    for (const preset of ['auto', 'complex', 'balanced', 'quick']) {
      await click(`${name}: preset ${preset}`, () => settings().getByRole('button').filter({ has: page.getByRole('heading', { name: t('settings', `agentProfile.presets.${preset}.name`), exact: true }) }));
    }
    await click(`${name}: expand phase configuration`, () => settings().getByRole('button').filter({ has: page.getByRole('heading', { name: t('settings', 'agentProfile.phaseConfiguration'), exact: true }) }));
    // Every phase/feature trigger is clicked. Unique model catalog option
    // buttons are exhausted in the first picker per provider, then a choice is
    // exercised in every other field; equivalent catalogs are not multiplied.
    const total = await settings().locator('button[aria-haspopup="dialog"]').count();
    for (let index = 0; index < total; index++) await modelPicker(`${name} model field ${index + 1}`, () => settings().locator('button[aria-haspopup="dialog"]').nth(index), index === 0);
    const thinkingCount = await settings().getByRole('combobox').count();
    for (let index = 0; index < thinkingCount; index++) await allSelectOptions(`${name} reasoning ${index + 1}`, () => settings().getByRole('combobox').nth(index));
    const toggles = await settings().getByRole('button', { name: /^(On|Off)$/ }).count();
    if (toggles) {
      await click(`${name}: thinking on`, () => settingsButton('On').first());
      await click(`${name}: thinking off`, () => settingsButton('Off').first());
    }
    const reset = settings().getByRole('button', { name: /^Reset to .* defaults$/ });
    if (await reset.count()) await click(`${name}: reset phase defaults`, () => settings().getByRole('button', { name: /^Reset to .* defaults$/ }));
    await click(`${name}: collapse phase configuration`, () => settings().getByRole('button').filter({ has: page.getByRole('heading', { name: t('settings', 'agentProfile.phaseConfiguration'), exact: true }) }));
    if (providerId === 'ollama') {
      // The model manager's remote download controls are clicked only after
      // its IPC boundary is configured to return an explicit fixture failure.
      const managerButtons = await settings().getByRole('button').allTextContents();
      report.cases.push({ scope, name: 'Ollama manager controls observed', controls: managerButtons.map(safeText) });
      const refresh = settings().getByRole('button', { name: t('settings', 'agentProfile.ollamaModels.refresh'), exact: true });
      if (await refresh.count()) await click('Ollama model manager Refresh', () => settings().getByRole('button', { name: t('settings', 'agentProfile.ollamaModels.refresh'), exact: true }));
      const downloadNames = await settings().getByRole('button', { name: /^Download / }).evaluateAll(elements => elements.map(element => element.getAttribute('aria-label') || element.textContent?.trim()));
      for (const downloadName of downloadNames) await click(`Ollama model download intercepted: ${downloadName}`, () => settingsButton(downloadName));
      report.unsupported.push({ scope, control: 'Ollama actual installer/model downloads', reason: 'No binaries/models are downloaded by this audit.' });
    }
    if (ordered.indexOf(providerId) >= 3) {
      await click(`${name}: selected provider overflow trigger`, () => settings().locator('button[aria-haspopup="menu"]'));
      await press(`${name}: dismiss provider menu`, () => page.getByRole('menuitem').first(), 'Escape');
    }
  }
  if (!selectedAgentProviders.size || selectedAgentProviders.has('mixed')) {
  await click('Cross-provider model tab', () => settingsButton(t('settings', 'agentProfile.providerTabs.crossProvider')));
  const enabled = () => settings().getByRole('switch', { name: t('settings', 'agentProfile.crossProviderTab.enableLabel'), exact: true });
  await toggle('Activate mixed model configuration', enabled);
  await toggle('Deactivate mixed model configuration', enabled);
  const count = await settings().locator('button[aria-haspopup="dialog"]').count();
  for (let index = 0; index < count; index++) await modelPicker(`Mixed model field ${index + 1}`, () => settings().locator('button[aria-haspopup="dialog"]').nth(index), index === 0);
  const thinkingCount = await settings().getByRole('combobox').count();
  for (let index = 0; index < thinkingCount; index++) await allSelectOptions(`Mixed reasoning ${index + 1}`, () => settings().getByRole('combobox').nth(index));
  }
  await allSelectOptions('Agent framework', () => settings().locator('#agentFramework'));
  await toggle('Automatic terminal naming', () => settings().locator('#autoNameTerminals'));
  await toggle('Restore automatic terminal naming', () => settings().locator('#autoNameTerminals'));
}
async function withPersistenceFailure(work) {
  // Trigger the real write failure in the isolated profile without replacing
  // renderer APIs or changing any user file. Restore the exact original file.
  const target = path.join(profile, 'settings.json');
  const backup = path.join(profile, 'settings-before-expected-failure.json');
  const { rename, rmdir } = await import('node:fs/promises');
  await rename(target, backup);
  await mkdir(target);
  report.cases.push({ scope, name: 'Isolated actual filesystem failure fixture installed', path: target });
  try { await work(); }
  finally { await rmdir(target); await rename(backup, target); }
}
const wizard = () => page.getByRole('dialog', { name: t('onboarding', 'wizard.title'), exact: true });
const wizardButton = name => wizard().getByRole('button', { name, exact: true });
async function wizardAccounts() {
  for (const [providerId] of providers) {
    await click(`Wizard ${providerId} collapse provider`, () => providerHeader(providerId, wizard));
    await click(`Wizard ${providerId} expand provider`, () => providerHeader(providerId, wizard));
    const block = () => providerBlock(providerId, wizard);
    for (const account of fixtureAccounts.filter(item => item.provider === providerId)) {
      const saved = () => card(account.name, wizard);
      if (account.apiKey) {
        await click(`Wizard ${account.name} reveal fake key`, () => saved().getByRole('button', { name: t('settings', 'providers.card.showKey'), exact: true }));
        await click(`Wizard ${account.name} hide fake key`, () => saved().getByRole('button', { name: t('settings', 'providers.card.hideKey'), exact: true }));
      }
      if (providerId === 'zai') await allSelectOptions('Wizard ZAI card model options', () => saved().getByRole('combobox', { name: t('settings', 'providers.connection.model'), exact: true }));
      await click(`Wizard ${account.name} test fixture account`, () => saved().getByRole('button', { name: t('settings', providerId === 'zai' ? 'providers.connection.testModelAccount' : 'providers.connection.testAccount', { name: account.name }), exact: true }));
      await saved().locator('[role="status"],[role="alert"]').waitFor({ timeout: 15000 });
      if (account.authType === 'oauth') await click(`Wizard ${account.name} reauthenticate intercepted`, () => saved().getByRole('button', { name: t('settings', 'providers.card.reauth'), exact: true }));
      await click(`Wizard ${account.name} edit fixture`, () => saved().getByRole('button', { name: t('settings', 'providers.card.edit'), exact: true }));
      await inventory(`Wizard ${account.name} edit dialog`, dialog());
      if (account.authType === 'oauth') {
        await click(`Wizard ${account.name} edit reauthenticate intercepted`, () => dialogButton(t('settings', providerId === 'openai' ? 'providers.dialog.codexReauthenticate' : 'providers.dialog.oauthReauthenticate')));
        await dialog().getByText(new RegExp('UI audit fixture: external authentication deliberately intercepted')).waitFor();
        if (providerId === 'anthropic') await click('Wizard saved OAuth terminal fallback intercepted', () => dialogButton(t('settings', 'providers.dialog.oauthFallback')));
      }
      if (providerId === 'amazon-bedrock') await allSelectOptions('Wizard account AWS regions', () => dialog().getByRole('combobox'));
      if (providerId === 'zai') await allSelectOptions('Wizard account ZAI model options', () => dialog().getByRole('combobox', { name: t('settings', 'providers.connection.model'), exact: true }));
      if (providerId === 'openai-compatible') for (const modelName of ['Fixture Model', 'Fixture Model 2']) await click(`Wizard discard removal of ${modelName}`, () => dialogButton(t('settings', 'providers.dialog.removeModel', { name: modelName })));
      await click(`Wizard ${account.name} cancel fixture edit`, () => dialogButton(t('settings', 'providers.dialog.cancel')));
      await click(`Wizard ${account.name} open delete confirmation`, () => saved().getByRole('button', { name: t('settings', 'providers.card.delete'), exact: true }));
      await click(`Wizard ${account.name} cancel deletion`, () => page.getByRole('alertdialog').getByRole('button', { name: t('settings', 'providers.dialog.cancel'), exact: true }));
    }
    if (providerId === 'ollama') {
      await fill('Wizard Ollama endpoint', () => block().getByLabel(t('settings', 'providers.ollama.connection.customUrl'), { exact: true }), endpoint);
      await click('Wizard Ollama Test and Save metadata only', () => block().getByRole('button', { name: t('settings', 'providers.ollama.connection.testAndSave'), exact: true }));
      await block().getByText(t('settings', 'providers.ollama.connection.connected'), { exact: true }).waitFor();
      continue;
    }
    const addNames = await block().getByRole('button').filter({ has: page.locator('svg.lucide-plus') }).allTextContents();
    for (const addName of addNames) {
      await click(`Wizard ${providerId} ${addName.trim()}`, () => block().getByRole('button', { name: addName.trim(), exact: true }));
      await inventory(`Wizard ${providerId} ${addName.trim()} dialog`, dialog());
      if (await dialog().locator('#account-apikey').count()) { await createAndRemoveApiFixture(providerId, wizard, 'Wizard'); continue; }
      await fill(`Wizard ${providerId} OAuth name`, () => dialog().locator('#oauth-account-name'), `Wizard OAuth ${providerId}`);
      const authName = t('settings', providerId === 'openai' ? 'providers.dialog.codexAuthenticate' : 'providers.dialog.oauthAuthenticate');
      await click(`Wizard ${providerId} OAuth intercepted authenticate`, () => dialogButton(authName));
      await dialog().getByText(new RegExp('UI audit fixture: external authentication deliberately intercepted')).waitFor();
      if (providerId === 'anthropic') {
        await click('Wizard Anthropic terminal fallback intercepted', () => dialogButton(t('settings', 'providers.dialog.oauthFallback')));
        await page.getByText('UI audit fixture: external authentication deliberately intercepted', { exact: true }).first().waitFor();
      }
      await click(`Wizard ${providerId} cancel OAuth fixture`, () => dialogButton(t('settings', 'providers.dialog.cancel')));
    }
  }
  await inventory('Wizard accounts after all fixture controls', wizard());
}
async function rerunWizard() {
  await openSettings();
  scope = 'onboarding';
  await click('Rerun setup wizard normal settings entry', () => settingsButton(t('settings', 'actions.rerunWizard')));
  await wizard().waitFor();
  await inventory('Wizard welcome', wizard());
}
async function wizardToCompletion(skipMemory = true) {
  await click('Wizard Get Started', () => wizardButton(t('onboarding', 'welcome.getStarted')));
  await click('Wizard account Continue', () => wizardButton(t('onboarding', 'accounts.buttons.continue')));
  await wizardButton(t('onboarding', 'devtools.saveAndContinue')).waitFor();
  await click('Wizard developer tools Save and Continue', () => wizardButton(t('onboarding', 'devtools.saveAndContinue')));
  await click('Wizard privacy Continue', () => wizardButton(t('common', 'buttons.continue')));
  if (skipMemory) await click('Wizard memory Skip', () => wizardButton(t('onboarding', 'memory.skip')));
  else {
    const enabled = () => wizard().getByRole('switch', { name: t('onboarding', 'memory.enableMemory'), exact: true });
    if (await enabled().getAttribute('aria-checked') === 'true') await toggle('Wizard memory disabled for local save', enabled);
    await click('Wizard memory Save and Continue', () => wizardButton(t('onboarding', 'memory.saveAndContinue')));
  }
  await wizardButton(t('onboarding', 'completion.finish')).waitFor();
}
async function onboarding() {
  await openSettings();
  await closeSettings('back');
  await rerunWizard();
  await click('Welcome Get Started first', () => wizardButton(t('onboarding', 'welcome.getStarted')));
  await inventory('Wizard accounts', wizard());
  await wizardAccounts();
  await click('Accounts Back to Welcome', () => wizardButton(t('onboarding', 'accounts.buttons.back')));
  await click('Welcome Get Started second', () => wizardButton(t('onboarding', 'welcome.getStarted')));
  await click('Accounts Skip advances one step', () => wizardButton(t('onboarding', 'accounts.buttons.skip')));
  await wizardButton(t('onboarding', 'devtools.saveAndContinue')).waitFor();
  assert.equal(await wizard().isVisible(), true, 'Skipping accounts must keep the wizard open on Dev Tools');
  await click('Dev Tools Back to Accounts', () => wizardButton(t('common', 'buttons.back')));
  await click('Accounts Continue to Dev Tools', () => wizardButton(t('onboarding', 'accounts.buttons.continue')));
  await inventory('Wizard developer tools', wizard());
  await click('Wizard detect developer tools again', () => wizardButton(t('onboarding', 'devtools.detectAgain')));
  const selects = ['ide', 'terminal', 'cli'];
  for (let index = 0; index < selects.length; index++) {
    await allSelectOptions(`Wizard ${selects[index]} options`, () => wizard().getByRole('combobox').nth(index));
  }
  for (const key of selects) await fill(`Wizard clear custom ${key} to test required path`, () => wizard().locator(`#custom-${key}-path`), '');
  await click('Wizard missing custom path validation', () => wizardButton(t('onboarding', 'devtools.saveAndContinue')));
  await wizard().getByRole('alert').waitFor();
  for (const key of selects) await fill(`Wizard custom ${key} path`, () => wizard().locator(`#custom-${key}-path`), path.join(data, `wizard-${key}`));
  await withPersistenceFailure(async () => {
    await click('Wizard developer tools actual save error', () => wizardButton(t('onboarding', 'devtools.saveAndContinue')));
    await wizard().getByRole('alert').waitFor();
    await wizardButton(t('onboarding', 'devtools.saveAndContinue')).waitFor();
  });
  await click('Wizard developer tools save retry', () => wizardButton(t('onboarding', 'devtools.saveAndContinue')));
  await inventory('Wizard privacy', wizard());
  await click('Privacy Back to Dev Tools', () => wizardButton(t('common', 'buttons.back')));
  await click('Dev Tools return to Privacy', () => wizardButton(t('onboarding', 'devtools.saveAndContinue')));
  await toggle('Wizard optional reporting on', () => wizard().locator('#sentry-toggle'));
  await toggle('Wizard optional reporting off', () => wizard().locator('#sentry-toggle'));
  await withPersistenceFailure(async () => {
    await click('Wizard privacy actual save error', () => wizardButton(t('common', 'buttons.continue')));
    await wizard().getByRole('alert').waitFor();
  });
  await click('Wizard privacy save retry', () => wizardButton(t('common', 'buttons.continue')));
  await inventory('Wizard memory', wizard());
  await click('Memory Back to Privacy', () => wizardButton(t('onboarding', 'memory.back')));
  await click('Privacy return to Memory', () => wizardButton(t('common', 'buttons.continue')));
  const memorySwitch = () => wizard().getByRole('switch', { name: t('onboarding', 'memory.enableMemory'), exact: true });
  if (await memorySwitch().getAttribute('aria-checked') !== 'true') await toggle('Wizard enable memory configuration', memorySwitch);
  const provider = () => wizard().getByRole('combobox', { name: t('onboarding', 'memory.embeddingProvider'), exact: true });
  await click('Wizard embedding provider menu', provider);
  const providerOptions = await page.getByRole('option').allTextContents();
  await press('Wizard embedding initial close', () => page.getByRole('option').first(), 'Escape');
  for (let index = 0; index < providerOptions.length; index++) {
    const name = providerOptions[index].trim();
    await click(`Wizard embedding provider open ${name}`, provider);
    await click(`Wizard embedding provider ${name}`, () => page.getByRole('option').nth(index));
    await inventory(`Wizard memory ${name}`, wizard());
    const modelChoices = await wizard().getByRole('combobox').count();
    if (modelChoices > 1) await allSelectOptions(`Wizard ${name} embedding models`, () => wizard().getByRole('combobox').nth(1));
    const passwords = await wizard().locator('input[type="password"]').count();
    for (let field = 0; field < passwords; field++) {
      await fill(`Wizard ${name} fake embedding key ${field + 1}`, () => wizard().locator('input[type="password"]').nth(field), 'fixture-key-never-valid');
      const show = () => wizard().getByRole('button', { name: /show|hide/i }).first();
      if (await show().count()) { await click(`Wizard ${name} reveal fake embedding key`, show); await click(`Wizard ${name} hide fake embedding key`, show); }
    }
    const inputs = wizard().locator('input[type="text"],input[type="url"],input[type="number"]');
    const inputsCount = await inputs.count();
    for (let field = 0; field < inputsCount; field++) {
      const id = await inputs.nth(field).getAttribute('id') ?? '';
      const type = await inputs.nth(field).getAttribute('type');
      await fill(`Wizard ${name} ${id || 'embedding input'} ${field + 1}`, () => wizard().locator('input[type="text"],input[type="url"],input[type="number"]').nth(field), type === 'number' ? '768' : id.includes('url') ? endpoint : 'fixture-embedding-model');
    }
    const retry = wizard().getByRole('button', { name: /^Retry$/ });
    if (await retry.count()) await click(`Wizard ${name} Ollama Retry`, () => wizard().getByRole('button', { name: /^Retry$/ }));
    const linkNames = await wizard().getByRole('link').allTextContents();
    for (const linkName of linkNames) await click(`Wizard ${name} external information link intercepted ${linkName.trim()}`, () => wizard().getByRole('link', { name: linkName.trim(), exact: true }));
    const downloadNames = await wizard().getByRole('button', { name: /^Download / }).evaluateAll(elements => elements.map(element => element.getAttribute('aria-label') || element.textContent?.trim()));
    for (const downloadName of downloadNames) await click(`Wizard ${name} embedding download intercepted ${downloadName}`, () => wizard().getByRole('button', { name: downloadName, exact: true }));
    const installedEmbeddingChoices = wizard().getByRole('group', { name: t('onboarding', 'memory.embeddingModel'), exact: true }).locator('button[aria-pressed]:enabled');
    const installedChoiceCount = await installedEmbeddingChoices.count();
    for (let choice = 0; choice < installedChoiceCount; choice++) await click(`Wizard ${name} installed fixture embedding selection ${choice + 1}`, () => wizard().getByRole('group', { name: t('onboarding', 'memory.embeddingModel'), exact: true }).locator('button[aria-pressed]:enabled').nth(choice));
    report.unsupported.push({ scope, control: `${name} real embeddings`, reason: 'Configuration controls exercised using fake metadata only. No embedding call or model download is authorized by this audit.' });
  }
  await toggle('Wizard disable memory before local-only save', memorySwitch);
  await withPersistenceFailure(async () => {
    await click('Wizard memory actual save error', () => wizardButton(t('onboarding', 'memory.saveAndContinue')));
    await wizard().getByRole('alert').waitFor();
  });
  await click('Wizard memory save retry', () => wizardButton(t('onboarding', 'memory.saveAndContinue')));
  await inventory('Wizard completion', wizard());
  await shot('wizard-completion');
  await app.evaluate(() => globalThis.__forgeSettingsWalk.externalResponses.push('failure'));
  await click('Wizard Explore docs intercepted dispatch failure', () => wizardButton(t('onboarding', 'completion.exploreDocs.action')));
  await wizard().getByRole('alert').filter({ hasText: t('onboarding', 'completion.exploreDocs.openFailed') }).waitFor();
  await click('Wizard Explore docs intercepted link retry', () => wizardButton(t('onboarding', 'completion.exploreDocs.action')));
  assert.equal(await wizard().getByRole('alert').count(), 0, 'Successful documentation dispatch clears prior error');
  assert.ok((await app.evaluate(() => globalThis.__forgeSettingsWalk.dispatches)).some(item => item.url === 'https://github.com/j-tide/Forge#readme'));
  await withPersistenceFailure(async () => {
    await click('Wizard Finish actual completion-save failure', () => wizardButton(t('onboarding', 'completion.finish')));
    await wizard().getByText(t('onboarding', 'wizard.completionSaveFailed'), { exact: true }).waitFor();
    assert.equal(await wizard().isVisible(), true, 'Failed completion must keep the wizard open');
  });
  await click('Wizard completion retry after restored storage', () => wizardButton(t('onboarding', 'wizard.retry')));
  await wizard().waitFor({ state: 'hidden' });
  await waitPersist('onboardingCompleted', true);
  await rerunWizard();
  await withPersistenceFailure(async () => {
    await click('Welcome Skip Setup actual completion-save failure', () => wizardButton(t('onboarding', 'welcome.skip')));
    await wizard().getByText(t('onboarding', 'wizard.completionSaveFailed'), { exact: true }).waitFor();
  });
  await click('Welcome Skip Setup retry', () => wizardButton(t('onboarding', 'wizard.retry')));
  await wizard().waitFor({ state: 'hidden' });
  await rerunWizard();
  await click('Welcome close button', () => wizard().getByRole('button', { name: 'Close', exact: true }));
  await wizard().waitFor({ state: 'hidden' });
  await rerunWizard();
  await wizardToCompletion();
  await click('Completion Open Settings', () => wizardButton(t('onboarding', 'completion.customizeSettings.action')));
  await settings().waitFor();
  await closeSettings('back');
  await rerunWizard();
  await wizardToCompletion(false);
  const task = wizardButton(t('onboarding', 'completion.createTask.action'));
  if (await task.count()) {
    await click('Completion Open Task Creator', () => wizardButton(t('onboarding', 'completion.createTask.action')));
    await wizard().waitFor({ state: 'hidden' });
    // This is only the entry action. No task is started without a project.
    await shot('wizard-task-creator-entry');
    report.cases.push({ scope, name: 'Task creator entry dispatched', resultingUI: await uiState() });
  } else {
    report.unsupported.push({ scope, control: 'Completion Open Task Creator', reason: 'No fixture project selected; host does not provide this conditional action.' });
    await click('Completion Finish second route', () => wizardButton(t('onboarding', 'completion.finish')));
  }
}

try {
  const executablePath = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
  app = await electron.launch({ executablePath, args: [root], env });
  report.runtimeDirectories = await app.evaluate(({ app: application }) => ({
    home: application.getPath('home'), appData: application.getPath('appData'),
    userData: application.getPath('userData'), envHome: process.env.HOME,
    envConfig: process.env.XDG_CONFIG_HOME,
  }));
  assert.equal(await realpath(report.runtimeDirectories.home), await realpath(isolatedHome), 'Settings QA HOME must remain isolated');
  assert.equal(await realpath(report.runtimeDirectories.userData), await realpath(profile), 'Settings QA profile must remain isolated');
  assert.ok(path.resolve(report.runtimeDirectories.appData).startsWith(`${path.resolve(report.runtimeDirectories.home)}${path.sep}`), 'Settings QA appData must stay inside its HOME');
  assert.equal(report.runtimeDirectories.envHome, isolatedHome, 'Settings QA child HOME must remain isolated');
  assert.equal(report.runtimeDirectories.envConfig, isolatedConfig, 'Settings QA child configuration must remain isolated');
  await app.firstWindow();
  for (let attempt = 0; attempt < 60; attempt++) {
    page = app.windows().find(window => window.url().startsWith('file:') && window.url().includes('/renderer/index.html'));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page, 'Main application renderer window exists');
  await interceptBoundaries();
  await page.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (['file:', 'data:', 'blob:'].includes(requestUrl.protocol) || ['127.0.0.1', 'localhost', '::1'].includes(requestUrl.hostname)) return route.continue();
    report.cases.push({ scope: 'network-boundary', name: 'Renderer request intercepted', method: route.request().method(), origin: requestUrl.origin, pathname: requestUrl.pathname });
    return route.abort('blockedbyclient');
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.bringToFront();
  await app.evaluate(({ app: application, BrowserWindow }) => {
    application.focus({ steal: true });
    const main = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/renderer/index.html'));
    main?.webContents.closeDevTools(); main?.show(); main?.focus(); main?.webContents.focus();
  });
  await page.locator('.forge-glass-sidebar').waitFor({ timeout: 20000 });
  report.appVersion = await page.evaluate(() => window.electronAPI.getAppVersion());
  await shot('before-settings-walk');
  await section('appearance', appearance);
  await section('display', display);
  await section('language', language);
  await section('devtools', devtools);
  await section('terminal-fonts', fonts);
  await section('paths', paths);
  await section('notifications', notifications);
  await section('debug', debug);
  await section('updates', async () => {
    await click('About source and license intercepted link', () => settingsButton(t('settings', 'updates.sourceAndLicense')));
    assert.ok((await app.evaluate(() => globalThis.__forgeSettingsWalk.dispatches)).some(item => item.url === 'https://github.com/j-tide/Forge/tree/main/desktop'));
  });
  await section('accounts', accounts);
  await section('agent', agents);
  if (selected('onboarding')) {
    try { await onboarding(); report.cases.push({ scope, name: 'Wizard walk completed', passed: true }); }
    catch (error) { report.failures.push({ scope, error: String(error) }); await shot('failure-onboarding').catch(() => {}); }
  }
  report.interceptedBoundaries = await app.evaluate(() => globalThis.__forgeSettingsWalk);
  report.localRequests = requests;
  assert.ok(requests.every(request => request.method === 'GET'), 'Actual HTTP fixture only receives free metadata GETs');
  report.valid = report.failures.length === 0;
} catch (error) {
  report.valid = false;
  report.failures.push({ scope, error: String(error) });
} finally {
  if (app) {
    if (pendingClipboardSnapshot) {
      try {
        await restoreNativeClipboard(app, pendingClipboardSnapshot);
        report.clipboard.restored++;
        pendingClipboardSnapshot = undefined;
      } catch (error) {
        report.valid = false;
        report.failures.push({ scope: 'clipboard-cleanup', error: String(error) });
      }
    }
    await app.close();
    report.applicationClosed = true;
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  report.counts = {
    actions: report.actions.length, clicked: report.actions.filter(item => item.kind === 'click').length,
    passed: report.actions.filter(item => item.status === 'passed').length, failed: report.actions.filter(item => item.status === 'failed').length,
    inventories: report.inventories.length, cases: report.cases.length, unsupported: report.unsupported.length,
  };
  const observed = new Map();
  for (const inventory of report.inventories) for (const control of inventory.controls) {
    if (control.tag !== 'BUTTON' && control.role !== 'button') continue;
    const key = `${control.role || 'button'}:${control.name}`;
    if (!observed.has(key)) observed.set(key, { name: control.name, disabled: control.disabled, scopes: [inventory.scope] });
    else { observed.get(key).disabled &&= control.disabled; if (!observed.get(key).scopes.includes(inventory.scope)) observed.get(key).scopes.push(inventory.scope); }
  }
  const clicked = new Set(report.actions.filter(action => ['click', 'download'].includes(action.kind) && action.status === 'passed').map(action => `${action.before?.role || 'button'}:${action.before?.name}`));
  report.buttonNameCoverage = {
    observedDistinctNames: observed.size,
    clickedDistinctNames: [...observed.keys()].filter(key => clicked.has(key)).length,
    observedNamesWithoutSuccessfulClick: [...observed.entries()].filter(([key]) => !clicked.has(key)).map(([, value]) => value),
    note: 'Distinct rendered names are an additional audit aid. Full instance/context evidence is each action plus its scope and pre-state; this summary is not a claim of every conditional branch.',
  };
  const elementRows = new Map();
  const signature = control => `${control.elementId}:${control.tag}:${control.role || ''}:${control.id || ''}:${control.name || ''}`;
  for (const inventory of report.inventories) for (const control of inventory.controls) {
    const key = signature(control);
    if (!elementRows.has(key)) elementRows.set(key, { ...control, conditions: [], observations: 0, actions: [] });
    const row = elementRows.get(key);
    row.observations++;
    row.disabled &&= control.disabled;
    const condition = `${inventory.scope} / ${inventory.label}`;
    if (!row.conditions.includes(condition)) row.conditions.push(condition);
  }
  for (const interaction of report.actions) {
    if (!interaction.before) continue;
    const key = signature(interaction.before);
    if (!elementRows.has(key)) elementRows.set(key, { ...interaction.before, conditions: [interaction.scope], observations: 1, actions: [] });
    elementRows.get(key).actions.push({ number: interaction.number, kind: interaction.kind, name: interaction.name, status: interaction.status });
  }
  const successfulEquivalentActions = new Map();
  const semanticSignature = control => `${control.tag}:${control.role || ''}:${control.name || ''}`;
  for (const row of elementRows.values()) {
    const successful = row.actions.filter(action => action.status === 'passed');
    if (successful.length) successfulEquivalentActions.set(semanticSignature(row), [...(successfulEquivalentActions.get(semanticSignature(row)) || []), ...successful.map(action => action.number)]);
  }
  for (const row of elementRows.values()) {
    row.outcome = row.actions.some(action => action.status === 'failed') ? 'failed' : row.actions.some(action => action.status === 'passed') ? 'exercised' : row.disabled ? 'disabled-in-observed-state' : 'not-exercised-in-this-element-lifetime';
    if (row.outcome === 'not-exercised-in-this-element-lifetime') row.equivalentNamedInteractionNumbers = successfulEquivalentActions.get(semanticSignature(row)) || [];
  }
  report.controlMatrix = [...elementRows.values()];
  report.controlMatrixCounts = Object.fromEntries(['exercised', 'failed', 'disabled-in-observed-state', 'not-exercised-in-this-element-lifetime'].map(outcome => [outcome, report.controlMatrix.filter(row => row.outcome === outcome).length]));
  await writeFile(path.join(output, 'control-matrix.json'), JSON.stringify({ counts: report.controlMatrixCounts, controls: report.controlMatrix, boundaries: report.boundaries, unsupported: report.unsupported }, null, 2));
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ valid: report.valid, output, data, ...report.counts, failures: report.failures }));
}
if (!report.valid) process.exitCode = 1;
