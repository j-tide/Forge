/**
 * GitHub OAuth Copy UI with an explicitly synthetic device flow. The caller
 * owns Electron/native focus; importing this module launches nothing. No gh,
 * browser, token, provider or original GitHub handler is invoked by the fixture.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { captureNativeClipboard, restoreNativeClipboard } from './clipboard-fixture-safety.mjs';

const MAIN_STATE = '__forgeConditionalGitHubOAuth';
const BROWSER_STATE = '__forgeConditionalGitHubOAuthBrowser';
const NATIVE_STATE = '__forgeConditionalGitHubOAuthNativeCopy';
const REFUSAL_STATE = '__forgeConditionalGitHubOAuthCopyRefusal';
const CODE = 'QA00-0000';
const AUTH_URL = 'https://example.invalid/forge-synthetic-device-flow';
const AUTH_ERROR = 'SYNTHETIC UI FIXTURE ONLY: authentication was intentionally not attempted.';
const REQUIRED_CHANNELS = ['github:checkCli', 'github:checkAuth', 'github:startAuth', 'github:getToken', 'github:getUser', 'github:listUserRepos'];

export async function walkConditionalGitHubOAuthCopy(ctx) {
  const { app, page, projectId, fixture, profile, report, t, button, click, segment, shot, blocked, nav } = ctx;
  report.fixtureSetup ??= [];
  const scope = page.locator('section[aria-labelledby="project-settings-page-title"]');
  const labels = {};
  for (const key of ['buttons.copy', 'buttons.copied', 'buttons.copying', 'buttons.retry', 'buttons.cancel',
    'github.authenticate', 'github.authenticating', 'errors.authenticationTitle',
    'github.clipboard.copyCode', 'github.clipboard.copyUrl', 'github.clipboard.codeCopied',
    'github.clipboard.urlCopied', 'github.clipboard.copyFailed', 'github.clipboard.copyFailedDescription']) {
    labels[key] = await t('uiProjectOAuth', key);
  }

  async function preservingNativeCopy(text, target, operation) {
    // Capture immediately before this specific native action; never save or log it.
    const saved = await captureNativeClipboard(app);
    if (saved.unsupported.length) {
      await blocked(`GitHub OAuth ${target} native Copy`, 'The current native clipboard format cannot be completely restored. Copy was not clicked and the original contents were preserved.');
      report.fixtureSetup.push({ kind: 'synthetic-github-oauth-native-copy-blocked', target,
        actualNativeWrites: 0, unsupportedNativeFormats: true, originalContentsLogged: false });
      return false;
    }
    const owner = randomUUID();
    let installed = false;
    let settlement;
    try {
      installed = true;
      const installation = await page.evaluate(({ key, owner, text }) => {
        if (window[key]) throw new Error('A GitHub native Copy fixture is already installed');
        if (typeof navigator.clipboard?.writeText !== 'function') return { supported: false };
        const clipboard = navigator.clipboard;
        const state = { clipboard, original: clipboard.writeText,
          ownDescriptor: Object.getOwnPropertyDescriptor(clipboard, 'writeText'), owner, writes: [], rejected: 0 };
        state.wrapper = function (...args) {
          if (args.length !== 1 || args[0] !== text || state.writes.length !== 0) {
            state.rejected++;
            return Promise.reject(new Error('Synthetic GitHub Copy fixture refused an unexpected write before OS mutation'));
          }
          const result = Reflect.apply(state.original, clipboard, args);
          state.writes.push(Promise.resolve(result).then(() => true, () => false));
          return result;
        };
        window[key] = state;
        try { Object.defineProperty(clipboard, 'writeText', { configurable: true, writable: true, value: state.wrapper }); }
        catch (error) { delete window[key]; throw error; }
        return { supported: true, identity: clipboard.writeText === state.wrapper };
      }, { key: NATIVE_STATE, owner, text });
      if (!installation.supported) {
        installed = false;
        await blocked(`GitHub OAuth ${target} native Copy`, 'This renderer has no clipboard.writeText transport; no write was attempted.');
        return false;
      }
      assert.equal(installation.identity, true);
      await operation();
      assert.equal(await app.evaluate(({ clipboard }, expected) => clipboard.readText() === expected, text), true,
        'The native clipboard must contain the exact synthetic Copy value');
      return true;
    } finally {
      try {
        if (installed) {
          settlement = await page.evaluate(async ({ key, owner }) => {
            const state = window[key];
            if (!state) return null;
            if (state.owner !== owner) throw new Error('Refuse to restore another native Copy observer');
            const writes = await Promise.all(state.writes);
            if (state.clipboard.writeText !== state.wrapper) throw new Error('Native Copy transport identity changed');
            if (state.ownDescriptor) Object.defineProperty(state.clipboard, 'writeText', state.ownDescriptor);
            else Reflect.deleteProperty(state.clipboard, 'writeText');
            const restoredSameFunction = state.clipboard.writeText === state.original;
            delete window[key];
            return { writes, restoredSameFunction, rejected: state.rejected };
          }, { key: NATIVE_STATE, owner });
          assert.ok(settlement, 'Native Copy observer installation was not acknowledged');
          assert.equal(settlement.restoredSameFunction, true);
          assert.equal(settlement.rejected, 0);
          assert.deepEqual(settlement.writes, [true], 'Exactly one native write must settle before restoration');
        }
      } finally {
        await restoreNativeClipboard(app, saved);
        report.fixtureSetup.push({ kind: 'synthetic-github-oauth-native-clipboard-preservation', target,
          writerSettlementConfirmed: !!settlement, actualNativeWrites: settlement?.writes.length || 0,
          restoredFormatsAndContentsAtVerification: true, originalContentsLogged: false });
      }
    }
  }

  async function copySuccessAndFailure(target, text) {
    const copy = button(labels[`github.clipboard.copy${target === 'code' ? 'Code' : 'Url'}`], scope);
    const copiedToast = labels[`github.clipboard.${target}Copied`];
    const nativeSuccess = await preservingNativeCopy(text, `${target}-success`, async () => {
      await click(copy, `Copy synthetic GitHub OAuth ${target} through actual native transport`);
      await expect(copy).toBeEnabled();
      await expect(copy).toHaveText(labels['buttons.copied']);
      await page.getByText(copiedToast, { exact: true }).last().waitFor();
      await shot(`synthetic-github-oauth-${target}-native-success`);
    });
    await expect(copy).toHaveText(labels['buttons.copy']);
    const refusalOwner = randomUUID();
    let refusalInstalled = false;
    let refusalVerified = false;
    try {
      refusalInstalled = true;
      const installation = await page.evaluate(({ key, owner, text }) => {
        if (window[key]) throw new Error('A GitHub Copy refusal fixture is already installed');
        if (typeof navigator.clipboard?.writeText !== 'function') return { supported: false };
        const clipboard = navigator.clipboard;
        const state = { clipboard, original: clipboard.writeText,
          ownDescriptor: Object.getOwnPropertyDescriptor(clipboard, 'writeText'), owner, calls: 0, rejected: 0,
          reject: undefined, promise: undefined, settled: false };
        state.wrapper = (...args) => {
          if (args.length !== 1 || args[0] !== text || state.calls !== 0) {
            state.rejected++;
            return Promise.reject(new Error('Synthetic GitHub refusal rejected an unexpected Copy before OS mutation'));
          }
          state.calls++;
          state.promise = new Promise((_, reject) => { state.reject = reject; });
          state.promise.catch(() => undefined);
          return state.promise;
        };
        window[key] = state;
        try { Object.defineProperty(clipboard, 'writeText', { configurable: true, writable: true, value: state.wrapper }); }
        catch (error) { delete window[key]; throw error; }
        return { supported: true, identity: clipboard.writeText === state.wrapper };
      }, { key: REFUSAL_STATE, owner: refusalOwner, text });
      if (!installation.supported) {
        refusalInstalled = false;
        await blocked(`GitHub OAuth ${target} controlled Copy rejection`, 'Renderer clipboard support is unavailable; no transport replacement or native write was attempted.');
      } else {
        assert.equal(installation.identity, true);
        await click(copy, `Copy synthetic GitHub OAuth ${target} using a held rejection Promise, with no OS write`);
        await expect(copy).toBeDisabled();
        await expect(copy).toHaveAttribute('aria-busy', 'true');
        await expect(copy).toHaveText(labels['buttons.copying']);
        assert.equal(await page.evaluate(key => window[key].calls, REFUSAL_STATE), 1);
        await shot(`synthetic-github-oauth-${target}-copy-pending`);
        await page.evaluate(key => {
          const state = window[key];
          if (typeof state?.reject !== 'function') throw new Error('Missing held GitHub clipboard rejection');
          state.settled = true;
          state.reject(new Error('Synthetic GitHub clipboard refusal before OS mutation'));
        }, REFUSAL_STATE);
        await expect(copy).toBeEnabled();
        await expect(copy).toHaveAttribute('aria-busy', 'false');
        await expect(copy).toHaveText(labels['buttons.copy']);
        await page.getByText(labels['github.clipboard.copyFailed'], { exact: true }).last().waitFor();
        await page.getByText(labels['github.clipboard.copyFailedDescription'], { exact: true }).last().waitFor();
        await shot(`synthetic-github-oauth-${target}-copy-refusal`);
        refusalVerified = true;
        report.fixtureSetup.push({ kind: 'synthetic-github-oauth-copy-refusal', target, calls: 1, actualOSWrites: 0,
          pendingDisabledAndBusyVerified: true, visibleLocalizedErrorAndRetryGuidance: true,
          retryControl: 'Same accessible Copy button; OAuth Retry separately restarts the synthetic flow', productLogin: false });
      }
    } finally {
      if (refusalInstalled) {
        const restoration = await page.evaluate(async ({ key, owner }) => {
          const state = window[key];
          if (!state) return null;
          if (state.owner !== owner) throw new Error('Refuse to restore another GitHub Copy refusal');
          if (!state.settled) state.reject?.(new Error('Synthetic GitHub clipboard fixture cleanup'));
          await state.promise?.catch(() => undefined);
          if (state.clipboard.writeText !== state.wrapper) throw new Error('GitHub refusal transport identity changed');
          if (state.ownDescriptor) Object.defineProperty(state.clipboard, 'writeText', state.ownDescriptor);
          else Reflect.deleteProperty(state.clipboard, 'writeText');
          const result = { restoredSameFunction: state.clipboard.writeText === state.original, calls: state.calls, rejected: state.rejected };
          delete window[key];
          return result;
        }, { key: REFUSAL_STATE, owner: refusalOwner });
        assert.ok(restoration, 'GitHub Copy refusal installation was not acknowledged');
        assert.equal(restoration.restoredSameFunction, true);
        assert.equal(restoration.calls, 1);
        assert.equal(restoration.rejected, 0);
        report.fixtureSetup.push({ kind: 'synthetic-github-oauth-refusal-transport-restoration', target, ...restoration });
      }
    }
    let nativeRetry = false;
    if (refusalVerified) {
      nativeRetry = await preservingNativeCopy(text, `${target}-retry`, async () => {
        await click(copy, `Retry synthetic GitHub OAuth ${target} Copy after restoring original native transport`);
        await expect(copy).toBeEnabled();
        await expect(copy).toHaveText(labels['buttons.copied']);
        await page.getByText(copiedToast, { exact: true }).last().waitFor();
        await shot(`synthetic-github-oauth-${target}-native-retry-success`);
      });
    }
    report.fixtureSetup.push({ kind: 'synthetic-github-oauth-copy-outcome', target, nativeSuccess, controlledRefusal: refusalVerified,
      nativeRetry, refusalRestoredBeforeRetry: refusalVerified, productLogin: false, originalContentsLogged: false });
  }

  await segment('conditional-github-oauth-synthetic-copy-controls', async () => {
    const projects = await page.evaluate(() => window.electronAPI.getProjects());
    assert.equal(projects.success, true);
    const project = projects.data.find(candidate => candidate.id === projectId);
    assert.ok(project);
    assert.equal(path.resolve(project.path), path.resolve(fixture), 'Require the disposable fixture project');
    assert.equal(project.autoBuildPath, '.forge-glass-preview');
    assert.match(await readFile(path.join(fixture, 'README.md'), 'utf8'), /CONDITIONAL UI FIXTURE/);
    assert.doesNotMatch(await readFile(path.join(fixture, '.git', 'config'), 'utf8'), /\[remote\s/,
      'Require a local project with no Git remote');
    const directories = await app.evaluate(({ app: application }) => ({ home: application.getPath('home'), userData: application.getPath('userData') }));
    assert.equal(path.resolve(directories.userData), path.resolve(profile));
    assert.ok(path.resolve(directories.home).startsWith(path.dirname(path.resolve(profile)) + path.sep), 'Require isolated HOME');
    const accounts = await page.evaluate(() => window.electronAPI.getProviderAccounts());
    assert.ok(accounts.success && accounts.data.accounts.length === 0, 'Require zero configured provider accounts');
    const envBefore = await page.evaluate(id => window.electronAPI.getProjectEnv(id), projectId);
    assert.ok(envBefore.success && envBefore.data);
    assert.equal(envBefore.data.githubEnabled, false, 'Require the fixture GitHub integration to start disabled');
    assert.ok(!envBefore.data.githubToken && !envBefore.data.githubRepo, 'Require no token or configured remote repository');
    assert.ok(project.settings.mainBranch || envBefore.data.defaultBranch, 'Require an existing local default branch to avoid auto-detect preference writes');

    const support = await app.evaluate(({ ipcMain }, required) => ({ mapPresent: ipcMain._invokeHandlers instanceof Map,
      requiredOriginalsPresent: required.every(channel => typeof ipcMain._invokeHandlers?.get?.(channel) === 'function') }), REQUIRED_CHANNELS);
    report.fixtureSetup.push({ kind: 'synthetic-github-oauth-handler-access', ...support,
      fixtureLimitation: 'Electron has no public getHandler API. Private _invokeHandlers is feature-detected; replacement/restoration use public removeHandler/handle.' });
    if (!support.mapPresent || !support.requiredOriginalsPresent) {
      await blocked('Synthetic GitHub OAuth Copy fixture', 'The original invoke handlers cannot be safely captured and restored. OAuth was not opened or clicked.');
      return;
    }

    const owner = randomUUID();
    let mainInstalled = false;
    let browserInstalled = false;
    let integrationEnabled = false;
    let workflowComplete = false;
    try {
      mainInstalled = true;
      const installed = await app.evaluate(({ ipcMain, BrowserWindow, shell }, config) => {
        if (globalThis[config.key]) throw new Error('A synthetic GitHub OAuth fixture is already installed');
        const handlers = ipcMain._invokeHandlers;
        if (!(handlers instanceof Map)) throw new Error('Private Electron invoke-handler Map is unavailable');
        const originals = new Map([...handlers.entries()].filter(([channel]) => channel.startsWith('github:')));
        if (!config.required.every(channel => typeof originals.get(channel) === 'function')) throw new Error('Missing original GitHub handlers');
        const windows = BrowserWindow.getAllWindows().filter(candidate => candidate.webContents.getURL() === config.rendererURL);
        if (windows.length !== 1) throw new Error('Require one exact caller renderer');
        const sender = windows[0].webContents;
        const state = { owner: config.owner, projectId: config.projectId, sender, originals, wrappers: new Map(),
          calls: [], rejected: [], starts: 0, pending: null, deviceEvents: 0, shellOriginal: shell.openExternal, browserRequests: 0 };
        state.failure = { success: false, error: config.error, data: { success: false, deviceCode: config.code,
          authUrl: config.url, fallbackUrl: config.url, browserOpened: false } };
        for (const channel of originals.keys()) {
          const wrapper = (event, ...args) => {
            const count = state.calls.filter(call => call.channel === channel).length;
            const permitted = event?.sender?.id === sender.id && args.length === 0 &&
              ((channel === 'github:checkCli' || channel === 'github:checkAuth') ? count === 0 :
                channel === 'github:startAuth' && state.starts < 2 && !state.pending);
            if (!permitted) {
              state.rejected.push({ channel, sameSender: event?.sender?.id === sender.id, extraArguments: args.length });
              return { success: false, error: 'Synthetic GitHub fixture refused an unexpected call before gh, token or provider access' };
            }
            state.calls.push({ channel, projectId: config.projectId, originalHandlerInvoked: false });
            if (channel === 'github:checkCli') return { success: true, data: { installed: true, version: 'synthetic-ui-fixture' } };
            if (channel === 'github:checkAuth') return { success: true, data: { authenticated: false } };
            state.starts++;
            return new Promise(resolve => { state.pending = resolve; });
          };
          state.wrappers.set(channel, wrapper);
        }
        state.shellWrapper = async () => { state.browserRequests++; throw new Error('Synthetic GitHub fixture blocked an unexpected browser request'); };
        globalThis[config.key] = state;
        for (const [channel, wrapper] of state.wrappers) {
          ipcMain.removeHandler(channel);
          ipcMain.handle(channel, wrapper);
        }
        shell.openExternal = state.shellWrapper;
        return { originalCaptured: true, originals: originals.size,
          wrapperIdentityVerified: [...state.wrappers].every(([channel, wrapper]) => handlers.get(channel) === wrapper),
          shellIdentityVerified: shell.openExternal === state.shellWrapper, originalHandlerInvoked: false };
      }, { key: MAIN_STATE, owner, projectId, rendererURL: page.url(), required: REQUIRED_CHANNELS, code: CODE, url: AUTH_URL, error: AUTH_ERROR });
      assert.equal(installed.wrapperIdentityVerified, true);
      assert.equal(installed.shellIdentityVerified, true);
      browserInstalled = true;
      const browser = await page.evaluate(({ key, owner }) => {
        if (window[key]) throw new Error('A GitHub browser guard is already installed');
        const state = { owner, original: window.open, ownDescriptor: Object.getOwnPropertyDescriptor(window, 'open'), calls: 0 };
        state.wrapper = () => { state.calls++; throw new Error('Synthetic GitHub fixture blocked window.open before browser mutation'); };
        window[key] = state;
        Object.defineProperty(window, 'open', { configurable: true, writable: true, value: state.wrapper });
        return { identity: window.open === state.wrapper };
      }, { key: BROWSER_STATE, owner });
      assert.equal(browser.identity, true);
      report.fixtureSetup.push({ kind: 'synthetic-github-oauth-device-flow', projectId, componentOnly: true,
        productLogin: false, syntheticDeviceCode: CODE, authenticationURL: AUTH_URL, ghCalls: 0, browserOpens: 0,
        tokenCalls: 0, providerCalls: 0, originalGitHubHandlersInvoked: false });

      await nav('kanban');
      await click(page.locator('.forge-glass-project-tabs').getByRole('button', { name: await t('common', 'projectTab.settings'), exact: true }),
        'Open normal project settings for synthetic GitHub OAuth Copy');
      await scope.waitFor();
      await expect(scope.locator('#project-settings-project-name')).toHaveText(project.name);
      await click(scope.locator('nav').getByRole('button', { name: await t('settings', 'projectSections.github.title'), exact: true }),
        'Navigate normal project GitHub settings');
      const enable = scope.getByRole('switch').first();
      await expect(enable).toHaveAttribute('aria-checked', 'false');
      const switchAria = await enable.ariaSnapshot();
      report.fixtureSetup.push({ kind: 'github-enabled-switch-accessibility-evidence', ariaSnapshot: switchAria,
        accessibleNameMissing: /^- switch(?:$| \[)/m.test(switchAria) });
      integrationEnabled = true;
      await click(enable, 'Enable only the disposable GitHub project integration');
      await expect(enable).toHaveAttribute('aria-checked', 'true');
      await click(button(await t('uiSettings', 'text029'), scope), 'Open OAuth through the normal Use OAuth Instead control');
      await click(button(labels['github.authenticate'], scope), 'Start bounded synthetic device flow; gh and browser remain unused');
      await expect(scope.getByRole('heading', { name: labels['github.authenticating'], exact: true })).toBeVisible();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const emitted = await app.evaluate((_electron, { key, owner, code, url }) => {
        const state = globalThis[key];
        if (!state || state.owner !== owner || !state.pending || state.starts !== 1 || state.deviceEvents !== 0) throw new Error('Unexpected synthetic device-flow state');
        state.sender.send('github:authDeviceCode', { deviceCode: code, authUrl: url, browserOpened: false });
        state.deviceEvents++;
        return { syntheticDeviceEvents: state.deviceEvents, browserOpened: false };
      }, { key: MAIN_STATE, owner, code: CODE, url: AUTH_URL });
      assert.equal(emitted.syntheticDeviceEvents, 1);
      await expect(button(labels['github.clipboard.copyCode'], scope)).toBeEnabled();
      await copySuccessAndFailure('code', CODE);

      async function finishSyntheticAuth(expectedStart) {
        await app.evaluate((_electron, { key, owner, expectedStart }) => {
          const state = globalThis[key];
          if (!state || state.owner !== owner || !state.pending || state.starts !== expectedStart) throw new Error('Unexpected synthetic auth settlement');
          const resolve = state.pending; state.pending = null; resolve(state.failure);
        }, { key: MAIN_STATE, owner, expectedStart });
        await expect(scope.getByRole('heading', { name: labels['errors.authenticationTitle'], exact: true })).toBeVisible();
        await scope.getByText(AUTH_ERROR, { exact: true }).waitFor();
        await expect(button(labels['buttons.retry'], scope)).toBeEnabled();
      }
      await finishSyntheticAuth(1);
      await expect(button(labels['github.clipboard.copyUrl'], scope)).toBeEnabled();
      await copySuccessAndFailure('url', AUTH_URL);
      await click(button(labels['buttons.retry'], scope), 'Click actual OAuth Retry under the synthetic handler; no authentication occurs');
      await expect(scope.getByRole('heading', { name: labels['github.authenticating'], exact: true })).toBeVisible();
      await expect(button(labels['github.clipboard.copyUrl'], scope)).toHaveCount(0);
      await finishSyntheticAuth(2);
      await expect(button(labels['github.clipboard.copyUrl'], scope)).toHaveText(labels['buttons.copy']);
      await shot('synthetic-github-oauth-retry-still-unauthenticated');
      await click(button(labels['buttons.cancel'], scope), 'Cancel synthetic OAuth through the normal flow control');
      await expect(button(await t('uiSettings', 'text029'), scope)).toBeVisible();
      workflowComplete = true;
    } finally {
      try {
        // Settle a held synthetic promise before unmounting its normal UI.
        if (mainInstalled) await app.evaluate((_electron, { key, owner }) => {
          const state = globalThis[key];
          if (!state) return;
          if (state.owner !== owner) throw new Error('Refuse another GitHub fixture settlement');
          if (state.pending) { const resolve = state.pending; state.pending = null; resolve(state.failure); }
        }, { key: MAIN_STATE, owner });
        if (integrationEnabled && await scope.isVisible()) {
          const enable = scope.getByRole('switch').first();
          if (await enable.getAttribute('aria-checked') === 'true') await click(enable, 'Restore disposable GitHub enable preference');
          await expect(enable).toHaveAttribute('aria-checked', 'false');
          await expect.poll(async () => (await page.evaluate(id => window.electronAPI.getProjectEnv(id), projectId)).data?.githubEnabled).toBe(false);
        }
        if (await scope.isVisible()) await click(scope.locator('header').getByRole('button', { name: await t('common', 'buttons.back'), exact: true }), 'Return through normal project settings Back');
        const envAfter = await page.evaluate(id => window.electronAPI.getProjectEnv(id), projectId);
        assert.ok(envAfter.success);
        assert.equal(JSON.stringify(envAfter.data) === JSON.stringify(envBefore.data), true,
          'Synthetic OAuth must preserve the original local environment configuration without logging its contents');
        report.fixtureSetup.push({ kind: 'synthetic-github-oauth-project-config-preservation',
          originalConfigRestored: true, configContentsLogged: false, productLogin: false });
      } finally {
        try {
          if (browserInstalled) {
            const restored = await page.evaluate(({ key, owner }) => {
              const state = window[key];
              if (!state) return null;
              if (state.owner !== owner || (window.open !== state.wrapper && window.open !== state.original)) throw new Error('GitHub browser guard identity changed');
              if (state.ownDescriptor) Object.defineProperty(window, 'open', state.ownDescriptor);
              else Reflect.deleteProperty(window, 'open');
              const result = { restoredSameFunction: window.open === state.original, browserRequests: state.calls };
              delete window[key]; return result;
            }, { key: BROWSER_STATE, owner });
            assert.ok(restored, 'GitHub browser guard installation was not acknowledged');
            report.fixtureSetup.push({ kind: 'synthetic-github-oauth-browser-guard-restoration', ...restored });
            assert.equal(restored.restoredSameFunction, true);
            assert.equal(restored.browserRequests, 0);
          }
        } finally {
          if (mainInstalled) {
            const restored = await app.evaluate(({ ipcMain, shell }, { key, owner }) => {
              const state = globalThis[key];
              if (!state) return null;
              if (state.owner !== owner) throw new Error('Refuse another GitHub handler restoration');
              if (state.pending) { const resolve = state.pending; state.pending = null; resolve(state.failure); }
              const handlers = ipcMain._invokeHandlers;
              for (const [channel, original] of state.originals) {
                const current = handlers.get(channel);
                if (current !== original && current !== state.wrappers.get(channel)) throw new Error('GitHub handler identity changed');
                if (current !== original) { ipcMain.removeHandler(channel); ipcMain.handle(channel, original); }
              }
              if (shell.openExternal !== state.shellOriginal && shell.openExternal !== state.shellWrapper) throw new Error('GitHub shell guard identity changed');
              shell.openExternal = state.shellOriginal;
              const result = { allOriginalRefsRestored: [...state.originals].every(([channel, original]) => handlers.get(channel) === original),
                shellOriginalRefRestored: shell.openExternal === state.shellOriginal, calls: state.calls, rejected: state.rejected,
                starts: state.starts, deviceEvents: state.deviceEvents, browserRequests: state.browserRequests,
                ghCalls: 0, tokenCalls: 0, providerCalls: 0, productLogin: false, originalGitHubHandlersInvoked: false };
              delete globalThis[key]; return result;
            }, { key: MAIN_STATE, owner });
            assert.ok(restored, 'GitHub Main fixture installation was not acknowledged');
            report.fixtureSetup.push({ kind: 'synthetic-github-oauth-main-handler-restoration', ...restored, workflowComplete });
            assert.equal(restored.allOriginalRefsRestored, true);
            assert.equal(restored.shellOriginalRefRestored, true);
            assert.equal(restored.rejected.length, 0);
            assert.equal(restored.browserRequests, 0);
            assert.equal(restored.ghCalls, 0);
            assert.equal(restored.tokenCalls, 0);
            assert.equal(restored.providerCalls, 0);
            assert.equal(restored.productLogin, false);
            assert.equal(restored.originalGitHubHandlersInvoked, false);
            assert.ok(restored.calls.every(call => call.originalHandlerInvoked === false));
            if (workflowComplete) {
              assert.equal(restored.starts, 2);
              assert.equal(restored.deviceEvents, 1);
              assert.deepEqual(restored.calls.map(call => call.channel), ['github:checkCli', 'github:checkAuth', 'github:startAuth', 'github:startAuth']);
            }
          }
        }
      }
    }
  });
  await walkConditionalIntegrationSwitches(ctx);
}

/** Normal integration switch labels/toggles, with all hosted dispatch guarded. */
export async function walkConditionalIntegrationSwitches(ctx) {
  const { app, page, projectId, fixture, profile, report, t, click, segment, shot, blocked, nav } = ctx;
  await segment('conditional-integration-switch-accessible-controls', async () => {
    report.fixtureSetup ??= [];
    const prefix = ['github:', 'gitlab:', 'linear:'];
    const branchChannels = ['git:getBranchesWithInfo', 'git:getBranches', 'git:detectMainBranch'];
    const required = ['github:checkConnection', 'gitlab:checkCli', 'gitlab:checkConnection', 'linear:checkConnection', ...branchChannels];
    const mainKey = '__forgeConditionalIntegrationSwitches';
    const browserKey = '__forgeConditionalIntegrationSwitchBrowser';
    const scope = page.locator('section[aria-labelledby="project-settings-page-title"]');
    const beforeProjects = await page.evaluate(() => window.electronAPI.getProjects());
    assert.ok(beforeProjects.success);
    const project = beforeProjects.data.find(candidate => candidate.id === projectId);
    assert.ok(project && project.autoBuildPath === '.forge-glass-preview');
    assert.equal(path.resolve(project.path), path.resolve(fixture));
    assert.match(await readFile(path.join(fixture, 'README.md'), 'utf8'), /CONDITIONAL UI FIXTURE/);
    assert.doesNotMatch(await readFile(path.join(fixture, '.git', 'config'), 'utf8'), /\[remote\s/);
    assert.ok(project.settings.mainBranch, 'Require a configured fixture branch; never trigger branch auto-detection');
    const directories = await app.evaluate(({ app: application }) => ({ home: application.getPath('home'), userData: application.getPath('userData') }));
    assert.equal(path.resolve(directories.userData), path.resolve(profile));
    assert.ok(path.resolve(directories.home).startsWith(path.dirname(path.resolve(profile)) + path.sep));
    const accounts = await page.evaluate(() => window.electronAPI.getProviderAccounts());
    assert.ok(accounts.success && accounts.data.accounts.length === 0);
    const beforeEnv = await page.evaluate(id => window.electronAPI.getProjectEnv(id), projectId);
    assert.ok(beforeEnv.success && beforeEnv.data);
    for (const field of ['githubEnabled', 'gitlabEnabled', 'linearEnabled']) assert.equal(beforeEnv.data[field], false);
    for (const field of ['githubToken', 'githubRepo', 'gitlabToken', 'gitlabProject', 'linearApiKey']) {
      assert.equal(Boolean(beforeEnv.data[field]), false, 'No credentials or hosted repository may be configured');
    }
    const support = await app.evaluate(({ ipcMain }, required) => ({
      mapPresent: ipcMain._invokeHandlers instanceof Map,
      requiredOriginalsPresent: required.every(channel => typeof ipcMain._invokeHandlers?.get?.(channel) === 'function'),
      listenerAPIsPresent: ['eventNames', 'rawListeners', 'removeAllListeners', 'on'].every(name => typeof ipcMain[name] === 'function'),
    }), required);
    report.fixtureSetup.push({ kind: 'integration-switch-hosted-handler-access', ...support,
      fixtureLimitation: 'Private invoke Map is feature-detected; public removeHandler/handle and EventEmitter listener APIs restore exact original references.' });
    if (!support.mapPresent || !support.requiredOriginalsPresent || !support.listenerAPIsPresent) {
      await blocked('Integration switch controls', 'Hosted handlers cannot be safely captured/restored; no integration UI was opened or enabled.');
      return;
    }

    const definitions = [
      { section: 'github', enable: ['uiSettings', 'text021', 'text022', 'githubEnabled'],
        children: [['settings', 'projectSections.github.pushNewBranches.label', 'projectSections.github.pushNewBranches.description', 'pushNewBranches'],
          ['uiSettings', 'text048', 'text049', 'githubAutoSync']] },
      { section: 'gitlab', enable: ['gitlab', 'settings.enableIssues', 'settings.enableIssuesDescription', 'gitlabEnabled'],
        children: [['gitlab', 'settings.autoSyncOnLoad', 'settings.autoSyncDescription', 'gitlabAutoSync']] },
      { section: 'linear', enable: ['uiSettings', 'text050', 'text051', 'linearEnabled'],
        children: [['uiSettings', 'text059', 'text060', 'linearRealtimeSync']] },
    ];
    const owner = randomUUID();
    let mainInstalled = false;
    let browserInstalled = false;
    const activeEnvControls = new Map();
    let workflowComplete = false;
    async function unchangedPreferences() {
      const result = await page.evaluate(() => window.electronAPI.getProjects());
      assert.ok(result.success);
      const after = result.data.find(candidate => candidate.id === projectId);
      assert.ok(after);
      assert.equal(JSON.stringify(after.settings) === JSON.stringify(project.settings), true,
        'Local push preference drafts must not persist without Save');
      // Main exposes Date values; compare their value rather than the identity
      // of two separately serialized getProjects responses.
      assert.deepEqual(after.updatedAt, project.updatedAt, 'Switch drafts must not change project metadata');
    }
    async function control(definition) {
      const [namespace, nameKey, descriptionKey, field] = definition;
      const name = await t(namespace, nameKey);
      const description = await t(namespace, descriptionKey);
      const target = scope.getByRole('switch', { name, exact: true });
      await expect(target).toHaveCount(1);
      await expect(target).toHaveAccessibleName(name);
      await expect(target).toHaveAccessibleDescription(description);
      const association = await target.evaluate(node => {
        const label = [...document.querySelectorAll('label')].find(candidate => candidate.htmlFor === node.id);
        return { idPresent: Boolean(node.id), associatedLabel: label?.textContent?.trim() || '',
          descriptionPresent: Boolean(node.getAttribute('aria-describedby')) };
      });
      assert.equal(association.idPresent, true);
      assert.equal(association.associatedLabel, name);
      assert.equal(association.descriptionPresent, true);
      const label = scope.locator('label').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
      await expect(label).toHaveCount(1);
      report.fixtureSetup.push({ kind: 'integration-switch-accessible-association', field, name, description, ...association });
      return { target, label, field, name };
    }
    async function toggle(item, desired, useLabel) {
      if (item.field !== 'pushNewBranches' && !activeEnvControls.has(item.field)) {
        activeEnvControls.set(item.field, { ...item, baseline: (await item.target.getAttribute('aria-checked')) === 'true' });
      }
      await click(useLabel ? item.label : item.target,
        `${useLabel ? 'Associated label' : 'Switch'} toggles ${item.name} to ${desired}`);
      await expect(item.target).toHaveAttribute('aria-checked', String(desired));
      if (item.field === 'pushNewBranches') await unchangedPreferences();
      else {
        await expect.poll(async () => {
          const result = await page.evaluate(id => window.electronAPI.getProjectEnv(id), projectId);
          assert.ok(result.success);
          return Boolean(result.data?.[item.field]);
        }, { message: 'The normal environment API must acknowledge the desired persisted switch value' }).toBe(desired);
        report.fixtureSetup.push({ kind: 'integration-switch-local-env-ack', field: item.field, desired, persistedDesiredVerified: true });
      }
    }
    try {
      mainInstalled = true;
      const installed = await app.evaluate(({ ipcMain, BrowserWindow, shell }, config) => {
        if (globalThis[config.key]) throw new Error('An integration switch guard is already installed');
        const handles = channel => typeof channel === 'string' &&
          (config.prefix.some(prefix => channel.startsWith(prefix)) || config.branchChannels.includes(channel));
        const handlers = ipcMain._invokeHandlers;
        const originals = new Map([...handlers].filter(([channel]) => handles(channel)));
        const eventOriginals = new Map(ipcMain.eventNames().filter(handles).map(channel => [channel, ipcMain.rawListeners(channel)]));
        if (!config.required.every(channel => typeof originals.get(channel) === 'function')) throw new Error('Missing hosted integration or branch handler');
        const windows = BrowserWindow.getAllWindows().filter(candidate => candidate.webContents.getURL() === config.rendererURL);
        if (windows.length !== 1) throw new Error('Require one exact integration switch caller');
        const senderId = windows[0].webContents.id;
        const state = { owner: config.owner, originals, eventOriginals, wrappers: new Map(), eventWrappers: new Map(),
          calls: [], deniedInvokes: [], deniedEvents: [], shellOriginal: shell.openExternal, browserRequests: 0 };
        for (const channel of originals.keys()) {
          const wrapper = (event, ...args) => {
            const caller = event?.sender?.id === senderId;
            const count = state.calls.filter(call => call.channel === channel).length;
            const cli = channel === 'gitlab:checkCli' && caller && args.length === 0 && count < 2;
            const branches = config.branchChannels.slice(0, 2).includes(channel) && caller && args.length === 1 && args[0] === config.fixture && count < 2;
            if (!cli && !branches) {
              state.deniedInvokes.push({ channel, sameCaller: caller, argumentCount: args.length });
              return { success: false, error: 'Integration switch fixture refused hosted/auth/token dispatch before original execution' };
            }
            state.calls.push({ channel, originalHandlerInvoked: false, projectId: config.projectId });
            return cli ? { success: true, data: { installed: false } } : { success: true, data: [] };
          };
          state.wrappers.set(channel, wrapper);
        }
        for (const channel of eventOriginals.keys()) state.eventWrappers.set(channel, (event, ...args) => {
          state.deniedEvents.push({ channel, sameCaller: event?.sender?.id === senderId, argumentCount: args.length });
        });
        state.shellWrapper = async () => { state.browserRequests++; throw new Error('Integration switch fixture blocked browser access'); };
        globalThis[config.key] = state;
        for (const [channel, wrapper] of state.wrappers) { ipcMain.removeHandler(channel); ipcMain.handle(channel, wrapper); }
        for (const [channel, wrapper] of state.eventWrappers) { ipcMain.removeAllListeners(channel); ipcMain.on(channel, wrapper); }
        shell.openExternal = state.shellWrapper;
        return { capturedInvokes: originals.size, capturedEventChannels: eventOriginals.size,
          invokeIdentity: [...state.wrappers].every(([channel, wrapper]) => handlers.get(channel) === wrapper),
          eventIdentity: [...state.eventWrappers].every(([channel, wrapper]) => {
            const listeners = ipcMain.rawListeners(channel); return listeners.length === 1 && listeners[0] === wrapper;
          }), shellIdentity: shell.openExternal === state.shellWrapper };
      }, { key: mainKey, owner, projectId, fixture, prefix, branchChannels, required, rendererURL: page.url() });
      assert.ok(installed.invokeIdentity && installed.eventIdentity && installed.shellIdentity);
      browserInstalled = true;
      assert.equal(await page.evaluate(({ key, owner }) => {
        if (window[key]) throw new Error('An integration browser guard is already installed');
        const state = { owner, original: window.open, ownDescriptor: Object.getOwnPropertyDescriptor(window, 'open'), calls: 0 };
        state.wrapper = () => { state.calls++; throw new Error('Integration switch fixture blocked window.open'); };
        window[key] = state;
        Object.defineProperty(window, 'open', { configurable: true, writable: true, value: state.wrapper });
        return window.open === state.wrapper;
      }, { key: browserKey, owner }), true);
      report.fixtureSetup.push({ kind: 'integration-switch-guard-boundary', ...installed,
        originalHostedAuthTokenHandlersInvoked: false, originalBranchFetchHandlersInvoked: false,
        syntheticCLIInstalled: false, syntheticBranchLists: true, providerAccountCount: 0,
        securityCountScope: 'Scoped dispatch guards, not independent SDK/process telemetry', productLogin: false });
      await nav('kanban');
      await click(page.locator('.forge-glass-project-tabs').getByRole('button', { name: await t('common', 'projectTab.settings'), exact: true }), 'Open normal project settings integration switch audit');
      await scope.waitFor();
      await expect(scope.locator('#project-settings-project-name')).toHaveText(project.name);
      for (const definition of definitions) {
        await click(scope.locator('nav').getByRole('button', { name: await t('settings', `projectSections.${definition.section}.title`), exact: true }), `Open ${definition.section} switch controls`);
        const enable = await control(definition.enable);
        await expect(enable.target).toHaveAttribute('aria-checked', 'false');
        await toggle(enable, true, false);
        for (const childDefinition of definition.children) {
          const item = await control(childDefinition);
          const baseline = (await item.target.getAttribute('aria-checked')) === 'true';
          await toggle(item, !baseline, true);
          await toggle(item, baseline, false);
        }
        await toggle(enable, false, true);
        await shot(`integration-${definition.section}-accessible-switch-roundtrips`);
      }
      workflowComplete = true;
    } finally {
      try {
        if (await scope.isVisible()) {
          // An interrupted active page may still have one enabled integration.
          // Restore children before the enabling control hides them.
          for (const item of [...activeEnvControls.values()].reverse()) {
            if (await item.target.isVisible() && (await item.target.getAttribute('aria-checked')) !== String(item.baseline)) {
              await click(item.target, `Restore interrupted fixture switch ${item.name}`);
              await expect(item.target).toHaveAttribute('aria-checked', String(item.baseline));
            }
          }
          await expect.poll(async () => {
            const result = await page.evaluate(id => window.electronAPI.getProjectEnv(id), projectId);
            assert.ok(result.success);
            return JSON.stringify(result.data) === JSON.stringify(beforeEnv.data);
          }, { message: 'Restored switch values must reach the environment API before leaving the mounted page' }).toBe(true);
          await click(scope.locator('header').getByRole('button', { name: await t('common', 'buttons.back'), exact: true }), 'Discard local integration preference drafts through Back, without Save');
        }
        await unchangedPreferences();
        const afterEnv = await page.evaluate(id => window.electronAPI.getProjectEnv(id), projectId);
        assert.ok(afterEnv.success);
        assert.equal(JSON.stringify(afterEnv.data) === JSON.stringify(beforeEnv.data), true,
          'Integration switch fixture must restore baseline environment values without logging them');
        report.fixtureSetup.push({ kind: 'integration-switch-config-restoration', baselineEnvRestored: true,
          projectPreferencesAndUpdatedAtUnchanged: true, contentsLogged: false, workflowComplete });
      } finally {
        try {
          if (browserInstalled) {
            const restored = await page.evaluate(({ key, owner }) => {
              const state = window[key]; if (!state) return null;
              if (state.owner !== owner || (window.open !== state.wrapper && window.open !== state.original)) throw new Error('Integration browser guard identity changed');
              if (state.ownDescriptor) Object.defineProperty(window, 'open', state.ownDescriptor);
              else Reflect.deleteProperty(window, 'open');
              const result = { originalRefRestored: window.open === state.original, browserRequests: state.calls };
              delete window[key]; return result;
            }, { key: browserKey, owner });
            assert.ok(restored?.originalRefRestored);
            assert.equal(restored.browserRequests, 0);
          }
        } finally {
          if (mainInstalled) {
            const restored = await app.evaluate(({ ipcMain, shell }, { key, owner }) => {
              const state = globalThis[key]; if (!state) return null;
              if (state.owner !== owner) throw new Error('Integration guard owner changed');
              const handlers = ipcMain._invokeHandlers;
              for (const [channel, original] of state.originals) {
                const current = handlers.get(channel);
                if (current !== original && current !== state.wrappers.get(channel)) throw new Error('Integration invoke identity changed');
                if (current !== original) { ipcMain.removeHandler(channel); ipcMain.handle(channel, original); }
              }
              for (const [channel, originals] of state.eventOriginals) {
                const current = ipcMain.rawListeners(channel);
                const alreadyOriginal = current.length === originals.length && current.every((listener, index) => listener === originals[index]);
                if (!alreadyOriginal) {
                  if (current.length !== 1 || current[0] !== state.eventWrappers.get(channel)) throw new Error('Integration event listener identity changed');
                  ipcMain.removeAllListeners(channel); for (const listener of originals) ipcMain.on(channel, listener);
                }
              }
              if (shell.openExternal !== state.shellOriginal && shell.openExternal !== state.shellWrapper) throw new Error('Integration shell guard identity changed');
              shell.openExternal = state.shellOriginal;
              const result = { invokeRefsRestored: [...state.originals].every(([channel, original]) => handlers.get(channel) === original),
                eventRefsRestored: [...state.eventOriginals].every(([channel, originals]) => {
                  const listeners = ipcMain.rawListeners(channel); return listeners.length === originals.length && listeners.every((listener, index) => listener === originals[index]);
                }), shellRefRestored: shell.openExternal === state.shellOriginal, calls: state.calls,
                deniedInvokes: state.deniedInvokes, deniedEvents: state.deniedEvents, browserRequests: state.browserRequests,
                originalHostedAuthTokenHandlersInvoked: false, originalBranchFetchHandlersInvoked: false };
              delete globalThis[key]; return result;
            }, { key: mainKey, owner });
            assert.ok(restored?.invokeRefsRestored && restored.eventRefsRestored && restored.shellRefRestored);
            report.fixtureSetup.push({ kind: 'integration-switch-dispatch-ref-restoration', ...restored, workflowComplete,
              securityCountScope: 'Scoped dispatcher guard boundary; no independent SDK/process telemetry claimed' });
            assert.equal(restored.deniedInvokes.length, 0);
            assert.equal(restored.deniedEvents.length, 0);
            assert.equal(restored.browserRequests, 0);
            assert.equal(restored.originalHostedAuthTokenHandlersInvoked, false);
            assert.equal(restored.originalBranchFetchHandlersInvoked, false);
            assert.ok(restored.calls.every(call => call.originalHandlerInvoked === false));
          }
        }
      }
    }
  });
}
