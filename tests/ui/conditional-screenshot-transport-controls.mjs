/**
 * Synthetic screenshot IPC transport through the real Insights attachment UI.
 * Uses the bundled 64x64 PNG, never desktop pixels or a provider/model request.
 * The caller owns focus; importing this module does not launch an application.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

const SOURCES = 'screenshot:getSources';
const CAPTURE = 'screenshot:capture';
const STATE = '__forgeConditionalScreenshotTransport';
const SOURCE_ID = 'synthetic-qa-window:bundled-png-64';
const SOURCE_NAME = 'Synthetic QA Window (bundled PNG only)';
const SOURCES_ERROR = 'SYNTHETIC SCREENSHOT TRANSPORT FIXTURE: source lookup refused; no window enumeration occurred.';
const CAPTURE_ERROR = 'SYNTHETIC SCREENSHOT TRANSPORT FIXTURE: capture refused; no desktop pixels were read.';

export async function walkConditionalScreenshotTransport(ctx) {
  const { app, page, projectId, fixture, profile, report, t, button, main, dialog,
    click, fill, press, segment, shot, blocked, nav, closeLayers } = ctx;
  report.fixtureSetup ??= [];
  report.uxFindings ??= [];
  const hash = buffer => createHash('sha256').update(buffer).digest('hex');

  await segment('conditional-insights-synthetic-screenshot-controls', async () => {
    const projects = await page.evaluate(() => window.electronAPI.getProjects());
    assert.equal(projects.success, true);
    const project = projects.data.find(candidate => candidate.id === projectId);
    assert.ok(project);
    assert.equal(path.resolve(project.path), path.resolve(fixture), 'Refuse production screenshot-session fixtures');
    assert.equal(project.autoBuildPath, '.forge-glass-preview');
    assert.match(await readFile(path.join(fixture, 'README.md'), 'utf8'), /CONDITIONAL UI FIXTURE/);
    const directories = await app.evaluate(({ app: application }) => ({
      home: application.getPath('home'), userData: application.getPath('userData'), isPackaged: application.isPackaged,
    }));
    assert.equal(path.resolve(directories.userData), path.resolve(profile));
    assert.ok(path.resolve(directories.home).startsWith(path.dirname(path.resolve(profile)) + path.sep), 'Require isolated HOME');
    const accounts = await page.evaluate(() => window.electronAPI.getProviderAccounts());
    assert.ok(accounts.success && Array.isArray(accounts.data?.accounts));
    assert.equal(accounts.data.accounts.length, 0, 'The screenshot component fixture must not configure a provider');

    const pngPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../resources/icons/64x64.png');
    const png = await readFile(pngPath);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 64);
    assert.equal(png.readUInt32BE(20), 64);
    const imageURL = `data:image/png;base64,${png.toString('base64')}`;
    const support = await app.evaluate(({ ipcMain }, channels) => ({
      mapPresent: ipcMain._invokeHandlers instanceof Map,
      originalsPresent: channels.every(channel => typeof ipcMain._invokeHandlers?.get?.(channel) === 'function'),
    }), [SOURCES, CAPTURE]);
    report.fixtureSetup.push({ kind: 'synthetic-screenshot-transport-preflight', ...support,
      providerAccountCount: 0, actualPackagedState: directories.isPackaged,
      source: 'resources/icons/64x64.png', pngSha256: hash(png), pngHeaderSize: { width: 64, height: 64 },
      fixtureLimitation: 'Original handler references require the feature-detected private Electron ipcMain._invokeHandlers Map; removeHandler/handle are public APIs.',
      componentOnly: true, platformCapture: false, actualOSScreenPixels: 0, sdkCalls: 0, productSuccess: false });
    if (!support.mapPresent || !support.originalsPresent) {
      await blocked('Synthetic screenshot transport', 'The original screenshot handlers cannot be safely captured/restored in this Electron build. The camera was not opened; no enumeration/capture was attempted.');
      return;
    }

    await nav('insights');
    const beforeSessions = await page.evaluate(id => window.electronAPI.listInsightsSessions(id, true), projectId);
    assert.ok(beforeSessions.success);
    const priorIds = new Set(beforeSessions.data.map(session => session.id));
    await click(button(await t('uiKnowledgeContext', 'newChat'), main()), 'Create real empty local session for synthetic screenshot attachment controls');
    await expect.poll(async () => {
      const current = await page.evaluate(id => window.electronAPI.getInsightsSession(id), projectId);
      return current.success && current.data && !priorIds.has(current.data.id) && current.data.messages.length === 0;
    }).toBe(true);
    const session = (await page.evaluate(id => window.electronAPI.getInsightsSession(id), projectId)).data;
    assert.equal(session.projectId, projectId);
    assert.match(session.id, /^session-(?:\d{1,20}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
    const sessionPath = path.join(fixture, '.forge-glass-preview', 'insights', 'sessions', `${session.id}.json`);
    const sessionHash = hash(await readFile(sessionPath));
    const pointerPath = path.join(fixture, '.forge-glass-preview', 'insights', 'current_session.json');
    const pointerHash = hash(await readFile(pointerPath));
    const input = main().getByPlaceholder(await t('uiKnowledgeContext', 'askPlaceholder'), { exact: true });
    await expect(input).toBeEnabled();
    const priorInput = await input.inputValue();
    const attached = () => main().getByRole('img', { name: /^screenshot-\d+\.png$/ });
    const removeLabel = await t('common', 'insights.images.removeImage');
    const remove = () => button(removeLabel, main());
    await expect(attached()).toHaveCount(0);
    await expect(remove()).toHaveCount(0);
    const owner = randomUUID();
    let installationAttempted = false;
    let fixtureInputSet = false;
    let pendingCleanupVerified = false;
    let sessionUnchanged = false;
    let attachmentObserved = false;
    let capturedName;

    // Obtain only the already-known caller window via Playwright's public API.
    // No BrowserWindow inventory or Electron desktopCapturer enumeration occurs.
    const callerWindow = await app.browserWindow(page);
    let senderId;
    try { senderId = await callerWindow.evaluate(window => window.webContents.id); }
    finally { await callerWindow.dispose(); }
    try {
      installationAttempted = true;
      const installation = await app.evaluate(({ ipcMain }, config) => {
        if (globalThis[config.key]) throw new Error('A screenshot transport fixture is already installed');
        const handlers = ipcMain._invokeHandlers;
        if (!(handlers instanceof Map)) throw new Error('Private Electron handler Map unavailable');
        const state = { owner: config.owner, entries: [], sourceCalls: [], captureCalls: [], rejected: [] };
        const refuse = (channel, reason) => {
          state.rejected.push({ channel, reason });
          return { success: false, error: 'Synthetic screenshot transport refused an unexpected request before OS access' };
        };
        const sources = async (event, ...args) => {
          if (event?.sender?.id !== config.senderId || args.length !== 0 || state.sourceCalls.length >= 3)
            return refuse(config.sources, 'unexpected caller, payload or source-request count');
          const number = state.sourceCalls.length + 1;
          state.sourceCalls.push({ number, originalInvoked: false, actualWindowEnumeration: false });
          if (number === 1) return { success: false, error: config.sourcesError };
          return { success: true, data: [{ id: config.sourceId, name: config.sourceName, thumbnail: config.imageURL }] };
        };
        const capture = async (event, options, ...extra) => {
          if (event?.sender?.id !== config.senderId || !options || typeof options !== 'object' ||
            Array.isArray(options) || Object.keys(options).length !== 1 || options.sourceId !== config.sourceId ||
            extra.length !== 0 || state.sourceCalls.length !== 3 || state.captureCalls.length >= 2)
            return refuse(config.capture, 'unexpected caller, source payload or capture-request count');
          const number = state.captureCalls.length + 1;
          state.captureCalls.push({ number, sourceId: config.sourceId, originalInvoked: false, actualOSScreenPixels: 0 });
          if (number === 1) return { success: false, error: config.captureError };
          // Match real Main capture output: one complete PNG data URL, not bare
          // base64 that would hide a renderer double-prefix normalization bug.
          return { success: true, data: config.imageURL };
        };
        for (const [channel, wrapper] of [[config.sources, sources], [config.capture, capture]]) {
          const original = handlers.get(channel);
          if (typeof original !== 'function') throw new Error('Missing original screenshot handler');
          state.entries.push({ channel, wrapper, original });
        }
        globalThis[config.key] = state;
        try {
          for (const entry of state.entries) {
            ipcMain.removeHandler(entry.channel);
            ipcMain.handle(entry.channel, entry.wrapper);
          }
        } catch (error) {
          for (const entry of state.entries) {
            if (handlers.get(entry.channel) === entry.wrapper) {
              ipcMain.removeHandler(entry.channel);
              ipcMain.handle(entry.channel, entry.original);
            } else if (!handlers.has(entry.channel)) ipcMain.handle(entry.channel, entry.original);
          }
          throw error;
        }
        return { exactCallerBound: true, originalHandlersCaptured: true,
          wrapperIdentitiesVerified: state.entries.every(entry => handlers.get(entry.channel) === entry.wrapper) };
      }, { key: STATE, owner, senderId, sources: SOURCES, capture: CAPTURE,
        sourceId: SOURCE_ID, sourceName: SOURCE_NAME, imageURL, sourcesError: SOURCES_ERROR, captureError: CAPTURE_ERROR });
      assert.equal(installation.wrapperIdentitiesVerified, true);
      report.fixtureSetup.push({ kind: 'synthetic-screenshot-handler-installation', ...installation,
        sessionId: session.id, componentOnly: true, platformCapture: false, actualOSScreenPixels: 0, sdkCalls: 0 });
      const fixtureInput = 'SYNTHETIC SCREENSHOT UI FIXTURE: this attachment is never sent to a model.';
      fixtureInputSet = true;
      await fill(input, fixtureInput, 'Retain explicit synthetic draft through screenshot failures');
      await click(button(await t('common', 'insights.images.screenshotButton'), main()), 'Open camera with synthetic sources failure; no real window enumeration');
      await expect(dialog().getByRole('heading', { name: await t('tasks', 'screenshot.title'), exact: true })).toBeVisible();
      await expect(dialog().getByRole('alert')).toContainText(SOURCES_ERROR);
      await expect(button(await t('tasks', 'screenshot.capture'), dialog())).toBeDisabled();
      await shot('synthetic-screenshot-sources-failure');
      await click(button(await t('common', 'buttons.retry'), dialog().getByRole('alert')), 'Retry synthetic source lookup through normal named alert button');
      const source = () => dialog().getByRole('button', { name: /Synthetic QA Window \(bundled PNG only\)/ });
      await expect(source()).toHaveCount(1);
      await expect(dialog().getByRole('alert')).toHaveCount(0);
      const sourceImage = () => dialog().getByRole('img', { name: SOURCE_NAME, exact: true });
      await expect.poll(() => sourceImage().evaluate(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }))).toEqual({ complete: true, width: 64, height: 64 });
      await click(source(), 'Select actual synthetic source card after Retry');
      await expect(button(await t('tasks', 'screenshot.capture'), dialog())).toBeEnabled();
      await click(button(await t('common', 'buttons.refresh'), dialog()), 'Refresh synthetic source list through normal footer control');
      await expect(source()).toHaveCount(1);
      await expect(button(await t('tasks', 'screenshot.capture'), dialog())).toBeDisabled();
      await click(source(), 'Select synthetic source again after Refresh clears selection');
      await click(button(await t('tasks', 'screenshot.capture'), dialog()), 'Capture selected source with controlled transport failure; no OS screenshot');
      await expect(dialog().getByRole('alert')).toContainText(CAPTURE_ERROR);
      await expect(button(await t('tasks', 'screenshot.capture'), dialog())).toBeEnabled();
      await expect(input).toHaveValue(fixtureInput);
      await expect(attached()).toHaveCount(0);
      await shot('synthetic-screenshot-capture-failure-preserved-input');
      await click(button(await t('tasks', 'screenshot.capture'), dialog()), 'Retry normal Capture using bundled 64x64 PNG transport');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await expect(attached()).toHaveCount(1);
      attachmentObserved = true;
      await expect.poll(() => attached().evaluate(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }))).toEqual({ complete: true, width: 64, height: 64 });
      capturedName = await attached().getAttribute('alt');
      await expect(input).toHaveValue(fixtureInput);
      await shot('synthetic-screenshot-decoded-pending-attachment');
      report.fixtureSetup.push({ kind: 'synthetic-screenshot-decoded-attachment', filename: capturedName,
        renderedSize: { width: 64, height: 64 }, MainResultFormat: 'full-data:image/png;base64, URL',
        componentOnly: true, platformCapture: false, actualOSScreenPixels: 0, sdkCalls: 0 });

      const preview = button(await t('tasks', 'imagePreview.open', { filename: capturedName }), main());
      await click(preview, 'Open real enlarged preview of synthetic pending screenshot');
      await expect(dialog().getByRole('heading', { name: capturedName, exact: true })).toBeVisible();
      await expect.poll(() => dialog().getByRole('img', { name: capturedName, exact: true }).evaluate(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }))).toEqual({ complete: true, width: 64, height: 64 });
      await shot('synthetic-screenshot-full-image-preview');
      await click(button(await t('tasks', 'imagePreview.close'), dialog()), 'Close enlarged synthetic screenshot preview through normal button');
      await expect(preview).toBeFocused();
      await press('Enter', 'Reopen focused screenshot preview with keyboard');
      await expect(dialog().getByRole('heading', { name: capturedName, exact: true })).toBeVisible();
      await press('Escape', 'Close synthetic screenshot enlarged preview with Escape');
      await expect(preview).toBeFocused();
      await blocked('Image preview zoom controls', 'The shared image preview provides full-resolution enlargement, Close and Escape; it has no interactive zoom controls to operate.');
      await blocked(await t('uiKnowledgeContext', 'send'), 'This screenshot fixture never sends an image or draft to a provider/model. Platform capture and model vision remain separately unverified.');
      await attached().hover();
      await click(remove(), 'Remove synthetic pending screenshot through normal image control');
      await expect(attached()).toHaveCount(0);
      await expect(remove()).toHaveCount(0);
      pendingCleanupVerified = true;
      await shot('synthetic-screenshot-attachment-removed');
    } finally {
      try {
        try {
          try {
            await closeLayers();
            const attachmentCallbackExpected = await app.evaluate((_, config) => {
              const state = globalThis[config.key];
              return state?.owner === config.owner && state.captureCalls.length === 2;
            }, { key: STATE, owner });
            if (attachmentCallbackExpected && !attachmentObserved) {
              // ScreenshotCapture closes before its async thumbnail callback
              // appends the attachment. Wait for that callback to materialize
              // before removing; a timeout leaves cleanup unverified, not zero.
              await attached().waitFor({ state: 'visible', timeout: 10000 });
              attachmentObserved = true;
            }
            if (await remove().count()) {
              assert.equal(await remove().count(), 1, 'Refuse to remove unexpected image attachments');
              if (await attached().count()) await attached().hover();
              await click(remove(), 'Cleanup only the synthetic pending screenshot through normal Remove');
            }
            await expect(attached()).toHaveCount(0);
            await expect(remove()).toHaveCount(0);
            pendingCleanupVerified = true;
          } finally {
            if (fixtureInputSet) await fill(input, priorInput, 'Restore the prior isolated composer draft without sending');
            await expect(input).toHaveValue(priorInput);
            const afterSession = await page.evaluate(id => window.electronAPI.getInsightsSession(id), projectId);
            assert.ok(afterSession.success && afterSession.data?.id === session.id);
            assert.equal(afterSession.data.messages.length, 0, 'Synthetic screenshot UI must not send messages');
            assert.equal(hash(await readFile(sessionPath)), sessionHash, 'Empty session contents must remain unchanged');
            assert.equal(hash(await readFile(pointerPath)), pointerHash, 'Current empty-session pointer must remain unchanged');
            sessionUnchanged = true;
          }
        } finally {
          report.fixtureSetup.push({ kind: 'synthetic-screenshot-session-and-pending-cleanup', sessionId: session.id,
            pendingImagesZero: pendingCleanupVerified, emptyPersistedSessionUnchanged: sessionUnchanged,
            asynchronousAttachmentObservedBeforeRemoval: attachmentObserved,
            priorComposerDraftLogged: false, componentOnly: true, platformCapture: false, actualOSScreenPixels: 0, sdkCalls: 0 });
        }
      } finally {
        if (installationAttempted) {
          const restoration = await app.evaluate(({ ipcMain }, config) => {
            const state = globalThis[config.key];
            if (!state) return null;
            if (state.owner !== config.owner) throw new Error('Refuse to restore another screenshot fixture');
            const handlers = ipcMain._invokeHandlers;
            const entries = state.entries.map(entry => ({ ...entry, before: handlers.get(entry.channel) }));
            // Validate the complete set before restoring any entry.
            if (entries.some(entry => entry.before !== entry.wrapper && entry.before !== entry.original))
              throw new Error('Screenshot handler identity changed; refuse to overwrite a different handler');
            for (const entry of entries) {
              if (entry.before === entry.wrapper) {
                ipcMain.removeHandler(entry.channel);
                ipcMain.handle(entry.channel, entry.original);
              }
            }
            const result = { restoredSameOriginalFunctions: entries.every(entry => handlers.get(entry.channel) === entry.original),
              originalHandlersInvoked: false, sourceCalls: state.sourceCalls, captureCalls: state.captureCalls, rejected: state.rejected };
            delete globalThis[config.key];
            return result;
          }, { key: STATE, owner });
          assert.ok(restoration, 'Screenshot handler installation was not acknowledged');
          report.fixtureSetup.push({ kind: 'synthetic-screenshot-handler-restoration', ...restoration,
            componentOnly: true, platformCapture: false, actualOSScreenPixels: 0, sdkCalls: 0 });
          assert.equal(restoration.restoredSameOriginalFunctions, true);
          assert.equal(restoration.rejected.length, 0);
          assert.equal(restoration.sourceCalls.length, 3);
          assert.equal(restoration.captureCalls.length, 2);
        }
      }
    }
  });
}
